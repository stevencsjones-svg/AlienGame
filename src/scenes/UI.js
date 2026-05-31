import Phaser from 'phaser';
import { TOTAL_COLLECTIBLES, HIDDEN_COLLECTIBLE_COUNT } from '../constants.js';

// =============================================================================
// UI
// A parallel HUD scene drawn on top of the Game scene. It holds two tiny,
// low-prominence fixed readouts: the normal collectibles (cyan) and the hidden
// "secrets" (orange), separated by a faint divider. Each sits at 60% opacity
// and briefly pulses to 100% when its own count changes.
// The prominent feedback is diegetic (dash ring + visor flash in the Game scene).
// =============================================================================
export default class UI extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    this.gameScene = this.scene.get('Game');
    this.lastCount = 0;
    this.lastSecrets = 0;

    // ---- Normal collectibles (cyan) ----
    this.icon = this.add.rectangle(24, 22, 8, 8, 0x00e5ff).setAngle(45).setAlpha(0.6);
    this.countText = this.add
      .text(34, 22, `0 / ${TOTAL_COLLECTIBLES}`, {
        fontFamily: 'monospace', fontSize: '11px', color: '#00e5ff',
      })
      .setOrigin(0, 0.5)
      .setAlpha(0.6);

    // ---- Separator ----
    this.add.rectangle(86, 22, 1, 16, 0xffffff, 0.2);

    // ---- Hidden secrets (orange) ----
    this.secretIcon = this.add.rectangle(98, 22, 8, 8, 0xff6a00).setAngle(45).setAlpha(0.6);
    this.secretText = this.add
      .text(108, 22, `0 / ${HIDDEN_COLLECTIBLE_COUNT}`, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00',
      })
      .setOrigin(0, 0.5)
      .setAlpha(0.6);
  }

  update() {
    if (!this.gameScene || !this.gameScene.player) return;

    const c = this.gameScene.collectedCount;
    const s = this.gameScene.secretsFound;
    this.countText.setText(`${c} / ${TOTAL_COLLECTIBLES}`);
    this.secretText.setText(`${s} / ${HIDDEN_COLLECTIBLE_COUNT}`);

    if (c !== this.lastCount) {
      this.lastCount = c;
      this.pulse([this.icon, this.countText]);
    }
    if (s !== this.lastSecrets) {
      this.lastSecrets = s;
      this.pulse([this.secretIcon, this.secretText]);
    }
  }

  // Flash a set of objects to full opacity, then ease back to 60%.
  pulse(objs) {
    objs.forEach((o) => {
      o.setAlpha(1);
      this.tweens.add({ targets: o, alpha: 0.6, duration: 400, ease: 'Quad.easeOut' });
    });
  }
}
