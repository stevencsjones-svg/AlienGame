import Phaser from 'phaser';

// =============================================================================
// LivingBackground — purely atmospheric, additive set-dressing for Level 1.
// Draws BEHIND platforms/entities. Nothing here affects physics or gameplay.
//
// Sky elements use setScrollFactor(sfX, 0): they parallax horizontally but are
// pinned vertically, matching the (vertically-fixed) parallax skyline. Rain and
// lightning are pure screen space (scrollFactor 0).
//
// Systems: flying vehicles, high-altitude vessels, alien creatures, window
// flicker, rain, lightning, neon signs. All cull against the camera and back
// off when the framerate drops below 45.
// =============================================================================

// Draw depths — all sit between the parallax front layer (-10) and the fog
// (-9), i.e. behind the fog, the platforms (0) and the player (5).
const D = {
  rain: -9.9,
  vessel: -9.8,
  neon: -9.7,
  window: -9.65,
  vehicle: -9.5,
  creature: -9.4,
  lightning: -9.2,
};

const DATA_STRINGS = ['SYS', 'ERR', 'NODE', 'PKT', 'ACK', 'SYNC', '0xFF', 'REC', 'BUF', 'DAT', 'HEX', 'LVL', 'NULL', '404'];

const DARK = 0x0a1a0f;     // vehicle silhouette
const CYAN = 0x00e5ff;
const GREEN = 0x00ff88;
const AMBER = 0xff6a00;
const RAIN = 0x00aacc;
const CREATURE = 0x004422;

export default class LivingBackground {
  constructor(scene, camera) {
    this.scene = scene;
    this.cam = camera;
    this.worldW = (scene.physics && scene.physics.world) ? scene.physics.world.bounds.width : 6400;

    // Seeded RNG (mulberry32) for fixed window/sign placement.
    let s = 0x1a2b3c4d >>> 0;
    this.rng = () => {
      s += 0x6d2b79f5;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };

    this.lowFps = false;
    this.maxVehicles = 12;
    this.maxRain = 80;

    this.vehicles = [];
    this.vehicleTimer = this.rand(1200, 2400);
    this.vessels = [];
    this.vesselTimer = this.rand(8000, 15000);
    this.creatures = []; // formations
    this.creatureTimer = this.rand(6000, 10000);

    this.rain = [];
    this.splashes = [];
    this.lightningTimer = this.rand(45000, 90000);
    this.lightningFlash = null;

    this.createRain();
    this.createWindows();
    this.createNeonSigns();
  }

  rand(a, b) { return a + this.rng() * (b - a); }
  randInt(a, b) { return Math.floor(this.rand(a, b + 1)); }

  // Visible world-x range for a layer at the given x scroll factor.
  viewLeft(sf) { return this.cam.scrollX * sf; }
  screenX(worldX, sf) { return worldX - this.cam.scrollX * sf; }

  // ===========================================================================
  // SYSTEM 5 — Rain (screen space)
  // ===========================================================================
  createRain() {
    for (let i = 0; i < 80; i++) this.rain.push(this.makeDrop(true));
  }

  makeDrop(initial) {
    const r = this.scene.add.rectangle(0, 0, 1, 4, RAIN, 0.08)
      .setScrollFactor(0).setDepth(D.rain).setAngle(14);
    r.vy = this.rand(180, 240);
    r.vx = r.vy * 0.25; // wind-blown lean
    r.x = this.rand(0, this.cam.width);
    r.y = initial ? this.rand(0, this.cam.height) : -8;
    return r;
  }

  updateRain(dt) {
    const sh = this.cam.height;
    const sw = this.cam.width;
    const active = this.rain.length;
    for (let i = 0; i < active; i++) {
      const r = this.rain[i];
      const live = i < this.maxRain; // fps safeguard hides extras
      r.setVisible(live);
      if (!live) continue;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (r.y > sh) {
        if (this.splashes.length < 5) this.spawnSplash(r.x, sh - 2);
        r.x = this.rand(0, sw);
        r.y = -8;
      }
    }
  }

  spawnSplash(x, y) {
    const s = this.scene.add.rectangle(x, y, 2, 1, RAIN, 0.18).setScrollFactor(0).setDepth(D.rain);
    this.splashes.push(s);
    this.scene.tweens.add({
      targets: s, alpha: 0, duration: 80,
      onComplete: () => { const i = this.splashes.indexOf(s); if (i !== -1) this.splashes.splice(i, 1); s.destroy(); },
    });
  }

