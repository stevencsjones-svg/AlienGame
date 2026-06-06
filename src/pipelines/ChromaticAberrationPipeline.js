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

  // Clamp the offset samples to valid UV bounds so the channel split can't read
  // off the edge of the framebuffer (which showed as a coloured line/streak at
  // the screen edge on big hits).
  vec2 uvR = clamp(uv + offset, 0.001, 0.999);
  vec2 uvB = clamp(uv - offset, 0.001, 0.999);

  float r = texture2D(uMainSampler, uvR).r;
  float g = texture2D(uMainSampler, uv).g;
  float b = texture2D(uMainSampler, uvB).b;
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
