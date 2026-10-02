// Shader-patched materials for the biome. Shared uniforms U are updated once per frame by terrain.js.
import * as THREE from 'three';
export const U={uTime:{value:0},uCam:{value:new THREE.Vector3(0,26,19)},uTgt:{value:new THREE.Vector3()},uGlowMap:{value:null},uExt:{value:280},uWind:{value:1},uSun:{value:new THREE.Vector3(.4,.8,.3)}};

const CUT=`
 { vec3 cd=uTgt-uCam;float cL=length(cd);vec3 cdir=cd/cL;vec3 pc=vWPos-uCam;float ct=dot(pc,cdir);
   if(ct>1.&&ct<cL-.5){float dist=length(pc-cdir*ct);float a=smoothstep(3.4,1.8,dist)*.96;
     float dth=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));if(a>dth)discard;}}`;
export function foliageMat(o={}){
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:o.rough??.8,metalness:o.metal??0,map:o.map||null,normalMap:o.normalMap||null,
    vertexColors:true,side:o.double?THREE.DoubleSide:THREE.FrontSide,alphaTest:o.alphaTest||0});
  if(o.normalMap)m.normalScale.set(o.ns??1,o.ns??1);
  const amp=(o.wind??0).toFixed(3),gk=(o.glowK??2).toFixed(2),gg=(o.groundGlow??2.2).toFixed(2);
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,{uTime:U.uTime,uCam:U.uCam,uTgt:U.uTgt,uGlowMap:U.uGlowMap,uExt:U.uExt,uWind:U.uWind});
    sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
attribute float aGlow;attribute float aSway;uniform float uTime;uniform float uWind;uniform sampler2D uGlowMap;uniform float uExt;
varying float vGlow;varying vec3 vGG;varying vec3 vWPos;`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
vGlow=aGlow;
#ifdef USE_INSTANCING
mat4 imx=instanceMatrix;
#else
mat4 imx=mat4(1.);
#endif
vec3 iw=vec3(imx[3]);
${+amp>0?`float ph=iw.x*.27+iw.z*.19;float gust=sin(uTime*.7+iw.x*.045+iw.z*.03)*.5+.5;
float w1=sin(uTime*1.9+ph)*.6+sin(uTime*3.1+ph*1.7)*.4;
transformed.x+=(w1*.5+gust*.9)*aSway*uWind*${amp};transformed.z+=(cos(uTime*1.6+ph*1.3)*.4+gust*.4)*aSway*uWind*${amp};
transformed.y-=abs(w1)*aSway*uWind*${amp}*.15;`:''}
vWPos=(modelMatrix*imx*vec4(transformed,1.)).xyz;
vGG=texture2D(uGlowMap,(iw.xz+uExt*.5)/uExt).rgb;`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform float uTime;uniform vec3 uCam;uniform vec3 uTgt;varying float vGlow;varying vec3 vGG;varying vec3 vWPos;`)
    .replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
${o.cutaway?CUT:''}`)
    .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
