// =============================================================================
// GlassTierBackground — Level 5 (The Glass Tier) parallax backdrop.
//
// Three layer depths, violet corporate-glass palette. All elements are placed
// within each layer's effective x/y span (camMax * sf + viewport) so they are
// always reachable by the camera — the "flat void" fix from Level 4.
//
// Tween-driven. No update() needed; just construct in Level5.create() before
// platforms.
// =============================================================================

const PAL = {
  BG:      0x07060f, // near-black violet bg
  FAR_SLAB: 0x110a2a,
  MID_SLAB: 0x1a1040,
  MID_GLASS: 0x2a1a60,
  NEAR_GLASS: 0x3322aa,
  NEAR_REFLECT: 0x5544cc,
  GRID:    0x221a55,
  WINDOW:  0x9988ff,
  CAM_SEC: 0x331a66,
  DATA_TEXT: '#7766ee',
};

// Data readout fragments (scrolling text in near layer)
const DATA_GLYPHS = [
  'TIER5//ACCESS', 'AUDIT: ON', 'MOTION: DETECTED', 'CLEARANCE: 0',
  'EXECUTIVE.FLOOR', 'BIOMETRICS.FAIL', 'SYS://OVERRIDE', 'SEC.CAM.03',
  'PROTOCOL: DELTA', 'GLASS.BREACH=0', 'MGMT.NODE.7', '//REDACTED//',
  'AUTH.EXPIRED', 'PERIMETER.FAIL', 'LOG:ANOMALY', 'ID.UNKNOWN',
];

export default class GlassTierBackground {
  constructor(scene, W, H) {
    const vw = scene.scale.width;
    const vh = scene.scale.height;
    const camMaxX = W - vw;
    const camMaxY = H - vh;

    // Effective spans per layer (see Level 4 span-compression comments)
    const sfA = 0.10; const spanAX = camMaxX * sfA + vw; const spanAY = camMaxY * sfA + vh;
    const sfB = 0.35; const spanBX = camMaxX * sfB + vw; const spanBY = camMaxY * sfB + vh;
    const sfC = 0.65; const spanCX = camMaxX * sfC + vw; const spanCY = camMaxY * sfC + vh;

    this._buildFar(scene, spanAX, spanAY, sfA);
    this._buildMid(scene, spanBX, spanBY, sfB);
    this._buildNear(scene, spanCX, spanCY, sfC);
  }

  // ---- Far layer (sf=0.10): dark violet skyline + grid ----------------------
  _buildFar(scene, spanX, spanY, sf) {
    // Deep violet background wash
    scene.add.rectangle(spanX / 2, spanY / 2, spanX + 200, spanY + 200, PAL.BG, 1)
      .setScrollFactor(sf).setDepth(-22);

    // Subtle grid of horizontal lines (floor plates of distant towers)
    const gridLines = 18;
    for (let i = 0; i < gridLines; i++) {
      const y = (spanY / gridLines) * (i + 0.5);
      scene.add.rectangle(spanX / 2, y, spanX, 1, PAL.GRID, 0.18)
        .setScrollFactor(sf).setDepth(-21.8);
    }

    // Corporate tower silhouettes — varied height, dark slab style
    const towerCount = Math.ceil(spanX / 120);
    for (let i = 0; i < towerCount; i++) {
      const x = (spanX / towerCount) * (i + 0.5) + (((i * 37) % 80) - 40);
      const w = 60 + ((i * 53) % 80);
      const h = spanY * (0.25 + ((i * 71) % 100) / 200); // 25–75% of spanY
      const top = spanY - h;
      scene.add.rectangle(x, spanY - h / 2, w, h, PAL.FAR_SLAB, 1)
        .setScrollFactor(sf).setDepth(-21.5);
      // Distant lit windows (tiny dots, 10% chance per floor)
      const floors = Math.floor(h / 40);
      for (let f = 0; f < floors; f++) {
        if ((i * 13 + f * 7) % 10 < 2) {
          scene.add.rectangle(
            x + (((i + f) * 23) % (w - 12)) - (w / 2) + 6,
            top + f * 40 + 16,
            4, 6, PAL.WINDOW, 0.55,
          ).setScrollFactor(sf).setDepth(-21.4);
        }
      }
    }

    // Distant grid-light horizon line
    scene.add.rectangle(spanX / 2, spanY * 0.82, spanX, 2, PAL.NEAR_REFLECT, 0.12)
      .setScrollFactor(sf).setDepth(-21.3);
  }

