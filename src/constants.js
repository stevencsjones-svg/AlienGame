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

  DASH_SPEED: 560,     // horizontal speed during a dash (px/s)
  DASH_DURATION: 200,  // how long a dash lasts (ms)
  DASH_COOLDOWN: 800,  // time before the next dash is available (ms)
  DASH_DOUBLE_TAP_WINDOW: 200, // ms — double-tap a direction within this to dash

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
