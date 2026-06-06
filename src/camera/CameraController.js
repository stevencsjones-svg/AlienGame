import Phaser from 'phaser';
import { CAMERA_EVENT } from '../constants.js';

// =============================================================================
// CameraController
// A thin wrapper around a follow camera that applies per-mode lerp. Level 1 is
// a pure left-to-right level, so it stays in 'horizontal' mode the whole time.
// (Level 2 keeps its own inline camera logic; this is used by Game.js. Level 2
// instantiates one too — events-only — to reuse cinematicEvent / shaft look-
// ahead without rebuilding its bespoke follow system; it never calls update().)
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

    // Cinematic event state — one event at a time (see cinematicEvent).
    this.eventActive = false;

    // Dynamic shaft look-ahead state (driven by updateShaftLookAhead).
    this.lookAheadX = 0;       // no horizontal look-ahead system in this game
    this.lookAheadY = 0;       // current (lerped) vertical follow offset
    this.targetLookAheadY = 0; // target offset for the current frame
  }

  setMode(mode) {
    this.mode = mode;
  }

  // Call each frame. Starts the follow on first call, then keeps the lerp synced
  // to the current mode. (Callers may pass a delta; it's unused here.)
  update(player) {
    const [lx, ly] = MODES[this.mode] || MODES.horizontal;
    if (!this._following) {
      this.camera.startFollow(player, true, lx, ly);
      this._following = true;
    } else {
      this.camera.setLerp(lx, ly);
    }
  }

  // ---------------------------------------------------------------------------
  // Cinematic camera reactions. A self-contained zoom sequence per event type.
  // The eventActive guard drops any event that fires while one is already
  // playing (correct — a death zoom shouldn't be interrupted by a seeker).
  // `scene` is passed in so the delayedCall timers run on the active scene.
  // ---------------------------------------------------------------------------
  cinematicEvent(type, scene) {
    if (this.eventActive) return;
    this.eventActive = true;

    const cam = this.camera;
    const restore = () => { this.eventActive = false; };

    switch (type) {
      case 'seekerAlert':
        // Quick pull back toward the threat, then ease back to follow.
        cam.zoomTo(CAMERA_EVENT.SEEKER_ZOOM_OUT, CAMERA_EVENT.SEEKER_ZOOM_DURATION, 'Sine.easeOut', false, (c, p) => {
          if (p === 1) {
            scene.time.delayedCall(80, () => {
              cam.zoomTo(1.0, CAMERA_EVENT.SEEKER_ZOOM_DURATION * 2.5, 'Sine.easeIn', false, (c2, p2) => {
                if (p2 === 1) restore();
              });
            });
          }
        });
        break;

      case 'playerDeath':
        // Freeze, hold, then slow zoom back in on the death position.
        cam.zoomTo(CAMERA_EVENT.DEATH_ZOOM_OUT, CAMERA_EVENT.DEATH_ZOOM_DURATION, 'Power2', false, (c, p) => {
          if (p === 1) {
            scene.time.delayedCall(CAMERA_EVENT.DEATH_HOLD_MS, () => {
              cam.zoomTo(1.0, 200, 'Sine.easeIn', false, (c2, p2) => {
                if (p2 === 1) restore();
              });
            });
          }
        });
        break;

      case 'abilityUnlock':
        // Punch in on the player — power fantasy — then settle back.
        cam.zoomTo(CAMERA_EVENT.ABILITY_ZOOM_IN, CAMERA_EVENT.ABILITY_ZOOM_DURATION, 'Back.easeOut', false, (c, p) => {
          if (p === 1) {
            scene.time.delayedCall(CAMERA_EVENT.ABILITY_HOLD_MS, () => {
              cam.zoomTo(1.0, 350, 'Sine.easeIn', false, (c2, p2) => {
                if (p2 === 1) restore();
              });
            });
          }
        });
        break;

      case 'portalReached':
        // Slow zoom out over the whole level — and stay out (the level-complete
        // overlay appears while zoomed back). No return zoom.
        cam.zoomTo(CAMERA_EVENT.PORTAL_ZOOM_OUT, CAMERA_EVENT.PORTAL_ZOOM_DURATION, 'Sine.easeOut', false, (c, p) => {
          if (p === 1) restore();
        });
        break;

      default:
        restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Dynamic shaft look-ahead (Level 2 only — that's where the shafts are).
  // As the player falls through the plunge shaft the camera leads downward to
  // reveal the drop; as they climb the ascent shaft it leads upward toward the
  // exit. Called from Level2.update(); Level 1 has no shafts so it never runs
  // there. Applied via setFollowOffset, lerped for a gradual reveal.
  // ---------------------------------------------------------------------------
  updateShaftLookAhead(player) {
    const vy = player.body.velocity.y;

    const inPlunge = player.x > 7600 && player.x < 8400 && vy > 50;
    const inAscent = player.x > 800 && player.x < 1600 && vy < -50;

    if (inPlunge) {
      const ratio = Math.min(vy / 800, 1.0);
      this.targetLookAheadY = ratio * CAMERA_EVENT.SHAFT_LOOKAHEAD_MAX;
    } else if (inAscent) {
      const ratio = Math.min(Math.abs(vy) / 600, 1.0);
      this.targetLookAheadY = ratio * -80; // negative = lead upward
    } else {
      this.targetLookAheadY = 0;
    }

    this.lookAheadY = Phaser.Math.Linear(this.lookAheadY, this.targetLookAheadY, CAMERA_EVENT.SHAFT_LOOKAHEAD_LERP);
    this.camera.setFollowOffset(-this.lookAheadX, -this.lookAheadY);
  }
}
