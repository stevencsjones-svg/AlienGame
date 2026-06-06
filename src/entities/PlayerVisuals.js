import Phaser from 'phaser';
import { PLAYER, COLORS, SHIELD_RING_RADIUS_X, SHIELD_RING_RADIUS_Y } from '../constants.js';
import { PLAYER_SHEET_KEY } from '../scenes/Preload.js';

// =============================================================================
// PlayerVisuals
// Renders the player as an animated sprite (idle/walk/jump/fall) and owns the
// dash-ghost trail, jump bursts, attack blade, shield ring and death fragments.
// The physics body itself stays a 20x28 rectangle (kept invisible in Player).
// Nothing here touches physics — it only reads the body's state.
// =============================================================================

const C_BRIGHT = COLORS.PLAYER;      // 0xc8ffd4 pale alien white (FX colour)
const C_GREEN = COLORS.PLATFORM;     // 0x00ff88 toxic green
const C_CYAN = COLORS.COLLECTIBLE;   // 0x00e5ff cyan
const C_PURPLE = COLORS.ENEMY;       // 0xbf00ff double-jump burst

const C_SHIELD = 0x00cc66;

const MAX_GHOSTS = 6;

// Sprite scale and feet-alignment. Sheet cell is 176x192; the character roughly
// fills 30..170 vertically, so origin is anchored to (0.5, 1.0) and the sprite
// is pushed down by SPRITE_FOOT_PAD past the body's bottom so feet sit on the
// surface instead of poking through.
const SPRITE_SCALE = 0.26;
const SPRITE_FOOT_PAD = 5; // extra px below body bottom to account for cell padding

export default class PlayerVisuals {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.hidden = false;

    // ---- Main animated sprite -------------------------------------------------
    this.sprite = scene.add.sprite(player.x, player.y, PLAYER_SHEET_KEY, 0)
      .setOrigin(0.5, 1)
      .setScale(SPRITE_SCALE)
      .setDepth(5.4);
    this.currentAnim = '';
    this._playAnim('player_idle');

    // ---- Tint-flash overlay for collectible pickup ---------------------------
    // A small text label that briefly rides above the head on pickup.
    this.visorText = scene.add
      .text(player.x, player.y, '', { fontFamily: 'monospace', fontSize: '7px', color: '#050a08', backgroundColor: '#00e5ff' })
      .setOrigin(0.5)
      .setDepth(5.6)
      .setPadding(2, 1, 2, 1)
      .setVisible(false);
    this.countFlashTimer = 0;
    this.flashColor = C_CYAN;

