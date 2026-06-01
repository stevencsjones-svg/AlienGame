import Phaser from 'phaser';

// =============================================================================
// CameraController
// A thin wrapper around a follow camera that applies per-mode lerp. Level 1 is
// a pure left-to-right level, so it stays in 'horizontal' mode the whole time.
// (Level 2 keeps its own inline camera logic; this is used by Game.js.)
//
//   horizontal: lerpX 0.10, lerpY 0.08
//   plunge / ascent: vertical-dominant
//   deep: horizontal-dominant
// =============================================================================
const MODES = {
  horizontal: [0.1, 0.08],
  plunge: [0.05, 0.15],
  deep: [0.1, 0.05],
  ascent: [0.05, 0.15],
};

export default class CameraController {
  constructor(scene, camera, mode = 'horizontal') {
    this.scene = scene;
    this.camera = camera;
    this.mode = mode;
    this._following = false;
  }

  setMode(mode) {
    this.mode = mode;
  }

  // Call each frame. Starts the follow on first call, then keeps the lerp synced
  // to the current mode.
  update(player, delta) {
    const [lx, ly] = MODES[this.mode] || MODES.horizontal;
    if (!this._following) {
      this.camera.startFollow(player, true, lx, ly);
      this._following = true;
    } else {
      this.camera.setLerp(lx, ly);
    }
  }
}
