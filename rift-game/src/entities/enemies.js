// RIFTFALL alien horde: skitter swarm (instanced), brute, spitter, boss titan + wave director.
// API (ctx.enemies): list[], damage(e,n,from), spawnWave(n), spawn(type,x,z), clear(), boss, nextWaveIn, count
import * as THREE from 'three';
import {SkitterSwarm} from './enemies/skitter.js';
import {buildBrute,buildSpitter,buildBoss} from './enemies/creatures.js';
import {Debris} from './enemies/debris.js';
import {clamp,angDiff} from './enemies/util.js';

const T={
  skitter:{k:0,radius:0.42,hp:16,speed:7.4,dmg:5,range:0.9,windup:0.26,cd:0.85,knock:1.6,res:{carbon:2},score:10},
  brute:{k:1,radius:1.7,hp:340,speed:4.0,dmg:26,range:2.2,windup:0.6,cd:1.2,knock:0.12,res:{carbon:14,steel:5},score:120},
  spitter:{k:2,radius:0.8,hp:80,speed:3.7,dmg:14,range:19,windup:0.95,cd:2.6,knock:0.6,res:{carbon:6,crystal:2},score:60},
  boss:{k:3,radius:4.6,hp:3800,speed:2.9,dmg:40,range:6,windup:1.4,cd:5,knock:0.02,res:{carbon:120,steel:60,crystal:40},score:2500},
};
const MAX_ALIVE=520;

