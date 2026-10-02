// Detailed procedural bodies + skeletal-style animation for brute, spitter and boss.
// Each builder returns a rig: {root, update(e,dt,t,ground), flash, legs, setVisible(v), reset()}
// State codes (set by the brains in enemies.js): 0 move, 1 idle, 2 windup, 3 attack, 4 recover, 5 special windup.
import * as THREE from 'three';
import {GeoBuilder,taper,ellipsoid,cone,segMatrix,creatureMat,chitinTex,clamp,smooth,lerp} from './util.js';
import {Leg,legSegGeo} from './rig.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const HDR=(r,g,b)=>new THREE.MeshBasicMaterial({color:new THREE.Color(r,g,b),toneMapped:false});
function mesh(geo,mat,parent,x=0,y=0,z=0,{rx=0,ry=0,rz=0,sx=1,sy=1,sz=1,shadow=true}={}){
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.scale.set(sx,sy,sz);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m}
const sph=(r,ws=14,hs=10)=>new THREE.SphereGeometry(r,ws,hs);
const ell=(a,b,c,ws=16,hs=12)=>ellipsoid(a,b,c,ws,hs);
function tex(key,o){return chitinTex(key,o)}
/** a curved horn / blade built from tapered segments (list of points) as a single merged geometry */
function curve(points,r0,r1){const b=new GeoBuilder(),n=points.length-1;
  for(let i=0;i<n;i++){const ra=r0+(r1-r0)*(i/n),rb=r0+(r1-r0)*((i+1)/n);b.add(taper(points[i],points[i+1],ra,rb,7),segMatrix(points[i],points[i+1]),{color:[1,1,1]})}
  return b.build()}
const geoCache=new Map();const G=(k,f)=>{if(!geoCache.has(k))geoCache.set(k,f());return geoCache.get(k)};

function makeLegs(rig,parent,defs,mat,kneeMat,o){
  const legs=[];
  for(const d of defs){
    const upGeo=G(`${o.key}u`,()=>legSegGeo(o.L1,o.r0,o.r1,'upper',{}));
    const loGeo=G(`${o.key}l`,()=>legSegGeo(o.L2,o.r1,o.r2,'lower',{claw:o.claw}));
    const kneeGeo=G(`${o.key}k`,()=>sph(o.r1*1.35,10,8));
    legs.push(new Leg({parent,hip:d.hip,home:d.home,L1:o.L1,L2:o.L2,upGeo,loGeo,mat,kneeGeo,kneeMat,group:d.group,bend:d.bend,stepDist:o.stepDist,stepH:o.stepH,stepTime:o.stepTime}));
  }
  return legs;
}
function bodyPose(rig,e,legs,ground,stand,t,pitchK=0.35){
  // body height & tilt derived from planted feet (so it rides over terrain naturally)
  let sy=0,fy=0,by=0,ly=0,ry=0,nf=0,nb=0,nl=0,nr=0;
  for(const l of legs){const y=l.foot.y;sy+=y;const z=l.home.z,x=l.home.x;if(z>0){fy+=y;nf++}else{by+=y;nb++}if(x<0){ly+=y;nl++}else{ry+=y;nr++}}
  const avg=sy/legs.length,gy=ground(e.pos.x,e.pos.z);
  const pitch=nf&&nb?Math.atan2((by/nb)-(fy/nf),3.5)*pitchK*2:0,roll=nl&&nr?Math.atan2((ly/nl)-(ry/nr),3)*pitchK*2:0;
  return {y:(avg-gy)*0.6+stand,pitch,roll};
}

