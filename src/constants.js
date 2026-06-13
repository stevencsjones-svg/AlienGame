// =============================================================================
// constants.js
// All tunable values live here so they can be tweaked without hunting through
// the rest of the code. Colours are stored as 0xRRGGBB numbers (what Phaser
// Graphics / Shapes expect); BG_HEX is the string form for the canvas clear
// colour.
// =============================================================================

// ---- World & viewport -------------------------------------------------------
export const WORLD = {
  WIDTH: 6400,
  HEIGHT: 900,
};

// The visible camera viewport. Smaller than the world so the level scrolls.
export const VIEW = {
  WIDTH: 960,
  HEIGHT: 540,
};

export const GRAVITY = 1200;

// ---- Assist mode multipliers ------------------------------------------------
// Applied on top of normal speed values — never mutate the base constants.
export const ASSIST_MODE = {
  ENEMY_SPEED_MULTIPLIER: 0.6,  // applied to every enemy's movement per frame
  GAME_SPEED_MULTIPLIER:  0.75, // applied to physics.world.timeScale
};

// ---- Visual enhancement tunables --------------------------------------------
// Rim light (player sprite) + final colour grade. See RimLightPipeline.js and
// ColorGradePipeline.js.
export const VISUAL = {
  RIM_INTENSITY: 0.6,
  RIM_WIDTH:     1.5,
  COLOR_GRADE: {
    SHADOW_LIFT:  0.03,
    MIDTONE_TINT: 0.6,
    CONTRAST:     1.08,
    SATURATION:   1.12,
  },
};

// ---- Cinematic camera reactions ---------------------------------------------
// Zoom targets/durations for CameraController.cinematicEvent(), plus the
// plunge/ascent shaft dynamic look-ahead (Level 2). See CameraController.js.
export const CAMERA_EVENT = {
  SEEKER_ZOOM_OUT:       0.94,
  SEEKER_ZOOM_DURATION:  120,
  DEATH_ZOOM_OUT:        0.88,
  DEATH_ZOOM_DURATION:   300,
  DEATH_HOLD_MS:         300,
  ABILITY_ZOOM_IN:       1.10,
  ABILITY_ZOOM_DURATION: 200,
  ABILITY_HOLD_MS:       400,
  PORTAL_ZOOM_OUT:       0.82,
  PORTAL_ZOOM_DURATION:  2000,
  SHAFT_LOOKAHEAD_MAX:   120,  // px downward (plunge); ascent uses -80
  SHAFT_LOOKAHEAD_LERP:  0.04,
};

// Dev flag: when true, narrative beats that would interrupt iteration (the
// opening title cards) are skipped silently. Set to false for playtest builds.
export const DEV_MODE = true;

// Falling below this y-value (i.e. into a pit) kills the player. Pushed well
// below the world floor (the camera is bounded to WORLD.HEIGHT, so the player
// is already off-screen by ~WORLD.HEIGHT) so the death FX fire after they've
// clearly fallen out of view rather than at the lip of the pit. (BUG 7)
export const DEATH_Y = WORLD.HEIGHT + 400;

// ---- Player -----------------------------------------------------------------
export const PLAYER = {
  WIDTH: 20,
  HEIGHT: 28,

  SPEED: 220,          // horizontal run speed (px/s)
  JUMP_VELOCITY: 600,  // upward impulse on jump (px/s)  -> ~150px jump height

  // Variable jump height: on early jump-release while rising, upward velocity
  // is multiplied by this to cut the jump short.
  // TUNING: JUMP_CUT_MULTIPLIER
  // 0.45 = recommended starting point (Celeste-like)
  // Lower = shorter minimum hop (more punishing)
  // Higher = less difference between tap and hold (more forgiving)
  // Typical range: 0.3 to 0.6
  JUMP_CUT_MULTIPLIER: 0.45,

  // COYOTE_TIME: how long after leaving a platform the
  // player can still jump. 100ms is standard.
  // Increase for more forgiving feel (up to 150ms)
  // Decrease for more precise/punishing feel (down to 60ms)
  COYOTE_TIME: 100, // ms

  // JUMP_BUFFER: how early before landing a jump input
  // is remembered. 120ms is standard.
  // Increase if players complain jumps don't register
  // Decrease if jumps feel like they fire unexpectedly
  JUMP_BUFFER: 120, // ms

  // CORNER_CORRECTION: pixels of overlap that will be silently corrected on
  // upward jumps. 5px is the sweet spot — generous enough to feel fair, small
  // enough to feel honest. Increase if jumps still feel clipped. Decrease if
  // the nudge feels too obvious. (Range ~3 tight to ~8 very forgiving;
  // Celeste uses ~4-5px.)
  CORNER_CORRECTION: 5, // px

  DASH_SPEED: 560,     // horizontal speed during a dash (px/s)
  DASH_DURATION: 200,  // how long a dash lasts (ms)
  DASH_COOLDOWN: 800,  // time before the next dash is available (ms)

  ATTACK_WIDTH: 30,    // attack hitbox size
  ATTACK_HEIGHT: 12,
  ATTACK_DURATION: 150,// how long the attack visual lingers (ms)

  // BUG 10: clamp downward velocity so a fast/long fall can't tunnel through a
  // thin (14px) platform in a single frame. 800px/s ≈ 13px/frame at 60fps, just
  // under the platform thickness. NOTE: this also slows the Level 2 plunge-shaft
  // descent (a deliberately long free-fall) — raise it if you prefer a faster
  // plunge over tunnel-proofing, or gate the cap by section.
  MAX_FALL_SPEED: 800,

  SPAWN_X: 80,
  SPAWN_Y: 750,
};

