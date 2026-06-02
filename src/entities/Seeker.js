import Phaser from 'phaser';
import { ENEMY, COLORS } from '../constants.js';
import SFX from '../audio/SFX.js';

// =============================================================================
// Seeker
// Idles until the player enters range, then chases; returns home when the
// player is far. The physics body is a 22x14 triangle kept invisible; the
// visible seeker is an arrow/chevron (main bar + diamond nose + wings + eye)
// drawn in a follower Container. Chase / range logic is unchanged.
// =============================================================================
const W = 22;
const H = 14;
const ORANGE = COLORS.SEEKER; // 0xff6a00

export default class Seeker extends Phaser.GameObjects.Triangle {
  constructor(scene, x, y, player, config = {}) {
    super(scene, x, y, 0, 0, 0, H, W, H / 2, ORANGE);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(2);
    this.setAlpha(0); // physics body stays intact but invisible

    this.body.setAllowGravity(false);

    // Chase speed / detection are configurable per level (Level 1 is slower /
    // shorter-ranged). Defaults preserve the original Level 1 behaviour.
    this.speed = config.speed || ENEMY.SEEKER_SPEED;
    this.aggro = config.aggro || ENEMY.SEEKER_AGGRO;
    this.deaggro = config.deaggro || (this.aggro + (ENEMY.SEEKER_DEAGGRO - ENEMY.SEEKER_AGGRO));

    this.player = player;
    this.startX = x;
    this.startY = y;
    this.chasing = false;

    // Visual state.
    this.facingSign = 1; // points the way it travels
    this.punch = 1;      // scale-punch multiplier (activation)
    this.activating = false;
    this.visTime = 0;

    // ---- Visual parts (relative to centre; chevron points +x by default) ----
    this.wingTop = scene.add.rectangle(-2, -8, 4, 4, ORANGE, 0.5);
    this.wingBottom = scene.add.rectangle(-2, 8, 4, 4, ORANGE, 0.5);
    this.nose = scene.add.rectangle(7, 0, 14, 14, ORANGE, 0.85).setAngle(45);
    this.mainRect = scene.add.rectangle(0, 0, 22, 8, ORANGE, 0.85);
    this.eye = scene.add.rectangle(0, 0, 6, 2, 0xffffff, 0.9);

    this.gfx = scene.add
      .container(x, y, [this.wingTop, this.wingBottom, this.nose, this.mainRect, this.eye])
      .setDepth(2);
  }

  update(time, delta) {
    const p = this.player;
    if (!p) return; // guard: no player to chase (matches GroundDrone/HoverSentinel)
    const dist = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);

    // ---- Chase logic (UNCHANGED behaviour) ----
    if (!this.chasing && dist <= this.aggro) {
      this.activate();
    } else if (this.chasing && dist >= this.deaggro) {
      this.chasing = false;
      this.eye.setFillStyle(0xffffff, 0.9); // eye back to white when calm
    }

    if (this.chasing) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      this.body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
      this.faceToward(p.x);
    } else {
      const homeDist = Phaser.Math.Distance.Between(this.x, this.y, this.startX, this.startY);
      if (homeDist > 4) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.startX, this.startY);
        this.body.setVelocity(Math.cos(angle) * this.speed * 0.6, Math.sin(angle) * this.speed * 0.6);
        this.faceToward(this.startX);
      } else {
        this.body.setVelocity(0, 0);
      }
    }

    // ---- Visuals ----
    this.visTime += delta;
    this.gfx.setPosition(this.x, this.y);
    this.gfx.scaleX = this.facingSign * this.punch;
    this.gfx.scaleY = this.punch;

    if (this.chasing) {
      // Slight wobble while chasing (+/-5deg over 200ms).
      this.gfx.angle = 5 * Math.sin((this.visTime / 200) * Math.PI * 2);
      // Eye pulses rapidly (60ms cycle).
      const ep = Math.abs(Math.sin((this.visTime / 60) * Math.PI));
      this.eye.setAlpha(0.5 + 0.5 * ep);
      if (!this.activating) this.gfx.setAlpha(1);
    } else {
      // Idle sensor sweep: scan left-right +/-15deg over 2s.
      this.gfx.angle = 15 * Math.sin((this.visTime / 2000) * Math.PI * 2);
      this.eye.setAlpha(0.9);
      // Idle: slow opacity pulse 60%..90% over 1.5s.
      if (!this.activating) {
        const ip = 0.5 + 0.5 * Math.sin((this.visTime / 1500) * Math.PI * 2);
        this.gfx.setAlpha(0.6 + 0.3 * ip);
      }
    }
  }

  activate() {
    this.chasing = true;
    SFX.enemyAlert();

    // Juice: brief freeze + RGB split as it locks on.
    if (this.scene.hitPause) this.scene.hitPause(50);
    if (this.scene.chromaticHit) this.scene.chromaticHit(0.4, 200);

    this.eye.setFillStyle(ORANGE, 1); // orange eye when active

    // Scale punch: 1 -> 1.2 -> 1 over ~150ms.
    this.scene.tweens.add({ targets: this, punch: 1.2, duration: 75, yoyo: true, ease: 'Quad.easeOut' });

    // Fast flash: opacity 0 -> 100%, three times rapidly.
    this.activating = true;
    this.scene.tweens.add({
      targets: this.gfx,
      alpha: { from: 0, to: 1 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => { this.activating = false; this.gfx.setAlpha(1); },
    });

    // A small screen shake punctuates the activation.
    if (this.scene.shakeScreen) this.scene.shakeScreen(80, 0.004);

    // "TARGET ACQUIRED" data readout (fade in 100, hold 600, out 200).
    // Capture the scene: the seeker can be killed before this fade-out fires,
    // which would null this.scene (the readout text is scene-owned).
    const scene = this.scene;
    const txt = scene.add
      .text(this.x, this.y - H / 2 - 8, 'TARGET ACQUIRED', {
        fontFamily: 'monospace', fontSize: '7px', color: '#ff6a00',
      })
      .setOrigin(0.5).setDepth(6).setAlpha(0);
    scene.tweens.add({ targets: txt, alpha: 1, duration: 100 });
    scene.time.delayedCall(700, () => {
      scene.tweens.add({ targets: txt, alpha: 0, duration: 200, onComplete: () => txt.destroy() });
    });
  }

  // Record which way the seeker is travelling (the container is flipped in update).
  faceToward(targetX) {
    this.facingSign = targetX < this.x ? -1 : 1;
  }

  // Killed by the player's attack: white flash, particle burst, shake, destroy.
  die() {
    if (this.dead) return;
    this.dead = true;
    this.active = false;               // manual update loops skip it (see scene)
    if (this.body) this.body.enable = false;
    this.setFillStyle(0xffffff);
    this.setAlpha(1);
    this.setDepth(6);
    const dx = this.x;
    const dy = this.y;
    // Capture the scene: the 80ms timer can outlive a scene shutdown, which
    // nulls this.scene — the death FX are scene-owned, so use the captured ref.
    const scene = this.scene;
    scene.time.delayedCall(80, () => {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const particle = scene.add.rectangle(dx, dy, 4, 4, 0xbf00ff).setDepth(6);
        scene.tweens.add({
          targets: particle,
          x: dx + Math.cos(angle) * 40,
          y: dy + Math.sin(angle) * 40,
          alpha: 0,
          duration: 300,
          onComplete: () => particle.destroy(),
        });
      }
      scene.cameras.main.shake(60, 0.004);
      // AUDIO: enemy death placeholder
      if (this.gfx) this.gfx.destroy();
      this.destroy();
    });
  }
}
