// Hero exo-suit rig: hard-surface procedural model + procedural pose (IK legs/arms).
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {glowTexture} from './materials.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const TH=.52,SH=.52,UA=.5,FA=.5;       // thigh, shin, upper arm, forearm lengths
export const HIP_H=.96;

const _g={};
function rbGeo(w,h,d,r){const k=[w,h,d,r].map(v=>v.toFixed(3)).join();return _g[k]||(_g[k]=new RoundedBoxGeometry(w,h,d,3,Math.min(r,Math.min(w,h,d)/2-.001)))}
function add(p,geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);p.add(m);return m}
function rb(p,w,h,d,r,mat,x,y,z,rx,ry,rz){return add(p,rbGeo(w,h,d,r),mat,x,y,z,rx,ry,rz)}
function cyl(p,rt,rb_,h,mat,x,y,z,rx,ry,rz,seg=16){return add(p,new THREE.CylinderGeometry(rt,rb_,h,seg),mat,x,y,z,rx,ry,rz)}
function sph(p,r,mat,x,y,z,sx=1,sy=1,sz=1){const m=add(p,new THREE.SphereGeometry(r,20,14),mat,x,y,z);m.scale.set(sx,sy,sz);return m}
function tor(p,R,t,mat,x,y,z,rx,ry,rz){return add(p,new THREE.TorusGeometry(R,t,8,24),mat,x,y,z,rx,ry,rz)}
function bevExtrude(pts,depth,bev,mat,p,x,y,z){
  const s=new THREE.Shape();pts.forEach(([a,b],i)=>i?s.lineTo(a,b):s.moveTo(a,b));s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:bev,bevelSize:bev,bevelSegments:3,curveSegments:6});g.translate(0,0,-depth/2);g.computeVertexNormals();
  // box-project UVs for the plate texture
  const pos=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)*1.4+pos.getZ(i)*.3,pos.getY(i)*1.4);
  return add(p,g,mat,x,y,z);
}
function lathe(prof,mat,p,x,y,z,rx=0,ry=0,rz=0,seg=20){return add(p,new THREE.LatheGeometry(prof.map(([r,h])=>new THREE.Vector2(r,h)),seg),mat,x,y,z,rx,ry,rz)}

function tube(p,pts,r,mat){const c=new THREE.CatmullRomCurve3(pts.map(a=>V(...a)));return add(p,new THREE.TubeGeometry(c,24,r,6,false),mat,0,0,0)}

function ik2(S,T,a,b,pole,E,Tout){
  const d=Tout.copy(T).sub(S);let L=d.length();const mx=(a+b)*.998,mn=Math.abs(a-b)+.02;L=Math.min(Math.max(L,mn),mx);d.normalize();
  Tout.copy(S).addScaledVector(d,L);
  const x=(a*a-b*b+L*L)/(2*L),h=Math.sqrt(Math.max(a*a-x*x,0));
  const pr=V().copy(pole).addScaledVector(d,-pole.dot(d));if(pr.lengthSq()<1e-6)pr.set(0,0,1);pr.normalize();
  E.copy(S).addScaledVector(d,x).addScaledVector(pr,h);
}
const _x=V(),_y=V(),_z=V(),_m=new THREE.Matrix4();
function bone(g,from,to,ref){ // group hangs along -Y; orient so its end reaches `to`
  _y.copy(from).sub(to).normalize();_z.copy(ref).addScaledVector(_y,-ref.dot(_y));if(_z.lengthSq()<1e-6)_z.set(0,0,1);_z.normalize();_x.crossVectors(_y,_z);
  _m.makeBasis(_x,_y,_z);g.quaternion.setFromRotationMatrix(_m);g.position.copy(from);
}

