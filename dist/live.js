'use strict';
(()=>{
 const service='https://bali-petrol-traffic.honeymooninbali.workers.dev',auth='https://bali-cinema-owner-refresh.honeymooninbali.workers.dev',owner=window.PetrolOwner;
 const archiveRoot='https://raw.githubusercontent.com/Arthur-Freedom/bali-petrol-map/refs/heads/traffic-history/';
 let publicIndex=null,publicLoading=false;const publicLoaded=new Set();
 let verified=false,pending=false,budget={dailyLimit:50,dailyUsed:0,remainingChecks:50,stationNextAt:{},monthlyLimit:900,remainingMonthlyChecks:900},archive=null,progress=null,scopeVersion=0,auto=false,autoNextAt=0,epoch=0;
 const requests=new Set();
 function stopRequests(){for(const controller of requests)controller.abort();requests.clear();}
 function stopAuto(){auto=false;$('auto-refresh').checked=false;}
 function failedReadings(batch){for(const {id} of batch){const previous=live.readings.get(id);live.readings.set(id,{...previous,id,refreshFailed:true,errorCode:'provider_unavailable'});}applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();}
 const live={active:false,readings:new Map(),controls,refreshStation(id){auto=false;$('auto-refresh').checked=false;return refresh(id);},scopeChanged(){scopeVersion++;auto=false;$('auto-refresh').checked=false;if(!pending&&verified)status('Ready to compare this area.');if(!owner.get())loadPublicSaved();controls();},updateMarkers(){drawTraffic();},clear(){live.readings.clear();publicLoaded.clear();live.active=false;drawTraffic();$('road-legend').hidden=true;$('map-layer-title').textContent='PETROL LOCATIONS';$('map-layer-note').textContent='Sign in to compare nearby road traffic.';if(dataset){applyChecks();renderList();renderDetail();}updateSnapshot();}};
 window.PetrolLive=live;
 function status(message){$('owner-status').textContent=message;}
 function mode(){return $('refresh-mode').value;}
 function plan(id){return P.refreshPlan(id?stations.filter(s=>s.id===id):scopedStations(),scopeCenter(),budget,id?'area':mode());}
 function limits(data){if(data.archive)archive=data.archive;if(typeof data.refreshEnabled==='boolean')budget.refreshEnabled=data.refreshEnabled;if(data.stationNextAt)budget.stationNextAt=data.stationNextAt;if(Number.isFinite(data.resetAt))budget.resetAt=data.resetAt;if(Number.isFinite(data.remainingChecks))budget.remainingChecks=data.remainingChecks;for(const key of ['dailyLimit','dailyUsed','monthlyLimit','monthlyUsed','remainingMonthlyChecks','monthlyResetAt'])if(Number.isFinite(data[key]))budget[key]=data[key];}
 function waitLabel(p){return `Recheck in ${Math.max(1,Math.ceil((p.nextAt-Date.now())/60000))} min`;}
 function retainedMessage(){return scopedStations().some(s=>s.checkedAt)?'Saved measurements remain visible with their original times, including after a reload.':'No saved measurement for this area yet. Checks made before archiving was enabled cannot be recovered.';}
 function controls(){
   if(budget.resetAt&&Date.now()>=budget.resetAt)budget={...budget,dailyUsed:0,remainingChecks:budget.dailyLimit,stationNextAt:{},resetAt:0};
   if(budget.monthlyResetAt&&Date.now()>=budget.monthlyResetAt)budget={...budget,remainingMonthlyChecks:budget.monthlyLimit,monthlyResetAt:0};
   $('owner-login').hidden=verified;$('traffic-refresh').hidden=!verified;$('owner-logout').hidden=!owner.get();$('auto-wrap').hidden=!verified;
   $('owner-login').textContent=owner.get()?'Retry connection':'Sign in with GitHub';
   const p=plan(),count=p.targets.length;
   $('traffic-refresh').disabled=pending||!verified||!count||budget.refreshEnabled===false;
   $('traffic-refresh').textContent=pending?(progress?`Checking ${progress.done}/${progress.total}…`:'Preparing checks…'):!p.total?'No stations here':p.remainingChecks===0?(budget.remainingMonthlyChecks===0?'Monthly safety limit':'Daily refresh limit'):!count?waitLabel(p):mode()==='oldest'?`Refresh oldest ${count}`:p.limited?`Refresh next ${count}`:p.cooling?`Refresh remaining ${count}`:`Refresh area · ${count}`;
   $('refresh-summary').textContent=!verified?`Sign in to refresh all ${p.total} stations here, or choose the oldest checks.`:p.remainingChecks===0?(budget.remainingMonthlyChecks===0?'Monthly safety limit reached. More checks next month. ':`This app’s ${budget.dailyLimit.toLocaleString()} daily checks are used. More after midnight in Bali. `)+retainedMessage():!p.total?'Choose another area or search.':!count?'These stations were checked recently. Other areas can be checked now.':mode()==='oldest'?'Unchecked stations first, then the oldest readings.':p.limited?`The remaining budget allows ${count} of ${p.eligible} due stations now.`:p.cooling?`${p.cooling} checked recently; ${count} can be checked now.`:`One click checks all ${count} stations. No wait between stations.`;
   $('check-budget').hidden=!verified;$('check-budget').textContent=`${budget.remainingChecks} station checks left today · ${budget.dailyLimit-budget.remainingChecks}/${budget.dailyLimit} used · ${budget.remainingMonthlyChecks}/${budget.monthlyLimit} left this month`;
   if(verified&&budget.refreshEnabled===false){$('traffic-refresh').textContent='Refreshes paused';$('refresh-summary').textContent='New traffic checks are paused. Saved measurements remain available.';}
   const archiveTime=time=>new Date(time).toLocaleString('en-GB',{timeZone:'Asia/Makassar',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' WITA';
   $('archive-status').hidden=!verified&&!publicIndex?.updatedAt;$('archive-status').textContent=!verified&&publicIndex?.updatedAt?'Showing GitHub backup · '+archiveTime(publicIndex.updatedAt):archive?.saved===false?'Saving failed · keep this tab open':archive?(archive.pendingChecks||archive.lastArchivedAt?`Saved on server · ${archive.pendingChecks||0} check${archive.pendingChecks===1?'':'s'} waiting for GitHub backup${archive.lastArchivedAt?' · last backup '+archiveTime(archive.lastArchivedAt):''}`:'Archive ready · new checks will be saved'):'Saved readings load without using traffic checks.';
   const button=$('refresh-station');if(button){const one=plan(button.dataset.id);button.hidden=!verified;button.disabled=pending||!one.targets.length;button.textContent=pending?'Checking traffic…':one.remainingChecks===0?(budget.remainingMonthlyChecks===0?'Monthly safety limit':'Daily refresh limit'):one.targets.length?'Refresh this station':waitLabel(one);}
   if(button&&budget.refreshEnabled===false){button.disabled=true;button.textContent='Refreshes paused';}
   const empty=$('empty-reading-note');if(empty&&verified&&p.remainingChecks===0)empty.textContent='No saved measurement for this station yet. Refreshes resume when the spending limit resets.';
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
   if(!map||!mapReady)return;
   const visible=new Set(scopedStations().map(s=>s.id)),features=[];
   for(const data of live.readings.values()){
     if(!visible.has(data.id)||!data.checkedAt)continue;
     const stale=data.refreshFailed||!P.fresh(data.checkedAt);
     const addSegments=(segments,focus)=>{
       let previous;const same=(a,b)=>a.every((n,i)=>Math.abs(n-b[i])<1e-10);
       for(const segment of segments){
         const color=segment.closed?'#343f49':segment.speed==='TRAFFIC_JAM'?'#b74335':segment.speed==='SLOW'?'#df931c':'#43855c',points=previous?.geometry.coordinates;
         // Keep continuous equal-colour geometry together so dashes do not
         // restart on every five-metre sample. Never join across a gap.
         if(previous?.properties.color===color&&same(points.at(-1),segment.from)){points.push(segment.to);continue;}
         if(previous?.properties.color===color&&same(points[0],segment.to)){points.unshift(segment.from);continue;}
         previous={type:'Feature',properties:{id:data.id,selected:data.id===selected,focus,stale:!!stale,color},geometry:{type:'LineString',coordinates:[segment.from,segment.to]}};features.push(previous);
       }
     };
     addSegments(data.segments||[],false);
     for(const route of data.approach?.routes||[])addSegments(route.segments,true);
   }
   const data={type:'FeatureCollection',features};
   if(map.getSource('station-traffic'))map.getSource('station-traffic').setData(data);
   else{
     map.addSource('station-traffic',{type:'geojson',data,attribution:'Traffic © <a href="https://www.tomtom.com/" target="_blank" rel="noopener">TomTom</a>'});
     map.addLayer({id:'traffic-outline',type:'line',source:'station-traffic',filter:['==',['get','stale'],false],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['case',['get','selected'],9,6],'line-opacity':['case',['get','focus'],.9,0]}});
     map.addLayer({id:'traffic-colours',type:'line',source:'station-traffic',filter:['==',['get','stale'],false],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['case',['get','focus'],['case',['get','selected'],6,3],1.5],'line-opacity':['case',['get','focus'],.95,['case',['get','selected'],.5,.25]]}});
     map.addLayer({id:'traffic-earlier-outline',type:'line',source:'station-traffic',filter:['==',['get','stale'],true],paint:{'line-color':'#fff','line-width':['case',['get','selected'],9,6],'line-dasharray':[2,2],'line-opacity':['case',['get','focus'],.7,0]}});
     map.addLayer({id:'traffic-earlier-colours',type:'line',source:'station-traffic',filter:['==',['get','stale'],true],paint:{'line-color':['get','color'],'line-width':['case',['get','focus'],['case',['get','selected'],6,3],1.5],'line-dasharray':[2,2],'line-opacity':['case',['get','focus'],.65,['case',['get','selected'],.4,.2]]}});
   }
   const earlier=features.some(f=>f.properties.stale);$('earlier-legend').hidden=!earlier;
   if(live.active){$('map-layer-title').textContent=earlier?'LAST TRAFFIC MEASUREMENTS':'TRAFFIC AT MAPPED ACCESSES';$('map-layer-note').textContent=earlier?'Dashed colours: outdated · select a station for its time':'Bold: incoming approaches · faint: nearby roads';}
 }
 function showTraffic(){live.active=true;$('road-legend').hidden=false;$('map-layer-title').textContent='TRAFFIC AT MAPPED ACCESSES';$('map-layer-note').textContent='Bold: incoming approaches · faint: nearby roads';drawTraffic();}
 async function loadPublicSaved(){
   if(publicLoading||owner.get())return;publicLoading=true;const generation=epoch,scope=scopeVersion;
   try{
     await window.petrolReady;if(!dataset)return;
     if(!publicIndex){const response=await fetch(archiveRoot+'index.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const value=await response.json();if(value?.schemaVersion!==1||!value.stations||Array.isArray(value.stations)||typeof value.stations!=='object')throw Error();publicIndex=value;}
     const pending=scopedStations().filter(s=>!publicLoaded.has(s.id)&&publicIndex.stations[s.id]?.checkedAt);
     let position=0;
     await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
       while(position<pending.length&&generation===epoch&&!owner.get()){
         const station=pending[position++],meta=publicIndex.stations[station.id];
         try{const response=await fetch(archiveRoot+'latest/'+encodeURIComponent(station.id)+'.json?v='+encodeURIComponent(meta.checkedAt),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)continue;const row=await response.json();
           if(generation!==epoch||owner.get())return;
           if(row.checkedAt!==meta.checkedAt||!P.validSavedReading(row,station.id,Date.now(),station.coordinates))continue;
           if(meta.lastAttemptStatus==='failed'&&Date.parse(meta.lastAttemptAt)>=Date.parse(row.checkedAt)){row.refreshFailed=true;row.errorCode=meta.errorCode;}
           live.readings.set(row.id,row);publicLoaded.add(row.id);
         }catch{/* A missing backup is not a zero-traffic reading. */}
       }
     }));
     if(generation===epoch&&!owner.get()){applyChecks();if(live.readings.size)showTraffic();renderList();renderDetail();updateSnapshot();controls();}
   }catch{/* The station finder remains usable when GitHub is unavailable. */}
   finally{publicLoading=false;if(generation===epoch&&scope!==scopeVersion&&!owner.get())loadPublicSaved();}
 }
 async function loadSaved(generation){
   let cursor='',count=0;const seen=new Set();
   do{
     const data=await request('/api/saved'+(cursor?'?after='+encodeURIComponent(cursor):''));if(generation!==epoch)return count;
     if(data.schemaVersion!==1||!Array.isArray(data.stations)||data.stations.length>20)throw Error('Saved measurements could not be read. Retry connection; no traffic check was used.');
     for(const row of data.stations){
       const station=stations.find(s=>s.id===row?.id);if(!station||seen.has(row.id))throw Error('Invalid saved measurements.');seen.add(row.id);
       const previous=live.readings.get(row.id);
       if(P.validSavedReading(row,row.id,Date.now(),station.coordinates)){
         if(!previous?.checkedAt||Date.parse(row.checkedAt)>=Date.parse(previous.checkedAt))live.readings.set(row.id,row);count++;
       }else if(!row.checkedAt&&row.refreshFailed&&!previous?.checkedAt)live.readings.set(row.id,{id:row.id,refreshFailed:true,errorCode:row.errorCode});
       else throw Error('Invalid saved measurement. No traffic check was used.');
     }
     limits(data);const next=data.next;
     if(next!==null&&(typeof next!=='string'||next===cursor||!seen.has(next)))throw Error('Invalid saved-reading cursor.');
     cursor=next;
   }while(cursor);
   applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();return count;
 }
 async function connect(){
   if(!owner.get()){status(owner.error||'Saved traffic is public. Only Arthur-Freedom can request new checks.');controls();loadPublicSaved();return;}
   const generation=++epoch;verified=false;controls();status('Verifying your GitHub account…');
   try{const data=await request('/api/session');if(generation!==epoch)return;if(data.ownerId!=='18115558'||data.provider!=='tomtom-orbis-v2')throw Error('Traffic version changed. Reload this page and reconnect.');limits(data);await window.petrolReady;if(generation!==epoch)return;if(!dataset)throw Error('Station locations could not load. Reload the page to retry.');status('Loading saved measurements…');const loaded=await loadSaved(generation);if(generation!==epoch)return;showTraffic();verified=true;status(`Signed in as Arthur-Freedom.${loaded?' Loaded '+loaded+' saved measurement'+(loaded===1?'':'s')+'.':''}`);}
   catch(error){if(generation===epoch){verified=false;status(error.message+(live.readings.size?' Last measurements remain visible.':''));}}finally{controls();}
 }
 async function refresh(id){
   if(!verified||pending||budget.refreshEnabled===false||!plan(id).targets.length)return;
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
       for(const station of batch){const matches=readings.filter(r=>r?.id===station.id),reading=matches[0];if(matches.length===1&&P.validReading(reading,station.id,Date.now(),station.coordinates)){live.readings.set(reading.id,reading.trend?reading:P.withTrend(live.readings.get(reading.id),reading));success++;}else{if(matches.length!==1||typeof reading?.error!=='string'||!reading.error)incomplete=true;const previous=live.readings.get(station.id);live.readings.set(station.id,{...previous,id:station.id,refreshFailed:true,errorCode:reading?.errorCode||'provider_data'});}}
       progress.done+=batch.length;applyChecks();renderList();renderDetail();drawTraffic();updateSnapshot();
       if(data.archive?.saved===false){stopAuto();throw Error(data.archive.error||'Measurements could not be saved. Further checks stopped; keep this tab open.');}
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
   if(generation===epoch)loadPublicSaved();
 });
 addEventListener('owner-session-change',()=>{++epoch;verified=false;stopAuto();stopRequests();live.clear();connect();});
 setInterval(()=>{controls();if(auto&&verified&&!document.hidden&&Date.now()>=autoNextAt&&plan().targets.length)refresh();},15000);
 document.addEventListener('visibilitychange',()=>{if(auto&&verified&&!document.hidden&&Date.now()>=autoNextAt&&plan().targets.length)refresh();});
 connect();
})();
