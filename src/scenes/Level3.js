import Phaser from 'phaser';
import {
  PLAYER, ENEMY, DEV_MODE, ASSIST_MODE,
  HIDDEN_COLLECTIBLE_COUNT, HIDDEN_COLLECTIBLE_COLOR,
  PLAYER_SPEED_L3_BASE, L3_PALETTE_SHIFT_X, L3_PALETTE_SHIFT_DURATION,
  L3_TRAIN_SPEED_MID, L3_TRAIN_SPEED_NEAR,
} from '../constants.js';
import AssistMode from '../utils/AssistMode.js';
import Player from '../entities/Player.js';
import GroundDrone from '../entities/GroundDrone.js';
import HoverSentinel from '../entities/HoverSentinel.js';
import Seeker from '../entities/Seeker.js';
import ExitPortal from '../entities/ExitPortal.js';
import MovingPlatform from '../entities/MovingPlatform.js';
import ChromaticAberrationPipeline from '../pipelines/ChromaticAberrationPipeline.js';
import CameraController from '../camera/CameraController.js';
import DiegeticHUD from '../ui/DiegeticHUD.js';
import { buildPlatformVisual } from '../entities/platformVisual.js';
import { createCollectible, spawnPickupShards } from '../entities/collectible.js';
import { makeGlassPanel } from '../ui/glassPanel.js';
import SFX from '../audio/SFX.js';
import Progression from '../utils/Progression.js';

// =============================================================================
// Level 3 — Transit Network. A wide (16000x3200), horizontal electric-blue run
// across five sections. The continuous floor (y3100) is the spine; elevated
// static + moving platforms over jumpable gaps are the transit challenge.
// Decorative parallax train layers scroll behind. Structurally mirrors Level2:
// pipelines, lights, HUD, checkpoint, portal, title card, pause menu, juice.
// Camera uses CameraController in 'horizontal' mode (driven each frame).
// =============================================================================
const W = 16000;
const H = 3200;
const FLOOR_Y = 3100;
const DEATH_Y = 3240; // below the floor body — falling into a gap is lethal here

// Electric Blue palette (ints for the rendering helpers / MovingPlatform).
const P = {
  PLATFORM: 0x22eeff,     // neon edge / primary
  PLATFORM_DIM: 0x0a2a40, // platform fill + underside
  ACCENT: 0x88ffff,       // glow accent
  COLLECTIBLE: 0x22eeff,  // collectibles (electric cyan)
  AMBIENT: 0x0a1a2a,      // Light2D ambient
};

let level3TitleShown = false; // once per session

// Floor segments [cx, topY, w, h]; gaps between them require a jump:
//   gap1 3600–3800 · gap2 9600–9820 · gap3 11300–11520 · gap4 13900–14120
const GROUND = [
  [1800, FLOOR_Y, 3600, 120],   // x0–3600    (S1 + S2 start)
  [6700, FLOOR_Y, 5800, 120],   // x3800–9600 (S2 end · S3 checkpoint · S4 start)
  [10560, FLOOR_Y, 1480, 120],  // x9820–11300
  [12710, FLOOR_Y, 2380, 120],  // x11520–13900
  [15060, FLOOR_Y, 1880, 120],  // x14120–16000 (exit portal at 15600)
];

// Elevated static platforms [cx, topY, w, h].
const PLATFORMS = [
  [700, 2950, 160, 16], [1200, 2860, 160, 16], [1700, 2900, 160, 16], [2300, 2820, 160, 16], // S1
  [4400, 2820, 140, 16], [5100, 2880, 140, 16], [5700, 2780, 140, 16],                        // S2
  [6400, 2900, 160, 16], [6900, 2700, 160, 16], [7400, 2880, 160, 16], [7900, 2640, 160, 16], [8600, 2820, 160, 16], // S3
  [9300, 2860, 140, 16], [10000, 2700, 140, 16], [11800, 2780, 140, 16], [12400, 2640, 140, 16], // S4
  [13400, 2860, 140, 16], [14000, 2740, 140, 16], [14700, 2820, 140, 16], [15200, 2700, 160, 16], // S5
];

// Moving platforms [startX, topY, range, speed, axis]. Gap-bridge movers sit at
// floor level; the rest ride the rail heights.
const MOVERS = [
  // S2 — 6 rail platforms (first one bridges gap1)
  [3500, FLOOR_Y, 380, 130, 'x'], [4000, 2900, 320, 120, 'x'], [4500, 2820, 300, 140, 'x'],
  [5000, 2880, 320, 130, 'x'], [5400, 2780, 300, 150, 'x'], [5800, 2860, 300, 135, 'x'],
  // S3 — vertical movers between rail heights
  [7000, 2780, 360, 90, 'y'], [8100, 2760, 340, 95, 'y'],
  // S4 — denser, mixed (gap2 + gap3 bridges)
  [9500, FLOOR_Y, 400, 150, 'x'], [10200, 2820, 320, 150, 'x'], [10900, 2760, 320, 60, 'y'],
  [11200, FLOOR_Y, 420, 160, 'x'], [12200, 2820, 320, 160, 'x'],
  // S5 — fast, tight (gap4 bridge)
  [13800, FLOOR_Y, 400, 175, 'x'], [14400, 2820, 300, 180, 'x'], [15000, 2760, 280, 170, 'x'],
];

const DRONES = [[10000, 3060], [12300, 3060], [14500, 3060]];     // S4, S5 (settle on floor)
const SENTINELS = [[7400, 2650], [10300, 2620]];                  // S3, S4
const COLLECTIBLES = [[1700, 2820], [5100, 2800], [8600, 2740], [14000, 2660]]; // 4 visible
const SECRETS = [[6900, 2620], [12400, 2560]];                    // 2 hidden (orange)

