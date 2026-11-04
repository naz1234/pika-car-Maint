const cents = n => Math.round(n * 100);
export const fuelMonths = entries => [...new Set(entries.map(e => e.date.slice(0,7)))].sort().reverse();

// Full-to-full measurement: the first fill is the baseline; subsequent litres
// (including partial fills) belong to the distance ending at the next full tank.
// A missing volume or a backwards odometer breaks the measurement chain.
export function fuelIntervals(entries) {
 const sorted = [...entries].sort((a,b) => a.date.localeCompare(b.date) || (a.odometer ?? Infinity)-(b.odometer ?? Infinity) || a.id.localeCompare(b.id));
 const intervals=[];
 let anchor=null,litres=0,lastMileage=null;
 for(const e of sorted){
  if(e.litres==null || (e.odometer!=null && lastMileage!=null && e.odometer<lastMileage)){
   anchor=null;litres=0;lastMileage=null;
  }
  if(anchor && e.litres!=null)litres+=e.litres;
  if(e.fullTank && e.odometer!=null){
   if(anchor && e.odometer>anchor.odometer && litres>0)intervals.push({date:e.date,distance:e.odometer-anchor.odometer,litres});
   anchor=e;litres=0;
  }
  if(e.odometer!=null)lastMileage=e.odometer;
 }
 return intervals;
}

export function fuelSummary(entries,month='all') {
 const matches=e=>month==='all'||e.date.startsWith(month+'-');
 const selected=entries.filter(matches),intervals=fuelIntervals(entries).filter(matches);
 const total=selected.reduce((sum,e)=>sum+cents(e.cost),0)/100;
 const known=selected.filter(e=>e.litres!=null);
 const litres=known.reduce((sum,e)=>sum+e.litres,0);
 const measuredLitres=intervals.reduce((sum,e)=>sum+e.litres,0),distance=intervals.reduce((sum,e)=>sum+e.distance,0);
 return {count:selected.length,total,average:selected.length?Math.round(total/selected.length*100)/100:null,
  litres:known.length?litres:null,missingLitres:selected.length-known.length,distance:intervals.length?distance:null,
  kmPerLitre:distance>0&&measuredLitres>0?distance/measuredLitres:null,
  litresPer100km:distance>0&&measuredLitres>0?measuredLitres/distance*100:null,intervalCount:intervals.length};
}
