import * as Tone from 'tone';
import { SFX_MASTER_VOLUME, SFX_LAND_THROTTLE_MS, SFX_ENABLED } from '../constants.js';

// =============================================================================
// SFX — procedural sound effects via Tone.js (no audio files).
//
// A singleton. init() must be called once after a user gesture (Tone.js can't
// start audio before interaction) — wired to the first Space/click on the menu.
//
// Frequently-triggered sounds (jump, land, collect, dash) reuse pre-created
// synths to avoid per-call allocation / GC stutter. Rare one-offs create fresh
// synths and dispose them after their envelope tail (_retire) to avoid leaks.
//
// Music, shield break, ability unlock, and level complete are intentionally
// NOT here — those come from FL Studio exports later.
// =============================================================================
class SFX {
  constructor() {
    this.enabled = SFX_ENABLED;
    this.volume = SFX_MASTER_VOLUME; // dB master
    this.ready = false;              // true once init() has run
    this._lastLand = 0;

    // ---- Pre-created reusable synths (frequent sounds) ----
    this.jumpSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
      portamento: 0.06,
    }).toDestination();
    this.jumpSynth.volume.value = -8;

    this.landSynth = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
    }).toDestination();
    this.landSynth.volume.value = -20;

    this.collectSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.4 },
    }).toDestination();
    this.collectSynth.volume.value = -10;

    this.dashFilter = new Tone.Filter(1200, 'bandpass').toDestination();
    this.dashNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.01 },
    });
    this.dashNoise.connect(this.dashFilter);
    this.dashNoise.volume.value = -12;
  }

  // Must be called once after a user gesture (Tone.js autoplay requirement).
  async init() {
    if (this.ready) return;
    await Tone.start();
    Tone.getDestination().volume.value = this.volume;
    Tone.getDestination().mute = !this.enabled;
    this.ready = true;
  }

  // Toggle all SFX (M key). Mutes the master so any sustained sounds stop too.
  toggleMute() {
    this.enabled = !this.enabled;
    if (this.ready) Tone.getDestination().mute = !this.enabled;
    return this.enabled;
  }

  _live() {
    return this.enabled && this.ready;
  }

  // Dispose a one-off node after its envelope tail so audio nodes don't leak.
  _retire(node, ms = 1500) {
    setTimeout(() => {
      try { node.dispose(); } catch (e) { /* already disposed */ }
    }, ms);
  }

  // Trigger a synth, swallowing Tone's "start time must be strictly greater"
  // error that occurs when two sounds hit the same synth in the same instant.
  _t(node, ...args) {
    try { node.triggerAttackRelease(...args); } catch (e) { /* overlapping trigger dropped */ }
  }

  // --- Player ----------------------------------------------------------------
  jump() {
    if (!this._live()) return;
    this._t(this.jumpSynth, 'C4', '64n');
  }

  doubleJump() {
    if (!this._live()) return;
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.set({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } });
    synth.volume.value = -10;
    this._t(synth, ['E4', 'B4'], '64n'); // root + fifth above
    this._retire(synth, 500);
  }

  dash() {
    if (!this._live()) return;
    this._t(this.dashNoise, '16n');
  }

  attack() {
    if (!this._live()) return;
    // Layer 1: high click transient.
    const click = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).toDestination();
    click.volume.value = -14;
    this._t(click, '16n');
    this._retire(click, 500);

    // Layer 2: short resonant discharge tone.
    const tone = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
    }).toDestination();
    tone.volume.value = -18;
    this._t(tone, 'A3', '8n');
    this._retire(tone, 600);
  }

  death() {
    if (!this._live()) return;
    // Layer 1: descending sweep.
    const sweep = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
    }).toDestination();
    sweep.volume.value = -10;
    this._t(sweep, 'C4', '4n');
    sweep.frequency.rampTo(40, 0.4);
    this._retire(sweep, 1000);

    // Layer 2: noise burst.
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
    }).toDestination();
    noise.volume.value = -18;
    this._t(noise, '8n');
    this._retire(noise, 600);

    // Layer 3: low thud.
    const thud = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
    }).toDestination();
    thud.volume.value = -12;
    this._t(thud, 'C1', '8n');
    this._retire(thud, 800);
  }

  jump_land() {
    if (!this._live()) return;
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (now - this._lastLand < SFX_LAND_THROTTLE_MS) return;
    this._lastLand = now;
    this._t(this.landSynth, 'C2', '32n');
  }

  // --- Collectibles ----------------------------------------------------------
  collect() {
    if (!this._live()) return;
    this._t(this.collectSynth, 'G5', '8n');
  }

  collectSecret() {
    if (!this._live()) return;
    this.collect();
    setTimeout(() => {
      if (!this._live()) return;
      const synth = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.1, release: 0.5 },
      }).toDestination();
      synth.volume.value = -12;
      this._t(synth, 'B5', '8n'); // major third above
      this._retire(synth, 1200);
    }, 60);
  }

  // --- Scene events ----------------------------------------------------------
  checkpoint() {
    if (!this._live()) return;
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.set({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.5 } });
    synth.volume.value = -10;
    this._t(synth, 'E4', '4n');
    setTimeout(() => this._t(synth, 'G4', '4n'), 120);
    this._retire(synth, 1600);
  }

  shieldPickup() {
    if (!this._live()) return;
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.set({ oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 0.8 } });
    synth.volume.value = -8;
    this._t(synth, 'C4', '2n'); // rising chord
    setTimeout(() => this._t(synth, 'E4', '2n'), 80);
    setTimeout(() => this._t(synth, 'G4', '2n'), 160);
    this._retire(synth, 2500);
  }

  enemyAlert() {
    if (!this._live()) return;
    const synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0.05, release: 0.1 },
    }).toDestination();
    synth.volume.value = -14;
    this._t(synth, 'A4', '16n');
    setTimeout(() => this._t(synth, 'A4', '16n'), 80); // double stab
    this._retire(synth, 600);
  }

  // Proximity-mine arming: a rising sine 200 -> 800 Hz over 1.2s.
  mineArm() {
    if (!this._live()) return;
    const osc = new Tone.Oscillator({ type: 'sine', frequency: 200 }).toDestination();
    osc.volume.value = -18;
    osc.start();
    osc.frequency.rampTo(800, 1.2);
    setTimeout(() => { try { osc.stop(); } catch (e) { /* noop */ } }, 1200);
    this._retire(osc, 1500);
  }

  // Proximity-mine detonation: noise burst + low thud.
  mineBoom() {
    if (!this._live()) return;
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.05 },
    }).toDestination();
    noise.volume.value = -10;
    this._t(noise, '8n');
    this._retire(noise, 700);
    const thud = new Tone.MembraneSynth({
      pitchDecay: 0.06, octaves: 4, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    }).toDestination();
    thud.volume.value = -8;
    this._t(thud, 'C1', '8n');
    this._retire(thud, 800);
  }

  // Continuous ambient hum for the exit portal. Returns a handle with stop().
  portalHum() {
    if (!this._live()) return { stop() {} };
    const osc = new Tone.Oscillator({ type: 'sine', frequency: 60 }).toDestination();
    const lfo = new Tone.LFO(0.5, -24, -18);
    lfo.connect(osc.volume);
    lfo.start();
    osc.volume.value = -22;
    osc.start();
    return {
      stop() {
        try { osc.stop(); lfo.stop(); } catch (e) { /* noop */ }
        setTimeout(() => {
          try { osc.dispose(); lfo.dispose(); } catch (e) { /* noop */ }
        }, 200);
      },
    };
  }
}

export default new SFX();
