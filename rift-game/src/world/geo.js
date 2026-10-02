// Procedural prop geometry builders. Every geometry carries attributes: position, normal, uv, color, aGlow, aSway.
import * as THREE from 'three';
import {noise3,fbm,rng,lerp,clamp} from './noise.js';

export class GB{
  constructor(){this.p=[];this.n=[];this.uv=[];this.c=[];this.g=[];this.s=[];this.i=[]}
  get count(){return this.p.length/3}
  vert(px,py,pz,nx,ny,nz,u,v,r,g,b,glow=0,sway=0){this.p.push(px,py,pz);this.n.push(nx,ny,nz);this.uv.push(u,v);this.c.push(r,g,b);this.g.push(glow);this.s.push(sway);return this.p.length/3-1}
  tri(a,b,c){this.i.push(a,b,c)}
  // merge a three geometry. fn(pos,normal,uv)->{c:[r,g,b],g:glow,s:sway}
  addGeo(geo,mat,fn){
    const pos=geo.attributes.position,nor=geo.attributes.normal,uv=geo.attributes.uv,idx=geo.index;
    const nm=new THREE.Matrix3().getNormalMatrix(mat),v=new THREE.Vector3(),n=new THREE.Vector3(),base=this.count;
    for(let k=0;k<pos.count;k++){v.fromBufferAttribute(pos,k).applyMatrix4(mat);n.fromBufferAttribute(nor,k).applyMatrix3(nm).normalize();
      const o=fn(v,n,uv?[uv.getX(k),uv.getY(k)]:[0,0]);
      this.vert(v.x,v.y,v.z,n.x,n.y,n.z,uv?uv.getX(k):0,uv?uv.getY(k):0,o.c[0],o.c[1],o.c[2],o.g||0,o.s||0)}
    if(idx)for(let k=0;k<idx.count;k++)this.i.push(base+idx.getX(k));else for(let k=0;k<pos.count;k++)this.i.push(base+k)}
  build(){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.setAttribute('aGlow',new THREE.Float32BufferAttribute(this.g,1));g.setAttribute('aSway',new THREE.Float32BufferAttribute(this.s,1));
    g.setIndex(this.count>65535?new THREE.Uint32BufferAttribute(this.i,1):new THREE.Uint16BufferAttribute(this.i,1));
    g.computeBoundingSphere();g.computeBoundingBox();return g}
}
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];

