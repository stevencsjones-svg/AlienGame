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

// Level 1 "Alien Jade" defaults — used when no palette is passed, so the
// background is reusable across levels by passing a palette config.
const DEFAULT_PALETTE = {
  layer1: { fill: 0x0a1a0f, opacity: 0.4 },
  layer2: { fill: 0x0d2b1a, opacity: 0.6 },
  layer3: { fill: 0x071a0d, opacity: 0.85 },
  fog: { fill: 0x00ff88, opacity: 0.04 },
};

// Accept either a number (0xRRGGBB) or a '#rrggbb' string.
function toColor(c, fallback) {
  if (c === undefined || c === null) return fallback;
  return typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
}

export default class ParallaxBackground {
  constructor(scene, palette) {
    this.scene = scene;
    this.palette = ParallaxBackground.resolvePalette(palette);

    // Simple seeded RNG (mulberry32) so the skyline is deterministic.
    let t = SEED >>> 0;
    this.rng = () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    this.theme = this.palette.theme;
    this.worldWidth = this.palette.worldWidth;

    this.layers = [];
    if (this.theme === 'deepCity') {
      this.buildDeepCity();
    } else {
      LAYER_CONFIGS.forEach((cfg, i) => this.buildLayer(cfg, i));
      this.createFog();
    }
  }

  // Merge a (possibly partial) palette config over the Level 1 defaults.
  static resolvePalette(p) {
    const d = DEFAULT_PALETTE;
    const lyr = (key) => ({
      fill: toColor(p && p[key] && p[key].fill, d[key].fill),
      opacity: (p && p[key] && p[key].opacity != null) ? p[key].opacity : d[key].opacity,
    });
    return {
      layers: [lyr('layer1'), lyr('layer2'), lyr('layer3')],
      fog: lyr('fog'),
      theme: (p && p.theme) || 'city',
      worldWidth: (p && p.worldWidth) || WORLD.WIDTH,
    };
  }

  // --- RNG helpers ----------------------------------------------------------
  randRange(min, max) {
    return min + this.rng() * (max - min);
  }

  randInt(min, max) {
    return Math.floor(this.randRange(min, max + 1));
  }

