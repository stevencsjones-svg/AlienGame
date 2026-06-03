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
        frames: anims.generateFrameNumbers(PLAYER_SHEET_KEY, { frames: [f(1,0), f(1,1), f(1,2), f(1,3), f(1,4), f(1,5), f(1,6)] }),
        frameRate: 14,
        repeat: -1,
      });
    }
    if (!anims.exists('player_jump')) {
      anims.create({
        key: 'player_jump',
        frames: anims.generateFrameNumbers(PLAYER_SHEET_KEY, { frames: [f(2,0), f(2,1), f(2,2), f(2,3), f(2,4), f(2,5)] }),
        frameRate: 12,
        repeat: 0,
      });
    }
    if (!anims.exists('player_fall')) {
      anims.create({
        key: 'player_fall',
        frames: anims.generateFrameNumbers(PLAYER_SHEET_KEY, { frames: [f(3,0), f(3,1), f(3,2), f(3,3)] }),
        frameRate: 10,
        repeat: -1,
      });
    }

    this.scene.start('MainMenu');
  }
}