// ---- frond: curved, folded leaf card strip (texture supplies leaflets + alpha)
export function addFrond(gb,o,yaw,pitch,len,wid,droop,c0,c1,g0,g1,sw=1,rows=7){
  const dx=Math.cos(yaw),dz=Math.sin(yaw),step=len/rows;let px=o.x,py=o.y,pz=o.z,ang=pitch;const ring=[];
  for(let k=0;k<=rows;k++){const t=k/rows;
    const fx=dx*Math.cos(ang),fy=Math.sin(ang),fz=dz*Math.cos(ang);
    const sx=-dz,sz=dx;// side
    // normal = side x forward
    let nx=0*fz-sz*fy,ny=sz*fx-sx*fz,nz=sx*fy-0*fx;const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
    const w=wid*(1-.12*t)*.5,col=mixc(c0,c1,t),gl=g0+(g1-g0)*t*t,s=sw*Math.pow(t,1.4);
    const fold=wid*.07;
    const L=gb.vert(px-sx*w+nx*0,py-0+ny*0,pz-sz*w,nx-sx*.4,ny,nz-sz*.4,0,t,col[0],col[1],col[2],gl,s);
    const M=gb.vert(px+nx*fold,py+ny*fold,pz+nz*fold,nx,ny,nz,.5,t,col[0],col[1],col[2],gl,s);
    const Rr=gb.vert(px+sx*w,py,pz+sz*w,nx+sx*.4,ny,nz+sz*.4,1,t,col[0],col[1],col[2],gl,s);
    ring.push([L,M,Rr]);
    px+=fx*step;py+=fy*step;pz+=fz*step;ang-=droop/rows}
  for(let k=0;k<rows;k++){const a=ring[k],b=ring[k+1];gb.tri(a[0],a[1],b[0]);gb.tri(a[1],b[1],b[0]);gb.tri(a[1],a[2],b[1]);gb.tri(a[2],b[2],b[1])}
}
// ---- tapered tube along points
export function addTube(gb,pts,radii,sides,colFn,uvS=1,glowFn=null){
  const rings=[];let acc=0;
  for(let k=0;k<pts.length;k++){
    const a=pts[Math.max(0,k-1)],b=pts[Math.min(pts.length-1,k+1)];const tg=b.clone().sub(a).normalize();
    let u=new THREE.Vector3().crossVectors(tg,V(0,1,0));if(u.lengthSq()<1e-4)u=V(1,0,0);u.normalize();const w=new THREE.Vector3().crossVectors(tg,u).normalize();
    if(k>0)acc+=pts[k].distanceTo(pts[k-1]);const col=colFn(k/(pts.length-1)),gl=glowFn?glowFn(k/(pts.length-1)):0;
    const ids=[];for(let s=0;s<=sides;s++){const th=s/sides*Math.PI*2,cx=Math.cos(th),sx=Math.sin(th);
      const nx=u.x*cx+w.x*sx,ny=u.y*cx+w.y*sx,nz=u.z*cx+w.z*sx,r=radii[k];
      ids.push(gb.vert(pts[k].x+nx*r,pts[k].y+ny*r,pts[k].z+nz*r,nx,ny,nz,s/sides*uvS*2,acc*.5*uvS,col[0],col[1],col[2],gl,0))}
    rings.push(ids)}
  for(let k=0;k<rings.length-1;k++)for(let s=0;s<sides;s++){const a=rings[k][s],b=rings[k][s+1],c=rings[k+1][s],d=rings[k+1][s+1];gb.tri(a,b,c);gb.tri(b,d,c)}
}
function curve(R,n,h,lean,wob,ox=0,oz=0,ang=0){const pts=[];const la=ang||R()*6.28;for(let k=0;k<=n;k++){const t=k/n;
  pts.push(V(ox+Math.cos(la)*lean*t*t+Math.sin(t*5+R()*.3)*wob*t,t*h,oz+Math.sin(la)*lean*t*t+Math.cos(t*4.3)*wob*t))}return pts}
function roots(gb,R,r,n,col){for(let k=0;k<n;k++){const a=k/n*6.28+R()*.5,len=.7+R()*.6;
  const m=new THREE.Matrix4().compose(V(Math.cos(a)*r*.6,len*.15,Math.sin(a)*r*.6),new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a)*.9,0,-Math.cos(a)*.9)),V(1,1,1));
  const g=new THREE.CylinderGeometry(.04,r*.7,len,5,1,true);g.translate(0,len*.5-.2,0);
  gb.addGeo(g,m,(p,nn,uv)=>({c:col,g:0}))}}

// ===== TREES =====
const TREE_PAL=[
  {b:[.02,.15,.12],t:[.1,.7,.62],tg:1.4,pod:[.3,1,.9]},   // teal
  {b:[.1,.03,.14],t:[.62,.2,.78],tg:1.5,pod:[1,.5,1]},    // violet
  {b:[.03,.1,.2],t:[.18,.5,.95],tg:1.5,pod:[.5,.9,1]}];   // blue
