import Phaser from 'phaser';
import { CRT } from '../constants.js';

// =============================================================================
// CRTPipeline
// Final-pass CRT screen effect: subtle scanlines, a radial vignette, and a
// barely-perceptible barrel curvature. Applied LAST on the camera (after bloom
// and chromatic aberration) so it sits on top of everything.
// =============================================================================
export default class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: 'CRTPipeline',
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform vec2 uResolution;
        uniform float uScanlineOpacity;
        uniform float uVignetteStrength;
        uniform float uCurvature;
        varying vec2 outTexCoord;

        vec2 curveUV(vec2 uv) {
          uv = uv * 2.0 - 1.0;
          vec2 offset = abs(uv.yx) / vec2(uCurvature);
          uv = uv + uv * offset * offset;
          uv = uv * 0.5 + 0.5;
          return uv;
        }

        void main() {
          vec2 uv = curveUV(outTexCoord);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }
          vec4 color = texture2D(uMainSampler, uv);
          float scanline = mod(floor(uv.y * uResolution.y), 2.0);
          color.rgb *= 1.0 - (scanline * uScanlineOpacity);
          vec2 vigUV = uv * 2.0 - 1.0;
          float vignette = 1.0 - dot(vigUV, vigUV) * uVignetteStrength;
          color.rgb *= vignette;
          gl_FragColor = color;
        }
      `,
    });

    // Tunable each frame (Game lowers scanlines if fps drops).
    this.uScanlineOpacity = CRT.CRT_SCANLINES;
    this.uVignetteStrength = CRT.CRT_VIGNETTE;
    this.uCurvature = CRT.CRT_CURVATURE;
  }

  onPreRender() {
    this.set1f('uScanlineOpacity', this.uScanlineOpacity);
    this.set1f('uVignetteStrength', this.uVignetteStrength);
    this.set1f('uCurvature', this.uCurvature);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}
