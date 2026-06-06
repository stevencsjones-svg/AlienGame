import Phaser from 'phaser';

// =============================================================================
// BloomPipeline
// A post-FX pipeline that extracts bright pixels and blurs them outward so neon
// elements radiate glow into the surrounding dark. Strength auto-lowers if the
// framerate dips (see Game.update).
// =============================================================================
export default class BloomPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: 'BloomPipeline',
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform vec2 uResolution;
        uniform float uStrength;
        uniform float uThreshold;
        varying vec2 outTexCoord;

        void main() {
          vec2 texel = 1.0 / uResolution;
          vec4 original = texture2D(uMainSampler, outTexCoord);

          vec3 bloom = vec3(0.0);
          float weights[5];
          weights[0]=0.227; weights[1]=0.194; weights[2]=0.121;
          weights[3]=0.054; weights[4]=0.016;

          bloom += original.rgb * weights[0];
          for(int i = 1; i < 5; i++) {
            vec2 off = vec2(texel.x * float(i), 0.0);
            bloom += texture2D(uMainSampler,
              outTexCoord + off).rgb * weights[i];
            bloom += texture2D(uMainSampler,
              outTexCoord - off).rgb * weights[i];
          }
          for(int i = 1; i < 5; i++) {
            vec2 off = vec2(0.0, texel.y * float(i));
            bloom += texture2D(uMainSampler,
              outTexCoord + off).rgb * weights[i];
            bloom += texture2D(uMainSampler,
              outTexCoord - off).rgb * weights[i];
          }

          float lum = dot(bloom, vec3(0.2126, 0.7152, 0.0722));
          vec3 extracted = bloom * max(0.0, lum - uThreshold);
          vec3 final = original.rgb + extracted * uStrength;

          // ---- Dithered shadow transition (added) -------------------------
          // A fine 4x4 ordered (Bayer) dither in the shadow / falloff zones,
          // giving the light's dark edge a tactile, printed quality. The Bayer
          // value is computed by SELECTION rather than array indexing: GLSL ES
          // 1.00 forbids dynamic local-array indexing and has no bitwise ops,
          // so a literal bayer[by*4+bx] lookup would fail to compile. Remove
          // this whole block to revert to the original clean bloom.
          vec2 pc = floor(outTexCoord * uResolution);
          float bx = mod(pc.x, 4.0);
          float by = mod(pc.y, 4.0);
          float e0 = 1.0 - step(0.5, abs(bx - 0.0));
          float e1 = 1.0 - step(0.5, abs(bx - 1.0));
          float e2 = 1.0 - step(0.5, abs(bx - 2.0));
          float e3 = 1.0 - step(0.5, abs(bx - 3.0));
          float r0 = 1.0 - step(0.5, abs(by - 0.0));
          float r1 = 1.0 - step(0.5, abs(by - 1.0));
          float r2 = 1.0 - step(0.5, abs(by - 2.0));
          float r3 = 1.0 - step(0.5, abs(by - 3.0));
          float bayerV =
            r0 * (e0 *  0.0 + e1 *  8.0 + e2 *  2.0 + e3 * 10.0) +
            r1 * (e0 * 12.0 + e1 *  4.0 + e2 * 14.0 + e3 *  6.0) +
            r2 * (e0 *  3.0 + e1 * 11.0 + e2 *  1.0 + e3 *  9.0) +
            r3 * (e0 * 15.0 + e1 *  7.0 + e2 * 13.0 + e3 *  5.0);
          float threshold = bayerV / 16.0;

          float luma = dot(final.rgb, vec3(0.2126, 0.7152, 0.0722));
          if (luma < 0.15) {
            // Deep shadow — full dither.
            final.rgb += vec3(threshold * 0.06);
          } else if (luma < 0.30) {
            // Mid-shadow falloff — dither fades out toward the lit zone.
            float edgeMask = (luma - 0.15) / 0.15;
            final.rgb += vec3(threshold * 0.04 * (1.0 - edgeMask));
          }
          // ---- End dither block -------------------------------------------

          gl_FragColor = vec4(final, original.a);
        }
      `,
    });
    this.uStrength = 1.8;
    this.uThreshold = 0.35;
  }

  onPreRender() {
    this.set1f('uStrength', this.uStrength);
    this.set1f('uThreshold', this.uThreshold);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}
