// Canvas-generated alpha textures: fronds, decals.
import * as THREE from 'three';
import {rng} from './noise.js';
function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')]}
function tex(c,srgb=true){const t=new THREE.CanvasTexture(c);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=8;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;return t}
// Pinnate frond: v (canvas bottom->top) is length; bright midrib + leaflet veins, alpha cut-out.
export function frondTexture(kind=0){
  const W=256,H=512,[c,g]=cv(W,H);g.clearRect(0,0,W,H);const R=rng(5+kind);
  const cx=W/2,n=kind===0?22:16;
  // leaflets
  for(let i=0;i<n;i++){const t=i/(n-1),y=H*(.97-t*.93);const len=W*.5*Math.sin(Math.PI*(.12+.85*(1-t*.9)))*(kind===0?.95:.8)*(1-t*.55)+10;
    for(const s of [-1,1]){const ang=(kind===0?.55:.8)+t*.15,ex=cx+s*len*Math.cos(ang*.6),ey=y-len*Math.sin(ang)*.55-(kind===0?8:14);
      const grd=g.createLinearGradient(cx,y,ex,ey);grd.addColorStop(0,'#9fb0a8');grd.addColorStop(.5,'#c9d6cf');grd.addColorStop(1,'#eef');
      g.fillStyle=grd;g.beginPath();g.moveTo(cx,y+2);
      g.quadraticCurveTo(cx+s*len*.5,y-len*.42-(kind?10:0),ex,ey);
      g.quadraticCurveTo(cx+s*len*.52,y+len*.1,cx,y+9);g.closePath();g.fill();
      g.strokeStyle='rgba(255,255,255,.75)';g.lineWidth=1.4;g.beginPath();g.moveTo(cx,y+2);g.lineTo(ex,ey);g.stroke()}}
  g.strokeStyle='#fff';g.lineWidth=5;g.beginPath();g.moveTo(cx,H);g.lineTo(cx,H*.03);g.stroke();
  const t=tex(c);return t}
export function soft(kind,col){
  const S=256,[c,g]=cv(S,S);g.clearRect(0,0,S,S);const R=rng(77+kind.length);
  if(kind==='glow'){const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,S,S)}
  else if(kind==='scorch'){for(let k=0;k<26;k++){const a=R()*6.28,d=R()*S*.22,x=S/2+Math.cos(a)*d,y=S/2+Math.sin(a)*d,r=S*(.1+R()*.2);const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(0,0,0,.55)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill()}
    const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S*.2);gr.addColorStop(0,'rgba(0,0,0,.9)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,S,S)}
  else if(kind==='ichor'){for(let k=0;k<18;k++){const a=R()*6.28,d=R()*S*.3,x=S/2+Math.cos(a)*d,y=S/2+Math.sin(a)*d,r=S*(.04+R()*.13);g.fillStyle='rgba(255,255,255,'+(.5+R()*.4)+')';g.beginPath();g.ellipse(x,y,r,r*(.5+R()*.5),R()*3,0,7);g.fill()}
    const gr=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S*.25);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,S,S)}
  else if(kind==='litter'){for(let k=0;k<22;k++){const x=R()*S,y=R()*S,r=10+R()*18,a=R()*6.28;g.save();g.translate(x,y);g.rotate(a);const l=70+R()*60;
      g.fillStyle=`hsla(${R()<.5?280+R()*40:160+R()*30},${35+R()*30}%,${35+R()*30}%,${.55+R()*.4})`;g.beginPath();g.moveTo(-l*.5,0);g.quadraticCurveTo(0,-r*1.2,l*.5,0);g.quadraticCurveTo(0,r*1.2,-l*.5,0);g.fill();
      g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1.5;g.beginPath();g.moveTo(-l*.5,0);g.lineTo(l*.5,0);g.stroke();g.restore()}}
  else if(kind==='crack'){g.strokeStyle='rgba(0,0,0,.85)';g.lineCap='round';
    const br=(x,y,a,w,d)=>{if(d>5||w<.5)return;const l=14+R()*34;const nx=x+Math.cos(a)*l,ny=y+Math.sin(a)*l;g.lineWidth=w;g.beginPath();g.moveTo(x,y);g.lineTo(nx,ny);g.stroke();
      br(nx,ny,a+(R()-.5)*.9,w*.82,d+1);if(R()<.55)br(nx,ny,a+(R()<.5?-1:1)*(.5+R()*.8),w*.6,d+1)};
    for(let k=0;k<3;k++)br(S/2,S/2,R()*6.28,6,0)}
  else if(kind==='moss'){for(let k=0;k<50;k++){const a=R()*6.28,d=Math.pow(R(),.7)*S*.4,x=S/2+Math.cos(a)*d,y=S/2+Math.sin(a)*d,r=S*(.03+R()*.07);const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill()}}
  else if(kind==='spores'){for(let k=0;k<40;k++){const a=R()*6.28,d=Math.pow(R(),.6)*S*.42,x=S/2+Math.cos(a)*d,y=S/2+Math.sin(a)*d,r=2+R()*6;const gr=g.createRadialGradient(x,y,0,x,y,r*2.5);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.beginPath();g.arc(x,y,r*2.5,0,7);g.fill()}}
  return tex(c)}
