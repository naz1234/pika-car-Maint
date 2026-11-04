import {json,limitedBody} from '../lib/http.js';
import {validState} from '../../model.js';
export async function onRequestGet({env}){
 const row=await env.DB.prepare("SELECT data,updated_at FROM app_state WHERE id='garage-v2'").first();
 return json({state:row?JSON.parse(row.data):null,revision:row?.updated_at||0});
}
export async function onRequestPut({request,env}){
 let p;try{p=JSON.parse(new TextDecoder().decode(await limitedBody(request,1000000)));}catch{return json({error:'Invalid or oversized data.'},400);}
 if(!validState(p.state)||!Number.isSafeInteger(p.revision)||p.revision<1)return json({error:'Please check the entered values.'},400);
 const revision=Math.max(Date.now(),p.revision+1);
 const row=await env.DB.prepare("UPDATE app_state SET data=?,updated_at=? WHERE id='garage-v2' AND updated_at=? RETURNING updated_at").bind(JSON.stringify(p.state),revision,p.revision).first();
 if(!row)return json({error:'Another device updated your garage. Reload to see the latest records before saving again.'},409);
 return json({ok:true,revision});
}
