 'use strict';
const $=id=>document.getElementById(id),P=window.Petrol;
const colours={neutral:'#617687',medium:'#af771a',long:'#a54135',unknown:'#727d82',unavailable:'#535d64'};
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dataset,stations=[],selected=null,map=null,markers=[],accessMarkers=[],origin=null,locationFix=null,locationMarker=null,mapReady=false,toastTimer,customBounds=null,drawController=null,fitSavedAfterLoad=false;
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function ageLabel(date){if(!date)return 'Not checked';const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(date))/60000));return minutes<1?'Just now':minutes<60?`${minutes} min ago`:minutes<1440?`${Math.floor(minutes/60)} hr ago`:`${Math.floor(minutes/1440)} days ago`;}
function dateLabel(date){return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Makassar'}).format(new Date(date))+' WITA';}
function scopeArea(){if($('area').value==='drawn'&&customBounds)return {id:'drawn',bounds:customBounds,center:[(customBounds[0]+customBounds[2])/2,(customBounds[1]+customBounds[3])/2]};if($('area').value==='nearby'&&origin)return {id:'nearby',name:'Near me',center:origin,radius:8};return dataset?.areas.find(a=>a.id===$('area').value)||null;}
function scopedStations(includeWithoutData=false){return P.inScope(stations,scopeArea(),$('search').value,!includeWithoutData&&$('saved-only').checked);}
function scopeCenter(){return scopeArea()?.center||origin||[115.210,-8.798];}
function activeStations(){return P.ordered(scopedStations(),scopeCenter());}
function signal(s){return P.status(s);}
function applyChecks(){stations=dataset.stations.map((s,index)=>({...P.mergeLive(s,window.PetrolLive?.readings.get(s.id)),number:index+1}));}
function updateSnapshot(){const times=scopedStations().filter(s=>s.checkedAt).map(s=>s.checkedAt).sort();$('traffic-time').textContent=times.length?'Last successful traffic check: '+dateLabel(times.at(-1)):'Traffic not checked here yet.';}
function placeUrl(s){return P.placeUrl(s);}
function approachText(s){const r=P.approachRoute(s);return r&&r.continuousSlowMetres!==null?P.approachSummary(s):s.approach?.status==='partial'?'Traffic at the access is uncertain':'Nearby roads only · access unconfirmed';}
function renderAccess(){
 if(!map||!mapReady)return;
 accessMarkers.forEach(m=>m.remove());accessMarkers=[];
 const s=stations.find(s=>s.id===selected),routes=s?.access?.routes||[],seen=new Set();
 for(const r of routes){const key=r.entrance.join(',');if(seen.has(key))continue;seen.add(key);const el=document.createElement('span');el.className='access-pin';el.textContent='A';el.title='Mapped road access · not field verified';el.setAttribute('role','img');el.setAttribute('aria-label',el.title);accessMarkers.push(new maplibregl.Marker({element:el,anchor:'bottom',offset:[0,-28]}).setLngLat(r.entrance).addTo(map));}
 const data={type:'FeatureCollection',features:routes.map(r=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:r.coordinates}}))};
 if(map.getSource('access-path'))map.getSource('access-path').setData(data);else{map.addSource('access-path',{type:'geojson',data});map.addLayer({id:'access-path-guide',type:'line',source:'access-path',paint:{'line-color':'#315a89','line-width':2,'line-dasharray':[2,3],'line-opacity':.6}});}
}
function updateMarker(s,element,visible,zoom){const q=signal(s),chosen=s.id===selected;element.style.display=visible?'':'none';element.style.setProperty('--pin',colours[q.tone]);element.style.zIndex=chosen?'1000':'1';element.dataset.compact=String(zoom<11.5&&!chosen);element.dataset.caption=String(chosen);element.dataset.side='right';element.setAttribute('aria-pressed',String(chosen));element.setAttribute('aria-label',(chosen?'Selected: ':'')+s.shortName+', '+q.label+', '+q.opening.label);element.querySelector('.pin-caption').textContent=chosen?'Selected · '+s.shortName:q.label;}
function renderList(){
 const list=activeStations(),loading=!!window.PetrolLive?.loadingSaved();
 $('saved-data-status').hidden=!loading;$('saved-data-status').textContent='Loading saved traffic… No traffic checks used.';
 $('count').textContent=String(list.length);$('coverage-label').textContent=stations.length+' mapped locations across Bali';
 $('area-count').textContent=$('saved-only').checked?`${list.length} with saved traffic · of ${scopedStations(true).length} mapped ${scopeArea()?'here':'across Bali'}`:`${list.length} ${$('search').value.trim()?'matching stations':scopeArea()?'in this area':'shown'} · ${stations.length} across Bali`;
 $('access-count').textContent=`${list.filter(s=>s.access?.status==='mapped').length} have mapped accesses · others show nearby-road context`;
 $('list-caption').textContent='Shorter mapped slow stretches first · uncertain readings below';
 $('stations').innerHTML=list.length?list.map(s=>{const q=signal(s),r=P.approachRoute(s);return `<li><button class="station-row" data-station="${s.id}" aria-pressed="${s.id===selected}" style="--pin:${colours[q.tone]}"><span class="station-number">${s.number}</span><span><span class="row-heading"><strong>${e(s.shortName)}</strong><span class="distance">${P.distance(scopeCenter(),s.coordinates).toFixed(1)} km</span></span><span class="row-sub">${e(s.address)}</span><span class="row-busyness"><strong>${e(P.approachSummary(s))}</strong>${q.measured?`<span>${e(P.nearbyLabel(s))}</span>`:''}</span><span class="row-evidence">${s.checkedAt?(q.fresh?e(ageLabel(s.checkedAt)):'Last measurement · '+e(dateLabel(s.checkedAt)))+(s.refreshFailed?' · latest check failed':''):s.refreshFailed?(s.errorCode==='no_coverage'?'No nearby traffic coverage':'Traffic check failed'):'No traffic reading yet'}</span>${q.rankable?`<span class="row-trend">${e(P.trendLabel(s))}</span>`:''}${q.opening.state!=='unknown'?`<span class="opening-note">${e(q.opening.label)}</span>`:''}</span></button></li>`;}).join(''):`<li class="empty">${loading?'Loading saved traffic…':$('saved-only').checked?'No saved traffic loaded in this area. Clear the saved-only filter to see all mapped stations, or try All saved traffic.':'No mapped stations match this area or search. Clear the rectangle, choose All Bali, or try another search.'}</li>`;
 document.querySelectorAll('[data-station]').forEach(b=>b.addEventListener('click',()=>selectStation(b.dataset.station,true,true)));
 const ids=new Set(list.map(s=>s.id));markers.forEach(({id,element})=>updateMarker(stations.find(s=>s.id===id),element,ids.has(id),map?.getZoom()||0));renderAccess();window.PetrolLive?.updateMarkers();
 const current=list.filter(s=>signal(s).rankable);$('recommendation').hidden=current.length<2;
 if(current.length>=2){const best=current[0],tied=current.filter(s=>P.compareTraffic(s,best)===0).length;
   $('recommendation').innerHTML=tied===current.length?`<span class="small-label">SIMILAR APPROACH READINGS</span><strong>${e(P.approachSummary(best))}</strong><p>${current.length} comparable checks. Petrol queues and motorcycle waiting times remain unknown.</p>`:`<span class="small-label">SHORTER MAPPED SLOW STRETCH</span><button class="recommendation-link" data-recommend="${best.id}">${e(best.shortName)} ↗</button><p>${tied>1?`Tied with ${tied-1} others. `:''}${e(approachText(best))}. Among ${current.length} fully covered checks; ${list.length-current.length} others excluded. Petrol queue unconfirmed.</p>`;
   $('recommendation').querySelector('button')?.addEventListener('click',()=>selectStation(best.id,true,true));}
 updateSnapshot();window.PetrolLive?.controls();
}
function renderDetail(){
 const s=stations.find(s=>s.id===selected);$('detail').hidden=!s||!!drawController?.active;if(!s)return;const q=signal(s),op=q.opening,r=P.approachRoute(s),routes=s.approach?.routes||[];
 $('detail').style.setProperty('--pin',colours[q.tone]);
 const access=s.access?.status==='mapped';
 const main=q.measured?(r&&r.continuousSlowMetres!==null?`<div class="busy-measure"><span>Continuous slow stretch · sampled approach</span><strong>${r.continuousSlowMetres===0?(s.approach.status==='matched'?'None detected':'Uncertain'):e(P.approachLabel(r))}</strong></div><p class="approach-severity">${e(q.label)}${r.relativeSpeed!==null?` · ${Math.round(r.relativeSpeed*100)}% of free-flow speed`:''}</p><p class="traffic-evidence">${e(r.name)} · heading ${e(r.direction)}<br>${r.coveredMetres} / 200 m covered${routes.length>1?` · longest slow stretch of ${routes.length} mapped approaches`:''}</p>${r.extent==='limit'?'<p class="traffic-caveat">Slow traffic reaches the 200 m limit. It may extend farther.</p>':r.extent==='gap'?'<p class="traffic-caveat">A coverage gap or an uncertain road connection prevents measuring the full slow stretch.</p>':''}${r.otherSlowMetres?`<p class="traffic-caveat">Another ≈ ${Math.round(r.otherSlowMetres/10)*10} m is slow farther back, separated from the access by faster traffic or missing coverage.</p>`:''}`:`<div class="busy-measure"><span>Traffic approaching the station</span><strong>${e(q.label)}</strong></div><p class="traffic-evidence">${access?'The incoming road could not be matched completely to traffic data.':'A connected entrance road could not be identified reliably in the available map data.'}</p>`)+`<div class="nearby-reading"><strong>${e(P.nearbyLabel(s))}</strong><span>All covered road directions within 250 m</span>${r?.continuousSlowMetres===0&&P.slowdown(s)>0?'<p>The bold sampled approach reports flowing traffic. The thin orange/red lines show slow traffic outside that continuous approach stretch. Neither reading measures the petrol queue.</p>':''}</div><p class="quality-note">${q.rankable?'Mapped access · experimental road signal':q.fresh?'Excluded from station comparison':'Outdated or latest check failed · excluded'}<br>${access?'The A marker shows the mapped road access. Entrance and turn access have not been checked on site.':'Nearby road colours are still available as context.'}</p>${r?`<p class="trend-note">${e(P.trendLabel(s))}${q.fresh&&s.trend?.checks>=2?'<br><span>Slow traffic seen in both checks; conditions between them are unknown.</span>':''}</p>`:''}<p class="checked">Queried ${dateLabel(s.checkedAt)} · ${e(ageLabel(s.checkedAt))}</p><details class="road-context"><summary>Road colours and measurement scope</summary><p>${P.slowPercent(s)}% of covered road directions are slow within 250 m: ≈ ${s.jamMetres} m congested, ${s.slowMetres} m slow. This wider total is not used to rank stations. Faint map lines show these roads; bold lines show matched incoming approaches.</p><p>Query time is when we fetched the data. TomTom does not give an observation time for each road in this feed.</p></details>`:`<div class="busy-measure"><span>Traffic approaching the station</span><strong>${s.refreshFailed?'Traffic unavailable':access?'Ready to check':'Entrance not mapped'}</strong></div><p class="traffic-evidence" id="empty-reading-note">${access?'Refresh to measure incoming roads at the mapped access. The blue dashed line shows the approach to check.':'Refresh for nearby-road context. This station stays out of the approach ranking until its access can be mapped.'}</p>`;
 $('detail').innerHTML=`<div class="detail-header"><span class="detail-kicker">STATION ${s.number} · ${e(s.area)}</span><button id="close-detail" aria-label="Close station details">×</button></div><h2>${e(s.shortName)}</h2><p class="address">${e(s.address)}</p>${q.measured&&!q.fresh?`<p class="last-reading"><strong>Last measurement · outdated</strong><br>${e(dateLabel(s.checkedAt))} · ${e(ageLabel(s.checkedAt))}<br>Still shown for reference; excluded from current comparison.</p>`:''}${main}${routes.length>1?`<details class="road-context"><summary>All ${routes.length} mapped approaches</summary>${routes.map(a=>`<p><strong>${e(P.approachLabel(a))}</strong> · ${e(a.name)}, heading ${e(a.direction)}<br>${a.coveredMetres} / 200 m covered${a.complete?'':' · incomplete'}${a.closedMetres?' · road closure reported':''}</p>`).join('')}</details>`:''}<p class="observation"><strong>Motorcycle petrol wait: unknown.</strong> These are road slowdowns, which may be through traffic or a junction queue. Pump service and forecourt queues are not measured.</p><div class="opening-summary"><strong>${e(op.label)}</strong><p>${op.state==='unknown'?'Opening and fuel availability have not been verified.':op.source==='firsthand'?'Firsthand report; conditions can change.':'Listing information only. Crisis opening hours may differ.'}${op.checkedAt?'<br>Opening checked '+e(dateLabel(op.checkedAt))+'.':''}</p></div><button id="refresh-station" data-id="${e(s.id)}" class="station-refresh" hidden>Refresh this station</button><div class="detail-actions"><a href="${placeUrl(s)}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a><a href="${e(s.access?.source||s.sourceUrl)}" target="_blank" rel="noopener noreferrer">Map source ↗</a></div>`;
 $('refresh-station').addEventListener('click',()=>window.PetrolLive?.refreshStation(s.id));window.PetrolLive?.controls();
 $('close-detail').addEventListener('click',()=>{selected=null;history.replaceState(null,'',location.pathname+location.search);renderDetail();renderList();});
}
function selectStation(id,fly=true,scroll=false){
 const s=stations.find(s=>s.id===id);if(!s)return;selected=id;history.replaceState(null,'',location.pathname+location.search+'#'+id);renderList();renderDetail();
 if(fly&&map)map.flyTo({center:s.coordinates,zoom:16,offset:[matchMedia('(min-width:761px)').matches?Math.min(160,$('map').clientWidth*.18):0,0],duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:500});
 if(scroll)revealMap();
}
function revealMap(){if(matchMedia('(max-width:760px)').matches){const region=document.querySelector('.map-wrap');region.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});region.focus({preventScroll:true});}}
function locationDistance(metres){return metres>=1000?(metres/1000).toFixed(1)+' km':Math.max(1,Math.round(metres))+' m';}
function locationTime(){return new Date(locationFix.timestamp).toLocaleTimeString('en-GB',{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit',hour12:false})+' WITA';}
function locationRing(radius){
 const rad=Math.PI/180,lat=origin[1]*rad,lng=origin[0]*rad,angle=radius/6371000,points=[];
 for(let i=0;i<=64;i++){const bearing=i/64*Math.PI*2,y=Math.asin(Math.sin(lat)*Math.cos(angle)+Math.cos(lat)*Math.sin(angle)*Math.cos(bearing)),x=lng+Math.atan2(Math.sin(bearing)*Math.sin(angle)*Math.cos(lat),Math.cos(angle)-Math.sin(lat)*Math.sin(y));points.push([x/rad,y/rad]);}
 points[points.length-1]=points[0];return points;
}
function renderLocation(){
 if(!map||!mapReady||!locationFix)return;
 const label=locationFix.accuracy>250?'Approximate location':'You are here';
 if(!locationMarker){const el=document.createElement('div');el.className='user-location';el.setAttribute('role','img');el.innerHTML='<span class="location-dot" aria-hidden="true"></span><span class="location-label"></span>';locationMarker=new maplibregl.Marker({element:el}).setLngLat(origin).addTo(map);}
 locationMarker.setLngLat(origin);const el=locationMarker.getElement();el.querySelector('.location-label').textContent=label;el.setAttribute('aria-label',label+' · accuracy about '+locationDistance(locationFix.accuracy)+' · located '+locationTime());
 const data={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[locationRing(locationFix.accuracy)]}};
 if(map.getSource('location-accuracy'))map.getSource('location-accuracy').setData(data);else{
  map.addSource('location-accuracy',{type:'geojson',data});
  const before=map.getLayer('access-path-guide')?'access-path-guide':undefined;
  map.addLayer({id:'location-accuracy-fill',type:'fill',source:'location-accuracy',paint:{'fill-color':'#2374d5','fill-opacity':.12}},before);
  map.addLayer({id:'location-accuracy-outline',type:'line',source:'location-accuracy',paint:{'line-color':'#2374d5','line-opacity':.55,'line-width':1}},before);
 }
}
function focusLocation(){
 if(!map||!mapReady||!locationFix)return;
 renderLocation();const bounds=new maplibregl.LngLatBounds();locationRing(Math.max(120,locationFix.accuracy)).forEach(p=>bounds.extend(p));
 map.fitBounds(bounds,{padding:{top:125,bottom:65,left:55,right:55},maxZoom:16,duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:500});
}
function locate(){
 const button=$('locate'),status=$('location-status');status.hidden=false;
 const fail=code=>{button.disabled=false;button.removeAttribute('aria-busy');button.textContent='◎';status.dataset.state='error';const message=code===1?'Location access blocked. Allow location for this site, then try again.':code===3?'Location timed out. Try again, or choose an area.':'Location unavailable. Try again, or choose an area.';status.textContent=message+(locationFix?' Still showing your last fix from '+locationTime()+'.':'');};
 if(!navigator.geolocation){fail(2);return;}
 button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='…';status.dataset.state='finding';status.textContent='Finding your location…';
 navigator.geolocation.getCurrentPosition(pos=>{
  const {longitude,latitude,accuracy}=pos.coords;
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||!Number.isFinite(accuracy)||Math.abs(longitude)>180||Math.abs(latitude)>90||accuracy<0||accuracy>20000000){fail(2);return;}
  origin=[longitude,latitude];locationFix={accuracy,timestamp:Number.isFinite(pos.timestamp)?pos.timestamp:Date.now()};
  if(!$('area').querySelector('[value="nearby"]'))$('area').insertAdjacentHTML('afterbegin','<option value="nearby">Near me · 8 km</option>');
  $('area').value='nearby';$('search').value='';button.disabled=false;button.removeAttribute('aria-busy');button.dataset.located='true';button.textContent='◎';
  status.dataset.state='found';status.textContent=(accuracy>250?'Approximate location':'Location found')+' · accuracy about '+locationDistance(accuracy)+' · '+locationTime()+'. Tap ◎ to locate again.';
  changeScope();revealMap();
 },error=>fail(error.code),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
function fitAll(){if(!map)return;if(customBounds){map.fitBounds([[customBounds[0],customBounds[1]],[customBounds[2],customBounds[3]]],{padding:70,maxZoom:16,duration:0});return;}const list=scopedStations();if(!list.length){if($('area').value==='nearby')focusLocation();return;}const bounds=new maplibregl.LngLatBounds();list.forEach(s=>bounds.extend(s.coordinates));if($('area').value==='nearby'&&origin)bounds.extend(origin);map.fitBounds(bounds,{padding:{top:110,bottom:65,left:55,right:70},maxZoom:14,duration:0});}
function initMap(){
 mapReady=false;drawController?.destroy();drawController=null;$('draw-area').disabled=true;locationMarker?.remove();locationMarker=null;
 if(!window.maplibregl){$('map-error').hidden=false;return;}
 try{
  map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/positron',center:[115.201,-8.787],zoom:12,minZoom:7,maxZoom:18,attributionControl:false,cooperativeGestures:false,scrollZoom:true});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');
  markers=stations.map(s=>{const element=document.createElement('button');element.className='map-pin';element.innerHTML=`<span class="pin-number">${s.number}</span><span class="pin-caption"></span>`;element.dataset.side=s.id==='bypass-27'?'left':'right';element.addEventListener('click',()=>selectStation(s.id,true,true));return {id:s.id,element,marker:new maplibregl.Marker({element}).setLngLat(s.coordinates).addTo(map)};});
  map.on('load',()=>{mapReady=true;$('map-error').hidden=true;initDrawing();renderRectangle();renderLocation();if($('area').value==='nearby'&&locationFix)focusLocation();else fitAll();renderList();});map.on('zoomend',()=>renderList());map.on('movestart',ev=>{if(ev.originalEvent)fitSavedAfterLoad=false;});
  setTimeout(()=>{if(!mapReady&&!window.PetrolLive?.active)$('map-error').hidden=false;},12000);renderList();
 }catch{$('map-error').hidden=false;}
}
async function loadData(){
 try{const r=await fetch('stations.json?v=20261015-approaches',{cache:'no-store'});if(!r.ok)throw Error();dataset=await r.json();if(!dataset.stations?.length||!dataset.areas?.length)throw Error();applyChecks();
 $('area').innerHTML='<option value="all">All Bali</option>'+dataset.areas.map(a=>`<option value="${a.id}">${e(a.name)}</option>`).join('');
 const wanted=new URL(location.href).searchParams.get('area');$('area').value=dataset.areas.some(a=>a.id===wanted)||wanted==='all'?wanted:'nusa-dua';
 const hash=location.hash.slice(1);if(stations.some(s=>s.id===hash)){selected=hash;if(!scopedStations().some(s=>s.id===hash))$('area').value='all';}
 renderList();renderDetail();initMap();$('locate').disabled=false;
 }catch{$('stations').innerHTML='<li class="empty">Station locations could not load. Reload the page to retry.</li>';}
}
function renderRectangle(){
 $('drawn-scope').hidden=!customBounds;
 if(!map||!mapReady)return;
 const b=customBounds,data={type:'FeatureCollection',features:b?[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]]]}}]:[]};
 if(map.getSource('chosen-area'))map.getSource('chosen-area').setData(data);
 else if(b){map.addSource('chosen-area',{type:'geojson',data});map.addLayer({id:'chosen-area-fill',type:'fill',source:'chosen-area',paint:{'fill-color':'#174a9b','fill-opacity':.045}});map.addLayer({id:'chosen-area-outline',type:'line',source:'chosen-area',paint:{'line-color':'#174a9b','line-width':2,'line-dasharray':[3,2]}});}
}
function endDrawing(){$('show-all').disabled=false;document.querySelector('.map-wrap').classList.remove('is-drawing');$('draw-area').textContent='Draw area';$('draw-area').setAttribute('aria-pressed','false');$('draw-status').hidden=true;renderDetail();$('draw-area').focus({preventScroll:true});}
function initDrawing(){
 if(!window.PetrolDraw)return;
 drawController=window.PetrolDraw({map,surface:$('area-draw-surface'),box:$('area-draw-box'),cursor:$('area-draw-cursor'),status:$('draw-status'),onCancel:endDrawing,onComplete(bounds){
  customBounds=bounds;if(!$('area').querySelector('[value="drawn"]'))$('area').insertAdjacentHTML('afterbegin','<option value="drawn">Drawn rectangle</option>');
  $('area').value='drawn';$('search').value='';$('traffic-view').value='all';endDrawing();changeScope({fit:false});notify(`${scopedStations(true).length} stations inside your rectangle. Saved traffic loads automatically.`);
 }});$('draw-area').disabled=false;
}
function changeScope({fit=true}={}){
 fitSavedAfterLoad=false;drawController?.cancel();selected=null;
 if($('area').value!=='drawn'){customBounds=null;$('area').querySelector('[value="drawn"]')?.remove();}
 const url=new URL(location.href);url.hash='';url.searchParams.set('area',$('area').value==='drawn'?'all':$('area').value);history.replaceState(null,'',url);
 renderRectangle();window.PetrolLive?.scopeChanged();renderList();renderDetail();if(fit){if($('area').value==='nearby'&&locationFix)focusLocation();else fitAll();}
}
$('area').addEventListener('change',()=>{$('search').value='';changeScope();});
$('search').addEventListener('input',()=>changeScope({fit:false}));
$('saved-only').addEventListener('change',()=>changeScope({fit:false}));
$('all-saved').addEventListener('click',()=>{
 $('area').value='all';$('search').value='';$('saved-only').checked=true;$('traffic-view').value='all';changeScope();fitSavedAfterLoad=!!window.PetrolLive?.loadingSaved();revealMap();
});
$('clear-rectangle').addEventListener('click',()=>{$('area').value='all';changeScope();});
$('traffic-view').addEventListener('change',()=>window.PetrolLive?.updateMarkers());
$('draw-area').addEventListener('click',()=>{
 if(!drawController)return;if(drawController.active){drawController.cancel();return;}
 fitSavedAfterLoad=false;$('show-all').disabled=true;$('draw-status').hidden=false;drawController.start();document.querySelector('.map-wrap').classList.add('is-drawing');$('draw-area').textContent='Cancel drawing';$('draw-area').setAttribute('aria-pressed','true');$('detail').hidden=true;
});
window.PetrolView={savedLoaded(){if(fitSavedAfterLoad){fitSavedAfterLoad=false;fitAll();}}};
$('show-all').addEventListener('click',fitAll);
$('locate').addEventListener('click',locate);
$('retry-map').addEventListener('click',()=>{map?.remove();map=null;markers=[];initMap();});
function openHelp(){$('help').hidden=false;$('help-toggle').setAttribute('aria-expanded','true');$('help-close').focus();}
function closeHelp(){$('help').hidden=true;$('help-toggle').setAttribute('aria-expanded','false');$('help-toggle').focus();}
$('help-toggle').addEventListener('click',()=>{$('help').hidden?openHelp():closeHelp();});$('method-link').addEventListener('click',openHelp);$('help-close').addEventListener('click',closeHelp);document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('help').hidden)closeHelp();});
window.addEventListener('hashchange',()=>selectStation(location.hash.slice(1),true));
setInterval(()=>{if(dataset){applyChecks();renderList();renderDetail();}},60000);
// Let the map handle the gesture; cancel the browser's page-zoom default.
document.querySelector('.map-wrap').addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)event.preventDefault();},{passive:false,capture:true});
window.petrolReady=loadData();
