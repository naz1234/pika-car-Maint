import {mkdir,copyFile,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const browserFiles=['index.html','app.js','model.js','fuel.js','theme.js','pdf-viewer.js','photo-viewer.js','updates.js','styles.css','sw.js','manifest.webmanifest','_headers'];
const hash=createHash('sha256');
for(const name of [...browserFiles,'package.json'])hash.update(name+'\0').update(await readFile(name));
async function hashAssets(directory){
 for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const name=`${directory}/${entry.name}`;
  if(entry.isDirectory())await hashAssets(name);
  else if(entry.isFile())hash.update(name+'\0').update(await readFile(name));
 }
}
await hashAssets('assets');
const version=hash.digest('hex').slice(0,20);
await mkdir('dist',{recursive:true});
for(const name of browserFiles){
 if(['index.html','sw.js'].includes(name))await writeFile(`dist/${name}`,(await readFile(name,'utf8')).replaceAll('__BUILD_ID__',version));
 else await copyFile(name,`dist/${name}`);
}
await writeFile('dist/version.json',JSON.stringify({version}));
await cp('assets','dist/assets',{recursive:true});
await mkdir('dist/vendor/pdfjs',{recursive:true});
for(const name of ['pdf.min.mjs','pdf.worker.min.mjs']) await copyFile(`node_modules/pdfjs-dist/legacy/build/${name}`,`dist/vendor/pdfjs/${name}`);
for(const name of ['cmaps','standard_fonts','wasm']) await cp(`node_modules/pdfjs-dist/${name}`,`dist/vendor/pdfjs/${name}`,{recursive:true});
await copyFile('node_modules/pdfjs-dist/LICENSE','dist/vendor/pdfjs/LICENSE');
