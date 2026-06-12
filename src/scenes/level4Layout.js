// =============================================================================
// level4Layout.js — Level 4 (Market Towers) geometry brain.
//
// PURE DATA + MATH, no Phaser. Both the scene and the offline reachability
// verifier (scripts/verifyL4.mjs) import this so the level is provably beatable.
//
// Physics provenance (read verbatim from src/constants.js):
//   GRAVITY 1200 · PLAYER.SPEED 220 · JUMP_VELOCITY 600
//   DASH_SPEED 560 · DASH_DURATION 200ms
// =============================================================================
const G = 1200;
const RUN = 220;
const JV = 600;
const DASH_SPEED = 560;
const DASH_DUR = 0.2; // s

const maxJumpHeight = (JV * JV) / (2 * G);            // 150
const maxDoubleJumpHeight = 2 * maxJumpHeight;        // 300
// Double-jump airtime landing at the same height: rise (jump1) + rise (jump2)
// + fall from the chained apex = JV/G + JV/G + sqrt(2·apex/G) ≈ 1.71s, × run.
const dblAirtime = (JV / G) + (JV / G) + Math.sqrt((2 * maxDoubleJumpHeight) / G);
const maxGapRun = RUN * dblAirtime;                   // ≈ 375
const maxGapDash = maxGapRun + DASH_SPEED * DASH_DUR; // ≈ 487

export const PHYS = { maxJumpHeight, maxDoubleJumpHeight, maxGapRun, maxGapDash };

// HARD placement caps for the REQUIRED path (≤ multipliers from the brief).
export const LIMITS = {
  RISE: 0.75 * maxDoubleJumpHeight, // 225
  GAP_NODASH: 0.80 * maxGapRun,     // ≈ 300
  GAP_DASH: 0.80 * maxGapDash,      // ≈ 390
};

export const W = 8000;
export const H = 12000;
export const FLOOR_Y = 11900;
export const DEATH_Y = 12080;
export const PORTAL = { x: 6100, y: 1810 };
export const SHIELD = { x: 6230, y: 8430 }; // on the S2 top climb platform
export const CHECKPOINT = { x: 1825, y: 8200, respawnX: 1825, respawnY: 8160 };

