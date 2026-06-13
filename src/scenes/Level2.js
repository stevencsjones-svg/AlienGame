import Phaser from 'phaser';
import {
  LEVEL2, LEVEL2_PARALLAX, LEVEL2_WORLD, ENEMY, ABILITY_PANEL_HOLD_MS, DEV_MODE,
  LEVEL_COMPLETE_BEATS, LEVEL2_COLLECTIBLE_COUNT, HIDDEN_COLLECTIBLE_COUNT,
  HIDDEN_COLLECTIBLE_COLOR, ASSIST_MODE, MUSIC_VOLUME,
} from '../constants.js';
import AssistMode from '../utils/AssistMode.js';
import Player from '../entities/Player.js';
import GroundDrone from '../entities/GroundDrone.js';
import HoverSentinel from '../entities/HoverSentinel.js';
import Seeker from '../entities/Seeker.js';
import ExitPortal from '../entities/ExitPortal.js';
import MovingPlatform from '../entities/MovingPlatform.js';
import AbilityPickup from '../entities/AbilityPickup.js';
import ShieldPickup from '../entities/ShieldPickup.js';
import ParallaxBackground from '../background/ParallaxBackground.js';
import UndergroundAtmosphere from '../background/UndergroundAtmosphere.js';
import ChromaticAberrationPipeline from '../pipelines/ChromaticAberrationPipeline.js';
import CameraController from '../camera/CameraController.js';
import DiegeticHUD from '../ui/DiegeticHUD.js';
import { buildPlatformVisual } from '../entities/platformVisual.js';
import { createCollectible, spawnPickupShards } from '../entities/collectible.js';
import { makeGlassPanel } from '../ui/glassPanel.js';
import SFX from '../audio/SFX.js';
import TouchControls from '../ui/TouchControls.js';
import level2MusicUrl from '../audio/level2_music.ogg';
import Progression from '../utils/Progression.js';

const P = LEVEL2;
const W = LEVEL2_WORLD.WIDTH;
const H = LEVEL2_WORLD.HEIGHT;

// Title card shows once per session (survives respawns and scene restarts).
let level2TitleShown = false;

// =============================================================================
// LEVEL DATA — a 14000x6000 U-shaped run:
//   S1 (x0–4000, right) → S2 (x4000–8000, right, low ceiling + attack pickup)
//   → S3 (plunge shaft, x7600–8400, DOWN) → S4 (the deep, x800–7800, LEFT)
//   → S5 (ascent shaft, x800–1600, UP) → exit portal at the top.
// Platform data is [centreX, topY, w, h]. Moving platforms are
// [startX, topY, range, speed] (all horizontal). Enemies/collectibles are
// [x, y]. Ground drones get a y just above their floor so they settle onto it.
// =============================================================================

const GROUND = [
  // S1+S2 floor split around two death pits.
  [1050, 660, 2100, 20], // left segment  (x:0–2100)
  [3930, 660, 3140, 20], // centre segment (x:2360–5500; pit 1 gap x:2100–2360)
  [6760, 660, 2080, 20], // right segment  (x:5720–7800; pit 2 gap x:5500–5720)
  [7000, 5660, 14000, 20], // S4 floor (full width, unchanged)
];

const PLATFORMS = [
  // --- Section 1 (x0–4000) — thinned for deliberate rhythm ---
  // Removed: x:400, x:1060, x:1960, x:2420, x:3100, x:3700
  // Added:   x:580 (replaces the removed mover at startX:500)
  [180, 560, 140, 14], [580, 540, 100, 14], [600, 560, 160, 14], [820, 480, 140, 14],
  [1260, 460, 160, 14], [1500, 520, 140, 14], [1720, 460, 120, 14],
  [2200, 480, 140, 14], [2640, 460, 160, 14],
  [2880, 520, 140, 14], [3320, 540, 160, 14], [3520, 480, 140, 14], [3860, 460, 160, 14],
  // --- Section 2 (x4000–8000) — every other platform kept ---
  // Removed: x:4300,4480,4880,5060,5460,5640,6040,6240,6640,6840,7240
  // Adjusted: x:5260 w:120 → x:5340 w:280 (extends to x:5480 flush with pit 2)
  // Added:    x:5740 w:120 (landing platform on far side of pit 2)
  [4100, 560, 120, 14], [4680, 480, 120, 14],
  [5340, 540, 280, 14], [5740, 540, 120, 14], [5840, 480, 120, 14],
  [6440, 540, 120, 14], [7040, 480, 120, 14], [7460, 480, 140, 14],
  // --- Section 3 (plunge shaft, zigzag) ---
  [7620, 900, 160, 14], [8220, 1100, 160, 14], [7620, 1300, 160, 14], [8220, 1500, 160, 14],
  [7620, 1700, 160, 14], [8220, 1900, 160, 14], [7620, 2100, 160, 14], [8220, 2300, 160, 14],
  [7620, 2500, 160, 14], [8220, 2700, 160, 14], [7620, 2900, 160, 14], [8220, 3100, 160, 14],
  [7620, 3300, 160, 14], [8220, 3500, 160, 14], [7620, 3700, 160, 14], [8220, 3900, 160, 14],
  [7620, 4100, 160, 14], [8220, 4300, 160, 14], [7620, 4500, 160, 14], [8220, 4700, 160, 14],
  [7620, 4900, 160, 14], [8220, 5100, 160, 14], [7620, 5300, 160, 14], [7900, 5500, 200, 14],
  // --- Section 4 (the deep, right to left) ---
  [7600, 5560, 160, 14], [7340, 5500, 140, 14], [7080, 5560, 160, 14], [6800, 5500, 140, 14],
  [6520, 5560, 160, 14], [6240, 5500, 140, 14], [5960, 5560, 160, 14], [5680, 5500, 140, 14],
  [5400, 5560, 160, 14], [5120, 5500, 140, 14], [4840, 5560, 160, 14], [4560, 5500, 140, 14],
  [4280, 5560, 160, 14], [4000, 5500, 140, 14], [3720, 5560, 160, 14], [3440, 5500, 140, 14],
  [3160, 5560, 160, 14], [2880, 5500, 140, 14], [2600, 5560, 160, 14], [2320, 5500, 140, 14],
  [2040, 5560, 160, 14], [1200, 5560, 160, 14],
  // --- Section 5 (ascent shaft, zigzag) ---
  [820, 5400, 160, 14], [1420, 5200, 160, 14], [820, 5000, 160, 14], [1420, 4800, 160, 14],
  [820, 4600, 160, 14], [1420, 4400, 160, 14], [820, 4200, 160, 14], [1420, 4000, 160, 14],
  [820, 3800, 160, 14], [1420, 3600, 160, 14], [820, 3400, 160, 14], [1420, 3200, 160, 14],
  [820, 3000, 160, 14], [1420, 2800, 160, 14], [820, 2600, 160, 14], [1420, 2400, 160, 14],
  [820, 2200, 160, 14], [1420, 2000, 160, 14], [820, 1800, 160, 14], [1420, 1600, 160, 14],
  [820, 1400, 160, 14], [1420, 1200, 160, 14], [820, 1000, 160, 14], [1420, 800, 160, 14],
  [820, 600, 160, 14], [1100, 440, 200, 14],
];