// ===================================================== BRUTE
export function buildBrute(ctx,deb){
  const fl={value:0},root=new THREE.Group(),legRoot=new THREE.Group(),body=new THREE.Group();root.add(body);
  const tB=tex('brute_body',{base:[0.1,0.09,0.16],glow:[0.2,0.95,0.75],cells:34,seed:11,veins:0.35}),tA=tex('brute_armor',{base:[0.5,0.44,0.38],glow:[1,0.4,0.08],cells:22,seed:23,veins:0.2});
  const mBody=creatureMat(ctx,{tex:tB,flash:fl,glow:0xffffff,glowI:1.1,rep:2,rough:0.42}),mArm=creatureMat(ctx,{tex:tA,flash:fl,glow:0xffffff,glowI:0.9,rep:1.5,rough:0.3,metal:0.35,bump:2.2}),
    mFlesh=creatureMat(ctx,{color:0x5a1e3a,flash:fl,glow:0x330a1a,glowI:0.6,rough:0.2,coat:1,coatR:0.05,sheen:1});
  const glowM=HDR(3.2,1.2,0.25),eyeM=HDR(0.6,3,2.2),mawM=HDR(3,0.7,0.2);
  const wps=[];
  // torso, belly, shoulder hump
  mesh(ell(1.15,0.95,1.8),mBody,body,0,0,0);
  mesh(ell(0.95,0.6,1.5),mFlesh,body,0,-0.42,0.05);
  mesh(ell(0.95,0.62,0.85),mArm,body,0,0.5,0.95);
  // overlapping carapace plates down the back, glowing weak points tucked between them
  for(let i=0;i<6;i++){const z=1.3-i*0.52,r=Math.sqrt(Math.max(0.05,1-(z/1.85)**2)),y=0.95*r+0.02,w=1.05*r+0.08;
    const pl=mesh(ell(w,0.13,0.4,14,6),mArm,body,0,y,z,{rx:-Math.atan2(z,1.8)*0.35});
    mesh(cone(0.12,0.35+0.1*(i%2),6),mArm,body,0,y+0.08,z-0.18,{rx:-0.5});
    if(i%2===1)for(const sx of [-1,1]){const nd=mesh(sph(0.2,10,8),glowM,body,sx*(w*0.82),y-0.2,z+0.22,{sx:1,sy:0.8,sz:1.2,shadow:false});nd.userData.wp=true;wps.push(nd)}}
  // head
  const head=new THREE.Group();head.position.set(0,0.0,1.75);body.add(head);
  mesh(ell(0.55,0.5,0.6),mBody,head,0,0,0.05);
  mesh(ell(0.64,0.5,0.95),mArm,head,0,0.12,0.55,{rx:0.06});
  mesh(ell(0.6,0.15,0.5),mArm,head,0,0.5,0.7,{rx:0.2});
  mesh(ell(0.5,0.38,0.3),mArm,head,0,0.12,1.45);
  const jaw=new THREE.Group();jaw.position.set(0,-0.2,0.25);head.add(jaw);
  mesh(ell(0.5,0.17,0.78),mFlesh,jaw,0,-0.05,0.55);
  mesh(ell(0.4,0.07,0.62),HDR(3,0.7,0.2),jaw,0,0.07,0.55,{shadow:false});
  const tooth=cone(0.06,0.3,5);
  for(let i=0;i<7;i++){const z=0.2+i*0.14,sx=i%2?1:-1;mesh(tooth,mArm,jaw,0.36*sx*(0.9-i*0.05),0.08,z,{rx:0});mesh(tooth,mArm,head,0.4*sx*(0.9-i*0.05),-0.18,0.25+i*0.13,{rx:Math.PI})}
  const hornGeo=(s)=>curve([V(s*0.45,0.45,0.35),V(s*0.85,0.7,0.5),V(s*1.15,0.85,0.95),V(s*1.2,0.78,1.55)],0.2,0.03);
  for(const s of [-1,1]){mesh(hornGeo(s),mArm,head,0,0,0);
    for(const [x,y,z,r] of [[0.32,0.3,1.0,0.1],[0.46,0.12,0.85,0.08],[0.28,0.32,0.55,0.08]])mesh(sph(r,8,6),eyeM,head,s*x,y,z,{shadow:false})}
  // tail with club
  const tail=[];let tp=new THREE.Group();tp.position.set(0,0.05,-1.7);body.add(tp);
  const tg=curve([V(0,0,0),V(0,0,-0.7)],0.34,0.22);
  for(let i=0;i<4;i++){const s=mesh(tg,i%2?mArm:mBody,tp,0,0,0);const nx=new THREE.Group();nx.position.z=-0.7;tp.add(nx);tail.push(tp);tp=nx;
    if(i%2===0)mesh(cone(0.1,0.3,5),mArm,s.parent,0,0.2,-0.3,{rx:-0.4})}
  tail.push(tp);
  mesh(ell(0.42,0.38,0.55),mArm,tp,0,0,-0.4);for(let i=0;i<6;i++){const a=i*1.047;mesh(cone(0.1,0.4,5),mArm,tp,Math.cos(a)*0.35,Math.sin(a)*0.35,-0.45,{rx:0,rz:a-Math.PI/2+0,ry:0})}
  // legs
  const defs=[],bend=sx=>V(sx*0.6,1,0);let gi=0;
  for(const sz of [1,-1])for(const sx of [-1,1]){defs.push({hip:V(sx*0.8,-0.2,sz*0.95),home:V(sx*1.35,0,sz*1.0),group:(sx*sz>0)?0:1,bend:bend(sx)});
    mesh(ell(0.5,0.45,0.55),mArm,body,sx*0.95,0.1,sz*0.95)}
  const legs=makeLegs(rig,legRoot,defs,mBody,mArm,{key:'brute',L1:1.2,L2:1.35,r0:0.3,r1:0.2,r2:0.1,claw:0.6,stepDist:0.8,stepH:0.5,stepTime:0.34});
  const rig={root,legRoot,body,legs,flash:fl,wps,mats:[mBody,mArm,mFlesh],
    visible(v){root.visible=v;legRoot.visible=v;for(const l of legs)l.setVisible(v)},
    reset(){for(const l of legs)l.reset();fl.value=0;this.pose=null},
    update(e,dt,t,ground){
      const k=e.state===2?clamp(e.stateT/e.windup,0,1):0,ch=e.state===3,dk=e.dk||0;
      root.position.set(e.pos.x,ground(e.pos.x,e.pos.z),e.pos.z);root.rotation.y=e.yaw;
      const spd=Math.hypot(e.vx,e.vz),sp=this.pose||{y:1.55,pitch:0,roll:0};
      const jit=(k>0.3||dk>0)?(Math.sin(t*90)*0.03*(k+dk)):0;
      body.position.set(jit,lerp(1.58,0.45,smooth(0,1,dk))+sp.y*0.0+Math.sin(t*e.bobF)*0.05*Math.min(1,spd*0.3)-k*0.28,0);
      body.rotation.set(sp.pitch+k*0.22+(ch?0.14:0)+dk*0.15,0,sp.roll+dk*0.8*e.dsign+Math.sin(t*e.bobF)*0.02*Math.min(1,spd*0.3));
      head.rotation.set(k*0.5+(ch?0.3:0)+dk*0.5+Math.sin(t*2+e.seed)*0.03,Math.sin(t*0.9+e.seed)*0.12*(1-k),0);
      jaw.rotation.x=(k>0?0.65*k:0.08+Math.max(0,Math.sin(t*3+e.seed))*0.08)+dk*0.5+(e.state===3&&e.kind===1?0.8:0);
      for(let i=0;i<tail.length;i++)tail[i].rotation.set(Math.sin(t*2.4-i*0.7+e.seed)*0.05+dk*0.2,Math.sin(t*1.7-i*0.9+e.seed)*0.28+(ch?Math.sin(t*20)*0.1:0)+dk*0.3*(i%2?1:-1),0);
      const br=1+Math.sin(t*2.2+e.seed)*0.015;body.scale.set(br,br,br);
      root.updateMatrixWorld(true);
      for(const l of legs)l.update(body,e.vx,e.vz,dt,ground,legs,1+dk*0.7);
      this.pose=bodyPose(this,e,legs,ground,1.55,t);
      // weak points: flare while winding up / recovering, pulse otherwise, plus hit flash
      const pul=0.6+0.4*Math.sin(t*3+e.seed),fo=e.state===4?1.8:1;
      const wpS=(0.9+k*0.9+(e.state===4?0.6:0)+fl.value*0.8)*(e.state===3?1.2:1);
      for(const w of wps){w.material===glowM&&0;w.scale.setScalar(wpS*(0.85+0.2*pul))}
      glowM.color.setRGB(3.2*(pul*0.5+0.5)*fo+k*3+fl.value*2,1.2*(pul*0.5+0.5)+k*1+fl.value*2,0.25+fl.value*2);
      mawM.color.setRGB(3,0.7+k,0.2);
    }};
  return rig;
}

