const path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const fs=require('fs'); fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'out/rides.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="rides.css"></head><body style="margin:0"><div id="root"></div><script src="rides.js"></script></body></html>');
fs.writeFileSync(path.join(__dirname,'out/live.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:system-ui,sans-serif"><div id="root"></div><script src="live.js"></script></body></html>');
fs.writeFileSync(path.join(__dirname,'out/index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="bundle.css"></head><body style="margin:0"><div id="root"></div><script src="bundle.js"></script></body></html>');
require('esbuild').build({
  entryPoints:{bundle:path.join(__dirname,'main.jsx'),rides:path.join(__dirname,'rides.jsx'),live:path.join(__dirname,'live.jsx')}, bundle:true, outdir:path.join(__dirname,'out'), loader:{'.js':'jsx','.woff2':'file','.woff':'file','.webp':'file','.png':'file'}, jsx:'automatic',
  define:{'process.env.NODE_ENV':'"development"'},
  nodePaths:[ROOT+'/node_modules'],
  alias:{'@src':ROOT+'/src','firebase/firestore':path.join(__dirname,'mocks/firestore.js'),'firebase/app':path.join(__dirname,'mocks/app.js'),'firebase/auth':path.join(__dirname,'mocks/auth.js'),'firebase/functions':path.join(__dirname,'mocks/functions.js'),'firebase/storage':path.join(__dirname,'mocks/storage.js'),'firebase/messaging':path.join(__dirname,'mocks/messaging.js'),'@react-google-maps/api':path.join(__dirname,'mocks/maps.js')},
  plugins:[{name:'app-mock',setup(b){ b.onResolve({filter:/^\.\.\/App$/},()=>({path:path.join(__dirname,'mocks/appshell.js')})); }}],
  logLevel:'error', banner:{js:'window.process={env:{NODE_ENV:"development"}};'},
}).then(()=>console.log('built')).catch(()=>process.exit(1));
