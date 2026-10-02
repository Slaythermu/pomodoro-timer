// Swarm 'skitter': small fast insectoid. One InstancedMesh for the entire swarm; legs are animated in the
// vertex shader (tripod gait driven by a per-instance accumulated phase), so hundreds cost almost nothing on the CPU.
import * as THREE from 'three';
import {GeoBuilder,taper,ellipsoid,cone,segMatrix,rng} from './util.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),S=new THREE.Vector3(),P=new THREE.Vector3();

function buildGeo(){
  const b=new GeoBuilder(),R=rng(7);
  const chitin=(x,y,z,nx,ny)=>{const band=0.5+0.5*Math.sin(z*46);const top=Math.max(0,ny);
    return [0.07+0.07*band+0.06*top,0.045+0.05*band,0.12+0.1*band+0.05*top]};
  const belly=(x,y,z,nx,ny)=>ny<-0.3?[0.35,0.18,0.3]:chitin(x,y,z,nx,ny);
  // abdomen (segmented by color banding) with glowing underbelly + dorsal stripe
  const ab=ellipsoid(0.2,0.17,0.34,14,10);
  b.add(ab,M.makeTranslation(0,0.34,-0.3),{color:belly,glow:(x,y,z,t)=>{const lowGlow=Math.max(0,-(y-0.34)/0.17-0.4);const stripe=Math.abs(x)<0.03&&y>0.45?0.6:0;return Math.min(1,lowGlow*0.9+stripe+(Math.sin(z*46)>0.92?0.5:0))}});
  b.add(ellipsoid(0.15,0.13,0.2,12,8),M.makeTranslation(0,0.37,0.06),{color:chitin,glow:0});
  // head + eyes + mandibles + antennae
  b.add(ellipsoid(0.11,0.09,0.13,12,8),M.makeTranslation(0,0.33,0.27),{color:[0.1,0.07,0.14]});
  for(const sx of [-1,1]){
    b.add(ellipsoid(0.035,0.035,0.04,8,6),M.makeTranslation(sx*0.07,0.37,0.34),{color:[0.9,1,0.5],glow:1});
    b.add(ellipsoid(0.02,0.02,0.025,6,4),M.makeTranslation(sx*0.04,0.4,0.37),{color:[0.9,1,0.5],glow:1});
    // mandible: two curved segments, animated snapping (weight on tip, fixed phase)
    const a=V(sx*0.05,0.29,0.36),k=V(sx*0.1,0.25,0.46),t=V(sx*0.03,0.26,0.54);
    b.add(taper(a,k,0.026,0.02,5),segMatrix(a,k),{color:[0.35,0.25,0.2],weight:0});
    b.add(taper(k,t,0.02,0.004,5),segMatrix(k,t),{color:[0.6,0.5,0.35],glow:0.35,weight:0.5,phase:sx>0?0:1.2,side:0});
    const an0=V(sx*0.04,0.4,0.35),an1=V(sx*0.12,0.52,0.5),an2=V(sx*0.2,0.5,0.66);
    b.add(taper(an0,an1,0.009,0.006,4),segMatrix(an0,an1),{color:[0.1,0.1,0.15],weight:0.3,phase:sx>0?0:2});
    b.add(taper(an1,an2,0.006,0.002,4),segMatrix(an1,an2),{color:[0.1,0.1,0.15],glow:0.4,weight:0.9,phase:sx>0?0.5:2.5});
  }
  // dorsal spines w/ glowing tips
  for(let i=0;i<4;i++){const z=-0.1-i*0.14,h=0.1-i*0.012;const m=new THREE.Matrix4().compose(V(0,0.5-i*0.01,z),new THREE.Quaternion().setFromEuler(E.set(-0.5,0,0)),V(1,1,1));
    b.add(cone(0.03-i*0.004,h,5),m,{color:[0.12,0.08,0.18],glow:(x,y)=>y>0.5+h*0.45?0.9:0.1})}
  // 6 legs: hip -> knee -> foot (3 segments incl. tarsus), weighted along the leg so the foot swings most
  const hz=[0.12,0.0,-0.14],legC=(x,y,z,nx,ny,nz,t)=>[0.09+0.05*t,0.06,0.13+0.05*t];
  let i=0;
  for(const sx of [-1,1])for(let k=0;k<3;k++,i++){
    const z0=hz[k],spread=(k-1)*0.2,H=V(sx*0.1,0.37,z0),K=V(sx*(0.3+0.03*(1-Math.abs(k-1))),0.62,z0+spread*0.35),A=V(sx*0.5,0.28,z0+spread*0.9),F=V(sx*0.58+sx*0.05*k,0.0,z0+spread*1.15);
    const ph=((k+(sx>0?1:0))%2)*Math.PI+k*0.15,seg=[[H,K,0.032,0.026,0,0.38],[K,A,0.026,0.018,0.38,0.75],[A,F,0.018,0.006,0.75,1]];
    for(const [p,q,r0,r1,t0,t1] of seg){
      b.add(taper(p,q,r0,r1,6),segMatrix(p,q),{color:(x,y,z,nx,ny,nz,t)=>legC(x,y,z,nx,ny,nz,t0+t*(t1-t0)),glow:(x,y,z,t)=>t0+t*(t1-t0)>0.93?0.9:0,phase:ph,side:sx,weight:t=>t0+t*(t1-t0)});
    }
    b.add(ellipsoid(0.034,0.034,0.034,6,5),M.makeTranslation(K.x,K.y,K.z),{color:[0.25,0.12,0.3],glow:0.5,phase:ph,side:sx,weight:0.38});
  }
  return b.build();
}

