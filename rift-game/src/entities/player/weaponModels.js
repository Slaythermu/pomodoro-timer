// Procedural weapon models. Local frame: origin at rear grip, +Z forward. Each returns {group,muzzle,gripR,gripL,glows}
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
const rbx=(p,w,h,d,r,m,x,y,z,rx=0,ry=0,rz=0)=>{const o=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(r,Math.min(w,h,d)/2-.001)),m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);p.add(o);return o};
const cy=(p,rt,rb,h,m,x,y,z,rx=0,ry=0,rz=0,seg=16)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);p.add(o);return o};
const tr=(p,R,t,m,x,y,z,rx=0,ry=0,rz=0)=>{const o=new THREE.Mesh(new THREE.TorusGeometry(R,t,8,20),m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);p.add(o);return o};
const FW=Math.PI/2; // cylinder axis Y -> Z

function plasma(M){
  const g=new THREE.Group();
  rbx(g,.17,.24,.62,.05,M.dark,0,0,.3);                 // receiver
  rbx(g,.19,.1,.5,.04,M.armor,0,.13,.28);               // top shell
  rbx(g,.2,.18,.28,.05,M.armor,0,-.01,-.08);            // stock block
  rbx(g,.05,.16,.34,.02,M.accent,.1,.01,.34);
  rbx(g,.05,.16,.34,.02,M.accent,-.1,.01,.34);
  cy(g,.045,.05,.7,M.steel,.05,.02,.95,FW);cy(g,.045,.05,.7,M.steel,-.05,.02,.95,FW);   // twin rails
  cy(g,.03,.03,.9,M.glow,0,.05,.92,FW,0,0,8);
  for(let i=0;i<4;i++)tr(g,.085,.018,M.glow,0,.035,.7+i*.14);
  cy(g,.075,.065,.12,M.dark,0,.03,1.34,FW);cy(g,.04,.04,.14,M.glow,0,.03,1.38,FW);   // emitter
  rbx(g,.09,.1,.28,.03,M.black,0,.22,.35);cy(g,.035,.035,.1,M.glass,0,.22,.5,FW);   // scope
  rbx(g,.11,.3,.1,.03,M.dark,0,-.24,.02,.25);                                         // grip
  rbx(g,.1,.2,.16,.03,M.glow,.0,-.04,.08);                                            // energy cell
  rbx(g,.09,.12,.2,.03,M.dark,0,-.14,.5);                                             // foregrip
  const muzzle=new THREE.Object3D();muzzle.position.set(0,.03,1.48);g.add(muzzle);
  return {group:g,muzzle,gripR:new THREE.Vector3(0,-.18,.0),gripL:new THREE.Vector3(0,-.12,.55),glows:[]};
}
function flame(M){
  const g=new THREE.Group();
  rbx(g,.2,.26,.7,.06,M.dark,0,0,.3);
  cy(g,.12,.12,.8,M.accent,0,.26,.25,FW);                                 // fuel tank
  for(let i=0;i<4;i++)tr(g,.125,.02,M.dark,0,.26,-.05+i*.22);
  cy(g,.09,.09,.6,M.glowOrange,0,.26,.25,FW,0,0,12).scale.set(.55,1,.55);
  rbx(g,.2,.18,.26,.05,M.armor,0,-.01,-.1);
  cy(g,.07,.09,.5,M.steel,0,.0,.85,FW);
  const nz=new THREE.Mesh(new THREE.LatheGeometry([[.05,0],[.075,.05],[.12,.2],[.1,.22],[.05,.12]].map(a=>new THREE.Vector2(a[0],a[1])),18),M.dark);nz.rotation.x=FW;nz.position.set(0,0,1.08);g.add(nz);
  cy(g,.035,.035,.08,M.glowOrange,0,.1,1.0,FW);
  tr(g,.095,.02,M.glowOrange,0,0,.85,0,0,0);tr(g,.095,.02,M.glowOrange,0,0,.7);
  cy(g,.012,.012,.7,M.steel,.14,.06,.7,FW,0,0,6);
  cy(g,.03,.03,.5,M.rubber,.0,-.22,.1,.5,0,0,8);
  rbx(g,.11,.3,.1,.03,M.dark,0,-.24,.02,.25);
  rbx(g,.09,.12,.2,.03,M.dark,0,-.14,.55);
  const muzzle=new THREE.Object3D();muzzle.position.set(0,0,1.28);g.add(muzzle);
  return {group:g,muzzle,gripR:new THREE.Vector3(0,-.18,0),gripL:new THREE.Vector3(0,-.12,.55),glows:[]};
}
function rocket(M){
  const g=new THREE.Group();
  cy(g,.2,.2,1.25,M.armor,0,.04,.55,FW,0,0,24);                          // launch tube
  cy(g,.215,.215,.08,M.dark,0,.04,1.2,FW);cy(g,.24,.2,.16,M.dark,0,.04,1.2,FW);
  cy(g,.17,.17,.06,M.black,0,.04,1.3,FW);                                 // bore
  const rk=new THREE.Mesh(new THREE.ConeGeometry(.12,.25,16),M.accent);rk.rotation.x=FW;rk.position.set(0,.04,1.18);g.add(rk);
  for(let i=0;i<3;i++)tr(g,.205,.02,i==1?M.accent:M.dark,0,.04,.15+i*.4);
  cy(g,.24,.17,.28,M.dark,0,.04,-.12,FW);cy(g,.12,.12,.06,M.glowOrange,0,.04,-.27,FW);   // rear exhaust
  rbx(g,.2,.12,.5,.04,M.dark,0,-.12,.3);
  rbx(g,.07,.1,.3,.02,M.black,.0,.3,.5);cy(g,.03,.03,.06,M.glow,0,.3,.68,FW);             // sight
  rbx(g,.05,.22,.5,.02,M.accent,.2,.05,.4);rbx(g,.05,.22,.5,.02,M.accent,-.2,.05,.4);
  rbx(g,.2,.16,.24,.05,M.armor,0,-.04,-.1);
  rbx(g,.11,.3,.1,.03,M.dark,0,-.26,.12,.25);
  rbx(g,.09,.14,.2,.03,M.dark,0,-.2,.7);
  rbx(g,.1,.06,.16,.02,M.glowOrange,0,.26,.02);
  const muzzle=new THREE.Object3D();muzzle.position.set(0,.04,1.4);g.add(muzzle);
  return {group:g,muzzle,gripR:new THREE.Vector3(0,-.2,.12),gripL:new THREE.Vector3(0,-.17,.72),glows:[]};
}
export function buildWeapons(M){
  const defs=[plasma(M),flame(M),rocket(M)];
  defs.forEach(d=>d.group.traverse(o=>{if(o.isMesh)o.castShadow=true}));
  return defs;
}
