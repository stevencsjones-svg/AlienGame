import Phaser from 'phaser';
import {
  WORLD, DEATH_Y, COLORS, PLAYER, PLATFORM_THICKNESS, TOTAL_COLLECTIBLES,
  HIDDEN_COLLECTIBLE_COUNT, HIDDEN_COLLECTIBLE_COLOR, SPEED_PROGRESSION_MAX_MULTIPLIER,
  LEVEL1_ZONE_PALETTES, DEV_MODE, MUSIC_VOLUME, ZONE_MARKERS, LEVEL_COMPLETE_BEATS,
  ASSIST_MODE,
} from '../constants.js';
import AssistMode from '../utils/AssistMode.js';
import Player from '../entities/Player.js';
import GroundDrone from '../entities/GroundDrone.js';
import HoverSentinel from '../entities/HoverSentinel.js';
import ExitPortal from '../entities/ExitPortal.js';
import ParallaxBackground from '../background/ParallaxBackground.js';
import ChromaticAberrationPipeline from '../pipelines/ChromaticAberrationPipeline.js';
import DiegeticHUD from '../ui/DiegeticHUD.js';
import DataNoise from '../fx/DataNoise.js';
import { makeGlassPanel } from '../ui/glassPanel.js';
import SFX from '../audio/SFX.js';
import TouchControls from '../ui/TouchControls.js';
import CameraController from '../camera/CameraController.js';
import PaletteManager from '../utils/PaletteManager.js';
import LivingBackground from '../background/LivingBackground.js';
import AbilityPickup from '../entities/AbilityPickup.js';
// Imported (not a string path) so Vite bundles the asset and the URL resolves
// in both the dev server and production builds — a literal 'src/audio/...'
// path 404s in the built dist/.
import level1MusicUrl from '../audio/level1_music.ogg';
import Progression from '../utils/Progression.js';

// Title card shows once per session (survives respawns and scene restarts).
let level1TitleShown = false;

// =============================================================================
// Level data
// Each platform is [centreX, topY, width]. Ground blocks are listed separately
// because they use a custom (taller) thickness. Enemy and collectible positions
// follow. The level is split into 5 zones across a 6400px-wide world.
// =============================================================================

// [centreX, topY, width, thickness]
const GROUND = [
  [600, 820, 1200, 80],   // Zone 1 ground
  [1800, 820, 1200, 80],  // Zone 2 ground (contiguous with zone 1)
  [4200, 400, 1200, 500], // Zone 4 rooftop floor
  // Zone 5 rooftop floor, split by a death-pit gap at x:5600-5860 (FIX 13).
  // Left piece ends at x:5600 (launch lip); right piece starts at x:5860 (landing).
  [5200, 400, 800, 500],  // Zone 5 rooftop — left of the gap (x:4800-5600)
  [6130, 400, 540, 500],  // Zone 5 rooftop — right of the gap (x:5860-6400)
];

// [centreX, topY, width]
const PLATFORMS = [
  // Zone 1 — Tutorial Street (easy hops)
  [300, 720, 140],
  [550, 640, 140],
  [850, 700, 160],

  // Zone 2 — Market District (some need a double jump)
  [1350, 700, 140],
  [1600, 560, 140],
  [1900, 620, 140],
  [2150, 480, 140],

  // Zone 3 — Vertical Climb (8-platform staircase up to near the ceiling)
  [2480, 760, 130],
  [2640, 670, 130],
  [2800, 580, 130],
  [2960, 490, 130],
  [3120, 400, 130],
  [3280, 310, 130],
  [3440, 220, 130],
  [3560, 150, 140],

  // Zone 4 — Rooftop Gauntlet (above the rooftop floor)
  [3750, 320, 130],
  [3950, 260, 130],
  [4200, 300, 140],
  [4450, 240, 130],
  [4650, 320, 130],

  // Zone 5 — Alien Spire (climb to the exit portal)
  [4950, 320, 130],
  [5250, 250, 140],
  [5650, 200, 140],
  [6050, 240, 160],
];

// [x, y]
const COLLECTIBLES = [
  // Zone 1 (3)
  [250, 760], [550, 600], [850, 650],
  // Zone 2 (4)
  [1350, 660], [1600, 520], [1900, 580], [2150, 440],
  // Zone 3 (4)
  [2640, 620], [2960, 440], [3280, 260], [3560, 100],
  // Zone 4 (5)
  [3750, 280], [3950, 220], [4200, 260], [4450, 200], [4650, 280],
  // Zone 5 (3)
  [4950, 280], [5250, 210], [5650, 160],
];

// [x, y]
const DRONES = [
  [850, 690],   // Zone 1
  [1900, 610],  // Zone 2
  [3950, 250],  // Zone 4
  [4450, 230],  // Zone 4
  [4950, 310],  // Zone 5
];

// [x, y]
const SENTINELS = [
  [1700, 450],  // Zone 2
  [2720, 600],  // Zone 3
  [3040, 450],  // Zone 3
  [3360, 265],  // Zone 3
  [5300, 250],  // Zone 5
  // FIX 3 — Seekers removed from Level 1; replaced 1:1 with hover sentinels
  // (no aggressive chase in the intro level). Seekers return in Level 2.
  [4100, 360],  // Zone 4 (was a seeker)
  [4600, 360],  // Zone 4 (was a seeker)
  [5500, 360],  // Zone 5 (was a seeker)
];

const PORTAL = { x: 6200, y: 200, w: 40, h: 70 };

// Atmospheric alien/tech strings stamped onto roughly every third platform.
const PLATFORM_LABELS = [
  'LVL-03', 'GRID-7', 'SEC-A2', 'NODE-14', 'UNIT-9', 'DZ-22',
  'X-07', 'CORE-5', 'RLY-88', 'VOID-1', 'ARC-12', 'HEX-04',
];

