// =============================================================================
// level5Layout.js — Level 5 (The Glass Tier) geometry brain.
//
// PURE DATA + MATH, no Phaser. Both the scene (Level5.js) and the offline
// reachability verifier (scripts/verifyL5.mjs) import this.
//
// Physics provenance (verbatim from src/constants.js):
//   GRAVITY 1200 · PLAYER.SPEED 220 · JUMP_VELOCITY 600
//   DASH_SPEED 560 · DASH_DURATION 200ms
//
// World: W=12000, H=5000
//   S1 (horizontal lobby)   floor y=4650, x 0–3200
//   S2 (vertical shaft 1)   x≈3200, y=4460→2060
//   S3 (horizontal offices) y≈2060, x 3200–7300   checkpoint at x=3300
//   S4 (vertical shaft 2)   x≈7300, y=2060→500
//   S5 (executive floor)    y=500,  x 7200–11200   portal at x=11100
// =============================================================================
const G          = 1200;
const RUN        = 220;
const JV         = 600;
const DASH_SPEED = 560;
const DASH_DUR   = 0.2; // s

const maxJumpHeight       = (JV * JV) / (2 * G);                           // 150
const maxDoubleJumpHeight = 2 * maxJumpHeight;                              // 300
const dblAirtime = (JV / G) + (JV / G) + Math.sqrt((2 * maxDoubleJumpHeight) / G); // ≈1.707s
const maxGapRun  = RUN * dblAirtime;                                        // ≈375
const maxGapDash = maxGapRun + DASH_SPEED * DASH_DUR;                       // ≈487

export const PHYS = { maxJumpHeight, maxDoubleJumpHeight, maxGapRun, maxGapDash };

export const LIMITS = {
  RISE:      0.75 * maxDoubleJumpHeight, // 225
  GAP_NODASH: 0.80 * maxGapRun,         // ≈300
  GAP_DASH:   0.80 * maxGapDash,        // ≈390
};

export const W      = 12000;
export const H      = 5000;
export const FLOOR_Y = 4650;
export const DEATH_Y = H + 400; // 5400
export const PORTAL  = { x: 11100, y: 430 };
export const SHIELD  = { x: 7460, y: 754 }; // on S4_H_F platform
export const CHECKPOINT = { x: 3300, y: 2044, respawnX: 3300, respawnY: 2020 };

// ---------------------------------------------------------------------------
// node shape: { x, y, w, h, dash, holo }
//   x, y  = centre-x / top-y   (y decreases upward)
//   dash  = true if the gap FROM the previous node requires a dash
//   holo  = true if this is a HoloSweepPlatform (scene instantiates accordingly)
// ---------------------------------------------------------------------------

// === Section 1 — Glass Lobby (horizontal, floor y=4650) ====================
// One long continuous floor + 4 raised hop-islands.
const S1_FLOOR   = { x: 1600, y: FLOOR_Y, w: 3200, h: 28, dash: false };
// Shelf at shaft entrance (step up from floor into S2)
const S1_SHELF   = { x: 3050, y: 4460, w: 200, h: 14, dash: false };
// rise from floor(4650) to shelf(4460) = 190 ≤ 225 ✓
// gap: floor right edge 3200, shelf left edge 2950 — overlapping (gap=0) ✓

// === Section 2 — First Tower shaft (x≈3200, y 4460→2060) ===================
// Solid intro steps (safe — no holo yet)
const S2_SOLID = [
  { x: 3120, y: 4270, w: 140, h: 14, dash: false },  // rise=190
  { x: 3280, y: 4090, w: 140, h: 14, dash: false },  // rise=180, gap=20
  { x: 3120, y: 3910, w: 140, h: 14, dash: false },  // rise=180, gap=20
  { x: 3280, y: 3730, w: 140, h: 14, dash: false },  // rise=180, gap=20
];
// First holo pair: SAFE INTRO — drop to catch ≤ 150px (spec §3 "safe introduction")
// S2_HOLO_INTRO is only 130px above S2_SOLID[3]; catch solid shelf directly below.
const S2_HOLO_INTRO = { x: 3120, y: 3600, w: 160, h: 14, dash: false, holo: true };
// rise=130 ≤ 225, gap from S2_SOLID[3](3280,w140) left=3210 → intro right=3200: overlap ✓

