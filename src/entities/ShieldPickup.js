import { LEVEL2 } from '../constants.js';

// =============================================================================
// ShieldPickup — grants the player a one-hit shield on touch. The scene owns
// collection (overlaps `.trigger`, sets player.hasShield, destroys this).
// Distinct from collectibles: a larger, brighter diamond.
// =============================================================================
const JADE = LEVEL2.PLATFORM; // 0x00cc66

export default class ShieldPickup {
  constructor(scene, x, y) {
    this.scene = scene;

    this.trigger = scene.add.rectangle(x, y, 22, 22).setVisible(false);
    scene.physics.add.existing(this.trigger, true);

    this.outer = scene.add.rectangle(x, y, 20, 20, JADE, 1).setAngle(45).setDepth(3);
    this.inner = scene.add.rectangle(x, y, 10, 10, 0xffffff, 0.5).setAngle(45).setDepth(3.1);
    this.text = scene.add
      .text(x, y - 22, 'SHIELD', { fontFamily: 'monospace', fontSize: '8px', color: '#00cc66' })
      .setOrigin(0.5).setDepth(3.1);

    scene.tweens.add({ targets: [this.outer, this.inner], angle: '+=360', duration: 2000, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: [this.outer, this.inner], scale: { from: 0.85, to: 1.15 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.parts = [this.outer, this.inner, this.text];
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.outer);
    this.scene.tweens.killTweensOf(this.inner);
    this.parts.forEach((p) => p.destroy());
    this.trigger.destroy();
  }
}
