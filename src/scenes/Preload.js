import Phaser from 'phaser';

// =============================================================================
// Preload
// There are no external assets — every visual is drawn procedurally with
// Phaser Graphics / Shapes. This scene exists as the boot entry point and as a
// natural place to load audio later.
// =============================================================================
export default class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    // AUDIO: load sound effects here later.
    // (No image/spritesheet assets — visuals are all procedural geometry.)
  }

  create() {
    this.scene.start('MainMenu');
  }
}