// ===================================================== SPITTER
export function buildSpitter(ctx,deb){
  const fl={value:0},root=new THREE.Group(),legRoot=new THREE.Group(),body=new THREE.Group();root.add(body);
  const tB=tex('spit_body',{base:[0.08,0.2,0.12],glow:[0.45,1,0.25],cells:30,seed:31,veins:0.45}),tA=tex('spit_arm',{base:[0.35,0.4,0.2],glow:[0.8,1,0.3],cells:18,seed:37,veins:0.3});
  const mBody=creatureMat(ctx,{tex:tB,flash:fl,glow:0xffffff,glowI:1.2,rep:1.5,rough:0.35}),mArm=creatureMat(ctx,{tex:tA,flash:fl,glow:0xffffff,glowI:0.8,rep:1,rough:0.25,metal:0.25});
  const mSac=creatureMat(ctx,{tex:tex('spit_sac',{base:[0.12,0.35,0.1],glow:[0.5,1,0.3],cells:26,seed:41,veins:0.8,size:128}),flash:fl,glow:0xffffff,glowI:1.5,rep:1.4,rough:0.12,coat:1,coatR:0.03,bump:0.6});
  mSac.transparent=true;mSac.opacity=0.93;
  const eyeM=HDR(2.2,3,0.6),coreM=HDR(0.5,3,0.4),tipM=HDR(0.6,3.2,0.5);
  mesh(ell(0.34,0.28,0.55),mBody,body,0,0,0.25);mesh(ell(0.3,0.1,0.4),mArm,body,0,0.25,0.3,{rx:-0.1});
  mesh(ell(0.26,0.24,0.3),mBody,body,0,0.06,-0.2);
  const head=new THREE.Group();head.position.set(0,0.06,0.8);body.add(head);
  mesh(ell(0.28,0.24,0.34),mArm,head,0,0,0);mesh(ell(0.2,0.12,0.25),mArm,head,0,0.22,-0.05);
  const eyes=[];for(const s of [-1,1])for(const [x,y,z,r] of [[0.14,0.1,0.26,0.07],[0.22,0.08,0.12,0.06],[0.1,0.2,0.18,0.045]])eyes.push(mesh(sph(r,8,6),eyeM,head,s*x,y,z,{shadow:false}));
  const tube=curve([V(0,-0.05,0.25),V(0,0.0,0.5),V(0,0.03,0.74)],0.1,0.17);mesh(tube,mBody,head,0,0,0);
  const tip=mesh(sph(0.12,10,8),tipM,head,0,0.03,0.78,{shadow:false});
  for(const s of [-1,1]){mesh(curve([V(s*0.12,-0.1,0.3),V(s*0.28,-0.2,0.5),V(s*0.14,-0.28,0.7)],0.05,0.008),mArm,head,0,0,0)}
  // acid sac abdomen
  const sacG=new THREE.Group();sacG.position.set(0,0.28,-0.7);body.add(sacG);
  const sac=mesh(ell(0.62,0.56,0.8,20,14),mSac,sacG,0,0,0);
  const core=mesh(ell(0.46,0.4,0.58,14,10),coreM,sacG,0,0,0,{shadow:false});
  const nod=[];for(let i=0;i<9;i++){const a=i*2.4,y=Math.sin(a*1.3)*0.4,z=-0.3+Math.cos(a)*0.55;nod.push(mesh(sph(0.07,8,6),HDR(1,3,0.6),sacG,Math.sin(a)*0.5,0.35+y*0.3,z,{shadow:false}))}
  for(let i=0;i<3;i++)mesh(cone(0.09,0.3,5),mArm,sacG,0,0.5-i*0.04,-0.15-i*0.28,{rx:-0.6});
  const defs=[];
  for(const [z,hz] of [[0.5,1.15],[0.1,0.15],[-0.25,-1.0]])for(const sx of [-1,1])defs.push({hip:V(sx*0.28,-0.05,z),home:V(sx*(1.35),0,hz),group:(defs.length%2),bend:V(sx*0.25,1,0)});
  const legs=makeLegs(null,legRoot,defs,mArm,mBody,{key:'spit',L1:1.0,L2:1.3,r0:0.1,r1:0.06,r2:0.03,claw:0.3,stepDist:0.65,stepH:0.4,stepTime:0.26});
  const rig={root,legRoot,body,legs,flash:fl,mats:[mBody,mArm,mSac],
    visible(v){root.visible=v;legRoot.visible=v;for(const l of legs)l.setVisible(v)},
    reset(){for(const l of legs)l.reset();fl.value=0;this.pose=null},
    update(e,dt,t,ground){
      const k=e.state===2?clamp(e.stateT/e.windup,0,1):0,rec=e.state===3?1-clamp(e.stateT/0.3,0,1):0,dk=e.dk||0;
      root.position.set(e.pos.x,ground(e.pos.x,e.pos.z),e.pos.z);root.rotation.y=e.yaw;
      const spd=Math.hypot(e.vx,e.vz),sp=this.pose||{y:1.25,pitch:0,roll:0};
      body.position.set(0,lerp(1.3,0.35,dk)+Math.sin(t*e.bobF*2)*0.04*Math.min(1,spd*0.3)+k*0.18,0);
      body.rotation.set(sp.pitch-k*0.4+rec*0.25+dk*0.3,0,sp.roll+dk*0.9*e.dsign);
      head.rotation.set(-k*0.55+rec*0.4,Math.sin(t*1.3+e.seed)*0.25*(1-k),0);
      const swell=1+k*0.5-rec*0.25+Math.sin(t*3+e.seed)*0.03+dk*0.6*(Math.sin(t*50)*0.15+0.4);
      sacG.scale.set(swell,swell*(1+k*0.1),swell);sacG.rotation.x=-0.1+k*0.15;
      const pu=0.6+0.4*Math.sin(t*(4+k*14)+e.seed);
      coreM.color.setRGB(0.4+k*2.2+fl.value,1.4+pu*1.5+k*1.2,0.3+fl.value*2);tipM.color.setRGB(0.4+k*3,2+k*1.5,0.4);
      core.scale.set(0.95+k*0.15,0.95+k*0.15,0.95+k*0.15);tip.scale.setScalar(1+k*1.4);
      mSac.emissiveIntensity=1.2+k*2.5;
      root.updateMatrixWorld(true);
      for(const l of legs)l.update(body,e.vx,e.vz,dt,ground,legs,1+dk*0.9);
      this.pose=bodyPose(this,e,legs,ground,1.25,t,0.25);
    }};
  return rig;
}