// Mid-shaft holo platforms (beam-lit, alternating ±80px from x=3200)
const S2_HOLO_MID = [
  { x: 3280, y: 3420, w: 160, h: 14, dash: false, holo: true }, // rise=180
  { x: 3120, y: 3240, w: 160, h: 14, dash: false, holo: true }, // rise=180
  { x: 3280, y: 3060, w: 160, h: 14, dash: false, holo: true }, // rise=180
];

// Teaching gap: S2_HA → S2_HB
//   rise=0, centre gap=420px, edge gap=420-80-80=260px < GAP_NODASH(300) ✓
//   Requires double-jump (same-height single-jump clears only 220px < 260px).
//   HB is OPPOSITE phase to HA; beam cannot be on both — player must time landing.
//   Solid catch floor 150px below both (S2_CATCH_TEACH, in EXTRAS).
const S2_HA = { x: 3120, y: 2900, w: 160, h: 14, dash: false, holo: true }; // rise=160
const S2_HB = { x: 3540, y: 2900, w: 160, h: 14, dash: false, holo: true }; // gap 260 ✓

// Upper holo steps to S3
const S2_HOLO_TOP = [
  { x: 3280, y: 2720, w: 160, h: 14, dash: false, holo: true }, // rise=180, gap=100 ✓
  { x: 3120, y: 2540, w: 160, h: 14, dash: false, holo: true }, // rise=180, gap=20
  { x: 3280, y: 2360, w: 160, h: 14, dash: false, holo: true }, // rise=180, gap=20
  { x: 3120, y: 2200, w: 160, h: 14, dash: false, holo: true }, // rise=160
  { x: 3280, y: 2060, w: 200, h: 14, dash: false },             // SOLID top — connects S3
];

// === Section 3 — Mid-tier Offices (horizontal, y≈2060) =====================
// Solid islands interleaved with holo platforms; beam directions alternate.
// Checkpoint at x=3300 before this section.
const S3 = [
  { x: 3700, y: 2060, w: 500, h: 16, dash: false },              // solid island A (checkpoint here)
  { x: 4250, y: 2060, w: 160, h: 14, dash: false, holo: true },  // holo beam L→R  gap 220 ✓
  { x: 4750, y: 2060, w: 300, h: 16, dash: false },              // solid island B  gap 240 ✓
  { x: 5250, y: 2060, w: 160, h: 14, dash: false, holo: true },  // holo beam R→L  gap 250 ✓
  { x: 5750, y: 2000, w: 300, h: 16, dash: false },              // solid island C  gap 250 ✓
  { x: 6250, y: 2000, w: 160, h: 14, dash: false, holo: true },  // holo beam L→R  gap 250 ✓
  { x: 6750, y: 2000, w: 300, h: 16, dash: false },              // solid island D  gap 250 ✓
  { x: 7200, y: 2000, w: 300, h: 16, dash: false },              // solid entry to S4 gap 150 ✓
];
// All S3 gap checks (edge-to-edge):
//   S3[0](3700,w500)→H_A(4250,w160): right=3950, left=4170 → gap=220 < 300 ✓
//   H_A→S3[2](4750,w300): right=4330, left=4600 → gap=270 < 300 ✓
//   S3[2]→H_B(5250,w160): right=4900, left=5170 → gap=270 < 300 ✓
//   H_B→S3[4](5750,w300): right=5330, left=5600 → gap=270 < 300 ✓
//   S3[4]→H_C(6250,w160): right=5900, left=6170 → gap=270 < 300 ✓
//   H_C→S3[6](6750,w300): right=6330, left=6600 → gap=270 < 300 ✓
//   S3[6]→S3[7](7200,w300): right=6900, left=7050 → gap=150 < 300 ✓