export default class Level3 extends Phaser.Scene {
  constructor() {
    super('Level3');
  }

  create() {
    // Hard gate: reachable only once Level 2 is complete (bypassed in DEV_MODE).
    if (!Progression.hasCompleted(2) && !DEV_MODE) {
      this.scene.start('MainMenu');
      return;
    }

    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.world.setBoundsCollision(true, true, true, false); // open bottom (gaps are lethal)
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(0x030d18);

    // ---- State ----
    this.collectedCount = 0;
    this.secretsFound = 0;
    this.totalCollectibles = COLLECTIBLES.length; // HUD reads this
    this.levelDone = false;
    this.platforms = [];
    this.movers = [];
    this.movingBodies = [];
    this.collectibles = [];
    this.drones = [];
    this.sentinels = [];
    this.seekers = [];
    this.respawnX = 200;
    this.respawnY = 3000;
    this.checkpointActive = false;
    this.speedMultiplier = PLAYER_SPEED_L3_BASE / PLAYER.SPEED; // 1.10 at start
    this.speedStage = 0;        // 0=base, 1=+S2, 2=+S4 (multiplicative)
    this.paletteShifted = false;
    this.isPaused = false;
    this.pauseMode = 'main';
    this.pauseSelection = 0;
    this.assistSelection = 0;

    // ---- Post-FX (Bloom -> Chromatic -> CRT -> Grade) — same chain as L2 ----
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('BloomPipeline');
      this.cameras.main.setPostPipeline(ChromaticAberrationPipeline);
      this.cameras.main.setPostPipeline('CRTPipeline');
      this.cameras.main.setPostPipeline('ColorGradePipeline');
      // Cold-blue bias: the ColorGrade pipeline exposes no per-channel knobs, so
      // nudge its midtone tint cooler here (approximates the spec's cold cast
      // without editing the shared pipeline shader). The layered sky/background
      // below supplies the rest of the colour.
      let cg = this.cameras.main.getPostPipeline('ColorGradePipeline');
      if (Array.isArray(cg)) cg = cg[0];
      if (cg) { this.colorGrade = cg; cg.uMidtoneTint += 0.5; }
    }

    // ---- Lighting ----
    this.lights.enable();
    this.lights.setAmbientColor(P.AMBIENT);

    // ---- Multi-layer parallax background (sky, glow, city, trains, rails,
    // signals, particles) — all screen-anchored, redrawn each frame. ----
    this.buildBackground();

    // ---- Geometry ----
    GROUND.forEach(([cx, ty, w, h]) => this.addPlatform(cx, ty, w, h));
    PLATFORMS.forEach(([cx, ty, w, h]) => this.addPlatform(cx, ty, w, h));
    MOVERS.forEach(([sx, ty, range, speed, axis]) => {
      const mp = new MovingPlatform(this, sx, ty, 120, 14, axis, range, speed, P);
      this.movers.push(mp);
      this.movingBodies.push(mp.bodyRect);
    });

    // ---- Player: arrives from Level 2 with all core abilities. ----
    this.player = new Player(this, this.respawnX, this.respawnY);
    this.player.canDoubleJump = true;
    this.player.canDash = true;
    this.player.hasAttack = true;

    // ---- Checkpoint ----
    this.createCheckpoint();

    // ---- Enemies ----
    DRONES.forEach(([x, y]) => this.drones.push(new GroundDrone(this, x, y)));
    SENTINELS.forEach(([x, y]) => this.sentinels.push(new HoverSentinel(this, x, y)));
    this.seekers.push(new Seeker(this, 14600, 2950, this.player, { speed: ENEMY.SEEKER_SPEED, aggro: 300 }));

    // ---- Collectibles ----
    COLLECTIBLES.forEach(([x, y]) => this.collectibles.push(createCollectible(this, x, y, P.COLLECTIBLE, false)));
    SECRETS.forEach(([x, y]) => this.collectibles.push(createCollectible(this, x, y, HIDDEN_COLLECTIBLE_COLOR, true)));

    // ---- Exit portal ----
    this.portal = new ExitPortal(this, 15600, 3000);
    this.portal.glow.setPosition(15600, 3060); // glow tracks the portal (default y400)

