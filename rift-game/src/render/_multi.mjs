// usage: node src/render/_multi.mjs query w h setup.js variants.json  (variants: [{out, js, frames}])
import {chromium} from 'playwright-core';import {createServer} from 'vite';import fs from 'fs';
const [query='',w='1024',h='576',setup,vf]=process.argv.slice(2);
const srv=await createServer({root:'/home/user/pomodoro-timer/rift-game',logLevel:'error',server:{port:0,hmr:false,watch:null}});await srv.listen();const port=srv.httpServer.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+w,height:+h}});const logs=[];p.on('console',m=>{if(['error','warning'].includes(m.type())&&!/404|toNonIndexed/.test(m.text()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
await p.goto(`http://localhost:${port}/?manual=1&autostart=1&${query}`,{timeout:300000});await p.waitForFunction('window.__game',null,{timeout:300000});
if(setup)await p.evaluate(fs.readFileSync(setup,'utf8'));
for(const v of JSON.parse(fs.readFileSync(vf,'utf8'))){if(v.js)await p.evaluate(v.js);const t=Date.now();await p.evaluate(`__step(${v.frames||3})`);await p.screenshot({path:v.out,timeout:300000});console.log(v.out,Date.now()-t,'ms');}
console.log(logs.join('\n')||'no console errors');await b.close();await srv.close();
