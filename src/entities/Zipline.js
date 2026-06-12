// =============================================================================
// Zipline — Level 7 unique mechanic (STUB — no logic yet).
//
// A sagging cable the player can grab mid-air and ride across the rooftop
// skyline, releasing with a jump at any point.
// See src/design/per_level_mechanics.md (Level 7).
//
// TODO (implementation contract):
//   - config: { x2, y2, sag, speed, bidirectional } — the cable runs from
//     (x, y) to (x2, y2) as a catenary (reuse Level4's makeCable drawing
//     pattern: Graphics polyline with sin sag), in world space.
//   - Grab: while the player is airborne and falling (velocity.y > 0), test
//     proximity to the cable curve (sampled points, ~24px radius). On grab:
//     body.setAllowGravity(false), zero velocity, attach to a path parameter
//     t advanced by speed/cableLength per second downhill (or by held
//     direction key if bidirectional).
//   - Ride: player hangs PLAYER.HEIGHT/2 + 10 below the cable point; spawn a
//     small trolley visual (two rects) at the contact; subtle spark particles.
//   - Release: jump key fires Player.doJump() semantics — restore gravity,
//     give the cable's current tangential velocity as inheritance, count as
//     the FIRST jump so the double jump is still available (matches the
//     forgiving-platformer house style). Dash also releases (keeps dash
//     physics untouched — just detach first).
//   - Re-grab cooldown ~250ms so release doesn't instantly re-attach.
//   - One scripted line (final S5 ride) may use config.snapAtT to break
//     mid-ride for the finale beat — emits an event the scene listens to.
//   - Scene contract: update(delta) culled by distance like MovingPlatform.
// =============================================================================
export default class Zipline {
  constructor(scene, x, y, config = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.config = config;
    // STUB: shell only — see TODO block above for the implementation contract.
  }

  update(delta) {} // eslint-disable-line no-unused-vars
}
