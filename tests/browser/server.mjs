// Serve the production bundle beneath a real subpath, as on GitHub Pages.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.wasm':'application/wasm','.json':'application/json','.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Browser test origin</title>');return;}
  if(!url.pathname.startsWith('/Horar/')){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,decodeURIComponent(url.pathname.slice('/Horar/'.length))||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{
    const bytes=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(bytes);
  }catch{res.writeHead(404);res.end();}
}).listen(4173,'127.0.0.1');
