// RIFTFALL post-processing: HDR scene pass (MSAA + depth) -> half-res SSAO + volumetric sun shafts (shadow-map raymarch)
// -> height fog composite -> UnrealBloom -> grade (ACES, teal/orange, CA, vignette, grain, tilt-shift) -> FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const FS_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

// Shared: reconstruct view/world position from depth.
const RECON = `
uniform mat4 uProjInv; uniform mat4 uCamWorld;
vec3 viewPos(vec2 uv, float d){ vec4 n = vec4(uv*2.-1., d*2.-1., 1.); vec4 v = uProjInv*n; return v.xyz/v.w; }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }
`;

// Half-res: rgb = in-scattered sun light through fog (shadow-marched), a = ambient occlusion.
const VOL_FS = `
precision highp float;
#include <packing>
varying vec2 vUv;
uniform sampler2D tDepth, tShadow; uniform mat4 uShadowM, uProj;
uniform vec2 uRes; uniform vec3 uCamPos, uSunDir, uSunCol;
uniform float uAoR, uAoI, uScatter, uDensity, uFalloff, uBaseY, uMaxDist, uUseVol, uUseAo, uFrame;
${RECON}
float rawDepth(vec2 uv){ return texture2D(tDepth, uv).x; }
vec3 vp(vec2 uv){ return viewPos(uv, rawDepth(uv)); }
float shadowLit(vec3 w){
  vec4 sc = uShadowM * vec4(w,1.);
  vec3 c = sc.xyz / sc.w;
  if(c.x<0.||c.x>1.||c.y<0.||c.y>1.||c.z>1.) return 1.;
  float edge = smoothstep(0.,.06,min(min(c.x,1.-c.x),min(c.y,1.-c.y)));
  float s = step(c.z-.0012, unpackRGBAToDepth(texture2D(tShadow, c.xy)));
  return mix(1., s, edge);
}
void main(){
  float d0 = rawDepth(vUv);
  vec2 px = 1./uRes;
  vec4 outv = vec4(0.,0.,0.,1.);
  vec2 fc = gl_FragCoord.xy;
  // ---------- volumetric
  if(uUseVol > .5){
    vec3 wp = (uCamWorld * vec4(viewPos(vUv, d0),1.)).xyz;
    vec3 ro = uCamPos; vec3 rd = wp - ro; float dist = length(rd); rd /= dist;
    if(d0 >= .99999){ dist = uMaxDist; wp = ro + rd*dist; }
    dist = min(dist, uMaxDist);
    const int N = 14;
    float step_ = dist / float(N);
    float j = ign(fc + uFrame*7.);
    vec3 acc = vec3(0.);
    float cosT = dot(rd, uSunDir);
    float g = .55; float phase = (1.-g*g)/(4.*3.14159*pow(1.+g*g-2.*g*cosT, 1.5));
    phase = mix(.08, phase, .8) * 2.;
    float trans = 1.;
    for(int i=0;i<N;i++){
      float t = (float(i)+j) * step_;
      vec3 p = ro + rd*t;
      float dens = (uDensity*.6 + .004) * exp(-max(p.y-uBaseY,0.)*uFalloff);
      float lit = shadowLit(p);
      acc += uSunCol * lit * dens * step_ * trans;
      trans *= exp(-dens*step_*.6);
    }
    outv.rgb = acc * phase * uScatter;
  }
  // ---------- SSAO (alchemy-style, view space)
  float ao = 1.;
  if(uUseAo > .5 && d0 < .99999){
    vec3 P = viewPos(vUv, d0);
    vec3 Pl = vp(vUv-vec2(px.x,0.)), Pr = vp(vUv+vec2(px.x,0.)), Pd = vp(vUv-vec2(0.,px.y)), Pu = vp(vUv+vec2(0.,px.y));
    vec3 dx = abs(Pl.z-P.z) < abs(Pr.z-P.z) ? P-Pl : Pr-P;
    vec3 dy = abs(Pd.z-P.z) < abs(Pu.z-P.z) ? P-Pd : Pu-P;
    vec3 n = normalize(cross(dx, dy)); if(n.z < 0.) n = -n;
    float rpx = uAoR * uProj[1][1] * .5 * uRes.y / max(-P.z, .1);
    rpx = clamp(rpx, 2., 90.);
    float ang0 = ign(fc)*6.28318;
    float occ = 0.;
    const int NS = 12;
    for(int i=0;i<NS;i++){
      float fi = (float(i)+.5)/float(NS);
      float a = ang0 + fi*6.28318*3.;
      float r = rpx * (.15 + .85*fi);
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * px;
      float dd = rawDepth(uv);
      if(dd >= .99999) continue;
      vec3 S = viewPos(uv, dd);
      vec3 v = S - P; float l2 = dot(v,v); float l = sqrt(l2);
      float w = 1. - smoothstep(uAoR*.8, uAoR*2.2, l);        // range check
      occ += max(0., dot(n, v)/max(l,1e-4) - .12) * w * (1. - .5*fi);
    }
    ao = 1. - clamp(occ / float(NS) * uAoI * 2.4, 0., .92);
  }
  outv.a = ao;
  gl_FragColor = outv;
}`;

