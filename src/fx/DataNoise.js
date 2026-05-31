// =============================================================================
// DataNoise — ambient digital-city decoration:
//   - floating tech-string fragments that drift up and fade (near the player,
//     never over platforms; max 12; one every ~2s)
//   - occasional full-width "signal interference" corruption lines
// Both are skipped when the framerate drops below 50 (performance safeguard).
// Takes a seeded RNG so timing/placement is deterministic.
// =============================================================================
const FRAG_STRINGS = [
  'SYS', 'ERR', '0x4F', 'NODE', 'PKT', '//', 'NULL', '0xFF', 'SYNC', 'ACK',
  '>>>', 'LOST', '404', 'DAT', 'REC', 'BUF', 'OVERFLOW', 'PING', '//KILL',
];
const MAX_FRAGMENTS = 12;

export default class DataNoise {
  constructor(scene, player, rng) {
    this.scene = scene;
    this.player = player;
    this.rng = rng;
    this.fragments = [];
    this.fragTimer = 0;
    this.corruptTimer = this.nextCorruptDelay();
    this.corruptToggle = false;
  }

  nextCorruptDelay() {
    return 15000 + this.rng() * 10000; // 15-25s
  }

  update(time, delta) {
    const fps = this.scene.game.loop.actualFps;

    // ---- Floating data fragments ----
    this.fragTimer += delta;
    if (this.fragTimer >= 2000) {
      this.fragTimer = 0;
      if (fps >= 50 && this.fragments.length < MAX_FRAGMENTS) this.spawnFragment();
    }

    // ---- Corruption lines ----
    this.corruptTimer -= delta;
    if (this.corruptTimer <= 0) {
      this.corruptTimer = this.nextCorruptDelay();
      if (fps >= 50) this.spawnCorruption();
    }
  }

  spawnFragment() {
    const p = this.player;
    let fx;
    let fy;
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) {
      fx = p.x + (this.rng() * 800 - 400); // within 400px
      fy = p.y + (this.rng() * 500 - 300);
      ok = !this.overPlatform(fx, fy);
    }
    if (!ok) return;

    const str = FRAG_STRINGS[Math.floor(this.rng() * FRAG_STRINGS.length)];
    const t = this.scene.add
      .text(fx, fy, str, { fontFamily: 'monospace', fontSize: '7px', color: '#00ff88' })
      .setOrigin(0.5)
      .setAlpha(0.12)
      .setDepth(-5); // behind platforms, in front of the city
    this.fragments.push(t);

    const dur = 4000 + this.rng() * 4000; // 4-8s
    this.scene.tweens.add({
      targets: t,
      y: fy - 40,
      alpha: 0,
      duration: dur,
      ease: 'Linear',
      onComplete: () => {
        const i = this.fragments.indexOf(t);
        if (i !== -1) this.fragments.splice(i, 1);
        t.destroy();
      },
    });
  }

  overPlatform(x, y) {
    const plats = this.scene.platforms;
    for (let i = 0; i < plats.length; i++) {
      const b = plats[i].body;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return true;
    }
    return false;
  }

  spawnCorruption() {
    const w = this.scene.scale.width;
    const y = this.rng() * this.scene.scale.height;
    const h = 1 + Math.floor(this.rng() * 3); // 1-3px
    const color = (this.corruptToggle = !this.corruptToggle) ? 0x00e5ff : 0xff6a00;
    const alpha = 0.2 + this.rng() * 0.2; // 0.2-0.4
    const line = this.scene.add
      .rectangle(w / 2, y, w, h, color, alpha)
      .setScrollFactor(0)
      .setDepth(100);
    const life = 60 + this.rng() * 60; // 60-120ms
    this.scene.time.delayedCall(life, () => line.destroy());
  }
}