export function buildTree(variant,seed){
  const R=rng(seed*131+variant*17+5),trunk=new GB(),can=new GB();
  const P=TREE_PAL[variant];const bark=[.7,.62,.75],barkD=[.45,.4,.5];
  if(variant===0){
    const H=5+R()*3,lean=.6+R()*1.6,r0=.3+R()*.1,pts=curve(R,9,H,lean,.25);
    const rad=pts.map((_,k)=>lerp(r0,.12,Math.pow(k/9,.8)));
    addTube(trunk,pts,rad,7,t=>mixc(barkD,bark,t),1);roots(trunk,R,r0,5,barkD);
    const top=pts[pts.length-1];const n=13;
    for(let k=0;k<n;k++){const yaw=k/n*6.283+R()*.3,pit=lerp(1.0,-.1,k%3/2)+R()*.15,len=3+R()*1.8;
      addFrond(can,top.clone().add(V(0,-.05*(k%3),0)),yaw,pit,len,1.2+R()*.4,1.6+R()*1.1,P.b,P.t,.0,P.tg,1,8)}
    for(let k=0;k<5;k++)addFrond(can,top,R()*6.28,1.2,1.7,.9,1.0,P.b,P.t,.1,P.tg,1,6);
    for(let k=0;k<6;k++){const a=R()*6.28,d=.4+R()*.5;const hh=.5+R()*.9;
      const g=new THREE.SphereGeometry(.13,6,5);const m=new THREE.Matrix4().makeTranslation(top.x+Math.cos(a)*d,top.y-.5-hh*.6,top.z+Math.sin(a)*d);
      can.addGeo(g,m,()=>({c:P.pod,g:2.2,s:.5}))}
  }else if(variant===1){
    const H=2.6+R()*1.5,r0=.5+R()*.2,pts=curve(R,6,H,.4,.2);
    addTube(trunk,pts,pts.map((_,k)=>lerp(r0,.3,k/6)),8,t=>mixc(barkD,bark,t),1);roots(trunk,R,r0,6,barkD);
    const top=pts[pts.length-1],nb=3+(R()*2|0);
    for(let b=0;b<nb;b++){const a=b/nb*6.283+R()*.5,L=1.7+R()*1.2,up=1.3+R()*1.0;
      const bp=[];for(let k=0;k<=5;k++){const t=k/5;bp.push(V(top.x+Math.cos(a)*L*t,top.y+up*Math.sin(t*1.5)*.9+t*.5,top.z+Math.sin(a)*L*t))}
      addTube(trunk,bp,bp.map((_,k)=>lerp(.24,.07,k/5)),6,t=>mixc(barkD,bark,.7),1);
      const e=bp[5];const nf=8;
      for(let k=0;k<nf;k++)addFrond(can,e,k/nf*6.283+R()*.4,lerp(.5,-.25,(k%2)),1.8+R()*.8,1+R()*.3,1.4+R()*.8,P.b,P.t,.1,P.tg,1,6);
      const g=new THREE.SphereGeometry(.2,7,6);can.addGeo(g,new THREE.Matrix4().makeTranslation(e.x,e.y+.25,e.z),()=>({c:P.pod,g:2.4,s:.2}))}
  }else{
    const H=6+R()*3,pts=curve(R,10,H,.5,.12);
    addTube(trunk,pts,pts.map((_,k)=>lerp(.24,.04,Math.pow(k/10,.9))),6,t=>mixc(barkD,bark,t),1);roots(trunk,R,.24,4,barkD);
    const lv=9;
    for(let l=0;l<lv;l++){const t=lerp(.3,.97,l/(lv-1)),y=H*t,p=pts[Math.round(t*10)];
      const n=Math.max(3,6-(l/2|0)),len=lerp(2.4,.5,l/(lv-1));
      for(let k=0;k<n;k++)addFrond(can,V(p.x,y,p.z),k/n*6.283+l*1.1+R()*.2,lerp(.15,-.15,R()),len,.55+len*.18,1.3+R()*.5,P.b,P.t,.1,P.tg*1.1,1,5)}
    const top=pts[10];can.addGeo(new THREE.SphereGeometry(.22,7,6),new THREE.Matrix4().makeTranslation(top.x,top.y+.1,top.z),()=>({c:[.9,1,1],g:3,s:0}));
  }
  return {trunk:trunk.build(),canopy:can.build(),pal:P}}

