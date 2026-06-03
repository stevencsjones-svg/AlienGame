// UndergroundAtmosphere.js
// Atmospheric background elements layered on top of the bioluminescent deep-city
// parallax in Level 2. All elements render behind platforms and entities (depth < 0).
// Instantiate in Level2.create(); call update(time, delta) every frame.

const WORLD_W = 14000;
const WORLD_H = 6000;
const VIEW_W = 960;
const VIEW_H = 540;

// S1+2 expected camera scrollY when player is on the floor (y≈580).
// Used to compute world-space positions for parallax elements so they
// appear at the visual ceiling of whichever section they belong to.
const CAM_Y_S12 = 310;   // player y 580 − VIEW_H/2
const CAM_Y_S4  = 5310;  // player y 5580 − VIEW_H/2

// Seeded RNG (mulberry32) — deterministic layout every run.
function makeRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rb(rng, min, max) { return min + rng() * (max - min); }

// ===========================================================================
// Bat cluster positions [x, section] where section is 's12' or 's4'.
// S1+2 clusters: use worldY ≈ CAM_Y_S12*0.5 + 60–120 = 215–275
//   → appear at screen y 60–120 when cam.scrollY ≈ CAM_Y_S12
// S4 clusters:   use worldY ≈ CAM_Y_S4*0.5 + 60–120 = 2715–2775
//   → appear at screen y 60–120 when cam.scrollY ≈ CAM_Y_S4
// ===========================================================================
const BAT_CLUSTERS = [
  { x: 600,  section: 's12' },
  { x: 1400, section: 's12' },
  { x: 2200, section: 's12' },
  { x: 2800, section: 's12' },
  { x: 3600, section: 's12' },
  { x: 4200, section: 's12' },
  { x: 5000, section: 's4'  },
  { x: 6400, section: 's4'  },
];

export default class UndergroundAtmosphere {
  constructor(scene) {
    this.scene = scene;

    this.batClusters = [];
    this.rocks = [];
    this.rockTimer = 0;
    this.rockInterval = 800 + Math.random() * 800;
    this.drips = [];
    this.dustParticles = [];
    this.dustTimer = 0;
    this.pools = [];

    this._createStalactites();
    this._createFloorPools();
    this._createWallDrips();
    this._createBatClusters();
  }

  // ===========================================================================
  // ELEMENT 5 — CEILING STALACTITES (static, world-space SF=1.0, depth -7)
  //
  // Two groups placed at the VISIBLE ceiling for each horizontal section:
  //   S1+2: topY ≈ CAM_Y_S12  (camera top when player is on the S1+2 floor)
  //   S4:   topY ≈ CAM_Y_S4   (camera top when player is on the S4 deep floor)
  // ===========================================================================
  _createStalactites() {
    const rng = makeRng(0xCAFE1);
    const color = 0x020605;
    const alpha = 0.95;

    const addRect = (cx, topY, w, h) =>
      this.scene.add.rectangle(cx, topY + h / 2, w, h, color, alpha)
        .setDepth(-7).setScrollFactor(1);

    // --- 25 stalactites in S1+2 (avoid the shaft corridors x 800–1600 and x 7600–8400) ---
    const s12Count = 25;
    const s12XRanges = [[200, 780], [1620, 7550]]; // skip ascent shaft x range
    const s12TotalW = (780 - 200) + (7550 - 1620);
    let s12LastX = -999;
    for (let i = 0; i < s12Count; i++) {
      let rawX = i * (s12TotalW / s12Count) + rb(rng, 0, s12TotalW / s12Count);
      // Map rawX through the two sub-ranges.
      let wx;
      const r0w = 780 - 200;
      if (rawX < r0w) {
        wx = 200 + rawX;
      } else {
        wx = 1620 + (rawX - r0w);
      }
      if (wx - s12LastX < 200) wx = s12LastX + 200;
      s12LastX = wx;
      this._addStalactite(addRect, rng, wx, CAM_Y_S12 + rb(rng, 0, 30));
    }

    // --- 15 stalactites in S4 deep (x 1200–7600) ---
    const s4Count = 15;
    const s4Seg = (7600 - 1200) / s4Count;
    let s4LastX = -999;
    for (let i = 0; i < s4Count; i++) {
      let wx = 1200 + i * s4Seg + rb(rng, 20, s4Seg - 20);
      if (wx - s4LastX < 200) wx = s4LastX + 200;
      s4LastX = wx;
      this._addStalactite(addRect, rng, wx, CAM_Y_S4 + rb(rng, 0, 30));
    }
  }