function buildLeg(M,s){
  const th=new THREE.Group(),sh=new THREE.Group(),ft=new THREE.Group();
  // thigh (hangs -Y)
  sph(th,.15,M.dark,0,0,0);
  cyl(th,.125,.095,TH,M.dark,0,-TH/2,0);
  rb(th,.23,.34,.08,.025,M.armor,0,-.25,.115,-.08);
  rb(th,.06,.3,.2,.02,M.accent,s*.125,-.24,0);
  rb(th,.2,.26,.07,.02,M.armor,0,-.22,-.115,.06);
  cyl(th,.025,.025,.34,M.steel,s*-.05,-.27,-.13);
  tor(th,.115,.012,M.glow,0,-.44,0,Math.PI/2);
  // shin
  sph(sh,.115,M.dark,0,0,0);
  rb(sh,.21,.17,.11,.04,M.armor,0,.01,.125,-.15);                 // kneepad
  cyl(sh,.095,.07,SH,M.dark,0,-SH/2,0);
  rb(sh,.21,.36,.13,.05,M.armor,0,-.2,-.085,.07);                // calf
  rb(sh,.16,.4,.05,.02,M.dark,0,-.27,.09,-.06);                  // shin guard
  rb(sh,.04,.34,.06,.015,M.accent,0,-.27,.12,-.06);
  rb(sh,.1,.18,.05,.02,M.glow,0,-.17,-.155,.07);                 // vent glow
  tor(sh,.088,.011,M.glow,0,-.45,0,Math.PI/2);
  // foot (origin = ankle)
  sph(ft,.08,M.dark,0,0,0);
  rb(ft,.2,.1,.3,.035,M.dark,0,-.045,.06);
  rb(ft,.19,.07,.17,.03,M.armor,0,-.025,.2,.08);
  rb(ft,.18,.12,.1,.03,M.armor,0,-.02,-.09);
  rb(ft,.23,.035,.42,.015,M.black,0,-.09,.07);
  rb(ft,.05,.05,.14,.015,M.accent,s*.07,-.01,.1);
  return {th,sh,ft};
}
function buildArm(M,s){
  const ua=new THREE.Group(),fa=new THREE.Group();
  sph(ua,.115,M.dark,0,0,0);
  cyl(ua,.085,.07,UA,M.dark,0,-UA/2,0);
  rb(ua,.16,.28,.16,.05,M.armor,0,-.2,0);
  tor(ua,.085,.012,M.glow,0,-.37,0,Math.PI/2);
  cyl(ua,.03,.03,.3,M.black,s*-.02,-.22,-.1,0,0,0,8);
  sph(fa,.08,M.dark,0,0,0);
  cyl(fa,.075,.06,FA,M.dark,0,-FA/2,0);
  rb(fa,.18,.3,.18,.05,M.armor,0,-.27,0,-.04);
  rb(fa,.05,.26,.2,.02,M.accent,s*.09,-.27,0);
  rb(fa,.12,.14,.14,.04,M.dark,0,-FA-.02,0);                       // gauntlet
  rb(fa,.14,.07,.12,.03,M.armor,0,-FA+.05,.01);
  return {ua,fa};
}

