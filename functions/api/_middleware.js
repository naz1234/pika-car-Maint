import {json} from '../lib/http.js';
export async function onRequest(context){
 const {request,env}=context;
 if(!env.DB)return json({error:'Garage setup is not complete.'},503);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Request origin not allowed.'},403);
 try{
  const response=await context.next();response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');return response;
 }catch{return json({error:'Garage unavailable. Please try again.'},503);}
}
