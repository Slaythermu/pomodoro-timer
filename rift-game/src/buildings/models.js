// Procedural hard-surface models. Each builder returns a Model with .tick(dt,t,b) and metadata.
import * as THREE from 'three';
import {Model,G} from './gfx.js';
const TAU=Math.PI*2;
const cyan=0x35e8ff,orange=0xff8a1e,green=0x44ff88,purple=0xb455ff,red=0xff3a2a,amber=0xffb030;

function base(M,w,h,mat,extra=true){ // foundation slab with hazard border + corner bolts
  const m=M.M;
  M.add(G.box(w,h,w,.08),m.dark,0,h/2,0);
  M.add(G.box(w*.94,.1,w*.94,.03),m.plate,0,h+.05,0);
  if(extra){const e=w*.47;for(const s of [-1,1]){M.add(G.box(w*.94,.04,.14,0),m.hazard,0,h+.11,s*e*.94);M.add(G.box(.14,.04,w*.94,0),m.hazard,s*e*.94,h+.11,0)}}
  return h+.1;
}
function bolts(M,r,y,n,mat){for(let i=0;i<n;i++){const a=i/n*TAU;M.add(G.cyl(.07,.07,.1,6),mat||M.M.chrome,Math.cos(a)*r,y,Math.sin(a)*r)}}

