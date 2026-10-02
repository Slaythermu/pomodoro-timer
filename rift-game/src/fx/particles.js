// RIFTFALL FX: GPU-instanced particle system, ground decals, beams, ambient motes.
// One draw call for all particles (premultiplied blending: per-particle "additive weight" lets one buffer mix
// glowing fire and opaque smoke), one for decals, one for ambient, one for beams. Zero per-frame allocations.
//
// Public API (ctx.fx):
//   burst(type,pos,opts)   type: muzzle|impact|explosion|blood|spark|heal|build
//        opts: {dir:Vector3, normal:Vector3, color:hex|Color, scale:number, radius:number, decal:bool, shake:number, light:bool}
//   beam(a,b,color,opts)   call every frame while active. opts:{width,jitter,segments,endGlow,flicker}
//   decal(kind,x,z,size,color,opts)   kind: 'scorch'|'splat'
//   clear(), stats()
import * as THREE from 'three';
import {buildAtlas, C} from './atlas.js';

const CAP = 9000, DECAL_CAP = 420, AMB_N = 150, BEAM_MAX = 48, BEAM_SEG = 16;
const S = 32;                                  // sim floats per particle
const [X, Y, Z, VX, VY, VZ, AGE, LIFE, S0, S1, ROT, SPIN, DRAG, GRAV, R0, G0, B0, R1, G1, B1, A0, ADD0, ADD1, CELL, STRETCH, FLAGS, SPLAT, FI, FO, GROW] =
  Array.from({length: 30}, (_, i) => i);
const F_FLAT = 1, F_SPLAT = 2, F_FLICKER = 4, F_BOUNCE = 8, F_DIE_GROUND = 16;

const VERT = /* glsl */`
attribute vec4 aPS; attribute vec4 aVel; attribute vec4 aCol; attribute vec4 aMisc;
varying vec2 vUv; varying vec4 vCol; varying float vAdd; varying float vVZ;
void main(){
  vec2 q = position.xy; float s = aPS.w;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp;
  if (aMisc.w > 0.5) {
    float c = cos(aMisc.x), sn = sin(aMisc.x);
    wp = aPS.xyz + vec3(c*q.x - sn*q.y, 0.0, sn*q.x + c*q.y) * s;
  } else if (aVel.w > 0.0) {
    vec3 vv = (viewMatrix * vec4(aVel.xyz, 0.0)).xyz;
    vec2 ax = vv.xy; float l2 = length(ax);
    ax = l2 > 1e-4 ? ax / l2 : vec2(1.0, 0.0);
    float L = s + l2 * aVel.w;
    wp = aPS.xyz + (right*ax.x + up*ax.y) * (q.x * L) + (right*(-ax.y) + up*ax.x) * (q.y * s);
  } else {
    float c = cos(aMisc.x), sn = sin(aMisc.x);
    vec2 r = vec2(c*q.x - sn*q.y, sn*q.x + c*q.y);
    wp = aPS.xyz + (right*r.x + up*r.y) * s;
  }
  vUv = (vec2(mod(aMisc.y, 4.0), floor(aMisc.y / 4.0)) + uv) * 0.25;
  vCol = aCol; vAdd = aMisc.z;
  vec4 mv = viewMatrix * vec4(wp, 1.0); vVZ = mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
#include <packing>
uniform sampler2D uAtlas; uniform sampler2D tDepth; uniform float uSoft; uniform vec2 uNF; uniform vec2 uRes; uniform float uSoftDist;
varying vec2 vUv; varying vec4 vCol; varying float vAdd; varying float vVZ;
void main(){
  vec4 t = texture2D(uAtlas, vUv);
  float a = t.a * vCol.a;
  if (uSoft > 0.5) {
    float sd = texture2D(tDepth, gl_FragCoord.xy / uRes).x;
    float sz = perspectiveDepthToViewZ(sd, uNF.x, uNF.y);
    a *= clamp((vVZ - sz) / uSoftDist, 0.0, 1.0);
  }
  if (a < 0.002) discard;
  vec3 c = vCol.rgb * t.rgb;
  gl_FragColor = vec4(c * a, a * (1.0 - vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const DECAL_VERT = /* glsl */`