// === Section 4 — Second Tower shaft (x≈7300, y 2000→500) ==================
// Shaft centre x=7300, alternates ±160px → x=7140 and x=7460
// rise 180px/step, horizontal 320px swing, edge gap 160px ✓
// combined: (180/225)+(160/300)=0.8+0.53=1.33 < 1.5 ✓
const S4_ENTRY = { x: 7300, y: 1820, w: 200, h: 14, dash: false }; // rise=180 from S3[7](2000)
const S4_HOLO = [
  { x: 7140, y: 1640, w: 160, h: 14, dash: false, holo: true }, // rise=180
  { x: 7460, y: 1460, w: 160, h: 14, dash: false, holo: true }, // beams in OPPOSITE phase
  { x: 7140, y: 1280, w: 160, h: 14, dash: false, holo: true }, // pair A — fast cycle
  { x: 7460, y: 1100, w: 160, h: 14, dash: false, holo: true }, // pair A (offset)
  { x: 7140, y:  920, w: 160, h: 14, dash: false, holo: true }, // pair B — faster
  { x: 7460, y:  740, w: 160, h: 14, dash: false, holo: true }, // pair B (offset), shield here
  { x: 7140, y:  580, w: 160, h: 14, dash: false, holo: true },
];
const S4_TOP = { x: 7300, y: 490, w: 240, h: 14, dash: false }; // SOLID top, connects S5

// === Section 5 — Executive Floor + Portal (y≈500) ==========================
// Beams run fastest here; shatter near portal (handled in Level5.js).
const S5 = [
  { x: 7600, y: 490, w: 500, h: 14, dash: false },              // solid entry
  { x: 8200, y: 490, w: 160, h: 14, dash: false, holo: true },  // strobe holo A
  { x: 8700, y: 490, w: 300, h: 14, dash: false },              // solid B
  { x: 9250, y: 490, w: 160, h: 14, dash: false, holo: true },  // strobe holo B
  { x: 9750, y: 490, w: 300, h: 14, dash: false },              // solid C
  { x: 10300, y: 490, w: 160, h: 14, dash: false, holo: true }, // strobe holo C
  { x: 10800, y: 490, w: 400, h: 14, dash: false },             // solid D (pre-portal)
  { x: 11200, y: 470, w: 300, h: 14, dash: false },             // portal platform
];
// S5 gap checks (edge-to-edge, all < 300 ✓ — see inline comments in S3 style):
//   S4_TOP→S5[0]: right=7420, left=7350 → overlap ✓
//   S5[0]→H_A: right=7850, left=8120 → 270 < 300 ✓
//   H_A→S5[2]: right=8280, left=8550 → 270 < 300 ✓
//   S5[2]→H_B: right=8850, left=9170 → 320 — dash needed!
//     S5[3].dash=false → use GAP_NODASH. 320 > 300 → needs adjustment!

// Re-check: S5[2](x=8700,w=300)→H_B(x=9250,w=160)
//   right=8700+150=8850, left=9250-80=9170, gap=320 > 300
//   FIX: shift H_B to x=9180: right=8850, left=9100, gap=250 < 300 ✓

// (S5 corrected in REQUIRED_PATH below — H_B moved to x=9180)

// CORRECTED S5 (h_B x adjusted):
const S5_CORR = [
  { x: 7600, y: 490, w: 500, h: 14, dash: false },
  { x: 8200, y: 490, w: 160, h: 14, dash: false, holo: true },
  { x: 8700, y: 490, w: 300, h: 14, dash: false },
  { x: 9180, y: 490, w: 160, h: 14, dash: false, holo: true },  // was 9250, now 9180
  { x: 9680, y: 490, w: 300, h: 14, dash: false },              // was 9750, now 9680
  { x: 10180, y: 490, w: 160, h: 14, dash: false, holo: true }, // was 10300, now 10180
  { x: 10680, y: 490, w: 400, h: 14, dash: false },             // was 10800, now 10680
  { x: 11150, y: 470, w: 300, h: 14, dash: false },             // portal platform
];
// Re-verify S5_CORR gaps:
//   S5[2](8700,300)→H_B(9180,160): right=8850, left=9100 → gap=250 < 300 ✓
//   H_B→S5[4](9680,300): right=9260, left=9530 → gap=270 < 300 ✓
//   S5[4]→H_C(10180,160): right=9830, left=10100 → gap=270 < 300 ✓
//   H_C→S5[6](10680,400): right=10260, left=10480 → gap=220 < 300 ✓
//   S5[6]→portal(11150,300): right=10880, left=11000 → gap=120 < 300 ✓

