// Shared helpers for the alien horde: RNG, procedural chitin textures, fake wet-look environment,
// creature materials (with shared hit-flash uniform) and a small merged-geometry builder.
import * as THREE from 'three';

export function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export const lerp=(a,b,t)=>a+(b-a)*t;
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
export function angDiff(a,b){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d}

// ---------- textures ----------
const texCache=new Map();
/** Voronoi plate texture set: albedo, bump, emissive (glowing grooves/veins). Tileable. */
export function chitinTex(key,{base=[0.2,0.2,0.25],glow=[0.2,1,0.7],cells=36,size=256,seed=1,veins=0.5,spots=0}={}){
  if(texCache.has(key))return texCache.get(key);
  const R=rng(seed),pts=[];for(let i=0;i<cells;i++)pts.push([R(),R(),R(),R()]);
  const mk=()=>{const c=document.createElement('canvas');c.width=c.height=size;return c};
  const ca=mk(),cb=mk(),ce=mk(),xa=ca.getContext('2d'),xb=cb.getContext('2d'),xe=ce.getContext('2d');
  const ia=xa.createImageData(size,size),ib=xb.createImageData(size,size),ie=xe.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;let f1=9,f2=9,id=0;
    for(let i=0;i<cells;i++){const p=pts[i];let dx=Math.abs(p[0]-u),dy=Math.abs(p[1]-v);if(dx>0.5)dx=1-dx;if(dy>0.5)dy=1-dy;const d=Math.sqrt(dx*dx+dy*dy);if(d<f1){f2=f1;f1=d;id=i}else if(d<f2)f2=d}
    const p=pts[id],edge=f2-f1;
    const groove=smooth(0.0,0.02,edge),dome=smooth(0,0.12,f1*0.0+edge);
    const n=(Math.sin(u*97+v*53+p[2]*9)+Math.sin(u*41-v*113))*0.5;
    const shade=(0.55+0.6*p[2])*(0.3+0.7*groove)+n*0.04+(Math.random()-0.5)*0.05;
    const o=(y*size+x)*4;
    ia.data[o]=clamp(base[0]*shade*255*1.4,0,255);ia.data[o+1]=clamp(base[1]*shade*255*1.4,0,255);ia.data[o+2]=clamp(base[2]*shade*255*1.4,0,255);ia.data[o+3]=255;
    const h=clamp(groove*(0.55+0.3*dome+0.15*p[3])+n*0.03,0,1)*255;ib.data[o]=ib.data[o+1]=ib.data[o+2]=h;ib.data[o+3]=255;
    const vein=p[3]<veins?1:0, gl=(1-groove)*(1-groove)*vein+(spots&&p[2]>1-spots&&f1<0.03?1:0);
    ie.data[o]=glow[0]*255*gl;ie.data[o+1]=glow[1]*255*gl;ie.data[o+2]=glow[2]*255*gl;ie.data[o+3]=255;
  }
  xa.putImageData(ia,0,0);xb.putImageData(ib,0,0);xe.putImageData(ie,0,0);
  const t=(c,srgb)=>{const x=new THREE.CanvasTexture(c);x.wrapS=x.wrapT=THREE.RepeatWrapping;x.anisotropy=4;if(srgb)x.colorSpace=THREE.SRGBColorSpace;return x};
  const r={map:t(ca,true),bump:t(cb),emi:t(ce,true)};texCache.set(key,r);return r;
}

// ---------- fake wet-look environment (used only by creature materials) ----------
let envTex=null;
export function getEnv(ctx){
  if(ctx.scene.environment)return ctx.scene.environment;
  if(envTex)return envTex;
  try{
    const s=new THREE.Scene();
    const sky=new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 vP;void main(){float h=vP.y;vec3 top=vec3(.10,.28,.34),hor=vec3(.55,.22,.5),bot=vec3(.03,.06,.05);vec3 c=h>0.?mix(hor,top,pow(h,.6)):mix(hor*.5,bot,pow(-h,.5));gl_FragColor=vec4(c,1.);}'}));
    s.add(sky);
    const spot=(c,x,y,z,r)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),new THREE.MeshBasicMaterial({color:c}));m.position.set(x,y,z);s.add(m)};
    spot(new THREE.Color(5,4,3),-20,30,10,6);spot(new THREE.Color(0.6,3,3.2),25,12,-20,5);spot(new THREE.Color(3,0.8,2.6),-25,6,-25,5);spot(new THREE.Color(1.5,2.5,1),0,4,30,4);
    const pm=new THREE.PMREMGenerator(ctx.renderer);envTex=pm.fromScene(s,0.03).texture;pm.dispose();
  }catch(e){envTex=null}
  return envTex;
}