export class SkitterSwarm{
  constructor(ctx,max=700){
    this.max=max;this.n=0;this.slots=new Array(max).fill(null);
    const geo=buildGeo();
    const mat=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:0.34,metalness:0.2,clearcoat:1,clearcoatRoughness:0.18,envMapIntensity:1.3,emissive:0xffffff});
    mat.envMap=null;
    mat.onBeforeCompile=sh=>{
      sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 aAnim;attribute vec4 aLeg;varying float vFl;varying float vGl;varying float vPu;varying vec3 vGc;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
float p_=aAnim.x+aLeg.x;float w_=aLeg.y;float amp_=aAnim.y;
float bob_=abs(sin(aAnim.x))*0.035*amp_;
transformed.y+=bob_*(1.0-w_);
float sw_=sin(p_),lf_=max(0.0,cos(p_));
transformed.z+=sw_*0.26*amp_*w_*w_;
transformed.y+=lf_*0.22*amp_*w_*w_*w_;
transformed.x+=aLeg.w*(0.04+0.05*lf_)*amp_*w_*w_;
transformed.y+=sin(aAnim.w*6.0+aLeg.x*3.0)*0.012*w_*(1.0-amp_*0.7);
vFl=aAnim.z;vGl=aLeg.z;vPu=0.75+0.25*sin(aAnim.w*3.0);`);
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying float vFl;varying float vGl;varying float vPu;`)
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=vec3(0.45,1.0,0.35)*vGl*vPu*1.6+vec3(1.0,0.8,0.6)*vFl*1.4;`);
    };
    mat.customProgramCacheKey=()=>'skitterInst';
    mat.emissive.setRGB(0,0,0);
    this.mesh=new THREE.InstancedMesh(geo,mat,max);this.mesh.frustumCulled=false;this.mesh.castShadow=true;this.mesh.receiveShadow=true;this.mesh.count=0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.anim=new THREE.InstancedBufferAttribute(new Float32Array(max*4),4);this.anim.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('aAnim',this.anim);
    this.mesh.setColorAt(0,new THREE.Color(1,1,1));this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    ctx.scene.add(this.mesh);
  }
  add(e){
    if(this.n>=this.max)return false;const i=this.n++;e.slot=i;this.slots[i]=e;
    const c=new THREE.Color().setHSL(0.72+Math.random()*0.2-0.1,0.3+Math.random()*0.5,0.7+Math.random()*0.5);c.multiplyScalar(1);this.mesh.setColorAt(i,c);this.mesh.instanceColor.needsUpdate=true;
    this.mesh.count=this.n;return true;
  }
  remove(e){
    const i=e.slot;if(i<0)return;const l=--this.n,m=this.slots[l];
    if(i!==l){this.slots[i]=m;m.slot=i;const ic=this.mesh.instanceColor;ic.array.copyWithin(i*3,l*3,l*3+3)}
    this.slots[l]=null;e.slot=-1;this.mesh.count=this.n;this.mesh.instanceColor.needsUpdate=true;
  }
  /** call after enemy sim: writes per-instance transform + animation attributes */
  sync(ctx,dt){
    const a=this.anim.array,im=this.mesh.instanceMatrix.array;
    const cam=ctx.camera.position;
    for(let i=0;i<this.n;i++){
      const e=this.slots[i];
      // crouch before lunge (telegraph), stretch while leaping
      let sy=1,sz=1,lift=0,pitch=0;
      if(e.state===2){const k=Math.min(1,e.stateT/e.windup);sy=1-0.35*k;sz=1+0.12*k;pitch=0.25*k}
      else if(e.state===3){const k=Math.min(1,e.stateT/0.28);lift=Math.sin(k*Math.PI)*0.55;sz=1.25;pitch=-0.35*Math.sin(k*Math.PI)}
      const spawn=Math.min(1,e.age*3),sc=e.scale*(0.6+0.4*spawn);
      const cy=Math.cos(e.yaw),sn=Math.sin(e.yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
      // rotation: yaw about Y then pitch about local X ; matrix columns (three is column-major)
      const o=i*16;
      // local axes: X=(cy,0,-sn) Y=(sn*sp,cp,cy*sp) Z=(sn*cp,-sp,cy*cp)
      im[o]=cy*sc;im[o+1]=0;im[o+2]=-sn*sc;im[o+3]=0;
      im[o+4]=sn*sp*sc*sy;im[o+5]=cp*sc*sy;im[o+6]=cy*sp*sc*sy;im[o+7]=0;
      im[o+8]=sn*cp*sc*sz;im[o+9]=-sp*sc*sz;im[o+10]=cy*cp*sc*sz;im[o+11]=0;
      im[o+12]=e.pos.x;im[o+13]=e.pos.y+lift;im[o+14]=e.pos.z;im[o+15]=1;
      const j=i*4;a[j]=e.phase;a[j+1]=e.stride;a[j+2]=e.flash;a[j+3]=e.glowT;
    }
    this.mesh.instanceMatrix.needsUpdate=true;this.anim.needsUpdate=true;
  }
}
