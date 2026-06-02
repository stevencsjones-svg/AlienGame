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

// Dev flag: when true, narrative beats that would interrupt iteration (the
// opening title cards) are skipped silently. Set to false for playtest builds.
export const DEV_MODE = true;

// Falling below this y-value (i.e. into a pit) kills the player.
export const DEATH_Y = WORLD.HEIGHT + 50;

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