// [startX, topY, range, speed] — all horizontal.
const MOVERS = [
  [1400, 540, 300, 70], [2800, 500, 300, 60],                        // S1 (x:500 mover removed; replaced by static platform)
  [4600, 580, 300, 65], [6400, 560, 300, 75],                        // S2
  [7620, 1000, 600, 45], [7620, 2600, 600, 55], [7620, 4200, 600, 65], // S3
  [6600, 5540, 300, 55], [4100, 5540, 300, 65], [2000, 5540, 300, 75], // S4
  [820, 4600, 600, 50], [820, 2200, 600, 60],                        // S5
];

// Ground drones [x, y] — y sits just above the floor so they settle on it.
const DRONES = [
  [300, 640], [800, 640], [1500, 640], [2400, 640], [3200, 640],                 // S1
  [4300, 640], [4800, 640], [5200, 640], [5750, 640], [6200, 640], [6700, 640], [7200, 640], // S2 (5700 → 5750, clear of pit 2)
  [7200, 5640], [6400, 5640], [5600, 5640], [4800, 5640], [2800, 5640], [1800, 5640], // S4
];

const SENTINELS = [
  [700, 420], [1800, 400], [3000, 420],                              // S1
  [4600, 440], [5400, 420], [6200, 440], [7000, 420],                // S2
  [8000, 820], [8000, 1620], [8000, 2420], [8000, 3220], [8000, 4020], [8000, 4820], // S3
  [6800, 5420], [5200, 5400], [2400, 5420],                          // S4
  [1200, 5320], [1200, 4720], [1200, 4120], [1200, 3520], [1200, 2920], [1200, 2320], [1200, 1720], [1200, 1120], // S5
];

// 35 regular collectibles.
const COLLECTIBLES = [
  [280, 520], [700, 440], [1100, 500], [1900, 420], [2600, 500], [3400, 420], [3800, 500],   // S1 (7)
  [4200, 520], [4900, 440], [5500, 500], [6100, 440], [6800, 500], [7400, 440],              // S2 (6)
  [8000, 980], [8000, 1780], [8000, 2580], [8000, 3380], [8000, 4180], [8000, 4980],         // S3 (6)
  [7400, 5460], [6600, 5460], [5800, 5460], [5000, 5460], [4200, 5460], [3000, 5460], [1800, 5460], [1000, 5460], // S4 (8)
  [1200, 5100], [1200, 4500], [1200, 3900], [1200, 3300], [1200, 2700], [1200, 2100], [1200, 1500], [1200, 900],  // S5 (8)
];
// 3 secret collectibles (orange).
const SECRETS = [[7460, 360], [7660, 5180], [1100, 5100]];

// Camera lerp per section.
const CAM_LERP = {
  horizontal: [0.1, 0.08],
  plunge: [0.05, 0.15],
  deep: [0.1, 0.05],
  ascent: [0.05, 0.15],
};

export default class Level2 extends Phaser.Scene {
  constructor() {
    super('Level2');
  }

  preload() {
    // Background music (idempotent — the cache key is reused across restarts).
    if (!this.cache.audio.exists('level2_music')) {
      this.load.audio('level2_music', level2MusicUrl);
    }
  }

  create() {
    // Hard gate: Level 2 is only reachable once Level 1 is complete (bypassed in
    // DEV_MODE). Catches direct-start / URL bypasses; the menu is the main gate.
    if (!Progression.hasCompleted(1) && !DEV_MODE) {
      this.scene.start('MainMenu');
      return;
    }

    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.physics.world.setBounds(0, 0, W, H);
    this.cameras.main.setBounds(0, 0, W, H);

    // ---- State ----
    this.collectedCount = 0;
    this.secretsFound = 0;
    this.totalCollectibles = LEVEL2_COLLECTIBLE_COUNT; // HUD reads this
    this.levelDone = false;
    this.reachedSection4 = false;
    this.cinematicDone = false;
    this.cameraLocked = false;
    this.platforms = [];
    this.movers = [];
    this.movingBodies = [];
    this.collectibles = [];
    this.drones = [];
    this.sentinels = [];
    this.seekers = [];
    this.dust = [];
    this.dustTimer = 0;
    this.respawnX = 100;
    this.respawnY = 580;
    this.checkpointActive = false;
    this.pauseMode = 'main';
    this.assistSelection = 0;

    // ---- Post-FX (Bloom -> Chromatic -> CRT -> Grade) ----
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('BloomPipeline');
      this.cameras.main.setPostPipeline(ChromaticAberrationPipeline);
      this.cameras.main.setPostPipeline('CRTPipeline');
      this.cameras.main.setPostPipeline('ColorGradePipeline'); // final grade
    }

    // ---- Lighting ----
    this.lights.enable();
    this.lights.setAmbientColor(P.AMBIENT);

    // ---- Background (Bioluminescent Deep City) ----
    this.background = new ParallaxBackground(this, LEVEL2_PARALLAX);

    // ---- Underground atmosphere (bats, rocks, drips, dust, stalactites, pools) ----
    this.atmosphere = new UndergroundAtmosphere(this);

    // ---- Section dressing (walls, overlays, water, signs) ----
    this.buildDressing();

    // ---- Geometry ----
    GROUND.forEach(([cx, ty, w, h]) => this.addPlatform(cx, ty, w, h));
    PLATFORMS.forEach(([cx, ty, w, h]) => this.addPlatform(cx, ty, w, h));

    // BUG 5: a thick, invisible backstop under the deep floor. The plunge shaft
    // is ~4900px tall, so a center free-fall reaches ~57px/frame and would
    // tunnel straight through the thin (20px) deep floor. This 300px-thick body
    // (top flush with the deep floor at y5660) guarantees a fast faller lands.
    this.backstopFloor = this.add.rectangle(W / 2, 5810, W, 300).setVisible(false);
    this.physics.add.existing(this.backstopFloor, true);
    this.platforms.push(this.backstopFloor);
    MOVERS.forEach(([sx, ty, range, speed]) => {
      const mp = new MovingPlatform(this, sx, ty, 120, 14, 'x', range, speed, P);
      this.movers.push(mp);
      this.movingBodies.push(mp.bodyRect);
    });

    // Section 4 water reflections (visual, below the waterline).
    this.buildReflections();

    // ---- Death pit kill zones (invisible static triggers below the floor gaps) ----
    // BUG 7: previously at y760, which is INSIDE the visible camera (S1+2 floor is
    // 660, camera bottom ≈890), so the player exploded on-screen at the pit lip.
    // Now their top edge sits at y1000 (well below the camera bottom) so the
    // player has fallen out of view first. Made 700px tall (top y1000 → bottom
    // y1700) so a fast faller cannot tunnel through a thin trigger in one frame.
    // Only fire in Section 1/2 (horizontal), not S5 which shares the same x range.
    this.pitKillZone1 = this.add.rectangle(2230, 1350, 260, 700).setVisible(false);
    this.physics.add.existing(this.pitKillZone1, true);
    this.pitKillZone2 = this.add.rectangle(5610, 1350, 220, 700).setVisible(false);
    this.physics.add.existing(this.pitKillZone2, true);
    this.createSpikePits(); // FIX 7 — visible spikes over the S1/S2 pit gaps

    // ---- World signs (environmental storytelling) ----
    this.createWorldSigns();

