import Phaser from 'phaser';
import { ENEMY, COLORS } from '../constants.js';

// =============================================================================
// HoverSentinel
// Hovers in place, bobbing on a sine wave. The physics body is a 20x20 square
// kept invisible; the visible sentinel is a layered alien core (shell + core +
// cyan inner glow + four sensor squares) drawn in a follower Container.
// Bob movement / physics are unchanged.
// =============================================================================
const SIZE = 20;
const PURPLE = COLORS.ENEMY;       // 0xbf00ff
const CYAN = COLORS.COLLECTIBLE;   // 0x00e5ff

export default class HoverSentinel extends Phaser.GameObjects.Rectangle {
  constructor(scene, x, y) {
    super(scene, x, y, SIZE, SIZE, PURPLE);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(2);
    this.setAlpha(0); // physics body stays intact but invisible

    this.body.setAllowGravity(false);

    this.startY = y;    // centre of the bob
    this.bobTime = 0;   // ms accumulator
    this.orbitTime = 0; // antenna-orbit accumulator

    // ---- Ground shadow (cast on the nearest surface below) ----
    let surfaceY = null;
    const plats = scene.platforms || [];
    for (const p of plats) {
      const b = p.body;
      if (x >= b.x && x <= b.x + b.width && b.y >= y) {
        if (surfaceY === null || b.y < surfaceY) surfaceY = b.y;
      }
    }
    this.shadow = surfaceY === null
      ? null
      : scene.add.ellipse(x, surfaceY + 1, 24, 6, PURPLE, 0.15).setDepth(1.8);

    // ---- Visual parts (relative to centre; diamonds via 45deg rotation) ----
    this.outerShell = scene.add.rectangle(0, 0, 22, 22, PURPLE, 0.12).setAngle(45);
    this.sensorTop = scene.add.rectangle(0, -12, 4, 4, PURPLE, 0.5);
    this.sensorBottom = scene.add.rectangle(0, 12, 4, 4, PURPLE, 0.5);
    this.sensorLeft = scene.add.rectangle(-12, 0, 4, 4, PURPLE, 0.5);
    this.sensorRight = scene.add.rectangle(12, 0, 4, 4, PURPLE, 0.5);
    this.core = scene.add.rectangle(0, 0, 16, 16, PURPLE, 0.85).setAngle(45);
    this.innerCore = scene.add.rectangle(0, 0, 8, 8, CYAN, 0.7).setAngle(45);

    this.gfx = scene.add
      .container(x, y, [
        this.outerShell, this.sensorTop, this.sensorBottom,
        this.sensorLeft, this.sensorRight, this.core, this.innerCore,
      ])
      .setDepth(2);

    // Inner cyan core pulses opacity 50%..100% over 0.8s.
    scene.tweens.add({
      targets: this.innerCore,
      alpha: { from: 0.5, to: 1 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  update(time, delta) {
    this.bobTime += delta;

    // ---- Bob (UNCHANGED behaviour) ----
    const phase = (this.bobTime / ENEMY.SENTINEL_BOB_PERIOD) * Math.PI * 2;
    this.y = this.startY + ENEMY.SENTINEL_BOB * Math.sin(phase);
    this.body.reset(this.x, this.y); // keep the physics body aligned

    // ---- Visuals ----
    this.gfx.setPosition(this.x, this.y);

    // Sensor squares bob ~3px in the opposite phase to the core (k folds the
    // container's own bob and the counter-motion together) AND slowly orbit the
    // core (micro-motion) — the core itself does not rotate.
    const k = ((3 + ENEMY.SENTINEL_BOB) / ENEMY.SENTINEL_BOB) * (this.y - this.startY);
    this.orbitTime += delta;
    const a = (this.orbitTime / 4000) * Math.PI * 2; // 360deg over 4s
    const R = 12;
    const place = (s, base) => s.setPosition(R * Math.cos(base + a), R * Math.sin(base + a) - k);
    place(this.sensorTop, -Math.PI / 2);
    place(this.sensorRight, 0);
    place(this.sensorBottom, Math.PI / 2);
    place(this.sensorLeft, Math.PI);

    // Shadow grows as the sentinel bobs down, shrinks as it bobs up.
    if (this.shadow) {
      const offset = (this.y - this.startY) / ENEMY.SENTINEL_BOB; // -1..1
      this.shadow.setScale(1 + 0.25 * offset);
    }
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
    this.scene.time.delayedCall(80, () => {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const particle = this.scene.add.rectangle(dx, dy, 4, 4, 0xbf00ff).setDepth(6);
        this.scene.tweens.add({
          targets: particle,
          x: dx + Math.cos(angle) * 40,
          y: dy + Math.sin(angle) * 40,
          alpha: 0,
          duration: 300,
          onComplete: () => particle.destroy(),
        });
      }
      this.scene.cameras.main.shake(60, 0.004);
      // AUDIO: enemy death placeholder
      if (this.gfx) this.gfx.destroy();
      if (this.shadow) this.shadow.destroy();
      this.destroy();
    });
  }
}
