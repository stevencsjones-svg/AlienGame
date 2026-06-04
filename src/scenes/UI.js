import Phaser from 'phaser';
import { TOTAL_COLLECTIBLES, HIDDEN_COLLECTIBLE_COUNT } from '../constants.js';
import SFX from '../audio/SFX.js';
import AssistMode from '../utils/AssistMode.js';

// =============================================================================
// UI
// Parallel HUD over whichever gameplay scene is active (Game or Level2):
//  - normal collectible counter (cyan) + hidden-secret counter (orange)
//  - a shield indicator that fades in while the player is shielded
// Reads the scene's own total (scene.totalCollectibles), falling back to
// Level 1's 19. Stays at 60% opacity, pulsing to 100% on a count change.
// =============================================================================
export default class UI extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    this.lastCount = 0;
    this.lastSecrets = 0;
    this.shieldAlpha = 0;

    // Normal collectibles (cyan).
    this.icon = this.add.rectangle(24, 22, 8, 8, 0x00e5ff).setAngle(45).setAlpha(0.6);
    this.countText = this.add
      .text(34, 22, `0 / ${TOTAL_COLLECTIBLES}`, { fontFamily: 'monospace', fontSize: '11px', color: '#00e5ff' })
      .setOrigin(0, 0.5).setAlpha(0.6);

    // Separator.
    this.add.rectangle(86, 22, 1, 16, 0xffffff, 0.2);

    // Hidden secrets (orange).
    this.secretIcon = this.add.rectangle(98, 22, 8, 8, 0xff6a00).setAngle(45).setAlpha(0.6);
    this.secretText = this.add
      .text(108, 22, `0 / ${HIDDEN_COLLECTIBLE_COUNT}`, { fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setAlpha(0.6);

    // Shield indicator (below the counter; fades in only while shielded).
    this.shieldIcon = this.add.rectangle(24, 44, 10, 10, 0x00cc66).setAngle(45).setAlpha(0);

    // Mute indicator (top-right): ♪ when on, ♪̶ when muted.
    this.muteIcon = this.add
      .text(this.scale.width - 14, 14, '♪', { fontFamily: 'monospace', fontSize: '8px', color: '#00ff88' })
      .setOrigin(1, 0).setAlpha(0.4);

    // Assist mode indicator (bottom-right). Visible only when any option is active.
    this.assistIndicator = this.add
      .text(this.scale.width - 12, this.scale.height - 12, 'ASSIST', {
        fontFamily: 'monospace', fontSize: '8px', color: '#ff6a00',
      })
      .setOrigin(1, 1).setAlpha(0);
  }

  // Whichever gameplay scene is currently running.
  gameplayScene() {
    if (this.scene.isActive('Level2')) return this.scene.get('Level2');
    return this.scene.get('Game');
  }

  update() {
    // Mute indicator (always live, independent of the gameplay scene).
    this.muteIcon.x = this.scale.width - 14;
    this.muteIcon.setText(SFX.enabled ? '♪' : '♪̶');

    // Assist indicator — bottom-right, shown whenever any option is active.
    this.assistIndicator.x = this.scale.width - 12;
    this.assistIndicator.y = this.scale.height - 12;
    this.assistIndicator.setAlpha(AssistMode.any() ? 0.5 : 0);

    const gs = this.gameplayScene();
    if (!gs || !gs.player) return;

    const total = gs.totalCollectibles != null ? gs.totalCollectibles : TOTAL_COLLECTIBLES;
    const c = gs.collectedCount || 0;
    const s = gs.secretsFound || 0;
    this.countText.setText(`${c} / ${total}`);
    this.secretText.setText(`${s} / ${HIDDEN_COLLECTIBLE_COUNT}`);

    if (c !== this.lastCount) {
      this.lastCount = c;
      this.pulse([this.icon, this.countText]);
    }
    if (s !== this.lastSecrets) {
      this.lastSecrets = s;
      this.pulse([this.secretIcon, this.secretText]);
    }

    // Shield indicator: lerp toward a gentle pulse while shielded, else fade out.
    const target = gs.player.hasShield
      ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.time.now / 400))
      : 0;
    this.shieldAlpha += (target - this.shieldAlpha) * 0.15;
    this.shieldIcon.setAlpha(this.shieldAlpha);
  }

  // Flash a set of objects to full opacity, then ease back to 60%.
  pulse(objs) {
    objs.forEach((o) => {
      o.setAlpha(1);
      this.tweens.add({ targets: o, alpha: 0.6, duration: 400, ease: 'Quad.easeOut' });
    });
  }
}
