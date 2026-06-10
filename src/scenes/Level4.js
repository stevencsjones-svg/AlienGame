import Phaser from 'phaser';
import { LEVEL4_PALETTE, DEV_MODE } from '../constants.js';
import Player from '../entities/Player.js';
import CameraController from '../camera/CameraController.js';
import DiegeticHUD from '../ui/DiegeticHUD.js';
import { buildPlatformVisual } from '../entities/platformVisual.js';
import ChromaticAberrationPipeline from '../pipelines/ChromaticAberrationPipeline.js';
import SFX from '../audio/SFX.js';

// =============================================================================
// Level 4 — Market Towers. A bright, dense, ANIMATED Asian-market tower district
// over a tall vertical zigzag climb. Three parallax layers of towers / neon
// signage / vendor stalls, plus pancake vendors, low-flying birds and sagging
// cable webs. All colours come from LEVEL4_PALETTE (no inline hex). All motion
// is via tweens/timers (no per-frame allocation); birds are pooled.
//
// NOTE: this is a minimal gameplay SHELL (ground + a climbable zigzag + player +
// camera + HUD). It is intentionally NOT wired into level progression yet.
// =============================================================================
const PAL = LEVEL4_PALETTE;
const W = 8000;
const H = 12000;
const FLOOR_Y = 11900;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const GLYPHS = ['◊X◊', 'Z-9', '▚▞█', 'H3X', '◊◊◊', 'V0ID', 'N-7', 'ARC', '||=', 'SEC2'];

export default class Level4 extends Phaser.Scene {
  constructor() {
    super('Level4');
  }

  create() {
    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.physics.world.setBounds(0, 0, W, H);
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(PAL.BG);

    // ---- State ----
    this.platforms = [];
    this.birds = [];
    this.collectedCount = 0;
    this.totalCollectibles = 0; // HUD reads this (shell has no collectibles yet)
    this.secretsFound = 0;
    this.levelDone = false;

    // ---- Post-FX chain (same as L2/L3) — bloom makes the neon glow. ----
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('BloomPipeline');
      this.cameras.main.setPostPipeline(ChromaticAberrationPipeline);
      this.cameras.main.setPostPipeline('CRTPipeline');
      this.cameras.main.setPostPipeline('ColorGradePipeline');
    }

    // ---- Background (built first so it renders behind everything) ----
    this.buildBackground();

    // ---- Geometry: ground floor + a vertical zigzag climb (minimal shell) ----
    this.addPlatform(W / 2, FLOOR_Y, W, 160);
    let side = -1;
    for (let y = FLOOR_Y - 240, k = 0; y > 600; y -= 240, k += 1) {
      side = k % 2 === 0 ? -1 : 1;
      this.addPlatform(W / 2 + side * 130, y, 220, 18);
    }

    // ---- Player (spawns at the bottom; arrives with the core abilities) ----
    this.player = new Player(this, 400, FLOOR_Y - 200);
    this.player.canDoubleJump = true;
    this.player.canDash = true;
    this.player.hasAttack = true;

    this.physics.add.collider(this.player, this.platforms);

    // ---- Camera (CameraController, wired like L1/L3) ----
    this.cameraController = new CameraController(this, this.cameras.main, 'horizontal');

    // ---- HUD ----
    this.diegeticHUD = new DiegeticHUD(this, this.player);
    if (!this.scene.isActive('UI')) this.scene.launch('UI');

