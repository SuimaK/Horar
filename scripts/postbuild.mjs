import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {serviceWorkerSource} from './service-worker.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dest=path.join(root,'dist');
const pkg=path.join(root,'node_modules','@swisseph','browser');
function findWasm(dir){
  if(!fs.existsSync(dir))return null;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ent.name==='swisseph.wasm'&&ent.isFile())return path.join(dir,ent.name);
    if(ent.isDirectory()){
      const result=findWasm(path.join(dir,ent.name));if(result)return result;
    }
  }
  return null;
}
const found=findWasm(pkg);
if(!found)throw Error('WASM-файл Swiss Ephemeris отсутствует: сборку публиковать нельзя.');
fs.mkdirSync(path.join(dest,'assets'),{recursive:true});
fs.copyFileSync(found,path.join(dest,'assets','swisseph.wasm'));
// Offline install must cache exact Vite-hashed assets as well as WASM, relative to Pages scope.
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const full=path.join(dir,e.name);
  if(e.isDirectory())return walk(full);
  return [path.relative(dest,full).replaceAll(path.sep,'/')];
});}
const files=walk(dest).filter(f=>!f.endsWith('.map')&&!f.endsWith('sw.js')).sort();
const precache=files.map(x=>`./${x}`);
const hash=createHash('sha256').update(serviceWorkerSource(precache,''));
for(const file of files)hash.update(file).update(fs.readFileSync(path.join(dest,file)));
const sw=serviceWorkerSource(precache,hash.digest('hex').slice(0,20));
fs.writeFileSync(path.join(dest,'sw.js'),sw);
// Fail closed: publishing a missing or empty bundle would render an unusable shell.
if(!files.some(f=>f.endsWith('.js'))||!files.some(f=>f==='index.html'))throw Error('Не собраны JavaScript и index.html');
if(fs.statSync(path.join(dest,'assets','swisseph.wasm')).size<100000)throw Error('WASM-файл слишком мал');
if(fs.readFileSync(path.join(dest,'index.html'),'utf8').includes('/api/build'))throw Error('В сборке остался серверный URL');
console.log(`Static PWA ready: ${files.length} files cached, ${fs.statSync(path.join(dest,'assets','swisseph.wasm')).size} bytes WASM`);
