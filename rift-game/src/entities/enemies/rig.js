// Procedural skeletal animation: two-bone IK legs with planted feet and gait-group stepping.
import * as THREE from 'three';
import {GeoBuilder,taper,ellipsoid,cone,segMatrix,clamp} from './util.js';

const UP=new THREE.Vector3(0,1,0);
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3(),_d=new THREE.Vector3(),_m=new THREE.Vector3();

/** Leg segment geometry, base at origin, pointing +Y, length L. kind: 'upper' | 'lower'. */
export function legSegGeo(L,r0,r1,kind,{spikes=true,claw=0,plates=true}={}){
  const b=new GeoBuilder(),col=[1,1,1];
  b.add(taper(V(0,0,0),V(0,L,0),r0,r1,8,3),new THREE.Matrix4(),{color:col});
  if(plates)for(let i=0;i<3;i++){const t=0.2+i*0.28,r=r0+(r1-r0)*t;
    const m=new THREE.Matrix4().makeTranslation(0,L*t,0);b.add(ellipsoid(r*1.5,L*0.14,r*1.5,8,5),m,{color:col})}
  if(spikes){const n=kind==='upper'?3:2;for(let i=0;i<n;i++){const t=0.25+i*0.28,r=r0+(r1-r0)*t;
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,-1.1));const m=new THREE.Matrix4().compose(V(r*0.8,L*t,0),q,V(1,1,1));
    b.add(cone(r*0.55,r*3.2,5),m,{color:col})}}
  if(claw){const e=V(0,L,0),m1=V(0.0,L+claw*0.5,claw*0.35),m2=V(0,L+claw*0.7,claw*0.95);
    b.add(taper(e,m1,r1,r1*0.6,6),segMatrix(e,m1),{color:col});b.add(taper(m1,m2,r1*0.6,0.003,6),segMatrix(m1,m2),{color:col})}
  return b.build();
}

export class Leg{
  /** o: {hip:V3 local, home:V3 local, L1,L2, upGeo,loGeo, mat, kneeGeo, group:0|1, bend:V3 local, stepDist, stepH, stepTime, parent:Object3D (world-space container)} */
  constructor(o){
    Object.assign(this,o);
    this.up=new THREE.Mesh(o.upGeo,o.mat);this.lo=new THREE.Mesh(o.loGeo,o.mat);
    this.up.castShadow=this.lo.castShadow=true;
    this.up.frustumCulled=this.lo.frustumCulled=false;
    this.knee=o.kneeGeo?new THREE.Mesh(o.kneeGeo,o.kneeMat||o.mat):null;
    o.parent.add(this.up,this.lo);if(this.knee){this.knee.castShadow=true;o.parent.add(this.knee)}
    this.foot=new THREE.Vector3();this.from=new THREE.Vector3();this.to=new THREE.Vector3();this.mid=new THREE.Vector3();this.hipW=new THREE.Vector3();
    this.stepping=false;this.t=0;this.ready=false;this.manual=false;this.lift=0;
  }
  setVisible(v){this.up.visible=this.lo.visible=v;if(this.knee)this.knee.visible=v}
  reset(){this.ready=false;this.stepping=false}
  /** body: Object3D with fresh matrixWorld. others: array of legs (for gait-group blocking). */
  update(body,vx,vz,dt,ground,others,spread=1){
    const bm=body.matrixWorld;
    const hip=this.hipW.copy(this.hip).applyMatrix4(bm);
    const home=_a.copy(this.home);home.x*=spread;home.z*=spread;home.applyMatrix4(bm);
    const spd=Math.hypot(vx,vz);
    if(!this.ready){this.foot.set(home.x,ground(home.x,home.z),home.z);this.ready=true}
    if(!this.manual){
      const lead=Math.min(0.5,this.stepTime*1.4);
      if(!this.stepping){
        const dx=this.foot.x-home.x,dz=this.foot.z-home.z,d=Math.hypot(dx,dz);
        let free=true;for(const l of others)if(l!==this&&l.stepping&&l.group!==this.group){free=false;break}
        if((free&&d>this.stepDist)||d>this.stepDist*1.9){
          this.stepping=true;this.t=0;this.from.copy(this.foot);
          this.to.set(home.x+vx*lead,0,home.z+vz*lead);this.to.y=ground(this.to.x,this.to.z);
          this.dur=this.stepTime/(1+spd*0.06);
        }
      }
      if(this.stepping){
        this.t+=dt/this.dur;const t=Math.min(1,this.t),e=t*t*(3-2*t);
        this.foot.lerpVectors(this.from,this.to,e);this.foot.y+=Math.sin(t*Math.PI)*this.stepH;
        if(this.t>=1){this.stepping=false;this.landed=true}
      }
    }
    this.solve(body,hip);
  }
  solve(body,hip){
    const L1=this.L1,L2=this.L2,foot=this.foot;
    const d=_b.subVectors(foot,hip);let dist=d.length();const maxR=(L1+L2)*0.998;
    const dir=d.divideScalar(dist||1);if(dist>maxR)dist=maxR;if(dist<Math.abs(L1-L2)+0.05)dist=Math.abs(L1-L2)+0.05;
    const a=(L1*L1-L2*L2+dist*dist)/(2*dist),h=Math.sqrt(Math.max(0,L1*L1-a*a));
    const pole=_c.copy(this.bend).transformDirection(body.matrixWorld);
    pole.addScaledVector(dir,-pole.dot(dir));if(pole.lengthSq()<1e-4)pole.copy(UP);pole.normalize();
    const mid=this.mid.copy(hip).addScaledVector(dir,a).addScaledVector(pole,h);
    this.seg(this.up,hip,mid,L1);this.seg(this.lo,mid,foot,L2);
    if(this.knee)this.knee.position.copy(mid);
  }
  seg(m,a,b,L){m.position.copy(a);_m.subVectors(b,a);const len=_m.length();m.quaternion.setFromUnitVectors(UP,_m.divideScalar(len||1));m.scale.y=len/L}
}
