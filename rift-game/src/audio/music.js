// Generative music + ambient bed. Pure scheduling into a destination; works offline too.
import { osc, noise, midi, noiseBuf, pinkish } from './synth.js';
const DORIAN = [0, 2, 3, 5, 7, 9, 10]; // D dorian (root D=50 -> low)
const ROOT = 50;
const PROG = [0, 5, 3, 6, 0, 5, 4, 6]; // scale-degree roots, one per bar
const deg = (d, oct = 0) => ROOT + DORIAN[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);

export class Music {
  constructor(ac, dest) {
    this.ac = ac; this.dest = dest; this.step = 0; this.next = ac.currentTime + 0.1;
    this.intensity = 0; this.seed = 7; this.padLP = null;
    this.rng = () => { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; };
  }
  bpm() { return 78 + this.intensity * 42; }
  schedule(until) {
    const ac = this.ac;
    let guard = 0;
    while (this.next < until && guard++ < 64) {
      const spb = 60 / this.bpm() / 4; // 16th
      this.tick(this.step, this.next, spb);
      this.next += spb; this.step++;
    }
  }
  tick(s, t, spb) {
    const ac = this.ac, I = this.intensity, bar = Math.floor(s / 16), st = s % 16;
    const root = PROG[bar % PROG.length];
    if (st === 0) { // pad chord: 1-3-5 (+7th in tension)
      const dur = spb * 16 * 1.05, notes = [root, root + 2, root + 4, ...(I > 0.5 ? [root + 6] : [])];
      notes.forEach((d, k) => {
        const f = midi(deg(d, 1));
        for (const det of [-9, 9]) this.pad(f, t, dur, 0.05 - I * 0.012, det, 500 + I * 1400);
      });
      osc(ac, this.dest, 'sine', midi(deg(root, -1)), midi(deg(root, -1)), t, dur, 0.22, 0.4); // sub drone
    }
    // bass pulse
    if (I > 0.15 && (st % 4 === 0 || (I > 0.6 && st % 4 === 2))) {
      const f = midi(deg(root, -1));
      osc(ac, this.dest, 'sawtooth', f, f * 0.98, t, spb * 3, 0.11 + I * 0.05, 0.005);
    }
    // arpeggio
    const dens = I < 0.2 ? 0.25 : 0.4 + I * 0.5;
    const order = [0, 2, 4, 2, 7, 4, 2, 4];
    if ((st % 2 === 0 || I > 0.55) && this.rng() < dens) {
      const d = root + order[(s >> (I > 0.55 ? 0 : 1)) % order.length] + (this.rng() < 0.2 ? 7 : 0);
      const f = midi(deg(d, 1));
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900 + I * 3000, t); lp.frequency.exponentialRampToValueAtTime(300, t + spb * 3); lp.connect(this.dest);
      osc(ac, lp, 'triangle', f, f, t, spb * 3.2, 0.1 + I * 0.04, 0.003);
      osc(ac, lp, 'square', f * 2, f * 2, t, spb * 1.5, 0.025, 0.003);
    }
    // percussion for tension
    if (I > 0.35) {
      if (st % 4 === 0) { osc(ac, this.dest, 'sine', 120, 42, t, 0.18, 0.4 + I * 0.15, 0.002); }
      if (st % 4 === 2 && I > 0.5) noise(ac, this.dest, t, 0.06, 'highpass', 6000, 6000, 0.7, 0.07, 0.001);
      if (st === 12 && I > 0.55) noise(ac, this.dest, t, 0.15, 'bandpass', 1800, 1200, 1, 0.15, 0.001);
    }
    if (I > 0.8 && st % 8 === 4) osc(ac, this.dest, 'sawtooth', midi(deg(root + 4, 0)), midi(deg(root + 4, 0)) * 1.02, t, spb * 4, 0.05, 0.01);
  }
  pad(f, t, dur, peak, det, cut) {
    const ac = this.ac, o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(cut * 0.5, t); lp.frequency.linearRampToValueAtTime(cut, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(cut * 0.6, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.001, peak), t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.dest); o.start(t); o.stop(t + dur + 0.05);
  }
}

export class Ambient {
  constructor(ac, dest, t0 = ac.currentTime) {
    this.ac = ac; this.dest = dest; this.next = t0 + 0.5; this.seed = 99;
    this.rng = () => { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; };
    // wind: brown noise through slowly sweeping bandpass
    const w = ac.createBufferSource(); w.buffer = pinkish(ac); w.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.value = 450;
    const wg = ac.createGain(); wg.gain.value = 0.09;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.09; lg.gain.value = 220; lfo.connect(lg); lg.connect(bp.frequency);
    const lfo2 = ac.createOscillator(), lg2 = ac.createGain(); lfo2.frequency.value = 0.21; lg2.gain.value = 0.04; lfo2.connect(lg2); lg2.connect(wg.gain);
    w.connect(bp); bp.connect(wg); wg.connect(dest);
    // bioluminescent drones: detuned sines, minor-ish cluster, slow tremolo
    this.srcs = [w, lfo, lfo2];
    [[D(38), 0.045], [D(45), 0.03], [D(53), 0.022], [D(60) * 1.003, 0.014]].forEach(([f, a], i) => {
      const o = ac.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f;
      const g = ac.createGain(); g.gain.value = a;
      const l = ac.createOscillator(), lgn = ac.createGain(); l.frequency.value = 0.05 + i * 0.037; lgn.gain.value = a * 0.6; l.connect(lgn); lgn.connect(g.gain);
      o.connect(g); g.connect(dest); this.srcs.push(o, l);
    });
    this.srcs.forEach(s => s.start(t0));
  }
  stop(t) { this.srcs.forEach(s => { try { s.stop(t); } catch (e) {} }); }
  schedule(until) { // insects + glimmers
    const ac = this.ac; let guard = 0;
    while (this.next < until && guard++ < 32) {
      const t = this.next, r = this.rng();
      if (r < 0.55) this.insect(t);
      else if (r < 0.85) this.glimmer(t);
      this.next += 0.25 + this.rng() * 1.1;
    }
  }
  insect(t) {
    const ac = this.ac, f = 3200 + this.rng() * 2600, n = 3 + Math.floor(this.rng() * 6), gap = 0.04 + this.rng() * 0.03;
    for (let i = 0; i < n; i++) osc(ac, this.dest, 'sine', f, f * 1.03, t + i * gap, 0.03, 0.012 + this.rng() * 0.006, 0.004);
  }
  glimmer(t) {
    const ac = this.ac, f = midi(74 + DORIAN[Math.floor(this.rng() * 7)]);
    osc(ac, this.dest, 'sine', f, f, t, 1.4, 0.03, 0.05);
    osc(ac, this.dest, 'sine', f * 2.005, f * 2.005, t + 0.02, 1.0, 0.012, 0.05);
  }
}
function D(m) { return midi(m); }