  _addStalactite(addRect, rng, x, topY) {
    const baseW = rb(rng, 12, 24);
    const baseH = rb(rng, 8,  16);
    const midW  = rb(rng, 8,  14);
    const midH  = rb(rng, 10, 20);
    const tipH  = rb(rng, 12, 24);
    const tipW  = rb(rng, 4,  6);
    const sm    = rb(rng, -3, 3);   // horizontal stagger mid
    const st    = rb(rng, -2, 4);   // horizontal stagger tip
    addRect(x,      topY,           baseW, baseH);
    addRect(x + sm, topY + baseH,   midW,  midH);
    addRect(x + st, topY + baseH + midH, tipW, tipH);
  }

  // ===========================================================================
  // ELEMENT 6 — BIOLUMINESCENT FLOOR POOLS (animated, world-space, depth -6.5)
  // ===========================================================================
  _createFloorPools() {
    const rng = makeRng(0xB001);

    // 12 pools at S4 deep floor, 6 pools at S1+2 floor.
    const defs = [];
    for (let i = 0; i < 12; i++) defs.push({ x: rb(rng, 800, 7400), y: rb(rng, 5638, 5650) });
    for (let i = 0; i < 6;  i++) defs.push({ x: rb(rng, 300, 7200), y: rb(rng, 638,  650)  });

    for (const d of defs) {
      const pw = rb(rng, 40, 80);
      const ph = rb(rng, 6, 10);
      // Use thin rectangles instead of ellipses for maximum compatibility.
      const outer = this.scene.add.rectangle(d.x, d.y, pw, ph, 0x00cc66, 0.08)
        .setDepth(-6.5).setScrollFactor(1);
      const inner = this.scene.add.rectangle(d.x, d.y, pw * 0.4, ph * 0.4, 0x00ff88, 0.12)
        .setDepth(-6.4).setScrollFactor(1);
      this.pools.push({
        outer, inner,
        period: rb(rng, 3000, 6000),
        phase: rng() * Math.PI * 2,
      });
    }
  }

  // ===========================================================================
  // ELEMENT 3 — WALL DRIPS (animated droplets, SF=0.25, depth -6)
  // ===========================================================================
  _createWallDrips() {
    const rng = makeRng(0xD21A);
    for (let i = 0; i < 15; i++) {
      const wx = rb(rng, 100, WORLD_W - 100);
      const wy = rb(rng, 120, WORLD_H - 600);
      const th = rb(rng, 20, 40);

      const trail = this.scene.add.rectangle(wx, wy + th / 2, 1, th, 0x00cc66, 0.12)
        .setDepth(-6).setScrollFactor(0.25);
      const droplet = this.scene.add.rectangle(wx, wy + th, 2, 2, 0x00cc66, 0)
        .setDepth(-5.9).setScrollFactor(0.25);
      const splash = this.scene.add.rectangle(wx, wy + th + 50, 6, 2, 0x00cc66, 0)
        .setDepth(-5.9).setScrollFactor(0.25);

      this.drips.push({
        trail, droplet, splash,
        trailBottom: wy + th,
        timer: rb(rng, 0, 6000),
        interval: rb(rng, 4000, 8000),
        falling: false,
        fallElapsed: 0,
      });
    }
  }

