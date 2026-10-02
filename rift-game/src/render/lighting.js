// RIFTFALL lighting: alien dusk/dawn sky dome, snapped sun shadows, hemisphere + IBL, pooled point lights,
// drifting dust / fog wisps, time-of-day. Height fog + god rays are composited in postfx.js using ctx.lighting.params.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const C = (r, g, b) => new THREE.Color(r, g, b);

// Time-of-day keys (t: 0 night, .25 alien dawn, .5 noon, .75 dusk). Colours are linear.
const KEYS = [
  { t: 0.00, top: C(0.004, 0.006, 0.03), hor: C(0.03, 0.05, 0.12), sun: C(0.35, 0.5, 1.0), sunI: 0.8, az: 215, el: 38, hemS: C(0.07, 0.1, 0.26), hemG: C(0.03, 0.025, 0.06), hemI: 0.9, fog: C(0.025, 0.045, 0.1), fogD: 0.018, night: 1.0, expo: 1.15 },
  { t: 0.25, top: C(0.05, 0.1, 0.32), hor: C(1.0, 0.36, 0.16), sun: C(1.0, 0.5, 0.24), sunI: 6.8, az: 218, el: 22, hemS: C(0.12, 0.30, 0.46), hemG: C(0.34, 0.12, 0.07), hemI: 0.95, fog: C(0.30, 0.2, 0.28), fogD: 0.020, night: 0.45, expo: 1.0 },
  { t: 0.50, top: C(0.08, 0.30, 0.62), hor: C(0.55, 0.62, 0.62), sun: C(1.0, 0.9, 0.74), sunI: 6.6, az: 235, el: 58, hemS: C(0.28, 0.46, 0.62), hemG: C(0.24, 0.16, 0.1), hemI: 1.3, fog: C(0.34, 0.5, 0.58), fogD: 0.011, night: 0.0, expo: 0.9 },
  { t: 0.75, top: C(0.1, 0.05, 0.28), hor: C(1.0, 0.2, 0.2), sun: C(1.0, 0.36, 0.2), sunI: 6.2, az: 252, el: 18, hemS: C(0.18, 0.18, 0.46), hemG: C(0.36, 0.1, 0.1), hemI: 0.9, fog: C(0.3, 0.14, 0.26), fogD: 0.022, night: 0.55, expo: 1.0 },
];
const _tmpC = new THREE.Color();
function sampleKeys(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  for (let k = 0; k < KEYS.length; k++) if (t >= KEYS[k].t) i = k;
  const a = KEYS[i], b = KEYS[(i + 1) % KEYS.length];
  const bt = i === KEYS.length - 1 ? 1 : b.t;
  let f = (t - a.t) / (bt - a.t); f = f * f * (3 - 2 * f);
  const o = {};
  for (const k of ['top', 'hor', 'sun', 'hemS', 'hemG', 'fog']) o[k] = a[k].clone().lerp(b[k], f);
  for (const k of ['sunI', 'az', 'el', 'hemI', 'fogD', 'night', 'expo']) o[k] = a[k] + (b[k] - a[k]) * f;
  return o;
}

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const SKY_FS = `
precision highp float;
varying vec3 vDir;
uniform vec3 uTop,uHor,uSunDir,uSunCol,uM1,uM2;
uniform float uNight,uTime;
float h31(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+7.1; a*=.5; } return s; }
vec3 moon(vec3 d, vec3 md, float r, vec3 tint, float seed){
  float c = dot(d, md); float ang = acos(clamp(c,-1.,1.));
  float halo = exp(-ang*ang/(r*r*14.)) * .22;
  if(ang > r) return tint*halo;
  // sphere normal from disc coords
  vec3 u = normalize(cross(md, vec3(0,1,0))), v = cross(u, md);
  vec2 q = vec2(dot(d,u), dot(d,v)) / r; float z = sqrt(max(0.,1.-dot(q,q)));
  vec3 n = normalize(u*q.x + v*q.y + md*z);
  float lit = clamp(dot(n, normalize(uSunDir*.6 + vec3(.5,.3,.4)))*.8+.25, 0., 1.);
  float cr = fbm(n*5.+seed); float cr2 = fbm(n*14.+seed*3.);
  vec3 col = tint * (.55 + .7*cr) * (.8+.4*cr2) * lit * 1.6;
  float edge = smoothstep(r, r*.97, ang);
  return mix(tint*halo, col, edge);
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(h,0.,1.), .5));
  col = mix(col, uHor*.35, smoothstep(0.,-.35,h));
  float sd = max(dot(d,uSunDir),0.);
  col += uSunCol * (pow(sd,6.)*.25 + pow(sd,48.)*.7 + smoothstep(.99965,.9999,sd)*14.);
  // layered haze band at horizon
  col += uHor * exp(-abs(h)*9.) * .35;
  float vis = .25 + uNight*.9;
  // nebula clouds
  vec3 np = d*2.2 + vec3(uTime*.003, 0., uTime*.002);
  float n1 = fbm(np), n2 = fbm(np*1.7+11.);
  float neb = smoothstep(.42,.8,n1) * smoothstep(0.,.35,h+.1);
  vec3 nc = mix(vec3(.05,.55,.62), vec3(.75,.12,.55), smoothstep(.3,.75,n2));
  col += nc * neb * vis * .55 * (.4+.8*fbm(np*4.));
  // stars
  vec3 sp = d*260.; vec3 id = floor(sp); float rn = h31(id);
  float star = step(.9935, rn) * smoothstep(.55,.0, length(fract(sp)-.5)) * (.5+.5*sin(uTime*(1.+rn*5.)+rn*60.));
  col += vec3(.8,.9,1.)*star*3.* uNight * smoothstep(-.05,.2,h);
  vec3 sp2 = d*520.; float rn2 = h31(floor(sp2)); col += vec3(1.,.9,.8)*step(.985,rn2)*smoothstep(.5,.0,length(fract(sp2)-.5))*.8*uNight*smoothstep(0.,.2,h);
  // two moons
  col += moon(d, uM1, .085, vec3(.65,.85,.95), 1.3) * (.35+uNight*.65);
  col += moon(d, uM2, .045, vec3(1.,.62,.45), 7.7) * (.35+uNight*.65);
  gl_FragColor = vec4(col,1.);
}`;