float pulse=.86+.14*sin(uTime*1.3+vWPos.x*.45+vWPos.z*.37);
totalEmissiveRadiance+=diffuseColor.rgb*vGlow*${gk}*pulse;
totalEmissiveRadiance+=diffuseColor.rgb*vGG*${gg};`);
  };
  m.customProgramCacheKey=()=>'fol'+amp+gk+gg+(o.cutaway?1:0);
  return m}
export function depthMat(map,alphaTest=.45){return new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map,alphaTest})}

// ---------- TERRAIN ----------
export function terrainMat(tex){
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,{uAlb:{value:tex.alb},uNrm:{value:tex.nrm},uSplat:{value:tex.splat},uGlow:U.uGlowMap,uNoise:{value:tex.noise},uTime:U.uTime,uExt:U.uExt,uTile:{value:6.0}});
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vWN;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvWP=position;vWN=normal;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uAlb;uniform sampler2DArray uNrm;uniform sampler2D uSplat;uniform sampler2D uGlow;uniform sampler2D uNoise;uniform float uTime;uniform float uExt;uniform float uTile;
varying vec3 vWP;varying vec3 vWN;`)
    .replace('#include <map_fragment>',`
vec3 tWN=normalize(vWN);vec2 wuv=vWP.xz;vec2 suv=(wuv+uExt*.5)/uExt;
vec4 sp=texture2D(uSplat,suv);vec4 gmap=texture2D(uGlow,suv);
vec4 nzA=(texture2D(uNoise,wuv*.0113)-.5)*1.9+.5,nzB=(texture2D(uNoise,wuv*.041+.31)-.5)*1.9+.5,nzC=texture2D(uNoise,wuv*.19+.6),nzD=texture2D(uNoise,wuv*.6+.2);
float Wt[5];Wt[0]=sp.r;Wt[1]=sp.g;Wt[2]=sp.b;Wt[3]=sp.a;Wt[4]=max(0.,1.-sp.r-sp.g-sp.b-sp.a);
Wt[0]*=.7+.6*nzC.r;Wt[1]*=.7+.6*nzC.g;Wt[2]*=.75+.5*nzC.b;Wt[3]*=.7+.6*nzC.a;Wt[4]*=.7+.6*nzB.a;
vec2 uvA=wuv/uTile;vec2 uvB=vec2(wuv.x*.8+wuv.y*.6,-wuv.x*.6+wuv.y*.8)/(uTile*2.63)+vec2(.37,.11);
vec2 dxA=dFdx(uvA),dyA=dFdy(uvA),dxB=dFdx(uvB),dyB=dFdy(uvB);
vec2 uvX=vWP.zy/uTile,uvZ=vWP.xy/uTile;vec2 dxX=dFdx(uvX),dyX=dFdy(uvX),dxZ=dFdx(uvZ),dyZ=dFdy(uvZ);
vec4 aL[5];vec3 pL[5];float hL[5];float sc[5];float mxs=-9.;
for(int i=0;i<5;i++){aL[i]=vec4(0.);pL[i]=vec3(0.);hL[i]=.5;sc[i]=-9.;
 if(Wt[i]>.004){
  vec4 a1=textureGrad(uAlb,vec3(uvA,float(i)),dxA,dyA);vec4 nn=textureGrad(uNrm,vec3(uvA,float(i)),dxA,dyA);
  vec3 nd=nn.xyz*2.-1.;
  if(i==2){aL[i]=a1;pL[i]=vec3(nd.x,0.,nd.y);}
  else if(i==3){
    vec3 bw=pow(abs(tWN),vec3(5.));bw/=bw.x+bw.y+bw.z;
    vec4 aX=textureGrad(uAlb,vec3(uvX,3.),dxX,dyX),aZ=textureGrad(uAlb,vec3(uvZ,3.),dxZ,dyZ);
    vec3 nX=textureGrad(uNrm,vec3(uvX,3.),dxX,dyX).xyz*2.-1.,nZ=textureGrad(uNrm,vec3(uvZ,3.),dxZ,dyZ).xyz*2.-1.;
    vec4 a2=textureGrad(uAlb,vec3(uvB,3.),dxB,dyB);
    aL[i]=(mix(a1,a2,.35))*bw.y+aX*bw.x+aZ*bw.z;
    pL[i]=bw.y*vec3(nd.x,0.,nd.y)+bw.x*vec3(0.,nX.y,nX.x)+bw.z*vec3(nZ.x,nZ.y,0.);
  }else{vec4 a2=textureGrad(uAlb,vec3(uvB,float(i)),dxB,dyB);aL[i]=mix(a1,a2,.42);pL[i]=vec3(nd.x,0.,nd.y);}
  hL[i]=nn.a;sc[i]=Wt[i]*1.7+nn.a*.9;mxs=max(mxs,sc[i]);}}
float ws=0.;vec3 alb=vec3(0.);float rgh=0.;vec3 pert=vec3(0.);float hmix=0.;float wt2=0.;
for(int i=0;i<5;i++){if(sc[i]>-8.){float t=max(sc[i]-(mxs-.5),0.);ws+=t;alb+=aL[i].rgb*t;rgh+=aL[i].a*t;pert+=pL[i]*t;hmix+=hL[i]*t;if(i==2)wt2=t;}}
ws=max(ws,1e-4);alb/=ws;rgh/=ws;pert/=ws;hmix/=ws;wt2/=ws;
float veinG=smoothstep(.3,.65,aL[2].b-aL[2].r*1.4)*wt2;
alb*=mix(.68,1.32,nzA.r);alb*=vec3(1.+(nzB.g-.5)*.4,1.,1.+(nzB.b-.5)*.4);
alb*=.82+.36*nzD.g;
alb*=(1.-gmap.a*.6);alb*=.78+.44*hmix;
diffuseColor.rgb=alb;
vec3 terrEm=vec3(.08,.85,1.)*veinG*(3.2+1.2*sin(uTime*1.4+nzB.r*30.+nzA.g*9.))+alb*gmap.rgb*2.6;
float terrRough=clamp(rgh,.2,1.);
vec3 terrWN=normalize(tWN+pert*1.15);
`)
    .replace('#include <roughnessmap_fragment>','float roughnessFactor=terrRough;')
    .replace('#include <normal_fragment_maps>','normal=normalize((viewMatrix*vec4(terrWN,0.)).xyz);')
    .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=terrEm;');
  };
  m.customProgramCacheKey=()=>'terrain1';
  return m}