export function init(ctx){
  const {scene}=ctx,q=ctx.q;
  const deb=new Debris(ctx),swarm=new SkitterSwarm(ctx,700);
  const ground=(x,z)=>ctx.terrain?.heightAt?.(x,z)||0;
  const blocked=(x,z,r)=>ctx.terrain?.blocked?.(x,z,r)||false;
  const list=[],dying=[],pool=[],rigPool={brute:[],spitter:[],boss:[]};
  const rigBuild={brute:buildBrute,spitter:buildSpitter,boss:buildBoss};
  const playerT={pos:null,radius:1.0,isPlayer:true};
  const tmp=[],queue=[];
  let tgPool=[],nextWave=+(q.get('wavedelay')||14),killSnd=0,pvx=0,pvz=0,ppx=0,ppz=0,frame=0;
  const noAuto=q.get('autowave')==='0';
  const api={list,boss:null,nextWaveIn:nextWave,count:0,deb,swarm,types:T,wave:0};

  // ---------------------------------------------------------- helpers
  const getRig=type=>{let r=rigPool[type].pop();if(!r){r=rigBuild[type](ctx,deb);scene.add(r.root,r.legRoot);r.root.traverse(o=>{o.frustumCulled=false})}r.visible(true);r.reset();return r};
  const freeRig=(type,r)=>{r.visible(false);rigPool[type].push(r)};
  const getTg=(kind,col)=>{let t=tgPool.find(x=>x.kind===kind&&x.free);if(!t){t=deb.telegraph(kind,col);t.free=true;tgPool.push(t)}t.free=false;for(const k in t.parts)if(t.parts[k])t.parts[k].material.color.set(col);return t};
  const freeTg=e=>{if(e.tg){e.tg.hide();e.tg.free=true;e.tg=null}};
  const alive=b=>b&&b.alive!==false&&(b.hp===undefined||b.hp>0)&&!b.dead;
  function playerHit(n){const p=ctx.player;if(p&&typeof p.damage==='function')p.damage(n);else{ctx.state.hp=Math.max(0,ctx.state.hp-n);ctx.ev.emit('damage-player',{amount:n})}}
  function hurt(t,n){if(t.isPlayer)playerHit(n);else if(ctx.buildings?.damage)ctx.buildings.damage(t,n);else if(t.hp!==undefined)t.hp-=n}
  const pos3=(x,y,z)=>new THREE.Vector3(x,y,z);
  const shake=a=>ctx.postfx?.shake?.(a);
  const wave=()=>ctx.state.wave||0;
  const base=()=>{const b=ctx.buildings?.list;if(b&&b.length){let x=0,z=0,n=0;for(const e of b)if(e.pos){x+=e.pos.x;z+=e.pos.z;n++}if(n)return {x:x/n,z:z/n}}return {x:0,z:0}};

  // ---------------------------------------------------------- spawn
  function spawn(type,x,z,opts={}){
    const d=T[type];if(!d)return null;
    if(list.length>=MAX_ALIVE&&type!=='boss')return null;
    const w=Math.max(0,wave()-1);
    const e=pool.pop()||{pos:new THREE.Vector3()};
    const hpMul=(1+0.11*w+0.004*w*w)*(opts.hpMul||1);
    Object.assign(e,{type,kind:d.k,radius:d.radius,hp:d.hp*hpMul,maxHp:d.hp*hpMul,alive:true,dying:false,yaw:Math.random()*6.28,vx:0,vz:0,kx:0,kz:0,speed:d.speed*(0.9+Math.random()*0.25),
      cd2:4+Math.random()*3,state:0,stateT:0,windup:d.windup,cd:Math.random()*d.cd,target:null,tgtT:Math.random()*0.4,flash:0,phase:Math.random()*6.28,stride:0,glowT:Math.random()*100,age:0,scale:1,slot:-1,seed:Math.random()*100,
      bobF:7+Math.random()*2,dsign:Math.random()<0.5?-1:1,dk:0,dmg:d.dmg*(1+0.05*w),rig:null,tg:null,steer:0,steerT:0,atk:0,dirx:0,dirz:1,listIdx:-1,wave:wave(),hitDone:false,sx:0,sz:0,avoid:Math.random()<0.5?1:-1});
    e.pos.set(x,ground(x,z),z);
    if(type==='skitter'){e.scale=1.35+Math.random()*0.55;e.radius=d.radius*e.scale;e.speed*=1.0;if(!swarm.add(e)){pool.push(e);return null}}
    else{e.rig=getRig(type);e.rigOn=true;if(type==='boss'){api.boss=e;ctx.ev.emit('boss',{enemy:e,spawned:true});e.cd=3;e.cd2=9}}
    e.listIdx=list.length;list.push(e);return e;
  }
  function spawnWave(n){
    n=n||wave()+1;ctx.state.wave=Math.max(ctx.state.wave||0,n);api.wave=n;
    const budget=14+n*7+Math.pow(n,1.5)*1.6;
    let brutes=n>=2?Math.floor((n-1)*0.65+0.4):0,spitters=n>=3?Math.floor((n-2)*0.9+0.5):0,boss=(n%5===0)?1+Math.floor(n/15):0;
    let sk=Math.max(8,Math.floor(budget*0.9-brutes*6-spitters*3));
    const room=MAX_ALIVE-list.length-queue.length;sk=Math.min(sk,Math.max(0,room));
    const bc=base(),R=Math.min(64,(ctx.terrain?.size||200)*0.44),gates=2+(n>6?1:0)+(n>14?1:0),a0=Math.random()*6.283;
    const gateAng=[];for(let i=0;i<gates;i++)gateAng.push(a0+i*(6.283/gates)+(Math.random()-0.5)*0.8);
    const place=(g,spread)=>{for(let tries=0;tries<6;tries++){const a=gateAng[g%gates]+(Math.random()-0.5)*spread,r=R+Math.random()*6,x=bc.x+Math.cos(a)*r,z=bc.z+Math.sin(a)*r;if(!blocked(x,z,1.5))return [x,z]}const a=gateAng[g%gates];return [bc.x+Math.cos(a)*R,bc.z+Math.sin(a)*R]};
    const spawnDur=Math.min(9,3+n*0.35);
    const add=(type,count,t0,t1)=>{for(let i=0;i<count;i++){const [x,z]=place(i%gates,type==='skitter'?0.55:0.35);queue.push({type,x,z,t:t0+Math.random()*(t1-t0)})}};
    add('skitter',sk,0,spawnDur);add('brute',brutes,1,spawnDur);add('spitter',spitters,2,spawnDur+1);
    for(let i=0;i<boss;i++){const [x,z]=place(i,0.2);queue.push({type:'boss',x,z,t:3+i*2})}
    queue.sort((a,b)=>a.t-b.t);queue.t0=ctx.time;
    ctx.ev.emit('wave',{n});ctx.audio?.play?.('wave');
    nextWave=40;api.nextWaveIn=nextWave;
    return sk+brutes+spitters+boss;
  }

  // ---------------------------------------------------------- damage / death
  function damage(e,n,from){
    if(!e||!e.alive||n<=0)return false;
    let m=1;
    if(from&&e.type==='brute'){const dx=from.x-e.pos.x,dz=from.z-e.pos.z,l=Math.hypot(dx,dz)||1,dot=(dx*Math.sin(e.yaw)+dz*Math.cos(e.yaw))/l;
      m=dot>0.35?0.55:(dot<-0.35?1.5:1);if(e.state===4)m*=1.35}
    if(e.type==='boss'&&from){const dx=from.x-e.pos.x,dz=from.z-e.pos.z,l=Math.hypot(dx,dz)||1,dot=(dx*Math.sin(e.yaw)+dz*Math.cos(e.yaw))/l;m=dot>0.5?1.2:1;if(e.state===4)m*=1.3}
    e.hp-=n*m;e.flash=1;
    if(from){const dx=e.pos.x-from.x,dz=e.pos.z-from.z,l=Math.hypot(dx,dz)||1,kb=T[e.type].knock*Math.min(n,60)*0.9;e.kx+=dx/l*kb;e.kz+=dz/l*kb}
    if(e.type==='skitter'){if(Math.random()<0.5)deb.globs({x:e.pos.x,y:e.pos.y,z:e.pos.z},2,{speed:3,up:2.5,size:0.09,life:0.5})}
    else{const hp3=pos3(e.pos.x,e.pos.y+(e.type==='boss'?3:1),e.pos.z);ctx.fx?.burst?.('blood',hp3,{count:6});deb.globs(hp3,3,{speed:5,up:4,size:0.1,life:0.7})}
    if(e.hp<=0)kill(e,from);
    return true;
  }
  function removeFromList(e){const i=e.listIdx,l=list.pop();if(l!==e){list[i]=l;l.listIdx=i}e.listIdx=-1}
  function kill(e,from){
    e.alive=false;removeFromList(e);freeTg(e);
    const d=T[e.type],p=e.pos;
    ctx.state.kills=(ctx.state.kills||0)+1;ctx.state.score=(ctx.state.score||0)+d.score;
    const res=ctx.state.res||(ctx.state.res={});
    for(const k in d.res){let a=d.res[k];if(e.type==='skitter')a=Math.random()<0.5?1:2;res[k]=(res[k]||0)+a;ctx.ev.emit('resource',{type:k,amount:a,applied:true,pos:p})}
    ctx.ev.emit('kill',{pos:p,enemy:e});
    const dx=from?p.x-from.x:0,dz=from?p.z-from.z:0,dl=Math.hypot(dx,dz)||1,dirx=dx/dl*4,dirz=dz/dl*4;
    const up=pos3(p.x,p.y+(e.type==='boss'?3:0.6),p.z);
    if(e.type==='skitter'){
      swarm.remove(e);
      deb.gibs(up,4+(Math.random()*3|0),{speed:6,up:5,size:0.12,dirx,dirz,col:[0.1,0.06,0.14],glowFrac:0.35});
      deb.globs(up,10,{speed:7,up:5,size:0.1});deb.puddle(p.x+(Math.random()-0.5)*0.6,p.z+(Math.random()-0.5)*0.6,0.7+Math.random()*0.6,12);
      ctx.fx?.burst?.('blood',up,{count:10});
      if(++killSnd%4===0)ctx.audio?.play?.('kill',p);
      pool.push(e);
    }else{
      e.dying=true;e.state=6;e.dt=0;e.dur=e.type==='boss'?3.4:e.type==='brute'?0.9:0.5;e.dk=0;e.dirx=dirx;e.dirz=dirz;e.expT=0;
      if(api.boss===e){ctx.ev.emit('boss',{enemy:e,dead:true})}
      dying.push(e);ctx.audio?.play?.('kill',p);
      ctx.fx?.burst?.('blood',up,{count:e.type==='boss'?30:18});
      shake(e.type==='boss'?0.5:0.15);
    }
  }
  function finishDeath(e){
    const p=e.pos,big=e.type==='boss',n=big?70:e.type==='brute'?24:12,h=big?3:1;
    const up=pos3(p.x,p.y+h,p.z);
    deb.gibs(up,n,{speed:big?18:11,up:big?16:10,size:big?0.55:0.3,dirx:e.dirx,dirz:e.dirz,col:big?[0.12,0.06,0.14]:[0.1,0.08,0.13],glowFrac:0.35,spread:1});
    deb.globs(up,big?80:30,{speed:big?16:10,up:big?12:8,size:big?0.2:0.14,color:e.type==='spitter'?[0.5,2.5,0.4]:[0.5,2.2,0.8]});
    deb.puddle(p.x,p.z,big?9:e.type==='brute'?3.2:1.8,big?30:18);if(big)for(let i=0;i<7;i++)deb.puddle(p.x+(Math.random()-0.5)*14,p.z+(Math.random()-0.5)*14,2+Math.random()*3,24);
    if(e.type==='spitter'){deb.acidPool(p.x,p.z,2.3,3.5)}
    ctx.fx?.burst?.('explosion',up,{count:big?30:10,scale:big?3:0.8});ctx.fx?.burst?.('blood',up,{count:big?40:20});
    ctx.lighting?.addLight?.(up,0x66ffaa,big?6:2.5,big?30:10);
    shake(big?1.2:0.25);
    const rig=e.rig;if(rig){freeRig(e.type,rig);e.rig=null}
    if(api.boss===e)api.boss=null;
    e.dying=false;pool.push(e);
  }

  // ---------------------------------------------------------- AI helpers
  function pickTarget(e){
    const pp=playerT.pos;let best=playerT,bd=Math.hypot(pp.x-e.pos.x,pp.z-e.pos.z)-playerT.radius;
    const bl=ctx.buildings?.list;
    if(bl)for(let i=0;i<bl.length;i++){const b=bl[i];if(!b.pos||!alive(b))continue;const r=b.radius||2,d=Math.hypot(b.pos.x-e.pos.x,b.pos.z-e.pos.z)-r;if(d<bd){bd=d;best=b}}
    e.target=best;return best;
  }
  const tdist=(e,t)=>Math.hypot(t.pos.x-e.pos.x,t.pos.z-e.pos.z)-(t.radius||(t.isPlayer?1:2));
  function steerDir(e,dx,dz,dt){
    // look-ahead terrain avoidance (staggered), biased turn memory
    const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
    if((frame+e.listIdx)%3===0){
      const look=e.radius+2.2;let ang=0;
      if(blocked(e.pos.x+dx*look,e.pos.z+dz*look,e.radius)){
        for(const a of [0.7*e.avoid,-0.7*e.avoid,1.4*e.avoid,-1.4*e.avoid,2.4*e.avoid]){const c=Math.cos(a),s=Math.sin(a);if(!blocked(e.pos.x+(dx*c-dz*s)*look,e.pos.z+(dx*s+dz*c)*look,e.radius)){ang=a;break}}
        if(ang===0)ang=2.8*e.avoid;if(Math.abs(ang)>1)e.avoid=-e.avoid*0+Math.sign(ang)||e.avoid;
      }
      e.steer=ang;
    }
    if(e.steer){const c=Math.cos(e.steer),s=Math.sin(e.steer),nx=dx*c-dz*s,nz=dx*s+dz*c;dx=nx;dz=nz}
    return [dx,dz];
  }
  function move(e,dt,dvx,dvz,acc){
    // separation from neighbours via spatial hash
    let sx=0,sz=0;const R=e.radius*1.15;
    ctx.hash.query(e.pos.x,e.pos.z,R,tmp);
    for(let i=0,n=Math.min(tmp.length,10);i<n;i++){const o=tmp[i];if(o===e||!o.alive)continue;let ox=e.pos.x-o.pos.x,oz=e.pos.z-o.pos.z;const d=Math.hypot(ox,oz)||0.001,rr=e.radius+o.radius;
      if(d<rr){const w=(rr-d)/rr*(o.kind>e.kind?1.4:1);sx+=ox/d*w;sz+=oz/d*w}}
    const k=acc*dt>1?1:acc*dt;
    e.vx+=(dvx+sx*e.speed*1.3-e.vx)*k;e.vz+=(dvz+sz*e.speed*1.3-e.vz)*k;
    const kd=Math.exp(-dt*(e.kind===0?5:3.5));e.kx*=kd;e.kz*=kd;
    let nx=e.pos.x+(e.vx+e.kx)*dt,nz=e.pos.z+(e.vz+e.kz)*dt;
    if(blocked(nx,nz,e.radius*0.8)){if(!blocked(nx,e.pos.z,e.radius*0.8))nz=e.pos.z;else if(!blocked(e.pos.x,nz,e.radius*0.8))nx=e.pos.x;else{nx=e.pos.x;nz=e.pos.z;e.vx*=0.3;e.vz*=0.3}}
    e.pos.x=nx;e.pos.z=nz;e.pos.y=ground(nx,nz);
  }
  function pushOutOfBuildings(e){
    const bl=ctx.buildings?.list;if(!bl)return;
    for(let i=0;i<bl.length;i++){const b=bl[i];if(!b.pos||!alive(b))continue;const r=(b.radius||2)+e.radius*0.7,dx=e.pos.x-b.pos.x,dz=e.pos.z-b.pos.z,d2=dx*dx+dz*dz;
      if(d2<r*r){const d=Math.sqrt(d2)||0.01,p=(r-d);e.pos.x+=dx/d*p*0.6;e.pos.z+=dz/d*p*0.6}}
  }
  function face(e,dx,dz,dt,rate){const a=Math.atan2(dx,dz);e.yaw+=angDiff(e.yaw,a)*Math.min(1,dt*rate)}
  const setState=(e,s,windup)=>{e.state=s;e.stateT=0;if(windup)e.windup=windup;e.hitDone=false};
  // area damage on target set
  function areaHit(x,z,r,dmg,fromE){
    const pp=playerT.pos;if(Math.hypot(pp.x-x,pp.z-z)<r+0.8)playerHit(dmg);
    const bl=ctx.buildings?.list;if(bl)for(const b of bl){if(!b.pos||!alive(b))continue;if(Math.hypot(b.pos.x-x,b.pos.z-z)<r+(b.radius||2))hurt(b,dmg)}
  }

  // ---------------------------------------------------------- brains
  function brainSkitter(e,dt){
    const t=e.target||pickTarget(e);
    const dx=t.pos.x-e.pos.x,dz=t.pos.z-e.pos.z,gap=tdist(e,t);
    e.stateT+=dt;e.cd-=dt;
    if(e.state===0){
      const [dirx,dirz]=steerDir(e,dx,dz,dt);const stop=gap<e.radius+0.4;
      move(e,dt,stop?0:dirx*e.speed,stop?0:dirz*e.speed,9);
      face(e,e.vx*0.5+dx/(Math.hypot(dx,dz)||1)*(stop?3:0.5),e.vz*0.5+dz/(Math.hypot(dx,dz)||1)*(stop?3:0.5),dt,14);
      if(gap<e.radius+0.9&&e.cd<=0){setState(e,2,0.26);e.dirx=dx;e.dirz=dz}
    }else if(e.state===2){
      move(e,dt,0,0,14);face(e,dx,dz,dt,20);
      if(e.stateT>=e.windup){setState(e,3);const l=Math.hypot(dx,dz)||1;e.dirx=dx/l;e.dirz=dz/l}
    }else if(e.state===3){
      move(e,dt,e.dirx*12,e.dirz*12,30);
      if(!e.hitDone&&e.stateT>0.1){e.hitDone=true;if(tdist(e,t)<e.radius+0.9)hurt(t,e.dmg)}
      if(e.stateT>=0.28){setState(e,0);e.cd=T.skitter.cd*(0.8+Math.random()*0.5)}
    }
    e.stride+=((e.state===0?Math.min(1,Math.hypot(e.vx,e.vz)/5):e.state===3?1:0.15)-e.stride)*Math.min(1,dt*10);
    e.phase+=Math.hypot(e.vx,e.vz)*dt*5.2+dt*(e.state===2?20:1.5);
    e.glowT+=dt;e.age+=dt;
  }
  function brainBrute(e,dt){
    const t=e.target||pickTarget(e);
    const dx=t.pos.x-e.pos.x,dz=t.pos.z-e.pos.z,gap=tdist(e,t),l=Math.hypot(dx,dz)||1;
    e.stateT+=dt;e.cd-=dt;e.cd2=(e.cd2??4)-dt;
    if(e.state===0){
      const [dirx,dirz]=steerDir(e,dx,dz,dt);const stop=gap<e.radius+0.7;
      move(e,dt,stop?0:dirx*e.speed,stop?0:dirz*e.speed,3.5);face(e,e.vx+dx/l*0.3,e.vz+dz/l*0.3,dt,4);
      if(gap<e.radius+1.3&&e.cd<=0){e.atk=0;setState(e,2,0.65)}
      else if(e.cd2<=0&&gap>9&&gap<26){e.atk=1;setState(e,2,1.15);e.dirx=dx/l;e.dirz=dz/l}
    }else if(e.state===2){
      move(e,dt,0,0,6);
      if(e.atk===0){face(e,dx,dz,dt,8);const px=e.pos.x+Math.sin(e.yaw)*(e.radius+1.2),pz=e.pos.z+Math.cos(e.yaw)*(e.radius+1.2);
        if(!e.tg)e.tg=getTg('circle',0xff5522);e.tg.circle(px,pz,3.4,e.stateT/e.windup)}
      else{face(e,dx,dz,dt,3);const k=e.stateT/e.windup;e.dirx=Math.sin(e.yaw);e.dirz=Math.cos(e.yaw);if(!e.tg)e.tg=getTg('lane',0xff3311);e.tg.lane(e.pos.x,e.pos.z,e.dirx,e.dirz,19,e.radius*1.6,k)}
      if(e.stateT>=e.windup){
        if(e.atk===0){const px=e.pos.x+Math.sin(e.yaw)*(e.radius+1.2),pz=e.pos.z+Math.cos(e.yaw)*(e.radius+1.2);areaHit(px,pz,3.4,e.dmg,e);
          deb.gibs(pos3(px,e.pos.y,pz),5,{speed:6,up:4,size:0.2,col:[0.25,0.2,0.18],glowFrac:0});ctx.fx?.burst?.('impact',pos3(px,e.pos.y+0.3,pz),{count:12});shake(0.2);ctx.audio?.play?.('explosion',e.pos);
          freeTg(e);setState(e,4,0.7);e.cd=T.brute.cd}
        else{freeTg(e);setState(e,3);e.hitDone=false}
      }
    }else if(e.state===3){
      // charge
      const sp=19;move(e,dt,e.dirx*sp,e.dirz*sp,10);e.yaw+=angDiff(e.yaw,Math.atan2(e.dirx,e.dirz))*Math.min(1,dt*6);
      const t2=e.target;
      if(!e.hitDone&&tdist(e,t2)<e.radius*0.7+0.6){e.hitDone=true;hurt(t2,e.dmg*1.4);shake(0.35);ctx.fx?.burst?.('impact',pos3(e.pos.x+e.dirx*e.radius,e.pos.y+0.8,e.pos.z+e.dirz*e.radius),{count:16});
        const bl=ctx.buildings?.list;ctx.audio?.play?.('explosion',e.pos)}
      if((frame%2===0)&&e.stateT>0.2)ctx.fx?.burst?.('spark',pos3(e.pos.x,e.pos.y+0.1,e.pos.z),{count:2});
      if(e.stateT>1.05||e.hitDone&&e.stateT>0.35){setState(e,4,1.5);e.cd2=6+Math.random()*3;e.vx*=0.3;e.vz*=0.3}
    }else if(e.state===4){
      move(e,dt,0,0,5);if(e.stateT>(e.windup||1)){e.state=0;e.stateT=0;e.windup=T.brute.windup}
    }
    pushOutOfBuildings(e);e.age+=dt;
  }
  function brainSpitter(e,dt){
    const t=e.target||pickTarget(e);
    const dx=t.pos.x-e.pos.x,dz=t.pos.z-e.pos.z,gap=tdist(e,t),l=Math.hypot(dx,dz)||1;
    e.stateT+=dt;e.cd-=dt;
    if(e.state===0){
      let want=0;const near=9,far=16;
      if(gap>far)want=1;else if(gap<near)want=-1;
      const [dirx,dirz]=steerDir(e,dx,dz,dt);const str=Math.sin(ctx.time*0.8+e.seed)*0.5;
      move(e,dt,(dirx*want-dirz*str*0.5*Math.abs(want-0.5)*0)*e.speed+(-dz/l)*str*e.speed*0.35*(want===0?1:0.4),(dirz*want)*e.speed+(dx/l)*str*e.speed*0.35*(want===0?1:0.4),3);
      face(e,dx,dz,dt,5);
      if(gap<20&&gap>4&&e.cd<=0){setState(e,2,0.95);e.sx=t.pos.x;e.sz=t.pos.z}
    }else if(e.state===2){
      move(e,dt,0,0,6);face(e,dx,dz,dt,6);
      const k=e.stateT/e.windup;
      if(k<0.65){const v=t.isPlayer?1:0;e.sx=t.pos.x+(t.isPlayer?pvx*0.9:0);e.sz=t.pos.z+(t.isPlayer?pvz*0.9:0)}
      if(!e.tg)e.tg=getTg('circle',0x66ff33);e.tg.circle(e.sx,e.sz,2.6,k);
      if(e.stateT>=e.windup){
        freeTg(e);
        const from=pos3(e.pos.x+Math.sin(e.yaw)*0.9,e.pos.y+1.1,e.pos.z+Math.cos(e.yaw)*0.9),to={x:e.sx,z:e.sz};
        const dist=Math.hypot(to.x-from.x,to.z-from.z);
        deb.projectile(from,to,{time:clamp(0.65+dist*0.03,0.7,1.5),dmg:e.dmg,radius:2.6,onHit:p=>{
          const hp=pos3(p.x,ground(p.x,p.z),p.z);
          areaHit(p.x,p.z,2.6,e.dmg*0.8,e);deb.acidPool(p.x,p.z,2.6,4.5);deb.globs(hp,16,{speed:8,up:6,size:0.14});
          ctx.fx?.burst?.('impact',hp,{count:10,color:0x66ff44});ctx.lighting?.addLight?.(hp,0x66ff66,2.5,10)}});
        deb.globs(from,6,{speed:4,up:3,size:0.1});
        ctx.audio?.play?.('shoot',e.pos);setState(e,3);
      }
    }else if(e.state===3){
      move(e,dt,0,0,6);if(e.stateT>0.32){setState(e,0);e.cd=T.spitter.cd*(0.8+Math.random()*0.5)}
    }
    e.age+=dt;
  }
  function brainBoss(e,dt){
    const t=e.target||pickTarget(e);
    const dx=t.pos.x-e.pos.x,dz=t.pos.z-e.pos.z,gap=tdist(e,t),l=Math.hypot(dx,dz)||1;
    const rage=e.hp<e.maxHp*0.5;
    e.stateT+=dt;e.cd-=dt;e.cd2-=dt;
    if(e.state===0){
      const [dirx,dirz]=steerDir(e,dx,dz,dt);const stop=gap<3;
      const sp=e.speed*(rage?1.35:1);
      move(e,dt,stop?0:dirx*sp,stop?0:dirz*sp,1.6);face(e,dx,dz,dt,1.6);
      if(gap<20&&e.cd<=0){setState(e,2,rage?1.0:1.4)}
      else if(e.cd2<=0){setState(e,5,1.6)}
    }else if(e.state===2){
      move(e,dt,0,0,3);face(e,dx,dz,dt,2);
      const px=e.pos.x+Math.sin(e.yaw)*2,pz=e.pos.z+Math.cos(e.yaw)*2,k=e.stateT/e.windup;
      if(!e.tg)e.tg=getTg('circle',0xff4422);e.tg.circle(px,pz,21,k);
      if(e.stateT>=e.windup){freeTg(e);setState(e,3)}
      if(frame%6===0)ctx.fx?.burst?.('spark',pos3(e.pos.x+(Math.random()-0.5)*8,e.pos.y+0.3,e.pos.z+(Math.random()-0.5)*8),{count:3});
    }else if(e.state===3){
      move(e,dt,0,0,3);
      if(e.stateT>=0.3&&!e.hitDone){e.hitDone=true;
        const cx=e.pos.x+Math.sin(e.yaw)*2,cz=e.pos.z+Math.cos(e.yaw)*2,cp=pos3(cx,ground(cx,cz),cz);
        shake(1.0);ctx.audio?.play?.('explosion',e.pos);ctx.fx?.burst?.('explosion',cp,{count:20,scale:2});ctx.lighting?.addLight?.(cp,0xff8844,6,28);
        deb.gibs(cp,20,{speed:14,up:9,size:0.35,col:[0.2,0.15,0.15],glowFrac:0.1});deb.globs(cp,30,{speed:14,up:8,size:0.14,color:[3,1.2,0.4]});
        deb.shockwave(cx,cz,{maxR:21,speed:24,band:2,dmg:e.dmg,color:0xff6a2a,onHit:w=>{
          const pp=playerT.pos,band=w.band+1;
          if(!w.hit.has('p')&&Math.abs(Math.hypot(pp.x-w.x,pp.z-w.z)-w.r)<band&&(ctx.player?.pos?.y||0)<2.5){w.hit.add('p');playerHit(w.dmg);shake(0.5)}
          const bl=ctx.buildings?.list;if(bl)for(const b of bl){if(!b.pos||!alive(b)||w.hit.has(b))continue;if(Math.abs(Math.hypot(b.pos.x-w.x,b.pos.z-w.z)-w.r)<band+(b.radius||2)){w.hit.add(b);hurt(b,w.dmg*1.5)}}}});
      }
      if(e.stateT>0.9){setState(e,4,0.9);e.cd=rage?3.2:5}
    }else if(e.state===4){move(e,dt,0,0,3);if(e.stateT>(e.windup||0.9)){e.state=0;e.stateT=0}}
    else if(e.state===5){
      move(e,dt,0,0,3);face(e,dx,dz,dt,2);
      if(frame%5===0)ctx.fx?.burst?.('heal',pos3(e.pos.x,e.pos.y+5,e.pos.z),{count:2});
      if(e.stateT>=e.windup){
        const n=8+Math.floor(wave()*0.8);
        for(let i=0;i<n;i++){const a=i/n*6.283+Math.random()*0.3,r=e.radius+2+Math.random()*3;const sx=e.pos.x+Math.cos(a)*r,sz=e.pos.z+Math.sin(a)*r;
          const s=spawn('skitter',sx,sz);if(s){s.age=-0.3;deb.globs(pos3(sx,e.pos.y,sz),5,{speed:4,up:4,color:[1.5,0.6,2.5]})}}
        ctx.audio?.play?.('wave');shake(0.4);setState(e,4,1.0);e.cd2=rage?9:14
      }
    }
    pushOutOfBuildings(e);e.age+=dt;
  }

  // ---------------------------------------------------------- main update
  function update(dt,ctx){
    frame++;
    const pl=ctx.player;if(!pl?.pos)return;
    playerT.pos=pl.pos;
    pvx+=((pl.pos.x-ppx)/Math.max(dt,1e-3)-pvx)*Math.min(1,dt*6);pvz+=((pl.pos.z-ppz)/Math.max(dt,1e-3)-pvz)*Math.min(1,dt*6);ppx=pl.pos.x;ppz=pl.pos.z;
    const pvl=Math.hypot(pvx,pvz);if(pvl>14){pvx*=14/pvl;pvz*=14/pvl}
    // wave director
    if(!noAuto&&!ctx.state.over){nextWave-=dt;api.nextWaveIn=nextWave;if(nextWave<=0)spawnWave()}
    if(queue.length){const t=ctx.time-queue.t0;while(queue.length&&queue[0].t<=t){const s=queue.shift();spawn(s.type,s.x,s.z)}}
    // register into hash first so separation sees everyone
    for(let i=0;i<list.length;i++)ctx.hash.insert(list[i]);
    const cx=ctx.camera.position.x-ctx.CAM_OFF.x,cz=ctx.camera.position.z-ctx.CAM_OFF.z;
    for(let i=0;i<list.length;i++){
      const e=list[i];
      e.tgtT-=dt;if(e.tgtT<=0||!e.target||(!e.target.isPlayer&&!alive(e.target))){e.tgtT=0.35+Math.random()*0.25;pickTarget(e)}
      e.flash=e.flash>0?Math.max(0,e.flash-dt*5):0;
      switch(e.kind){case 0:brainSkitter(e,dt);break;case 1:brainBrute(e,dt);break;case 2:brainSpitter(e,dt);break;case 3:brainBoss(e,dt);break}
      if(e.rig){const far=(e.pos.x-cx)**2+(e.pos.z-cz)**2>(e.kind===3?110*110:70*70);
        if(far){if(e.rigOn){e.rig.visible(false);e.rigOn=false}}
        else{if(!e.rigOn){e.rig.visible(true);e.rig.reset();e.rigOn=true}e.rig.flash.value=e.flash;e.rig.update(e,dt,ctx.time,ground)}}
      if(e.kind===3)api.boss=e;
    }
    // dying creatures: collapse, then burst
    for(let i=dying.length-1;i>=0;i--){
      const e=dying[i];e.dt+=dt;e.dk=Math.min(1,e.dt/e.dur);e.flash=0.5+0.5*Math.sin(e.dt*40);
      move(e,dt,0,0,2);
      if(e.rig){e.rig.flash.value=e.flash*0.8;e.rig.update(e,dt,ctx.time,ground)}
      if(e.type==='boss'){e.expT-=dt;if(e.expT<=0){e.expT=0.14;const p=pos3(e.pos.x+(Math.random()-0.5)*9,e.pos.y+1+Math.random()*5,e.pos.z+(Math.random()-0.5)*9);
        ctx.fx?.burst?.('explosion',p,{count:8,scale:1.2});deb.globs(p,10,{speed:9,up:8,size:0.15});deb.gibs(p,2,{speed:8,up:8,size:0.3});shake(0.35);ctx.lighting?.addLight?.(p,0xff8855,3,16)}}
      else if(e.type==='spitter'&&e.dk>0.7&&Math.random()<0.5)deb.globs(pos3(e.pos.x,e.pos.y+1,e.pos.z),2,{speed:4,up:3});
      if(e.dt>=e.dur){dying.splice(i,1);finishDeath(e)}
    }
    // acid pools: damage over time to whoever stands in them
    for(const p of deb.acid){if(p.age>=p.life)continue;p.dmgT-=dt;if(p.dmgT<=0){p.dmgT=0.5;const r=p.r*0.9;areaHit(p.x,p.z,r,3.5+wave()*0.3)}}
    swarm.sync(ctx,dt);
    deb.update(dt);
    api.count=list.length;
    for(const e of list)if(e.tg&&!e.alive)freeTg(e);
  }
  // expose
  api.damage=damage;api.spawnWave=spawnWave;api.spawn=spawn;api.update=update;
  api.clear=()=>{for(const e of list.slice()){e.alive=false;removeFromList(e);freeTg(e);if(e.type==='skitter')swarm.remove(e);else{if(e.rig){freeRig(e.type,e.rig);e.rig=null}}pool.push(e)}
    for(const e of dying.splice(0)){if(e.rig){freeRig(e.type,e.rig);e.rig=null}pool.push(e)}api.boss=null;queue.length=0};
  api._update=update;
  // prewarm rigs so the first brute/spitter/boss spawn does not hitch
  if(q.get('prewarm')!=='0')for(const t of ['brute','spitter','boss']){const r=getRig(t);freeRig(t,r)}
  ctx.enemies=api;
  return api;
}
export function update(dt,ctx){ctx.enemies?._update?.(dt,ctx)}
