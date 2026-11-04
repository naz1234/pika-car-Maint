import {json,hash,limitedBody} from '../../lib/http.js';
export async function onRequestGet({env}){
 const rows=await env.DB.prepare('SELECT id,filename,category,size,aliases,created_at FROM garage_documents ORDER BY created_at DESC').all();
 return json({documents:rows.results.map(r=>({...r,aliases:JSON.parse(r.aliases)}))});
}
export async function onRequestPost({request,env}){
 if(!env.DOCUMENTS)return json({error:'Document storage is not configured.'},503);
 let raw;try{raw=await limitedBody(request,20*1024*1024);}catch{return json({error:'PDF must be smaller than 20 MB.'},413);}
 if(new TextDecoder().decode(raw.slice(0,5))!=='%PDF-')return json({error:'Please choose a valid PDF.'},400);
 const id=await hash(raw),existing=await env.DB.prepare('SELECT id FROM garage_documents WHERE id=?').bind(id).first();
 if(existing)return json({ok:true,id,duplicate:true});
 const filename=(request.headers.get('X-Filename')?decodeURIComponent(request.headers.get('X-Filename')):'document.pdf').replace(/[\\/\r\n\x00-\x1f]/g,'_').slice(0,180);
 const category=['Service','Purchase','Loan','Other'].includes(request.headers.get('X-Category'))?request.headers.get('X-Category'):'Other';
 await env.DOCUMENTS.put(`pdf/${id}.pdf`,raw,{httpMetadata:{contentType:'application/pdf'}});
 await env.DB.prepare('INSERT OR IGNORE INTO garage_documents (id,filename,category,size,aliases,created_at) VALUES (?,?,?,?,?,?)').bind(id,filename,category,raw.length,'[]',Date.now()).run();
 return json({ok:true,id},201);
}
