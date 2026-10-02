// Procedural PBR materials + textures for the hero and weapons.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

function rng(seed){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296)}

function plateCanvas(){
  const S=512,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),r=rng(7);
  g.fillStyle='#c9ccd0';g.fillRect(0,0,S,S);
  // subtle mottling
  for(let i=0;i<900;i++){const x=r()*S,y=r()*S,rad=4+r()*26;g.fillStyle=`rgba(${r()<.5?'255,255,255':'60,64,70'},${.02+r()*.04})`;g.beginPath();g.arc(x,y,rad,0,7);g.fill()}
  // panel seams (recursive split)
  const seams=[];(function split(x,y,w,h,d){if(d>3||w<90||h<90||r()<.15){seams.push([x,y,w,h]);return}
    if(w>h){const a=w*(.35+r()*.3);split(x,y,a,h,d+1);split(x+a,y,w-a,h,d+1)}else{const a=h*(.35+r()*.3);split(x,y,w,a,d+1);split(x,y+a,w,h-a,d+1)}})(0,0,S,S,0);
  for(const [x,y,w,h] of seams){
    g.strokeStyle='rgba(30,34,40,.6)';g.lineWidth=3;g.strokeRect(x+1.5,y+1.5,w-3,h-3);
    g.strokeStyle='rgba(255,255,255,.3)';g.lineWidth=1.5;g.strokeRect(x+4.5,y+4.5,w-9,h-9);
    g.fillStyle=`rgba(${r()<.5?'255,255,255':'40,44,50'},.07)`;g.fillRect(x+5,y+5,w-10,h-10);
    g.fillStyle='rgba(40,44,50,.9)';for(const [px,py] of [[x+12,y+12],[x+w-12,y+12],[x+12,y+h-12],[x+w-12,y+h-12]]){g.beginPath();g.arc(px,py,3,0,7);g.fill();g.fillStyle='rgba(255,255,255,.5)';g.beginPath();g.arc(px-1,py-1,1.2,0,7);g.fill();g.fillStyle='rgba(40,44,50,.9)'}
  }
  // scratches + dirt
  for(let i=0;i<260;i++){const x=r()*S,y=r()*S,l=6+r()*40,a=r()*6.28;g.strokeStyle=`rgba(${r()<.6?'20,22,26':'255,255,255'},${.12+r()*.25})`;g.lineWidth=.6+r()*.8;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke()}
  const gr=g.createLinearGradient(0,0,0,S);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(30,22,10,.28)');g.fillStyle=gr;g.fillRect(0,0,S,S);
  return c;
}
function noiseCanvas(){
  const S=256,c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d'),r=rng(11);
  g.fillStyle='#999';g.fillRect(0,0,S,S);
  for(let i=0;i<3000;i++){const v=(90+r()*130)|0;g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(r()*S,r()*S,1+r()*3,1+r()*3)}
  for(let i=0;i<60;i++){g.strokeStyle=`rgba(255,255,255,${.1+r()*.2})`;g.beginPath();const y=r()*S;g.moveTo(0,y);g.lineTo(S,y+r()*6-3);g.stroke()}
  return c;
}
export function glowTexture(inner='rgba(255,255,255,1)',mid='rgba(255,255,255,.35)'){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,inner);gr.addColorStop(.35,mid);gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function streakTexture(){ // horizontal streak, bright at +x end
  const c=document.createElement('canvas');c.width=128;c.height=32;const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,128,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.7,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,1)');
  g.fillStyle=gr;g.fillRect(0,0,128,32);
  const m=g.createLinearGradient(0,0,0,32);m.addColorStop(0,'rgba(0,0,0,1)');m.addColorStop(.5,'rgba(0,0,0,0)');m.addColorStop(1,'rgba(0,0,0,1)');g.globalCompositeOperation='destination-out';g.fillStyle=m;g.fillRect(0,0,128,32);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function flameTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=rng(5);
  for(let i=0;i<14;i++){const x=32+(r()-.5)*18,y=32+(r()-.5)*18,rad=8+r()*14;const gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64)}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export function makeMaterials(renderer){
  const pm=new THREE.PMREMGenerator(renderer);const env=pm.fromScene(new RoomEnvironment(),0.04).texture;pm.dispose();
  const tex=new THREE.CanvasTexture(plateCanvas());tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=8;tex.repeat.set(.4,.4);
  const bump=new THREE.CanvasTexture(plateCanvas());bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.anisotropy=8;bump.repeat.set(.4,.4);
  const rough=new THREE.CanvasTexture(noiseCanvas());rough.wrapS=rough.wrapT=THREE.RepeatWrapping;
  const std=(o)=>new THREE.MeshStandardMaterial(Object.assign({envMap:env,envMapIntensity:.55},o));
  const M={env};
  M.armor=std({color:0xb9bec5,map:tex,bumpMap:bump,bumpScale:-1.2,roughnessMap:rough,roughness:.42,metalness:.55});
  M.accent=std({color:0xff6a18,map:tex,bumpMap:bump,bumpScale:-1.2,roughnessMap:rough,roughness:.48,metalness:.5});
  M.dark=std({color:0x3a424c,map:tex,bumpMap:bump,bumpScale:-.8,roughnessMap:rough,roughness:.5,metalness:.88});
  M.steel=std({color:0x9aa3ad,roughness:.28,metalness:1});
  M.black=std({color:0x0e1013,roughness:.85,metalness:.2});
  M.rubber=std({color:0x15171a,roughness:.7,metalness:.1});
  M.glow=std({color:0x021014,emissive:0x35e8ff,emissiveIntensity:2.0,roughness:.3,metalness:0});
  M.glowOrange=std({color:0x140600,emissive:0xff7a1c,emissiveIntensity:2,roughness:.3,metalness:0});
  M.visor=std({color:0x02080c,emissive:0x1fc8e0,emissiveIntensity:.7,roughness:.15,metalness:.8,envMapIntensity:.7});
  M.hair=std({color:0x6b2c1c,roughness:.45,metalness:.15});
  M.skin=std({color:0xd9a58a,roughness:.6,metalness:0});
  M.glass=new THREE.MeshStandardMaterial({color:0x66f0ff,emissive:0x1ad0f0,emissiveIntensity:1.6,transparent:true,opacity:.55,roughness:.05,metalness:.2,envMap:env});
  M.tex=tex;
  return M;
}
