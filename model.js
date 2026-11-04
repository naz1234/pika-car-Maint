export const money = n => n == null ? 'Not provided' : new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(n);
export const dateOK = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const txt = (v,n=2000) => typeof v === 'string' && v.length <= n;
const num = (v,max=1e8) => Number.isFinite(v) && v>=0 && v<=max;
const nullable = (v,fn) => v===null || fn(v);
const ids = a => Array.isArray(a) && a.length<=20 && a.every(s=>/^[a-f0-9]{64}$/.test(s));
export const validFuelEntries = a => Array.isArray(a) && a.length<=5000 && new Set(a.map(e=>e?.id)).size===a.length && a.every(e=>obj(e)&&txt(e.id,100)&&e.id.length>0&&dateOK(e.date)&&txt(e.station,150)&&e.station.trim().length>0&&num(e.cost)&&e.cost>0&&Math.abs(e.cost*100-Math.round(e.cost*100))<1e-6&&nullable(e.litres,n=>num(n,1000)&&n>0)&&nullable(e.odometer,n=>num(n,1e7))&&typeof e.fullTank==='boolean'&&txt(e.notes));
export function validState(s) {
 try {
  return obj(s) && s.version===2 && obj(s.vehicle) && ['name','model','plate','vin','colour'].every(k=>txt(s.vehicle[k],120)) && num(s.vehicle.odometer,1e7) && dateOK(s.vehicle.odometerDate)
   && obj(s.nextService) && nullable(s.nextService.date,dateOK) && nullable(s.nextService.mileage,n=>num(n,1e7)) && txt(s.nextService.note) && ids(s.nextService.documents)
   && Array.isArray(s.services) && s.services.length<=5000 && new Set(s.services.map(x=>x.id)).size===s.services.length && s.services.every(x=>obj(x)&&txt(x.id,100)&&txt(x.title,150)&&dateOK(x.date)&&num(x.mileage,1e7)&&num(x.cost)&&txt(x.notes)&&ids(x.documents)&&Array.isArray(x.parts)&&x.parts.length<=50&&x.parts.every(p=>txt(p.name,150)&&num(p.amount)))
   && obj(s.purchase) && ['onRoad','insurance','booking','customerDue','depositPaid','dealerReceipt','principal','roadTax','rebate'].every(k=>num(s.purchase[k])) && ids(s.purchase.documents) && Array.isArray(s.purchase.notes) && s.purchase.notes.length<=20 && s.purchase.notes.every(n=>txt(n))
   && obj(s.loan) && txt(s.loan.lender,120) && nullable(s.loan.monthly,num) && nullable(s.loan.months,n=>Number.isInteger(n)&&n>0&&n<=600) && nullable(s.loan.firstDate,dateOK) && nullable(s.loan.nextDate,dateOK) && nullable(s.loan.rate,n=>num(n,100)) && txt(s.loan.notes)
   && ['finalInstalment','agreementTotal','termCharges'].every(k=>s.loan[k]===undefined||nullable(s.loan[k],num))
   && ['referenceRate','margin'].every(k=>s.loan[k]===undefined||nullable(s.loan[k],n=>num(n,100)))
   && (s.loan.rateType===undefined||nullable(s.loan.rateType,v=>['fixed','variable'].includes(v))) && (s.loan.documents===undefined||ids(s.loan.documents))
   && Array.isArray(s.payments) && s.payments.length<=5000 && new Set(s.payments.map(x=>x.id)).size===s.payments.length && s.payments.every(p=>txt(p.id,100)&&dateOK(p.date)&&num(p.amount)&&p.amount>0&&txt(p.note,1000))
   && (s.fuelEntries===undefined || validFuelEntries(s.fuelEntries));
 } catch { return false; }
}
export function serviceStatus(s,today=new Date().toISOString().slice(0,10)) {
 const km=s.nextService.mileage==null?null:s.nextService.mileage-s.vehicle.odometer;
 const days=s.nextService.date?Math.ceil((Date.parse(s.nextService.date)-Date.parse(today))/86400000):null;
 const due=(km!==null&&km<=0)||(days!==null&&days<=0);
 const soon=(km!==null&&km<=1000)||(days!==null&&days<=30);
 return {km,days,label:due?'Service due':soon?'Due soon':km===null&&days===null?'Schedule needed':'Upcoming service',tone:due?'danger':soon?'warning':'good'};
}
export function loanTotals(s) {
 const paid=Math.round(s.payments.reduce((a,p)=>a+p.amount,0)*100)/100;
 const scheduled=s.loan.monthly!=null&&s.loan.months!=null?Math.round((s.loan.monthly*(s.loan.months-1)+(s.loan.finalInstalment??s.loan.monthly))*100)/100:null;
 return {paid,scheduled,remaining:scheduled==null?null:Math.max(0,Math.round((scheduled-paid)*100)/100)};
}