export function buildHero(M){
  const H={};
  const root=new THREE.Group();H.root=root;
  const hips=new THREE.Group();root.add(hips);H.hips=hips;
  // pelvis
  rb(hips,.54,.24,.4,.07,M.dark,0,0,0);
  rb(hips,.12,.24,.34,.04,M.armor,.31,-.03,0,0,0,-.18);rb(hips,.12,.24,.34,.04,M.armor,-.31,-.03,0,0,0,.18);
  rb(hips,.26,.3,.1,.04,M.armor,0,-.13,.21,.18);
  rb(hips,.04,.26,.06,.015,M.accent,0,-.13,.27,.18);
  rb(hips,.4,.2,.1,.04,M.armor,0,-.02,-.22,-.12);
  rb(hips,.5,.035,.02,.01,M.glow,0,.09,.2);
  tor(hips,.3,.025,M.black,0,.1,0,Math.PI/2);
  // legs
  H.legs=[-1,1].map(s=>{const l=buildLeg(M,s);root.add(l.th,l.sh,l.ft);return l});
  // torso
  const torso=new THREE.Group();torso.position.set(0,.12,0);hips.add(torso);H.torso=torso;
  for(let i=0;i<4;i++)tor(torso,.17+(i%2)*.012,.03,M.black,0,.04+i*.075,0,Math.PI/2);
  cyl(torso,.16,.17,.34,M.dark,0,.17,0);
  // chest shell
  bevExtrude([[-.26,0],[.26,0],[.42,.66],[.2,.8],[-.2,.8],[-.42,.66]],.38,.05,M.armor,torso,0,.3,0);
  bevExtrude([[-.2,0],[.2,0],[.3,.4],[.12,.5],[-.12,.5],[-.3,.4]],.1,.035,M.armor,torso,0,.38,.24);
  rb(torso,.06,.5,.04,.015,M.accent,0,.62,.31);
  rb(torso,.5,.05,.06,.02,M.dark,0,.5,.27,.2);
  // reactor core
  tor(torso,.135,.03,M.dark,0,.67,.3,0,0,0);
  sph(torso,.085,M.glow,0,.67,.3,1,1,.8);
  tor(torso,.105,.01,M.glow,0,.67,.31);
  for(const s of [-1,1]){rb(torso,.07,.24,.04,.015,M.glow,s*.2,.6,.285,.2,0,s*.1);rb(torso,.14,.3,.05,.02,M.dark,s*.2,.6,.275,.2,0,s*.1)}
  H.core=[...torso.children].filter(c=>c.material===M.glow);
  // neck, collar
  cyl(torso,.1,.12,.14,M.dark,0,1.08,0);
  rb(torso,.46,.1,.36,.045,M.armor,0,1.02,0);
  // head
  const head=new THREE.Group();head.position.set(0,1.2,.02);torso.add(head);H.head=head;
  const helm=sph(head,.2,M.armor,0,.02,0,1,1.06,1.14);
  rb(head,.34,.2,.06,.03,M.dark,0,-.07,.19,.15);
  add(head,new THREE.SphereGeometry(.208,20,10,Math.PI/2-.95,1.9,Math.PI*.3,Math.PI*.24),M.visor,0,.02,0).scale.set(1,1.06,1.14);
  rb(head,.03,.07,.06,.01,M.accent,.0,.2,.1,.4);
  for(const s of [-1,1]){cyl(head,.07,.07,.07,M.dark,s*.205,0,-.01,0,0,Math.PI/2);cyl(head,.04,.04,.075,M.glow,s*.205,0,-.01,0,0,Math.PI/2,12);
    rb(head,.04,.1,.2,.015,M.accent,s*.17,.1,-.04,0,0,s*-.3)}
  cyl(head,.006,.006,.3,M.steel,.17,.3,-.12,0,0,-.1,6);sph(head,.016,M.glowOrange,.18,.45,-.13);
  rb(head,.2,.08,.12,.03,M.dark,0,.02,-.18);
  // hair (ponytail chain)
  const tail=new THREE.Group();tail.position.set(0,.06,-.2);head.add(tail);rb(tail,.1,.07,.07,.03,M.accent,0,0,0);
  H.hair=[];let par=tail;for(let i=0;i<5;i++){const g=new THREE.Group();g.position.set(0,i?-.14*(1-i*.08):-.02,i?0:-.02);par.add(g);
    const m=sph(g,.07-i*.009,M.hair,0,-.07,0,1,1.7,1);m.castShadow=true;H.hair.push(g);par=g}
  // backpack
  const bp=new THREE.Group();bp.position.set(0,.62,-.34);torso.add(bp);
  rb(bp,.56,.62,.24,.06,M.dark,0,0,0);
  rb(bp,.48,.5,.06,.03,M.armor,0,.03,-.14);
  rb(bp,.2,.38,.04,.015,M.glow,0,.06,-.175);
  for(let i=0;i<5;i++)rb(bp,.4,.025,.05,.01,M.black,0,.3-i*.065,-.18);
  for(const s of [-1,1]){
    cyl(bp,.095,.095,.55,M.armor,s*.33,.0,-.04);tor(bp,.097,.015,M.glow,s*.33,.12,-.04,Math.PI/2);tor(bp,.097,.015,M.accent,s*.33,-.14,-.04,Math.PI/2);
    sph(bp,.095,M.dark,s*.33,.28,-.04);
    // nozzle (lathe), pointing down/back
    const n=lathe([[.05,0],[.075,.06],[.085,.16],[.1,.24],[.09,.25],[.065,.17],[.05,.06],[.04,0]],M.steel,bp,s*.17,-.3,-.16,-.35);
    sph(bp,.05,M.glow,s*.17,-.5,-.23,1,.5,1).rotation.x=-.35;
  }
  rb(bp,.3,.1,.1,.03,M.accent,0,.34,-.08);
  cyl(bp,.01,.01,.5,M.steel,.24,.55,-.1,0,0,0,6);sph(bp,.02,M.glow,.24,.8,-.1);
  // jet flames (additive)
  H.jets=[];
  const jetMat=new THREE.MeshBasicMaterial({color:0x58e8ff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false});
  const jetMat2=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  for(const s of [-1,1]){const j=new THREE.Group();j.position.set(s*.17,-.52,-.24);j.rotation.x=-.35;bp.add(j);
    const c1=new THREE.Mesh(new THREE.ConeGeometry(.09,1,12,1,true),jetMat);c1.position.y=-.5;c1.rotation.x=Math.PI;j.add(c1);
    const c2=new THREE.Mesh(new THREE.ConeGeometry(.045,.7,10,1,true),jetMat2);c2.position.y=-.35;c2.rotation.x=Math.PI;j.add(c2);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0x58e8ff,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));sp.scale.setScalar(.7);j.add(sp);
    j.userData={c1,c2,sp};H.jets.push(j)}
  // cables
  tube(torso,[[.3,.7,-.28],[.45,.9,-.12],[.5,.95,.02],[.44,.7,.12]],.018,M.rubber);
  tube(torso,[[-.3,.7,-.28],[-.45,.9,-.12],[-.5,.95,.02],[-.44,.7,.12]],.018,M.rubber);
  tube(torso,[[.12,.4,-.2],[.25,.2,-.25],[.3,.0,-.1],[.26,-.1,.1]],.02,M.rubber);
  tube(torso,[[-.12,.4,-.2],[-.25,.2,-.25],[-.3,.0,-.1],[-.26,-.1,.1]],.02,M.rubber);
  tube(torso,[[.06,.4,-.2],[.1,.25,-.27],[.0,.1,-.2],[-.1,.1,-.2]],.012,M.glow);
  // shoulders
  H.shoulder=[-1,1].map(s=>{const g=new THREE.Group();g.position.set(s*.5,.76,0);torso.add(g);
    const pad=new THREE.Group();pad.rotation.z=s*-.28;g.add(pad);
    add(pad,new THREE.SphereGeometry(.25,24,12,0,Math.PI*2,0,Math.PI*.55),M.armor,s*.04,0,0).scale.set(1,.72,1.12);
    tor(pad,.245,.022,M.dark,s*.04,-.005,0,Math.PI/2).scale.set(1,1.12,1);
    rb(pad,.07,.07,.32,.02,M.accent,s*.04,.17,0);
    rb(pad,.16,.03,.22,.01,M.dark,s*.19,.07,0,0,0,s*-.3);
    cyl(g,.12,.12,.1,M.dark,s*-.04,-.1,0,0,0,Math.PI/2);
    return g});
  // arms (placed by IK)
  H.arms=[-1,1].map(s=>{const a=buildArm(M,s);torso.add(a.ua,a.fa);return a});
  // weapon mount
  H.weaponMount=new THREE.Group();torso.add(H.weaponMount);
  // contact shadow blob
  const bc=document.createElement('canvas');bc.width=bc.height=64;const bg=bc.getContext('2d');const gr=bg.createRadialGradient(32,32,2,32,32,32);gr.addColorStop(0,'rgba(0,0,0,.65)');gr.addColorStop(.6,'rgba(0,0,0,.3)');gr.addColorStop(1,'rgba(0,0,0,0)');bg.fillStyle=gr;bg.fillRect(0,0,64,64);
  const blob=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(bc),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  blob.rotation.x=-Math.PI/2;blob.renderOrder=1;H.blob=blob;
  root.traverse(o=>{if(o.isMesh)o.castShadow=true});
  return H;
}

