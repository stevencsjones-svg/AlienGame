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
import FallingPlatform from '../entities/FallingPlatform.js';
import ProximityMine from '../entities/ProximityMine.js';
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

// The platforms the player stands/jumps on are GREEN so they pop against the
// blue background + trains. Everything else (lights, checkpoint, collectibles,
// background) keeps the electric-blue palette P.
const PLAT_PAL = { ...P, PLATFORM: 0x00ff88, PLATFORM_DIM: 0x064a28 };

let level3TitleShown = false; // once per session

// =============================================================================
// LEVEL DATA — difficulty pass. Floor exists ONLY in Section 1 (x0–2500) and
// Section 5 (x13500–16000); Sections 2–4 are gap-dominant (a fall = death at
// y3240). The platform path is authored to stay within the player's double-jump
// + dash reach. NOTE: gaps are tuned for crossability rather than the brief's
// literal 600–900px (which would be unfair without playtest tuning) — this layout
// needs a play pass to confirm/sharpen difficulty.
// =============================================================================

// Floor segments [cx, topY, w, h] — safe zones only (S1 + S5).
const GROUND = [
  [1250, FLOOR_Y, 2500, 120],   // Section 1 floor (x0–2500)
  [14650, FLOOR_Y, 2700, 120],  // Section 5 floor (x13300–16000)
];

// Elevated static platforms [cx, topY, w, h]. This is a BEATABLE backbone: every
// consecutive hop is within a double jump (≤~240px gap, ≤~175px rise; drops are
// free). The no-floor gaps below are still lethal — dangerous but crossable.
const PLATFORMS = [
  // S1 — grounded intro (floor itself is the path)
  [700, 2800, 160, 16], [1300, 2600, 160, 16], [1900, 2750, 160, 16],
  // S2 — reachable climb from the floor edge (x2500 @ y3100), then undulating
  [2650, 2950, 170, 16], [3050, 2780, 160, 16], [3450, 2720, 160, 16], [3850, 2780, 160, 16],
  [4250, 2680, 160, 16], [4650, 2760, 160, 16], [5100, 2860, 170, 16], [5500, 2740, 160, 16], [5850, 2800, 160, 16],
  // S3 — vertical gauntlet, stepped so every rise stays within a double jump
  [6250, 2680, 160, 16], [6600, 2520, 160, 16], [6900, 2640, 160, 16], [7150, 2480, 150, 16],
  [7550, 2620, 160, 16], [7900, 2760, 160, 16], [8000, 2994, 280, 40], /* checkpoint pad */
  [8350, 2820, 160, 16], [8700, 2680, 160, 16], [9050, 2560, 160, 16], [9450, 2700, 160, 16], [9800, 2860, 160, 16],
  // S4 — relief (gentler, ~400px spacing)
  [10200, 2820, 160, 16], [10600, 2720, 160, 16], [11000, 2800, 160, 16], [11400, 2700, 160, 16],
  [11800, 2780, 160, 16], [12200, 2640, 160, 16], [12600, 2740, 160, 16], [13000, 2840, 160, 16],
  [13350, 2920, 150, 16], // step down to the S5 floor
  // S5 — final push (floor present)
  [13750, 2860, 150, 16], [14000, 2740, 160, 16], [14600, 2720, 150, 16], [15200, 2700, 160, 16],
];

// Moving platforms [startX, topY, range, speed, axis] — moving stepping stones
// near the backbone height (helpers/alternates, not the sole path).
const MOVERS = [
  // S2 — 4 horizontal
  [2900, 2850, 300, 110, 'x'], [3700, 2740, 300, 120, 'x'], [4500, 2700, 300, 100, 'x'], [5300, 2800, 300, 130, 'x'],
  // S3 — 4 horizontal + 2 vertical
  [6400, 2600, 300, 100, 'x'], [7000, 2440, 260, 110, 'x'], [8500, 2720, 300, 120, 'x'], [9200, 2620, 300, 110, 'x'],
  [6750, 2560, 220, 90, 'y'], [9600, 2720, 240, 100, 'y'],
  // S4 — 3 horizontal
  [10500, 2760, 300, 140, 'x'], [11300, 2740, 300, 130, 'x'], [12100, 2700, 300, 150, 'x'],
  // S5 — 2 fast
  [13900, 2820, 280, 170, 'x'], [14450, 2760, 260, 180, 'x'],
];

