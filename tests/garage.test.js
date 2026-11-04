import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {validState,serviceStatus,loanTotals} from '../model.js';
import {onRequest as guard} from '../functions/api/_middleware.js';
import {onRequestPost as login,onRequestDelete as logout} from '../functions/api/auth.js';
import {onRequestPut as save,onRequestGet as getState} from '../functions/api/state.js';
import {onRequestPost as upload,onRequestGet as listDocs} from '../functions/api/documents/index.js';
import {onRequestGet as download} from '../functions/api/documents/[id].js';
function fixture(){return {version:2,vehicle:{name:'Test car',model:'Hybrid',plate:'TEST',vin:'TEST',colour:'Red',odometer:1077,odometerDate:'2026-09-21'},nextService:{date:'2027-03-09',mileage:10000,note:'From workshop',documents:[]},services:[{id:'svc',title:'First service',date:'2026-09-21',mileage:1077,cost:268,notes:'Paid once',documents:[],parts:[]}],purchase:{onRoad:100,insurance:1,booking:1,customerDue:10,depositPaid:10.6,dealerReceipt:90,principal:90,roadTax:1,rebate:1,documents:[],notes:[]},loan:{lender:'',monthly:null,months:null,firstDate:null,nextDate:null,rate:null,notes:''},payments:[]};}
function environment(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0002_garage.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const q=db.prepare(sql);const make=args=>({bind(...v){return make(v);},async first(){return q.get(...args)||null;},async all(){return {results:q.all(...args)};},async run(){return {meta:q.run(...args)};}});return make([]);},async batch(list){return Promise.all(list.map(q=>q.run()));}};
 const objects=new Map();return {DB,APP_PASSWORD:'long-test-password-012345',DOCUMENTS:{async put(k,b){objects.set(k,b);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;}},db};
}
function request(path,method='GET',body,extra={}){return new Request('https://garage.test/api/'+path,{method,headers:{Origin:'https://garage.test',...extra},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});}
test('verified date and mileage schedule; unknown loan terms are not a zero balance',()=>{
 const s=fixture();assert.ok(validState(s));assert.equal(serviceStatus(s,'2026-11-04').km,8923);assert.equal(serviceStatus(s,'2027-03-09').label,'Service due');
 s.vehicle.odometer=10000;assert.equal(serviceStatus(s,'2026-11-04').label,'Service due');
 assert.deepEqual(loanTotals(s),{paid:0,scheduled:null,remaining:null});
 s.loan.monthly=100;s.loan.months=12;s.payments=[{id:'p',date:'2026-11-01',amount:100,note:''}];
 assert.deepEqual(loanTotals(s),{paid:100,scheduled:1200,remaining:1100});
 s.loan.firstDate='2026-02-30';assert.equal(validState(s),false);
});
test('auth, session expiry, CSRF rejection, logout and login rate limit',async()=>{
 const env=environment();let called=false;
 const next=async()=>{called=true;return new Response('ok');};
 assert.equal((await guard({request:request('documents'),env,next})).status,401);assert.equal(called,false);
 assert.equal((await guard({request:request('auth','POST',{password:env.APP_PASSWORD},{Origin:'https://evil.test'}),env,next})).status,403);
 const r=await login({request:request('auth','POST',{password:env.APP_PASSWORD}),env});assert.equal(r.status,200);
 const cookie=r.headers.get('Set-Cookie').split(';')[0];assert.match(r.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await guard({request:request('state','GET',undefined,{Cookie:cookie}),env,next})).status,200);
 await logout({request:request('auth','DELETE',undefined,{Cookie:cookie}),env});
 assert.equal((await guard({request:request('state','GET',undefined,{Cookie:cookie}),env,next})).status,401);
 for(let i=0;i<9;i++)await login({request:request('auth','POST',{password:'wrong'}),env});
 assert.equal((await login({request:request('auth','POST',{password:'wrong'}),env})).status,429);
});
test('D1 revision check rejects stale writers and invalid payloads',async()=>{
 const env=environment(),s=fixture();env.db.prepare('INSERT INTO app_state VALUES (?,?,?)').run('garage-v2',JSON.stringify(s),1);
 const result=await save({request:request('state','PUT',{state:s,revision:1}),env});assert.equal(result.status,200);
 assert.equal((await save({request:request('state','PUT',{state:s,revision:1}),env})).status,409);
 s.services[0].cost=-2;assert.equal((await save({request:request('state','PUT',{state:s,revision:1}),env})).status,400);
 assert.equal((await (await getState({env})).json()).state.services[0].cost,268);
});
test('PDF upload validates signature, deduplicates bytes and supports authenticated download handler',async()=>{
 const env=environment(),bytes='%PDF-1.7\nTest PDF\n%%EOF';
 const headers={'X-Filename':'receipt.pdf','X-Category':'Service'};
 assert.equal((await upload({request:request('documents','POST','<html>bad</html>',headers),env})).status,400);
 const r=await upload({request:request('documents','POST',bytes,headers),env});assert.equal(r.status,201);
 const {id}=await r.json();assert.match(id,/^[a-f0-9]{64}$/);
 assert.equal((await (await upload({request:request('documents','POST',bytes,headers),env})).json()).duplicate,true);
 assert.equal((await (await listDocs({env})).json()).documents.length,1);
 const file=await download({params:{id},env});assert.equal(await file.text(),bytes);assert.equal(file.headers.get('Cache-Control'),'no-store');
 assert.equal((await download({params:{id:'missing'},env})).status,404);
});