// ===================================================== BOSS TITAN
export function buildBoss(ctx,deb){
  const fl={value:0},root=new THREE.Group(),legRoot=new THREE.Group(),body=new THREE.Group();root.add(body);
  const tB=tex('boss_body',{base:[0.1,0.06,0.13],glow:[0.95,0.2,0.55],cells:44,seed:51,veins:0.4,size:256}),tA=tex('boss_arm',{base:[0.26,0.2,0.3],glow:[1,0.35,0.12],cells:24,seed:57,veins:0.22});
  const mBody=creatureMat(ctx,{tex:tB,flash:fl,glow:0xffffff,glowI:1.3,rep:3,rough:0.4}),mArm=creatureMat(ctx,{tex:tA,flash:fl,glow:0xffffff,glowI:1.0,rep:2,rough:0.28,metal:0.45,bump:2.4}),
    mFlesh=creatureMat(ctx,{color:0x4a1030,flash:fl,glow:0x400a28,glowI:0.8,rough:0.18,coat:1,coatR:0.04,sheen:1});
  const coreM=HDR(3.5,0.5,1.2),eyeM=HDR(3.5,1.2,0.3),bulbM=HDR(1,0.4,3),bulbs=[];
  mesh(ell(2.7,2.2,3.7,24,16),mBody,body,0,0,0.2);mesh(ell(2.2,1.7,2.4,20,14),mFlesh,body,0,-0.9,0.4);
  const abd=mesh(ell(2.3,2.0,3.0,22,14),mBody,body,0,0.4,-4.1);
  for(let i=0;i<5;i++)mesh(ell(2.1-i*0.1,0.22,0.55,16,6),mArm,body,0,1.95-i*0.08,-2.8-i*0.75,{rx:0.15});
  // dorsal carapace plates + bioluminescent bulbs on spines
  for(let i=0;i<8;i++){const z=2.6-i*0.9,r=Math.sqrt(Math.max(0.1,1-((z-0.2)/3.8)**2)),y=2.2*r+0.05;
    mesh(ell(2.4*r+0.2,0.28,0.55,16,6),mArm,body,0,y,z,{rx:-Math.atan2(z-0.2,3.5)*0.3});
    const sp=mesh(cone(0.25,1.2+0.1*(i%3),6),mArm,body,0,y+0.15,z-0.3,{rx:-0.45});
    const b=mesh(sph(0.3,10,8),bulbM,body,0,y+1.2+0.1*(i%3)*0.3,z-0.85,{shadow:false});bulbs.push(b);
    for(const s of [-1,1]){const w=mesh(sph(0.22,8,6),coreM,body,s*(2.1*r),y-0.65,z+0.2,{sx:1,sy:0.7,sz:1.4,shadow:false});bulbs.push(w)}}
  // head
  const head=new THREE.Group();head.position.set(0,0.35,3.9);body.add(head);
  mesh(ell(1.3,1.1,1.5),mBody,head,0,0,0);mesh(ell(1.55,1.1,1.9),mArm,head,0,0.35,0.55,{rx:0.08});mesh(ell(1.3,0.28,1.2),mArm,head,0,1.2,0.5,{rx:0.25});
  const eyes=[];for(const s of [-1,1])for(const [x,y,z,r] of [[0.7,0.55,1.55,0.2],[1.05,0.7,1.05,0.17],[1.25,0.75,0.55,0.14],[0.45,1.05,1.0,0.12]])eyes.push(mesh(sph(r,10,8),eyeM,head,s*x,y,z,{shadow:false}));
  const mand=[];for(const s of [-1,1]){const gp=new THREE.Group();gp.position.set(s*0.55,-0.5,1.5);head.add(gp);gp.userData.s=s;mand.push(gp);
    mesh(curve([V(0,0,0),V(s*0.7,-0.3,0.9),V(s*0.5,-0.2,1.9),V(-s*0.2,0,2.6)],0.35,0.04),mArm,gp,0,0,0);
    for(let i=0;i<3;i++)mesh(cone(0.09,0.5,5),mArm,gp,s*(0.35+i*0.12),-0.2,0.8+i*0.5,{rz:s*1.2})}
  mesh(ell(0.6,0.18,0.9),HDR(3,0.5,0.4),head,0,-0.5,1.25,{shadow:false});
  for(const s of [-1,1]){mesh(curve([V(s*0.8,0.9,-0.1),V(s*1.8,1.9,-0.6),V(s*2.5,3.0,-0.1),V(s*2.2,4.2,0.9)],0.38,0.05),mArm,head,0,0,0);
    mesh(curve([V(s*0.4,1.2,0.0),V(s*0.9,2.5,-0.6),V(s*0.7,3.7,-1.3)],0.25,0.03),mArm,head,0,0,0)}
  // chest core with rib cage
  const core=mesh(sph(0.85,18,14),coreM,body,0,1.55,2.35,{shadow:false});
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2;mesh(curve([V(Math.cos(a)*1.1,1.3,2.35+Math.sin(a)*1.1),V(Math.cos(a)*1.15,2.2,2.35+Math.sin(a)*1.2),V(Math.cos(a)*0.4,2.9,2.35+Math.sin(a)*0.4)],0.14,0.04),mArm,body,0,0,0)}
  // tail
  const tail=[];let tp=new THREE.Group();tp.position.set(0,0.3,-6.9);body.add(tp);
  const tg=curve([V(0,0,0),V(0,0,-1.5)],0.8,0.55);
  for(let i=0;i<5;i++){mesh(tg,i%2?mArm:mBody,tp,0,0,0);mesh(cone(0.25,0.9,5),mArm,tp,0,0.5,-0.7,{rx:-0.5});const nx=new THREE.Group();nx.position.z=-1.5;tp.add(nx);tail.push(tp);tp=nx}
  tail.push(tp);mesh(ell(1.0,0.9,1.4),mArm,tp,0,0,-0.9);for(let i=0;i<8;i++){const a=i*0.785;mesh(cone(0.25,1.2,5),mArm,tp,Math.cos(a)*0.85,Math.sin(a)*0.85,-1.0,{rx:Math.PI/2*0,rz:a-Math.PI/2})}
  // 6 walking legs + 2 manual scythe arms
  const defs=[];
  for(const [hz,homeZ] of [[2.2,3.8],[0.0,0.6],[-2.4,-3.6]])for(const sx of [-1,1])defs.push({hip:V(sx*2.0,-0.8,hz),home:V(sx*6.4,0,homeZ),group:defs.length%2,bend:V(sx*0.35,1,0)});
  const legs=makeLegs(null,legRoot,defs,mBody,mArm,{key:'boss',L1:4.6,L2:5.8,r0:0.85,r1:0.5,r2:0.14,claw:2,stepDist:2.2,stepH:1.8,stepTime:0.55});
  const arms=[];
  for(const sx of [-1,1]){const a=new Leg({parent:legRoot,hip:V(sx*1.9,0.9,3.0),home:V(sx*3,0,6),L1:3.4,L2:4.4,upGeo:G('bossAu',()=>legSegGeo(3.4,0.6,0.42,'upper',{})),loGeo:G('bossAl',()=>legSegGeo(4.4,0.42,0.3,'lower',{claw:2.6})),mat:mArm,kneeGeo:G('bossAk',()=>sph(0.6,10,8)),kneeMat:mBody,group:2,bend:V(sx*0.8,1,-0.2),stepDist:99,stepH:0,stepTime:1});
    a.manual=true;a.sx=sx;arms.push(a);mesh(ell(1.0,0.9,1.1),mArm,body,sx*1.9,0.9,3.0)}
  const _t=new THREE.Vector3();
  const rig={root,legRoot,body,legs,arms,flash:fl,mats:[mBody,mArm,mFlesh],core,
    visible(v){root.visible=v;legRoot.visible=v;for(const l of legs)l.setVisible(v);for(const a of arms)a.setVisible(v)},
    reset(){for(const l of legs)l.reset();for(const a of arms)a.reset();fl.value=0;this.pose=null},
    update(e,dt,t,ground){
      const st=e.state,wk=(st===2||st===5)?clamp(e.stateT/e.windup,0,1):0,slam=st===3?clamp(e.stateT/0.3,0,1):0,dk=e.dk||0;
      const stomp=st===2?wk:0,sum=st===5?wk:0;
      root.position.set(e.pos.x,ground(e.pos.x,e.pos.z),e.pos.z);root.rotation.y=e.yaw;
      const spd=Math.hypot(e.vx,e.vz),sp=this.pose||{y:4.8,pitch:0,roll:0},jit=(wk>0.4||dk>0)?Math.sin(t*80)*0.08*(wk+dk):0;
      const rise=stomp*1.9-(st===3?(1-slam)*1.9:0)+(st===3?-0.7*Math.sin(slam*Math.PI):0);
      body.position.set(jit,lerp(5.0,1.3,smooth(0,1,dk))+rise*0.9+Math.sin(t*e.bobF)*0.12*Math.min(1,spd*0.5)-(st===4?0.3:0),0);
      body.rotation.set(sp.pitch-stomp*0.18+(st===3?0.2*(1-slam):0)+dk*0.1,Math.sin(t*0.6)*0.03+(sum>0?Math.sin(t*30)*0.02:0),sp.roll+dk*0.5*e.dsign);
      head.rotation.set(-stomp*0.35-sum*0.5+(st===3?0.35*slam:0)+Math.sin(t*1.1)*0.04+dk*0.35,Math.sin(t*0.7)*0.15*(1-wk),0);
      for(const m of mand){const s=m.userData.s;m.rotation.y=-s*(0.15+0.18*Math.sin(t*3.2+s)*0.5+wk*0.5+(st===5?Math.sin(t*25)*0.12:0));m.rotation.x=0.1+wk*0.2}
      for(let i=0;i<tail.length;i++)tail[i].rotation.set(Math.sin(t*1.4-i*0.6)*0.06+dk*0.12,Math.sin(t*1.1-i*0.8)*0.22+(st===3?0.15*slam:0),0);
      abd.scale.setScalar(1+Math.sin(t*1.8)*0.02+sum*0.08);
      root.updateMatrixWorld(true);
      for(const l of legs)l.update(body,e.vx,e.vz,dt,ground,legs,1+dk*0.6);
      // arms: idle forward guard -> raised overhead on windup -> crash down on slam
      for(const a of arms){const sx=a.sx;let lx,ly,lz;
        if(st===2||st===3){const up=st===2?smooth(0,1,wk):1-smooth(0,1,slam);lx=sx*(3+0.5*up);ly=lerp(0.2,9.5,up);lz=lerp(7,3.2,up)}
        else if(st===5){lx=sx*(3.6+Math.sin(t*20)*0.2);ly=7+Math.sin(t*14+sx)*0.4;lz=5}
        else if(dk>0){lx=sx*(4+dk*3);ly=lerp(2.5,0.3,dk);lz=lerp(6,3,dk)}
        else{lx=sx*(3+Math.sin(t*1.6+sx)*0.4);ly=2.4+Math.sin(t*1.9+sx*2)*0.5+Math.min(1,spd)*Math.sin(t*e.bobF*1.2+sx)*0.4;lz=7+Math.sin(t*1.3+sx)*0.5}
        _t.set(lx,ly,lz).applyMatrix4(body.matrixWorld);a.foot.copy(_t);a.ready=true;
        a.hipW.copy(a.hip).applyMatrix4(body.matrixWorld);a.solve(body,a.hipW)}
      this.pose=bodyPose(this,e,legs,ground,5.0,t,0.3);
      const pu=0.6+0.4*Math.sin(t*(2+wk*10)+1),hp=e.hp/e.maxHp,rage=hp<0.5?1:0;
      coreM.color.setRGB(3.5*pu+fl.value*2+wk*1.5+rage*1.5,0.5+wk*1.2+fl.value*2+rage*0.2,1.2*pu+fl.value*2);
      core.scale.setScalar(1+Math.sin(t*(3+rage*4))*0.08+fl.value*0.15);
      eyeM.color.setRGB(3.5+rage*1.5,1.2-rage*0.9+wk,0.3+wk);
      bulbM.color.setRGB(0.8+Math.sin(t*2)*0.4+wk*2,0.3+wk*0.5,2.8-wk*1.6);
      for(let i=0;i<bulbs.length;i++){const b=bulbs[i];b.scale.setScalar(0.85+0.3*Math.sin(t*3-i*0.6)*(0.5+wk))}
    }};
  return rig;
}
