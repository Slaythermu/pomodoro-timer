// usage: node tools/snapshot.mjs <label> [w=1600] [h=900]
// Captures a fixed scene set into evolution/vNN-<label>/ , writes manifest.json, and rebuilds evolution/README.md
// with per-version galleries and side-by-side comparison vs previous version (same scene, same seed => comparable).
import {chromium} from 'playwright-core';import {createServer} from 'vite';import fs from 'fs';import path from 'path';import {execSync} from 'child_process';
const [label='update',w='1600',h='900']=process.argv.slice(2);
const root='evolution';fs.mkdirSync(root,{recursive:true});
const prev=fs.readdirSync(root).filter(d=>/^v\d+/.test(d)).sort();
const n=prev.length?+prev.at(-1).match(/^v(\d+)/)[1]+1:1;
const dir=path.join(root,`v${String(n).padStart(2,'0')}-${label.replace(/\W+/g,'-')}`);fs.mkdirSync(dir,{recursive:true});
// Scenes: name, query, setup JS (guarded), frames
const G=`const g=window.__game;`;
const scenes=[
 ['01-overview','seed=1&autostart=1','',90],
 ['02-hero-closeup','seed=1&autostart=1',`${G}try{g.camera.position.set(g.player.pos.x+4,g.player.pos.y+4.5,g.player.pos.z+7);g.camera.lookAt(g.player.pos.x,g.player.pos.y+1.5,g.player.pos.z);g.camera.fov=30;g.camera.updateProjectionMatrix();g.player.noCamera=true}catch(e){}`,60],
 ['03-combat-horde','seed=2&autostart=1&autowave=0',`${G}try{const P=g.player.pos;const E=g.enemies;for(let i=0;i<26;i++){const a=i/26*Math.PI*2+0.3,r=7+(i%4)*1.6;E.spawn('skitter',P.x+Math.cos(a)*r,P.z+Math.sin(a)*r)}E.spawn('brute',P.x+9,P.z-6);E.spawn('brute',P.x-10,P.z-4);E.spawn('spitter',P.x+3,P.z-12);g.input.down=true}catch(e){}`,150],
 ['04-base','seed=3&autostart=1',`${G}try{const P=g.player.pos;for(const [t,x,z] of [['turret',6,0],['turret',-6,3],['harvester',4,-6],['generator',-5,-5],['wall',9,4],['wall',9,6],['tower',0,8]])g.buildings.place(t,{x:P.x+x,y:0,z:P.z+z,isVector3:false})}catch(e){}`,200],
 ['05-vfx-explosions','seed=4&autostart=1',`${G}try{const P=g.player.pos;for(let i=0;i<5;i++)g.fx.burst('explosion',{x:P.x+(i-2)*3,y:0.5,z:P.z-6},{});g.fx.burst('blood',{x:P.x,y:0.5,z:P.z-3},{})}catch(e){}`,9],
 ['06-hud-ui','seed=1&autostart=1','',120],
 ['07-title','seed=1','',60],
];
const srv=await createServer({logLevel:'error',server:{port:0}});await srv.listen();const port=srv.httpServer.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const manifest={version:n,label,date:new Date().toISOString(),commit:(()=>{try{return execSync('git rev-parse --short HEAD').toString().trim()}catch{return ''}})(),scenes:[],errors:[]};
for(const [name,q,setup,frames] of scenes){
  const p=await b.newPage({viewport:{width:+w,height:+h}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  try{await p.goto(`http://localhost:${port}/?manual=1&dt=0.0166&${q}`);await p.waitForFunction('window.__game',{timeout:60000});
    if(setup)await p.evaluate(setup);await p.evaluate(`__step(${frames})`);
    await p.screenshot({path:path.join(dir,name+'.png')});manifest.scenes.push(name)}catch(e){errs.push('SCENE FAIL '+e.message)}
  manifest.errors.push(...errs.map(e=>`[${name}] ${e}`));await p.close();
}
await b.close();await srv.close();
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,1));
// Rebuild README with galleries + comparisons
const vers=fs.readdirSync(root).filter(d=>/^v\d+/.test(d)).sort();
let md='# Evolução visual — RIFTFALL\n\nCada versão = mesmas cenas/seed, para comparação direta. Gerado por `node tools/snapshot.mjs <rótulo>`.\n\n';
vers.slice().reverse().forEach((v)=>{const m=JSON.parse(fs.readFileSync(path.join(root,v,'manifest.json'),'utf8'));const i=vers.indexOf(v);const pv=i>0?vers[i-1]:null;
  md+=`## ${v}  (${m.date.slice(0,16)} · ${m.commit})\n`;if(m.errors.length)md+=`> ⚠ ${m.errors.length} erro(s) de console: ${m.errors.slice(0,3).join(' | ')}\n\n`;
  if(fs.existsSync(path.join(root,v,'notes.md')))md+=fs.readFileSync(path.join(root,v,'notes.md'),'utf8')+'\n\n';
  if(pv){md+=`| Cena | ${pv} | ${v} |\n|---|---|---|\n`;for(const s of m.scenes)md+=`| ${s} | ![](${pv}/${s}.png) | ![](${v}/${s}.png) |\n`}
  else for(const s of m.scenes)md+=`**${s}**\n\n![](${v}/${s}.png)\n\n`;md+='\n'});
fs.writeFileSync(path.join(root,'README.md'),md);console.log('saved',dir,manifest.errors.length?manifest.errors.slice(0,5):'no errors');
