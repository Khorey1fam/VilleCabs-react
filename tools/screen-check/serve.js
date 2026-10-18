const http=require('http'),fs=require('fs'),path=require('path');const root=process.argv[2]||require('path').join(__dirname,'out');
http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');
const t={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.webp':'image/webp'}[path.extname(p)]||'application/octet-stream';
r.writeHead(200,{'Content-Type':t});fs.createReadStream(p).pipe(r)}).listen(process.env.PORT||5055);
