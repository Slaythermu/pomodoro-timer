// Pooled projectiles: plasma bolts, flame arcs, rockets (+smoke, muzzle flashes).
import * as THREE from 'three';
import {glowTexture,streakTexture,flameTexture} from './materials.js';

export const WEAPONS=[
  {name:'PLASMA RIFLE',rate:.11,dmg:15,speed:62,cost:0,color:0x55e6ff,recoil:.55,kick:.35},
  {name:'FLAME ARC',rate:.035,dmg:4.5,speed:20,cost:11,color:0xff8a20,recoil:.12,kick:.06},
  {name:'ROCKET LAUNCHER',rate:.95,dmg:55,speed:14,cost:14,color:0xffa040,recoil:1.2,kick:1.0,radius:5.5},
];
const ADD=THREE.AdditiveBlending;
const _v=new THREE.Vector3();

export function createProjectiles(ctx){
  const scene=ctx.scene,S=Object.create(null);
  const gTex=glowTexture(),sTex=streakTexture(),fTex=flameTexture(),smokeTex=glowTexture('rgba(255,255,255,.9)','rgba(255,255,255,.4)');
  const root=new THREE.Group();root.name='player-projectiles';scene.add(root);
  const spr=(tex,color,blend=ADD,opacity=1)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color,blending:blend,transparent:true,depthWrite:false,opacity}));s.visible=false;root.add(s);return s};
  const gh=(x,z)=>ctx.terrain?.heightAt?ctx.terrain.heightAt(x,z):0;
  const blocked=(x,z,r)=>ctx.terrain?.blocked?ctx.terrain.blocked(x,z,r):false;
  const light=(p,c,i,r)=>ctx.lighting?.addLight?.(p,c,i,r);
  const enemies=()=>ctx.enemies?.list||[];

  // --- bolts ---
  const streakGeo=new THREE.PlaneGeometry(2.6,.34);streakGeo.translate(-1.3,0,0);
  const bolts=[];
  for(let i=0;i<48;i++){
    const g=new THREE.Group();g.visible=false;
    const mat=new THREE.MeshBasicMaterial({map:sTex,color:0x66ecff,blending:ADD,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const a=new THREE.Mesh(streakGeo,mat);a.rotation.x=-Math.PI/2;const b=new THREE.Mesh(streakGeo,mat);
    const core=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshBasicMaterial({color:0xffffff}));
    const head=spr(gTex,0x66ecff);head.visible=true;root.remove(head);g.add(head);head.scale.setScalar(1.1);
    g.add(a,b,core);root.add(g);bolts.push({g,alive:false,pos:new THREE.Vector3(),vel:new THREE.Vector3(),life:0,dmg:0,mat});
  }
  // --- flames ---
  const flames=[];for(let i=0;i<110;i++)flames.push({s:spr(fTex,0xffffff),alive:false,pos:new THREE.Vector3(),vel:new THREE.Vector3(),life:0,max:1,hit:new Set(),rot:0,spin:0});
  // --- rockets ---
  const rockets=[];
  const rkGeo=new THREE.CylinderGeometry(.09,.09,.6,10);rkGeo.rotateX(Math.PI/2);
  for(let i=0;i<10;i++){const g=new THREE.Group();g.visible=false;
    g.add(new THREE.Mesh(rkGeo,new THREE.MeshStandardMaterial({color:0xcfd3d8,metalness:.7,roughness:.35})));
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.09,.22,10),new THREE.MeshStandardMaterial({color:0xff6a18,metalness:.5,roughness:.4}));nose.rotation.x=Math.PI/2;nose.position.z=.4;g.add(nose);
    const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:gTex,color:0xffb050,blending:ADD,transparent:true,depthWrite:false}));fl.position.z=-.45;fl.scale.setScalar(1.3);g.add(fl);
    root.add(g);rockets.push({g,alive:false,pos:new THREE.Vector3(),dir:new THREE.Vector3(),speed:0,life:0,fl});}
  // --- smoke / flash ---
  const smoke=[];for(let i=0;i<90;i++)smoke.push({s:spr(smokeTex,0x888888,THREE.NormalBlending,0),alive:false,vel:new THREE.Vector3(),life:0,max:1,size:1});
  const flashes=[];for(let i=0;i<6;i++){const s=spr(gTex,0xffffff);flashes.push({s,life:0,max:.07,size:1})}
  let fi=0;
  const take=(arr)=>{for(const o of arr)if(!o.alive)return o;return null};
  function puff(p,size,life,v,color=0x777777,op=.5){const o=take(smoke);if(!o)return;o.alive=true;o.life=o.max=life;o.size=size;o.s.position.copy(p);o.vel.copy(v);o.s.material.color.setHex(color);o.s.material.userData.op=op;o.s.visible=true;o.s.scale.setScalar(size)}
  function flash(p,color,size){const f=flashes[fi++%flashes.length];f.life=f.max;f.size=size;f.s.position.copy(p);f.s.material.color.setHex(color);f.s.visible=true}

  function damage(e,n,from){ctx.enemies?.damage?.(e,n,from)}
  function explode(p,w){
    ctx.fx?.burst?.('explosion',p,{radius:w.radius,scale:1.4});
    ctx.postfx?.shake?.(.7);ctx.audio?.play?.('explosion',p);light(p,0xffa040,14,16);flash(p,0xffc070,7);
    for(const e of enemies()){if(!e.alive&&e.alive!==undefined)continue;const dx=e.pos.x-p.x,dz=e.pos.z-p.z,r=w.radius+(e.radius||0);const d2=dx*dx+dz*dz;if(d2<r*r){const f=1-Math.sqrt(d2)/r;damage(e,w.dmg*(.35+.65*f),p)}}
    for(let i=0;i<7;i++)puff(p,2.2+Math.random()*2,.9+Math.random()*.8,_v.set((Math.random()-.5)*4,1+Math.random()*2,(Math.random()-.5)*4),0x2a2724,.55);
  }

  S.muzzleFlash=(p,idx)=>{flash(p,WEAPONS[idx].color,idx===1?1.8:idx===2?4:2.6);light(p,WEAPONS[idx].color,idx===2?6:3.2,idx===2?10:7)};

  S.fire=(idx,pos,dir,aimY)=>{
    const w=WEAPONS[idx];
    if(idx===0){const bb=take(bolts);if(!bb)return;
      bb.alive=true;bb.pos.copy(pos);bb.vel.copy(dir).multiplyScalar(w.speed);bb.life=.9;bb.dmg=w.dmg;bb.g.visible=true;bb.g.position.copy(pos);bb.g.rotation.y=Math.atan2(-dir.z,dir.x);
      bb.mat.color.setHex(w.color)}
    else if(idx===1){const f=take(flames);if(!f)return;f.alive=true;f.pos.copy(pos);const sp=.14;
      f.vel.set(dir.x+(Math.random()-.5)*sp*2,0,dir.z+(Math.random()-.5)*sp*2).normalize().multiplyScalar(w.speed*(.75+Math.random()*.4));
      f.max=f.life=.42+Math.random()*.12;f.hit.clear();f.rot=Math.random()*6;f.spin=(Math.random()-.5)*6;f.s.visible=true;f.s.material.color.setHex(0xffe8a0);f.s.scale.setScalar(.4)}
    else{const r=take(rockets);if(!r)return;r.alive=true;r.pos.copy(pos);r.dir.copy(dir);r.speed=12;r.life=2.2;r.g.visible=true;r.g.position.copy(pos);r.g.lookAt(_v.copy(pos).add(dir))}
  };

  S.update=(dt)=>{
    // bolts
    for(const b of bolts){if(!b.alive)continue;
      b.life-=dt;let n=Math.ceil(b.vel.length()*dt/.8);const sdt=dt/n;let dead=b.life<=0;
      for(let k=0;k<n&&!dead;k++){
        b.pos.addScaledVector(b.vel,sdt);
        const x=b.pos.x,z=b.pos.z;
        for(const e of enemies()){if(e.alive===false)continue;const dx=e.pos.x-x,dz=e.pos.z-z,r=(e.radius||.6)+.25;if(dx*dx+dz*dz<r*r){damage(e,b.dmg,b.pos);ctx.fx?.burst?.('impact',b.pos,{color:0x66ecff,normal:_v.copy(b.vel).normalize().negate()});ctx.audio?.play?.('hit',b.pos);light(b.pos,0x55e6ff,2.5,5);dead=true;break}}
        if(!dead&&blocked(x,z,.15)){ctx.fx?.burst?.('impact',b.pos,{color:0x66ecff,normal:_v.copy(b.vel).normalize().negate()});ctx.fx?.burst?.('spark',b.pos,{color:0x66ecff});light(b.pos,0x55e6ff,2.5,5);dead=true}
      }
      b.pos.y=gh(b.pos.x,b.pos.z)+1.35;b.g.position.copy(b.pos);
      if(dead){b.alive=false;b.g.visible=false}
    }
    // flames
    for(const f of flames){if(!f.alive)continue;f.life-=dt;if(f.life<=0){f.alive=false;f.s.visible=false;continue}
      const t=1-f.life/f.max;f.pos.addScaledVector(f.vel,dt);f.vel.multiplyScalar(1-1.6*dt);f.pos.y=gh(f.pos.x,f.pos.z)+1.1+t*.9;
      if(blocked(f.pos.x,f.pos.z,.1)){f.vel.multiplyScalar(.2)}
      f.rot+=f.spin*dt;f.s.material.rotation=f.rot;f.s.position.copy(f.pos);
      f.s.scale.setScalar(.5+t*2.4);
      const m=f.s.material;m.opacity=Math.min(1,(1-t)*1.6);
      // yellow-white -> orange -> deep red
      m.color.setRGB(1,1-.62*t,.62-.6*t).multiplyScalar(1.2-.5*t);
      const hr=.7+t*1.6;
      for(const e of enemies()){if(e.alive===false||f.hit.has(e))continue;const dx=e.pos.x-f.pos.x,dz=e.pos.z-f.pos.z,r=hr+(e.radius||.6);if(dx*dx+dz*dz<r*r){f.hit.add(e);damage(e,WEAPONS[1].dmg*(1.3-t*.6),f.pos)}}
      if((f.hit.size&&Math.random()<.02))ctx.fx?.burst?.('spark',f.pos,{color:0xff8a20});
    }
    // rockets
    for(const r of rockets){if(!r.alive)continue;r.life-=dt;r.speed=Math.min(42,r.speed+60*dt);
      let dead=r.life<=0;const step=r.speed*dt,n=Math.ceil(step/.8);
      for(let k=0;k<n&&!dead;k++){r.pos.addScaledVector(r.dir,step/n);
        if(blocked(r.pos.x,r.pos.z,.2))dead=true;
        else for(const e of enemies()){if(e.alive===false)continue;const dx=e.pos.x-r.pos.x,dz=e.pos.z-r.pos.z,rr=(e.radius||.6)+.35;if(dx*dx+dz*dz<rr*rr){dead=true;break}}}
      r.pos.y=gh(r.pos.x,r.pos.z)+1.3;r.g.position.copy(r.pos);
      r.fl.scale.setScalar(1.1+Math.random()*.5);light(r.pos,0xffa040,2.2,8);
      puff(_v.copy(r.pos).addScaledVector(r.dir,-.6),.6,.8,{x:(Math.random()-.5)*.6,y:.5,z:(Math.random()-.5)*.6},0x8a8580,.45);
      if(Math.random()<.5)ctx.fx?.burst?.('spark',_v,{color:0xffa040});
      if(dead){r.alive=false;r.g.visible=false;explode(r.pos,WEAPONS[2])}
    }
    for(const s of smoke){if(!s.alive)continue;s.life-=dt;if(s.life<=0){s.alive=false;s.s.visible=false;continue}
      const t=1-s.life/s.max;s.s.position.addScaledVector(s.vel,dt);s.vel.multiplyScalar(1-1.2*dt);s.s.scale.setScalar(s.size*(.5+t*1.6));s.s.material.opacity=(s.s.material.userData.op||.5)*Math.sin(Math.min(1,t*5)*1.57)*(1-t)}
    for(const f of flashes){if(f.life<=0)continue;f.life-=dt;if(f.life<=0){f.s.visible=false;continue}const t=f.life/f.max;f.s.scale.setScalar(f.size*(.6+.6*t));f.s.material.opacity=t}
  };
  S.reset=()=>{for(const a of [bolts,flames,rockets,smoke])for(const o of a){o.alive=false;(o.g||o.s).visible=false}};
  return S;
}
