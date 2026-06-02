import Phaser from 'phaser';
import { ENEMY, COLORS } from '../constants.js';

// =============================================================================
// GroundDrone
// Patrols a platform, turning at edges and walls. The physics body is a
// 28x18 rectangle kept invisible; the visible drone is a small multi-part
// figure (shell + body + two feet + an eye) drawn in a follower Container.
// Behaviour / physics are unchanged.
// =============================================================================
const W = 28;
const H = 18;
const PURPLE = COLORS.ENEMY;       // 0xbf00ff
const CYAN = COLORS.COLLECTIBLE;   // 0x00e5ff

export default class GroundDrone extends Phaser.GameObjects.Rectangle {
  constructor(scene, x, y) {
    super(scene, x, y, W, H, PURPLE, 0.75);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(2);
    this.setAlpha(0); // physics body stays intact but invisible

    this.body.setCollideWorldBounds(false);

    this.direction = 1; // 1 = right, -1 = left
    this.prevDirection = 1;
    this.body.setVelocityX(ENEMY.DRONE_SPEED * this.direction);

    this.footPhase = 0;
    this.swayTime = 0;

    // Proximity aggro: speeds up + brightens its eye when the player is near.
    this.isAggro = false;
    this.aggroTimer = 0;
    this.eyeBaseColor = CYAN;

    // ---- Visual parts (relative to the body centre) ----
    this.outerShell = scene.add.rectangle(0, 0, 30, 16, PURPLE, 0.15);
    this.footL = scene.add.rectangle(-8, 6, 5, 4, PURPLE, 0.6);
    this.footR = scene.add.rectangle(8, 6, 5, 4, PURPLE, 0.6);
    this.mainBody = scene.add.rectangle(0, 0, 28, 14, PURPLE, 0.8);
    this.eye = scene.add.rectangle(1, -2, 8, 3, CYAN, 1);
    this.flash = scene.add.rectangle(0, 0, 30, 16, 0xffffff, 0); // turn flash

    this.gfx = scene.add
      .container(x, y, [this.outerShell, this.footL, this.footR, this.mainBody, this.eye, this.flash])
      .setDepth(2);
  }

  update(time, delta) {
    this.prevDirection = this.direction;

    // ---- Proximity aggro ----
    const player = this.scene.player;
    if (player) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (dist < 300) {
        this.aggroTimer = 1500; // refresh while in range (so it doesn't flicker)
        if (!this.isAggro) { this.isAggro = true; this.flashEye(0xffffff); }
      }
    }
    if (this.isAggro) {
      this.aggroTimer -= delta;
      if (this.aggroTimer <= 0) { this.isAggro = false; this.flashEye(this.eyeBaseColor); }
    }

    // ---- Behaviour (UNCHANGED) ----
    // Only re-evaluate direction while grounded so we don't jitter mid-fall.
    if (this.body.blocked.down) {
      if (this.body.blocked.left) {
        this.direction = 1;
      } else if (this.body.blocked.right) {
        this.direction = -1;
      } else if (!this.isGroundAhead()) {
        this.direction *= -1;
      }
    }
    this.body.setVelocityX(ENEMY.DRONE_SPEED * this.direction * (this.isAggro ? 1.2 : 1));

    // ---- Turn flash + "REROUTING" data readout on direction flip ----
    if (this.direction !== this.prevDirection) {
      this.flash.setAlpha(0.6);
      this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 80 });
      this.showReadout();
    }

    // ---- Visuals ----
    // Subtle side-to-side sway (visual only; physics body unaffected).
    this.swayTime += delta;
    const sway = Math.sin((this.swayTime / 2000) * Math.PI * 2);
    this.gfx.setPosition(this.x + sway, this.y);

    // Feet alternate up/down (2px over 300ms); planted feet rest on the surface
    // (body bottom = centre + H/2), never sinking below it.
    this.footPhase += delta;
    const ph = (this.footPhase / 300) * Math.PI * 2;
    this.footL.y = 6 - Math.sin(ph);
    this.footR.y = 6 - Math.sin(ph + Math.PI);

    // Eye looks the way the drone is travelling (1px shift).
    this.eye.x = this.direction;
  }

  // Tween the eye fill from its current colour to `color` over 150ms. Guarded
  // so a tween in flight can't touch the eye after the drone is destroyed.
  flashEye(color) {
    if (this._eyeTween) this._eyeTween.stop();
    const from = Phaser.Display.Color.ValueToColor(this.eye.fillColor);
    const to = Phaser.Display.Color.ValueToColor(color);
    this._eyeTween = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: 150,
      onUpdate: (tw) => {
        if (this.dead || !this.eye.scene) return;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tw.getValue() * 100);
        this.eye.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  }

  // "REROUTING" glitch readout above the drone (fade in 80, hold 400, out 150).
  // Capture the scene up front: the drone can be destroyed (killed) before the
  // delayed fade-out fires, which nulls this.scene — the readout text is
  // scene-owned, so it still fades and cleans itself up.
  showReadout() {
    const scene = this.scene;
    const txt = scene.add
      .text(this.x, this.y - H / 2 - 8, 'REROUTING', {
        fontFamily: 'monospace', fontSize: '7px', color: '#bf00ff',
      })
      .setOrigin(0.5).setDepth(6).setAlpha(0);
    scene.tweens.add({ targets: txt, alpha: 1, duration: 80 });
    scene.time.delayedCall(480, () => {
      scene.tweens.add({ targets: txt, alpha: 0, duration: 150, onComplete: () => txt.destroy() });
    });
  }

  // Sample a point just past the front foot and check whether any platform
  // body sits underneath it.
  isGroundAhead() {
    const aheadX = this.x + this.direction * (W / 2 + 4);
    const footY = this.body.y + this.body.height + 4;

    const platforms = this.scene.platforms;
    for (let i = 0; i < platforms.length; i++) {
      const b = platforms[i].body;
      if (
        aheadX >= b.x &&
        aheadX <= b.x + b.width &&
        footY >= b.y &&
        footY <= b.y + b.height
      ) {
        return true;
      }
    }
    return false;
  }

  // Killed by the player's attack: white flash, particle burst, shake, destroy.
  die() {
    if (this.dead) return;
    this.dead = true;
    this.active = false;               // manual update loops skip it (see scene)
    if (this.body) this.body.enable = false;
    this.setFillStyle(0xffffff);
    this.setAlpha(1);
    this.setDepth(6);
    const dx = this.x;
    const dy = this.y;
    // Capture the scene: the 80ms timer can outlive a scene shutdown, which
    // nulls this.scene — the death FX are scene-owned, so use the captured ref.
    const scene = this.scene;
    scene.time.delayedCall(80, () => {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const particle = scene.add.rectangle(dx, dy, 4, 4, 0xbf00ff).setDepth(6);
        scene.tweens.add({
          targets: particle,
          x: dx + Math.cos(angle) * 40,
          y: dy + Math.sin(angle) * 40,
          alpha: 0,
          duration: 300,
          onComplete: () => particle.destroy(),
        });
      }
      scene.cameras.main.shake(60, 0.004);
      // AUDIO: enemy death placeholder
      if (this.gfx) this.gfx.destroy();
      this.destroy();
    });
  }
}
