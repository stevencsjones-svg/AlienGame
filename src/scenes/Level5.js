import Phaser from 'phaser';
import {
  ENEMY, DEV_MODE, ASSIST_MODE, LEVEL_PALETTES, HIDDEN_COLLECTIBLE_COUNT,
  LEVEL5_WORLD, MUSIC_VOLUME,
} from '../constants.js';
import AssistMode from '../utils/AssistMode.js';
import Player from '../entities/Player.js';
import GroundDrone from '../entities/GroundDrone.js';
import HoverSentinel from '../entities/HoverSentinel.js';
import Seeker from '../entities/Seeker.js';
import ExitPortal from '../entities/ExitPortal.js';
import ShieldPickup from '../entities/ShieldPickup.js';
import HoloSweepPlatform from '../entities/HoloSweepPlatform.js';
import CameraController from '../camera/CameraController.js';
import DiegeticHUD from '../ui/DiegeticHUD.js';
import { buildPlatformVisual } from '../entities/platformVisual.js';
import { createCollectible, spawnPickupShards } from '../entities/collectible.js';
import { makeGlassPanel } from '../ui/glassPanel.js';
import ChromaticAberrationPipeline from '../pipelines/ChromaticAberrationPipeline.js';
import SFX from '../audio/SFX.js';
import TouchControls from '../ui/TouchControls.js';
import Progression from '../utils/Progression.js';
import GlassTierBackground from '../background/GlassTierBackground.js';
import {
  W, H, FLOOR_Y, DEATH_Y, PORTAL, SHIELD, CHECKPOINT,
  REQUIRED_PATH, EXTRAS, DRONES, SENTINELS, SEEKERS,
  COLLECTIBLES, TOTAL_COLLECTIBLES,
  HOLO_CONFIGS, verifyPath, PHYS,
} from './level5Layout.js';

// =============================================================================
// Level 5 — The Glass Tier. Mixed-direction level: horizontal lobbies + vertical
// shafts, tied together by HoloSweepPlatform sequences (solid only while a
// security sweep beam overlaps them). Five sections: Glass Lobby → Tower 1 →
// Mid-tier Offices → Tower 2 → Executive Floor + portal.
//
// Violet palette (#6633ff). All colours from LEVEL_PALETTES[5]; no inline hex.
// =============================================================================
const PAL  = LEVEL_PALETTES[5];
const hex  = (n) => `#${n.toString(16).padStart(6, '0')}`;

// Ordered holo config keys matching the order holo nodes appear in REQUIRED_PATH.
const HOLO_CONFIG_ORDER = [
  'S2_INTRO',
  'S2_MID_0', 'S2_MID_1', 'S2_MID_2',
  'S2_HA', 'S2_HB',
  'S2_TOP_0', 'S2_TOP_1', 'S2_TOP_2', 'S2_TOP_3',
  'S3_H0', 'S3_H1', 'S3_H2',
  'S4_H0', 'S4_H1', 'S4_H2', 'S4_H3', 'S4_H4', 'S4_H5', 'S4_H6',
  'S5_H0', 'S5_H1', 'S5_H2',
];

let level5TitleShown = false;

export default class Level5 extends Phaser.Scene {
  constructor() { super('Level5'); }

  preload() {
    // Music is optional — guard so a missing file never breaks the level.
    if (!this.cache.audio.exists('level5_music')) {
      // File not yet available; level runs silently.
    }
  }

