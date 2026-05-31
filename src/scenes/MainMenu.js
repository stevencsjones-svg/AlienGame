import Phaser from 'phaser';
import ParallaxBackground from '../background/ParallaxBackground.js';
import SFX from '../audio/SFX.js';

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

    // ---- Level select ----
    this.levels = [
      { label: 'LEVEL 1   ALIEN CITY', scene: 'Game' },
      { label: 'LEVEL 2   THE DESCENT', scene: 'Level2' },
    ];
    this.selectedIndex = 0;
    this.levelTexts = this.levels.map((lvl, i) => this.add
      .text(cx, cy + 96 + i * 30, lvl.label, {
        fontFamily: 'monospace', fontSize: '16px', color: '#00ff88',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.selectedIndex = i; this.updateSelection(); })
      .on('pointerdown', () => { this.selectedIndex = i; this.startGame(); }));

    // ---- Controls hint (blinks) ----
    const hint = this.add
      .text(cx, cy + 162, '↑ ↓  SELECT       SPACE / ENTER  START', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.tweens.add({
      targets: hint, alpha: { from: 0.3, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.updateSelection();

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
  }

  // Move the highlight between levels (wraps around).
  moveSelection(dir) {
    if (this.starting) return;
    this.selectedIndex = (this.selectedIndex + dir + this.levels.length) % this.levels.length;
    this.updateSelection();
    // AUDIO: menu move
  }

  // Highlight the active level, dim the rest.
  updateSelection() {
    this.levelTexts.forEach((t, i) => {
      const sel = i === this.selectedIndex;
      t.setText(`${sel ? '▶  ' : '    '}${this.levels[i].label}${sel ? '  ◀' : '   '}`);
      t.setColor(sel ? '#ff6a00' : '#00ff88');
      t.setAlpha(sel ? 1 : 0.4);
      t.setScale(sel ? 1.08 : 1);
    });
  }

  startGame() {
    if (this.starting) return;
    this.starting = true;
    // Initialise audio on this user gesture (satisfies browser autoplay policy).
    SFX.init();
    const target = this.levels[this.selectedIndex].scene;
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