export const builders={
core(){
  const M=new Model(),m=M.M;M.H=6.2;
  // tiered octagonal foundation
  M.add(G.cyl(3.5,3.7,.5,8),m.dark,0,.25,0,0,Math.PI/8);
  M.add(G.cyl(3.1,3.5,.35,8),m.plate,0,.67,0,0,Math.PI/8);
  M.add(G.cyl(2.6,3.0,.25,8),m.hull,0,.97,0,0,Math.PI/8);
  const ringMat=M.glow(cyan,2.6,'pulse');
  M.add(G.tor(3.12,.07,48),ringMat,0,.86,0,Math.PI/2);
  M.add(G.tor(2.62,.05,48),ringMat,0,1.1,0,Math.PI/2);
  for(let i=0;i<8;i++){const a=i/8*TAU+Math.PI/8;M.add(G.box(.9,.12,.5,.02),m.hazard,Math.cos(a)*3.4,.55,Math.sin(a)*3.4,0,-a+Math.PI/2)}
  // corner pylons
  const beacons=[];
  for(const [sx,sz] of [[1,1],[1,-1],[-1,1]]){
    const x=sx*2.3,z=sz*2.3;
    M.add(G.box(.95,2.4,.95,.1),m.hull,x,2.3,z);M.add(G.box(1.1,.25,1.1,.06),m.accent,x,3.55,z);M.add(G.box(.7,.4,.7,.05),m.dark,x,1.25,z);
    M.add(G.box(.12,1.5,.12,0),M.glow(cyan,3,'pulse',x),x+.5*Math.sign(x)*0,2.4,z+.49*Math.sign(z)*1,0,0,0);
    M.add(G.box(.12,1.5,.12,0),M.glow(cyan,3,'pulse',z),x+.49*Math.sign(x),2.4,z,0,0,0);
    M.add(G.cyl(.04,.06,1.4,6),m.chrome,x,4.4,z);
    const b=M.glow(red,4,'blink',x*3+z);beacons.push(b);M.add(G.sph(.12,8,6),b,x,5.12,z);
  }
  // radar tower (4th corner)
  M.add(G.box(.7,2.8,.7,.08),m.hull,-2.3,2.5,-2.3);M.add(G.cyl(.18,.18,.6,10),m.chrome,-2.3,4.1,-2.3);
  const radar=M.piv(-2.3,4.5,-2.3);M.add(G.dish(.75),m.plate,0,0,0,-Math.PI/2*.8,0,0,radar);M.add(G.cyl(.03,.03,.7,5),m.chrome,0,.18,.18,Math.PI/2,0,0,radar);M.add(G.sph(.08,6,6),M.glow(amber,3),0,.1,.7,0,0,0,radar);
  radar.children[0].rotation.x=Math.PI/2+.5;radar.children[0].position.set(0,0,.1);
  // side modules with vents
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const ca=Math.cos(a),sa=Math.sin(a),x=ca*1.95,z=sa*1.95;
    if(a===Math.PI*.5||a===0||a===Math.PI||a===Math.PI*1.5){M.add(G.box(1.5,.9,.7,.06),m.hull,x*.85,1.5,z*.85,0,-a+Math.PI/2);}
    for(let k=0;k<4;k++)M.add(G.box(.9,.04,.05,0),m.black,x*.85+ca*.36,1.5-.2+k*.1,z*.85+sa*.36,0,-a+Math.PI/2);
  }
  // reactor column
  M.add(G.cyl(1.55,1.9,.5,24),m.plate,0,1.4,0);
  M.add(G.cyl(1.35,1.55,.3,24),m.dark,0,1.78,0);
  for(let i=0;i<6;i++){const a=i/6*TAU;M.add(G.box(.12,2.9,.12,.02),m.chrome,Math.cos(a)*1.25,3.4,Math.sin(a)*1.25)}
  M.add(G.cyl(1.4,1.4,.3,24),m.dark,0,4.95,0);M.add(G.cyl(1.0,1.3,.3,24),m.plate,0,5.2,0);
  M.add(G.cyl(.4,.7,.45,16),m.accent,0,5.5,0);M.add(G.cyl(.08,.08,.7,6),m.chrome,0,6.0,0);
  M.add(G.cylo(1.18,1.18,3.1,28),m.glass,0,3.4,0);
  const coreMat=M.glow(0x8ff6ff,5,'pulse');
  const core=M.piv(0,3.4,0);M.add(G.ico(.7,1),coreMat,0,0,0,0,0,0,core);M.add(G.oct(.95),M.glow(cyan,1.4),0,0,0,0,0,0,core).material.wireframe=true;
  const halo=M.glow(cyan,1.2,'pulse');M.add(G.cyl(.18,.18,3,10),halo,0,3.4,0);
  const rings=[];for(let i=0;i<3;i++){const p=M.piv(0,3.4+(i-1)*.85,0);M.add(G.tor(1.65-.1*Math.abs(i-1),.1,36),M.glow(i==1?orange:cyan,2.4,'pulse',i),0,0,0,Math.PI/2,0,0,p);M.add(G.box(.3,.22,.3,.04),m.chrome,1.65,0,0,0,0,0,p);M.add(G.box(.3,.22,.3,.04),m.chrome,-1.65,0,0,0,0,0,p);rings.push(p)}
  M.tick=(dt,t,b)=>{const k=b.built?1:.6;core.rotation.y+=dt*.8;core.rotation.x+=dt*.5;core.scale.setScalar(1+Math.sin(t*2)*.05);radar.rotation.y+=dt*.9;
    rings[0].rotation.y+=dt*1.2;rings[1].rotation.y-=dt*.8;rings[1].rotation.x=Math.sin(t*.7)*.25;rings[2].rotation.y+=dt*1.7;rings[2].rotation.z=Math.cos(t*.5)*.25;M.animateGlows(t,k)};
  return M},