// ---- Enemies ----------------------------------------------------------------
export const ENEMY = {
  // Ground Drone
  DRONE_SPEED: 80,        // patrol speed (px/s)
  DRONE_PULSE_PERIOD: 1200, // full scale-pulse cycle (ms)

  // Hover Sentinel
  SENTINEL_BOB: 10,         // bob amplitude (px) -> 20px total travel
  SENTINEL_BOB_PERIOD: 1500,// full bob cycle (ms)
  SENTINEL_ROT_PERIOD: 3000,// time for a full 360deg rotation (ms)

  // Seeker
  SEEKER_SPEED: 160,        // chase speed (px/s)
  SEEKER_SPEED_L1: 90,      // Level 1 chase speed — 30% slower for the intro level
  SEEKER_AGGRO: 250,        // start chasing when player is within this range
  SEEKER_DEAGGRO: 400,      // give up when player is further than this
};

// Total number of collectibles placed in the level (used by the HUD).
export const TOTAL_COLLECTIBLES = 19;

// Speed progression: the player accelerates subtly through the back half of
// the level (from Zone 3 to the end of Zone 5).
export const SPEED_PROGRESSION_START_ZONE = 3;
export const SPEED_PROGRESSION_MAX_MULTIPLIER = 1.15; // 15% faster by end of Zone 5

// Hidden "secret" collectibles, beyond the 19 normal ones.
export const HIDDEN_COLLECTIBLE_COUNT = 3;
export const HIDDEN_COLLECTIBLE_COLOR = 0xff6a00;

// ---- Colour palette ---------------------------------------------------------
export const COLORS = {
  BG: 0x050a08,          // near-black background
  PLATFORM: 0x00ff88,    // toxic green
  PLAYER: 0xc8ffd4,      // pale alien white
  ENEMY: 0xbf00ff,       // alien purple (drone + sentinel)
  COLLECTIBLE: 0x00e5ff, // cyan
  ACCENT: 0xff6a00,      // burnt orange (UI + portal)
  SEEKER: 0xff6a00,      // orange (distinct seeker enemy)
  BUILDING: 0x223028,    // dark grey parallax buildings
};

// String form of the background colour for the Phaser canvas.
export const BG_HEX = '#050a08';

// Default vertical thickness of a platform block.
export const PLATFORM_THICKNESS = 28;

// ---- CRT post-processing (scanlines / vignette / curvature) -----------------
export const CRT = {
  CRT_SCANLINES: 0.08,  // scanline darkening opacity (subliminal)
  CRT_VIGNETTE: 0.28,   // edge darkening strength
  CRT_CURVATURE: 6.0,   // barrel-distortion divisor (higher = flatter)
};

// ---- Level 2: Dark Jade palette ---------------------------------------------
export const LEVEL2 = {
  BG: 0x040808,
  PLATFORM: 0x00cc66,
  PLATFORM_DIM: 0x003322,
  PLAYER: 0xc8ffd4,
  ENEMY: 0x880099,       // darker purple (note: enemy classes keep their own colour)
  COLLECTIBLE: 0x00aacc, // muted cyan
  ACCENT: 0xff6a00,
  AMBIENT: 0x112211,     // lighting ambient
  WATER: 0x001a0d,
  FOG: 0x00cc66,
};

