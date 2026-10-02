// Procedural, tileable PBR-ish ground layers (DOM-free). Albedo RGB (sRGB bytes) + roughness in A;
// Normal RGB + height in A. Layers: 0 soil, 1 moss, 2 veined basalt, 3 rock strata, 4 sand.
import {fbm,worley,sm,lerp,h2,vnoise} from './noise.js';
const mix3=(o,a,b,t)=>{o[0]=a[0]+(b[0]-a[0])*t;o[1]=a[1]+(b[1]-a[1])*t;o[2]=a[2]+(b[2]-a[2])*t};
const W=[0,0,0];

function soil(u,v,o){
  const f1=fbm(u*6,v*6,5,1,6),f2=fbm(u*28,v*28,3,2,28),f3=fbm(u*3,v*3,3,5,3);
  worley(u*13,v*13,3,13,W);const d1=W[0],d2=W[1],id=W[2];
  const peb=(id>.45?1:0)*(1-sm(.2,.36,d1)); const crack=1-sm(0,.07,d2-d1);
  const col=[0,0,0];mix3(col,[.07,.042,.085],[.23,.14,.17],f1*.8+f2*.4);
  const tint=(f3-.5)*.1;col[0]+=tint;col[2]+=tint*.6;
  const pc=.14+id*.14;col[0]=lerp(col[0],pc*1.05,peb*.8);col[1]=lerp(col[1],pc*.95,peb*.8);col[2]=lerp(col[2],pc*1.2,peb*.8);
  const cr=crack*sm(.45,.62,f1)*.7;col[0]*=1-cr*.8;col[1]*=1-cr*.8;col[2]*=1-cr*.7;
  const fl=h2(Math.floor(u*512),Math.floor(v*512),77);if(fl>.994){col[0]+=.1;col[1]+=.25;col[2]+=.32}
  o[0]=col[0];o[1]=col[1];o[2]=col[2];o[3]=.88+f2*.1-peb*.15;o[4]=f1*.35+f2*.2+peb*(.5+(.36-d1)*1.3)-cr*.5}
function moss(u,v,o){
  const f1=fbm(u*5,v*5,4,11,5),f2=fbm(u*40,v*40,3,12,40),f3=fbm(u*18,v*18,3,13,18);
  worley(u*26,v*26,14,26,W);const tuft=1-sm(0,.7,W[0]);
  const col=[0,0,0];mix3(col,[.035,.13,.1],[.2,.5,.3],f1*.7+f3*.5);
  const tip=tuft*f2;col[0]+=tip*.12;col[1]+=tip*.2;col[2]+=tip*.05;
  const m=sm(.55,.8,f3);col[0]=lerp(col[0],.30,m*.2);col[1]=lerp(col[1],.62,m*.2);col[2]=lerp(col[2],.52,m*.2);
  o[0]=col[0];o[1]=col[1];o[2]=col[2];o[3]=.97;o[4]=f3*.5+tuft*.35+f2*.2}
function vein(u,v,o){
  const f1=fbm(u*6,v*6,5,21,6),f2=fbm(u*30,v*30,3,22,30);
  worley(u*7,v*7,23,7,W);const e=W[1]-W[0];
  // warp the cell edges for organic cracks
  const wv=fbm(u*14,v*14,3,24,14);worley(u*7+wv*.7,v*7+wv*.7,23,7,W);const e2=W[1]-W[0];
  const crack=1-sm(.0,.075,e2),core=1-sm(0,.028,e2);
  const live=sm(.35,.55,fbm(u*4,v*4,3,25,4)); // only some cracks glow
  const col=[0,0,0];mix3(col,[.025,.03,.05],[.1,.1,.15],f1*.8+f2*.3);
  const g=core*live;const halo=crack*live;
  col[0]=lerp(col[0],.03,g);col[1]=lerp(col[1],.95,g);col[2]=lerp(col[2],1.0,g);
  col[1]+=halo*.1*(1-g);col[2]+=halo*.2*(1-g);
  col[0]*=1-crack*(1-live)*.6;col[1]*=1-crack*(1-live)*.6;col[2]*=1-crack*(1-live)*.6;
  o[0]=col[0];o[1]=col[1];o[2]=col[2];o[3]=.5+f2*.3-g*.3;o[4]=f1*.5+f2*.25-crack*.8}
function rock(u,v,o){
  const f1=fbm(u*4,v*4,5,31,4),f2=fbm(u*22,v*22,4,32,22),f3=fbm(u*60,v*60,2,37,60);
  const wp=fbm(u*5,v*5,3,38,5)*.5;
  worley(u*8+wp*1.4,v*8+wp*1.4,34,8,W);const d1=W[0],d2=W[1],id=W[2];
  worley(u*14,v*14,39,14,W);const sd1=W[0],sid=W[2];
  const edge=d2-d1,crack=1-sm(0,.07,edge),bevel=sm(0,.35,edge);
  const strata=Math.sin((v*7+f1*1.6+id*2)*Math.PI*2)*.5+.5;const bev2=bevel;
  const col=[0,0,0];mix3(col,[.06,.07,.12],[.26,.3,.4],id*.3+f1*.55+strata*.15);
  const sub=sid*.18+.9;col[0]*=sub;col[1]*=sub;col[2]*=sub;
  const rust=sm(.7,.9,fbm(u*6,v*6,3,35,6))*.3;col[0]=lerp(col[0],.3,rust*.3);col[1]=lerp(col[1],.2,rust*.3);col[2]=lerp(col[2],.2,rust*.3);
  const k=.82+f2*.3+f3*.12;col[0]*=k;col[1]*=k;col[2]*=k*1.03;
  const ck=crack*sm(.35,.55,f1);col[0]*=1-ck*.75;col[1]*=1-ck*.75;col[2]*=1-ck*.7;
  o[0]=col[0];o[1]=col[1];o[2]=col[2];o[3]=.78+f2*.15;o[4]=id*.6+bevel*.22+f1*.4+f2*.25+f3*.1-ck*.5}