// ---- pose ----
const _S=V(),_T=V(),_E=V(),_pole=V(),_zf=V(0,0,1),_tmp=V(),_ref=V();
export function poseLegs(H,st){ // st: {phase,stride,lift,hipY,footDY:[l,r],dashLean,air}
  const hp=H.hips.position;
  for(let i=0;i<2;i++){
    const s=i?1:-1,l=H.legs[i];
    const ph=st.phase+(i?Math.PI:0);
    let fz=Math.sin(ph)*st.stride,fy=Math.max(0,Math.cos(ph))*st.lift*(st.stride>.02?1:0);
    if(st.dash>0){fz=-.55-.1*i;fy=.12+.06*i}
    _S.set(s*.2,hp.y-.05,hp.z);
    _T.set(s*.2+s*st.spread,.1+fy+st.footDY[i],fz);
    _pole.set(s*.12,0,1);
    ik2(_S,_T,TH,SH,_pole,_E,_tmp);
    _ref.set(0,0,1);
    bone(l.th,_S,_E,_ref);bone(l.sh,_E,_tmp,_ref);
    l.ft.position.copy(_tmp);l.ft.rotation.set(-(fz*.0)+(st.dash>0?.5:-Math.cos(ph)*st.stride*.9*(st.stride>.02?1:0)*.5),0,0);
    if(st.dash>0)l.ft.rotation.x=.55;
  }
}
export function poseArms(H,gripR,gripL){
  const targets=[gripL,gripR];
  for(let i=0;i<2;i++){
    const s=i?1:-1,a=H.arms[i],sh=H.shoulder[i].position;
    _S.copy(sh).add(_tmp.set(s*-.02,-.02,0));_T.copy(targets[i]);_pole.set(s*1,-.6,-.4);
    ik2(_S,_T,UA,FA,_pole,_E,_tmp);
    _ref.set(0,0,1);
    bone(a.ua,_S,_E,_ref);bone(a.fa,_E,_tmp,_ref);
  }
}
