import Phaser from 'phaser';
import { PLAYER, COLORS, SHIELD_RING_RADIUS_X, SHIELD_RING_RADIUS_Y } from '../constants.js';

// =============================================================================
// PlayerVisuals
// Draws and animates the player's character (legs, torso, head, visor) from
// layered Rectangles that follow the physics body every frame. Also owns the
// dash-ghost trail, jump bursts, attack visual and death fragments.
//
// The physics body itself stays a 20x28 rectangle (kept invisible in Player).
// Nothing here touches physics — it only reads the body's state.
//
// Draw order (back -> front): legs < torso < head < visor.
// =============================================================================

const C_BRIGHT = COLORS.PLAYER;      // 0xc8ffd4 pale alien white
const C_GREEN = COLORS.PLATFORM;     // 0x00ff88 toxic green
const C_CYAN = COLORS.COLLECTIBLE;   // 0x00e5ff cyan visor
const C_PURPLE = COLORS.ENEMY;       // 0xbf00ff double-jump burst

const C_SHIELD = 0x00cc66; // shield ring colour

const MAX_GHOSTS = 6;

// The figure is drawn raised by this many px so the feet rest ON the surface
// (the physics body's bottom edge) instead of poking through the platform.
const LIFT = 5.5;

export default class PlayerVisuals {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    // Animation accumulators.
    this.legPhase = 0;       // run-cycle accumulator (ms, scaled by speed)
    this.idleTime = 0;       // breathing accumulator (ms)
    this.visorTimer = 5000;  // countdown to next visor "display refresh" blink
    this.ghosts = [];        // active dash-ghost groups
    this.hidden = false;

    // ---- Body parts (depths enforce legs < torso < head < visor) ----
    this.legL = scene.add.rectangle(player.x, player.y, 5, 7, C_GREEN, 0.7).setDepth(5.0);
    this.legR = scene.add.rectangle(player.x, player.y, 5, 7, C_GREEN, 0.7).setDepth(5.0);

    this.torsoShell = scene.add.rectangle(player.x, player.y, 20, 14, C_GREEN, 0.2).setDepth(5.1);
    this.torso = scene.add.rectangle(player.x, player.y, 14, 12, C_BRIGHT, 0.85).setDepth(5.2);

    this.headShell = scene.add.rectangle(player.x, player.y, 14, 11, C_GREEN, 0.25).setDepth(5.3);
    this.head = scene.add.rectangle(player.x, player.y, 12, 10, C_BRIGHT, 0.9).setDepth(5.4);

    this.visor = scene.add.rectangle(player.x, player.y, 10, 3, C_CYAN, 1).setDepth(5.5);

    // Tiny collectible-count readout shown ON the visor for a moment on pickup.
    this.visorText = scene.add
      .text(player.x, player.y, '', { fontFamily: 'monospace', fontSize: '7px', color: '#050a08' })
      .setOrigin(0.5)
      .setDepth(5.6)
      .setVisible(false);
    this.countFlashTimer = 0; // ms remaining on the visor count flash

    this.parts = [
      this.legL, this.legR, this.torsoShell, this.torso,
      this.headShell, this.head, this.visor,
    ];