// Ordered required path the verifier walks:
export const REQUIRED_PATH = [
  S1_FLOOR,
  S1_SHELF,
  ...S2_SOLID,
  S2_HOLO_INTRO,
  ...S2_HOLO_MID,
  S2_HA,
  S2_HB,
  ...S2_HOLO_TOP,
  ...S3,
  S4_ENTRY,
  ...S4_HOLO,
  S4_TOP,
  ...S5_CORR,
];

// ---------------------------------------------------------------------------
// EXTRAS — decorative / catch-floor / secret ledges (NOT on strict path)
// ---------------------------------------------------------------------------
export const EXTRAS = [
  // S1 raised hop-islands (visual interest + drone surfaces)
  [700,  4490, 200, 14],
  [1400, 4440, 200, 14],
  [2100, 4490, 200, 14],
  [2700, 4440, 200, 14],
  // S2 catch floors (safe landing for holo intro and teaching gap)
  [3200, 3750, 400, 14], // intro catch (150px below S2_HOLO_INTRO at 3600) ✓
  [3330, 3050, 700, 14], // teaching catch (150px below HA/HB at 2900) ✓
  // S3 sub-floor (gives drones ground to walk; 60px below platform surface)
  [5200, 2120, 4000, 14],
  // Hidden-collectible ledges
  [1400, 4380,  80, 10], // H1: above S1 raised platform
  [3060, 3060,  80, 10], // H2: off S2 shaft wall
  [4800, 2130,  80, 10], // H3: under S3 bridge
  [7050, 1150,  80, 10], // H4: off S4 shaft wall
  [11030, 420,  80, 10], // H5: behind portal
];

// ---------------------------------------------------------------------------
// Holo beams — per HoloSweepPlatform instance config.
// Keys match index in the HOLO_PLATS array built from REQUIRED_PATH in Level5.js.
// beamRange [x0, x1], beamDuration ms, beamStartOffset ms (phase).
// ---------------------------------------------------------------------------
// S2 holos share one wide beam that sweeps the shaft.
export const HOLO_CONFIGS = {
  // S2 intro (index 0): slow, metronomic, single beam spanning shaft width
  S2_INTRO:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  // S2 mid holos 0-2: same beam, same phase (beam lights them in sequence)
  S2_MID_0:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  S2_MID_1:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  S2_MID_2:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  // Teaching gap — HA and HB in OPPOSITE phase (cannot both be solid at once)
  S2_HA:     { beamRange: [2900, 3800], beamDuration: 3000, beamStartOffset: 0 },
  S2_HB:     { beamRange: [2900, 3800], beamDuration: 3000, beamStartOffset: 1500 }, // 180° out of phase
  // S2 top holos — same phase, metronomic
  S2_TOP_0:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  S2_TOP_1:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  S2_TOP_2:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  S2_TOP_3:  { beamRange: [2900, 3700], beamDuration: 3000, beamStartOffset: 0 },
  // S3 holos — alternating direction, staggered offsets
  S3_H0:     { beamRange: [3900, 4700], beamDuration: 2800, beamStartOffset:    0 },
  S3_H1:     { beamRange: [4600, 5500], beamDuration: 2800, beamStartOffset: 1400 }, // opposite phase
  S3_H2:     { beamRange: [5600, 6500], beamDuration: 2600, beamStartOffset:  700 }, // staggered
  // S4 holos — faster, paired with phase offset
  S4_H0:     { beamRange: [6900, 7700], beamDuration: 2200, beamStartOffset:    0 },
  S4_H1:     { beamRange: [6900, 7700], beamDuration: 2200, beamStartOffset: 1100 },
  S4_H2:     { beamRange: [6900, 7700], beamDuration: 1800, beamStartOffset:    0 },
  S4_H3:     { beamRange: [6900, 7700], beamDuration: 1800, beamStartOffset:  900 },
  S4_H4:     { beamRange: [6900, 7700], beamDuration: 1400, beamStartOffset:    0 },
  S4_H5:     { beamRange: [6900, 7700], beamDuration: 1400, beamStartOffset:  700 },
  S4_H6:     { beamRange: [6900, 7700], beamDuration: 1200, beamStartOffset:    0 },
  // S5 holos — strobe (fastest)
  S5_H0:     { beamRange: [7900, 8700], beamDuration:  900, beamStartOffset:    0 },
  S5_H1:     { beamRange: [8900, 9600], beamDuration:  900, beamStartOffset:  450 },
  S5_H2:     { beamRange: [9800,10500], beamDuration:  900, beamStartOffset:    0 },
};

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
export const DRONES = [
  // S1 floor
  [600,  4620], [1200, 4620], [1900, 4620], [2600, 4620],
  // S3 sub-floor
  [4200, 2090], [5000, 2090], [5900, 2090],
  // S5
  [8400, 460], [9900, 460],
];