  // ===========================================================================
  // SYSTEM 1 — Flying vehicles (mid altitude, scrollFactor 0.35)
  // ===========================================================================
  spawnVehicle(dir, y) {
    const sf = 0.35;
    const cargo = this.rng() < 0.35;
    const parts = [];
    const bodyW = cargo ? 24 : 18;
    const bodyH = cargo ? 4 : 5;
    parts.push(this.scene.add.rectangle(0, 0, bodyW, bodyH, DARK, 0.7));
    // front light(s) at the leading edge
    const lead = dir > 0 ? bodyW / 2 : -bodyW / 2;
    if (cargo) {
      parts.push(this.scene.add.rectangle(lead, -2, 3, 3, CYAN, 0.6));
      parts.push(this.scene.add.rectangle(lead, 4, 3, 3, CYAN, 0.6));
    } else {
      parts.push(this.scene.add.rectangle(lead, 0, 3, 3, CYAN, 0.6));
    }
    // engine glow at the trailing edge
    parts.push(this.scene.add.rectangle(-lead, 0, 4, 2, GREEN, 0.3));

    const speed = this.rand(60, 120) * dir;
    const angle = Phaser.Math.DegToRad(this.rand(-8, 8));
    const x0 = dir > 0 ? this.viewLeft(sf) - 40 : this.viewLeft(sf) + this.cam.width + 40;
    const c = this.scene.add.container(x0, y, parts)
      .setScrollFactor(sf, 0).setDepth(D.vehicle).setAngle(Phaser.Math.RadToDeg(angle) * (dir > 0 ? 1 : -1));
    c.vx = speed;
    c.vy = Math.sin(angle) * Math.abs(speed);
    this.vehicles.push(c);
    return c;
  }

  spawnVehicleStream() {
    const dir = this.rng() < 0.2 ? -1 : 1; // 20% cross-traffic
    const y = this.rand(50, 400);
    const group = this.rng() < 0.3 ? this.randInt(2, 3) : 1; // 30% travel in groups
    for (let i = 0; i < group; i++) {
      if (this.vehicles.length >= this.maxVehicles) break;
      const v = this.spawnVehicle(dir, y + this.rand(-6, 6));
      v.x -= dir * i * this.rand(40, 80); // spacing within the stream
    }
  }

