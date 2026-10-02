import * as THREE from 'three';
import {Events} from './core/events.js';import {Input} from './core/input.js';import {SpatialHash} from './core/spatial.js';
import * as terrain from './world/terrain.js';import * as lighting from './render/lighting.js';import * as postfx from './render/postfx.js';
import * as player from './entities/player.js';import * as enemies from './entities/enemies.js';import * as fx from './fx/particles.js';
import * as buildings from './buildings/buildings.js';import * as hud from './ui/hud.js';import * as audio from './audio/audio.js';

const q=new URLSearchParams(location.search);
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight,false);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,0.5,400);
// Fixed isometric-ish chase camera like The Riftbreaker
const CAM_OFF=new THREE.Vector3(0,26,19);
camera.position.copy(CAM_OFF);camera.lookAt(0,0,0);
const ctx={THREE,renderer,scene,camera,canvas,ev:new Events(),input:new Input(canvas,camera),hash:new SpatialHash(4),time:0,seed:+(q.get('seed')||1337),
  state:{hp:100,maxHp:100,energy:100,res:{carbon:200,steel:100,crystal:50},wave:0,kills:0,score:0,over:false},q,CAM_OFF};
// Module contract: init(ctx) once, update(dt,ctx) per frame. Each module attaches its API to ctx.<name>.
const mods=[['terrain',terrain],['lighting',lighting],['fx',fx],['player',player],['enemies',enemies],['buildings',buildings],['hud',hud],['audio',audio],['postfx',postfx]];
for(const [n,m] of mods){ctx[n]=m.init(ctx)||{}; }
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();ctx.postfx.resize?.(innerWidth,innerHeight)}
addEventListener('resize',resize);resize();
const clock=new THREE.Clock();let fixed=q.get('dt')?+q.get('dt'):0;
function frame(){const dt=fixed||Math.min(clock.getDelta(),0.05);ctx.time+=dt;ctx.input.update();
  ctx.hash.clear();
  for(const [n,m] of mods) if(m.update) m.update(dt,ctx);
  ctx.input.endFrame();
  ctx.postfx.render?ctx.postfx.render(dt):renderer.render(scene,camera);
  requestAnimationFrame(frame)}
// Test harness: advance N simulated frames then signal ready (used by tools/shot.mjs)
window.__game=ctx;window.__step=(n,dt=1/60)=>{for(let i=0;i<n;i++){ctx.time+=dt;ctx.input.update();ctx.hash.clear();for(const [,m] of mods) if(m.update) m.update(dt,ctx);ctx.input.endFrame();}ctx.postfx.render?ctx.postfx.render(dt):renderer.render(scene,camera)};
if(!q.get('manual'))requestAnimationFrame(frame);