export const SENTINELS = [
  // S2 shaft (hover, unaffected by holo platforms)
  [3200, 4100], [3200, 3300], [3200, 2500],
  // S3
  [4600, 1980], [5600, 1980], [6800, 1980],
  // S4 shaft
  [7300, 1500], [7300, 800],
  // S5
  [8800, 440], [10400, 440],
];

export const SEEKERS = [
  // S4 (introduction)
  [7250, 1740], [7250, 1060],
  // S5
  [9400, 460], [10900, 460],
];

// ---------------------------------------------------------------------------
// Collectibles: 50 trail (midpoints between required-path pairs) + 5 hidden
// ---------------------------------------------------------------------------
const HIDDEN = [
  [1400, 4360], // H1: above S1 raised platform
  [3060, 3020], // H2: off S2 shaft wall
  [4800, 2090], // H3: under S3 bridge
  [7050, 1100], // H4: off S4 shaft wall
  [11030, 400], // H5: behind portal
];

function buildTrail() {
  const apex = [];
  for (let i = 0; i < REQUIRED_PATH.length - 1; i += 1) {
    const a = REQUIRED_PATH[i];
    const b = REQUIRED_PATH[i + 1];
    const x = Math.round((a.x + b.x) / 2);
    const y = Math.round(Math.min(a.y, b.y) - 70);
    apex.push([x, y]);
  }
  const TARGET = 50;
  const step = apex.length / TARGET;
  const out = [];
  for (let i = 0; i < TARGET; i += 1) {
    out.push(apex[Math.min(apex.length - 1, Math.floor(i * step))]);
  }
  return out;
}

export const COLLECTIBLES = [...buildTrail(), ...HIDDEN];
export const TOTAL_COLLECTIBLES = COLLECTIBLES.length; // 55

// ---------------------------------------------------------------------------
// REACHABILITY VERIFIER
// ---------------------------------------------------------------------------
export function verifyPath() {
  const v = [];
  for (let i = 0; i < REQUIRED_PATH.length - 1; i += 1) {
    const a = REQUIRED_PATH[i];
    const b = REQUIRED_PATH[i + 1];
    const rise     = Math.max(0, a.y - b.y);
    const gap      = Math.max(0, Math.abs(a.x - b.x) - (a.w / 2 + b.w / 2));
    const gapLimit = b.dash ? LIMITS.GAP_DASH : LIMITS.GAP_NODASH;
    if (rise > LIMITS.RISE)
      v.push({ i, kind: 'rise', rise: Math.round(rise), limit: Math.round(LIMITS.RISE), a, b });
    if (gap > gapLimit)
      v.push({ i, kind: 'gap', gap: Math.round(gap), limit: Math.round(gapLimit), dash: b.dash, a, b });
    if (rise > 0 && gap > 0 && (rise / LIMITS.RISE) + (gap / gapLimit) > 1.5)
      v.push({ i, kind: 'combined', rise: Math.round(rise), gap: Math.round(gap), a, b });
  }
  return v;
}
