// =============================================================================
// WindZone — Level 6 unique mechanic (STUB — no logic yet).
//
// A rectangular volume of moving air that pushes the player while airborne,
// bending jump arcs. Backlog item: "L6 wind zones" (Broadcast Spire).
// See src/design/per_level_mechanics.md (Level 6).
//
// TODO (implementation contract):
//   - config: { w, h, dirX, dirY, force (px/s^2), mode: 'steady'|'pulse',
//     pulsePeriodMs, pulseDutyCycle } — vertical updraft shafts use dirY < 0.
//   - Force application: while the player's body overlaps the zone AND is NOT
//     blocked.down (airborne only — grounded movement stays crisp), add
//     force * (delta/1000) to body.velocity each frame from the scene update.
//     Do NOT touch PLAYER constants; this is an external acceleration.
//   - 'pulse' mode gusts on a broadcast cycle: force ramps in/out over the
//     duty window (Sine ease), synced to a visible transmission flash on the
//     spire so the player can read the rhythm. Phase via config so zones
//     interleave.
//   - Visual: streams of small alpha particles flowing in the wind direction
//     (pooled, like Level3's bgParticles), denser while the gust is live;
//     faint zone-boundary ticks at the edges.
//   - Audio hook: SFX.windGust() on pulse rise (add to SFX.js when built).
//   - MAX_FALL_SPEED already caps downward velocity; clamp the wind's upward
//     contribution to config.maxLift so updrafts can't launch unbounded.
// =============================================================================
export default class WindZone {
  constructor(scene, x, y, config = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.config = config;
    // STUB: shell only — see TODO block above for the implementation contract.
  }

  update(delta) {} // eslint-disable-line no-unused-vars
}
