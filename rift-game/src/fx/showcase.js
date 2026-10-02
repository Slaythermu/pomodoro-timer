// FX debug showcase. Evaluated in the page by tools/shot.mjs (NOT an ES module; plain script).
//   node tools/shot.mjs /tmp/fx.png 20 "seed=1&dt=0.0166&fxshow=all" 1600 900 src/fx/showcase.js
// fxshow: all | explosion | blood | muzzle | beams | build | atlas ; fxt = extra frames stepped inside the script (default 0)
(() => {
  const g = window.__game, q = new URLSearchParams(location.search), mode = q.get('fxshow') || 'all', THREE = g.THREE;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // fallback ground so decals/additive have something to sit on when terrain is absent
  let hasGround = false; g.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && o.scale.x > 30) hasGround = true; });
  if (!g.terrain || !g.terrain.heightAt) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x1d2a26, roughness: 1}));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; g.scene.add(m);
    g.scene.add(new THREE.HemisphereLight(0x88aacc, 0x221a14, 0.8));
  }
  if (mode === 'atlas') {
    import('/src/fx/atlas.js').then(a => { const c = a.atlasToCanvas(g.fx.atlas); c.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:900px;background:#334;z-index:99'; document.body.appendChild(c); });
    return;
  }
  const fx = g.fx, step = n => window.__step(n, 1 / 60);
  const row = (types, z, opts) => types.forEach((t, i) => fx.burst(t, V((i - (types.length - 1) / 2) * 5.2, 0.6, z), Object.assign({dir: V(1, 0.2, 0.2)}, opts && opts[t])));
  if (mode === 'explosion') { g.camera.position.set(0, 16, 12); g.camera.lookAt(0, 0, 0); fx.burst('explosion', V(0, 0, 0), {scale: 1}); step(+(q.get('fxt') || 16)); return; }
  if (mode === 'blood') { g.camera.position.set(0, 12, 9); g.camera.lookAt(0, 0, 0);
    for (let i = 0; i < 6; i++) { fx.burst('blood', V((i - 2.5) * 2.2, 0.8, (i % 2) * 2 - 1), {dir: V(Math.sin(i), 0.3, Math.cos(i))}); step(4); }
    step(+(q.get('fxt') || 60)); return; }
  if (mode === 'beams') {
    const u = fx._update; let t = 0;
    fx._update = (dt, c) => { u(dt, c); t += dt;
      fx.beam(V(-9, 1.4, 4), V(-2, 0.8, 4 + Math.sin(t * 3)), 0xff3344, {width: .09, jitter: 0.01, flicker: .15});
      fx.beam(V(-9, 1.4, 2), V(-2, 1.0, 1), 0x66ccff, {width: .16, jitter: .09});
      fx.beam(V(1, 3, -3), V(8, 0.5, 2), 0xaa88ff, {width: .12, jitter: .35, segments: 16});
      fx.beam(V(1, 3, -3), V(8, 0.5, 2), 0xffffff, {width: .05, jitter: .35, segments: 16, endGlow: false});
      fx.beam(V(-6, 0.5, -3), V(0, 4, -5), 0x66ff99, {width: .22, jitter: .12}); };
    step(+(q.get('fxt') || 10)); return; }
  if (mode === 'build') { g.camera.position.set(0, 14, 11); g.camera.lookAt(0, 0, 0); fx.burst('build', V(-4, 0, 0), {radius: 2}); fx.burst('heal', V(4, 1, 0)); step(+(q.get('fxt') || 25)); return; }
  // all: staggered so everything is mid-life at the capture frame
  g.camera.position.set(0, 20, 15); g.camera.lookAt(0, 0, 0);
  fx.burst('explosion', V(0, 0, -2), {scale: 1}); step(8);
  row(['blood', 'blood', 'blood'], 4, null); fx.burst('build', V(-9, 0, 0), {radius: 2}); fx.burst('heal', V(9, 1, 0)); step(4);
  row(['muzzle', 'impact', 'spark'], 7.5, {muzzle: {dir: V(1, 0, -0.4)}, impact: {normal: V(0, 1, 0), decal: true}});
  const u = fx._update; let t = 0;
  fx._update = (dt, c) => { u(dt, c); t += dt; fx.beam(V(-12, 1.2, 5), V(-4, 0.8, 8), 0xff3344, {width: .09, jitter: .01}); fx.beam(V(6, 2, 5), V(13, 0.5, 8), 0xaa88ff, {width: .11, jitter: .35}); };
  step(+(q.get('fxt') || 6));
})();
