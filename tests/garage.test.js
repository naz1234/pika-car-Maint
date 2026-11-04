import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {validState,serviceStatus,loanTotals} from '../model.js';
import {onRequest as guard} from '../functions/api/_middleware.js';
import {onRequestPut as save,onRequestGet as getState} from '../functions/api/state.js';
import {onRequestPost as upload,onRequestGet as listDocs} from '../functions/api/documents/index.js';
import {onRequestGet as download} from '../functions/api/documents/[id].js';
function fixture(){return {version:2,vehicle:{name:'Test car',model:'Hybrid',plate:'TEST',vin:'TEST',colour:'Red',odometer:1077,odometerDate:'2026-09-21'},nextService:{date:'2027-03-09',mileage:10000,note:'From workshop',documents:[]},services:[{id:'svc',title:'First service',date:'2026-09-21',mileage:1077,cost:268,notes:'Paid once',documents:[],parts:[]}],purchase:{onRoad:100,insurance:1,booking:1,customerDue:10,depositPaid:10.6,dealerReceipt:90,principal:90,roadTax:1,rebate:1,documents:[],notes:[]},loan:{lender:'',monthly:null,months:null,firstDate:null,nextDate:null,rate:null,notes:''},payments:[]};}
function environment(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0002_garage.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){const q=db.prepare(sql);const make=args=>({bind(...v){return make(v);},async first(){return q.get(...args)||null;},async all(){return {results:q.all(...args)};},async run(){return {meta:q.run(...args)};}});return make([]);},async batch(list){return Promise.all(list.map(q=>q.run()));}};
 const objects=new Map();return {DB,DOCUMENTS:{async put(k,b){objects.set(k,b);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;}},db};
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
test('loan schedule includes a different final instalment without deriving payments from dates or rates',()=>{
 const s=fixture();
 Object.assign(s.loan,{monthly:100,months:12,finalInstalment:75.25,agreementTotal:1175.25,termCharges:100,rate:4,rateType:'variable',referenceRate:2.5,margin:1.5,documents:['a'.repeat(64)]});
 assert.ok(validState(s));
 assert.deepEqual(loanTotals(s),{paid:0,scheduled:1175.25,remaining:1175.25});
 s.payments.push({id:'payment',date:'2026-11-01',amount:100,note:''});
 assert.deepEqual(loanTotals(s),{paid:100,scheduled:1175.25,remaining:1075.25});
 s.loan.months=1;assert.equal(loanTotals(s).scheduled,75.25);
 s.loan.months=null;assert.equal(loanTotals(s).scheduled,null);
 s.loan.months=12;s.loan.finalInstalment=null;assert.equal(loanTotals(s).scheduled,1200);
 for(const [key,value] of [['finalInstalment',-1],['agreementTotal','1175'],['termCharges',Infinity],['referenceRate',101],['margin',-1],['rateType','unknown'],['documents',['invalid']]]){
  const invalid=structuredClone(s);invalid.loan[key]=value;assert.equal(validState(invalid),false,key);
 }
});
test('public access needs no password or session and still rejects cross-origin writes',async()=>{
 const env=environment();let called=false;
 const next=async()=>{called=true;return new Response('ok');};
 const publicRequest=new Request('https://garage.test/api/state');
 const response=await guard({request:publicRequest,env,next});
 assert.equal(response.status,200);assert.equal(called,true);
 assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Set-Cookie'),null);
 assert.equal((await guard({request:request('state','GET',undefined,{Cookie:'pika_session='+'0'.repeat(64)}),env,next})).status,200);
 assert.equal((await guard({request:request('state','PUT',{}),env,next})).status,200);
 for(const origin of ['https://evil.test','null','']){
  called=false;
  assert.equal((await guard({request:request('state','PUT',{},{Origin:origin}),env,next})).status,403);assert.equal(called,false);
 }
 assert.equal((await guard({request:publicRequest,env:{},next})).status,503);
 assert.equal((await guard({request:publicRequest,env,next:async()=>{throw new Error('Database unavailable');}})).status,503);
});
test('D1 revision check rejects stale writers and invalid payloads',async()=>{
 const env=environment(),s=fixture();env.db.prepare('INSERT INTO app_state VALUES (?,?,?)').run('garage-v2',JSON.stringify(s),1);
 const ctx={request:request('state','PUT',{state:s,revision:1}),env};
 const result=await guard({...ctx,next:()=>save(ctx)});assert.equal(result.status,200);
 assert.equal((await save({request:request('state','PUT',{state:s,revision:1}),env})).status,409);
 s.services[0].cost=-2;assert.equal((await save({request:request('state','PUT',{state:s,revision:1}),env})).status,400);
 assert.equal((await (await guard({request:new Request('https://garage.test/api/state'),env,next:()=>getState({env})})).json()).state.services[0].cost,268);
});
test('older clients retain loan agreement metadata and current clients can clear it explicitly',async()=>{
 const env=environment(),s=fixture();
 const terms={finalInstalment:75,agreementTotal:1175,termCharges:100,rateType:'variable',referenceRate:2.5,margin:1.5,documents:['a'.repeat(64)]};
 Object.assign(s.loan,terms);
 env.db.prepare('INSERT INTO app_state VALUES (?,?,?)').run('garage-v2',JSON.stringify(s),1);
 const legacy=structuredClone(s);for(const key of Object.keys(terms))delete legacy.loan[key];
 legacy.loan.notes='Updated by an older client';
 assert.equal((await save({request:request('state','PUT',{state:legacy,revision:1}),env})).status,200);
 let data=await (await getState({env})).json();
 for(const [key,value] of Object.entries(terms))assert.deepEqual(data.state.loan[key],value);
 assert.equal(data.state.loan.notes,legacy.loan.notes);
 assert.equal((await save({request:request('state','PUT',{state:legacy,revision:1}),env})).status,409);
 for(const key of Object.keys(terms))data.state.loan[key]=key==='documents'?[]:null;
 assert.equal((await save({request:request('state','PUT',data),env})).status,200);
 data=await (await getState({env})).json();
 for(const key of Object.keys(terms))assert.deepEqual(data.state.loan[key],key==='documents'?[]:null);
});
test('public PDF upload validates signature, deduplicates bytes and supports download without cookies',async()=>{
 const env=environment(),bytes='%PDF-1.7\nTest PDF\n%%EOF';
 const headers={'X-Filename':'receipt.pdf','X-Category':'Service'};
 assert.equal((await upload({request:request('documents','POST','<html>bad</html>',headers),env})).status,400);
 const ctx={request:request('documents','POST',bytes,headers),env};
 const r=await guard({...ctx,next:()=>upload(ctx)});assert.equal(r.status,201);
 const {id}=await r.json();assert.match(id,/^[a-f0-9]{64}$/);
 assert.equal((await (await upload({request:request('documents','POST',bytes,headers),env})).json()).duplicate,true);
 assert.equal((await (await guard({request:new Request('https://garage.test/api/documents'),env,next:()=>listDocs({env})})).json()).documents.length,1);
 const file=await guard({request:new Request('https://garage.test/api/documents/'+id),env,next:()=>download({params:{id},env})});assert.equal(await file.text(),bytes);assert.equal(file.headers.get('Cache-Control'),'no-store');
 assert.equal((await download({params:{id:'missing'},env})).status,404);
});

