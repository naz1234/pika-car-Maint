const dialog=document.querySelector('#tipPhotoViewer');
const stage=document.querySelector('#tipPhotoStage');
const photo=document.querySelector('#tipPhoto');
const status=document.querySelector('#tipPhotoStatus');
const retry=document.querySelector('#tipPhotoRetry');
const controls=[...dialog.querySelectorAll('[data-photo-control]')];
let current,zoom=1,baseWidth=0,ready=false,pinch;

export const tipPhotoUrl=tip=>'/api/tips/'+encodeURIComponent(tip.id)+'/image';
function fittedWidth(){
 const style=getComputedStyle(stage);
 const width=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
 const height=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
 return Math.max(1,Math.min(width,height*photo.naturalWidth/photo.naturalHeight));
}
function updateControls(){
 for(const button of controls){
  const action=button.dataset.photoControl;
  button.disabled=!ready||(action==='out'&&zoom<=1)||(action==='in'&&zoom>=3);
  if(action==='fit')button.textContent=Math.round(zoom*100)+'%';
 }
}
function setZoom(next,x,y){
 if(!ready)return;
 const before=photo.getBoundingClientRect(),viewport=stage.getBoundingClientRect();
 x??=viewport.left+stage.clientWidth/2;y??=viewport.top+stage.clientHeight/2;
 const rx=Math.max(0,Math.min(1,(x-before.left)/before.width));
 const ry=Math.max(0,Math.min(1,(y-before.top)/before.height));
 zoom=Math.max(1,Math.min(3,next));photo.style.width=(baseWidth*zoom)+'px';
 const after=photo.getBoundingClientRect();
 stage.scrollLeft+=after.left+rx*after.width-x;
 stage.scrollTop+=after.top+ry*after.height-y;
 updateControls();
}
function loadPhoto(){
 ready=false;zoom=1;pinch=null;photo.style.width='100%';photo.hidden=false;
 status.textContent='Opening photo…';retry.hidden=true;updateControls();
 photo.src=tipPhotoUrl(current);stage.scrollTop=0;stage.scrollLeft=0;
}
export function openTipPhoto(tip){
 current=tip;document.querySelector('#tipPhotoTitle').textContent=tip.title;
 photo.alt=tip.title+' — reference photo';
 dialog.showModal();loadPhoto();
}
photo.addEventListener('load',()=>{
 if(!current||!dialog.open)return;
 ready=true;baseWidth=fittedWidth();photo.style.width=baseWidth+'px';status.textContent='';updateControls();
});
photo.addEventListener('error',()=>{
 if(!current||!dialog.open)return;
 ready=false;photo.hidden=true;status.textContent='Photo unavailable. Check your connection and try again, or use Back to return.';
 retry.hidden=false;updateControls();
});
document.querySelector('#tipPhotoBack').addEventListener('click',()=>dialog.close());
retry.addEventListener('click',()=>{if(current)loadPhoto();});
for(const button of controls)button.addEventListener('click',()=>{
 const action=button.dataset.photoControl;
 if(action==='fit'){baseWidth=fittedWidth();setZoom(1);stage.scrollLeft=0;stage.scrollTop=0;}
 else setZoom(zoom+(action==='in'?0.5:-0.5));
});
const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
stage.addEventListener('touchstart',event=>{
 if(!ready||event.touches.length!==2)return;
 if(event.cancelable)event.preventDefault();pinch={distance:distance(event.touches),zoom};
},{passive:false});
stage.addEventListener('touchmove',event=>{
 if(!pinch||event.touches.length!==2)return;
 if(event.cancelable)event.preventDefault();
 const x=(event.touches[0].clientX+event.touches[1].clientX)/2,y=(event.touches[0].clientY+event.touches[1].clientY)/2;
 if(pinch.distance>0)setZoom(pinch.zoom*distance(event.touches)/pinch.distance,x,y);
},{passive:false});
for(const name of ['touchend','touchcancel'])stage.addEventListener(name,()=>{pinch=null;});
dialog.addEventListener('close',()=>{current=null;ready=false;pinch=null;photo.removeAttribute('src');status.textContent='';});
window.addEventListener('resize',()=>{if(ready&&dialog.open){baseWidth=fittedWidth();setZoom(zoom);}});
