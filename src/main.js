import Phaser from 'phaser';
import { VIEW, GRAVITY, BG_HEX } from './constants.js';
import AssistMode from './utils/AssistMode.js';

// Load persisted assist settings before the first scene runs.
AssistMode.load();
import Preload from './scenes/Preload.js';
import MainMenu from './scenes/MainMenu.js';
import Game from './scenes/Game.js';
import Level2 from './scenes/Level2.js';
import Level3 from './scenes/Level3.js';
import UI from './scenes/UI.js';
import ChromaticAberrationPipeline from './pipelines/ChromaticAberrationPipeline.js';
import BloomPipeline from './pipelines/BloomPipeline.js';
import CRTPipeline from './pipelines/CRTPipeline.js';
import RimLightPipeline from './pipelines/RimLightPipeline.js';
import ColorGradePipeline from './pipelines/ColorGradePipeline.js';

// =============================================================================
// main.js — Phaser game config and boot.
// =============================================================================
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW.WIDTH,
  height: VIEW.HEIGHT,
  backgroundColor: BG_HEX,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: GRAVITY },
      debug: false, // flip to true to see physics bodies
    },
  },
  // Custom post-FX pipelines (WebGL).
  pipeline: {
    ChromaticAberrationPipeline, BloomPipeline, CRTPipeline,
    RimLightPipeline, ColorGradePipeline,
  },
  // Preload boots -> MainMenu -> Game -> Level2 (each launches the UI overlay).
  scene: [Preload, MainMenu, Game, Level2, Level3, UI],
};

// eslint-disable-next-line no-new
export default new Phaser.Game(config);
