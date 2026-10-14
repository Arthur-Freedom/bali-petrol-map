'use strict';
(()=>{
 const service='https://bali-petrol-traffic.honeymooninbali.workers.dev',auth='https://bali-cinema-owner-refresh.honeymooninbali.workers.dev',owner=window.PetrolOwner;
 let verified=false,pending=false,budget={remainingChecks:50,stationNextAt:{},monthlyLimit:900,remainingMonthlyChecks:900},progress=null,scopeVersion=0,gmap=null,gmarkers=[],lines=[],trafficLayer=null,auto=false,autoNextAt=0,epoch=0,googleLoading=null;
 const requests=new Set();let googleAttempt=0;
 function stopRequests(){for(const controller of requests)controller.abort();requests.clear();}
 function stopAuto(){auto=false;$('auto-refresh').checked=false;}
 function failedReadings(batch){for(const {id} of batch){const previous=live.readings.get(id);live.readings.set(id,{...previous,id,refreshFailed:true});}applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();}
 const live={active:false,readings:new Map(),controls,refreshStation(id){auto=false;$('auto-refresh').checked=false;return refresh(id);},scopeChanged(){scopeVersion++;auto=false;$('auto-refresh').checked=false;if(!pending&&verified)status('Ready to compare this area.');controls();},focus(s){gmap?.panTo({lat:s.coordinates[1],lng:s.coordinates[0]});gmap?.setZoom(15)},fit(){if(!gmap)return;const list=scopedStations();if(!list.length)return;const bounds=new google.maps.LatLngBounds();list.forEach(s=>bounds.extend({lng:s.coordinates[0],lat:s.coordinates[1]}));gmap.fitBounds(bounds,70)},updateMarkers(){const visible=new Set(scopedStations().map(s=>s.id));gmarkers.forEach(({id,element})=>{const s=stations.find(s=>s.id===id);updateMarker(s,element,visible.has(id),gmap?.getZoom()||0);});lines.forEach(({id,line})=>line.setMap(visible.has(id)&&id===selected?gmap:null));},clear(){live.readings.clear();live.active=false;lines.forEach(({line})=>line.setMap(null));lines=[];$('google-map').hidden=true;$('map').hidden=false;trafficLayer?.setMap(null);$('road-legend').hidden=true;$('map-layer-title').textContent='PETROL LOCATIONS';$('map-layer-note').textContent='Sign in to see Google road traffic. Petrol queues unconfirmed.';if(dataset){applyChecks();renderList();renderDetail();map?.resize();}updateSnapshot();}};
 window.PetrolLive=live;
 function status(message){$('owner-status').textContent=message;}
 function mode(){return $('refresh-mode').value;}
 function plan(id){return P.refreshPlan(id?stations.filter(s=>s.id===id):scopedStations(),scopeCenter(),budget,id?'area':mode());}
 function limits(data){if(data.stationNextAt)budget.stationNextAt=data.stationNextAt;if(Number.isFinite(data.resetAt))budget.resetAt=data.resetAt;if(Number.isFinite(data.remainingChecks))budget.remainingChecks=data.remainingChecks;for(const key of ['monthlyLimit','monthlyUsed','remainingMonthlyChecks','monthlyResetAt'])if(Number.isFinite(data[key]))budget[key]=data[key];}
 function waitLabel(p){return `Recheck in ${Math.max(1,Math.ceil((p.nextAt-Date.now())/60000))} min`;}
 function controls(){
   if(budget.resetAt&&Date.now()>=budget.resetAt)budget={...budget,remainingChecks:50,stationNextAt:{},resetAt:0};
   if(budget.monthlyResetAt&&Date.now()>=budget.monthlyResetAt)budget={...budget,remainingMonthlyChecks:budget.monthlyLimit,monthlyResetAt:0};
   $('owner-login').hidden=verified;$('traffic-refresh').hidden=!verified;$('owner-logout').hidden=!owner.get();$('auto-wrap').hidden=!verified;
   $('owner-login').textContent=owner.get()?'Retry connection':'Sign in with GitHub';
   const p=plan(),count=p.targets.length;
   $('traffic-refresh').disabled=pending||!verified||!count;
   $('traffic-refresh').textContent=pending?(progress?`Checking ${progress.done}/${progress.total}…`:'Preparing checks…'):!p.total?'No stations here':p.remainingChecks===0?(budget.remainingMonthlyChecks===0?'Monthly safety limit':'Daily budget used'):!count?waitLabel(p):mode()==='oldest'?`Refresh oldest ${count}`:p.limited?`Refresh next ${count}`:p.cooling?`Refresh remaining ${count}`:`Refresh area · ${count}`;
   $('refresh-summary').textContent=!verified?`Sign in to refresh all ${p.total} stations here, or choose the oldest checks.`:p.remainingChecks===0?(budget.remainingMonthlyChecks===0?'Monthly safety limit reached. More checks next month.':'More checks after midnight in Bali.'):!p.total?'Choose another area or search.':!count?'These stations were checked recently. Other areas can be checked now.':mode()==='oldest'?'Unchecked stations first, then the oldest readings.':p.limited?`The remaining budget allows ${count} of ${p.eligible} due stations now.`:p.cooling?`${p.cooling} checked recently; ${count} can be checked now.`:`One click checks all ${count} stations. No wait between stations.`;
   $('check-budget').hidden=!verified;$('check-budget').textContent=`${budget.remainingChecks} station checks left today · ${50-budget.remainingChecks}/50 used · ${budget.remainingMonthlyChecks}/${budget.monthlyLimit} left this month`;
   const button=$('refresh-station');if(button){const one=plan(button.dataset.id);button.hidden=!verified;button.disabled=pending||!one.targets.length;button.textContent=pending?'Checking traffic…':one.remainingChecks===0?(budget.remainingMonthlyChecks===0?'Monthly safety limit':'Daily budget used'):one.targets.length?'Refresh this station':waitLabel(one);}
 }
 async function request(path,method='GET',body={}){
   const generation=epoch,handle=owner.get(),controller=new AbortController();requests.add(controller);
   const timer=setTimeout(()=>controller.abort(),35000);
   try{
     const response=await fetch(service+path,{method,cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+handle,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
     let data;try{data=await response.json();}catch{throw Error('The traffic service returned an unreadable response. Try again.');}
     if(generation!==epoch||handle!==owner.get())throw Error('Sign-in changed; this request was stopped.');
     if(!data||Array.isArray(data)||typeof data!=='object')throw Error('The traffic service returned an incomplete response. Try again.');
     if(!response.ok){limits(data);if(response.status===401||response.status===403){verified=false;stopAuto();owner.clear();live.clear();}throw Error(typeof data.error==='string'?data.error:'The traffic service is unavailable. Try again shortly.');}
     return data;
   }catch(error){if(controller.signal.aborted)throw Error('The request timed out or was stopped. No automatic retry was made.');if(error instanceof TypeError)throw Error('Connection lost. Check your internet connection and retry.');throw error;}
   finally{clearTimeout(timer);requests.delete(controller);}
 }
 function loadGoogle(key){
   if(window.google?.maps?.Map)return Promise.resolve();if(googleLoading)return googleLoading;
   googleLoading=new Promise((resolve,reject)=>{
     const script=document.createElement('script'),callback='petrolGoogleReady'+(++googleAttempt);let settled=false;
     const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);delete window[callback];if(error){googleLoading=null;script.remove();reject(Error(error));}else resolve();};
     const timer=setTimeout(()=>finish('Google map loading timed out. Retry connection.'),25000);
     window[callback]=()=>finish();
     window.gm_authFailure=()=>{verified=false;stopAuto();live.clear();status('Google map access could not be verified. Retry connection.');controls();finish('Google map access could not be verified.');};
     script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback='+callback+'&v=weekly';script.async=true;script.onerror=()=>finish('Google map could not load. Retry connection.');document.head.appendChild(script);
   });return googleLoading;
 }
 function initGoogle(){
   if(gmap)return;
   gmap=new google.maps.Map($('google-map'),{center:{lat:-8.787,lng:115.201},zoom:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'greedy',zoomControlOptions:{position:google.maps.ControlPosition.RIGHT_CENTER}});
   trafficLayer=new google.maps.TrafficLayer({autoRefresh:true});
   class Pin extends google.maps.OverlayView{
     constructor(s){super();this.s=s;this.element=document.createElement('button');this.element.className='map-pin google-pin';this.element.dataset.side=s.id==='bypass-27'?'left':'right';this.element.innerHTML=`<span class="pin-number">${s.number}</span><span class="pin-caption"></span>`;this.element.addEventListener('click',()=>selectStation(s.id,true,true));this.setMap(gmap);}
     onAdd(){this.getPanes().overlayMouseTarget.appendChild(this.element);google.maps.OverlayView.preventMapHitsFrom(this.element);}
     draw(){const p=this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(this.s.coordinates[1],this.s.coordinates[0]));this.element.style.left=p.x+'px';this.element.style.top=p.y+'px';}
     onRemove(){this.element.remove();}
   }
   gmarkers=stations.map(s=>{const pin=new Pin(s);return {id:s.id,element:pin.element,pin};});
   gmap.addListener('zoom_changed',()=>live.updateMarkers());
 }
 function showGoogle(){$('google-map').hidden=false;initGoogle();trafficLayer.setMap(gmap);$('road-legend').hidden=false;$('map-layer-title').textContent='GOOGLE ROAD TRAFFIC';$('map-layer-note').textContent='Road colours update automatically. Pins reflect route checks; petrol queues are unknown.';live.active=true;$('map').hidden=true;$('map-error').hidden=true;live.fit();live.updateMarkers();}
 function drawTraffic(){lines.forEach(({line})=>line.setMap(null));lines=[];for(const data of live.readings.values())for(const segment of data.segments||[]){lines.push({id:data.id,line:new google.maps.Polyline({map:gmap,path:[segment.from,segment.to].map(p=>({lng:p[0],lat:p[1]})),strokeColor:'#285cab',strokeWeight:2,strokeOpacity:0,icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:.8,strokeWeight:2,scale:1.5},offset:'0',repeat:'14px'}],clickable:false,zIndex:1})});}live.updateMarkers();}
 async function connect(){
   if(!owner.get()){status(owner.error||'Only Arthur-Freedom can request live traffic.');controls();return;}
   const generation=++epoch;verified=false;controls();status('Verifying your GitHub account…');
   try{const data=await request('/api/session');if(generation!==epoch)return;if(data.ownerId!=='18115558'||typeof data.mapsKey!=='string'||!data.mapsKey)throw Error('Owner map access could not be verified. Retry connection.');limits(data);await loadGoogle(data.mapsKey);await window.petrolReady;if(generation!==epoch)return;if(!dataset)throw Error('Station locations could not load. Reload the page to retry.');showGoogle();verified=true;status('Signed in as Arthur-Freedom.');}
   catch(error){if(generation===epoch){verified=false;live.clear();status(error.message);}}finally{controls();}
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
       let data;try{data=await request('/api/refresh','POST',{stationIds:batch.map(s=>s.id)});}catch(error){if(generation===epoch&&verified)failedReadings(batch);throw error;}
       if(generation!==epoch)return;limits(data);
       const readings=Array.isArray(data.stations)?data.stations:[];let incomplete=readings.length!==batch.length;
       for(const station of batch){const matches=readings.filter(r=>r?.id===station.id),reading=matches[0];if(matches.length===1&&P.validReading(reading,station.id)){live.readings.set(reading.id,reading);success++;}else{if(matches.length!==1||typeof reading?.error!=='string'||!reading.error)incomplete=true;const previous=live.readings.get(station.id);live.readings.set(station.id,{...previous,id:station.id,refreshFailed:true});}}
       progress.done+=batch.length;applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();
       if(readings.some(r=>r?.errorCode==='provider_limit')||incomplete){stopAuto();throw Error(readings.some(r=>r?.errorCode==='provider_limit')?'Google’s request limit was reached. Remaining checks stopped.':'The traffic service returned incomplete results. Remaining checks stopped.');}
     }
     if(generation===epoch)status(`${success} of ${progress.done} stations updated.${progress.done>success?' Unavailable readings keep their original times.':''}${scope!==scopeVersion?' Area changed; remaining checks stopped.':''}`);
   }catch(error){if(generation===epoch){stopAuto();status(error.message);}}finally{pending=false;progress=null;autoNextAt=Date.now()+15*60000;controls();}
 }
 $('owner-login').addEventListener('click',()=>{if(owner.get())return connect();location.href=auth+'/auth/login?return='+encodeURIComponent('https://arthur-freedom.github.io/bali-petrol-map/');});
 $('traffic-refresh').addEventListener('click',()=>refresh());
 $('refresh-mode').addEventListener('change',()=>live.scopeChanged());
 $('auto-refresh').addEventListener('change',()=>{auto=$('auto-refresh').checked;if(auto)refresh();});
 $('owner-logout').addEventListener('click',async()=>{
   const handle=owner.get(),generation=++epoch;verified=false;stopAuto();stopRequests();owner.clear();live.clear();controls();status('Signing out…');
   try{const r=await fetch(auth+'/api/logout',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+handle,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();if(generation===epoch)status('Signed out. Live traffic is locked.');}catch{if(generation===epoch)status('Signed out on this device. Server revocation could not be confirmed; retry signing in and out when connected.');}
 });
 addEventListener('owner-session-change',()=>{++epoch;verified=false;stopAuto();stopRequests();live.clear();connect();});
 setInterval(()=>{controls();if(auto&&verified&&!document.hidden&&Date.now()>=autoNextAt&&plan().targets.length)refresh();},15000);
 document.addEventListener('visibilitychange',()=>{if(auto&&verified&&!document.hidden&&Date.now()>=autoNextAt&&plan().targets.length)refresh();});
 connect();
})();