    // ---- Audio mute toggle (M), consistent with other levels ----
    this.mKey = this.input.keyboard.addKey('M');
  }

  // Gameplay platform (no Light2D here — the level is self-lit + bright).
  addPlatform(cx, topY, w, h) {
    const { body } = buildPlatformVisual(this, cx, topY, w, h, PAL, false);
    this.physics.add.existing(body, true);
    this.platforms.push(body);
  }

  // ===========================================================================
  // BACKGROUND
  // Layers placed in world space at the parallax-adjusted Y spans so they fill
  // the whole climb (a scrollFactor-sf layer's visible worldY range over the
  // full climb is [0, camMax*sf + vh]). Phaser does the parallax via scrollFactor.
  // ===========================================================================
  buildBackground() {
    const vh = this.scale.height;
    const camMax = H - vh;
    this.spanA = camMax * 0.15 + vh;
    this.spanB = camMax * 0.4 + vh;
    this.spanC = camMax * 0.7 + vh;

    this.buildHaze();
    this.buildLayerA();
    this.buildLayerB();
    this.buildLayerC();
    this.buildBirds();
  }

  // Bright blue haze gradient (a few big translucent bands, sf 0.1).
  buildHaze() {
    const bands = 5;
    for (let i = 0; i < bands; i += 1) {
      const y = (this.spanA / bands) * (i + 0.5);
      const col = i % 2 === 0 ? PAL.HAZE : PAL.HAZE_HI;
      this.add.rectangle(W / 2, y, W * 1.4, this.spanA / bands + 80, col, 0.06)
        .setScrollFactor(0.1).setDepth(-20);
    }
  }

  // ---- Layer A (sf 0.15): distant tower silhouettes + lit windows -----------
  buildLayerA() {
    for (let i = 0; i < 9; i += 1) {
      const x = (W / 9) * (i + 0.5) + Phaser.Math.Between(-200, 200);
      const y = Phaser.Math.FloatBetween(0, this.spanA);
      const w = Phaser.Math.Between(120, 240);
      const h = Phaser.Math.Between(500, 1100);
      this.makeTower(x, y, w, h, PAL.TOWER_FAR, 0.15, -18, 0.5, 0.10);
    }
  }

  // ---- Layer B (sf 0.4): mid towers + neon signage + cables ------------------
  buildLayerB() {
    for (let i = 0; i < 7; i += 1) {
      const x = (W / 7) * (i + 0.5) + Phaser.Math.Between(-180, 180);
      const y = Phaser.Math.FloatBetween(0, this.spanB);
      this.makeTower(x, Phaser.Math.Clamp(y, 0, this.spanB), Phaser.Math.Between(150, 280),
        Phaser.Math.Between(420, 900), PAL.TOWER_MID, 0.4, -14, 0.75, 0.16);
    }
    // Cables strung at mid depth.
    for (let i = 0; i < 4; i += 1) {
      this.makeCable(Phaser.Math.Between(200, W - 1400), Phaser.Math.FloatBetween(60, this.spanB - 60), 0.4, -13);
    }
    // 6 neon signs across the B span (varied animation, staggered).
    const accents = [PAL.NEON_CYAN, PAL.NEON_WARM, PAL.NEON_PINK, PAL.NEON_BLUE];
    for (let i = 0; i < 6; i += 1) {
      this.makeNeonSign(
        Phaser.Math.Between(300, W - 300), Phaser.Math.FloatBetween(80, this.spanB - 80),
        0.4, -12, GLYPHS[i % GLYPHS.length], accents[i % accents.length], i % 4,
      );
    }
  }

  // ---- Layer C (sf 0.7): vendor platforms, pancake vendors, signs, cable web -
  buildLayerC() {
    // Vendor stalls — 6, three of them with a pancake vendor.
    for (let i = 0; i < 6; i += 1) {
      const x = Phaser.Math.Between(200, W - 200);
      const y = Phaser.Math.FloatBetween(120, this.spanC - 120);
      this.makeVendor(x, y, i % 2 === 0);
    }
    // Dense cable web at the front depth.
    for (let i = 0; i < 5; i += 1) {
      this.makeCable(Phaser.Math.Between(150, W - 1100), Phaser.Math.FloatBetween(80, this.spanC - 80), 0.7, -9);
    }
    // 5 more neon signs (front, brighter).
    const accents = [PAL.NEON_WARM, PAL.NEON_CYAN, PAL.NEON_PINK, PAL.NEON_BLUE, PAL.NEON_CYAN];
    for (let i = 0; i < 5; i += 1) {
      this.makeNeonSign(
        Phaser.Math.Between(300, W - 300), Phaser.Math.FloatBetween(100, this.spanC - 100),
        0.7, -8, GLYPHS[(i + 3) % GLYPHS.length], accents[i], (i + 1) % 4,
      );
    }
  }

  // A tower: body + lit top edge + a window grid (a subset flickers on timers).
  makeTower(x, y, w, h, fill, sf, depth, litChance, flickerChance) {
    const parts = [
      this.add.rectangle(0, 0, w, h, fill, 1).setOrigin(0.5, 1),
      this.add.rectangle(0, -h, w, 3, PAL.TOWER_EDGE, 0.7).setOrigin(0.5, 0),
    ];
    const cols = Math.max(1, Math.floor((w - 10) / 16));
    const rows = Math.max(2, Math.floor((h - 24) / 26));
    const flickers = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (Math.random() > litChance) continue;
        const lit = Math.random() < 0.7;
        const col = lit ? (Math.random() < 0.2 ? PAL.WINDOW_WARM : PAL.WINDOW_COOL) : PAL.WINDOW_OFF;
        const wr = this.add.rectangle(-w / 2 + 8 + c * 16, -h + 14 + r * 26, 5, 7, col, lit ? 0.7 : 0.22).setOrigin(0, 0);
        parts.push(wr);
        if (lit && Math.random() < flickerChance) flickers.push(wr);
      }
    }
    this.add.container(x, y, parts).setScrollFactor(sf).setDepth(depth);
    // Slow random flicker (toggle on/off) via staggered timers.
    flickers.forEach((wr) => this.time.addEvent({
      delay: Phaser.Math.Between(1800, 6000), loop: true,
      callback: () => {
        const on = wr.fillAlpha > 0.4;
        wr.setFillStyle(on ? PAL.WINDOW_OFF : PAL.WINDOW_COOL, on ? 0.22 : 0.7);
      },
    }));
  }

  // A neon sign — backing panel + glow + alien-glyph text, animated by `style`:
  // 0 blink · 1 sequential letter light-up · 2 flicker-buzz · 3 slow hue pulse.
  makeNeonSign(x, y, sf, depth, glyphs, accent, style) {
    const panelW = glyphs.length * 16 + 14;
    const panel = this.add.rectangle(0, 0, panelW, 26, PAL.VENDOR_BODY, 0.85).setStrokeStyle(1, accent, 0.6);
    const glow = this.add.rectangle(0, 0, panelW + 8, 32, accent, 0.12);
    const letters = [];
    for (let i = 0; i < glyphs.length; i += 1) {
      letters.push(this.add.text((i - (glyphs.length - 1) / 2) * 16, 0, glyphs[i], {
        fontFamily: 'monospace', fontSize: '15px', color: hex(accent), fontStyle: 'bold',
      }).setOrigin(0.5));
    }
    const sign = this.add.container(x, y, [glow, panel, ...letters]).setScrollFactor(sf).setDepth(depth);
    const delay = Phaser.Math.Between(0, 1400); // stagger so nothing syncs

    if (style === 0) { // blink
      this.tweens.add({ targets: [...letters, glow], alpha: { from: 1, to: 0.12 }, duration: Phaser.Math.Between(500, 900), yoyo: true, repeat: -1, hold: Phaser.Math.Between(200, 600), delay });
    } else if (style === 1) { // sequential letter light-up
      letters.forEach((l) => l.setAlpha(0.18));
      let idx = 0;
      this.time.addEvent({ delay: 180, loop: true, startAt: delay, callback: () => {
        letters.forEach((l, i) => l.setAlpha(i === idx ? 1 : 0.18));
        idx = (idx + 1) % letters.length;
      } });
      this.tweens.add({ targets: glow, alpha: { from: 0.18, to: 0.06 }, duration: 700, yoyo: true, repeat: -1 });
    } else if (style === 2) { // flicker-buzz (rapid alpha jitter via a timer)
      this.time.addEvent({ delay: 70, loop: true, startAt: delay, callback: () => {
        const a = Phaser.Math.FloatBetween(0.45, 1);
        letters.forEach((l) => l.setAlpha(a));
        glow.setAlpha(a * 0.18);
      } });
    } else { // slow hue pulse (lerp text colour between accent and cyan)
      const from = Phaser.Display.Color.IntegerToColor(accent);
      const to = Phaser.Display.Color.IntegerToColor(PAL.NEON_CYAN);
      this.tweens.addCounter({ from: 0, to: 1, duration: Phaser.Math.Between(1600, 2600), yoyo: true, repeat: -1, delay, onUpdate: (tw) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tw.getValue() * 100);
        const col = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        letters.forEach((l) => l.setColor(hex(col)));
      } });
    }
    return sign;
  }

  // A vendor stall jutting from a tower: base + striped canopy + hanging lamp +
  // goods. If withPancake, adds a pancake-flipping vendor on a loop.
  makeVendor(x, y, withPancake) {
    const base = this.add.rectangle(0, 0, 70, 14, PAL.VENDOR_BODY, 1).setOrigin(0.5, 0);
    const canopy = this.add.rectangle(0, -34, 84, 12, PAL.CANOPY, 1).setOrigin(0.5, 0);
    const stripe = this.add.rectangle(0, -34, 84, 4, PAL.CANOPY_STRIPE, 1).setOrigin(0.5, 0);
    const goods = this.add.rectangle(-14, 0, 40, 8, PAL.GOODS, 0.9).setOrigin(0.5, 1);
    const lamp = this.add.rectangle(26, -20, 5, 8, PAL.LAMP_GLOW, 1).setOrigin(0.5, 0);
    const lampGlow = this.add.rectangle(28, -16, 16, 16, PAL.LAMP_GLOW, 0.18);
    const parts = [canopy, stripe, base, goods, lamp, lampGlow];

    if (withPancake) {
      const vendor = this.add.rectangle(8, -2, 12, 22, PAL.VENDOR_BODY, 1).setOrigin(0.5, 1);
      const pan = this.add.rectangle(-2, -18, 16, 3, PAL.CABLE, 1).setOrigin(0.5, 0.5);
      const cake = this.add.rectangle(-2, -20, 12, 5, PAL.PANCAKE, 1).setOrigin(0.5, 0.5);
      parts.push(vendor, pan, cake);
      // Loop: pancake arcs up + flips, falls back, brief randomised pause.
      this.tweens.add({
        targets: cake, y: -64, duration: 600, ease: 'Quad.easeOut', yoyo: true,
        hold: 40, repeat: -1, repeatDelay: Phaser.Math.Between(400, 1400),
        delay: Phaser.Math.Between(0, 1200),
      });
      this.tweens.add({
        targets: cake, angle: 360, duration: 1240, ease: 'Linear', repeat: -1,
        repeatDelay: Phaser.Math.Between(400, 1400), delay: Phaser.Math.Between(0, 1200),
      });
    }

    this.add.container(x, y, parts).setScrollFactor(0.7).setDepth(-7);
    // Lamp glow breathes.
    this.tweens.add({ targets: lampGlow, alpha: { from: 0.1, to: 0.26 }, duration: Phaser.Math.Between(900, 1500), yoyo: true, repeat: -1 });
  }

  // A sagging catenary cable + hanging items (lanterns glow). Gentle 1–2px sway.
  makeCable(x, y, sf, depth) {
    const span = Phaser.Math.Between(500, 1100);
    const sag = Phaser.Math.Between(30, 80);
    const g = this.add.graphics().setScrollFactor(sf).setDepth(depth);
    g.lineStyle(2, PAL.CABLE, 0.9);
    g.beginPath();
    g.moveTo(x, y);
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const cx = x + span * t;
      const cy = y + Math.sin(t * Math.PI) * sag;
      g.lineTo(cx, cy);
    }
    g.strokePath();
    this.tweens.add({ targets: g, y: '+=2', duration: Phaser.Math.Between(1800, 2800), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Hanging items along the cable.
    const items = Phaser.Math.Between(2, 4);
    for (let i = 0; i < items; i += 1) {
      const t = (i + 1) / (items + 1);
      const cx = x + span * t;
      const cy = y + Math.sin(t * Math.PI) * sag;
      const kind = Phaser.Math.Between(0, 2);
      if (kind === 0) { // lantern (glows)
        const lant = this.add.rectangle(cx, cy + 12, 8, 12, PAL.LANTERN, 0.95).setScrollFactor(sf).setDepth(depth);
        const lg = this.add.rectangle(cx, cy + 12, 18, 22, PAL.LANTERN, 0.12).setScrollFactor(sf).setDepth(depth - 0.1);
        this.tweens.add({ targets: [lant, lg], alpha: { from: 0.6, to: 1 }, duration: Phaser.Math.Between(1000, 1800), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 800) });
      } else if (kind === 1) { // laundry
        this.add.rectangle(cx, cy + 10, 10, 16, PAL.WINDOW_COOL, 0.5).setScrollFactor(sf).setDepth(depth);
      } else { // junction box
        this.add.rectangle(cx, cy + 6, 12, 10, PAL.JUNCTION, 1).setScrollFactor(sf).setDepth(depth);
      }
    }
  }

  // ---- Birds: a pool flown across the current view in groups on a timer ------
  buildBirds() {
    for (let i = 0; i < 8; i += 1) {
      const wingL = this.add.rectangle(-4, 0, 6, 2, PAL.BIRD, 1);
      const wingR = this.add.rectangle(4, 0, 6, 2, PAL.BIRD, 1);
      const bird = this.add.container(0, 0, [wingL, wingR]).setDepth(-10).setVisible(false).setActive(false);
      bird.wingL = wingL; bird.wingR = wingR;
      // Continuous flap (cheap; runs whether visible or not).
      this.tweens.add({ targets: [wingL, wingR], scaleY: { from: 1, to: 2.2 }, angle: { from: -8, to: 8 }, duration: Phaser.Math.Between(140, 220), yoyo: true, repeat: -1 });
      this.birds.push(bird);
    }
    this.time.addEvent({ delay: 4000, loop: true, callback: () => this.spawnBirdGroup() });
    this.time.delayedCall(1500, () => this.spawnBirdGroup());
  }

  spawnBirdGroup() {
    const cam = this.cameras.main;
    const free = this.birds.filter((b) => !b.active);
    if (free.length < 3) return;
    const n = Phaser.Math.Between(3, Math.min(5, free.length));
    const dir = Math.random() < 0.5 ? 1 : -1;
    const baseY = cam.scrollY + Phaser.Math.Between(40, this.scale.height - 80); // within the current view
    for (let i = 0; i < n; i += 1) {
      const b = free[i];
      const sf = Math.random() < 0.5 ? 0.4 : 0.7;
      b.setScrollFactor(sf).setDepth(sf < 0.5 ? -11 : -7.5);
      const y = baseY / sf + Phaser.Math.Between(-30, 30); // world y so it lands at baseY on screen
      const startX = dir > 0 ? -40 : W + 40;
      const endX = dir > 0 ? W + 60 : -60;
      b.setPosition(startX, y).setScale(dir, 1).setActive(true).setVisible(true);
      this.tweens.add({
        targets: b, x: endX, duration: Phaser.Math.Between(7000, 12000), ease: 'Linear',
        delay: i * Phaser.Math.Between(120, 300),
        // A gentle vertical drift over the crossing (finite — no leak on reuse).
        y: y + Phaser.Math.Between(-40, 40),
        onComplete: () => { b.setActive(false).setVisible(false); },
      });
    }
  }

  update(time, delta) {
    if (this.mKey && Phaser.Input.Keyboard.JustDown(this.mKey)) SFX.toggleMute();
    this.cameraController.update(this.player);
    this.player.update(time, delta);
    this.diegeticHUD.update(time, delta);
  }
}
