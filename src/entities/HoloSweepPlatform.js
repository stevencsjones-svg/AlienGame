// =============================================================================
// HoloSweepPlatform — Level 5 unique mechanic (STUB — no logic yet).
//
// A holographic platform that is only SOLID while a security sweep beam is
// passing over it. See src/design/per_level_mechanics.md (Level 5).
//
// TODO (implementation contract):
//   - Visual: translucent platform outline (palette violet) that fills to a
//     bright solid while "lit"; reuse buildPlatformVisual for the lit state,
//     alpha-dimmed ghost for the unlit state.
//   - The sweep beam: a vertical light bar travelling horizontally across a
//     configured span (config.sweepSpan, config.sweepSpeed, config.phase so
//     multiple platforms share one staggered clock). Timer/tween-driven —
//     no per-frame allocation.
//   - Solidity: a STATIC body (this codebase's MovingPlatform pattern) whose
//     body.enable toggles true while the beam overlaps the platform footprint
//     plus config.graceMs (~150ms) of linger, so the player isn't dropped on
//     a frame boundary.
//   - If the player is standing on it when it de-solidifies, they simply fall
//     (no damage) — the lethal part is whatever is below.
//   - Telegraph: 300ms before de-solidify, flicker the fill (FallingPlatform's
//     edge-tint pattern is the house style for "this is about to give way").
//   - Scene contract: scene.update calls update(delta) when within ~1000px of
//     the player (same culling as MovingPlatform); expose bodyRect/body like
//     MovingPlatform so colliders and carry logic stay uniform.
// =============================================================================
export default class HoloSweepPlatform {
  constructor(scene, x, y, config = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.config = config;
    // STUB: shell only — see TODO block above for the implementation contract.
  }

  update(delta) {} // eslint-disable-line no-unused-vars
}
