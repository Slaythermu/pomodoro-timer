// Procedural SVG icon set (viewBox 0 0 64 40). Stroke uses currentColor.
const S='fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const F='fill="currentColor" fill-opacity=".28"';
const W={
 rifle:`<path ${S} ${F} d="M4 18h30l4-4h14l4 4v5H40l-3 8h-7l2-8H4z"/><path ${S} d="M52 18v-4M42 18v5M10 14h14l3 4"/><circle cx="58" cy="20" r="1.6" fill="currentColor"/>`,
 scatter:`<path ${S} ${F} d="M3 16h36l5-3h12v14H44l-5-3H3z"/><path ${S} d="M14 16v11M24 16v11M8 22h30"/><path ${S} d="M58 15l4-3M58 20h5M58 25l4 3"/>`,
 plasma:`<path ${S} ${F} d="M4 17h22l6-5h14l6 5v8l-6 5H32l-6-5H4z"/><circle ${S} cx="46" cy="21" r="5"/><circle cx="46" cy="21" r="2" fill="currentColor"/><path ${S} d="M12 17v8M18 17v8"/>`,
 arc:`<path ${S} ${F} d="M4 22h14l4-6h10v12H22l-4-6"/><path ${S} d="M32 22l6-5-3 5 7-5-4 5 8-4-3 4 9-3"/><circle cx="58" cy="19" r="2" fill="currentColor"/>`,
 saw:`<circle ${S} ${F} cx="32" cy="20" r="11"/><path ${S} d="M32 5v5M32 30v5M17 20h5M42 20h5M21 9l3 4M40 27l3 4M43 9l-3 4M24 27l-3 4"/><circle ${S} cx="32" cy="20" r="3"/>`,
 missile:`<path ${S} ${F} d="M4 24l12-4h26l8-4 10 4-10 4-8-4H16z"/><path ${S} d="M16 20l-6-6M16 24l-6 6M30 20v-5M30 24v5"/>`,
};
const B={
 turret:`<path ${S} ${F} d="M10 34h44l-6-9H16z"/><circle ${S} cx="32" cy="19" r="8"/><path ${S} d="M40 19h20M32 11V5"/><circle cx="32" cy="19" r="2.5" fill="currentColor"/>`,
 wall:`<path ${S} ${F} d="M6 8h52v26H6z"/><path ${S} d="M6 17h52M6 26h52M20 8v9M38 8v9M14 17v9M32 17v9M50 17v9M24 26v8M42 26v8"/>`,
 drill:`<path ${S} ${F} d="M16 6h32l-6 18H22z"/><path ${S} d="M26 24l6 12 6-12M20 14h24M32 6v18"/>`,
 harvester:`<path ${S} ${F} d="M16 6h32l-6 18H22z"/><path ${S} d="M26 24l6 12 6-12M20 14h24"/>`,
 generator:`<path ${S} ${F} d="M32 3l22 12v18L32 38 10 33V15z"/><path ${S} d="M35 10l-9 12h8l-4 12 12-15h-8z"/>`,
 solar:`<path ${S} ${F} d="M10 30l8-20h28l8 20z"/><path ${S} d="M14 20h36M26 10l-3 20M38 10l3 20M32 30v7M22 37h20"/>`,
 tower:`<path ${S} ${F} d="M24 36l4-26h8l4 26z"/><path ${S} d="M22 10h20l-4-6H26zM27 20h10M26 28h12"/>`,
 mine:`<circle ${S} ${F} cx="32" cy="22" r="11"/><path ${S} d="M32 5v6M32 33v6M15 22h6M43 22h6M20 10l4 4M44 10l-4 4"/><circle cx="32" cy="22" r="3" fill="currentColor"/>`,
 repair:`<path ${S} ${F} d="M22 6h20v10h10v20H12V16h10z"/><path ${S} d="M32 20v10M27 25h10"/>`,
 base:`<path ${S} ${F} d="M8 34V18l12-8h24l12 8v16z"/><path ${S} d="M24 34V24h16v10M32 10V4"/>`,
 generic:`<path ${S} ${F} d="M32 4l22 11v14L32 38 10 29V15z"/><path ${S} d="M32 14v14M25 21h14"/>`,
};
export function weaponIcon(name='',i=0){
  const n=String(name).toLowerCase();let k=null;
  if(/scatter|shot|spread/.test(n))k='scatter';else if(/plasma|launch|cannon|grenade/.test(n))k='plasma';
  else if(/arc|beam|lance|laser|tesla|flame/.test(n))k='arc';else if(/saw|blade|melee|sword/.test(n))k='saw';
  else if(/missile|rocket/.test(n))k='missile';else if(/rifle|pulse|gun|blaster|pistol|smg/.test(n))k='rifle';
  if(!k)k=['rifle','scatter','plasma','arc','missile','saw'][i%6];
  return `<svg viewBox="0 0 64 40">${W[k]}</svg>`;
}
export function buildIcon(id='',i=0){
  const n=String(id).toLowerCase();let k=Object.keys(B).find(x=>x!=='generic'&&n.includes(x));
  if(!k&&/gun|laser|cannon|defen|sentry/.test(n))k='turret';
  if(!k&&/power|reactor|energy/.test(n))k='generator';
  if(!k&&/carbon|steel|crystal|mine|extract|collect/.test(n))k='drill';
  return `<svg viewBox="0 0 64 40">${B[k||'generic']}</svg>`;
}
const R='fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"';
export const RES_ICON={
 carbon:`<svg viewBox="0 0 24 24" style="color:#9aa8ad"><path ${R} d="M12 2l8.5 5v10L12 22 3.5 17V7z"/><path d="M12 7l4 2.3v4.6L12 16.2 8 13.9V9.3z" fill="currentColor"/></svg>`,
 steel:`<svg viewBox="0 0 24 24" style="color:#6fb4ff"><path ${R} d="M4 6h16v4H4zM6 14h12v4H6z"/><path d="M8 8h8M9 16h6" stroke="currentColor" stroke-width="1.2"/></svg>`,
 crystal:`<svg viewBox="0 0 24 24" style="color:#2ef2d0"><path ${R} d="M12 2l6 7-6 13L6 9z"/><path d="M6 9h12M12 2v20M9 9l3 13 3-13" stroke="currentColor" stroke-width="1" fill="none"/></svg>`,
};
export const BADGE=`<svg viewBox="0 0 82 88"><defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2ef2d0"/><stop offset="1" stop-color="#ffb43a"/></linearGradient></defs>
<path d="M41 2l36 20v44L41 86 5 66V22z" fill="rgba(4,16,22,.7)" stroke="url(#bg1)" stroke-width="2"/>
<path d="M41 12l27 15v34L41 76 14 61V27z" fill="none" stroke="rgba(46,242,208,.35)" stroke-width="1"/>
<path d="M27 54V38l14-9 14 9v16l-14 9z" fill="rgba(46,242,208,.18)" stroke="#2ef2d0" stroke-width="2"/>
<path d="M33 40h16M41 33v-9M33 50h16" stroke="#ffb43a" stroke-width="2.4" stroke-linecap="round"/><circle cx="41" cy="45" r="3" fill="#fff"/></svg>`;
