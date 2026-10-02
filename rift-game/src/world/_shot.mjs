// dev helper (terrain owner): like tools/shot.mjs but with long timeouts + timing
import {chromium} from 'playwright-core';import {createServer} from 'vite';import fs from 'fs';
const [out='shot.png',frames='3',query='',w='1600',h='900',script]=process.argv.slice(2);
const srv=await createServer({root:'/home/user/pomodoro-timer/rift-game',logLevel:'error',server:{port:0,watch:null,hmr:false}});await srv.listen();const port=srv.httpServer.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+w,height:+h}});const logs=[];p.on('console',m=>{logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
const t0=Date.now();
await p.goto(`http://localhost:${port}/?manual=1&${query}`,{timeout:240000});await p.waitForFunction('window.__game',null,{timeout:240000});console.log('loaded',Date.now()-t0);
if(script)await p.evaluate(fs.readFileSync(script,'utf8'));
const t1=Date.now();await p.evaluate(`__step(${+frames})`);console.log('step ms',Date.now()-t1);await p.screenshot({path:out,timeout:240000});
console.log(logs.join('\n')||'no console');await b.close();await srv.close();
