// Offline reachability check for Level 4. Run: node scripts/verifyL4.mjs
import { PHYS, LIMITS, REQUIRED_PATH, TOTAL_COLLECTIBLES, verifyPath } from '../src/scenes/level4Layout.js';

const r = (n) => Math.round(n);
console.log('PHYS:', {
  maxJumpHeight: r(PHYS.maxJumpHeight),
  maxDoubleJumpHeight: r(PHYS.maxDoubleJumpHeight),
  maxGapRun: r(PHYS.maxGapRun),
  maxGapDash: r(PHYS.maxGapDash),
});
console.log('LIMITS:', { RISE: r(LIMITS.RISE), GAP_NODASH: r(LIMITS.GAP_NODASH), GAP_DASH: r(LIMITS.GAP_DASH) });
console.log('required path platforms:', REQUIRED_PATH.length, '| collectibles:', TOTAL_COLLECTIBLES);

const violations = verifyPath();
if (violations.length === 0) {
  console.log('\n✅ REACHABILITY OK — every consecutive required-path pair is within limits.');
} else {
  console.log(`\n❌ ${violations.length} VIOLATION(S):`);
  for (const v of violations) {
    console.log(`  [${v.i}] ${v.kind}`, JSON.stringify({ ...v, a: undefined, b: undefined }),
      `\n        a=(${v.a.x},${v.a.y}) -> b=(${v.b.x},${v.b.y}) dash=${v.b.dash}`);
  }
  process.exitCode = 1;
}
