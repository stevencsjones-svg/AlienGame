import Phaser from 'phaser';
import { COLORS } from '../constants.js';

// =============================================================================
// ExitPortal
// A layered, animated alien dimensional gateway: two counter-rotating rounded
// rings, a pulsing inner core, a flickering energy fill, downward scan lines,
// a continuous inward particle stream, a ground glow and an "EXIT" label.
//
// An invisible static body sized to the inner core is exposed as `.trigger`
// for the level-complete overlap. activate() plays the burst on completion.
// =============================================================================
const ORANGE = COLORS.ACCENT; // 0xff6a00
const WHITE = 0xffffff;

const MAX_PARTICLES = 60;
const PARTICLE_BOUNDS = { hw: 22, hh: 36 }; // half-extents for spawn perimeter

export default class ExitPortal {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    this.active = true;       // emitting particles
    this.particles = [];
    this.scanTime = 0;
    this.bigTimer = 0;
    this.colourToggle = false;

    // ---- Ground glow (on the rooftop ground below the portal, y:400) ----
    this.glow = scene.add.ellipse(x, 400, 80, 12, ORANGE, 0.2).setDepth(1.9);
    scene.tweens.add({
      targets: this.glow, alpha: { from: 0.15, to: 0.28 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ---- Outer ring (border only, rounded) ----
    this.outer = this.makeRing(50, 80, 8, 0.4, 3, 3.0);
    scene.tweens.add({ targets: this.outer, scale: { from: 0.95, to: 1.08 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: this.outer, angle: 360, duration: 8000, repeat: -1, ease: 'Linear' });

    // ---- Middle ring (counter-rotating) ----
    this.middle = this.makeRing(38, 64, 6, 0.7, 3, 3.1);
    scene.tweens.add({ targets: this.middle, scale: { from: 0.92, to: 1.1 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: this.middle, angle: -360, duration: 5000, repeat: -1, ease: 'Linear' });

    // ---- Inner core (filled, opacity pulse 20%..50%) ----
    this.core = scene.add.graphics().setDepth(3.2);
    this.core.fillStyle(ORANGE, 1);
    this.core.fillRoundedRect(-12, -22, 24, 44, 4);
    this.core.setPosition(x, y).setAlpha(0.3);
    scene.tweens.add({ targets: this.core, alpha: { from: 0.2, to: 0.5 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ---- Energy fill (rapid white flicker) ----
    this.energy = scene.add.rectangle(x, y, 18, 36, WHITE, 0.15).setDepth(3.3);
    scene.tweens.add({ targets: this.energy, alpha: { from: 0.05, to: 0.25 }, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ---- Horizontal scan lines ----
    this.scanLines = [];
    for (let i = 0; i < 5; i++) {
      this.scanLines.push(scene.add.rectangle(x, y, 22, 1, ORANGE, 0.2).setDepth(3.4));
    }

    // ---- "EXIT" label, 16px above the outer ring ----
    this.label = scene.add
      .text(x, y - 56, 'EXIT', { fontFamily: 'monospace', fontSize: '10px', color: '#ff6a00' })
      .setOrigin(0.5)
      .setAlpha(0.7)
      .setDepth(3.5);
    if (this.label.setLetterSpacing) this.label.setLetterSpacing(3);
    scene.tweens.add({ targets: this.label, alpha: { from: 0.5, to: 0.9 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ---- Overlap trigger: invisible static body on the inner core ----
    this.trigger = scene.add.rectangle(x, y, 24, 44).setVisible(false);
    scene.physics.add.existing(this.trigger, true);

    // Everything that should burst/fade on activation.
    this.parts = [this.outer, this.middle, this.core, this.energy, this.label, this.glow, ...this.scanLines];
  }

  // Build a rounded-rect border ring centred on the portal.
  makeRing(w, h, rx, alpha, lineWidth, depth) {
    const g = this.scene.add.graphics().setDepth(depth);
    g.lineStyle(lineWidth, ORANGE, alpha);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, rx);
    g.setPosition(this.x, this.y);
    return g;
  }

  update(time, delta) {
    if (!this.active) return;

    // ---- Scan lines cycle downward through the core over 1.5s ----
    this.scanTime += delta;
    const cycle = (this.scanTime % 1500) / 1500;
    const top = this.y - 22;
    for (let i = 0; i < this.scanLines.length; i++) {
      const f = (cycle + i / this.scanLines.length) % 1;
      this.scanLines[i].y = top + f * 44;
    }

    // ---- Particle stream: 2 per frame, pulled inward ----
    this.spawnParticle();
    this.spawnParticle();

    this.bigTimer += delta;
    if (this.bigTimer >= 800) {
      this.bigTimer -= 800;
      this.spawnParticle(true);
    }
  }

  spawnParticle(big = false) {
    if (!big && this.particles.length >= MAX_PARTICLES) return;

    // Random point on the portal-bounds perimeter.
    const { hw, hh } = PARTICLE_BOUNDS;
    const side = Phaser.Math.Between(0, 3);
    let ex;
    let ey;
    if (side === 0) { ex = Phaser.Math.Between(-hw, hw); ey = -hh; }
    else if (side === 1) { ex = Phaser.Math.Between(-hw, hw); ey = hh; }
    else if (side === 2) { ex = -hw; ey = Phaser.Math.Between(-hh, hh); }
    else { ex = hw; ey = Phaser.Math.Between(-hh, hh); }

    const px = this.x + ex;
    const py = this.y + ey;
    const colour = big ? WHITE : (this.colourToggle = !this.colourToggle) ? ORANGE : WHITE;
    const size = big ? 6 : Phaser.Math.Between(2, 4);
    const alpha = big ? 0.6 : 0.8;

    const r = this.scene.add.rectangle(px, py, size, size, colour, alpha).setDepth(2.8);

    // Drift toward the centre at 20-40px/s while fading out over 600ms.
    const ang = Phaser.Math.Angle.Between(px, py, this.x, this.y);
    const dist = Phaser.Math.Between(20, 40) * 0.6;
    this.particles.push(r);
    this.scene.tweens.add({
      targets: r,
      x: px + Math.cos(ang) * dist,
      y: py + Math.sin(ang) * dist,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        const idx = this.particles.indexOf(r);
        if (idx !== -1) this.particles.splice(idx, 1);
        r.destroy();
      },
    });
  }

  // ---- Activation burst (called by Game on level complete) ----
  activate() {
    this.active = false; // stop emitting

    // Rings scale up to 2.0 and fade; the rest just fades. Kill looping tweens
    // first so the burst tween wins.
    this.parts.forEach((p) => this.scene.tweens.killTweensOf(p));
    this.scene.tweens.add({ targets: [this.outer, this.middle], scale: 2, alpha: 0, duration: 300, ease: 'Quad.easeOut' });
    this.scene.tweens.add({ targets: [this.core, this.energy, this.label, this.glow, ...this.scanLines], alpha: 0, duration: 300 });

    // Particle explosion: 30 shards flying outward.
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2;
      const colour = i % 2 ? ORANGE : WHITE;
      const r = this.scene.add.rectangle(this.x, this.y, 4, 4, colour, 1).setDepth(3.6);
      this.scene.tweens.add({
        targets: r,
        x: this.x + Math.cos(ang) * 80,
        y: this.y + Math.sin(ang) * 80,
        alpha: 0,
        duration: 500,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }
}
