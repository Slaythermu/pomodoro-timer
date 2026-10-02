// multi-step screenshot driver (scratch, enemies agent): node tools/shot_en.mjs steps.json
import {chromium} from 'playwright-core';import {createServer} from 'vite';import fs from 'fs';
const steps=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const [w,h]=(process.argv[3]||'1280x720').split('x');
const srv=await createServer({logLevel:'error',server:{port:0}});await srv.listen();const port=srv.httpServer.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+w,height:+h}});p.setDefaultTimeout(900000);const logs=[];p.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
await p.goto(`http://localhost:${port}/?manual=1&${steps.query||'seed=1'}`,{timeout:900000});await p.waitForFunction('window.__game',null,{timeout:900000});
for(const s of steps.steps){if(s.js)console.log(JSON.stringify(await p.evaluate(s.js)));if(s.frames)await p.evaluate(`__step(${s.frames})`);if(s.name){await p.screenshot({path:s.name});console.log('shot',s.name)}}
console.log(logs.join('\n')||'no console errors');await b.close();await srv.close();
