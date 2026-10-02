// usage: node tools/shot.mjs <out.png> [frames=120] [query] [w=1600] [h=900] [script.js]
// Starts vite preview-less static via vite dev server on a free port, renders deterministically with ?manual=1 and __step.
import {chromium} from 'playwright-core';import {createServer} from 'vite';import fs from 'fs';
const [out='shot.png',frames='120',query='',w='1600',h='900',script]=process.argv.slice(2);
const srv=await createServer({logLevel:'error',server:{port:0}});await srv.listen();const port=srv.httpServer.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+w,height:+h}});const logs=[];p.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
p.setDefaultTimeout(600000);await p.goto(`http://localhost:${port}/?manual=1&${query}`,{timeout:600000});await p.waitForFunction('window.__game',null,{timeout:600000});
if(script)await p.evaluate(fs.readFileSync(script,'utf8'));
await p.evaluate(`__step(${+frames})`);await p.screenshot({path:out});
console.log(logs.join('\n')||'no console errors');await b.close();await srv.close();
