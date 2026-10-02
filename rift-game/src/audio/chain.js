// Master chain: buses -> master -> compressor -> (+convolution reverb) -> limiter -> soft clip -> destination
export function makeImpulse(ac, dur = 2.2, decay = 3.2) {
  const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(2, n, ac.sampleRate);
  let s = 4242;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) {
      s = (s * 1664525 + 1013904223) >>> 0; const w = s / 2147483648 - 1;
      const k = i / n, a = 0.55 + 0.4 * (1 - k); // darken tail
      lp += (w - lp) * a;
      d[i] = lp * Math.pow(1 - k, decay) * (i < 400 ? i / 400 : 1);
    }
  }
  return b;
}
export function buildChain(ac) {
  const mk = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const sfx = mk(1), music = mk(0.55), amb = mk(0.6), master = mk(0.8);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  const rev = ac.createConvolver(); rev.buffer = makeImpulse(ac);
  const revSend = mk(0.22), revOut = mk(0.7);
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 200; // keep sub out of reverb
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  const shaper = ac.createWaveShaper(); // gentle tanh safety clip
  const N = 1024, curve = new Float32Array(N);
  for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1; curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2) * 0.95; }
  shaper.curve = curve;
  sfx.connect(master); music.connect(master); amb.connect(master);
  master.connect(comp); comp.connect(limiter);
  sfx.connect(revSend); music.connect(revSend); revSend.connect(hp); hp.connect(rev); rev.connect(revOut); revOut.connect(comp);
  limiter.connect(shaper); shaper.connect(ac.destination);
  return { sfx, music, amb, master, comp, limiter, shaper };
}