harvester(){
  const M=new Model(),m=M.M;M.H=4;
  const y0=base(M,3.8,.25);
  // hole with glowing depths
  M.add(G.cyl(.95,.95,.06,24),m.black,0,y0+.01,0);
  const hole=M.glow(orange,2.4,'flicker');M.add(G.cyl(.78,.78,.05,24),hole,0,y0+.04,0);
  M.add(G.tor(.98,.1,24),m.chrome,0,y0+.06,0,Math.PI/2);
  // gantry frame
  for(const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){M.add(G.box(.22,3,.22,.04),m.hull,sx*1.1,y0+1.5,sz*1.1);M.add(G.box(.34,.2,.34,.04),m.accent,sx*1.1,y0+3.05,sz*1.1)}
  for(const s of [-1,1]){M.add(G.box(2.5,.25,.25,.04),m.hull,0,y0+2.95,s*1.1);M.add(G.box(.25,.25,2.5,.04),m.hull,s*1.1,y0+2.95,0);
    M.add(G.box(.08,.08,2.9,0),m.chrome,s*1.1,y0+1.6,0,0,0,0);M.add(G.box(2.9,.08,.08,0),m.dark,0,y0+2.1,s*1.1)}
  // diagonal braces
  for(const s of [-1,1]){M.add(G.box(.08,2.0,.08,0),m.dark,s*1.1,y0+1.5,0,0,0,.6);M.add(G.box(.08,2.0,.08,0),m.dark,0,y0+1.5,s*1.1,.6,0,0)}
  // top housing
  M.add(G.cyl(.75,.9,.9,16),m.plate,0,y0+3.55,0);M.add(G.cyl(.5,.5,.4,16),m.dark,0,y0+4.15,0);
  const beacon=M.glow(amber,4,'blink');M.add(G.sph(.13,8,6),beacon,0,y0+4.45,0);
  // moving drill head
  const head=M.piv(0,y0+2,0);
  M.add(G.cyl(.55,.55,.55,16),m.accent,0,.9,0,0,0,0,head);M.add(G.cyl(.2,.2,1.2,8),m.chrome,0,1.7,0,0,0,0,head);
  const drill=M.piv(0,0,0,head);
  M.add(G.cyl(.4,.36,.35,14),m.dark,0,.5,0,0,0,0,drill);
  for(let i=0;i<7;i++){const r=.38-i*.045;M.add(G.cyl(r,r+.04,.18,10),i%2?m.chrome:m.dark,0,.3-i*.17,0,0,0,0,drill)}
  M.add(G.cyl(.02,.07,.5,8),m.chrome,0,-.95,0,0,0,0,drill);
  for(let i=0;i<3;i++){const a=i/3*TAU;M.add(G.box(.05,1.0,.05,0),m.chrome,Math.cos(a)*.4,0,Math.sin(a)*.4,0,0,0,drill)}
  // hopper tank
  M.add(G.cyl(.62,.62,1.7,16),m.hull,1.15,y0+.75,-1.15,0,0,Math.PI/2*0);
  const tank=M.glow(amber,2.2,'pulse');
  M.add(G.box(.12,.9,.04,0),tank,1.15+.0,y0+.75,-1.15+.63);M.add(G.box(.12,.9,.04,0),tank,1.15,y0+.75,-1.15-.63);
  M.add(G.cyl(.65,.65,.12,16),m.accent,1.15,y0+1.4,-1.15);M.add(G.cyl(.65,.65,.12,16),m.accent,1.15,y0+.1,-1.15);
  M.add(G.cyl(.08,.08,1.2,8),m.brass,.6,y0+1.4,-.6,0,0,Math.PI/2*0+0,null);
  M.add(G.tor(.5,.07,12,Math.PI/2),m.brass,.1,y0+1.4,-.7,0,Math.PI,0);
  // control box
  M.add(G.box(.7,.8,.5,.05),m.hull,-1.2,y0+.5,1.2);M.add(G.box(.5,.25,.04,0),M.glow(green,2.2,'blink',1),-1.2,y0+.72,1.46);M.add(G.box(.5,.1,.04,0),M.glow(cyan,2.2,'pulse',2),-1.2,y0+.45,1.46);
  const pistons=[];for(const s of [-1,1]){const p=M.piv(s*.7,y0+.35,s*.0);M.add(G.cyl(.09,.09,.9,8),m.chrome,0,.4,0,0,0,0,p);M.add(G.cyl(.14,.14,.4,8),m.dark,0,0,0,0,0,0,p);pistons.push(p)}
  M.tick=(dt,t,b)=>{const e=Math.max(.15,b.eff);b.ph=(b.ph||0)+dt*e;const ph=b.ph;drill.rotation.y+=dt*14*e;head.position.y=y0+1.55+Math.sin(ph*2.2)*.45;
    pistons[0].position.y=y0+.35+Math.max(0,Math.sin(ph*4))*.4;pistons[1].position.y=y0+.35+Math.max(0,-Math.sin(ph*4))*.4;
    hole.emissiveIntensity=2.2+Math.sin(ph*13)*.8;M.animateGlows(t,b.built?(.4+.6*e):.3);hole.emissiveIntensity*=1;};
  M.tick2=null;return M},

