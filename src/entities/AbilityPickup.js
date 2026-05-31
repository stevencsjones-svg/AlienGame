import { COLORS } from '../constants.js';

// =============================================================================
// AbilityPickup — a collectible that grants the player an ability on touch.
// The scene owns collection (overlaps `.trigger`, then reads abilityType and
// shows the unlock panel). abilityType: 'attack' | 'doubleJump' | 'dash'.
// =============================================================================
const ORANGE = COLORS.ACCENT; // 0xff6a00

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

    this.outer = scene.add.rectangle(x, y, 24, 24, ORANGE, 1).setDepth(3);
    this.inner = scene.add.rectangle(x, y, 14, 14, 0xffffff, 0.6).setDepth(3.1);
    this.text = scene.add
      .text(x, y - 22, label, { fontFamily: 'monospace', fontSize: '8px', color: '#ff6a00' })
      .setOrigin(0.5).setDepth(3.1);
    this.p1 = scene.add.rectangle(x, y, 3, 3, ORANGE, 0.9).setDepth(3);
    this.p2 = scene.add.rectangle(x, y, 3, 3, ORANGE, 0.9).setDepth(3);

    scene.tweens.add({ targets: [this.outer, this.inner], angle: '+=360', duration: 1500, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: [this.outer, this.inner], scale: { from: 0.9, to: 1.1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.parts = [this.outer, this.inner, this.text, this.p1, this.p2];
  }

  update(time, delta) {
    this.orbit += delta;
    const a = (this.orbit / 1500) * Math.PI * 2;
    this.p1.setPosition(this.x + Math.cos(a) * 20, this.y + Math.sin(a) * 20);
    this.p2.setPosition(this.x + Math.cos(a + Math.PI) * 20, this.y + Math.sin(a + Math.PI) * 20);
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.outer);
    this.scene.tweens.killTweensOf(this.inner);
    this.parts.forEach((p) => p.destroy());
    this.trigger.destroy();
  }
}
