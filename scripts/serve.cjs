const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8'};
const port = Number(process.env.PORT || 4173);
http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
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
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some(p=>p.startsWith('.'))) {res.writeHead(403);res.end();return;}
  fs.readFile(target,(err,bytes)=>{
    if (err) {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Lumentia local review: http://127.0.0.1:${port}`));
