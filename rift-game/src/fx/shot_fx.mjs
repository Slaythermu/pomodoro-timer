// usage: node src/fx/shot_fx.mjs out.png [frames] "fxshow=all&fxt=6" [w h] — renders the standalone FX harness + showcase.js
import {chromium} from 'playwright-core';import {createServer} from 'vite';import fs from 'fs';
const [out='fx.png',frames='1',query='',w='1600',h='900',extra]=process.argv.slice(2);
const srv=await createServer({logLevel:'error',server:{port:0}});await srv.listen();const port=srv.httpServer.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:+w,height:+h}});const logs=[];p.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
await p.goto(`http://localhost:${port}/src/fx/harness.html?${query}`);await p.waitForFunction('window.__game');
await p.evaluate(fs.readFileSync(new URL('./showcase.js',import.meta.url),'utf8'));
if(extra)await p.evaluate(fs.readFileSync(extra,'utf8'));
await p.evaluate(`__step(${+frames})`);await p.screenshot({path:out});
console.log(logs.join('\n')||'no console errors');await b.close();await srv.close();
