// Procedural synthesis primitives + SFX recipes. Works on any BaseAudioContext (real or Offline).
let _rand = Math.random;
export const setRandom = f => { _rand = f; };
const R = (a = 0, b = 1) => a + (b - a) * _rand();
const noiseCache = new WeakMap();
export function noiseBuf(ac) {
  let b = noiseCache.get(ac);
  if (!b) {
    const n = Math.floor(ac.sampleRate * 2);
    b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    let s = 22222; // deterministic LCG so renders are repeatable
    for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
    noiseCache.set(ac, b);
  }
  return b;
}
export function pinkish(ac) { // brown-ish noise for wind/rumble
  const k = '_b'; let b = noiseCache.get(pinkish);
  if (!b || b.ctx !== ac) {
    const n = ac.sampleRate * 4, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    let l = 0, s = 987;
    for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; const w = s / 2147483648 - 1; l = (l + 0.04 * w) / 1.04; d[i] = l * 6; }
    b = { ctx: ac, buf }; noiseCache.set(pinkish, b);
  }
  return b.buf;
}
const fin = v => Number.isFinite(v) ? v : 0;
// Gain envelope: attack then exponential decay. Returns the GainNode.
export function env(ac, dest, t, a, d, peak) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, fin(peak)), t + Math.max(0.001, a));
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0.01, d));
  g.connect(dest);
  return g;
}
export function osc(ac, dest, type, f0, f1, t, dur, peak, a = 0.004, det = 0) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(Math.max(10, f0), t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  if (det) o.detune.value = det;
  const g = env(ac, dest, t, a, dur, peak);
  o.connect(g); o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}