attribute vec4 aGeo; attribute vec4 aRot; attribute vec4 aParams; attribute vec4 aEmis; attribute vec4 aBase; attribute vec4 aH;
varying vec2 vUv; varying vec4 vRot; varying vec4 vParams; varying vec4 vEmis; varying vec4 vBase;
void main(){
  vec2 q = position.xy; vec2 uv0 = uv;
  float h = mix(mix(aH.x, aH.y, uv0.x), mix(aH.z, aH.w, uv0.x), uv0.y);
  float c = cos(aRot.x), sn = sin(aRot.x);
  vec3 wp = vec3(aGeo.x + (c*q.x - sn*q.y) * aGeo.w, h + 0.035 + aGeo.w * 0.004, aGeo.z + (sn*q.x + c*q.y) * aGeo.w);
  vUv = (vec2(mod(aRot.y, 4.0), floor(aRot.y / 4.0)) + uv0) * 0.25;
  vRot = aRot; vParams = aParams; vEmis = aEmis; vBase = aBase;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const DECAL_FRAG = /* glsl */`
uniform sampler2D uAtlas; uniform float uTime;
varying vec2 vUv; varying vec4 vRot; varying vec4 vParams; varying vec4 vEmis; varying vec4 vBase;
void main(){
  vec4 t = texture2D(uAtlas, vUv);
  float age = uTime - vParams.x;
  float vis = clamp(age * 12.0, 0.0, 1.0) * (1.0 - smoothstep(vParams.y * 0.7, vParams.y, age));
  float cov = t.a * vRot.z * vis;
  float glow = exp(-max(age, 0.0) / vParams.z) + vParams.w * (0.8 + 0.2 * sin(uTime * 1.7 + vParams.x * 13.0));
  float pat = mix(pow(t.r, 1.4), t.r, vRot.w);
  vec3 em = vEmis.rgb * glow * pat * smoothstep(0.0, 0.25, t.a) * vis;
  vec3 base = vBase.rgb * (0.6 + 0.8 * t.b) * cov;
  vec3 col = base + em;
  if (cov + dot(em, vec3(1.0)) < 0.002) discard;
  gl_FragColor = vec4(col, cov);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BEAM_VERT = /* glsl */`
attribute vec2 aUv; attribute vec4 aColor; varying vec2 vUv; varying vec4 vColor;
void main(){ vUv = aUv; vColor = aColor; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = /* glsl */`
uniform float uTime; varying vec2 vUv; varying vec4 vColor;
void main(){
  float y = vUv.y, x = vUv.x;
  float glow = exp(-y*y*3.2), core = exp(-y*y*26.0);
  float endf = smoothstep(0.0, 0.04, x) * smoothstep(1.0, 0.94, x);
  float shimmer = 0.88 + 0.12 * sin(x * 70.0 - uTime * 45.0 + vColor.a * 9.0);
  vec3 c = (vColor.rgb * glow * 1.3 + vec3(1.0, 0.97, 0.9) * core * 2.4) * shimmer * endf;
  float a = (glow * 0.6 + core) * endf;
  gl_FragColor = vec4(c * min(a * 1.2, 1.0), 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const blend = {blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, transparent: true, depthWrite: false, depthTest: true};

const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();
const TAU = Math.PI * 2;

export function init(ctx) {
  const {scene, camera} = ctx;
  const atlas = buildAtlas();
  const group = new THREE.Group(); group.name = 'fx'; scene.add(group);

  // ---------------- quad geometry helper ----------------
  function quadBase(geo) {
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
  }
  const dyn = a => { a.setUsage(THREE.DynamicDrawUsage); return a; };

  // ---------------- particle material (shared by sim layer and ambient layer) ----------------
  const pmat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, ...blend,
    uniforms: {uAtlas: {value: atlas}, tDepth: {value: null}, uSoft: {value: 0}, uNF: {value: new THREE.Vector2(0.5, 400)}, uRes: {value: new THREE.Vector2(1600, 900)}, uSoftDist: {value: 0.9}},
  });
  function makeLayer(cap, order) {
    const geo = new THREE.InstancedBufferGeometry(); quadBase(geo);
    const a = {
      aPS: dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)),
      aVel: dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)),
      aCol: dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)),
      aMisc: dyn(new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)),
    };
    for (const k in a) geo.setAttribute(k, a[k]);
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, pmat); mesh.frustumCulled = false; mesh.renderOrder = order; group.add(mesh);
    return {geo, a, mesh};
  }
  const L = makeLayer(CAP, 20), AL = makeLayer(AMB_N, 19);
  const sim = new Float32Array(CAP * S);
  let n = 0;

  // ---------------- emission template (reused: no per-spawn allocation) ----------------
  const T = {};
  function reset() {
    T.x = T.y = T.z = T.vx = T.vy = T.vz = 0; T.life = 1; T.s0 = T.s1 = 1; T.grow = 0.5; T.rot = 0; T.spin = 0; T.drag = 0; T.grav = 0;
    T.r0 = T.g0 = T.b0 = T.r1 = T.g1 = T.b1 = 1; T.a0 = 1; T.add0 = T.add1 = 1; T.cell = C.GLOW; T.stretch = 0; T.flags = 0; T.splat = 0;
    T.fi = 0.1; T.fo = 1.5; T.delay = 0;
  }
  reset();
  function emit() {
    if (n >= CAP) return;
    const o = n++ * S;
    sim[o + X] = T.x; sim[o + Y] = T.y; sim[o + Z] = T.z; sim[o + VX] = T.vx; sim[o + VY] = T.vy; sim[o + VZ] = T.vz;
    sim[o + AGE] = -T.delay; sim[o + LIFE] = T.life; sim[o + S0] = T.s0; sim[o + S1] = T.s1; sim[o + ROT] = T.rot; sim[o + SPIN] = T.spin;
    sim[o + DRAG] = T.drag; sim[o + GRAV] = T.grav;
    sim[o + R0] = T.r0; sim[o + G0] = T.g0; sim[o + B0] = T.b0; sim[o + R1] = T.r1; sim[o + G1] = T.g1; sim[o + B1] = T.b1;
    sim[o + A0] = T.a0; sim[o + ADD0] = T.add0; sim[o + ADD1] = T.add1; sim[o + CELL] = T.cell; sim[o + STRETCH] = T.stretch;
    sim[o + FLAGS] = T.flags; sim[o + SPLAT] = T.splat; sim[o + FI] = T.fi; sim[o + FO] = T.fo; sim[o + GROW] = T.grow;
  }
  // colour helpers (HDR multiplier m)
  const _c = new THREE.Color();
  function c0(col, m = 1) { _c.set(col); T.r0 = _c.r * m; T.g0 = _c.g * m; T.b0 = _c.b * m; }
  function c1(col, m = 1) { _c.set(col); T.r1 = _c.r * m; T.g1 = _c.g * m; T.b1 = _c.b * m; }
  function c0v(r, g, b) { T.r0 = r; T.g0 = g; T.b0 = b; }
  function c1v(r, g, b) { T.r1 = r; T.g1 = g; T.b1 = b; }
  // direction scratch
  let dx = 0, dy = 0, dz = 0;
  function randDir(upBias = 0) {
    const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
    dx = s * Math.cos(a); dy = u + upBias; dz = s * Math.sin(a);
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  }
  // direction cone around (nx,ny,nz) with spread
  function coneDir(nx, ny, nz, spread) {
    randDir(); dx = nx + dx * spread; dy = ny + dy * spread; dz = nz + dz * spread;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  }
  const groundY = (x, z) => (ctx.terrain && ctx.terrain.heightAt) ? ctx.terrain.heightAt(x, z) || 0 : 0;

  // ---------------- decals ----------------
  const dgeo = new THREE.InstancedBufferGeometry();
  { const p = new THREE.PlaneGeometry(1, 1, 4, 4); dgeo.setAttribute('position', p.getAttribute('position')); dgeo.setAttribute('uv', p.getAttribute('uv')); dgeo.setIndex(p.getIndex()); }
  const D = {};
  for (const k of ['aGeo', 'aRot', 'aParams', 'aEmis', 'aBase', 'aH']) { D[k] = dyn(new THREE.InstancedBufferAttribute(new Float32Array(DECAL_CAP * 4), 4)); dgeo.setAttribute(k, D[k]); }
  dgeo.instanceCount = 0;
  const dmat = new THREE.ShaderMaterial({vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, ...blend, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: {uAtlas: {value: atlas}, uTime: {value: 0}}});
  const dmesh = new THREE.Mesh(dgeo, dmat); dmesh.frustumCulled = false; dmesh.renderOrder = 5; group.add(dmesh);
  let dHead = 0, dCount = 0, dDirty = false;
  function decal(kind, x, z, size, color, o) {
    const i = dHead; dHead = (dHead + 1) % DECAL_CAP; if (dCount < DECAL_CAP) dCount++;
    const rot = rnd() * TAU, cs = Math.cos(rot), sn = Math.sin(rot);
    const scorch = kind === 'scorch';
    _c.set(color === undefined ? 0xff7020 : color);
    const gm = (o && o.glow !== undefined) ? o.glow : (scorch ? 2.2 : 2.6);
    D.aGeo.setXYZW(i, x, 0, z, size);
    D.aRot.setXYZW(i, rot, scorch ? C.SCORCH : (rnd() < 0.5 ? C.SPLAT_A : C.SPLAT_B), scorch ? 0.92 : 0.88, scorch ? 1 : 0);
    D.aParams.setXYZW(i, ctx.time, (o && o.life) || (scorch ? 40 : 70), scorch ? 3.5 : 6, scorch ? 0.0 : (o && o.residual !== undefined ? o.residual : 0.3));
    D.aEmis.setXYZW(i, _c.r * gm, _c.g * gm, _c.b * gm, 1);
    if (scorch) D.aBase.setXYZW(i, 0.012, 0.010, 0.009, 1); else D.aBase.setXYZW(i, _c.r * 0.07, _c.g * 0.07, _c.b * 0.07, 1);
    // bilinear ground heights at the 4 rotated corners
    const h = (lx, lz) => groundY(x + (cs * lx - sn * lz) * size, z + (sn * lx + cs * lz) * size);
    D.aH.setXYZW(i, h(-.5, -.5), h(.5, -.5), h(-.5, .5), h(.5, .5));
    dDirty = true;
  }

  // ---------------- lights ----------------
  function light(x, y, z, color, inten, rad) { const l = ctx.lighting; if (l && l.addLight) l.addLight(new THREE.Vector3(x, y, z), color, inten, rad); }
  const shake = a => { const p = ctx.postfx; if (p && p.shake) p.shake(a); };
  const colOr = (o, d) => (o && o.color !== undefined) ? o.color : d;
  // direction from opts (defaults to forward -Z)
  function optDir(o, ddx, ddy, ddz) {
    const d = o && (o.dir || o.normal);
    if (d) { dx = d.x; dy = d.y; dz = d.z; } else { dx = ddx; dy = ddy; dz = ddz; }
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  }

  // ---------------- effect recipes ----------------
  const types = {};

  types.muzzle = (p, o) => {
    const k = (o && o.scale) || 1, col = colOr(o, 0xffb060);
    optDir(o, 0, 0, -1); const nx = dx, ny = dy, nz = dz;
    reset(); T.x = p.x + nx * .25 * k; T.y = p.y + ny * .25 * k; T.z = p.z + nz * .25 * k; T.cell = C.GLOW; T.s0 = 1.6 * k; T.s1 = 0.7 * k; T.life = 0.07; c0(col, 5); c1(col, 1); T.fi = 0.02; T.fo = 1; emit();
    reset(); T.x = p.x + nx * .3 * k; T.y = p.y + ny * .3 * k; T.z = p.z + nz * .3 * k; T.cell = C.FLARE; T.s0 = 2.6 * k; T.s1 = 1.4 * k; T.rot = rnd() * TAU; T.spin = rr(-6, 6); T.life = 0.06; c0v(4.5, 3.2, 1.8); c1(col, 1); T.fi = 0.02; T.a0 = 0.9; emit();
    for (let i = 0; i < 3; i++) {   // fire jets
      coneDir(nx, ny, nz, 0.16); const sp = rr(11, 22) * k;
      reset(); T.x = p.x + nx * .2 * k; T.y = p.y + ny * .2 * k; T.z = p.z + nz * .2 * k; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = 6;
      T.cell = rnd() < .5 ? C.FLAME_A : C.FLAME_B; T.s0 = 0.28 * k; T.s1 = 0.7 * k; T.stretch = 0.045; T.life = rr(.07, .12); c0(col, 5); c1v(1.2, .2, .03); T.fi = .05; T.rot = rnd() * TAU; emit();
    }
    for (let i = 0; i < 5; i++) {   // sparks
      coneDir(nx, ny, nz, 0.4); const sp = rr(9, 24) * k;
      reset(); T.x = p.x + nx * .3 * k; T.y = p.y + ny * .3 * k; T.z = p.z + nz * .3 * k; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = 1.2; T.grav = 10;
      T.cell = C.SPARK; T.s0 = .07 * k; T.s1 = .02 * k; T.grow = 1.5; T.stretch = 0.05; T.life = rr(.14, .32); c0v(5, 3, .9); c1v(1.4, .25, .03); T.fi = .02; emit();
    }
    for (let i = 0; i < 2; i++) {   // smoke wisp
      coneDir(nx, ny + 0.25, nz, 0.5); const sp = rr(1.5, 4) * k;
      reset(); T.x = p.x + nx * .4 * k; T.y = p.y; T.z = p.z + nz * .4 * k; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = 2.2; T.grav = -0.8;
      T.cell = C.SMOKE_A + (rnd() * 3 | 0); T.s0 = .25 * k; T.s1 = .85 * k; T.life = rr(.5, .85); T.rot = rnd() * TAU; T.spin = rr(-1, 1); c0v(.9, .72, .55); c1v(.35, .35, .36); T.a0 = .22; T.add0 = .4; T.add1 = 0; T.fi = .08; emit();
    }
    if (!o || o.light !== false) light(p.x + nx * .5, p.y + .3, p.z + nz * .5, col, 2.6, 8 * k);
  };

  types.impact = (p, o) => {
    const k = (o && o.scale) || 1, col = colOr(o, 0xffc070);
    if (o && o.dir && !o.normal) { dx = -o.dir.x; dy = -o.dir.y; dz = -o.dir.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; } else optDir(o, 0, 1, 0);
    const nx = dx, ny = dy, nz = dz;
    reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.cell = C.GLOW; T.s0 = 1.1 * k; T.s1 = 0.4 * k; T.life = 0.09; c0(col, 4.5); c1(col, 1); T.fi = .02; emit();
    reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.cell = C.FLARE; T.s0 = 1.5 * k; T.s1 = 0.7 * k; T.rot = rnd() * TAU; T.life = 0.07; c0v(4, 3, 1.8); c1(col, 1); T.fi = .02; T.a0 = .8; emit();
    const ns = 9 + (rnd() * 4 | 0);
    for (let i = 0; i < ns; i++) {
      coneDir(nx, ny, nz, 0.75); const sp = rr(5, 17) * k;
      reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = 0.9; T.grav = 20; T.flags = F_BOUNCE;
      T.cell = C.SPARK; T.s0 = .075 * k; T.s1 = .02 * k; T.grow = 1.4; T.stretch = .045; T.life = rr(.22, .6); c0v(5, 3, 1); c1v(1.3, .22, .03); T.fi = .02; emit();
    }
    for (let i = 0; i < 3; i++) {
      coneDir(nx, ny, nz, 0.9); const sp = rr(1, 3) * k;
      reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = 2.4; T.grav = -.3;
      T.cell = C.SMOKE_A + (rnd() * 3 | 0); T.s0 = .3 * k; T.s1 = 1.1 * k; T.life = rr(.5, .95); T.rot = rnd() * TAU; T.spin = rr(-.8, .8); c0v(.75, .62, .5); c1v(.3, .28, .27); T.a0 = .3; T.add0 = .25; T.add1 = 0; emit();
    }
    for (let i = 0; i < 3; i++) {
      coneDir(nx, ny, nz, 0.8); const sp = rr(3, 8) * k;
      reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = .3; T.grav = 24; T.flags = F_BOUNCE; T.cell = C.DEBRIS; T.s0 = T.s1 = rr(.07, .14) * k;
      T.life = rr(.5, .9); T.rot = rnd() * TAU; T.spin = rr(-14, 14); c0v(.5, .42, .36); c1v(.3, .26, .22); T.add0 = T.add1 = 0; T.fo = 3; emit();
    }
    const gy = groundY(p.x, p.z);
    if ((o && o.decal === true) || (!(o && o.decal === false) && p.y - gy < 0.7)) decal('scorch', p.x, p.z, rr(.7, 1.1) * k, 0xff6a18, {glow: 1.6, life: 25});
    if (!o || o.light !== false) light(p.x, p.y + .4, p.z, col, 1.5, 4 * k);
  };

  types.explosion = (p, o) => {
    const k = (o && o.scale) || (o && o.radius ? o.radius / 3.5 : 1), col = colOr(o, 0xff8a2a);
    const gy = groundY(p.x, p.z), py = Math.max(p.y, gy + 0.3);
    // white-hot flash + flare
    reset(); T.x = p.x; T.y = py + .5; T.z = p.z; T.cell = C.GLOW; T.s0 = 6 * k; T.s1 = 10 * k; T.life = .16; c0v(7, 5.5, 3.5); c1v(3, 1.2, .3); T.fi = .02; T.fo = 2; emit();
    reset(); T.x = p.x; T.y = py + .6; T.z = p.z; T.cell = C.FLARE; T.s0 = 8 * k; T.s1 = 13 * k; T.rot = rnd() * TAU; T.spin = 1.2; T.life = .14; c0v(5, 3.6, 2); c1v(2, .8, .2); T.fi = .02; T.a0 = .9; emit();
    // hot core glows
    for (let i = 0; i < 3; i++) { reset(); T.x = p.x; T.y = py + .8 + i * .3; T.z = p.z; T.cell = C.GLOW; T.s0 = 3.5 * k; T.s1 = 6 * k; T.life = rr(.3, .5); c0(col, 3.2); c1v(.8, .1, .02); T.a0 = .85; T.fi = .03; T.fo = 1.8; emit(); }
    // fireball
    for (let i = 0; i < 18; i++) {
      randDir(0.35); const sp = rr(1.8, 8) * k;
      reset(); T.x = p.x + dx * .6 * k; T.y = py + .5 + Math.abs(dy) * .6 * k; T.z = p.z + dz * .6 * k; T.vx = dx * sp; T.vy = Math.abs(dy) * sp * .9 + rr(.5, 3) * k; T.vz = dz * sp; T.drag = 3.2; T.grav = -1.5;
      T.cell = (i & 1) ? C.FLAME_A : C.FLAME_B; T.s0 = rr(1.3, 2) * k; T.s1 = rr(3, 4.4) * k; T.grow = .55; T.life = rr(.5, 1); T.rot = rnd() * TAU; T.spin = rr(-2, 2);
      c0v(5, 2.8, .9); c1v(.7, .09, .015); T.a0 = .95; T.add0 = 1; T.add1 = .8; T.fi = .05; T.fo = 1.3; emit();
    }
    // billowing smoke lit from below
    for (let i = 0; i < 20; i++) {
      randDir(0.5); const sp = rr(1.2, 4.5) * k;
      reset(); T.x = p.x + dx * 1.1 * k; T.y = py + .4 + Math.abs(dy) * k; T.z = p.z + dz * 1.1 * k; T.vx = dx * sp; T.vy = Math.abs(dy) * sp + rr(1.2, 3.6) * k; T.vz = dz * sp; T.drag = 1.7; T.grav = -.5;
      T.cell = C.SMOKE_A + (i % 3); T.s0 = rr(1.2, 1.8) * k; T.s1 = rr(3.4, 5) * k; T.grow = .6; T.life = rr(1.7, 3); T.rot = rnd() * TAU; T.spin = rr(-.7, .7);
      c0v(3, 1.15, .35); c1v(.17, .16, .16); T.a0 = .85; T.add0 = .55; T.add1 = 0; T.fi = .07; T.fo = 1.1; emit();
    }
    // spark shower
    for (let i = 0; i < 40; i++) {
      randDir(0.6); const sp = rr(7, 26) * k;
      reset(); T.x = p.x; T.y = py + .4; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = .55; T.grav = 15; T.flags = F_BOUNCE;
      T.cell = C.SPARK; T.s0 = .1 * k; T.s1 = .025 * k; T.grow = 1.6; T.stretch = .055; T.life = rr(.6, 1.5); c0v(6.5, 3.4, 1); c1v(1.6, .22, .02); T.fi = .02; emit();
    }
    // floating embers
    for (let i = 0; i < 16; i++) {
      randDir(0.3); const sp = rr(2, 7) * k;
      reset(); T.x = p.x + dx * k; T.y = py + .5; T.z = p.z + dz * k; T.vx = dx * sp; T.vy = Math.abs(dy) * sp + rr(1, 4); T.vz = dz * sp; T.drag = 1.1; T.grav = -2.2; T.flags = F_FLICKER;
      T.cell = C.GLOW; T.s0 = rr(.14, .26) * k; T.s1 = .04 * k; T.grow = 1; T.life = rr(1.4, 3.2); c0v(3.4, 1.3, .3); c1v(.7, .08, .01); T.fi = .05; T.fo = .8; emit();
    }
    // debris chunks
    for (let i = 0; i < 14; i++) {
      randDir(1.3); const sp = rr(5, 14) * k;
      reset(); T.x = p.x + dx * .5 * k; T.y = py + .3; T.z = p.z + dz * .5 * k; T.vx = dx * sp; T.vy = Math.abs(dy) * sp + rr(3, 9); T.vz = dz * sp; T.drag = .15; T.grav = 24; T.flags = F_BOUNCE;
      T.cell = C.DEBRIS; T.s0 = T.s1 = rr(.18, .5) * k; T.life = rr(1.2, 2.2); T.rot = rnd() * TAU; T.spin = rr(-12, 12); c0v(.62, .5, .42); c1v(.2, .17, .15); T.add0 = T.add1 = 0; T.fi = .01; T.fo = 4; emit();
    }
    // ground shockwave rings
    reset(); T.x = p.x; T.y = gy + .12; T.z = p.z; T.flags = F_FLAT; T.cell = C.RING; T.s0 = 1.5 * k; T.s1 = 13 * k; T.grow = .45; T.life = .55; T.rot = rnd() * TAU; c0v(2.6, 1.5, .7); c1v(.5, .22, .08); T.a0 = .9; T.fi = .03; T.fo = 1.4; emit();
    reset(); T.x = p.x; T.y = gy + .16; T.z = p.z; T.flags = F_FLAT; T.cell = C.RING; T.s0 = 1 * k; T.s1 = 9 * k; T.grow = .4; T.life = .36; T.rot = rnd() * TAU; c0v(4, 3.4, 2.6); c1v(1, .6, .3); T.a0 = .7; T.fi = .02; emit();
    reset(); T.x = p.x; T.y = gy + .1; T.z = p.z; T.flags = F_FLAT; T.cell = C.GLOW; T.s0 = 4 * k; T.s1 = 9 * k; T.life = .7; T.rot = 0; c0v(2.2, 1, .25); c1v(.4, .06, .01); T.a0 = .8; T.fi = .04; T.fo = 1.5; emit();
    // dust ring
    for (let i = 0; i < 14; i++) {
      const a = (i / 14 + rnd() * .05) * TAU, sp = rr(7, 11) * k;
      reset(); T.x = p.x + Math.cos(a) * k; T.y = gy + .35; T.z = p.z + Math.sin(a) * k; T.vx = Math.cos(a) * sp; T.vy = rr(.2, 1.2); T.vz = Math.sin(a) * sp; T.drag = 3.4; T.grav = -.15;
      T.cell = C.SMOKE_A + (i % 3); T.s0 = 1 * k; T.s1 = rr(2.2, 3.2) * k; T.life = rr(.9, 1.5); T.rot = rnd() * TAU; T.spin = rr(-.5, .5); c0v(.55, .45, .37); c1v(.25, .22, .2); T.a0 = .32; T.add0 = T.add1 = 0; T.fi = .08; emit();
    }
    decal('scorch', p.x, p.z, 6.4 * k, 0xff6a18, {glow: 2.4});
    if (!o || o.light !== false) light(p.x, py + 1.2, p.z, 0xff9040, 7, 20 * k);
    shake((o && o.shake !== undefined) ? o.shake : Math.min(1, .5 * k));
  };

  types.blood = (p, o) => {
    const k = (o && o.scale) || 1, col = colOr(o, 0x5dffa8);
    if (o && (o.dir || o.normal)) optDir(o, 0, 1, 0); else { dx = 0; dy = .6; dz = 0; }
    const nx = dx, ny = dy, nz = dz;
    // glowing burst
    reset(); T.x = p.x; T.y = p.y + .2; T.z = p.z; T.cell = C.GLOW; T.s0 = 1.3 * k; T.s1 = 2.4 * k; T.life = .22; c0(col, 2.6); c1(col, .3); T.a0 = .8; T.fi = .03; emit();
    for (let i = 0; i < 3; i++) {
      coneDir(nx, ny + .2, nz, .7); const sp = rr(1.5, 4) * k;
      reset(); T.x = p.x; T.y = p.y + .2; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = 3; T.cell = C.SMOKE_A + (i % 3); T.s0 = .4 * k; T.s1 = 1.5 * k; T.life = rr(.45, .8); T.rot = rnd() * TAU;
      c0(col, 1.6); c1(col, .12); T.a0 = .28; T.add0 = .9; T.add1 = .2; T.fi = .05; emit();
    }
    const nd = 11 + (rnd() * 5 | 0);
    for (let i = 0; i < nd; i++) {
      coneDir(nx, ny + .35, nz, .9); const sp = rr(3, 12) * k;
      reset(); T.x = p.x; T.y = p.y + .25; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp + rr(1, 4); T.vz = dz * sp; T.drag = .5; T.grav = 24; T.flags = F_SPLAT; T.splat = rr(.45, 1.1) * k;
      T.cell = C.BLOB; T.s0 = rr(.09, .2) * k; T.s1 = T.s0 * .7; T.grow = 1; T.stretch = .025; T.life = 2; c0(col, 1.8); c1(col, 1.4); T.a0 = .95; T.add0 = .55; T.add1 = .55; T.fi = .01; T.fo = .5; emit();
    }
    for (let i = 0; i < 4; i++) {
      coneDir(nx, ny + .5, nz, .8); const sp = rr(2, 6) * k;
      reset(); T.x = p.x; T.y = p.y + .3; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp + rr(2, 5); T.vz = dz * sp; T.drag = .3; T.grav = 26; T.flags = F_SPLAT; T.splat = rr(1, 1.8) * k;
      T.cell = C.BLOB; T.s0 = rr(.2, .36) * k; T.s1 = T.s0; T.rot = rnd() * TAU; T.life = 2; c0(col, 1.5); c1(col, 1.2); T.a0 = .95; T.add0 = .5; T.add1 = .5; T.fi = .01; T.fo = .5; emit();
    }
    const gy = groundY(p.x, p.z);
    if (p.y - gy < 1.4 && !(o && o.decal === false)) decal('splat', p.x + rr(-.3, .3), p.z + rr(-.3, .3), rr(1, 1.7) * k, col, {residual: .32});
    if (!o || o.light !== false) light(p.x, p.y + .5, p.z, col, 1.1, 3.5 * k);
  };

  types.spark = (p, o) => {
    const k = (o && o.scale) || 1, col = colOr(o, 0xffd890);
    optDir(o, 0, 1, 0);
    reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.cell = C.GLOW; T.s0 = .9 * k; T.s1 = .3 * k; T.life = .09; c0(col, 4); c1(col, .8); T.fi = .02; emit();
    reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.cell = C.FLARE; T.s0 = 1.3 * k; T.s1 = .5 * k; T.rot = rnd() * TAU; T.life = .09; c0v(4, 3, 2); c1(col, 1); T.fi = .02; T.a0 = .85; emit();
    const ns = (o && o.count) || 12;
    for (let i = 0; i < ns; i++) {
      if (o && (o.dir || o.normal)) coneDir(dx, dy, dz, .9); else randDir(.3); const sp = rr(4, 15) * k;
      reset(); T.x = p.x; T.y = p.y; T.z = p.z; T.vx = dx * sp; T.vy = dy * sp; T.vz = dz * sp; T.drag = .9; T.grav = 18; T.flags = F_BOUNCE;
      T.cell = C.SPARK; T.s0 = .07 * k; T.s1 = .02 * k; T.grow = 1.4; T.stretch = .05; T.life = rr(.25, .75); c0(col, 5); c1v(1.2, .2, .02); T.fi = .02; emit();
    }
  };

  types.heal = (p, o) => {
    const k = (o && o.scale) || 1, col = colOr(o, 0x66ffaa), r = ((o && o.radius) || 1.2) * k, gy = groundY(p.x, p.z), by = Math.max(gy + .1, p.y - 1.0);
    reset(); T.x = p.x; T.y = by + .08; T.z = p.z; T.flags = F_FLAT; T.cell = C.RING; T.s0 = .5 * k; T.s1 = r * 2.8; T.grow = .5; T.life = .75; T.rot = rnd() * TAU; c0(col, 2.6); c1(col, .5); T.a0 = .9; T.fi = .04; emit();
    reset(); T.x = p.x; T.y = by + .06; T.z = p.z; T.flags = F_FLAT; T.cell = C.GLOW; T.s0 = r * 2.4; T.s1 = r * 3; T.life = .7; c0(col, 1.6); c1(col, .2); T.a0 = .7; T.fi = .05; T.fo = 1.4; emit();
    reset(); T.x = p.x; T.y = p.y + .6; T.z = p.z; T.cell = C.GLOW; T.s0 = 1.6 * k; T.s1 = 2.4 * k; T.life = .35; c0(col, 2); c1(col, .3); T.a0 = .6; T.fi = .05; emit();
    for (let i = 0; i < 16; i++) {
      const a = rnd() * TAU, rad = Math.sqrt(rnd()) * r;
      reset(); T.x = p.x + Math.cos(a) * rad; T.y = by + rr(.1, .6); T.z = p.z + Math.sin(a) * rad; T.vx = -Math.sin(a) * rr(.2, .8); T.vz = Math.cos(a) * rr(.2, .8); T.vy = rr(1.4, 3.8); T.drag = .5; T.flags = F_FLICKER;
      T.cell = C.GLOW; T.s0 = rr(.16, .32) * k; T.s1 = .05 * k; T.grow = 1; T.delay = rnd() * .3; T.life = rr(.8, 1.4); c0(col, 3.5); c1(col, .5); T.fi = .12; T.fo = 1; emit();
    }
    for (let i = 0; i < 4; i++) {
      const a = rnd() * TAU, rad = Math.sqrt(rnd()) * r * .8;
      reset(); T.x = p.x + Math.cos(a) * rad; T.y = by + .3; T.z = p.z + Math.sin(a) * rad; T.vy = rr(1.4, 2.4); T.drag = .4; T.cell = C.PLUS; T.s0 = rr(.34, .5) * k; T.s1 = T.s0 * .8; T.delay = rnd() * .35; T.life = rr(.9, 1.3);
      c0(col, 3); c1(col, 1); T.a0 = .95; T.fi = .15; T.fo = 1.2; emit();
    }
    if (!o || o.light !== false) light(p.x, by + 1, p.z, col, 1.6, 5.5 * k);
  };

  types.build = (p, o) => {
    const k = (o && o.scale) || 1, col = colOr(o, 0x44ddff), r = ((o && o.radius) || 2) * k, gy = groundY(p.x, p.z), by = Math.max(gy, p.y - 0.5) + .08, height = ((o && o.height) || 3.4) * k;
    // rising holographic scan planes
    for (let i = 0; i < 5; i++) {
      reset(); T.x = p.x; T.y = by; T.z = p.z; T.vy = height / (.8 + i * .08); T.flags = F_FLAT; T.cell = C.HEX; T.s0 = r * 2.3; T.s1 = r * 2.05; T.rot = i * .3; T.spin = .8; T.delay = i * .09; T.life = .85 + i * .06;
      c0(col, 2.8); c1(col, 1.1); T.a0 = .75 - i * .08; T.fi = .08; T.fo = 1.4; emit();
    }
    // ground rings
    reset(); T.x = p.x; T.y = by + .02; T.z = p.z; T.flags = F_FLAT; T.cell = C.RING; T.s0 = r * 1.2; T.s1 = r * 3.6; T.grow = .5; T.life = .8; T.rot = rnd() * TAU; c0(col, 3); c1(col, .5); T.a0 = .9; T.fi = .03; emit();
    reset(); T.x = p.x; T.y = by + .01; T.z = p.z; T.flags = F_FLAT; T.cell = C.GLOW; T.s0 = r * 2; T.s1 = r * 3.6; T.life = .75; c0(col, 2); c1(col, .2); T.a0 = .8; T.fi = .05; T.fo = 1.4; emit();
    reset(); T.x = p.x; T.y = by + .3; T.z = p.z; T.cell = C.GLOW; T.s0 = r * 1.4; T.s1 = r * 2.2; T.life = .4; c0(col, 2); c1(col, .3); T.a0 = .5; emit();
    // vertical light threads on the perimeter
    for (let i = 0; i < 14; i++) {
      const a = rnd() * TAU, rad = r * rr(.55, 1.05);
      reset(); T.x = p.x + Math.cos(a) * rad; T.y = by; T.z = p.z + Math.sin(a) * rad; T.vy = rr(4, 9) * k; T.drag = 1.4; T.cell = C.SPARK; T.s0 = .06 * k; T.s1 = .02 * k; T.stretch = .13; T.delay = rnd() * .35; T.life = rr(.5, 1);
      c0(col, 4); c1(col, .8); T.fi = .1; T.fo = 1.2; emit();
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd() * TAU, rad = Math.sqrt(rnd()) * r;
      reset(); T.x = p.x + Math.cos(a) * rad; T.y = by + rr(.1, .8); T.z = p.z + Math.sin(a) * rad; T.vy = rr(.8, 2.6); T.drag = .4; T.flags = F_FLICKER; T.cell = C.GLOW; T.s0 = rr(.12, .24) * k; T.s1 = .03; T.grow = 1; T.delay = rnd() * .4; T.life = rr(.8, 1.4);
      c0(col, 3); c1(col, .4); T.fi = .1; emit();
    }
    if (!o || o.light !== false) light(p.x, by + 1.5, p.z, col, 2.4, 9 * k);
  };

  function burst(type, pos, opts) { const f = types[type]; if (f) f(pos, opts); }

  // ---------------- ambient motes ----------------
  const amb = {x: new Float32Array(AMB_N), y: new Float32Array(AMB_N), z: new Float32Array(AMB_N), gy: new Float32Array(AMB_N), ph: new Float32Array(AMB_N), sp: new Float32Array(AMB_N), kind: new Uint8Array(AMB_N), oy: new Float32Array(AMB_N), sz: new Float32Array(AMB_N)};
  const AR = 27;
  let ambInit = false, ambRR = 0;
  function ambCenter(out) {
    const pl = ctx.player && ctx.player.pos;
    if (pl) { out.x = pl.x; out.z = pl.z; } else { out.x = 0; out.z = 0; }
  }
  const ctr = {x: 0, z: 0};
  function ambUpdate(dt, time) {
    ambCenter(ctr);
    if (!ambInit) {
      for (let i = 0; i < AMB_N; i++) {
        amb.kind[i] = i < 44 ? 0 : i < 120 ? 1 : 2;     // firefly / spore / ember
        amb.x[i] = ctr.x + rr(-AR, AR); amb.z[i] = ctr.z + rr(-AR, AR); amb.ph[i] = rnd() * 100; amb.sp[i] = rr(.6, 1.4);
        amb.gy[i] = groundY(amb.x[i], amb.z[i]);
        const kd = amb.kind[i]; amb.oy[i] = kd === 0 ? rr(.5, 2.6) : kd === 1 ? rr(.3, 4) : rr(.2, 1.5); amb.y[i] = amb.gy[i] + amb.oy[i];
        amb.sz[i] = kd === 0 ? rr(.2, .32) : kd === 1 ? rr(.1, .2) : rr(.08, .16);
      }
      ambInit = true;
    }
    // refresh a few ground heights per frame
    for (let j = 0; j < 6; j++) { const i = (ambRR++) % AMB_N; amb.gy[i] = groundY(amb.x[i], amb.z[i]); }
    const P = AL.a.aPS.array, V = AL.a.aVel.array, Co = AL.a.aCol.array, M = AL.a.aMisc.array;
    for (let i = 0; i < AMB_N; i++) {
      const kd = amb.kind[i], ph = amb.ph[i], sp = amb.sp[i];
      let x = amb.x[i], z = amb.z[i], y;
      let r, g, b, a, size, rot = 0;
      if (kd === 0) {            // fireflies: lazy lissajous wander, blinking
        x += (Math.sin(time * .55 * sp + ph) * .9 + Math.sin(time * 1.3 + ph * 2) * .4) * dt;
        z += (Math.cos(time * .47 * sp + ph * 1.3) * .9 + Math.cos(time * 1.1 + ph) * .4) * dt;
        y = amb.gy[i] + amb.oy[i] + Math.sin(time * .9 * sp + ph) * .5;
        const bl = Math.pow(Math.max(0, Math.sin(time * 1.6 * sp + ph * 3)), 3);
        a = .12 + bl * .95; r = 1.2; g = 3.2; b = .5; size = amb.sz[i] * (.8 + bl * .5);
      } else if (kd === 1) {     // spores: slow rising swirl
        x += (Math.sin(time * .3 + ph) * .5 + .15) * dt; z += Math.cos(time * .27 + ph * 1.7) * .5 * dt;
        amb.oy[i] += .22 * sp * dt; if (amb.oy[i] > 4.5) amb.oy[i] = .2;
        y = amb.gy[i] + amb.oy[i];
        a = .5 * Math.min(1, amb.oy[i] * 2) * Math.min(1, (4.5 - amb.oy[i]) * .8) * (.7 + .3 * Math.sin(time * 2 + ph)); r = .55; g = 1.5; b = 1.7; size = amb.sz[i];
      } else {                   // embers: rising glowing flecks with wobble
        x += (Math.sin(time * 1.4 + ph * 2) * .6 + .5) * dt; z += Math.cos(time * 1.2 + ph) * .5 * dt;
        amb.oy[i] += .9 * sp * dt; if (amb.oy[i] > 5) amb.oy[i] = .1;
        y = amb.gy[i] + amb.oy[i];
        const f = .6 + .4 * Math.sin(time * 18 + ph * 7);
        a = .9 * f * Math.min(1, (5 - amb.oy[i]) * .6) * Math.min(1, amb.oy[i] * 3); r = 3; g = 1.2; b = .3; size = amb.sz[i];
      }
      // wrap around the player so the field follows them
      let ddx = x - ctr.x, ddz = z - ctr.z;
      if (ddx > AR) { x -= AR * 2; amb.gy[i] = groundY(x, z); } else if (ddx < -AR) { x += AR * 2; amb.gy[i] = groundY(x, z); }
      if (ddz > AR) { z -= AR * 2; amb.gy[i] = groundY(x, z); } else if (ddz < -AR) { z += AR * 2; amb.gy[i] = groundY(x, z); }
      amb.x[i] = x; amb.z[i] = z; amb.y[i] = y;
      ddx = x - ctr.x; ddz = z - ctr.z;
      const fade = Math.max(0, 1 - (ddx * ddx + ddz * ddz) / (AR * AR)); a *= Math.min(1, fade * 3);
      const o = i * 4;
      P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = size;
      V[o] = V[o + 1] = V[o + 2] = V[o + 3] = 0;
      Co[o] = r; Co[o + 1] = g; Co[o + 2] = b; Co[o + 3] = a;
      M[o] = rot; M[o + 1] = C.GLOW; M[o + 2] = 1; M[o + 3] = 0;
    }
    AL.geo.instanceCount = AMB_N;
    AL.a.aPS.needsUpdate = AL.a.aVel.needsUpdate = AL.a.aCol.needsUpdate = AL.a.aMisc.needsUpdate = true;
  }

  // ---------------- beams ----------------
  const beamN = BEAM_MAX * (BEAM_SEG + 1) * 2;
  const bgeo = new THREE.BufferGeometry();
  const bpos = dyn(new THREE.BufferAttribute(new Float32Array(beamN * 3), 3));
  const buv = dyn(new THREE.BufferAttribute(new Float32Array(beamN * 2), 2));
  const bcol = dyn(new THREE.BufferAttribute(new Float32Array(beamN * 4), 4));
  bgeo.setAttribute('position', bpos); bgeo.setAttribute('aUv', buv); bgeo.setAttribute('aColor', bcol);
  { const idx = new Uint32Array(BEAM_MAX * BEAM_SEG * 6); let q = 0;
    for (let b = 0; b < BEAM_MAX; b++) for (let s = 0; s < BEAM_SEG; s++) { const v = (b * (BEAM_SEG + 1) + s) * 2; idx[q++] = v; idx[q++] = v + 1; idx[q++] = v + 3; idx[q++] = v; idx[q++] = v + 3; idx[q++] = v + 2; }
    bgeo.setIndex(new THREE.BufferAttribute(idx, 1)); }
  bgeo.setDrawRange(0, 0);
  const bmat = new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, ...blend, side: THREE.DoubleSide, uniforms: {uTime: {value: 0}}});
  const bmesh = new THREE.Mesh(bgeo, bmat); bmesh.frustumCulled = false; bmesh.renderOrder = 22; group.add(bmesh);
  const bq = {ax: new Float32Array(BEAM_MAX), ay: new Float32Array(BEAM_MAX), az: new Float32Array(BEAM_MAX), bx: new Float32Array(BEAM_MAX), by: new Float32Array(BEAM_MAX), bz: new Float32Array(BEAM_MAX),
    r: new Float32Array(BEAM_MAX), g: new Float32Array(BEAM_MAX), b: new Float32Array(BEAM_MAX), w: new Float32Array(BEAM_MAX), j: new Float32Array(BEAM_MAX), seg: new Uint8Array(BEAM_MAX), fl: new Float32Array(BEAM_MAX)};
  let bn = 0;
  function beam(a, b, color, o) {
    if (bn >= BEAM_MAX) return;
    const i = bn++; _c.set(color === undefined ? 0x66ccff : color);
    bq.ax[i] = a.x; bq.ay[i] = a.y; bq.az[i] = a.z; bq.bx[i] = b.x; bq.by[i] = b.y; bq.bz[i] = b.z;
    bq.r[i] = _c.r; bq.g[i] = _c.g; bq.b[i] = _c.b;
    bq.w[i] = (o && o.width) || .13; bq.j[i] = (o && o.jitter !== undefined) ? o.jitter : .06; bq.seg[i] = Math.min(BEAM_SEG, (o && o.segments) || 12);
    bq.fl[i] = (o && o.flicker !== undefined) ? o.flicker : .25;
    if (!o || o.endGlow !== false) {
      const w = bq.w[i];
      reset(); T.x = b.x; T.y = b.y; T.z = b.z; T.cell = C.GLOW; T.s0 = w * 11; T.s1 = w * 8; T.life = .06; c0(color === undefined ? 0x66ccff : color, 3.2); c1(color === undefined ? 0x66ccff : color, 1); T.fi = .01; T.a0 = .85; emit();
      reset(); T.x = a.x; T.y = a.y; T.z = a.z; T.cell = C.GLOW; T.s0 = w * 8; T.s1 = w * 6; T.life = .05; c0(color === undefined ? 0x66ccff : color, 2.5); c1(color === undefined ? 0x66ccff : color, 1); T.fi = .01; T.a0 = .7; emit();
    }
  }
  const campos = camera.position;
  bmesh.onBeforeRender = (renderer, sc, cam) => {
    // rebuilt at render time so beams submitted by modules that update after fx are drawn the same frame
    const cp = cam.position, t = ctx.time;
    let v = 0;
    for (let i = 0; i < bn; i++) {
      const ax = bq.ax[i], ay = bq.ay[i], az = bq.az[i], ex = bq.bx[i], ey = bq.by[i], ez = bq.bz[i];
      const sx = ex - ax, sy = ey - ay, sz = ez - az, len = Math.hypot(sx, sy, sz) || 1e-4;
      const ux = sx / len, uy = sy / len, uz = sz / len;
      // two perpendicular axes for jitter
      let px = -uz, py = 0, pz = ux; let pl = Math.hypot(px, pz); if (pl < 1e-4) { px = 1; pz = 0; pl = 1; } px /= pl; pz /= pl;
      const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
      const segs = bq.seg[i], jit = bq.j[i], w = bq.w[i] * (1 + (rnd() - .5) * bq.fl[i]);
      let prevJ1 = 0, prevJ2 = 0;
      for (let s = 0; s <= segs; s++) {
        const f = s / segs, env = Math.sin(f * Math.PI);
        let j1 = 0, j2 = 0;
        if (s > 0 && s < segs) {    // random-walk jitter with envelope: lightning-like, tight at the ends
          j1 = (prevJ1 * .45 + (rnd() - .5) * 2 * jit * len * .22) ; j2 = (prevJ2 * .45 + (rnd() - .5) * 2 * jit * len * .22);
          prevJ1 = j1; prevJ2 = j2; j1 *= env > .0 ? Math.min(1, env * 2.2) : 0; j2 *= Math.min(1, env * 2.2);
        }
        const cx = ax + sx * f + px * j1 + qx * j2, cy = ay + sy * f + py * j1 + qy * j2, cz = az + sz * f + pz * j1 + qz * j2;
        // tangent for this point ~ beam direction; camera-facing side vector
        const vx = cp.x - cx, vy = cp.y - cy, vz = cp.z - cz;
        let sdx = uy * vz - uz * vy, sdy = uz * vx - ux * vz, sdz = ux * vy - uy * vx; const sl = Math.hypot(sdx, sdy, sdz) || 1; sdx /= sl; sdy /= sl; sdz /= sl;
        const ww = w * 3.2 * (.55 + .45 * Math.min(1, env * 4));   // quad half-width covers the glow falloff
        for (let side = 0; side < 2; side++) {
          const sg = side ? 1 : -1, o = (i * (BEAM_SEG + 1) + s) * 2 + side;
          bpos.array[o * 3] = cx + sdx * ww * sg; bpos.array[o * 3 + 1] = cy + sdy * ww * sg; bpos.array[o * 3 + 2] = cz + sdz * ww * sg;
          buv.array[o * 2] = f; buv.array[o * 2 + 1] = sg;
          bcol.array[o * 4] = bq.r[i]; bcol.array[o * 4 + 1] = bq.g[i]; bcol.array[o * 4 + 2] = bq.b[i]; bcol.array[o * 4 + 3] = i;
        }
      }
    }
    bgeo.setDrawRange(0, bn * BEAM_SEG * 6);
    bpos.needsUpdate = buv.needsUpdate = bcol.needsUpdate = true;
    bmat.uniforms.uTime.value = t;
  };

  // ---------------- per-frame simulation ----------------
  const ps = L.a.aPS.array, pv = L.a.aVel.array, pc = L.a.aCol.array, pm = L.a.aMisc.array;
  function update(dt, c) {
    pmat.uniforms.uRes.value.set(c.renderer.domElement.width, c.renderer.domElement.height);
    const pf = c.postfx, dt2 = pf && (pf.sceneDepth || pf.depthTexture);
    if (dt2) { pmat.uniforms.tDepth.value = dt2; pmat.uniforms.uSoft.value = 1; pmat.uniforms.uNF.value.set(camera.near, camera.far); } else pmat.uniforms.uSoft.value = 0;
    dmat.uniforms.uTime.value = c.time;
    bn = 0;
    const hasH = !!(c.terrain && c.terrain.heightAt);
    for (let i = 0; i < n;) {
      const o = i * S;
      let age = sim[o + AGE] + dt; sim[o + AGE] = age;
      const life = sim[o + LIFE];
      if (age >= life) { n--; if (i !== n) sim.copyWithin(o, n * S, n * S + S); continue; }
      const w = i * 4;
      if (age < 0) { ps[w + 3] = 0; pc[w + 3] = 0; i++; continue; }
      const f = sim[o + FLAGS];
      const dr = 1 / (1 + sim[o + DRAG] * dt);
      let vx = sim[o + VX] * dr, vy = sim[o + VY] * dr - sim[o + GRAV] * dt, vz = sim[o + VZ] * dr;
      let x = sim[o + X] + vx * dt, y = sim[o + Y] + vy * dt, z = sim[o + Z] + vz * dt;
      if (f & (F_SPLAT | F_BOUNCE | F_DIE_GROUND)) {
        const gy = hasH ? (c.terrain.heightAt(x, z) || 0) : 0;
        if (y <= gy + 0.04 && vy < 0) {
          if (f & F_SPLAT) { decal('splat', x, z, sim[o + SPLAT], _lc.setRGB(sim[o + R0] / 1.8, sim[o + G0] / 1.8, sim[o + B0] / 1.8), {residual: .3}); n--; if (i !== n) sim.copyWithin(o, n * S, n * S + S); continue; }
          if (f & F_DIE_GROUND) { n--; if (i !== n) sim.copyWithin(o, n * S, n * S + S); continue; }
          y = gy + 0.04; vy *= -0.32; vx *= 0.6; vz *= 0.6; sim[o + SPIN] *= 0.5;
          if (Math.abs(vy) < 0.8) vy = 0;
        }
      }
      sim[o + X] = x; sim[o + Y] = y; sim[o + Z] = z; sim[o + VX] = vx; sim[o + VY] = vy; sim[o + VZ] = vz;
      const t = age / life, rot = sim[o + ROT] + sim[o + SPIN] * age;
      const gr = Math.pow(t, sim[o + GROW]), s0 = sim[o + S0];
      const size = s0 + (sim[o + S1] - s0) * gr;
      const fi = sim[o + FI], fin = fi > 0 ? Math.min(1, t / fi) : 1, fout = Math.pow(1 - t, sim[o + FO]);
      let a = sim[o + A0] * fin * fin * (3 - 2 * fin) * fout;
      if (f & F_FLICKER) a *= 0.65 + 0.35 * Math.sin(age * 38 + sim[o + ROT] * 17);
      ps[w] = x; ps[w + 1] = y; ps[w + 2] = z; ps[w + 3] = size;
      pv[w] = vx; pv[w + 1] = vy; pv[w + 2] = vz; pv[w + 3] = sim[o + STRETCH];
      pc[w] = sim[o + R0] + (sim[o + R1] - sim[o + R0]) * t; pc[w + 1] = sim[o + G0] + (sim[o + G1] - sim[o + G0]) * t; pc[w + 2] = sim[o + B0] + (sim[o + B1] - sim[o + B0]) * t; pc[w + 3] = a;
      pm[w] = rot; pm[w + 1] = sim[o + CELL]; pm[w + 2] = sim[o + ADD0] + (sim[o + ADD1] - sim[o + ADD0]) * t; pm[w + 3] = (f & F_FLAT) ? 1 : 0;
      i++;
    }
    L.geo.instanceCount = n;
    L.a.aPS.needsUpdate = L.a.aVel.needsUpdate = L.a.aCol.needsUpdate = L.a.aMisc.needsUpdate = true;
    if (dDirty) { dgeo.instanceCount = dCount; for (const k in D) D[k].needsUpdate = true; dDirty = false; }
    ambUpdate(dt, c.time);
  }
  const _lc = new THREE.Color();

  function clear() { n = 0; dCount = 0; dHead = 0; dgeo.instanceCount = 0; }
  function stats() { return {particles: n, decals: dCount, beams: bn}; }
  return {burst, beam, decal, clear, stats, atlas, group, _update: update};
}

// The fx module's update is delegated to the closure created in init (stored on ctx.fx.update).
export function update(dt, ctx) { if (ctx.fx && ctx.fx._update) ctx.fx._update(dt, ctx); }