// Falling platforms [x, topY, width] — drop shortly after the player lands. Set
// off the backbone (the backbone alone is crossable) so a drop never strands.
const FALLERS = [
  [2850, 2900, 120], [3650, 2720, 120], [5250, 2840, 120],             // S2 (3)
  [6450, 2560, 120], [7350, 2560, 120], [8650, 2640, 120], [9650, 2800, 120], // S3 (4)
  [11000, 2780, 120], [12550, 2680, 120],                              // S4 (2)
];

// Proximity mines [x, y] — placed above the backbone so a low path can avoid
// arming them; going high (or for collectibles) triggers them.
const MINES = [[4800, 2560], [7200, 2300], [9400, 2400], [11800, 2400]];

// Ground drones [x, y] — each on a backbone platform / floor it can patrol.
const DRONES = [
  [5500, 2724], [8700, 2664], [11400, 2684],   // additions
  [10200, 2804], [12600, 2724], [14500, 3060], // existing (adapted onto ground)
];

// Hover sentinels [x, y] (float; no ground needed).
const SENTINELS = [
  [7400, 2650], [10300, 2620],   // existing
  [6200, 2400], [12000, 2500],   // additions
];
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
    this.fallers = [];
    this.fallingBodies = [];
    this.mines = [];
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
      const mp = new MovingPlatform(this, sx, ty, 120, 14, axis, range, speed, PLAT_PAL);
      this.movers.push(mp);
      this.movingBodies.push(mp.bodyRect);
    });
    FALLERS.forEach(([x, y, w]) => {
      const fp = new FallingPlatform(this, x, y, w, PLAT_PAL);
      this.fallers.push(fp);
      this.fallingBodies.push(fp.bodyRect);
    });
    MINES.forEach(([x, y]) => this.mines.push(new ProximityMine(this, x, y)));
    // Carry list: both moving and falling platforms can carry the player.
    this._carriers = [...this.movers, ...this.fallers];

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
    this.seekers.push(new Seeker(this, 12500, 2700, this.player, { speed: ENEMY.SEEKER_SPEED, aggro: 300 })); // S4 addition

    // ---- Collectibles ----
    COLLECTIBLES.forEach(([x, y]) => this.collectibles.push(createCollectible(this, x, y, P.COLLECTIBLE, false)));
    SECRETS.forEach(([x, y]) => this.collectibles.push(createCollectible(this, x, y, HIDDEN_COLLECTIBLE_COLOR, true)));

    // ---- Exit portal ----
    this.portal = new ExitPortal(this, 15600, 3000);
    this.portal.glow.setPosition(15600, 3060); // glow tracks the portal (default y400)

    // ---- Colliders ----
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.movingBodies);
    this.physics.add.collider(this.player, this.fallingBodies);
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

    // City silhouette (~40 buildings; every 5th gets a pulsing rooftop light;
    // each carries a grid of lit windows — some warm, some cool, a few flicker).
    this.buildings = [];
    let bx = 0; let bi = 0;
    while (bx < this.BG_BAND && this.buildings.length < 40) {
      const bw = 30 + rng() * 70;
      const bh = 80 + rng() * 240;
      const b = { x: bx, w: bw, h: bh, color: rng() < 0.5 ? 0x071a2e : 0x0a2040, lit: bi % 5 === 0, blue: false, windows: [] };
      const cols = Math.max(1, Math.floor((bw - 8) / 12));
      const rows = Math.max(2, Math.floor((bh - 16) / 26));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rng() < 0.45) continue; // ~55% of cells are lit
          b.windows.push({ wx: 5 + c * 12, fy: (r + 0.5) / rows, warm: rng() < 0.25, flicker: rng() < 0.12, phase: rng() * 4000 });
        }
      }
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

    // Aeroplanes — occasional jets crossing the upper sky (pooled; screen-fixed,
    // drawn in front of the distant city, behind the trains).
    this.gPlanes = this.add.graphics().setScrollFactor(0).setDepth(-9.9);
    this.planes = [];
    for (let i = 0; i < 3; i++) this.planes.push({ active: false, x: 0, y: 0, vx: 0, dir: 1, len: 26, blinkT: 0, blinkOn: true });
    this.planeTimer = 3000 + rng() * 4000; // first fly-by fairly soon
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
        // Lit windows.
        for (const wnd of b.windows) {
          if (wnd.flicker && (Math.floor((this.time.now + wnd.phase) / 700) % 2) !== 0) continue;
          city.fillStyle(wnd.warm ? 0xffcc66 : 0x9fe8ff, 0.55);
          city.fillRect(x + wnd.wx, vh - bh + wnd.fy * (bh - 6) + 1, 3, 4);
        }
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

    // --- Aeroplanes (occasional fly-bys across the upper sky) ---
    this.updatePlanes(delta);
  }

  // Spawn (from the pool) the occasional jet, then move + draw any active ones.
  updatePlanes(delta) {
    const vw = this.scale.width;
    const vh = this.scale.height;
    const g = this.gPlanes; g.clear();

    this.planeTimer -= delta;
    if (this.planeTimer <= 0) {
      this.planeTimer = 9000 + Math.random() * 11000; // next fly-by in ~9–20s
      const p = this.planes.find((pl) => !pl.active);
      if (p) {
        p.active = true;
        p.dir = Math.random() < 0.5 ? 1 : -1;
        p.len = 22 + Math.random() * 14;
        p.y = vh * (0.06 + Math.random() * 0.22); // upper sky
        p.vx = (120 + Math.random() * 120) * p.dir; // px/s
        p.x = p.dir > 0 ? -p.len - 70 : vw + p.len + 70;
        p.blinkT = 0; p.blinkOn = true;
      }
    }

    for (const p of this.planes) {
      if (!p.active) continue;
      p.x += p.vx * (delta / 1000);
      p.blinkT += delta;
      if (p.blinkT >= 480) { p.blinkT -= 480; p.blinkOn = !p.blinkOn; }
      if ((p.dir > 0 && p.x > vw + p.len + 80) || (p.dir < 0 && p.x < -p.len - 80)) { p.active = false; continue; }
      this.drawPlane(g, p);
    }
  }

  // A small jet silhouette + contrail + blinking nav/strobe lights.
  drawPlane(g, p) {
    const d = p.dir; const len = p.len; const y = p.y; const cx = p.x;
    const nose = cx + d * (len / 2);
    const tail = cx - d * (len / 2);
    g.fillStyle(0xaad8ff, 0.05); g.fillRect(Math.min(tail, tail - d * 80), y - 1.5, 80, 3); // contrail
    g.fillStyle(0x163450, 0.95); g.fillRect(Math.min(tail, nose), y - 2, len, 4);            // fuselage
    g.fillTriangle(nose, y - 2, nose, y + 2, nose + d * 7, y);                               // nose cone
    g.fillStyle(0x0f2740, 0.95);
    const mx = cx + d * 2;
    g.fillTriangle(mx, y, mx - d * 16, y - 10, mx - d * 2, y + 1);                           // swept wings
    g.fillTriangle(mx, y, mx - d * 16, y + 10, mx - d * 2, y - 1);
    g.fillTriangle(tail, y, tail - d * 8, y - 9, tail - d * 1, y);                           // tail fin
    if (p.blinkOn) { g.fillStyle(0xff4444, 0.95); g.fillCircle(tail - d * 1, y - 8, 1.8); }  // red nav light
    else { g.fillStyle(0xffffff, 0.95); g.fillCircle(nose, y, 1.8); }                        // white strobe
  }

  // Static platform: layered visual + static body + Light2D.
  addPlatform(cx, topY, w, h) {
    const { body } = buildPlatformVisual(this, cx, topY, w, h, PLAT_PAL, false);
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

    // ---- Moving / falling platforms + mines (skip > 1000px from player) ----
    for (const mp of this.movers) {
      if (Phaser.Math.Distance.Between(mp.bodyRect.x, mp.bodyRect.y, px, py) < 1000) mp.update(delta);
    }
    for (const fp of this.fallers) {
      if (Phaser.Math.Distance.Between(fp.bodyRect.x, fp.bodyRect.y, px, py) < 1000) fp.update(delta);
    }
    for (const m of this.mines) {
      if (Phaser.Math.Distance.Between(m.x, m.y, px, py) < 1000) m.update(delta);
    }

    // ---- Carry the player when standing on a moving OR falling platform ----
    if (this.player.body.blocked.down) {
      const pb = this.player.body;
      for (const mp of this._carriers) {
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
