import test from 'node:test';
import assert from 'node:assert/strict';
import {validFuelEntries} from '../model.js';
import {fuelSummary,fuelIntervals,fuelMonths} from '../fuel.js';
const entry=(id,date,cost=30,extra={})=>({id,date,station:'Test station',cost,litres:null,odometer:null,fullTank:false,notes:'',...extra});
test('money-only history counts transactions by transaction month without inventing consumption',()=>{
 const entries=[entry('a','2026-09-30',19.99),entry('b','2026-09-30',10.01),entry('c','2026-10-01',12.34)];
 assert.ok(validFuelEntries(entries));assert.deepEqual(fuelMonths(entries),['2026-10','2026-09']);
 const sep=fuelSummary(entries,'2026-09');
 assert.equal(sep.count,2);assert.equal(sep.total,30);assert.equal(sep.average,15);
 assert.equal(sep.litres,null);assert.equal(sep.kmPerLitre,null);assert.equal(sep.litresPer100km,null);
 assert.equal(fuelSummary(entries).total,42.34);assert.equal(fuelSummary(entries,'2026-11').count,0);
});
test('full-to-full calculation includes partial fills and assigns an interval to its ending month',()=>{
 const entries=[entry('a','2026-09-30',60,{litres:40,odometer:1000,fullTank:true}),entry('b','2026-10-02',20,{litres:10}),entry('c','2026-10-05',40,{litres:20,odometer:1600,fullTank:true}),entry('d','2026-10-10',70,{litres:40,odometer:2000,fullTank:true})];
 const result=fuelSummary(entries,'2026-10');
 assert.equal(result.distance,1000);assert.equal(result.intervalCount,2);
 assert.equal(result.kmPerLitre,1000/70);assert.ok(Math.abs(result.litresPer100km-7)<1e-10);
 assert.equal(fuelSummary(entries,'2026-09').kmPerLitre,null);
 assert.deepEqual(fuelIntervals([...entries].reverse()),fuelIntervals(entries));
});
test('missing volume, backwards mileage and zero distance do not create misleading economy',()=>{
 const start=entry('a','2026-09-01',50,{litres:30,odometer:1000,fullTank:true});
 const end=entry('c','2026-09-05',50,{litres:30,odometer:1500,fullTank:true});
 assert.equal(fuelIntervals([start,entry('b','2026-09-03'),end]).length,0);
 assert.equal(fuelIntervals([start,entry('b','2026-09-03',30,{litres:10,odometer:900}),end]).length,0);
 assert.equal(fuelIntervals([start,{...end,odometer:1000}]).length,0);
});
test('fuel validation rejects malformed dates, duplicate IDs, impossible readings and invalid money',()=>{
 const good=entry('a','2026-09-01');
 for(const change of [{date:'2026-09-31'},{cost:-1},{cost:0},{cost:1.001},{cost:Infinity},{litres:0},{litres:-1},{litres:1001},{odometer:-1},{fullTank:'yes'},{station:' '},{notes:undefined}])assert.equal(validFuelEntries([{...good,...change}]),false,JSON.stringify(change));
 assert.equal(validFuelEntries([good,good]),false);assert.equal(validFuelEntries(null),false);assert.ok(validFuelEntries([]));
});
