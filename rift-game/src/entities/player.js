// Hero: armored pilot in an exo-suit. Owns movement, aim, weapons, dash, camera follow, hp/energy.
import * as THREE from 'three';
import {makeMaterials,glowTexture} from './player/materials.js';
import {buildHero,poseLegs,poseArms,HIP_H} from './player/hero.js';
import {buildWeapons} from './player/weaponModels.js';
import {createProjectiles,WEAPONS} from './player/projectiles.js';

const V3=THREE.Vector3;
const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
const angDiff=(a,b)=>{let d=(b-a)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d};
const SPEED=9,ACCEL=70,RADIUS=.75;
const DASH={time:.24,speed:34,cost:25,cd:.55};

export function init(ctx){
  const M=makeMaterials(ctx.renderer);
  const H=buildHero(M);
  const weapons=buildWeapons(M);
  weapons.forEach((w,i)=>{w.group.visible=i===0;H.weaponMount.add(w.group)});
  ctx.scene.add(H.root,H.blob);
  const proj=createProjectiles(ctx);

  const P={
    pos:new V3(0,0,0),aimDir:new V3(0,0,1),vel:new V3(),obj:H.root,radius:RADIUS,
    weapon:0,weapons:WEAPONS,dashing:false,alive:true,
    damage(n){ if(!P.alive||P.dashT>0)return; ctx.state.hp=Math.max(0,ctx.state.hp-n);P.regenDelay=4;P.hitFlash=1;
      ctx.postfx?.shake?.(Math.min(.8,.15+n*.02));ctx.audio?.play?.('hurt');ctx.fx?.burst?.('spark',_p.copy(P.pos).setY(P.pos.y+1.4),{color:0xff5030});
      if(ctx.state.hp<=0)die()},
    heal(n){ctx.state.hp=Math.min(ctx.state.maxHp,ctx.state.hp+n)},
    selectWeapon(i){if(i<0||i>2||i===P.weapon)return;P.weapon=i;weapons.forEach((w,k)=>w.group.visible=k===i);ctx.state.weapon=i;ctx.state.weaponName=WEAPONS[i].name;ctx.ev.emit('weapon',{index:i,name:WEAPONS[i].name});swapAnim=1},
    dashT:0,dashCd:0,regenDelay:0,hitFlash:0,
  };
  const _p=new V3();
  ctx.state.weapon=0;ctx.state.weaponName=WEAPONS[0].name;ctx.state.dashCd=0;
  ctx.ev.on('damage-player',e=>P.damage(e.amount??e));
  const _gy=(x,z)=>ctx.terrain?.heightAt?ctx.terrain.heightAt(x,z):0;
  const blocked=(x,z)=>{
    if(ctx.terrain?.blocked&&ctx.terrain.blocked(x,z,RADIUS*.8))return true;
    const bl=ctx.buildings?.list;if(bl)for(const b of bl){if(b.alive===false||b.walkable)continue;const dx=b.pos.x-x,dz=b.pos.z-z,r=(b.radius||2)+RADIUS*.7;if(dx*dx+dz*dz<r*r)return true}
    return false};
  P.pos.set(0,0,8);P.pos.y=_gy(0,8);
  // find a free spawn spot
  for(let r=0,a=0;ctx.terrain?.blocked?.(P.pos.x,P.pos.z,RADIUS)&&r<40;r+=.5,a+=1.3){P.pos.set(Math.cos(a)*r,0,8+Math.sin(a)*r);P.pos.y=_gy(P.pos.x,P.pos.z)}

  // dash trail sprites
  const gTex=glowTexture();const trail=[];
  for(let i=0;i<40;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:gTex,color:0x58e8ff,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));s.visible=false;ctx.scene.add(s);trail.push({s,life:0,max:.4,size:1})}
  let ti=0;const addTrail=(p,size,max)=>{const t=trail[ti++%trail.length];t.life=t.max=max;t.size=size;t.s.position.copy(p);t.s.visible=true};

  // state
  let legYaw=0,torsoYaw=0,phase=0,speedSm=0,recoil=0,kick=0,swapAnim=0,fireT=0,breathe=0,flameOn=0,stride=0;
  let camFocus=new V3().copy(P.pos),dashDir=new V3(0,0,1),lastFootStep=0;
  const footDY=[0,0],aimTarget=new V3(),gR=new V3(),gL=new V3(),tmp=new V3(),tmp2=new V3(),muz=new V3(),mdir=new V3();
  let hairVel=new V3(),prevVel=new V3(),twistTarget=0,legFlip=1;
  const lightTmp=new V3();

  function die(){P.alive=false;ctx.state.over=true;ctx.fx?.burst?.('explosion',_p.copy(P.pos).setY(P.pos.y+1),{radius:3});ctx.ev.emit('player-dead',{pos:P.pos})}
  P.respawn=()=>{ctx.state.hp=ctx.state.maxHp;ctx.state.energy=100;ctx.state.over=false;P.alive=true;H.root.rotation.x=0;H.root.visible=true};

  function pickAssist(aim,pos){
    // snap aim to enemy near cursor (soft auto-aim) and also toward closest enemy in aim cone
    const L=ctx.enemies?.list;if(!L||!L.length)return null;let best=null,bd=1e9;
    for(const e of L){if(e.alive===false)continue;const dx=e.pos.x-aim.x,dz=e.pos.z-aim.z,d=dx*dx+dz*dz,r=2.6+(e.radius||0);
      if(d<r*r){const px=e.pos.x-pos.x,pz=e.pos.z-pos.z;if(px*px+pz*pz<34*34&&d<bd){bd=d;best=e}}}
    return best;
  }

  P.update=function(dt){
    const inp=ctx.input,st=ctx.state;
    const mv=inp.move;let ix=mv.x,iz=mv.y;const il=Math.hypot(ix,iz);if(il>1){ix/=il;iz/=il}
    if(!P.alive){ix=iz=0}
    P.regenDelay=Math.max(0,P.regenDelay-dt);P.hitFlash=Math.max(0,P.hitFlash-dt*3);P.dashCd=Math.max(0,P.dashCd-dt);
    // weapon switching
    for(let i=0;i<3;i++)if(inp.pressed.has('Digit'+(i+1))||inp.pressed.has('Numpad'+(i+1)))P.selectWeapon(i);
    // aim
    aimTarget.copy(inp.aim);
    const assist=P.alive?pickAssist(aimTarget,P.pos):null;
    if(assist){aimTarget.x=assist.pos.x;aimTarget.z=assist.pos.z}
    let adx=aimTarget.x-P.pos.x,adz=aimTarget.z-P.pos.z;const al=Math.hypot(adx,adz);
    if(al<1.2){adx=P.aimDir.x;adz=P.aimDir.z}else{adx/=al;adz/=al}
    P.aimDir.set(adx,0,adz);
    const aimYaw=Math.atan2(adx,adz);
    // dash
    if(P.alive&&inp.pressed.has('Space')&&P.dashCd<=0&&st.energy>=DASH.cost){
      st.energy-=DASH.cost;P.dashT=DASH.time;P.dashCd=DASH.cd;
      if(il>.1)dashDir.set(ix,0,iz).normalize();else dashDir.set(Math.sin(legYaw),0,Math.cos(legYaw));
      ctx.audio?.play?.('dash',P.pos);ctx.fx?.burst?.('spark',tmp.copy(P.pos).setY(P.pos.y+.5),{color:0x58e8ff});ctx.postfx?.shake?.(.25);
      ctx.fx?.burst?.('muzzle',tmp.copy(P.pos).setY(P.pos.y+.3),{color:0x58e8ff});
    }
    const dashing=P.dashT>0;P.dashing=dashing;st.dashCd=P.dashCd;
    // movement
    if(dashing){P.dashT-=dt;const k=Math.max(0,P.dashT/DASH.time);const sp=DASH.speed*(.35+.65*k);P.vel.set(dashDir.x*sp,0,dashDir.z*sp)}
    else{
      const tx=ix*SPEED,tz=iz*SPEED;const a=(il>.05?ACCEL:ACCEL*.8)*dt;
      const dx=tx-P.vel.x,dz=tz-P.vel.z,dl=Math.hypot(dx,dz);
      if(dl<=a){P.vel.x=tx;P.vel.z=tz}else{P.vel.x+=dx/dl*a;P.vel.z+=dz/dl*a}
    }
    // sub-stepped collision
    const steps=Math.max(1,Math.ceil(P.vel.length()*dt/.4));
    for(let s=0;s<steps;s++){const sx=P.vel.x*dt/steps,sz=P.vel.z*dt/steps;
      const stuck=blocked(P.pos.x,P.pos.z);
      if(!blocked(P.pos.x+sx,P.pos.z+sz)||stuck){P.pos.x+=sx;P.pos.z+=sz}
      else if(!blocked(P.pos.x+sx,P.pos.z)){P.pos.x+=sx;P.vel.z*=.5}
      else if(!blocked(P.pos.x,P.pos.z+sz)){P.pos.z+=sz;P.vel.x*=.5}
      else{P.vel.x*=.3;P.vel.z*=.3}}
    const lim=(ctx.terrain?.size||200)/2-2;P.pos.x=Math.max(-lim,Math.min(lim,P.pos.x));P.pos.z=Math.max(-lim,Math.min(lim,P.pos.z));
    P.pos.y=damp(P.pos.y,_gy(P.pos.x,P.pos.z),30,dt);
    const spd=Math.hypot(P.vel.x,P.vel.z);speedSm=damp(speedSm,spd,12,dt);

    // facing: legs follow movement (flip when running backwards relative to aim)
    if(spd>.8){
      const mYaw=Math.atan2(P.vel.x,P.vel.z);
      const back=Math.abs(angDiff(aimYaw,mYaw))>Math.PI*.62;
      const target=back?mYaw+Math.PI:mYaw;
      legFlip=back?-1:1;
      legYaw+=angDiff(legYaw,target)*(1-Math.exp(-(dashing?30:14)*dt));
    }else legYaw+=angDiff(legYaw,aimYaw)*(1-Math.exp(-(P.alive?3:0)*dt))*(Math.abs(angDiff(legYaw,aimYaw))>1.2?1:.15);
    // torso: twist toward aim (relative to legs)
    const rel=angDiff(legYaw,aimYaw);torsoYaw=damp(torsoYaw,rel,P.alive?22:2,dt);
    if(Math.abs(rel)>1.9)legYaw+=angDiff(legYaw,aimYaw)*Math.min(1,dt*8);

    // gait
    const fwd=P.vel.x*Math.sin(legYaw)+P.vel.z*Math.cos(legYaw);
    phase+=fwd*dt*1.55;breathe+=dt;
    stride=damp(stride,Math.min(.5,speedSm*.062),14,dt);
    // footsteps (dust + sound)
    const stepIdx=Math.floor(phase/Math.PI);
    if(stepIdx!==lastFootStep){lastFootStep=stepIdx;if(spd>3&&!dashing){ctx.fx?.burst?.('spark',tmp.copy(P.pos).setY(P.pos.y+.05),{color:0x887766,count:2,scale:.4});}}

    // resources
    const firing=P.alive&&inp.down&&!dashing;const w=WEAPONS[P.weapon];
    if(!firing||P.weapon!==1)flameOn=damp(flameOn,0,10,dt);
    st.energy=Math.min(100,st.energy+(firing&&w.cost?0:14)*dt+(dashing?0:0));
    if(P.regenDelay<=0&&P.alive)st.hp=Math.min(st.maxHp,st.hp+1.6*dt);
    // fire
    fireT-=dt;
    if(firing&&fireT<=0){
      const per=P.weapon===1?w.cost*w.rate:w.cost;
      if(st.energy>=per){
        st.energy-=per;fireT=w.rate;
        const wm=weapons[P.weapon];
        // muzzle in world
        H.root.updateMatrixWorld(true);wm.muzzle.getWorldPosition(muz);
        // direction from muzzle toward aim point (with assist), flattened
        mdir.set(aimTarget.x-muz.x,0,aimTarget.z-muz.z);
        if(mdir.lengthSq()<1)mdir.copy(P.aimDir);mdir.normalize();
        // blend with body aim so shots follow weapon barrel
        mdir.lerp(P.aimDir,.0).normalize();
        const spread=P.weapon===0?.012:0;if(spread){const a=(Math.random()-.5)*spread;const c=Math.cos(a),s=Math.sin(a);mdir.set(mdir.x*c-mdir.z*s,0,mdir.x*s+mdir.z*c)}
        muz.y=_gy(muz.x,muz.z)+1.35;
        proj.fire(P.weapon,muz,mdir);
        if(P.weapon!==1||Math.random()<.3){proj.muzzleFlash(muz,P.weapon)}
        recoil=Math.min(1.4,recoil+w.recoil);kick=Math.min(1.2,kick+w.kick);
        if(P.weapon!==1)ctx.fx?.burst?.('muzzle',muz,{color:w.color,dir:mdir});
        else if(Math.random()<.35)ctx.fx?.burst?.('spark',muz,{color:0xffa030});
        if(P.weapon!==1||Math.random()<.2)ctx.audio?.play?.('shoot',muz);
        if(P.weapon===2)ctx.postfx?.shake?.(.35);else if(P.weapon===0)ctx.postfx?.shake?.(.04);
        ctx.ev.emit('shoot',{pos:muz.clone(),dir:mdir.clone(),weapon:P.weapon});
        flameOn=P.weapon===1?1:flameOn;
      }
    }
    recoil=damp(recoil,0,P.weapon===2?6:16,dt);kick=damp(kick,0,10,dt);swapAnim=damp(swapAnim,0,9,dt);
    proj.update(dt);

    // ---------- pose ----------
    const R=H.root;R.position.copy(P.pos);R.rotation.y=legYaw;
    // slope tilt
    {const e=.7,sy=Math.sin(legYaw),cy=Math.cos(legYaw);
     const hf=_gy(P.pos.x+sy*e,P.pos.z+cy*e),hb=_gy(P.pos.x-sy*e,P.pos.z-cy*e);
     R.rotation.x=damp(R.rotation.x,P.alive?Math.atan2(hb-hf,e*2)*.6:R.rotation.x,10,dt)*(P.alive?1:1);
     const hr=_gy(P.pos.x+cy*e,P.pos.z-sy*e),hl=_gy(P.pos.x-cy*e,P.pos.z+sy*e);
     R.rotation.z=damp(R.rotation.z,Math.atan2(hr-hl,e*2)*.5,10,dt);
     // feet follow terrain
     for(let i=0;i<2;i++){const s=i?1:-1;const fz=Math.sin(phase+(i?Math.PI:0))*stride;
       const wx=P.pos.x+cy*s*.2+sy*fz,wz=P.pos.z-sy*s*.2+cy*fz;footDY[i]=damp(footDY[i],(_gy(wx,wz)-P.pos.y)*.8,18,dt)}}
    const walkK=Math.min(1,speedSm/SPEED);
    const bob=Math.abs(Math.cos(phase))*-.06*walkK*(1)+Math.sin(breathe*1.7)*.008;
    const dashK=dashing?1:0;
    H.hips.position.set(0,HIP_H+bob-.03*walkK-(dashing?.1:0)-(kick*.02),0);
    H.hips.rotation.set(0,Math.sin(phase)*.1*walkK*legFlip,Math.sin(phase)*.03*walkK);
    poseLegs(H,{phase:phase*legFlip>=0?phase:phase,stride,lift:.2*walkK+.02,footDY,dash:dashK,spread:0});
    // torso
    const T=H.torso;
    const lean=(dashing?.7:.16*walkK)+kick*-.05;
    const lateral=(P.vel.x*Math.cos(legYaw)-P.vel.z*Math.sin(legYaw))/SPEED;
    T.rotation.set(lean+Math.sin(breathe*1.7)*.012-recoil*.05,torsoYaw-Math.sin(phase)*.1*walkK*legFlip,-lateral*.06,'YXZ');
    T.position.set(0,.12+Math.sin(breathe*1.7)*.006,-kick*.03);
    H.head.rotation.set(-lean*.7+.05*Math.sin(breathe*.8),-torsoYaw*.0+Math.sin(breathe*.5)*.03,0);
    // weapon
    const wm=weapons[P.weapon].group,mount=H.weaponMount;
    mount.position.set(.14,.42,.36-recoil*.12-swapAnim*.25);mount.rotation.set(-recoil*.07+swapAnim*.6,0,0);mount.updateMatrix();
    gR.copy(weapons[P.weapon].gripR).applyMatrix4(wm.matrix).applyMatrix4(mount.matrix);
    gL.copy(weapons[P.weapon].gripL).applyMatrix4(wm.matrix).applyMatrix4(mount.matrix);
    if(dashing){mount.rotation.x+=.0}
    poseArms(H,gR,gL);
    // hair sway
    {const ax=(P.vel.x-prevVel.x),az=(P.vel.z-prevVel.z);prevVel.copy(P.vel);
     const lx=(ax*Math.cos(legYaw)-az*Math.sin(legYaw)),lz=(ax*Math.sin(legYaw)+az*Math.cos(legYaw));
     hairVel.x=damp(hairVel.x,0,6,dt)+lz*.5;hairVel.z=damp(hairVel.z,0,6,dt)-lx*.5;
     for(let i=0;i<H.hair.length;i++){const g=H.hair[i];const w=breathe*3-i*.7;
       g.rotation.x=.35+Math.sin(w)*.08*(1+walkK*2)+Math.max(-.6,Math.min(.6,hairVel.x))*.4+walkK*.4*Math.sin(phase*2-i);
       g.rotation.z=Math.cos(w*.8)*.06+Math.max(-.6,Math.min(.6,hairVel.z))*.5}}
    // jets
    const thrust=dashing?1:Math.min(.45,.12+walkK*.2);
    for(const j of H.jets){const u=j.userData,f=thrust*(.85+Math.random()*.3);
      u.c1.scale.set(1,f*(dashing?1.8:.6),1);u.c1.position.y=-.5*f*(dashing?1.8:.6);
      u.c2.scale.set(1,f*(dashing?1.5:.5),1);u.c2.position.y=-.35*f*(dashing?1.5:.5);
      u.sp.scale.setScalar(.3+f*.9);j.visible=thrust>.1;u.c1.material.opacity=dashing?.85:.35}
    // core pulse
    const pulse=1+Math.sin(ctx.time*3)*.25+(firing?.4:0);
    M.glow.emissiveIntensity=2.4*pulse*(P.alive?1:.2);
    M.armor.emissive.setRGB(P.hitFlash*.8,P.hitFlash*.08,P.hitFlash*.04);
    // dash trail
    if(dashing){for(let k=0;k<2;k++){const j=H.jets[k];j.getWorldPosition(tmp);tmp.y-=.2;addTrail(tmp,.9+Math.random()*.4,.35+Math.random()*.15);}
      tmp.copy(P.pos).setY(P.pos.y+1.2);addTrail(tmp,1.6,.28);
      lightTmp.copy(P.pos).setY(P.pos.y+1);ctx.lighting?.addLight?.(lightTmp,0x58e8ff,3,9)}
    for(const t of trail){if(t.life<=0)continue;t.life-=dt;if(t.life<=0){t.s.visible=false;continue}const k=t.life/t.max;t.s.scale.setScalar(t.size*(.4+k*.8));t.s.material.opacity=k*.9}
    // blob shadow
    H.blob.position.set(P.pos.x,P.pos.y+.04,P.pos.z);H.blob.material.opacity=1;
    if(!P.alive){R.rotation.x=damp(R.rotation.x,-1.3,3,dt);R.position.y-=.2}
    // soft ambient light on hero (reactor glow)
    if(ctx.time%.1<dt){lightTmp.copy(P.pos).setY(P.pos.y+1.6);ctx.lighting?.addLight?.(lightTmp,0x40d8ff,.9,5)}

    // ---------- camera ----------
    const look=tmp2.set(aimTarget.x-P.pos.x,0,aimTarget.z-P.pos.z);const ll=look.length();if(ll>9)look.multiplyScalar(9/ll);look.multiplyScalar(.2);
    tmp.copy(P.pos).add(look);
    const k=1-Math.exp(-6.5*dt);camFocus.lerp(tmp,k);
    ctx.camera.position.copy(camFocus).add(ctx.CAM_OFF);ctx.camera.lookAt(camFocus);
    ctx.debugCam?.(ctx.camera,P);
  };
  P.proj=proj;
  return P;
}
export function update(dt,ctx){ctx.player.update(dt)}
