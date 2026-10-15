'use strict';
(()=>{
 const service='https://bali-petrol-traffic.honeymooninbali.workers.dev',auth='https://bali-cinema-owner-refresh.honeymooninbali.workers.dev',owner=window.PetrolOwner;
 let verified=false,pending=false,budget={remainingChecks:50,stationNextAt:{},monthlyLimit:900,remainingMonthlyChecks:900},progress=null,scopeVersion=0,auto=false,autoNextAt=0,epoch=0;
 const requests=new Set();
 function stopRequests(){for(const controller of requests)controller.abort();requests.clear();}
 function stopAuto(){auto=false;$('auto-refresh').checked=false;}
 function failedReadings(batch){for(const {id} of batch){const previous=live.readings.get(id);live.readings.set(id,{...previous,id,refreshFailed:true,errorCode:'provider_unavailable'});}applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();}
 const live={active:false,readings:new Map(),controls,refreshStation(id){auto=false;$('auto-refresh').checked=false;return refresh(id);},scopeChanged(){scopeVersion++;auto=false;$('auto-refresh').checked=false;if(!pending&&verified)status('Ready to compare this area.');controls();},updateMarkers(){drawTraffic();},clear(){live.readings.clear();live.active=false;drawTraffic();$('road-legend').hidden=true;$('map-layer-title').textContent='PETROL LOCATIONS';$('map-layer-note').textContent='Sign in to compare nearby road traffic.';if(dataset){applyChecks();renderList();renderDetail();}updateSnapshot();}};
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
 function drawTraffic(){
   if(!map?.isStyleLoaded())return;
   const visible=new Set(scopedStations().map(s=>s.id)),features=[];
   for(const data of live.readings.values()){
     if(!visible.has(data.id)||data.refreshFailed||!P.fresh(data.checkedAt))continue;
     for(const segment of data.segments||[])features.push({type:'Feature',properties:{id:data.id,selected:data.id===selected,color:segment.closed?'#343f49':segment.speed==='TRAFFIC_JAM'?'#b74335':segment.speed==='SLOW'?'#df931c':'#43855c'},geometry:{type:'LineString',coordinates:[segment.from,segment.to]}});
   }
   const data={type:'FeatureCollection',features};
   if(map.getSource('station-traffic'))map.getSource('station-traffic').setData(data);
   else{
     map.addSource('station-traffic',{type:'geojson',data,attribution:'Traffic © <a href="https://www.tomtom.com/" target="_blank" rel="noopener">TomTom</a>'});
     map.addLayer({id:'traffic-outline',type:'line',source:'station-traffic',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['case',['get','selected'],9,6],'line-opacity':.9}});
     map.addLayer({id:'traffic-colours',type:'line',source:'station-traffic',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['case',['get','selected'],6,3],'line-opacity':.95}});
   }
 }
 function showTraffic(){live.active=true;$('road-legend').hidden=false;$('map-layer-title').textContent='NEARBY ROAD TRAFFIC';$('map-layer-note').textContent='250 m around checked stations · refresh updates colours and ranking';drawTraffic();}
 async function connect(){
   if(!owner.get()){status(owner.error||'Only Arthur-Freedom can request live traffic.');controls();return;}
   const generation=++epoch;verified=false;controls();status('Verifying your GitHub account…');
   try{const data=await request('/api/session');if(generation!==epoch)return;if(data.ownerId!=='18115558'||data.provider!=='tomtom-orbis-v2')throw Error('Traffic version changed. Reload this page and reconnect.');limits(data);await window.petrolReady;if(generation!==epoch)return;if(!dataset)throw Error('Station locations could not load. Reload the page to retry.');showTraffic();verified=true;status('Signed in as Arthur-Freedom.');}
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
       for(const station of batch){const matches=readings.filter(r=>r?.id===station.id),reading=matches[0];if(matches.length===1&&P.validReading(reading,station.id,Date.now(),station.coordinates)){live.readings.set(reading.id,reading);success++;}else{if(matches.length!==1||typeof reading?.error!=='string'||!reading.error)incomplete=true;const previous=live.readings.get(station.id);live.readings.set(station.id,{...previous,id:station.id,refreshFailed:true,errorCode:reading?.errorCode||'provider_data'});}}
       progress.done+=batch.length;applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();
       const failedService=readings.find(r=>['provider_limit','provider_auth','provider_unavailable','provider_data'].includes(r?.errorCode));
       if(failedService||incomplete){stopAuto();throw Error(failedService?(failedService.errorCode==='provider_limit'?'TomTom’s request limit was reached.':failedService.error)+' Remaining checks stopped.':'The traffic service returned incomplete results. Remaining checks stopped.');}
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
