import Phaser from 'phaser';
import { PLAYER, COLORS } from '../constants.js';
import PlayerVisuals from './PlayerVisuals.js';

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

    // Double-tap dash (replaces the Shift key).
    this.lastLeftTap = 0;
    this.lastRightTap = 0;

    // Speed progression multiplier (driven by the scene; see setSpeedMultiplier).
    this.speedMultiplier = 1;

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

    // ---- Dash (double-tap a direction) ----
    const now = this.scene.time.now;
    const leftTap = Phaser.Input.Keyboard.JustDown(k.left) || Phaser.Input.Keyboard.JustDown(k.a);
    const rightTap = Phaser.Input.Keyboard.JustDown(k.right) || Phaser.Input.Keyboard.JustDown(k.d);
    if (leftTap) {
      if (now - this.lastLeftTap < PLAYER.DASH_DOUBLE_TAP_WINDOW) {
        this.doDash('left');
        this.lastLeftTap = 0; // reset so it can't immediately re-trigger
      } else {
        this.lastLeftTap = now;
      }
    }
    if (rightTap) {
      if (now - this.lastRightTap < PLAYER.DASH_DOUBLE_TAP_WINDOW) {
        this.doDash('right');
        this.lastRightTap = 0;
      } else {
        this.lastRightTap = now;
      }
    }

    // ---- Attack ----
    if (Phaser.Input.Keyboard.JustDown(k.z) && !this.attackActive) {
      this.attack();
    }
  }

  // ---- Jump execution (shared by normal press and buffered landing) ---------
  doJump() {
    this.body.setVelocityY(-PLAYER.JUMP_VELOCITY);
    this.jumpsUsed++;
    this.hasJumped = true;
    if (this.jumpsUsed === 1) {
      // AUDIO: jump
      this.visuals.spawnJumpBurst(false);
    } else {
      // AUDIO: double jump
      this.visuals.spawnJumpBurst(true);
    }
  }

  // ---- Speed progression (set by the scene each frame) ----------------------
  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = multiplier;
  }

  // ---- Dash ------------------------------------------------------------------
  // Dash in an explicit direction (from a double-tap), respecting the cooldown.
  doDash(dir) {
    if (this.isDashing || this.dashCooldown > 0 || this.frozen || this.isDead) return;
    this.facing = dir === 'left' ? -1 : 1;
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
    // AUDIO: dash

    // Subtle RGB-split hint on the dash burst.
    if (this.scene.chromaticHit) this.scene.chromaticHit(0.2, 150);
  }

  endDash() {
    this.isDashing = false;
    this.body.setAllowGravity(true);
  }

  // ---- Attack ----------------------------------------------------------------
  // Spawns a short-lived visual blade in front of the player. No effect on
  // enemies yet — purely the visual. Enemy death will be wired up later.
  attack() {
    this.attackActive = true;
    // AUDIO: attack
    this.visuals.spawnAttack(this.facing);
    this.scene.time.delayedCall(PLAYER.ATTACK_DURATION, () => {
      this.attackActive = false;
    });
  }

  // ---- Death & respawn -------------------------------------------------------
  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.isDashing = false;
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    // AUDIO: player death

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
