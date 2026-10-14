'use strict';
(()=>{
 const service='https://bali-petrol-traffic.honeymooninbali.workers.dev',auth='https://bali-cinema-owner-refresh.honeymooninbali.workers.dev',owner=window.PetrolOwner;
 let verified=false,pending=false,budget={remainingChecks:50,stationNextAt:{}},progress=null,scopeVersion=0,gmap=null,gmarkers=[],lines=[],auto=false,autoNextAt=0,epoch=0,googleLoading=null;
 const live={active:false,readings:new Map(),controls,refreshStation(id){auto=false;$('auto-refresh').checked=false;return refresh(id);},scopeChanged(){scopeVersion++;auto=false;$('auto-refresh').checked=false;if(!pending&&verified)status('Ready to compare this area.');controls();},focus(s){gmap?.panTo({lat:s.coordinates[1],lng:s.coordinates[0]});gmap?.setZoom(15)},fit(){if(!gmap)return;const list=scopedStations();if(!list.length)return;const bounds=new google.maps.LatLngBounds();list.forEach(s=>bounds.extend({lng:s.coordinates[0],lat:s.coordinates[1]}));gmap.fitBounds(bounds,70)},updateMarkers(){const visible=new Set(scopedStations().map(s=>s.id));gmarkers.forEach(({id,element})=>{const s=stations.find(s=>s.id===id);updateMarker(s,element,visible.has(id),gmap?.getZoom()||0);});lines.forEach(({id,line})=>line.setMap(visible.has(id)?gmap:null));},clear(){live.readings.clear();live.active=false;lines.forEach(({line})=>line.setMap(null));lines=[];$('google-map').hidden=true;$('map').hidden=false;if(dataset){applyChecks();renderList();renderDetail();map?.resize();}updateSnapshot();}};
 window.PetrolLive=live;
 function status(message){$('owner-status').textContent=message;}
 function mode(){return $('refresh-mode').value;}
 function plan(id){return P.refreshPlan(id?stations.filter(s=>s.id===id):scopedStations(),scopeCenter(),budget,id?'area':mode());}
 function limits(data){if(data.stationNextAt)budget.stationNextAt=data.stationNextAt;if(Number.isFinite(data.resetAt))budget.resetAt=data.resetAt;if(Number.isFinite(data.remainingChecks))budget.remainingChecks=data.remainingChecks;}
 function waitLabel(p){return `Recheck in ${Math.max(1,Math.ceil((p.nextAt-Date.now())/60000))} min`;}
 function controls(){
   if(budget.resetAt&&Date.now()>=budget.resetAt)budget={remainingChecks:50,stationNextAt:{}};
   $('owner-login').hidden=verified;$('traffic-refresh').hidden=!verified;$('owner-logout').hidden=!owner.get();$('auto-wrap').hidden=!verified;
   $('owner-login').textContent=owner.get()?'Retry connection':'Sign in with GitHub';
   const p=plan(),count=p.targets.length;
   $('traffic-refresh').disabled=pending||!verified||!count;
   $('traffic-refresh').textContent=pending?(progress?`Checking ${progress.done}/${progress.total}…`:'Preparing checks…'):!p.total?'No stations here':p.remainingChecks===0?'Daily budget used':!count?waitLabel(p):mode()==='oldest'?`Refresh oldest ${count}`:p.limited?`Refresh next ${count}`:p.cooling?`Refresh remaining ${count}`:`Refresh area · ${count}`;
   $('refresh-summary').textContent=!verified?`Sign in to refresh all ${p.total} stations here, or choose the oldest checks.`:p.remainingChecks===0?'More checks after midnight in Bali.':!p.total?'Choose another area or search.':!count?'These stations were checked recently. Other areas can be checked now.':mode()==='oldest'?'Unchecked stations first, then the oldest readings.':p.limited?`The daily budget allows ${count} of ${p.eligible} due stations now.`:p.cooling?`${p.cooling} checked recently; ${count} can be checked now.`:`One click checks all ${count} stations. No wait between stations.`;
   $('check-budget').hidden=!verified;$('check-budget').textContent=`${p.remainingChecks} station checks left today`;
   const button=$('refresh-station');if(button){const one=plan(button.dataset.id);button.hidden=!verified;button.disabled=pending||!one.targets.length;button.textContent=pending?'Checking traffic…':one.remainingChecks===0?'Daily budget used':one.targets.length?'Refresh this station':waitLabel(one);}
 }
 async function request(path,method='GET',body={}){
   const response=await fetch(service+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+owner.get(),...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
   const data=await response.json();if(!response.ok){limits(data);if(response.status===401||response.status===403){verified=false;owner.clear();live.clear();}throw Error(data.error||'Could not connect.');}return data;
 }
 function loadGoogle(key){
   if(window.google?.maps?.Map)return Promise.resolve();if(googleLoading)return googleLoading;
   googleLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');window.petrolGoogleReady=resolve;window.gm_authFailure=()=>{googleLoading=null;reject(Error('Google map access could not be verified.'));};script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback=petrolGoogleReady&v=weekly';script.async=true;script.onerror=()=>{googleLoading=null;reject(Error('Google map could not load. Please retry.'));};document.head.appendChild(script);});return googleLoading;
 }
 function initGoogle(){
   if(gmap)return;
   gmap=new google.maps.Map($('google-map'),{center:{lat:-8.787,lng:115.201},zoom:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'greedy',zoomControlOptions:{position:google.maps.ControlPosition.RIGHT_CENTER}});
   class Pin extends google.maps.OverlayView{
     constructor(s){super();this.s=s;this.element=document.createElement('button');this.element.className='map-pin google-pin';this.element.dataset.side=s.id==='bypass-27'?'left':'right';this.element.innerHTML=`<span class="pin-number">${s.number}</span><span class="pin-caption"></span>`;this.element.addEventListener('click',()=>selectStation(s.id,true,true));this.setMap(gmap);}
     onAdd(){this.getPanes().overlayMouseTarget.appendChild(this.element);google.maps.OverlayView.preventMapHitsFrom(this.element);}
     draw(){const p=this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(this.s.coordinates[1],this.s.coordinates[0]));this.element.style.left=p.x+'px';this.element.style.top=p.y+'px';}
     onRemove(){this.element.remove();}
   }
   gmarkers=stations.map(s=>{const pin=new Pin(s);return {id:s.id,element:pin.element,pin};});
   gmap.addListener('zoom_changed',()=>live.updateMarkers());
 }
 function showGoogle(){$('google-map').hidden=false;initGoogle();live.active=true;$('map').hidden=true;$('map-error').hidden=true;live.fit();live.updateMarkers();}
 function drawTraffic(){lines.forEach(({line})=>line.setMap(null));lines=[];for(const data of live.readings.values())for(const segment of data.segments||[]){lines.push({id:data.id,line:new google.maps.Polyline({map:gmap,path:[segment.from,segment.to].map(p=>({lng:p[0],lat:p[1]})),strokeColor:{NORMAL:'#40854c',SLOW:'#e8a52e',TRAFFIC_JAM:'#bc4039'}[segment.speed],strokeWeight:5,strokeOpacity:.85,clickable:false,zIndex:1})});}live.updateMarkers();}
 async function connect(){
   if(!owner.get()){status(owner.error||'Only Arthur-Freedom can request live traffic.');controls();return;}
   const generation=++epoch;status('Verifying your GitHub account…');
   try{const data=await request('/api/session');if(generation!==epoch)return;limits(data);verified=true;await loadGoogle(data.mapsKey);await window.petrolReady;if(generation!==epoch)return;showGoogle();status('Signed in as Arthur-Freedom.');}
   catch(error){verified=false;status(error.message);}finally{controls();}
 }
 async function refresh(id){
   if(!verified||pending||!plan(id).targets.length)return;
   pending=true;progress=null;autoNextAt=Date.now()+15*60000;controls();status('Checking the available refresh budget…');const generation=epoch,scope=scopeVersion;
   try{
     // Synchronize limits across devices before making any paid calls.
     const session=await request('/api/session');if(generation!==epoch||scope!==scopeVersion)return;limits(session);
     const current=plan(id);progress={done:0,total:current.targets.length};let success=0;
     if(!current.targets.length){status('These stations were checked recently, or today’s budget is used.');return;}
     for(const batch of current.batches){
       if(generation!==epoch||scope!==scopeVersion||(auto&&document.hidden))break;
       controls();status(`Checking traffic · ${progress.done} of ${progress.total} stations completed…`);
       const data=await request('/api/refresh','POST',{stationIds:batch.map(s=>s.id)});if(generation!==epoch)return;limits(data);
       for(const reading of data.stations){if(!reading.error){live.readings.set(reading.id,reading);success++;}else{const previous=live.readings.get(reading.id);if(previous)previous.refreshFailed=true;else live.readings.set(reading.id,{id:reading.id,refreshFailed:true});}}
       progress.done+=batch.length;applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();
     }
     if(generation===epoch)status(`${success} of ${progress.done} stations updated.${progress.done>success?' Unavailable readings keep their original times.':''}${scope!==scopeVersion?' Area changed; remaining checks stopped.':''}`);
   }catch(error){auto=false;$('auto-refresh').checked=false;status(error.message);}finally{pending=false;progress=null;autoNextAt=Date.now()+15*60000;controls();}
 }
 $('owner-login').addEventListener('click',()=>{if(owner.get()){connect();return;}location.href=auth+'/auth/login?return='+encodeURIComponent('https://arthur-freedom.github.io/bali-petrol-map/');});
 $('traffic-refresh').addEventListener('click',()=>refresh());
 $('refresh-mode').addEventListener('change',()=>live.scopeChanged());
 $('auto-refresh').addEventListener('change',()=>{auto=$('auto-refresh').checked;if(auto)refresh();});
 $('owner-logout').addEventListener('click',async()=>{
   const handle=owner.get();++epoch;verified=false;auto=false;$('auto-refresh').checked=false;owner.clear();live.clear();controls();status('Signing out…');
   try{const r=await fetch(auth+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+handle,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();status('Signed out. Live traffic is locked.');}catch{status('Signed out on this device. Server revocation could not be confirmed; retry signing in and out when connected.');}
 });
 addEventListener('owner-session-change',()=>{++epoch;verified=false;live.clear();connect();});
 setInterval(()=>{controls();if(auto&&verified&&!document.hidden&&Date.now()>=autoNextAt&&plan().targets.length)refresh();},15000);
 document.addEventListener('visibilitychange',()=>{if(auto&&verified&&!document.hidden&&Date.now()>=autoNextAt&&plan().targets.length)refresh();});
 connect();
})();