  // ---- Mid layer (sf=0.35): glass curtain-wall floor plates ----------------
  _buildMid(scene, spanX, spanY, sf) {
    // Floor-plate bands: large translucent blue-violet rectangles
    // representing structural glass floors of a supertall building.
    const floorH    = 80;
    const floorGap  = 140;
    const floorCount = Math.ceil(spanY / (floorH + floorGap)) + 2;

    for (let i = 0; i < floorCount; i++) {
      const y = i * (floorH + floorGap) + 20;
      const plate = scene.add.rectangle(spanX / 2, y, spanX + 60, floorH, PAL.MID_GLASS, 0.07)
        .setScrollFactor(sf).setDepth(-20.5);
      // Edge highlight on each floor plate
      scene.add.rectangle(spanX / 2, y - floorH / 2, spanX + 60, 2, PAL.NEAR_REFLECT, 0.25)
        .setScrollFactor(sf).setDepth(-20.4);

      // Slow vertical drift tween (simulates the player "rising" through floors)
      const driftOffset = (i % 2 === 0) ? 12 : -12;
      scene.tweens.add({
        targets: plate,
        y: y + driftOffset,
        duration: 8000 + (i % 4) * 1500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // Structural columns (vertical glass pillars)
    const colCount = Math.ceil(spanX / 220);
    for (let i = 0; i < colCount; i++) {
      const x = (spanX / colCount) * (i + 0.5);
      scene.add.rectangle(x, spanY / 2, 14, spanY + 100, PAL.MID_SLAB, 0.55)
        .setScrollFactor(sf).setDepth(-20.3);
      // Column edge highlight
      scene.add.rectangle(x + 7, spanY / 2, 2, spanY + 100, PAL.NEAR_REFLECT, 0.18)
        .setScrollFactor(sf).setDepth(-20.2);
    }
  }

  // ---- Near layer (sf=0.65): glass panels + reflections + data + cameras ---
  _buildNear(scene, spanX, spanY, sf) {
    // Large foreground glass panels (partially transparent overlapping sheets)
    const panelCount = Math.ceil(spanX / 320) + 2;
    for (let i = 0; i < panelCount; i++) {
      const x = (spanX / panelCount) * i + 40;
      const w = 180 + ((i * 67) % 120);
      const h = spanY * (0.4 + ((i * 43) % 100) / 250);
      const top = ((i * 71) % 100) / 100 * (spanY - h);
      scene.add.rectangle(x, top + h / 2, w, h, PAL.NEAR_GLASS, 0.06)
        .setScrollFactor(sf).setDepth(-18.5);
      // Diagonal reflection highlight (a thin angled line on each panel)
      const rx = x - w / 2 + w * 0.25;
      const ry = top + h * 0.15;
      scene.add.rectangle(rx, ry, 3, h * 0.5, PAL.NEAR_REFLECT, 0.35)
        .setAngle(-15)
        .setScrollFactor(sf).setDepth(-18.4);
    }

    // Security camera silhouettes (wall-mounted, scattered)
    const camCount = Math.ceil(spanX / 600) + 1;
    for (let i = 0; i < camCount; i++) {
      const cx = (spanX / camCount) * (i + 0.5) + ((i * 113) % 150) - 75;
      const cy = spanY * (0.15 + ((i * 83) % 100) / 200);
      this._drawCamera(scene, cx, cy, sf);
    }

    // Scrolling data readouts (small monospace text fragments drifting upward)
    const readoutCount = Math.ceil(spanX / 280) + 2;
    for (let i = 0; i < readoutCount; i++) {
      const x = (spanX / readoutCount) * i + 30 + ((i * 47) % 60);
      const y = spanY * (0.25 + ((i * 61) % 100) / 200);
      const label = DATA_GLYPHS[i % DATA_GLYPHS.length];
      const t = scene.add.text(x, y, label, {
        fontFamily: 'monospace', fontSize: '8px', color: PAL.DATA_TEXT,
      }).setScrollFactor(sf).setDepth(-18).setAlpha(0.25);
      // Each readout slowly fades in/out with a different period
      scene.tweens.add({
        targets: t,
        alpha: { from: 0.05, to: 0.30 },
        duration: 3000 + (i % 5) * 800,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: i * 200,
      });
      // Slow upward drift
      scene.tweens.add({
        targets: t, y: y - 80,
        duration: 14000 + (i % 4) * 2000,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  // Tiny security camera glyph (body + lens cone + mount bracket)
  _drawCamera(scene, x, y, sf) {
    const g = scene.add.graphics().setScrollFactor(sf).setDepth(-18.2);
    g.fillStyle(PAL.CAM_SEC, 0.65);
    g.fillRect(x - 10, y - 5, 20, 10);  // body
    g.fillTriangle(x + 10, y - 5, x + 10, y + 5, x + 22, y); // lens cone
    g.fillRect(x - 2, y + 5, 4, 10);    // mount bracket
    g.lineStyle(1, PAL.NEAR_REFLECT, 0.4);
    g.strokeRect(x - 10, y - 5, 20, 10);
    // Blinking red LED (slight alpha pulse)
    const led = scene.add.circle(x + 6, y - 3, 2, 0xff2244, 0.9)
      .setScrollFactor(sf).setDepth(-18.1);
    scene.tweens.add({
      targets: led, alpha: { from: 0.1, to: 0.9 },
      duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      delay: Math.floor(x) % 600,
    });
  }
}