  create() {
    // Gate: requires Level 4 complete (bypassed in DEV_MODE).
    if (!Progression.hasCompleted(4) && !DEV_MODE) {
      this.scene.start('MainMenu');
      return;
    }

    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.world.setBoundsCollision(true, true, true, false);
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(PAL.bgTint);

    // ---- State ----
    this.platforms      = [];
    this.holoPlats      = [];
    this.holoBodies     = [];
    this.collectibles   = [];
    this.drones         = [];
    this.sentinels      = [];
    this.seekers        = [];
    this.collectedCount = 0;
    this.secretsFound   = 0;
    this.totalCollectibles = TOTAL_COLLECTIBLES;
    this.levelDone      = false;
    this.isPaused       = false;
    this.pauseMode      = 'main';
    this.pauseSelection = 0;
    this.assistSelection = 0;
    this.respawnX       = 80;
    this.respawnY       = FLOOR_Y - 50;
    this.checkpointActive = false;

    // ---- Post-FX (bloom makes the violet neon glow) ----
    if (this.renderer && this.renderer.type === Phaser.WEBGL) {
      this.cameras.main.setPostPipeline('BloomPipeline');
      this.cameras.main.setPostPipeline(ChromaticAberrationPipeline);
      this.cameras.main.setPostPipeline('CRTPipeline');
      this.cameras.main.setPostPipeline('ColorGradePipeline');
      // Near-black bg + saturated violet neon needs stronger bloom than L1-4.
      let bloom = this.cameras.main.getPostPipeline('BloomPipeline');
      if (Array.isArray(bloom)) bloom = bloom[0];
      if (bloom) { bloom.uStrength = 1.8; bloom.uThreshold = 0.25; }
    }

    // ---- DEV reachability check ----
    if (DEV_MODE) {
      const v = verifyPath();
      if (v.length) console.warn('[Level5] reachability violations:', v);
      else console.log(`[Level5] reachability OK (jump=${Math.round(PHYS.maxJumpHeight)} dbl=${Math.round(PHYS.maxDoubleJumpHeight)} gapRun=${Math.round(PHYS.maxGapRun)} gapDash=${Math.round(PHYS.maxGapDash)})`);
    }

    // ---- Background ----
    new GlassTierBackground(this, W, H);

    // ---- Geometry: static platforms ----
    let holoIndex = 0;
    REQUIRED_PATH.forEach((p) => {
      if (p.holo) {
        const cfgKey = HOLO_CONFIG_ORDER[holoIndex] || 'S2_INTRO';
        const cfg    = HOLO_CONFIGS[cfgKey];
        holoIndex++;
        const hp = new HoloSweepPlatform(this, p.x, p.y, p.w, cfg);
        this.holoPlats.push(hp);
        this.holoBodies.push(hp.bodyRect);
      } else {
        this._addPlatform(p.x, p.y, p.w, p.h);
      }
    });
    EXTRAS.forEach(([cx, ty, w, h]) => this._addPlatform(cx, ty, w, h));

    // ---- Player ----
    this.player = new Player(this, this.respawnX, this.respawnY);
    this.player.canDoubleJump = true;
    this.player.canDash       = true;
    this.player.hasAttack     = true;
    this.touchControls = new TouchControls(this);

    // ---- Checkpoint ----
    this._createCheckpoint(CHECKPOINT.x, CHECKPOINT.y);

    // ---- Enemies ----
    DRONES.forEach(([x, y])   => this.drones.push(new GroundDrone(this, x, y)));
    SENTINELS.forEach(([x, y]) => this.sentinels.push(new HoverSentinel(this, x, y)));
    SEEKERS.forEach(([x, y])   => this.seekers.push(
      new Seeker(this, x, y, this.player, { speed: ENEMY.SEEKER_SPEED, aggro: 300 }),
    ));

    // ---- Collectibles ----
    COLLECTIBLES.forEach(([x, y], i) => {
      const hidden = i >= TOTAL_COLLECTIBLES - 5;
      this.collectibles.push(createCollectible(this, x, y, PAL.platform, hidden));
    });

    // ---- Shield pickup (S4 mid-point) ----
    this.shieldPickup = new ShieldPickup(this, SHIELD.x, SHIELD.y);

    // ---- Exit portal ----
    this.portal = new ExitPortal(this, PORTAL.x, PORTAL.y);
    this.portal.glow.setPosition(PORTAL.x, PORTAL.y + 60);

    // ---- Colliders ----
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.holoBodies);
    this.physics.add.collider(this.drones, this.platforms);
    this.physics.add.overlap(this.player, this.drones,       this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.sentinels,    this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.seekers,      this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.collectibles, this.onCollect,   null, this);
    this.physics.add.overlap(this.player, this.shieldPickup.trigger, this.onShield, null, this);
    this.physics.add.overlap(this.player, this.portal.trigger, this.onLevelComplete, null, this);
    this.physics.add.overlap(this.player, this.checkpoint,   this.onCheckpoint, null, this);