// Level 2 world dimensions (large U-shaped descent + ascent).
export const LEVEL2_WORLD = { WIDTH: 14000, HEIGHT: 6000 };

// Bioluminescent Deep City parallax theme (passed to ParallaxBackground for
// Level 2). The `theme` flag switches ParallaxBackground to its organic
// drawing routine; `worldWidth` sizes the layer RenderTextures for the wide
// world. The layer fills below are unused by the deepCity routine (which uses
// its own organic colours) but kept so the palette shape stays consistent.
export const LEVEL2_PARALLAX = {
  theme: 'deepCity',
  worldWidth: LEVEL2_WORLD.WIDTH,
  layer1: { fill: '#040808', opacity: 0.5 },
  layer2: { fill: '#071a0d', opacity: 0.65 },
  layer3: { fill: '#040e08', opacity: 0.9 },
  fog: { fill: '#00cc66', opacity: 0.03 },
};

// ---- Misc tuning (Level 2 systems) ------------------------------------------
export const MOVING_PLATFORM_GLOW_OPACITY = 0.20;
export const SHIELD_RING_RADIUS_X = 20;
export const SHIELD_RING_RADIUS_Y = 26;
export const SHIELD_INVINCIBILITY_MS = 800;
export const SHIELD_BREAK_SHAKE = 0.008;
export const ABILITY_PANEL_HOLD_MS = 2000;
export const PLUNGE_SHAFT_X = 2900;
export const ASCENT_SHAFT_X = 800;
export const SEEKER_WARNING_TEXT = 'HOSTILE UNIT DETECTED';
export const DOUBLE_TAP_WINDOW = 200; // ms (generic double-tap window)

// Collectible totals per level (HUD reads scene.totalCollectibles; falls back here).
export const LEVEL2_COLLECTIBLE_COUNT = 35;

// ---- Audio (procedural SFX via Tone.js) -------------------------------------
export const SFX_MASTER_VOLUME = -6;   // dB on Tone's master destination
export const SFX_LAND_THROTTLE_MS = 100; // min gap between landing thuds
export const SFX_ENABLED = true;
export const MUSIC_VOLUME = 0.6;       // Level 1 background-music volume (0–1)

// ---- Level 1 palette shift (subtle warm/intense drift toward the spire) -----
export const LEVEL1_PALETTE_START = {
  platform: 0x00ff88,
  platformDim: 0x004422,
  enemyBase: 0xbf00ff,
  collectible: 0x00e5ff,
  accent: 0xff6a00,
  fog: 0x00ff88,
};

export const LEVEL1_PALETTE_END = {
  // Slightly warmer / more intense at Zone 5 — approaching the alien spire.
  platform: 0x00ffaa,
  platformDim: 0x005533,
  enemyBase: 0xdd00ff,
  collectible: 0x00ffee,
  accent: 0xff8800,
  fog: 0x00ffaa,
};

// ---- Level 1 zone transition markers (on-screen district labels) ------------
// As the player passes each x threshold, a brief district label fades in/out.
export const ZONE_MARKERS = [
  { x: 1280, label: 'DISTRICT 2 / MARKET SECTOR' },
  { x: 2560, label: 'DISTRICT 3 / VERTICAL CLIMB' },
  { x: 3840, label: 'DISTRICT 4 / ROOFTOP APPROACH' },
  { x: 5120, label: 'DISTRICT 5 / ALIEN SPIRE' },
];

// ---- Level 1 per-zone atmosphere (background colour temperature) ------------
// Five colour-temperature stages tracked by player x. Applied to the camera
// backdrop (bgTint) and the fog overlay (fogColour / fogOpacity). buildingTint
// is provided for reference; it is intentionally NOT used as a multiplicative
// RenderTexture setTint (these near-black values would erase the parallax) —
// the per-zone feel comes from the backdrop + fog instead.
export const LEVEL1_ZONE_PALETTES = {
  zone1: { bgTint: 0x020508, fogColour: 0x001133, fogOpacity: 0.06, buildingTint: 0x030810 },
  zone2: { bgTint: 0x030a08, fogColour: 0x002211, fogOpacity: 0.05, buildingTint: 0x041208 },
  zone3: { bgTint: 0x050a0a, fogColour: 0x001a22, fogOpacity: 0.04, buildingTint: 0x060f10 },
  zone4: { bgTint: 0x080a05, fogColour: 0x111a00, fogOpacity: 0.04, buildingTint: 0x0a1005 },
  zone5: { bgTint: 0x0a0a04, fogColour: 0x1a1400, fogOpacity: 0.05, buildingTint: 0x0f0f04 },
};

