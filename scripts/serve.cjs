const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8'};
const port = Number(process.env.PORT || 4173);
http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/api/rewards-review') {
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      try {const result=require('./teacher-fixtures.cjs').handle(JSON.parse(body));res.writeHead(result.ok?200:401,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}
      catch(e){res.writeHead(400);res.end('{}');}
    });return;
  }
  if (pathname === '/__review/migration') {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(require('./review-fixtures.cjs').page()); return;
  }
  if (pathname === '/__review/new-student') {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(require('./review-fixtures.cjs').newStudent()); return;
  }
  if (pathname === '/__review/classtalk') {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(require('./review-fixtures.cjs').classTalk()); return;
  }
  if (pathname.startsWith('/server/')) {res.writeHead(404);res.end();return;}
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname === '/teacher' || pathname === '/teacher/' ? '/teacher/index.html' : pathname));
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(p=>p.startsWith('.'))) {res.writeHead(403);res.end();return;}
  fs.readFile(target,(err,bytes)=>{
    if (err) {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Lumentia local review: http://127.0.0.1:${port}`));
