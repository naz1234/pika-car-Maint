import {mkdir,copyFile,cp} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const name of ['index.html','app.js','model.js','theme.js','pdf-viewer.js','styles.css','sw.js','manifest.webmanifest','_headers']) await copyFile(name,`dist/${name}`);
await cp('assets','dist/assets',{recursive:true});
await mkdir('dist/vendor/pdfjs',{recursive:true});
for(const name of ['pdf.min.mjs','pdf.worker.min.mjs']) await copyFile(`node_modules/pdfjs-dist/legacy/build/${name}`,`dist/vendor/pdfjs/${name}`);
for(const name of ['cmaps','standard_fonts','wasm']) await cp(`node_modules/pdfjs-dist/${name}`,`dist/vendor/pdfjs/${name}`,{recursive:true});
await copyFile('node_modules/pdfjs-dist/LICENSE','dist/vendor/pdfjs/LICENSE');