  updateVehicles(dt) {
    const sf = 0.35;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const sx = this.screenX(v.x, sf);
      if (sx < -200 || sx > this.cam.width + 200) {
        // Off-screen: despawn if it has crossed and exited.
        if ((v.vx > 0 && sx > this.cam.width + 200) || (v.vx < 0 && sx < -200)) {
          v.destroy();
          this.vehicles.splice(i, 1);
        }
        continue; // skip movement while well outside view
      }
      v.x += v.vx * dt;
      v.y += v.vy * dt;
    }
    this.vehicleTimer -= dt * 1000;
    if (this.vehicleTimer <= 0 && this.vehicles.length < this.maxVehicles) {
      this.spawnVehicleStream();
      this.vehicleTimer = this.rand(1200, 2400);
    }
  }

  // ===========================================================================
  // SYSTEM 2 — High-altitude vessels (scrollFactor 0.12, rare, huge, slow)
  // ===========================================================================
  spawnVessel() {
    const sf = 0.12;
    const massive = this.rng() < 0.15;
    const w = massive ? 120 : 80;
    const h = massive ? 16 : 12;
    const dir = this.rng() < 0.5 ? 1 : -1;
    const parts = [
      this.scene.add.rectangle(0, 0, w, h, 0x050a08, 0.8),
      this.scene.add.rectangle(0, h / 2 - 1, w - 4, 2, GREEN, 0.12),
      this.scene.add.rectangle(-dir * (w / 2 - 6), h / 2 - 3, 6, 6, AMBER, 0.2).setAngle(45),
      this.scene.add.rectangle(-dir * (w / 2 - 14), h / 2 - 3, 6, 6, AMBER, 0.2).setAngle(45),
    ];
    const y = this.rand(20, 150);
    const x0 = dir > 0 ? this.viewLeft(sf) - w : this.viewLeft(sf) + this.cam.width + w;
    const c = this.scene.add.container(x0, y, parts).setScrollFactor(sf, 0).setDepth(D.vessel);
    c.vx = this.rand(15, 25) * dir;
    c.massive = massive;
    this.vessels.push(c);
  }

  updateVessels(dt) {
    const sf = 0.12;
    for (let i = this.vessels.length - 1; i >= 0; i--) {
      const v = this.vessels[i];
      v.x += v.vx * dt;
      const sx = this.screenX(v.x, sf);
      if ((v.vx > 0 && sx > this.cam.width + 160) || (v.vx < 0 && sx < -160)) {
        v.destroy();
        this.vessels.splice(i, 1);
      }
    }
    this.vesselTimer -= dt * 1000;
    if (this.vesselTimer <= 0 && this.vessels.length < 3) {
      this.spawnVessel();
      this.vesselTimer = this.rand(8000, 15000);
    }
  }

  // ===========================================================================
  // SYSTEM 3 — Alien creatures (chevron flocks, scrollFactor 0.45)
  // ===========================================================================
  makeCreature(bright) {
    const alpha = bright ? 0.75 : 0.55;
    const left = this.scene.add.rectangle(-4, 0, 14, 3, CREATURE, alpha).setAngle(-25);
    const right = this.scene.add.rectangle(4, 0, 14, 3, CREATURE, alpha).setAngle(25);
    const parts = [left, right];
    if (bright) parts.push(this.scene.add.rectangle(0, -1, 2, 2, CYAN, 0.8));
    const m = this.scene.add.container(0, 0, parts);
    m.baseY = 0;
    m.phase = this.rand(0, Math.PI * 2);
    m.oscAmp = this.rand(2, 5);
    m.oscPeriod = this.rand(400, 800);
    m.breaking = 0;     // ms remaining in a break-away dive
    return m;
  }

  spawnFormation() {
    const sf = 0.45;
    const n = this.randInt(3, 7);
    const dir = this.rng() < 0.5 ? 1 : -1;
    const angle = Phaser.Math.DegToRad(this.rand(-35, 35));
    const speed = this.rand(40, 80);
    const y = this.rand(80, 350);
    const x0 = dir > 0 ? this.viewLeft(sf) - 60 : this.viewLeft(sf) + this.cam.width + 60;

    const members = [];
    const parent = this.scene.add.container(x0, y).setScrollFactor(sf, 0).setDepth(D.creature);
    for (let i = 0; i < n; i++) {
      const c = this.makeCreature(this.rng() < 0.25);
      c.x = i * this.rand(14, 22) * -dir;
      c.y = this.rand(-10, 10);
      c.baseY = c.y;
      parent.add(c);
      members.push(c);
    }
    parent.vx = Math.cos(angle) * speed * dir;
    parent.vy = Math.sin(angle) * speed;
    parent.members = members;
    parent.breakTimer = this.rand(1500, 4000);
    this.creatures.push(parent);
  }

  updateCreatures(dt, time) {
    const sf = 0.45;
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const f = this.creatures[i];
      const sx = this.screenX(f.x, sf);
      if (sx < -300 || sx > this.cam.width + 300) {
        // Despawn only once it has fully crossed and left.
        if ((f.vx > 0 && sx > this.cam.width + 300) || (f.vx < 0 && sx < -300)) {
          f.destroy();
          this.creatures.splice(i, 1);
        }
        continue;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Independent per-creature life (skipped under low fps for rigidity).
      if (!this.lowFps) {
        for (const m of f.members) {
          if (m.breaking > 0) {
            m.breaking -= dt * 1000;
            m.y += 60 * dt;  // dive down
            m.x += (f.vx > 0 ? 30 : -30) * dt;
            if (m.breaking <= 0) { m.y = m.baseY; m.x = m._homeX; }
          } else {
            m.y = m.baseY + Math.sin((time / m.oscPeriod) * Math.PI * 2 + m.phase) * m.oscAmp;
          }
        }
      }

      // Occasionally one creature breaks formation and dives.
      f.breakTimer -= dt * 1000;
      if (f.breakTimer <= 0 && !this.lowFps) {
        const m = f.members[this.randInt(0, f.members.length - 1)];
        if (m.breaking <= 0) { m.breaking = 1330; m._homeX = m.x; } // ~80px at 60px/s
        f.breakTimer = this.rand(2000, 5000);
      }
    }
    this.creatureTimer -= dt * 1000;
    if (this.creatureTimer <= 0 && this.creatures.length < 4) {
      this.spawnFormation();
      this.creatureTimer = this.rand(6000, 10000);
    }
  }

  // ===========================================================================
  // SYSTEM 4 — Window flicker (fixed world positions, scrollFactor by layer)
  // ===========================================================================
  createWindows() {
    this.windows = [];
    for (let i = 0; i < 20; i++) {
      const layer1 = this.rng() < 0.5;
      const sf = layer1 ? 0.1 : 0.3;
      const wx = this.rng() * this.worldW;
      const wy = this.rand(60, 360); // building-band screen y
      const rect = this.scene.add.rectangle(wx, wy, 4, 4, GREEN, 0.5)
        .setScrollFactor(sf, 0).setDepth(D.window);
      const faulty = i < 3; // 3 faulty neon-like windows
      this.windows.push({
        rect, sf, faulty, on: true,
        timer: faulty ? this.rand(150, 230) : this.rand(4000, 12000),
      });
    }
  }

  updateWindows(dt) {
    const camCx = this.cam.scrollX + this.cam.width / 2;
    for (const w of this.windows) {
      // Cull far windows (world x vs camera centre, parallax-adjusted).
      const worldCx = camCx * w.sf;
      if (Math.abs(w.rect.x - worldCx) > 800) continue;
      w.timer -= dt * 1000;
      if (w.timer > 0) continue;
      if (w.faulty) {
        w.on = !w.on;
        w.rect.setAlpha(w.on ? 0.5 : 0);
        w.timer = w.on ? this.rand(120, 180) : this.rand(60, 100);
      } else if (w.on) {
        w.on = false;
        this.scene.tweens.add({ targets: w.rect, alpha: 0, duration: 200 });
        w.timer = this.rand(2000, 8000);
      } else {
        w.on = true;
        this.scene.tweens.add({ targets: w.rect, alpha: 0.5, duration: 100 });
        w.timer = this.rand(4000, 12000);
      }
    }
  }

  // ===========================================================================
  // SYSTEM 7 — Neon signs (fixed world positions, scrollFactor 0.25)
  // ===========================================================================
  createNeonSigns() {
    this.signs = [];
    for (let i = 0; i < 12; i++) {
      const wx = this.rng() * this.worldW;
      const wy = this.rand(70, 340);
      const base = this.scene.add.rectangle(wx, wy, 16, 6, GREEN, 0.08)
        .setStrokeStyle(1, GREEN, 0.4).setScrollFactor(0.25, 0).setDepth(D.neon);
      const label = DATA_STRINGS[this.randInt(0, DATA_STRINGS.length - 1)];
      const txt = this.scene.add.text(wx, wy, label, { fontFamily: 'monospace', fontSize: '6px', color: '#00ff88' })
        .setOrigin(0.5).setAlpha(0.25).setScrollFactor(0.25, 0).setDepth(D.neon);
      this.signs.push({
        base, txt, on: true, flicker: i < 2,
        timer: this.rand(800, 2400),
        flickerCooldown: this.rand(8000, 20000),
        flickering: 0,
      });
    }
  }

  setSignState(s, on) {
    s.base.setFillStyle(GREEN, on ? 0.08 : 0.04);
    s.base.setStrokeStyle(1, GREEN, on ? 0.4 : 0.2);
    s.txt.setAlpha(on ? 0.25 : 0.125);
  }

  updateSigns(dt) {
    const camCx = this.cam.scrollX + this.cam.width / 2;
    for (const s of this.signs) {
      const worldCx = camCx * 0.25;
      if (Math.abs(s.base.x - worldCx) > 600) continue;
      // Flicker bursts on the 2 designated signs.
      if (s.flicker) {
        s.flickerCooldown -= dt * 1000;
        if (s.flickering > 0) {
          s.flickering -= dt * 1000;
          this.setSignState(s, this.rng() < 0.5);
          if (s.flickering <= 0) this.setSignState(s, true);
          continue;
        }
        if (s.flickerCooldown <= 0) {
          s.flickering = 400;
          s.flickerCooldown = this.rand(8000, 20000);
          continue;
        }
      }
      s.timer -= dt * 1000;
      if (s.timer <= 0) {
        s.on = !s.on;
        this.setSignState(s, s.on);
        s.timer = this.rand(800, 2400);
      }
    }
  }

  // ===========================================================================
  // SYSTEM 6 — Lightning (screen space, very rare)
  // ===========================================================================
  updateLightning(dt) {
    this.lightningTimer -= dt * 1000;
    if (this.lightningTimer > 0) return;
    this.lightningTimer = this.rand(45000, 90000);
    this.flashOnce(0.06, () => {
      this.scene.time.delayedCall(140, () => this.flashOnce(0.04, null));
    });
  }

  flashOnce(peak, onDone) {
    const f = this.scene.add
      .rectangle(this.cam.width / 2, 300, this.cam.width, 600, 0xffffff, 0)
      .setScrollFactor(0).setDepth(D.lightning);
    this.scene.tweens.add({
      targets: f, alpha: peak, duration: 40,
      onComplete: () => {
        this.scene.tweens.add({
          targets: f, alpha: 0, duration: 60, onComplete: () => { f.destroy(); if (onDone) onDone(); },
        });
      },
    });
  }

  // ===========================================================================
  update(time, delta) {
    const dt = delta / 1000;
    const fps = this.scene.game.loop.actualFps;
    this.lowFps = fps > 0 && fps < 45;
    this.maxVehicles = this.lowFps ? 6 : 12;
    this.maxRain = this.lowFps ? 40 : 80;

    this.updateRain(dt);
    this.updateVessels(dt);
    this.updateSigns(dt);
    this.updateWindows(dt);
    this.updateVehicles(dt);
    this.updateCreatures(dt, time);
    this.updateLightning(dt);
  }
}