// Full-res composite: AO (depth-aware 3x3 upsample), height fog, shafts.
const COMP_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor, tDepth, tVol; uniform vec2 uRes, uVolRes;
uniform vec3 uCamPos, uFogCol, uSunDir, uSunTint, uSkyHor; uniform float uFogD, uFalloff, uBaseY, uFogMax, uAoMix, uUseFog;
${RECON}
void main(){
  vec4 col = texture2D(tColor, vUv);
  float d = texture2D(tDepth, vUv).x;
  vec2 vpx = 1./uVolRes;
  // 3x3 tent blur on the half-res volume buffer (noise + AO smoothing), depth-aware
  vec4 vol = vec4(0.); float wsum = 0.;
  float z0 = viewPos(vUv, d).z;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 o = vec2(float(x),float(y));
    vec2 uv = vUv + o*vpx;
    float zd = viewPos(uv, texture2D(tDepth, uv).x).z;
    float w = (2.-abs(o.x)*.5-abs(o.y)*.5) * exp(-abs(zd-z0)*.35);
    vol += texture2D(tVol, uv)*w; wsum += w;
  }
  vol /= max(wsum, 1e-4);
  vec3 c = col.rgb;
  if(d < .99999){
    c *= mix(1., vol.a, uAoMix);
    vec3 wp = (uCamWorld * vec4(viewPos(vUv, d),1.)).xyz;
    vec3 ray = wp - uCamPos; float dist = length(ray); vec3 rd = ray/dist;
    // analytic exponential height fog
    float dy = rd.y; float k = uFalloff;
    float base = uFogD * exp(-k*max(uCamPos.y-uBaseY, 0.));
    float od = abs(dy) < 1e-3 ? base*dist : base * (1.-exp(-k*dy*dist)) / (k*dy);
    float f = min(1. - exp(-max(od,0.)), uFogMax) * uUseFog;
    float sg = pow(max(dot(rd, uSunDir),0.), 4.);
    vec3 fc = uFogCol + uSunTint*sg*.12;
    c = mix(c, fc, f);
  }
  c += vol.rgb;
  gl_FragColor = vec4(c, 1.);
}`;

class AtmospherePass extends Pass {
  constructor(ctx, o) {
    super();
    this.ctx = ctx; this.o = o;
    this.needsSwap = true;
    const { renderer } = ctx;
    const dt = new THREE.DepthTexture(4, 4); dt.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: o.msaa, depthTexture: dt, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.volRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    const shared = () => ({ uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } });
    this.volMat = new THREE.ShaderMaterial({
      vertexShader: FS_VS, fragmentShader: VOL_FS, depthTest: false, depthWrite: false,
      uniforms: {
        ...shared(), tDepth: { value: dt }, tShadow: { value: null }, uShadowM: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2(2, 2) }, uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
        uAoR: { value: 1.7 }, uAoI: { value: 1.0 }, uScatter: { value: 1.6 }, uDensity: { value: 0.02 }, uFalloff: { value: 0.12 }, uBaseY: { value: 0 },
        uMaxDist: { value: 85 }, uUseVol: { value: o.vol ? 1 : 0 }, uUseAo: { value: o.ao ? 1 : 0 }, uFrame: { value: 0 },
      },
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: FS_VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      uniforms: {
        ...shared(), tColor: { value: this.sceneRT.texture }, tDepth: { value: dt }, tVol: { value: this.volRT.texture },
        uRes: { value: new THREE.Vector2(2, 2) }, uVolRes: { value: new THREE.Vector2(2, 2) }, uCamPos: { value: new THREE.Vector3() },
        uFogCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSunTint: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() },
        uFogD: { value: 0.02 }, uFalloff: { value: 0.12 }, uBaseY: { value: 0 }, uFogMax: { value: 0.8 }, uAoMix: { value: o.ao ? 0.9 : 0 }, uUseFog: { value: 1 },
      },
    });
    this.volQuad = new FullScreenQuad(this.volMat);
    this.compQuad = new FullScreenQuad(this.compMat);
    this.frame = 0;
  }
  setSize(w, h) {
    this.sceneRT.setSize(w, h);
    const hw = Math.max(2, Math.ceil(w / 2)), hh = Math.max(2, Math.ceil(h / 2));
    this.volRT.setSize(hw, hh);
    this.volMat.uniforms.uRes.value.set(hw, hh);
    this.compMat.uniforms.uRes.value.set(w, h);
    this.compMat.uniforms.uVolRes.value.set(hw, hh);
  }
  render(renderer, writeBuffer /*, readBuffer */) {
    const { scene, camera } = this.ctx;
    const L = this.ctx.lighting && this.ctx.lighting.params;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    // 1) scene -> HDR RT
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    camera.updateMatrixWorld(); camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const inv = camera.projectionMatrixInverse, cw = camera.matrixWorld;
    for (const m of [this.volMat, this.compMat]) { m.uniforms.uProjInv.value.copy(inv); m.uniforms.uCamWorld.value.copy(cw); }
    const vu = this.volMat.uniforms, cu = this.compMat.uniforms;
    vu.uProj.value.copy(camera.projectionMatrix);
    vu.uCamPos.value.copy(camera.position); cu.uCamPos.value.copy(camera.position);
    vu.uFrame.value = (this.frame++ % 8); vu.uUseAo.value = this.o.ao ? 1 : 0; cu.uAoMix.value = this.o.ao ? 0.9 : 0;
    if (L) {
      const sh = L.sun.shadow;
      vu.tShadow.value = sh.map ? sh.map.texture : null;
      vu.uShadowM.value.copy(sh.matrix);
      vu.uSunDir.value.copy(L.sunDir); vu.uSunCol.value.copy(L.sunColor).multiplyScalar(L.sunIntensity * 0.22);
      vu.uDensity.value = L.fogDensity; vu.uFalloff.value = L.fogHeightFalloff * 0.7; vu.uBaseY.value = L.fogBaseY; vu.uScatter.value = L.scatter * this.o.scatter;
      cu.uFogCol.value.copy(L.fogColor); cu.uSunDir.value.copy(L.sunDir); cu.uSunTint.value.copy(L.fogSunTint).multiplyScalar(L.sunIntensity * 0.4);
      cu.uFogD.value = L.fogDensity; cu.uFalloff.value = L.fogHeightFalloff; cu.uBaseY.value = L.fogBaseY; cu.uFogMax.value = L.fogMax;
      if (!vu.tShadow.value) vu.uUseVol.value = 0; else vu.uUseVol.value = this.o.vol ? 1 : 0;
    } else { vu.uUseVol.value = 0; cu.uUseFog.value = 0; }
    // 2) half-res AO + volumetrics
    if (this.o.vol || this.o.ao) {
      renderer.setRenderTarget(this.volRT); renderer.clear(); this.volQuad.render(renderer);
    } else { renderer.setRenderTarget(this.volRT); renderer.setClearColor(0x000000, 0); renderer.clear(); }
    // 3) composite
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compQuad.render(renderer);
  }
  dispose() { this.sceneRT.dispose(); this.volRT.dispose(); this.volMat.dispose(); this.compMat.dispose(); this.volQuad.dispose(); this.compQuad.dispose(); }
}

const GradeShader = {
  name: 'RiftGrade',
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uExposure: { value: 1.0 }, uVig: { value: 0.55 }, uCA: { value: 0.0007 }, uGrain: { value: 0.03 },
    uTilt: { value: 0.0 }, uPulseCol: { value: new THREE.Color(1, 0, 0) }, uPulse: { value: 0 }, uShake: { value: 0 },
    uTeal: { value: new THREE.Color(0.86, 1.0, 1.06) }, uOrange: { value: new THREE.Color(1.1, 0.97, 0.86) }, uSat: { value: 1.18 }, uNight: { value: 0 },
  },
  vertexShader: FS_VS,
  fragmentShader: `
