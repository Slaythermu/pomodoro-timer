// DOM build bar (bottom center). Pure presentation; logic lives in buildings.js.
import {SPECS,ORDER} from './models.js';
const COL={carbon:'#ff9d3a',steel:'#9fc4ea',crystal:'#4be8ff'};
function glyph(type,col){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.translate(32,32);g.strokeStyle=col;g.fillStyle=col;g.lineWidth=3;g.lineJoin='round';g.shadowColor=col;g.shadowBlur=8;
  const oct=(r,a=Math.PI/8)=>{g.beginPath();for(let i=0;i<8;i++){const t=i/8*6.283+a;g[i?'lineTo':'moveTo'](Math.cos(t)*r,Math.sin(t)*r)}g.closePath()};
  if(type==='turret'){oct(20);g.stroke();g.globalAlpha=.3;g.fill();g.globalAlpha=1;g.fillRect(-9,-24,5,24);g.fillRect(4,-24,5,24);g.strokeRect(-11,-4,22,16)}
  else if(type==='harvester'){g.strokeRect(-20,-20,40,40);g.beginPath();g.moveTo(-8,-10);g.lineTo(8,-10);g.lineTo(0,16);g.closePath();g.fill();g.beginPath();g.arc(0,-14,6,0,7);g.stroke()}
  else if(type==='generator'){g.beginPath();g.moveTo(5,-24);g.lineTo(-10,3);g.lineTo(0,3);g.lineTo(-5,24);g.lineTo(11,-5);g.lineTo(1,-5);g.closePath();g.fill();g.beginPath();g.arc(0,0,22,0,7);g.stroke()}
  else if(type==='plasma'){g.beginPath();g.arc(0,-6,8,0,7);g.fill();g.beginPath();g.moveTo(-16,22);g.lineTo(0,-2);g.lineTo(16,22);g.stroke();g.beginPath();g.moveTo(-22,-12);g.lineTo(-12,-2);g.lineTo(-18,6);g.moveTo(22,-12);g.lineTo(12,-2);g.lineTo(18,6);g.stroke()}
  else if(type==='wall'){g.strokeRect(-24,-10,48,20);g.beginPath();g.moveTo(-8,-10);g.lineTo(-8,10);g.moveTo(8,-10);g.lineTo(8,10);g.moveTo(-24,0);g.lineTo(24,0);g.stroke()}
  else if(type==='mortar'){g.save();g.rotate(-.7);g.fillRect(-6,-26,12,34);g.restore();oct(18);g.translate(0,10);g.stroke()}
  else if(type==='beacon'){g.beginPath();g.moveTo(-5,-20);g.lineTo(5,-20);g.lineTo(5,-5);g.lineTo(20,-5);g.lineTo(20,5);g.lineTo(5,5);g.lineTo(5,20);g.lineTo(-5,20);g.lineTo(-5,5);g.lineTo(-20,5);g.lineTo(-20,-5);g.lineTo(-5,-5);g.closePath();g.fill()}
  return c}
export class BuildUI{
  constructor(api){
    this.api=api;const root=document.getElementById('ui')||document.body;
    const st=document.createElement('style');st.textContent=`
#bb{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;user-select:none;transition:opacity .15s,transform .15s}
#bb.off{opacity:0;transform:translateX(-50%) translateY(20px)}
#bb .row{display:flex;gap:6px;padding:8px 10px;background:linear-gradient(180deg,rgba(8,16,24,.82),rgba(4,9,14,.92));border:1px solid rgba(80,220,255,.35);border-radius:6px;box-shadow:0 0 24px rgba(40,200,255,.18),inset 0 0 18px rgba(40,200,255,.06);pointer-events:auto;clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%,0 10px)}
#bb .card{position:relative;width:92px;padding:6px 4px 6px;text-align:center;color:#cfe9f5;background:rgba(20,40,54,.55);border:1px solid rgba(120,200,230,.18);border-radius:4px;cursor:pointer;transition:all .12s}
#bb .card:hover{background:rgba(40,90,115,.6);border-color:rgba(100,230,255,.7);transform:translateY(-3px)}
#bb .card.sel{background:rgba(30,110,140,.55);border-color:#4be8ff;box-shadow:0 0 14px rgba(75,232,255,.45)}
#bb .card.no{opacity:.45;filter:saturate(.3)}
#bb .card canvas{width:44px;height:44px;display:block;margin:0 auto 2px}
#bb .k{position:absolute;left:4px;top:2px;font-size:11px;color:#7fd7ee;font-weight:700}
#bb .n{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
#bb .c{display:flex;justify-content:center;gap:5px;margin-top:3px;font-size:11px;font-weight:700}
#bb .c span.bad{color:#ff5a4a!important;text-decoration:underline}
#bb .hint{font-size:12px;color:#bfeaff;background:rgba(4,12,18,.75);padding:3px 12px;border-radius:10px;border:1px solid rgba(80,220,255,.2);letter-spacing:.03em;pointer-events:none;min-height:16px}
#bb .hint b{color:#4be8ff}#bb .hint i{color:#ff6a5a;font-style:normal}
#bk{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);font:700 12px 'Segoe UI',system-ui,sans-serif;color:#9fe8ff;background:rgba(4,12,18,.6);border:1px solid rgba(80,220,255,.25);padding:3px 12px;border-radius:10px;letter-spacing:.1em;pointer-events:none;transition:opacity .15s}`;
    document.head.appendChild(st);
    const el=this.el=document.createElement('div');el.id='bb';el.className='off';
    this.hint=document.createElement('div');this.hint.className='hint';
    const row=this.row=document.createElement('div');row.className='row';
    this.cards={};
    ORDER.forEach((t,i)=>{const s=SPECS[t],c=document.createElement('div');c.className='card';
      c.innerHTML=`<div class="k">${i+1}</div><div class="n">${s.name}</div><div class="c">${Object.entries(s.cost).map(([k,v])=>`<span data-k="${k}" style="color:${COL[k]}">${v}</span>`).join('')}</div>`;
      c.insertBefore(glyph(t,s.tint),c.children[1]);
      c.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();api.select(api.mode===t?null:t)});
      c.addEventListener('mouseenter',()=>{api.uiHover=true;this.setHint(`<b>${s.name}</b> — ${s.desc||''}`)});c.addEventListener('mouseleave',()=>{api.uiHover=false});
      row.appendChild(c);this.cards[t]=c});
    row.addEventListener('mouseenter',()=>api.uiHover=true);row.addEventListener('mouseleave',()=>api.uiHover=false);
    el.append(row,this.hint);root.appendChild(el);
    this.bk=document.createElement('div');this.bk.id='bk';this.bk.textContent='[B] BUILD';root.appendChild(this.bk);this.last='';
  }
  setHint(h){this.hint.innerHTML=h}
  update(res,open,sel,msg){
    this.el.classList.toggle('off',!open);this.bk.style.opacity=open?0:.85;if(!open)return;
    const key=ORDER.map(t=>Object.entries(SPECS[t].cost).map(([k,v])=>res[k]>=v?1:0).join('')).join('|')+sel;
    if(key!==this.last){this.last=key;for(const t of ORDER){const s=SPECS[t],c=this.cards[t];let ok=true;
      c.querySelectorAll('span').forEach(sp=>{const bad=res[sp.dataset.k]<s.cost[sp.dataset.k];sp.className=bad?'bad':'';if(bad)ok=false});c.classList.toggle('no',!ok);c.classList.toggle('sel',sel===t)}}
    if(msg!==undefined)this.setHint(msg)}
}
