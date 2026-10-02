// RIFTFALL audio: fully procedural WebAudio. API: ctx.audio.play(name,pos?), setVolume(v), toggleMute(), muted, intensity
import { SFX, ALIASES, META } from './synth.js';
import { Music, Ambient } from './music.js';
import { buildChain } from './chain.js';

export function init(ctx) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const A = { ac: null, chain: null, music: null, ambient: null, volume: 0.8, muted: false, intensity: 0, unlocked: false, voices: 0 };
  const last = {};
  const listener = { x: 0, z: 0 };
  let sinceTick = 0, smooth = 0;
  const tmp = new ctx.THREE.Vector3();

  function setup() {
    if (A.ac || !AC) return;
    try {
      A.ac = new AC({ latencyHint: 'interactive' });
      A.chain = buildChain(A.ac);
      A.music = new Music(A.ac, A.chain.music);
      A.ambient = new Ambient(A.ac, A.chain.amb);
      applyVolume();
    } catch (e) { console.warn('[audio] init failed', e); A.ac = null; }
  }
  function unlock() {
    try {
      setup();
      if (A.ac && A.ac.state !== 'running') A.ac.resume().catch(() => {});
      if (A.ac) { A.unlocked = true; A.music.next = Math.max(A.music.next, A.ac.currentTime + 0.1); }
    } catch (e) {}
  }
  for (const e of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) if (typeof addEventListener === 'function') addEventListener(e, unlock, { passive: true });
  function applyVolume() {
    if (!A.chain) return;
    const t = A.ac.currentTime;
    A.chain.master.gain.cancelScheduledValues(t);
    A.chain.master.gain.setTargetAtTime(A.muted ? 0 : A.volume, t, 0.05);
  }
  A.setVolume = v => { A.volume = Math.min(1, Math.max(0, +v || 0)); applyVolume(); };
  A.setMuted = m => { A.muted = !!m; applyVolume(); };
  A.toggleMute = () => { A.setMuted(!A.muted); return A.muted; };

  A.play = (name, pos, opts) => {
    try {
      if (!A.ac || A.ac.state !== 'running' || A.muted) return;
      name = ALIASES[name] || name;
      const fn = SFX[name]; if (!fn) return;
      const m = META[name] || { g: 0.6, gap: 0.03 }, ac = A.ac, now = ac.currentTime;
      if (now - (last[name] || -9) < m.gap) return;
      if (A.voices > 28) return;
      last[name] = now;
      let gain = m.g, pan = 0, cut = 20000;
      if (pos && !m.global) {
        const dx = pos.x - listener.x, dz = (pos.z ?? 0) - listener.z, d = Math.hypot(dx, dz);
        gain *= 1 / (1 + Math.pow(d / 22, 1.6));
        pan = Math.max(-0.9, Math.min(0.9, dx / 28));
        cut = Math.max(900, 14000 / (1 + d / 12));
        if (gain < 0.01) return;
      }
      const out = ac.createGain(); out.gain.value = gain;
      let tail = out;
      if (cut < 19000) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; out.connect(f); tail = f; }
      let node = tail;
      if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; tail.connect(p); node = p; }
      node.connect(A.chain.sfx);
      A.voices++;
      setTimeout(() => { A.voices = Math.max(0, A.voices - 1); try { node.disconnect(); out.disconnect(); } catch (e) {} }, 2200);
      fn(ac, out, now + 0.005, opts || {});
    } catch (e) { /* never break the game for audio */ }
  };

  // Event wiring
  const ev = ctx.ev;
  ev.on('shoot', d => {
    const w = String((d && d.weapon) || 'plasma').toLowerCase();
    const n = w.includes('flame') || w.includes('fire') ? 'flame' : w.includes('rocket') || w.includes('missile') ? 'rocket' : w.includes('turret') || w.includes('gun') || w.includes('mg') ? 'turret' : 'plasma';
    A.play(n, d && d.pos);
  });
  ev.on('hit', d => A.play('impact', d && d.pos));
  ev.on('kill', d => {
    const p = d && (d.pos || (d.enemy && d.enemy.pos));
    A.play('kill', p);
    if (Math.random() < 0.7) setTimeout(() => A.play('screech', p, { v: Math.random() }), 30);
    const r = d && d.enemy && d.enemy.radius;
    if (r && r > 1.6) setTimeout(() => A.play('explosion', p, { v: 0.3 }), 80);
  });
  ev.on('build', d => A.play('build', d && d.pos));
  ev.on('wave', () => A.play('wave'));
  ev.on('damage-player', () => A.play('hurt'));
  ev.on('resource', () => A.play('pickup'));
  ev.on('explosion', d => A.play('explosion', d && d.pos, { v: Math.random() }));

  A._tick = (dt) => {
    // intensity from wave and live enemy count
    const s = ctx.state || {}, n = (ctx.enemies && ctx.enemies.list) ? ctx.enemies.list.length : 0;
    const target = Math.min(1, Math.min(0.4, (s.wave || 0) * 0.05) + Math.min(0.6, n / 40));
    smooth += (target - smooth) * Math.min(1, dt * 0.5);
    A.intensity = smooth;
    if (A.ac && A.unlocked && A.ac.state === 'running') {
      A.music.intensity = smooth;
      const until = A.ac.currentTime + 0.4;
      if (A.music.next < A.ac.currentTime - 0.5) A.music.next = A.ac.currentTime + 0.05; // recover after stalls
      A.music.schedule(until);
      A.ambient.schedule(until);
    }
  };
  A.dispose = () => { try { A.ac && A.ac.close(); } catch (e) {} };
  A._listener = listener;
  A._mkTmp = () => tmp;
  A._setListener = (x, z) => { listener.x = x; listener.z = z; };
  return A;
}

export function update(dt, ctx) {
  const A = ctx.audio; if (!A || !A._tick) return;
  try {
    if (ctx.input && ctx.input.pressed && ctx.input.pressed.has('KeyM')) A.toggleMute();
    const p = ctx.player && ctx.player.pos;
    if (p) A._setListener(p.x, p.z); else if (ctx.camera) A._setListener(ctx.camera.position.x, ctx.camera.position.z - 19);
    A._tick(dt);
  } catch (e) {}
}
