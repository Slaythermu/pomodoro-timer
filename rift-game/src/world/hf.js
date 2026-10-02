// Heightfield, pools, biome splat. DOM-free.
import {fbm,sm,rng,lerp,clamp} from './noise.js';
export const WORLD=200,EXT=280,N=320,HALF=EXT/2;
export function createHF(seed){
  const R=rng(seed*7+3),S=seed|0;
  const pools=[];
  function base(x,z){
    const r=Math.hypot(x,z),fl=sm(6,26,r);
    let h=(fbm(x*.016+5,z*.016+9,5,S)-.5)*9+(fbm(x*.07,z*.07,3,S+3)-.5)*1.5;
    const rg=1-Math.abs(fbm(x*.028+40,z*.028-20,3,S+9)*2-1);h+=Math.pow(rg,4)*3.2*sm(.45,.7,fbm(x*.012-9,z*.012+4,2,S+11));
    h*=fl;
    const d=Math.pow(Math.pow(Math.abs(x),4)+Math.pow(Math.abs(z),4),.25),e=sm(84,112,d);
    h+=e*(7+9*fbm(x*.05,z*.05,3,S+5))+e*e*16;return h}
  let tries=0;
  while(pools.length<7&&tries++<800){const a=R()*6.283,d=30+R()*50,x=Math.cos(a)*d,z=Math.sin(a)*d;if(Math.abs(x)>76||Math.abs(z)>76)continue;
    const r=5+R()*5;let ok=true;for(const p of pools)if(Math.hypot(p.x-x,p.z-z)<p.r+r+24)ok=false;if(!ok)continue;
    pools.push({x,z,r,level:Math.min(.3,base(x,z)*.5)-.4,ph:R()*6.28})}
  const rn=(p,a)=>p.r*(1+.26*Math.sin(3*a+p.ph)+.14*Math.sin(5*a+2*p.ph));
  function tOf(p,x,z){const dx=x-p.x,dz=z-p.z;return Math.hypot(dx,dz)/rn(p,Math.atan2(dz,dx))}
  function raw(x,z){
    let h=base(x,z);
    for(const p of pools){const t=tOf(p,x,z);if(t>2.5)continue;
      const plat=p.level+.55+.3*fbm(x*.2,z*.2,2,S+13);
      h=lerp(h,plat,1-sm(1.05,2.5,t));
      const tg=t<1?p.level-(1-t*t)*1.7:p.level+(t-1)*2.2;
      h=lerp(h,tg,1-sm(.88,1.35,t))}
    return h}
  const n1=N+1,grid=new Float32Array(n1*n1),cell=EXT/N;
  for(let j=0;j<n1;j++)for(let i=0;i<n1;i++)grid[j*n1+i]=raw(-HALF+i*cell,-HALF+j*cell);
  function heightAt(x,z){let gx=(x+HALF)/cell,gz=(z+HALF)/cell;gx=clamp(gx,0,N-.001);gz=clamp(gz,0,N-.001);
    const i=gx|0,j=gz|0,fx=gx-i,fz=gz-j,a=grid[j*n1+i],b=grid[j*n1+i+1],c=grid[(j+1)*n1+i],d=grid[(j+1)*n1+i+1];
    return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz}
  function slopeAt(x,z){const e=.8;return Math.hypot(heightAt(x+e,z)-heightAt(x-e,z),heightAt(x,z+e)-heightAt(x,z-e))/(2*e)}
  function waterDepth(x,z){let best=-1;for(const p of pools){if(Math.abs(x-p.x)>p.r*1.8||Math.abs(z-p.z)>p.r*1.8)continue;const d=p.level-heightAt(x,z);if(d>best)best=d}return best}
  function poolT(x,z){let m=9;for(const p of pools){if(Math.abs(x-p.x)>p.r*3||Math.abs(z-p.z)>p.r*3)continue;m=Math.min(m,tOf(p,x,z))}return m}
  return {pools,grid,heightAt,slopeAt,waterDepth,poolT,tOf,rn,cell,seed:S}}

// Biome splat: RGBA = soil,moss,vein,rock ; sand=1-sum
export function bakeSplat(hf,res=1024){
  const S=hf.seed,data=new Uint8Array(res*res*4),k=EXT/res;
  for(let j=0;j<res;j++)for(let i=0;i<res;i++){
    const x=-HALF+(i+.5)*k,z=-HALF+(j+.5)*k;
    const r=Math.hypot(x,z),h=hf.heightAt(x,z);
    const e=.9,sl=Math.hypot(hf.heightAt(x+e,z)-hf.heightAt(x-e,z),hf.heightAt(x,z+e)-hf.heightAt(x,z-e))/(2*e);
    const m=fbm(x*.028+10,z*.028,4,S+21),rk=fbm(x*.02-30,z*.02+7,4,S+22),vn=fbm(x*.04+5,z*.04-12,3,S+23),dn=fbm(x*.09,z*.09,2,S+24);
    const pt=hf.poolT(x,z);
    let sand=(1-sm(1.05,1.9+dn*.5,pt))*sm(-.9,.2,h-0);sand=Math.max(sand,sm(.78,.9,fbm(x*.05-7,z*.05+3,3,S+25))*.7*sm(10,20,r)*(1-sm(.35,.5,sl)));
    sand=Math.min(1,sand*1.2);
    let wRock=Math.max(sm(.38,.62,sl),sm(.6,.7,rk)*sm(12,26,r));
    let wVein=sm(.53,.63,vn)*sm(14,26,r);
    let wMoss=sm(.4,.58,m)*(.35+.65*sm(5,18,r));
    let rem=1-sand;const rock=Math.min(rem,wRock*rem);rem-=rock;const vein=wVein*rem;rem-=vein;const moss=wMoss*rem;rem-=moss;const soil=rem;
    const o=(j*res+i)*4;data[o]=soil*255;data[o+1]=moss*255;data[o+2]=vein*255;data[o+3]=rock*255}
  const sample=(x,z,out)=>{const i=clamp(((x+HALF)/k)|0,0,res-1),j=clamp(((z+HALF)/k)|0,0,res-1),o=(j*res+i)*4;
    out.soil=data[o]/255;out.moss=data[o+1]/255;out.vein=data[o+2]/255;out.rock=data[o+3]/255;out.sand=Math.max(0,1-out.soil-out.moss-out.vein-out.rock);return out};
  return {data,res,sample}}