    // ---- Shield ring (shown only while player.hasShield) ----
    this.shieldTime = 0;
    this.shieldRing = scene.add
      .ellipse(player.x, player.y, SHIELD_RING_RADIUS_X * 2, SHIELD_RING_RADIUS_Y * 2)
      .setStrokeStyle(1.5, C_SHIELD, 0.7)
      .setDepth(5.6)
      .setVisible(false);
    this.shieldRing.isFilled = false;
    this.shieldDots = [];
    for (let i = 0; i < 4; i++) {
      this.shieldDots.push(scene.add.rectangle(player.x, player.y, 3, 3, C_SHIELD, 0.7).setDepth(5.7).setVisible(false));
    }
  }

  _playAnim(key) {
    if (this.currentAnim === key) return;
    this.currentAnim = key;
    this.sprite.play(key, true);
  }

  // Burst the shield ring into fragments when it breaks.
  breakShield() {
    this.shieldRing.setVisible(false);
    this.shieldDots.forEach((d) => d.setVisible(false));
    const px = this.player.x;
    const py = this.player.y;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const f = this.scene.add.rectangle(px, py, 3, 3, C_SHIELD, 1).setDepth(5.7);
      this.scene.tweens.add({
        targets: f,
        x: px + Math.cos(ang) * 40,
        y: py + Math.sin(ang) * 40,
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => f.destroy(),
      });
    }
  }

  // Briefly flash a count above the head on pickup.
  flashCount(count, color = C_CYAN, duration = 800) {
    this.visorText.setText(`${count}`);
    this.countFlashTimer = duration;
    this.flashColor = color;
    const hex = '#' + color.toString(16).padStart(6, '0');
    this.visorText.setBackgroundColor(hex);
  }

  // ---- Per-frame update ------------------------------------------------------
  update(time, delta) {
    if (this.hidden) return;

    const p = this.player;
    const dir = p.facing;
    const vx = p.body.velocity.x;
    const vy = p.body.velocity.y;
    const onFloor = p.body.blocked.down;
    const moving = Math.abs(vx) > 5;

    // ---- Anim selection ----
    if (!onFloor) {
      this._playAnim(vy < 0 ? 'player_jump' : 'player_fall');
    } else if (moving) {
      this._playAnim('player_walk');
      // Speed up the walk cycle when sprinting.
      const speedRatio = Phaser.Math.Clamp(Math.abs(vx) / PLAYER.SPEED, 0.5, 1.8);
      this.sprite.anims.timeScale = speedRatio;
    } else {
      this._playAnim('player_idle');
      this.sprite.anims.timeScale = 1;
    }

    // ---- Position & facing ----
    this.sprite.setFlipX(dir === -1);
    this.sprite.setPosition(p.x, p.y + PLAYER.HEIGHT / 2 + SPRITE_FOOT_PAD);

    // ---- Pickup count flash (above head) ----
    if (this.countFlashTimer > 0) {
      this.countFlashTimer -= delta;
      this.visorText.setVisible(true).setPosition(p.x, p.y - 22);
      if (this.countFlashTimer <= 0) {
        this.visorText.setVisible(false);
      }
    }

    // ---- Shield ring (only while shielded) ----
    const shielded = !!this.player.hasShield;
    this.shieldRing.setVisible(shielded);
    this.shieldDots.forEach((d) => d.setVisible(shielded));
    if (shielded) {
      this.shieldTime += delta;
      this.shieldRing.setPosition(p.x, p.y);
      this.shieldRing.angle = (this.shieldTime / 3000) * 360;
      const ringOp = 0.675 + 0.175 * Math.sin((this.shieldTime / 1000) * Math.PI * 2);
      this.shieldRing.setStrokeStyle(1.5, C_SHIELD, ringOp);
      const a = (this.shieldTime / 3000) * Math.PI * 2;
      for (let i = 0; i < 4; i++) {
        const da = a + (i * Math.PI) / 2;
        this.shieldDots[i].setPosition(
          p.x + Math.cos(da) * SHIELD_RING_RADIUS_X,
          p.y + Math.sin(da) * SHIELD_RING_RADIUS_Y,
        );
      }
    }

    // ---- Invincibility blink (after a shield break) ----
    const invincible = this.player.invincibleUntil > time;
    const blink = invincible ? (Math.floor(time / 80) % 2 === 0) : true;
    this.sprite.setVisible(blink);
  }

  // ---- Dash ghost trail ------------------------------------------------------
  // Emits a fading tinted snapshot of the current sprite frame.
  spawnGhost() {
    const src = this.sprite;
    const ghost = this.scene.add
      .sprite(src.x, src.y, src.texture.key, src.frame.name)
      .setOrigin(src.originX, src.originY)
      .setScale(src.scaleX, src.scaleY)
      .setFlipX(src.flipX)
      .setAlpha(0.6)
      .setTint(C_BRIGHT)
      .setDepth(4);

    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 200,
      onComplete: () => ghost.destroy(),
    });
  }

  // ---- Jump burst ------------------------------------------------------------
  spawnJumpBurst(isDouble) {
    const px = this.player.x;
    const py = this.player.y + PLAYER.HEIGHT / 2;
    const count = isDouble ? 6 : 4;
    const size = isDouble ? 4 : 3;
    const colour = isDouble ? C_PURPLE : C_GREEN;

    for (let i = 0; i < count; i++) {
      const r = this.scene.add.rectangle(px, py, size, size, colour, 0.7).setDepth(4.5);
      const spread = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0;
      this.scene.tweens.add({
        targets: r,
        x: px + spread * 28,
        y: py + Phaser.Math.Between(16, 34),
        alpha: 0,
        duration: 150,
        ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }

  // ---- Attack (energy slash arc) ---------------------------------------------
  // A lightsabre-style sweep: a purple glow blade that arcs from upper-forward to
  // lower-forward over the attack window, with a bright white tip. Animated into
  // a single Graphics object that tracks the player, then destroyed.
  spawnAttack(facing) {
    const attackDir = facing; // 1 = right, -1 = left
    const slashLength = 28;
    const slashStartAngle = facing === 1 ? -0.8 : Math.PI + 0.8;
    const slashEndAngle = facing === 1 ? 0.4 : Math.PI - 0.4;

    const scene = this.scene;
    const player = this.player;
    const gfx = scene.add.graphics().setDepth(5.6);

    const draw = (progress) => {
      if (!gfx.scene) return;
      const originX = player.x + attackDir * 8;
      const originY = player.y + 2; // chest height (body origin is centred)
      const angle = Phaser.Math.Linear(slashStartAngle, slashEndAngle, progress);
      const ex = originX + Math.cos(angle) * slashLength * attackDir;
      const ey = originY + Math.sin(angle) * slashLength;

      gfx.clear();
      // Trail — the previous (start) slash position, fading, early in the swing.
      if (progress < 0.7) {
        const sx = originX + Math.cos(slashStartAngle) * slashLength * attackDir;
        const sy = originY + Math.sin(slashStartAngle) * slashLength;
        gfx.lineStyle(4, 0xcc00ff, 0.12);
        gfx.beginPath(); gfx.moveTo(originX, originY); gfx.lineTo(sx, sy); gfx.strokePath();
      }
      // Outer glow — wide, low opacity.
      gfx.lineStyle(8, 0xcc00ff, 0.25);
      gfx.beginPath(); gfx.moveTo(originX, originY); gfx.lineTo(ex, ey); gfx.strokePath();
      // Core — narrow, bright.
      gfx.lineStyle(2, 0xee88ff, 0.95);
      gfx.beginPath(); gfx.moveTo(originX, originY); gfx.lineTo(ex, ey); gfx.strokePath();
      // Bright tip.
      gfx.fillStyle(0xffffff, 0.9);
      gfx.fillRect(ex - 2, ey - 2, 4, 4);
    };

    draw(0);
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: PLAYER.ATTACK_DURATION,
      onUpdate: (tw) => draw(tw.getValue()),
      onComplete: () => gfx.destroy(),
    });
  }

  // ---- Death fragments -------------------------------------------------------
  explode() {
    this.hidden = true;
    this.sprite.setVisible(false);
    this.visorText.setVisible(false);
    this.countFlashTimer = 0;

    const px = this.player.x;
    const py = this.player.y;
    const palette = [C_BRIGHT, C_GREEN];

    for (let i = 0; i < 8; i++) {
      const size = Phaser.Math.Between(2, 6);
      const frag = this.scene.add
        .rectangle(
          px + Phaser.Math.Between(-6, 6),
          py + Phaser.Math.Between(-10, 10),
          size, size, palette[i % 2], 1
        )
        .setDepth(5.5);

      const angle = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const speed = Phaser.Math.Between(30, 70);
      this.scene.tweens.add({
        targets: frag,
        x: frag.x + Math.cos(angle) * speed,
        y: frag.y + Math.sin(angle) * speed,
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => frag.destroy(),
      });
    }
  }

  show() {
    this.hidden = false;
    this.sprite.setVisible(true);
  }
}