const DUST_VS = `
attribute vec4 aSeed; // xyz random, w size random
uniform vec3 uCenter, uBox, uWind; uniform float uTime, uPx, uSize, uY0, uYH, uFade;
varying float vA; varying float vT;
void main(){
  vec3 s = aSeed.xyz;
  vec3 p = s*uBox + uWind*uTime;
  p += vec3(sin(uTime*.23+s.x*40.), sin(uTime*.31+s.y*30.)*.6, cos(uTime*.19+s.z*50.))*(1.2+s.y*2.);
  p = mod(p - uCenter + uBox*.5, uBox) - uBox*.5;
  vec3 w = vec3(uCenter.x+p.x, uY0 + fract(s.y*7.31+s.z)*uYH + p.y*.0, uCenter.z+p.z);
  float edge = 1. - smoothstep(.6,1., max(abs(p.x)/(uBox.x*.5), abs(p.z)/(uBox.z*.5)));
  vec4 mv = viewMatrix * vec4(w,1.);
  gl_Position = projectionMatrix * mv;
  float size = uSize*(.5+aSeed.w);
  gl_PointSize = clamp(size * uPx / max(-mv.z,.5), 1., 220.);
  vA = edge * uFade; vT = aSeed.w + sin(uTime*(.6+aSeed.w*2.)+s.x*20.)*.5;
}`;
const DUST_FS = `
precision highp float; uniform vec3 uColor; uniform float uOpacity; uniform float uSoft;
varying float vA; varying float vT;
void main(){ vec2 q = gl_PointCoord*2.-1.; float r = dot(q,q); if(r>1.) discard;
  float a = exp(-r*uSoft) * vA * uOpacity * (.7+.6*clamp(vT,0.,1.));
  gl_FragColor = vec4(uColor, a); }`;

function makeParticles(count, o) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4), pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const m = new THREE.ShaderMaterial({
    vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...o.box) }, uWind: { value: new THREE.Vector3(...o.wind) },
      uTime: { value: 0 }, uPx: { value: 700 }, uSize: { value: o.size }, uY0: { value: o.y0 }, uYH: { value: o.yh }, uFade: { value: 1 },
      uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: o.opacity }, uSoft: { value: o.soft },
    },
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; p.renderOrder = 5;
  return p;
}

