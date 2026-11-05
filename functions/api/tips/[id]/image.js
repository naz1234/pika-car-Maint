import {json} from '../../../lib/http.js';
import {readTips,validTipId,tipImageKey} from '../../../lib/tips.js';

export async function onRequestGet({params,env}){
 if(!validTipId(params.id))return json({error:'Tip photo not found.'},404);
 const tip=(await readTips(env)).find(t=>t.id===params.id);
 if(!tip)return json({error:'Tip photo not found.'},404);
 if(!env.DOCUMENTS)return json({error:'Photo storage is unavailable.'},503);
 const file=await env.DOCUMENTS.get(tipImageKey(tip));
 if(!file)return json({error:'Tip photo is unavailable.'},404);
 return new Response(file.body,{headers:{
  'Content-Type':tip.image.contentType,
  'Content-Disposition':`inline; filename="${tip.id}.${tip.image.contentType==='image/png'?'png':'jpg'}"`,
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"sandbox; default-src 'none'",
  'Cross-Origin-Resource-Policy':'same-origin'
 }});
}
