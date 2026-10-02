// Offline validation: node src/audio/check.mjs  (needs node-web-audio-api; set NWA=/path/to/index if not resolvable)
import { createRequire } from 'module';
const req = createRequire(process.env.NWA_FROM || import.meta.url);
const { OfflineAudioContext } = req('node-web-audio-api');
import { SFX, META, setRandom } from './synth.js';
import { Music, Ambient } from './music.js';
import { buildChain } from './chain.js';
let s = 1; setRandom(() => { s = (s * 16807) % 2147483647; return s / 2147483647; });
const SR = 44100;
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let l = 2; l <= n; l <<= 1) { const a = -2 * Math.PI / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const c = Math.cos(a * k), sn = Math.sin(a * k), x = i + k, y = x + l / 2; const tr = re[y] * c - im[y] * sn, ti = re[y] * sn + im[y] * c; re[y] = re[x] - tr; im[y] = im[x] - ti; re[x] += tr; im[x] += ti; } } }
function analyze(buf) {
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, sum = 0, nan = 0; const n = L.length;
  for (let i = 0; i < n; i++) { for (const v of [L[i], R[i]]) { if (!Number.isFinite(v)) { nan++; continue; } peak = Math.max(peak, Math.abs(v)); sum += v * v; } }
  const rms = Math.sqrt(sum / (2 * n));
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N);
  const start = Math.max(0, Math.min(n - N, Math.floor(n * 0.0))); // spectrum of whole-chunk average
  let cent = 0, tot = 0, lo = 0, hi = 0; const mag = new Float64Array(N / 2);
  for (let off = 0; off + N <= n; off += N * 2) { for (let i = 0; i < N; i++) { re[i] = L[off + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; } fft(re, im); for (let k = 0; k < N / 2; k++) mag[k] += Math.hypot(re[k], im[k]); }
  for (let k = 1; k < N / 2; k++) { const f = k * SR / N; cent += f * mag[k]; tot += mag[k]; if (f < 250) lo += mag[k]; else if (f > 4000) hi += mag[k]; }
  return { peak, rms, nan, centroid: tot ? cent / tot : 0, lowPct: tot ? 100 * lo / tot : 0, highPct: tot ? 100 * hi / tot : 0 };
}
const fmt = r => `peak=${r.peak.toFixed(3)} rms=${r.rms.toFixed(4)} (${(20 * Math.log10(r.rms + 1e-9)).toFixed(1)}dB) nan=${r.nan} centroid=${r.centroid.toFixed(0)}Hz low<250=${r.lowPct.toFixed(0)}% high>4k=${r.highPct.toFixed(0)}%`;
let fail = 0;
const check = (name, r, { minRms = 0.002, maxPeak = 1.0 } = {}) => { const ok = r.nan === 0 && r.peak <= maxPeak && r.rms >= minRms; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(14)} ${fmt(r)}`); };
async function render(dur, build) { const ac = new OfflineAudioContext(2, Math.floor(SR * dur), SR); const ch = buildChain(ac); build(ac, ch); return analyze(await ac.startRendering()); }

console.log('--- SFX (through full master chain, gain = META trim) ---');
for (const name of Object.keys(SFX)) {
  const r = await render(2.6, (ac, ch) => { const g = ac.createGain(); g.gain.value = (META[name]?.g ?? 0.6); g.connect(ch.sfx); SFX[name](ac, g, 0.05, { v: 0.5 }); });
  check('sfx:' + name, r);
}
console.log('--- Screech variants ---');
for (const v of [0, 0.3, 0.6, 0.95]) check('screech v=' + v, await render(1.5, (ac, ch) => { const g = ac.createGain(); g.gain.value = 0.5; g.connect(ch.sfx); SFX.screech(ac, g, 0.05, { v }); }));
console.log('--- Music ---');
for (const I of [0, 0.5, 1]) check('music I=' + I, await render(14, (ac, ch) => { const m = new Music(ac, ch.music); m.intensity = I; m.next = 0; m.schedule(14); }), { minRms: 0.003 });
console.log('--- Ambient ---');
check('ambient', await render(10, (ac, ch) => { const a = new Ambient(ac, ch.amb, 0); a.schedule(10); }), { minRms: 0.002 });
console.log('--- Stress: full mix, 12 explosions + 40 shots + music I=1 + ambient ---');
const mix = await render(8, (ac, ch) => {
  const m = new Music(ac, ch.music); m.intensity = 1; m.next = 0; m.schedule(8);
  const a = new Ambient(ac, ch.amb, 0); a.schedule(8);
  const g = ac.createGain(); g.gain.value = 0.9; g.connect(ch.sfx);
  for (let i = 0; i < 12; i++) SFX.explosion(ac, g, 1 + i * 0.05, { v: i / 12 });
  for (let i = 0; i < 40; i++) { SFX.plasma(ac, g, 0.5 + i * 0.1, {}); SFX.screech(ac, g, 0.5 + i * 0.15, {}); SFX.kill(ac, g, 0.5 + i * 0.12, {}); }
});
check('stress-mix', mix, { maxPeak: 1.0 });
console.log(fail ? `\n${fail} FAILED` : '\nALL AUDIO CHECKS PASSED'); process.exit(fail ? 1 : 0);