    // ---- Shield ring (shown only while player.hasShield) ----
    this.shieldTime = 0;
    this.shieldRing = scene.add
      .ellipse(player.x, player.y, SHIELD_RING_RADIUS_X * 2, SHIELD_RING_RADIUS_Y * 2)
      .setStrokeStyle(1.5, C_SHIELD, 0.7)
      .setDepth(5.6)
      .setVisible(false);
    this.shieldRing.isFilled = false;
    this.shieldDots = [];
    for (let i = 0; i < 4; i++) {
      this.shieldDots.push(scene.add.rectangle(player.x, player.y, 3, 3, C_SHIELD, 0.7).setDepth(5.7).setVisible(false));
    }
  }

  // Burst the shield ring into fragments when it breaks.
  breakShield() {
    this.shieldRing.setVisible(false);
    this.shieldDots.forEach((d) => d.setVisible(false));
    const px = this.player.x;
    const py = this.player.y;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const f = this.scene.add.rectangle(px, py, 3, 3, C_SHIELD, 1).setDepth(5.7);
      this.scene.tweens.add({
        targets: f,
        x: px + Math.cos(ang) * 40,
        y: py + Math.sin(ang) * 40,
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => f.destroy(),
      });
    }
  }

  // Briefly flash a count on the visor (called on pickup). Hidden pickups pass
  // an orange colour and a longer duration to signal something special.
  flashCount(count, color = C_CYAN, duration = 800) {
    this.visorText.setText(`${count}`);
    this.countFlashTimer = duration;
    this.visor.setFillStyle(color); // tint the visor for the flash
  }

  // ---- Per-frame update ------------------------------------------------------
  update(time, delta) {
    if (this.hidden) return;

    const p = this.player;
    const dir = p.facing;                 // 1 right, -1 left
    const vx = p.body.velocity.x;
    const onFloor = p.body.blocked.down;
    const moving = Math.abs(vx) > 5;

    // ---- Legs ----
    // Feet are anchored to the surface (the body's bottom). The run cycle
    // lifts alternating feet UPWARD so they never sink below the platform.
    const FOOT = PLAYER.HEIGHT / 2; // centre -> bottom of body (= standing surface)
    const HALF_LEG = 3.5;           // half the 7px leg height
    let footL;
    let footR;
    if (!onFloor) {
      // Jumping / falling: both feet tucked up.
      footL = FOOT - 3;
      footR = FOOT - 3;
    } else if (moving) {
      // Run cycle (200ms base), sped up with horizontal velocity.
      const speedRatio = Phaser.Math.Clamp(Math.abs(vx) / PLAYER.SPEED, 0.2, 2);
      this.legPhase += delta * speedRatio;
      const phase = (this.legPhase / 200) * Math.PI * 2;
      footL = FOOT - (2 + 2 * Math.sin(phase));            // lifts 0..4px off floor
      footR = FOOT - (2 + 2 * Math.sin(phase + Math.PI));  // 180deg out of phase
    } else {
      // Still: both feet planted on the surface.
      footL = FOOT;
      footR = FOOT;
    }

    // ---- Idle breathing (stationary + grounded) ----
    let bob = 0;
    let sway = 0;
    let visorAlpha = 1;
    if (onFloor && !moving) {
      this.idleTime += delta;
      const ph = (this.idleTime / 1200) * Math.PI * 2;
      bob = 1.5 * Math.sin(ph);                              // torso/head bob +/-1.5px
      visorAlpha = 0.9 + 0.1 * Math.sin(ph);                 // visor pulse 0.8..1.0
      sway = 0.5 * Math.sin((this.idleTime / 3000) * Math.PI * 2); // +/-0.5px sway over 3s
    } else {
      this.idleTime = 0;
    }

    // Visor "display refresh": blink off for a single frame every 4-7s.
    this.visorTimer -= delta;
    if (this.visorTimer <= 0) {
      visorAlpha = 0;
      this.visorTimer = 4000 + Math.random() * 3000;
    }

    // Collectible-count flash: force a bright visor + show the count.
    if (this.countFlashTimer > 0) {
      this.countFlashTimer -= delta;
      visorAlpha = 1;
      if (this.countFlashTimer <= 0) {
        this.visorText.setVisible(false);
        this.visor.setFillStyle(C_CYAN); // revert visor colour after the flash
      }
    }

    // ---- Position parts (x offsets mirrored by facing; the upper body is
    // raised by LIFT so the whole figure sits with its feet on the surface) ----
    this.legL.setPosition(p.x + dir * -5, p.y + footL - HALF_LEG);
    this.legR.setPosition(p.x + dir * 3, p.y + footR - HALF_LEG);

    this.torsoShell.setPosition(p.x + sway, p.y + 4 + bob - LIFT);
    this.torso.setPosition(p.x + sway, p.y + 4 + bob - LIFT);

    this.headShell.setPosition(p.x + sway, p.y - 8 + bob - LIFT);
    this.head.setPosition(p.x + sway, p.y - 8 + bob - LIFT);

    // Visor sits in the head and looks the way the player travels.
    this.visor.setPosition(p.x + sway + dir * 1, p.y - 8 + bob - LIFT);
    this.visor.setAlpha(visorAlpha);

    // Count readout rides on the visor while flashing.
    if (this.countFlashTimer > 0) {
      this.visorText.setVisible(true).setPosition(this.visor.x, this.visor.y);
    }

    // ---- Shield ring (only while shielded) ----
    const shielded = !!this.player.hasShield;
    this.shieldRing.setVisible(shielded);
    this.shieldDots.forEach((d) => d.setVisible(shielded));
    if (shielded) {
      this.shieldTime += delta;
      this.shieldRing.setPosition(p.x, p.y);
      this.shieldRing.angle = (this.shieldTime / 3000) * 360; // 360deg / 3s
      const ringOp = 0.675 + 0.175 * Math.sin((this.shieldTime / 1000) * Math.PI * 2); // 0.5..0.85
      this.shieldRing.setStrokeStyle(1.5, C_SHIELD, ringOp);
      const a = (this.shieldTime / 3000) * Math.PI * 2;
      for (let i = 0; i < 4; i++) {
        const da = a + (i * Math.PI) / 2;
        this.shieldDots[i].setPosition(
          p.x + Math.cos(da) * SHIELD_RING_RADIUS_X,
          p.y + Math.sin(da) * SHIELD_RING_RADIUS_Y,
        );
      }
    }

    // ---- Invincibility blink (after a shield break) ----
    const invincible = this.player.invincibleUntil > time;
    const blink = invincible ? (Math.floor(time / 80) % 2 === 0) : true;
    for (let i = 0; i < this.parts.length; i++) this.parts[i].setVisible(blink);
  }

  // ---- Dash ghost trail ------------------------------------------------------
  // Emits a fading snapshot of every part. Capped at MAX_GHOSTS groups.
  spawnGhost() {
    if (this.ghosts.length >= MAX_GHOSTS) {
      const oldest = this.ghosts.shift();
      oldest.forEach((o) => { this.scene.tweens.killTweensOf(o); o.destroy(); });
    }

    const ghost = this.parts.map((part) => {
      const r = this.scene.add
        .rectangle(part.x, part.y, part.width, part.height, C_BRIGHT, 0.6)
        .setDepth(4);
      this.scene.tweens.add({
        targets: r,
        alpha: 0,
        duration: 200,
        onComplete: () => r.destroy(),
      });
      return r;
    });

    this.ghosts.push(ghost);
    // Drop it from tracking once it has fully faded.
    this.scene.time.delayedCall(200, () => {
      const idx = this.ghosts.indexOf(ghost);
      if (idx !== -1) this.ghosts.splice(idx, 1);
    });
  }

  // ---- Jump burst ------------------------------------------------------------
  // Jet-assisted puff at the feet. Double jump is purple, larger, more puffs.
  spawnJumpBurst(isDouble) {
    const px = this.player.x;
    const py = this.player.y + PLAYER.HEIGHT / 2; // feet
    const count = isDouble ? 6 : 4;
    const size = isDouble ? 4 : 3;
    const colour = isDouble ? C_PURPLE : C_GREEN;

    for (let i = 0; i < count; i++) {
      const r = this.scene.add.rectangle(px, py, size, size, colour, 0.7).setDepth(4.5);
      const spread = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0; // -1..1
      this.scene.tweens.add({
        targets: r,
        x: px + spread * 28,
        y: py + Phaser.Math.Between(16, 34), // downward
        alpha: 0,
        duration: 150,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }

  // ---- Attack ----------------------------------------------------------------
  // A cyan blade extending from the torso, plus 3 particles at the tip.
  spawnAttack(facing) {
    const px = this.player.x;
    const py = this.player.y - LIFT; // align with the raised torso

    const hb = this.scene.add
      .rectangle(px + facing * 14, py + 4, 28, 8, C_CYAN, 0.9)
      .setDepth(5.6);
    this.scene.time.delayedCall(PLAYER.ATTACK_DURATION, () => hb.destroy());

    // Tip particles fly outward and fade.
    const tipX = px + facing * 28;
    const tipY = py + 4;
    for (let i = 0; i < 3; i++) {
      const r = this.scene.add.rectangle(tipX, tipY, 4, 4, C_CYAN, 0.9).setDepth(5.7);
      this.scene.tweens.add({
        targets: r,
        x: tipX + facing * Phaser.Math.Between(20, 36),
        y: tipY + (i - 1) * 12, // spread vertically
        alpha: 0,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }

  // ---- Death fragments -------------------------------------------------------
  // Hides the character and bursts it into 8 fading fragments.
  explode() {
    this.hidden = true;
    this.parts.forEach((p) => p.setVisible(false));
    this.visorText.setVisible(false);
    this.countFlashTimer = 0;

    const px = this.player.x;
    const py = this.player.y;
    const palette = [C_BRIGHT, C_GREEN];

    for (let i = 0; i < 8; i++) {
      const size = Phaser.Math.Between(2, 6);
      const frag = this.scene.add
        .rectangle(
          px + Phaser.Math.Between(-6, 6),
          py + Phaser.Math.Between(-10, 10),
          size, size, palette[i % 2], 1
        )
        .setDepth(5.5);

      const angle = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const speed = Phaser.Math.Between(30, 70);
      this.scene.tweens.add({
        targets: frag,
        x: frag.x + Math.cos(angle) * speed,
        y: frag.y + Math.sin(angle) * speed,
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => frag.destroy(),
      });
    }
  }

  // Re-show the character (called on respawn).
  show() {
    this.hidden = false;
    this.parts.forEach((p) => p.setVisible(true));
  }
}
