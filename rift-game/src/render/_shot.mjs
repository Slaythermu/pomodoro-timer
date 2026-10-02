// dev helper (render owner): shot with long timeouts. usage: node src/render/_shot.mjs out.png frames query w h script
import {chromium} from 'playwright-core';import {createServer} from 'vite';import fs from 'fs';
const [out='shot.png',frames='3',query='',w='1280',h='720',script]=process.argv.slice(2);
const srv=await createServer({root:'/home/user/pomodoro-timer/rift-game',logLevel:'error',server:{port:0}});await srv.listen();const port=srv.httpServer.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+w,height:+h}});const logs=[];p.on('console',m=>{if(['error','warning'].includes(m.type())&&!/404|toNonIndexed/.test(m.text()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
await p.goto(`http://localhost:${port}/?manual=1&${query}`,{timeout:300000});await p.waitForFunction('window.__game',null,{timeout:300000});
if(script)await p.evaluate(fs.readFileSync(script,'utf8'));
const t=Date.now();await p.evaluate(`__step(${+frames})`);console.log('step ms',Date.now()-t);await p.screenshot({path:out,timeout:300000});
console.log(logs.join('\n')||'no console errors');await b.close();await srv.close();
