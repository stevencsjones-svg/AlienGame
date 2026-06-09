import Phaser from 'phaser';
import SFX from '../audio/SFX.js';
import {
  PROXIMITY_MINE_DETECT_RADIUS,
  PROXIMITY_MINE_ARM_MS,
  PROXIMITY_MINE_BLAST_RADIUS,
  PROXIMITY_MINE_RESPAWN_MS,
} from '../constants.js';

// =============================================================================
// ProximityMine — a hovering octagonal mine. Floats/bobs, detects the player in
// a radius, arms with a rising warning, then detonates (blast damage in radius)
// and respawns. State: IDLE -> ARMING -> DETONATING -> DEAD -> RESPAWN -> IDLE.
//
// Pure Graphics + distance logic (no Arcade body). Blast damage is routed
// through the scene's onPlayerHit() — the same path enemy collisions use, so it
// respects shield / i-frames / assist invincibility.
// =============================================================================
const CORE_FILL = 0x102040;
const NEON = 0x22eeff;
const R = 20; // octagon radius

export default class ProximityMine {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;             // anchor; bob is added into the draw y (this.by)
    this.by = y;
    this.gfx = scene.add.graphics().setDepth(4);
    this.state = 'IDLE';
    this.timer = 0;
    this.angle = 0;
    this.ringAngle = 0;
    this.spike = 8;         // spike length (extends while arming)
    this.alpha = 1;
    this.boomT = 0;
    this.respawnT = 0;
    this.phase = (x * 13 + y * 7) % 3000; // desync the bob
  }

  _distToPlayer() {
    const p = this.scene.player;
    return p ? Phaser.Math.Distance.Between(this.x, this.by, p.x, p.y) : Infinity;
  }

  startArm() {
    this.state = 'ARMING';
    this.timer = PROXIMITY_MINE_ARM_MS;
    this.spike = 12; // extend
    SFX.mineArm();
  }

  detonate() {
    this.state = 'DETONATING';
    this.boomT = 0;
    SFX.mineBoom();
    // Blast damage — routed through the scene's standard hit path.
    if (this._distToPlayer() < PROXIMITY_MINE_BLAST_RADIUS && this.scene.onPlayerHit) {
      this.scene.onPlayerHit();
    }
    // Particle burst (16 shards).
    const cols = [0xff6600, 0xffaa00, 0xffff00, 0xffffff];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const spd = Phaser.Math.Between(200, 400) * 0.5;
      const pt = this.scene.add.rectangle(this.x, this.by, 4, 4, cols[i % 4], 1).setDepth(5);
      this.scene.tweens.add({
        targets: pt, x: this.x + Math.cos(a) * spd, y: this.by + Math.sin(a) * spd,
        scaleX: 0, scaleY: 0, alpha: 0, duration: 500, onComplete: () => pt.destroy(),
      });
    }
  }

  update(delta) {
    const g = this.gfx;
    g.clear();
    const f = delta / 16.67;
    this.angle += 0.4 * f * (Math.PI / 180);
    this.ringAngle -= 0.3 * f * (Math.PI / 180);
    this.by = this.y + 12 * Math.sin((this.scene.time.now + this.phase) / (3000 / (2 * Math.PI)));

    switch (this.state) {
      case 'IDLE':
        if (this._distToPlayer() < PROXIMITY_MINE_DETECT_RADIUS) this.startArm();
        this._drawMine(g, NEON, 0.1, NEON, 1);
        break;
      case 'ARMING': {
        this.timer -= delta;
        const flash = (Math.floor(this.scene.time.now / 62) % 2) === 0 ? 0xffaa00 : 0xff4444; // ~8Hz
        this._drawMine(g, 0xffaa00, 1.0, flash, 1);
        if (this.timer <= 0) this.detonate();
        break;
      }
      case 'DETONATING': {
        this.boomT += delta;
        const t1 = Phaser.Math.Clamp(this.boomT / 300, 0, 1);
        const t2 = Phaser.Math.Clamp(this.boomT / 400, 0, 1);
        g.fillStyle(0xff6600, 0.6 * (1 - t1)); g.fillCircle(this.x, this.by, 180 * t1);
        g.lineStyle(3, 0xffff00, 1 - t1); g.strokeCircle(this.x, this.by, 180 * t1);
        g.lineStyle(2, 0xff4444, 1 - t2); g.strokeCircle(this.x, this.by, 220 * t2);
        if (this.boomT >= 400) { this.state = 'DEAD'; this.timer = PROXIMITY_MINE_RESPAWN_MS; }
        break;
      }
      case 'DEAD':
        this.timer -= delta;
        if (this.timer <= 0) { this.state = 'RESPAWN'; this.respawnT = 0; this.spike = 8; }
        break; // nothing drawn
      case 'RESPAWN':
        this.respawnT += delta;
        this.alpha = Phaser.Math.Clamp(this.respawnT / 600, 0, 1);
        this._drawMine(g, NEON, 0.1 * this.alpha, NEON, this.alpha);
        if (this.respawnT >= 600) { this.state = 'IDLE'; this.alpha = 1; }
        break;
      default:
        break;
    }
  }

  _drawMine(g, ringColor, ringAlpha, strokeColor, alpha) {
    const cx = this.x; const cy = this.by;

    // Detection ring — rotating dashes.
    g.lineStyle(1.5, ringColor, ringAlpha);
    const RR = PROXIMITY_MINE_DETECT_RADIUS;
    for (let i = 0; i < 16; i++) {
      const a0 = this.ringAngle + (i / 16) * Math.PI * 2;
      const a1 = a0 + 0.18;
      g.beginPath();
      g.moveTo(cx + Math.cos(a0) * RR, cy + Math.sin(a0) * RR);
      g.lineTo(cx + Math.cos(a1) * RR, cy + Math.sin(a1) * RR);
      g.strokePath();
    }

    // Octagon core.
    g.fillStyle(CORE_FILL, 0.9 * alpha);
    g.lineStyle(2, strokeColor, alpha);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = this.angle + (i / 8) * Math.PI * 2;
      const px = cx + Math.cos(a) * R; const py = cy + Math.sin(a) * R;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fillPath(); g.strokePath();

    // Four spikes at the rotated cardinal points.
    g.lineStyle(2, strokeColor, alpha);
    for (let i = 0; i < 4; i++) {
      const a = this.angle + (i / 4) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.lineTo(cx + Math.cos(a) * (R + this.spike), cy + Math.sin(a) * (R + this.spike));
      g.strokePath();
    }
  }
}