function sand(u,v,o){
  const f1=fbm(u*4,v*4,4,41,4),f2=fbm(u*60,v*60,2,42,60);
  const warp=fbm(u*5,v*5,3,43,5)*1.6;
  const rip=Math.sin((u*14+v*5+warp*3)*Math.PI*2)*.5+.5;
  const col=[0,0,0];mix3(col,[.24,.2,.21],[.42,.36,.31],f1*.8+f2*.15);
  const rk=.94+rip*.1;col[0]*=rk;col[1]*=rk;col[2]*=rk*.97;
  const gr=h2(Math.floor(u*512),Math.floor(v*512),9);col[0]+=(gr-.5)*.06;col[1]+=(gr-.5)*.05;col[2]+=(gr-.5)*.05;
  if(gr>.997){col[0]+=.3;col[1]+=.45;col[2]+=.5}
  o[0]=col[0];o[1]=col[1];o[2]=col[2];o[3]=.93;o[4]=rip*.18+f1*.3+f2*.15}
function bark(u,v,o){
  const f=fbm(u*10,v*2.5,4,51,10),g=fbm(u*26,v*5,3,52,26);
  const ridge=1-Math.abs(vnoise(u*14+f*2.2,v*3,53,14)*2-1);
  const col=[0,0,0];mix3(col,[.06,.035,.06],[.26,.17,.2],ridge*.7+g*.3);
  const gl=sm(.72,.9,fbm(u*6,v*4,3,54,6));col[0]=lerp(col[0],.12,gl*.35);col[1]=lerp(col[1],.3,gl*.35);col[2]=lerp(col[2],.28,gl*.35);
  o[0]=col[0];o[1]=col[1];o[2]=col[2];o[3]=.9;o[4]=ridge*.8+g*.2}
const FNS=[soil,moss,vein,rock,sand];
const enc=x=>Math.max(0,Math.min(255,Math.round(Math.pow(Math.max(0,x),1/2.2)*255)));

export function genLayer(fn,S,nStr,alb,nrm,off){
  const H=new Float32Array(S*S),o=[0,0,0,0,0];
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){fn((x+.5)/S,(y+.5)/S,o);const i=(off+y*S+x)*4;
    alb[i]=enc(o[0]);alb[i+1]=enc(o[1]);alb[i+2]=enc(o[2]);alb[i+3]=Math.round(Math.min(1,o[3])*255);H[y*S+x]=o[4]}
  let mn=1e9,mx=-1e9;for(let i=0;i<H.length;i++){mn=Math.min(mn,H[i]);mx=Math.max(mx,H[i])}
  const inv=1/Math.max(1e-4,mx-mn);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const xl=(x-1+S)%S,xr=(x+1)%S,yu=(y-1+S)%S,yd=(y+1)%S;
    let dx=(H[y*S+xl]-H[y*S+xr])*nStr,dy=(H[yu*S+x]-H[yd*S+x])*nStr;// -gradient (u->x, v->y)
    dx=-dx*-1;dy=-dy*-1;
    // normal pointing along -gradient: perturbation = -grad
    const nx=dx,ny=dy,nz=1,l=Math.hypot(nx,ny,nz);const i=(off+y*S+x)*4;
    nrm[i]=Math.round((nx/l*.5+.5)*255);nrm[i+1]=Math.round((ny/l*.5+.5)*255);nrm[i+2]=Math.round((nz/l*.5+.5)*255);
    nrm[i+3]=Math.round((H[y*S+x]-mn)*inv*255)}
}
export function genGroundArrays(S=512){
  const alb=new Uint8Array(S*S*4*5),nrm=new Uint8Array(S*S*4*5);
  const str=[5,6,8,7,1.6];
  for(let l=0;l<5;l++)genLayer(FNS[l],S,str[l]*S/512*3.2,alb,nrm,l*S*S);
  return {alb,nrm,S,layers:5}}
export function genSingle(name,S=256){
  const alb=new Uint8Array(S*S*4),nrm=new Uint8Array(S*S*4);
  genLayer(name==='bark'?bark:rock,S,name==='bark'?9:6,alb,nrm,0);return {alb,nrm,S}}
// 4-channel tileable noise
export function genNoise(S=256){
  const d=new Uint8Array(S*S*4);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const u=x/S,v=y/S,i=(y*S+x)*4;
    d[i]=fbm(u*6,v*6,5,101,6)*255;d[i+1]=fbm(u*8,v*8,5,102,8)*255;d[i+2]=fbm(u*5,v*5,5,103,5)*255;d[i+3]=fbm(u*16,v*16,4,104,16)*255}
  return d}