precision highp float;
varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uRes;
uniform float uTime,uExposure,uVig,uCA,uGrain,uTilt,uPulse,uShake,uSat,uNight; uniform vec3 uPulseCol,uTeal,uOrange;
float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 aces(vec3 x){ const float a=2.51,b=.03,c=2.43,d=.59,e=.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
vec3 fetch(vec2 uv, float ca){
  vec2 c = uv-.5; float r2 = dot(c,c);
  vec2 o = c*r2*ca;
  return vec3(texture2D(tDiffuse, uv+o).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv-o).b);
}
void main(){
  vec2 uv = vUv;
  float ca = (uCA + uShake*.02 + uPulse*.01) * 14.;
  vec3 c = fetch(uv, ca);
  // tilt-shift: blur top/bottom of the frame (cheap 8-tap spiral)
  float ts = smoothstep(.22,.62, abs(uv.y-.52)) * uTilt;
  if(ts > .002){
    vec3 acc = c; float ws = 1.;
    for(int i=0;i<8;i++){
      float a = float(i)*2.39996; float r = sqrt((float(i)+.5)/8.);
      vec2 o = vec2(cos(a),sin(a))*r*ts*6./uRes;
      acc += texture2D(tDiffuse, uv+o).rgb; ws += 1.;
    }
    c = acc/ws;
  }
  c *= uExposure;
  // night lift toward blue, subtle
  c = max(c, 0.);
  vec3 t = aces(c*.95) ;
  // teal shadows / orange highlights
  float l = dot(t, vec3(.2126,.7152,.0722));
  t *= mix(uTeal, uOrange, smoothstep(.12,.7,l));
  float l2 = dot(t, vec3(.2126,.7152,.0722));
  t = mix(vec3(l2), t, uSat);
  // contrast S-curve in display space
  t = mix(t, t*t*(3.-2.*t), .35);
  // vignette
  vec2 q = uv-.5; q.x *= uRes.x/uRes.y*.75;
  float v = smoothstep(.22,.95, length(q)*1.25);
  t *= 1. - v*uVig;
  // damage / flash pulse
  float pv = smoothstep(.15,.85, length((uv-.5)*vec2(1.,.85))*1.35);
  t = mix(t, uPulseCol, clamp(uPulse*(pv*.8+.08),0.,1.));
  // grain + dither
  t = pow(max(t,0.), vec3(1./2.2));
  float g = hash(uv*uRes + fract(uTime)*100.) - .5;
  t += g * uGrain * (.4+ sin(l2*3.14159)*.6);
  t += (hash(uv*uRes+3.7)-.5)/255.;
  gl_FragColor = vec4(t,1.);
}`,
};

export function init(ctx) {
  const { renderer, scene, camera, q } = ctx;
  const lowfx = q.get('lowfx') === '1' || ctx.lowfx;
  const flag = (k, def) => (q.has(k) ? q.get(k) !== '0' : def);
  const opts = {
    msaa: lowfx ? 0 : 4, ao: flag('ao', !lowfx), vol: flag('vol', !lowfx), bloom: flag('bloom', true), scatter: 3.2,
  };
  const pr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
  composer.setPixelRatio(pr);
  const atmo = new AtmospherePass(ctx, opts);
  composer.addPass(atmo);

  let bloom = null;
  if (opts.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), lowfx ? 0.3 : 0.42, 0.55, 1.2);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uTilt.value = lowfx ? 0 : flag('dof', true) ? 0.55 : 0;
  grade.uniforms.uGrain.value = lowfx ? 0.015 : 0.03;
  composer.addPass(grade);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  fxaa.renderToScreen = true;

  // --- feedback state
  let trauma = 0, pulseAmt = 0; const pulseCol = new THREE.Color(1, 0.1, 0.05);
  const camPos = new THREE.Vector3(), camQuat = new THREE.Quaternion(), _e = new THREE.Euler(), _q = new THREE.Quaternion();
  const right = new THREE.Vector3(), up = new THREE.Vector3();

  const api = {
    composer, grade, bloom, opts,
    shake(amount = 0.3) { trauma = Math.min(1, trauma + amount); },
    pulse(color = 0xff2010, amount = 0.5) {
      const c = new THREE.Color(color);
      if (pulseAmt < 0.02) pulseCol.copy(c); else pulseCol.lerp(c, 0.5);
      pulseAmt = Math.min(1, pulseAmt + amount);
    },
    resize(w, h) {
      renderer.getSize(_s);
      const p = renderer.getPixelRatio();
      composer.setPixelRatio(p);
      composer.setSize(w || _s.x, h || _s.y);
      const W = Math.floor((w || _s.x) * p), H = Math.floor((h || _s.y) * p);
      grade.uniforms.uRes.value.set(W, H);
      fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H);
      if (bloom) bloom.resolution.set(W / 2, H / 2);
    },
    render(dt) {
      // decay
      trauma = Math.max(0, trauma - dt * 1.6); pulseAmt *= Math.exp(-dt * 4.5);
      if (pulseAmt < 0.002) pulseAmt = 0;
      const s = trauma * trauma, t = ctx.time;
      camPos.copy(camera.position); camQuat.copy(camera.quaternion);
      if (s > 0.0004) {
        camera.updateMatrixWorld();
        right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
        const n1 = Math.sin(t * 61.3) + Math.sin(t * 37.1 + 1.7) * 0.7, n2 = Math.sin(t * 53.7 + 4.0) + Math.sin(t * 29.3) * 0.7, n3 = Math.sin(t * 43.1 + 2.0);
        camera.position.addScaledVector(right, n1 * s * 0.55).addScaledVector(up, n2 * s * 0.55);
        _q.setFromEuler(_e.set(n2 * s * 0.012, n1 * s * 0.012, n3 * s * 0.025));
        camera.quaternion.multiply(_q);
      }
      const L = ctx.lighting && ctx.lighting.params;
      const u = grade.uniforms;
      u.uTime.value = t; u.uShake.value = s; u.uPulse.value = pulseAmt; u.uPulseCol.value.copy(pulseCol);
      u.uExposure.value = L ? L.exposure : 1; u.uNight.value = L ? L.night : 0;
      composer.render(dt);
      camera.position.copy(camPos); camera.quaternion.copy(camQuat); camera.updateMatrixWorld();
    },
  };
  const _s = new THREE.Vector2();
  ctx.postfx = api; // available during init for resize
  api.resize(innerWidth, innerHeight);

  ctx.ev.on('damage-player', (e) => {
    const a = (e && e.amount) || 10;
    api.pulse(0xff1a0a, Math.min(0.7, a / 40)); api.shake(Math.min(0.5, a / 50));
  });
  ctx.ev.on('wave', () => api.shake(0.15));
  return api;
}

export function update() {}
