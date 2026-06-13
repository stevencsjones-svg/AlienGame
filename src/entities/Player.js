import Phaser from 'phaser';
import { PLAYER, COLORS, SHIELD_INVINCIBILITY_MS, SHIELD_BREAK_SHAKE, DEV_MODE } from '../constants.js';
import PlayerVisuals from './PlayerVisuals.js';
import SFX from '../audio/SFX.js';

// =============================================================================
// Player
// A 20x28 rectangle that can run, jump, double-jump, dash and attack.
// Extends Phaser.GameObjects.Rectangle and carries an Arcade dynamic body.
// =============================================================================
export default class Player extends Phaser.GameObjects.Rectangle {
  constructor(scene, x, y) {
    super(scene, x, y, PLAYER.WIDTH, PLAYER.HEIGHT, COLORS.PLAYER);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);
    // The physics rectangle stays intact but invisible — all visuals are drawn
    // by PlayerVisuals as a layered geometric character.
    this.setAlpha(0);
    this.visuals = new PlayerVisuals(scene, this);

    // Attack hitbox: an invisible static-body rectangle in front of the player,
    // enabled ONLY during the attack window (see attack()). Public so the scene
    // can register an overlap against the enemy group.
    this.attackHitbox = scene.add.rectangle(x, y, 36, 24).setVisible(false);
    scene.physics.add.existing(this.attackHitbox, true); // true = static body
    this.attackHitbox.body.enable = false;

    // Collide with the left / right / top of the world. The bottom is left open
    // so the player can fall into pits (handled as a death in Game.update).
    this.body.setCollideWorldBounds(true);

    // Remember where to respawn.
    this.spawnX = x;
    this.spawnY = y;

    // ---- State ----
    this.facing = 1;          // 1 = right, -1 = left
    this.jumpsUsed = 0;       // 0,1 = ground+double jump available
    this.isDashing = false;
    this.dashTimeLeft = 0;    // ms remaining in the current dash
    this.dashCooldown = 0;    // ms until the next dash is allowed
    this.trailTimer = 0;      // throttles dash-trail spawning
    this.attackActive = false;
    this.isDead = false;      // mid death/respawn animation
    this.frozen = false;      // hard stop (e.g. level complete)
    this.inputEnabled = true; // false during scripted moments (e.g. opening pan)

    // Coyote time + jump buffering (forgiveness windows, in ms).
    this.coyoteTime = 0;      // remaining window to still ground-jump after leaving a ledge
    this.jumpBuffer = 0;      // remaining window of a remembered early jump press
    this.wasOnGround = false; // ground state last frame (edge detection)
    this.hasJumped = false;   // true after a jump until landing (gates coyote)
    this.fallStartY = null;   // y when last leaving the ground (hard-landing detection)

    // Speed progression multiplier (driven by the scene; see setSpeedMultiplier).
    this.speedMultiplier = 1;

    // Abilities — all default OFF; scenes grant them (Level 1 via pickups,
    // Level 2 starts with double-jump + dash and grants attack). DEV_MODE
    // unlocks everything at level start.
    this.canDoubleJump = false;
    this.canDash = false;
    this.hasAttack = false;
    this.dashHintShown = false; // one-time "find the dash upgrade" hint
    this.hasShield = false;
    this.invincibleUntil = 0; // ms timestamp; no enemy damage before this

