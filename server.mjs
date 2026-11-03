import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {onRequestGet} from './functions/api/terminal.js';
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/growth.js',['growth.js','text/javascript']],['/sync.js',['sync.js','text/javascript']],['/news-terminal.js',['news-terminal.js','text/javascript']],['/additions.css',['additions.css','text/css']]]);
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/api/terminal'){const response=await onRequestGet({request:new Request(url),waitUntil:p=>p.catch(console.error)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
  const file=files.get(url.pathname);if(!file){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store'});res.end(await readFile(new URL(file[0],import.meta.url)));
 }catch(e){res.writeHead(500);res.end('Preview request failed');console.error(e.message);}
}).listen(4173,'127.0.0.1',()=>console.log('Alpha Terminal preview: http://127.0.0.1:4173'));
