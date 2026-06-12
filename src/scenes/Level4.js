import Phaser from 'phaser';
import {
  ENEMY, DEV_MODE, ASSIST_MODE, LEVEL4_PALETTE, HIDDEN_COLLECTIBLE_COUNT,
} from '../constants.js';
import AssistMode from '../utils/AssistMode.js';
import Player from '../entities/Player.js';
import GroundDrone from '../entities/GroundDrone.js';
import HoverSentinel from '../entities/HoverSentinel.js';
import Seeker from '../entities/Seeker.js';
import ExitPortal from '../entities/ExitPortal.js';
import ShieldPickup from '../entities/ShieldPickup.js';
import MovingPlatform from '../entities/MovingPlatform.js';
import CameraController from '../camera/CameraController.js';
import DiegeticHUD from '../ui/DiegeticHUD.js';
import { buildPlatformVisual } from '../entities/platformVisual.js';
import { createCollectible, spawnPickupShards } from '../entities/collectible.js';
import { makeGlassPanel } from '../ui/glassPanel.js';
import ChromaticAberrationPipeline from '../pipelines/ChromaticAberrationPipeline.js';
import SFX from '../audio/SFX.js';
import TouchControls from '../ui/TouchControls.js';
import Progression from '../utils/Progression.js';
import {
  W, H, FLOOR_Y, DEATH_Y, PORTAL, SHIELD, CHECKPOINT,
  REQUIRED_PATH, EXTRAS, ELEVATOR, S5_RAILS,
  DRONES, SENTINELS, SEEKERS, COLLECTIBLES, TOTAL_COLLECTIBLES,
  verifyPath, PHYS,
} from './level4Layout.js';

// =============================================================================
// Level 4 — Market Towers. A tall (8000x12000) vertical level whose geometry is
// authored + reachability-verified in level4Layout.js. Five verb-distinct
// sections (RUN -> CLIMB -> READ/TIME bridge -> FALL+CLIMB -> EVERYTHING) across
// two visually distinct towers with open sky between them, over a bright, dense,
// ANIMATED market-tower backdrop (5 tower archetypes, 6 landmark setpieces, sun
// with god-rays, warmth pockets, neon, vendors, cables, birds).
//
// All systems are reused (enemies, shield, checkpoint, collectibles, moving
// platforms, ExitPortal, CameraController, HUD, pause/assist). Colours all come
// from LEVEL4_PALETTE; no inline hex.
// =============================================================================
const PAL = LEVEL4_PALETTE;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const GLYPHS = ['◊X◊', 'Z-9', '▚▞█', 'H3X', '◊◊◊', 'V0ID', 'N-7', 'ARC', '||=', 'SEC2', 'K4I', 'M-0'];

let level4TitleShown = false; // once per session

export default class Level4 extends Phaser.Scene {
  constructor() {
    super('Level4');
  }

  create() {
    // Hard gate: reachable only once Level 3 is complete (bypassed in DEV_MODE).
    if (!Progression.hasCompleted(3) && !DEV_MODE) {
      this.scene.start('MainMenu');
      return;
    }

    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.world.setBoundsCollision(true, true, true, false); // open bottom
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(PAL.BG);

    // ---- State ----
    this.platforms = [];
    this.movers = [];
    this.movingBodies = [];
    this.birds = [];
    this.collectibles = [];
    this.drones = [];
    this.sentinels = [];
    this.seekers = [];
    this.collectedCount = 0;
    this.totalCollectibles = TOTAL_COLLECTIBLES; // HUD reads this (55)
    this.secretsFound = 0;
    this.levelDone = false;
    this.respawnX = 500;
    this.respawnY = 11680;
    this.checkpointActive = false;
    this.s3PullDone = false;
    this.isPaused = false;
    this.pauseMode = 'main';
    this.pauseSelection = 0;
    this.assistSelection = 0;

    // ---- Post-FX chain (same as L2/L3) — bloom makes the neon glow. ----
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('BloomPipeline');
      this.cameras.main.setPostPipeline(ChromaticAberrationPipeline);
      this.cameras.main.setPostPipeline('CRTPipeline');
      this.cameras.main.setPostPipeline('ColorGradePipeline');
    }

    // ---- DEV reachability check (logs violations to the console; flag-gated) --
    if (DEV_MODE) {
      const v = verifyPath();
      if (v.length) console.warn('[Level4] reachability violations:', v);
      else console.log(`[Level4] reachability OK (jump=${Math.round(PHYS.maxJumpHeight)} dbl=${Math.round(PHYS.maxDoubleJumpHeight)} gapRun=${Math.round(PHYS.maxGapRun)} gapDash=${Math.round(PHYS.maxGapDash)})`);
    }

    // ---- Background ----
    this.buildBackground();

    // ---- Geometry: required path + extras + moving platforms ----
    REQUIRED_PATH.forEach((p) => this.addPlatform(p.x, p.y, p.w, p.h));
    EXTRAS.forEach(([cx, ty, w, h]) => this.addPlatform(cx, ty, w, h));
    [ELEVATOR, ...S5_RAILS].forEach(([sx, ty, range, speed, axis]) => {
      const mp = new MovingPlatform(this, sx, ty, 120, 14, axis, range, speed, PAL);
      this.movers.push(mp);
      this.movingBodies.push(mp.bodyRect);
    });
    this._carriers = [...this.movers];

    // ---- Player (spawns on the market floor with the core abilities) ----
    this.player = new Player(this, this.respawnX, this.respawnY);
    this.player.canDoubleJump = true;
    this.player.canDash = true;
    this.player.hasAttack = true;
    // Mobile on-screen buttons (renders only on touch devices; Player.js ORs
    // its state with the keyboard; self-destroys on scene shutdown).
    this.touchControls = new TouchControls(this);

    // ---- Checkpoint (west end of Bridge 1) ----
    this.createCheckpoint(CHECKPOINT.x, CHECKPOINT.y);

    // ---- Enemies ----
    DRONES.forEach(([x, y]) => this.drones.push(new GroundDrone(this, x, y)));
    SENTINELS.forEach(([x, y]) => this.sentinels.push(new HoverSentinel(this, x, y)));
    SEEKERS.forEach(([x, y]) => this.seekers.push(
      new Seeker(this, x, y, this.player, { speed: ENEMY.SEEKER_SPEED, aggro: 320 }),
    ));

    // ---- Collectibles (trail + hidden; all counted as the main x / 55) ----
    COLLECTIBLES.forEach(([x, y]) => this.collectibles.push(createCollectible(this, x, y, PAL.PLATFORM, false)));

    // ---- Shield pickup (S2 top platform, before the hardest content) ----
    this.shieldPickup = new ShieldPickup(this, SHIELD.x, SHIELD.y);

    // ---- Exit portal (summit) ----
    this.portal = new ExitPortal(this, PORTAL.x, PORTAL.y);
    this.portal.glow.setPosition(PORTAL.x, PORTAL.y + 60);

