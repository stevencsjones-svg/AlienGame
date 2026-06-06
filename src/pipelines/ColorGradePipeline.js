import Phaser from 'phaser';
import { VISUAL } from '../constants.js';

// =============================================================================
// ColorGradePipeline
// The FINAL camera post pass (after Bloom -> Chromatic -> CRT). Lifts shadows
// off pure black, applies a gentle S-curve contrast, pushes a green-teal cast
// into the midtones and nudges saturation — a cinematic film grade over the
// whole frame.
// =============================================================================
const CG = VISUAL.COLOR_GRADE;

export default class ColorGradePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: 'ColorGradePipeline',
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform float uShadowLift;
        uniform float uMidtoneTint;
        uniform float uContrast;
        uniform float uSaturation;
        varying vec2 outTexCoord;

        vec3 grade(vec3 col) {
          // 1. Shadow lift — prevents pure black.
          col = col + uShadowLift * (1.0 - col) * (1.0 - col);

          // 2. Contrast (S-curve around mid-grey).
          col = clamp(col, 0.0, 1.0);
          col = col * col * (3.0 - 2.0 * col);
          col = mix(vec3(0.5), col, uContrast);

          // 3. Midtone tint — green-teal push.
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float midMask = 1.0 - abs(lum - 0.5) * 2.0;
          col.g += midMask * uMidtoneTint * 0.04;
          col.b += midMask * uMidtoneTint * 0.02;

          // 4. Saturation.
          float grey = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(grey), col, uSaturation);

          return clamp(col, 0.0, 1.0);
        }

        void main() {
          vec4 color = texture2D(uMainSampler, outTexCoord);
          color.rgb = grade(color.rgb);
          gl_FragColor = color;
        }
      `,
    });
    this.uShadowLift = CG.SHADOW_LIFT;
    this.uMidtoneTint = CG.MIDTONE_TINT;
    this.uContrast = CG.CONTRAST;
    this.uSaturation = CG.SATURATION;
  }

  onPreRender() {
    this.set1f('uShadowLift', this.uShadowLift);
    this.set1f('uMidtoneTint', this.uMidtoneTint);
    this.set1f('uContrast', this.uContrast);
    this.set1f('uSaturation', this.uSaturation);
  }
}
