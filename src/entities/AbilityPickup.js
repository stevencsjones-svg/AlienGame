import { COLORS } from '../constants.js';

// =============================================================================
// AbilityPickup — a collectible that grants the player an ability on touch.
// The scene owns collection (overlaps `.trigger`, then reads abilityType and
// shows the unlock panel). abilityType: 'attack' | 'doubleJump' | 'dash'.
//
// The pickup is drawn as a hexagon with a type-specific glyph (upward chevrons
// for doubleJump, rightward arrows for dash, a blade for attack) on a Graphics
// object, gently scale-pulsing. Note: this class is a plain object (not a
// Phaser GameObject), so the pulse tween targets the Graphics object directly.
// =============================================================================
const PRIMARY_COLOR = COLORS.ACCENT; // 0xff6a00

export default class AbilityPickup {
  constructor(scene, x, y, abilityType, label, description) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.abilityType = abilityType;
    this.label = label;
    this.description = description;
    this.orbit = 0;

    // Invisible static body for the overlap.
    this.trigger = scene.add.rectangle(x, y, 24, 24).setVisible(false);
    scene.physics.add.existing(this.trigger, true);

    // Type-specific geometry drawn on a Graphics object centred at (x, y).
    this.gfx = scene.add.graphics({ x, y }).setDepth(3);
    this.drawGlyph(this.gfx, abilityType);

    this.text = scene.add
      .text(x, y - 22, label, { fontFamily: 'monospace', fontSize: '8px', color: '#ff6a00' })
      .setOrigin(0.5).setDepth(3.1);
    this.p1 = scene.add.rectangle(x, y, 3, 3, PRIMARY_COLOR, 0.9).setDepth(3);
    this.p2 = scene.add.rectangle(x, y, 3, 3, PRIMARY_COLOR, 0.9).setDepth(3);

    // Gentle scale pulse (the Graphics scales around its own origin = (x, y)).
    scene.tweens.add({
      targets: this.gfx,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.parts = [this.gfx, this.text, this.p1, this.p2];
  }

  // Draw a flat-topped hexagon and the type-specific glyph in local space.
  drawGlyph(gfx, abilityType) {
    gfx.clear();
    this.drawHexagon(gfx, 0, 0, 14, PRIMARY_COLOR);
    gfx.lineStyle(2, 0xffffff, 0.9);

    if (abilityType === 'doubleJump') {
      // Two upward chevrons, centred.
      gfx.strokePoints([{ x: -6, y: 2 }, { x: 0, y: -4 }, { x: 6, y: 2 }], false);
      gfx.strokePoints([{ x: -6, y: 7 }, { x: 0, y: 1 }, { x: 6, y: 7 }], false);
    } else if (abilityType === 'dash') {
      // Two rightward arrows, centred.
      gfx.strokePoints([{ x: -7, y: -4 }, { x: -1, y: 0 }, { x: -7, y: 4 }], false);
      gfx.strokePoints([{ x: -1, y: -4 }, { x: 5, y: 0 }, { x: -1, y: 4 }], false);
    } else {
      // attack (and any other type): a diagonal blade with a short crossguard.
      gfx.strokePoints([{ x: -6, y: 6 }, { x: 6, y: -6 }], false);
      gfx.strokePoints([{ x: 1, y: -6 }, { x: 6, y: -6 }, { x: 6, y: -1 }], false);
    }
  }

  drawHexagon(gfx, cx, cy, r, fillColor) {
    gfx.fillStyle(fillColor, 0.85);
    gfx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      i === 0 ? gfx.moveTo(px, py) : gfx.lineTo(px, py);
    }
    gfx.closePath();
    gfx.fillPath();
  }

  update(time, delta) {
    this.orbit += delta;
    const a = (this.orbit / 1500) * Math.PI * 2;
    this.p1.setPosition(this.x + Math.cos(a) * 20, this.y + Math.sin(a) * 20);
    this.p2.setPosition(this.x + Math.cos(a + Math.PI) * 20, this.y + Math.sin(a + Math.PI) * 20);
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.gfx);
    this.parts.forEach((p) => p.destroy());
    this.trigger.destroy();
  }
}
