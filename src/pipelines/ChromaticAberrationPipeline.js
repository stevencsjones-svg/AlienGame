import Phaser from 'phaser';

// =============================================================================
// ChromaticAberrationPipeline
// A post-FX pipeline that splits the screen into offset RGB channels for a
// brief glitch/lens-distortion punch on big impacts. Driven by uIntensity
// (0 = no effect); tween it back to 0 for a quick decay.
// =============================================================================
const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uOffset;
uniform float uIntensity;

varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec2 offset = vec2(uOffset * uIntensity, 0.0);

  float r = texture2D(uMainSampler, uv + offset).r;
  float g = texture2D(uMainSampler, uv).g;
  float b = texture2D(uMainSampler, uv - offset).b;
  float a = texture2D(uMainSampler, uv).a;

  gl_FragColor = vec4(r, g, b, a);
}
`;

export default class ChromaticAberrationPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game, name: 'ChromaticAberration', fragShader });

    // Tunable each frame; uIntensity is animated by Game.chromaticHit().
    this.uOffset = 0.008;
    this.uIntensity = 0;
  }

  onPreRender() {
    this.set1f('uOffset', this.uOffset);
    this.set1f('uIntensity', this.uIntensity);
  }
}