generator(){
  const M=new Model(),m=M.M;M.H=3.8;
  const y0=base(M,3.8,.25);
  for(const s of [-1,1]){
    const x=s*1.0;
    M.add(G.cyl(.78,.85,.3,20),m.dark,x,y0+.15,-.2);M.add(G.cylo(.7,.7,2.2,20),m.glass,x,y0+1.4,-.2);M.add(G.cyl(.78,.7,.3,20),m.plate,x,y0+2.65,-.2);M.add(G.cyl(.4,.5,.25,16),m.accent,x,y0+2.9,-.2);
    for(let i=0;i<4;i++){const a=i/4*TAU+Math.PI/4;M.add(G.box(.1,2.3,.1,.02),m.chrome,x+Math.cos(a)*.68,y0+1.4,-.2+Math.sin(a)*.68)}
    M.add(G.cyl(.18,.18,2,10),M.glow(s>0?amber:cyan,3.2,'pulse',s),x,y0+1.4,-.2);
  }
  // central orb + coils
  M.add(G.cyl(.35,.5,.9,12),m.plate,0,y0+.55,-.2);M.add(G.cyl(.15,.15,1.0,8),m.chrome,0,y0+1.4,-.2);
  const orb=M.glow(0xfff2b0,6,'pulse');const orbG=M.piv(0,y0+2.2,-.2);M.add(G.ico(.38,1),orb,0,0,0,0,0,0,orbG);
  const c1=M.piv(0,y0+2.2,-.2),c2=M.piv(0,y0+2.2,-.2);const cm=M.glow(cyan,2.6,'pulse',1);
  M.add(G.tor(.7,.06,28),cm,0,0,0,0,0,0,c1);M.add(G.tor(.55,.05,28),cm,0,0,0,0,0,0,c2);
  M.add(G.cyl(.04,.04,2.6,6),m.chrome,0,y0+1.4,-.2,0,0,Math.PI/2);
  // cooling fins back
  for(let i=0;i<9;i++)M.add(G.box(2.4,1.2,.05,0),m.hull,0,y0+.85,-1.2-i*.0+0.0+(i-4)*.0,0,0,0);
  M.add(G.box(2.6,1.4,.7,.05),m.dark,0,y0+.75,-1.4);
  for(let i=0;i<10;i++)M.add(G.box(2.3,.05,.2,0),m.chrome,0,y0+.2+i*.12,-1.78);
  // stacks
  for(const s of [-1,1]){M.add(G.cyl(.14,.2,1.3,10),m.hull,s*1.3,y0+1.7,-1.5);M.add(G.tor(.15,.03,10),m.accent,s*1.3,y0+2.35,-1.5,Math.PI/2)}
  // front panel
  M.add(G.box(1.5,.7,.5,.05),m.hull,0,y0+.4,1.45);
  const bars=[0,1,2,3].map(i=>{const g=M.glow(i<3?green:amber,2.6,'pulse',i*1.3);M.add(G.box(.25,.14,.04,0),g,-.5+i*.33,y0+.55,1.71);return g});
  M.add(G.box(1.2,.08,.04,0),M.glow(cyan,2,'blink'),0,y0+.28,1.71);
  M.add(G.cyl(.1,.1,.08,8),M.glow(red,4,'blink',2),1.5,y0+.1,1.5);
  M.tick=(dt,t,b)=>{c1.rotation.set(t*1.5,t*1.1,0);c2.rotation.set(0,t*-1.8,t*1.3);orbG.rotation.y+=dt*2;orbG.scale.setScalar(1+Math.sin(t*5)*.08);M.animateGlows(t,b.built?1:.3);
    if(b.built&&b.ctx&&b.ctx.__vfx&&Math.random()<dt*3){b.ctx.__vfx.smoke(b.pos.x+(Math.random()<.5?1.3:-1.3),b.pos.y+y0+2.9,b.pos.z-1.5,.5,0x889999)}};
  return M},

