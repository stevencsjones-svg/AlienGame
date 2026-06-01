import Phaser from 'phaser';

// =============================================================================
// PaletteManager
// Holds a "current" palette of named colour values (0xRRGGBB ints) and can
// tween to a new palette over time, calling onUpdate() each frame with the
// interpolated colours. Each interpolated entry is a Phaser Color-like object
// { r, g, b, a, color } where `color` is the packed 0xRRGGBB int ready for
// setFillStyle().
// =============================================================================
class PaletteManager {
  constructor(scene) {
    this.scene = scene;
    this.currentPalette = {};
    this.targetPalette = {};
  }

  // Instantly adopt a palette (no visual update — callers apply colours).
  apply(palette) {
    this.currentPalette = { ...palette };
  }

  // Smoothly tween from the current palette to `palette` over `duration` ms,
  // invoking onUpdate(interpolated) each frame.
  transitionTo(palette, duration, onUpdate) {
    this.targetPalette = { ...palette };
    const start = { ...this.currentPalette };

    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Linear',
      onUpdate: (tween) => {
        const t = tween.getValue();
        const interpolated = {};
        Object.keys(palette).forEach((key) => {
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(start[key] ?? palette[key]),
            Phaser.Display.Color.ValueToColor(palette[key]),
            100,
            t * 100,
          );
          // Interpolate returns { r, g, b, a }; add a packed int for setFillStyle.
          c.color = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
          interpolated[key] = c;
        });
        if (onUpdate) onUpdate(interpolated);
      },
      onComplete: () => {
        this.currentPalette = { ...palette };
      },
    });
  }
}

export default PaletteManager;
