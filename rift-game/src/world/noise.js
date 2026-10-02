// Deterministic noise helpers (DOM-free). Periodic variants are used for tileable textures.
export function rng(seed){let a=(seed|0)||1;return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
export const lerp=(a,b,t)=>a+(b-a)*t;
export const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export function h2(x,y,s){let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,1274126177))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296}
const fade=t=>t*t*t*(t*(t*6-15)+10);
export function vnoise(x,y,s=0,per=0){
  let xi=Math.floor(x),yi=Math.floor(y);const xf=x-xi,yf=y-yi;let x1=xi+1,y1=yi+1;
  if(per){xi=((xi%per)+per)%per;x1=((x1%per)+per)%per;yi=((yi%per)+per)%per;y1=((y1%per)+per)%per}
  const a=h2(xi,yi,s),b=h2(x1,yi,s),c=h2(xi,y1,s),d=h2(x1,y1,s);const u=fade(xf),v=fade(yf);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
export function fbm(x,y,oct=4,s=0,per=0){let a=.5,f=1,sum=0,n=0;for(let o=0;o<oct;o++){sum+=a*vnoise(x*f,y*f,s+o*17,per?per*f:0);n+=a;a*=.5;f*=2}return sum/n}
// worley: returns into out [d1,d2,id]
export function worley(x,y,s,per,out){const xi=Math.floor(x),yi=Math.floor(y);let d1=9,d2=9,id=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const cx=xi+dx,cy=yi+dy;const wx=per?((cx%per)+per)%per:cx,wy=per?((cy%per)+per)%per:cy;
    const px=cx+h2(wx,wy,s),py=cy+h2(wx,wy,s+91);const d=Math.hypot(px-x,py-y);
    if(d<d1){d2=d1;d1=d;id=h2(wx,wy,s+7)}else if(d<d2)d2=d}
  out[0]=d1;out[1]=d2;out[2]=id;return out}
export function h3(x,y,z,s){let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,2147483647)+Math.imul(s,1274126177))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296}
export function noise3(x,y,z,s=0){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);const xf=fade(x-xi),yf=fade(y-yi),zf=fade(z-zi);
  const g=(i,j,k)=>h3(xi+i,yi+j,zi+k,s);
  const x00=lerp(g(0,0,0),g(1,0,0),xf),x10=lerp(g(0,1,0),g(1,1,0),xf),x01=lerp(g(0,0,1),g(1,0,1),xf),x11=lerp(g(0,1,1),g(1,1,1),xf);
  return lerp(lerp(x00,x10,yf),lerp(x01,x11,yf),zf)}