turret(){
  const M=new Model(),m=M.M;M.H=2.9;
  // base
  M.add(G.cyl(1.6,1.75,.3,8),m.dark,0,.15,0,0,Math.PI/8);M.add(G.cyl(1.3,1.5,.35,8),m.plate,0,.47,0,0,Math.PI/8);
  M.add(G.tor(1.5,.05,40),M.glow(cyan,2.2,'pulse'),0,.33,0,Math.PI/2);
  for(let i=0;i<8;i++){const a=i/8*TAU;M.add(G.box(.7,.5,.12,.03),i%2?m.accent:m.hull,Math.cos(a)*1.45,.5,Math.sin(a)*1.45,0,-a+Math.PI/2)}
  bolts(M,1.15,.68,10);M.add(G.cyl(.85,1.05,.28,16),m.hull,0,.78,0);
  const yaw=M.piv(0,.92,0);
  // head
  M.add(G.box(1.35,.62,1.4,.1),m.hull,0,.35,.0,0,0,0,yaw);
  M.add(G.box(1.1,.25,1.0,.08),m.plate,0,.78,-.15,.0,0,0,yaw);
  M.add(G.box(.96,.2,.6,.05),m.hull,0,.65,.55,-.35,0,0,yaw);
  for(const s of [-1,1]){M.add(G.box(.12,.5,1.1,.03),m.accent,s*.72,.35,0,0,0,0,yaw);M.add(G.box(.36,.4,.5,.04),m.dark,s*.84,.28,-.35,0,0,0,yaw);for(let k=0;k<5;k++)M.add(G.box(.08,.08,.12,.02),m.brass,s*.84,.1+k*.0+.18,.0-.1+k*.0-.3+k*.08,0,0,0,yaw)}
  const eye=M.glow(red,5,'pulse');M.add(G.box(.5,.1,.06,.02),eye,0,.62,.74,-.3,0,0,yaw);
  const sens=M.piv(0,.95,-.3,yaw);M.add(G.cyl(.12,.12,.25,10),m.black,0,0,0,0,0,0,sens);M.add(G.sph(.1,8,6),M.glow(cyan,3.5,'blink'),0,.18,0,0,0,0,sens);
  const barrels=[];
  for(const s of [-1,1]){const bp=M.piv(s*.3,.5,.55,yaw);
    M.add(G.cyl(.15,.15,.55,12),m.dark,0,0,.1,Math.PI/2,0,0,bp);
    M.add(G.cyl(.075,.085,1.5,10),m.chrome,0,0,.95,Math.PI/2,0,0,bp);
    M.add(G.cyl(.14,.14,.7,10),m.dark,0,0,.6,Math.PI/2,0,0,bp);
    for(let k=0;k<3;k++)M.add(G.tor(.105,.025,10),m.accent,0,0,.9+k*.22,0,0,0,bp);
    M.add(G.cyl(.13,.1,.2,10),m.black,0,0,1.75,Math.PI/2,0,0,bp);
    M.tip(bp,0,0,1.9);barrels.push(bp)}
  M.tickState={};
  M.tick=(dt,t,b)=>{yaw.rotation.y=b.yaw||0;sens.rotation.y+=dt*3;
    barrels[0].position.z=.55-Math.max(0,b.rec0||0)*.22;barrels[1].position.z=.55-Math.max(0,b.rec1||0)*.22;b.rec0=(b.rec0||0)-dt*9;b.rec1=(b.rec1||0)-dt*9;
    M.animateGlows(t,b.built?(b.target?1.6:.8):.3)};
  M.yawNode=yaw;return M},