    // ---- Player: arrives from Level 1 with double-jump + dash; attack is
    // still locked (unlocked by the Section 2 pickup). ----
    this.player = new Player(this, this.respawnX, this.respawnY);
    this.player.canDoubleJump = true;
    this.player.canDash = true;
    this.player.hasAttack = false;
    // Mobile on-screen buttons (renders only on touch devices; Player.js ORs
    // its state with the keyboard; self-destroys on scene shutdown).
    this.touchControls = new TouchControls(this);
    // NOTE: RimLightPipeline is intentionally NOT applied to the player — on the
    // sprite it produced a box artefact around the character. Kept for future use.

    // ---- Route seals (contain the shafts until earned) ----
    this.buildSeals();

    // ---- Checkpoint ----
    this.createCheckpoint();

    // ---- Pickups ----
    this.abilityPickup = new AbilityPickup(this, 4100, 610, 'attack', 'ATTACK', 'ATTACK UNLOCKED\nPress Z to attack');
    this.shieldPickup = new ShieldPickup(this, 8000, 5380);

    // ---- Enemies ----
    DRONES.forEach(([x, y]) => this.drones.push(new GroundDrone(this, x, y)));
    SENTINELS.forEach(([x, y]) => this.sentinels.push(new HoverSentinel(this, x, y)));
    // Existing S4 intro seeker (slow, short-range — first encounter).
    this.seekers.push(new Seeker(this, 3600, 5620, this.player, { speed: ENEMY.SEEKER_SPEED_L1, aggro: 300 }));
    // Three additional seekers — full speed, escalating threat.
    this.seekers.push(new Seeker(this, 5900, 620,  this.player, { speed: ENEMY.SEEKER_SPEED,        aggro: 260 })); // S2 — after pit 2
    this.seekers.push(new Seeker(this, 4200, 5620, this.player, { speed: ENEMY.SEEKER_SPEED,        aggro: 280 })); // S4 mid
    this.seekers.push(new Seeker(this, 1600, 5620, this.player, { speed: ENEMY.SEEKER_SPEED * 1.15, aggro: 300 })); // S4 near ascent

    // ---- Collectibles ----
    COLLECTIBLES.forEach(([x, y]) => this.collectibles.push(createCollectible(this, x, y, P.COLLECTIBLE, false)));
    SECRETS.forEach(([x, y]) => this.collectibles.push(createCollectible(this, x, y, 0xff6a00, true)));

    // ---- Portal: deep inside the sealed ascent shaft (the player climbs past
    // it after entering Section 5 from below). Invisible + inert until the
    // route is complete (reachedSection4). Its visual parts are wrapped in a
    // container so a single alpha gates the whole portal cleanly. ----
    this.portal = new ExitPortal(this, 1100, 5100);
    this.portal.glow.setPosition(1100, 5100); // glow tracks the portal (it was hard-coded to y400)
    this.portalGroup = this.add.container(0, 0, this.portal.parts).setDepth(3);
    this.portalGroup.setAlpha(0);
    this.portal.active = false;          // stop particle/scan animation
    this.portal.trigger.body.enable = false; // overlap can't fire yet
    this.portalRevealed = false;
    this.add.text(1100, 5020, 'YOU MADE IT', { fontFamily: 'monospace', fontSize: '10px', color: '#00cc66' })
      .setOrigin(0.5).setAlpha(0.4).setDepth(4).setVisible(false).setName('portalText');

