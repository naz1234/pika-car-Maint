import {json} from '../../lib/http.js';
export async function onRequestGet({params,env}){
 if(!/^[a-f0-9]{64}$/.test(params.id))return json({error:'Document not found.'},404);
 const row=await env.DB.prepare('SELECT filename FROM garage_documents WHERE id=?').bind(params.id).first();
 if(!row)return json({error:'Document not found.'},404);
 const file=await env.DOCUMENTS.get(`pdf/${params.id}.pdf`);
 if(!file)return json({error:'Document file is unavailable.'},404);
 return new Response(file.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,'Cache-Control':'no-store','Content-Security-Policy':"sandbox; default-src 'none'",'X-Content-Type-Options':'nosniff'}});
}
