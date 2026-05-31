import Phaser from 'phaser';
import {
  WORLD, DEATH_Y, COLORS, PLAYER, PLATFORM_THICKNESS, TOTAL_COLLECTIBLES,
  HIDDEN_COLLECTIBLE_COUNT, HIDDEN_COLLECTIBLE_COLOR, SPEED_PROGRESSION_MAX_MULTIPLIER,
} from '../constants.js';
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
  [5600, 400, 1600, 500], // Zone 5 rooftop floor (contiguous with zone 4)
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

    // Respawn point — starts at the level spawn, updated by the checkpoint.
    this.respawnX = PLAYER.SPAWN_X;
    this.respawnY = PLAYER.SPAWN_Y;

    // Pause state.
    this.isPaused = false;
    this.pauseSelection = 0; // 0 = RESUME, 1 = RESTART

    // Dedicated seeded RNG for aesthetic timing (kept separate from the
    // parallax/label RNG so it doesn't shift their determinism).
    let fxSeed = 0xc0ffee;
    this.fxRng = () => {
      fxSeed += 0x6d2b79f5;
      let r = Math.imul(fxSeed ^ (fxSeed >>> 15), 1 | fxSeed);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    // ---- Post-FX (WebGL only). Order: Bloom -> Chromatic -> CRT (last) ----
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('BloomPipeline');
      this.cameras.main.setPostPipeline(ChromaticAberrationPipeline);
      this.cameras.main.setPostPipeline('CRTPipeline');

      // Keep the post-FX resolution in sync when the window resizes. (Both
      // pipelines also read renderer.width/height each frame in onPreRender,
      // so this is a belt-and-suspenders update.)
      this.scale.on('resize', (gameSize) => {
        const res = [gameSize.width, gameSize.height];
        let crt = this.cameras.main.getPostPipeline('CRTPipeline');
        if (Array.isArray(crt)) crt = crt[0];
        if (crt) crt.uResolution = res;
        let bloom = this.cameras.main.getPostPipeline('BloomPipeline');
        if (Array.isArray(bloom)) bloom = bloom[0];
        if (bloom) bloom.uResolution = res;
      });
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
    this.createCollectibles();
    this.createSecrets();

    // ---- Player ----
    this.player = new Player(this, PLAYER.SPAWN_X, PLAYER.SPAWN_Y);

    this.createEnemies();
    this.createPortal();
    this.createCheckpoint();
    this.createColliders();

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

    // ---- Camera follow ----
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ---- HUD overlay scene (runs in parallel) ----
    // Idempotent so a scene restart (from the pause menu) doesn't double-launch.
    if (!this.scene.isActive('UI')) this.scene.launch('UI');
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

  // ---- Platforms & ground -----------------------------------------------------
  createLevelGeometry() {
    for (const [cx, topY, w, thickness] of GROUND) {
      this.addPlatform(cx, topY, w, thickness, { isGround: true });
    }
    for (const [cx, topY, w] of PLATFORMS) {
      this.addPlatform(cx, topY, w, PLATFORM_THICKNESS, { isGround: false });
    }
  }

  // Creates a platform as three stacked visual components — a recessed body, a
  // bright neon top edge, and a faint glow halo above it. The body keeps its
  // original dimensions and static Arcade body (physics unchanged).
  addPlatform(cx, topY, width, thickness = PLATFORM_THICKNESS, opts = {}) {
    // ---- Fake-3D depth layers (drawn behind the body) ----
    if (opts.isGround) {
      // Drop shadow: faint downward glow 14px below the surface.
      this.add
        .rectangle(cx, topY + 16, width, 4, COLORS.PLATFORM, 0.06)
        .setDepth(-2);
      // Underside face: dark band immediately below the surface. The ground
      // extends to the world floor (off-screen), so this reads as the slab's
      // shaded front face just beneath the lit top rather than at the bottom.
      this.add
        .rectangle(cx, topY + 6, width, 12, 0x003318, 1)
        .setDepth(-1);
    } else {
      const bottom = topY + thickness;
      // Drop shadow: width + 4px, 6px tall, 10px below the body bottom.
      this.add
        .rectangle(cx, bottom + 13, width + 4, 6, COLORS.PLATFORM, 0.08)
        .setDepth(-2);
      // Underside face: 8px tall immediately below the body (physical thickness).
      this.add
        .rectangle(cx, bottom + 4, width, 8, 0x004422, 1)
        .setDepth(-1);
    }

    // 1. Body — recessed dark fill at 20% opacity. Lit by Light2D so the
    // environment is illuminated by nearby lights (neon edges stay constant).
    const body = this.add
      .rectangle(cx, topY + thickness / 2, width, thickness, COLORS.PLATFORM, 0.2)
      .setDepth(0)
      .setPipeline('Light2D');
    this.physics.add.existing(body, true); // static body (unchanged)
    this.platforms.push(body);

    // Ground only: subtle repeating vertical line texture over the body.
    if (opts.isGround) {
      const g = this.add.graphics().setDepth(0);
      g.fillStyle(COLORS.PLATFORM, 0.08);
      const left = cx - width / 2;
      const right = cx + width / 2;
      for (let lx = left + 24; lx < right; lx += 24) {
        g.fillRect(lx, topY, 1, thickness); // body height only
      }
    }

    // 2. Top edge — bright 2px neon line sitting on the body's top surface.
    this.add
      .rectangle(cx, topY + 1, width, 2, COLORS.PLATFORM, 1)
      .setDepth(1);

    // 3. Glow line — faint 1px halo 1px above the bright edge.
    this.add
      .rectangle(cx, topY - 1.5, width, 1, COLORS.PLATFORM, 0.35)
      .setDepth(1);

    // Optional atmosphere label on ~every third platform (never on ground).
    if (!opts.isGround) {
      if (this.platformCount % 3 === 0) {
        this.addPlatformLabel(cx, topY + thickness / 2);
      }
      this.platformCount++;
    }
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
    // Secret 1 — Zone 2: high above the screen, reached by a double jump near
    // the camera's upper scroll limit.
    this.addCollectible(1800, 20, true);
    // Hint: a trail of 3 tiny orange particles drifting down into view on a
    // loop (staggered 1s apart so it reads as a continuous trickle).
    for (let i = 0; i < 3; i++) {
      const hint = this.add.rectangle(1800, 80, 4, 4, HIDDEN_COLLECTIBLE_COLOR, 0.25).setDepth(2);
      this.tweens.add({
        targets: hint,
        y: 140,
        duration: 3000,
        delay: i * 1000,
        repeat: -1,
        ease: 'Linear',
      });
    }

    // Secret 2 — Zone 3: behind a false wall (platform-coloured, NO physics
    // body). Lowered to 45% opacity with a faint orange tint so it feels
    // subtly "wrong" to an observant player. The collectible sits behind it.
    this.add
      .rectangle(3100, 200, 16, 80, COLORS.PLATFORM, 0.45)
      .setDepth(1); // visual only — no physics, player can walk/dash through
    this.add
      .rectangle(3100, 200, 16, 80, HIDDEN_COLLECTIBLE_COLOR, 0.12)
      .setDepth(1); // faint orange "wrongness" tint
    this.addCollectible(3140, 200, true);

    // Secret 3 — Zone 4: a small ledge only reachable by a mid-air dash from
    // the nearby platform; the collectible sits on it (pure skill reward).
    this.addPlatform(4400, 280, 64);
    this.addCollectible(4400, 250, true);
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
    this.player.die();
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

    // 5. After a short beat, fade to black and hand off to Level 2.
    this.time.delayedCall(600, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('Level2');
        this.scene.stop('Game');
      });
    });
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
  }

  // ---- Main loop --------------------------------------------------------------
  update(time, delta) {
    // M toggles all SFX.
    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.m)) SFX.toggleMute();

    // ESC toggles pause (not after the level is finished).
    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc) && !this.levelDone) {
      this.togglePause();
    }
    if (this.isPaused) {
      this.updatePauseMenu();
      return; // freeze all game logic while paused
    }

    this.background.update();
    this.player.update(time, delta);
    for (const d of this.drones) if (d.active) d.update(time, delta);
    for (const s of this.sentinels) if (s.active) s.update(time, delta);
    for (const s of this.seekers) if (s.active) s.update(time, delta);
    this.portal.update(time, delta);

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
    if (!this.player.isDead && !this.levelDone && this.player.y > DEATH_Y) {
      this.player.die();
    }

    // Auto-reduce bloom strength if the framerate drops.
    if (this.game.loop.actualFps < 50) {
      let p = this.cameras.main.getPostPipeline('BloomPipeline');
      if (Array.isArray(p)) p = p[0];
      if (p) p.uStrength = 1.0;
    }

    // Auto-brighten ambient if the framerate drops.
    if (this.game.loop.actualFps < 50) {
      this.lights.setAmbientColor(0x222222);
    }

    // CRT safeguard: drop scanlines (keep vignette) if the framerate is poor.
    if (this.game.loop.actualFps < 45) {
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

  // ---- Pause (FIX 6) ----------------------------------------------------------
  togglePause() {
    if (this.isPaused) this.resumeGame();
    else this.pauseGame();
  }

  pauseGame() {
    this.isPaused = true;
    this.pauseSelection = 0;
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.buildPauseOverlay();
  }

  resumeGame() {
    this.isPaused = false;
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
    const panel = makeGlassPanel(this, cx, cy, 280, 160).setScrollFactor(0).setDepth(301);
    const title = this.add
      .text(cx, cy - 44, 'PAUSED', { fontFamily: 'monospace', fontSize: '24px', color: '#00ff88' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(302);
    const sep = this.add.rectangle(cx, cy - 18, 200, 1, 0x00ff88, 0.6).setScrollFactor(0).setDepth(302);
    this.resumeText = this.add
      .text(cx - 60, cy + 8, 'RESUME', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.restartText = this.add
      .text(cx - 60, cy + 36, 'RESTART', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.pauseUI = [dim, panel, title, sep, this.resumeText, this.restartText];
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
  }

  updatePauseMenu() {
    const k = this.pauseKeys;
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w)) {
      this.pauseSelection = 0;
      this.refreshPauseSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) {
      this.pauseSelection = 1;
      this.refreshPauseSelection();
    }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.pauseSelection === 0) {
        this.resumeGame();
      } else {
        // RESTART: fully reset the scene from scratch.
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.isPaused = false;
        this.scene.restart();
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