// ---- Level-complete narrative beats (per level) -----------------------------
// One story beat + accent colour per level. Read by the shared
// showLevelComplete() overlay (utils/showLevelComplete.js) as the single source
// of truth for level-complete narrative copy across all ten levels.
export const LEVEL_COMPLETE_BEATS = {
  1: {
    beat: 'One tier closer.\nThe city above doesn\'t know you\'re coming.',
    accent: '#ff6a00',
  },
  2: {
    beat: 'You climbed out of the dark.\nThey put you there. Remember that.',
    accent: '#00cc66',
  },
  3: {
    beat: 'The infrastructure bends to no one.\nYou bent it.',
    accent: '#00ddff',
  },
  4: {
    beat: 'The aspirational class clears a path\nfor anyone determined enough.',
    accent: '#3366ff',
  },
  5: {
    beat: 'Power managed from behind glass.\nGlass breaks.',
    accent: '#6633ff',
  },
  6: {
    beat: 'The narrative they built about you\nends here.',
    accent: '#cc00ff',
  },
  7: {
    beat: 'You can see everything from up here.\nThey should have thought of that.',
    accent: '#ff6600',
  },
  8: {
    beat: 'Their architecture was built\nto be incomprehensible.\nYou comprehended it.',
    accent: '#ff3366',
  },
  9: {
    beat: 'The last line of defence.\nBehind you now.',
    accent: '#ff0033',
  },
  10: {
    beat: 'You were at the top.\nThey took everything.\nYou took it back.',
    accent: '#ffffff',
  },
};

// ---- Per-level colour palettes (Levels 1–10) --------------------------------
// Data only — consumed by the existing PaletteManager system. Each entry is the
// full palette for that level (platform / dim / enemy / collectible / accent /
// fog / backdrop tint). Stored here so each level scene has its palette ready
// when built; this block introduces no logic.
export const LEVEL_PALETTES = {
  1: {
    platform: 0x00ff88,
    platformDim: 0x004422,
    enemy: 0xbf00ff,
    collectible: 0x00e5ff,
    accent: 0xff6a00,
    fog: 0x00ff88,
    bgTint: 0x050a08,
  },
  2: {
    platform: 0x00cc66,
    platformDim: 0x003322,
    enemy: 0x880099,
    collectible: 0x00aacc,
    accent: 0xff6a00,
    fog: 0x00cc66,
    bgTint: 0x040808,
  },
  3: {
    platform: 0x00ddff,
    platformDim: 0x003344,
    enemy: 0x6600ff,
    collectible: 0x00ffee,
    accent: 0xff6a00,
    fog: 0x00ddff,
    bgTint: 0x050a0f,
  },
  4: {
    platform: 0x3366ff,
    platformDim: 0x001144,
    enemy: 0xaa44ff,
    collectible: 0x00ccff,
    accent: 0xff6a00,
    fog: 0x3366ff,
    bgTint: 0x060810,
  },
  5: {
    platform: 0x6633ff,
    platformDim: 0x220044,
    enemy: 0xcc00ff,
    collectible: 0xddccff,
    accent: 0xff6a00,
    fog: 0x6633ff,
    bgTint: 0x07060f,
  },
  6: {
    platform: 0xcc00ff,
    platformDim: 0x440055,
    enemy: 0xff0099,
    collectible: 0xffaaee,
    accent: 0xff6a00,
    fog: 0xcc00ff,
    bgTint: 0x0a0514,
  },
  7: {
    platform: 0xff6600,
    platformDim: 0x442200,
    enemy: 0xffaa00,
    collectible: 0xffddaa,
    accent: 0x00e5ff,
    fog: 0xff6600,
    bgTint: 0x0f0a04,
  },
  8: {
    platform: 0xff3366,
    platformDim: 0x440011,
    enemy: 0xcc0044,
    collectible: 0xffaacc,
    accent: 0x00e5ff,
    fog: 0xff3366,
    bgTint: 0x0c0810,
  },
  9: {
    platform: 0xff0033,
    platformDim: 0x440000,
    enemy: 0x880000,
    collectible: 0xff8899,
    accent: 0x00e5ff,
    fog: 0xff0033,
    bgTint: 0x080408,
  },
  10: {
    // Cycles through all palettes in code; white finale room handled separately.
    platform: 0xffffff,
    platformDim: 0x444444,
    enemy: 0xffffff,
    collectible: 0xffffff,
    accent: 0xffffff,
    fog: 0xffffff,
    bgTint: 0x080808,
  },
};

