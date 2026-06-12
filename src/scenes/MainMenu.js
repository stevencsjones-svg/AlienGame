import Phaser from 'phaser';
import { DEV_MODE } from '../constants.js';
import ParallaxBackground from '../background/ParallaxBackground.js';
import SFX from '../audio/SFX.js';
import Progression from '../utils/Progression.js';

// =============================================================================
// MainMenu
// Title screen over the live parallax city (slowly scrolling), with the same
// CRT post-FX, ambient data-noise, a pulsing title, a blinking start prompt,
// and fade in/out transitions. Space begins the game.
// =============================================================================
const FRAGMENT_STRINGS = [
  'SYS', 'ERR', '0x4F', 'NODE', 'PKT', '//', 'NULL', '0xFF', 'SYNC', 'ACK',
  '>>>', 'LOST', '404', 'DAT', 'REC', 'BUF', 'OVERFLOW', 'PING', '//KILL',
];

export default class MainMenu extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    // Same CRT pipeline as the game (registered globally in main.js).
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    // Reuse the parallax city background; scroll it slowly on the menu.
    this.background = new ParallaxBackground(this);
    this.menuScroll = 0;

    // ---- Title + framing lines ----
    this.add.rectangle(cx, cy - 44, w, 1, 0x00ff88, 0.3).setScrollFactor(0).setDepth(10);
    this.add.rectangle(cx, cy + 44, w, 1, 0x00ff88, 0.3).setScrollFactor(0).setDepth(10);
    const title = this.add
      .text(cx, cy, 'ALIEN CITY', {
        fontFamily: 'monospace', fontSize: '48px', color: '#00ff88', fontStyle: 'bold',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.tweens.add({
      targets: title, scale: { from: 0.98, to: 1.02 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ---- Subtitle ----
    this.add
      .text(cx, cy + 60, 'A CITY THAT WANTS YOU DEAD', {
        fontFamily: 'monospace', fontSize: '13px', color: '#00ff88',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11).setAlpha(0.5);

    // ---- Tagline (a whisper — exile beat) ----
    this.add
      .text(cx, cy + 88, 'They took everything. Take it back.', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ff6a00',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11).setAlpha(0.6);

    // ---- Level select ----
    // `requires` = the level number that must be completed to unlock this one
    // (0 = always available). Gating is checked live against Progression.
    this.levels = [
      { label: 'LEVEL 1   ALIEN CITY', scene: 'Game', requires: 0 },
      { label: 'LEVEL 2   THE DESCENT', scene: 'Level2', requires: 1 },
      { label: 'LEVEL 3   TRANSIT NETWORK', scene: 'Level3', requires: 2 },
      { label: 'LEVEL 4   MARKET TOWERS', scene: 'Level4', requires: 3 },
    ];
    this.selectedIndex = 0;
    this.levelTexts = this.levels.map((lvl, i) => this.add
      .text(cx, cy + 112 + i * 26, lvl.label, {
        fontFamily: 'monospace', fontSize: '16px', color: '#00ff88',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.selectedIndex = i; this.updateSelection(); })
      .on('pointerdown', () => { this.selectedIndex = i; this.startGame(); }));

    // ---- Progression gating: one lock / completion indicator per level row ----
    this.levelIndicators = this.levels.map(() => this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(11).setVisible(false));

    // ---- Controls hint (blinks) ----
    const hint = this.add
      .text(cx, cy + 216, '↑ ↓  SELECT       SPACE / ENTER  START', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.tweens.add({
      targets: hint, alpha: { from: 0.3, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.updateLevelSelectDisplay();

    // ---- Version (bottom-right) ----
    this.add
      .text(w - 8, h - 8, 'v0.1', { fontFamily: 'monospace', fontSize: '9px', color: '#00ff88' })
      .setOrigin(1, 1).setScrollFactor(0).setDepth(11).setAlpha(0.2);

    // ---- Ambient data noise ----
    this.fragments = [];
    this.fragTimer = 0;

    // ---- Fade in from black (600ms) ----
    this.fadeRect = this.add
      .rectangle(cx, cy, w, h, 0x000000, 1)
      .setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: this.fadeRect, alpha: 0, duration: 600 });

    this.starting = false;
    const kb = this.input.keyboard;
    kb.on('keydown-UP', () => this.moveSelection(-1));
    kb.on('keydown-W', () => this.moveSelection(-1));
    kb.on('keydown-DOWN', () => this.moveSelection(1));
    kb.on('keydown-S', () => this.moveSelection(1));
    kb.on('keydown-SPACE', () => this.startGame());
    kb.on('keydown-ENTER', () => this.startGame());

    // Re-check progression whenever the menu is re-entered (e.g. a player who
    // just completed Level 1 should see it unlocked immediately). create() runs
    // on every scene.start; this 'wake' handler covers a sleep/wake path too.
    if (!this._wakeBound) {
      this._wakeBound = true;
      this.events.on('wake', () => this.updateLevelSelectDisplay());
    }
  }

  // Move the highlight between levels (wraps around).
  moveSelection(dir) {
    if (this.starting) return;
    this.selectedIndex = (this.selectedIndex + dir + this.levels.length) % this.levels.length;
    this.updateSelection();
    // AUDIO: menu move
  }

  // A level is unlocked if it has no requirement, DEV_MODE is on, or the
  // required level has been completed. `complete` reads the live save.
  levelUnlocked(i) {
    const req = this.levels[i].requires;
    return req === 0 || DEV_MODE || Progression.hasCompleted(req);
  }

  levelComplete(i) {
    return Progression.hasCompleted(i + 1); // level number = index + 1
  }

  // Highlight the active level, dim the rest. A locked level stays dimmed green
  // (#00ff88 @ 20%) regardless of selection, per the lock styling.
  updateSelection() {
    this.levelTexts.forEach((t, i) => {
      const sel = i === this.selectedIndex;
      t.setText(`${sel ? '▶  ' : '    '}${this.levels[i].label}${sel ? '  ◀' : '   '}`);
      if (!this.levelUnlocked(i)) {
        t.setColor('#00ff88').setAlpha(0.2);
      } else {
        t.setColor(sel ? '#ff6a00' : '#00ff88').setAlpha(sel ? 1 : 0.4);
      }
      t.setScale(sel ? 1.08 : 1);
    });
    // Keep each indicator pinned just right of its (re-scaled) row.
    if (this.levelIndicators) {
      this.levelIndicators.forEach((ind, i) => {
        if (!ind || !ind.visible) return;
        const row = this.levelTexts[i];
        ind.setPosition(row.x + row.displayWidth / 2 + 6, row.y);
      });
    }
  }

  // Set each level's lock/completion indicator from progression, then refresh
  // the selection visuals (which also repositions the indicators).
  updateLevelSelectDisplay() {
    if (!this.levelIndicators) return;
    this.levels.forEach((lvl, i) => {
      const ind = this.levelIndicators[i];
      if (!this.levelUnlocked(i)) {
        ind.setText('[LOCKED]').setColor('#ff6a00').setFontSize(9).setAlpha(0.5).setVisible(true);
      } else if (this.levelComplete(i)) {
        ind.setText('✓').setColor('#00ff88').setFontSize(12).setAlpha(0.9).setVisible(true);
      } else {
        ind.setVisible(false);
      }
    });
    this.updateSelection();
  }

  // Brief "locked" hint shown when the player tries to start a locked level.
  showLockedMessage(reqLevel) {
    if (this.lockMsg) return; // one at a time
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.lockMsg = this.add
      .text(cx, cy + 200, `COMPLETE LEVEL ${reqLevel} TO UNLOCK`, {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff6a00',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(12).setAlpha(0);
    this.tweens.add({
      targets: this.lockMsg, alpha: 1, duration: 200,
      onComplete: () => this.time.delayedCall(1500, () => {
        this.tweens.add({
          targets: this.lockMsg, alpha: 0, duration: 200,
          onComplete: () => { if (this.lockMsg) { this.lockMsg.destroy(); this.lockMsg = null; } },
        });
      }),
    });
  }

  startGame() {
    if (this.starting) return;
    const i = this.selectedIndex;
    const target = this.levels[i].scene;
    // Gate: selecting a locked level shows a hint instead of starting.
    if (!this.levelUnlocked(i)) {
      this.showLockedMessage(this.levels[i].requires);
      return;
    }
    this.starting = true;
    // Initialise audio on this user gesture (satisfies browser autoplay policy).
    SFX.init();
    // Fade to black, then start the chosen level.
    this.fadeRect.setAlpha(0).setDepth(60);
    this.tweens.add({
      targets: this.fadeRect,
      alpha: 1,
      duration: 400,
      onComplete: () => this.scene.start(target),
    });
  }

  update(time, delta) {
    // Scroll the parallax slowly even on the menu.
    this.menuScroll += delta * 0.02;
    this.cameras.main.scrollX = this.menuScroll;
    this.background.update();

    // Sparse floating fragments: 1 every 3s, max 6, drifting up + fading.
    this.fragTimer += delta;
    if (this.fragTimer >= 3000 && this.fragments.length < 6) {
      this.fragTimer = 0;
      this.spawnFragment();
    }
  }

  spawnFragment() {
    const w = this.scale.width;
    const h = this.scale.height;
    const str = FRAGMENT_STRINGS[Math.floor(Math.random() * FRAGMENT_STRINGS.length)];
    const fx = Math.random() * w;
    const fy = h * (0.4 + Math.random() * 0.5);
    const t = this.add
      .text(fx, fy, str, { fontFamily: 'monospace', fontSize: '7px', color: '#00ff88' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(5).setAlpha(0.12);
    this.fragments.push(t);
    this.tweens.add({
      targets: t,
      y: fy - 40,
      alpha: 0,
      duration: 5000,
      ease: 'Linear',
      onComplete: () => {
        const i = this.fragments.indexOf(t);
        if (i !== -1) this.fragments.splice(i, 1);
        t.destroy();
      },
    });
  }
}
