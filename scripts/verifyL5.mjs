// =============================================================================
// scripts/verifyL5.mjs — offline reachability verifier for Level 5.
//
// Imports level5Layout.js (pure data, no Phaser), walks every consecutive
// required-path pair, and reports PASS/FAIL per step plus an overall result.
//
// Run: node scripts/verifyL5.mjs
// =============================================================================
import {
  REQUIRED_PATH, LIMITS, PHYS,
  verifyPath, TOTAL_COLLECTIBLES,
  W, H, FLOOR_Y, PORTAL, CHECKPOINT,
} from '../src/scenes/level5Layout.js';

console.log('=== Level 5 Reachability Verifier ===\n');
console.log(`Physics: jump=${Math.round(PHYS.maxJumpHeight)}px  dbl=${Math.round(PHYS.maxDoubleJumpHeight)}px  gapRun=${Math.round(PHYS.maxGapRun)}px  gapDash=${Math.round(PHYS.maxGapDash)}px`);
console.log(`Limits:  RISE≤${Math.round(LIMITS.RISE)}  GAP_NODASH≤${Math.round(LIMITS.GAP_NODASH)}  GAP_DASH≤${Math.round(LIMITS.GAP_DASH)}\n`);
console.log(`World: ${W}×${H}  Floor: y=${FLOOR_Y}  Portal: (${PORTAL.x},${PORTAL.y})  Checkpoint: (${CHECKPOINT.x},${CHECKPOINT.y})`);
console.log(`Collectibles: ${TOTAL_COLLECTIBLES} (50 trail + 5 hidden)\n`);

const violations = verifyPath();

// Print per-step results
let failCount = 0;
for (let i = 0; i < REQUIRED_PATH.length - 1; i++) {
  const a = REQUIRED_PATH[i];
  const b = REQUIRED_PATH[i + 1];
  const rise = Math.max(0, a.y - b.y);
  const gap  = Math.max(0, Math.abs(a.x - b.x) - (a.w / 2 + b.w / 2));
  const stepViols = violations.filter((v) => v.i === i);
  const holoTag = b.holo ? '[HOLO]' : '      ';
  const dashTag = b.dash ? '[DASH]' : '      ';
  const tag = stepViols.length ? 'FAIL' : 'PASS';
  if (stepViols.length) {
    failCount++;
    console.log(`  [${tag}] step ${String(i).padStart(2)} ${holoTag}${dashTag}  a(${a.x},${a.y},w${a.w}) → b(${b.x},${b.y},w${b.w})  rise=${rise} gap=${gap}`);
    stepViols.forEach((v) => console.log(`         ↳ ${v.kind}: ${JSON.stringify({ rise: v.rise, gap: v.gap, limit: v.limit })}`));
  }
}

console.log('');
if (violations.length === 0) {
  console.log(`OVERALL: PASS — all ${REQUIRED_PATH.length - 1} steps reachable (0 violations)`);
} else {
  console.log(`OVERALL: FAIL — ${failCount} step(s) with violations`);
  process.exit(1);
}

// --- Teaching gap confirmation ---
const HA_IDX = REQUIRED_PATH.findIndex((p) => p.x === 3120 && p.y === 2900);
const HB_IDX = REQUIRED_PATH.findIndex((p) => p.x === 3540 && p.y === 2900);
if (HA_IDX >= 0 && HB_IDX >= 0) {
  const ha = REQUIRED_PATH[HA_IDX];
  const hb = REQUIRED_PATH[HB_IDX];
  const edgeGap = Math.abs(ha.x - hb.x) - ha.w / 2 - hb.w / 2;
  const singleJumpDist = 220 * 1.0; // RUN * single-jump airtime at same height
  const teachGapOk = edgeGap > singleJumpDist;
  console.log(`\nTeaching gap: HA(${ha.x},${ha.y}) → HB(${hb.x},${hb.y})  edge gap=${edgeGap}px  single-jump max=${Math.round(singleJumpDist)}px`);
  console.log(`  Requires double-jump or dash: ${teachGapOk ? 'YES ✓' : 'NO — gap too small!'}`);
  console.log(`  Safe floor: catch shelf at y=3050 (${3050 - ha.y}px below HA) ≤ 150px: ${3050 - ha.y <= 150 ? 'YES ✓' : 'NO!'}`);
}

// --- First holo drop check ---
const firstHoloIdx = REQUIRED_PATH.findIndex((p) => p.holo);
if (firstHoloIdx > 0) {
  const fh = REQUIRED_PATH[firstHoloIdx];
  const catchY = 3750; // S2_CATCH_INTRO y (in EXTRAS)
  const drop = catchY - fh.y;
  console.log(`\nFirst holo intro: (${fh.x},${fh.y})  catch at y=${catchY}  drop=${drop}px  ≤150: ${drop <= 150 ? 'YES ✓' : 'NO!'}`);
}
