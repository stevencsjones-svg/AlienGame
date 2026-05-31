import { WORLD, VIEW } from '../constants.js';

// =============================================================================
// ParallaxBackground
// A fully procedural, 3-layer sci-fi alien city skyline. Each layer is drawn
// once onto a RenderTexture at startup, then scrolled horizontally each frame
// by offsetting its x position relative to the camera scroll.
//
// All three layers use a seeded RNG, so the city looks identical every run.
// Layers (and the fog band) render behind all gameplay objects.
// =============================================================================

const SEED = 1337;

// Each layer's RenderTexture is this tall. Buildings sit on a baseline at the
// bottom of the texture (RT-local y = RT_HEIGHT) and grow upward. The layer is
// positioned so that baseline aligns with the bottom of the viewport, which
// keeps all three layers' ground lines flush regardless of their height.
const RT_HEIGHT = 660;

// Furthest the main camera can scroll horizontally.
const SCROLL_MAX = WORLD.WIDTH - VIEW.WIDTH;

// --- Layer configs ----------------------------------------------------------
// Colours are the exact palette values requested, as 0xRRGGBB + alpha.
const LAYER_CONFIGS = [
  {
    // LAYER 1 — Far city (slowest)
    speed: 0.1,
    depth: -12,
    buildingColor: 0x0a1a0f,
    buildingAlpha: 0.4,
    wMin: 40, wMax: 120,
    hMin: 200, hMax: 600,
    gapMin: 10, gapMax: 30,
    windows: { chance: 0.5, countMin: 2, countMax: 4, color: 0x00ff88, alpha: 0.3 },
  },
  {
    // LAYER 2 — Mid city (medium)
    speed: 0.3,
    depth: -11,
    buildingColor: 0x0d2b1a,
    buildingAlpha: 0.6,
    wMin: 30, wMax: 90,
    hMin: 100, hMax: 400,
    gapMin: 10, gapMax: 25,
    windows: { chance: 0.85, countMin: 4, countMax: 8, color: 0x00ff88, alpha: 0.35 },
    neonStrip: { chance: 0.5, color: 0x00ff88, alpha: 0.5 },
    antenna: { chance: 0.4, color: 0xbf00ff, alpha: 0.4, hMin: 20, hMax: 50 },
  },
  {
    // LAYER 3 — Near city (fastest, most prominent)
    speed: 0.6,
    depth: -10,
    buildingColor: 0x071a0d,
    buildingAlpha: 0.85,
    wMin: 20, wMax: 60,
    hMin: 60, hMax: 200,
    gapMin: 30, gapMax: 60,
    glowTop: { chance: 0.6, color: 0x00ff88, alpha: 0.7 },
  },
];

export default class ParallaxBackground {
  constructor(scene) {
    this.scene = scene;

    // Simple seeded RNG (mulberry32) so the skyline is deterministic.
    let t = SEED >>> 0;
    this.rng = () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    this.layers = [];
    for (const cfg of LAYER_CONFIGS) {
      this.buildLayer(cfg);
    }

    this.createFog();
  }

  // --- RNG helpers ----------------------------------------------------------
  randRange(min, max) {
    return min + this.rng() * (max - min);
  }

  randInt(min, max) {
    return Math.floor(this.randRange(min, max + 1));
  }

  // --- Build one layer onto a RenderTexture ---------------------------------
  buildLayer(cfg) {
    // The layer scrolls at cfg.speed, so it only needs to be wide enough to
    // cover every camera position (plus a small margin to avoid pop-in).
    const width = Math.ceil(SCROLL_MAX * cfg.speed + VIEW.WIDTH) + 200;
    const baseline = RT_HEIGHT;

    // Draw into an off-screen Graphics, then stamp it onto the RenderTexture.
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    let x = 0;
    while (x < width) {
      const bw = this.randRange(cfg.wMin, cfg.wMax);
      const bh = this.randRange(cfg.hMin, cfg.hMax);
      const top = baseline - bh;

      // Building body.
      g.fillStyle(cfg.buildingColor, cfg.buildingAlpha);
      g.fillRect(x, top, bw, bh);

      // Windows (small lit squares on the face).
      if (cfg.windows && this.rng() < cfg.windows.chance && bw > 14 && bh > 18) {
        const n = this.randInt(cfg.windows.countMin, cfg.windows.countMax);
        g.fillStyle(cfg.windows.color, cfg.windows.alpha);
        for (let i = 0; i < n; i++) {
          const wx = x + 4 + this.rng() * (bw - 12);
          const wy = top + 6 + this.rng() * (bh - 14);
          g.fillRect(Math.floor(wx), Math.floor(wy), 4, 4);
        }
      }

      // Rooftop neon strip near the top.
      if (cfg.neonStrip && this.rng() < cfg.neonStrip.chance && bw > 6) {
        g.fillStyle(cfg.neonStrip.color, cfg.neonStrip.alpha);
        g.fillRect(x + 2, top + 4, bw - 4, 2);
      }

      // Glowing top edge (foreground silhouettes).
      if (cfg.glowTop && this.rng() < cfg.glowTop.chance) {
        g.fillStyle(cfg.glowTop.color, cfg.glowTop.alpha);
        g.fillRect(x, top, bw, 2);
      }

      // Vertical antenna on top of some buildings.
      if (cfg.antenna && this.rng() < cfg.antenna.chance) {
        const ah = this.randRange(cfg.antenna.hMin, cfg.antenna.hMax);
        g.fillStyle(cfg.antenna.color, cfg.antenna.alpha);
        g.fillRect(x + bw / 2 - 1, top - ah, 2, ah);
      }

      x += bw + this.randRange(cfg.gapMin, cfg.gapMax);
    }

    // Stamp the Graphics onto a RenderTexture and discard the Graphics.
    const rt = this.scene.add
      .renderTexture(0, 0, width, RT_HEIGHT)
      .setOrigin(0, 0);
    rt.draw(g, 0, 0);
    g.destroy();

    // Manual parallax: disable Phaser's own scroll, we move it ourselves.
    const baseY = VIEW.HEIGHT - RT_HEIGHT; // baseline flush with viewport bottom
    rt.setScrollFactor(0).setDepth(cfg.depth);
    rt.x = 0;
    rt.y = baseY;

    // Micro-motion: a slow vertical "breathing" drift per layer. Derived from
    // the layer index (not the shared RNG) so the baked city layout is unchanged.
    const idx = this.layers.length;
    this.layers.push({
      rt,
      speed: cfg.speed,
      baseY,
      driftAmp: 1.5 + idx * 0.5,        // 1.5 / 2.0 / 2.5 px
      driftPeriod: 20000 - idx * 4000,  // 20s / 16s / 12s
      driftPhase: idx * 2.1,
    });
  }

  // --- Fixed screen-space fog band ------------------------------------------
  createFog() {
    // A subtle horizontal haze across the middle of the screen. Fixed in
    // screen space (scrollFactor 0); sits above the city, behind gameplay.
    this.fog = this.scene.add
      .rectangle(VIEW.WIDTH / 2, 400, VIEW.WIDTH, 120, 0x00ff88, 0.04)
      .setScrollFactor(0)
      .setDepth(-9);
  }

  // --- Per-frame scroll + breathing drift -----------------------------------
  update() {
    const cam = this.scene.cameras.main;
    const t = this.scene.time.now;
    for (const layer of this.layers) {
      layer.rt.x = -cam.scrollX * layer.speed;
      layer.rt.y = layer.baseY
        + layer.driftAmp * Math.sin((t / layer.driftPeriod) * Math.PI * 2 + layer.driftPhase);
    }
  }
}