// ===== FERNS / GRASS / BULBS =====
export function buildFern(seed){
  const R=rng(seed*7+1),gb=new GB();const n=9;
  for(let k=0;k<n;k++){const yaw=k/n*6.283+R()*.5,pit=lerp(1.0,.15,R()),len=.8+R()*.7;
    addFrond(gb,V(0,.02,0),yaw,pit,len,.38+R()*.12,1.4+R()*.8,[.02,.1,.07],[.14,.62,.45],.05,.5,1,6)}
  return gb.build()}
export function buildBulbPlant(seed){
  const R=rng(seed*13+9),gb=new GB();const n=3;
  for(let k=0;k<n;k++){const a=R()*6.28,L=.3+R()*.5,H=.9+R()*1.1;
    const pts=[];for(let j=0;j<=5;j++){const t=j/5;pts.push(V(Math.cos(a)*L*t*t,t*H,Math.sin(a)*L*t*t))}
    const tube=new GB();addTube(tube,pts,pts.map((_,j)=>lerp(.035,.012,j/5)),4,t=>[.04,.18,.14],1);
    // sway attr
    const g=tube.build();gb.addGeo(g,new THREE.Matrix4(),(p,nn)=>({c:[.04,.2,.15],g:.0,s:Math.pow(p.y/H,1.5)*.6}));
    const e=pts[5],bulb=new THREE.SphereGeometry(.09+R()*.05,7,6);bulb.scale(1,1.3,1);
    const hue=R();const col=hue<.5?[.3,1,.9]:hue<.8?[1,.5,.9]:[1,.85,.4];
    gb.addGeo(bulb,new THREE.Matrix4().makeTranslation(e.x,e.y,e.z),()=>({c:col,g:2.6,s:.7}));
    for(let j=0;j<4;j++)addFrond(gb,V(pts[2].x,pts[2].y,pts[2].z),R()*6.28,.5,.35,.14,1,[.03,.12,.1],[.1,.5,.4],0,.3,.8,3)}
  return gb.build()}
export function buildGrassTuft(seed){
  const R=rng(seed*29+3),gb=new GB();const n=8;
  for(let b=0;b<n;b++){const a=R()*6.283,off=R()*.22,bx=Math.cos(a)*off,bz=Math.sin(a)*off,H=.35+R()*.5,w=.045+R()*.03,yaw=R()*6.283,lean=.15+R()*.45;
    const cx=Math.cos(yaw),cz=Math.sin(yaw);const ids=[];const rows=3;
    const c0=[.015,.07,.06],c1=[.1+R()*.15,.55+R()*.2,.4+R()*.2];
    for(let k=0;k<=rows;k++){const t=k/rows,hx=bx+cx*lean*t*t*H,hz=bz+cz*lean*t*t*H,hy=t*H*(1-.15*t),ww=w*(1-t*t*.95);
      const col=mixc(c0,c1,Math.pow(t,.8)),gl=.1+t*.5,s=t*t;
      ids.push([gb.vert(hx-cz*ww,hy,hz+cx*ww,0,.6,0,0,t,col[0],col[1],col[2],gl,s),gb.vert(hx+cz*ww,hy,hz-cx*ww,0,.6,0,1,t,col[0],col[1],col[2],gl,s)])}
    for(let k=0;k<rows;k++){const a0=ids[k],b0=ids[k+1];gb.tri(a0[0],b0[0],a0[1]);gb.tri(a0[1],b0[0],b0[1])}}
  return gb.build()}

