// Shared procedural graphics helpers for buildings: textures, materials, Model builder.
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

function rng(seed){let s=seed>>>0;return()=>((s=Math.imul(s^s>>>15,1|s)+0x6D2B79F5|0),((s^s>>>7)>>>0)/4294967296)}
const cv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};

function makePanelTex(kind){
  const S=256,c=cv(S,S),g=c.getContext('2d'),b=cv(S,S),bg=b.getContext('2d'),r=rng(kind==='hazard'?7:kind==='plate'?3:11);
  const base=kind==='plate'?[72,80,92]:[52,58,68];
  g.fillStyle=`rgb(${base})`;g.fillRect(0,0,S,S);bg.fillStyle='#888';bg.fillRect(0,0,S,S);
  // noise
  const id=g.getImageData(0,0,S,S);for(let i=0;i<S*S;i++){const n=(r()-.5)*22;id.data[i*4]+=n;id.data[i*4+1]+=n;id.data[i*4+2]+=n*1.1}g.putImageData(id,0,0);
  // brushed streaks
  for(let i=0;i<400;i++){g.strokeStyle=`rgba(${r()>.5?255:0},${r()>.5?255:0},255,${r()*.035})`;g.lineWidth=1;const y=r()*S;g.beginPath();g.moveTo(0,y);g.lineTo(S,y+r()*2-1);g.stroke()}
  const N=kind==='plate'?2:4,cs=S/N;
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){
    const x=i*cs,y=j*cs;const t=(r()-.5)*14;g.fillStyle=`rgba(${t>0?255:0},${t>0?255:0},${t>0?255:0},${Math.abs(t)/100})`;g.fillRect(x,y,cs,cs);
    g.strokeStyle='rgba(8,10,14,.9)';g.lineWidth=3;g.strokeRect(x+1.5,y+1.5,cs-3,cs-3);
    g.strokeStyle='rgba(190,205,225,.22)';g.lineWidth=1.5;g.beginPath();g.moveTo(x+4,y+cs-4);g.lineTo(x+4,y+4);g.lineTo(x+cs-4,y+4);g.stroke();
    bg.strokeStyle='#000';bg.lineWidth=4;bg.strokeRect(x+2,y+2,cs-4,cs-4);bg.strokeStyle='#bbb';bg.lineWidth=2;bg.strokeRect(x+6,y+6,cs-12,cs-12);
    for(const [px,py] of [[10,10],[cs-10,10],[10,cs-10],[cs-10,cs-10]]){g.fillStyle='#161a20';g.beginPath();g.arc(x+px,y+py,3,0,7);g.fill();g.fillStyle='rgba(200,215,235,.5)';g.beginPath();g.arc(x+px-.8,y+py-.8,1.3,0,7);g.fill();bg.fillStyle='#fff';bg.beginPath();bg.arc(x+px,y+py,3,0,7);bg.fill()}
    if(r()<.3){g.fillStyle='rgba(0,0,0,.5)';for(let k=0;k<5;k++)g.fillRect(x+cs*.3,y+cs*.3+k*cs*.08,cs*.4,cs*.035)}
  }
  // grime
  for(let i=0;i<60;i++){const x=r()*S,y=r()*S,rad=8+r()*30,gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,'rgba(10,8,5,.18)');gr.addColorStop(1,'rgba(10,8,5,0)');g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2)}
  if(kind==='hazard'){g.save();g.beginPath();g.rect(0,S*.42,S,S*.16);g.clip();g.fillStyle='#e8a317';g.fillRect(0,0,S,S);g.fillStyle='#151515';for(let i=-S;i<S*2;i+=40){g.beginPath();g.moveTo(i,0);g.lineTo(i+20,0);g.lineTo(i+20-S,S);g.lineTo(i-S,S);g.fill()}g.restore()}
  const t=new THREE.CanvasTexture(c),tb=new THREE.CanvasTexture(b);
  for(const x of [t,tb]){x.wrapS=x.wrapT=THREE.RepeatWrapping;x.anisotropy=4}
  t.colorSpace=THREE.SRGBColorSpace;return [t,tb];
}
export function makeGlowTex(){const c=cv(64,64),g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.55)');gr.addColorStop(.6,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
export function makeSmokeTex(){const c=cv(64,64),g=c.getContext('2d'),r=rng(5);for(let i=0;i<14;i++){const x=32+(r()-.5)*22,y=32+(r()-.5)*22,rad=10+r()*12,gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,'rgba(255,255,255,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}

let _m=null;
export function mats(){
  if(_m)return _m;
  const [pt,pb]=makePanelTex('panel'),[lt,lb]=makePanelTex('plate'),[ht,hb]=makePanelTex('hazard');
  const std=(o)=>new THREE.MeshStandardMaterial(o);
  _m={
    hull:std({map:pt,bumpMap:pb,bumpScale:2.2,color:0xcfd8e6,metalness:.82,roughness:.42}),
    dark:std({map:pt,bumpMap:pb,bumpScale:1.6,color:0x70788a,metalness:.9,roughness:.5}),
    plate:std({map:lt,bumpMap:lb,bumpScale:2,color:0xe0e6f0,metalness:.78,roughness:.36}),
    accent:std({map:pt,bumpMap:pb,bumpScale:1.4,color:0xd8782a,metalness:.55,roughness:.45}),
    hazard:std({map:ht,bumpMap:hb,bumpScale:1.4,color:0xffffff,metalness:.5,roughness:.5}),
    black:std({color:0x14161a,metalness:.6,roughness:.7}),
    brass:std({color:0xb98a45,metalness:.95,roughness:.3}),
    chrome:std({color:0xdfe6ef,metalness:1,roughness:.18}),
    glass:std({color:0x55c8e0,metalness:.1,roughness:.05,transparent:true,opacity:.28,depthWrite:false,emissive:0x0a3a48,emissiveIntensity:.6}),
  };
  return _m;
}

// geometry cache with box-projected UVs for consistent texel density
const gc=new Map();
function proj(g,k=.42){g=g.index?g.toNonIndexed():g;const p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i)),x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(ay>=ax&&ay>=az){uv[i*2]=x*k;uv[i*2+1]=z*k}else if(ax>=az){uv[i*2]=z*k;uv[i*2+1]=y*k}else{uv[i*2]=x*k;uv[i*2+1]=y*k}}
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g}
function C(key,f){let g=gc.get(key);if(!g){g=proj(f());gc.set(key,g)}return g}
export const G={
  box:(w,h,d,r=.05)=>C(`b${w},${h},${d},${r}`,()=>r>0?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2.01,h/2.01,d/2.01)):new THREE.BoxGeometry(w,h,d)),
  cyl:(rt,rb,h,s=20)=>C(`c${rt},${rb},${h},${s}`,()=>new THREE.CylinderGeometry(rt,rb,h,s)),
  cylo:(rt,rb,h,s=20)=>C(`co${rt},${rb},${h},${s}`,()=>new THREE.CylinderGeometry(rt,rb,h,s,1,true)),
  tor:(r,t,s=12,a=Math.PI*2)=>C(`t${r},${t},${s},${a}`,()=>new THREE.TorusGeometry(r,t,6,s,a)),
  sph:(r,w=16,h=12)=>C(`s${r},${w},${h}`,()=>new THREE.SphereGeometry(r,w,h)),
  dish:(r)=>C(`d${r}`,()=>new THREE.SphereGeometry(r,16,8,0,Math.PI*2,0,.9)),
  ico:(r,d=0)=>C(`i${r},${d}`,()=>new THREE.IcosahedronGeometry(r,d)),
  oct:(r)=>C(`o${r}`,()=>new THREE.OctahedronGeometry(r)),
};

