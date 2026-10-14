'use strict';
(()=>{
 const service='https://bali-petrol-traffic.honeymooninbali.workers.dev',auth='https://bali-cinema-owner-refresh.honeymooninbali.workers.dev',owner=window.PetrolOwner;
 let verified=false,pending=false,nextAt=0,remaining=10,gmap=null,gmarkers=[],lines=[],auto=false,epoch=0,googleLoading=null;
 const live={active:false,readings:new Map(),focus(s){gmap?.panTo({lat:s.coordinates[1],lng:s.coordinates[0]});gmap?.setZoom(15)},fit(){if(!gmap)return;const bounds=new google.maps.LatLngBounds();activeStations().forEach(s=>bounds.extend({lng:s.coordinates[0],lat:s.coordinates[1]}));if(origin)bounds.extend({lng:origin[0],lat:origin[1]});gmap.fitBounds(bounds,90)},updateMarkers(){gmarkers.forEach(({id,element})=>{const s=stations.find(s=>s.id===id),q=signal(s);element.style.display=activeStations().some(s=>s.id===id)?'':'none';element.style.setProperty('--pin',colours[q.tone]);element.querySelector('.pin-caption').textContent=q.wait||q.label;element.setAttribute('aria-label',s.name+', '+q.label);element.setAttribute('aria-pressed',String(selected===id));});},clear(){live.readings.clear();live.active=false;lines.forEach(l=>l.setMap(null));lines=[];$('google-map').hidden=true;$('map').hidden=false;if(dataset){applyChecks();renderList();renderDetail();map?.resize();}updateSnapshot();}};
 window.PetrolLive=live;
 function status(message){$('owner-status').textContent=message;}
 function controls(){
   $('owner-login').hidden=verified;$('traffic-refresh').hidden=!verified;$('owner-logout').hidden=!owner.get();$('auto-wrap').hidden=!verified;
   $('owner-login').textContent=owner.get()?'Retry connection':'Sign in with GitHub';
   const wait=Math.max(0,Math.ceil((nextAt-Date.now())/60000));
   $('traffic-refresh').disabled=pending||wait>0||!verified;
   $('traffic-refresh').textContent=pending?'Checking five stations…':wait>0?`Refresh in ${wait} min`:'Refresh traffic';
 }
 async function request(path,method='GET'){
   const response=await fetch(service+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+owner.get(),...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
   const data=await response.json();if(!response.ok){if(data.nextAt)nextAt=data.nextAt;if(response.status===401||response.status===403){verified=false;owner.clear();live.clear();}throw Error(data.error||'Could not connect.');}return data;
 }
 function loadGoogle(key){
   if(window.google?.maps?.Map)return Promise.resolve();if(googleLoading)return googleLoading;
   googleLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');window.petrolGoogleReady=resolve;window.gm_authFailure=()=>{googleLoading=null;reject(Error('Google map access could not be verified.'));};script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback=petrolGoogleReady&v=weekly';script.async=true;script.onerror=()=>{googleLoading=null;reject(Error('Google map could not load. Please retry.'));};document.head.appendChild(script);});return googleLoading;
 }
 function initGoogle(){
   if(gmap)return;
   gmap=new google.maps.Map($('google-map'),{center:{lat:-8.787,lng:115.201},zoom:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'cooperative',zoomControlOptions:{position:google.maps.ControlPosition.RIGHT_CENTER}});
   class Pin extends google.maps.OverlayView{
     constructor(s){super();this.s=s;this.element=document.createElement('button');this.element.className='map-pin google-pin';this.element.dataset.side=s.id==='bypass-27'?'left':'right';this.element.innerHTML=`<span class="pin-number">${s.number}</span><span class="pin-caption"></span>`;this.element.addEventListener('click',()=>selectStation(s.id,true,true));this.setMap(gmap);}
     onAdd(){this.getPanes().overlayMouseTarget.appendChild(this.element);google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.element);}
     draw(){const p=this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(this.s.coordinates[1],this.s.coordinates[0]));this.element.style.left=p.x+'px';this.element.style.top=p.y+'px';}
     onRemove(){this.element.remove();}
   }
   gmarkers=stations.map(s=>{const pin=new Pin(s);return {id:s.id,element:pin.element,pin};});
   gmap.addListener('click',event=>{if(!choosing)return;origin=[event.latLng.lng(),event.latLng.lat()];writeStorage(ORIGIN,origin);setChoosing(false);updateOrigin();notify('Starting point selected.');});
 }
 function showGoogle(){$('google-map').hidden=false;initGoogle();live.active=true;$('map').hidden=true;$('map-error').hidden=true;live.fit();live.updateMarkers();}
 function drawTraffic(){lines.forEach(l=>l.setMap(null));lines=[];for(const data of live.readings.values())for(const segment of data.segments||[]){lines.push(new google.maps.Polyline({map:gmap,path:[segment.from,segment.to].map(p=>({lng:p[0],lat:p[1]})),strokeColor:{NORMAL:'#40854c',SLOW:'#e8a52e',TRAFFIC_JAM:'#bc4039'}[segment.speed],strokeWeight:5,strokeOpacity:.85,clickable:false,zIndex:1}));}}
 async function connect(){
   if(!owner.get()){status(owner.error||'Only Arthur-Freedom can request live traffic.');controls();return;}
   const generation=++epoch;status('Verifying your GitHub account…');
   try{const data=await request('/api/session');if(generation!==epoch)return;nextAt=data.nextAt;remaining=data.remaining;verified=true;await loadGoogle(data.mapsKey);await window.petrolReady;if(generation!==epoch)return;showGoogle();status('Signed in as Arthur-Freedom · '+remaining+' refreshes left today.');}
   catch(error){verified=false;status(error.message);}finally{controls();}
 }
 async function refresh(){
   if(!verified||pending||Date.now()<nextAt)return;pending=true;controls();status('Measuring traffic on the approaches to all five stations…');const generation=epoch;
   try{
     const data=await request('/api/refresh','POST');if(generation!==epoch)return;nextAt=data.nextAt;remaining=data.remaining;
     let success=0;for(const reading of data.stations){if(!reading.error){live.readings.set(reading.id,reading);success++;}else{const previous=live.readings.get(reading.id);if(previous)previous.refreshFailed=true;}}
     showGoogle();applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();
     status(`${success} of 5 approaches updated · ${remaining} refreshes left today.${success<5?' Unavailable readings are marked; previous readings retain their original time.':''}`);
   }catch(error){status(error.message);}finally{pending=false;controls();}
 }
 $('owner-login').addEventListener('click',()=>{if(owner.get()){connect();return;}location.href=auth+'/auth/login?return='+encodeURIComponent('https://arthur-freedom.github.io/bali-petrol-map/');});
 $('traffic-refresh').addEventListener('click',refresh);
 $('auto-refresh').addEventListener('change',()=>{auto=$('auto-refresh').checked;if(auto)refresh();});
 $('owner-logout').addEventListener('click',async()=>{
   const handle=owner.get();++epoch;verified=false;auto=false;$('auto-refresh').checked=false;owner.clear();live.clear();controls();status('Signing out…');
   try{const r=await fetch(auth+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+handle,'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();status('Signed out. Live traffic is locked.');}catch{status('Signed out on this device. Server revocation could not be confirmed; retry signing in and out when connected.');}
 });
 addEventListener('owner-session-change',()=>{++epoch;verified=false;live.clear();connect();});
 setInterval(()=>{controls();if(auto&&verified&&!document.hidden&&Date.now()>=nextAt)refresh();},15000);
 document.addEventListener('visibilitychange',()=>{if(auto&&verified&&!document.hidden&&Date.now()>=nextAt)refresh();});
 connect();
})();