// =============================================================================
// Game scene
// =============================================================================
export default class Game extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  preload() {
    // Background music (idempotent — the cache key is reused across restarts).
    if (!this.cache.audio.exists('level1_music')) {
      this.load.audio('level1_music', level1MusicUrl);
    }
  }

  create() {
    // ---- World & camera bounds ----
    this.physics.world.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    // Collide left/right/top, but NOT the bottom (so pits are deadly).
    this.physics.world.setBoundsCollision(true, true, true, false);
    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // ---- State ----
    this.collectedCount = 0;
    this.secretsFound = 0;  // hidden collectibles found (out of HIDDEN_COLLECTIBLE_COUNT)
    this.levelDone = false;
    this.platforms = [];    // rectangles with static bodies (for colliders)
    this.collectibles = [];
    this.drones = [];
    this.sentinels = [];
    this.seekers = [];
    this.platformCount = 0; // used to label ~every third platform
    this.deathSplats = [];  // persistent death marks (max 5)
    this.checkpointActive = false;
    this.triggeredMarkers = new Set(); // zone-marker labels already shown
    this.pauseMode = 'main';           // 'main' | 'assist' — which pause overlay is shown
    this.assistSelection = 0;          // selected row inside the assist submenu

    // Respawn point — starts at the level spawn, updated by the checkpoint.
    this.respawnX = PLAYER.SPAWN_X;
    this.respawnY = PLAYER.SPAWN_Y;

    // Pause state.
    this.isPaused = false;
    this.pauseSelection = 0; // 0 = RESUME, 1 = RESTART, 2 = MAIN MENU

    // Dedicated seeded RNG for aesthetic timing (kept separate from the
    // parallax/label RNG so it doesn't shift their determinism).
    let fxSeed = 0xc0ffee;
    this.fxRng = () => {
      fxSeed += 0x6d2b79f5;
      let r = Math.imul(fxSeed ^ (fxSeed >>> 15), 1 | fxSeed);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    // ---- Post-FX (WebGL only). Order: Bloom -> Chromatic -> CRT -> Grade ----
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('BloomPipeline');
      this.cameras.main.setPostPipeline(ChromaticAberrationPipeline);
      this.cameras.main.setPostPipeline('CRTPipeline');
      this.cameras.main.setPostPipeline('ColorGradePipeline'); // final grade

      // Keep the post-FX resolution in sync when the window resizes. (Both
      // pipelines also read renderer.width/height each frame in onPreRender,
      // so this is a belt-and-suspenders update.)
      const onResize = (gameSize) => {
        const res = [gameSize.width, gameSize.height];
        let crt = this.cameras.main.getPostPipeline('CRTPipeline');
        if (Array.isArray(crt)) crt = crt[0];
        if (crt) crt.uResolution = res;
        let bloom = this.cameras.main.getPostPipeline('BloomPipeline');
        if (Array.isArray(bloom)) bloom = bloom[0];
        if (bloom) bloom.uResolution = res;
      };
      this.scale.on('resize', onResize);
      // The ScaleManager is global and outlives this scene — remove the listener
      // on shutdown so it can't fire against a torn-down camera (or stack up
      // across restarts).
      this.events.once('shutdown', () => this.scale.off('resize', onResize));
    }

    // ---- Dynamic Light2D lighting ----
    this.lights.enable();
    this.lights.setAmbientColor(0x223322); // slightly warm dark green

    // Procedural 3-layer parallax city. Created first so it renders behind
    // platforms, entities and the HUD.
    this.background = new ParallaxBackground(this);
    // NOTE: the parallax layers are intentionally NOT lit. Applying Light2D to
    // these scroll-factor-0 RenderTextures exposed a vertical seam and a blue
    // tint from the default flat normal map (#8080ff). The distant city doesn't
    // need dynamic lighting, so it renders with its normal pipeline.

    this.createPitVisual();
    this.createLevelGeometry();
    this.createRooftopVisuals(); // FIX 3 — Zone 4 rooftop atmosphere
    this.createCollectibles();
    this.createSecrets();
    this.createSecretHints(); // FIX 4 — faint orange motes near each secret
    this.createWorldSigns(); // environmental storytelling (visual only)

    // ---- Player ----
    this.player = new Player(this, PLAYER.SPAWN_X, PLAYER.SPAWN_Y);
    // Mobile on-screen buttons (renders only on touch devices; Player.js ORs
    // its state with the keyboard; self-destroys on scene shutdown).
    this.touchControls = new TouchControls(this);
    // NOTE: RimLightPipeline is intentionally NOT applied to the player. On the
    // sprite it rimmed the rectangular frame bounds, producing a visible box
    // artefact around the character. The pipeline file is kept for future use.

    this.createEnemies();
    this.createPortal();
    this.createCheckpoint();
    this.createAbilityPickups();
    this.createColliders();
    this.createSpikePits(); // FIX 7/13 — needs this.player + colliders to exist

    // DEV_MODE: start with everything unlocked so iteration isn't gated.
    if (DEV_MODE) {
      this.player.canDoubleJump = true;
      this.player.canDash = true;
      this.player.hasAttack = true;
    }

    // Pause / menu keys.
    this.pauseKeys = this.input.keyboard.addKeys({
      esc: 'ESC', up: 'UP', down: 'DOWN', w: 'W', s: 'S', space: 'SPACE', enter: 'ENTER', m: 'M',
    });

    // ---- Light sources (player + portal + 5 even zone lights) ----
    this.playerLight = this.lights.addLight(0, 0, 340).setColor(0x00ff88).setIntensity(1.5);
    this.portalLight = this.lights.addLight(6200, 200, 220).setColor(0xff6a00).setIntensity(1.4);
    [800, 1800, 3000, 4200, 5600].forEach((x) => {
      this.lights.addLight(x, 400, 180).setColor(0x00e5ff).setIntensity(0.6);
    });

    // ---- Aesthetic systems: diegetic HUD + ambient data-noise ----
    this.diegeticHUD = new DiegeticHUD(this, this.player);
    this.dataNoise = new DataNoise(this, this.player, this.fxRng);

    // Stagger platform power-flicker timers (micro-motion).
    const now0 = this.time.now;
    this.platforms.forEach((pl) => {
      pl._flickering = false;
      pl._flickerEnd = 0;
      pl._nextFlicker = now0 + this.fxRng() * 15000;
    });

    // ---- Camera follow (via CameraController; Level 1 is always horizontal) ----
    this.cameraController = new CameraController(this, this.cameras.main, 'horizontal');

    // ---- Palette: start cool, drift warmer near the spire (Improvement 2) ----
    // Per-zone atmosphere (background colour temperature). Tracks player x and
    // drifts the camera backdrop + fog over 3s as the player crosses zones.
    this.palette = new PaletteManager(this);
    this.fogOverlay = this.background ? this.background.fog : null;
    const z1 = LEVEL1_ZONE_PALETTES.zone1;
    this.currentZone = 'zone1';
    this._fogOpacity = z1.fogOpacity;
    this.palette.apply({ bgTint: z1.bgTint, fogColour: z1.fogColour });
    this.cameras.main.setBackgroundColor(z1.bgTint);
    if (this.fogOverlay) this.fogOverlay.setFillStyle(z1.fogColour, this._fogOpacity);

    // Living atmosphere: vehicles, vessels, creatures, rain, windows, signs,
    // lightning — all additive, behind platforms/entities.
    this.livingBackground = new LivingBackground(this, this.cameras.main);

    // ---- HUD overlay scene (runs in parallel) ----
    // Idempotent so a scene restart (from the pause menu) doesn't double-launch.
    if (!this.scene.isActive('UI')) this.scene.launch('UI');

    // ---- Background music (loops; muted in lockstep with SFX via the M key) ----
    this.bgMusic = this.sound.add('level1_music', { loop: true, volume: MUSIC_VOLUME });
    this.bgMusic.setMute(!SFX.enabled); // honour the existing audio toggle
    this.bgMusic.play();
    // Safety net: stop the music on any scene shutdown so it can't bleed across.
    this.events.once('shutdown', () => {
      if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic = null; }
    });

    // ---- Opening title card (once per session; skipped in DEV_MODE) ----
    if (!DEV_MODE && !level1TitleShown) {
      level1TitleShown = true;
      this.showTitleCard(
        'STREET LEVEL — TIER 1',
        'The lowest tier. Market workers.\nGround drones keeping order.',
        'You used to look down at this place.',
        0x00ff88,
      );
    }

    // ---- Dev zone indicator (DEV_MODE only) ----
    if (DEV_MODE) {
      this.devZoneText = this.add
        .text(this.scale.width / 2, 12, 'ZONE 1', {
          fontSize: '11px', fontFamily: 'monospace', color: '#ff6a00',
          backgroundColor: '#000000', padding: { x: 8, y: 4 },
        })
        .setScrollFactor(0).setDepth(999).setAlpha(0.8).setOrigin(0.5, 0);
      this.devPosText = this.add
        .text(this.scale.width / 2, 34, 'x:0 y:0', {
          fontSize: '9px', fontFamily: 'monospace', color: '#00ff88',
          backgroundColor: '#000000', padding: { x: 6, y: 3 },
        })
        .setScrollFactor(0).setDepth(999).setAlpha(0.6).setOrigin(0.5, 0);
    }
  }

  // ---- Environmental storytelling: world-space signage (visual only) --------
  // line2 optional. opts: { colour, opacity, size, scrollFactor, panel }.
  addWorldSign(x, y, line1, line2, opts = {}) {
    const cfg = {
      colour: '#00ff88', opacity: 0.35, size: 8, scrollFactor: 1.0, ...opts,
    };
    if (opts.panel) {
      const w = Math.max(line1.length, (line2 || '').length) * 5 + 12;
      const h = line2 ? 24 : 14;
      this.add
        .rectangle(x - 6, line2 ? y + 9 : y + 4, w, h, 0x000000, 0.4)
        .setOrigin(0, 0.5).setScrollFactor(cfg.scrollFactor).setDepth(1.9);
    }
    // NOTE: Phaser ignores `alpha` in the text style — opacity must be set via
    // setAlpha(), otherwise every sign renders fully opaque.
    this.add
      .text(x, y, line1, { fontSize: `${cfg.size}px`, fontFamily: 'monospace', color: cfg.colour })
      .setScrollFactor(cfg.scrollFactor).setDepth(2).setAlpha(cfg.opacity);
    if (line2) {
      this.add
        .text(x, y + 10, line2, { fontSize: `${cfg.size - 1}px`, fontFamily: 'monospace', color: cfg.colour })
        .setScrollFactor(cfg.scrollFactor).setDepth(2).setAlpha(cfg.opacity * 0.7);
    }
  }

  createWorldSigns() {
    // Zone 1 — Tutorial street (x: 0–1200)
    this.addWorldSign(80,   720, 'TIER 1 — STREET LEVEL',               'AUTHORISED PERSONNEL ONLY',               { colour: '#ff6a00', opacity: 0.45, panel: true });
    this.addWorldSign(280,  680, 'GROUND DRONE PATROL ACTIVE',           'REPORT DISTURBANCES: NODE-7',             { colour: '#ff0000', opacity: 0.30 });
    this.addWorldSign(520,  740, '// EXILE ALERT — SECTOR 1A //',        'IDENTITY REVOKED — APPROACH WITH CAUTION', { colour: '#ff6a00', opacity: 0.28, panel: true });
    this.addWorldSign(780,  700, 'WANTED',                               'FORMER TIER 9 — IDENTITY UNKNOWN',        { colour: '#ffffff', opacity: 0.22 });
    this.addWorldSign(1000, 660, 'CITY CONTROL — ZONE A BOUNDARY',       null,                                      { colour: '#00ff88', opacity: 0.18 });

    // Zone 2 — Market district (x: 1200–2400)
    this.addWorldSign(1280, 720, 'MARKET SECTOR — TIER 1 COMMERCE',      'UPPER TIER ACCESS: CLEARANCE REQUIRED',   { colour: '#ff6a00', opacity: 0.32, panel: true });
    this.addWorldSign(1560, 680, '// THEY WATCH FROM ABOVE //',          null,                                      { colour: '#00ff88', opacity: 0.16 });
    this.addWorldSign(1820, 740, 'NODE-7 SURVEILLANCE ACTIVE',           'ALL MOVEMENT LOGGED AND RETAINED',        { colour: '#ff0000', opacity: 0.24 });
    this.addWorldSign(2080, 700, 'UNDERCITY ACCESS — SHAFT B7',          '▼ MAINTENANCE AND CONDEMNED ONLY',        { colour: '#ff6a00', opacity: 0.38, panel: true });
    this.addWorldSign(2280, 660, 'ELEVATION PERMIT REQUIRED ABOVE THIS POINT', null,                               { colour: '#00ff88', opacity: 0.20 });

    // Zone 3 — Vertical climb (x: 2400–3600)
    this.addWorldSign(2480, 720, 'VERTICAL TRANSIT — RESTRICTED',        'TIER 2+ CLEARANCE REQUIRED',              { colour: '#ff6a00', opacity: 0.30, panel: true });
    this.addWorldSign(2700, 480, '// HOW FAR WILL YOU GET //',           null,                                      { colour: '#00ff88', opacity: 0.14 });
    this.addWorldSign(2900, 360, 'TRANSIT NETWORK — TIER 3',             'ACCESS DENIED — CLEARANCE: REVOKED',      { colour: '#ff0000', opacity: 0.32, panel: true });
    this.addWorldSign(3200, 420, 'ALTITUDE MONITORING ACTIVE',           'UNAUTHORISED ASCENT WILL BE REPORTED',    { colour: '#ff6a00', opacity: 0.24 });

    // Zone 4 — Rooftop gauntlet (x: 3600–4800)
    this.addWorldSign(3700, 650, 'CORPORATE DISTRICT — TIER 4+',         'STREET LEVEL ACCESS ENDS HERE',           { colour: '#ff6a00', opacity: 0.32, panel: true });
    this.addWorldSign(3980, 700, 'FULL SENTINEL COVERAGE ACTIVE',        null,                                      { colour: '#ff0000', opacity: 0.26 });
    this.addWorldSign(4240, 660, '// THEY TOOK EVERYTHING //',           '// YOU ARE GOING BACK //',                { colour: '#00ff88', opacity: 0.20 });
    this.addWorldSign(4520, 700, 'PROPERTY OF CITY ADMINISTRATIVE BODY', 'TIER 5 — TRESPASS: LETHAL RESPONSE',     { colour: '#ff6a00', opacity: 0.28, panel: true });

    // Zone 5 — Alien spire (x: 4800–6400)
    this.addWorldSign(4900, 680, 'INNER SANCTUM APPROACH — TIER 7+',    'UNAUTHORISED ACCESS: LETHAL RESPONSE',    { colour: '#ff0000', opacity: 0.38, panel: true });
    this.addWorldSign(5200, 700, 'SPIRE ACCESS POINT — IDENTITY CHECK',  'YOUR TIER HAS BEEN REVOKED',             { colour: '#ff6a00', opacity: 0.32, panel: true });
    this.addWorldSign(5600, 660, '// ONE TIER AT A TIME //',             null,                                      { colour: '#00ff88', opacity: 0.16 });
    this.addWorldSign(5900, 700, 'FINAL WARNING — TURN BACK',            'THE SOURCE IS NOT FOR YOU',              { colour: '#ff0000', opacity: 0.35, panel: true });
    this.addWorldSign(6150, 680, 'EXIT — TRANSIT NETWORK ABOVE',         'TIER 3 DISTRICT — KEEP MOVING',          { colour: '#00ff88', opacity: 0.42, panel: true });
  }

  // Brief atmospheric title card (glassmorphism). Does not block input; fades
  // in 400ms, holds 3.5s, fades out 400ms. `green` accents the panel + line 2.
  showTitleCard(line1, line2, line3, green) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const W = 480;
    const H = 90;
    const D = 210;
    const greenStr = `#${green.toString(16).padStart(6, '0')}`;

    const base = this.add.rectangle(cx, cy, W, H, 0x050a08, 0.55).setStrokeStyle(0.5, green, 0.25);
    const tint = this.add.rectangle(cx, cy, W, H, green, 0.04);
    const hi = this.add.rectangle(cx, cy - H / 2 + 1, W, 1, 0xffffff, 0.15);
    const t1 = this.add.text(cx, cy - 28, line1, { fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00' }).setOrigin(0.5);
    const div = this.add.rectangle(cx, cy - 14, W - 40, 1, green, 0.2);
    const t2 = this.add.text(cx, cy + 2, line2, { fontFamily: 'monospace', fontSize: '10px', color: greenStr, align: 'center' }).setOrigin(0.5).setAlpha(0.7);
    const t3 = this.add.text(cx, cy + 30, line3, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', fontStyle: 'italic', align: 'center' }).setOrigin(0.5).setAlpha(0.5);

    const card = this.add.container(0, 0, [base, tint, hi, t1, div, t2, t3])
      .setScrollFactor(0).setDepth(D).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 400, hold: 3500, yoyo: true, onComplete: () => card.destroy() });
  }

  // ---- Death pit visual (Zone 3) ----------------------------------------------
  // A dark band across the bottom of the world. It sits behind the platforms
  // (depth -8) so it only reads where there is no ground floor — i.e. the
  // Zone 3 pit — suggesting a bottomless alien depth. Drawn in world space.
  createPitVisual() {
    this.add
      .rectangle(WORLD.WIDTH / 2, 860, WORLD.WIDTH, 80, 0x000000, 0.8)
      .setDepth(-8);
    // Thin dangerous-looking edge line at the lip of the pit.
    this.add
      .rectangle(WORLD.WIDTH / 2, 820, WORLD.WIDTH, 2, COLORS.ENEMY, 0.3)
      .setDepth(-7);
  }

  // ---- FIX 3: Zone 4 rooftop atmosphere (the actual rooftop section) ---------
  // "Looking down over the city": soft glows + lit windows on the building face
  // below the rooftop lip (y400), a rooftop edge line, and a faint label.
  createRooftopVisuals() {
    // City glow — soft strips on the building face just below the rooftop edge.
    const cityGlow = [
      [3680, 520, 80, 6], [3850, 540, 40, 4], [4000, 510, 60, 5],
      [4180, 540, 50, 4], [4350, 515, 70, 6], [4520, 535, 45, 4], [4700, 520, 55, 5],
    ];
    cityGlow.forEach(([gx, gy, gw, gh]) => {
      const glow = this.add.rectangle(gx, gy, gw, gh, 0x00ff88, 0.12).setDepth(1);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.06, to: 0.18 },
        duration: Phaser.Math.Between(1800, 3200),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 1000),
      });
    });

    // Window grid — lit windows on the building face (occasional flicker).
    const windows = [
      [3700, 470, 0x00ff88, 4], [3710, 470, 0x00ff88, 4], [3700, 482, 0x00e5ff, 4], [3710, 482, 0x003300, 4],
      [3900, 460, 0x00ff88, 3], [3910, 460, 0x00ff88, 3], [3900, 470, 0x003300, 3], [3910, 470, 0x00e5ff, 3],
      [4120, 472, 0x00e5ff, 4], [4132, 472, 0x00ff88, 4], [4120, 484, 0x00ff88, 4], [4132, 484, 0x003300, 4],
      [4340, 462, 0x00ff88, 3], [4352, 462, 0x00e5ff, 3], [4340, 472, 0x003300, 3], [4352, 472, 0x00ff88, 3],
      [4560, 474, 0x00e5ff, 4], [4570, 474, 0x00ff88, 4], [4560, 486, 0x00ff88, 4], [4570, 486, 0x003300, 4],
      [4720, 466, 0x00ff88, 3], [4732, 466, 0x003300, 3], [4720, 476, 0x00e5ff, 3], [4732, 476, 0x00ff88, 3],
    ];
    windows.forEach(([wx, wy, col, size]) => {
      const win = this.add.rectangle(wx, wy, size, size, col, 0.45).setDepth(1);
      if (Math.random() < 0.3) {
        this.time.addEvent({
          delay: Phaser.Math.Between(3000, 12000), loop: true,
          callback: () => this.tweens.add({
            targets: win, alpha: 0, duration: 80, yoyo: true,
            onComplete: () => win.setAlpha(0.45),
          }),
        });
      }
    });

    // Rooftop edge indicator — faint line along the rooftop lip.
    this.add.rectangle(4200, 401, 1200, 2, 0x00ff88, 0.18).setDepth(3);
    // Faint rooftop label.
    this.add.text(3650, 380, 'ROOFTOP — TIER 2 ACCESS POINT', {
      fontFamily: 'Courier New', fontSize: '7px', color: '#00ff88',
    }).setAlpha(0.2).setDepth(3);
  }

  // ---- FIX 4: faint "something is up there" hint near each secret ------------
  // Two orange motes per secret drift slowly upward (~8px/s) at 8% opacity.
  createSecretHints() {
    const secrets = [[2150, 290], [3140, 200], [4200, 130]];
    secrets.forEach(([sx, sy]) => {
      for (let i = 0; i < 2; i++) {
        const p = this.add.rectangle(sx, sy + 60, 2, 2, HIDDEN_COLLECTIBLE_COLOR, 0.08).setDepth(1);
        const drift = () => {
          if (!p.scene) return; // scene torn down
          p.setPosition(sx + Phaser.Math.Between(-6, 6), sy + 60).setAlpha(0.08);
          this.tweens.add({
            targets: p, y: sy, alpha: 0, duration: 7500, ease: 'Sine.easeIn',
            delay: i * 3000, onComplete: drift,
          });
        };
        drift();
      }
    });
  }

  // ---- FIX 7/13: spiked death pits -------------------------------------------
  // Dark pit floor + a row of purple spikes. Unless opts.deathZone === false,
  // adds an overlap zone (inset from the edges + sat just below the surface line
  // so standing on an adjacent lip never triggers it, and taller than the spike
  // tips so a fast fall can't tunnel through) that kills on contact. The global
  // DEATH_Y net is kept as a backstop.
  addSpikePit(x, y, width, opts = {}) {
    this.add.rectangle(x + width / 2, y + 20, width, 40, 0x000000, 0.95).setDepth(2);

    const spikeCount = Math.floor(width / 14);
    const g = this.add.graphics().setDepth(3);
    for (let i = 0; i < spikeCount; i++) {
      const sx = x + i * 14 + 7;
      g.fillStyle(0xbf00ff, 0.9);
      g.fillTriangle(sx - 5, y + 12, sx + 5, y + 12, sx, y);
      g.fillStyle(0xffffff, 0.3);
      g.fillTriangle(sx - 2, y + 10, sx + 2, y + 10, sx, y + 2);
    }

    if (opts.deathZone === false) return null;
    const zone = this.add
      .rectangle(x + width / 2, y + 22, Math.max(2, width - 20), 28, 0x000000, 0)
      .setDepth(3);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => {
      if (this.player.isDead || this.levelDone) return;
      if (AssistMode.get('invincibility')) return;
      this.player.die();
    });
    return zone;
  }

  // Place the level's spiked pits (after the player + colliders exist).
  createSpikePits() {
    // Zone 3 climb pit — the real Level 1 death pit, below the vertical climb.
    this.addSpikePit(2400, 820, 1200);
    // Zone 5 rooftop gap (FIX 13) — at the real rooftop elevation (y400).
    this.addSpikePit(5600, 400, 260);
    this.add.text(5730, 360, '▼ STRUCTURAL FAILURE', {
      fontFamily: 'Courier New', fontSize: '7px', color: '#ff0000',
    }).setDepth(3).setOrigin(0.5).setAlpha(0.4);
  }

  // Brief full-screen colour flash (used by the level-complete reward states).
  _completeFlash(color) {
    const f = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, color, 0.18)
      .setScrollFactor(0).setDepth(206);
    this.tweens.add({ targets: f, alpha: 0, duration: 150, onComplete: () => f.destroy() });
  }

  // ---- Platforms & ground -----------------------------------------------------
  createLevelGeometry() {
    for (const [cx, topY, w, thickness] of GROUND) {
      this.addPlatform(cx, topY, w, thickness, { isGround: true });
    }
    for (const [cx, topY, w] of PLATFORMS) {
      this.addPlatform(cx, topY, w, PLATFORM_THICKNESS, { isGround: false });
    }
  }

  // Renders a walkable surface. Two visual treatments share one physics body:
  //   - Floating PLATFORMS: bright neon top edge, glow halo, fake-3D underside +
  //     drop shadow — they read as clean, lit slabs hovering in space.
  //   - Ground FLOORS (city street): a heavier, darker, unlit industrial slab —
  //     dim top edge, a kerb lip, vertical panelling texture, and NO glow / NO
  //     underside / NO drop shadow (the street extends to the world floor).
  // The body keeps its original dimensions and static Arcade body (physics
  // unchanged) in both cases.
  addPlatform(cx, topY, width, thickness = PLATFORM_THICKNESS, opts = {}) {
    if (opts.isGround) {
      this.addFloor(cx, topY, width, thickness);
      return;
    }

    // ---- Floating platform (UNCHANGED visual treatment) ----
    const bottom = topY + thickness;
    // Drop shadow: width + 4px, 6px tall, 10px below the body bottom.
    this.add
      .rectangle(cx, bottom + 13, width + 4, 6, COLORS.PLATFORM, 0.08)
      .setDepth(-2);
    // Underside face: 8px tall immediately below the body (physical thickness).
    this.add
      .rectangle(cx, bottom + 4, width, 8, 0x004422, 1)
      .setDepth(-1);

    // 1. Body — recessed dark fill at 20% opacity. Lit by Light2D so the
    // environment is illuminated by nearby lights (neon edges stay constant).
    const body = this.add
      .rectangle(cx, topY + thickness / 2, width, thickness, COLORS.PLATFORM, 0.2)
      .setDepth(0)
      .setPipeline('Light2D');
    this.physics.add.existing(body, true); // static body (unchanged)
    this.platforms.push(body);

    // 2. Top edge — bright 2px neon line sitting on the body's top surface.
    body.topEdge = this.add
      .rectangle(cx, topY + 1, width, 2, COLORS.PLATFORM, 1)
      .setDepth(1);

    // 3. Glow line — faint 1px halo 1px above the bright edge.
    this.add
      .rectangle(cx, topY - 1.5, width, 1, COLORS.PLATFORM, 0.35)
      .setDepth(1);

    // Optional atmosphere label on ~every third platform (never on ground).
    if (this.platformCount % 3 === 0) {
      this.addPlatformLabel(cx, topY + thickness / 2);
    }
    this.platformCount++;
  }

  // Ground floor segment — the industrial city street. Darker, heavier, unlit,
  // and pointedly un-glowing so it reads as solid ground rather than a floating
  // neon platform. No underside face / drop shadow: the street fills down to the
  // world floor, so neither would ever read. Physics body is identical to a
  // platform's (same dimensions, same static Arcade body).
  addFloor(cx, topY, width, thickness) {
    // 1. Body — dark, near-opaque street slab (#003318 @ 90%). Still lit by
    // Light2D like platforms, but its own colour is far darker / desaturated.
    const body = this.add
      .rectangle(cx, topY + thickness / 2, width, thickness, 0x003318, 0.9)
      .setDepth(0)
      .setPipeline('Light2D');
    this.physics.add.existing(body, true); // static body (unchanged)
    this.platforms.push(body);

    // 2. Vertical panelling texture — thin lines every 20px across the full
    // width, full body height, very faint. One Graphics object for all lines
    // (no per-line game objects). Reads as grating / concrete sections.
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(COLORS.PLATFORM, 0.05); // #00ff88 @ 5%
    const left = cx - width / 2;
    const right = cx + width / 2;
    for (let lx = left + 20; lx < right; lx += 20) {
      g.fillRect(lx, topY, 1, thickness);
    }

    // 3. Top edge — 3px, dimmer than a platform's, NO glow halo above it.
    body.topEdge = this.add
      .rectangle(cx, topY + 1.5, width, 3, 0x00cc66, 0.85)
      .setDepth(1);

    // 4. Secondary lip — faint 1px line 4px below the top edge (kerb / structural
    // lip), suggesting the thickness of the street slab.
    this.add
      .rectangle(cx, topY + 5.5, width, 1, 0x00cc66, 0.25)
      .setDepth(1);
  }

  // Stamps a small, dim tech label into a platform body.
  addPlatformLabel(cx, cy) {
    // Reuse the parallax background's seeded RNG when available so labels are
    // deterministic; fall back to Math.random otherwise.
    const rng = this.background && this.background.rng ? this.background.rng : Math.random;
    const label = PLATFORM_LABELS[Math.floor(rng() * PLATFORM_LABELS.length)];
    this.add
      .text(cx, cy, label, { fontFamily: 'monospace', fontSize: '8px', color: '#00ff88' })
      .setOrigin(0.5)
      .setAlpha(0.25)
      .setDepth(1);
  }

  // ---- Collectibles -----------------------------------------------------------
  createCollectibles() {
    for (const [x, y] of COLLECTIBLES) {
      this.addCollectible(x, y);
    }
  }

  addCollectible(x, y, hidden = false) {
    // Hidden "secret" collectibles are orange and spin 1.5x faster.
    const color = hidden ? HIDDEN_COLLECTIBLE_COLOR : COLORS.COLLECTIBLE;
    const spin = hidden ? 2000 / 1.5 : 2000;

    // Fixed ground shadow beneath the collectible (does not pulse with it).
    const shadow = this.add.ellipse(x, y + 12, 18, 5, color, 0.1).setDepth(1.8);

    // Layered diamond: outer ring + middle (the physics body) + inner core.
    const outer = this.add.rectangle(x, y, 16, 16, color, 0.25).setAngle(45).setDepth(1.9);
    const c = this.add.rectangle(x, y, 12, 12, color, 0.6).setAngle(45).setDepth(2);
    const inner = this.add.rectangle(x, y, 6, 6, color, 1).setAngle(45).setDepth(2.1);

    this.physics.add.existing(c, true); // middle layer carries the static body

    // Mark hidden + the extra visuals to tear down on pickup.
    c.hidden = hidden;
    c.extras = [outer, inner, shadow];

    // Rotation: inner + middle spin together; the outer ring counter-rotates
    // at half speed for a layered, organic look.
    this.tweens.add({ targets: [c, inner], angle: '+=360', duration: spin, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: outer, angle: '-=180', duration: spin, repeat: -1, ease: 'Linear' });

    // Scale pulses at different timings.
    inner.setScale(0.8);
    this.tweens.add({ targets: inner, scale: 1.2, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    outer.setScale(0.95);
    this.tweens.add({ targets: outer, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.collectibles.push(c);
  }

  // ---- Hidden secrets: 3 collectibles + a false wall + a dash-only ledge ----
  createSecrets() {
    // Secret 1 — Zone 2: above the top of the market-district climb. A
    // deliberate double jump straight up from the highest platform [2150,480]
    // (~190px, beyond a single 150px jump) reaches it; the normal route drops
    // down-right into Zone 3, so it stays off the beaten path. (Was at y20 —
    // ~460px above any platform, physically unreachable. Now it sits in view
    // above the platform, so the old off-screen particle hint is unnecessary.)
    this.addCollectible(2150, 290, true);

    // Secret 2 — Zone 3: an orange diamond floating in the airspace above the
    // staircase. Reachable with a deliberate double jump straight up from
    // platform [3120,400], or an up-left jump from [3280,310] — the normal
    // left-to-right traversal flies right past it. (A no-physics "false wall"
    // used to sit beside it, but in the open staircase it concealed nothing
    // and just read as an arbitrary floating block, so it was removed.)
    this.addCollectible(3140, 200, true);

    // Secret 3 — Zone 4: an orange diamond high in the rooftop airspace above
    // platform [4200,300], clear of the surrounding gauntlet platforms. Needs a
    // deliberate double jump (~170px) to reach; the normal hop-across route
    // stays well below it. (It previously sat on a tiny ledge wedged directly
    // under platform [4450,240] — only a 12px gap, far less than the player's
    // height — so the collectible was embedded in that platform and impossible
    // to reach.)
    this.addCollectible(4200, 130, true);
  }

  // ---- Enemies ----------------------------------------------------------------
  createEnemies() {
    for (const [x, y] of DRONES) {
      this.drones.push(new GroundDrone(this, x, y));
    }
    for (const [x, y] of SENTINELS) {
      this.sentinels.push(new HoverSentinel(this, x, y));
    }
    // FIX 3 — no seekers in Level 1 (this.seekers stays empty).
  }

  // ---- Exit portal ------------------------------------------------------------
  createPortal() {
    // Layered, animated dimensional gateway. Its `.trigger` (inner-core sized
    // static body) is what the player must overlap to finish the level.
    this.portal = new ExitPortal(this, PORTAL.x, PORTAL.y);
    // Continuous portal hum while the level runs; stopped on complete / shutdown.
    this.portalOsc = SFX.portalHum();
    this.events.once('shutdown', () => { if (this.portalOsc) this.portalOsc.stop(); });
  }

  // ---- Ability pickups: progressive unlocks through the level ----------------
  createAbilityPickups() {
    // NOTE: double-jump moved from the spec's (1280,500) — that sits 200px above
    // the nearest platform, unreachable with the single jump the player has at
    // this point (you'd need double-jump to reach the double-jump pickup). It
    // now floats just above the first Zone-2 platform [1350,700], reachable with
    // a single jump from the ground. Dash (2480,750) sits on platform [2480,760].
    this.abilityPickups = [
      new AbilityPickup(this, 1350, 670, 'doubleJump', 'DOUBLE JUMP', 'Press jump again in mid-air'),
      new AbilityPickup(this, 2480, 750, 'dash', 'DASH', 'SHIFT / X / C — dash forward'),
    ];
  }

  onAbility(player, trigger) {
    const ap = this.abilityPickups.find((a) => a.trigger === trigger);
    if (!ap) return;
    const newly = (ap.abilityType === 'doubleJump' && !this.player.canDoubleJump)
      || (ap.abilityType === 'dash' && !this.player.canDash)
      || (ap.abilityType === 'attack' && !this.player.hasAttack);
    if (ap.abilityType === 'doubleJump') this.player.canDoubleJump = true;
    if (ap.abilityType === 'dash') this.player.canDash = true;
    if (ap.abilityType === 'attack') this.player.hasAttack = true;
    ap.destroy();
    this.abilityPickups = this.abilityPickups.filter((a) => a !== ap);
    // AUDIO: ability unlock — FL Studio
    if (newly) {
      this.cameraController.cinematicEvent('abilityUnlock', this); // power-fantasy zoom punch
      this.showAbilityPanel(ap.label, ap.description);
    } // skip the panel + zoom if already unlocked (DEV_MODE)
  }

  showAbilityPanel(name, desc) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const panel = makeGlassPanel(this, cx, cy, 280, 90).setScrollFactor(0).setDepth(204).setAlpha(0);
    const title = this.add.text(cx, cy - 16, name, { fontFamily: 'monospace', fontSize: '20px', color: '#ff6a00', fontStyle: 'bold' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(205).setAlpha(0);
    const body = this.add.text(cx, cy + 14, desc, { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(205).setAlpha(0);
    const items = [panel, title, body];
    this.tweens.add({ targets: panel, alpha: 1, duration: 200 });
    this.tweens.add({ targets: title, alpha: 1, duration: 200 });
    this.tweens.add({ targets: body, alpha: 0.7, duration: 200 });
    this.time.delayedCall(2200, () => {
      this.tweens.add({ targets: items, alpha: 0, duration: 300, onComplete: () => items.forEach((o) => o.destroy()) });
    });
  }

  // ---- Colliders & overlaps ---------------------------------------------------
  createColliders() {
    // Solid collisions.
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.drones, this.platforms);

    // Enemy contact -> player death.
    this.physics.add.overlap(this.player, this.drones, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.sentinels, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.seekers, this.onPlayerHit, null, this);

    // Collectibles.
    this.physics.add.overlap(this.player, this.collectibles, this.onCollect, null, this);

    // Exit portal (overlap the inner-core trigger).
    this.physics.add.overlap(this.player, this.portal.trigger, this.onLevelComplete, null, this);

    // Ability pickups (each grants an ability on touch).
    this.abilityPickups.forEach((ap) => {
      this.physics.add.overlap(this.player, ap.trigger, this.onAbility, null, this);
    });

    // Attack: the player's hitbox kills any enemy it overlaps (during the
    // attack window, when the hitbox body is enabled).
    this.enemies = this.add.group([...this.drones, ...this.sentinels, ...this.seekers]);
    this.physics.add.overlap(this.player.attackHitbox, this.enemies, (hb, enemy) => enemy.die());

    // Checkpoint.
    this.physics.add.overlap(this.player, this.checkpoint, this.onCheckpoint, null, this);
  }

  // ---- Checkpoint (Zone 3 entrance) -------------------------------------------
  createCheckpoint() {
    const x = 2400;
    const y = 780;
    // Body block (dim until activated) + a bright 2px left edge.
    this.checkpoint = this.add.rectangle(x, y, 20, 36, COLORS.ACCENT, 0.7).setDepth(1);
    this.physics.add.existing(this.checkpoint, true); // static overlap trigger
    this.checkpointEdge = this.add.rectangle(x - 9, y, 2, 36, COLORS.ACCENT, 1).setDepth(1);
    // "//SAVE" label centred above it.
    this.add
      .text(x, y - 26, '//SAVE', { fontFamily: 'monospace', fontSize: '7px', color: '#ff6a00' })
      .setOrigin(0.5)
      .setAlpha(0.5)
      .setDepth(1);
  }

  onCheckpoint() {
    if (this.checkpointActive) return;
    this.checkpointActive = true;
    SFX.checkpoint();

    // Stays bright permanently once activated.
    this.checkpoint.setFillStyle(COLORS.ACCENT, 1);

    // Update the respawn point to the checkpoint.
    this.respawnX = 2400;
    this.respawnY = 760;

    // Upward particle burst (6 orange particles).
    for (let i = 0; i < 6; i++) {
      const px = 2400 + (i - 2.5) * 4;
      const p = this.add.rectangle(px, 770, 3, 3, COLORS.ACCENT, 1).setDepth(2);
      this.tweens.add({
        targets: p,
        y: 770 - Phaser.Math.Between(30, 55),
        alpha: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }

    // Subtle camera "beat": zoom in 5% (400ms) then back out (350ms). The panel
    // (below) fades in as the zoom begins so both animate together (~750ms).
    this.cameras.main.zoomTo(1.05, 400, 'Sine.easeOut', false, (cam, progress) => {
      if (progress === 1) {
        this.cameras.main.zoomTo(1.0, 350, 'Sine.easeIn');
      }
    });

    // Brief "CHECKPOINT" glass panel (fade in 200, hold 1s, fade out 300).
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2 - 60;
    const panel = makeGlassPanel(this, cx, cy, 180, 40).setScrollFactor(0).setDepth(204).setAlpha(0);
    const label = this.add
      .text(cx, cy, 'CHECKPOINT', { fontFamily: 'monospace', fontSize: '12px', color: '#ff6a00' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(205).setAlpha(0);
    this.tweens.add({ targets: [panel, label], alpha: 1, duration: 200 });
    this.time.delayedCall(1200, () => {
      this.tweens.add({
        targets: [panel, label], alpha: 0, duration: 300,
        onComplete: () => { panel.destroy(); label.destroy(); },
      });
    });
  }

  onPlayerHit() {
    if (AssistMode.get('invincibility')) return;
    this.player.die();
  }

  // Push the player-light position (in UV/screen space) and the sprite's
  // on-screen size into the rim-light pipeline each frame. No-ops on Canvas /
  // if the pipeline isn't attached.
  updateRimLight() {
    const spr = this.player && this.player.visuals && this.player.visuals.sprite;
    if (!spr || !spr.getPostPipeline) return;
    let rim = spr.getPostPipeline('RimLightPipeline');
    if (Array.isArray(rim)) rim = rim[0];
    if (!rim || !this.playerLight) return;
    rim.uLightPos = [
      (this.playerLight.x - this.cameras.main.scrollX) / this.scale.width,
      (this.playerLight.y - this.cameras.main.scrollY) / this.scale.height,
    ];
    rim.uResolution = [Math.max(1, spr.displayWidth), Math.max(1, spr.displayHeight)];
  }

  onCollect(player, c) {
    const { x, y } = c;
    const hidden = !!c.hidden;
    this.tweens.killTweensOf(c);
    if (c.extras) {
      c.extras.forEach((e) => { this.tweens.killTweensOf(e); e.destroy(); });
    }
    c.destroy();
    if (hidden) SFX.collectSecret(); else SFX.collect();
    this.spawnPickupEffect(x, y, hidden);

    if (hidden) {
      this.secretsFound++;
      // Longer, orange visor flash to signal something special.
      this.player.visuals.flashCount(this.secretsFound, HIDDEN_COLLECTIBLE_COLOR, 1200);
    } else {
      this.collectedCount++;
      this.player.visuals.flashCount(this.collectedCount);
    }
  }

  // Burst of shards + a brief flash where a collectible was taken. Hidden
  // pickups burst more shards, orange, travelling further, with a larger flash.
  spawnPickupEffect(x, y, hidden = false) {
    const count = hidden ? 12 : 8;
    const travel = hidden ? 45 : 30;
    const shardColor = hidden ? HIDDEN_COLLECTIBLE_COLOR : COLORS.COLLECTIBLE;
    for (let i = 0; i < count; i++) {
      const ang = (i * (360 / count)) * (Math.PI / 180);
      const r = this.add.rectangle(x, y, 3, 3, shardColor, 1).setDepth(3);
      this.tweens.add({
        targets: r,
        x: x + Math.cos(ang) * travel,
        y: y + Math.sin(ang) * travel,
        alpha: 0,
        duration: 250,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
    const flashSize = hidden ? 28 : 20;
    const flashColor = hidden ? HIDDEN_COLLECTIBLE_COLOR : 0xffffff;
    const flash = this.add.rectangle(x, y, flashSize, flashSize, flashColor, 0.8).setDepth(3);
    this.tweens.add({ targets: flash, alpha: 0, duration: 150, onComplete: () => flash.destroy() });
    // No screen shake for collectibles — reserved for more impactful moments.
  }

  // ---- Screen shake utility ---------------------------------------------------
  // Small wrapper so any entity can request a camera shake via this.scene.
  shakeScreen(duration, intensity) {
    this.cameras.main.shake(duration, intensity);
  }

  // ---- Juice: hit-pause (hitstop) ---------------------------------------------
  // Briefly freeze physics + tweens, then resume. The scene clock keeps running
  // so the resume timer (and other delayedCalls) still fire.
  hitPause(duration) {
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.delayedCall(duration, () => {
      this.physics.resume();
      this.tweens.resumeAll();
    });
  }

  // ---- Juice: chromatic aberration punch --------------------------------------
  chromaticHit(intensity, duration) {
    const cam = this.cameras.main;
    if (!cam.getPostPipeline) return;
    let pipeline = cam.getPostPipeline(ChromaticAberrationPipeline);
    if (Array.isArray(pipeline)) pipeline = pipeline[0];
    if (!pipeline) return; // e.g. Canvas fallback — no post-FX

    pipeline.uIntensity = intensity;
    pipeline.uOffset = 0.008;
    this.tweens.add({ targets: pipeline, uIntensity: 0, duration, ease: 'Power2' });
  }

  // ---- Juice: death screensplat -----------------------------------------------
  // Leaves a persistent stain mark at the death position. Marks accumulate
  // across deaths (the world remembers); max 5 — the oldest is removed first.
  spawnDeathSplat(x, y) {
    const BRIGHT = COLORS.PLAYER; // 0xc8ffd4
    const DARK = 0x004422;
    const persistent = []; // objects that stay until trimmed/level complete

    // 1. Central burst — 6 fragments fly out and stain dark as they land.
    for (let i = 0; i < 6; i++) {
      const ang = (i * 60) * (Math.PI / 180);
      const dist = Phaser.Math.Between(30, 60);
      const w = Phaser.Math.Between(4, 10);
      const h = Phaser.Math.Between(4, 8);
      const frag = this.add.rectangle(x, y, w, h, BRIGHT, 1).setDepth(4);
      const from = Phaser.Display.Color.IntegerToColor(BRIGHT);
      const to = Phaser.Display.Color.IntegerToColor(DARK);
      this.tweens.add({
        targets: frag,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0.35,
        duration: 300,
        ease: 'Quad.easeOut',
        onUpdate: (tw) => {
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tw.progress * 100);
          frag.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), frag.fillAlpha);
        },
      });
      persistent.push(frag);
    }

    // 2. Stain marks — 4 tiny scattered specks that appear immediately.
    for (let i = 0; i < 4; i++) {
      const sx = x + Phaser.Math.Between(-20, 20);
      const sy = y + Phaser.Math.Between(-20, 20);
      const speck = this.add
        .rectangle(sx, sy, 2, 3, DARK, 0.4)
        .setAngle(Phaser.Math.Between(0, 360))
        .setDepth(4);
      persistent.push(speck);
    }

    // 3. Impact ring — a 45deg diamond outline expanding outward then gone.
    const ring = this.add.rectangle(x, y, 10, 10).setDepth(4).setAngle(45);
    ring.isFilled = false;
    ring.setStrokeStyle(2, BRIGHT, 1);
    ring.setAlpha(0.8);
    this.tweens.add({
      targets: ring,
      scaleX: 4,
      scaleY: 4,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    // Track the persistent mark; trim to the most recent 5.
    this.deathSplats.push(persistent);
    while (this.deathSplats.length > 5) {
      const oldest = this.deathSplats.shift();
      oldest.forEach((o) => o.destroy());
    }
  }

  // Remove every death mark (used on level complete).
  clearDeathSplats() {
    this.deathSplats.forEach((mark) => mark.forEach((o) => o.destroy()));
    this.deathSplats = [];
  }

  onLevelComplete() {
    if (this.levelDone) return;
    this.levelDone = true;
    Progression.complete(1); // unlock Level 2 in the menu
    // Cinematic: slow zoom out over the conquered level (stays out for the overlay).
    this.cameraController.cinematicEvent('portalReached', this);
    // AUDIO: level complete — FL Studio
    if (this.portalOsc) this.portalOsc.stop();

    // Freeze the player.
    this.player.frozen = true;
    this.player.body.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);

    // Juice: punchy freeze + RGB split; clear any death marks (run is over).
    this.hitPause(120);
    this.chromaticHit(0.8, 600);
    this.clearDeathSplats();

    // 1. Full-screen white flash (60% -> 0 over 400ms).
    const flash = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0xffffff, 0.6)
      .setScrollFactor(0)
      .setDepth(200);
    this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });

    // 2 + 3. Portal burst (rings scale out) and outward particle explosion.
    this.portal.activate();

    // 4. Screen shake.
    this.shakeScreen(400, 0.015);

    // 5. After a short beat, show the completion overlay (count + story beat +
    //    a "press space" prompt that hands off to Level 2).
    this.time.delayedCall(600, () => this.showLevelCompleteOverlay());
  }

  showLevelCompleteOverlay() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Dark backdrop fades in.
    const bg = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x050a08, 0)
      .setScrollFactor(0)
      .setDepth(201);
    this.tweens.add({ targets: bg, alpha: 0.85, duration: 300 });

    // Glassmorphism panels behind the text.
    const mainPanel = makeGlassPanel(this, cx, cy, 320, 80).setScrollFactor(0).setDepth(201);
    const subPanel = makeGlassPanel(this, cx, cy + 70, 240, 40).setScrollFactor(0).setDepth(202);
    const main = this.add
      .text(cx, cy, 'LEVEL COMPLETE', { fontFamily: 'monospace', fontSize: '32px', color: '#ff6a00' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(203);
    const sub = this.add
      .text(cx, cy + 70, `${this.collectedCount} / ${TOTAL_COLLECTIBLES} COLLECTED`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#00e5ff',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(203);

    const entrance = [[mainPanel, cy], [main, cy], [subPanel, cy + 70], [sub, cy + 70]];

    // Line 3 — secrets (orange). Only shown if at least one secret was found.
    let perfectWord = null;
    if (this.secretsFound >= 1) {
      const y3 = cy + 106;
      const style = { fontFamily: 'monospace', fontSize: '16px', color: '#ff6a00' };
      if (this.secretsFound >= HIDDEN_COLLECTIBLE_COUNT) {
        // "3 / 3 SECRETS — PERFECT", with PERFECT split out for a scale punch.
        const prefix = this.add.text(0, y3, `${HIDDEN_COLLECTIBLE_COUNT} / ${HIDDEN_COLLECTIBLE_COUNT} SECRETS — `, style)
          .setOrigin(0.5).setScrollFactor(0).setDepth(203);
        const word = this.add.text(0, y3, 'PERFECT', style)
          .setOrigin(0.5).setScrollFactor(0).setDepth(203);
        const totalW = prefix.width + word.width;
        prefix.x = cx - totalW / 2 + prefix.width / 2;
        word.x = cx - totalW / 2 + prefix.width + word.width / 2;
        entrance.push([prefix, y3], [word, y3]);
        perfectWord = word;
      } else {
        const line3 = this.add
          .text(cx, y3, `${this.secretsFound} / ${HIDDEN_COLLECTIBLE_COUNT} SECRETS`, style)
          .setOrigin(0.5).setScrollFactor(0).setDepth(203);
        entrance.push([line3, y3]);
      }
    }

    // ---- FIX 4: collection reward states ----
    const allData = this.collectedCount >= TOTAL_COLLECTIBLES;
    const allSecrets = this.secretsFound >= HIDDEN_COLLECTIBLE_COUNT;
    let rewardY = cy + 172;
    if (allData) {
      const r = this.add.text(cx, rewardY, 'ALL DATA RECOVERED', {
        fontFamily: 'monospace', fontSize: '10px', color: '#00e5ff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      entrance.push([r, rewardY]);
      rewardY += 14;
      this._completeFlash(0x00e5ff); // brief cyan flash
    }
    if (allSecrets) {
      const r = this.add.text(cx, rewardY, 'ALL SECRETS FOUND — EXILE REMEMBERED', {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff6a00',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      entrance.push([r, rewardY]);
      rewardY += 14;
      this._completeFlash(0xff6a00); // brief orange flash
    }
    if (allData && allSecrets) {
      main.setColor('#ffffff'); // perfect run — title goes white
      const pr = this.add.text(cx, cy - 46, 'PERFECT RUN', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(205).setAlpha(0).setScale(0.6);
      this.tweens.add({
        targets: pr, alpha: 1, scale: 1, duration: 400, ease: 'Back.easeOut',
        onComplete: () => this.tweens.add({
          targets: pr, alpha: 0, scale: 1.1, delay: 800, duration: 400, onComplete: () => pr.destroy(),
        }),
      });
    }
    // Continue prompt sits below the reward lines when any are shown.
    this._completeContinueY = (allData || allSecrets) ? rewardY + 12 : cy + 190;

    // Entrance: slide in from y+20 with fade over 300ms.
    entrance.forEach(([obj, ty]) => {
      obj.y = ty + 20;
      obj.alpha = 0;
      this.tweens.add({ targets: obj, y: ty, alpha: 1, duration: 300, ease: 'Quad.easeOut' });
    });

    // Brief scale punch on the word PERFECT once it has settled in.
    if (perfectWord) {
      this.tweens.add({
        targets: perfectWord, scale: 1.4, duration: 150, yoyo: true, ease: 'Quad.easeOut', delay: 450,
      });
    }

    // Story beat (NAR-006): divider + exile line, fading in after the panel.
    const beatDiv = this.add.rectangle(cx, cy + 132, 280, 1, 0xff6a00, 0).setScrollFactor(0).setDepth(203);
    const beat = this.add
      .text(cx, cy + 152, LEVEL_COMPLETE_BEATS[1].beat, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00', align: 'center',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0);
    this.time.delayedCall(200, () => {
      this.tweens.add({ targets: beatDiv, alpha: 0.3, duration: 400 });
      this.tweens.add({ targets: beat, alpha: 0.8, duration: 400 });
    });

    // Continue prompt (appears after 1.5s; Space or tap hands off to Level 2).
    this.time.delayedCall(1500, () => {
      const doTransition = () => {
        if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic = null; }
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('Level2');
          this.scene.stop('Game');
        });
      };
      const isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      const contY = this._completeContinueY || cy + 190;
      const cont = this.add
        .text(cx, contY, isTouchDevice ? 'TAP TO CONTINUE' : 'PRESS SPACE TO CONTINUE', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0.4);
      this.tweens.add({ targets: cont, alpha: { from: 0.15, to: 0.4 }, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const tapHit = this.add.rectangle(cx, contY, 280, 40, 0x000000, 0.001)
        .setScrollFactor(0).setDepth(204).setInteractive();
      tapHit.on('pointerdown', () => { tapHit.destroy(); doTransition(); });
      this.input.keyboard.once('keydown-SPACE', () => { tapHit.destroy(); doTransition(); });
    });
  }

  // ---- Main loop --------------------------------------------------------------
  update(time, delta) {
    // M (or the touch MUTE button) toggles all audio via SFX.enabled.
    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.m) || this.touchControls.mute.justDown) {
      SFX.toggleMute();
      if (this.bgMusic) this.bgMusic.setMute(!SFX.enabled);
    }

    // ESC: from the assist submenu go back to main pause; otherwise toggle pause.
    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc) && !this.levelDone) {
      if (this.isPaused && this.pauseMode === 'assist') {
        this._closeAssistOverlay();
      } else {
        this.togglePause();
      }
    }
    if (this.isPaused) {
      this.updatePauseMenu();
      return; // freeze all game logic while paused
    }

    // Assist mode: smooth physics timeScale toward target (0.75 or 1.0).
    const targetScale = AssistMode.get('slowerGameSpeed') ? ASSIST_MODE.GAME_SPEED_MULTIPLIER : 1.0;
    if (Math.abs(this.physics.world.timeScale - targetScale) > 0.001) {
      this.physics.world.timeScale = Phaser.Math.Linear(this.physics.world.timeScale, targetScale, 0.05);
    } else {
      this.physics.world.timeScale = targetScale;
    }

    this.background.update();
    this.player.update(time, delta);

    // Skip AI for enemies more than 1200px from the player (Level 1 world = 6400px).
    const near = (e) => Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 1200;
    // Drones STEER when near, FREEZE when far. A culled drone must be halted:
    // global physics keeps moving a body even when its patrol logic is skipped,
    // so a far drone with any residual velocity walks off its platform and drifts
    // away. Freezing guarantees a drone only ever moves while actively steering.
    for (const d of this.drones) {
      if (!d.active) continue;
      if (near(d)) d.update(time, delta); else d.freeze();
    }
    for (const s of this.sentinels) if (s.active && near(s)) s.update(time, delta);
    for (const s of this.seekers) if (s.active && near(s)) s.update(time, delta);
    this.portal.update(time, delta);
    for (const ap of this.abilityPickups) ap.update(time, delta);
    this.cameraController.update(this.player, delta);
    this.livingBackground.update(time, delta);

    // Per-zone atmosphere shift (5 stages by player x; 3s drift on change).
    const zone = this.zoneForX(this.player.x);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.shiftToZone(zone);
    }

    // ---- Zone transition markers (district labels fade in/out on entry) ----
    // Stop scanning once every marker has fired (avoids a per-frame closure +
    // full-array scan for the rest of the level).
    if (this.triggeredMarkers.size < ZONE_MARKERS.length) {
      ZONE_MARKERS.forEach((marker) => {
        if (this.triggeredMarkers.has(marker.x) || this.player.x < marker.x) return;
        this.triggeredMarkers.add(marker.x);

        const t = this.add.text(this.scale.width / 2, 120, marker.label, {
          fontFamily: 'Courier New',
          fontSize: '13px',
          color: '#00ff88',
          letterSpacing: 4,
        });
        t.setOrigin(0.5, 0.5);
        t.setScrollFactor(0);
        t.setDepth(100);
        t.setAlpha(0);

        this.tweens.add({
          targets: t,
          alpha: 0.7,
          duration: 400,
          onComplete: () => {
            this.time.delayedCall(1800, () => {
              this.tweens.add({
                targets: t,
                alpha: 0,
                duration: 600,
                onComplete: () => t.destroy(),
              });
            });
          },
        });
      });
    }

    // ---- Dev zone indicator (DEV_MODE only) ----
    if (DEV_MODE && this.devZoneText) {
      const px = Math.floor(this.player.x);
      const py = Math.floor(this.player.y);
      let z = 1;
      let zoneName = 'ZONE 1 — TUTORIAL STREET';
      if (px >= 1200 && px < 2400) { z = 2; zoneName = 'ZONE 2 — MARKET DISTRICT'; }
      else if (px >= 2400 && px < 3600) { z = 3; zoneName = 'ZONE 3 — VERTICAL CLIMB'; }
      else if (px >= 3600 && px < 4800) { z = 4; zoneName = 'ZONE 4 — ROOFTOP GAUNTLET'; }
      else if (px >= 4800) { z = 5; zoneName = 'ZONE 5 — ALIEN SPIRE'; }
      const zoneColours = { 1: '#00ff88', 2: '#00ddff', 3: '#aa88ff', 4: '#ff8800', 5: '#ff4444' };
      this.devZoneText.setText(zoneName);
      this.devZoneText.setColor(zoneColours[z]);
      this.devPosText.setText(`x:${px}  y:${py}  zone:${z}`);
    }

    // ---- Dynamic lights ----
    // Player light follows the player; brightens to white during a dash.
    this.playerLight.x = this.player.x;
    this.playerLight.y = this.player.y;
    if (this.player.isDashing) {
      this.playerLight.setIntensity(2.4);
      this.playerLight.setColor(0xffffff);
    } else {
      this.playerLight.setIntensity(1.5);
      this.playerLight.setColor(0x00ff88);
    }
    // Portal light pulses.
    const pulse = Math.sin(this.time.now / 800) * 0.4 + 1.4;
    this.portalLight.setIntensity(pulse);

    // ---- Aesthetic systems ----
    this.diegeticHUD.update(time, delta);
    this.dataNoise.update(time, delta);
    this.updatePlatformFlicker();

    // Fell into a pit / off the world bottom.
    if (!this.player.isDead && !this.levelDone && this.player.y > DEATH_Y
        && !AssistMode.get('invincibility')) {
      this.player.die();
    }

    // FPS safeguards: degrade FX once when the framerate drops (one-shot flags
    // so we don't re-run the pipeline lookups every frame after the first dip).
    if (!this._fxDegraded && this.game.loop.actualFps < 50) {
      this._fxDegraded = true;
      // Reduce bloom strength.
      let p = this.cameras.main.getPostPipeline('BloomPipeline');
      if (Array.isArray(p)) p = p[0];
      if (p) p.uStrength = 1.0;
      // Brighten ambient.
      this.lights.setAmbientColor(0x222222);
    }
    // CRT safeguard: drop scanlines (keep vignette) if the framerate is poor.
    if (!this._scanlinesDropped && this.game.loop.actualFps < 45) {
      this._scanlinesDropped = true;
      let crt = this.cameras.main.getPostPipeline('CRTPipeline');
      if (Array.isArray(crt)) crt = crt[0];
      if (crt) crt.uScanlineOpacity = 0;
    }

    // ---- Speed progression: ramp the player's run speed from Zone 3 to the
    // end of Zone 5 (subtle — peaks at SPEED_PROGRESSION_MAX_MULTIPLIER). ----
    const progressStart = 2400; // Zone 3 entrance
    const progressEnd = 6400;   // end of Zone 5
    const playerX = this.player.x;
    if (playerX > progressStart) {
      const t = Math.min((playerX - progressStart) / (progressEnd - progressStart), 1.0);
      const multiplier = 1.0 + (SPEED_PROGRESSION_MAX_MULTIPLIER - 1.0) * t;
      this.player.setSpeedMultiplier(multiplier);
    } else {
      this.player.setSpeedMultiplier(1.0);
    }
  }

  // ---- Per-zone atmosphere ----------------------------------------------------
  zoneForX(x) {
    if (x < 1200) return 'zone1';
    if (x < 2400) return 'zone2';
    if (x < 3600) return 'zone3';
    if (x < 4800) return 'zone4';
    return 'zone5';
  }

  // Drift the backdrop colour + fog to a new zone over 3s. Colours go through
  // PaletteManager (extended to all 5 zones); fog opacity lerps alongside.
  shiftToZone(zoneKey) {
    const z = LEVEL1_ZONE_PALETTES[zoneKey];
    const startOpacity = this._fogOpacity;
    this.palette.transitionTo({ bgTint: z.bgTint, fogColour: z.fogColour }, 3000, (p) => {
      this.cameras.main.setBackgroundColor(p.bgTint.color);
      if (this.fogOverlay) this.fogOverlay.setFillStyle(p.fogColour.color, this._fogOpacity);
    });
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 3000,
      onUpdate: (tw) => { this._fogOpacity = Phaser.Math.Linear(startOpacity, z.fogOpacity, tw.getValue()); },
    });
  }

  // ---- Pause (FIX 6) ----------------------------------------------------------
  togglePause() {
    if (this.isPaused) this.resumeGame();
    else this.pauseGame();
  }

  pauseGame() {
    this.isPaused = true;
    this.pauseSelection = 0;
    this.pauseMode = 'main';
    this.assistSelection = 0;
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.buildPauseOverlay();
  }

  resumeGame() {
    this.isPaused = false;
    this.pauseMode = 'main';
    this.physics.resume();
    this.tweens.resumeAll();
    this.time.paused = false;
    this.destroyPauseOverlay();
  }

  buildPauseOverlay() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const dim = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x050a08, 0.75)
      .setScrollFactor(0).setDepth(300);
    const panel = makeGlassPanel(this, cx, cy, 280, 215).setScrollFactor(0).setDepth(301);
    const title = this.add
      .text(cx, cy - 64, 'PAUSED', { fontFamily: 'monospace', fontSize: '24px', color: '#00ff88' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(302);
    const sep = this.add.rectangle(cx, cy - 40, 200, 1, 0x00ff88, 0.6).setScrollFactor(0).setDepth(302);
    this.resumeText = this.add
      .text(cx - 60, cy - 14, 'RESUME', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.restartText = this.add
      .text(cx - 60, cy + 14, 'RESTART', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.assistText = this.add
      .text(cx - 60, cy + 42, 'ASSIST', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.mainMenuText = this.add
      .text(cx - 60, cy + 70, 'MAIN MENU', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.pauseUI = [dim, panel, title, sep, this.resumeText, this.restartText, this.assistText, this.mainMenuText];
    this.refreshPauseSelection();
  }

  destroyPauseOverlay() {
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null;
  }

  refreshPauseSelection() {
    if (!this.resumeText) return;
    this.resumeText.setText(`${this.pauseSelection === 0 ? '> ' : '  '}RESUME`).setAlpha(this.pauseSelection === 0 ? 1 : 0.6);
    this.restartText.setText(`${this.pauseSelection === 1 ? '> ' : '  '}RESTART`).setAlpha(this.pauseSelection === 1 ? 1 : 0.6);
    this.assistText.setText(`${this.pauseSelection === 2 ? '> ' : '  '}ASSIST`).setAlpha(this.pauseSelection === 2 ? 1 : 0.6);
    this.mainMenuText.setText(`${this.pauseSelection === 3 ? '> ' : '  '}MAIN MENU`).setAlpha(this.pauseSelection === 3 ? 1 : 0.6);
  }

  updatePauseMenu() {
    // Dispatch to assist submenu when it is open.
    if (this.pauseMode === 'assist') { this.updateAssistMenu(); return; }

    const k = this.pauseKeys;
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w)) {
      this.pauseSelection = Math.max(0, this.pauseSelection - 1);
      this.refreshPauseSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) {
      this.pauseSelection = Math.min(3, this.pauseSelection + 1);
      this.refreshPauseSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.pauseSelection === 0) {
        this.resumeGame();
      } else if (this.pauseSelection === 1) {
        // RESTART: fully reset the scene from scratch.
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.isPaused = false;
        this.scene.restart();
      } else if (this.pauseSelection === 2) {
        // ASSIST: open the assist submenu (keeps the game paused).
        this._openAssistOverlay();
      } else {
        // MAIN MENU: resume scene state, fade out, hand back to the menu.
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.isPaused = false;
        if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic = null; }
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.stop('UI');
          this.scene.start('MainMenu');
          this.scene.stop(this.scene.key); // 'Game' or 'Level2'
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Assist overlay — builds the submenu, handles its input, rebuilds on exit.
  // ---------------------------------------------------------------------------
  _openAssistOverlay() {
    this.pauseMode = 'assist';
    this.assistSelection = 0;
    this.destroyPauseOverlay();
    this.buildAssistOverlay();
  }

  _closeAssistOverlay() {
    this.pauseMode = 'main';
    this.destroyPauseOverlay();
    this.buildPauseOverlay();
  }

  buildAssistOverlay() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const dim = this.add
      .rectangle(cx, cy, this.scale.width, this.scale.height, 0x050a08, 0.75)
      .setScrollFactor(0).setDepth(300);
    const panel = makeGlassPanel(this, cx, cy, 280, 220).setScrollFactor(0).setDepth(301);
    const header = this.add
      .text(cx, cy - 88, 'ASSIST MODE', { fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(302).setAlpha(0.6);
    const divider = this.add.rectangle(cx, cy - 75, 240, 1, 0xff6a00, 0.2)
      .setScrollFactor(0).setDepth(302);

    const OPTIONS = [
      { key: 'reducedEnemySpeed', name: 'REDUCED ENEMY SPEED', desc: 'Enemies move at 60% normal speed' },
      { key: 'slowerGameSpeed',   name: 'SLOWER GAME SPEED',   desc: 'Game runs at 75% speed'           },
      { key: 'invincibility',     name: 'INVINCIBILITY',       desc: 'Player cannot die'                },
    ];
    const ROW_Y = [cy - 56, cy - 12, cy + 32];

    this.assistRows = OPTIONS.map((opt, i) => {
      const y = ROW_Y[i];
      const on = AssistMode.get(opt.key);
      const arrow = this.add.text(cx - 108, y, '▶', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' })
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0);
      const checkbox = this.add.text(cx - 94, y, on ? '[✓]' : '[ ]', { fontFamily: 'monospace', fontSize: '12px', color: on ? '#ff6a00' : '#00ff88' })
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(on ? 0.9 : 0.4);
      const name = this.add.text(cx - 68, y, opt.name, { fontFamily: 'monospace', fontSize: '13px', color: '#00ff88' })
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.5);
      const desc = this.add.text(cx - 68, y + 15, opt.desc, { fontFamily: 'monospace', fontSize: '9px', color: '#00ff88' })
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.3);
      return { arrow, checkbox, name, desc, key: opt.key };
    });

    const backArrow = this.add.text(cx - 42, cy + 78, '▶', { fontFamily: 'monospace', fontSize: '10px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0);
    const backText = this.add.text(cx - 24, cy + 78, 'BACK', { fontFamily: 'monospace', fontSize: '10px', color: '#00ff88' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.4);
    this.assistBackRow = { arrow: backArrow, text: backText };

    this.pauseUI = [
      dim, panel, header, divider,
      ...this.assistRows.flatMap((r) => [r.arrow, r.checkbox, r.name, r.desc]),
      backArrow, backText,
    ];
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
      this.assistSelection = Math.max(0, this.assistSelection - 1);
      this.refreshAssistSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) {
      this.assistSelection = Math.min(3, this.assistSelection + 1);
      this.refreshAssistSelection();
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

  // Power-grid flicker: each platform body briefly dims to 60% for 80ms on its
  // own staggered, seeded schedule (every ~8-15s).
  updatePlatformFlicker() {
    const now = this.time.now;
    for (let i = 0; i < this.platforms.length; i++) {
      const pl = this.platforms[i];
      if (pl._flickering) {
        if (now >= pl._flickerEnd) {
          pl.setAlpha(1);
          pl._flickering = false;
        }
      } else if (now >= pl._nextFlicker) {
        pl.setAlpha(0.6);
        pl._flickering = true;
        pl._flickerEnd = now + 80;
        pl._nextFlicker = now + 8000 + this.fxRng() * 7000;
      }
    }
  }
}
