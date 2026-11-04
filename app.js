import {money,dateOK,validState,serviceStatus,loanTotals} from './model.js';
import {fuelMonths,fuelSummary} from './fuel.js';
import {openDocument} from './pdf-viewer.js';
import {startAutoUpdates} from './updates.js';
// Keep mobile page zoom fixed. The PDF reader handles its own pinch zoom.
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,e=>{if(e.cancelable)e.preventDefault();},{passive:false});
for(const type of ['touchstart','touchmove'])document.addEventListener(type,e=>{if(e.touches.length>1&&e.cancelable)e.preventDefault();},{passive:false});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>new Intl.NumberFormat('en-MY').format(n);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=s=>s?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s)):'Not provided';
let state,revision,documents=[],view='overview',editing,busy=false,deferredInstall,fuelMonth='',editingFuelId=null;
const navLabels={overview:'Overview',maintenance:'Maintenance',fuel:'Fuel consumption',loan:'Loan & purchase',documents:'Options / Documents',car:'My car',options:'Options'};
function notify(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#notice').hidden=true,6000);}
async function api(path,options={}){
 let response;
 try{response=await fetch('/api/'+path,{cache:'no-store',...options});}catch{throw new Error('Connection unavailable. Your changes have not been saved. Please reconnect and try again.');}
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'Something went wrong. Please try again.');
 return data;
}
function showLoadError(error){
 $('#content').innerHTML='<section class="card" role="alert"><h1>Unable to load your garage</h1><p>'+esc(error.message)+'</p><button class="primary" data-action="refresh">Try again ↻</button></section>';
 $('#syncStatus').textContent='Records unavailable';
}
async function load(){
 const [data,files]=await Promise.all([api('state'),api('documents')]);
 if(!data.state)throw new Error('Your garage is being prepared. Please try again shortly.');
 if(!validState(data.state))throw new Error('Garage data needs attention. Please contact the app owner.');
 state=data.state;revision=data.revision;documents=files.documents;
 render();
}
async function save(next){
 if(busy)return false;busy=true;
 $('#editorForm button[type=submit]')?.setAttribute('disabled','');
 try{
  if(!validState(next))throw new Error('Please check the entered dates and amounts.');
  const r=await api('state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:next,revision})});
  state=next;revision=r.revision;render();notify('Saved to your garage');return true;
 }finally{busy=false;$('#editorForm button[type=submit]')?.removeAttribute('disabled');}
}
const sourceLinks=ids=>ids.map(id=>{const d=documents.find(x=>x.id===id);return d?'<button class="source" type="button" data-document="'+id+'">▤ '+esc(d.filename)+'</button>':'';}).join('');
const metric=(label,value,sub,tone='')=>'<article class="metric '+tone+'"><span>'+label+'</span><strong>'+value+'</strong><small>'+sub+'</small></article>';
const heading=(eyebrow,title,copy,action='')=>'<div class="page-head"><div><p class="eyebrow">'+eyebrow+'</p><h1>'+title+'</h1><p>'+copy+'</p></div>'+action+'</div>';
const empty=(title,copy)=>'<div class="empty"><strong>'+title+'</strong><p>'+copy+'</p></div>';
function carProfileRow(){
 const v=state.vehicle;
 return '<div class="service-list"><button class="service-row car-profile-row" type="button" data-action="car-profile" aria-haspopup="dialog"><span class="service-row-main"><strong>'+esc(v.name)+'</strong><span class="service-row-date">'+esc(v.model)+'</span></span><span class="pill">'+esc(v.plate||'Not provided')+'</span><span class="service-row-arrow" aria-hidden="true">›</span></button></div>';
}
function renderCarProfileDetails(){
 const v=state.vehicle;
 $('#carProfileTitle').textContent=v.name;
 $('#carProfileBody').innerHTML='<dl class="rows">'+[['Model',v.model],['Registration',v.plate||'Not provided'],['Colour',v.colour||'Not provided'],['VIN',v.vin||'Not provided'],['Last recorded mileage',number(v.odometer)+' km'],['Mileage recorded on',date(v.odometerDate)]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl><div class="profile-actions"><button class="secondary" data-edit="vehicle">Edit car details ↗</button><button class="text-button" data-view="car">See My car ↗</button></div>';
}
function openCarProfile(){
 if(!state)return;
 renderCarProfileDetails();$('#carProfileBody').scrollTop=0;$('#carProfileDetails').showModal();
}
function maintenanceRecordedRow(total){
 return '<div class="service-list"><button class="service-row" type="button" data-action="maintenance-recorded" aria-haspopup="dialog"><span class="service-row-main"><strong>Maintenance recorded</strong><span class="service-row-date">'+state.services.length+' service visits</span></span><strong class="service-row-cost">'+money(total)+'</strong><span class="service-row-arrow" aria-hidden="true">›</span></button></div>';
}
function renderMaintenanceRecordedDetails(){
 const total=state.services.reduce((sum,s)=>sum+s.cost,0),sorted=[...state.services].sort((a,b)=>b.date.localeCompare(a.date));
 $('#maintenanceRecordedBody').innerHTML='<div class="service-detail-meta"><span>'+state.services.length+' service visits</span><strong>'+money(total)+'</strong></div><p class="footnote">Total of the service costs you record, including no-charge visits.</p><section><h3>Service costs</h3>'+(sorted.length?'<div class="service-list">'+sorted.map(serviceRow).join('')+'</div>':empty('No service visits yet','Log a service to start your maintenance history.'))+'</section><div class="profile-actions"><button class="secondary" data-view="maintenance">See maintenance ↗</button><button class="text-button" data-edit="service">Log a service ↗</button></div>';
}
function openMaintenanceRecorded(){
 if(!state)return;
 renderMaintenanceRecordedDetails();$('#maintenanceRecordedBody').scrollTop=0;$('#maintenanceRecordedDetails').showModal();
}
function originalLoanRow(){
 return '<div class="service-list"><button class="service-row" type="button" data-action="original-loan" aria-haspopup="dialog"><span class="service-row-main"><strong>Original loan amount</strong><span class="service-row-date">From the purchase order</span></span><strong class="service-row-cost">'+money(state.purchase.principal)+'</strong><span class="service-row-arrow" aria-hidden="true">›</span></button></div>';
}
function openOriginalLoan(){
 if(!state)return;
 const p=state.purchase;
 $('#originalLoanBody').innerHTML='<div class="service-detail-meta"><span>Original financing</span><strong>'+money(p.principal)+'</strong></div><p class="footnote">Amount recorded in the purchase order. The purchase documents do not provide a current bank balance or repayment schedule.</p><section><h3>Purchase breakdown</h3><dl class="rows">'+[['On-road price, without insurance',p.onRoad],['Insurance quoted',p.insurance],['Total purchase price',p.onRoad+p.insurance],['Purchase rebate (already included)',p.rebate],['Booking fee stated in order',p.booking],['Customer balance in order',p.customerDue],['Deposit receipt',p.depositPaid],['Dealer final payment receipt',p.dealerReceipt]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+money(value)+'</dd></div>').join('')+'</dl></section>'+p.notes.map(note=>'<p class="callout">'+esc(note)+'</p>').join('')+(p.documents.length?'<section><h3>Supporting documents</h3><div class="sources">'+sourceLinks(p.documents)+'</div></section>':'')+'<div class="profile-actions"><button class="secondary" data-view="loan">See loan & purchase ↗</button></div>';
 $('#originalLoanDetails').showModal();$('#originalLoanBody').scrollTop=0;
}
function nextServiceRow(){
 const s=serviceStatus(state,today());
 const due=[state.nextService.date?date(state.nextService.date):null,state.nextService.mileage==null?null:number(state.nextService.mileage)+' km'].filter(Boolean).join(' or ')||'Schedule not provided';
 return '<div class="service-list"><button class="service-row next-service-row" type="button" data-action="next-service" aria-haspopup="dialog"><span class="service-row-main"><strong>Next service</strong><span class="service-row-date">'+due+'</span></span><span class="pill '+s.tone+'">'+s.label+'</span><span class="service-row-arrow" aria-hidden="true">›</span></button></div>';
}
function renderNextServiceDetails(){
 const s=serviceStatus(state,today());
 $('#nextServiceBody').innerHTML='<span class="pill '+s.tone+'">'+s.label+'</span><div class="next-grid"><div><small>By date</small><h2>'+date(state.nextService.date)+'</h2></div><span class="or">OR</span><div><small>By odometer</small><h2>'+(state.nextService.mileage==null?'Not provided':number(state.nextService.mileage)+' <small>km</small>')+'</h2></div></div><p>Whichever comes first.</p><div class="callout">'+esc(state.nextService.note||'Add a confirmed service schedule from your workshop.')+'</div><div class="card-bottom"><span>'+(s.km==null?'Mileage target not set':s.km>=0?number(s.km)+' km to the mileage limit':number(-s.km)+' km past the mileage limit')+'</span><button data-edit="schedule" class="text-button">Edit schedule ↗</button></div><div class="sources">'+sourceLinks(state.nextService.documents)+'</div>';
}
function openNextService(){
 if(!state)return;
 renderNextServiceDetails();$('#nextServiceBody').scrollTop=0;$('#nextServiceDetails').showModal();
}
function loanSnapshotRow(){
 const monthly=state.loan.monthly==null?'Monthly instalment not provided':money(state.loan.monthly)+' / month';
 return '<div class="service-list"><button class="service-row" type="button" data-action="loan-snapshot" aria-haspopup="dialog"><span class="service-row-main"><strong>Loan snapshot</strong><span class="service-row-date">'+monthly+'</span></span><span class="loan-row-total"><strong>'+money(loanTotals(state).paid)+'</strong><small>Repayments logged</small></span><span class="service-row-arrow" aria-hidden="true">›</span></button></div>';
}
function openLoanSnapshot(){
 if(!state)return;
 const loan=loanTotals(state);
 $('#loanSnapshotBody').innerHTML='<dl class="rows"><div><dt>Original loan amount</dt><dd>'+money(state.purchase.principal)+'</dd></div><div><dt>Lender</dt><dd>'+esc(state.loan.lender||'Not provided')+'</dd></div><div><dt>Monthly instalment</dt><dd>'+money(state.loan.monthly)+'</dd></div><div><dt>Next payment date</dt><dd>'+date(state.loan.nextDate)+'</dd></div><div><dt>Repayments logged</dt><dd>'+money(loan.paid)+'</dd></div></dl><p class="footnote">Bank balance and repayment status are not available from the purchase PDFs. Repayments logged include only the bank payments you record.</p><button data-view="loan" class="secondary">See loan & purchase ↗</button>';
 $('#loanSnapshotBody').scrollTop=0;$('#loanSnapshotDetails').showModal();
}
function serviceRow(s){
 return '<button class="service-row" type="button" data-service="'+esc(s.id)+'" aria-haspopup="dialog"><span class="service-row-main"><span class="service-row-date">'+date(s.date)+' · '+number(s.mileage)+' km</span><strong>'+esc(s.title)+'</strong></span><strong class="service-row-cost">'+money(s.cost)+'</strong><span class="service-row-arrow" aria-hidden="true">›</span></button>';
}
function renderOverview(total,sorted,loan){
 const v=state.vehicle,schedule=state.nextService,status=serviceStatus(state,today());
 const month=today().slice(0,7),fuel=fuelSummary(state.fuelEntries||[],month);
 const icon=(name)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
  service:'<path d="m14 6 4-4a6 6 0 0 1-7 8L5 16a2.1 2.1 0 0 0 3 3l6-6a6 6 0 0 0 8-7l-4 4z"/>',
  fuel:'<path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M3 21h12M4 10h10M7 6h4M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9l-4-4M19 6v4h3"/>',
  document:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18m-13 5 3 3 5-5"/>',
  car:'<path d="m5 8 2-5h10l2 5 2 3v7H3v-7zM5 8h14M3 14h18M6 18v3m12-3v3M6 11h2m8 0h2"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>'
 }[name]||'')+'</svg>';
 const distance=status.km==null?'Add a mileage target':status.km<0?number(-status.km)+' km past the mileage target':status.km===0?'Mileage target reached':number(status.km)+' km to the mileage target';
 const days=status.days==null?'Date not set':status.days<0?number(-status.days)+' days overdue':status.days===0?'Due today':number(status.days)+' days away';
 const stat=(symbol,label,value,copy,attributes)=>'<button class="overview-stat" type="button" '+attributes+'><span class="overview-stat-top"><span class="overview-icon">'+icon(symbol)+'</span><span>'+label+'</span>'+icon('arrow')+'</span><strong>'+value+'</strong><small>'+copy+'</small></button>';
 return `<div class="overview">
  <div class="page-head overview-heading"><div><p class="eyebrow">A LITTLE CARE. MANY MORE MILES.</p><h1>Your car, at a glance.</h1><p>Everything you need for the road ahead.</p></div><button class="primary" data-edit="service"><span aria-hidden="true">＋</span> Log a service</button></div>
  <div class="overview-top">
   <section class="vehicle-card" aria-labelledby="overviewVehicleTitle">
    <div class="vehicle-card-top"><span class="eyebrow">IN YOUR GARAGE</span><span class="registration">${esc(v.plate||'Registration not provided')}</span></div>
    <h2 id="overviewVehicleTitle">${esc(v.name)}</h2><p class="vehicle-model">${esc(v.model)}</p>
    <img class="overview-car-art" src="/assets/garage-car.svg" alt="" width="600" height="230">
    <div class="vehicle-card-bottom"><div><span>Recorded mileage</span><strong>${number(v.odometer)} <small>km</small></strong><small>As at ${date(v.odometerDate)}</small></div><button data-action="car-profile" class="vehicle-details" aria-haspopup="dialog">Car details ${icon('arrow')}</button></div>
   </section>
   <section class="overview-schedule" aria-labelledby="overviewScheduleTitle">
    <div class="schedule-top"><span class="overview-icon">${icon('calendar')}</span><span class="pill ${status.tone}">${status.label}</span></div>
    <p class="eyebrow">NEXT UP</p><h2 id="overviewScheduleTitle">A little care goes a long way.</h2>
    <div class="schedule-targets"><div><span>By date</span><strong>${schedule.date?date(schedule.date):'Not set'}</strong><small>${days}</small></div><span class="schedule-or">or</span><div><span>By odometer</span><strong>${schedule.mileage==null?'Not set':number(schedule.mileage)+' <small>km</small>'}</strong><small>Whichever comes first</small></div></div>
    <div class="schedule-distance">${icon('car')}<span>${distance}<small>Based on your last recorded mileage</small></span></div>
    <button class="overview-card-link" data-action="next-service" aria-haspopup="dialog">View service schedule ${icon('arrow')}</button>
   </section>
  </div>
  <div class="overview-stats" aria-label="Garage summary">
   ${stat('service','Maintenance recorded',money(total),state.services.length+' service '+(state.services.length===1?'visit':'visits')+' · all time','data-action="maintenance-recorded" aria-haspopup="dialog"')}
   ${stat('fuel','Fuel this month',money(fuel.total),monthLabel(month)+' · '+fuel.count+' '+(fuel.count===1?'fill-up':'fill-ups'),'data-view="fuel" data-current-fuel')}
   ${stat('document','Document library',documents.length+' <small>PDFs</small>','Original documents, all together','data-view="documents"')}
  </div>
  <div class="overview-bottom">
   <section class="overview-activity" aria-labelledby="overviewActivityTitle"><div class="overview-section-head"><div><p class="eyebrow">THE CARE JOURNAL</p><h2 id="overviewActivityTitle">Recent maintenance</h2></div><button class="text-button" data-view="maintenance">View all ${icon('arrow')}</button></div>${sorted.length?'<div class="service-list">'+sorted.slice(0,2).map(serviceRow).join('')+'</div>':empty('Your story starts here','Log your first service to start your car’s care journal.')}<div class="overview-journal-note">${icon('service')}<span>A well-kept history for the miles ahead.</span></div></section>
   <section class="overview-finance" aria-labelledby="overviewFinanceTitle"><div class="overview-section-head"><div><p class="eyebrow">THE FINANCIAL PICTURE</p><h2 id="overviewFinanceTitle">Purchase & loan</h2></div></div><button class="finance-principal" data-action="original-loan" aria-haspopup="dialog"><span>Original loan amount ${icon('arrow')}</span><strong>${money(state.purchase.principal)}</strong><small>From your purchase order</small></button><button class="finance-repayments" data-action="loan-snapshot" aria-haspopup="dialog"><span>Repayments logged<strong>${money(loan.paid)}</strong></span>${icon('arrow')}</button><button class="overview-card-link" data-view="loan">See loan & purchase ${icon('arrow')}</button></section>
  </div>
  <div class="overview-shortcuts" role="group" aria-label="Quick actions"><span>Keep things up to date</span><button data-edit="fuel">${icon('fuel')} Log a fill-up</button><button data-edit="vehicle">${icon('car')} Update mileage</button><button data-edit="upload">${icon('document')} Add a document</button></div>
 </div>`;
}
function openService(id){
 const s=state?.services.find(item=>item.id===id);if(!s)return;
 $('#serviceTitle').textContent=s.title;
 $('#serviceBody').innerHTML='<div class="service-detail-meta"><span>'+date(s.date)+' · '+number(s.mileage)+' km</span><strong>'+money(s.cost)+'</strong></div><p class="preline">'+esc(s.notes)+'</p>'+
  (s.parts.length?'<section><h3>Parts & charges</h3><dl class="rows">'+s.parts.map(p=>'<div><dt>'+esc(p.name)+'</dt><dd>'+money(p.amount)+'</dd></div>').join('')+'</dl></section>':'')+
  (s.documents.length?'<section><h3>Supporting documents</h3><div class="sources">'+sourceLinks(s.documents)+'</div></section>':'');
 $('#serviceBody').scrollTop=0;
 $('#serviceDetails').showModal();
}
function render(){
 if(!state)return;
 const total=state.services.reduce((sum,x)=>sum+x.cost,0),loan=loanTotals(state);
 const sorted=[...state.services].sort((a,b)=>b.date.localeCompare(a.date));
 const activeTab=view==='documents'?'options':view;
 document.querySelectorAll('.sidebar nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===activeTab);b.setAttribute('aria-current',b.dataset.view===activeTab?'page':'false');});
 $('#breadcrumb').textContent='Your garage / '+navLabels[view];
 $('#syncStatus').textContent='Saved '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(revision));
 let content='';
 if(view==='fuel')content=renderFuel();
 if(view==='overview'){
  content=renderOverview(total,sorted,loan);
 }
 if(view==='maintenance'){
  content=heading('CARE THAT COUNTS','Maintenance','Workshop records, clear costs and your next visit.','<button class="primary" data-edit="service">＋ Log a service</button>')+
  '<div class="metrics three">'+metric('Total recorded cost',money(total),'Each invoice counted once','mint')+metric('Service visits',String(state.services.length),'Includes no-charge repairs')+metric('Latest recorded mileage',number(state.vehicle.odometer)+' km','As at '+date(state.vehicle.odometerDate))+'</div>'+nextServiceRow()+
  '<div class="section-title spaced"><h2>Service timeline</h2><span class="muted">Newest first</span></div>'+(sorted.length?'<div class="service-list">'+sorted.map(serviceRow).join('')+'</div>':empty('Start your service history','Log your first maintenance visit.'))+
  '<p class="footnote">Service invoices and their matching e-invoices describe the same visit. Replacement and inspection are kept distinct in the notes.</p>';
 }
 if(view==='loan'){
  const p=state.purchase;
  content=heading('THE FINANCIAL PICTURE','Loan & purchase','Purchase documents and your own repayment log.','<button class="primary" data-edit="loan">Edit loan details ↗</button>')+
  '<div class="metrics three">'+metric('Original loan amount',money(p.principal),'Order amount; not today’s balance','mint')+metric('Monthly instalment',money(state.loan.monthly),'Add your bank agreement details')+metric('Next payment date',date(state.loan.nextDate),'Manually confirmed with your bank')+'</div>'+
  '<div class="two-col"><section class="card"><p class="eyebrow">REPAYMENT DETAILS</p><h2>Your loan at a glance</h2><dl class="rows"><div><dt>Lender</dt><dd>'+esc(state.loan.lender||'Not provided')+'</dd></div><div><dt>Loan term</dt><dd>'+(state.loan.months==null?'Not provided':state.loan.months+' months')+'</dd></div><div><dt>First payment date</dt><dd>'+date(state.loan.firstDate)+'</dd></div><div><dt>Stated annual rate</dt><dd>'+(state.loan.rate==null?'Not provided':state.loan.rate+'%')+'</dd></div><div><dt>Total scheduled instalments</dt><dd>'+money(loan.scheduled)+'</dd></div><div><dt>Payments you logged</dt><dd>'+money(loan.paid)+'</dd></div><div><dt>Unlogged scheduled amount</dt><dd>'+money(loan.remaining)+'</dd></div></dl><p class="footnote">Scheduled totals use monthly instalment × number of months. This is a tracking estimate, not a bank balance or settlement quote. Only payments you record are deducted. Interest is not calculated from the rate.</p><p class="preline">'+esc(state.loan.notes)+'</p></section>'+
  '<section class="card"><p class="eyebrow">PURCHASE ORDER</p><h2>Where the money went</h2><dl class="rows">'+[['On-road price, without insurance',p.onRoad],['Insurance quoted',p.insurance],['Total purchase price',p.onRoad+p.insurance],['Purchase rebate (already included)',p.rebate],['Booking fee stated in order',p.booking],['Original loan amount',p.principal],['Customer balance in order',p.customerDue],['Deposit receipt',p.depositPaid],['Dealer final payment receipt',p.dealerReceipt]].map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+money(v)+'</dd></div>').join('')+'</dl>'+p.notes.map(n=>'<p class="callout">'+esc(n)+'</p>').join('')+sourceLinks(p.documents)+'</section></div>'+
  '<div class="section-title spaced"><h2>Repayment log</h2><button class="secondary" data-edit="payment">＋ Record a payment</button></div>'+
  (state.payments.length?'<div class="card">'+[...state.payments].sort((a,b)=>b.date.localeCompare(a.date)).map(p=>'<div class="payment-row"><div><strong>'+date(p.date)+'</strong><p>'+esc(p.note)+'</p></div><strong>'+money(p.amount)+'</strong></div>').join('')+'</div>':empty('No bank repayments recorded','The dealer’s purchase receipt is separate from your monthly bank repayments.'));
 }
 if(view==='options'){
  content=heading('MAKE IT YOURS','Options','Choose your appearance and find your documents.')+
  '<section class="card options-section"><p class="eyebrow">APP UPDATES</p><h2>Always up to date.</h2><p>New versions load automatically. If you’re editing or reading a PDF, the update waits until you finish.</p></section>'+
  '<section class="card options-section spaced" aria-labelledby="appearanceTitle"><p class="eyebrow">APPEARANCE</p><h2 id="appearanceTitle">Light or dark, your choice.</h2><p>Choose a look for this device. Your choice is remembered.</p><div class="theme-options" role="group" aria-label="Colour mode">'+
  ['light','dark'].map(theme=>'<button class="theme-choice" type="button" data-theme-choice="'+theme+'" aria-pressed="'+(window.PikaTheme.get()===theme)+'"><span class="theme-swatch '+theme+'" aria-hidden="true"><span class="swatch-nav"></span><span class="swatch-card"></span><span class="swatch-card"></span></span><span class="theme-label">'+(theme==='light'?'☀ Light':'☾ Dark')+'<span class="theme-check" aria-hidden="true">✓</span></span></button>').join('')+
  '</div></section><section class="card options-section spaced" aria-labelledby="optionsDocumentsTitle"><p class="eyebrow">DOCUMENTS</p><h2 id="optionsDocumentsTitle">Your paperwork, close by.</h2><p>Open your receipts, invoices and purchase documents, or add a new PDF.</p><button class="option-link" type="button" data-view="documents"><span class="option-icon" aria-hidden="true">▤</span><span><strong>Document library</strong><small>'+documents.length+' unique PDFs · available to everyone</small></span><span aria-hidden="true">↗</span></button></section>';
 }
 if(view==='documents'){
  content='<button class="text-button back-button" data-view="options" type="button">← Back to Options</button>'+heading('THE PAPER TRAIL','Your document library','Original PDFs, ready whenever you need them.','<button class="primary" data-edit="upload">＋ Add a PDF</button>')+
  '<div class="callout">PDFs in this library are publicly accessible. Matching files are detected automatically. Uploading a new PDF stores it here; add its details to the service or repayment log separately.</div>'+
  '<div class="document-tools"><label>Find a document<input type="search" id="documentSearch" placeholder="Search filename or category"></label><label>Category<select id="documentCategory"><option>All</option><option>Service</option><option>Purchase</option><option>Loan</option><option>Other</option></select></label></div><div id="documentList" class="document-grid"></div>';
 }
 if(view==='car'){
  const v=state.vehicle;
  content=heading('YOUR GARAGE','Car details','Keep the mileage current for useful service reminders.','<button class="primary" data-edit="vehicle">Edit car details ↗</button>')+
  '<section class="card"><p class="eyebrow">VEHICLE PROFILE</p><h2>'+esc(v.name)+'</h2><dl class="rows">'+[['Model',v.model],['Registration',v.plate],['Colour',v.colour],['VIN',v.vin],['Last recorded mileage',number(v.odometer)+' km'],['Mileage recorded on',date(v.odometerDate)]].map(([k,val])=>'<div><dt>'+k+'</dt><dd>'+esc(val)+'</dd></div>').join('')+'</dl></section>'+
  '<section class="card spaced"><h2>Your data, together.</h2><p>This garage is public. Anyone with the link can view and update the records. Changes save across devices. Use Refresh to load the latest records.</p><button class="secondary" data-action="export">Export a JSON backup ↓</button><p class="footnote">The backup includes summaries, repayment records and document metadata. Open original PDFs from Options → Document library.</p></section>';
 }
 $('#content').innerHTML=content;if(view==='documents')renderDocuments();
}
function renderDocuments(){
 const query=($('#documentSearch')?.value||'').toLowerCase(),category=$('#documentCategory')?.value||'All';
 const files=documents.filter(d=>(category==='All'||d.category===category)&&[d.filename,d.category,...d.aliases].join(' ').toLowerCase().includes(query));
 $('#documentList').innerHTML=files.length?files.map(d=>'<article class="card document-card"><div class="pdf-icon">PDF</div><span class="pill">'+esc(d.category)+'</span><h3>'+esc(d.filename)+'</h3><p>'+number(Math.ceil(d.size/1024))+' KB · Original document</p>'+(d.aliases.length?'<p class="footnote">Duplicate copy: '+d.aliases.map(esc).join(', ')+'</p>':'')+'<button class="secondary" type="button" data-document="'+d.id+'">Open PDF</button></article>').join(''):empty('No matching documents','Try another search or add a PDF.');
}
function field(label,name,value='',type='text',extra=''){
 return '<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value??'')+'" '+extra+'></label>';
}
function documentSelect(selected=''){return '<label>Supporting PDF (optional)<select name="document"><option value="">None</option>'+documents.map(d=>'<option value="'+d.id+'"'+(d.id===selected?' selected':'')+'>'+esc(d.filename)+'</option>').join('')+'</select></label>';}
function monthLabel(month){return month==='all'?'All months':new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01'));}
function renderFuel(){
 const entries=state.fuelEntries||[],months=fuelMonths(entries);
 // The Overview shortcut can open the current month before its first fill-up.
 if(fuelMonth===today().slice(0,7)&&!months.includes(fuelMonth))months.unshift(fuelMonth);
 if(!fuelMonth || (fuelMonth!=='all'&&!months.includes(fuelMonth)))fuelMonth=months[0]||'all';
 const summary=fuelSummary(entries,fuelMonth),selected=entries.filter(e=>fuelMonth==='all'||e.date.startsWith(fuelMonth+'-')).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const decimal=n=>new Intl.NumberFormat('en-MY',{maximumFractionDigits:2}).format(n);
 const maxSpend=Math.max(1,...months.map(m=>fuelSummary(entries,m).total));
 return heading('EVERY FILL, IN VIEW','Fuel consumption','Track your refuelling, monthly spend and measured fuel economy.','<button class="primary" data-edit="fuel">＋ Log a fill-up</button>')+
  '<div class="fuel-filter"><label>Show month<select id="fuelMonth"><option value="all"'+(fuelMonth==='all'?' selected':'')+'>All months</option>'+months.map(m=>'<option value="'+m+'"'+(fuelMonth===m?' selected':'')+'>'+monthLabel(m)+'</option>').join('')+'</select></label><p>Grouped by transaction date.</p></div>'+
  '<div class="metrics three">'+metric('Fuel spend',money(summary.total),monthLabel(fuelMonth),'mint')+metric('Fill-ups',String(summary.count),'Recorded fuel transactions')+metric('Average per fill-up',money(summary.average),'Based on recorded payments')+'</div>'+
  '<div class="two-col"><section class="card"><p class="eyebrow">FUEL ECONOMY</p><h2>'+(summary.kmPerLitre==null?'Ready when you have the readings':decimal(summary.kmPerLitre)+' km/L')+'</h2><dl class="rows"><div><dt>Consumption</dt><dd>'+(summary.litresPer100km==null?'Not available':decimal(summary.litresPer100km)+' L/100 km')+'</dd></div><div><dt>Litres recorded</dt><dd>'+(summary.litres==null?'Not provided':decimal(summary.litres)+' L')+'</dd></div><div><dt>Distance measured</dt><dd>'+(summary.distance==null?'Not available':decimal(summary.distance)+' km')+'</dd></div></dl><p class="footnote">Add receipt litres and odometer readings, and mark a full tank when applicable. Economy uses complete full-to-full intervals, including partial fills, ending in the selected month. Missing litres break the calculation.</p>'+(summary.missingLitres?'<p class="callout">'+summary.missingLitres+' fill-ups have no litre reading. Amounts alone cannot tell us fuel consumption.</p>':'')+'</section>'+
  '<section class="card"><p class="eyebrow">MONTH BY MONTH</p><h2>Your fuel spending</h2>'+(months.length?'<div class="fuel-months">'+months.map(m=>{const s=fuelSummary(entries,m);return '<button type="button" class="fuel-month" data-fuel-month="'+m+'" aria-pressed="'+(fuelMonth===m)+'"><span><strong>'+monthLabel(m)+'</strong><strong>'+money(s.total)+'</strong></span><small>'+s.count+' fill-ups</small><meter min="0" max="'+maxSpend+'" value="'+s.total+'" aria-label="'+monthLabel(m)+' fuel spend"></meter></button>';}).join('')+'</div>':empty('No fuel records yet','Log a fill-up to start tracking.'))+'</section></div>'+
  '<div class="section-title spaced"><h2>Fill-up history</h2><span class="muted">Newest first</span></div>'+(selected.length?'<div class="service-list">'+selected.map(e=>'<button class="service-row" type="button" data-fuel-edit="'+esc(e.id)+'" aria-haspopup="dialog"><span class="service-row-main"><span class="service-row-date">'+date(e.date)+(e.fullTank?' · Full tank':'')+'</span><strong>'+esc(e.station)+'</strong><span class="service-row-date">'+(e.litres==null?'Litres not recorded':decimal(e.litres)+' L')+' · '+(e.odometer==null?'Odometer not recorded':number(e.odometer)+' km')+'</span></span><strong class="service-row-cost">'+money(e.cost)+'</strong><span class="service-row-arrow" aria-hidden="true">›</span></button>').join('')+'</div>':empty('No fill-ups this month','Choose another month or log a fill-up.'));
}
function openEditor(type,fuelId=null){
 if(!state)return;
 editing=type;editingFuelId=fuelId;let body='',title='';
 if(type==='fuel'){
  const f=(state.fuelEntries||[]).find(e=>e.id===fuelId)||{date:today(),station:'',cost:null,litres:null,odometer:null,fullTank:false,notes:''};
  title=fuelId?'Edit fill-up':'Log a fill-up';
  body=field('Transaction date','date',f.date,'date','required')+field('Station / payment provider','station',f.station,'text','required maxlength="150"')+field('Amount paid (RM)','cost',f.cost,'number','required min="0.01" max="100000000" step="0.01"')+field('Litres (optional)','litres',f.litres,'number','min="0.001" max="1000" step="0.001"')+field('Odometer in km (optional)','odometer',f.odometer,'number','min="0" max="10000000" step="0.1"')+'<label class="fuel-check"><input name="fullTank" type="checkbox"'+(f.fullTank?' checked':'')+'>Filled to a full tank</label><label>Notes / source<textarea name="notes" maxlength="2000">'+esc(f.notes)+'</textarea></label><p class="footnote">Leave unknown readings blank. Use actual receipt litres; do not estimate from the payment amount or tank size.</p>'+(fuelId?'<button type="button" class="text-button" data-action="delete-fuel">Delete this fill-up</button>':'');
 }
 if(type==='vehicle'){title='Edit car details';const v=state.vehicle;body=field('Car nickname','name',v.name,'text','required maxlength="120"')+field('Model','model',v.model,'text','required maxlength="120"')+field('Registration','plate',v.plate,'text','maxlength="120"')+field('Colour','colour',v.colour,'text','maxlength="120"')+field('VIN','vin',v.vin,'text','maxlength="120"')+field('Odometer (km)','odometer',v.odometer,'number','min="0" max="10000000" required')+field('Mileage recorded on','odometerDate',v.odometerDate,'date','required');}
 if(type==='schedule'){title='Next service';body='<p>Use the exact date and odometer target supplied by your workshop.</p>'+field('Due date','date',state.nextService.date,'date')+field('Due at odometer (km)','mileage',state.nextService.mileage,'number','min="0" max="10000000"')+'<label>Source / notes<textarea name="note" maxlength="2000">'+esc(state.nextService.note)+'</textarea></label>'+documentSelect(state.nextService.documents[0]);}
 if(type==='service'){title='Log a service';body=field('Service description','title','','text','required maxlength="150"')+field('Date','date',today(),'date','required')+field('Odometer (km)','mileage',state.vehicle.odometer,'number','required min="0" max="10000000"')+field('Total invoice amount (RM)','cost','','number','required min="0" max="100000000" step="0.01"')+'<label>Work performed / notes<textarea name="notes" maxlength="2000"></textarea></label>'+documentSelect()+'<p class="footnote">Record the whole invoice once. Update the next-service schedule separately after this visit.</p>';}
 if(type==='loan'){title='Loan details';const l=state.loan;body='<p>Enter the agreed terms from your lender. Leave unknown fields blank.</p>'+field('Lender','lender',l.lender,'text','maxlength="120"')+field('Monthly instalment (RM)','monthly',l.monthly,'number','min="0.01" max="100000000" step="0.01"')+field('Loan term (months)','months',l.months,'number','min="1" max="600" step="1"')+field('First payment date','firstDate',l.firstDate,'date')+field('Next payment date (confirmed)','nextDate',l.nextDate,'date')+field('Stated annual rate (%)','rate',l.rate,'number','min="0" max="100" step="0.001"')+'<label>Notes / source<textarea name="notes" maxlength="2000">'+esc(l.notes)+'</textarea></label>';}
 if(type==='payment'){title='Record a bank repayment';body=field('Payment date','date',today(),'date','required')+field('Amount (RM)','amount',state.loan.monthly,'number','required min="0.01" max="100000000" step="0.01"')+'<label>Bank reference / note<textarea name="note" maxlength="1000"></textarea></label><p class="footnote">Add actual bank repayments only. Recording a payment does not make a bank transfer.</p>';}
 if(type==='upload'){title='Add a document';body='<label>PDF file<input name="file" type="file" accept=".pdf,application/pdf" required></label><label>Category<select name="category"><option>Service</option><option>Purchase</option><option>Loan</option><option>Other</option></select></label><p class="footnote">Uploaded PDFs are publicly accessible. PDF only, up to 20 MB. Duplicate PDFs will reuse the existing file.</p>';}
 $('#editorTitle').textContent=title;$('#editorForm').innerHTML=body+'<p id="formError" role="alert"></p><button class="primary" type="submit">'+(type==='upload'?'Upload PDF':'Save changes')+'</button>';
 $('#editor').showModal();
}
$('#editorForm').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 const f=new FormData(e.currentTarget),value=k=>String(f.get(k)||'').trim(),n=k=>value(k)===''?null:Number(value(k));
 try{
  if(editing==='upload'){
   const file=f.get('file');if(!file||file.size>20*1024*1024)throw new Error('Choose a PDF smaller than 20 MB.');
   busy=true;e.currentTarget.querySelector('button[type=submit]').disabled=true;
   try{const r=await api('documents',{method:'POST',headers:{'Content-Type':'application/pdf','X-Filename':encodeURIComponent(file.name),'X-Category':value('category')},body:file});documents=(await api('documents')).documents;render();$('#editor').close();notify(r.duplicate?'This PDF is already in your library.':'PDF safely stored in your library.');}finally{busy=false;}
   return;
  }
  const next=structuredClone(state);
  if(editing==='fuel'){
   const entry={id:editingFuelId||crypto.randomUUID(),date:value('date'),station:value('station'),cost:n('cost'),litres:n('litres'),odometer:n('odometer'),fullTank:f.has('fullTank'),notes:value('notes')};
   next.fuelEntries=next.fuelEntries||[];
   const index=next.fuelEntries.findIndex(e=>e.id===entry.id);
   if(index<0)next.fuelEntries.push(entry);else next.fuelEntries[index]=entry;
   fuelMonth=entry.date.slice(0,7);
  }
  if(editing==='vehicle')next.vehicle={name:value('name'),model:value('model'),plate:value('plate'),vin:value('vin'),colour:value('colour'),odometer:n('odometer'),odometerDate:value('odometerDate')};
  if(editing==='schedule')next.nextService={date:value('date')||null,mileage:n('mileage'),note:value('note'),documents:value('document')?[value('document')]:[]};
  if(editing==='loan')next.loan={lender:value('lender'),monthly:n('monthly'),months:n('months'),rate:n('rate'),firstDate:value('firstDate')||null,nextDate:value('nextDate')||null,notes:value('notes')};
  if(editing==='payment')next.payments.push({id:crypto.randomUUID(),date:value('date'),amount:n('amount'),note:value('note')});
  if(editing==='service'){
   next.services.push({id:crypto.randomUUID(),title:value('title'),date:value('date'),mileage:n('mileage'),cost:n('cost'),notes:value('notes'),parts:[],documents:value('document')?[value('document')]:[]});
   if(n('mileage')>=next.vehicle.odometer&&value('date')>=next.vehicle.odometerDate){next.vehicle.odometer=n('mileage');next.vehicle.odometerDate=value('date');}
  }
  if(await save(next))$('#editor').close();
 }catch(error){const box=$('#formError');if(box)box.textContent=error.message;else notify(error.message);}finally{e.target.querySelector('button[type=submit]')?.removeAttribute('disabled');}
});
document.addEventListener('click',async e=>{
 const fuel=e.target.closest('[data-fuel-edit]');if(fuel){openEditor('fuel',fuel.dataset.fuelEdit);return;}
 const month=e.target.closest('[data-fuel-month]');if(month){fuelMonth=month.dataset.fuelMonth;render();return;}
 const service=e.target.closest('[data-service]');if(service){openService(service.dataset.service);return;}
 const pdf=e.target.closest('[data-document]');if(pdf){const file=documents.find(d=>d.id===pdf.dataset.document);if(file)openDocument(file);return;}
 const theme=e.target.closest('[data-theme-choice]');if(theme)window.PikaTheme.set(theme.dataset.themeChoice);
 const go=e.target.closest('[data-view]');if(go){for(const id of ['loanSnapshotDetails','carProfileDetails','maintenanceRecordedDetails','originalLoanDetails']){const popup=document.getElementById(id);if(popup?.open)popup.close();}if(go.hasAttribute('data-current-fuel'))fuelMonth=today().slice(0,7);view=go.dataset.view;render();window.scrollTo({top:0});}
 const edit=e.target.closest('[data-edit]');if(edit)openEditor(edit.dataset.edit);
 const action=e.target.closest('[data-action]')?.dataset.action;
 try{
  if(action==='delete-fuel'&&!busy&&editingFuelId&&confirm('Delete this fill-up from your fuel log?')){const next=structuredClone(state);next.fuelEntries=next.fuelEntries.filter(e=>e.id!==editingFuelId);if(await save(next))$('#editor').close();}
  if(action==='close'&&!busy)$('#editor').close();
  if(action==='close-service')$('#serviceDetails').close();
  if(action==='next-service')openNextService();
  if(action==='close-next-service')$('#nextServiceDetails').close();
  if(action==='loan-snapshot')openLoanSnapshot();
  if(action==='close-loan-snapshot')$('#loanSnapshotDetails').close();
  if(action==='car-profile')openCarProfile();
  if(action==='close-car-profile')$('#carProfileDetails').close();
  if(action==='maintenance-recorded')openMaintenanceRecorded();
  if(action==='close-maintenance-recorded')$('#maintenanceRecordedDetails').close();
  if(action==='original-loan')openOriginalLoan();
  if(action==='close-original-loan')$('#originalLoanDetails').close();
  if(action==='refresh'){await load();notify('Latest records loaded');}
  if(action==='export'){
   const blob=new Blob([JSON.stringify({state,documents,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
   const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pika-garage-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  if(action==='install'&&deferredInstall){await deferredInstall.prompt();deferredInstall=null;$('#install').hidden=true;}
 }catch(error){if(!state)showLoadError(error);else notify(error.message);}
});
window.addEventListener('pika-theme-change',()=>{
 document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===window.PikaTheme.get())));
});
document.addEventListener('input',e=>{if(e.target.id==='documentSearch')renderDocuments();});
document.addEventListener('change',e=>{if(e.target.id==='documentCategory')renderDocuments();if(e.target.id==='fuelMonth'){fuelMonth=e.target.value;render();$('#fuelMonth').focus();}});
$('#editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('#editor').addEventListener('close',()=>{
 if($('#nextServiceDetails').open){renderNextServiceDetails();$('#nextServiceDetails [data-edit="schedule"]').focus({preventScroll:true});}
 if($('#carProfileDetails').open){renderCarProfileDetails();$('#carProfileDetails [data-edit="vehicle"]').focus({preventScroll:true});}
 if($('#maintenanceRecordedDetails').open){renderMaintenanceRecordedDetails();$('#maintenanceRecordedDetails [data-edit="service"]').focus({preventScroll:true});}
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#install').hidden=false;});
window.addEventListener('offline',()=>notify('You are offline. Reconnect before saving or opening documents.'));
startAutoUpdates({
 canReload:()=>!busy&&!document.querySelector('dialog[open]'),
 onPending:()=>notify('An update is ready. It will apply after you finish.'),
 beforeReload:()=>sessionStorage.setItem('pika-update-view',JSON.stringify({view,fuelMonth,scroll:window.scrollY,search:$('#documentSearch')?.value,category:$('#documentCategory')?.value}))
});
async function start(){
 let restored;
 try{restored=JSON.parse(sessionStorage.getItem('pika-update-view'));sessionStorage.removeItem('pika-update-view');}catch{}
 if(restored&&Object.hasOwn(navLabels,restored.view))view=restored.view;
 if(restored&&typeof restored.fuelMonth==='string'&&/^(all|\d{4}-\d{2})$/.test(restored.fuelMonth))fuelMonth=restored.fuelMonth;
 await load();
 if(restored){
  if(view==='documents'){
   if(typeof restored.search==='string')$('#documentSearch').value=restored.search;
   if(['All','Service','Purchase','Loan','Other'].includes(restored.category))$('#documentCategory').value=restored.category;
   renderDocuments();
  }
  requestAnimationFrame(()=>window.scrollTo(0,Number.isFinite(restored.scroll)?restored.scroll:0));
  notify('App updated');
 }
}
start().catch(showLoadError);
