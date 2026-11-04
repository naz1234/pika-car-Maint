import {json,hash,sessionToken,limitedBody} from '../lib/http.js';
export async function onRequestPost({request,env}){
 const now=Date.now(),window=Math.floor(now/900000);
 const key=await hash((request.headers.get('CF-Connecting-IP')||'local')+':'+window);
 const attempt=await env.DB.prepare('INSERT INTO garage_login_limits (id,attempts,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,now+900000).first();
 if(attempt.attempts>10)return json({error:'Too many attempts. Try again in 15 minutes.'},429);
 let data;try{data=JSON.parse(new TextDecoder().decode(await limitedBody(request,2048)));}catch{return json({error:'Invalid login.'},400);}
 const a=await hash(typeof data.password==='string'?data.password:''),b=await hash(env.APP_PASSWORD);
 let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 if(difference)return json({error:'Password did not match.'},401);
 const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
 await env.DB.batch([
  env.DB.prepare('INSERT INTO garage_sessions (token_hash,expires) VALUES (?,?)').bind(await hash(token),now+2592000000),
  env.DB.prepare('DELETE FROM garage_sessions WHERE expires<?').bind(now),
  env.DB.prepare('DELETE FROM garage_login_limits WHERE expires<?').bind(now)
 ]);
 return json({ok:true},200,{'Set-Cookie':`pika_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});
}
export async function onRequestDelete({request,env}){
 await env.DB.prepare('DELETE FROM garage_sessions WHERE token_hash=?').bind(await hash(sessionToken(request)||'')).run();
 return json({ok:true},200,{'Set-Cookie':'pika_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
}
