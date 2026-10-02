// Local VFX for buildings: soft particles, bolts/tracers, floating numbers, health bars, debris, decals, rings.
import * as THREE from 'three';
import {makeGlowTex,makeSmokeTex} from './gfx.js';

const cv=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
class Soft{
  constructor(scene,N,tex,additive,camera,renderer){
    this.N=N;this.i=0;this.cam=camera;this.r=renderer;
    this.d={x:new Float32Array(N),y:new Float32Array(N),z:new Float32Array(N),vx:new Float32Array(N),vy:new Float32Array(N),vz:new Float32Array(N),age:new Float32Array(N).fill(9),life:new Float32Array(N).fill(1),s0:new Float32Array(N),s1:new Float32Array(N),col:new Float32Array(N*3),a0:new Float32Array(N),grav:new Float32Array(N),drag:new Float32Array(N)};
    const g=this.g=new THREE.BufferGeometry();this.pos=new Float32Array(N*3);this.size=new Float32Array(N);this.colA=new Float32Array(N*4);
    g.setAttribute('position',new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aSize',new THREE.BufferAttribute(this.size,1).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aCol',new THREE.BufferAttribute(this.colA,4).setUsage(THREE.DynamicDrawUsage));
    this.mat=new THREE.ShaderMaterial({uniforms:{uTex:{value:tex},uScale:{value:500}},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
      vertexShader:`attribute float aSize;attribute vec4 aCol;varying vec4 vC;uniform float uScale;void main(){vC=aCol;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uScale/-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform sampler2D uTex;varying vec4 vC;void main(){vec4 t=texture2D(uTex,gl_PointCoord);gl_FragColor=vec4(vC.rgb,vC.a*t.a*t.r+0.0);if(gl_FragColor.a<.004)discard;}`});
    this.pts=new THREE.Points(g,this.mat);this.pts.frustumCulled=false;this.pts.renderOrder=additive?30:20;scene.add(this.pts);
    for(let k=0;k<N;k++)this.size[k]=0;
  }
  emit(x,y,z,vx,vy,vz,life,s0,s1,color,a0=1,grav=0,drag=0){if(!(x+y+z+vx+vy+vz===x+y+z+vx+vy+vz))return;const d=this.d,k=this.i;this.i=(k+1)%this.N;
    d.x[k]=x;d.y[k]=y;d.z[k]=z;d.vx[k]=vx;d.vy[k]=vy;d.vz[k]=vz;d.age[k]=0;d.life[k]=life;d.s0[k]=s0;d.s1[k]=s1;d.a0[k]=a0;d.grav[k]=grav;d.drag[k]=drag;
    d.col[k*3]=(color>>16&255)/255;d.col[k*3+1]=(color>>8&255)/255;d.col[k*3+2]=(color&255)/255}
  update(dt){const d=this.d,N=this.N;this.mat.uniforms.uScale.value=this.r.domElement.height/(2*Math.tan(this.cam.fov*Math.PI/360));
    for(let k=0;k<N;k++){if(d.age[k]>=d.life[k]){this.size[k]=0;this.colA[k*4+3]=0;continue}
      d.age[k]+=dt;const u=Math.min(1,d.age[k]/d.life[k]);const dr=1-d.drag[k]*dt;d.vx[k]*=dr;d.vy[k]=d.vy[k]*dr-d.grav[k]*dt;d.vz[k]*=dr;
      d.x[k]+=d.vx[k]*dt;d.y[k]+=d.vy[k]*dt;d.z[k]+=d.vz[k]*dt;
      this.pos[k*3]=d.x[k];this.pos[k*3+1]=d.y[k];this.pos[k*3+2]=d.z[k];this.size[k]=d.s0[k]+(d.s1[k]-d.s0[k])*u;
      const a=d.a0[k]*Math.min(1,u*8)*(1-u)*(1-u*.3);this.colA[k*4]=d.col[k*3];this.colA[k*4+1]=d.col[k*3+1];this.colA[k*4+2]=d.col[k*3+2];this.colA[k*4+3]=a}
    this.g.attributes.position.needsUpdate=this.g.attributes.aSize.needsUpdate=this.g.attributes.aCol.needsUpdate=true}
}

