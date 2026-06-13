import Phaser from 'phaser';

// =============================================================================
// TouchControls — on-screen buttons for mobile browser play (itch.io).
//
// Renders ONLY on touch devices (matchMedia '(pointer: coarse)'); on desktop
// the constructor returns immediately and every button state stays inert false,
// so keyboard input is untouched. Procedural geometry only (rounded rects +
// graphics glyphs / small monospace labels), camera-fixed at depth 100.
//
// Layout: LEFT/RIGHT bottom-left · JUMP/DASH bottom-right · ATTACK above the
// right cluster · MUTE small, top-left. Buttons scale to 70% under 480px width
// and re-layout on every scale resize.
//
// Each button exposes { isDown, justDown, justUp } updated by pointerdown /
// pointerup / pointerout. Multitouch works (extra pointers registered), so
// holding LEFT while tapping JUMP is fine. Edge flags (justDown/justUp) live
// for exactly one frame — cleared on the scene's POST_UPDATE — mirroring
// Phaser's JustDown semantics so Player.js can OR them with keyboard state.
//
// FIX: hit rects are standalone scene objects (NOT inside containers) — Phaser
// input coordinate transforms for scrollFactor-0 objects inside containers are
// unreliable. Visuals live in the container; hit rect stays in the scene root
// and is positioned in sync via layout().
//
// Consumers: Player.js ORs movement/jump/dash/attack; scenes poll mute.justDown
// next to their M-key handling. destroy() is self-registered on scene shutdown.
// =============================================================================
const BASE = 64;       // base button size (px)
const PAD = 14;        // screen-edge padding (px)
const FILL = 0x0a1a2a; // button body (semi-transparent over any palette)
const EDGE = 0xffffff; // outline + glyphs

export default class TouchControls {
  constructor(scene) {
    this.scene = scene;
    // Inert state objects always exist so callers can OR without guards.
    this.left = TouchControls.mkState();
    this.right = TouchControls.mkState();
    this.jump = TouchControls.mkState();
    this.dash = TouchControls.mkState();
    this.attack = TouchControls.mkState();
    this.mute = TouchControls.mkState();

    this.enabled = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (!this.enabled) return; // desktop: render nothing, change nothing

    scene.input.addPointer(3); // default is 2 pointers; allow LEFT+JUMP+more

    // Order must match the destructuring in layout(): left, right, jump, dash, attack, mute.
    this.buttons = [
      this.makeButton(this.left,   (g, s) => this.drawArrow(g, s, -1)),
      this.makeButton(this.right,  (g, s) => this.drawArrow(g, s,  1)),
      this.makeButton(this.jump,   null, 'JUMP'),
      this.makeButton(this.dash,   null, 'DASH'),
      this.makeButton(this.attack, null, 'ATK'),
      this.makeButton(this.mute,   null, '♪', 0.6),
    ];
    this.layout();

    this._onResize = () => this.layout();
    scene.scale.on('resize', this._onResize);
    // Cached state array — avoids a fresh allocation on every POST_UPDATE call.
    this._states = [this.left, this.right, this.jump, this.dash, this.attack, this.mute];
    // Edge flags last exactly one frame.
    this._clearEdges = () => {
      this._states.forEach((st) => { st.justDown = false; st.justUp = false; });
    };
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this._clearEdges);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  static mkState() {
    return { isDown: false, justDown: false, justUp: false };
  }

  // One button: container holds visuals only. The hit rect is a STANDALONE
  // scene object (not a container child) so Phaser's input coordinate transform
  // works correctly for scrollFactor-0 screen-fixed elements.
  makeButton(state, drawGlyph, label, sizeMul = 1) {
    const s = BASE * sizeMul;
    const g = this.scene.add.graphics();
    g.fillStyle(FILL, 0.35);
    g.fillRoundedRect(-s / 2, -s / 2, s, s, 12 * sizeMul);
    g.lineStyle(2, EDGE, 0.35);
    g.strokeRoundedRect(-s / 2, -s / 2, s, s, 12 * sizeMul);
    if (drawGlyph) drawGlyph(g, s);

    const parts = [g];
    if (label) {
      parts.push(this.scene.add.text(0, 0, label, {
        fontFamily: 'monospace', fontSize: `${Math.round(14 * sizeMul)}px`, color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0.7));
    }

    // Visuals container — no interactivity on it or its children.
    const container = this.scene.add.container(0, 0, parts)
      .setScrollFactor(0).setDepth(100).setAlpha(0.85);

    // Standalone hit rect — lives in the scene root, NOT inside the container.
    // Phaser reliably resolves input for top-level scrollFactor-0 objects.
    const hit = this.scene.add.rectangle(0, 0, s, s, 0x000000, 0.001)
      .setScrollFactor(0).setDepth(101)
      .setInteractive();

    hit.on('pointerdown', () => {
      state.isDown = true;
      state.justDown = true;
      container.setAlpha(1);
    });
    const release = () => {
      if (state.isDown) state.justUp = true;
      state.isDown = false;
      container.setAlpha(0.85);
    };
    hit.on('pointerup',  release);
    hit.on('pointerout', release); // finger slid off the button

    return { state, container, hit, size: s, sizeMul };
  }

  // Filled triangle arrow for LEFT (-1) / RIGHT (+1).
  drawArrow(g, s, dir) {
    const a = s * 0.18;
    g.fillStyle(EDGE, 0.7);
    g.fillTriangle(dir * a, 0, -dir * a, -a, -dir * a, a);
  }

  // Position the clusters; on narrow screens shrink everything to 70%.
  layout() {
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;
    const f = vw < 480 ? 0.7 : 1;
    const s = BASE * f;
    const pad = PAD * f;
    const gap = 10 * f;
    // Position both the visual container AND the standalone hit rect together.
    const place = (btn, x, y) => {
      btn.container.setPosition(x, y).setScale(f);
      btn.hit.setPosition(x, y).setScale(f);
    };

    const [left, right, jump, dash, attack, mute] = this.buttons;
    place(left,   pad + s / 2,          vh - pad - s / 2);
    place(right,  pad + s * 1.5 + gap,  vh - pad - s / 2);
    place(jump,   vw - pad - s / 2,     vh - pad - s / 2);
    place(dash,   vw - pad - s * 1.5 - gap, vh - pad - s / 2);
    place(attack, vw - pad - s / 2,     vh - pad - s * 1.5 - gap);
    place(mute,   pad + mute.size * f / 2, pad + mute.size * f / 2);
  }

  destroy() {
    if (!this.enabled) return;
    this.enabled = false;
    this.scene.scale.off('resize', this._onResize);
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this._clearEdges);
    this.buttons.forEach((b) => { b.container.destroy(); b.hit.destroy(); });
  }
}