export function noise(ac, dest, t, dur, ftype, f0, f1, q, peak, a = 0.003, brown = false) {
  const s = ac.createBufferSource(); s.buffer = brown ? pinkish(ac) : noiseBuf(ac); s.loop = true;
  const f = ac.createBiquadFilter(); f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(Math.max(20, f0), t);
  if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = env(ac, dest, t, a, dur, peak);
  s.connect(f); f.connect(g);
  s.start(t, R(0, 1)); s.stop(t + a + dur + 0.05);
  return f;
}
// FM bell/blip
function fm(ac, dest, t, fc, ratio, idx, dur, peak) {
  const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain();
  c.frequency.value = fc; m.frequency.value = fc * ratio;
  mg.gain.setValueAtTime(fc * idx, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
  m.connect(mg); mg.connect(c.frequency);
  const g = env(ac, dest, t, 0.003, dur, peak);
  c.connect(g); c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
}
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
export { midi, fm };

// Each recipe: (ac, out, t, p) where p = {v: variation 0..1, i: intensity}
export const SFX = {
  plasma(ac, o, t) {
    const f = R(780, 920);
    osc(ac, o, 'sawtooth', f, f * 0.22, t, 0.16, 0.22, 0.002);
    osc(ac, o, 'square', f * 2.01, f * 0.4, t, 0.09, 0.07, 0.001);
    noise(ac, o, t, 0.05, 'highpass', 3000, 6000, 0.7, 0.12, 0.001);
    osc(ac, o, 'sine', 140, 50, t, 0.1, 0.25, 0.002);
  },
  flame(ac, o, t) {
    noise(ac, o, t, 0.28, 'bandpass', 1800, 900, 0.6, 0.2, 0.04);
    noise(ac, o, t, 0.3, 'lowpass', 500, 250, 0.7, 0.2, 0.03, true);
    noise(ac, o, t + 0.03, 0.2, 'highpass', 5000, 3000, 0.5, 0.05, 0.05);
  },
  rocket(ac, o, t) {
    noise(ac, o, t, 0.9, 'lowpass', 1400, 300, 0.8, 0.3, 0.05, true);
    noise(ac, o, t, 0.6, 'bandpass', 2500, 700, 1.2, 0.12, 0.02);
    osc(ac, o, 'sawtooth', 220, 70, t, 0.5, 0.12, 0.02);
    osc(ac, o, 'sine', 90, 40, t, 0.3, 0.3, 0.005);
  },
  explosion(ac, o, t, p) {
    const s = 0.8 + (p.v || 0) * 0.4;
    osc(ac, o, 'sine', 95, 24, t, 1.3 * s, 0.9, 0.003); // sub boom
    osc(ac, o, 'triangle', 220, 45, t, 0.5 * s, 0.25, 0.002);
    noise(ac, o, t, 1.4 * s, 'lowpass', 3200, 120, 0.9, 0.6, 0.002, true);
    noise(ac, o, t, 0.5, 'highpass', 1500, 600, 0.6, 0.25, 0.001);
    noise(ac, o, t + 0.12, 0.9, 'bandpass', 700, 200, 0.8, 0.25, 0.03);
  },
  impact(ac, o, t) {
    noise(ac, o, t, 0.07, 'bandpass', R(1500, 2600), 600, 1.5, 0.28, 0.001);
    osc(ac, o, 'triangle', R(190, 260), 60, t, 0.09, 0.28, 0.001);
  },
  screech(ac, o, t, p) {
    const v = p.v ?? R(), base = 600 + v * 1400, dur = 0.35 + v * 0.45, kind = Math.floor(v * 3.99);
    const car = ac.createOscillator(); car.type = kind === 1 ? 'square' : 'sawtooth';
    car.frequency.setValueAtTime(base, t);
    car.frequency.linearRampToValueAtTime(base * (kind === 2 ? 0.55 : 1.5), t + dur * 0.4);
    car.frequency.exponentialRampToValueAtTime(base * (kind === 0 ? 0.4 : 0.8), t + dur);
    const vib = ac.createOscillator(), vg = ac.createGain();
    vib.frequency.value = 18 + v * 40; vg.gain.value = base * (0.05 + 0.1 * (kind === 3 ? 1 : 0.4));
    vib.connect(vg); vg.connect(car.frequency);
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 4;
    f1.frequency.setValueAtTime(900 + v * 600, t); f1.frequency.linearRampToValueAtTime(2200 - v * 700, t + dur);
    const g = env(ac, o, t, 0.02, dur, 0.22);
    car.connect(f1); f1.connect(g);
    car.start(t); vib.start(t); car.stop(t + dur + 0.08); vib.stop(t + dur + 0.08);
    noise(ac, o, t, dur * 0.8, 'bandpass', 3000, 1500, 2, 0.06, 0.02);
  },
  kill(ac, o, t) {
    noise(ac, o, t, 0.22, 'lowpass', 1800, 200, 0.9, 0.45, 0.002);
    noise(ac, o, t + 0.02, 0.12, 'bandpass', 600, 250, 3, 0.3, 0.002);
    osc(ac, o, 'sine', 160, 38, t, 0.25, 0.45, 0.002);
    for (let i = 0; i < 3; i++) osc(ac, o, 'sine', R(250, 500), R(80, 150), t + R(0.04, 0.16), 0.05, 0.12, 0.001);
  },
  build(ac, o, t) {
    const hit = (tt, f) => { fm(ac, o, tt, f, 3.7, 1.2, 0.4, 0.2); noise(ac, o, tt, 0.05, 'highpass', 4000, 3000, 0.7, 0.2, 0.001); osc(ac, o, 'triangle', 130, 70, tt, 0.12, 0.3, 0.001); };
    hit(t, 410); hit(t + 0.13, 520);
    [0, 1, 2, 3].forEach(i => osc(ac, o, 'sine', 900 * Math.pow(1.5, i % 3) * (1 + i * 0.05), 1500 + i * 400, t + 0.3 + i * 0.06, 0.12, 0.08, 0.005)); // hologram chirp
  },
  hurt(ac, o, t) {
    osc(ac, o, 'sawtooth', 240, 80, t, 0.28, 0.3, 0.003);
    osc(ac, o, 'square', 120, 55, t, 0.3, 0.2, 0.003);
    noise(ac, o, t, 0.15, 'bandpass', 900, 300, 1, 0.3, 0.002);
  },
  wave(ac, o, t) { // low horn, two blasts
    [0, 0.75].forEach((d, k) => {
      const f = k ? 98 : 110;
      for (const det of [-8, 8]) osc(ac, o, 'sawtooth', f, f * 0.98, t + d, 0.9, 0.16, 0.08, det);
      osc(ac, o, 'square', f / 2, f / 2, t + d, 0.9, 0.12, 0.08);
      osc(ac, o, 'sawtooth', f * 1.5, f * 1.5, t + d, 0.8, 0.06, 0.1);
    });
  },
  pickup(ac, o, t) {
    [0, 4, 7, 12].forEach((s, i) => fm(ac, o, t + i * 0.055, midi(79 + s), 2, 0.6, 0.35, 0.16));
  },
  turret(ac, o, t) {
    osc(ac, o, 'square', R(480, 560), 110, t, 0.07, 0.15, 0.001);
    noise(ac, o, t, 0.05, 'highpass', 2500, 1500, 0.7, 0.16, 0.001);
    osc(ac, o, 'sine', 100, 55, t, 0.07, 0.15, 0.001);
  },
  ui(ac, o, t) { osc(ac, o, 'sine', 1200, 1300, t, 0.05, 0.12, 0.002); },
  ui_confirm(ac, o, t) { osc(ac, o, 'sine', 800, 800, t, 0.06, 0.12, 0.002); osc(ac, o, 'sine', 1200, 1200, t + 0.06, 0.1, 0.12, 0.002); },
  ui_error(ac, o, t) { osc(ac, o, 'square', 180, 150, t, 0.12, 0.1, 0.002); osc(ac, o, 'square', 140, 120, t + 0.1, 0.14, 0.1, 0.002); },
};
export const ALIASES = { shoot: 'plasma', hit: 'impact', chirp: 'build', splat: 'kill', blip: 'ui', click: 'ui', confirm: 'ui_confirm', error: 'ui_error' };
// Per-sound loudness trim and minimum spacing (s) to avoid stacking floods
export const META = {
  plasma: { g: 0.9, gap: 0.04 }, flame: { g: 0.8, gap: 0.12 }, rocket: { g: 0.8, gap: 0.2 }, explosion: { g: 0.9, gap: 0.05 },
  impact: { g: 0.9, gap: 0.03 }, screech: { g: 0.5, gap: 0.08 }, kill: { g: 0.7, gap: 0.04 }, build: { g: 0.7, gap: 0.1 },
  hurt: { g: 0.8, gap: 0.15 }, wave: { g: 0.8, gap: 1 }, pickup: { g: 0.6, gap: 0.04 }, turret: { g: 0.8, gap: 0.04 },
  ui: { g: 0.6, gap: 0.03, global: true }, ui_confirm: { g: 0.6, gap: 0.1, global: true }, ui_error: { g: 0.6, gap: 0.1, global: true },
};
