// RIFTFALL terrain / alien biome. Public API (ctx.terrain): heightAt(x,z) blocked(x,z,r) size props resourceNodes
// harvest(node,n) damageProp(node,n) addDecal(type,pos,radius,opts) isWater(x,z) normalAt(x,z) randomFreePoint(minR,maxR,r)
import * as THREE from 'three';
import {createHF,bakeSplat,WORLD,EXT,HALF} from './hf.js';
import {rng,sm,fbm,lerp,clamp} from './noise.js';
import {genGroundArrays,genSingle,genNoise} from './texgen.js';
import {GB,buildTree,buildFern,buildBulbPlant,buildGrassTuft,buildMushroom,buildRock,buildCrystalCluster} from './geo.js';
import {frondTexture,soft} from './tex2d.js';
import {U,foliageMat,depthMat,terrainMat,waterMat,sporeMat} from './materials.js';

const ZERO=new THREE.Matrix4().makeScale(0,0,0);
const dataTex=(d,S,srgb)=>{const t=new THREE.DataTexture(d,S,S,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t};

class Occ{constructor(c=4){this.c=c;this.m=new Map()}
  k(i,j){return i*73856093^j*19349663}
  add(x,z,r){const k=this.k(Math.floor(x/this.c),Math.floor(z/this.c));(this.m.get(k)||this.m.set(k,[]).get(k)).push(x,z,r)}
  free(x,z,r){const c=this.c,R=r+6;for(let i=Math.floor((x-R)/c);i<=Math.floor((x+R)/c);i++)for(let j=Math.floor((z-R)/c);j<=Math.floor((z+R)/c);j++){const a=this.m.get(this.k(i,j));
    if(a)for(let q=0;q<a.length;q+=3){const dx=a[q]-x,dz=a[q+1]-z,rr=a[q+2]+r;if(dx*dx+dz*dz<rr*rr)return false}}return true}}

export function init(ctx){
  const {scene}=ctx;const seed=ctx.seed|0;
  const t0=performance.now();
  if(!scene.fog)scene.fog=new THREE.FogExp2(0x0b1a24,.0105);
  if(!scene.background)scene.background=new THREE.Color(0x0b1a24);
  const root=new THREE.Group();root.name='terrain';scene.add(root);

  // ---------- height + biome ----------
  const hf=createHF(seed),splat=bakeSplat(hf,768);const {heightAt,slopeAt,waterDepth,pools}=hf;
  const R=rng(seed*3+1);const bio={soil:0,moss:0,vein:0,rock:0,sand:0};
  // ---------- textures ----------
  const g=genGroundArrays(256);
  const alb=new THREE.DataArrayTexture(g.alb,g.S,g.S,5),nrm=new THREE.DataArrayTexture(g.nrm,g.S,g.S,5);
  for(const [t,s] of [[alb,true],[nrm,false]]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;if(s)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true}
  const noiseTex=dataTex(genNoise(256),256,false);
  const splatTex=new THREE.DataTexture(splat.data,splat.res,splat.res,THREE.RGBAFormat);splatTex.magFilter=splatTex.minFilter=THREE.LinearFilter;splatTex.generateMipmaps=false;splatTex.needsUpdate=true;
  const glowDummy=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1,THREE.RGBAFormat);glowDummy.needsUpdate=true;U.uGlowMap.value=glowDummy;U.uExt.value=EXT;
  const bk=genSingle('bark',256),rk=genSingle('rock',256);
  const barkMap=dataTex(bk.alb,256,true),barkN=dataTex(bk.nrm,256,false),rockMap=dataTex(rk.alb,256,true),rockN=dataTex(rk.nrm,256,false);

  // ---------- terrain mesh ----------
  {const n1=320+1,pos=new Float32Array(n1*n1*3),nor=new Float32Array(n1*n1*3),cell=EXT/320,grid=hf.grid;
    for(let j=0;j<n1;j++)for(let i=0;i<n1;i++){const o=(j*n1+i)*3;pos[o]=-HALF+i*cell;pos[o+1]=grid[j*n1+i];pos[o+2]=-HALF+j*cell;
      const hl=grid[j*n1+Math.max(0,i-1)],hr=grid[j*n1+Math.min(320,i+1)],hu=grid[Math.max(0,j-1)*n1+i],hd=grid[Math.min(320,j+1)*n1+i];
      const nx=hl-hr,nz=hu-hd,ny=2*cell,l=Math.hypot(nx,ny,nz);nor[o]=nx/l;nor[o+1]=ny/l;nor[o+2]=nz/l}
    const idx=new Uint32Array(320*320*6);let q=0;
    for(let j=0;j<320;j++)for(let i=0;i<320;i++){const a=j*n1+i,b=a+1,c=a+n1,d=c+1;idx[q++]=a;idx[q++]=c;idx[q++]=b;idx[q++]=b;idx[q++]=c;idx[q++]=d}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));geo.setIndex(new THREE.BufferAttribute(idx,1));
    geo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,5,0),EXT);geo.boundingBox=new THREE.Box3(new THREE.Vector3(-HALF,-4,-HALF),new THREE.Vector3(HALF,40,HALF));
    var terrainMesh=new THREE.Mesh(geo,terrainMat({alb,nrm,splat:splatTex,noise:noiseTex}));terrainMesh.receiveShadow=true;terrainMesh.frustumCulled=false;root.add(terrainMesh)}

  // ---------- placement ----------
  const occ=new Occ(4),props=[],resourceNodes=[];
  const sample=(x,z)=>splat.sample(x,z,bio);
  const items={tree:[[],[],[]],mush:[[],[],[]],rock:[],crystal:[[],[],[]],fern:[],bulb:[],grass:[],pebble:[],mushS:[],crystalS:[],rockM:[]};
  const glowSrc=[],aoSrc=[];
  const wet=(x,z)=>waterDepth(x,z)>-.35;
  const pt=(lim=108)=>[(R()*2-1)*lim,(R()*2-1)*lim];
  const jit=(a,b)=>new THREE.Color(lerp(a,b,R()),lerp(a,b,R()),lerp(a,b,R()));
  function addProp(type,kind,x,z,radius,scale,res,amount,it){const p={type,kind,pos:new THREE.Vector3(x,heightAt(x,z),z),radius,scale,res,amount,hp:amount,alive:true,_ms:null,_i:0};
    props.push(p);resourceNodes.push(p);it._p=p;return p}
  const CRY=[[.15,.85,1],[.65,.35,1],[.3,1,.6]];
  // crystals (resource nodes). guaranteed starter nodes near spawn
  const starters=[[17,-9],[-15,12],[6,21],[-8,-19]];
  let nCry=0;
  const placeCrystal=(x,z,s,force)=>{if(!force&&(wet(x,z)||slopeAt(x,z)>.7))return false;if(!occ.free(x,z,1.4*s))return false;
    const v=R()<.7?0:R()<.6?1:2;const h=heightAt(x,z);
    const it={x,y:h-.05,z,ry:R()*6.28,sx:s,sy:s*(.9+R()*.3),sz:s,rx:(R()-.5)*.12,rz:(R()-.5)*.12,c:jit(.85,1.15)};items.crystal[v].push(it);
    addProp('crystal','crystal',x,z,.85*s,s,'crystal',Math.round(90*s),it);occ.add(x,z,1.5*s);
    glowSrc.push([x,z,6.5*s,CRY[v][0],CRY[v][1],CRY[v][2],1.1]);nCry++;
    // satellite small crystals
    for(let k=0;k<3+(R()*3|0);k++){const a=R()*6.28,d=1.2*s+R()*1.5,xx=x+Math.cos(a)*d,zz=z+Math.sin(a)*d;if(wet(xx,zz))continue;const ss=.25+R()*.4;
      items.crystalS.push({v,x:xx,y:heightAt(xx,zz)-.05,z:zz,ry:R()*6.28,sx:ss,sy:ss*(.9+R()*.4),sz:ss,rx:(R()-.5)*.3,rz:(R()-.5)*.3,c:jit(.85,1.15)})}
    return true};
  for(const [x,z] of starters){for(let k=0;k<10;k++){const xx=x+(R()-.5)*5,zz=z+(R()-.5)*5;if(placeCrystal(xx,zz,1.3+R()*.5,true))break}}
  for(let a=0;a<6000&&nCry<70;a++){const [x,z]=pt(100);if(Math.hypot(x,z)<24)continue;sample(x,z);const w=.08+bio.vein*1.2+bio.rock*.5;if(R()>w)continue;placeCrystal(x,z,.9+R()*1.1)}
  // boulders (blocking, steel nodes)
  let nRock=0;
  for(let a=0;a<9000&&nRock<150;a++){const [x,z]=pt(106);if(Math.hypot(x,z)<14||wet(x,z))continue;sample(x,z);const w=.12+bio.rock*1.1+bio.vein*.3;if(R()>w)continue;
    const s=.9+Math.pow(R(),1.8)*2.4;if(!occ.free(x,z,s*.9))continue;const flat=.55+R()*.4;
    const it={x,y:heightAt(x,z)-.18*s,z,ry:R()*6.28,sx:s*(.9+R()*.5),sy:s*flat,sz:s*(.9+R()*.5),rx:(R()-.5)*.3,rz:(R()-.5)*.3,c:jit(.8,1.1),v:nRock%6};
    items.rock.push(it);addProp('rock','boulder',x,z,s*.95,s,'steel',Math.round(40*s),it);occ.add(x,z,s*.95);nRock++;aoSrc.push([x,z,s*2.2,.7])}
  // trees (blocking, carbon nodes)
  let nTree=0;
  for(let a=0;a<20000&&nTree<560;a++){const [x,z]=pt(110);const r=Math.hypot(x,z);if(r<11||wet(x,z)||slopeAt(x,z)>.5)continue;sample(x,z);
    const grove=sm(.38,.62,fbm(x*.035+3,z*.035+8,3,seed+31));
    const w=(.04+bio.moss*.9+bio.soil*.3+bio.vein*.08)*(1-bio.rock)*(1-bio.sand)*(.15+.85*grove)*sm(11,26,r);if(R()>w)continue;
    const v=bio.vein>.1||bio.rock>.2?2:(bio.moss>.35?(R()<.6?0:1):(R()<.5?1:(R()<.5?0:2)));const s=.8+R()*.7;const rad=(v===1?.7:.5)*s;
    if(!occ.free(x,z,1.5*s))continue;
    const it={x,y:heightAt(x,z)-.1,z,ry:R()*6.28,sx:s,sy:s*(.85+R()*.4),sz:s,rx:(R()-.5)*.06,rz:(R()-.5)*.06,c:jit(.82,1.18),s:nTree};
    items.tree[v].push(it);addProp('tree','tree',x,z,rad,s,'carbon',Math.round(45*s),it);occ.add(x,z,1.5*s);nTree++;
    const pal=[[.2,1,.85],[.9,.4,1],[.4,.7,1]][v];glowSrc.push([x,z,6,pal[0],pal[1],pal[2],.16]);aoSrc.push([x,z,2.6*s,.85])}
  // giant mushrooms
  let nM=0;
  for(let a=0;a<9000&&nM<85;a++){const [x,z]=pt(108);const r=Math.hypot(x,z);if(r<13||wet(x,z)||slopeAt(x,z)>.45)continue;sample(x,z);
    const w=(.05+bio.moss*.7+bio.soil*.35)*(1-bio.rock)*(1-bio.sand)*sm(12,28,r);if(R()>w)continue;
    const s=1.0+R()*1.1;if(!occ.free(x,z,1.9*s))continue;const v=R()<.4?0:R()<.55?1:2;
    const it={x,y:heightAt(x,z)-.05,z,ry:R()*6.28,sx:s,sy:s*(.9+R()*.3),sz:s,rx:0,rz:0,c:jit(.85,1.15)};items.mush[v].push(it);
    addProp('tree','mushroom',x,z,.5*s,s,'carbon',Math.round(60*s),it);occ.add(x,z,1.8*s);nM++;
    const pc=[[.3,.7,1],[1,.3,.9],[1,.6,.2]][v];glowSrc.push([x,z,5.5*s,pc[0],pc[1],pc[2],.55]);aoSrc.push([x,z,2*s,.5])}
  const nodeCount=props.length;
  // hash of blockers
  const phash=new Map(),CELL=8;let maxPR=0;
  for(const p of props){maxPR=Math.max(maxPR,p.radius);const k=Math.floor(p.pos.x/CELL)*73856093^Math.floor(p.pos.z/CELL)*19349663;(phash.get(k)||phash.set(k,[]).get(k)).push(p)}
  // smaller dressing (non-blocking)
  for(let a=0;a<4000&&items.rockM.length<650;a++){const [x,z]=pt(110);if(wet(x,z)||Math.hypot(x,z)<5)continue;sample(x,z);if(R()>.1+bio.rock*.8+bio.soil*.15+bio.sand*.2)continue;
    const s=.25+Math.pow(R(),2)*.7;if(!occ.free(x,z,s*.6))continue;
    items.rockM.push({x,y:heightAt(x,z)-.1*s,z,ry:R()*6.28,sx:s*(.8+R()*.6),sy:s*(.5+R()*.5),sz:s*(.8+R()*.6),rx:(R()-.5)*.5,rz:(R()-.5)*.5,c:jit(.8,1.1),v:items.rockM.length%6})}
  for(let a=0;a<6000&&items.pebble.length<1400;a++){const [x,z]=pt(110);if(wet(x,z))continue;sample(x,z);if(R()>.15+bio.rock*.6+bio.sand*.5+bio.soil*.3)continue;const s=.06+R()*.16;
    items.pebble.push({x,y:heightAt(x,z)-.03,z,ry:R()*6.28,sx:s*(1+R()),sy:s*.7,sz:s*(1+R()),rx:R()*3,rz:R()*3,c:jit(.7,1.1),v:R()*6|0})}
  for(let a=0;a<30000&&items.mushS.length<700;a++){const [x,z]=(a%2)?pt(110):(()=>{const p=props[R()*props.length|0];return[p.pos.x+(R()-.5)*8,p.pos.z+(R()-.5)*8]})();
    if(wet(x,z))continue;sample(x,z);if(R()>(.05+bio.moss*.8+bio.soil*.3)*(1-bio.rock)*(1-bio.sand))continue;
    const v=R()<.4?0:R()<.55?1:2;const cl=3+(R()*3|0),s0=.1+R()*.2;
    for(let k=0;k<cl;k++){const aa=R()*6.28,d=R()*.7,xx=x+Math.cos(aa)*d,zz=z+Math.sin(aa)*d;if(!occ.free(xx,zz,.1))continue;const s=s0*(.5+R()*.8);
      items.mushS.push({v,x:xx,y:heightAt(xx,zz)-.02,z:zz,ry:R()*6.28,sx:s,sy:s*(.8+R()*.5),sz:s,rx:(R()-.5)*.3,rz:(R()-.5)*.3,c:jit(.85,1.2)})}}
  const FERNC=[[1,1,1],[1.45,.6,1.5],[1.7,1.2,.45],[.65,1.2,1.7],[.9,1.5,.9]];
  for(let a=0;a<60000&&items.fern.length<4600;a++){const [x,z]=pt(112);if(wet(x,z))continue;sample(x,z);
    const near=Math.hypot(x,z);const w=(.05+bio.moss*.85+bio.soil*.3+bio.vein*.15)*(1-bio.rock)*(1-bio.sand)*(.4+.6*sm(.3,.6,fbm(x*.07,z*.07,2,seed+41)))*(.3+.7*sm(2,10,near));if(R()>w)continue;
    if(!occ.free(x,z,.3))continue;const s=.7+R()*.9;const cc=FERNC[R()<.55?0:1+(R()*4|0)];
    items.fern.push({x,y:heightAt(x,z)-.02,z,ry:R()*6.28,sx:s,sy:s*(.8+R()*.5),sz:s,rx:(R()-.5)*.2,rz:(R()-.5)*.2,c:new THREE.Color(cc[0]*lerp(.85,1.15,R()),cc[1]*lerp(.85,1.15,R()),cc[2]*lerp(.85,1.15,R()))})}
  for(let a=0;a<40000&&items.bulb.length<800;a++){const [x,z]=pt(110);if(waterDepth(x,z)>-.1)continue;sample(x,z);const pt2=hf.poolT(x,z);const reed=pt2<2.6?1:0;
    const w=(.03+bio.moss*.4+bio.vein*.5+reed*.9)*(1-bio.rock)*(.2+.8*sm(.4,.65,fbm(x*.05,z*.05,2,seed+51)));if(R()>w)continue;if(!occ.free(x,z,.2))continue;
    const s=(reed?1.3:.7)+R()*.8;items.bulb.push({x,y:heightAt(x,z)-.02,z,ry:R()*6.28,sx:s,sy:s*(.8+R()*.6),sz:s,rx:(R()-.5)*.15,rz:(R()-.5)*.15,c:jit(.9,1.1)})}
  const GRC=[[1,1,1],[1.3,1.15,.65],[.7,.95,1.3],[1.15,.8,1.1]];
  for(let a=0;a<900000&&items.grass.length<110000;a++){const [x,z]=pt(112);sample(x,z);
    const cl=.25+.75*sm(.3,.6,fbm(x*.12+9,z*.12-4,2,seed+61));
    const w=(bio.moss*1+bio.soil*.4+bio.vein*.18+bio.sand*.04)*cl*(.12+.88*sm(5,16,Math.hypot(x,z)));if(R()>w)continue;if(waterDepth(x,z)>-.1)continue;if(!occ.free(x,z,.15))continue;
    const s=.7+R()*.9;const cc=GRC[R()<.78?0:1+(R()*3|0)];
    items.grass.push({x,y:heightAt(x,z)-.01,z,ry:R()*6.28,sx:s,sy:s*(.7+R()*.7),sz:s,rx:0,rz:0,c:new THREE.Color(cc[0]*lerp(.8,1.2,R()),cc[1]*lerp(.8,1.2,R()),cc[2]*lerp(.8,1.2,R()))})}

  // ---------- baked glow / AO map ----------
  {const GR=512,k=EXT/GR,buf=new Float32Array(GR*GR*4);
    const splash=(x,z,r,cr,cg,cb,I,ao)=>{const i0=Math.max(0,Math.floor((x-r+HALF)/k)),i1=Math.min(GR-1,Math.ceil((x+r+HALF)/k)),j0=Math.max(0,Math.floor((z-r+HALF)/k)),j1=Math.min(GR-1,Math.ceil((z+r+HALF)/k));
      for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const dx=-HALF+(i+.5)*k-x,dz=-HALF+(j+.5)*k-z,d=Math.hypot(dx,dz)/r;if(d>=1)continue;const f=(1-d)*(1-d)*I,o=(j*GR+i)*4;
        if(ao){buf[o+3]=Math.max(buf[o+3],f)}else{buf[o]+=cr*f;buf[o+1]+=cg*f;buf[o+2]+=cb*f}}};
    for(const s of glowSrc)splash(s[0],s[1],s[2],s[3],s[4],s[5],s[6],false);
    for(const s of aoSrc)splash(s[0],s[1],s[2],0,0,0,s[3],true);
    for(const p of pools)splash(p.x,p.z,p.r*1.7,.02,.55,.6,.45,false);
    const u8=new Uint8Array(GR*GR*4);for(let i=0;i<buf.length;i++)u8[i]=Math.min(255,buf[i]*255);
    const gt=new THREE.DataTexture(u8,GR,GR,THREE.RGBAFormat);gt.magFilter=gt.minFilter=THREE.LinearFilter;gt.generateMipmaps=false;gt.needsUpdate=true;U.uGlowMap.value=gt}

  // ---------- instanced meshes ----------
  const meshes=[];
  const _q=new THREE.Quaternion(),_e=new THREE.Euler(),_m=new THREE.Matrix4(),_p=new THREE.Vector3(),_s=new THREE.Vector3();
  function instance(parts,list,chunk,cast,receive){
    const bk=new Map();for(const it of list){const k=Math.floor((it.x+HALF)/chunk)+','+Math.floor((it.z+HALF)/chunk);(bk.get(k)||bk.set(k,[]).get(k)).push(it)}
    for(const arr of bk.values()){const ms=parts.map(pt=>{const m=new THREE.InstancedMesh(pt.geo,pt.mat,arr.length);m.castShadow=!!cast;m.receiveShadow=receive!==false;if(pt.depth)m.customDepthMaterial=pt.depth;m.frustumCulled=true;return m});
      arr.forEach((it,i)=>{_e.set(it.rx||0,it.ry||0,it.rz||0,'YXZ');_q.setFromEuler(_e);_p.set(it.x,it.y,it.z);_s.set(it.sx,it.sy,it.sz);_m.compose(_p,_q,_s);
        for(const m of ms){m.setMatrixAt(i,_m);if(it.c)m.setColorAt(i,it.c)}if(it._p){it._p._ms=ms;it._p._i=i}});
      for(const m of ms){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();root.add(m);meshes.push(m)}}}
  const frondT=frondTexture(0),fernT=frondTexture(1);
  const mCan=foliageMat({map:frondT,alphaTest:.5,double:true,wind:.3,glowK:2.6,cutaway:true,rough:.65}),dCan=depthMat(frondT);
  const mTrunk=foliageMat({map:barkMap,normalMap:barkN,rough:.85,cutaway:true,glowK:1,ns:1.4});
  const mFern=foliageMat({map:fernT,alphaTest:.45,double:true,wind:.45,glowK:2.2,rough:.7});
  const mGrass=foliageMat({double:true,wind:.35,glowK:1.7,rough:.85});
  const mBulb=foliageMat({double:true,wind:.25,glowK:1.5,rough:.5});
  const mMush=foliageMat({rough:.5,cutaway:true,glowK:2.0});
  const mMushS=foliageMat({rough:.5,glowK:2.0});
  const mRock=foliageMat({map:rockMap,normalMap:rockN,rough:.9,ns:1.6});
  const mCry=foliageMat({rough:.12,metal:.25,glowK:3.2});
  for(let v=0;v<3;v++){const t=buildTree(v,seed+v*7);instance([{geo:t.trunk,mat:mTrunk},{geo:t.canopy,mat:mCan,depth:dCan}],items.tree[v],50,true)}
  for(let v=0;v<3;v++){const m=buildMushroom(v,seed+v);instance([{geo:m.geo,mat:mMush}],items.mush[v],50,true);
    instance([{geo:m.geo,mat:mMushS}],items.mushS.filter(i=>i.v===v),50,false)}
  for(let v=0;v<6;v++){const rg=buildRock(seed+v,1);instance([{geo:rg,mat:mRock}],items.rock.filter(i=>i.v===v),50,true);
    instance([{geo:rg,mat:mRock}],items.rockM.filter(i=>i.v===v),50,false);instance([{geo:rg,mat:mRock}],items.pebble.filter(i=>i.v===v),50,false,true)}
  for(let v=0;v<3;v++){const cg=buildCrystalCluster(seed+v*3,v);instance([{geo:cg,mat:mCry}],items.crystal[v],50,true);instance([{geo:cg,mat:mCry}],items.crystalS.filter(i=>i.v===v),50,false)}
  instance([{geo:buildFern(seed),mat:mFern}],items.fern,25,false);
  instance([{geo:buildBulbPlant(seed),mat:mBulb}],items.bulb,25,false);
  instance([{geo:buildGrassTuft(seed),mat:mGrass}],items.grass,20,false);

  // ---------- decals ----------
  const decalStatic=(kind,count,rad0,rad1,colors,additive,filter,tint=1)=>{
    const gb=new GB();const map=soft(kind);let n=0;
    for(let a=0;a<count*20&&n<count;a++){const [x,z]=pt(108);if(waterDepth(x,z)>-.15)continue;sample(x,z);if(!filter(x,z,bio))continue;
      const rad=lerp(rad0,rad1,R()),rot=R()*6.28,c=colors[R()*colors.length|0],sg=5,base=gb.count;
      for(let j=0;j<=sg;j++)for(let i=0;i<=sg;i++){const u=i/sg*2-1,v=j/sg*2-1,cs=Math.cos(rot),sn=Math.sin(rot),xx=x+(u*cs-v*sn)*rad,zz=z+(u*sn+v*cs)*rad;
        gb.vert(xx,heightAt(xx,zz)+.05,zz,0,1,0,i/sg,j/sg,c[0]*tint,c[1]*tint,c[2]*tint,0,0)}
      for(let j=0;j<sg;j++)for(let i=0;i<sg;i++){const q=base+j*(sg+1)+i;gb.tri(q,q+sg+1,q+1);gb.tri(q+1,q+sg+1,q+sg+2)}n++}
    const geo=gb.build();const mat=additive?new THREE.MeshBasicMaterial({map,transparent:true,vertexColors:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})
      :new THREE.MeshStandardMaterial({map,transparent:true,vertexColors:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const m=new THREE.Mesh(geo,mat);m.receiveShadow=!additive;m.renderOrder=1;m.frustumCulled=false;root.add(m);return m};
  decalStatic('litter',320,1.4,3.2,[[.7,.5,.9],[.4,.8,.7],[.9,.6,.7],[.5,.6,.9]],false,(x,z,b)=>b.moss+b.soil>.5&&b.rock<.3,.8);
  decalStatic('crack',130,1.5,3.6,[[.5,.5,.5]],false,(x,z,b)=>b.soil>.45&&Math.hypot(x,z)>8,1);
  decalStatic('moss',220,1.5,4,[[.12,.45,.3],[.1,.38,.35],[.2,.5,.2]],false,(x,z,b)=>b.soil+b.rock>.4&&b.sand<.3,1);
  decalStatic('spores',170,1.5,3.6,[[.1,.9,1],[1,.3,.9],[.6,1,.5]],true,(x,z,b)=>b.moss+b.vein>.4,.8);
  // glowing ring-crack around spawn (rift scar)
  {const gb=new GB();const map=soft('crack'),sg=5;for(let k=0;k<7;k++){const a=k/7*6.28+R()*.5,d=8+R()*3,x=Math.cos(a)*d,z=Math.sin(a)*d,rad=2+R()*1.5,rot=R()*6.28,base=gb.count;
      for(let j=0;j<=sg;j++)for(let i=0;i<=sg;i++){const u=i/sg*2-1,v=j/sg*2-1,cs=Math.cos(rot),sn=Math.sin(rot),xx=x+(u*cs-v*sn)*rad,zz=z+(u*sn+v*cs)*rad;gb.vert(xx,heightAt(xx,zz)+.05,zz,0,1,0,i/sg,j/sg,.5,.5,.5,0,0)}
      for(let j=0;j<sg;j++)for(let i=0;i<sg;i++){const q=base+j*(sg+1)+i;gb.tri(q,q+sg+1,q+1);gb.tri(q+1,q+sg+1,q+sg+2)}}
    const m=new THREE.Mesh(gb.build(),new THREE.MeshStandardMaterial({map,transparent:true,vertexColors:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));m.renderOrder=1;m.frustumCulled=false;m.receiveShadow=true;root.add(m)}

  // dynamic decals (scorch/ichor/glow) ring buffer
  const DYN=56,dyn=[];let dynI=0;const dmaps={scorch:soft('scorch'),ichor:soft('ichor'),glow:soft('glow')};
  for(let k=0;k<DYN;k++){const sg=6,geo=new THREE.BufferGeometry(),pos=new Float32Array((sg+1)*(sg+1)*3),uv=new Float32Array((sg+1)*(sg+1)*2),idx=[];
    for(let j=0;j<=sg;j++)for(let i=0;i<=sg;i++){uv[(j*(sg+1)+i)*2]=i/sg;uv[(j*(sg+1)+i)*2+1]=j/sg}
    for(let j=0;j<sg;j++)for(let i=0;i<sg;i++){const q=j*(sg+1)+i;idx.push(q,q+sg+1,q+1,q+1,q+sg+1,q+sg+2)}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));geo.setIndex(idx);
    const mat=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
    const m=new THREE.Mesh(geo,mat);m.visible=false;m.frustumCulled=false;m.renderOrder=2;root.add(m);dyn.push({m,life:0,max:1,fade:1,add:false})}
  function addDecal(type,pos,radius=1.5,opts={}){
    const d=dyn[dynI++%DYN],sg=6,rot=opts.rot??R()*6.28,x=pos.x,z=pos.z;const p=d.m.geometry.attributes.position;
    for(let j=0;j<=sg;j++)for(let i=0;i<=sg;i++){const u=i/sg*2-1,v=j/sg*2-1,cs=Math.cos(rot),sn=Math.sin(rot),xx=x+(u*cs-v*sn)*radius,zz=z+(u*sn+v*cs)*radius;p.setXYZ(j*(sg+1)+i,xx,heightAt(xx,zz)+.07,zz)}
    p.needsUpdate=true;const mat=d.m.material;mat.map=dmaps[type]||dmaps.scorch;
    const col=opts.color!==undefined?new THREE.Color(opts.color):type==='ichor'?new THREE.Color(.25,.9,.35):type==='glow'?new THREE.Color(.3,.8,1):new THREE.Color(1,1,1);
    mat.color.copy(col);mat.blending=type==='glow'?THREE.AdditiveBlending:THREE.NormalBlending;mat.opacity=1;mat.needsUpdate=true;
    d.m.visible=true;d.life=opts.life??(type==='glow'?2:40);d.max=d.life;d.base=opts.opacity??1;return d}

  // ---------- water ----------
  const wmat=waterMat(noiseTex);
  for(const p of pools){const gb=new GB(),A=56,RN=16,rows=[];const depths=[];
    const pos=[],dep=[],idx=[];
    for(let i=0;i<=RN;i++)for(let a=0;a<A;a++){const ang=a/A*6.2832,f=i/RN,rr=hf.rn(p,ang)*1.5*f,x=p.x+Math.cos(ang)*rr,z=p.z+Math.sin(ang)*rr;
      pos.push(x,p.level,z);dep.push(p.level-heightAt(x,z))}
    for(let i=0;i<RN;i++)for(let a=0;a<A;a++){const a2=(a+1)%A,q=i*A+a,q2=i*A+a2,r=(i+1)*A+a,r2=(i+1)*A+a2;idx.push(q,r,q2,q2,r,r2)}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('aDepth',new THREE.Float32BufferAttribute(dep,1));geo.setIndex(idx);geo.computeBoundingSphere();
    const m=new THREE.Mesh(geo,wmat);m.renderOrder=1;root.add(m)}

  // ---------- spores ----------
  const SN=420,sp=new Float32Array(SN*3),sa=new Float32Array(SN*4),sc=new Float32Array(SN*3);
  for(let i=0;i<SN;i++){sp[i*3]=(R()-.5)*70;sp[i*3+1]=R()*16;sp[i*3+2]=(R()-.5)*70;sa[i*4]=R();sa[i*4+1]=.3+R()*1.2;sa[i*4+2]=R();sa[i*4+3]=.5+R()*1.1;
    const c=R()<.6?[.1,.45,.5]:R()<.6?[.5,.18,.45]:[.35,.5,.2];sc[i*3]=c[0];sc[i*3+1]=c[1];sc[i*3+2]=c[2]}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));sg.setAttribute('aS',new THREE.BufferAttribute(sa,4));sg.setAttribute('aCol',new THREE.BufferAttribute(sc,3));
  sg.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e5);const sMat=sporeMat(),spores=new THREE.Points(sg,sMat);spores.frustumCulled=false;spores.renderOrder=3;root.add(spores);

  // ---------- API ----------
  function blocked(x,z,r=0){
    const lim=WORLD/2-1.5;if(x<-lim+r||x>lim-r||z<-lim+r||z>lim-r)return true;
    if(waterDepth(x,z)>.8)return true;
    const rr=r+maxPR;for(let i=Math.floor((x-rr)/CELL);i<=Math.floor((x+rr)/CELL);i++)for(let j=Math.floor((z-rr)/CELL);j<=Math.floor((z+rr)/CELL);j++){
      const a=phash.get(i*73856093^j*19349663);if(a)for(const p of a){if(!p.alive)continue;const dx=p.pos.x-x,dz=p.pos.z-z,q=p.radius+r;if(dx*dx+dz*dz<q*q)return true}}
    return false}
  function kill(p){if(!p.alive)return;p.alive=false;if(p._ms)for(const m of p._ms){m.setMatrixAt(p._i,ZERO);m.instanceMatrix.needsUpdate=true}
    ctx.fx?.burst?.('explosion',p.pos.clone().setY(p.pos.y+.8),{color:p.type==='crystal'?0x55ddff:p.type==='tree'?0x66ffaa:0xaaaaaa,scale:.6});ctx.audio?.play?.('hit',p.pos);
    const i=resourceNodes.indexOf(p);if(i>=0)resourceNodes.splice(i,1)}
  function harvest(p,n=10){if(!p||!p.alive)return 0;const t=Math.min(n,p.amount);p.amount-=t;p.hp=p.amount;if(p.amount<=0)kill(p);return t}
  function normalAt(x,z,out=new THREE.Vector3()){const e=.6;return out.set(heightAt(x-e,z)-heightAt(x+e,z),2*e,heightAt(x,z-e)-heightAt(x,z+e)).normalize()}
  function randomFreePoint(minR=20,maxR=80,r=1,cx=0,cz=0){for(let i=0;i<60;i++){const a=Math.random()*6.283,d=minR+Math.random()*(maxR-minR),x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;if(!blocked(x,z,r))return new THREE.Vector3(x,heightAt(x,z),z)}return new THREE.Vector3(cx+minR,0,cz)}
  const api={heightAt,blocked,size:WORLD,props,resourceNodes,harvest,damageProp:harvest,addDecal,normalAt,randomFreePoint,
    isWater:(x,z)=>waterDepth(x,z)>.05,waterDepth,pools,biomeAt:(x,z)=>({...sample(x,z)}),mesh:terrainMesh,hf,
    nearestNode(x,z,range=6,res){let best=null,bd=range*range;for(const p of resourceNodes){if(res&&p.res!==res)continue;const dx=p.pos.x-x,dz=p.pos.z-z,d=dx*dx+dz*dz;if(d<bd){bd=d;best=p}}return best},_debug:{alb,nrm,splat,items,meshes}};

  const tmpT=new THREE.Vector3();
  api._dyn=dyn;api._spore=sMat;
  console.log('[terrain] built in',Math.round(performance.now()-t0),'ms; props',props.length,'grass',items.grass.length,'ferns',items.fern.length,'meshes',meshes.length);
  return api}

export function update(dt,ctx){
  U.uTime.value=ctx.time;
  const T=ctx.terrain;if(!T)return;
  const pp=ctx.player?.pos;if(pp&&isFinite(pp.x))U.uTgt.value.set(pp.x,(pp.y||0)+1.2,pp.z);else U.uTgt.value.set(0,1.2,0);
  U.uCam.value.copy(ctx.camera.position);
  const sp=ctx.lighting?.sun?.position;if(sp)U.uSun.value.copy(sp).normalize();
  T._spore.uniforms.uC.value.set(U.uTgt.value.x,0,U.uTgt.value.z);
  for(const d of T._dyn){if(!d.m.visible)continue;d.life-=dt;if(d.life<=0){d.m.visible=false;continue}
    const f=Math.min(1,d.life/Math.min(d.max*.4,8));d.m.material.opacity=f*(d.base??1)}
}
