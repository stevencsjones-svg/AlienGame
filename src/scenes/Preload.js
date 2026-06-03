import Phaser from 'phaser';
import playerSheetUrl from '../../assets/images/player.png';

// =============================================================================
// Preload
// Boot entry point. Loads the player sprite sheet and defines its animations;
// most other visuals are still drawn procedurally with Phaser Graphics / Shapes.
// =============================================================================

// Sheet layout: 7 cols x 4 rows of 176x192 cells (label column already cropped).
// Row indices: IDLE=0, WALK=1, JUMP=2, FALL=3.
export const PLAYER_SHEET_KEY = 'player_sheet';
const FRAME_W = 176;
const FRAME_H = 192;
const COLS = 7;
const f = (row, col) => row * COLS + col;

export default class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    this.load.spritesheet(PLAYER_SHEET_KEY, playerSheetUrl, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
    });
  }

  create() {
    const anims = this.anims;

    if (!anims.exists('player_idle')) {
      anims.create({
        key: 'player_idle',
        frames: anims.generateFrameNumbers(PLAYER_SHEET_KEY, { frames: [f(0,0), f(0,1), f(0,2), f(0,3)] }),
        frameRate: 5,
        repeat: -1,
      });
    }
    if (!anims.exists('player_walk')) {
      anims.create({
        key: 'player_walk',
        // TEMP WORKAROUND: cols 2 & 3 carry the baked box/crosshair artifact
        // (~70% border) and cols 1 & 4 its ~20% edge-bleed — same defect as the
        // jump row. Using only the pristine frames (cols 0, 5, 6 ~0-3% border)
        // until a cleaned sheet is supplied. Restore to cols 0..6 once fixed.
        frames: anims.generateFrameNumbers(PLAYER_SHEET_KEY, { frames: [f(1,0), f(1,5), f(1,6)] }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!anims.exists('player_jump')) {
      anims.create({
        key: 'player_jump',
        // TEMP WORKAROUND: cols 2 & 3 of player.png have a box/crosshair artifact
        // baked into the sheet (~80% border opacity) and cols 1 & 4 carry ~20%
        // edge-bleed of it — all of which framed the character in a "square"
        // mid-jump. Using ONLY the two pristine frames (cols 0 & 5, ~0% border)
        // until a cleaned sheet is supplied. Restore to cols 0..5 once fixed.
        frames: anims.generateFrameNumbers(PLAYER_SHEET_KEY, { frames: [f(2,0), f(2,5)] }),
        frameRate: 6,
        repeat: 0,
      });
    }
    if (!anims.exists('player_fall')) {
      anims.create({
        key: 'player_fall',
        // TEMP WORKAROUND: same cols 2 & 3 artifact (cols 4-6 of this row are
        // empty), so fall uses only the two clean frames. Restore to cols 0..3
        // once the art is fixed.
        frames: anims.generateFrameNumbers(PLAYER_SHEET_KEY, { frames: [f(3,0), f(3,1)] }),
        frameRate: 6,
        repeat: -1,
      });
    }

    this.scene.start('MainMenu');
  }
}