    // ---- Colliders ----
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.movingBodies);
    this.physics.add.collider(this.drones, this.platforms);
    this.physics.add.overlap(this.player, this.drones, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.sentinels, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.seekers, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.collectibles, this.onCollect, null, this);
    this.physics.add.overlap(this.player, this.portal.trigger, this.onLevelComplete, null, this);
    this.physics.add.overlap(this.player, this.checkpoint, this.onCheckpoint, null, this);

    // Attack: the player's hitbox kills any enemy it overlaps.
    this.enemies = this.add.group([...this.drones, ...this.sentinels, ...this.seekers]);
    this.physics.add.overlap(this.player.attackHitbox, this.enemies, (hb, enemy) => enemy.die());

    // ---- Lights (player + portal + a few zone lights) ----
    this.playerLight = this.lights.addLight(0, 0, 360).setColor(P.PLATFORM).setIntensity(1.4);
    this.lights.addLight(15600, 3000, 260).setColor(P.ACCENT).setIntensity(1.2);
    [[2000, 2900], [6000, 2800], [10000, 2800], [13500, 2800]].forEach(([x, y]) => {
      this.lights.addLight(x, y, 1400).setColor(P.COLLECTIBLE).setIntensity(0.5);
    });

    // ---- Audio toggle ----
    this.mKey = this.input.keyboard.addKey('M');

    // ---- Pause ----
    this.pauseKeys = this.input.keyboard.addKeys({
      esc: 'ESC', up: 'UP', down: 'DOWN', w: 'W', s: 'S', space: 'SPACE', enter: 'ENTER',
    });

    // ---- HUD ----
    this.diegeticHUD = new DiegeticHUD(this, this.player);
    if (!this.scene.isActive('UI')) this.scene.launch('UI');

    // ---- Camera (CameraController, horizontal follow) ----
    this.cameraController = new CameraController(this, this.cameras.main, 'horizontal');

    // ---- Opening title card (once per session; skipped in DEV_MODE) ----
    if (!DEV_MODE && !level3TitleShown) {
      level3TitleShown = true;
      this.showTitleCard('TRANSIT NETWORK — TIER 3', 'The city moves. So must you.', 0x22eeff);
    }
  }

  // ---------------------------------------------------------------------------
  // Parallax train background — far buildings (0.1), mid trains (0.2), near
  // trains (0.4). Trains drift left and wrap; near trains carry a motion-blur
  // trail. Train rows live in the visible world band (the camera tracks ~y2400–
  // 3100), adapted from the spec's abstract background-layer Y values.
  // ===========================================================================
  // Multi-layer parallax background. Every layer is a screen-anchored Graphics
  // (scrollFactor 0) cleared + redrawn each frame, parallaxed by hand via
  // camera.scrollX * factor — the same pattern L2 uses. Data + timers are
  // allocated once here; update() only redraws + advances scalar positions.
  // Vertical layout is authored in a 600px design space and scaled to the real
  // viewport height (sf); horizontal sizes/spacing stay in design px.
  // ===========================================================================
  buildBackground() {
    const vw = this.scale.width;
    const vh = this.scale.height;
    this.BG_BAND = 6000; // tiling width for the city / glow / signal bands

    // Shared palette (tweened at the x8000 shift; read each frame when drawing).
    this.bgPalette = { neon: 0x22eeff, accent: 0x88ffff, skyBottom: 0x030d18 };

    // Seeded RNG (mulberry32) so the city/layout is identical every run.
    let t = 9931 >>> 0;
    const rng = () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    // Layer Graphics (created back-to-front; same-depth ties resolve by order).
    this.gSky = this.add.graphics().setScrollFactor(0).setDepth(-11);
    this.gGlow = this.add.graphics().setScrollFactor(0).setDepth(-10);
    this.gCity = this.add.graphics().setScrollFactor(0).setDepth(-10);
    this.gDeep = this.add.graphics().setScrollFactor(0).setDepth(-9);
    this.gSignals = this.add.graphics().setScrollFactor(0).setDepth(-9);
    this.gRails = this.add.graphics().setScrollFactor(0).setDepth(-8);
    this.gMid = this.add.graphics().setScrollFactor(0).setDepth(-8);
    this.gNear = this.add.graphics().setScrollFactor(0).setDepth(-7);
    this.gParticles = this.add.graphics().setScrollFactor(0).setDepth(-6);

    // Moon — a glowing disc sitting behind the skyline (depth between sky and
    // city), plus a Light2D "moonlight" that tracks the moon's on-screen position
    // each frame so it casts a cool, gently pulsing glow over the lit world.
    this.gMoon = this.add.graphics().setScrollFactor(0).setDepth(-10.5);
    this.moonLight = this.lights.addLight(0, 0, 900).setColor(0x88ccff).setIntensity(1.0);

    // Distant glow columns (static).
    this.glowCols = [];
    for (let i = 0; i < 4; i++) this.glowCols.push({ x: (i + 0.5) * (this.BG_BAND / 4), alpha: 0.03 + rng() * 0.02 });

    // City silhouette (~40 buildings; every 5th gets a pulsing rooftop light).
    this.buildings = [];
    let bx = 0; let bi = 0;
    while (bx < this.BG_BAND && this.buildings.length < 40) {
      const bw = 30 + rng() * 70;
      const bh = 80 + rng() * 240;
      const b = { x: bx, w: bw, h: bh, color: rng() < 0.5 ? 0x071a2e : 0x0a2040, lit: bi % 5 === 0, blue: false };
      this.buildings.push(b);
      if (b.lit) this.time.addEvent({ delay: 3000 + rng() * 4000, loop: true, callback: () => { b.blue = !b.blue; } });
      bx += bw + 8 + rng() * 22; bi++;
    }

    // Trains: deep (factor 0.1) / mid (0.2) / near (0.4). y in 600-design space.
    this.deepTrains = [
      this.makeTrain(rng() * vw, 180, 6, 50, 22, 3, 0x0a2a40, 'neon', 0.4, 0.1, L3_TRAIN_SPEED_MID * (0.3 + rng() * 0.2), { windows: true }),
      this.makeTrain(rng() * vw, 280, 6, 50, 22, 3, 0x0a2a40, 'neon', 0.4, 0.1, L3_TRAIN_SPEED_MID * (0.3 + rng() * 0.2), {}),
      this.makeTrain(rng() * vw, 380, 6, 50, 22, 3, 0x0a2a40, 'neon', 0.4, 0.1, L3_TRAIN_SPEED_MID * (0.3 + rng() * 0.2), {}),
    ];
    this.midTrains = [
      this.makeTrain(rng() * vw, 220, 6, 70, 28, 3, 0x0d3550, 0x33ddff, 0.6, 0.2, 1.2 + rng() * 0.6, { blur: 24, blurAlpha: 0.12 }),
      this.makeTrain(rng() * vw, 380, 6, 70, 28, 3, 0x0d3550, 0x33ddff, 0.6, 0.2, 1.2 + rng() * 0.6, { accent: true, blur: 24, blurAlpha: 0.12 }),
      this.makeTrain(rng() * vw, 300, 6, 70, 28, 3, 0x0d3550, 0x33ddff, 0.6, 0.2, 1.2 + rng() * 0.6, { blur: 24, blurAlpha: 0.12 }),
    ];
    this.nearTrains = [
      this.makeTrain(rng() * vw, 160, 6, 90, 34, 3, 0x102040, 0x55ffff, 0.8, 0.4, L3_TRAIN_SPEED_NEAR * (0.9 + rng() * 0.3), { blur: 40, blurAlpha: 0.20, near: true }),
      this.makeTrain(rng() * vw, 440, 6, 90, 34, 3, 0x102040, 0x55ffff, 0.8, 0.4, L3_TRAIN_SPEED_NEAR * (0.9 + rng() * 0.3), { blur: 40, blurAlpha: 0.20, near: true }),
    ];
    this.sweepT = 0; // near-train light-sweep timer (ms)

    // Rail lines (design-space Y).
    this.railYs = [200, 300, 380, 460];

    // Signal light columns (12; cycle green -> amber -> red on staggered timers).
    this.SIG_COLORS = [0x33ff88, 0xffaa00, 0xff3333];
    this.signals = [];
    for (let i = 0; i < 12; i++) {
      const s = { x: (i + 0.5) * (this.BG_BAND / 12), ci: Math.floor(rng() * 3) };
      this.signals.push(s);
      this.time.addEvent({ delay: 2000 + rng() * 2000, loop: true, callback: () => { s.ci = (s.ci + 1) % 3; } });
    }

    // Atmospheric particles (drift in screen space; pre-allocated).
    const PCOLORS = [0x22eeff, 0x88ffff, 0xffffff, 0x0088cc];
    this.bgParticles = [];
    for (let i = 0; i < 30; i++) {
      this.bgParticles.push({
        x: rng() * vw, y: rng() * vh,
        vx: 0.2 + rng() * 0.4, vy: 0.05 + rng() * 0.05,
        color: PCOLORS[Math.floor(rng() * PCOLORS.length)],
        alpha: 0.2 + rng() * 0.3, size: 1 + Math.round(rng()),
      });
    }
  }

  // Train descriptor (drawn fresh each frame; no GameObjects). edge 'neon' reads
  // the (shifting) palette neon; a number is a fixed colour.
  makeTrain(x, y600, cars, cw, ch, gap, body, edge, edgeAlpha, factor, speed, opts = {}) {
    return {
      x, y600, cars, cw, ch, gap, body, edge, edgeAlpha, factor, speed,
      width: cars * (cw + gap),
      windows: !!opts.windows, accent: !!opts.accent,
      blur: opts.blur || 0, blurAlpha: opts.blurAlpha || 0, near: !!opts.near,
    };
  }

  // Draw + advance one train into Graphics g. Drifts left; wraps via modulo so
  // it tiles across the parallax layer regardless of camera scroll.
  drawTrain(g, tr, sx, sf, vw, step) {
    tr.x -= tr.speed * step; // drift left in px/frame
    const period = vw + tr.width + 80;
    let dx = (tr.x - sx * tr.factor) % period;
    if (dx < 0) dx += period;
    dx -= tr.width; // visible range [-width, vw+80]
    const y = tr.y600 * sf;
    const ch = tr.ch * sf;
    const top = y - ch / 2;
    const bot = y + ch / 2;
    const cw = tr.cw;
    const edgeC = tr.edge === 'neon' ? this.bgPalette.neon : tr.edge;
    const winC = tr.windows ? this.bgPalette.accent : edgeC;
    const winA = tr.windows ? 0.45 : 0.3;
    const DARK = 0x05101c; // underframe / wheels / couplers

    if (tr.blur) { // motion-blur trail (behind = to the right, since moving left)
      g.fillStyle(tr.body, tr.blurAlpha);
      g.fillRect(dx + tr.width, top, tr.blur, ch);
    }

    for (let c = 0; c < tr.cars; c++) {
      const cx0 = dx + c * (cw + tr.gap);
      if (cx0 > vw + 40 || cx0 + cw < -40) continue;
      const isFront = c === 0; // leading car (the train moves left)

      // Car body + neon roof strip.
      g.fillStyle(tr.body, 0.92); g.fillRect(cx0, top, cw, ch);
      g.fillStyle(edgeC, tr.edgeAlpha); g.fillRect(cx0, top, cw, Math.max(2, 2 * sf));

      // Lit window row (the lead car keeps its front clear for the cab).
      const wy = top + ch * 0.26;
      const wh = ch * 0.30;
      g.fillStyle(winC, winA);
      for (let wx = (isFront ? cw * 0.42 : cw * 0.12); wx < cw - 6; wx += 12) {
        g.fillRect(cx0 + wx, wy, 7, wh);
      }

      // Underframe skirt + a warm cargo stripe on accent cars.
      g.fillStyle(DARK, 0.9); g.fillRect(cx0, bot - ch * 0.16, cw, ch * 0.16);
      if (tr.accent && c % 3 === 1) { g.fillStyle(0xff6600, 0.3); g.fillRect(cx0, bot - ch * 0.16, cw, 3); }

      // Bogies (two wheel blocks beneath the car).
      const wheelH = Math.max(2, ch * 0.12);
      g.fillStyle(DARK, 1);
      g.fillRect(cx0 + cw * 0.18, bot - 1, cw * 0.18, wheelH);
      g.fillRect(cx0 + cw * 0.64, bot - 1, cw * 0.18, wheelH);

      // Coupler nub to the next car.
      if (c < tr.cars - 1) { g.fillStyle(DARK, 1); g.fillRect(cx0 + cw, y - 1.5, tr.gap, 3); }

      // Lead car: solid cab face + headlight at the nose.
      if (isFront) {
        g.fillStyle(tr.body, 1); g.fillRect(cx0, top + ch * 0.1, cw * 0.34, ch * 0.9);
        g.fillStyle(0xffffcc, 0.9); g.fillRect(cx0 + 2, y, 4, Math.max(3, ch * 0.18));
      }

      // Pantograph (overhead power arm) on the second car's roof.
      if (c === 1) {
        const px = cx0 + cw * 0.5; const pTop = top - ch * 0.45;
        g.lineStyle(Math.max(1, 1.2 * sf), edgeC, 0.7);
        g.lineBetween(px - cw * 0.12, top, px, pTop);
        g.lineBetween(px + cw * 0.12, top, px, pTop);
        g.lineBetween(px - cw * 0.16, pTop, px + cw * 0.16, pTop); // contact bar
      }
    }

    // Near trains flash a wide light sweep as they cross mid-screen.
    if (tr.near) {
      const centre = dx + tr.width / 2;
      if (centre > vw * 0.4 && centre < vw * 0.6) this.sweepT = Math.max(this.sweepT, 300);
    }
  }

  updateBackground(delta) {
    const vw = this.scale.width;
    const vh = this.scale.height;
    const sf = vh / 600;                 // 600-design-space -> viewport height
    const sx = this.cameras.main.scrollX;
    const sy = this.cameras.main.scrollY;
    const step = delta / 16.67;          // ~per-frame units at 60fps
    const pal = this.bgPalette;
    const band = this.BG_BAND;

    // --- Sky gradient (static; bottom band reads the shifting palette) ---
    const sky = this.gSky; sky.clear();
    sky.fillStyle(0x020810, 1); sky.fillRect(0, 0, vw, vh * 0.34);
    sky.fillStyle(0x041428, 1); sky.fillRect(0, vh * 0.34, vw, vh * 0.33);
    sky.fillStyle(pal.skyBottom, 1); sky.fillRect(0, vh * 0.67, vw, vh * 0.34);

    // --- Moon (behind the skyline) + dynamic moonlight ---
    const moonX = vw * 0.80;
    const moonY = vh * 0.20;
    const mPulse = 0.88 + 0.12 * Math.sin(this.time.now / 1600);
    const moon = this.gMoon; moon.clear();
    moon.fillStyle(0x88ccff, 0.05 * mPulse); moon.fillCircle(moonX, moonY, 96);
    moon.fillStyle(0x88ccff, 0.09 * mPulse); moon.fillCircle(moonX, moonY, 62);
    moon.fillStyle(0xaad8ff, 0.20 * mPulse); moon.fillCircle(moonX, moonY, 42);
    moon.fillStyle(0xddf0ff, 0.95); moon.fillCircle(moonX, moonY, 26);            // core
    moon.fillStyle(0xbfe0ff, 0.5); moon.fillCircle(moonX - 8, moonY - 6, 5);      // craters
    moon.fillStyle(0xbfe0ff, 0.5); moon.fillCircle(moonX + 7, moonY + 8, 4);
    // Moonlight tracks the moon's world position (screen pos + camera scroll).
    this.moonLight.x = sx + moonX;
    this.moonLight.y = sy + moonY;
    this.moonLight.setIntensity(0.85 + 0.25 * Math.sin(this.time.now / 1600));

    // --- Distant glow columns (factor 0.08) ---
    const glow = this.gGlow; glow.clear();
    const glowOff = (sx * 0.08) % band;
    for (let base = -band; base < vw; base += band) {
      for (const c of this.glowCols) {
        const x = base - glowOff + c.x;
        if (x > vw || x + 60 < 0) continue;
        glow.fillStyle(pal.neon, c.alpha); glow.fillRect(x, 0, 60, vh);
      }
    }

    // --- City silhouette (factor 0.05) + rooftop lights ---
    const city = this.gCity; city.clear();
    const cityOff = (sx * 0.05) % band;
    for (let base = -band; base < vw; base += band) {
      for (const b of this.buildings) {
        const x = base - cityOff + b.x;
        if (x > vw || x + b.w < 0) continue;
        const bh = b.h * sf;
        city.fillStyle(b.color, 1); city.fillRect(x, vh - bh, b.w, bh);
        if (b.lit) {
          city.fillStyle(b.blue ? pal.neon : 0xff4444, 0.9);
          city.fillRect(x + b.w / 2 - 2, vh - bh - 6, 4, 4);
        }
      }
    }

    // --- Rail lines (full-width bands at design Ys) ---
    const rails = this.gRails; rails.clear();
    for (const ry of this.railYs) {
      const y = ry * sf;
      rails.fillStyle(0x0d3050, 1); rails.fillRect(0, y, vw, 2);
      rails.fillStyle(pal.neon, 0.3); rails.fillRect(0, y - 1, vw, 1);
    }

    // --- Signal light columns (factor 0.15) ---
    const sig = this.gSignals; sig.clear();
    const sigOff = (sx * 0.15) % band;
    const postH = 60 * sf; const baseY = vh * 0.55;
    for (let base = -band; base < vw; base += band) {
      for (const s of this.signals) {
        const x = base - sigOff + s.x;
        if (x > vw || x + 12 < 0) continue;
        const col = this.SIG_COLORS[s.ci];
        sig.fillStyle(0x071a2e, 1); sig.fillRect(x, baseY - postH, 3, postH);
        sig.fillStyle(col, 0.15); sig.fillCircle(x + 5, baseY - postH - 7, 12);
        sig.fillStyle(col, 0.9); sig.fillRect(x, baseY - postH - 14, 10, 14);
      }
    }

    // --- Trains (deep -> mid -> near) ---
    const gd = this.gDeep; gd.clear();
    for (const tr of this.deepTrains) this.drawTrain(gd, tr, sx, sf, vw, step);
    const gm = this.gMid; gm.clear();
    for (const tr of this.midTrains) this.drawTrain(gm, tr, sx, sf, vw, step);
    const gn = this.gNear; gn.clear();
    for (const tr of this.nearTrains) this.drawTrain(gn, tr, sx, sf, vw, step);
    // Near-train light sweep washes across the full width, fading over 0.3s.
    if (this.sweepT > 0) {
      this.sweepT -= delta;
      gn.fillStyle(pal.neon, 0.06 * Math.max(0, this.sweepT / 300));
      gn.fillRect(0, 0, vw, vh);
    }

    // --- Atmospheric particles (screen-space drift + wrap) ---
    const gp = this.gParticles; gp.clear();
    for (const p of this.bgParticles) {
      p.x -= p.vx * step; p.y += p.vy * step;
      if (p.x < -2) { p.x = vw + 2; p.y = Math.random() * vh; }
      if (p.y > vh + 2) p.y = -2;
      gp.fillStyle(p.color, p.alpha); gp.fillRect(p.x, p.y, p.size, p.size);
    }
  }

  // Static platform: layered visual + static body + Light2D.
  addPlatform(cx, topY, w, h) {
    const { body } = buildPlatformVisual(this, cx, topY, w, h, P, false);
    body.setPipeline('Light2D');
    this.physics.add.existing(body, true);
    this.platforms.push(body);
  }

  // ---- Checkpoint (x8000) — mirrors Level 2 ---------------------------------
  createCheckpoint() {
    const x = 8000;
    const y = 3000;
    this.checkpoint = this.add.rectangle(x, y, 20, 36, P.PLATFORM, 0.7).setDepth(1);
    this.physics.add.existing(this.checkpoint, true);
    this.checkpointEdge = this.add.rectangle(x - 9, y, 2, 36, P.PLATFORM, 1).setDepth(1);
    this.add.text(x, y - 26, '//SAVE', { fontFamily: 'monospace', fontSize: '7px', color: '#22eeff' })
      .setOrigin(0.5).setAlpha(0.5).setDepth(1);
  }

  onCheckpoint() {
    if (this.checkpointActive) return;
    this.checkpointActive = true;
    SFX.checkpoint();
    this.checkpoint.setFillStyle(P.PLATFORM, 1);
    this.respawnX = 8000;
    this.respawnY = 2980;
    for (let i = 0; i < 6; i++) {
      const px = 8000 + (i - 2.5) * 4;
      const p = this.add.rectangle(px, 2990, 3, 3, P.PLATFORM, 1).setDepth(2);
      this.tweens.add({ targets: p, y: 2990 - Phaser.Math.Between(30, 55), alpha: 0, duration: 400, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
    this.cameras.main.zoomTo(1.05, 400, 'Sine.easeOut', false, (cam, progress) => {
      if (progress === 1) this.cameras.main.zoomTo(1.0, 350, 'Sine.easeIn');
    });
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2 - 60;
    const panel = makeGlassPanel(this, cx, cy, 180, 40).setScrollFactor(0).setDepth(204).setAlpha(0);
    const label = this.add.text(cx, cy, 'CHECKPOINT', { fontFamily: 'monospace', fontSize: '12px', color: '#22eeff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(205).setAlpha(0);
    this.tweens.add({ targets: [panel, label], alpha: 1, duration: 200 });
    this.time.delayedCall(1200, () => {
      this.tweens.add({ targets: [panel, label], alpha: 0, duration: 300, onComplete: () => { panel.destroy(); label.destroy(); } });
    });
  }

  // ---- Overlap handlers -----------------------------------------------------
  onPlayerHit() {
    if (AssistMode.get('invincibility')) return;
    this.player.takeHit();
  }

  onCollect(player, c) {
    const { x, y } = c;
    const hidden = !!c.hidden;
    this.tweens.killTweensOf(c);
    if (c.extras) c.extras.forEach((e) => { this.tweens.killTweensOf(e); e.destroy(); });
    c.destroy();
    if (hidden) {
      this.secretsFound++;
      SFX.collectSecret();
      spawnPickupShards(this, x, y, HIDDEN_COLLECTIBLE_COLOR, 12, 45);
      this.player.visuals.flashCount(this.secretsFound, HIDDEN_COLLECTIBLE_COLOR, 1200);
    } else {
      this.collectedCount++;
      SFX.collect();
      spawnPickupShards(this, x, y, P.COLLECTIBLE, 8, 30);
      this.player.visuals.flashCount(this.collectedCount, P.COLLECTIBLE);
    }
  }

  // ---- Level complete -------------------------------------------------------
  onLevelComplete() {
    if (this.levelDone) return;
    this.levelDone = true;
    Progression.complete(3);
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
      const cx = this.scale.width / 2;
      const cy = this.scale.height / 2;
      const bg = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x030d18, 0).setScrollFactor(0).setDepth(201);
      this.tweens.add({ targets: bg, alpha: 0.85, duration: 300 });
      const panel = makeGlassPanel(this, cx, cy, 340, 90).setScrollFactor(0).setDepth(202);
      const main = this.add.text(cx, cy - 8, 'LEVEL 3 COMPLETE', { fontFamily: 'monospace', fontSize: '30px', color: '#22eeff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(203);
      const sub = this.add.text(cx, cy + 26, `${this.collectedCount} / ${this.totalCollectibles}  •  ${this.secretsFound} / ${HIDDEN_COLLECTIBLE_COUNT} SECRETS`, {
        fontFamily: 'monospace', fontSize: '13px', color: '#88ffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      [[panel, cy], [main, cy - 8], [sub, cy + 26]].forEach(([o, ty]) => {
        o.y = ty + 20; o.alpha = 0;
        this.tweens.add({ targets: o, y: ty, alpha: 1, duration: 300, ease: 'Quad.easeOut' });
      });

      const beatDiv = this.add.rectangle(cx, cy + 56, 280, 1, 0x22eeff, 0).setScrollFactor(0).setDepth(203);
      const beat = this.add.text(cx, cy + 78, 'The upper city is close. You can feel its pull.', {
        fontFamily: 'monospace', fontSize: '11px', color: '#22eeff', align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0);
      this.time.delayedCall(200, () => {
        this.tweens.add({ targets: beatDiv, alpha: 0.3, duration: 400 });
        this.tweens.add({ targets: beat, alpha: 0.8, duration: 400 });
      });

      this.time.delayedCall(1500, () => {
        const cont = this.add.text(cx, cy + 116, 'PRESS SPACE TO CONTINUE', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' })
          .setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0.4);
        this.tweens.add({ targets: cont, alpha: { from: 0.15, to: 0.4 }, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.input.keyboard.once('keydown-SPACE', () => {
          this.cameras.main.fadeOut(500, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.stop('UI');
            this.scene.start('MainMenu');
            this.scene.stop('Level3');
          });
        });
      });
    });
  }

  // ---- Title card (mirrors Level 2) -----------------------------------------
  showTitleCard(line1, line2, accent) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const accentStr = `#${accent.toString(16).padStart(6, '0')}`;
    const base = this.add.rectangle(cx, cy, 480, 70, 0x030d18, 0.55).setStrokeStyle(0.5, accent, 0.25);
    const tint = this.add.rectangle(cx, cy, 480, 70, accent, 0.04);
    const hi = this.add.rectangle(cx, cy - 34, 480, 1, 0xffffff, 0.15);
    const t1 = this.add.text(cx, cy - 14, line1, { fontFamily: 'monospace', fontSize: '12px', color: accentStr }).setOrigin(0.5);
    const div = this.add.rectangle(cx, cy + 2, 440, 1, accent, 0.2);
    const t2 = this.add.text(cx, cy + 16, line2, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', fontStyle: 'italic' }).setOrigin(0.5).setAlpha(0.6);
    const card = this.add.container(0, 0, [base, tint, hi, t1, div, t2]).setScrollFactor(0).setDepth(210).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 400, hold: 4000, yoyo: true, onComplete: () => card.destroy() });
  }

  // ---- Mid-level palette shift (x > 8000): tween the shared background palette
  // over 3s. Every layer reads bgPalette when it draws, so neon (#22eeff ->
  // #00ddff), accent (#88ffff -> #aaffff) and the sky bottom (#030d18 ->
  // #041e30) all drift together. ----
  triggerPaletteShift() {
    if (this.paletteShifted) return;
    this.paletteShifted = true;
    const from = { neon: 0x22eeff, accent: 0x88ffff, sky: 0x030d18 };
    const to = { neon: 0x00ddff, accent: 0xaaffff, sky: 0x041e30 };
    const lerp = (a, b, tt) => {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(a), Phaser.Display.Color.IntegerToColor(b), 100, tt * 100,
      );
      return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    };
    this.tweens.addCounter({
      from: 0, to: 1, duration: L3_PALETTE_SHIFT_DURATION, ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const v = tw.getValue();
        this.bgPalette.neon = lerp(from.neon, to.neon, v);
        this.bgPalette.accent = lerp(from.accent, to.accent, v);
        this.bgPalette.skyBottom = lerp(from.sky, to.sky, v);
      },
    });
  }

  // ---- Camera-effect helpers (copied from L2) -------------------------------
  shakeScreen(duration, intensity) { this.cameras.main.shake(duration, intensity); }

  chromaticHit(intensity, duration) {
    const cam = this.cameras.main;
    if (!cam.getPostPipeline) return;
    let p = cam.getPostPipeline(ChromaticAberrationPipeline);
    if (Array.isArray(p)) p = p[0];
    if (!p) return;
    p.uIntensity = intensity;
    p.uOffset = 0.008;
    this.tweens.add({ targets: p, uIntensity: 0, duration, ease: 'Power2' });
  }

  hitPause(duration) {
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.delayedCall(duration, () => { this.physics.resume(); this.tweens.resumeAll(); });
  }

  flashScreen(color, alpha, duration) {
    const f = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, color, alpha)
      .setScrollFactor(0).setDepth(206);
    this.tweens.add({ targets: f, alpha: 0, duration, onComplete: () => f.destroy() });
  }

  // ---- Pause menu (RESUME / RESTART / ASSIST / MAIN MENU) — mirrors L2 -------
  togglePause() { if (this.isPaused) this.resumeScene(); else this.pauseScene(); }

  pauseScene() {
    this.isPaused = true;
    this.pauseSelection = 0;
    this.pauseMode = 'main';
    this.assistSelection = 0;
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.buildPauseOverlay();
  }

  resumeScene() {
    this.isPaused = false;
    this.pauseMode = 'main';
    this.physics.resume();
    this.tweens.resumeAll();
    this.time.paused = false;
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null;
  }

  buildPauseOverlay() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x030d18, 0.75).setScrollFactor(0).setDepth(300);
    const panel = makeGlassPanel(this, cx, cy, 280, 215).setScrollFactor(0).setDepth(301);
    const title = this.add.text(cx, cy - 64, 'PAUSED', { fontFamily: 'monospace', fontSize: '24px', color: '#22eeff' }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
    const sep = this.add.rectangle(cx, cy - 40, 200, 1, 0x22eeff, 0.6).setScrollFactor(0).setDepth(302);
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
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w)) {
      this.pauseSelection = Math.max(0, this.pauseSelection - 1); this.refreshPauseSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) {
      this.pauseSelection = Math.min(3, this.pauseSelection + 1); this.refreshPauseSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.pauseSelection === 0) {
        this.resumeScene();
      } else if (this.pauseSelection === 1) {
        this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false; this.isPaused = false;
        this.scene.restart();
      } else if (this.pauseSelection === 2) {
        this._openAssistOverlay();
      } else {
        this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false; this.isPaused = false;
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.stop('UI');
          this.scene.start('MainMenu');
          this.scene.stop(this.scene.key); // 'Level3'
        });
      }
    }
  }

  _openAssistOverlay() {
    this.pauseMode = 'assist';
    this.assistSelection = 0;
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null;
    this.buildAssistOverlay();
  }

  _closeAssistOverlay() {
    this.pauseMode = 'main';
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null;
    this.buildPauseOverlay();
  }

  buildAssistOverlay() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x030d18, 0.75).setScrollFactor(0).setDepth(300);
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
      const y = ROW_Y[i];
      const on = AssistMode.get(opt.key);
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
      const sel = i === this.assistSelection;
      const on = AssistMode.get(row.key);
      row.arrow.setAlpha(sel ? 1 : 0);
      row.name.setAlpha(sel ? 1 : 0.5);
      row.desc.setAlpha(sel ? 0.55 : 0.3);
      row.checkbox.setText(on ? '[✓]' : '[ ]');
      row.checkbox.setColor(on ? '#ff6a00' : '#00ff88');
      row.checkbox.setAlpha(on ? 0.9 : (sel ? 0.7 : 0.4));
    });
    if (this.assistBackRow) {
      const backSel = this.assistSelection === 3;
      this.assistBackRow.arrow.setAlpha(backSel ? 1 : 0);
      this.assistBackRow.text.setAlpha(backSel ? 1 : 0.4);
    }
  }

  updateAssistMenu() {
    const k = this.pauseKeys;
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w)) {
      this.assistSelection = Math.max(0, this.assistSelection - 1); this.refreshAssistSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) {
      this.assistSelection = Math.min(3, this.assistSelection + 1); this.refreshAssistSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.assistSelection === 3) {
        this._closeAssistOverlay();
      } else {
        const keys = ['reducedEnemySpeed', 'slowerGameSpeed', 'invincibility'];
        AssistMode.toggle(keys[this.assistSelection]);
        this.refreshAssistSelection();
      }
    }
  }

  // ---- Main loop ------------------------------------------------------------
  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.mKey)) SFX.toggleMute();

    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc) && !this.levelDone) {
      if (this.isPaused && this.pauseMode === 'assist') this._closeAssistOverlay();
      else this.togglePause();
    }
    if (this.isPaused) { this.updatePauseMenu(); return; }

    if (this.levelDone) { this.player.update(time, delta); return; }

    // Assist mode: smooth physics timeScale toward target (0.75 or 1.0).
    const targetScale = AssistMode.get('slowerGameSpeed') ? ASSIST_MODE.GAME_SPEED_MULTIPLIER : 1.0;
    if (Math.abs(this.physics.world.timeScale - targetScale) > 0.001) {
      this.physics.world.timeScale = Phaser.Math.Linear(this.physics.world.timeScale, targetScale, 0.05);
    } else {
      this.physics.world.timeScale = targetScale;
    }

    this.updateBackground(delta);
    this.player.update(time, delta);

    const px = this.player.x;
    const py = this.player.y;

    // ---- Speed progression: base 1.10 -> +5% (S2, x3000) -> +5% (S4, x9000) ----
    if (this.speedStage < 1 && px >= 3000) { this.speedStage = 1; this.speedMultiplier *= 1.05; }
    if (this.speedStage < 2 && px >= 9000) { this.speedStage = 2; this.speedMultiplier *= 1.05; }
    this.player.setSpeedMultiplier(this.speedMultiplier);

    // ---- Mid-level palette shift at x8000 ----
    if (px > L3_PALETTE_SHIFT_X) this.triggerPaletteShift();

    // ---- Camera (horizontal follow) ----
    this.cameraController.update(this.player);

    // ---- Enemies (skip AI > 2400px from player) ----
    const near = (e) => Phaser.Math.Distance.Between(e.x, e.y, px, py) < 2400;
    for (const d of this.drones) {
      if (!d.active) continue;
      if (near(d)) d.update(time, delta); else if (d.freeze) d.freeze();
    }
    for (const s of this.sentinels) if (s.active && near(s)) s.update(time, delta);
    for (const s of this.seekers) if (s.active && near(s)) s.update(time, delta);

    // ---- Moving platforms (skip > 1000px from player) ----
    for (const mp of this.movers) {
      if (Phaser.Math.Distance.Between(mp.bodyRect.x, mp.bodyRect.y, px, py) < 1000) mp.update(delta);
    }

    // ---- Carry the player when standing on a moving platform ----
    if (this.player.body.blocked.down) {
      const pb = this.player.body;
      for (const mp of this.movers) {
        const half = mp.bodyRect.width / 2;
        const onIt = px >= mp.bodyRect.x - half - 4 && px <= mp.bodyRect.x + half + 4
          && Math.abs(pb.bottom - mp.body.top) < 8;
        if (onIt && (mp.deltaX || mp.deltaY)) {
          pb.x += mp.deltaX; pb.y += mp.deltaY;
          this.player.x = pb.x + pb.halfWidth; this.player.y = pb.y + pb.halfHeight;
          break;
        }
      }
    }

    this.portal.update(time, delta);
    this.diegeticHUD.update(time, delta);

    // ---- Lights follow ----
    this.playerLight.x = px;
    this.playerLight.y = py;

    // ---- Fell into a gap / off the bottom ----
    if (!this.player.isDead && this.player.y > DEATH_Y && !AssistMode.get('invincibility')) {
      this.player.die();
    }
  }
}