    this.enemies = this.add.group([...this.drones, ...this.sentinels, ...this.seekers]);
    this.physics.add.overlap(
      this.player.attackHitbox, this.enemies, (hb, enemy) => enemy.die(),
    );

    // ---- Input ----
    this.mKey = this.input.keyboard.addKey('M');
    this.pauseKeys = this.input.keyboard.addKeys({
      esc: 'ESC', up: 'UP', down: 'DOWN', w: 'W', s: 'S', space: 'SPACE', enter: 'ENTER',
    });

    // ---- HUD + camera ----
    this.diegeticHUD = new DiegeticHUD(this, this.player);
    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    this.cameraController = new CameraController(this, this.cameras.main, 'horizontal');

    // ---- Music (optional — graceful no-op if file absent) ----
    this.bgMusic = null;
    if (this.cache.audio.exists('level5_music')) {
      this.bgMusic = this.sound.add('level5_music', { loop: true, volume: MUSIC_VOLUME });
      if (SFX.enabled) this.bgMusic.play();
    }

    // ---- Opening title card ----
    if (!DEV_MODE && !level5TitleShown) {
      level5TitleShown = true;
      this._showTitleCard(
        'TIER 5 — THE GLASS TIER',
        'Where power is managed, not held.',
        PAL.platform,
      );
    }
  }

  // ---- Platform builder (static) ----
  _addPlatform(cx, topY, w, h) {
    const { body } = buildPlatformVisual(this, cx, topY, w, h, {
      PLATFORM: PAL.platform, PLATFORM_DIM: PAL.platformDim,
    }, false);
    this.physics.add.existing(body, true);
    this.platforms.push(body);
  }

  // ---- Checkpoint ----
  _createCheckpoint(x, y) {
    this.checkpointX = x;
    this.checkpoint = this.add.rectangle(x, y, 20, 28, PAL.platform, 0.35)
      .setDepth(1);
    this.physics.add.existing(this.checkpoint, true);
    this.add.text(x, y - 26, '//SAVE', {
      fontFamily: 'monospace', fontSize: '7px', color: hex(PAL.platform),
    }).setOrigin(0.5).setAlpha(0.5).setDepth(1);
  }

  onCheckpoint() {
    if (this.checkpointActive) return;
    this.checkpointActive = true;
    SFX.checkpoint();
    this.checkpoint.setFillStyle(PAL.platform, 1);
    this.respawnX = CHECKPOINT.respawnX;
    this.respawnY = CHECKPOINT.respawnY;
    for (let i = 0; i < 6; i++) {
      const px = this.checkpointX + (i - 2.5) * 4;
      const p  = this.add.rectangle(px, CHECKPOINT.y + 20, 3, 3, PAL.platform, 1).setDepth(2);
      this.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(30, 55), alpha: 0, duration: 400, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
    }
    this.cameras.main.zoomTo(1.05, 400, 'Sine.easeOut', false, (cam, prog) => { if (prog === 1) this.cameras.main.zoomTo(1.0, 350, 'Sine.easeIn'); });
    const cx = this.scale.width / 2; const cy = this.scale.height / 2 - 60;
    const panel = makeGlassPanel(this, cx, cy, 180, 40).setScrollFactor(0).setDepth(204).setAlpha(0);
    const label = this.add.text(cx, cy, 'CHECKPOINT', { fontFamily: 'monospace', fontSize: '12px', color: hex(PAL.platform) }).setOrigin(0.5).setScrollFactor(0).setDepth(205).setAlpha(0);
    this.tweens.add({ targets: [panel, label], alpha: 1, duration: 200 });
    this.time.delayedCall(1200, () => { this.tweens.add({ targets: [panel, label], alpha: 0, duration: 300, onComplete: () => { panel.destroy(); label.destroy(); } }); });
  }

  // ---- Overlap handlers ----
  onPlayerHit() {
    if (AssistMode.get('invincibility')) return;
    this.player.takeHit();
  }

  onShield() {
    if (!this.shieldPickup) return;
    this.player.hasShield = true;
    this.shieldPickup.destroy();
    this.shieldPickup = null;
    SFX.shieldPickup();
  }

  onCollect(player, c) {
    const { x, y } = c;
    this.tweens.killTweensOf(c);
    if (c.extras) c.extras.forEach((e) => { this.tweens.killTweensOf(e); e.destroy(); });
    if (c.hidden) this.secretsFound++; else this.collectedCount++;
    c.destroy();
    SFX.collect();
    spawnPickupShards(this, x, y, PAL.platform, 8, 30);
    this.player.visuals.flashCount(this.collectedCount, PAL.platform);
  }

  // ---- Level complete ----
  onLevelComplete() {
    if (this.levelDone) return;
    this.levelDone = true;
    Progression.complete(5);
    this.cameraController.cinematicEvent('portalReached', this);
    this.player.frozen = true;
    this.player.body.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
    this._hitPause(120);
    this._chromaticHit(0.8, 600);
    this._flashScreen(0xffffff, 0.6, 400);
    this.portal.activate();
    this._shakeScreen(400, 0.015);

    this.time.delayedCall(700, () => {
      const cx = this.scale.width / 2; const cy = this.scale.height / 2;
      const bg = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, PAL.bgTint, 0).setScrollFactor(0).setDepth(201);
      this.tweens.add({ targets: bg, alpha: 0.85, duration: 300 });
      const panel = makeGlassPanel(this, cx, cy, 360, 90).setScrollFactor(0).setDepth(202);
      const main  = this.add.text(cx, cy - 8, 'LEVEL 5 COMPLETE', { fontFamily: 'monospace', fontSize: '30px', color: hex(PAL.platform) }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      const total = this.collectedCount + this.secretsFound;
      const sub   = this.add.text(cx, cy + 26, `${total} / ${this.totalCollectibles}  •  ${this.secretsFound} / ${HIDDEN_COLLECTIBLE_COUNT} SECRETS`, { fontFamily: 'monospace', fontSize: '13px', color: hex(PAL.collectible) }).setOrigin(0.5).setScrollFactor(0).setDepth(203);
      [[panel, cy], [main, cy - 8], [sub, cy + 26]].forEach(([o, ty]) => { o.y = ty + 20; o.alpha = 0; this.tweens.add({ targets: o, y: ty, alpha: 1, duration: 300, ease: 'Quad.easeOut' }); });
      const beatDiv = this.add.rectangle(cx, cy + 56, 300, 1, PAL.platform, 0).setScrollFactor(0).setDepth(203);
      const beat = this.add.text(cx, cy + 78, 'The glass records everything.\nIt recorded you passing through.', { fontFamily: 'monospace', fontSize: '11px', color: hex(PAL.platform), align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0);
      this.time.delayedCall(200, () => { this.tweens.add({ targets: beatDiv, alpha: 0.3, duration: 400 }); this.tweens.add({ targets: beat, alpha: 0.8, duration: 400 }); });
      this.time.delayedCall(1500, () => {
        const doTransition = () => {
          if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic = null; }
          this.cameras.main.fadeOut(500, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.stop('UI'); this.scene.start('MainMenu'); this.scene.stop('Level5');
          });
        };
        const isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const cont = this.add.text(cx, cy + 116, isTouchDevice ? 'TAP TO CONTINUE' : 'PRESS SPACE TO CONTINUE', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0.4);
        this.tweens.add({ targets: cont, alpha: { from: 0.15, to: 0.4 }, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const tapHit = this.add.rectangle(cx, cy + 116, 280, 40, 0x000000, 0.001).setScrollFactor(0).setDepth(204).setInteractive();
        tapHit.on('pointerdown', () => { tapHit.destroy(); doTransition(); });
        this.input.keyboard.once('keydown-SPACE', () => { tapHit.destroy(); doTransition(); });
      });
    });
  }

  // ---- Title card ----
  _showTitleCard(line1, line2, accent) {
    const cx = this.scale.width / 2; const cy = this.scale.height / 2;
    const base = this.add.rectangle(cx, cy, 540, 70, PAL.bgTint, 0.55).setStrokeStyle(0.5, accent, 0.25);
    const tint = this.add.rectangle(cx, cy, 540, 70, accent, 0.04);
    const hi   = this.add.rectangle(cx, cy - 34, 540, 1, 0xffffff, 0.15);
    const t1   = this.add.text(cx, cy - 14, line1, { fontFamily: 'monospace', fontSize: '12px', color: hex(accent) }).setOrigin(0.5);
    const div  = this.add.rectangle(cx, cy + 2, 500, 1, accent, 0.2);
    const t2   = this.add.text(cx, cy + 16, line2, { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', fontStyle: 'italic' }).setOrigin(0.5).setAlpha(0.6);
    const card = this.add.container(0, 0, [base, tint, hi, t1, div, t2]).setScrollFactor(0).setDepth(210).setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 400, hold: 4000, yoyo: true, onComplete: () => card.destroy() });
  }

  // ---- Camera-effect helpers ----
  _shakeScreen(duration, intensity) { this.cameras.main.shake(duration, intensity); }
  _chromaticHit(intensity, duration) {
    const cam = this.cameras.main;
    if (!cam.getPostPipeline) return;
    let p = cam.getPostPipeline(ChromaticAberrationPipeline);
    if (Array.isArray(p)) p = p[0];
    if (!p) return;
    p.uIntensity = intensity; p.uOffset = 0.008;
    this.tweens.add({ targets: p, uIntensity: 0, duration, ease: 'Power2' });
  }
  _hitPause(duration) {
    this.physics.pause(); this.tweens.pauseAll();
    this.time.delayedCall(duration, () => { this.physics.resume(); this.tweens.resumeAll(); });
  }
  _flashScreen(color, alpha, duration) {
    const f = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, color, alpha).setScrollFactor(0).setDepth(206);
    this.tweens.add({ targets: f, alpha: 0, duration, onComplete: () => f.destroy() });
  }

  // ---- Pause menu (mirrors Level 4) ----
  togglePause() { if (this.isPaused) this._resumeScene(); else this._pauseScene(); }

  _pauseScene() {
    this.isPaused = true; this.pauseSelection = 0; this.pauseMode = 'main'; this.assistSelection = 0;
    this.physics.pause(); this.tweens.pauseAll(); this.time.paused = true;
    this._buildPauseOverlay();
  }

  _resumeScene() {
    this.isPaused = false; this.pauseMode = 'main';
    this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false;
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null;
  }

  _buildPauseOverlay() {
    const cx = this.scale.width / 2; const cy = this.scale.height / 2;
    const dim     = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, PAL.bgTint, 0.75).setScrollFactor(0).setDepth(300);
    const panel   = makeGlassPanel(this, cx, cy, 280, 215).setScrollFactor(0).setDepth(301);
    const title   = this.add.text(cx, cy - 64, 'PAUSED', { fontFamily: 'monospace', fontSize: '24px', color: hex(PAL.platform) }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
    const sep     = this.add.rectangle(cx, cy - 40, 200, 1, PAL.platform, 0.6).setScrollFactor(0).setDepth(302);
    this.resumeText   = this.add.text(cx - 60, cy - 14, 'RESUME',    { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.restartText  = this.add.text(cx - 60, cy + 14, 'RESTART',   { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.assistText   = this.add.text(cx - 60, cy + 42, 'ASSIST',    { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.mainMenuText = this.add.text(cx - 60, cy + 70, 'MAIN MENU', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302);
    this.pauseUI = [dim, panel, title, sep, this.resumeText, this.restartText, this.assistText, this.mainMenuText];
    this._refreshPauseSelection();
  }

  _refreshPauseSelection() {
    if (!this.resumeText) return;
    this.resumeText.setText(`${this.pauseSelection === 0 ? '> ' : '  '}RESUME`).setAlpha(this.pauseSelection === 0 ? 1 : 0.6);
    this.restartText.setText(`${this.pauseSelection === 1 ? '> ' : '  '}RESTART`).setAlpha(this.pauseSelection === 1 ? 1 : 0.6);
    this.assistText.setText(`${this.pauseSelection === 2 ? '> ' : '  '}ASSIST`).setAlpha(this.pauseSelection === 2 ? 1 : 0.6);
    this.mainMenuText.setText(`${this.pauseSelection === 3 ? '> ' : '  '}MAIN MENU`).setAlpha(this.pauseSelection === 3 ? 1 : 0.6);
  }

  _updatePauseMenu() {
    if (this.pauseMode === 'assist') { this._updateAssistMenu(); return; }
    const k = this.pauseKeys;
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w))   { this.pauseSelection = Math.max(0, this.pauseSelection - 1); this._refreshPauseSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) { this.pauseSelection = Math.min(3, this.pauseSelection + 1); this._refreshPauseSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.pauseSelection === 0) { this._resumeScene(); }
      else if (this.pauseSelection === 1) { this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false; this.isPaused = false; this.scene.restart(); }
      else if (this.pauseSelection === 2) { this._openAssistOverlay(); }
      else {
        this.physics.resume(); this.tweens.resumeAll(); this.time.paused = false; this.isPaused = false;
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => { this.scene.stop('UI'); this.scene.start('MainMenu'); this.scene.stop('Level5'); });
      }
    }
  }

  _openAssistOverlay()  { this.pauseMode = 'assist'; this.assistSelection = 0; if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy()); this.pauseUI = null; this._buildAssistOverlay(); }
  _closeAssistOverlay() { this.pauseMode = 'main';   if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy()); this.pauseUI = null; this._buildPauseOverlay(); }

  _buildAssistOverlay() {
    const cx = this.scale.width / 2; const cy = this.scale.height / 2;
    const dim     = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, PAL.bgTint, 0.75).setScrollFactor(0).setDepth(300);
    const panel   = makeGlassPanel(this, cx, cy, 280, 220).setScrollFactor(0).setDepth(301);
    const header  = this.add.text(cx, cy - 88, 'ASSIST MODE', { fontFamily: 'monospace', fontSize: '11px', color: '#ff6a00' }).setOrigin(0.5).setScrollFactor(0).setDepth(302).setAlpha(0.6);
    const divider = this.add.rectangle(cx, cy - 75, 240, 1, 0xff6a00, 0.2).setScrollFactor(0).setDepth(302);
    const OPTIONS = [
      { key: 'reducedEnemySpeed', name: 'REDUCED ENEMY SPEED', desc: 'Enemies move at 60% normal speed' },
      { key: 'slowerGameSpeed',   name: 'SLOWER GAME SPEED',   desc: 'Game runs at 75% speed' },
      { key: 'invincibility',     name: 'INVINCIBILITY',       desc: 'Player cannot die' },
    ];
    const ROW_Y = [cy - 56, cy - 12, cy + 32];
    this.assistRows = OPTIONS.map((opt, i) => {
      const y = ROW_Y[i]; const on = AssistMode.get(opt.key);
      const arrow    = this.add.text(cx - 108, y, '▶', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0);
      const checkbox = this.add.text(cx - 94,  y, on ? '[✓]' : '[ ]', { fontFamily: 'monospace', fontSize: '12px', color: on ? '#ff6a00' : hex(PAL.platform) }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(on ? 0.9 : 0.4);
      const name     = this.add.text(cx - 68,  y, opt.name, { fontFamily: 'monospace', fontSize: '13px', color: hex(PAL.platform) }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.5);
      const desc     = this.add.text(cx - 68,  y + 15, opt.desc, { fontFamily: 'monospace', fontSize: '9px', color: hex(PAL.platform) }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.3);
      return { arrow, checkbox, name, desc, key: opt.key };
    });
    const backArrow = this.add.text(cx - 42, cy + 78, '▶', { fontFamily: 'monospace', fontSize: '10px', color: '#ff6a00' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0);
    const backText  = this.add.text(cx - 24, cy + 78, 'BACK', { fontFamily: 'monospace', fontSize: '10px', color: hex(PAL.platform) }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(302).setAlpha(0.4);
    this.assistBackRow = { arrow: backArrow, text: backText };
    this.pauseUI = [dim, panel, header, divider, ...this.assistRows.flatMap((r) => [r.arrow, r.checkbox, r.name, r.desc]), backArrow, backText];
    this._refreshAssistSelection();
  }

  _refreshAssistSelection() {
    if (!this.assistRows) return;
    this.assistRows.forEach((row, i) => {
      const sel = i === this.assistSelection; const on = AssistMode.get(row.key);
      row.arrow.setAlpha(sel ? 1 : 0); row.name.setAlpha(sel ? 1 : 0.5); row.desc.setAlpha(sel ? 0.55 : 0.3);
      row.checkbox.setText(on ? '[✓]' : '[ ]'); row.checkbox.setColor(on ? '#ff6a00' : hex(PAL.platform)); row.checkbox.setAlpha(on ? 0.9 : (sel ? 0.7 : 0.4));
    });
    if (this.assistBackRow) {
      const backSel = this.assistSelection === 3;
      this.assistBackRow.arrow.setAlpha(backSel ? 1 : 0); this.assistBackRow.text.setAlpha(backSel ? 1 : 0.4);
    }
  }

  _updateAssistMenu() {
    const k = this.pauseKeys;
    if (Phaser.Input.Keyboard.JustDown(k.up) || Phaser.Input.Keyboard.JustDown(k.w))   { this.assistSelection = Math.max(0, this.assistSelection - 1); this._refreshAssistSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.down) || Phaser.Input.Keyboard.JustDown(k.s)) { this.assistSelection = Math.min(3, this.assistSelection + 1); this._refreshAssistSelection(); }
    if (Phaser.Input.Keyboard.JustDown(k.space) || Phaser.Input.Keyboard.JustDown(k.enter)) {
      if (this.assistSelection === 3) this._closeAssistOverlay();
      else { const keys = ['reducedEnemySpeed', 'slowerGameSpeed', 'invincibility']; AssistMode.toggle(keys[this.assistSelection]); this._refreshAssistSelection(); }
    }
  }

  // ---- Main loop ----
  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.mKey) || this.touchControls.mute.justDown) {
      SFX.toggleMute();
      if (this.bgMusic) this.bgMusic.setMute(!SFX.enabled);
    }

    if (Phaser.Input.Keyboard.JustDown(this.pauseKeys.esc) && !this.levelDone) {
      if (this.isPaused && this.pauseMode === 'assist') this._closeAssistOverlay();
      else this.togglePause();
    }
    if (this.isPaused) { this._updatePauseMenu(); return; }
    if (this.levelDone) { this.player.update(time, delta); return; }

    // Assist: slow-motion
    const targetScale = AssistMode.get('slowerGameSpeed') ? ASSIST_MODE.GAME_SPEED_MULTIPLIER : 1.0;
    if (Math.abs(this.physics.world.timeScale - targetScale) > 0.001) {
      this.physics.world.timeScale = Phaser.Math.Linear(this.physics.world.timeScale, targetScale, 0.05);
    } else {
      this.physics.world.timeScale = targetScale;
    }

    this.player.update(time, delta);
    const px = this.player.x; const py = this.player.y;
    this.cameraController.update(this.player);

    // Cull-distance for expensive updates
    const near = (e) => Phaser.Math.Distance.Between(e.x, e.y, px, py) < 1600;
    for (const d of this.drones)   { if (!d.active) continue; if (near(d)) d.update(time, delta); else if (d.freeze) d.freeze(); }
    for (const s of this.sentinels) if (s.active && near(s)) s.update(time, delta);
    for (const s of this.seekers)   if (s.active && near(s)) s.update(time, delta);

    // HoloSweepPlatform updates (culled to 1200px)
    for (const hp of this.holoPlats) {
      if (Math.abs(hp.x - px) < 1200) hp.update(delta);
    }

    this.portal.update(time, delta);
    this.diegeticHUD.update(time, delta);

    if (!this.player.isDead && py > DEATH_Y && !AssistMode.get('invincibility')) this.player.die();
  }
}
