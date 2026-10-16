/* Rectangle selection supports a drag, two taps, or arrow keys + Enter. */
window.PetrolDraw=({map,surface,box,cursor,status,onComplete,onCancel})=>{
 let active=false,anchor=null,point=null,pointer=null,hadAnchor=false,restore=[];
 const listeners=[];
 const listen=(type,fn,options)=>{surface.addEventListener(type,fn,options);listeners.push([type,fn,options]);};
 const clamp=p=>[Math.max(0,Math.min(surface.clientWidth,p[0])),Math.max(0,Math.min(surface.clientHeight,p[1]))];
 const fromEvent=ev=>{const r=surface.getBoundingClientRect();return clamp([ev.clientX-r.left,ev.clientY-r.top]);};
 function paint(p){
  point=clamp(p);cursor.hidden=false;cursor.style.left=point[0]+'px';cursor.style.top=point[1]+'px';
  if(!anchor)return;
  box.hidden=false;box.style.left=Math.min(anchor[0],point[0])+'px';box.style.top=Math.min(anchor[1],point[1])+'px';
  box.style.width=Math.abs(anchor[0]-point[0])+'px';box.style.height=Math.abs(anchor[1]-point[1])+'px';
 }
 function release(){if(pointer!==null&&surface.hasPointerCapture?.(pointer))surface.releasePointerCapture(pointer);pointer=null;}
 function finish(){active=false;release();surface.hidden=true;box.hidden=true;cursor.hidden=true;anchor=null;for(const handler of restore)handler.enable();restore=[];}
 function commit(){
  if(!anchor||Math.abs(anchor[0]-point[0])<8||Math.abs(anchor[1]-point[1])<8){status.textContent='Choose the opposite corner a little farther away.';return;}
  const a=map.unproject(anchor),b=map.unproject(point),bounds=window.Petrol.rectangle([a.lng,a.lat],[b.lng,b.lat]);
  if(!bounds){status.textContent='That area could not be selected. Try a smaller rectangle.';return;}
  finish();onComplete(bounds);
 }
 listen('pointerdown',ev=>{
  if(!active||ev.button!==0||pointer!==null)return;ev.preventDefault();pointer=ev.pointerId;surface.setPointerCapture(pointer);
  hadAnchor=!!anchor;point=fromEvent(ev);if(!anchor)anchor=point;paint(point);
 });
 listen('pointermove',ev=>{if(active&&(pointer===null||pointer===ev.pointerId))paint(fromEvent(ev));});
 listen('pointerup',ev=>{
  if(!active||pointer!==ev.pointerId)return;ev.preventDefault();paint(fromEvent(ev));release();
  if(hadAnchor||Math.abs(anchor[0]-point[0])>=8&&Math.abs(anchor[1]-point[1])>=8)commit();
  else status.textContent='Now tap the opposite corner. Esc cancels.';
 });
 listen('pointercancel',()=>{release();anchor=null;box.hidden=true;status.textContent='Drag a rectangle, or tap two corners. Esc cancels.';});
 listen('wheel',ev=>{if(active)ev.preventDefault();},{passive:false});
 listen('keydown',ev=>{
  if(!active)return;
  if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();api.cancel();return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){
   ev.preventDefault();const step=ev.shiftKey?40:10;
   paint([point[0]+(ev.key==='ArrowLeft'?-step:ev.key==='ArrowRight'?step:0),point[1]+(ev.key==='ArrowUp'?-step:ev.key==='ArrowDown'?step:0)]);
  }else if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();if(anchor)commit();else{anchor=[...point];paint(point);status.textContent='Move to the opposite corner with arrow keys, then press Enter.';}}
 });
 const api={get active(){return active;},start(){
  if(active)return;map.stop?.();active=true;anchor=null;surface.hidden=false;point=[surface.clientWidth/2,surface.clientHeight/2];
  restore=['dragPan','scrollZoom','boxZoom','keyboard','doubleClickZoom','touchZoomRotate'].map(key=>map[key]).filter(h=>h?.isEnabled());for(const handler of restore)handler.disable();
  status.textContent='Drag a rectangle, or tap two corners. Esc cancels.';surface.focus({preventScroll:true});
 },cancel(){if(!active)return;finish();onCancel();},destroy(){if(active)finish();for(const args of listeners)surface.removeEventListener(...args);}};
 return api;
};