plasma(){
  const M=new Model(),m=M.M;M.H=5.6;
  M.add(G.cyl(1.3,1.5,.35,10),m.dark,0,.17,0);M.add(G.cyl(1.0,1.25,.4,10),m.plate,0,.55,0);M.add(G.tor(1.3,.05,40),M.glow(purple,2.4,'pulse'),0,.4,0,Math.PI/2);
  bolts(M,.9,.78,8);
  M.add(G.cyl(.45,.75,1.4,12),m.hull,0,1.4,0);M.add(G.cyl(.3,.45,1.3,12),m.dark,0,2.7,0);M.add(G.cyl(.22,.3,.9,12),m.hull,0,3.75,0);
  const coilMat=M.glow(purple,2.8,'pulse');
  for(const [y,r] of [[1.3,.78],[1.75,.66],[2.35,.5],[2.9,.42],[3.45,.33]])M.add(G.tor(r,.07,24),coilMat,0,y,0,Math.PI/2);
  for(let i=0;i<3;i++){const a=i/3*TAU,x=Math.cos(a),z=Math.sin(a);
    M.add(G.box(.18,1.9,.28,.04),m.accent,x*.6,2.1,z*.6,0,-a+Math.PI/2,0);
    M.add(G.box(.12,1.2,.12,.02),m.hull,x*.62,3.65,z*.62,0,0,0);
    M.add(G.cyl(.04,.1,.6,8),m.chrome,x*.85,4.5,z*.85);
    M.add(G.sph(.1,8,6),M.glow(0xe6b0ff,5,'pulse',i),x*.85,4.85,z*.85);M.tip(M.root,x*.85,4.85,z*.85)}
  M.add(G.cyl(.3,.2,.2,10),m.plate,0,4.22,0);
  const orb=M.piv(0,4.7,0);const og=M.glow(0xf1d0ff,7,'flicker');M.add(G.ico(.36,1),og,0,0,0,0,0,0,orb);const sh=M.glow(purple,2.2,'pulse');M.add(G.ico(.55,1),sh,0,0,0,0,0,0,orb).material.wireframe=true;
  const cage=M.piv(0,4.7,0);M.add(G.tor(.62,.03,24),M.glow(purple,3),0,0,0,0,0,0,cage);M.add(G.tor(.62,.03,24),M.glow(purple,3),0,0,0,Math.PI/2,0,0,cage);
  M.orbTip=orb;
  M.tick=(dt,t,b)=>{orb.rotation.y+=dt*2;orb.rotation.x+=dt;orb.position.y=4.7+Math.sin(t*2)*.08;cage.rotation.y+=dt*3;cage.rotation.x+=dt*1.7;cage.position.y=orb.position.y;const k=b.built?(b.target?1.7:1):.3;M.animateGlows(t,k);
    orb.scale.setScalar(1+(b.target?.25*Math.sin(t*30):0))};
  return M},

wall(){
  const M=new Model(),m=M.M;M.H=1.9;
  M.add(G.box(1.2,.3,1.2,.06),m.dark,0,.15,0);
  M.add(G.box(.9,1.6,.9,.1),m.hull,0,1.0,0);M.add(G.box(1.05,.18,1.05,.05),m.accent,0,1.82,0);
  M.add(G.box(.2,.9,.04,0),M.glow(cyan,2.4,'pulse'),0,1.0,.46);M.add(G.box(.2,.9,.04,0),M.glow(cyan,2.4,'pulse',1),0,1.0,-.46);M.add(G.box(.04,.9,.2,0),M.glow(cyan,2.4,'pulse',2),.46,1.0,0);M.add(G.box(.04,.9,.2,0),M.glow(cyan,2.4,'pulse',3),-.46,1.0,0);
  M.add(G.box(.92,.04,.92,0),m.hazard,0,1.62,0);M.add(G.cyl(.06,.08,.3,6),m.chrome,0,2.05,0);M.add(G.sph(.06,6,5),M.glow(amber,4,'blink'),0,2.22,0);
  // arms: 0:+z 1:+x 2:-z 3:-x
  const arms=[];
  for(let i=0;i<4;i++){const p=M.piv(0,0,0);p.rotation.y=i*Math.PI/2;
    M.add(G.box(.62,.2,1.2,.04),m.dark,0,.1,1.0,0,0,0,p);
    M.add(G.box(.55,1.3,1.1,.07),m.plate,0,.85,1.0,0,0,0,p);M.add(G.box(.62,.16,1.1,.04),m.accent,0,1.55,1.0,0,0,0,p);
    for(let k=0;k<3;k++)M.add(G.box(.62,.06,1.1,.02),m.black,0,.4+k*.3,1.0,0,0,0,p);
    M.add(G.box(.04,.5,.7,0),M.glow(cyan,2,'pulse',i+1),.29,.9,1.0,0,0,0,p);M.add(G.box(.04,.5,.7,0),M.glow(cyan,2,'pulse',i),-.29,.9,1.0,0,0,0,p);
    arms.push(p);p.visible=false}
  M.arms=arms;M.tick=(dt,t,b)=>{M.animateGlows(t,b.built?1:.3)};return M},

