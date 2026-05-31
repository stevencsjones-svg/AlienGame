import Phaser from 'phaser';
import { PLAYER, COLORS, SHIELD_INVINCIBILITY_MS, SHIELD_BREAK_SHAKE } from '../constants.js';
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

    // Coyote time + jump buffering (forgiveness windows, in ms).
    this.coyoteTime = 0;      // remaining window to still ground-jump after leaving a ledge
    this.jumpBuffer = 0;      // remaining window of a remembered early jump press
    this.wasOnGround = false; // ground state last frame (edge detection)
    this.hasJumped = false;   // true after a jump until landing (gates coyote)

    // Speed progression multiplier (driven by the scene; see setSpeedMultiplier).
    this.speedMultiplier = 1;

    // Abilities. hasAttack defaults true so Level 1 is unchanged; Level 2 turns
    // it off at start and grants it via the attack ability pickup.
    this.hasAttack = true;
    this.hasShield = false;
    this.invincibleUntil = 0; // ms timestamp; no enemy damage before this

    // ---- Input ----
    const kb = scene.input.keyboard;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D',
      space: 'SPACE', shift: 'SHIFT', z: 'Z',
    });
    // Stop the browser from scrolling when these keys are pressed.
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,W,A,S,D,Z');
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

    const k = this.keys;
    const left = k.left.isDown || k.a.isDown;
    const right = k.right.isDown || k.d.isDown;
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

    // Coyote time: open the window when we walk off a ledge without jumping.
    if (justLeftGround && !this.hasJumped) {
      this.coyoteTime = PLAYER.COYOTE_TIME;
    }
    if (this.coyoteTime > 0) this.coyoteTime -= delta;

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(k.up) ||
      Phaser.Input.Keyboard.JustDown(k.w) ||
      Phaser.Input.Keyboard.JustDown(k.space);

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
      } else if (this.jumpsUsed < 2) {
        // Air jump (the double). If we fell off past the coyote window without
        // taking the grounded jump, forfeit that slot so only the double remains
        // (double-jump availability itself is unchanged).
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
    const jumpHeld = k.up.isDown || k.w.isDown || k.space.isDown;
    const jumpKeyJustReleased =
      (Phaser.Input.Keyboard.JustUp(k.up) ||
        Phaser.Input.Keyboard.JustUp(k.w) ||
        Phaser.Input.Keyboard.JustUp(k.space)) &&
      !jumpHeld;
    if (jumpKeyJustReleased && this.body.velocity.y < 0) {
      this.body.setVelocityY(this.body.velocity.y * PLAYER.JUMP_CUT_MULTIPLIER);
    }

    // ---- Dash (Shift) ----
    if (Phaser.Input.Keyboard.JustDown(k.shift)) {
      this.doDash();
    }

    // ---- Attack (gated by the attack ability) ----
    if (this.hasAttack && Phaser.Input.Keyboard.JustDown(k.z) && !this.attackActive) {
      this.attack();
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
  // Dash in the current facing direction (Shift), respecting the cooldown.
  doDash() {
    if (this.isDashing || this.dashCooldown > 0 || this.frozen || this.isDead) return;
    this.startDash();
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
    this.isDashing = false;
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    SFX.death();

    // ---- Frame 0: full juice stack ----
    if (this.scene.hitPause) this.scene.hitPause(80);            // freeze
    if (this.scene.chromaticHit) this.scene.chromaticHit(1.0, 400); // RGB split
    if (this.scene.shakeScreen) this.scene.shakeScreen(300, 0.012); // shake
    if (this.scene.spawnDeathSplat) this.scene.spawnDeathSplat(this.x, this.y);

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
  }

  // ---- HUD helper ------------------------------------------------------------
  // 0 right after dashing, 1 when the dash is ready again.
  getDashChargeRatio() {
    if (this.dashCooldown <= 0) return 1;
    return Phaser.Math.Clamp(1 - this.dashCooldown / PLAYER.DASH_COOLDOWN, 0, 1);
  }
}
