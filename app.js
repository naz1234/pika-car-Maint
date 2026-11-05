import {money,dateOK,validState,serviceStatus,loanTotals} from './model.js';
import {fuelMonths,fuelSummary} from './fuel.js';
import {openDocument} from './pdf-viewer.js';
import {openTipPhoto,tipPhotoUrl} from './photo-viewer.js';
import {startAutoUpdates} from './updates.js';
// Keep mobile page zoom fixed. Document and photo readers handle their own pinch zoom.
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,e=>{if(e.cancelable)e.preventDefault();},{passive:false});
for(const type of ['touchstart','touchmove'])document.addEventListener(type,e=>{if(e.touches.length>1&&e.cancelable)e.preventDefault();},{passive:false});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>new Intl.NumberFormat('en-MY').format(n);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=s=>s?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s)):'Not provided';
let state,revision,documents=[],tips=[],tipsUnavailable=false,view='overview',editing,busy=false,deferredInstall,fuelMonth='',editingFuelId=null,fuelDetailsId=null;
const navLabels={overview:'Overview',maintenance:'Maintenance',fuel:'Fuel',loan:'Loan & purchase',documents:'Overview / Options / Documents',car:'Overview / My car',options:'Overview / Options',tips:'Car tips'};
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
 const [data,files,savedTips]=await Promise.all([api('state'),api('documents'),api('tips').catch(()=>({tips:[],unavailable:true}))]);
 if(!data.state)throw new Error('Your garage is being prepared. Please try again shortly.');
 if(!validState(data.state))throw new Error('Garage data needs attention. Please contact the app owner.');
 state=data.state;revision=data.revision;documents=files.documents;tips=savedTips.tips;tipsUnavailable=!!savedTips.unavailable;
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
const heading=(eyebrow,title,copy,action='')=>'<div class="page-head"><div><p class="eyebrow">'+eyebrow+'</p><h1>'+title+'</h1><p>'+copy+'</p></div>'+action+'</div>';
const dashboardPicture=kind=>'<figure class="dashboard-scene scene-'+kind+'"><img src="/assets/dashboard-'+kind+'.webp" alt="'+({maintenance:'Red SUV in a service bay — illustration',fuel:'Red SUV beside a petrol pump — illustration',loan:'Car keys and purchase papers with a red SUV — illustration',tips:'Owner handbook and camera display beside a red SUV — illustration'}[kind])+'" width="1536" height="1024" loading="lazy" decoding="async"></figure>';
const empty=(title,copy)=>'<div class="empty"><strong>'+title+'</strong><p>'+copy+'</p></div>';
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
 service:'<path d="m14 6 4-4a6 6 0 0 1-7 8L5 16a2.1 2.1 0 0 0 3 3l6-6a6 6 0 0 0 8-7l-4 4z"/>',
 fuel:'<path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M3 21h12M4 10h10M7 6h4M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9l-4-4M19 6v4h3"/>',
 document:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h4"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18m-13 5 3 3 5-5"/>',
 car:'<path d="m5 8 2-5h10l2 5 2 3v7H3v-7zM5 8h14M3 14h18M6 18v3m12-3v3M6 11h2m8 0h2"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 options:'<path d="M4 7h3m6 0h7M4 17h7m6 0h3"/><circle cx="10" cy="7" r="3"/><circle cx="14" cy="17" r="3"/>'
}[name]||'')+'</svg>';
function loanTermsRows(l){
 const rate=l.rate==null?'Not provided':number(l.rate)+'%'+(l.rateType?' · '+l.rateType:'');
 return [['Lender',l.lender||'Not provided'],['Loan term',l.months==null?'Not provided':l.months+' months'],['Monthly instalment',money(l.monthly)],['Final instalment',money(l.finalInstalment)],['Stated effective annual rate',rate],...(l.referenceRate!=null?[['Reference rate in agreement',number(l.referenceRate)+'%']]:[]),...(l.margin!=null?[['Margin over reference rate',number(l.margin)+' percentage points']]:[]),['Term charges in agreement',money(l.termCharges)],['Original agreement total',money(l.agreementTotal)]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>').join('');
}
function loanScheduleNote(l){
 const calculation=l.finalInstalment!=null?'Scheduled totals use the monthly instalment for all but the final month, then the final instalment.':'Scheduled totals use the monthly instalment × number of months.';
 return '<p class="footnote">'+calculation+' '+(l.rateType==='variable'?'Variable-rate terms may change. ':'')+'These are tracking figures, not a current bank balance or settlement quote. Only payments you log are deducted; profit accrual is not calculated.</p>';
}
function loanSources(l){
 return l.documents?.length?'<section><h3>Loan documents</h3><div class="sources">'+sourceLinks(l.documents)+'</div></section>':'';
}
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
function openOriginalLoan(title='Original loan amount'){
 if(!state)return;
 const p=state.purchase;
 $('#originalLoanTitle').textContent=title;
 $('#originalLoanBody').innerHTML='<div class="service-detail-meta"><span>Original financing</span><strong>'+money(p.principal)+'</strong></div><p class="footnote">Original financed amount from the supporting documents. Open Loan & purchase for repayment terms and logged payments. This amount is not the current bank balance.</p><section><h3>Purchase breakdown</h3><dl class="rows">'+[['On-road price, without insurance',p.onRoad],['Insurance quoted',p.insurance],['Total purchase price',p.onRoad+p.insurance],['Purchase rebate (already included)',p.rebate],['Booking fee stated in order',p.booking],['Customer balance in order',p.customerDue],['Deposit receipt',p.depositPaid],['Dealer final payment receipt',p.dealerReceipt]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+money(value)+'</dd></div>').join('')+'</dl></section>'+p.notes.map(note=>'<p class="callout">'+esc(note)+'</p>').join('')+(p.documents.length?'<section><h3>Supporting documents</h3><div class="sources">'+sourceLinks(p.documents)+'</div></section>':'')+'<div class="profile-actions"><button class="secondary" data-view="loan">See loan & purchase ↗</button></div>';
 if(view==='loan')$('#originalLoanBody .profile-actions').remove();
 $('#originalLoanDetails').showModal();$('#originalLoanBody').scrollTop=0;
}
function nextServiceRow(){
 const s=serviceStatus(state,today());
 const due=[state.nextService.date?date(state.nextService.date):null,state.nextService.mileage==null?null:number(state.nextService.mileage)+' km'].filter(Boolean).join(' or ')||'Schedule not provided';
 const days=s.days==null?null:s.days<0?number(-s.days)+' days overdue':s.days===0?'Due today':number(s.days)+' days away';
 const distance=s.km==null?null:s.km<0?number(-s.km)+' km past target':s.km===0?'Mileage target reached':number(s.km)+' km to target';
 const remaining=[days,distance].filter(Boolean).join(' · ')||'Add your workshop’s date or mileage target';
 return '<button class="maintenance-next" type="button" data-action="next-service" aria-haspopup="dialog"><span class="maintenance-next-icon">'+icon('calendar')+'</span><span class="maintenance-next-main"><span class="maintenance-next-top"><span>Next service</span><span class="pill '+(s.days==null&&s.km==null?'':s.tone)+'">'+s.label+'</span></span><strong>'+due+'</strong><small>'+remaining+'</small></span><span class="maintenance-next-arrow" aria-hidden="true">›</span></button>';
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
function renderLoanSnapshotDetails(){
 const loan=loanTotals(state);
 $('#loanSnapshotBody').innerHTML='<dl class="rows"><div><dt>Original loan amount</dt><dd>'+money(state.purchase.principal)+'</dd></div>'+loanTermsRows(state.loan)+'</dl><section><h3>Repayment tracking</h3><dl class="rows"><div><dt>Total scheduled instalments</dt><dd>'+money(loan.scheduled)+'</dd></div><div><dt>Repayments logged</dt><dd>'+money(loan.paid)+'</dd></div><div><dt>Unlogged scheduled amount</dt><dd>'+money(loan.remaining)+'</dd></div></dl>'+loanScheduleNote(state.loan)+'</section>'+loanSources(state.loan)+'<div class="profile-actions"><button data-edit="loan" class="secondary">Edit loan details ↗</button>'+(view!=='loan'?'<button data-view="loan" class="text-button">See loan & purchase ↗</button>':'')+'</div>';
}
function openLoanSnapshot(){
 if(!state)return;
 renderLoanSnapshotDetails();
 $('#loanSnapshotBody').scrollTop=0;$('#loanSnapshotDetails').showModal();
}
function repaymentRow(p,compact=false){
 const content='<span><strong>'+date(p.date)+'</strong><small>'+esc(p.note||'Bank repayment')+'</small></span><strong>'+money(p.amount)+'</strong>';
 return compact?'<button class="loan-payment-row" type="button" data-action="loan-payments" aria-haspopup="dialog">'+content+'<span aria-hidden="true">›</span></button>':'<div class="loan-payment-row full">'+content+'</div>';
}
function renderLoanPaymentsDetails(){
 const payments=[...state.payments].sort((a,b)=>b.date.localeCompare(a.date));
 $('#loanPaymentsBody').innerHTML='<div class="service-detail-meta"><span>'+number(payments.length)+' '+(payments.length===1?'payment':'payments')+' logged</span><strong>'+money(loanTotals(state).paid)+'</strong></div><p class="footnote">Your record of bank repayments. Dealer purchase receipts are separate.</p>'+(payments.length?'<div class="loan-payments-list">'+payments.map(p=>repaymentRow(p)).join('')+'</div>':empty('No payments logged','Add a bank repayment to start your history.'))+'<div class="profile-actions"><button class="primary" data-edit="payment">＋ Record a payment</button></div>';
}
function openLoanPayments(){
 if(!state)return;
 renderLoanPaymentsDetails();$('#loanPaymentsBody').scrollTop=0;$('#loanPaymentsDetails').showModal();
}
function renderLoan(loan){
 const l=state.loan,p=state.purchase,payments=[...state.payments].sort((a,b)=>b.date.localeCompare(a.date));
 const term=l.months==null?'Term not provided':number(l.months)+' months';
 const rateType=l.rateType==='variable'?'Variable rate':l.rateType==='fixed'?'Fixed rate':'';
 return `<div class="loan-dashboard">
  <header class="loan-heading pictured-heading"><div><p class="eyebrow">THE FINANCIAL PICTURE</p><h1>Loan & purchase</h1></div><button class="secondary" data-edit="loan" aria-label="Edit loan details">${icon('options')} Edit</button><p>Your payment plan and purchase records.</p>${dashboardPicture('loan')}</header>
  <div class="loan-plan">
   <button class="loan-instalment" type="button" data-action="loan-snapshot" aria-haspopup="dialog"><span class="loan-lender"><span>${esc(l.lender||'Lender not provided')}</span><span class="pill">${term}</span></span><span class="loan-monthly-label">Monthly instalment</span><strong class="loan-monthly">${money(l.monthly)}${l.monthly==null?'':'<small>/ month</small>'}</strong><span class="loan-plan-bottom"><small>${l.finalInstalment==null?esc(rateType||'From your lender’s terms'):'Final instalment '+money(l.finalInstalment)}</small><span>Loan details ${icon('arrow')}</span></span></button>
   <section class="loan-summary" aria-label="Financing summary">
    <div class="loan-totals"><button type="button" data-action="original-loan" aria-haspopup="dialog"><span>Original loan</span><strong>${money(p.principal)}</strong><small>Original financing</small></button><button type="button" data-action="loan-payments" aria-haspopup="dialog"><span>Repayments logged</span><strong>${money(loan.paid)}</strong><small>${number(payments.length)} ${payments.length===1?'payment':'payments'} added</small></button></div>
    <button class="loan-purchase-link" type="button" data-action="purchase-details" aria-haspopup="dialog"><span class="loan-document-icon">${icon('document')}</span><span><strong>Purchase breakdown</strong><small>Price, receipts & original PDFs</small></span><span aria-hidden="true">›</span></button>
   </section>
   <p class="loan-balance-note">Recorded amounts, not a current bank balance.</p>
  </div>
  <section class="loan-history" aria-labelledby="loanRepaymentTitle"><div class="section-title"><h2 id="loanRepaymentTitle">Repayment log</h2><button class="primary" data-edit="payment">＋ Record payment</button></div>${payments.length?'<div class="loan-payments-list">'+payments.slice(0,3).map(p=>repaymentRow(p,true)).join('')+'</div><button class="loan-history-link text-button" type="button" data-action="loan-payments" aria-haspopup="dialog">View all '+number(payments.length)+' '+(payments.length===1?'payment':'payments')+icon('arrow')+'</button>':'<div class="loan-empty"><span class="loan-empty-icon">'+icon('calendar')+'</span><div><strong>No payments logged</strong><p>Add a bank repayment to start your history.</p></div></div>'}<p class="loan-history-note">Bank repayments only. Dealer receipts stay in Purchase breakdown.</p></section>
 </div>`;
}
function serviceRow(s){
 return '<button class="service-row" type="button" data-service="'+esc(s.id)+'" aria-haspopup="dialog"><span class="service-row-main"><span class="service-row-date">'+date(s.date)+' · '+number(s.mileage)+' km</span><strong>'+esc(s.title)+'</strong></span><strong class="service-row-cost">'+money(s.cost)+'</strong><span class="service-row-arrow" aria-hidden="true">›</span></button>';
}
function renderTips(){
 const intro='<header class="tips-heading pictured-heading"><div><p class="eyebrow">GET TO KNOW YOUR CAR</p><h1>Car tips</h1></div><p>Your saved notes and reference photos.</p>'+dashboardPicture('tips')+'</header>';
 if(tipsUnavailable)return intro+empty('Tips are unavailable','Use Refresh to try again when you’re connected.');
 return intro+(tips.length?'<div class="tip-list">'+tips.map(t=>'<button class="tip-row" type="button" data-tip="'+esc(t.id)+'" aria-haspopup="dialog"><img class="tip-thumbnail" src="'+tipPhotoUrl(t)+'" alt="" width="60" height="76" loading="lazy"><span><small>'+esc(t.category)+'</small><strong>'+esc(t.title)+'</strong><span>'+esc(t.summary)+'</span></span><span class="service-row-arrow" aria-hidden="true">›</span></button>').join('')+'</div>':empty('No tips saved yet','Your car reference photos and notes will appear here.'));
}
function openTip(id){
 const tip=tips.find(t=>t.id===id);if(!tip)return;
 $('#tipTitle').textContent=tip.title;$('#tipCategory').textContent=tip.category;
 $('#tipBody').innerHTML='<p>'+esc(tip.summary)+'</p><button class="tip-photo-preview" type="button" data-tip-photo="'+esc(tip.id)+'"><img src="'+tipPhotoUrl(tip)+'" alt="'+esc(tip.title)+' — reference photo" width="'+tip.image.width+'" height="'+tip.image.height+'"><span>Enlarge photo ↗</span></button><section><h3>Reference note</h3>'+tip.notes.map(note=>'<p>'+esc(note)+'</p>').join('')+'</section><p class="footnote">Owner-provided reference · Saved '+date(tip.createdAt)+'</p>';
 $('#tipBody').scrollTop=0;$('#tipDetails').showModal();
}
function renderMaintenance(total,sorted){
 const v=state.vehicle;
 return `<div class="maintenance-dashboard">
  <header class="maintenance-heading pictured-heading"><div><p class="eyebrow">THE CARE JOURNAL</p><h1>Maintenance</h1></div><button class="primary" data-edit="service"><span aria-hidden="true">＋</span> Log service</button><p>Your service history and next visit.</p>${dashboardPicture('maintenance')}</header>
  ${nextServiceRow()}
  <section class="maintenance-summary" aria-label="Maintenance summary">
   <button class="maintenance-totals" type="button" data-action="maintenance-recorded" aria-haspopup="dialog"><span><span>Total recorded</span><strong>${money(total)}</strong></span><span><span>Service visits</span><strong>${number(state.services.length)}</strong></span><span class="maintenance-summary-arrow" aria-hidden="true">›</span></button>
   <button class="maintenance-mileage" type="button" data-edit="vehicle" aria-haspopup="dialog"><span class="maintenance-mileage-icon">${icon('car')}</span><span><strong>${number(v.odometer)} km recorded</strong><small>As at ${date(v.odometerDate)}</small></span><span class="maintenance-mileage-action">Update ${icon('arrow')}</span></button>
  </section>
  <section class="maintenance-history" aria-labelledby="maintenanceHistoryTitle"><div class="section-title"><h2 id="maintenanceHistoryTitle">Service history</h2><span>Newest first</span></div>${sorted.length?'<div class="service-list">'+sorted.map(serviceRow).join('')+'</div>':empty('No services recorded yet','Log a service to start your maintenance history.')}</section>
 </div>`;
}
function renderOverview(total,loan){
 const v=state.vehicle,month=today().slice(0,7),fuel=fuelSummary(state.fuelEntries||[],month);
 const metric=(label,value,copy='',attributes='')=>{const tag=attributes?'button':'div';return '<'+tag+' class="overview-section-metric"'+(attributes?' type="button" '+attributes:'')+'><span>'+esc(label)+(copy?'<small>'+esc(copy)+'</small>':'')+'</span><strong>'+esc(value)+'</strong></'+tag+'>';};
 const pictureCard=(kind,title,copy,attributes,footer)=>'<section class="overview-section-card section-'+kind+'" aria-labelledby="overview-'+kind+'-title"><button class="overview-section-photo" type="button" '+attributes+' aria-label="Open '+esc(title)+' details"><img src="/assets/dashboard-'+kind+'.webp" alt="" width="1536" height="1024" loading="lazy" decoding="async"></button><div class="overview-section-caption"><div><h2 id="overview-'+kind+'-title">'+esc(title)+'</h2><p>'+esc(copy)+'</p></div><button class="vehicle-details" type="button" '+attributes+' aria-label="'+esc(title)+' details">Details '+icon('arrow')+'</button></div><div class="overview-section-footer">'+footer+'</div></section>';
 return `<div class="overview">
  <header class="overview-heading"><div><p class="eyebrow">PIKA · MY GARAGE</p><h1>Your garage</h1></div><div class="overview-heading-actions"><button class="secondary" type="button" data-view="car" aria-label="My car">${icon('car')}<span>My car</span></button><button class="secondary" type="button" data-view="options">${icon('options')} Options</button></div><p>Your car, your records, one place.</p></header>
  <section class="vehicle-card" aria-labelledby="overviewVehicleTitle">
   <button class="vehicle-photo" type="button" data-action="car-profile" aria-label="Open car profile" aria-haspopup="dialog"><img src="/assets/dashboard-overview.webp" alt="Red Mica crossover in a garage setting — illustration" width="1536" height="1024" fetchpriority="high" decoding="async"><span class="registration" aria-hidden="true">${esc(v.plate||'Your car')}</span></button>
   <div class="vehicle-caption"><div><h2 id="overviewVehicleTitle">${esc(v.name)}</h2><p>${esc(v.model)}</p></div><button class="vehicle-details" type="button" data-action="car-profile" aria-label="Car details" aria-haspopup="dialog">Details ${icon('arrow')}</button></div>
   <div class="vehicle-card-bottom"><div><span>Recorded mileage</span><small>As at ${date(v.odometerDate)}</small></div><strong>${number(v.odometer)} <small>km</small></strong></div>
  </section>
  <div class="overview-actions" role="group" aria-label="Quick actions"><button class="primary" data-edit="service">${icon('service')} Log service</button><button class="secondary" data-edit="fuel">${icon('fuel')} Log fill-up</button><button class="secondary" data-edit="vehicle">${icon('car')} Update mileage</button></div>
  <div class="overview-sections" role="group" aria-label="Your dashboards">
   ${pictureCard('maintenance','Maintenance','Your service history and next visit.','data-view="maintenance"',metric('Recorded cost',money(total),number(state.services.length)+' service '+(state.services.length===1?'visit':'visits'),'data-action="maintenance-recorded" aria-haspopup="dialog"')+nextServiceRow())}
   ${pictureCard('fuel','Fuel this month',monthLabel(month),'data-view="fuel" data-current-fuel',metric('Fuel spent',money(fuel.total),number(fuel.count)+' '+(fuel.count===1?'fill-up':'fill-ups')+' recorded','data-view="fuel" data-current-fuel')+(fuel.average==null?'':metric('Average per fill-up',money(fuel.average))))}
   ${pictureCard('loan','Loan & purchase',state.loan.lender||'Your purchase and repayment records.','data-view="loan"',metric('Monthly instalment',money(state.loan.monthly),state.loan.months==null?'':number(state.loan.months)+' months','data-action="loan-snapshot" aria-haspopup="dialog"')+metric('Original loan amount',money(state.purchase.principal),'Original financing','data-action="original-loan" aria-haspopup="dialog"')+metric('Repayments logged',money(loan.paid),number(state.payments.length)+' '+(state.payments.length===1?'payment':'payments'),'data-action="loan-payments" aria-haspopup="dialog"'))}
   ${pictureCard('tips','Car tips','Your saved notes and reference photos.','data-view="tips"',metric('Saved tips',tipsUnavailable?'Unavailable':number(tips.length)+' '+(tips.length===1?'tip':'tips'),tipsUnavailable?'Refresh to try again':'Open a tip for its full reference.','data-view="tips"'))}
  </div>
  <div class="overview-paperwork"><button type="button" data-view="documents">${icon('document')}<span><strong>Document library</strong><small>${number(documents.length)} original PDFs</small></span>${icon('arrow')}</button><button class="text-button" data-edit="upload">Add a PDF ＋</button></div>
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
 const activeTab=['car','options','documents'].includes(view)?'overview':view;
 document.querySelectorAll('.sidebar nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===activeTab);b.setAttribute('aria-current',b.dataset.view===activeTab?'page':'false');});
 $('#breadcrumb').textContent='Your garage / '+navLabels[view];
 $('#syncStatus').textContent='Saved '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date(revision));
 let content='';
 if(view==='fuel')content=renderFuel();
 if(view==='tips')content=renderTips();
 if(view==='overview'){
  content=renderOverview(total,loan);
 }
 if(view==='maintenance'){
  content=renderMaintenance(total,sorted);
 }
 if(view==='loan'){
  content=renderLoan(loan);
 }
 if(view==='options'){
  content='<button class="text-button back-button" data-view="overview" type="button">← Back to Overview</button>'+heading('MAKE IT YOURS','Options','Choose your appearance and find your documents.')+
  '<section class="card options-section"><p class="eyebrow">APP UPDATES</p><h2>Always up to date.</h2><p>New versions load automatically. Updates wait while you’re editing or viewing a photo or PDF.</p></section>'+
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
  content='<button class="text-button back-button" data-view="overview" type="button">← Back to Overview</button>'+heading('YOUR GARAGE','Car details','Keep the mileage current for useful service reminders.','<button class="primary" data-edit="vehicle">Edit car details ↗</button>')+
  '<section class="card"><p class="eyebrow">VEHICLE PROFILE</p><h2>'+esc(v.name)+'</h2><dl class="rows">'+[['Model',v.model],['Registration',v.plate],['Colour',v.colour],['VIN',v.vin],['Last recorded mileage',number(v.odometer)+' km'],['Mileage recorded on',date(v.odometerDate)]].map(([k,val])=>'<div><dt>'+k+'</dt><dd>'+esc(val)+'</dd></div>').join('')+'</dl></section>'+
  '<section class="card spaced"><h2>Your data, together.</h2><p>This garage is public. Anyone with the link can view and update the records. Changes save across devices. Use Refresh to load the latest records.</p><button class="secondary" data-action="export">Export a JSON backup ↓</button><p class="footnote">The backup includes summaries, repayment records, tips and document metadata. Open original PDFs from Options → Document library and photos from Car tips.</p></section>';
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
function fuelRow(entry){
 return '<button class="service-row" type="button" data-fuel="'+esc(entry.id)+'" aria-haspopup="dialog"><span class="service-row-main"><span class="service-row-date">'+date(entry.date)+'</span><strong>'+esc(entry.station)+'</strong></span><strong class="service-row-cost">'+money(entry.cost)+'</strong><span class="service-row-arrow" aria-hidden="true">›</span></button>';
}
function renderFuelDetails(){
 const entry=(state.fuelEntries||[]).find(e=>e.id===fuelDetailsId);
 if(!entry){$('#fuelDetails').close();return false;}
 const decimal=n=>new Intl.NumberFormat('en-MY',{maximumFractionDigits:3}).format(n);
 $('#fuelDetailsTitle').textContent=entry.station;
 $('#fuelDetailsBody').innerHTML='<div class="service-detail-meta"><span>'+date(entry.date)+'</span><strong>'+money(entry.cost)+'</strong></div>'+((entry.litres!=null||entry.odometer!=null||entry.fullTank)?'<dl class="rows">'+(entry.litres!=null?'<div><dt>Litres</dt><dd>'+decimal(entry.litres)+' L</dd></div>':'')+(entry.odometer!=null?'<div><dt>Odometer</dt><dd>'+number(entry.odometer)+' km</dd></div>':'')+(entry.fullTank?'<div><dt>Tank</dt><dd>Filled to full</dd></div>':'')+'</dl>':'')+(entry.notes?'<section><h3>Notes / source</h3><p class="preline">'+esc(entry.notes)+'</p></section>':'')+'<div class="profile-actions"><button class="secondary" type="button" data-fuel-edit="'+esc(entry.id)+'">Edit fill-up ↗</button></div>';
 return true;
}
function openFuelDetails(id){
 fuelDetailsId=id;
 if(renderFuelDetails()){$('#fuelDetailsBody').scrollTop=0;$('#fuelDetails').showModal();}
}
function openFuelSpending(){
 const entries=state.fuelEntries||[],months=fuelMonths(entries);
 if(fuelMonth!=='all'&&fuelMonth&&!months.includes(fuelMonth))months.unshift(fuelMonth);
 const total=fuelSummary(entries),maxSpend=Math.max(1,...months.map(m=>fuelSummary(entries,m).total));
 const row=(month,summary)=>'<button class="fuel-month" type="button" data-fuel-month="'+month+'" aria-pressed="'+(fuelMonth===month)+'"><span><strong>'+monthLabel(month)+'</strong><small>'+number(summary.count)+' '+(summary.count===1?'fill-up':'fill-ups')+'</small></span><strong>'+money(summary.total)+'</strong><span class="service-row-arrow" aria-hidden="true">›</span>'+(month==='all'?'':'<meter min="0" max="'+maxSpend+'" value="'+summary.total+'" aria-label="'+monthLabel(month)+' fuel spending"></meter>')+'</button>';
 $('#fuelSpendingBody').innerHTML='<p class="footnote">Choose a month to see its fill-ups. Spending uses transaction dates.</p><div class="fuel-months">'+row('all',total)+months.map(m=>row(m,fuelSummary(entries,m))).join('')+'</div>';
 $('#fuelSpendingBody').scrollTop=0;$('#fuelSpendingDetails').showModal();
}
function renderFuel(){
 const entries=state.fuelEntries||[],months=fuelMonths(entries);
 // The Overview shortcut can open the current month before its first fill-up.
 if(fuelMonth===today().slice(0,7)&&!months.includes(fuelMonth))months.unshift(fuelMonth);
 if(!fuelMonth || (fuelMonth!=='all'&&!months.includes(fuelMonth)))fuelMonth=months[0]||'all';
 const summary=fuelSummary(entries,fuelMonth),selected=entries.filter(e=>fuelMonth==='all'||e.date.startsWith(fuelMonth+'-')).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return `<div class="fuel-dashboard">
  <header class="fuel-heading pictured-heading"><div><p class="eyebrow">EVERY FILL, IN VIEW</p><h1>Fuel</h1></div><button class="primary" data-edit="fuel">＋ Log fill-up</button><p>Your fuel spending and fill-up history.</p>${dashboardPicture('fuel')}</header>
  <section class="fuel-summary" aria-label="Fuel spending summary"><div class="fuel-summary-main"><div class="fuel-summary-top"><span>Fuel spent</span><label class="fuel-period"><span>Show month</span><select id="fuelMonth"><option value="all"${fuelMonth==='all'?' selected':''}>All months</option>${months.map(m=>'<option value="'+m+'"'+(fuelMonth===m?' selected':'')+'>'+monthLabel(m)+'</option>').join('')}</select></label></div><strong class="fuel-spend">${money(summary.total)}</strong><dl class="fuel-summary-stats"><div><dt>Fill-ups</dt><dd>${number(summary.count)}</dd></div><div><dt>Average per fill-up</dt><dd>${summary.average==null?'—':money(summary.average)}</dd></div></dl></div><button class="fuel-breakdown" type="button" data-action="fuel-spending" aria-haspopup="dialog"><span>${icon('calendar')} Monthly breakdown</span><span aria-hidden="true">›</span></button></section>
  <section class="fuel-history" aria-labelledby="fuelHistoryTitle"><div class="section-title"><h2 id="fuelHistoryTitle">Fill-up history</h2><span>Newest first</span></div>${selected.length?'<div class="service-list">'+selected.map(fuelRow).join('')+'</div>':empty(entries.length?'No fill-ups this month':'No fill-ups yet',entries.length?'Choose another month or log a fill-up.':'Log a fill-up to start your fuel history.')}</section>
 </div>`;
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
 if(type==='loan'){
  title='Loan details';const l=state.loan;
  body='<p>Enter the agreed terms from your lender. Leave unknown fields blank.</p>'+field('Lender','lender',l.lender,'text','maxlength="120"')+field('Monthly instalment (RM)','monthly',l.monthly,'number','min="0.01" max="100000000" step="0.01"')+field('Loan term (months)','months',l.months,'number','min="1" max="600" step="1"')+field('Final instalment (RM, if different)','finalInstalment',l.finalInstalment,'number','min="0" max="100000000" step="0.01"')+field('Stated effective annual rate (%)','rate',l.rate,'number','min="0" max="100" step="0.001"')+'<label>Rate type<select name="rateType">'+[['','Not provided'],['fixed','Fixed'],['variable','Variable']].map(([v,label])=>'<option value="'+v+'"'+((l.rateType||'')===v?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+field('Reference rate in agreement (%)','referenceRate',l.referenceRate,'number','min="0" max="100" step="0.001"')+field('Margin over reference rate (percentage points)','margin',l.margin,'number','min="0" max="100" step="0.001"')+field('Term charges in agreement (RM)','termCharges',l.termCharges,'number','min="0" max="100000000" step="0.01"')+field('Original agreement total (RM)','agreementTotal',l.agreementTotal,'number','min="0" max="100000000" step="0.01"');
 }
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
  if(editing==='loan')next.loan={...next.loan,lender:value('lender'),monthly:n('monthly'),months:n('months'),finalInstalment:n('finalInstalment'),rate:n('rate'),rateType:value('rateType')||null,referenceRate:n('referenceRate'),margin:n('margin'),termCharges:n('termCharges'),agreementTotal:n('agreementTotal')};
  if(editing==='payment')next.payments.push({id:crypto.randomUUID(),date:value('date'),amount:n('amount'),note:value('note')});
  if(editing==='service'){
   next.services.push({id:crypto.randomUUID(),title:value('title'),date:value('date'),mileage:n('mileage'),cost:n('cost'),notes:value('notes'),parts:[],documents:value('document')?[value('document')]:[]});
   if(n('mileage')>=next.vehicle.odometer&&value('date')>=next.vehicle.odometerDate){next.vehicle.odometer=n('mileage');next.vehicle.odometerDate=value('date');}
  }
  if(await save(next))$('#editor').close();
 }catch(error){const box=$('#formError');if(box)box.textContent=error.message;else notify(error.message);}finally{e.target.querySelector('button[type=submit]')?.removeAttribute('disabled');}
});
document.addEventListener('click',async e=>{
 const tipPhoto=e.target.closest('[data-tip-photo]');if(tipPhoto){const tip=tips.find(t=>t.id===tipPhoto.dataset.tipPhoto);if(tip)openTipPhoto(tip);return;}
 const tip=e.target.closest('[data-tip]');if(tip){openTip(tip.dataset.tip);return;}
 const fuelDetails=e.target.closest('[data-fuel]');if(fuelDetails){openFuelDetails(fuelDetails.dataset.fuel);return;}
 const fuel=e.target.closest('[data-fuel-edit]');if(fuel){openEditor('fuel',fuel.dataset.fuelEdit);return;}
 const month=e.target.closest('[data-fuel-month]');if(month){fuelMonth=month.dataset.fuelMonth;$('#fuelSpendingDetails').close();render();$('#fuelMonth').focus({preventScroll:true});return;}
 const service=e.target.closest('[data-service]');if(service){openService(service.dataset.service);return;}
 const pdf=e.target.closest('[data-document]');if(pdf){const file=documents.find(d=>d.id===pdf.dataset.document);if(file)openDocument(file);return;}
 const theme=e.target.closest('[data-theme-choice]');if(theme)window.PikaTheme.set(theme.dataset.themeChoice);
 const go=e.target.closest('[data-view]');if(go){for(const id of ['loanSnapshotDetails','loanPaymentsDetails','carProfileDetails','maintenanceRecordedDetails','originalLoanDetails','tipDetails','fuelDetails','fuelSpendingDetails']){const popup=document.getElementById(id);if(popup?.open)popup.close();}if(go.hasAttribute('data-current-fuel'))fuelMonth=today().slice(0,7);view=go.dataset.view;render();window.scrollTo({top:0});}
 const edit=e.target.closest('[data-edit]');if(edit)openEditor(edit.dataset.edit);
 const action=e.target.closest('[data-action]')?.dataset.action;
 try{
  if(action==='delete-fuel'&&!busy&&editingFuelId&&confirm('Delete this fill-up from your fuel log?')){const next=structuredClone(state);next.fuelEntries=next.fuelEntries.filter(e=>e.id!==editingFuelId);if(await save(next))$('#editor').close();}
  if(action==='close'&&!busy)$('#editor').close();
  if(action==='close-service')$('#serviceDetails').close();
  if(action==='close-tip')$('#tipDetails').close();
  if(action==='close-fuel')$('#fuelDetails').close();
  if(action==='fuel-spending')openFuelSpending();
  if(action==='close-fuel-spending')$('#fuelSpendingDetails').close();
  if(action==='next-service')openNextService();
  if(action==='close-next-service')$('#nextServiceDetails').close();
  if(action==='loan-snapshot')openLoanSnapshot();
  if(action==='close-loan-snapshot')$('#loanSnapshotDetails').close();
  if(action==='loan-payments')openLoanPayments();
  if(action==='close-loan-payments')$('#loanPaymentsDetails').close();
  if(action==='car-profile')openCarProfile();
  if(action==='close-car-profile')$('#carProfileDetails').close();
  if(action==='maintenance-recorded')openMaintenanceRecorded();
  if(action==='close-maintenance-recorded')$('#maintenanceRecordedDetails').close();
  if(action==='original-loan')openOriginalLoan();
  if(action==='purchase-details')openOriginalLoan('Purchase breakdown');
  if(action==='close-original-loan')$('#originalLoanDetails').close();
  if(action==='refresh'){await load();notify('Latest records loaded');}
  if(action==='export'){
   const blob=new Blob([JSON.stringify({state,documents,tips:tipsUnavailable?null:tips,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
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
 if($('#loanSnapshotDetails').open){renderLoanSnapshotDetails();$('#loanSnapshotDetails [data-edit="loan"]').focus({preventScroll:true});}
 if($('#loanPaymentsDetails').open){renderLoanPaymentsDetails();$('#loanPaymentsDetails [data-edit="payment"]').focus({preventScroll:true});}
 if($('#fuelDetails').open&&renderFuelDetails())$('#fuelDetails [data-fuel-edit]').focus({preventScroll:true});
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
