// =============================================================================
// HoloSweepPlatform — Level 5 unique mechanic.
//
// A holographic platform that is only SOLID while a security sweep beam
// overlaps its footprint. When the beam passes over, the platform lights up and
// the physics body is enabled; when it leaves, the platform flickers for 300ms
// then de-solidifies.
//
// Constructor: (scene, x, y, width, config)
//   config.beamRange       [x0, x1]   world-x sweep extent (default ±400 from x)
//   config.beamDuration    ms         full single-direction sweep (default 3000)
//   config.beamStartOffset ms         phase shift (0 = starts at x0)
//
// Scene contract:
//   - Call update() each frame when within culling distance (~1200px).
//   - this.bodyRect carries the arcade static body (add as collider target).
//   - Depth: platform at 0.1, beam at -1 (behind platforms, in front of bg).
// =============================================================================
import SFX from '../audio/SFX.js';

const BEAM_W     = 22;   // visual width of the sweep bar (px)
const PLAT_H     = 14;   // platform thickness (px)
const BEAM_VIS_H = 700;  // beam visual height (tall column for impact)
const FLICKER_MS = 300;  // warning flicker before de-solidification

const PLAT_COLOR = 0x6633ff; // L5 violet
const DIM_COLOR  = 0x220044; // dimmed underside
const BEAM_COLOR = 0xccbbff; // beam fill (bright violet-white)

export default class HoloSweepPlatform {
  constructor(scene, x, y, width, config = {}) {
    this.scene  = scene;
    this.x      = x;
    this.y      = y;
    this.width  = width;
    this.height = PLAT_H;

    const x0  = config.beamRange ? config.beamRange[0] : x - 400;
    const x1  = config.beamRange ? config.beamRange[1] : x + 400;
    const dur = config.beamDuration    || 3000;
    const off = config.beamStartOffset || 0;

    // ---- Platform visuals -----------------------------------------------
    // Underside dim strip (always visible)
    this._underside = scene.add
      .rectangle(x, y + PLAT_H + 3, width, 6, DIM_COLOR, 0.6)
      .setDepth(0);
    // Ghost body fill (always visible, brightens when active)
    this._fill = scene.add
      .rectangle(x, y + PLAT_H / 2, width, PLAT_H, PLAT_COLOR, 0.15)
      .setDepth(0.1);
    // Top edge line (glows when active)
    this._edge = scene.add
      .rectangle(x, y + 2, width, 3, PLAT_COLOR, 0.4)
      .setDepth(0.2);

    // ---- Physics body ---------------------------------------------------
    // Invisible rect carries the static body; enable is toggled for solidity.
    this.bodyRect = scene.add
      .rectangle(x, y + PLAT_H / 2, width, PLAT_H, 0x000000, 0)
      .setDepth(0.1);
    scene.physics.add.existing(this.bodyRect, true);
    this.bodyRect.body.enable = false; // starts ghosted

    // ---- Beam visuals ---------------------------------------------------
    // Core beam strip
    this._beam = scene.add
      .rectangle(x0, y - BEAM_VIS_H / 2 + PLAT_H / 2, BEAM_W, BEAM_VIS_H, BEAM_COLOR, 0)
      .setDepth(-1);
    // Wide glow halo around beam
    this._glow = scene.add
      .rectangle(x0, y - BEAM_VIS_H / 2 + PLAT_H / 2, BEAM_W * 4, BEAM_VIS_H, BEAM_COLOR, 0)
      .setDepth(-1.1);

    // Beam pulse tween (alpha oscillation while sweeping)
    scene.tweens.add({
      targets: this._beam,
      alpha: { from: 0.35, to: 0.65 },
      duration: 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: this._glow,
      alpha: { from: 0.04, to: 0.12 },
      duration: 280, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ---- Beam position (tracked object so update() can read it) ---------
    this._beamPos = { x: x0 };
    this._sweepTween = scene.tweens.add({
      targets: this._beamPos,
      x: x1,
      duration: dur,
      yoyo: true,
      repeat: -1,
      ease: 'Linear',
      delay: off,
    });

    // ---- State ----------------------------------------------------------
    this._active     = false;
    this._graceTimer = null;
    this._flickTween = null;
    this._platLeft   = x - width / 2;
    this._platRight  = x + width / 2;
  }

  // Call every frame (when within culling distance of the player).
  update(/* delta */) {
    const bx = this._beamPos.x;

    // Sync beam visuals to tween position.
    this._beam.setX(bx);
    this._glow.setX(bx);

    // Overlap: beam centre within platform bounds (±half beam width for leniency)
    const over = bx >= this._platLeft - BEAM_W / 2 && bx <= this._platRight + BEAM_W / 2;

    if (over && !this._active) {
      this._activate();
    } else if (!over && this._active && !this._graceTimer) {
      this._beginFlicker();
    }
  }

  _activate() {
    this._active = true;
    // Cancel any pending deactivation.
    if (this._graceTimer) { this._graceTimer.remove(); this._graceTimer = null; }
    if (this._flickTween) { this._flickTween.stop(); this._flickTween = null; }

    this.bodyRect.body.enable = true;
    this.scene.tweens.add({ targets: this._fill, alpha: 0.85, duration: 60 });
    this.scene.tweens.add({ targets: this._edge, alpha: 1.0,  duration: 60 });
    SFX.holoActivate();
  }

  _beginFlicker() {
    // Flicker for FLICKER_MS, then deactivate. Body stays enabled during flicker.
    this._flickTween = this.scene.tweens.add({
      targets: this._fill,
      alpha: { from: 0.85, to: 0.15 },
      duration: 75, yoyo: true, repeat: 3, ease: 'Linear',
    });
    this._graceTimer = this.scene.time.delayedCall(FLICKER_MS, () => {
      this._deactivate();
    });
  }

  _deactivate() {
    this._active     = false;
    this._graceTimer = null;
    this._flickTween = null;

    this.bodyRect.body.enable = false;
    this.scene.tweens.add({ targets: this._fill, alpha: 0.15, duration: 200 });
    this.scene.tweens.add({ targets: this._edge, alpha: 0.4,  duration: 200 });
  }

  // Convenience alias so Level5.js collider setup matches L4's pattern.
  get body() { return this.bodyRect.body; }

  destroy() {
    if (this._graceTimer) this._graceTimer.remove();
    if (this._sweepTween) this._sweepTween.stop();
    if (this._flickTween) this._flickTween.stop();
    [this._underside, this._fill, this._edge, this._beam, this._glow, this.bodyRect]
      .forEach((o) => { if (o && o.destroy) o.destroy(); });
  }
}
