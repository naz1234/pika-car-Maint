export const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export async function hash(value){const b=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function limitedBody(request,max){
 if(Number(request.headers.get('Content-Length'))>max)throw new Error('too large');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('too large');}chunks.push(value);}
 const out=new Uint8Array(size);let offset=0;for(const b of chunks){out.set(b,offset);offset+=b.length;}return out;
}