test('fuel saves round-trip, legacy clients retain fuel, and stale or invalid edits fail',async()=>{
 const env=environment(),s=fixture();
 env.db.prepare('INSERT INTO app_state VALUES (?,?,?)').run('garage-v2',JSON.stringify(s),1);
 s.fuelEntries=[{id:'fuel-1',date:'2026-09-01',station:'Test',cost:40,litres:null,odometer:null,fullTank:false,notes:''}];
 const initial=await save({request:request('state','PUT',{state:s,revision:1}),env});assert.equal(initial.status,200);
 let data=await (await getState({env})).json();assert.deepEqual(data.state.fuelEntries,s.fuelEntries);
 const legacy=structuredClone(data.state);delete legacy.fuelEntries;legacy.vehicle.name='Updated name';
 assert.equal((await save({request:request('state','PUT',{state:legacy,revision:data.revision}),env})).status,200);
 assert.equal((await save({request:request('state','PUT',{state:legacy,revision:data.revision}),env})).status,409);
 data=await (await getState({env})).json();assert.deepEqual(data.state.fuelEntries,s.fuelEntries);assert.equal(data.state.vehicle.name,'Updated name');
 const invalid=structuredClone(data.state);invalid.fuelEntries[0].litres=0;
 assert.equal((await save({request:request('state','PUT',{state:invalid,revision:data.revision}),env})).status,400);
 data.state.fuelEntries=[];
 assert.equal((await save({request:request('state','PUT',data),env})).status,200);
 assert.deepEqual((await (await getState({env})).json()).state.fuelEntries,[]);
});