// ---------------------------------------------------------------------------
// Generators (deterministic — no randomness on the required path).
// node = { x, y, w, h, dash }. y decreases upward.
// ---------------------------------------------------------------------------
function climbCol(xC, amps, yStart, yTop, rise, w, h, dash) {
  const out = [];
  let i = 0;
  for (let y = yStart; y >= yTop; y -= rise, i += 1) {
    const amp = Array.isArray(amps) ? amps[i % amps.length] : amps;
    out.push({ x: xC + (i % 2 === 0 ? -amp : amp), y, w, h, dash: !!dash });
  }
  return out;
}
function runRow(y, xStart, xEnd, dx, w, h, dash) {
  const out = [];
  const dir = xEnd >= xStart ? 1 : -1;
  for (let x = xStart; dir > 0 ? x <= xEnd : x >= xEnd; x += dir * dx) {
    out.push({ x, y, w, h, dash: !!dash });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SECTIONS (verb-distinct). Each climb sits above a catch surface, so a missed
// jump is a setback, not a fall to the bottom.
// ---------------------------------------------------------------------------
// S1 RUN — the market floor is one continuous surface; a single waypoint near
// the east-tower base is all the required path needs (walking, gap 0).
const S1_FLOOR_NODE = { x: W / 2, y: FLOOR_Y, w: W, h: 200, dash: false };

// S2 CLIMB — east tower, centred at x6100 so the top connects to the bridge.
// amp pattern fakes tight INTERIOR shafts (amp 60) vs open EXTERIOR scaffolding
// (amp 130). yTop/rise chosen so the last platform lands exactly at y8470 (the
// shield sits on it). A vendor-elevator runs beside it as a breather.
const S2 = climbCol(6100, [60, 60, 60, 130, 130, 130], 11700, 8470, 190, 150, 18, false);

// S3 BRIDGE 1 — long horizontal market bridge, east -> west.
const S3 = runRow(8270, 6400, 1550, 305, 200, 18, false);

// S4 — west tower. Guided DESCENT shaft (small offsets so falling stays caught)
// into a mid-market gallery, then a tighter exterior ASCENT.
const S4_DESC = [
  { x: 1700, y: 8540, w: 160, h: 16, dash: false },
  { x: 1820, y: 8780, w: 160, h: 16, dash: false },
  { x: 1700, y: 9020, w: 160, h: 16, dash: false },
  { x: 1820, y: 9260, w: 160, h: 16, dash: false },
  { x: 1700, y: 9500, w: 160, h: 16, dash: false },
  { x: 1820, y: 9740, w: 160, h: 16, dash: false },
];
const S4_GALLERY = { x: 1760, y: 9900, w: 420, h: 18, dash: false };
const S4_ASCENT = climbCol(2050, 110, 9720, 4500, 200, 130, 16, false);

// S5 BRIDGE 2 — dash-gapped static anchors (rail movers are a flashier alt route,
// not required) then the summit ascent on the east side, framed by the sun.
const S5 = runRow(4300, 2100, 5800, 460, 200, 18, true);
const SUMMIT = climbCol(6050, 100, 4150, 1950, 190, 170, 16, false);
const SUMMIT_TOP = { x: 6100, y: 1880, w: 340, h: 28, dash: false };

// The ordered REQUIRED PATH (what the verifier walks). The shield sits on S2's
// last platform; the bridge connects directly off it (no separate top landing).
export const REQUIRED_PATH = [
  S1_FLOOR_NODE,
  ...S2,
  ...S3,
  ...S4_DESC, S4_GALLERY, ...S4_ASCENT,
  ...S5,
  ...SUMMIT, SUMMIT_TOP,
];

// Optional / decorative / secret-bearing ledges (NOT on the strict path).
export const EXTRAS = [
  // S1 stall roofs (gentle hops + collectible arcs)
  [1300, 11700, 180, 16], [2100, 11650, 180, 16], [2900, 11700, 180, 16], [3700, 11650, 180, 16],
  // S3 wider "safe islands" between crowd zones
  [5180, 8300, 300, 18], [3650, 8300, 300, 18], [2150, 8300, 300, 18],
  // Hidden-collectible ledges
  [4000, 8540, 130, 14],  // H3: under-bridge ledge
  [1520, 9120, 120, 14],  // H4: off the descent shaft (dash-reachable secret branch)
];

// Moving platforms (flavor / alternate routes — required path is static).
// [startX, topY, range, speed, axis]
export const ELEVATOR = [6480, 9300, 700, 60, 'y']; // S2 vendor-elevator breather
export const S5_RAILS = [
  [2560, 4300, 300, 90, 'x'], [3480, 4300, 300, 100, 'x'],
  [4400, 4300, 300, 110, 'x'], [5320, 4300, 300, 100, 'x'],
];

// ---------------------------------------------------------------------------
// Enemies by type (1 GroundDrone introduced S1, 2 HoverSentinel S2, 3 Seeker S3).
// ---------------------------------------------------------------------------
export const DRONES = [ // type 1
  [800, 11860], [2400, 11860], [3900, 11860], [4800, 11860],   // S1 floor
  [5790, 8270], [4000, 8270], [2400, 8270],                    // S3 bridge
  [1760, 9870],                                                // S4 gallery
  [2560, 4270], [3940, 4270], [5340, 4270],                    // S5 anchors
];
export const SENTINELS = [ // type 2
  [5740, 10800], [5860, 10000], [5800, 9100], [5860, 8650],    // S2 exterior ledges
  [6095, 8230], [5180, 8230], [4300, 8230],                    // S3 zones
  [1940, 9300], [2160, 8500], [1940, 7500], [2160, 6500], [1940, 5500], [2160, 4700], // S4 ascent
  [3000, 4230], [4600, 4230],                                  // S5
  [6050, 3200], [6100, 2400],                                  // summit
];
export const SEEKERS = [ // type 3 (need the player ref)
  [1850, 8200],            // S3 final (west) zone — introduction
  [1760, 9000], [1820, 9500], // S4 descent ledges
  [3500, 4250], [5000, 4250], // S5
];

// ---------------------------------------------------------------------------
// Collectibles. ~50 trail pickups tracing the required-path jump arcs + 5 hidden
// (one per section) = 55 total. HUD reads x / 55.
// ---------------------------------------------------------------------------
const HIDDEN = [
  [3700, 11600], // S1 — above a stall facade
  [5800, 9950],  // S2 — tucked in an interior shaft
  [4000, 8500],  // S3 — under-bridge ledge
  [1520, 9090],  // S4 — off the descent shaft (dash-reachable secret)
  [6320, 1780],  // S5 — behind the summit sign
];

function buildTrail() {
  // One apex point per required-path segment, then evenly sample down to 50.
  const apex = [];
  for (let i = 0; i < REQUIRED_PATH.length - 1; i += 1) {
    const a = REQUIRED_PATH[i];
    const b = REQUIRED_PATH[i + 1];
    const x = Math.round((a.x + b.x) / 2);
    const y = Math.round(Math.min(a.y, b.y) - 70); // floats in the jump arc
    apex.push([x, y]);
  }
  const TARGET = 50;
  const out = [];
  const step = apex.length / TARGET;
  for (let i = 0; i < TARGET; i += 1) out.push(apex[Math.min(apex.length - 1, Math.floor(i * step))]);
  return out;
}

// 50 trail + 5 hidden = 55. Each entry: [x, y].
export const COLLECTIBLES = [...buildTrail(), ...HIDDEN];
export const TOTAL_COLLECTIBLES = COLLECTIBLES.length;

// ---------------------------------------------------------------------------
// REACHABILITY VERIFIER — walks consecutive required-path pairs and asserts the
// hard caps. Returns an array of violation objects (empty = all reachable).
// ---------------------------------------------------------------------------
export function verifyPath() {
  const v = [];
  for (let i = 0; i < REQUIRED_PATH.length - 1; i += 1) {
    const a = REQUIRED_PATH[i];
    const b = REQUIRED_PATH[i + 1];
    const rise = Math.max(0, a.y - b.y); // how much higher b is than a
    const gap = Math.max(0, Math.abs(a.x - b.x) - (a.w / 2 + b.w / 2));
    const gapLimit = b.dash ? LIMITS.GAP_DASH : LIMITS.GAP_NODASH;
    if (rise > LIMITS.RISE) v.push({ i, kind: 'rise', rise: Math.round(rise), limit: Math.round(LIMITS.RISE), a, b });
    if (gap > gapLimit) v.push({ i, kind: 'gap', gap: Math.round(gap), limit: Math.round(gapLimit), dash: b.dash, a, b });
    // Combined feasibility: a near-max rise leaves little airtime for horizontal.
    if (rise > 0 && gap > 0 && (rise / LIMITS.RISE) + (gap / gapLimit) > 1.5) {
      v.push({ i, kind: 'combined', rise: Math.round(rise), gap: Math.round(gap), a, b });
    }
  }
  return v;
}