mortar(){
  const M=new Model(),m=M.M;M.H=3.4;
  const y0=base(M,3.6,.22,null,false);
  for(const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){M.add(G.box(.9,.18,.5,.04),m.hull,sx*1.25,y0+.1,sz*1.25,0,Math.atan2(sx,sz),0);M.add(G.cyl(.12,.16,.35,8),m.chrome,sx*1.3,y0+.2,sz*1.3)}
  M.add(G.cyl(1.3,1.45,.4,8),m.plate,0,y0+.2,0,0,Math.PI/8);M.add(G.tor(1.35,.05,40),M.glow(orange,2.2,'pulse'),0,y0+.42,0,Math.PI/2);
  const yaw=M.piv(0,y0+.4,0);
  M.add(G.box(1.8,.7,1.5,.1),m.hull,0,.35,0,0,0,0,yaw);M.add(G.box(1.5,.2,1.2,.06),m.plate,0,.8,-.1,0,0,0,yaw);
  for(const s of [-1,1]){M.add(G.box(.4,1.2,1.2,.08),m.accent,s*.85,.7,-.1,0,0,0,yaw);M.add(G.cyl(.18,.18,.5,10),m.chrome,s*1.1,1.1,-.1,0,0,Math.PI/2,yaw)}
  // ammo rack
  for(let i=0;i<3;i++){const sh=M.piv(-.5+i*.5,.45,-.8,yaw);M.add(G.cyl(.13,.13,.55,10),m.brass,0,0,0,0,0,0,sh);M.add(G.cyl(.01,.13,.2,10),m.accent,0,.37,0,0,0,0,sh)}
  const pitch=M.piv(0,1.05,-.1,yaw);pitch.rotation.x=-1.0;
  M.add(G.cyl(.38,.38,.7,14),m.dark,0,0,-.0,Math.PI/2,0,0,pitch);
  const slide=M.piv(0,0,0,pitch);
  M.add(G.cyl(.25,.28,2.2,16),m.chrome,0,0,1.0,Math.PI/2,0,0,slide);M.add(G.cyl(.34,.34,.5,16),m.dark,0,0,.45,Math.PI/2,0,0,slide);
  for(const z of [.9,1.4,1.9])M.add(G.tor(.3,.05,16),m.accent,0,0,z,0,0,0,slide);
  M.add(G.cyl(.33,.25,.25,16),m.black,0,0,2.15,Math.PI/2,0,0,slide);
  M.tip(slide,0,0,2.3);
  const dish=M.piv(.7,1.6,.45,yaw);M.add(G.cyl(.04,.04,.5,5),m.chrome,0,-.2,0,0,0,0,dish);const dsh=M.piv(0,.1,0,dish);M.add(G.dish(.3),m.plate,0,0,0,-Math.PI/2+.7,0,0,dsh);
  M.add(G.sph(.07,6,6),M.glow(amber,4,'blink'),-.7,.95,.55,0,0,0,yaw);
  M.tick=(dt,t,b)=>{yaw.rotation.y=b.yaw||0;pitch.rotation.x=-1.0-(b.tpitch||0);slide.position.z=-Math.max(0,b.rec0||0)*.45;b.rec0=(b.rec0||0)-dt*2.2;dsh.rotation.y+=dt*1.5;M.animateGlows(t,b.built?1:.3)};
  M.yawNode=yaw;return M},

