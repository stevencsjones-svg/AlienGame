import Phaser from 'phaser';
import { buildPlatformVisual } from './platformVisual.js';
import {
  FALLING_PLATFORM_SHAKE_MS,
  FALLING_PLATFORM_FALL_ALPHA_MS,
  FALLING_PLATFORM_RESET_DELAY_MS,
} from '../constants.js';

// =============================================================================
// FallingPlatform — drops out from under the player shortly after they land,
// then resets. State: IDLE -> SHAKING -> FALLING -> GONE -> RESETTING -> IDLE.
//
// Implementation note (deviation from the brief's "set body to dynamic"): the
// body stays STATIC and is repositioned manually each frame, matching this
// codebase's MovingPlatform pattern. That keeps it compatible with the scene's
// static-platform colliders and avoids re-registering a dynamic body mid-run.
// It exposes deltaX/deltaY each frame so Level3's existing carry logic moves the
// player with it (shake wobble, and downward as it drops if they don't jump off).
// =============================================================================
const FALL_GRAV = 1600; // px/s^2

export default class FallingPlatform {
  constructor(scene, x, y, width, palette) {
    this.scene = scene;
    this.width = width;

    const { body, layers } = buildPlatformVisual(scene, x, y, width, 14, palette, true);
    scene.physics.add.existing(body, true); // static body
    this.bodyRect = body;
    this.body = body.body;
    this.layers = layers;
    this.edge = layers[2];   // bright top edge — tinted during the shake
    this.idleColor = palette.PLATFORM; // resting edge colour (matches the platforms)
    this.cx0 = body.x;       // origin centre (for shake offset + reset)
    this.cy0 = body.y;

    this.state = 'IDLE';
    this.timer = 0;
    this.shakeT = 0;
    this.fallVel = 0;
    this.fallElapsed = 0;
    this.deltaX = 0;
    this.deltaY = 0;
  }

  // Move every layer (the body rect is one of them) and resync the static body.
  _moveTo(nx, ny) {
    const dx = nx - this.bodyRect.x;
    const dy = ny - this.bodyRect.y;
    for (const l of this.layers) l.setPosition(l.x + dx, l.y + dy);
    this.body.updateFromGameObject();
    this.deltaX = dx;
    this.deltaY = dy;
  }

  _setAlpha(a) {
    for (const l of this.layers) l.setAlpha(a);
  }

  _playerStandingOn() {
    const p = this.scene.player;
    if (!p || !p.body.blocked.down) return false;
    const half = this.width / 2;
    return p.x >= this.bodyRect.x - half - 4 && p.x <= this.bodyRect.x + half + 4
      && Math.abs(p.body.bottom - this.body.top) < 8;
  }

  startShake() {
    this.state = 'SHAKING';
    this.timer = FALLING_PLATFORM_SHAKE_MS;
    this.shakeT = 0;
    // Spark burst (4-6 red sparks).
    for (let i = 0; i < 5; i++) {
      const s = this.scene.add
        .rectangle(this.bodyRect.x + Phaser.Math.Between(-this.width / 2, this.width / 2), this.cy0, 3, 3, 0xff4444, 1)
        .setDepth(3);
      this.scene.tweens.add({
        targets: s, y: this.cy0 - Phaser.Math.Between(10, 24), alpha: 0, duration: 300,
        onComplete: () => s.destroy(),
      });
    }
  }

  update(delta) {
    if (this.state === 'IDLE') {
      this.deltaX = 0; this.deltaY = 0;
      if (this._playerStandingOn()) this.startShake();
      return;
    }

    if (this.state === 'SHAKING') {
      this.timer -= delta;
      this.shakeT += delta;
      const prog = Phaser.Math.Clamp(1 - this.timer / FALLING_PLATFORM_SHAKE_MS, 0, 1);
      // Rapid x oscillation ±4px at ~20Hz.
      const off = 4 * Math.sin((this.shakeT * 2 * Math.PI * 20) / 1000);
      this._moveTo(this.cx0 + off, this.cy0);
      // Tint blue -> amber -> red across the shake.
      const from = prog < 0.5 ? this.idleColor : 0xffaa00;
      const to = prog < 0.5 ? 0xffaa00 : 0xff4444;
      const seg = prog < 0.5 ? prog / 0.5 : (prog - 0.5) / 0.5;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(from), Phaser.Display.Color.IntegerToColor(to), 100, seg * 100,
      );
      this.edge.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      if (this.timer <= 0) { this.state = 'FALLING'; this.fallVel = 0; this.fallElapsed = 0; }
      return;
    }

    if (this.state === 'FALLING') {
      this.fallVel += FALL_GRAV * (delta / 1000);
      this._moveTo(this.cx0, this.bodyRect.y + this.fallVel * (delta / 1000));
      this.fallElapsed += delta;
      this._setAlpha(Phaser.Math.Clamp(1 - this.fallElapsed / FALLING_PLATFORM_FALL_ALPHA_MS, 0, 1));
      if (this.bodyRect.y > this.cy0 + 1200) { // fully off-screen
        this.state = 'GONE';
        this.timer = FALLING_PLATFORM_RESET_DELAY_MS;
        this.body.enable = false;
        this._setAlpha(0);
        this.deltaX = 0; this.deltaY = 0;
      }
      return;
    }

    if (this.state === 'GONE') {
      this.timer -= delta;
      if (this.timer <= 0) this.reset();
      return;
    }
    // RESETTING: the fade-in tween (started in reset) drives the return to IDLE.
  }

  reset() {
    this.state = 'RESETTING';
    this._moveTo(this.cx0, this.cy0);          // snap back to origin
    this.deltaX = 0; this.deltaY = 0;
    this.edge.setFillStyle(this.idleColor, 1); // back to the platform's resting colour
    this.body.enable = true;
    this.scene.tweens.add({
      targets: this.layers, alpha: 1, duration: 400,
      onComplete: () => { this.state = 'IDLE'; },
    });
  }
}
