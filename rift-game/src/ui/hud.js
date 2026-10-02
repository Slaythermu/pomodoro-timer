// RIFTFALL HUD. Public API (ctx.hud): notify(text,type), setBuildMenu(items,selected), setWeapons(list,active),
// banner(title,sub), floatText(pos,text,color,size), start(), isStarted().
// Reads (all guarded): ctx.state{hp,maxHp,energy,maxEnergy,res,wave,kills,score,over,waveTimer,waveTotal,waveEnemies},
// ctx.player{pos,aimDir,weapons[],weapon,spread}, ctx.enemies.list, ctx.buildings{list,menu|types,selected},
// events: hit kill wave damage-player resource build shoot weapon.
import './hud.css';
import {weaponIcon,buildIcon,RES_ICON,BADGE} from './icons.js';

const $=(s,r=document)=>r.querySelector(s);
const lerp=(a,b,t)=>a+(b-a)*t;
const fmt=n=>Math.round(n).toLocaleString('en-US');
const DEF_WEAPONS=[{name:'Pulse Rifle'},{name:'Scatter Cannon'},{name:'Plasma Launcher'},{name:'Arc Lance'}];
const COST_COL={carbon:'#9aa8ad',steel:'#6fb4ff',crystal:'#2ef2d0'};

export function init(ctx){
  const root=document.getElementById('ui');const st=ctx.state;
  root.innerHTML=`
  <div class="hud">
   <div class="vig"></div><canvas class="nums"></canvas><div class="dmgflash"></div>
   <div id="res" class="panel">${['carbon','steel','crystal'].map(k=>`<div class="r" data-k="${k}">${RES_ICON[k]}<div class="v num">0</div><div class="n">${k}</div><div class="d num"></div></div>`).join('')}</div>
   <div id="wave" class="panel"><div class="wn">WAVE <b>00</b></div><div class="ws"><span class="lbl st">STANDBY</span><span class="lbl">HOSTILES <b class="num rem">0</b></span></div><div class="wb"><i></i></div></div>
   <div id="boss" class="panel"><div class="bn">BOSS</div><div class="bb"><i class="c"></i><i class="f"></i></div></div>
   <div id="banner"></div>
   <div id="mini" class="panel"><canvas width="404" height="404"></canvas><div class="ring"></div><div class="n">N</div></div>
   <div id="feed" style="position:absolute"></div>
   <div id="vit" class="panel"><div class="badge">${BADGE}</div>
     <div class="row"><div class="t"><span class="lbl">INTEGRITY</span><b class="num hpv">100</b></div><div class="bar" id="hpb"><i class="chip"></i><i class="hp"></i></div></div>
     <div class="row"><div class="t"><span class="lbl">ENERGY</span><b class="num env">100</b></div><div class="bar sm"><i class="en"></i></div></div></div>
   <div id="wpn" class="panel"><div class="wname"></div></div>
   <div id="bld" class="panel"><div class="bt">CONSTRUCT</div></div>
   <div id="xh"><svg viewBox="-60 -60 120 120"><circle class="cd" r="26" fill="none" stroke="#ffb43a" stroke-width="2.5" stroke-dasharray="163.4" stroke-dashoffset="163.4" transform="rotate(-90)" opacity=".9"/>
     <circle class="ring" r="18" fill="none" stroke="#2ef2d0" stroke-width="1.2" stroke-opacity=".55" stroke-dasharray="14 8"/>
     <g stroke="#2ef2d0" stroke-width="2.2" stroke-linecap="round"><path class="t1" d="M0 -10v-8"/><path class="t2" d="M0 10v8"/><path class="t3" d="M-10 0h-8"/><path class="t4" d="M10 0h8"/></g>
     <circle r="1.8" fill="#ffb43a"/></svg></div>
   <div class="scan"></div>
  </div>
  <div id="over"><h1>RIFT LOST</h1><div class="sub">SIGNAL TERMINATED</div><div class="stats panel"></div><div class="cta">REDEPLOY</div></div>
  <div id="start"><div class="bars a"></div><div class="bars b"></div><div class="ver">PROJECT RIFTFALL // BUILD 0.1 // SECTOR 7-K</div>
   <div class="logo"><span class="g">RIFT<span class="amb">FALL</span></span><span class="l1">RIFTFALL</span><span class="l2">RIFTFALL</span></div>
   <div class="rift"><svg viewBox="0 0 860 30" preserveAspectRatio="none"><path d="M0 15H300l14-12 18 24 20-30 18 30 14-18 12 6H860" fill="none" stroke="#2ef2d0" stroke-width="2"/><path d="M0 15H300l14-12 18 24 20-30 18 30 14-18 12 6H860" fill="none" stroke="#ffb43a" stroke-width="6" opacity=".18"/></svg></div>
   <div class="tag">SURVIVE &middot; BUILD &middot; BREAK THE RIFT</div><div class="cta">CLICK TO START</div>
   <div class="ctl"><span><b>WASD</b>MOVE</span><span><b>MOUSE</b>AIM</span><span><b>LMB</b>FIRE</span><span><b>1-9</b>WEAPON / BUILD</span></div><div class="scan2"></div></div>`;
  const el={res:{},};
  root.querySelectorAll('#res .r').forEach(r=>el.res[r.dataset.k]={v:$('.v',r),d:$('.d',r),cur:st.res?.[r.dataset.k]??0,last:null});
  const hud$=n=>$(n,root);
  const E={hpb:hud$('#hpb'),chip:hud$('#hpb .chip'),hp:hud$('#hpb .hp'),hpv:hud$('.hpv'),env:hud$('.env'),en:hud$('.en'),
    wn:hud$('#wave .wn b'),wst:hud$('#wave .st'),rem:hud$('#wave .rem'),wbar:hud$('#wave .wb i'),wave:hud$('#wave'),
    boss:hud$('#boss'),bn:hud$('#boss .bn'),bf:hud$('#boss .f'),bc:hud$('#boss .c'),banner:hud$('#banner'),
    feed:hud$('#feed'),wpn:hud$('#wpn'),wname:hud$('#wpn .wname'),bld:hud$('#bld'),xh:hud$('#xh'),
    start:hud$('#start'),over:hud$('#over'),flash:hud$('.dmgflash'),mini:hud$('#mini canvas'),nums:hud$('canvas.nums')};
  const xh={cd:$('.cd',E.xh),ring:$('.ring',E.xh),t:[1,2,3,4].map(i=>$('.t'+i,E.xh))};
  ctx.canvas.style.cursor='none';

  const H={started:false,_menu:null,_sel:0,_weapons:null,_active:null};
  const S={hpChip:1,hpShow:1,chipHold:0,flash:0,spread:0,shootAt:{},lastWpnKey:'',lastBldKey:'',waveMax:1,waveStart:0,bossShow:0,over:false,
    feedLast:null,bannerT:0,tFrame:0};

  // ---------- start / over ----------
  H.start=()=>{if(H.started)return;H.started=true;st.started=true;root.classList.add('live');E.start.classList.add('out');ctx.audio?.resume?.();ctx.audio?.unlock?.();ctx.ev.emit('start',{})};
  H.isStarted=()=>H.started;
  E.start.addEventListener('click',H.start);
  addEventListener('keydown',e=>{if(!H.started&&(e.code==='Enter'||e.code==='Space')){e.preventDefault();H.start()}});
  const restart=()=>{const u=new URL(location.href);u.searchParams.set('autostart','1');location.href=u.toString()};
  $('.cta',E.over).addEventListener('click',restart);addEventListener('keydown',e=>{if(S.over&&e.code==='Enter')restart()});
  if(ctx.q.get('autostart'))H.start();

  // ---------- notifications ----------
  H.notify=(text,type='info')=>{
    const f=S.feedLast;
    if(f&&f.text===text&&performance.now()-f.t<2000&&f.el.isConnected){f.n++;f.t=performance.now();let b=$('b',f.el);if(!b)b=f.el.appendChild(document.createElement('b'));b.textContent='x'+f.n;return}
    const d=document.createElement('div');d.className='it '+type;d.textContent=text;E.feed.appendChild(d);
    S.feedLast={text,el:d,n:1,t:performance.now()};
    while(E.feed.children.length>6)E.feed.firstChild.remove();
    setTimeout(()=>d.classList.add('out'),4200);setTimeout(()=>d.remove(),4800);
  };
  H.banner=(t,sub='')=>{E.banner.innerHTML=t+(sub?`<small>${sub}</small>`:'');E.banner.classList.remove('go');void E.banner.offsetWidth;E.banner.classList.add('go')};

  // ---------- weapons / build menu ----------
  H.setWeapons=(l,a)=>{H._weapons=l;if(a!=null)H._active=a};
  H.setBuildMenu=(items,selected=0)=>{H._menu=items;H._sel=selected;H._menuSet=true};
  const normMenu=()=>{
    let m=H._menuSet?H._menu:(ctx.buildings?.menu??ctx.buildings?.types??ctx.buildings?.defs??null);
    if(!m)return[];
    if(!Array.isArray(m))m=Object.entries(m).map(([id,v])=>({id,...(typeof v==='object'?v:{})}));
    return m.map((x,i)=>typeof x==='string'?{id:x,name:x}:{...x,id:x.id??x.type??x.name??i,name:x.name??x.label??x.id??x.type??('Build '+i)});
  };
  const selIndex=(items)=>{
    let s=H._menuSet?H._sel:(ctx.buildings?.selected??ctx.buildings?.sel??ctx.state.buildSel??ctx.state.build??-1);
    if(typeof s==='string')s=items.findIndex(i=>i.id===s);
    if(s&&typeof s==='object')s=items.findIndex(i=>i.id===(s.id??s.type));
    return typeof s==='number'?s:-1};
  const wpns=()=>H._weapons||ctx.player?.weapons||DEF_WEAPONS;
  const wIdx=()=>H._active??ctx.player?.weapon??ctx.player?.weaponIndex??ctx.state.weapon??0;
  const wAct=()=>{const w=wpns(),a=wIdx();return typeof a==='number'?a:Math.max(0,w.findIndex(x=>x===a||x.id===a||x.name===a))};
  ctx.ev.on('shoot',e=>{if(e)S.shootAt[e.weapon?.name??e.weapon??wIdx()]=ctx.time;if(e&&e.weapon!=null)S.lastShot=ctx.time;else S.lastShot=ctx.time});
  ctx.ev.on('weapon',e=>{if(typeof e==='number'||typeof e==='string')H._active=e;else if(e&&e.index!=null)H._active=e.index});
  const wCd=(w,i)=>{
    if(w&&typeof w==='object'){
      if(w.cdFrac!=null)return w.cdFrac;
      const tot=w.cooldown??w.delay??w.interval??(w.rate?1/w.rate:0);
      if(w.cd!=null&&tot)return Math.min(1,Math.max(0,w.cd/tot));
      if(w.timer!=null&&tot)return Math.min(1,Math.max(0,w.timer/tot));
      if(w.reload!=null&&w.reloadTime)return Math.min(1,w.reload/w.reloadTime);
    }
    if(i===wAct()){const p=ctx.player;if(p?.cdFrac!=null)return p.cdFrac;if(p?.cooldown!=null&&p?.cooldownMax)return Math.min(1,p.cooldown/p.cooldownMax);
      return Math.max(0,1-(ctx.time-(S.lastShot??-9))/0.12)*0.5}
    return 0};
  function buildWeapons(){
    const w=wpns();const key=w.map(x=>x.name||x).join('|')+'|'+(H._weapons?1:0);
    if(key===S.lastWpnKey)return;S.lastWpnKey=key;
    E.wpn.querySelectorAll('.slot').forEach(n=>n.remove());S.wSlots=[];
    w.forEach((x,i)=>{const d=document.createElement('div');d.className='slot';const nm=x.name||x;
      d.innerHTML=weaponIcon(nm,i)+`<div class="cd"></div><div class="k">${i+1}</div><div class="am"></div>`;E.wpn.appendChild(d);S.wSlots.push({d,cd:$('.cd',d),am:$('.am',d),nm,act:null,cdv:-1})});
  }
  function buildBuild(items){
    const key=items.map(i=>i.id+i.name+JSON.stringify(i.cost||{})).join('|');
    if(key===S.lastBldKey)return;S.lastBldKey=key;
    E.bld.querySelectorAll('.slot').forEach(n=>n.remove());S.bSlots=[];E.bld.classList.toggle('on',items.length>0);
    items.forEach((it,i)=>{const d=document.createElement('div');d.className='slot';
      const cost=it.cost||{};const cs=Object.entries(cost).filter(([,v])=>v).map(([k,v])=>`<span style="color:${COST_COL[k]||'#fff'}"><u style="background:${COST_COL[k]||'#fff'}"></u>${v}</span>`).join('');
      d.innerHTML=buildIcon(it.id+' '+it.name,i)+`<div class="k">${it.key||i+1}</div><div class="nm">${String(it.name).slice(0,11)}</div><div class="cs">${cs}</div>`;
      d.addEventListener('click',()=>{H._sel=i;ctx.ev.emit('build-select',{index:i,id:it.id});ctx.buildings?.select?.(it.id);ctx.buildings?.select?.(i)});
      E.bld.appendChild(d);S.bSlots.push({d,it,sel:null,cant:null})});
  }

  // ---------- events ----------
  const pool=[];const proj=new ctx.THREE.Vector3();
  H.floatText=(pos,text,color='#ffb43a',size=18,opts={})=>{
    if(pool.length>60)pool.shift();
    pool.push({p:pos.clone(),text,color,size,t:0,life:opts.life||0.9,vx:(Math.random()-.5)*40,vy:-(50+Math.random()*30),ox:0,oy:0,crit:!!opts.crit});
  };
  ctx.ev.on('hit',e=>{if(!e||!e.pos||e.dmg==null)return;const crit=e.dmg>=40||e.crit;
    H.floatText(e.pos,fmt(e.dmg),crit?'#fff4c8':'#ffb43a',crit?30:Math.min(26,15+e.dmg*.15),{crit})});
  ctx.ev.on('kill',e=>{const n=e?.enemy?.name||e?.enemy?.type||'Hostile';const sc=e?.enemy?.score;H.notify('TERMINATED '+n,'kill');
    if(e?.pos)H.floatText(e.pos,'✕',  '#ff4560',20,{life:.7})});
  ctx.ev.on('wave',e=>{const n=e?.n??st.wave;S.waveStart=ctx.time;S.waveMax=Math.max(1,(ctx.enemies?.list?.length)||1);H.banner('WAVE '+String(n).padStart(2,'0'),'RIFT BREACH DETECTED');H.notify('WAVE '+n+' INBOUND','wave')});
  ctx.ev.on('damage-player',e=>{S.flash=Math.min(1,S.flash+Math.min(.8,(e?.amount||5)/30));const p=ctx.player?.pos;if(p&&e)H.floatText(p.clone().setY((p.y||0)+2),'-'+fmt(e.amount||0),'#ff4560',24)});
  ctx.ev.on('resource',e=>{if(!e||!el.res[e.type])return;const d=el.res[e.type].d;d.textContent=(e.amount>=0?'+':'')+fmt(e.amount);d.style.color=e.amount>=0?COST_COL[e.type]:'#ff4560';d.classList.remove('go');void d.offsetWidth;d.classList.add('go')});
  ctx.ev.on('build',e=>{if(e?.type)H.notify('CONSTRUCTED '+e.type,'build')});

  // ---------- numbers canvas ----------
  const g=E.nums.getContext('2d');let W=0,Hh=0,dpr=1;
  const rs=()=>{dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;Hh=innerHeight;E.nums.width=W*dpr;E.nums.height=Hh*dpr};rs();addEventListener('resize',rs);

  // ---------- minimap ----------
  const mg=E.mini.getContext('2d');const MS=404,MR=52,MK=MS/2/MR,CELL=4;
  const cells=new Map();let hmin=1e9,hmax=-1e9;
  function sampleCell(cx,cz){const x=(cx+.5)*CELL,z=(cz+.5)*CELL;const T=ctx.terrain;let h=0,b=0;
    try{if(T?.heightAt)h=T.heightAt(x,z);if(T?.blocked)b=T.blocked(x,z,1.6)?1:0}catch{}
    if(h<hmin)hmin=h;if(h>hmax)hmax=h;const c={h,b};cells.set(cx+','+cz,c);return c}
  function drawMini(t){
    const p=ctx.player?.pos;if(!p)return;const px=p.x,pz=p.z;
    mg.clearRect(0,0,MS,MS);mg.save();mg.beginPath();mg.arc(MS/2,MS/2,MS/2-2,0,7);mg.clip();
    mg.fillStyle='rgba(2,14,18,.88)';mg.fillRect(0,0,MS,MS);
    const x0=Math.floor((px-MR)/CELL),x1=Math.ceil((px+MR)/CELL),z0=Math.floor((pz-MR)/CELL),z1=Math.ceil((pz+MR)/CELL);let budget=90;const rng=Math.max(.01,hmax-hmin);
    for(let cz=z0;cz<=z1;cz++)for(let cx=x0;cx<=x1;cx++){let c=cells.get(cx+','+cz);if(!c){if(budget--<=0)continue;c=sampleCell(cx,cz)}
      const sx=MS/2+((cx*CELL)-px)*MK,sy=MS/2+((cz*CELL)-pz)*MK,s=CELL*MK+1;
      const hh=(c.h-hmin)/rng;
      mg.fillStyle=c.b?'rgba(255,180,58,.34)':`rgba(30,${120+hh*100|0},${110+hh*80|0},${.14+hh*.22})`;mg.fillRect(sx,sy,s,s);
      if(c.b){mg.fillStyle='rgba(255,200,100,.7)';mg.fillRect(sx+s/2-2,sy+s/2-2,4,4)}}
    // grid rings
    mg.strokeStyle='rgba(46,242,208,.22)';mg.lineWidth=1;for(let r=1;r<=3;r++){mg.beginPath();mg.arc(MS/2,MS/2,MS/2*r/3,0,7);mg.stroke()}
    mg.beginPath();mg.moveTo(MS/2,0);mg.lineTo(MS/2,MS);mg.moveTo(0,MS/2);mg.lineTo(MS,MS/2);mg.stroke();
    // sweep
    const a=t*1.6;const gr=mg.createConicGradient?mg.createConicGradient(a-1.1,MS/2,MS/2):null;
    if(gr){gr.addColorStop(0,'rgba(46,242,208,0)');gr.addColorStop(.17,'rgba(46,242,208,.32)');gr.addColorStop(.175,'rgba(46,242,208,0)');gr.addColorStop(1,'rgba(46,242,208,0)');mg.fillStyle=gr;mg.fillRect(0,0,MS,MS)}
    const mp=(q)=>[MS/2+(q.x-px)*MK,MS/2+(q.z-pz)*MK];
    // buildings
    for(const b of ctx.buildings?.list||[]){const q=b.pos||b.position;if(!q||b.dead||b.alive===false)continue;const[x,y]=mp(q);if(x<-10||x>MS+10||y<-10||y>MS+10)continue;
      mg.fillStyle='#2ef2d0';mg.shadowColor='#2ef2d0';mg.shadowBlur=8;mg.fillRect(x-5,y-5,10,10);mg.shadowBlur=0;mg.fillStyle='rgba(2,14,18,.9)';mg.fillRect(x-2,y-2,4,4)}
    // enemies
    const pulse=.65+.35*Math.sin(t*8);mg.fillStyle='#ff4560';mg.shadowColor='#ff2040';mg.shadowBlur=7;
    for(const e of ctx.enemies?.list||[]){if(e.alive===false)continue;const[x,y]=mp(e.pos);const dx=x-MS/2,dy=y-MS/2;let X=x,Y=y;const d=Math.hypot(dx,dy),lim=MS/2-8;
      const edge=d>lim;if(edge){X=MS/2+dx/d*lim;Y=MS/2+dy/d*lim}
      mg.globalAlpha=edge?.45*pulse+.2:1;const r=(e.boss?5.5:2.8)+(e.radius>1.5?1.2:0);mg.beginPath();mg.arc(X,Y,r,0,7);mg.fill()}
    mg.globalAlpha=1;mg.shadowBlur=0;
    // player cone
    const ad=ctx.player?.aimDir;const ang=ad?Math.atan2(ad.z,ad.x):-Math.PI/2;
    const cg=mg.createRadialGradient(MS/2,MS/2,0,MS/2,MS/2,70);cg.addColorStop(0,'rgba(255,180,58,.6)');cg.addColorStop(1,'rgba(255,180,58,0)');
    mg.fillStyle=cg;mg.beginPath();mg.moveTo(MS/2,MS/2);mg.arc(MS/2,MS/2,70,ang-.5,ang+.5);mg.closePath();mg.fill();
    mg.fillStyle='#fff';mg.shadowColor='#ffb43a';mg.shadowBlur=10;mg.beginPath();mg.moveTo(MS/2+Math.cos(ang)*9,MS/2+Math.sin(ang)*9);mg.lineTo(MS/2+Math.cos(ang+2.5)*7,MS/2+Math.sin(ang+2.5)*7);mg.lineTo(MS/2+Math.cos(ang-2.5)*7,MS/2+Math.sin(ang-2.5)*7);mg.fill();
    mg.restore();
  }

  // ---------- per frame ----------
  H.update=(dt)=>{
    S.tFrame+=dt;const t=ctx.time;
    if(!H.started&&!E.start.classList.contains('out')){/* title idle */}
    // bars
    const maxHp=st.maxHp||100,hp=Math.max(0,st.hp),f=hp/maxHp;
    if(f<S.hpChip-1e-4){if(f<S.hpShow-1e-4)S.chipHold=.55}
    S.hpShow=f;
    if(S.chipHold>0)S.chipHold-=dt;else S.hpChip=f>S.hpChip?f:lerp(S.hpChip,f,Math.min(1,dt*5));
    E.hp.style.width=(f*100).toFixed(1)+'%';E.chip.style.width=(S.hpChip*100).toFixed(1)+'%';
    E.hpb.classList.toggle('low',f<.3);E.hpv.textContent=fmt(hp)+' / '+fmt(maxHp);
    const mE=st.maxEnergy||100;E.en.style.width=(Math.max(0,st.energy)/mE*100).toFixed(1)+'%';E.env.textContent=fmt(st.energy);
    S.flash=Math.max(0,S.flash-dt*1.6);E.flash.style.opacity=Math.max(S.flash,f<.25?.25+.15*Math.sin(t*6):0);
    // resources
    for(const k in el.res){const r=el.res[k],v=st.res?.[k]??0;r.cur=Math.abs(v-r.cur)<.5?v:lerp(r.cur,v,Math.min(1,dt*8));const s=fmt(r.cur);if(s!==r.last){r.last=s;r.v.textContent=s}}
    // wave
    const list=ctx.enemies?.list,alive=list?list.reduce((a,e)=>a+(e.alive!==false),0):(st.waveEnemies??0);
    if(alive>S.waveMax)S.waveMax=alive;
    const wt=st.waveTimer??ctx.enemies?.nextWaveIn??ctx.enemies?.countdown;
    E.wn.textContent=String(st.wave|0).padStart(2,'0');E.rem.textContent=alive;
    let prog;if(alive>0){E.wst.textContent='ENGAGED';prog=alive/S.waveMax;E.wave.classList.add('alert')}
    else{E.wave.classList.remove('alert');if(wt!=null&&isFinite(wt)){const m=Math.max(0,wt);E.wst.textContent='NEXT '+Math.floor(m/60)+':'+String(Math.floor(m%60)).padStart(2,'0');prog=1-Math.min(1,m/(st.waveTotal||ctx.enemies?.waveInterval||30))}else{E.wst.textContent='STANDBY';prog=0}}
    E.wbar.style.width=(prog*100).toFixed(1)+'%';
    // boss
    const boss=ctx.enemies?.boss||(list&&list.find(e=>e.boss&&e.alive!==false));
    if(boss&&boss.alive!==false&&boss.hp>0){const mh=boss.maxHp||boss.hpMax||S.bossMax||boss.hp;if(!S.bossMax||boss!==S.bossRef){S.bossMax=mh;S.bossRef=boss;S.bossChip=1}
      const bf=Math.min(1,boss.hp/mh);S.bossChip=bf<S.bossChip?lerp(S.bossChip,bf,Math.min(1,dt*2.5)):bf;
      E.boss.classList.add('on');E.bn.textContent=(boss.name||'RIFT COLOSSUS').toUpperCase();E.bf.style.width=bf*100+'%';E.bc.style.width=S.bossChip*100+'%'}
    else{E.boss.classList.remove('on');S.bossMax=0;S.bossRef=null}
    // weapons
    buildWeapons();const w=wpns(),act=wAct();
    E.wname.textContent=(w[act]?.name||w[act]||'').toString();
    S.wSlots.forEach((s,i)=>{const a=i===act;if(a!==s.act){s.act=a;s.d.classList.toggle('act',a)}const c=wCd(w[i],i);if(Math.abs(c-s.cdv)>.01){s.cdv=c;s.cd.style.transform=`scaleY(${c.toFixed(2)})`}
      const wo=w[i];const am=wo&&wo.ammo!=null?(wo.ammo===Infinity?'∞':fmt(wo.ammo)):'';if(s.am.textContent!==am)s.am.textContent=am});
    // build
    const items=normMenu();buildBuild(items);const si=selIndex(items);
    S.bSlots?.forEach((s,i)=>{const sel=i===si;const cost=s.it.cost||{};const cant=Object.entries(cost).some(([k,v])=>(st.res?.[k]??0)<v);
      if(sel!==s.sel){s.sel=sel;s.d.classList.toggle('sel',sel)}if(cant!==s.cant){s.cant=cant;s.d.classList.toggle('cant',cant)}});
    // crosshair
    const m=ctx.input.mouse,x=(m.x*.5+.5)*innerWidth,y=(-m.y*.5+.5)*innerHeight;
    E.xh.style.display=H.started&&!st.over?'block':'none';E.xh.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    const mv=ctx.input.move,moving=mv&&(mv.x||mv.y);const tgt=ctx.player?.spread!=null?ctx.player.spread*60:(ctx.input.down?9:0)+(moving?5:0)+Math.max(0,1-(t-(S.lastShot??-9))/.15)*7;
    S.spread=lerp(S.spread,tgt,Math.min(1,dt*14));const sp=S.spread;
    xh.t[0].setAttribute('transform',`translate(0 ${-sp})`);xh.t[1].setAttribute('transform',`translate(0 ${sp})`);xh.t[2].setAttribute('transform',`translate(${-sp} 0)`);xh.t[3].setAttribute('transform',`translate(${sp} 0)`);
    xh.ring.setAttribute('r',(18+sp*.8).toFixed(1));xh.ring.setAttribute('transform',`rotate(${(t*30)%360})`);
    const ac=wCd(w[act],act);xh.cd.setAttribute('stroke-dashoffset',(163.4*(1-ac)).toFixed(1));
    // numbers
    g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,Hh);g.textAlign='center';g.lineJoin='round';
    for(let i=pool.length-1;i>=0;i--){const n=pool[i];n.t+=dt;if(n.t>n.life){pool.splice(i,1);continue}
      const k=n.t/n.life;n.ox+=n.vx*dt;n.oy+=n.vy*dt;n.vy+=110*dt;n.vx*=.97;
      proj.copy(n.p);proj.project(ctx.camera);if(proj.z>1)continue;
      const sx=(proj.x*.5+.5)*W+n.ox,sy=(-proj.y*.5+.5)*Hh+n.oy-n.t*10;
      const pop=k<.12?1+(1-k/.12)*.7:1;g.globalAlpha=k<.6?1:1-(k-.6)/.4;
      g.font=`800 ${(n.size*pop).toFixed(0)}px Bahnschrift,"DIN Alternate","Arial Narrow",Impact,sans-serif`;
      g.lineWidth=n.crit?5:4;g.strokeStyle='rgba(20,6,0,.85)';g.strokeText(n.text,sx,sy);
      if(n.crit){g.shadowColor=n.color;g.shadowBlur=14}g.fillStyle=n.color;g.fillText(n.text,sx,sy);g.shadowBlur=0}
    g.globalAlpha=1;
    // minimap
    if(H.started||true)drawMini(t);
    // game over
    if(st.over&&!S.over){S.over=true;E.over.querySelector('.stats').innerHTML=[['WAVE',st.wave|0],['KILLS',st.kills|0],['SCORE',st.score|0],['TIME',Math.floor(ctx.time/60)+':'+String(Math.floor(ctx.time%60)).padStart(2,'0')]].map(([a,b])=>`<div class="st"><span class="lbl">${a}</span><b class="num">${typeof b==='number'?fmt(b):b}</b></div>`).join('');E.over.classList.add('on');root.classList.remove('live')}
  };
  ctx.hud=H;
  return H;
}
export function update(dt,ctx){ctx.hud?.update?.(dt)}