    // ---- Colliders ----
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.movingBodies);
    this.physics.add.collider(this.player, this.sealBodies);
    this.physics.add.collider(this.drones, this.platforms);
    this.physics.add.overlap(this.player, this.drones, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.sentinels, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.seekers, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.collectibles, this.onCollect, null, this);
    this.physics.add.overlap(this.player, this.abilityPickup.trigger, this.onAbility, null, this);
    this.physics.add.overlap(this.player, this.shieldPickup.trigger, this.onShield, null, this);
    this.physics.add.overlap(this.player, this.portal.trigger, this.onLevelComplete, null, this);
    this.physics.add.overlap(this.player, this.checkpoint, this.onCheckpoint, null, this);
    // Death pits: only lethal in horizontal sections (not S5, which shares x range at the top).
    this.physics.add.overlap(this.player, this.pitKillZone1, this.onPitDeath, null, this);
    this.physics.add.overlap(this.player, this.pitKillZone2, this.onPitDeath, null, this);

    // Attack: the player's hitbox kills any enemy it overlaps.
    this.enemies = this.add.group([...this.drones, ...this.sentinels, ...this.seekers]);
    this.physics.add.overlap(this.player.attackHitbox, this.enemies, (hb, enemy) => enemy.die());

    // ---- Lights (player + portal + 6 zone) = 8, within Light2D's budget ----
    this.playerLight = this.lights.addLight(0, 0, 360).setColor(P.PLATFORM).setIntensity(1.4);
    this.portalLight = this.lights.addLight(1100, 5100, 240).setColor(P.ACCENT).setIntensity(0);
    [[2000, 560], [5800, 520], [8000, 2500], [8000, 5000], [4400, 5500], [1200, 3000]].forEach(([x, y]) => {
      this.lights.addLight(x, y, 1400).setColor(P.COLLECTIBLE).setIntensity(0.5);
    });

    // ---- Audio ----
    this.mKey = this.input.keyboard.addKey('M');
    this.events.once('shutdown', () => { if (this.portalOsc) this.portalOsc.stop(); });

    // ---- Pause ----
    this.isPaused = false;
    this.pauseSelection = 0; // 0 = RESUME, 1 = RESTART, 2 = MAIN MENU
    this.pauseKeys = this.input.keyboard.addKeys({
      esc: 'ESC', up: 'UP', down: 'DOWN', w: 'W', s: 'S', space: 'SPACE', enter: 'ENTER',
    });

    // ---- HUD ----
    this.diegeticHUD = new DiegeticHUD(this, this.player);
    if (!this.scene.isActive('UI')) this.scene.launch('UI');

    // ---- Background music (loops; muted in lockstep with SFX via the M key) ----
    this.bgMusic = this.sound.add('level2_music', { loop: true, volume: MUSIC_VOLUME });
    this.bgMusic.setMute(!SFX.enabled); // honour the existing audio toggle
    this.bgMusic.play();
    // Safety net: stop the music on any scene shutdown so it can't bleed across.
    this.events.once('shutdown', () => {
      if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic = null; }
    });

    // ---- Camera ----
    this.cameras.main.startFollow(this.player, true, CAM_LERP.horizontal[0], CAM_LERP.horizontal[1]);
    // Events-only CameraController: Level 2 drives the main camera itself (lerp,
    // cinematicPull), so we never call this controller's update() — it exists
    // purely to reuse cinematicEvent() and the shaft look-ahead. It shares the
    // main camera, so its zoom/offset operations apply to the real view.
    this.cameraController = new CameraController(this, this.cameras.main, 'horizontal');

    // ---- Opening title card (once per session; skipped in DEV_MODE) ----
    if (!DEV_MODE && !level2TitleShown) {
      level2TitleShown = true;
      this.showTitleCard(
        'THE UNDERCITY — TIER 0',
        'Below the city proper.\nThose who fell further.',
        "You didn't think it could get worse than the street.",
        0x00cc66,
      );
    }

    // ---- FIX 5: opening camera pan (once per session; skipped in DEV_MODE) ----
    // Establish the goal: hold on spawn, pan down to the exit portal deep in the
    // ascent shaft (1100,5100), hold, then pan back and hand control to the
    // player. Input is locked for the duration (player.inputEnabled).
    if (!DEV_MODE && !this.openingPanShown) {
      this.openingPanShown = true;
      this.player.inputEnabled = false;
      this.cameraLocked = true; // stop update()'s per-section lerp fighting the pan
      const cam = this.cameras.main;
      cam.stopFollow();
      this.time.delayedCall(800, () => { // 1. hold on spawn
        cam.pan(1100, 5100, 1200, 'Sine.easeInOut'); // 2. pan to the exit
        this.time.delayedCall(1200 + 1500, () => { // 3. hold on the exit
          cam.pan(this.player.x, this.player.y, 1000, 'Sine.easeInOut', false, (c, progress) => {
            if (progress !== 1) return; // 4. pan back, then restore
            cam.startFollow(this.player, true, CAM_LERP.horizontal[0], CAM_LERP.horizontal[1]);
            this.applyCameraLerp(this.getSection(this.player.x, this.player.y));
            this.cameraLocked = false;
            this.player.inputEnabled = true;
          });
        });
      });
    }
  }

  // Brief atmospheric title card (glassmorphism). Does not block input; fades
  // in 400ms, holds 3.5s, fades out 400ms. `green` accents the panel + line 2.
  showTitleCard(line1, line2, line3, green) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const Wd = 480;
    const Ht = 90;
    const D = 210;
    const greenStr = `#${green.toString(16).padStart(6, '0')}`;

    const base = this.add.rectangle(cx, cy, Wd, Ht, 0x050a08, 0.55).setStrokeStyle(0.5, green, 0.25);
    const tint = this.add.rectangle(cx, cy, Wd, Ht, green, 0.04);
    const hi = this.add.rectangle(cx, cy - Ht / 2 + 1, Wd, 1, 0xffffff, 0.15);
    const t1 = this.add.text(cx, cy - 28, line1, { fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00' }).setOrigin(0.5);
    const div = this.add.rectangle(cx, cy - 14, Wd - 40, 1, green, 0.2);
    const t2 = this.add.text(cx, cy + 2, line2, { fontFamily: 'monospace', fontSize: '10px', color: greenStr, align: 'center' }).setOrigin(0.5).setAlpha(0.7);
    const t3 = this.add.text(cx, cy + 30, line3, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', fontStyle: 'italic', align: 'center' }).setOrigin(0.5).setAlpha(0.5);

    const card = this.add.container(0, 0, [base, tint, hi, t1, div, t2, t3])
      .setScrollFactor(0).setDepth(D).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 400, hold: 3500, yoyo: true, onComplete: () => card.destroy() });
  }

  // --- Pause menu (RESUME / RESTART / MAIN MENU) ----------------------------
  togglePause() {
    if (this.isPaused) this.resumeScene();
    else this.pauseScene();
  }

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
    const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x050a08, 0.75).setScrollFactor(0).setDepth(300);
    const panel = makeGlassPanel(this, cx, cy, 280, 215).setScrollFactor(0).setDepth(301);
    const title = this.add.text(cx, cy - 64, 'PAUSED', { fontFamily: 'monospace', fontSize: '24px', color: '#00cc66' }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
    const sep = this.add.rectangle(cx, cy - 40, 200, 1, 0x00cc66, 0.6).setScrollFactor(0).setDepth(302);
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
        this.resumeScene();
      } else if (this.pauseSelection === 1) {
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.isPaused = false;
        this.scene.restart();
      } else if (this.pauseSelection === 2) {
        // ASSIST: open the assist submenu (stays paused).
        this._openAssistOverlay();
      } else {
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.isPaused = false;
        if (this.portalOsc) this.portalOsc.stop();
        if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic = null; }
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.stop('UI');
          this.scene.start('MainMenu');
          this.scene.stop(this.scene.key); // 'Level2'
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Assist overlay — mirrors Game.js implementation exactly (same colours).
  // ---------------------------------------------------------------------------
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

    const dim = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x050a08, 0.75)
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

  // ---------------------------------------------------------------------------
  // Dressing: shaft walls, depth overlays, water, neon/warning signs.
  // `rect()` treats x,y as the TOP-LEFT corner (matches the spec's geometry).
  // ---------------------------------------------------------------------------
  buildDressing() {
    const rect = (left, top, w, h, color, alpha, depth) =>
      this.add.rectangle(left + w / 2, top + h / 2, w, h, color, alpha).setDepth(depth);

    // --- Section 2 low ceiling (visual) ---
    rect(4000, 380, 4000, 44, 0x001a0d, 1, 1.3);

    // --- Plunge shaft (S3): walls + entry signals + progressive darkening ---
    rect(7600, 660, 10, 4940, P.PLATFORM, 0.15, 1.4);  // left wall
    rect(8390, 660, 10, 4940, P.PLATFORM, 0.15, 1.4);  // right wall
    rect(7798, 640, 2, 22, P.PLATFORM, 0.9, 1.6);      // bright lip on the last floor tile
    // Neon "▼ SHAFT B7" sign (flickers).
    const sign = rect(7840, 520, 160, 24, 0x001a0d, 1, 1.5);
    sign.setStrokeStyle(1, 0xff6a00, 0.9);
    const signText = this.add.text(7920, 532, '▼ SHAFT B7', { fontFamily: 'monospace', fontSize: '10px', color: '#ff6a00' })
      .setOrigin(0.5).setDepth(1.6);
    this.shaftSign = signText;
    // Darkness overlays (shaft interior x7610–8390, width ~780).
    rect(7610, 1800, 780, 1000, 0x000000, 0.20, 1.45);
    rect(7610, 2800, 780, 1200, 0x000000, 0.40, 1.45);
    rect(7610, 4000, 780, 1600, 0x000000, 0.60, 1.45);

    // --- The deep (S4): water + waterline ---
    rect(0, 5680, 14000, 320, P.WATER, 1, -1);
    rect(0, 5678, 14000, 2, P.PLATFORM, 0.25, 1.55);
    // Seeker chamber warning sign (flickers).
    const warn = rect(4050, 5460, 220, 20, 0x0d0000, 1, 1.5);
    warn.setStrokeStyle(1, 0xff0000, 1);
    this.seekerWarning = this.add.text(4160, 5470, '⚠ HOSTILE UNIT DETECTED', { fontFamily: 'monospace', fontSize: '8px', color: '#ff0000' })
      .setOrigin(0.5).setDepth(1.6);

    // --- Ascent shaft (S5): walls + progressive lightening ---
    rect(800, 380, 10, 5280, P.PLATFORM, 0.15, 1.4);   // left wall
    rect(1590, 380, 10, 5280, P.PLATFORM, 0.15, 1.4);  // right wall
    rect(805, 3600, 785, 1200, P.FOG, 0.03, 1.45);
    rect(805, 2400, 785, 1200, P.FOG, 0.06, 1.45);
    rect(805, 1200, 785, 1200, P.FOG, 0.10, 1.45);
    rect(805, 400, 785, 800, P.FOG, 0.16, 1.45);

    // --- Death pit 1 (S1, x:2100–2360) ---
    rect(2100, 660, 260, 200, 0x000000, 0.95, -0.5);          // bottomless void
    rect(2098, 648, 2, 24, P.PLATFORM, 1.0, 1.5);             // left edge lip
    rect(2360, 648, 2, 24, P.PLATFORM, 1.0, 1.5);             // right edge lip
    rect(2100, 660, 260, 1, 0xbf00ff, 0.20, 1.4);             // alien energy line at break
    this.add.text(2230, 630, '▼ CONDEMNED', {
      fontFamily: 'monospace', fontSize: '7px', color: '#ff0000',
    }).setOrigin(0.5).setAlpha(0.35).setDepth(1.4);

    // --- Death pit 2 (S2, x:5500–5720) ---
    rect(5500, 660, 220, 200, 0x000000, 0.95, -0.5);
    rect(5498, 648, 2, 24, P.PLATFORM, 1.0, 1.5);
    rect(5720, 648, 2, 24, P.PLATFORM, 1.0, 1.5);
    rect(5500, 660, 220, 1, 0xbf00ff, 0.20, 1.4);
    this.add.text(5610, 630, '▼ STRUCTURAL FAILURE', {
      fontFamily: 'monospace', fontSize: '7px', color: '#ff0000',
    }).setOrigin(0.5).setAlpha(0.35).setDepth(1.4);
  }

  // ---------------------------------------------------------------------------
  // Route seals. The ascent shaft (x800–1600) shares its x-range with Section 1
  // (the player must cross it left→right to progress), so it can't be sealed
  // with full-height side walls without trapping the player at spawn. Instead a
  // horizontal CAP across the shaft mouth (above the top ascent platforms,
  // below the portal) blocks the portal-skip while leaving the crossing open,
  // and a bottom gate keeps the lower shaft a dead end. Both open once the deep
  // is reached. The plunge shaft top is capped until Section 2 is traversed.
  // makeSeal() uses a TOP-LEFT origin: a #003322 fill (static body) + a 2px top
  // edge + an optional centred label.
  // ---------------------------------------------------------------------------
  makeSeal(left, top, w, h, label) {
    const cx = left + w / 2;
    const cy = top + h / 2;
    const fill = this.add.rectangle(cx, cy, w, h, 0x003322, 0.85).setDepth(3);
    this.physics.add.existing(fill, true);
    const edge = this.add.rectangle(cx, top + 1, w, 2, 0x00cc66, 1).setDepth(3.1);
    const parts = [fill, edge];
    if (label) {
      const t = this.add.text(cx, cy, label, { fontFamily: 'monospace', fontSize: '7px', color: '#00cc66' })
        .setOrigin(0.5).setDepth(3.2);
      parts.push(t);
    }
    return { fill, parts };
  }

  buildSeals() {
    this.sealBodies = [];

    // Ascent shaft: bottom gate (lower dead end) + horizontal mouth cap that
    // sits above the top ascent platforms and below the portal, blocking the
    // upward skip from Section 1 without obstructing the crossing.
    this.ascentSeals = [
      this.makeSeal(800, 5380, 800, 40, 'LOCKED — COMPLETE ROUTE'),
      this.makeSeal(800, 400, 800, 24, 'ROUTE LOCKED'),
    ];
    this.ascentSeals.forEach((s) => this.sealBodies.push(s.fill));

    // Plunge shaft: solid top seal, removed after Section 2.
    this.plungeSeal = this.makeSeal(7780, 650, 440, 20, '→ CONTINUE');
    this.sealBodies.push(this.plungeSeal.fill);
    this.plungeSealOpen = false;
  }

  // Disable a seal's body immediately, fade its visuals (400ms), then destroy it.
  removeSeal(seal) {
    if (seal.fill.body) seal.fill.body.enable = false;
    this.tweens.add({
      targets: seal.parts,
      alpha: 0,
      duration: 400,
      onComplete: () => {
        const i = this.sealBodies.indexOf(seal.fill);
        if (i !== -1) this.sealBodies.splice(i, 1);
        seal.parts.forEach((p) => p.destroy());
      },
    });
  }

  openAscentSeals() {
    this.ascentSeals.forEach((s) => this.removeSeal(s));
    spawnPickupShards(this, 1200, 5400, 0x00cc66, 16, 60);
    this.showPathUnlocked();
  }

  showPathUnlocked() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const txt = this.add.text(cx, cy - 60, 'PATH UNLOCKED', {
      fontFamily: 'monospace', fontSize: '24px', color: '#00cc66', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(206).setAlpha(0);
    this.tweens.add({ targets: txt, alpha: 1, duration: 250, yoyo: true, hold: 1000, onComplete: () => txt.destroy() });
    this.flashScreen(0x00cc66, 0.25, 350);
  }

  // Reveal + activate the exit portal once the route is complete.
  revealPortal() {
    if (this.portalRevealed) return;
    this.portalRevealed = true;
    this.portal.active = true;                 // resume particle/scan animation
    this.portal.trigger.body.enable = true;    // overlap can now complete the level
    this.portalOsc = SFX.portalHum();          // ambient hum starts with the portal
    this.tweens.add({ targets: this.portalGroup, alpha: { from: 0, to: 1 }, duration: 600 });
    const pt = this.children.getByName('portalText');
    if (pt) pt.setVisible(true);
    // Brief "EXIT REVEALED" readout at screen centre, fading over 1s.
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const txt = this.add.text(cx, cy, 'EXIT REVEALED', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ff6a00', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(206).setAlpha(1);
    this.tweens.add({ targets: txt, alpha: 0, duration: 1000, onComplete: () => txt.destroy() });
  }

  // Mirror images of the Section 4 platforms below the waterline (visual only).
  buildReflections() {
    const waterline = 5678;
    this.platforms.forEach((pl) => {
      if (pl.y < 5400 || pl.y > 5620) return; // Section 4 platforms only
      const ry = waterline + (waterline - pl.y);
      this.add.rectangle(pl.x, ry, pl.width, pl.height, P.PLATFORM, 0.12).setDepth(-0.5);
    });
  }

  // ---- Checkpoint (plunge shaft entrance) ------------------------------------
  createCheckpoint() {
    const x = 7600;
    const y = 600;
    // Dim body until activated; brightens permanently on touch.
    this.checkpoint = this.add.rectangle(x, y, 20, 36, P.ACCENT, 0.7).setDepth(1);
    this.physics.add.existing(this.checkpoint, true);
    // Bright left edge — same treatment as Game.js.
    this.checkpointEdge = this.add.rectangle(x - 9, y, 2, 36, P.ACCENT, 1).setDepth(1);
    this.add
      .text(x, y - 26, '//SAVE', { fontFamily: 'monospace', fontSize: '7px', color: '#ff6a00' })
      .setOrigin(0.5).setAlpha(0.5).setDepth(1);
  }

  onCheckpoint() {
    if (this.checkpointActive) return;
    this.checkpointActive = true;
    SFX.checkpoint();

    // Stays fully lit once activated.
    this.checkpoint.setFillStyle(P.ACCENT, 1);

    // Update the respawn point.
    this.respawnX = 7600;
    this.respawnY = 580;

    // Upward particle burst (6 orange particles), matching Game.js style.
    for (let i = 0; i < 6; i++) {
      const px = 7600 + (i - 2.5) * 4;
      const p = this.add.rectangle(px, 590, 3, 3, P.ACCENT, 1).setDepth(2);
      this.tweens.add({
        targets: p,
        y: 590 - Phaser.Math.Between(30, 55),
        alpha: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }

    // Camera beat: zoom in 5% then back out.
    this.cameras.main.zoomTo(1.05, 400, 'Sine.easeOut', false, (cam, progress) => {
      if (progress === 1) this.cameras.main.zoomTo(1.0, 350, 'Sine.easeIn');
    });

    // Glassmorphism "CHECKPOINT" panel (fade in 200ms, hold 1s, fade out 300ms).
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

  // Static platform: layered visual + static body + Light2D.
  addPlatform(cx, topY, w, h) {
    const { body } = buildPlatformVisual(this, cx, topY, w, h, P, false);
    body.setPipeline('Light2D');
    this.physics.add.existing(body, true);
    this.platforms.push(body);
  }

  // --- World signs — exact reuse of Game.js addWorldSign -------------------
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
    // Section 1 — Industrial corridor (x: 0–4000)
    this.addWorldSign(120,  720, 'UNDERCITY — TIER 0',                       'BELOW AUTHORISED CITY BOUNDARIES',         { colour: '#ff6a00', opacity: 0.40, panel: true });
    this.addWorldSign(400,  680, 'CITY MAINTENANCE ZONE B',                  'NON-RESIDENTS: REPORT TO PROCESSING',      { colour: '#00cc66', opacity: 0.28 });
    this.addWorldSign(740,  740, "// THEY DON'T KNOW WE'RE HERE //",         null,                                       { colour: '#00cc66', opacity: 0.16 });
    this.addWorldSign(1100, 700, 'CONDEMNED SECTOR — NO SERVICES',           'CITY AUTHORITY ACCEPTS NO LIABILITY',      { colour: '#ff6a00', opacity: 0.30, panel: true });
    this.addWorldSign(1600, 660, 'POPULATION: UNREGISTERED',                 'STATUS: OUTSIDE TIER SYSTEM',              { colour: '#ff0000', opacity: 0.24 });
    this.addWorldSign(2200, 720, '// WE WERE STREET LEVEL ONCE //',          null,                                       { colour: '#00cc66', opacity: 0.14 });
    this.addWorldSign(2800, 680, 'LAST ABOVE-GROUND CONTACT: UNKNOWN',       'UNDERCITY RESIDENTS: NOT CITY CITIZENS',   { colour: '#ff6a00', opacity: 0.26, panel: true });
    this.addWorldSign(3400, 700, 'PIPE NETWORK B7 — CRITICAL INFRASTRUCTURE','AUTHORISED DRONES ONLY BEYOND THIS POINT', { colour: '#00cc66', opacity: 0.22 });

    // Section 2 — Pipe maze (x: 4000–8000)
    this.addWorldSign(4100, 700, 'ATTACK SYSTEMS ACTIVE — TIER 0 PROTOCOL', 'UNREGISTERED MOVEMENT: ENGAGE ON SIGHT',   { colour: '#ff0000', opacity: 0.32, panel: true });
    this.addWorldSign(4600, 660, '// SOMEONE CAME THROUGH HERE //',          '// RECENTLY //',                           { colour: '#00cc66', opacity: 0.16 });
    this.addWorldSign(5200, 720, 'INFRASTRUCTURE CLASS — BELOW THIS LEVEL',  "YOU ARE BENEATH THE CITY'S NOTICE",        { colour: '#ff6a00', opacity: 0.26 });
    this.addWorldSign(5800, 680, 'EMERGENCY EXIT — SURFACE: DENIED',         'TIER 0 RESIDENTS HAVE NO EXIT RIGHTS',     { colour: '#ff0000', opacity: 0.28, panel: true });
    this.addWorldSign(6600, 700, '// HOW LONG HAVE THEY BEEN DOWN HERE //',  null,                                       { colour: '#00cc66', opacity: 0.14 });
    this.addWorldSign(7200, 660, 'SHAFT B7 — SURFACE ACCESS',                'MAINTENANCE ONLY — ALL OTHERS: TERMINATE', { colour: '#ff6a00', opacity: 0.35, panel: true });

    // Section 3 — Plunge shaft (signs on alternating walls at platform heights)
    this.addWorldSign(7640, 880,  'DEPTH: 220m BELOW STREET LEVEL',          null,                                       { colour: '#00cc66', opacity: 0.22 });
    this.addWorldSign(8240, 1480, 'DEPTH: 820m — BEYOND CITY RECORDS',       null,                                       { colour: '#00cc66', opacity: 0.20 });
    this.addWorldSign(7640, 2080, '// NOBODY COMES THIS DEEP //',             null,                                       { colour: '#00cc66', opacity: 0.16 });
    this.addWorldSign(8240, 2680, 'DEPTH: 2100m — UNCHARTED',                 'CITY AUTHORITY HAS NO DATA BELOW THIS POINT', { colour: '#ff6a00', opacity: 0.24, panel: true });
    this.addWorldSign(7640, 3280, '// SOMETHING LIVES DOWN HERE //',          null,                                       { colour: '#ff0000', opacity: 0.18 });
    this.addWorldSign(8240, 4480, 'DEPTH: UNKNOWN',                           'YOU SHOULD NOT BE HERE',                   { colour: '#ff0000', opacity: 0.30, panel: true });

    // Section 4 — The deep (x: 800–7800, world y: 5340–5820)
    this.addWorldSign(7400, 5660, 'THE DEEP — NO DESIGNATION',               'CITY MAPS END 400m ABOVE THIS POINT',      { colour: '#ff6a00', opacity: 0.36, panel: true });
    this.addWorldSign(6600, 5700, '// WE BUILT THIS CITY //',                '// AND THEY BURIED US UNDER IT //',        { colour: '#00cc66', opacity: 0.20 });
    this.addWorldSign(5800, 5660, 'HOSTILE BIOLOGICAL PRESENCE DETECTED',    'CITY AUTHORITY ADVISES: DO NOT ENGAGE',    { colour: '#ff0000', opacity: 0.28, panel: true });
    this.addWorldSign(4600, 5700, '// THERE IS NO UP FROM HERE //',          '// THERE IS NO DOWN EITHER //',            { colour: '#00cc66', opacity: 0.14 });
    this.addWorldSign(3600, 5660, 'WARNING — HOSTILE UNIT PATROLLING',       'LAST REGISTERED CASUALTY: UNKNOWN',        { colour: '#ff0000', opacity: 0.32, panel: true });
    this.addWorldSign(2400, 5700, '// KEEP MOVING //',                       null,                                       { colour: '#00cc66', opacity: 0.18 });
    this.addWorldSign(1400, 5660, 'ASCENT SHAFT — SURFACE: 5400m ABOVE',    'ACCESS RESTORED — ROUTE UNLOCKED',         { colour: '#ff6a00', opacity: 0.40, panel: true });

    // Section 5 — Ascent shaft (signs on alternating walls at platform heights)
    this.addWorldSign(820,  5180, 'DEPTH: 4900m — BEGINNING ASCENT',        null,                                       { colour: '#00cc66', opacity: 0.20 });
    this.addWorldSign(1440, 4180, "// THE CITY DOESN'T KNOW YOU SURVIVED //", null,                                     { colour: '#00cc66', opacity: 0.16 });
    this.addWorldSign(820,  3180, 'DEPTH: 2600m — CONTINUE ASCENDING',      null,                                       { colour: '#00cc66', opacity: 0.22 });
    this.addWorldSign(1440, 2180, '// THEY THOUGHT THIS WOULD STOP YOU //', null,                                       { colour: '#00cc66', opacity: 0.16 });
    this.addWorldSign(820,  1180, 'APPROACHING STREET LEVEL',                'TIER 1 — 800m ABOVE',                      { colour: '#ff6a00', opacity: 0.28, panel: true });
    this.addWorldSign(1440, 580,  'SURFACE ACCESS — TRANSIT NETWORK',        'TIER 3 — KEEP CLIMBING',                   { colour: '#00ff88', opacity: 0.38, panel: true });
  }

  // --- Overlap handlers -----------------------------------------------------
  onPlayerHit() {
    if (AssistMode.get('invincibility')) return;
    this.player.takeHit();
  }

  // Push the player-light position (UV/screen space) and the sprite's on-screen
  // size into the rim-light pipeline each frame. No-ops on Canvas / if unattached.
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

  // Death pits — instant kill, bypasses shield. Guard: only lethal in horizontal
  // sections so the S5 ascent shaft (shares x range with pit 1) is never affected.
  onPitDeath() {
    if (this.player.isDead) return;
    if (AssistMode.get('invincibility')) return;
    if (this.getSection(this.player.x, this.player.y) !== 'horizontal') return;
    this.player.die();
  }

  // ---- FIX 7: visible spikes over the existing S1/S2 death pits ---------------
  // Visual only — the kill is already handled by pitKillZone1/2 (onPitDeath) and
  // the y>5900 backstop, so this just draws the dark pit floor + purple spikes.
  addSpikePit(x, y, width) {
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
  }

  createSpikePits() {
    this.addSpikePit(2100, 660, 260); // S1 pit (footprint of pitKillZone1)
    this.addSpikePit(5500, 660, 220); // S2 pit (footprint of pitKillZone2)
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

  onAbility(player, trigger) {
    const ap = this.abilityPickup;
    if (!ap) return;
    if (ap.abilityType === 'attack') this.player.hasAttack = true;
    if (ap.abilityType === 'doubleJump') this.player.canDoubleJump = true;
    ap.destroy();
    this.abilityPickup = null;
    // AUDIO: ability unlock — FL Studio
    this.cameraController.cinematicEvent('abilityUnlock', this); // power-fantasy zoom punch
    this.showAbilityPanel('ATTACK UNLOCKED', 'Press Z to attack');
    this.flashScreen(0xffffff, 0.6, 300);
  }

  onShield(player, trigger) {
    if (!this.shieldPickup) return;
    this.player.hasShield = true;
    this.shieldPickup.destroy();
    this.shieldPickup = null;
    SFX.shieldPickup();
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
    this.time.delayedCall(200 + ABILITY_PANEL_HOLD_MS, () => {
      this.tweens.add({ targets: items, alpha: 0, duration: 300, onComplete: () => items.forEach((o) => o.destroy()) });
    });
  }

  // --- Camera ---------------------------------------------------------------
  getSection(x, y) {
    if (y > 5000) return 'deep';
    if (x > 7400) return 'plunge';
    if (x < 1800 && y > 400 && y < 5400) return 'ascent';
    return 'horizontal';
  }

  applyCameraLerp(section) {
    const [lx, ly] = CAM_LERP[section] || CAM_LERP.horizontal;
    this.cameras.main.setLerp(lx, ly);
  }

  // One-shot cinematic camera move (used at the plunge entry to reveal the drop).
  cinematicPull(x, y, zoom, duration, cb) {
    const cam = this.cameras.main;
    this.cameraLocked = true;
    cam.stopFollow();
    cam.pan(x, y, duration, 'Sine.easeInOut');
    cam.zoomTo(zoom, duration, 'Sine.easeInOut');
    this.time.delayedCall(duration + 200, () => {
      cam.zoomTo(1, 600, 'Sine.easeInOut');
      cam.startFollow(this.player, true);
      this.applyCameraLerp(this.getSection(this.player.x, this.player.y));
      this.cameraLocked = false;
      if (cb) cb();
    });
  }

  // --- Camera-effect helpers ------------------------------------------------
  shakeScreen(duration, intensity) {
    this.cameras.main.shake(duration, intensity);
  }

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
    this.time.delayedCall(duration, () => {
      this.physics.resume();
      this.tweens.resumeAll();
    });
  }

  flashScreen(color, alpha, duration) {
    const f = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, color, alpha)
      .setScrollFactor(0).setDepth(206);
    this.tweens.add({ targets: f, alpha: 0, duration, onComplete: () => f.destroy() });
  }

  // --- Plunge-shaft dust ----------------------------------------------------
  spawnDust() {
    if (this.dust.length >= 30) return;
    const cam = this.cameras.main;
    if (cam.scrollY < 600 || cam.scrollY > 5700) return; // only deep in the shaft
    if (this.getSection(this.player.x, this.player.y) !== 'plunge') return;
    const x = 7620 + Math.random() * 760;
    const y = cam.scrollY + Math.random() * 80;
    const d = this.add.rectangle(x, y, 2, 2, P.PLATFORM, 0.06).setDepth(1.6);
    this.dust.push(d);
    this.tweens.add({
      targets: d, y: y + 500, duration: 25000, ease: 'Linear',
      onComplete: () => { const i = this.dust.indexOf(d); if (i !== -1) this.dust.splice(i, 1); d.destroy(); },
    });
  }

  // --- Level complete -------------------------------------------------------
  onLevelComplete() {
    if (this.levelDone) return;
    this.levelDone = true;
    Progression.complete(2);
    // Cinematic: slow zoom out over the conquered level (stays out for the overlay).
    this.cameraController.cinematicEvent('portalReached', this);
    // AUDIO: level complete — FL Studio
    if (this.portalOsc) this.portalOsc.stop();
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
      const bg = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x050a08, 0).setScrollFactor(0).setDepth(201);
      this.tweens.add({ targets: bg, alpha: 0.85, duration: 300 });
      const panel = makeGlassPanel(this, cx, cy, 340, 90).setScrollFactor(0).setDepth(202);
      const main = this.add.text(cx, cy - 8, 'LEVEL 2 COMPLETE', { fontFamily: 'monospace', fontSize: '30px', color: '#ff6a00' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(203);
      const sub = this.add.text(cx, cy + 26, `${this.collectedCount} / ${this.totalCollectibles}  •  ${this.secretsFound} / ${HIDDEN_COLLECTIBLE_COUNT} SECRETS`, {
        fontFamily: 'monospace', fontSize: '13px', color: '#00aacc',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      [[panel, cy], [main, cy - 8], [sub, cy + 26]].forEach(([o, ty]) => {
        o.y = ty + 20; o.alpha = 0;
        this.tweens.add({ targets: o, y: ty, alpha: 1, duration: 300, ease: 'Quad.easeOut' });
      });

      // Story beat (NAR-006): divider + exile line, fading in after the panel.
      const beatDiv = this.add.rectangle(cx, cy + 56, 280, 1, 0x00cc66, 0).setScrollFactor(0).setDepth(203);
      const beat = this.add
        .text(cx, cy + 78, LEVEL_COMPLETE_BEATS[2].beat, {
          fontFamily: 'monospace', fontSize: '11px', color: '#00cc66', align: 'center',
        })
        .setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0);
      this.time.delayedCall(200, () => {
        this.tweens.add({ targets: beatDiv, alpha: 0.3, duration: 400 });
        this.tweens.add({ targets: beat, alpha: 0.8, duration: 400 });
      });

      // Continue prompt (after 1.5s; Space or tap returns to the main menu).
      this.time.delayedCall(1500, () => {
        const doTransition = () => {
          if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic = null; }
          this.cameras.main.fadeOut(500, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.stop('UI');
            this.scene.start('MainMenu');
            this.scene.stop('Level2');
          });
        };
        const isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const cont = this.add
          .text(cx, cy + 116, isTouchDevice ? 'TAP TO CONTINUE' : 'PRESS SPACE TO CONTINUE', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' })
          .setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0.4);
        this.tweens.add({ targets: cont, alpha: { from: 0.15, to: 0.4 }, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const tapHit = this.add.rectangle(cx, cy + 116, 280, 40, 0x000000, 0.001)
          .setScrollFactor(0).setDepth(204).setInteractive();
        tapHit.on('pointerdown', () => { tapHit.destroy(); doTransition(); });
        this.input.keyboard.once('keydown-SPACE', () => { tapHit.destroy(); doTransition(); });
      });
    });
  }

  // --- Main loop ------------------------------------------------------------
  update(time, delta) {
    // M (or the touch MUTE button) toggles all SFX.
    if (Phaser.Input.Keyboard.JustDown(this.mKey) || this.touchControls.mute.justDown) {
      SFX.toggleMute();
      if (this.bgMusic) this.bgMusic.setMute(!SFX.enabled);
    }

    // ESC toggles pause (not after the level is finished).
    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc) && !this.levelDone) {
      if (this.isPaused && this.pauseMode === 'assist') {
        this._closeAssistOverlay();
      } else {
        this.togglePause();
      }
    }
    if (this.isPaused) {
      this.updatePauseMenu();
      return; // freeze gameplay while paused
    }

    if (this.levelDone) {
      this.player.update(time, delta);
      return;
    }

    // Assist mode: smooth physics timeScale toward target (0.75 or 1.0).
    const targetScale = AssistMode.get('slowerGameSpeed') ? ASSIST_MODE.GAME_SPEED_MULTIPLIER : 1.0;
    if (Math.abs(this.physics.world.timeScale - targetScale) > 0.001) {
      this.physics.world.timeScale = Phaser.Math.Linear(this.physics.world.timeScale, targetScale, 0.05);
    } else {
      this.physics.world.timeScale = targetScale;
    }

    this.background.update();
    this.atmosphere.update(time, delta);
    this.player.update(time, delta);

    const px = this.player.x;
    const py = this.player.y;

    // Plunge top seal opens once Section 2 is mostly traversed.
    if (!this.plungeSealOpen && this.plungeSeal && px > 7200) {
      this.plungeSealOpen = true;
      this.removeSeal(this.plungeSeal);
    }

    // Reaching the deep unlocks the ascent shaft and reveals the exit portal.
    if (!this.reachedSection4 && px > 7400 && py > 4800) {
      this.reachedSection4 = true;
      this.openAscentSeals();
      this.revealPortal();
    }

    // Cinematic pull when entering the plunge shaft (once).
    if (!this.cinematicDone && px > 7700 && py < 800) {
      this.cinematicDone = true;
      this.cinematicPull(8000, 1800, 0.6, 1800, null);
    }

    // Camera lerp per section (unless a cinematic owns the camera).
    if (!this.cameraLocked) {
      this.applyCameraLerp(this.getSection(px, py));
      // Dynamic shaft look-ahead — leads down while falling, up while climbing.
      this.cameraController.updateShaftLookAhead(this.player);
    }

    // Enemies (skip AI > 2400px from player).
    const near = (e) => Phaser.Math.Distance.Between(e.x, e.y, px, py) < 2400;
    // Drones STEER when near, FREEZE when far — a culled drone keeps moving under
    // global physics otherwise and drifts off its platform (same root-cause fix
    // as Level 1). Only ever moves while actively steering.
    for (const d of this.drones) {
      if (!d.active) continue;
      if (near(d)) d.update(time, delta); else d.freeze();
    }
    for (const s of this.sentinels) if (s.active && near(s)) s.update(time, delta);
    for (const s of this.seekers) if (s.active && near(s)) s.update(time, delta);

    // Moving platforms (skip > 1000px from player).
    for (const mp of this.movers) {
      if (Phaser.Math.Distance.Between(mp.bodyRect.x, mp.bodyRect.y, px, py) < 1000) mp.update(delta);
    }

    // Carry the player when standing on a moving platform. Apply the platform's
    // delta directly to the physics body position (NOT via body.reset, which
    // would zero the velocity and cancel the player's own input). This stacks
    // the carry on top of whatever the physics engine integrates this frame, so
    // the player can still walk/jump while riding.
    if (this.player.body.blocked.down) {
      const pb = this.player.body;
      for (const mp of this.movers) {
        const half = mp.bodyRect.width / 2;
        const onIt = px >= mp.bodyRect.x - half - 4
          && px <= mp.bodyRect.x + half + 4
          && Math.abs(pb.bottom - mp.body.top) < 8;
        if (onIt && (mp.deltaX || mp.deltaY)) {
          pb.x += mp.deltaX;
          pb.y += mp.deltaY;
          this.player.x = pb.x + pb.halfWidth;
          this.player.y = pb.y + pb.halfHeight;
          break;
        }
      }
    }

    this.portal.update(time, delta);
    if (this.abilityPickup) this.abilityPickup.update(time, delta);
    this.diegeticHUD.update(time, delta);

    // Plunge-shaft dust.
    this.dustTimer += delta;
    if (this.dustTimer >= 120) { this.dustTimer = 0; this.spawnDust(); }

    // Lights follow / pulse.
    this.playerLight.x = px;
    this.playerLight.y = py;
    this.portalLight.setIntensity(this.portalRevealed ? Math.sin(this.time.now / 800) * 0.4 + 1.4 : 0);

    // Sign / warning flicker.
    const t = this.time.now;
    if (this.shaftSign) this.shaftSign.setAlpha(0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t / 300)));
    if (this.seekerWarning) this.seekerWarning.setAlpha(0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t / 200)));
    const portalText = this.children.getByName('portalText');
    if (portalText) portalText.setAlpha(0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t / 1000)));

    // Fell out of the world (below the S4 floor at 5660 + backstop at 5810).
    // BUG 7: trigger at 5900 (just past the backstop, off-screen) instead of the
    // world bottom (6000) so a fall-through death fires promptly once they're gone.
    if (!this.player.isDead && this.player.y > 5900 && !AssistMode.get('invincibility')) this.player.die();
  }
}