  // ===========================================================================
  // ELEMENT 1 — CAVE BAT CLUSTERS (scatter trigger, SF=0.5, depth -4.5)
  //
  // World Y is chosen so bats appear at screen y 60–120 from the camera top
  // of their target section:
  //   S1+2: worldY = CAM_Y_S12 * 0.5 + 60–120  (≈ 215–275)
  //   S4:   worldY = CAM_Y_S4  * 0.5 + 60–120  (≈ 2715–2775)
  // ===========================================================================
  _createBatClusters() {
    for (const def of BAT_CLUSTERS) {
      const screenYOffset = 60 + Math.random() * 60;  // 60–120 px from screen top
      const halfCamY = (def.section === 's4' ? CAM_Y_S4 : CAM_Y_S12) * 0.5;
      const cy = halfCamY + screenYOffset;

      const batCount = 4 + Math.floor(Math.random() * 5);
      const bats = [];
      for (let i = 0; i < batCount; i++) {
        const bx = def.x + (Math.random() - 0.5) * 80;
        const by = cy   + (Math.random() - 0.5) * 30;
        const lw = this.scene.add.rectangle(bx - 3, by + 1, 8, 3, 0x330044, 0.65)
          .setAngle(-15).setDepth(-4.5).setScrollFactor(0.5);
        const rw = this.scene.add.rectangle(bx + 3, by + 1, 8, 3, 0x330044, 0.65)
          .setAngle(15).setDepth(-4.5).setScrollFactor(0.5);
        const eye = this.scene.add.rectangle(bx, by - 2, 2, 2, 0xcc00ff, 0.4)
          .setDepth(-4.4).setScrollFactor(0.5);
        bats.push({
          baseX: bx, baseY: by,
          lw, rw, eye,
          swayPeriod: 2000 + Math.random() * 1000,
          swayPhase:  Math.random() * Math.PI * 2,
          state: 'hanging', // 'hanging' | 'scattering' | 'fading' | 'done'
          vx: 0, vy: 0,
          distTraveled: 0, targetDist: 0,
          fading: false,
        });
      }
      this.batClusters.push({ x: def.x, worldY: cy, bats, triggered: false });
    }
  }

  // ===========================================================================
  // MAIN UPDATE
  // ===========================================================================
  update(time, delta) {
    const cam = this.scene.cameras.main;
    const player = this.scene.player;
    const fps = this.scene.game.loop.actualFps;
    const lowFps = fps > 0 && fps < 45;

    this._updateBats(time, delta, cam, lowFps);
    this._updateRocks(time, delta, cam, lowFps);
    this._updateDrips(time, delta, cam);
    this._updateDust(time, delta, cam, player, lowFps);
    this._updatePools(time, cam);
  }

  // ===========================================================================
  // BAT UPDATE
  // ===========================================================================
  _updateBats(time, delta, cam, lowFps) {
    const px = this.scene.player.x;
    const py = this.scene.player.y;
    const dt = delta / 1000;

    // Player's screen position (used for screen-space trigger checks).
    const playerSX = px - cam.scrollX;
    const playerSY = py - cam.scrollY;

    for (const cluster of this.batClusters) {
      // Performance: skip if cluster screen x is more than 600px from viewport centre.
      const clusterSX = cluster.x - cam.scrollX * 0.5;
      if (Math.abs(clusterSX - VIEW_W / 2) > VIEW_W / 2 + 600) continue;

      // Scatter trigger — use SCREEN SPACE so the check works for any cam position.
      // Cluster screen y accounts for SF=0.5 parallax.
      if (!cluster.triggered) {
        const clusterSY = cluster.worldY - cam.scrollY * 0.5;
        const xClose  = Math.abs(playerSX - clusterSX) < 200;
        const yBelow  = playerSY > clusterSY && playerSY < clusterSY + 300;
        if (xClose && yBelow) {
          cluster.triggered = true;
          this._triggerCluster(cluster);
        }
      }

      for (const bat of cluster.bats) {
        if (bat.state === 'done') continue;

        if (bat.state === 'hanging') {
          const sway = Math.sin(time / bat.swayPeriod + bat.swayPhase) * 3;
          bat.lw.x  = bat.baseX - 3 + sway;
          bat.rw.x  = bat.baseX + 3 + sway;
          bat.eye.x = bat.baseX + sway;

        } else if (bat.state === 'scattering') {
          bat.lw.x  += bat.vx * dt;  bat.lw.y  += bat.vy * dt;
          bat.rw.x  += bat.vx * dt;  bat.rw.y  += bat.vy * dt;
          bat.eye.x += bat.vx * dt;  bat.eye.y += bat.vy * dt;
          bat.distTraveled += Math.hypot(bat.vx, bat.vy) * dt;

          if (!lowFps) {
            const flap = Math.floor(time / 80) % 2 === 0 ? 30 : -30;
            bat.lw.setAngle(-flap);
            bat.rw.setAngle(flap);
          }

          if (!bat.fading && bat.distTraveled >= bat.targetDist) {
            bat.fading = true;
            bat.state = 'fading';
            this.scene.tweens.add({
              targets: [bat.lw, bat.rw, bat.eye], alpha: 0, duration: 400,
              onComplete: () => { bat.lw.destroy(); bat.rw.destroy(); bat.eye.destroy(); bat.state = 'done'; },
            });
          }
        }
      }
    }
  }

