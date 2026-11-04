import {mkdir,copyFile,cp} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const name of ['index.html','app.js','model.js','styles.css','sw.js','manifest.webmanifest','_headers']) await copyFile(name,`dist/${name}`);
await cp('assets','dist/assets',{recursive:true});
