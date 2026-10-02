// Gore, ichor puddles, attack telegraphs, acid projectiles and shockwaves — all pooled / instanced.
import * as THREE from 'three';
import {rng,clamp,getEnv,smooth} from './util.js';

const D=new THREE.Object3D(),C=new THREE.Color();

function chunkGeo(){
  const g=new THREE.IcosahedronGeometry(1,0).toNonIndexed(),R=rng(5),p=g.attributes.position;const map=new Map();
  for(let i=0;i<p.count;i++){const k=p.getX(i).toFixed(3)+p.getY(i).toFixed(3)+p.getZ(i).toFixed(3);if(!map.has(k))map.set(k,0.65+R()*0.7);const s=map.get(k);p.setXYZ(i,p.getX(i)*s*1.2,p.getY(i)*s*0.7,p.getZ(i)*s)}
  g.computeVertexNormals();return g;
}

export class Debris{
  constructor(ctx){
    this.ctx=ctx;this.scene=ctx.scene;this.t=0;
    this.ground=(x,z)=>ctx.terrain?.heightAt?.(x,z)||0;
    // --- gibs
    this.G=420;this.g={px:new Float32Array(this.G),py:new Float32Array(this.G),pz:new Float32Array(this.G),vx:new Float32Array(this.G),vy:new Float32Array(this.G),vz:new Float32Array(this.G),
      rx:new Float32Array(this.G),ry:new Float32Array(this.G),rz:new Float32Array(this.G),wx:new Float32Array(this.G),wy:new Float32Array(this.G),wz:new Float32Array(this.G),s:new Float32Array(this.G),life:new Float32Array(this.G)};
    this.gi=0;
    const gm=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:0.3,metalness:0.1,clearcoat:1,clearcoatRoughness:0.15,envMap:getEnv(ctx),envMapIntensity:1.2,emissive:0x112211,emissiveIntensity:0.6});
    this.gibMesh=new THREE.InstancedMesh(chunkGeo(),gm,this.G);this.gibMesh.castShadow=true;this.gibMesh.frustumCulled=false;this.gibMesh.count=this.G;
    this.gibMesh.setColorAt(0,C.set(1,1,1));for(let i=0;i<this.G;i++){this.gibMesh.setColorAt(i,C.set(0.1,0.08,0.14));D.scale.setScalar(0);D.updateMatrix();this.gibMesh.setMatrixAt(i,D.matrix)}
    this.scene.add(this.gibMesh);
    // --- glowing ichor globs
    this.B=360;this.b={px:new Float32Array(this.B),py:new Float32Array(this.B),pz:new Float32Array(this.B),vx:new Float32Array(this.B),vy:new Float32Array(this.B),vz:new Float32Array(this.B),s:new Float32Array(this.B),life:new Float32Array(this.B),max:new Float32Array(this.B)};this.bi=0;
    this.globMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),this.B);this.globMesh.frustumCulled=false;
    this.globMesh.setColorAt(0,C.set(1,1,1));for(let i=0;i<this.B;i++){D.scale.setScalar(0);D.updateMatrix();this.globMesh.setMatrixAt(i,D.matrix)}
    this.scene.add(this.globMesh);
    // --- ichor puddles (wet, dark) and acid pools (glowing)
    const flat=new THREE.CircleGeometry(1,20);flat.rotateX(-Math.PI/2);
    this.P=140;this.pud=[];this.pi=0;
    this.pudMesh=new THREE.InstancedMesh(flat,new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.12,metalness:0.2,envMap:getEnv(ctx),envMapIntensity:1.5,emissive:0x0a2a14,emissiveIntensity:0.8,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,transparent:true,opacity:0.9,depthWrite:false}),this.P);
    this.pudMesh.frustumCulled=false;this.pudMesh.setColorAt(0,C.set(1,1,1));this.pudMesh.renderOrder=1;
    for(let i=0;i<this.P;i++){this.pud.push({x:0,z:0,r:0,age:99,life:1,y:0,rot:0,ax:1});D.scale.setScalar(0);D.updateMatrix();this.pudMesh.setMatrixAt(i,D.matrix);this.pudMesh.setColorAt(i,C.set(0.05,0.2,0.1))}
    this.scene.add(this.pudMesh);
    this.A=24;this.acid=[];this.ai=0;
    this.acidMesh=new THREE.InstancedMesh(flat,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.8,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),this.A);
    this.acidMesh.frustumCulled=false;this.acidMesh.setColorAt(0,C.set(1,1,1));this.acidMesh.renderOrder=2;
    for(let i=0;i<this.A;i++){this.acid.push({x:0,z:0,r:0,age:99,life:1,dmgT:0});D.scale.setScalar(0);D.updateMatrix();this.acidMesh.setMatrixAt(i,D.matrix);this.acidMesh.setColorAt(i,C.set(0.3,1.6,0.3))}
    this.scene.add(this.acidMesh);
    // --- telegraphs
    this.tg=[];const ring=new THREE.RingGeometry(0.93,1,48);ring.rotateX(-Math.PI/2);const disc=new THREE.CircleGeometry(1,40);disc.rotateX(-Math.PI/2);
    const lane=new THREE.PlaneGeometry(1,1);lane.rotateX(-Math.PI/2);lane.translate(0,0,-0.5);// extends along +? local -z, handled via rotation
    const tm=(op)=>new THREE.MeshBasicMaterial({color:0xff5522,transparent:true,opacity:op,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,side:THREE.DoubleSide});
    this.tgGeo={ring,disc,lane};this.tgMat=tm;
    // --- projectiles
    this.proj=[];this.projGeo=new THREE.IcosahedronGeometry(0.34,2);this.projMat=new THREE.MeshBasicMaterial({color:new THREE.Color(0.5,2.6,0.5),toneMapped:false});
    // --- shockwaves
    this.waves=[];this.waveGeo=new THREE.RingGeometry(0.9,1,64);this.waveGeo.rotateX(-Math.PI/2);
    this.waveMat=(c)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  }
  // ---------------- spawners
  gibs(pos,n,{speed=7,up=6,col=[0.08,0.06,0.12],size=0.18,glowFrac=0.3,dirx=0,dirz=0,spread=1}={}){
    const g=this.g,mesh=this.gibMesh;
    for(let k=0;k<n;k++){
      const i=this.gi++%this.G,a=Math.random()*6.283,s=speed*(0.3+Math.random()*0.9)*spread;
      g.px[i]=pos.x+(Math.random()-0.5)*0.4;g.py[i]=pos.y+0.3+Math.random()*0.6;g.pz[i]=pos.z+(Math.random()-0.5)*0.4;
      g.vx[i]=Math.cos(a)*s+dirx;g.vz[i]=Math.sin(a)*s+dirz;g.vy[i]=up*(0.4+Math.random()*0.9);
      g.rx[i]=Math.random()*6;g.ry[i]=Math.random()*6;g.rz[i]=Math.random()*6;g.wx[i]=(Math.random()-0.5)*18;g.wy[i]=(Math.random()-0.5)*18;g.wz[i]=(Math.random()-0.5)*18;
      g.s[i]=size*(0.4+Math.random()*1.2);g.life[i]=3.2+Math.random()*2.5;
      const glow=Math.random()<glowFrac;mesh.setColorAt(i,glow?C.setRGB(0.3,1.1,0.6):C.setRGB(col[0]*(0.6+Math.random()),col[1]*(0.6+Math.random()),col[2]*(0.6+Math.random())));
    }
    mesh.instanceColor.needsUpdate=true;
  }
  globs(pos,n,{speed=6,up=5,size=0.12,color=[0.5,2.2,0.7],life=0.9}={}){
    const b=this.b,mesh=this.globMesh;
    for(let k=0;k<n;k++){const i=this.bi++%this.B,a=Math.random()*6.283,s=speed*(0.2+Math.random());
      b.px[i]=pos.x;b.py[i]=pos.y+0.5;b.pz[i]=pos.z;b.vx[i]=Math.cos(a)*s;b.vz[i]=Math.sin(a)*s;b.vy[i]=up*(0.3+Math.random());
      b.s[i]=size*(0.5+Math.random());b.max[i]=b.life[i]=life*(0.6+Math.random()*0.8);
      const v=0.6+Math.random()*0.6;mesh.setColorAt(i,C.setRGB(color[0]*v,color[1]*v,color[2]*v))}
    mesh.instanceColor.needsUpdate=true;
  }
  puddle(x,z,r,life=14,col=[0.04,0.16,0.09]){
    const i=this.pi++%this.P,p=this.pud[i];p.x=x;p.z=z;p.r=r;p.age=0;p.life=life;p.y=this.ground(x,z)+0.1;p.rot=Math.random()*6;p.ax=0.7+Math.random()*0.6;
    this.pudMesh.setColorAt(i,C.setRGB(col[0]*(0.7+Math.random()*0.6),col[1]*(0.7+Math.random()*0.6),col[2]*(0.7+Math.random()*0.6)));this.pudMesh.instanceColor.needsUpdate=true;
  }
  acidPool(x,z,r,life=4.5){const i=this.ai++%this.A,p=this.acid[i];p.x=x;p.z=z;p.r=r;p.age=0;p.life=life;p.dmgT=0;p.y=this.ground(x,z)+0.16;return p}
  telegraph(kind,color=0xff5522){
    const m=this.tgMat,g=this.tgGeo,grp=new THREE.Group();
    const parts={};
    if(kind==='lane'){parts.lane=new THREE.Mesh(g.lane,m(0.35));parts.fill=new THREE.Mesh(g.lane,m(0.5));parts.edge=null;grp.add(parts.lane,parts.fill)}
    else{parts.ring=new THREE.Mesh(g.ring,m(0.85));parts.disc=new THREE.Mesh(g.disc,m(0.35));parts.fill=new THREE.Mesh(g.disc,m(0.45));grp.add(parts.ring,parts.disc,parts.fill)}
    for(const k in parts)if(parts[k]){parts[k].material.color.set(color);parts[k].renderOrder=3;parts[k].frustumCulled=false}
    this.scene.add(grp);const D_=this;
    return {kind,grp,parts,
      circle(x,z,r,prog){grp.visible=true;const y=D_.ground(x,z)+0.18;grp.position.set(x,y,z);grp.rotation.y=0;parts.ring.scale.setScalar(r);parts.disc.scale.setScalar(r);parts.fill.scale.setScalar(Math.max(0.001,r*prog));
        const pu=0.7+0.3*Math.sin(D_.t*18);parts.ring.material.opacity=0.9*pu;parts.fill.material.opacity=0.25+0.5*prog;parts.disc.material.opacity=0.15+0.1*pu},
      lane(x,z,dirx,dirz,len,w,prog){grp.visible=true;grp.position.set(x,D_.ground(x,z)+0.2,z);grp.rotation.y=Math.atan2(-dirx,-dirz);
        // lane geometry extends along local -z (translate -0.5): rotation maps -z to dir
        parts.lane.scale.set(w,1,len);parts.fill.scale.set(w*prog,1,len*prog);const pu=0.7+0.3*Math.sin(D_.t*20);parts.lane.material.opacity=0.2+0.15*pu;parts.fill.material.opacity=0.2+0.5*prog},
      hide(){grp.visible=false},
      dispose(){D_.scene.remove(grp);for(const k in parts)if(parts[k])parts[k].material.dispose()}};
  }
  projectile(from,to,{time=1.1,dmg=12,radius=2.4,onHit,color}={}){
    const m=new THREE.Mesh(this.projGeo,this.projMat);m.castShadow=false;m.frustumCulled=false;this.scene.add(m);
    const g=22,vx=(to.x-from.x)/time,vz=(to.z-from.z)/time,gy=this.ground(to.x,to.z);
    const vy=(gy+0.3-from.y+0.5*g*time*time)/time;
    this.proj.push({m,x:from.x,y:from.y,z:from.z,vx,vy,vz,g,dmg,radius,onHit,t:0,time,tx:to.x,tz:to.z,drip:0});
  }
  shockwave(x,z,{maxR=24,speed=26,band=1.6,dmg=30,color=0xff7733,onHit}={}){
    const m=new THREE.Mesh(this.waveGeo,this.waveMat(color));m.frustumCulled=false;m.renderOrder=4;this.scene.add(m);
    const m2=new THREE.Mesh(this.waveGeo,this.waveMat(color));m2.frustumCulled=false;m2.renderOrder=4;m2.material.opacity=0.35;this.scene.add(m2);
    this.waves.push({m,m2,x,z,r:1,maxR,speed,band,dmg,hit:new Set(),onHit,y:this.ground(x,z)+0.3});
  }
  // ---------------- update
  update(dt){
    this.t+=dt;const ctx=this.ctx;
    // gibs
    const g=this.g,gm=this.gibMesh;
    for(let i=0;i<this.G;i++){
      if(g.life[i]<=0){continue}
      g.life[i]-=dt;
      if(g.life[i]<=0){D.scale.setScalar(0);D.position.set(0,-99,0);D.updateMatrix();gm.setMatrixAt(i,D.matrix);continue}
      g.vy[i]-=26*dt;g.px[i]+=g.vx[i]*dt;g.py[i]+=g.vy[i]*dt;g.pz[i]+=g.vz[i]*dt;
      const gy=this.ground(g.px[i],g.pz[i])+g.s[i]*0.5;
      if(g.py[i]<gy){g.py[i]=gy;if(g.vy[i]<-3&&Math.random()<0.5)this.ichorSplat(g.px[i],g.pz[i]);g.vy[i]=-g.vy[i]*0.32;g.vx[i]*=0.55;g.vz[i]*=0.55;g.wx[i]*=0.5;g.wy[i]*=0.5;g.wz[i]*=0.5}
      const sp=g.life[i]<0.5?g.life[i]/0.5:1;
      g.rx[i]+=g.wx[i]*dt;g.ry[i]+=g.wy[i]*dt;g.rz[i]+=g.wz[i]*dt;
      D.position.set(g.px[i],g.py[i],g.pz[i]);D.rotation.set(g.rx[i],g.ry[i],g.rz[i]);D.scale.setScalar(g.s[i]*sp);D.updateMatrix();gm.setMatrixAt(i,D.matrix);
    }
    gm.instanceMatrix.needsUpdate=true;
    // globs
    const b=this.b,bm=this.globMesh;
    for(let i=0;i<this.B;i++){
      if(b.life[i]<=0)continue;b.life[i]-=dt;
      if(b.life[i]<=0){D.scale.setScalar(0);D.position.set(0,-99,0);D.updateMatrix();bm.setMatrixAt(i,D.matrix);continue}
      b.vy[i]-=20*dt;b.px[i]+=b.vx[i]*dt;b.py[i]+=b.vy[i]*dt;b.pz[i]+=b.vz[i]*dt;
      const gy=this.ground(b.px[i],b.pz[i])+0.05;if(b.py[i]<gy){b.py[i]=gy;b.vy[i]*=-0.2;b.vx[i]*=0.4;b.vz[i]*=0.4}
      const k=b.life[i]/b.max[i];D.position.set(b.px[i],b.py[i],b.pz[i]);D.rotation.set(0,0,0);D.scale.setScalar(b.s[i]*(0.4+0.6*Math.min(1,k*3)));D.updateMatrix();bm.setMatrixAt(i,D.matrix);
    }
    bm.instanceMatrix.needsUpdate=true;
    // puddles
    const pm=this.pudMesh;
    for(let i=0;i<this.P;i++){const p=this.pud[i];if(p.age>=p.life){if(p.age<1e8){D.scale.setScalar(0);D.position.set(0,-99,0);D.updateMatrix();pm.setMatrixAt(i,D.matrix);p.age=1e9}continue}
      p.age+=dt;const grow=smooth(0,0.35,p.age),shrink=1-smooth(p.life-4,p.life,p.age);
      D.position.set(p.x,p.y,p.z);D.rotation.set(0,p.rot,0);D.scale.set(p.r*p.ax*grow*(0.5+0.5*shrink),1,p.r*grow*(0.5+0.5*shrink));D.updateMatrix();pm.setMatrixAt(i,D.matrix)}
    pm.instanceMatrix.needsUpdate=true;
    const am=this.acidMesh;
    for(let i=0;i<this.A;i++){const p=this.acid[i];if(p.age>=p.life){if(p.age<1e8){D.scale.setScalar(0);D.position.set(0,-99,0);D.updateMatrix();am.setMatrixAt(i,D.matrix);p.age=1e9}continue}
      p.age+=dt;const grow=smooth(0,0.2,p.age),fade=1-smooth(p.life-1.2,p.life,p.age),pu=0.9+0.1*Math.sin(this.t*7+i);
      D.position.set(p.x,p.y,p.z);D.rotation.set(0,i,0);D.scale.set(p.r*grow*pu*(0.4+0.6*fade),1,p.r*grow*pu*(0.4+0.6*fade));D.updateMatrix();am.setMatrixAt(i,D.matrix)}
    am.instanceMatrix.needsUpdate=true;
    // projectiles
    for(let i=this.proj.length-1;i>=0;i--){const p=this.proj[i];p.t+=dt;
      p.vy-=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.m.position.set(p.x,p.y,p.z);
      const sc=1+0.2*Math.sin(p.t*30);p.m.scale.set(sc,1/sc,sc);
      p.drip-=dt;if(p.drip<=0){p.drip=0.03;this.globs({x:p.x,y:p.y-0.5,z:p.z},1,{speed:0.8,up:0.5,size:0.1,life:0.5})}
      ctx.lighting?.addLight?.(p.m.position,0x66ff66,1.2,7);
      if(p.t>=p.time*0.995||p.y<this.ground(p.x,p.z)){this.scene.remove(p.m);this.proj.splice(i,1);p.onHit?.(p)}}
    // shockwaves
    for(let i=this.waves.length-1;i>=0;i--){const w=this.waves[i];w.r+=w.speed*dt;const k=w.r/w.maxR;
      w.m.position.set(w.x,w.y,w.z);w.m2.position.copy(w.m.position);
      const th=w.band*0.5+0.2;w.m.scale.set(w.r,1,w.r);w.m2.scale.set(w.r*0.97,1,w.r*0.97);
      w.m.material.opacity=1-k*k;w.m2.material.opacity=0.3*(1-k);
      ctx.lighting?.addLight?.(w.m.position,0xff8844,2*(1-k),w.r*1.2);
      w.onHit?.(w);
      if(w.r>=w.maxR){this.scene.remove(w.m,w.m2);w.m.material.dispose();w.m2.material.dispose();this.waves.splice(i,1)}}
  }
  ichorSplat(x,z){if(Math.random()<0.4)this.puddle(x,z,0.3+Math.random()*0.5,9)}
}