export function init(ctx) {
  const { scene, renderer, q } = ctx;
  const lowfx = q.get('lowfx') === '1';
  ctx.lowfx = lowfx;

  // ---- time of day
  let tod = q.has('time') ? parseFloat(q.get('time')) : 0.27;
  if (!isFinite(tod)) tod = 0.27;
  const cycle = q.has('cycle') ? Math.max(5, parseFloat(q.get('cycle')) || 240) : 0; // seconds per full day
  let lastEnvT = -1;

  // ---- sky dome
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() }, uM1: { value: new THREE.Vector3(-0.5, 0.55, -0.67).normalize() },
      uM2: { value: new THREE.Vector3(0.62, 0.38, -0.69).normalize() }, uNight: { value: 0 }, uTime: { value: 0 },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -1000;
  scene.add(sky);

  // ---- lights
  const sun = new THREE.DirectionalLight(0xffffff, 4);
  const MAP = lowfx ? 1024 : 2048, R = 34;
  sun.castShadow = true;
  sun.shadow.mapSize.set(MAP, MAP);
  const sc = sun.shadow.camera;
  sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 240;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x88aacc, 0x442211, 1);
  scene.add(hemi);
  // Fill light from camera side (opposite sun) so backlit faces keep colour; no shadows.
  const fill = new THREE.DirectionalLight(0x6fb8c8, 0.5);
  scene.add(fill, fill.target);

  // ---- IBL from the sky itself
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(sky.geometry, skyMat));
  let envRT = null;
  scene.environmentIntensity = 0.55;
  function rebuildEnv() {
    try {
      const old = envRT;
      envRT = pmrem.fromScene(skyScene, 0.04, 1, 500);
      scene.environment = envRT.texture;
      if (old) old.dispose();
    } catch (e) { /* ignore: env map is optional */ }
  }

  // ---- pooled dynamic point lights (fixed count => no shader recompiles)
  const NL = lowfx ? 3 : 6;
  const pool = [];
  for (let i = 0; i < NL; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.userData = { life: 0, ttl: 1, base: 0, prio: 0 };
    scene.add(l); pool.push(l);
  }
  function addLight(pos, color = 0xffaa55, intensity = 3, radius = 10, ttl = 0.25) {
    let best = null, bs = Infinity;
    for (const l of pool) {
      const u = l.userData;
      const score = u.life <= 0 ? -1 : (u.life / u.ttl) * u.base; // free first, else weakest remaining
      if (score < bs) { bs = score; best = l; }
    }
    if (!best) return null;
    const u = best.userData;
    if (u.life > 0 && bs > intensity) return null;
    best.position.copy(pos);
    best.color.set(color);
    best.distance = radius;
    u.life = u.ttl = Math.max(0.03, ttl); u.base = intensity * 4;
    best.intensity = u.base;
    return best;
  }

  // ---- particles
  const wisps = makeParticles(lowfx ? 10 : 22, { box: [70, 1, 70], wind: [1.4, 0, 0.5], size: 16, y0: 2.2, yh: 5, opacity: 0.05, soft: 2.2, additive: false });
  const motes = makeParticles(lowfx ? 60 : 200, { box: [56, 1, 56], wind: [0.9, 0, 0.35], size: 0.1, y0: 0.4, yh: 9, opacity: 0.9, soft: 2.8, additive: true });
  scene.add(wisps, motes);

  const params = {
    sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunIntensity: 1,
    fogColor: new THREE.Color(), fogDensity: 0.02, fogHeightFalloff: 0.14, fogBaseY: 0, fogMax: 0.82,
    fogSunTint: new THREE.Color(), exposure: 1, night: 0, skyTop: new THREE.Color(), skyHorizon: new THREE.Color(),
    scatter: 1.0, sun,
  };
  const focus = new THREE.Vector3(), snapped = new THREE.Vector3(), fwdL = new THREE.Vector3(), rightL = new THREE.Vector3(), upL = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function setTime(t) { tod = t; }

  function apply(dt) {
    const k = sampleKeys(tod);
    const az = k.az * DEG, el = k.el * DEG;
    params.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    params.sunColor.copy(k.sun); params.sunIntensity = k.sunI;
    sun.color.copy(k.sun); sun.intensity = k.sunI;
    hemi.color.copy(k.hemS); hemi.groundColor.copy(k.hemG); hemi.intensity = k.hemI;
    fill.color.copy(k.hemS).lerp(_tmpC.setRGB(0.4, 0.8, 0.9), 0.5); fill.intensity = 0.25 + k.hemI * 0.15;
    params.fogColor.copy(k.fog); params.fogDensity = k.fogD; params.exposure = k.expo; params.night = k.night;
    params.fogSunTint.copy(k.sun).lerp(k.hor, 0.4);
    params.skyTop.copy(k.top); params.skyHorizon.copy(k.hor);
    const u = skyMat.uniforms;
    u.uTop.value.copy(k.top); u.uHor.value.copy(k.hor); u.uSunCol.value.copy(k.sun).multiplyScalar(0.8);
    u.uSunDir.value.copy(params.sunDir); u.uNight.value = k.night; u.uTime.value = ctx.time;
    // Moons drift very slowly
    u.uM1.value.set(-0.5 + Math.sin(ctx.time * 0.002) * 0.05, 0.55, -0.67).normalize();
    scene.environmentIntensity = 0.28 + 0.35 * (1 - k.night * 0.5);
  }

  apply(0);
  rebuildEnv();
  lastEnvT = tod;

  const api = {
    sun, hemi, params, sky, setTime, get time() { return tod; },
    addLight,
    setCycle(sec) { /* runtime cycle control */ api._cycle = sec; },
    _cycle: cycle,
    dispose() { pmrem.dispose(); },
  };

  api.update = function (dt, c) {
    if (api._cycle) tod += dt / api._cycle;
    apply(dt);
    // env refresh when time moves meaningfully
    if (api._cycle && Math.abs(tod - lastEnvT) > 0.02 && !lowfx) { rebuildEnv(); lastEnvT = tod; }

    const pp = c.player && c.player.pos ? c.player.pos : null;
    focus.set(pp ? pp.x : 0, 0, (pp ? pp.z : 0) - 4);
    // Stable texel snapping of shadow frustum in light space
    fwdL.copy(params.sunDir);                  // camera +z axis in light space
    rightL.crossVectors(UP, fwdL).normalize();
    upL.crossVectors(fwdL, rightL);
    const texel = (2 * R) / MAP;
    const x = focus.dot(rightL), y = focus.dot(upL);
    snapped.copy(focus)
      .addScaledVector(rightL, Math.round(x / texel) * texel - x)
      .addScaledVector(upL, Math.round(y / texel) * texel - y);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(params.sunDir, 100);
    sun.target.updateMatrixWorld();
    // fill from the opposite side, slightly above
    fill.position.set(-params.sunDir.x * 50 + focus.x, 40, -params.sunDir.z * 50 + focus.z);
    fill.target.position.copy(focus); fill.target.updateMatrixWorld();

    sky.position.copy(c.camera.position);

    // particles
    const hpx = renderer.getDrawingBufferSize(_v2).y * 0.5 * c.camera.projectionMatrix.elements[5];
    for (const p of [wisps, motes]) {
      const u = p.material.uniforms;
      u.uCenter.value.set(pp ? pp.x : 0, 0, pp ? pp.z : 0); u.uTime.value = c.time; u.uPx.value = hpx;
    }
    wisps.material.uniforms.uColor.value.copy(params.fogColor).multiplyScalar(2.2).lerp(params.fogSunTint, 0.35);
    wisps.material.uniforms.uOpacity.value = 0.02 + params.fogDensity * 1.5;
    motes.material.uniforms.uColor.value.copy(params.sunColor).lerp(_tmpC.setRGB(0.6, 1.0, 0.9), 0.35 + params.night * 0.4).multiplyScalar(1.6 + params.night * 2);

    // point-light fade
    for (const l of pool) {
      const u = l.userData;
      if (u.life > 0) {
        u.life -= dt;
        const f = Math.max(0, u.life / u.ttl);
        l.intensity = u.base * f * f;
        if (u.life <= 0) l.intensity = 0;
      }
    }
  };
  return api;
}
const _v2 = new THREE.Vector2();

export function update(dt, ctx) { ctx.lighting.update(dt, ctx); }