// ---- Level 3: Transit Network (Electric Blue) -------------------------------
// Player starts 10% faster than base; +5% at Section 2 and +5% at Section 4
// stack multiplicatively (applied via the player's speed multiplier in Level3).
export const PLAYER_SPEED_L3_BASE = PLAYER.SPEED * 1.10;
export const L3_PALETTE_PRIMARY = '#22eeff';
export const L3_PALETTE_SECONDARY = '#0088cc';
export const L3_PALETTE_ACCENT = '#88ffff';
export const L3_PALETTE_BG = '#030d18';
export const L3_PALETTE_SHIFT_X = 8000;
export const L3_PALETTE_SHIFT_DURATION = 3000;
export const L3_TRAIN_SPEED_MID = 1.0;
export const L3_TRAIN_SPEED_NEAR = 2.4;

// ---- Level 4: Market Towers (Deep Blue #3366ff base, raised luminance) -------
// All Level 4 background colours live here (the scene uses no inline hex).
export const LEVEL4_PALETTE = {
  BG: 0x0c2150,            // base fill (notably brighter than L1–L3 darks)
  AMBIENT: 0x24407e,
  HAZE: 0x4a76c8,          // bright blue haze gradient
  HAZE_HI: 0x6c92e2,       // brighter haze band
  // Parallax tower fills (back -> front, deep-blue family, clearly above the bg)
  TOWER_FAR: 0x244680,
  TOWER_MID: 0x2f5aa4,
  TOWER_NEAR: 0x3a66b4,
  TOWER_EDGE: 0x88b4ff,    // bright lit tower top edge
  // Lit windows (bright)
  WINDOW_COOL: 0xaae2ff,
  WINDOW_WARM: 0xffe4b4,
  WINDOW_OFF: 0x122a55,
  // Neon accents (used sparingly so blue still dominates)
  NEON_BLUE: 0x4c8cff,
  NEON_CYAN: 0x55ffff,
  NEON_WARM: 0xfff0c0,
  NEON_PINK: 0xff66bb,
  // Vendor stalls / props
  VENDOR_BODY: 0x0f1f40,
  CANOPY: 0x2a55b0,
  CANOPY_STRIPE: 0x3366ff, // AES-006 deep blue
  LAMP_GLOW: 0xffcc66,
  GOODS: 0xbf8a5a,
  PANCAKE: 0xe8b878,
  CABLE: 0x0b1730,
  LANTERN: 0xff8855,
  JUNCTION: 0x1a2c55,
  BIRD: 0x12244a,
  // Sun (pale-bright alien sun framing the summit) + rooftop/sky props
  SUN_CORE: 0xf2f7ff,
  SUN_GLOW: 0xbcd6ff,
  SUN_HALO: 0x88b0f0,
  SUN_BAND: 0xd6e6ff,
  WARNING: 0xff5a4a,        // blinking aircraft-warning lights on tower tops
  ANTENNA: 0x6f9fe0,        // rooftop antenna masts
  CLOUD: 0x16306a,          // thin silhouette clouds drifting across the sun
  GODRAY: 0xcfe2ff,         // faint sun god-ray beams
  WARM_POCKET: 0xffb24a,    // warm amber pocket glow near vendor clusters
  // Gameplay platforms (kept bright + contrasting for readability)
  PLATFORM: 0x9fd0ff,
  PLATFORM_DIM: 0x16315e,
  ACCENT: 0xffd9a0,
  WHITE: 0xffffff,
};

// ---- Level 5: Glass Tier (Violet) -------------------------------------------
export const LEVEL5_WORLD = { WIDTH: 12000, HEIGHT: 5000 };
export const LEVEL5_COLLECTIBLE_COUNT = 55; // 50 trail + 5 hidden

// ---- Level 3 hazards: falling platforms + proximity mines --------------------
export const FALLING_PLATFORM_SHAKE_MS = 800;
export const FALLING_PLATFORM_FALL_ALPHA_MS = 600;
export const FALLING_PLATFORM_RESET_DELAY_MS = 4000;
export const PROXIMITY_MINE_DETECT_RADIUS = 120;
export const PROXIMITY_MINE_ARM_MS = 1200;
export const PROXIMITY_MINE_BLAST_RADIUS = 180;
export const PROXIMITY_MINE_RESPAWN_MS = 5000;