  _triggerCluster(cluster) {
    for (let i = 0; i < 4; i++) {
      const dx = (Math.random() - 0.5) * 20;
      const dy = (Math.random() - 0.5) * 20;
      const p = this.scene.add.rectangle(cluster.x + dx, cluster.worldY + dy, 2, 2, 0x330044, 0.3)
        .setDepth(-4.5).setScrollFactor(0.5);
      this.scene.tweens.add({ targets: p, alpha: 0, duration: 300, onComplete: () => p.destroy() });
    }
    for (const bat of cluster.bats) {
      const speed = 60 + Math.random() * 60;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (2 * Math.PI / 3);
      bat.vx = Math.cos(angle) * speed;
      bat.vy = Math.sin(angle) * speed;
      bat.distTraveled = 0;
      bat.targetDist = 150 + Math.random() * 100;
      bat.state = 'scattering';
      bat.lw.setAngle(-30);
      bat.rw.setAngle(30);
    }
  }

  // ===========================================================================
  // FALLING ROCKS (Element 2, SF=0.4, depth -5.5)
  // ===========================================================================
  _updateRocks(time, delta, cam, lowFps) {
    const maxRocks = lowFps ? 10 : 20;
    const dt = delta / 1000;

    // Only spawn in horizontal sections (not plunge/ascent shafts).
    const camCX = cam.scrollX + VIEW_W / 2;
    const camCY = cam.scrollY + VIEW_H / 2;
    const section = this._getSection(camCX, camCY);
    const canSpawn = section === 'horizontal' || section === 'deep';

    if (canSpawn && this.rocks.length < maxRocks) {
      this.rockTimer += delta;
      if (this.rockTimer >= this.rockInterval) {
        this.rockTimer = 0;
        this.rockInterval = 800 + Math.random() * 800;
        this._spawnRock(cam);
      }
    }

    // Parallax-adjusted camera x band (rocks spawn at SF=0.4).
    const effX0 = cam.scrollX * 0.4;
    const effX1 = effX0 + VIEW_W;

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];
      if (rock.dead) { this.rocks.splice(i, 1); continue; }

      rock.rect.y += rock.speed * dt;

      // Off-screen rocks: skip fade logic but still destroy when out of world.
      const offscreen = rock.rect.x < effX0 - 400 || rock.rect.x > effX1 + 400;
      if (offscreen) {
        if (rock.rect.y > WORLD_H - 200) { rock.rect.destroy(); rock.dead = true; }
        continue;
      }

