import {dateOK} from '../../model.js';

export const TIPS_STATE_ID='car-tips-v1';
export const validTipId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
export function validTips(data){
 return data?.version===1&&Array.isArray(data.tips)&&data.tips.length<=100&&new Set(data.tips.map(t=>t?.id)).size===data.tips.length&&data.tips.every(t=>
  t&&validTipId(t.id)&&text(t.title,150)&&text(t.category,80)&&text(t.summary,400)&&dateOK(t.createdAt)&&
  Array.isArray(t.notes)&&t.notes.length<=8&&t.notes.every(n=>text(n,1000))&&t.image&&
  /^[a-f0-9]{64}$/.test(t.image.sha256)&&['image/png','image/jpeg'].includes(t.image.contentType)&&
  Number.isInteger(t.image.size)&&t.image.size>0&&t.image.size<=10*1024*1024&&
  ['width','height'].every(k=>Number.isInteger(t.image[k])&&t.image[k]>0&&t.image[k]<=12000));
}
export async function readTips(env){
 const row=await env.DB.prepare('SELECT data FROM app_state WHERE id=?').bind(TIPS_STATE_ID).first();
 if(!row)return [];
 const data=JSON.parse(row.data);
 if(!validTips(data))throw new Error('Invalid tips data');
 return data.tips.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}
export const tipImageKey=tip=>`tips/${tip.image.sha256}.${tip.image.contentType==='image/png'?'png':'jpg'}`;