export class VFX{
  constructor(ctx){
    this.ctx=ctx;const {scene,camera,renderer}=ctx;this.scene=scene;
    const glow=makeGlowTex(),smk=makeSmokeTex();this.glowTex=glow;
    this.smk=new Soft(scene,500,smk,false,camera,renderer);this.fireP=new Soft(scene,700,glow,true,camera,renderer);
    // bolts
    this.maxB=900;this.bm=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),this.maxB);
    this.bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.bm.frustumCulled=false;this.bm.count=0;this.bm.renderOrder=31;scene.add(this.bm);this.bn=0;
    this.bm.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(this.maxB*3),3);
    // bars
    this.maxBar=160;const pg=new THREE.PlaneGeometry(1,1),bmat=()=>new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
    this.barBg=new THREE.InstancedMesh(pg,bmat(),this.maxBar);this.barFg=new THREE.InstancedMesh(pg,bmat(),this.maxBar);
    for(const m of [this.barBg,this.barFg]){m.frustumCulled=false;m.count=0;m.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(this.maxBar*3),3);scene.add(m)}
    this.barBg.renderOrder=998;this.barFg.renderOrder=999;this.nbar=0;
    // debris
    this.maxD=140;this.deb=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xffffff,metalness:.8,roughness:.5}),this.maxD);
    this.deb.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(this.maxD*3),3);this.deb.frustumCulled=false;this.deb.castShadow=true;scene.add(this.deb);
    this.dd=[];for(let i=0;i<this.maxD;i++)this.dd.push({life:0,p:new THREE.Vector3(),v:new THREE.Vector3(),r:new THREE.Euler(),rv:new THREE.Vector3(),s:new THREE.Vector3(.3,.3,.3)});this.di=0;
    // decals
    const c=cv(128,128),g=c.getContext('2d');const gr=g.createRadialGradient(64,64,4,64,64,64);gr.addColorStop(0,'rgba(0,0,0,.85)');gr.addColorStop(.5,'rgba(10,8,6,.55)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);
    for(let i=0;i<40;i++){g.fillStyle=`rgba(0,0,0,${Math.random()*.4})`;g.beginPath();g.arc(64+(Math.random()-.5)*80,64+(Math.random()-.5)*80,Math.random()*6,0,7);g.fill()}
    const st=new THREE.CanvasTexture(c);this.scorchMat=new THREE.MeshBasicMaterial({map:st,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    this.scorch=[];this.si=0;
    const rc=cv(128,128),rg=rc.getContext('2d');rg.strokeStyle='#fff';rg.lineWidth=5;rg.shadowColor='#fff';rg.shadowBlur=8;rg.beginPath();rg.arc(64,64,52,0,7);rg.stroke();
    this.ringTex=new THREE.CanvasTexture(rc);this.rings=[];for(let i=0;i<14;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.ringTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));m.rotation.x=-Math.PI/2;m.visible=false;m.renderOrder=5;m.userData={age:9,life:1,s0:1,s1:2};scene.add(m);this.rings.push(m)}this.ri=0;
    // floaters
    this.fl=[];this.flTex=new Map();for(let i=0;i<24;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false,toneMapped:false}));s.visible=false;s.renderOrder=1000;s.userData={age:9};scene.add(s);this.fl.push(s)}this.fi=0;
    this._ax=new THREE.Vector3(1,0,0);this._v=new THREE.Vector3();this._q=new THREE.Quaternion();this._m=new THREE.Matrix4();this._e=new THREE.Euler();this._s=new THREE.Vector3();this._c=new THREE.Color();this._r=new THREE.Vector3();this._up=new THREE.Vector3();
  }
  smoke(x,y,z,size=1,color=0x555555){this.smk.emit(x+(Math.random()-.5)*.4,y,z+(Math.random()-.5)*.4,(Math.random()-.5)*.6,1.2+Math.random()*.8,(Math.random()-.5)*.6,2+Math.random()*1.5,size*.6,size*2.2,color,.55,-.2,.4)}
  fire(x,y,z,size=1){this.fireP.emit(x+(Math.random()-.5)*.5,y,z+(Math.random()-.5)*.5,(Math.random()-.5)*.5,1.5+Math.random()*1.5,(Math.random()-.5)*.5,.5+Math.random()*.5,size*1.1,size*.2,Math.random()<.5?0xff7a1a:0xffc040,1,-.5,.8)}
  flash(x,y,z,size,color=0xffe0a0,life=.09){this.fireP.emit(x,y,z,0,0,0,life,size,size*1.4,color,1.2)}
  spark(x,y,z,n=6,spd=5,color=0xffd080){for(let i=0;i<n;i++){const a=Math.random()*6.28,u=Math.random();this.fireP.emit(x,y,z,Math.cos(a)*spd*u,spd*(.4+Math.random()),Math.sin(a)*spd*u,.3+Math.random()*.4,.16,.05,color,1,14,.5)}}
  ring(x,y,z,s0,s1,color=0x44ffaa,life=.8,op=1){const m=this.rings[this.ri];this.ri=(this.ri+1)%this.rings.length;m.position.set(x,y+.08,z);m.material.color.set(color);m.userData={age:0,life,s0,s1,op};m.visible=true}
  // bolts
  beginBolts(){this.bn=0}
  seg(ax,ay,az,bx,by,bz,w,color){if(this.bn>=this.maxB)return;const dx=bx-ax,dy=by-ay,dz=bz-az,l=Math.hypot(dx,dy,dz)||1e-3;
    this._v.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);this._r.set(dx/l,dy/l,dz/l);this._q.setFromUnitVectors(this._ax,this._r);
    this._m.compose(this._v,this._q,this._s.set(l,w,w));this.bm.setMatrixAt(this.bn,this._m);this._c.set(color);this.bm.setColorAt(this.bn,this._c);this.bn++}
  lightning(a,b,color,w=.12,jag=.5,n=9){let px=a.x,py=a.y,pz=a.z;const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,l=Math.hypot(dx,dy,dz);
    for(let i=1;i<=n;i++){const t=i/n,j=i===n?0:jag*Math.sin(t*Math.PI)*(l/12+.4);const x=a.x+dx*t+(Math.random()-.5)*j*2,y=a.y+dy*t+(Math.random()-.5)*j*2,z=a.z+dz*t+(Math.random()-.5)*j*2;
      this.seg(px,py,pz,x,y,z,w*2.8,color);this.seg(px,py,pz,x,y,z,w,0xffffff);px=x;py=y;pz=z}}
  endBolts(){this.bm.count=this.bn;this.bm.instanceMatrix.needsUpdate=true;if(this.bm.instanceColor)this.bm.instanceColor.needsUpdate=true}
  // bars
  beginBars(){this.nbar=0;this._rt=this._r.set(1,0,0).applyQuaternion(this.ctx.camera.quaternion).clone();this._u=this._up.set(0,1,0).applyQuaternion(this.ctx.camera.quaternion).clone()}
  bar(x,y,z,w,frac,color,h=.2){if(this.nbar>=this.maxBar)return;const i=this.nbar++,q=this.ctx.camera.quaternion;
    this._m.compose(this._v.set(x,y,z),q,this._s.set(w+.1,h+.1,1));this.barBg.setMatrixAt(i,this._m);this._c.set(0x05070a);this.barBg.setColorAt(i,this._c);
    const fw=Math.max(.001,w*frac);this._v.set(x,y,z).addScaledVector(this._rt,-(w-fw)/2).addScaledVector(this._u,0);
    this._m.compose(this._v,q,this._s.set(fw,h,1));this.barFg.setMatrixAt(i,this._m);this._c.set(color);this.barFg.setColorAt(i,this._c)}
  endBars(){for(const m of [this.barBg,this.barFg]){m.count=this.nbar;m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true}}
  // floating text
  text(str,x,y,z,color='#ffb030'){let t=this.flTex.get(str+color);if(!t){const c=cv(128,48),g=c.getContext('2d');g.font='bold 34px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=6;g.strokeStyle='rgba(0,0,0,.85)';g.strokeText(str,64,25);g.fillStyle=color;g.shadowColor=color;g.shadowBlur=8;g.fillText(str,64,25);t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;this.flTex.set(str+color,t)}
    const s=this.fl[this.fi];this.fi=(this.fi+1)%this.fl.length;s.material.map=t;s.material.needsUpdate=true;s.position.set(x,y,z);s.scale.set(2.6,.98,1);s.visible=true;s.userData={age:0,y0:y}}
  debris(p,n,scale=1){const th=this.ctx.terrain;for(let i=0;i<n;i++){const d=this.dd[this.di];this.di=(this.di+1)%this.maxD;d.life=2.5+Math.random()*2;d.p.set(p.x+(Math.random()-.5)*2*scale,p.y+.5+Math.random()*2,p.z+(Math.random()-.5)*2*scale);
    const a=Math.random()*6.28,sp=3+Math.random()*7;d.v.set(Math.cos(a)*sp,5+Math.random()*9,Math.sin(a)*sp);d.rv.set((Math.random()-.5)*12,(Math.random()-.5)*12,(Math.random()-.5)*12);d.s.set(.15+Math.random()*.5,.1+Math.random()*.3,.15+Math.random()*.5).multiplyScalar(scale*.65);d.r.set(Math.random()*6,Math.random()*6,Math.random()*6);d.hot=Math.random()<.25;d.i=this.di}}
  scorchAt(x,y,z,r){let m=this.scorch[this.si];if(!m){m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),this.scorchMat);m.rotation.x=-Math.PI/2;m.renderOrder=2;this.scene.add(m);this.scorch[this.si]=m}this.si=(this.si+1)%16;m.position.set(x,y+.05,z);m.scale.setScalar(r*2);m.rotation.z=Math.random()*6}
  update(dt){
    this.smk.update(dt);this.fireP.update(dt);
    for(const m of this.rings){const u=m.userData;if(u.age>=u.life){m.visible=false;continue}u.age+=dt;const k=u.age/u.life;m.scale.setScalar(u.s0+(u.s1-u.s0)*Math.sqrt(k));m.material.opacity=(1-k)*(u.op||1)}
    for(const s of this.fl){const u=s.userData;if(u.age>=1.3){s.visible=false;continue}u.age+=dt;s.position.y=u.y0+u.age*1.6;s.material.opacity=Math.min(1,(1.3-u.age)*2.5)}
    // debris
    const th=this.ctx.terrain;let cnt=0;const m=this._m,q=this._q;
    for(let i=0;i<this.maxD;i++){const d=this.dd[i];if(d.life<=0)continue;d.life-=dt;d.v.y-=22*dt;d.p.addScaledVector(d.v,dt);const gy=(th?.heightAt?.(d.p.x,d.p.z)||0)+d.s.y*.5;
      if(d.p.y<gy){d.p.y=gy;d.v.y*=-.35;d.v.x*=.6;d.v.z*=.6;d.rv.multiplyScalar(.5)}d.r.x+=d.rv.x*dt;d.r.y+=d.rv.y*dt;d.r.z+=d.rv.z*dt;
      if(d.hot&&Math.random()<dt*10&&d.life>1)this.fire(d.p.x,d.p.y,d.p.z,.35);
      const sc=Math.min(1,d.life*2);q.setFromEuler(d.r);m.compose(d.p,q,this._s.copy(d.s).multiplyScalar(sc));this.deb.setMatrixAt(cnt,m);this._c.set(d.hot?0x884422:0x3a4048);this.deb.setColorAt(cnt,this._c);cnt++}
    this.deb.count=cnt;this.deb.instanceMatrix.needsUpdate=true;this.deb.instanceColor.needsUpdate=true;
  }
}