      if (!rock.fading && rock.rect.y > WORLD_H - 200) {
        rock.fading = true;
        if (rock.large) this._spawnRockDust(rock.rect.x, rock.rect.y);
        this.scene.tweens.add({
          targets: rock.rect, alpha: 0, duration: 250,
          onComplete: () => { rock.rect.destroy(); rock.dead = true; },
        });
      }
    }
  }

  _spawnRock(cam) {
    const r = Math.random();
    let w, h;
    if      (r < 0.70) { w = 4 + Math.random() * 2;  h = 4 + Math.random(); }
    else if (r < 0.95) { w = 8 + Math.random() * 2;  h = 6 + Math.random(); }
    else               { w = 14; h = 9; }

    const large = w >= 14;
    const alpha = 0.55 + Math.random() * 0.15;
    const rotation = (Math.random() - 0.5) * 50 * (Math.PI / 180);
    const spawnX = Math.random() * WORLD_W;

    const rect = this.scene.add.rectangle(spawnX, -20, w, h, 0x1a0d00, alpha)
      .setRotation(rotation).setDepth(-5.5).setScrollFactor(0.4);
    this.rocks.push({ rect, speed: 25 + Math.random() * 30, large, fading: false, dead: false });
  }

  _spawnRockDust(x, y) {
    for (let i = 0; i < 3; i++) {
      const p = this.scene.add.rectangle(x + (Math.random() - 0.5) * 15, y, 3, 3, 0x1a0d00, 0.3)
        .setDepth(-5.5).setScrollFactor(0.4);
      this.scene.tweens.add({ targets: p, alpha: 0, duration: 250, onComplete: () => p.destroy() });
    }
  }

  // ===========================================================================
  // WALL DRIPS (Element 3, SF=0.25, depth -6)
  // ===========================================================================
  _updateDrips(time, delta, cam) {
    for (const drip of this.drips) {
      // Performance: skip if trail is far from parallax-adjusted camera x band.
      const effX = cam.scrollX * 0.25;
      if (Math.abs(drip.trail.x - effX - VIEW_W / 2) > VIEW_W / 2 + 500) continue;

      drip.timer += delta;

      if (!drip.falling && drip.timer >= drip.interval) {
        drip.falling = true;
        drip.fallElapsed = 0;
        drip.droplet.y = drip.trailBottom;
        drip.droplet.setAlpha(0.25);
        drip.timer = 0;
        drip.interval = 4000 + Math.random() * 4000;
      }

      if (drip.falling) {
        drip.fallElapsed += delta;
        const progress = Math.min(drip.fallElapsed / 1667, 1); // 50px at 30px/s
        drip.droplet.y = drip.trailBottom + progress * 50;
        drip.droplet.setAlpha(0.25 * (1 - progress));

        if (progress >= 1) {
          drip.falling = false;
          drip.droplet.setAlpha(0);
          drip.splash.y = drip.trailBottom + 50;
          drip.splash.setAlpha(0.15);
          this.scene.tweens.add({ targets: drip.splash, alpha: 0, delay: 80, duration: 150 });
        }
      }
    }
  }

  // ===========================================================================
  // DUST PARTICLES (Element 4, SF=0.8, depth -5)
  // ===========================================================================
  _updateDust(time, delta, cam, player, lowFps) {
    const maxDust = lowFps ? 12 : 25;
    const dt = delta / 1000;
    const spawnRate = (player && player.isDashing) ? 300 : 600;

    this.dustTimer += delta;
    if (this.dustTimer >= spawnRate && this.dustParticles.length < maxDust) {
      this.dustTimer = 0;
      this._spawnDust(player);
    }

    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const d = this.dustParticles[i];
      d.elapsed += delta;
      d.y -= d.speed * dt;
      d.rect.x = d.baseX + Math.sin(d.elapsed / d.driftPeriod * Math.PI * 2 + d.driftPhase) * 8;
      d.rect.y = d.y;

      // Remove when scrolled off the top of the viewport (SF=0.8).
      if (d.y - cam.scrollY * 0.8 < -40) {
        d.rect.destroy();
        this.dustParticles.splice(i, 1);
      }
    }
  }

  _spawnDust(player) {
    if (!player) return;
    const x = player.x + (Math.random() - 0.5) * 600;
    const y = player.y + 20 + Math.random() * 40;
    const rect = this.scene.add.rectangle(x, y, 2, 2, 0x1a0d00, 0.10)
      .setDepth(-5).setScrollFactor(0.8);
    this.dustParticles.push({
      rect, baseX: x, y,
      speed: 4 + Math.random() * 4,
      driftPeriod: 2000 + Math.random() * 2000,
      driftPhase: Math.random() * Math.PI * 2,
      elapsed: 0,
    });
  }

  // ===========================================================================
  // POOL PULSE (Element 6)
  // ===========================================================================
  _updatePools(time, cam) {
    for (const pool of this.pools) {
      if (Math.abs(pool.outer.x - cam.scrollX - VIEW_W / 2) > VIEW_W / 2 + 600) continue;
      const alpha = 0.095 + 0.045 * Math.sin(time / pool.period * Math.PI * 2 + pool.phase);
      pool.outer.setAlpha(alpha);
      pool.inner.setAlpha(Math.min(alpha * 1.6, 0.22));
    }
  }

  // Mirrors Level2.getSection — used to gate rock spawning.
  _getSection(x, y) {
    if (y > 5000) return 'deep';
    if (x > 7400) return 'plunge';
    if (x < 1800 && y > 400 && y < 5400) return 'ascent';
    return 'horizontal';
  }
}
