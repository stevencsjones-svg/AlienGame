import Phaser from 'phaser';
import { PLAYER } from '../constants.js';

// =============================================================================
// DiegeticHUD — world-space HUD projected from the player.
// Now just the dash-cooldown ring around the feet (the collectible count lives
// in the player's visor; the floating panel and zone bursts were removed).
// Lives in the Game scene so it gets the bloom/CRT post-FX like the world.
// =============================================================================
export default class DiegeticHUD {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.readyTimer = 0; // dash-ring fade-out countdown
    this.dashWasReady = true; // tracks the cooldown->ready edge for the recharge flash
    this.dashFlashTimer = 0;  // ms remaining in the recharge flash (0 = none)

    // Dash cooldown ring (around the feet).
    this.dashRing = scene.add.graphics().setDepth(6);
  }

  update(time, delta) {
    this.drawDashRing(time, delta);
  }

  drawDashRing(time, delta) {
    const p = this.player;
    const ratio = p.getDashChargeRatio(); // 0 just-dashed .. 1 ready
    const cooling = p.isDashing || p.dashCooldown > 0;
    const ready = !cooling && ratio >= 1;

    // Recharge flash: when the dash transitions from cooling to ready, flash the
    // ring toward a highlight colour (0xffaa00) and back over ~300ms. The ring is
    // redrawn every frame, so we just blend the stroke colour during the window.
    if (ready && !this.dashWasReady) this.dashFlashTimer = 300;
    this.dashWasReady = ready;
    if (this.dashFlashTimer > 0) this.dashFlashTimer -= delta;

    const BASE_COLOR = 0xff6a00;
    let ringColor = BASE_COLOR;
    if (this.dashFlashTimer > 0) {
      // 0 at the edges, 1 at the midpoint -> flashes up to the highlight then back.
      const amt = Math.sin((this.dashFlashTimer / 300) * Math.PI);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(BASE_COLOR),
        Phaser.Display.Color.ValueToColor(0xffaa00),
        100, amt * 100,
      );
      ringColor = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    }

    // Visibility: full while cooling, then a 1s hold + fade once ready.
    let visibility;
    if (cooling) {
      visibility = 1;
      this.readyTimer = 1000;
    } else {
      this.readyTimer -= delta;
      visibility = Phaser.Math.Clamp(this.readyTimer / 300, 0, 1);
    }

    const g = this.dashRing;
    g.clear();
    if (visibility <= 0) return;

    const cx = p.x;
    const cy = p.y + PLAYER.HEIGHT / 2; // feet
    const r = 14;

    if (ready) {
      // Full circle, subtle pulse, 50% at rest.
      const pulse = 0.85 + 0.15 * Math.sin((time / 250) * Math.PI * 2);
      g.lineStyle(1.5, ringColor, 0.5 * pulse * visibility);
      g.strokeCircle(cx, cy, r);
    } else {
      // Depleting arc showing the charged fraction, 80% while cooling.
      g.lineStyle(1.5, ringColor, 0.8 * visibility);
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false);
      g.strokePath();
    }
  }
}
