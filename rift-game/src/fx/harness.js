// Standalone FX harness (only the fx module + a stub terrain + bloom), independent of other modules' state.
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as fx from './particles.js';
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias: false});
renderer.setSize(innerWidth, innerHeight, false); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05080c); scene.fog = new THREE.FogExp2(0x070b10, 0.012);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 400); camera.position.set(0, 26, 19); camera.lookAt(0, 0, 0);
const hy = (x, z) => 0.45 * Math.sin(x * .3) * Math.cos(z * .25) + 0.2 * Math.sin(x * .9 + z * .7);
const g = new THREE.PlaneGeometry(140, 140, 180, 180); g.rotateX(-Math.PI / 2);
{ const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, hy(p.getX(i), p.getZ(i))); g.computeVertexNormals(); }
scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({color: 0x35584c, roughness: .95})));
const sun = new THREE.DirectionalLight(0x99bbff, 2.2); sun.position.set(20, 40, 10); scene.add(sun, new THREE.AmbientLight(0x6677aa, 1.0));
const lights = [];
const ctx = {THREE, renderer, scene, camera, canvas, time: 0, terrain: {heightAt: hy}, player: {pos: new THREE.Vector3(0, 0, 0)}, q: new URLSearchParams(location.search),
  lighting: {addLight(pos, color, inten, rad) { const l = new THREE.PointLight(color, inten * 1.5, rad, 2); l.position.copy(pos); l.userData.t = 0; scene.add(l); lights.push(l); }}, postfx: {shake() {}}};
ctx.fx = fx.init(ctx);
const comp = new EffectComposer(renderer); comp.addPass(new RenderPass(scene, camera)); comp.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.8)); comp.addPass(new OutputPass());
window.__game = ctx;
window.__step = (n, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) { ctx.time += dt; fx.update(dt, ctx);
    for (let j = lights.length - 1; j >= 0; j--) { const l = lights[j]; l.userData.t += dt; l.intensity *= Math.exp(-dt * 6); if (l.userData.t > .6) { scene.remove(l); l.dispose(); lights.splice(j, 1); } } }
  comp.render();
};
