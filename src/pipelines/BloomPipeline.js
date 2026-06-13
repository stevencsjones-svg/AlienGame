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