// ===== MUSHROOMS =====
const MUSH_PAL=[{cap:[.1,.5,.95],rim:[.4,1,1],spot:[.6,1,1],stem:[.55,.5,.7]},{cap:[.75,.1,.6],rim:[1,.45,.8],spot:[1,.8,1],stem:[.6,.45,.6]},{cap:[.95,.4,.08],rim:[1,.8,.3],spot:[1,.95,.5],stem:[.7,.55,.45]}];
export function buildMushroom(variant,seed){
  const R=rng(seed*53+variant*7+2),gb=new GB(),P=MUSH_PAL[variant];
  const sh=1.5+R()*.5,sr=.16+R()*.04,capR=1.1+R()*.35,capH=capR*(.5+R()*.2);
  const sp=[];for(let k=0;k<=8;k++){const t=k/8;sp.push(new THREE.Vector2(sr*(1+.9*Math.pow(1-t,3))*(1+.15*Math.sin(t*6)),t*sh))}
  gb.addGeo(new THREE.LatheGeometry(sp,10),new THREE.Matrix4(),(p,n)=>({c:mixc([.35,.3,.45],P.stem,p.y/sh),g:.15,s:0}));
  const cp=[new THREE.Vector2(sr*.9,sh-.05)];
  cp.push(new THREE.Vector2(capR*.35,sh-.03),new THREE.Vector2(capR*.75,sh+capH*.02),new THREE.Vector2(capR,sh+capH*.16));
  for(let k=1;k<=8;k++){const a=k/8*Math.PI*.5;cp.push(new THREE.Vector2(capR*Math.cos(a)*.98,sh+capH*.16+capH*.84*Math.sin(a)))}
  cp[cp.length-1].x=.001;
  gb.addGeo(new THREE.LatheGeometry(cp,16),new THREE.Matrix4(),(p,n)=>{
    const under=n.y<-.4,rim=Math.hypot(p.x,p.z)/capR;const top=clamp((p.y-sh)/capH,0,1);
    if(under)return{c:mixc([.1,.04,.12],P.rim,Math.min(1,rim*rim)),g:1.1*rim,s:0};
    return{c:mixc(P.rim,P.cap,Math.min(1,top*2.2)),g:.25+.5*(1-top),s:0}});
  const ns=7+(R()*5|0);
  for(let k=0;k<ns;k++){const a=R()*6.28,d=R()*.8,rr=capR*d,hh=sh+capH*(.16+.84*Math.sqrt(Math.max(0,1-d*d)))*1.0;
    const g=new THREE.SphereGeometry(.07+R()*.1,6,5);g.scale(1,.45,1);
    const m=new THREE.Matrix4().makeTranslation(Math.cos(a)*rr,hh,Math.sin(a)*rr);
    gb.addGeo(g,m,()=>({c:P.spot,g:2.6,s:0}))}
  return {geo:gb.build(),h:sh+capH,capR,pal:P}}

// ===== ROCKS =====
export function buildRock(seed,flat=1){
  const R=rng(seed*97+11);
  const g=new THREE.IcosahedronGeometry(1,3);const pos=g.attributes.position;
  const planes=[];const np=7+(R()*4|0);for(let k=0;k<np;k++){const v=V(R()*2-1,R()*2-1,R()*2-1).normalize();planes.push([v,.62+R()*.32])}
  const v=V();
  for(let k=0;k<pos.count;k++){v.fromBufferAttribute(pos,k).normalize();let r=1.15;
    for(const [n,d] of planes){const dp=v.dot(n);if(dp>1e-3)r=Math.min(r,d/dp)}
    r*=1+(noise3(v.x*2.2+seed,v.y*2.2,v.z*2.2,3)-.5)*.34+(noise3(v.x*7,v.y*7+seed,v.z*7,4)-.5)*.1;
    pos.setXYZ(k,v.x*r,v.y*r*flat,v.z*r)}
  g.computeVertexNormals();
  // box-projected UVs per face
  const uv=new Float32Array(pos.count*2),n3=g.attributes.normal;
  for(let k=0;k<pos.count;k+=3){const nx=Math.abs(n3.getX(k)),ny=Math.abs(n3.getY(k)),nz=Math.abs(n3.getZ(k));
    for(let j=0;j<3;j++){const x=pos.getX(k+j),y=pos.getY(k+j),z=pos.getZ(k+j);
      let a,b;if(ny>=nx&&ny>=nz){a=x;b=z}else if(nx>=nz){a=z;b=y}else{a=x;b=y}uv[(k+j)*2]=a*.5;uv[(k+j)*2+1]=b*.5}}
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const gb=new GB();
  gb.addGeo(g,new THREE.Matrix4(),(p,n)=>{const m=Math.max(0,n.y-.35)/.65,s=noise3(p.x*3,p.y*3,p.z*3,9);
    const base=[.62+s*.3,.58+s*.28,.68+s*.3];
    const c=mixc(base,[.25+s*.3,.75+s*.2,.55],m*m*(.6+s*.5)*.9);return{c,g:0,s:0}});
  return gb.build()}

