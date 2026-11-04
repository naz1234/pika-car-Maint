import {json,hash,sessionToken} from '../lib/http.js';
export async function onRequest(context){
 const {request,env}=context;const path=new URL(request.url).pathname;
 if(!env.DB||!env.APP_PASSWORD)return json({error:'Private garage setup is not complete.'},503);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Request origin not allowed.'},403);
 try{
  if(path==='/api/auth'&&request.method==='POST')return await context.next();
  const token=sessionToken(request);
  const row=token?await env.DB.prepare('SELECT expires FROM garage_sessions WHERE token_hash=?').bind(await hash(token)).first():null;
  if(!row||row.expires<Date.now())return json({error:'Please unlock your garage.'},401);
  const response=await context.next();response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');return response;
 }catch{return json({error:'Garage unavailable. Please try again.'},503);}
}