    // ---- Input ----
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D',
      space: 'SPACE', z: 'Z',
    });
    // Stop the browser from scrolling when these keys are pressed.
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,W,A,S,D,Z,X,C');

    // ---- Dash trigger: EVENT-driven (keydown), not isDown polling ------------
    // Fires on the leading edge of SHIFT / X / C (event.repeat filtered).
    // Wall-clock (Date.now) is used for grace windows so physics timeScale can't
    // stretch them.
    //
    // StickyKeys mitigation (Windows): pressing Shift 5 times in ~2 s triggers
    // the OS StickyKeys dialog, stealing focus and stranding key state.
    //   Primary fix  — during dash cooldown / active dash, event.preventDefault()
    //     is called before returning.  On most Windows/Chrome combos this stops
    //     the browser reporting the press to the OS, so rapid re-pressing during
    //     cooldown never accumulates toward the 5-press trigger.
    //   Last-resort  — dashPressCount counts ALL Shift arrivals.  Once 4
    //     consecutive Shift presses are seen, shiftBlackoutUntil is armed for
    //     1000ms (Shift only — X / C still work).
    this.dashIgnoreUntil   = 0; // Date.now() ms; dash input ignored before this
    this._lastBlurTime     = 0; // when the window last lost focus
    this.dashPressCount    = 0; // consecutive Shift presses since last non-Shift dash key
    this.shiftBlackoutUntil = 0; // Date.now() ms; Shift-only blackout (last-resort)

    this._onDashKeyDown = (event) => {
      if (event.repeat) return; // ignore OS key auto-repeat

      const isShift = event.code === 'ShiftLeft' || event.code === 'ShiftRight';

      // ---- StickyKeys last-resort: Shift-only blackout ----
      if (isShift) {
        if (Date.now() < this.shiftBlackoutUntil) {
          event.preventDefault();
          if (DEV_MODE) console.log('[Dash] Shift blackout — StickyKeys prevention');
          return;
        }
        this.dashPressCount += 1;
        if (this.dashPressCount >= 4) {
          this.shiftBlackoutUntil = Date.now() + 1000;
          this.dashPressCount = 0;
          event.preventDefault();
          if (DEV_MODE) console.log('[Dash] Shift blackout — StickyKeys prevention');
          return;
        }
      } else {
        this.dashPressCount = 0; // X or C resets the Shift press streak
      }

      // ---- Primary StickyKeys fix: suppress presses during cooldown ----
      // preventDefault() stops the browser from reporting the keypress to the OS
      // on most Windows/Chrome combos, so rapid Shift mashing during cooldown
      // never reaches the StickyKeys 5-press counter.
      if (this.isDashing || this.dashCooldown > 0) {
        event.preventDefault();
        if (DEV_MODE && isShift) console.log('[Dash] Shift suppressed — cooldown active');
        return;
      }

      // ---- Normal guards ----
      if (Date.now() < this.dashIgnoreUntil) return;         // post-refocus grace
      if (Date.now() - this._lastBlurTime < 250) return;     // keydown-before-focus race
      if (this.isDead || this.frozen || !this.inputEnabled) return;
      if (this.scene.physics.world.isPaused) return;

      if (!this.canDash && !this.dashHintShown && this.x > 1200) {
        this.dashHintShown = true;
        this.showAbilityHint('DASH — FIND THE UPGRADE');
      }
      this.doDash(); // no-ops while locked / cooling down (see doDash)
    };
    kb.on('keydown-SHIFT', this._onDashKeyDown);
    kb.on('keydown-X', this._onDashKeyDown);
    kb.on('keydown-C', this._onDashKeyDown);

    // ---- Stale-key-state guards on focus loss --------------------------------
    // Any way the page can stop receiving keyups (tab switch, window blur, OS
    // dialogs from Shift-mashing / sticky-keys prompts, cursor leaving the
    // canvas) resets all tracked keys so nothing reads as held forever.
    this._resetKeys = () => { if (this.scene) this.scene.input.keyboard.resetKeys(); };
    this._onWindowBlur = () => {
      this._resetKeys();
      this._lastBlurTime = Date.now();
      this.dashPressCount = 0; // streak is stale after focus loss
    };
    this._onWindowFocus = () => {
      this._resetKeys();
      this.dashIgnoreUntil = Date.now() + 200; // swallow the first 200ms of dash input
    };
    this._onVisibilityChange = () => {
      if (document.hidden) { this._resetKeys(); this.dashPressCount = 0; }
    };
    this._onCanvasMouseLeave = () => this._resetKeys();
    window.addEventListener('blur', this._onWindowBlur);
    window.addEventListener('focus', this._onWindowFocus);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    scene.game.canvas.addEventListener('mouseleave', this._onCanvasMouseLeave);
    // Scene keyboard listeners die with the scene's input plugin on shutdown;
    // the window/document/canvas listeners must be removed by hand (restart,
    // back-to-menu) or each run would stack another set.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', this._onWindowBlur);
      window.removeEventListener('focus', this._onWindowFocus);
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      scene.game.canvas.removeEventListener('mouseleave', this._onCanvasMouseLeave);
    });
  }

  update(time, delta) {
    // Keep the character visuals glued to the body every frame, even while
    // frozen or dead (the visuals no-op themselves while hidden).
    this.visuals.update(time, delta);

    if (this.frozen) {
      this.body.setVelocity(0, 0);
      return;
    }
    if (this.isDead) return; // ignore input while flashing/respawning
    // Scripted-moment lockout (e.g. the Level 2 opening camera pan): hold still
    // but keep gravity so the player stays grounded.
    if (!this.inputEnabled) { this.body.setVelocityX(0); return; }

    const k = this.keys;
    // Touch controls (mobile): scenes expose scene.touchControls; its states
    // are inert false on desktop, so these ORs never change keyboard behavior.
    const tc = this.scene.touchControls;
    const left = k.left.isDown || k.a.isDown || (tc ? tc.left.isDown : false);
    const right = k.right.isDown || k.d.isDown || (tc ? tc.right.isDown : false);
    const onFloor = this.body.blocked.down;

    // ---- Dash cooldown ----
    if (this.dashCooldown > 0) this.dashCooldown -= delta;

    // ---- Active dash handling ----
    if (this.isDashing) {
      this.dashTimeLeft -= delta;
      this.trailTimer -= delta;
      if (this.trailTimer <= 0) {
        this.visuals.spawnGhost();
        this.trailTimer = 30; // spawn a trail ghost roughly every 30ms
      }
      if (this.dashTimeLeft <= 0) this.endDash();
    }

    // ---- Horizontal movement (suspended during a dash) ----
    const currentSpeed = PLAYER.SPEED * (this.speedMultiplier || 1);
    if (!this.isDashing) {
      if (left && !right) {
        this.body.setVelocityX(-currentSpeed);
        this.facing = -1;
      } else if (right && !left) {
        this.body.setVelocityX(currentSpeed);
        this.facing = 1;
      } else {
        this.body.setVelocityX(0);
      }
    }

    // ---- Jump: coyote time + jump buffering + double jump ----
    const justLeftGround = this.wasOnGround && !onFloor;
    const justLanded = !this.wasOnGround && onFloor;

    // Landing resets the jump count and jump state.
    if (onFloor) {
      this.jumpsUsed = 0;
      this.hasJumped = false;
    }
    if (justLanded) SFX.jump_land(); // soft thud (self-throttled to 100ms)

    // ---- Hard-landing feedback (significant fall) ----
    if (justLeftGround) this.fallStartY = this.y;
    if (justLanded) {
      if (this.fallStartY !== null && this.y - this.fallStartY > 200) {
        this.scene.cameras.main.shake(80, 0.003);
        this.spawnLandDust();
      }
      this.fallStartY = null;
    }

    // Coyote time: open the window when we walk off a ledge without jumping.
    if (justLeftGround && !this.hasJumped) {
      this.coyoteTime = PLAYER.COYOTE_TIME;
    }
    if (this.coyoteTime > 0) this.coyoteTime -= delta;

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(k.up) ||
      Phaser.Input.Keyboard.JustDown(k.w) ||
      Phaser.Input.Keyboard.JustDown(k.space) ||
      (tc ? tc.jump.justDown : false);

    // Jump buffer: remember any jump press, then count it down.
    if (jumpPressed) this.jumpBuffer = PLAYER.JUMP_BUFFER;
    if (this.jumpBuffer > 0) this.jumpBuffer -= delta;

    // A buffered press fires the moment we land.
    let jumpedThisFrame = false;
    if (justLanded && this.jumpBuffer > 0 && !this.isDashing) {
      this.doJump();
      this.jumpBuffer = 0;
      jumpedThisFrame = true;
    }

    // Normal jump press (skipped if a buffered jump already fired this frame).
    const canJump = onFloor || this.coyoteTime > 0;
    if (!jumpedThisFrame && jumpPressed && !this.isDashing) {
      if (this.jumpsUsed === 0 && canJump) {
        // First jump — from the ground or within the coyote window.
        this.doJump();
        if (!onFloor) this.coyoteTime = 0; // coyote can only be used once per fall
      } else if (this.canDoubleJump && this.jumpsUsed < 2) {
        // Air jump (the double) — only once unlocked. If we fell off past the
        // coyote window without taking the grounded jump, forfeit that slot so
        // only the double remains.
        if (this.jumpsUsed === 0) this.jumpsUsed = 1;
        this.doJump();
      }
    }

    // Remember ground state for next frame's edge detection.
    this.wasOnGround = onFloor;

    // ---- Variable jump height ----
    // On early release of the jump button while still rising, cut the upward
    // velocity so a tap is a short hop and a hold is the full jump. Applies to
    // both the first jump and the double jump (it only checks upward motion).
    // Jump is bound to several keys, so "released" = a jump key went up and
    // none remain held.
    const jumpHeld = k.up.isDown || k.w.isDown || k.space.isDown
      || (tc ? tc.jump.isDown : false);
    const jumpKeyJustReleased =
      (Phaser.Input.Keyboard.JustUp(k.up) ||
        Phaser.Input.Keyboard.JustUp(k.w) ||
        Phaser.Input.Keyboard.JustUp(k.space) ||
        (tc ? tc.jump.justUp : false)) &&
      !jumpHeld;
    // Skip the cut when jumpPressed is also true this frame: a sub-frame touch tap
    // sets both justDown and justUp simultaneously, so doJump() already fired above
    // and cutting velocity immediately would produce a shorter-than-minimum hop.
    if (jumpKeyJustReleased && !jumpPressed && this.body.velocity.y < 0) {
      this.body.setVelocityY(this.body.velocity.y * PLAYER.JUMP_CUT_MULTIPLIER);
    }

    // ---- Dash (SHIFT / X / C) ----
    // Keyboard is event-driven: handled by the keydown listener registered in
    // the constructor (_onDashKeyDown), not polled here — see the sticky-Shift
    // fix notes there. Physics, cooldown and the HUD bar are unchanged.
    // Touch DASH button (single-frame edge, mirrors the keyboard handler):
    if (tc && tc.dash.justDown) {
      if (!this.canDash && !this.dashHintShown && this.x > 1200) {
        this.dashHintShown = true;
        this.showAbilityHint('DASH — FIND THE UPGRADE');
      }
      this.doDash(); // no-ops while locked / cooling down
    }

    // ---- Attack (gated by the attack ability) ----
    if (this.hasAttack
      && (Phaser.Input.Keyboard.JustDown(k.z) || (tc ? tc.attack.justDown : false))
      && !this.attackActive) {
      this.attack();
    }

    // ---- Corner correction ----
    // While rising, if the head clips the corner of a platform by a few pixels
    // on one side, nudge the player horizontally clear so the jump continues
    // instead of dying on the lip. Runs proactively on upward velocity: Arcade
    // zeroes velocity.y the instant it registers a ceiling block, so checking
    // body.blocked.up would miss the window. Static platforms only — never
    // walls/enemies — and never during a dash (dash has no upward velocity).
    if (this.body.velocity.y < 0 && !this.isDashing) {
      const above = this.scene.physics.overlapRect(
        this.body.x, this.body.y - 2, this.body.width, 4, false, true, // dynamic=false, static=true
      );
      for (const b of above) {
        const pL = this.body.x;
        const pR = this.body.x + this.body.width;
        const clipLeft = pR - b.x;               // overlap into the obstacle's LEFT edge
        const clipRight = (b.x + b.width) - pL;  // overlap into the obstacle's RIGHT edge
        if (clipLeft <= 0 || clipRight <= 0) continue; // not horizontally overlapping
        const vx = this.body.velocity.x;
        const vy = this.body.velocity.y;
        if (clipLeft <= clipRight && clipLeft <= PLAYER.CORNER_CORRECTION) {
          this.x -= clipLeft + 1;                // nudge LEFT, off the corner
          this.body.reset(this.x, this.y);
          this.body.setVelocity(vx, vy);         // reset() zeroes velocity — restore it
          break;
        }
        if (clipRight < clipLeft && clipRight <= PLAYER.CORNER_CORRECTION) {
          this.x += clipRight + 1;               // nudge RIGHT, off the corner
          this.body.reset(this.x, this.y);
          this.body.setVelocity(vx, vy);
          break;
        }
      }
    }

    // BUG 10: cap downward velocity to curb tunnelling through thin platforms on
    // long, fast drops. (Gravity is integrated after update(), so this trails by
    // one frame and settles at ~MAX_FALL_SPEED — that's fine.)
    if (this.body.velocity.y > PLAYER.MAX_FALL_SPEED) {
      this.body.setVelocityY(PLAYER.MAX_FALL_SPEED);
    }
  }

  // ---- Jump execution (shared by normal press and buffered landing) ---------
  doJump() {
    this.body.setVelocityY(-PLAYER.JUMP_VELOCITY);
    this.jumpsUsed++;
    this.hasJumped = true;
    if (this.jumpsUsed === 1) {
      SFX.jump();
      this.visuals.spawnJumpBurst(false);
    } else {
      SFX.doubleJump();
      this.visuals.spawnJumpBurst(true);
    }
  }

  // ---- Speed progression (set by the scene each frame) ----------------------
  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = multiplier;
  }

  // ---- Dash ------------------------------------------------------------------
  // Dash in the current facing direction (SHIFT / X / C), respecting the
  // cooldown. Silently does nothing until the dash ability is unlocked.
  doDash() {
    if (!this.canDash) return;
    if (this.isDashing || this.dashCooldown > 0 || this.frozen || this.isDead) return;
    this.startDash();
  }

  // Burst of dust at the feet on a hard landing. Lazily creates a shared
  // particle emitter (with a generated 4x4 white square texture) on first use.
  spawnLandDust() {
    if (!this.landDust) {
      if (!this.scene.textures.exists('landDust')) {
        const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 4, 4);
        g.generateTexture('landDust', 4, 4);
        g.destroy();
      }
      this.landDust = this.scene.add.particles(0, 0, 'landDust', {
        speedX: { min: -40, max: 40 },
        speedY: { min: -60, max: -20 },
        lifespan: 300,
        // NOTE: spec said scale 0.15→0, but on a 4x4 texture that's ~0.6px
        // (sub-pixel, invisible). Bumped to 1→0 so the dust actually renders.
        scale: { start: 1, end: 0 },
        tint: COLORS.PLATFORM, // level's primary green (matches jump bursts)
        emitting: false,
      }).setDepth(4.5);
    }
    this.landDust.emitParticleAt(this.x, this.y + PLAYER.HEIGHT / 2, 6);
  }

  // One-time, understated floating hint at the player (e.g. dash-locked prompt).
  showAbilityHint(text) {
    const t = this.scene.add
      .text(this.x, this.y - 24, text, { fontFamily: 'monospace', fontSize: '8px', color: '#ff6a00' })
      .setOrigin(0.5).setDepth(6).setAlpha(0.6);
    this.scene.tweens.add({
      targets: t, y: t.y - 20, alpha: 0, duration: 1500, ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  startDash() {
    this.isDashing = true;
    this.dashTimeLeft = PLAYER.DASH_DURATION;
    this.dashCooldown = PLAYER.DASH_COOLDOWN;
    this.trailTimer = 0;

    // Burst horizontally and float (gravity off) for the dash duration.
    this.body.setVelocityX(PLAYER.DASH_SPEED * this.facing);
    this.body.setVelocityY(0);
    this.body.setAllowGravity(false);
    SFX.dash();

    // Subtle RGB-split hint on the dash burst.
    if (this.scene.chromaticHit) this.scene.chromaticHit(0.2, 150);
  }

  endDash() {
    this.isDashing = false;
    this.body.setAllowGravity(true);
  }

  // ---- Attack ----------------------------------------------------------------
  // Spawns a short-lived visual blade in front of the player and enables the
  // attack hitbox (positioned in front, facing-aware) for the attack window.
  attack() {
    this.attackActive = true;
    SFX.attack();
    this.visuals.spawnAttack(this.facing);

    // Move the hitbox in front of the player and enable it for the window.
    this.attackHitbox.setPosition(this.x + this.facing * 18, this.y);
    this.attackHitbox.body.enable = true;
    this.attackHitbox.body.updateFromGameObject();

    this.scene.time.delayedCall(PLAYER.ATTACK_DURATION, () => {
      this.attackActive = false;
      this.attackHitbox.body.enable = false;
    });
  }

  // ---- Damage routing (Level 2 enemy contact goes through here) -------------
  // Shield absorbs one hit; brief i-frames prevent instant double-death.
  takeHit() {
    if (this.scene.time.now < this.invincibleUntil) return; // invincible
    if (this.hasShield) {
      this.breakShield();
      return;
    }
    this.die();
  }

  breakShield() {
    this.hasShield = false;
    this.invincibleUntil = this.scene.time.now + SHIELD_INVINCIBILITY_MS;
    // AUDIO: shield break — FL Studio
    this.visuals.breakShield();
    if (this.scene.shakeScreen) this.scene.shakeScreen(200, SHIELD_BREAK_SHAKE);
    if (this.scene.chromaticHit) this.scene.chromaticHit(0.3, 200);
    if (this.scene.flashScreen) this.scene.flashScreen(0x00cc66, 0.4, 200);
  }

  // ---- Death & respawn -------------------------------------------------------
  die() {
    if (this.isDead) return;
    this.isDead = true;
    // Cinematic death zoom — fires once at the single death chokepoint, so every
    // death path (enemy, pit, fall) gets it. Guarded: only scenes with a camera
    // controller (Game, Level2) react; harmless elsewhere.
    if (this.scene.cameraController) this.scene.cameraController.cinematicEvent('playerDeath', this.scene);
    this.isDashing = false;
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    SFX.death();

    // ---- Frame 0: full juice stack ----
    if (this.scene.hitPause) this.scene.hitPause(80);            // freeze
    if (this.scene.chromaticHit) this.scene.chromaticHit(1.0, 400); // RGB split
    if (this.scene.shakeScreen) this.scene.shakeScreen(300, 0.012); // shake
    if (this.scene.spawnDeathSplat) this.scene.spawnDeathSplat(this.x, this.y);

    // Second-stage shake fired the instant the hit-pause freeze releases (~80ms).
    this.scene.time.delayedCall(80, () => this.scene.cameras.main.shake(200, 0.006));

    // Existing flash/explode death animation.
    this.visuals.explode();

    // Respawn after the sequence (the splat mark persists).
    this.scene.time.delayedCall(600, () => this.respawn());
  }

  respawn() {
    // Respawn at the scene's checkpoint if one has been activated, else spawn.
    const rx = this.scene.respawnX !== undefined ? this.scene.respawnX : this.spawnX;
    const ry = this.scene.respawnY !== undefined ? this.scene.respawnY : this.spawnY;
    this.setPosition(rx, ry);
    this.body.reset(rx, ry);
    this.body.setAllowGravity(true);
    this.jumpsUsed = 0;
    this.isDashing = false;
    this.dashCooldown = 0;
    this.isDead = false;
    // Clear jump-forgiveness state so nothing carries over to the new attempt.
    this.coyoteTime = 0;
    this.jumpBuffer = 0;
    this.hasJumped = false;
    this.wasOnGround = false;
    this.visuals.show();

    // BUG 9: reset seekers to their idle spawn state as the player reappears, so
    // a seeker that was mid-chase (and possibly culled + drifting) when the player
    // died is back home and ready. No-op on scenes with no seekers (Level 1).
    if (this.scene.seekers) this.scene.seekers.forEach((s) => { if (s.reset) s.reset(); });
  }

  // ---- HUD helper ------------------------------------------------------------
  // 0 right after dashing, 1 when the dash is ready again.
  getDashChargeRatio() {
    if (this.dashCooldown <= 0) return 1;
    return Phaser.Math.Clamp(1 - this.dashCooldown / PLAYER.DASH_COOLDOWN, 0, 1);
  }
}