// ---------- WATER ----------
export function waterMat(noiseTex){
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:U.uTime,uNoise:{value:noiseTex},uSun:U.uSun}]);
  return new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,fog:true,side:THREE.DoubleSide,
    vertexShader:`attribute float aDepth;varying float vD;varying vec3 vW;
#include <fog_pars_vertex>
void main(){vD=aDepth;vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader:`uniform float uTime;uniform sampler2D uNoise;uniform vec3 uSun;varying float vD;varying vec3 vW;
#include <fog_pars_fragment>
void main(){
  vec2 p=vW.xz;float t=uTime;
  vec2 g1=texture2D(uNoise,p*.045+vec2(t*.012,t*.007)).xy-.5,g2=texture2D(uNoise,p*.11-vec2(t*.02,-t*.015)).zw-.5,g3=texture2D(uNoise,p*.31+vec2(t*.04,-t*.03)).xy-.5;
  float w=sin(p.x*1.3+t*1.1+g1.x*6.)*.5+sin(p.y*1.7-t*.9+g2.y*6.)*.5;
  vec3 N=normalize(vec3((g1.x+g2.x*1.6+g3.x*1.2)*1.7+w*.05,1.,(g1.y+g2.y*1.6+g3.y*1.2)*1.7+w*.05));
  vec3 V=normalize(cameraPosition-vW);float fr=pow(1.-max(dot(N,V),0.),3.);
  float dp=clamp(vD,0.,3.);
  vec3 shallow=vec3(.03,.34,.34),deep=vec3(.0,.04,.1);
  vec3 col=mix(shallow,deep,smoothstep(.1,1.6,dp));
  vec3 sky=vec3(.1,.34,.5);col=mix(col,sky,fr*.75);
  vec3 L=normalize(uSun);vec3 H=normalize(L+V);float spec=pow(max(dot(N,H),0.),180.)*2.5+pow(max(dot(N,H),0.),30.)*.12;
  col+=spec*vec3(1.,.95,.85);
  float foam=smoothstep(.22,.0,vD+ (g2.x+g1.y)*.25)*(.6+.4*sin(t*2.+p.x*2.+p.y*1.5+g3.x*8.));
  col+=foam*vec3(.5,.9,.95)*.7;
  float sp2=smoothstep(.62,.75,texture2D(uNoise,p*.5+vec2(-t*.03,t*.02)).z)*smoothstep(.2,1.,vD);
  col+=vec3(.1,.9,1.)*sp2*(.6+.4*sin(t*3.+p.x*4.));
  col+=vec3(.0,.18,.2)*smoothstep(.1,2.,dp)*.6;
  float a=smoothstep(.0,.3,vD)*(.62+.33*smoothstep(.2,1.4,dp));a=max(a,foam*.5*step(.0,vD+.1));a*=smoothstep(-.05,.05,vD);
  gl_FragColor=vec4(col,a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`})}

// ---------- SPORES (floating motes) ----------
export function sporeMat(){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:U.uTime,uC:{value:new THREE.Vector3()},uBox:{value:new THREE.Vector3(70,16,70)}},
    vertexShader:`attribute vec4 aS;attribute vec3 aCol;uniform float uTime;uniform vec3 uC;uniform vec3 uBox;varying vec3 vC;varying float vA;
void main(){vec3 p=position+vec3(sin(uTime*.3+aS.x*20.)*1.5,uTime*aS.y*.15+sin(uTime*.5+aS.z*30.)*.8,cos(uTime*.27+aS.x*17.)*1.5);
 p=mod(p-uC+uBox*.5,uBox)-uBox*.5;vec3 wp=p+uC;wp.y=.4+mod(wp.y-.4,uBox.y);
 vec4 mv=viewMatrix*vec4(wp,1.);gl_Position=projectionMatrix*mv;
 float tw=.5+.5*sin(uTime*(1.+aS.z*2.)+aS.x*40.);vA=tw*(1.-smoothstep(.35,.5,length(p.xz)/uBox.x))*smoothstep(0.,2.,wp.y);vC=aCol;
 gl_PointSize=clamp(aS.w*(70./-mv.z),1.5,5.);}`,
    fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=length(d)*2.;float a=smoothstep(1.,0.,r);a*=a;gl_FragColor=vec4(vC*(.6+a),a*vA*.4);}`})}
