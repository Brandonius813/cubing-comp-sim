import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// A single coherent asset set. APIs and account requests are never cached.
function offlineCache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'comp-sim-offline-cache',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      function files(dir: string): string[] {
        return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
          entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
      }
      const paths = files(outDir).filter(path => !path.endsWith('/sw.js') && !path.endsWith('.map')
        && !path.endsWith('/connection-check.json') && !path.endsWith('/_headers'));
      if (!paths.some(path => path.endsWith('/engine/tnoodle.js'))) return;
      const digest = createHash('sha256');
      for (const path of paths.sort()) digest.update(readFileSync(path));
      const version = digest.digest('hex').slice(0, 16);
      const assets = paths.map(path => '/' + relative(outDir, path).replaceAll('\\', '/'));
      const worker = `
const CACHE='comp-sim-${version}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try { await cache.addAll(ASSETS); } catch(error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys()) if(key.startsWith('comp-sim-')&&key!==CACHE) await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data==='OFFLINE_STATUS') event.source?.postMessage({type:'OFFLINE_READY',version:CACHE});
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
   event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/index.html'))||fetch(event.request)));
 }else if(ASSETS.includes(url.pathname)){
   event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));
 }
});
`;
      writeFileSync(join(outDir, 'sw.js'), worker);
    },
  };
}
export default defineConfig({ plugins: [offlineCache()], build: { target: 'es2022', sourcemap: true } });