  // --- Build one layer onto a RenderTexture ---------------------------------
  buildLayer(cfg, index) {
    // The layer scrolls at cfg.speed, so it only needs to be wide enough to
    // cover every camera position (plus a small margin to avoid pop-in).
    const width = Math.ceil(SCROLL_MAX * cfg.speed + VIEW.WIDTH) + 200;
    const baseline = RT_HEIGHT;
    const pal = this.palette.layers[index]; // fill + opacity from the palette

    // Draw into an off-screen Graphics, then stamp it onto the RenderTexture.
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    let x = 0;
    while (x < width) {
      const bw = this.randRange(cfg.wMin, cfg.wMax);
      const bh = this.randRange(cfg.hMin, cfg.hMax);
      const top = baseline - bh;

      // Building body.
      g.fillStyle(pal.fill, pal.opacity);
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
      .rectangle(VIEW.WIDTH / 2, 400, VIEW.WIDTH, 120, this.palette.fog.fill, this.palette.fog.opacity)
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
    if (this.theme === 'deepCity') this.updateDeepCity();
  }

  // ===========================================================================
  // BIOLUMINESCENT DEEP CITY THEME
  // Organic alien growth colonising buried infrastructure. Three parallax
  // layers (pipes/roots → membranes/fungus → near silhouettes/veins), a
  // vertical fog gradient, rising spores, slow drips, and a depth-based tint.
  // ===========================================================================
  buildDeepCity() {
    // Layers (speed, depth, draw routine) — slowest/furthest first.
    this.buildDeepLayer(0.08, -12, (g, w) => this.drawDeepInfra(g, w));
    this.buildDeepLayer(0.25, -11, (g, w) => this.drawMidInfra(g, w));
    this.buildDeepLayer(0.55, -10, (g, w) => this.drawNearOrganic(g, w));

    this.buildVerticalFog();
    this.buildSpores();
    this.buildDrips();
    this.buildDepthTint();
  }

  // Build one organic parallax layer onto a RenderTexture (mirrors buildLayer's
  // positioning, but with a custom draw routine and world-width-aware sizing).
  buildDeepLayer(speed, depth, drawFn) {
    const scrollMax = Math.max(0, this.worldWidth - VIEW.WIDTH);
    const width = Math.ceil(scrollMax * speed + VIEW.WIDTH) + 200;

    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    drawFn(g, width);

    const rt = this.scene.add.renderTexture(0, 0, width, RT_HEIGHT).setOrigin(0, 0);
    rt.draw(g, 0, 0);
    g.destroy();

    const baseY = VIEW.HEIGHT - RT_HEIGHT;
    rt.setScrollFactor(0).setDepth(depth);
    rt.x = 0;
    rt.y = baseY;

    const idx = this.layers.length;
    this.layers.push({
      rt,
      speed,
      baseY,
      driftAmp: 1.5 + idx * 0.5,
      driftPeriod: 20000 - idx * 4000,
      driftPhase: idx * 2.1,
    });
  }

  // Layer 1 — deep infrastructure: pipe networks + alien root systems.
  drawDeepInfra(g, width) {
    const base = RT_HEIGHT;
    let x = 0;
    while (x < width) {
      const pw = this.randRange(200, 600);
      const ph = this.randRange(8, 16);
      const py = this.randRange(40, base - 40);

      // Horizontal pipe (occasionally a glowing bio-fluid line).
      const glow = this.rng() < 0.18;
      g.fillStyle(glow ? 0x00cc66 : 0x003322, glow ? 0.15 : 0.5);
      g.fillRect(x, py, pw, ph);

      // Joint where pipes meet.
      const jx = x + pw - 10;
      g.fillStyle(0x004433, 0.6);
      g.fillRect(jx, py - 4, 20, 20);

      // Vertical pipe dropping/rising from the joint.
      if (this.rng() < 0.6) {
        const vh = this.randRange(100, 400);
        const vw = this.randRange(6, 12);
        const up = this.rng() < 0.5;
        g.fillStyle(0x003322, 0.5);
        g.fillRect(jx + 6, up ? py - vh : py, vw, vh);
      }

      // Alien roots clustered near the joint (thin diagonals).
      const nRoots = this.randInt(2, 4);
      for (let i = 0; i < nRoots; i++) {
        const rx = jx + this.randRange(-30, 30);
        const ry = py + this.randRange(-20, 20);
        const ang = this.randRange(Math.PI / 6, Math.PI / 3) * (this.rng() < 0.5 ? 1 : -1);
        const len = this.randRange(80, 200);
        g.lineStyle(this.randRange(1, 2), 0x002211, 0.4);
        g.lineBetween(rx, ry, rx + Math.cos(ang) * len, ry + Math.sin(ang) * len);
      }

      x += pw + this.randRange(40, 160);
    }
  }

  // Layer 2 — mid infrastructure: membrane walls, fungal columns, drip trails.
  drawMidInfra(g, width) {
    const base = RT_HEIGHT;
    let x = 0;
    while (x < width) {
      const mw = this.randRange(80, 200);
      const mh = this.randRange(40, 100);
      const my = this.randRange(40, base - mh - 20);
      const ang = this.randRange(-0.3, 0.3);

      // Membrane wall (rotated rect) with a faint inner glow.
      g.fillStyle(0x004422, 0.55);
      g.fillPoints(rotRect(x + mw / 2, my + mh / 2, mw, mh, ang), true);
      if (this.rng() < 0.5) {
        g.fillStyle(0x00cc66, 0.08);
        g.fillPoints(rotRect(x + mw / 2, my + mh / 2, mw * 0.6, mh * 0.6, ang), true);
      }

      // Fungal column anchored to the baseline, topped with a cap.
      if (this.rng() < 0.6) {
        const cw = this.randRange(12, 24);
        const ch = this.randRange(60, 180);
        const cx = x + this.randRange(0, Math.max(0, mw - cw));
        const top = base - ch;
        g.fillStyle(0x003318, 0.7);
        g.fillRect(cx, top, cw, ch);
        const glowCap = this.rng() < 0.3;
        g.fillStyle(glowCap ? 0x00ff88 : 0x005522, glowCap ? 0.2 : 0.8);
        g.fillEllipse(cx + cw / 2, top, cw, this.randRange(8, 12));
      }

      x += mw + this.randRange(30, 120);
    }

    // Permanent drip trails (~1 per 600px).
    const nTrails = Math.max(8, Math.floor(width / 600));
    for (let i = 0; i < nTrails; i++) {
      const tx = this.randRange(0, width);
      const ty = this.randRange(30, base - 80);
      const tl = this.randRange(20, 60);
      g.lineStyle(2, 0x00cc66, 0.12);
      g.lineBetween(tx, ty, tx, ty + tl);
    }
  }

  // Layer 3 — near organic silhouettes + bioluminescent veins.
  drawNearOrganic(g, width) {
    const base = RT_HEIGHT;
    let x = 0;
    while (x < width) {
      const clusterW = this.randRange(60, 140);
      const nB = this.randInt(2, 3);
      let minx = x + clusterW;
      let maxx = x;
      let topmost = base;

      // 2–3 overlapping rects form a non-rectangular blob.
      for (let i = 0; i < nB; i++) {
        const bw = this.randRange(clusterW * 0.5, clusterW);
        const bh = this.randRange(80, 220);
        const bx = x + this.randRange(0, Math.max(0, clusterW - bw * 0.5));
        const btop = base - bh - this.randRange(0, 40);
        g.fillStyle(0x020a06, 0.92);
        g.fillRect(bx, btop, bw, bh);
        minx = Math.min(minx, bx);
        maxx = Math.max(maxx, bx + bw);
        topmost = Math.min(topmost, btop);
      }

      // Veins running across the silhouette.
      const nV = this.randInt(3, 6);
      g.lineStyle(1, 0x00cc66, 0.18);
      for (let i = 0; i < nV; i++) {
        const vx = this.randRange(minx, maxx);
        const vy = this.randRange(topmost, base);
        const ang = this.randRange(Math.PI / 6, Math.PI / 3) * (this.rng() < 0.5 ? 1 : -1);
        const len = this.randRange(40, 120);
        g.lineBetween(vx, vy, vx + Math.cos(ang) * len, vy + Math.sin(ang) * len);
      }

      x += clusterW + this.randRange(20, 80);
    }
  }

  // Vertical fog gradient (fixed to screen): darker near the floor.
  buildVerticalFog() {
    this.fogTop = this.scene.add.rectangle(0, 0, VIEW.WIDTH, 80, 0x001a0d, 0.08)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-9);
    this.fogBottom = this.scene.add.rectangle(0, 0, VIEW.WIDTH, 120, 0x001a0d, 0.18)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-9);
  }

  // Slow rising spore particles (suggests a living environment).
  buildSpores() {
    this.spores = [];
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    for (let i = 0; i < 40; i++) {
      const s = this.scene.add.rectangle(this.rng() * sw, this.rng() * sh, 1, 1, 0x00cc66, 0.1)
        .setScrollFactor(0).setDepth(-8);
      s.vy = this.randRange(3, 8);
      this.spores.push(s);
    }
  }

  // A few slow drips that fall and fade (pure visual).
  buildDrips() {
    this.drips = [];
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    for (let i = 0; i < 12; i++) {
      const d = this.scene.add.rectangle(this.rng() * sw, this.rng() * sh * 0.6, 2, 4, 0x00cc66, 0)
        .setScrollFactor(0).setDepth(-8);
      d.t = this.rng() * 4000;
      d.y0 = d.y;
      this.drips.push(d);
    }
  }

  // Depth-based colour-temperature tint (fixed to screen).
  buildDepthTint() {
    this.depthTint = this.scene.add.rectangle(0, 0, VIEW.WIDTH, VIEW.HEIGHT, 0x002233, 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-8.5);
    this._tintA = 0;
  }

  updateDeepCity() {
    const cam = this.scene.cameras.main;
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    const delta = this.scene.game.loop.delta || 16;

    // Fog tracks the viewport (RESIZE-safe).
    this.fogTop.setSize(sw, 80); this.fogTop.x = 0; this.fogTop.y = 0;
    this.fogBottom.setSize(sw, 120); this.fogBottom.x = 0; this.fogBottom.y = sh - 120;

    // Spores rise; respawn at the bottom.
    for (const s of this.spores) {
      s.y -= s.vy * (delta / 1000);
      if (s.y < 0) { s.y = sh; s.x = this.rng() * sw; }
    }

    // Drips fall then fade, then re-seed.
    for (const d of this.drips) {
      d.t += delta;
      const cycle = 4000;
      if (d.t >= cycle) { d.t -= cycle; d.x = this.rng() * sw; d.y0 = this.rng() * sh * 0.6; }
      const ph = d.t / cycle;
      if (ph < 0.3) { const k = ph / 0.3; d.y = d.y0 + k * 30; d.setAlpha(0.12 * (1 - k)); } else { d.setAlpha(0); }
    }

    // Depth tint by camera centre Y.
    const cy = cam.scrollY + cam.height / 2;
    let color = 0x002233;
    let targetA = 0;
    if (cy < 1000) { targetA = 0; } else if (cy < 3000) { color = 0x002233; targetA = 0.05; } else if (cy < 5600) { color = 0x001122; targetA = 0.12; } else { color = 0x003322; targetA = 0.08; }
    this._tintA += (targetA - this._tintA) * 0.05;
    this.depthTint.setSize(sw, sh);
    this.depthTint.setFillStyle(color, this._tintA);
  }
}

// Corners of a rectangle rotated about its centre (for membrane polygons).
function rotRect(cx, cy, w, h, angle) {
  const hw = w / 2;
  const hh = h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }));
}