/** Create a wet chitin material. `flash` is a shared {value} uniform so one creature flashes as a whole. */
export function creatureMat(ctx,{tex,color=0xffffff,glow=0x33ffaa,glowI=1.2,rough=0.38,metal=0.15,coat=0.9,coatR=0.2,bump=1.6,rep=1,flash,sheen=0,transmit=false}={}){
  const m=new THREE.MeshPhysicalMaterial({color,roughness:rough,metalness:metal,clearcoat:coat,clearcoatRoughness:coatR,envMap:getEnv(ctx),envMapIntensity:1.25,
    emissive:glow,emissiveIntensity:glowI});
  if(sheen){m.sheen=sheen;m.sheenColor=new THREE.Color(glow);m.sheenRoughness=0.4}
  if(tex){m.map=tex.map.clone();m.bumpMap=tex.bump.clone();m.emissiveMap=tex.emi.clone();
    for(const t of [m.map,m.bumpMap,m.emissiveMap]){t.repeat.set(rep,rep);t.needsUpdate=true}m.bumpScale=bump}
  if(flash){m.onBeforeCompile=sh=>{sh.uniforms.uFlashV=flash;
    sh.fragmentShader='uniform float uFlashV;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,0.82,0.65)*uFlashV;')};
    m.customProgramCacheKey=()=>'creatureflash'}
  return m;
}

// ---------- merged geometry builder ----------
export class GeoBuilder{
  constructor(){this.pos=[];this.nor=[];this.col=[];this.leg=[];this.uv=[];this.idx=[];this.n=0;this.attrs=null}
  /** geo: any BufferGeometry (indexed or not). mat: Matrix4. opts: color(x,y,z,nx,ny,nz,t)->[r,g,b] or [r,g,b];
   *  glow(x,y,z,t)->0..1; phase,side; weight(t)->0..1 (t from geo 'tt' attr else 0) */
  add(geo,mat,{color=[.3,.3,.3],glow=0,phase=0,side=0,weight=0}={}){
    const g=geo.index?geo:geo.clone();const p=geo.attributes.position,nm=geo.attributes.normal,tt=geo.attributes.tt,uv=geo.attributes.uv;
    const nmat=new THREE.Matrix3().getNormalMatrix(mat),v=new THREE.Vector3(),nv=new THREE.Vector3();
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i).applyMatrix4(mat);nv.fromBufferAttribute(nm,i).applyMatrix3(nmat).normalize();
      const t=tt?tt.getX(i):0;
      this.pos.push(v.x,v.y,v.z);this.nor.push(nv.x,nv.y,nv.z);this.uv.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
      const c=typeof color==='function'?color(v.x,v.y,v.z,nv.x,nv.y,nv.z,t):color;this.col.push(c[0],c[1],c[2]);
      const gl=typeof glow==='function'?glow(v.x,v.y,v.z,t):glow;
      const w=typeof weight==='function'?weight(t):weight;
      this.leg.push(phase,w,gl,side);
    }
    if(geo.index)for(let i=0;i<geo.index.count;i++)this.idx.push(geo.index.getX(i)+this.n);
    else for(let i=0;i<p.count;i++)this.idx.push(i+this.n);
    this.n+=p.count;return this;
  }
  build(){const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setAttribute('aLeg',new THREE.Float32BufferAttribute(this.leg,4));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setIndex(this.idx);g.computeBoundingSphere();return g}
}
const _up=new THREE.Vector3(0,1,0),_q=new THREE.Quaternion(),_d=new THREE.Vector3();
export function segMatrix(a,b){_d.subVectors(b,a);const len=_d.length();_q.setFromUnitVectors(_up,_d.divideScalar(len||1));
  return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5),_q.clone(),new THREE.Vector3(1,1,1))}
/** Tapered cylinder geometry from a to b (r0 at a, r1 at b) with 'tt' 0..1 attribute, y-aligned in local space. */
export function taper(a,b,r0,r1,rad=6,hs=1){const len=a.distanceTo(b);const g=new THREE.CylinderGeometry(r1,r0,len,rad,hs,false);
  const tt=new Float32Array(g.attributes.position.count);for(let i=0;i<tt.length;i++)tt[i]=g.attributes.position.getY(i)/len+0.5;
  g.setAttribute('tt',new THREE.BufferAttribute(tt,1));return g}
export function ellipsoid(rx,ry,rz,ws=14,hs=10){const g=new THREE.SphereGeometry(1,ws,hs);g.scale(rx,ry,rz);return g}
export function cone(r,h,rad=6){const g=new THREE.ConeGeometry(r,h,rad,1);g.translate(0,h/2,0);return g}