// ===== CRYSTALS =====
export function buildCrystalCluster(seed,variant=0){
  const R=rng(seed*61+variant*5+1),gb=new GB();
  const pal=[[[.02,.1,.2],[.2,.95,1],[.7,1,1]],[[.1,.03,.2],[.7,.35,1],[1,.8,1]],[[.02,.14,.1],[.3,1,.6],[.9,1,.9]]][variant];
  const n=5+(R()*5|0);
  for(let k=0;k<n;k++){
    const main=k===0;const L=main?1.6+R()*1.2:.5+R()*1.1,r=main?.28+R()*.08:.1+R()*.1;
    const a=R()*6.283,tilt=main?(R()-.5)*.25:.25+R()*.55;
    const dir=V(Math.sin(tilt)*Math.cos(a),Math.cos(tilt),Math.sin(tilt)*Math.sin(a)).normalize();
    const org=main?V(0,-.05,0):V(Math.cos(a)*.18*(1+R()),-.05,Math.sin(a)*.18*(1+R()));
    const q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),dir);const rr=R()*6.28;
    const apply=(x,y,z)=>{const p=V(x,y,z);p.applyAxisAngle(V(0,1,0),rr);p.applyQuaternion(q);return p.add(org)};
    const sides=6,ring0=[],ring1=[];const rot=R()*1;
    for(let s=0;s<sides;s++){const th=s/sides*6.283+rot;ring0.push([Math.cos(th)*r,0,Math.sin(th)*r]);ring1.push([Math.cos(th)*r*.82,L*.72,Math.sin(th)*r*.82])}
    const apex=[0,L,0];
    const col=(t)=>mixc(pal[0],pal[1],Math.pow(t,.7));
    const face=(pts,cs,gl)=>{const p=pts.map(v=>apply(...v));const g=new THREE.Vector3().crossVectors(p[1].clone().sub(p[0]),p[2].clone().sub(p[0])).normalize();
      const cen=p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1/3).sub(org);const flip=g.dot(cen)<0;const n=flip?g.clone().negate():g;
      const ids=p.map((pp,i)=>gb.vert(pp.x,pp.y,pp.z,n.x,n.y,n.z,i%2,i>>1,cs[i][0],cs[i][1],cs[i][2],gl[i],0));
      if(flip)gb.tri(ids[0],ids[2],ids[1]);else gb.tri(ids[0],ids[1],ids[2])};
    for(let s=0;s<sides;s++){const s2=(s+1)%sides;
      const a0=ring0[s],a1=ring0[s2],b0=ring1[s],b1=ring1[s2];
      const c0=col(0),c1=col(.72);
      face([a0,a1,b0],[c0,c0,c1],[.5,.5,1.2]);face([a1,b1,b0],[c0,c1,c1],[.5,1.2,1.2]);face([b0,b1,apex],[c1,c1,pal[2]],[1.3,1.3,2.6])}}
  return gb.build()}