beacon(){
  const M=new Model(),m=M.M;M.H=4.6;
  M.add(G.cyl(1.25,1.45,.3,10),m.dark,0,.15,0);M.add(G.cyl(.95,1.15,.35,10),m.plate,0,.47,0);
  const gm=M.glow(green,2.6,'pulse');M.add(G.tor(1.3,.05,40),gm,0,.3,0,Math.PI/2);M.add(G.tor(.95,.04,40),gm,0,.66,0,Math.PI/2);
  bolts(M,.75,.68,8);
  M.add(G.cyl(.3,.55,1.8,12),m.hull,0,1.5,0);M.add(G.cyl(.18,.3,1.2,12),m.plate,0,3.0,0);
  for(let i=0;i<4;i++){const a=i/4*TAU;M.add(G.box(.12,1.1,.3,.03),m.accent,Math.cos(a)*.45,1.35,Math.sin(a)*.45,0,-a+Math.PI/2,0.0)}
  for(const y of [1.1,1.7,2.3])M.add(G.box(.04,.35,.04,0),M.glow(green,3.2,'pulse',y),.0,y,.4);
  M.add(G.cyl(.35,.2,.25,12),m.accent,0,3.7,0);
  const top=M.piv(0,4.3,0);const cm=M.glow(0x9dffc0,5,'pulse');M.add(G.oct(.38),cm,0,0,0,0,0,0,top);
  const r1=M.piv(0,4.3,0),r2=M.piv(0,4.3,0),r3=M.piv(0,4.3,0);const rm=M.glow(green,3,'pulse',1);
  M.add(G.tor(.75,.05,32),rm,0,0,0,0,0,0,r1);M.add(G.tor(.62,.045,32),rm,0,0,0,Math.PI/2,0,0,r2);M.add(G.tor(.5,.04,28),rm,0,0,0,0,Math.PI/2,0,r3);
  for(let i=0;i<3;i++){const a=i/3*TAU;M.add(G.cyl(.03,.05,.9,6),m.chrome,Math.cos(a)*.35,3.55,Math.sin(a)*.35,Math.sin(a)*.5,0,-Math.cos(a)*.5);M.add(G.sph(.07,6,6),M.glow(green,4,'pulse',i),Math.cos(a)*.62,3.95,Math.sin(a)*.62)}
  M.tick=(dt,t,b)=>{top.rotation.y+=dt*2;top.rotation.x+=dt*1.3;r1.rotation.set(t*.8,t*1.4,0);r2.rotation.set(t*1.2,0,t*.9);r3.rotation.set(0,t*1.9,t);const p=1+Math.sin(t*3)*.08;top.scale.setScalar(p);M.animateGlows(t,b.built?1:.3)};
  return M},
};

export const SPECS={
  core:{name:'Command Core',cells:3,hp:3500,cost:{},tint:'#35e8ff'},
  harvester:{name:'Harvester',cells:2,hp:420,cost:{carbon:40,steel:15},power:2,tint:'#ffb030',build:3.2,desc:'Mines resource nodes'},
  generator:{name:'Power Gen',cells:2,hp:480,cost:{carbon:50,steel:30},power:-9,tint:'#ffe27a',build:3.6,desc:'+9 energy'},
  turret:{name:'Gun Turret',cells:2,hp:520,cost:{carbon:30,steel:45},power:2,tint:'#ff5a3a',build:3,desc:'Rapid twin cannon',range:24},
  plasma:{name:'Plasma Tower',cells:2,hp:600,cost:{carbon:40,steel:50,crystal:30},power:5,tint:'#b455ff',build:4.2,desc:'Arc lightning',range:17},
  wall:{name:'Wall',cells:1,hp:650,cost:{steel:6},power:0,tint:'#9fb4d0',build:.9,desc:'Auto-connecting'},
  mortar:{name:'Mortar',cells:2,hp:480,cost:{carbon:40,steel:60,crystal:8},power:3,tint:'#ff8a1e',build:4,desc:'Splash artillery',range:42},
  beacon:{name:'Repair Beacon',cells:2,hp:380,cost:{carbon:20,steel:30,crystal:20},power:3,tint:'#44ff88',build:3.4,desc:'Heals buildings',range:13},
};
export const ORDER=['harvester','generator','turret','plasma','wall','mortar','beacon'];
