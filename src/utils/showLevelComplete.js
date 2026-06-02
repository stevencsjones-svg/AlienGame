import Phaser from 'phaser';
import { LEVEL_COMPLETE_BEATS } from '../constants.js';

// =============================================================================
// showLevelComplete — shared level-complete overlay.
// Renders the dark overlay, "LEVEL COMPLETE" title, collectible / secret tally,
// and the per-level narrative beat (from LEVEL_COMPLETE_BEATS), then waits for
// SPACE and fires onContinue. Returns the created objects for external cleanup.
//
// Intended for Levels 3–10 (and any future scene). Levels 1 & 2 keep their own
// bespoke overlays — see Game.js / Level2.js.
// =============================================================================
export function showLevelComplete(scene, levelNum, collected, total, secrets, secretTotal, onContinue) {
  const data = LEVEL_COMPLETE_BEATS[levelNum] || { beat: '', accent: '#ff6a00' };

  const cx = scene.scale.width / 2;
  const cy = scene.scale.height / 2;

  // Dark overlay.
  const overlay = scene.add
    .rectangle(cx, cy, scene.scale.width, scene.scale.height, 0x050a08, 0)
    .setScrollFactor(0)
    .setDepth(300);
  scene.tweens.add({ targets: overlay, alpha: 0.85, duration: 300 });

  // Main text.
  const mainText = scene.add
    .text(cx, cy - 60, 'LEVEL COMPLETE', {
      fontFamily: 'Courier New',
      fontSize: '28px',
      color: data.accent,
      letterSpacing: 6,
    })
    .setOrigin(0.5).setScrollFactor(0).setDepth(301).setAlpha(0).setScale(0.5);

  // Collectibles line.
  const collectText = scene.add
    .text(cx, cy - 14, `${collected} / ${total} COLLECTED`, {
      fontFamily: 'Courier New',
      fontSize: '14px',
      color: '#00e5ff',
    })
    .setOrigin(0.5).setScrollFactor(0).setDepth(301).setAlpha(0);

  // Secrets line — only if at least 1 found.
  let secretText = null;
  if (secrets > 0) {
    const allFound = secrets >= secretTotal;
    secretText = scene.add
      .text(cx, cy + 10, allFound
        ? `${secrets} / ${secretTotal} SECRETS — PERFECT`
        : `${secrets} / ${secretTotal} SECRETS`, {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#ff6a00',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(301).setAlpha(0);

    if (allFound) {
      scene.tweens.add({
        targets: secretText,
        scaleX: 1.06,
        scaleY: 1.06,
        duration: 300,
        yoyo: true,
        delay: 800,
      });
    }
  }

  // Divider line.
  const divider = scene.add
    .rectangle(cx, cy + 34, 320, 1, Phaser.Display.Color.HexStringToColor(data.accent).color, 0.3)
    .setScrollFactor(0).setDepth(301).setAlpha(0);

  // Narrative beat.
  const beatText = scene.add
    .text(cx, cy + 46, data.beat, {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: data.accent,
      align: 'center',
      lineSpacing: 6,
    })
    .setOrigin(0.5, 0).setScrollFactor(0).setDepth(301).setAlpha(0);

  // Continue prompt — appears after a delay.
  const continueText = scene.add
    .text(cx, cy + 110, 'PRESS SPACE TO CONTINUE', {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: '#ffffff',
      letterSpacing: 2,
    })
    .setOrigin(0.5).setScrollFactor(0).setDepth(301).setAlpha(0);

  // ---- Animation sequence ----
  // 1. Main text pops in.
  scene.tweens.add({
    targets: mainText,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    duration: 400,
    ease: 'Back.easeOut',
  });

  // 2. Collectibles fade in.
  scene.time.delayedCall(300, () => {
    scene.tweens.add({
      targets: [collectText, secretText].filter(Boolean),
      alpha: 1,
      duration: 300,
    });
  });

  // 3. Beat text fades in.
  scene.time.delayedCall(600, () => {
    scene.tweens.add({ targets: [divider, beatText], alpha: 1, duration: 400 });
  });

  // 4. Continue prompt blinks in.
  scene.time.delayedCall(1800, () => {
    scene.tweens.add({
      targets: continueText,
      alpha: 0.4,
      duration: 300,
      yoyo: true,
      repeat: -1,
    });
  });

  // 5. Space to continue (armed after 1s so it can't be skipped instantly).
  scene.time.delayedCall(1000, () => {
    scene.input.keyboard.once('keydown-SPACE', () => {
      if (onContinue) onContinue();
    });
  });

  // Return all objects for external cleanup.
  return [overlay, mainText, collectText, secretText, divider, beatText, continueText].filter(Boolean);
}