const _m4=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_v=new THREE.Vector3(),_s=new THREE.Vector3(1,1,1);
export class Model{
  constructor(){this.root=new THREE.Group();this.st=new Map();this.glows=[];this.tick=null;this.H=3;this.tips=[];this.arms=null;this.M=mats()}
  piv(x=0,y=0,z=0,parent=this.root){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g}
  // add mesh; static (merged) unless parent given
  add(geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0,parent=null,sx=1,sy=1,sz=1){
    if(parent){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
    const g=geo.clone();_e.set(rx,ry,rz);_q.setFromEuler(_e);_m4.compose(_v.set(x,y,z),_q,_s.set(sx,sy,sz));g.applyMatrix4(_m4);
    let a=this.st.get(mat);if(!a)this.st.set(mat,a=[]);a.push(g);return null}
  glow(color,intensity=2,mode='steady',phase=0){const m=new THREE.MeshStandardMaterial({color:0x111111,emissive:color,emissiveIntensity:intensity,metalness:.2,roughness:.4});this.glows.push({m,base:intensity,mode,phase});return m}
  tip(parent,x,y,z){const o=new THREE.Object3D();o.position.set(x,y,z);parent.add(o);this.tips.push(o);return o}
  finalize(){
    for(const [mat,list] of this.st){const g=mergeGeometries(list,false);if(!g)continue;const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;m.userData.merged=true;this.root.add(m)}
    this.st.clear();return this}
  animateGlows(t,k=1){for(const o of this.glows){let v=1;if(o.mode==='pulse')v=.55+.45*Math.sin(t*3+o.phase);else if(o.mode==='blink')v=Math.sin(t*5+o.phase)>.6?1:.08;else if(o.mode==='flicker')v=.7+.3*Math.sin(t*23+o.phase)*Math.sin(t*7.3);o.m.emissiveIntensity=o.base*v*k}}
}