    // ---- Colliders ----
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.movingBodies);
    this.physics.add.collider(this.drones, this.platforms);
    this.physics.add.collider(this.drones, this.movingBodies);
    this.physics.add.overlap(this.player, this.drones, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.sentinels, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.seekers, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.collectibles, this.onCollect, null, this);
    this.physics.add.overlap(this.player, this.shieldPickup.trigger, this.onShield, null, this);
    this.physics.add.overlap(this.player, this.portal.trigger, this.onLevelComplete, null, this);
    this.physics.add.overlap(this.player, this.checkpoint, this.onCheckpoint, null, this);

    // Attack: the player's hitbox kills any enemy it overlaps.
    this.enemies = this.add.group([...this.drones, ...this.sentinels, ...this.seekers]);
    this.physics.add.overlap(this.player.attackHitbox, this.enemies, (hb, enemy) => enemy.die());

    // ---- Input ----
    this.mKey = this.input.keyboard.addKey('M');
    this.pauseKeys = this.input.keyboard.addKeys({
      esc: 'ESC', up: 'UP', down: 'DOWN', w: 'W', s: 'S', space: 'SPACE', enter: 'ENTER',
    });

    // ---- HUD + camera ----
    this.diegeticHUD = new DiegeticHUD(this, this.player);
    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    this.cameraController = new CameraController(this, this.cameras.main, 'horizontal');

    // ---- Opening title card (once per session; skipped in DEV_MODE) ----
    if (!DEV_MODE && !level4TitleShown) {
      level4TitleShown = true;
      this.showTitleCard('TIER 4 — MARKET TOWERS', 'Climb toward the light. The city sells everything but the way up.', PAL.NEON_CYAN);
    }
  }

  // Gameplay platform (no Light2D — the level is self-lit + bright).
  addPlatform(cx, topY, w, h) {
    const { body } = buildPlatformVisual(this, cx, topY, w, h, PAL, false);
    this.physics.add.existing(body, true);
    this.platforms.push(body);
  }

  // ===========================================================================
  // BACKGROUND — landmarks over varied overlapping towers, not a grid.
  // ===========================================================================
  buildBackground() {
    const vh = this.scale.height;
    const vw = this.scale.width;
    const camMax = H - vh;
    const camMaxX = W - vw;
    // Effective spans PER AXIS: a scrollFactor-sf object only ever renders when
    // its world coord is inside [0, camScrollMax*sf + viewport]. Content placed
    // beyond that (e.g. x spread over the full 8000 world width) can NEVER
    // appear on screen — which is exactly the "flat void" bug this fixes.
    this.spanA = camMax * 0.15 + vh;
    this.spanB = camMax * 0.4 + vh;
    this.spanC = camMax * 0.7 + vh;
    this.spanAX = camMaxX * 0.15 + vw;
    this.spanBX = camMaxX * 0.4 + vw;
    this.spanCX = camMaxX * 0.7 + vw;
    this.spanSunX = camMaxX * 0.08 + vw;
    // Per-layer STREET LINE: the layer-space y that renders at the same screen
    // position as the world floor (FLOOR_Y) when the camera rests at the bottom
    // of the climb. Towers/vendors anchor their bases here so they read as
    // buildings ON the ground, not silhouettes floating mid-air.
    this.groundA = FLOOR_Y - camMax * (1 - 0.15);
    this.groundB = FLOOR_Y - camMax * (1 - 0.4);
    this.groundC = FLOOR_Y - camMax * (1 - 0.7);

    this.buildHaze();
    this.buildSun();
    this.buildTowerSkyline(this.groundA, this.spanAX, PAL.TOWER_FAR, 0.15, -18, [0.85, 1.1]);
    this.buildTowerSkyline(this.groundB, this.spanBX, PAL.TOWER_MID, 0.4, -14, [1.1, 1.7]);
    this.buildNearStreet(); // Layer C: vendors + cables + signs + warm pockets
    this.buildLandmarks();
    this.buildBirds();
  }

  buildHaze() {
    const bands = 6;
    for (let i = 0; i < bands; i += 1) {
      const y = (this.spanA / bands) * (i + 0.5);
      const col = i % 2 === 0 ? PAL.HAZE : PAL.HAZE_HI;
      this.add.rectangle(W / 2, y, W * 1.4, this.spanA / bands + 80, col, 0.06)
        .setScrollFactor(0.1).setDepth(-20);
    }
  }

  // SUN — pale-bright disc high in the span (sf 0.08) + halo pulse + god-ray
  // beams (slow rotation drift) + a faint band + drifting silhouette clouds.
  buildSun() {
    // Placed inside the sf-0.08 effective x span (~[0, spanSunX]) so the disc
    // is actually reachable by the camera — at x6000 it could never render.
    const sx = this.spanSunX * 0.62;
    const sy = 360;
    const sf = 0.08;
    // God rays — long faint triangles fanning from the sun, drifting in rotation.
    const rays = [];
    for (let i = 0; i < 6; i += 1) {
      const g = this.add.graphics().setScrollFactor(sf).setDepth(-19.4);
      g.fillStyle(PAL.GODRAY, 0.05);
      g.fillTriangle(0, 0, -60, 1300, 60, 1300);
      g.setPosition(sx, sy).setRotation((i / 6) * Math.PI * 2);
      rays.push(g);
      this.tweens.add({ targets: g, rotation: g.rotation + 0.5, duration: 30000 + i * 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const glow2 = this.add.circle(sx, sy, 270, PAL.SUN_HALO, 0.12).setScrollFactor(sf).setDepth(-19.2);
    const glow1 = this.add.circle(sx, sy, 180, PAL.SUN_GLOW, 0.22).setScrollFactor(sf).setDepth(-19.1);
    const band = this.add.rectangle(sx, sy, 900, 40, PAL.SUN_BAND, 0.14).setScrollFactor(sf).setDepth(-18.9);
    this.add.circle(sx, sy, 120, PAL.SUN_CORE, 0.95).setScrollFactor(sf).setDepth(-19);
    this.tweens.add({ targets: [glow1, glow2], scale: { from: 0.92, to: 1.1 }, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: band, alpha: { from: 0.08, to: 0.2 }, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 3; i += 1) {
      const cy = sy + Phaser.Math.Between(-90, 120);
      const cloud = this.add.rectangle(sx - 500 + i * 500, cy, Phaser.Math.Between(220, 360), Phaser.Math.Between(14, 26), PAL.CLOUD, 0.55)
        .setScrollFactor(0.1).setDepth(-18.7);
      this.tweens.add({ targets: cloud, x: cloud.x + 1400, duration: Phaser.Math.Between(26000, 40000), repeat: -1, delay: i * 6000, ease: 'Linear' });
    }
  }

  // A jagged, overlapping skyline ROOTED TO THE GROUND: every tower's base sits
  // on the layer's street line (groundY) and extends upward — buildings, not
  // floating silhouettes. x is distributed over the layer's EFFECTIVE x span
  // (spanX, not the world width); widths vary 2-3x; 5 archetypes cycle. Heights
  // run ~20%..85% of the viewport so the skyline stays jagged.
  buildTowerSkyline(groundY, spanX, fill, sf, depth, widthScale) {
    const vh = this.scale.height;
    const count = Math.ceil(spanX / 150); // dense enough to overlap at every view
    for (let i = 0; i < count; i += 1) {
      const x = (spanX / count) * (i + 0.5) + Phaser.Math.Between(-90, 90);
      const w = Phaser.Math.Between(120, 300) * Phaser.Math.FloatBetween(widthScale[0], widthScale[1]);
      const h = Phaser.Math.Between(Math.round(vh * 0.2), Math.round(vh * 0.85));
      const tall = h > vh * 0.6; // the tallest towers carry antenna crowns
      const type = tall ? Phaser.Math.Between(1, 2) : Phaser.Math.Between(1, 5);
      this.makeArchetypeTower(x, groundY, w, h, fill, sf, depth, type, tall);
    }
  }

  // Scatter capped, bright windows onto a tower body (origin bottom, top at -h).
  addWindows(parts, w, h, sf, depth, x, y) {
    const nWin = Phaser.Math.Clamp(Math.round(h / 80), 5, 16);
    const flickers = [];
    for (let i = 0; i < nWin; i += 1) {
      const lit = Math.random() < 0.8;
      const col = lit ? (Math.random() < 0.24 ? PAL.WINDOW_WARM : PAL.WINDOW_COOL) : PAL.WINDOW_OFF;
      const wr = this.add.rectangle(Phaser.Math.Between(-w / 2 + 8, w / 2 - 14), -Phaser.Math.Between(18, h - 12), 6, 9, col, lit ? 0.9 : 0.3).setOrigin(0, 0);
      parts.push(wr);
      if (lit && Math.random() < 0.08) flickers.push(wr);
    }
    flickers.forEach((wr) => this.time.addEvent({
      delay: Phaser.Math.Between(1800, 6000), loop: true,
      callback: () => { const on = wr.fillAlpha > 0.5; wr.setFillStyle(on ? PAL.WINDOW_OFF : PAL.WINDOW_COOL, on ? 0.3 : 0.9); },
    }));
  }

  // One of 5 tower archetypes. Returns nothing; builds a parallax container.
  makeArchetypeTower(x, y, w, h, fill, sf, depth, type, top3) {
    const parts = [];
    const edge = (cx, ty, cw) => parts.push(this.add.rectangle(cx, ty, cw, 4, PAL.TOWER_EDGE, 0.85).setOrigin(0.5, 0));
    const warning = [];

    if (type === 1) { // stepped setback — 3-4 shrinking tiers
      const tiers = Phaser.Math.Between(3, 4);
      let ty = 0; let tw = w;
      for (let t = 0; t < tiers; t += 1) {
        const th = h / tiers;
        parts.push(this.add.rectangle(0, ty, tw, th, fill, 1).setOrigin(0.5, 1));
        edge(0, ty - th, tw);
        ty -= th; tw *= 0.7;
      }
      this.addWindows(parts, w, h, sf, depth, x, y);
    } else if (type === 2) { // antenna crown — slab + spires + warning lights
      parts.push(this.add.rectangle(0, 0, w, h, fill, 1).setOrigin(0.5, 1));
      edge(0, -h, w);
      this.addWindows(parts, w, h, sf, depth, x, y);
      const spires = Phaser.Math.Between(2, 3);
      for (let s = 0; s < spires; s += 1) {
        const sxoff = (s - (spires - 1) / 2) * (w / 3);
        const mh = Phaser.Math.Between(40, 110);
        parts.push(this.add.rectangle(sxoff, -h, 3, mh, PAL.ANTENNA, 0.85).setOrigin(0.5, 1));
        const wl = this.add.rectangle(sxoff, -h - mh, 5, 5, PAL.WARNING, 1);
        parts.push(wl); warning.push(wl);
      }
    } else if (type === 3) { // pagoda — tiers with lifted roof overhangs
      const tiers = Phaser.Math.Between(3, 4);
      let ty = 0;
      for (let t = 0; t < tiers; t += 1) {
        const th = h / tiers;
        parts.push(this.add.rectangle(0, ty, w * 0.8, th, fill, 1).setOrigin(0.5, 1));
        parts.push(this.add.rectangle(0, ty - th, w, 6, PAL.TOWER_EDGE, 0.7).setOrigin(0.5, 0.5)); // overhang roof
        ty -= th;
      }
      this.addWindows(parts, w * 0.8, h, sf, depth, x, y);
    } else if (type === 4) { // slab with one mega-billboard face
      parts.push(this.add.rectangle(0, 0, w, h, fill, 1).setOrigin(0.5, 1));
      edge(0, -h, w);
      this.addWindows(parts, w, h, sf, depth, x, y);
      const bw = w * 0.7; const bh = h * 0.4;
      const accent = [PAL.NEON_CYAN, PAL.NEON_PINK, PAL.NEON_WARM][Phaser.Math.Between(0, 2)];
      parts.push(this.add.rectangle(0, -h * 0.55, bw, bh, PAL.VENDOR_BODY, 0.9).setStrokeStyle(1, accent, 0.6));
      const sign = this.add.rectangle(0, -h * 0.55, bw - 6, 6, accent, 0.8);
      parts.push(sign);
      this.tweens.add({ targets: sign, alpha: { from: 0.3, to: 0.8 }, y: { from: -h * 0.55 + bh / 2 - 6, to: -h * 0.55 - bh / 2 + 6 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else { // type 5 — twin spire + mini sky-bridge
      const half = w / 2;
      parts.push(this.add.rectangle(-half * 0.7, 0, half * 0.5, h, fill, 1).setOrigin(0.5, 1));
      parts.push(this.add.rectangle(half * 0.7, 0, half * 0.5, h, fill, 1).setOrigin(0.5, 1));
      edge(-half * 0.7, -h, half * 0.5); edge(half * 0.7, -h, half * 0.5);
      parts.push(this.add.rectangle(0, -h * 0.7, w * 0.8, 8, fill, 1)); // sky-bridge bar
      parts.push(this.add.rectangle(0, -h * 0.7, w * 0.8, 2, PAL.TOWER_EDGE, 0.6));
      this.addWindows(parts, w, h, sf, depth, x, y);
    }

    this.add.container(x, y, parts).setScrollFactor(sf).setDepth(depth);
    if (top3 && warning.length) {
      warning.forEach((wl) => this.time.addEvent({ delay: Phaser.Math.Between(700, 1100), loop: true, callback: () => wl.setAlpha(wl.alpha > 0.5 ? 0.15 : 1) }));
    }
  }

  // Layer C — the lived-in street: vendors (warm pockets), cables, neon signs.
  buildNearStreet() {
    const span = this.spanC;
    // Vendors — ALL at street level (bases on the layer's ground line, stalls
    // in front of the rooted towers), spread evenly across the effective x
    // span so the spawn view opens onto a market street. Each anchors a warm
    // pocket. (Their old y-scatter put nearly all of them outside the visible
    // parallax band at spawn — the "no vendors" bug.)
    const VENDORS = 17;
    const vy = this.groundC - 14; // stall base (origin 0.5,0; 14px tall) sits ON the line
    for (let i = 0; i < VENDORS; i += 1) {
      const vx = Phaser.Math.Clamp(
        (this.spanCX / VENDORS) * (i + 0.5) + Phaser.Math.Between(-120, 120),
        220, this.spanCX - 220,
      );
      this.makeVendor(vx, vy, i % 2 === 0);
      this.makeWarmPocket(vx, vy); // amber pocket near every stall
    }
    // Cables (dense web, more toward the bottom).
    for (let i = 0; i < 12; i += 1) {
      this.makeCable(Phaser.Math.Between(150, this.spanCX - 1100), span * (0.2 + 0.8 * (i / 12)), 0.7, -9);
    }
    // Front neon signs spread up the span.
    const accents = [PAL.NEON_WARM, PAL.NEON_CYAN, PAL.NEON_PINK, PAL.NEON_BLUE, PAL.NEON_CYAN];
    for (let i = 0; i < 18; i += 1) {
      const y = (span / 18) * (i + 0.5) + Phaser.Math.Between(-120, 120);
      this.makeNeonSign(Phaser.Math.Between(300, this.spanCX - 300), y, 0.7, -8, GLYPHS[(i + 3) % GLYPHS.length], accents[i % accents.length], (i + 1) % 4, 1.0);
    }
    // Mid-layer neon billboards (animated) so every view has ≥2 signs.
    for (let i = 0; i < 14; i += 1) {
      const y = (this.spanB / 14) * (i + 0.5) + Phaser.Math.Between(-120, 120);
      const mid = y > this.spanB * 0.33 && y < this.spanB * 0.66;
      this.makeNeonSign(Phaser.Math.Between(300, this.spanBX - 300), y, 0.4, -12, GLYPHS[i % GLYPHS.length], [PAL.NEON_CYAN, PAL.NEON_WARM, PAL.NEON_PINK, PAL.NEON_BLUE][i % 4], i % 4, mid ? 1.6 : 1.0);
    }
  }

  // A warm amber glow + a cluster of warm windows — the blue-vs-warm contrast.
  makeWarmPocket(x, y) {
    const glow = this.add.rectangle(x, y - 30, 120, 90, PAL.WARM_POCKET, 0.06).setScrollFactor(0.7).setDepth(-9.5);
    this.tweens.add({ targets: glow, alpha: { from: 0.04, to: 0.1 }, duration: Phaser.Math.Between(1400, 2200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 5; i += 1) {
      this.add.rectangle(x + Phaser.Math.Between(-50, 50), y - Phaser.Math.Between(20, 90), 5, 7, PAL.WINDOW_WARM, 0.85).setScrollFactor(0.7).setDepth(-8.6);
    }
  }

  // ---- 6 landmark setpieces, ~every 1500px of climb -------------------------
  buildLandmarks() {
    this.gondolas = [];
    this.makeCableCar(this.spanB * 0.78);       // bottom-ish
    this.makeMegaBillboard(this.spanB * 0.55);   // mid
    this.makeRotatingSign(this.spanC * 0.5);     // mid (front)
    this.makeAdBlimp(this.spanA * 0.6);          // far, drifts
    this.makeLanternGarden(this.spanC * 0.32);   // upper-mid (front)
    this.makeSteamVents(this.spanB * 0.2);       // top (mid)
  }

  makeCableCar(y) {
    const sf = 0.4; const depth = -13;
    const x0 = 400; const x1 = this.spanBX - 400; const y0 = y + 220; const y1 = y - 220;
    const g = this.add.graphics().setScrollFactor(sf).setDepth(depth);
    g.lineStyle(2, PAL.TOWER_EDGE, 0.6); g.lineBetween(x0, y0, x1, y1);
    for (let i = 0; i < 3; i += 1) {
      const car = this.add.container(0, 0, [
        this.add.rectangle(0, 0, 26, 16, PAL.VENDOR_BODY, 1).setStrokeStyle(1, PAL.NEON_CYAN, 0.7),
        this.add.rectangle(0, -10, 4, 6, PAL.TOWER_EDGE, 0.8),
      ]).setScrollFactor(sf).setDepth(depth + 0.1);
      const tw = this.tweens.addCounter({ from: 0, to: 1, duration: 14000, repeat: -1, delay: i * 4600, onUpdate: (t) => {
        const f = t.getValue();
        car.setPosition(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
      } });
      car._tw = tw;
    }
  }

  makeMegaBillboard(y) {
    const sf = 0.4; const depth = -12; const x = Phaser.Math.Between(800, this.spanBX - 800);
    const bw = 360; const bh = 200;
    const panel = this.add.rectangle(x, y, bw, bh, PAL.VENDOR_BODY, 0.92).setStrokeStyle(2, PAL.NEON_PINK, 0.7).setScrollFactor(sf).setDepth(depth);
    const letters = [];
    const word = GLYPHS.slice(0, 4);
    word.forEach((gl, i) => letters.push(this.add.text(x + (i - 1.5) * 70, y, gl, { fontFamily: 'monospace', fontSize: '52px', color: hex(PAL.NEON_PINK), fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(sf).setDepth(depth + 0.1)));
    const scan = this.add.rectangle(x, y - bh / 2, bw, 6, PAL.NEON_CYAN, 0.5).setScrollFactor(sf).setDepth(depth + 0.2);
    this.tweens.add({ targets: scan, y: y + bh / 2, duration: 1800, repeat: -1, ease: 'Sine.easeInOut', yoyo: true });
    this.tweens.add({ targets: letters, alpha: { from: 0.5, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  makeRotatingSign(y) {
    const sf = 0.7; const depth = -8; const x = Phaser.Math.Between(600, this.spanCX - 600);
    const R = 90;
    const ring = this.add.container(x, y, []).setScrollFactor(sf).setDepth(depth);
    const panels = 8;
    for (let i = 0; i < panels; i += 1) {
      const a = (i / panels) * Math.PI * 2;
      const p = this.add.text(Math.cos(a) * R, Math.sin(a) * R, GLYPHS[i % GLYPHS.length], { fontFamily: 'monospace', fontSize: '16px', color: hex(PAL.NEON_WARM), fontStyle: 'bold' }).setOrigin(0.5);
      ring.add(p);
    }
    ring.add(this.add.circle(0, 0, 10, PAL.NEON_WARM, 0.6));
    this.tweens.add({ targets: ring, rotation: Math.PI * 2, duration: 16000, repeat: -1, ease: 'Linear' });
  }

  makeAdBlimp(y) {
    const sf = 0.15; const depth = -17;
    const blimp = this.add.container(-300, y, [
      this.add.ellipse(0, 0, 160, 56, PAL.TOWER_MID, 1).setStrokeStyle(1, PAL.TOWER_EDGE, 0.5),
      this.add.rectangle(0, 30, 40, 12, PAL.VENDOR_BODY, 1),
    ]).setScrollFactor(sf).setDepth(depth);
    const banner = this.add.text(0, 0, 'V0ID·N-7', { fontFamily: 'monospace', fontSize: '20px', color: hex(PAL.NEON_CYAN), fontStyle: 'bold' }).setOrigin(0.5);
    blimp.add(banner);
    this.tweens.add({ targets: banner, alpha: { from: 0.4, to: 1 }, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: blimp, x: this.spanAX + 300, duration: 30000, repeat: -1, ease: 'Linear' });
  }

  makeLanternGarden(y) {
    const sf = 0.7; const depth = -8.5; const x = Phaser.Math.Between(400, this.spanCX - 800);
    for (let s = 0; s < 3; s += 1) {
      const sy = y + s * 26;
      const sxn = x + s * 40;
      const span = 360;
      const g = this.add.graphics().setScrollFactor(sf).setDepth(depth - 0.1);
      g.lineStyle(1, PAL.CABLE, 0.8); g.beginPath(); g.moveTo(sxn, sy);
      for (let i = 1; i <= 10; i += 1) { const t = i / 10; g.lineTo(sxn + span * t, sy + Math.sin(t * Math.PI) * 30); }
      g.strokePath();
      this.tweens.add({ targets: g, y: '+=3', duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      for (let i = 1; i < 6; i += 1) {
        const t = i / 6; const lx = sxn + span * t; const ly = sy + Math.sin(t * Math.PI) * 30 + 12;
        const lant = this.add.rectangle(lx, ly, 7, 10, PAL.LANTERN, 0.95).setScrollFactor(sf).setDepth(depth);
        this.tweens.add({ targets: lant, alpha: { from: 0.6, to: 1 }, duration: Phaser.Math.Between(900, 1600), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 700) });
      }
    }
  }

  makeSteamVents(y) {
    const sf = 0.4; const depth = -12.5; const baseX = Phaser.Math.Between(600, this.spanBX - 1300);
    for (let v = 0; v < 4; v += 1) {
      const vx = baseX + v * 220;
      this.add.rectangle(vx, y, 16, 10, PAL.JUNCTION, 1).setScrollFactor(sf).setDepth(depth);
      this.time.addEvent({ delay: 1400 + v * 500, loop: true, callback: () => {
        const puff = this.add.circle(vx, y - 8, 8, PAL.WINDOW_COOL, 0.18).setScrollFactor(sf).setDepth(depth + 0.1);
        this.tweens.add({ targets: puff, y: y - 90, scale: 2.4, alpha: 0, duration: 2200, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
      } });
    }
  }

  // ---- Neon sign (4 animation styles), vendor, cable, birds (as before) -----
  makeNeonSign(x, y, sf, depth, glyphs, accent, style, scale = 1) {
    const fs = Math.round(15 * scale);
    const cellW = Math.round(16 * scale);
    const panelW = glyphs.length * cellW + 14;
    const panelH = Math.round(26 * scale);
    const panel = this.add.rectangle(0, 0, panelW, panelH, PAL.VENDOR_BODY, 0.85).setStrokeStyle(1, accent, 0.6);
    const glow = this.add.rectangle(0, 0, panelW + 8, panelH + 6, accent, 0.12);
    const letters = [];
    for (let i = 0; i < glyphs.length; i += 1) {
      letters.push(this.add.text((i - (glyphs.length - 1) / 2) * cellW, 0, glyphs[i], { fontFamily: 'monospace', fontSize: `${fs}px`, color: hex(accent), fontStyle: 'bold' }).setOrigin(0.5));
    }
    this.add.container(x, y, [glow, panel, ...letters]).setScrollFactor(sf).setDepth(depth);
    const delay = Phaser.Math.Between(0, 1400);
    if (style === 0) {
      this.tweens.add({ targets: [...letters, glow], alpha: { from: 1, to: 0.12 }, duration: Phaser.Math.Between(500, 900), yoyo: true, repeat: -1, hold: Phaser.Math.Between(200, 600), delay });
    } else if (style === 1) {
      letters.forEach((l) => l.setAlpha(0.18));
      let idx = 0;
      this.time.addEvent({ delay: 180, loop: true, startAt: delay, callback: () => { letters.forEach((l, i) => l.setAlpha(i === idx ? 1 : 0.18)); idx = (idx + 1) % letters.length; } });
      this.tweens.add({ targets: glow, alpha: { from: 0.18, to: 0.06 }, duration: 700, yoyo: true, repeat: -1 });
    } else if (style === 2) {
      this.time.addEvent({ delay: 70, loop: true, startAt: delay, callback: () => { const a = Phaser.Math.FloatBetween(0.45, 1); letters.forEach((l) => l.setAlpha(a)); glow.setAlpha(a * 0.18); } });
    } else {
      const from = Phaser.Display.Color.IntegerToColor(accent);
      const to = Phaser.Display.Color.IntegerToColor(PAL.NEON_CYAN);
      this.tweens.addCounter({ from: 0, to: 1, duration: Phaser.Math.Between(1600, 2600), yoyo: true, repeat: -1, delay, onUpdate: (tw) => { const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tw.getValue() * 100); letters.forEach((l) => l.setColor(hex(Phaser.Display.Color.GetColor(c.r, c.g, c.b)))); } });
    }
  }

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
      this.tweens.add({ targets: cake, y: -64, duration: 600, ease: 'Quad.easeOut', yoyo: true, hold: 40, repeat: -1, repeatDelay: Phaser.Math.Between(400, 1400), delay: Phaser.Math.Between(0, 1200) });
      this.tweens.add({ targets: cake, angle: 360, duration: 1240, ease: 'Linear', repeat: -1, repeatDelay: Phaser.Math.Between(400, 1400), delay: Phaser.Math.Between(0, 1200) });
    }
    this.add.container(x, y, parts).setScrollFactor(0.7).setDepth(-7);
    this.tweens.add({ targets: lampGlow, alpha: { from: 0.1, to: 0.26 }, duration: Phaser.Math.Between(900, 1500), yoyo: true, repeat: -1 });
  }

  makeCable(x, y, sf, depth) {
    const span = Phaser.Math.Between(500, 1100);
    const sag = Phaser.Math.Between(30, 80);
    const g = this.add.graphics().setScrollFactor(sf).setDepth(depth);
    g.lineStyle(2, PAL.CABLE, 0.9); g.beginPath(); g.moveTo(x, y);
    for (let i = 1; i <= 12; i += 1) { const t = i / 12; g.lineTo(x + span * t, y + Math.sin(t * Math.PI) * sag); }
    g.strokePath();
    this.tweens.add({ targets: g, y: '+=2', duration: Phaser.Math.Between(1800, 2800), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const items = Phaser.Math.Between(2, 4);
    for (let i = 0; i < items; i += 1) {
      const t = (i + 1) / (items + 1); const cx = x + span * t; const cy = y + Math.sin(t * Math.PI) * sag;
      const kind = Phaser.Math.Between(0, 2);
      if (kind === 0) {
        const lant = this.add.rectangle(cx, cy + 12, 8, 12, PAL.LANTERN, 0.95).setScrollFactor(sf).setDepth(depth);
        const lg = this.add.rectangle(cx, cy + 12, 18, 22, PAL.LANTERN, 0.12).setScrollFactor(sf).setDepth(depth - 0.1);
        this.tweens.add({ targets: [lant, lg], alpha: { from: 0.6, to: 1 }, duration: Phaser.Math.Between(1000, 1800), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 800) });
      } else if (kind === 1) {
        this.add.rectangle(cx, cy + 10, 10, 16, PAL.WINDOW_COOL, 0.5).setScrollFactor(sf).setDepth(depth);
      } else {
        this.add.rectangle(cx, cy + 6, 12, 10, PAL.JUNCTION, 1).setScrollFactor(sf).setDepth(depth);
      }
    }
  }

  buildBirds() {
    for (let i = 0; i < 12; i += 1) {
      const wingL = this.add.rectangle(-4, 0, 6, 2, PAL.BIRD, 1);
      const wingR = this.add.rectangle(4, 0, 6, 2, PAL.BIRD, 1);
      const bird = this.add.container(0, 0, [wingL, wingR]).setDepth(-10).setVisible(false).setActive(false);
      this.tweens.add({ targets: [wingL, wingR], scaleY: { from: 1, to: 2.2 }, angle: { from: -8, to: 8 }, duration: Phaser.Math.Between(140, 220), yoyo: true, repeat: -1 });
      this.birds.push(bird);
    }
    this.time.addEvent({ delay: 3000, loop: true, callback: () => this.spawnBirdGroup() });
    this.time.delayedCall(1200, () => this.spawnBirdGroup());
  }

  spawnBirdGroup() {
    const cam = this.cameras.main;
    const free = this.birds.filter((b) => !b.active);
    if (free.length < 3) return;
    const n = Phaser.Math.Between(3, Math.min(5, free.length));
    const dir = Math.random() < 0.5 ? 1 : -1;
    const baseY = cam.scrollY + Phaser.Math.Between(40, this.scale.height - 80);
    for (let i = 0; i < n; i += 1) {
      const b = free[i];
      const sf = Math.random() < 0.5 ? 0.4 : 0.7;
      b.setScrollFactor(sf).setDepth(sf < 0.5 ? -11 : -7.5);
      // Parallax mapping: an sf object renders at screenY = worldY - scrollY*sf,
      // so to land at screen offset (baseY - scrollY) its worldY must be
      // (baseY - scrollY) + scrollY*sf. (The old baseY/sf put birds ~2.5 world
      // heights below the map.) Same mapping for x: cross the CURRENT view.
      const y = (baseY - cam.scrollY) + cam.scrollY * sf + Phaser.Math.Between(-30, 30);
      const viewX = cam.scrollX * sf;
      const vw = this.scale.width;
      const startX = dir > 0 ? viewX - 60 : viewX + vw + 60;
      const endX = dir > 0 ? viewX + vw + 80 : viewX - 80;
      b.setPosition(startX, y).setScale(dir, 1).setActive(true).setVisible(true);
      this.tweens.add({ targets: b, x: endX, duration: Phaser.Math.Between(7000, 12000), ease: 'Linear', delay: i * Phaser.Math.Between(120, 300), y: y + Phaser.Math.Between(-40, 40), onComplete: () => { b.setActive(false).setVisible(false); } });
    }
  }

  // ---- Checkpoint -----------------------------------------------------------
  createCheckpoint(x, y) {
    this.checkpointX = x;
    this.checkpoint = this.add.rectangle(x, y, 20, 36, PAL.NEON_CYAN, 0.7).setDepth(1);
    this.physics.add.existing(this.checkpoint, true);
    this.add.rectangle(x - 9, y, 2, 36, PAL.NEON_CYAN, 1).setDepth(1);
    this.add.text(x, y - 26, '//SAVE', { fontFamily: 'monospace', fontSize: '7px', color: hex(PAL.NEON_CYAN) }).setOrigin(0.5).setAlpha(0.5).setDepth(1);
  }

  onCheckpoint() {
    if (this.checkpointActive) return;
    this.checkpointActive = true;
    SFX.checkpoint();
    this.checkpoint.setFillStyle(PAL.NEON_CYAN, 1);
    this.respawnX = CHECKPOINT.respawnX;
    this.respawnY = CHECKPOINT.respawnY;
    for (let i = 0; i < 6; i += 1) {
      const px = this.checkpointX + (i - 2.5) * 4;
      const p = this.add.rectangle(px, CHECKPOINT.y + 20, 3, 3, PAL.NEON_CYAN, 1).setDepth(2);
      this.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(30, 55), alpha: 0, duration: 400, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
    this.cameras.main.zoomTo(1.05, 400, 'Sine.easeOut', false, (cam, progress) => { if (progress === 1) this.cameras.main.zoomTo(1.0, 350, 'Sine.easeIn'); });
    const cx = this.scale.width / 2; const cy = this.scale.height / 2 - 60;
    const panel = makeGlassPanel(this, cx, cy, 180, 40).setScrollFactor(0).setDepth(204).setAlpha(0);
    const label = this.add.text(cx, cy, 'CHECKPOINT', { fontFamily: 'monospace', fontSize: '12px', color: hex(PAL.NEON_CYAN) }).setOrigin(0.5).setScrollFactor(0).setDepth(205).setAlpha(0);
    this.tweens.add({ targets: [panel, label], alpha: 1, duration: 200 });
    this.time.delayedCall(1200, () => { this.tweens.add({ targets: [panel, label], alpha: 0, duration: 300, onComplete: () => { panel.destroy(); label.destroy(); } }); });
  }

  // ---- Cinematic pull on Bridge 1 entry (uses the camera zoom API directly) -
  bridgeCinematicPull() {
    if (this.s3PullDone) return;
    this.s3PullDone = true;
    const cam = this.cameras.main;
    cam.zoomTo(0.62, 900, 'Sine.easeOut', false, (c, p) => {
      if (p === 1) this.time.delayedCall(900, () => cam.zoomTo(1.0, 800, 'Sine.easeIn'));
    });
  }

  // ---- Overlap handlers -----------------------------------------------------
  onPlayerHit() {
    if (AssistMode.get('invincibility')) return;
    this.player.takeHit();
  }

  onShield() {
    if (!this.shieldPickup) return;
    this.player.hasShield = true;
    this.shieldPickup.destroy();
    this.shieldPickup = null;
    SFX.shieldPickup();
  }

  onCollect(player, c) {
    const { x, y } = c;
    this.tweens.killTweensOf(c);
    if (c.extras) c.extras.forEach((e) => { this.tweens.killTweensOf(e); e.destroy(); });
    c.destroy();
    this.collectedCount += 1;
    SFX.collect();
    spawnPickupShards(this, x, y, PAL.PLATFORM, 8, 30);
    this.player.visuals.flashCount(this.collectedCount, PAL.PLATFORM);
  }

  // ---- Level complete -------------------------------------------------------
  onLevelComplete() {
    if (this.levelDone) return;
    this.levelDone = true;
    Progression.complete(4);
    this.cameraController.cinematicEvent('portalReached', this);
    this.player.frozen = true;
    this.player.body.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
    this.hitPause(120);
    this.chromaticHit(0.8, 600);
    this.flashScreen(0xffffff, 0.6, 400);
    this.portal.activate();
    this.shakeScreen(400, 0.015);

    this.time.delayedCall(700, () => {
      const cx = this.scale.width / 2; const cy = this.scale.height / 2;
      const bg = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, PAL.BG, 0).setScrollFactor(0).setDepth(201);
      this.tweens.add({ targets: bg, alpha: 0.85, duration: 300 });
      const panel = makeGlassPanel(this, cx, cy, 360, 90).setScrollFactor(0).setDepth(202);
      const main = this.add.text(cx, cy - 8, 'LEVEL 4 COMPLETE', { fontFamily: 'monospace', fontSize: '30px', color: hex(PAL.NEON_CYAN) }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      const sub = this.add.text(cx, cy + 26, `${this.collectedCount} / ${this.totalCollectibles}  •  ${this.secretsFound} / ${HIDDEN_COLLECTIBLE_COUNT} SECRETS`, { fontFamily: 'monospace', fontSize: '13px', color: hex(PAL.TOWER_EDGE) }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      [[panel, cy], [main, cy - 8], [sub, cy + 26]].forEach(([o, ty]) => { o.y = ty + 20; o.alpha = 0; this.tweens.add({ targets: o, y: ty, alpha: 1, duration: 300, ease: 'Quad.easeOut' }); });
      const beatDiv = this.add.rectangle(cx, cy + 56, 300, 1, PAL.NEON_CYAN, 0).setScrollFactor(0).setDepth(203);
      const beat = this.add.text(cx, cy + 78, 'You break the skyline. The towers thin, the market falls away — and the light is finally close.', { fontFamily: 'monospace', fontSize: '11px', color: hex(PAL.NEON_CYAN), align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0);
      this.time.delayedCall(200, () => { this.tweens.add({ targets: beatDiv, alpha: 0.3, duration: 400 }); this.tweens.add({ targets: beat, alpha: 0.8, duration: 400 }); });
      this.time.delayedCall(1500, () => {
        const cont = this.add.text(cx, cy + 116, 'PRESS SPACE TO CONTINUE', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0.4);
        this.tweens.add({ targets: cont, alpha: { from: 0.15, to: 0.4 }, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.input.keyboard.once('keydown-SPACE', () => {
          this.cameras.main.fadeOut(500, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => { this.scene.stop('UI'); this.scene.start('MainMenu'); this.scene.stop('Level4'); });
        });
      });
    });
  }

  // ---- Title card -----------------------------------------------------------
  showTitleCard(line1, line2, accent) {
    const cx = this.scale.width / 2; const cy = this.scale.height / 2;
    const base = this.add.rectangle(cx, cy, 540, 70, PAL.BG, 0.55).setStrokeStyle(0.5, accent, 0.25);
    const tint = this.add.rectangle(cx, cy, 540, 70, accent, 0.04);
    const hi = this.add.rectangle(cx, cy - 34, 540, 1, 0xffffff, 0.15);
    const t1 = this.add.text(cx, cy - 14, line1, { fontFamily: 'monospace', fontSize: '12px', color: hex(accent) }).setOrigin(0.5);
    const div = this.add.rectangle(cx, cy + 2, 500, 1, accent, 0.2);
    const t2 = this.add.text(cx, cy + 16, line2, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', fontStyle: 'italic' }).setOrigin(0.5).setAlpha(0.6);
    const card = this.add.container(0, 0, [base, tint, hi, t1, div, t2]).setScrollFactor(0).setDepth(210).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 400, hold: 4000, yoyo: true, onComplete: () => card.destroy() });
  }

  // ---- Camera-effect helpers (used by Player.die + level complete) ----------
  shakeScreen(duration, intensity) { this.cameras.main.shake(duration, intensity); }

  chromaticHit(intensity, duration) {
    const cam = this.cameras.main;
    if (!cam.getPostPipeline) return;
    let p = cam.getPostPipeline(ChromaticAberrationPipeline);
    if (Array.isArray(p)) p = p[0];
    if (!p) return;
    p.uIntensity = intensity; p.uOffset = 0.008;
    this.tweens.add({ targets: p, uIntensity: 0, duration, ease: 'Power2' });
  }

  hitPause(duration) {
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.delayedCall(duration, () => { this.physics.resume(); this.tweens.resumeAll(); });
  }

  flashScreen(color, alpha, duration) {
    const f = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, color, alpha).setScrollFactor(0).setDepth(206);
    this.tweens.add({ targets: f, alpha: 0, duration, onComplete: () => f.destroy() });
  }

  // ---- Pause menu (RESUME / RESTART / ASSIST / MAIN MENU) — mirrors L2/L3 ----
  togglePause() { if (this.isPaused) this.resumeScene(); else this.pauseScene(); }

  pauseScene() {
    this.isPaused = true; this.pauseSelection = 0; this.pauseMode = 'main'; this.assistSelection = 0;
    this.physics.pause(); this.tweens.pauseAll(); this.time.paused = true;
    this.buildPauseOverlay();
  }

  resumeScene() {
    this.isPaused = false; this.pauseMode = 'main';
    this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false;
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null;
  }

  buildPauseOverlay() {
    const cx = this.scale.width / 2; const cy = this.scale.height / 2;
    const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, PAL.BG, 0.75).setScrollFactor(0).setDepth(300);
    const panel = makeGlassPanel(this, cx, cy, 280, 215).setScrollFactor(0).setDepth(301);
    const title = this.add.text(cx, cy - 64, 'PAUSED', { fontFamily: 'monospace', fontSize: '24px', color: hex(PAL.NEON_CYAN) }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
    const sep = this.add.rectangle(cx, cy - 40, 200, 1, PAL.NEON_CYAN, 0.6).setScrollFactor(0).setDepth(302);
    this.resumeText = this.add.text(cx - 60, cy - 14, 'RESUME', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.restartText = this.add.text(cx - 60, cy + 14, 'RESTART', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.assistText = this.add.text(cx - 60, cy + 42, 'ASSIST', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.mainMenuText = this.add.text(cx - 60, cy + 70, 'MAIN MENU', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.pauseUI = [dim, panel, title, sep, this.resumeText, this.restartText, this.assistText, this.mainMenuText];
    this.refreshPauseSelection();
  }

  refreshPauseSelection() {
    if (!this.resumeText) return;
    this.resumeText.setText(`${this.pauseSelection === 0 ? '> ' : '  '}RESUME`).setAlpha(this.pauseSelection === 0 ? 1 : 0.6);
    this.restartText.setText(`${this.pauseSelection === 1 ? '> ' : '  '}RESTART`).setAlpha(this.pauseSelection === 1 ? 1 : 0.6);
    this.assistText.setText(`${this.pauseSelection === 2 ? '> ' : '  '}ASSIST`).setAlpha(this.pauseSelection === 2 ? 1 : 0.6);
    this.mainMenuText.setText(`${this.pauseSelection === 3 ? '> ' : '  '}MAIN MENU`).setAlpha(this.pauseSelection === 3 ? 1 : 0.6);
  }

  updatePauseMenu() {
    if (this.pauseMode === 'assist') { this.updateAssistMenu(); return; }
    const k = this.pauseKeys;
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w)) { this.pauseSelection = Math.max(0, this.pauseSelection - 1); this.refreshPauseSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) { this.pauseSelection = Math.min(3, this.pauseSelection + 1); this.refreshPauseSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.pauseSelection === 0) {
        this.resumeScene();
      } else if (this.pauseSelection === 1) {
        this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false; this.isPaused = false; this.scene.restart();
      } else if (this.pauseSelection === 2) {
        this._openAssistOverlay();
      } else {
        this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false; this.isPaused = false;
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => { this.scene.stop('UI'); this.scene.start('MainMenu'); this.scene.stop('Level4'); });
      }
    }
  }

  _openAssistOverlay() {
    this.pauseMode = 'assist'; this.assistSelection = 0;
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null; this.buildAssistOverlay();
  }

  _closeAssistOverlay() {
    this.pauseMode = 'main';
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null; this.buildPauseOverlay();
  }

  buildAssistOverlay() {
    const cx = this.scale.width / 2; const cy = this.scale.height / 2;
    const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, PAL.BG, 0.75).setScrollFactor(0).setDepth(300);
    const panel = makeGlassPanel(this, cx, cy, 280, 220).setScrollFactor(0).setDepth(301);
    const header = this.add.text(cx, cy - 88, 'ASSIST MODE', { fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00' }).setOrigin(0.5).setScrollFactor(0).setDepth(302).setAlpha(0.6);
    const divider = this.add.rectangle(cx, cy - 75, 240, 1, 0xff6a00, 0.2).setScrollFactor(0).setDepth(302);
    const OPTIONS = [
      { key: 'reducedEnemySpeed', name: 'REDUCED ENEMY SPEED', desc: 'Enemies move at 60% normal speed' },
      { key: 'slowerGameSpeed', name: 'SLOWER GAME SPEED', desc: 'Game runs at 75% speed' },
      { key: 'invincibility', name: 'INVINCIBILITY', desc: 'Player cannot die' },
    ];
    const ROW_Y = [cy - 56, cy - 12, cy + 32];
    this.assistRows = OPTIONS.map((opt, i) => {
      const y = ROW_Y[i]; const on = AssistMode.get(opt.key);
      const arrow = this.add.text(cx - 108, y, '▶', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0);
      const checkbox = this.add.text(cx - 94, y, on ? '[✓]' : '[ ]', { fontFamily: 'monospace', fontSize: '12px', color: on ? '#ff6a00' : '#00ff88' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(on ? 0.9 : 0.4);
      const name = this.add.text(cx - 68, y, opt.name, { fontFamily: 'monospace', fontSize: '13px', color: '#00ff88' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.5);
      const desc = this.add.text(cx - 68, y + 15, opt.desc, { fontFamily: 'monospace', fontSize: '9px', color: '#00ff88' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.3);
      return { arrow, checkbox, name, desc, key: opt.key };
    });
    const backArrow = this.add.text(cx - 42, cy + 78, '▶', { fontFamily: 'monospace', fontSize: '10px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0);
    const backText = this.add.text(cx - 24, cy + 78, 'BACK', { fontFamily: 'monospace', fontSize: '10px', color: '#00ff88' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.4);
    this.assistBackRow = { arrow: backArrow, text: backText };
    this.pauseUI = [dim, panel, header, divider, ...this.assistRows.flatMap((r) => [r.arrow, r.checkbox, r.name, r.desc]), backArrow, backText];
    this.refreshAssistSelection();
  }

  refreshAssistSelection() {
    if (!this.assistRows) return;
    this.assistRows.forEach((row, i) => {
      const sel = i === this.assistSelection; const on = AssistMode.get(row.key);
      row.arrow.setAlpha(sel ? 1 : 0); row.name.setAlpha(sel ? 1 : 0.5); row.desc.setAlpha(sel ? 0.55 : 0.3);
      row.checkbox.setText(on ? '[✓]' : '[ ]'); row.checkbox.setColor(on ? '#ff6a00' : '#00ff88'); row.checkbox.setAlpha(on ? 0.9 : (sel ? 0.7 : 0.4));
    });
    if (this.assistBackRow) {
      const backSel = this.assistSelection === 3;
      this.assistBackRow.arrow.setAlpha(backSel ? 1 : 0); this.assistBackRow.text.setAlpha(backSel ? 1 : 0.4);
    }
  }

  updateAssistMenu() {
    const k = this.pauseKeys;
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w)) { this.assistSelection = Math.max(0, this.assistSelection - 1); this.refreshAssistSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) { this.assistSelection = Math.min(3, this.assistSelection + 1); this.refreshAssistSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.assistSelection === 3) this._closeAssistOverlay();
      else { const keys = ['reducedEnemySpeed', 'slowerGameSpeed', 'invincibility']; AssistMode.toggle(keys[this.assistSelection]); this.refreshAssistSelection(); }
    }
  }

  // ---- Main loop ------------------------------------------------------------
  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.mKey) || this.touchControls.mute.justDown) SFX.toggleMute();

    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc) && !this.levelDone) {
      if (this.isPaused && this.pauseMode === 'assist') this._closeAssistOverlay();
      else this.togglePause();
    }
    if (this.isPaused) { this.updatePauseMenu(); return; }
    if (this.levelDone) { this.player.update(time, delta); return; }

    const targetScale = AssistMode.get('slowerGameSpeed') ? ASSIST_MODE.GAME_SPEED_MULTIPLIER : 1.0;
    if (Math.abs(this.physics.world.timeScale - targetScale) > 0.001) {
      this.physics.world.timeScale = Phaser.Math.Linear(this.physics.world.timeScale, targetScale, 0.05);
    } else {
      this.physics.world.timeScale = targetScale;
    }

    this.player.update(time, delta);
    const px = this.player.x; const py = this.player.y;
    this.cameraController.update(this.player);

    // Cinematic pull when the player first steps onto Bridge 1.
    if (!this.s3PullDone && py < 8360 && py > 8180 && px < 6360 && px > 1700) this.bridgeCinematicPull();

    const near = (e) => Phaser.Math.Distance.Between(e.x, e.y, px, py) < 2400;
    for (const d of this.drones) { if (!d.active) continue; if (near(d)) d.update(time, delta); else if (d.freeze) d.freeze(); }
    for (const s of this.sentinels) if (s.active && near(s)) s.update(time, delta);
    for (const s of this.seekers) if (s.active && near(s)) s.update(time, delta);

    for (const mp of this.movers) {
      if (Phaser.Math.Distance.Between(mp.bodyRect.x, mp.bodyRect.y, px, py) < 1000) mp.update(delta);
    }

    // Carry the player when standing on a moving platform.
    if (this.player.body.blocked.down) {
      const pb = this.player.body;
      for (const mp of this._carriers) {
        const half = mp.bodyRect.width / 2;
        const onIt = px >= mp.bodyRect.x - half - 4 && px <= mp.bodyRect.x + half + 4 && Math.abs(pb.bottom - mp.body.top) < 8;
        if (onIt && (mp.deltaX || mp.deltaY)) {
          pb.x += mp.deltaX; pb.y += mp.deltaY;
          this.player.x = pb.x + pb.halfWidth; this.player.y = pb.y + pb.halfHeight;
          break;
        }
      }
    }

    this.portal.update(time, delta);
    this.diegeticHUD.update(time, delta);

    if (!this.player.isDead && this.player.y > DEATH_Y && !AssistMode.get('invincibility')) this.player.die();
  }
}
