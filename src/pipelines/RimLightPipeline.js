import Phaser from 'phaser';
import { VISUAL } from '../constants.js';

// =============================================================================
// RimLightPipeline
// An object-level PostFX pipeline (applied to the player sprite, not the
// camera). It detects the sprite's silhouette edges via the alpha channel and
// adds a thin cyan rim on the edges facing AWAY from the player light — lifting
// the character off the background so it reads as solid and present.
//
// NOTE: this is applied to `player.visuals.sprite` (the player is rendered as a
// Sprite, not a Graphics object). uLightPos / uResolution are pushed in each
// frame from the scene (see Game/Level2 update()).
// =============================================================================
export default class RimLightPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: 'RimLightPipeline',
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform vec2 uResolution;
        uniform vec2 uLightPos;
        uniform float uRimWidth;
        uniform float uRimIntensity;
        varying vec2 outTexCoord;

        void main() {
          vec4 color = texture2D(uMainSampler, outTexCoord);

          // Only process non-transparent pixels.
          if (color.a < 0.1) {
            gl_FragColor = color;
            return;
          }

          vec2 texel = (1.0 / uResolution) * uRimWidth;

          // Sample neighbour alphas to find the silhouette edge.
          float left  = texture2D(uMainSampler, outTexCoord - vec2(texel.x, 0.0)).a;
          float right = texture2D(uMainSampler, outTexCoord + vec2(texel.x, 0.0)).a;
          float up    = texture2D(uMainSampler, outTexCoord - vec2(0.0, texel.y)).a;
          float down  = texture2D(uMainSampler, outTexCoord + vec2(0.0, texel.y)).a;

          float minNeighbour = min(min(left, right), min(up, down));
          float edge = step(minNeighbour, 0.1);

          if (edge > 0.5) {
            vec2 toLight = normalize(uLightPos - outTexCoord);
            // Surface normal approximated from the alpha gradient.
            vec2 normal = vec2(right - left, down - up);
            if (length(normal) > 0.0) normal = normalize(normal);
            // Rim = edge facing AWAY from the light.
            float rim = max(0.0, -dot(normal, toLight));
            rim = pow(rim, 2.0) * uRimIntensity;
            color.rgb += vec3(0.0, 0.9, 1.0) * rim * color.a;
          }

          gl_FragColor = color;
        }
      `,
    });
    this.uRimWidth = VISUAL.RIM_WIDTH;
    this.uRimIntensity = VISUAL.RIM_INTENSITY;
    this.uLightPos = [0.5, 0.5];
    // Reasonable default; the scene overrides this each frame with the sprite's
    // on-screen framebuffer size so the edge offset is in object-pixels.
    this.uResolution = [64, 64];
  }

  onPreRender() {
    this.set2f('uResolution', this.uResolution[0], this.uResolution[1]);
    this.set2f('uLightPos', this.uLightPos[0], this.uLightPos[1]);
    this.set1f('uRimWidth', this.uRimWidth);
    this.set1f('uRimIntensity', this.uRimIntensity);
  }
}
