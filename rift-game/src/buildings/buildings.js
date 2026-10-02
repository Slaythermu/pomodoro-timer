// Base building system: grid placement, procedural models, construction, turrets, economy, power network.
import * as THREE from 'three';
import {builders,SPECS,ORDER} from './models.js';
import {mats} from './gfx.js';
import {VFX} from './vfx.js';
import {BuildUI} from './ui.js';

const CELL=2,LINK=17,TAU=Math.PI*2;
const cv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
function rng(seed){let s=seed>>>0;return()=>((s=Math.imul(s^s>>>15,1|s)+0x6D2B79F5|0),((s^s>>>7)>>>0)/4294967296)}
const angDiff=(a,b)=>{let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d};

export function init(ctx){
  const {scene,renderer}=ctx;renderer.localClippingEnabled=true;
  const vfx=new VFX(ctx);ctx.__vfx=vfx;
  const M=mats(renderer);
  const list=[];let nextId=1,dirty=true,tracers=[],shells=[],wrecks=[];
  const st={mode:null,menu:false,uiHover:false,lmb:false,click:false,cancel:false,msg:undefined,lastCell:'',edges:[],supply:6,demand:0,sat:1};
  const H=(x,z)=>ctx.terrain?.heightAt?.(x,z)||0;
  const spec=t=>SPECS[t];
  const halfOf=t=>spec(t).cells*CELL/2;
  const snap=(t,x,z)=>{const c=spec(t).cells;return c%2?[(Math.floor(x/CELL)+.5)*CELL,(Math.floor(z/CELL)+.5)*CELL]:[Math.round(x/CELL)*CELL,Math.round(z/CELL)*CELL]};
  const cost=(t)=>spec(t).cost;
  const afford=t=>{for(const k in cost(t))if((ctx.state.res[k]||0)<cost(t)[k])return false;return true};

  // ---------- resource nodes (owned by terrain: ctx.terrain.resourceNodes) ----------
  const nodeInfo={carbon:{amt:5,col:'#ff9d3a',beam:0xff9a30},steel:{amt:4,col:'#a8cdf5',beam:0x9fc4ff},crystal:{amt:3,col:'#4be8ff',beam:0x35e8ff}};
  const nodes=ctx.terrain?.resourceNodes||[];
  function nodeNear(x,z,extra=3.2){let best=null,bd=1e9;for(const n of nodes){if(!n.alive||!n.res||n.amount<=0)continue;const d=Math.hypot(n.pos.x-x,n.pos.z-z);if(d<n.radius+extra&&d<bd){bd=d;best=n}}return best}
  // harvester snap: sit beside the nearest node, toward the cursor
  function harvSnap(ax,az){const n=nodeNear(ax,az,4.2);if(!n)return null;let dx=ax-n.pos.x,dz=az-n.pos.z;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;const d=n.radius+2.7;
    return [Math.round((n.pos.x+dx*d)/CELL)*CELL,Math.round((n.pos.z+dz*d)/CELL)*CELL,n]}

  // ---------- ghost ----------
  const ghostFill=new THREE.MeshBasicMaterial({color:0x44ff88,transparent:true,opacity:.34,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const ghostWire=new THREE.MeshBasicMaterial({color:0x88ffbb,transparent:true,opacity:.35,wireframe:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const ghosts={};let ghost=null;
  const gridMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uC:{value:new THREE.Color(0x35e8ff)},uT:{value:0},uSz:{value:44}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform vec3 uC;uniform float uT,uSz;void main(){vec2 p=vUv*uSz*.5;vec2 f=abs(fract(p)-.5);float l=smoothstep(.47,.5,max(f.x,f.y));float d=length(vUv-.5)*2.;float fade=smoothstep(1.,.15,d);float ring=.5+.5*sin(d*18.-uT*3.);gl_FragColor=vec4(uC*(l*(.7+ring*.6)),l*fade*.75);}`});
  const grid=new THREE.Mesh(new THREE.PlaneGeometry(44,44),gridMat);grid.rotation.x=-Math.PI/2;grid.visible=false;grid.renderOrder=3;scene.add(grid);
  const sqc=cv(128,128),sg=sqc.getContext('2d');sg.strokeStyle='#fff';sg.lineWidth=6;sg.strokeRect(5,5,118,118);sg.lineWidth=2;for(let i=1;i<4;i++){sg.beginPath();sg.moveTo(i*32,8);sg.lineTo(i*32,120);sg.moveTo(8,i*32);sg.lineTo(120,i*32);sg.stroke()}sg.fillStyle='rgba(255,255,255,.18)';sg.fillRect(5,5,118,118);
  const sqTex=new THREE.CanvasTexture(sqc);
  const pad=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:sqTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,color:0x44ff88}));pad.rotation.x=-Math.PI/2;pad.visible=false;pad.renderOrder=4;scene.add(pad);
  const rangeRing=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:vfx.ringTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,opacity:.5,color:0xffffff}));rangeRing.rotation.x=-Math.PI/2;rangeRing.visible=false;rangeRing.renderOrder=3;scene.add(rangeRing);
  function getGhost(t){if(ghosts[t])return ghosts[t];const m=builders[t]();m.finalize();const g=new THREE.Group();g.add(m.root);
    const wire=m.root.clone(true);g.add(wire);
    m.root.traverse(o=>{if(o.isMesh){o.material=ghostFill;o.castShadow=false}});wire.traverse(o=>{if(o.isMesh){o.material=ghostWire;o.castShadow=false}});
    g.visible=false;scene.add(g);return ghosts[t]={g,m,wire}}

  // ---------- cells / validation ----------
  const aabbHit=(x,z,h)=>{for(const b of list){if(!b.alive)continue;if(Math.abs(b.pos.x-x)<b.half+h-.01&&Math.abs(b.pos.z-z)<b.half+h-.01)return b}return null};
  function nodeAt(x,z,r=2.2){let best=null,bd=1e9;for(const n of nodes){const d=Math.hypot(n.pos.x-x,n.pos.z-z);if(d<r&&d<bd){bd=d;best=n}}return best}
  function check(t,x,z){
    const h=halfOf(t);
    if(ctx.state.over)return 'Base lost';
    if(!afford(t))return 'Insufficient resources';
    if(t==='harvester'&&nodeNear(x,z,3.6)){/* beside a resource node: allowed even though the node itself is solid */}
    else if(ctx.terrain?.blocked?.(x,z,h*.9))return 'Terrain blocked';
    if(aabbHit(x,z,h))return 'Area occupied';
    if(t==='harvester'){const n=nodeNear(x,z,3.6);if(!n)return 'Needs a resource node nearby';if(list.some(o=>o.alive&&o.node===n))return 'Node already tapped'}
    return null}

  // ---------- construction visuals ----------
  const scafMat=new THREE.MeshStandardMaterial({color:0xd89a3a,metalness:.7,roughness:.45,emissive:0x442200,emissiveIntensity:.8});
  const scafCache=new Map(),origMat=new WeakMap();
  function scaffold(half,h){const k=half+'_'+h;let g=scafCache.get(k);if(g)return g.clone();g=new THREE.Group();const geos=[];const bx=(w,hh,d,x,y,z,rx=0,ry=0,rz=0)=>{const q=new THREE.BoxGeometry(w,hh,d);q.rotateX(rx);q.rotateY(ry);q.rotateZ(rz);q.translate(x,y,z);geos.push(q)};
    const e=half*.96,nL=Math.max(2,Math.round(h/1.2));
    for(const sx of [-1,1])for(const sz of [-1,1])bx(.1,h,.1,sx*e,h/2,sz*e);
    for(let i=0;i<=nL;i++){const y=i*h/nL;bx(e*2,.06,.06,0,y,e);bx(e*2,.06,.06,0,y,-e);bx(.06,.06,e*2,e,y,0);bx(.06,.06,e*2,-e,y,0);
      if(i<nL){const L=Math.hypot(e*2,h/nL),a=Math.atan2(h/nL,e*2);bx(L,.04,.04,0,y+h/nL/2,e,0,0,i%2?a:-a);bx(L,.04,.04,0,y+h/nL/2,-e,0,0,i%2?-a:a)}}
    for(const q of geos){const m=new THREE.Mesh(q,scafMat);g.add(m)}scafCache.set(k,g);return g.clone()}

  function startConstruct(b){
    b.group.traverse(o=>{if(o.isMesh){origMat.set(o,o.material);const c=o.material.clone();c.clippingPlanes=[b.clipBelow];c.clipShadows=true;o.material=c}});
    b.holoMat=new THREE.MeshBasicMaterial({color:0x35e8ff,transparent:true,opacity:.28,wireframe:false,depthWrite:false,blending:THREE.AdditiveBlending,clippingPlanes:[b.clipAbove],toneMapped:false,side:THREE.DoubleSide});
    b.holoWire=new THREE.MeshBasicMaterial({color:0x88f4ff,transparent:true,opacity:.45,wireframe:true,depthWrite:false,blending:THREE.AdditiveBlending,clippingPlanes:[b.clipAbove],toneMapped:false});
    const mk=m=>{const c=b.model.root.clone(true);c.traverse(o=>{if(o.isMesh){o.material=m;o.castShadow=false}});return c};
    b.holo=new THREE.Group();b.holo.add(mk(b.holoMat),mk(b.holoWire));b.group.add(b.holo);
    b.scaf=scaffold(b.half,b.model.H*1.06);b.group.add(b.scaf);
    b.scan=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:sqTex,color:0x66f6ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide}));
    b.scan.rotation.x=-Math.PI/2;b.scan.scale.setScalar(b.half*2*1.02);b.group.add(b.scan)}
  function endConstruct(b){
    b.group.traverse(o=>{if(o.isMesh&&origMat.has(o)){o.material.dispose();o.material=origMat.get(o);origMat.delete(o)}});
    if(b.holo){b.group.remove(b.holo);b.holoMat.dispose();b.holoWire.dispose()}b.holo=null;
    if(b.scaf){b.group.remove(b.scaf);b.scaf=null}if(b.scan){b.group.remove(b.scan);b.scan.material.dispose();b.scan=null}
    b.built=true;b.prog=1;const p=b.pos;
    ctx.fx?.burst?.('build',p.clone(),{scale:b.half});vfx.spark(p.x,p.y+1,p.z,22,8,0x7ff4ff);vfx.ring(p.x,p.y,p.z,b.half*.8,b.half*2.6,0x35e8ff,.9);vfx.flash(p.x,p.y+b.model.H*.5,p.z,b.half*2.2,0x66f0ff,.25);
    ctx.audio?.play?.('build',p);ctx.lighting?.addLight?.(p.clone().setY(p.y+2),0x44e8ff,3,10);ctx.ev.emit('build',{pos:p,type:b.type,building:b});
    if(b.type==='wall')wallRefresh(b);dirty=true}

  // ---------- place ----------
  function place(type,pos,opts={}){
    const s=spec(type);if(!s)return null;
    let x,z;if(opts.exact){x=pos.x;z=pos.z}else{[x,z]=snap(type,pos.x,pos.z)}
    if(!opts.force){const why=check(type,x,z);if(why&&!(opts.free&&why==='Insufficient resources')){st.msg=`<i>${why}</i>`;return null}}
    if(!opts.free)for(const k in s.cost)ctx.state.res[k]-=s.cost[k];
    const y=H(x,z);const model=builders[type]();model.finalize();
    const group=new THREE.Group();group.position.set(x,y-.12,z);group.add(model.root);scene.add(group);
    const half=halfOf(type);
    const b={id:nextId++,type,pos:new THREE.Vector3(x,y,z),half,radius:type==='core'?3.7:half*.92,hp:s.hp,maxHp:s.hp,alive:true,built:false,prog:0,model,group,eff:1,yaw:0,t:Math.random()*5,timer:Math.random(),hurt:0,lastHit:-9,ctx,net:true,power:s.power||0,buildTime:opts.instant||type==='core'?0:(s.build||3),smokeT:0,name:s.name};
    b.clipBelow=new THREE.Plane(new THREE.Vector3(0,-1,0),y);b.clipAbove=new THREE.Plane(new THREE.Vector3(0,1,0),-y);
    if(type==='harvester')b.node=nodeNear(x,z,3.6);
    list.push(b);
    if(b.buildTime>0){startConstruct(b);if(type==='wall')wallRefresh(b)}else endConstructQuiet(b);
    if(type==='wall')for(const o of wallNeighbors(b))wallRefresh(o);
    ctx.audio?.play?.('build',b.pos);dirty=true;return b}
  function endConstructQuiet(b){b.built=true;b.prog=1;if(b.type==='wall')wallRefresh(b)}

  // walls
  function wallAt(x,z){for(const o of list)if(o.alive&&o.type==='wall'&&Math.abs(o.pos.x-x)<.5&&Math.abs(o.pos.z-z)<.5)return o;return null}
  function wallNeighbors(b){return [wallAt(b.pos.x,b.pos.z+CELL),wallAt(b.pos.x+CELL,b.pos.z),wallAt(b.pos.x,b.pos.z-CELL),wallAt(b.pos.x-CELL,b.pos.z)].filter(Boolean)}
  function wallRefresh(b){const arms=b.model.arms;if(!arms)return;const ns=[[0,CELL],[CELL,0],[0,-CELL],[-CELL,0]];for(let i=0;i<4;i++)arms[i].visible=!!wallAt(b.pos.x+ns[i][0],b.pos.z+ns[i][1])}
  function wallArmsFor(m,x,z){const ns=[[0,CELL],[CELL,0],[0,-CELL],[-CELL,0]];for(let i=0;i<4;i++){const v=!!wallAt(x+ns[i][0],z+ns[i][1]);for(const g of [m.arms[i]])g.visible=v}}

  // ---------- damage / destroy ----------
  function damage(b,n,from){
    if(!b||!b.alive||n<=0)return;
    if(b.type==='core')n*=.6;
    b.hp-=n;b.lastHit=ctx.time;b.hurt=.18;
    if(Math.random()<.4)vfx.spark(b.pos.x+(Math.random()-.5)*b.half,b.pos.y+1+Math.random()*b.model.H*.5,b.pos.z+(Math.random()-.5)*b.half,3,4);
    if(b.hp<=0)destroy(b)}
  function destroy(b){
    if(!b.alive)return;b.alive=false;b.hp=0;const p=b.pos,sz=b.type==='core'?2.4:b.half/1.6;
    ctx.fx?.burst?.('explosion',p.clone().setY(p.y+1),{scale:sz});if(b.type==='core'||b.half>1.5)ctx.fx?.burst?.('explosion',p.clone().setY(p.y+2.5),{scale:sz*.8});
    vfx.flash(p.x,p.y+1.5,p.z,b.half*3.5,0xffc060,.35);vfx.flash(p.x,p.y+1.5,p.z,b.half*2,0xffffff,.15);
    vfx.spark(p.x,p.y+1,p.z,40,13,0xffb050);vfx.debris(p,Math.min(40,Math.round(10+b.half*8)),Math.max(.7,b.half/1.4));vfx.ring(p.x,p.y,p.z,1,b.half*5,0xffa040,.6);
    for(let i=0;i<14;i++)vfx.smoke(p.x+(Math.random()-.5)*b.half,p.y+1,p.z+(Math.random()-.5)*b.half,2.2,0x2a2826);
    vfx.scorchAt(p.x,p.y,p.z,b.half*1.5);wrecks.push({p:p.clone(),t:5,h:b.half});
    ctx.postfx?.shake?.(b.type==='core'?1.5:.5);ctx.audio?.play?.('explosion',p);ctx.lighting?.addLight?.(p.clone().setY(p.y+2),0xff9a40,8,18);
    scene.remove(b.group);b.group.traverse(o=>{if(o.isMesh){o.geometry.dispose?.()}});
    ctx.ev.emit('building-destroyed',{building:b,pos:p,type:b.type});
    if(b.type==='wall')for(const o of wallNeighbors(b))wallRefresh(o);
    if(b.type==='core'){ctx.state.over=true;ctx.ev.emit('gameover',{reason:'core'})}
    dirty=true}

  // ---------- power network & lines ----------
  const lineMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uT:{value:0}},
    vertexShader:`attribute vec3 col;varying vec2 vUv;varying vec3 vC;void main(){vUv=uv;vC=col;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vC;uniform float uT;void main(){float e=smoothstep(1.,.1,abs(vUv.y));float p=pow(.5+.5*sin(vUv.x*1.1-uT*5.),8.);float p2=pow(.5+.5*sin(vUv.x*.6-uT*2.3+2.),10.);vec3 c=vC*(.25+1.3*p+.7*p2);gl_FragColor=vec4(c*e,e*(.5+.4*p));}`});
  const lines=new THREE.Mesh(new THREE.BufferGeometry(),lineMat);lines.frustumCulled=false;lines.renderOrder=6;scene.add(lines);
  const conn=b=>({x:b.pos.x,y:b.pos.y+Math.min(1.5,b.model.H*.35),z:b.pos.z});
  function recompute(){
    const net=list.filter(b=>b.alive&&b.built&&b.type!=='wall');
    const nb=new Map(net.map(b=>[b,[]]));const edges=[];const seen=new Set();
    for(const a of net){const near=net.filter(o=>o!==a).map(o=>[o,Math.hypot(o.pos.x-a.pos.x,o.pos.z-a.pos.z)-o.half*.5-a.half*.5]).filter(e=>e[1]<LINK).sort((p,q)=>p[1]-q[1]).slice(0,3);
      for(const [o] of near){const k=Math.min(a.id,o.id)+'_'+Math.max(a.id,o.id);if(seen.has(k))continue;seen.add(k);edges.push([a,o]);nb.get(a).push(o);nb.get(o).push(a)}}
    const core=net.find(b=>b.type==='core'),vis=new Set();
    if(core){const q=[core];vis.add(core);while(q.length){const c=q.pop();for(const o of nb.get(c))if(!vis.has(o)){vis.add(o);q.push(o)}}}
    let sup=core?6:0,dem=0;for(const b of net){b.net=vis.has(b);if(b.net){if(b.power<0)sup+=-b.power;else dem+=b.power}}
    const sat=dem>0?Math.min(1,sup/dem):1;st.supply=sup;st.demand=dem;st.sat=sat;
    for(const b of net)b.eff=b.type==='generator'||b.type==='core'?1:(b.net?sat:.3);
    ctx.state.power={supply:sup,demand:dem};
    // ribbons
    const P=[],U=[],C=[],I=[];let vi=0;
    for(const [a,o] of edges){const A=conn(a),B=conn(o),L=Math.hypot(B.x-A.x,B.z-A.z)||1,dx=(B.x-A.x)/L,dz=(B.z-A.z)/L,nx=-dz*.045,nz=dx*.045,n=Math.max(6,Math.ceil(L/1.5));
      const ok=a.net&&o.net;const col=ok?(sat<.6?[1,.55,.15]:[.2,.9,1]):[.9,.2,.15];
      for(let i=0;i<=n;i++){const t=i/n,x=A.x+(B.x-A.x)*t,z=A.z+(B.z-A.z)*t,y=Math.max(H(x,z)+.5,A.y+(B.y-A.y)*t-Math.sin(t*Math.PI)*.0)+Math.sin(t*Math.PI)*.45-.6*Math.sin(t*Math.PI)*0+0;const yy=Math.max(H(x,z)+.35,(A.y+(B.y-A.y)*t)*(1-Math.sin(t*Math.PI)*.55)+.1);
        P.push(x+nx,yy,z+nz,x-nx,yy,z-nz);U.push(t*L,1,t*L,-1);C.push(...col,...col);if(i<n){I.push(vi,vi+1,vi+2,vi+1,vi+3,vi+2)}vi+=2}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));g.setAttribute('col',new THREE.Float32BufferAttribute(C,3));g.setIndex(I);
    lines.geometry.dispose();lines.geometry=g;dirty=false}

  // ---------- combat helpers ----------
  const _v=new THREE.Vector3(),_w=new THREE.Vector3();
  function nearestEnemy(p,range,min=0){let best=null,bd=range*range;const l=ctx.enemies?.list;if(!l)return null;for(let i=0;i<l.length;i++){const e=l[i];if(!e.alive)continue;const dx=e.pos.x-p.x,dz=e.pos.z-p.z,d=dx*dx+dz*dz;if(d<bd&&d>=min*min&&e.pos.y===e.pos.y){bd=d;best=e}}return best}
  function hurtEnemy(e,n,from){if(ctx.enemies?.damage)ctx.enemies.damage(e,n,from&&from.pos?from.pos:from);else e.hp-=n}
  function stepTurret(b,dt){
    b.retarget=(b.retarget||0)-dt;if(b.retarget<=0||(b.target&&!b.target.alive)){b.retarget=.15+Math.random()*.1;b.target=nearestEnemy(b.pos,spec('turret').range)}
    const e=b.target;b.cd=(b.cd||0)-dt;if(!e)return;
    const want=Math.atan2(e.pos.x-b.pos.x,e.pos.z-b.pos.z),d=angDiff(b.yaw,want),turn=7*dt;b.yaw+=Math.abs(d)<turn?d:Math.sign(d)*turn;
    if(Math.abs(d)<.12&&b.cd<=0){b.cd=.11/Math.max(.3,b.eff);b.alt=!b.alt;
      const tip=b.model.tips[b.alt?1:0];tip.getWorldPosition(_v);if(b.alt)b.rec1=1;else b.rec0=1;
      const ty=e.pos.y+.7,j=.25;_w.set(e.pos.x+(Math.random()-.5)*j,ty,e.pos.z+(Math.random()-.5)*j);
      tracers.push({a:_v.clone(),b:_w.clone(),t:0,dur:Math.max(.03,_v.distanceTo(_w)/110)});
      vfx.flash(_v.x,_v.y,_v.z,1.1,0xffd89a,.07);vfx.fireP.emit(_v.x,_v.y,_v.z,0,0,0,.05,.5,1.6,0xffffff,1);
      ctx.fx?.burst?.('muzzle',_v.clone(),{dir:new THREE.Vector3(Math.sin(b.yaw),0,Math.cos(b.yaw))});
      if(b.shots=(b.shots||0)+1,b.shots%3===0){ctx.audio?.play?.('shoot',b.pos);ctx.lighting?.addLight?.(_v.clone(),0xffc070,2.2,7)}
      hurtEnemy(e,9*(.6+.4*b.eff),b);ctx.fx?.burst?.('impact',_w.clone());vfx.spark(_w.x,_w.y,_w.z,2,3,0xffd090)}
  }
  function stepPlasma(b,dt){
    b.retarget=(b.retarget||0)-dt;if(b.retarget<=0||(b.target&&!b.target.alive)){b.retarget=.2;b.target=nearestEnemy(b.pos,spec('plasma').range)}
    const e=b.target;b.cd=(b.cd||0)-dt;const orb=b.model.orbTip;orb.getWorldPosition(_v);
    if(!e){if(Math.random()<dt*2.2){const i=Math.floor(Math.random()*3),t1=b.model.tips[i],t2=b.model.tips[(i+1)%3];t1.getWorldPosition(_w);const o2=new THREE.Vector3();t2.getWorldPosition(o2);b.idleArc={a:_w.clone(),b:o2,t:.12}}
      if(b.idleArc&&(b.idleArc.t-=dt)>0)vfx.lightning(b.idleArc.a,_v,0xb455ff,.04,.2,4);return}
    _w.set(e.pos.x,e.pos.y+.8,e.pos.z);vfx.lightning(_v,_w,0xc070ff,.14,.9,11);vfx.fireP.emit(_w.x,_w.y,_w.z,0,0,0,.1,1.4,2.4,0xcc88ff,.9);
    if(Math.random()<dt*14)vfx.spark(_w.x,_w.y,_w.z,3,5,0xe0b0ff);
    if(b.cd<=0){b.cd=.1;const dmg=(3+2.6*b.eff);hurtEnemy(e,dmg,b);let chain=0;const l=ctx.enemies.list;
      for(let i=0;i<l.length&&chain<3;i++){const o=l[i];if(o===e||!o.alive)continue;if(Math.hypot(o.pos.x-e.pos.x,o.pos.z-e.pos.z)<5){hurtEnemy(o,dmg*.6,b);chain++;const A=new THREE.Vector3(e.pos.x,e.pos.y+.8,e.pos.z),B=new THREE.Vector3(o.pos.x,o.pos.y+.8,o.pos.z);b.chains=b.chains||[];b.chains.push({a:A,b:B,t:.09})}}
      ctx.fx?.burst?.('impact',_w.clone());if(Math.random()<.2){ctx.audio?.play?.('hit',b.pos);ctx.lighting?.addLight?.(_w.clone(),0xc070ff,2.5,8)}}
    if(b.chains){for(const c of b.chains)if((c.t-=dt)>0)vfx.lightning(c.a,c.b,0xc070ff,.09,.6,6);b.chains=b.chains.filter(c=>c.t>0)}
  }
  function stepMortar(b,dt){
    const sp=spec('mortar');b.retarget=(b.retarget||0)-dt;if(b.retarget<=0||(b.target&&!b.target.alive)){b.retarget=.5;b.target=nearestEnemy(b.pos,sp.range,8)}
    b.cd=(b.cd||0)-dt;const e=b.target;if(!e)return;
    const dist=Math.hypot(e.pos.x-b.pos.x,e.pos.z-b.pos.z);
    const want=Math.atan2(e.pos.x-b.pos.x,e.pos.z-b.pos.z),d=angDiff(b.yaw,want),turn=2.2*dt;b.yaw+=Math.abs(d)<turn?d:Math.sign(d)*turn;b.tpitch=THREE.MathUtils.lerp(b.tpitch||0,-.25+dist/sp.range*.55,dt*3);
    if(Math.abs(d)<.1&&b.cd<=0){b.cd=3.2/Math.max(.3,b.eff);b.rec0=1;const tip=b.model.tips[0];tip.getWorldPosition(_v);
      const vx=(e.vel?.x||0),vz=(e.vel?.z||0),fl=.8+dist/38;const tx=e.pos.x+vx*fl,tz=e.pos.z+vz*fl;
      shells.push({a:_v.clone(),b:new THREE.Vector3(tx,H(tx,tz),tz),t:0,dur:fl,h:6+dist*.28,src:b});
      vfx.flash(_v.x,_v.y,_v.z,2.6,0xffc070,.14);for(let i=0;i<6;i++)vfx.smoke(_v.x,_v.y,_v.z,1.2,0x777777);ctx.fx?.burst?.('muzzle',_v.clone(),{dir:new THREE.Vector3(Math.sin(b.yaw),1,Math.cos(b.yaw))});ctx.audio?.play?.('explosion',b.pos);ctx.postfx?.shake?.(.1);ctx.lighting?.addLight?.(_v.clone(),0xffa050,4,10)}
  }
  function stepBeacon(b,dt){
    b.timer-=dt;if(b.timer>0)return;b.timer=1.4/Math.max(.35,b.eff);const R=spec('beacon').range;let healed=false;
    for(const o of list){if(!o.alive||o===b||!o.built||o.hp>=o.maxHp)continue;if(Math.hypot(o.pos.x-b.pos.x,o.pos.z-b.pos.z)<R+o.half){o.hp=Math.min(o.maxHp,o.hp+o.maxHp*.045*b.eff+6);healed=true;ctx.fx?.burst?.('heal',o.pos.clone().setY(o.pos.y+1.5));
      for(let i=0;i<3;i++)vfx.fireP.emit(o.pos.x+(Math.random()-.5)*o.half,o.pos.y+.5,o.pos.z+(Math.random()-.5)*o.half,0,2.5,0,.9,.5,.15,0x55ff99,.9)}}
    const pl=ctx.player?.pos;if(pl&&Math.hypot(pl.x-b.pos.x,pl.z-b.pos.z)<R&&ctx.state.hp<ctx.state.maxHp){ctx.state.hp=Math.min(ctx.state.maxHp,ctx.state.hp+4*b.eff);healed=true;ctx.fx?.burst?.('heal',pl.clone())}
    b.b=0;vfx.ring(b.pos.x,b.pos.y,b.pos.z,1.5,R*2,0x44ff88,1.1,healed?1:.5);if(healed)ctx.audio?.play?.('pickup',b.pos)}
  function stepHarvester(b,dt){
    if(b.node&&(!b.node.alive||b.node.amount<=0))b.node=nodeNear(b.pos.x,b.pos.z,3.6);
    const n=b.node;b.active=!!n;
    if(n){ // mining beam from drill to node
      const a=_v.set(b.pos.x,b.pos.y+2.3,b.pos.z),c=_w.set(n.pos.x,n.pos.y+(n.scale||1)*.8,n.pos.z),col=nodeInfo[n.res]?.beam||0xffffff;
      vfx.lightning(a,c,col,.035,.12,6);
      if(Math.random()<dt*14)vfx.fireP.emit(c.x,c.y,c.z,(Math.random()-.5)*2,1+Math.random()*2,(Math.random()-.5)*2,.5,.4,.1,col,.9);
      const ph=(ctx.time*1.6)%1;vfx.fireP.emit(a.x+(c.x-a.x)*ph,a.y+(c.y-a.y)*ph,a.z+(c.z-a.z)*ph,0,0,0,.12,.45,.2,col,1)}
    b.timer-=dt*Math.max(.15,b.eff);if(b.timer>0)return;b.timer=3.5;
    let t='carbon',amt=1;
    if(n){t=n.res;const want=nodeInfo[t]?.amt||3;amt=ctx.terrain?.harvest?ctx.terrain.harvest(n,want):want}
    if(amt<=0)return;
    ctx.state.res[t]=(ctx.state.res[t]||0)+amt;ctx.ev.emit('resource',{type:t,amount:amt});
    vfx.text('+'+Math.round(amt),b.pos.x,b.pos.y+b.model.H+.4,b.pos.z,nodeInfo[t]?.col||'#ffb030');vfx.spark(b.pos.x,b.pos.y+.6,b.pos.z,5,3,t==='crystal'?0x66f0ff:0xffa040)}

  // ---------- input ----------
  const typing=e=>/INPUT|TEXTAREA/.test(e.target?.tagName||'');
  addEventListener('keydown',e=>{if(typing(e)||e.repeat)return;
    if(e.code==='KeyB'){st.menu=!st.menu;if(!st.menu)api.select(null)}
    else if(e.code==='Escape'){if(st.mode)api.select(null);else st.menu=false}
    else if(/^Digit[1-9]$/.test(e.code)&&st.menu){const t=ORDER[+e.code[5]-1];if(t)api.select(st.mode===t?null:t)}
    ctx.state.building=st.menu||!!st.mode});
  ctx.canvas.addEventListener('mousedown',e=>{if(e.button===0){st.lmb=true;if(st.mode&&!st.uiHover)st.click=true}if(e.button===2&&(st.menu||st.mode))st.cancel=true});
  addEventListener('mouseup',()=>{st.lmb=false});


  const menuItems=ORDER.map((id,i)=>({id,name:SPECS[id].name,key:i+1,cost:SPECS[id].cost,desc:SPECS[id].desc}));
  const api={list,nodes,place,damage,vfx,get mode(){return st.mode},get menu(){return menuItems},get menuOpen(){return st.menu},get selected(){return st.mode},set uiHover(v){st.uiHover=v},get uiHover(){return st.uiHover},specs:SPECS,order:ORDER,
    canPlace:(t,x,z)=>{const [sx,sz]=snap(t,x,z);return !check(t,sx,sz)},snap,
    select(t){if(typeof t==='number')t=ORDER[t]||null;if(t&&!SPECS[t])t=null;st.mode=t;if(t)st.menu=true;ctx.state.building=st.menu||!!st.mode;st.lastCell='';if(!t)hideGhost()},
    open(v=true){st.menu=v;if(!v)api.select(null);ctx.state.building=st.menu||!!st.mode},
    query(x,z,r){return list.filter(b=>b.alive&&Math.hypot(b.pos.x-x,b.pos.z-z)<r+b.radius)},
    power:()=>({supply:st.supply,demand:st.demand}),costs:t=>cost(t)};
  function hideGhost(){grid.visible=pad.visible=rangeRing.visible=false;if(ghost){ghost.g.visible=false;ghost=null}}
  const ui=new BuildUI(api);
  api.core=place('core',{x:0,z:0},{exact:true,free:true,instant:true,force:true});

  const _tv=new THREE.Vector3(),_col=new THREE.Color();
  api.update=function(dt){
    const t=ctx.time;
    // compact list
    for(let i=list.length-1;i>=0;i--)if(!list[i].alive)list.splice(i,1);
    vfx.beginBolts();
    // ---- build mode / ghost ----
    if(st.mode&&!ctx.state.over){
      const aim=ctx.input.aim,[sx,sz]=snap(st.mode,aim.x,aim.z);let px=sx,pz=sz;
      if(st.mode==='harvester'){const hs=harvSnap(aim.x,aim.z);if(hs){px=hs[0];pz=hs[1]}}
      const why=check(st.mode,px,pz);const ok=!why;const gh=getGhost(st.mode);
      if(ghost&&ghost!==gh)ghost.g.visible=false;ghost=gh;gh.g.visible=true;const y=H(px,pz);gh.g.position.set(px,y-.12,pz);
      gh.m.root.position.y=0;
      if(st.mode==='wall'){wallArmsFor(gh.m,px,pz);gh.wire.children.forEach(()=>{});const ar=[];gh.wire.traverse(o=>ar.push(o));}
      // hover bob + scanline shimmer
      const col=ok?0x44ff88:0xff3a3a;ghostFill.color.set(col);ghostWire.color.set(ok?0x99ffc0:0xff8a7a);ghostFill.opacity=.26+.1*Math.sin(t*6);
      pad.visible=true;pad.position.set(px,y+.1,pz);pad.scale.setScalar(halfOf(st.mode)*2);pad.material.color.set(col);
      grid.visible=true;grid.position.set(px,y+.06,pz);gridMat.uniforms.uT.value=t;gridMat.uniforms.uC.value.set(ok?0x35e8ff:0xff5040);
      const rg=spec(st.mode).range;if(rg){rangeRing.visible=true;rangeRing.position.set(px,y+.12,pz);rangeRing.scale.setScalar(rg*2);rangeRing.material.color.set(spec(st.mode).tint);rangeRing.material.opacity=.45}else rangeRing.visible=false;
      const cellKey=px+','+pz;
      if(st.cancel){api.select(null);st.cancel=false;st.click=false}
      else{
        const drag=st.mode==='wall'&&st.lmb&&cellKey!==st.lastCell;
        if(st.click||drag){st.click=false;st.lastCell=cellKey;
          if(ok){place(st.mode,{x:px,z:pz},{exact:true});}else{ctx.audio?.play?.('hurt');st.msg=`<i>${why}</i>`}}
        if(!st.lmb)st.lastCell=''}
      if(st.msg===undefined||st.msgT===undefined)st.msgT=0;
      st.hintNow=ok?`<b>${spec(st.mode).name}</b> — click to place &nbsp;·&nbsp; right-click cancel`:`<i>${why}</i>`;
      if(st.msg){st.hintNow=st.msg;st.msgT=1.2;st.msg=undefined}
    }else{hideGhost();if(st.cancel){st.cancel=false;if(st.menu){st.menu=false;ctx.state.building=false}}st.click=false;st.hintNow='Select a structure &nbsp;·&nbsp; <b>1-7</b> quick select &nbsp;·&nbsp; right-click close'}
    if(st.msgT>0){st.msgT-=dt}
    ui.update(ctx.state.res,st.menu,st.mode,st.hintNow,!!ctx.hud?.setBuildMenu);
    if(dirty)recompute();
    // ---- buildings ----
    vfx.beginBars();
    const cam=ctx.camera.position;
    for(const b of list){
      if(!b.alive)continue;b.t+=dt;
      if(b.hurt>0)b.hurt-=dt;
      if(!b.built){
        b.prog+=dt/b.buildTime;const pr=Math.min(1,b.prog),Y=b.pos.y-.12+b.model.H*pr*1.02;b.clipBelow.constant=Y;b.clipAbove.constant=-Y;
        if(b.scan){b.scan.position.y=b.model.H*pr*1.02+.05;b.scan.material.opacity=.7+.3*Math.sin(t*20)}
        if(b.holoMat)b.holoMat.opacity=.2+.1*Math.sin(t*14);
        // sparks near scan line & welding flashes
        if(Math.random()<dt*28){const a=Math.random()*TAU,r=b.half*(.4+Math.random()*.6);const sx=b.pos.x+Math.cos(a)*r,sz=b.pos.z+Math.sin(a)*r,sy=b.pos.y+b.model.H*pr;vfx.spark(sx,sy,sz,3,6,Math.random()<.5?0xffd080:0x66f0ff);if(Math.random()<.3)vfx.flash(sx,sy,sz,.9,0xaaf4ff,.07)}
        if(Math.random()<dt*2.5)ctx.fx?.burst?.('build',new THREE.Vector3(b.pos.x+(Math.random()-.5)*b.half,b.pos.y+b.model.H*pr,b.pos.z+(Math.random()-.5)*b.half),{scale:.5});
        if(Math.random()<dt*10)vfx.fireP.emit(b.pos.x+(Math.random()-.5)*b.half*1.6,b.pos.y+b.model.H*pr,b.pos.z+(Math.random()-.5)*b.half*1.6,0,.6,0,.5,.6,.1,0x66f0ff,.8);
        b.model.tick?.(dt,t,b);
        vfx.bar(b.pos.x,b.pos.y+b.model.H+1,b.pos.z,Math.max(1.8,b.half*1.2),pr,0x35e8ff,.16);
        if(b.prog>=1)endConstruct(b);continue}
      b.ctx=ctx;
      // type logic
      if(b.type==='turret')stepTurret(b,dt);else if(b.type==='plasma')stepPlasma(b,dt);else if(b.type==='mortar')stepMortar(b,dt);else if(b.type==='beacon')stepBeacon(b,dt);else if(b.type==='harvester')stepHarvester(b,dt);
      else if(b.type==='core'){b.timer-=dt;if(b.timer<=0){b.timer=3;ctx.state.res.carbon+=1}if(b.hp<b.maxHp&&t-b.lastHit>6)b.hp=Math.min(b.maxHp,b.hp+2*dt)}
      b.model.tick?.(dt,t,b);
      // damaged state
      const f=b.hp/b.maxHp;
      if(f<.65){b.smokeT-=dt;const rate=f<.3?.07:.18;if(b.smokeT<=0){b.smokeT=rate*(.7+Math.random()*.6);const ox=b.pos.x+(Math.random()-.5)*b.half*1.2,oz=b.pos.z+(Math.random()-.5)*b.half*1.2,oy=b.pos.y+b.model.H*(.35+Math.random()*.4);
          vfx.smoke(ox,oy,oz,f<.3?1.7:1.2,f<.3?0x1c1a18:0x4a4a4a);if(f<.45){vfx.fire(ox,oy-.3,oz,f<.3?1.1:.7);if(f<.3&&Math.random()<.4)vfx.spark(ox,oy,oz,2,4)}}}
      if(f<1||b.type==='wall'&&f<1)vfx.bar(b.pos.x,b.pos.y+b.model.H+.9,b.pos.z,Math.max(1.8,b.half*1.2),f,_col.setHSL(.33*f,.9,.5).getHex(),.16);
      // hit flash via emissive boost
      if(b.hurt>0){for(const g of b.model.glows)g.m.emissiveIntensity=g.base*2.2}
    }
    vfx.endBars();
    // ---- projectiles ----
    for(let i=tracers.length-1;i>=0;i--){const p=tracers[i];p.t+=dt/p.dur;const h=Math.min(1,p.t),tl=Math.max(0,h-.18);
      vfx.seg(p.a.x+(p.b.x-p.a.x)*tl,p.a.y+(p.b.y-p.a.y)*tl,p.a.z+(p.b.z-p.a.z)*tl,p.a.x+(p.b.x-p.a.x)*h,p.a.y+(p.b.y-p.a.y)*h,p.a.z+(p.b.z-p.a.z)*h,.09,0xffc860);
      vfx.seg(p.a.x+(p.b.x-p.a.x)*tl,p.a.y+(p.b.y-p.a.y)*tl,p.a.z+(p.b.z-p.a.z)*tl,p.a.x+(p.b.x-p.a.x)*h,p.a.y+(p.b.y-p.a.y)*h,p.a.z+(p.b.z-p.a.z)*h,.2,0x7a3a10);
      if(p.t>=1)tracers.splice(i,1)}
    for(let i=shells.length-1;i>=0;i--){const s=shells[i];s.t+=dt/s.dur;const u=Math.min(1,s.t),x=s.a.x+(s.b.x-s.a.x)*u,z=s.a.z+(s.b.z-s.a.z)*u,y=s.a.y+(s.b.y-s.a.y)*u+4*s.h*u*(1-u);
      vfx.fireP.emit(x,y,z,0,0,0,.25,.7,.2,0xffa040,.9);if(Math.random()<.6)vfx.smoke(x,y,z,.5,0x888888);vfx.flash(x,y,z,.5,0xffffff,.03);
      if(s.t>=1){shells.splice(i,1);const R=4.8,l=ctx.enemies?.list||[];
        for(const e of l){if(!e.alive)continue;const d=Math.hypot(e.pos.x-x,e.pos.z-z);if(d<R+(e.radius||0))hurtEnemy(e,70*(1-d/(R+1)*.7),s.src)}
        ctx.fx?.burst?.('explosion',new THREE.Vector3(x,s.b.y+.5,z),{scale:1.3});vfx.flash(x,s.b.y+1,z,6,0xffb060,.2);vfx.spark(x,s.b.y+.5,z,24,12,0xffb050);vfx.ring(x,s.b.y,z,.8,R*2,0xff9040,.5);vfx.scorchAt(x,s.b.y,z,2.2);
        for(let k=0;k<5;k++)vfx.smoke(x,s.b.y+.5,z,2,0x3a3632);ctx.postfx?.shake?.(.25);ctx.audio?.play?.('explosion',_tv.set(x,s.b.y,z));ctx.lighting?.addLight?.(new THREE.Vector3(x,s.b.y+1.5,z),0xffa050,6,14)}}
    for(let i=wrecks.length-1;i>=0;i--){const w=wrecks[i];w.t-=dt;if(Math.random()<dt*14){vfx.fire(w.p.x+(Math.random()-.5)*w.h,w.p.y+.3,w.p.z+(Math.random()-.5)*w.h,1);vfx.smoke(w.p.x+(Math.random()-.5)*w.h,w.p.y+1,w.p.z+(Math.random()-.5)*w.h,1.5,0x222120)}if(w.t<=0)wrecks.splice(i,1)}
    vfx.endBolts();lineMat.uniforms.uT.value=t;vfx.update(dt);
  };
  return api;
}

export function update(dt,ctx){const a=ctx.buildings;if(a&&a.update)a.update(dt)}
