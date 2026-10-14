 'use strict';
const $=id=>document.getElementById(id),P=window.Petrol;
const colours={short:'#21705d',medium:'#af771a',long:'#a54135',unknown:'#727d82',unavailable:'#535d64'};
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dataset,stations=[],selected=null,map=null,markers=[],origin=null,mapReady=false,batchPage=0,toastTimer;
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function ageLabel(date){if(!date)return 'Not checked';const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(date))/60000));return minutes<1?'Just now':minutes<60?`${minutes} min ago`:minutes<1440?`${Math.floor(minutes/60)} hr ago`:`${Math.floor(minutes/1440)} days ago`;}
function dateLabel(date){return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Makassar'}).format(new Date(date))+' WITA';}
function scopeArea(){if($('area').value==='nearby'&&origin)return {id:'nearby',name:'Near me',center:origin,radius:8};return dataset?.areas.find(a=>a.id===$('area').value)||null;}
function scopedStations(){return P.inScope(stations,scopeArea(),$('search').value);}
function scopeCenter(){return scopeArea()?.center||origin||[115.210,-8.798];}
function activeStations(){return P.ordered(scopedStations(),scopeCenter());}
function refreshTargets(){return P.batch(scopedStations(),scopeCenter(),batchPage);}
function signal(s){return P.status(s);}
function applyChecks(){stations=dataset.stations.map((s,index)=>({...P.mergeLive(s,window.PetrolLive?.readings.get(s.id)),number:index+1}));}
function updateSnapshot(){const times=scopedStations().filter(s=>s.checkedAt).map(s=>s.checkedAt).sort();$('traffic-time').textContent=times.length?'Last successful traffic check: '+dateLabel(times.at(-1)):'Traffic not checked here yet.';}
function directionsUrl(s){return `https://www.google.com/maps/dir/?api=1&destination=${s.coordinates[1]},${s.coordinates[0]}${s.placeId?'&destination_place_id='+encodeURIComponent(s.placeId):''}${origin?'&origin='+origin[1]+','+origin[0]:''}&travelmode=driving`;}
function updateMarker(s,element,visible,target,zoom){const q=signal(s);element.style.display=visible?'':'none';element.style.setProperty('--pin',colours[q.tone]);element.dataset.target=String(target);element.dataset.compact=String(zoom<11.5&&s.id!==selected);element.dataset.caption=String(s.id===selected||(visible&&scopedStations().length<=16&&zoom>=12.5));element.setAttribute('aria-pressed',String(s.id===selected));element.setAttribute('aria-label',s.shortName+', '+q.label+', '+q.opening.label);element.querySelector('.pin-caption').textContent=q.label;}
function renderList(){
 const list=activeStations(),targets=new Set(refreshTargets().map(s=>s.id));
 $('count').textContent=String(list.length);$('coverage-label').textContent=stations.length+' mapped locations';
 $('list-caption').textContent='Recent traffic first · outlined stations are the next refresh';
 $('stations').innerHTML=list.length?list.map(s=>{const q=signal(s);return `<li><button class="station-row" data-station="${s.id}" data-target="${targets.has(s.id)}" aria-pressed="${s.id===selected}" style="--pin:${colours[q.tone]}"><span class="station-number">${s.number}</span><span><span class="row-heading"><strong>${e(s.shortName)}</strong><span class="distance">${P.distance(scopeCenter(),s.coordinates).toFixed(1)} km</span></span><span class="row-sub">${e(s.address)}</span><span class="row-busyness"><strong>${e(q.label)}</strong>${q.measured?`<span>${s.jamMetres} m congested</span>`:''}</span><span class="row-evidence">${s.checkedAt?e(ageLabel(s.checkedAt))+(s.refreshFailed?' · latest check failed':''):s.refreshFailed?'No traffic coverage returned':'No traffic reading yet'}</span>${q.opening.state!=='unknown'?`<span class="opening-note">${e(q.opening.label)}</span>`:''}</span></button></li>`;}).join(''):'<li class="empty">No mapped stations match this area or search. Try a nearby area or All Bali.</li>';
 document.querySelectorAll('[data-station]').forEach(b=>b.addEventListener('click',()=>selectStation(b.dataset.station,true,true)));
 const ids=new Set(list.map(s=>s.id));markers.forEach(({id,element})=>updateMarker(stations.find(s=>s.id===id),element,ids.has(id),targets.has(id),map?.getZoom()||0));window.PetrolLive?.updateMarkers();
 const total=Math.ceil(list.length/5);$('batch-previous').disabled=batchPage===0;$('batch-next').disabled=batchPage>=total-1;
 $('batch-label').textContent=list.length?`Group ${batchPage+1} of ${total} · ${targets.size} stations`:'No stations to refresh';
 const current=list.filter(s=>{const q=signal(s);return q.fresh&&q.measured&&!q.blocked;});$('recommendation').hidden=current.length<2;
 if(current.length>=2){const best=current[0];$('recommendation').innerHTML=`<span class="small-label">LESS CONGESTED APPROACH</span><button class="recommendation-link" data-recommend="${best.id}">${e(best.shortName)} ↗</button><p>Among ${current.length} recent readings. Opening and fuel unconfirmed.</p>`;$('recommendation').querySelector('button').addEventListener('click',()=>selectStation(best.id,true,true));}
 updateSnapshot();window.PetrolLive?.controls();
}
function renderDetail(){
 const s=stations.find(s=>s.id===selected);$('detail').hidden=!s;if(!s)return;const q=signal(s),op=q.opening;
 $('detail').style.setProperty('--pin',colours[q.tone]);
 $('detail').innerHTML=`<div class="detail-header"><span class="detail-kicker">STATION ${s.number} · ${e(s.area)}</span><button id="close-detail" aria-label="Close station details">×</button></div><h2>${e(s.shortName)}</h2><p class="address">${e(s.address)}</p><div class="busy-measure"><span>Approach road traffic</span><strong>${e(q.label)}</strong></div>${q.measured?`<p class="traffic-evidence"><strong>${s.jamMetres} m congested</strong> · ${s.slowMetres} m slow<br>On one sampled ${s.approachMetres} m approach.</p><p class="checked">${dateLabel(s.checkedAt)}${!q.fresh?' · older or failed latest check':''}</p>`:'<p class="traffic-evidence">Refresh a group containing this station to compare its approach traffic.</p>'}<div class="opening-summary"><strong>${e(op.label)}</strong><p>${op.state==='unknown'?'Opening and fuel availability have not been verified.':op.source==='firsthand'?'Firsthand report; conditions can change.':'Listing information only. Actual opening may differ, especially during fuel shortages.'}${op.checkedAt?'<br>Opening information checked '+e(dateLabel(op.checkedAt))+'.':''}</p></div><p class="observation">Road traffic does not establish whether pumps are operating or how long refuelling will take.</p><div class="detail-actions"><a href="${directionsUrl(s)}" target="_blank" rel="noopener noreferrer">Directions ↗</a><a href="${e(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">Station source ↗</a></div>`;
 $('close-detail').addEventListener('click',()=>{selected=null;history.replaceState(null,'',location.pathname+location.search);renderDetail();renderList();});
}
function selectStation(id,fly=true,scroll=false){
 const s=stations.find(s=>s.id===id);if(!s)return;selected=id;history.replaceState(null,'',location.pathname+location.search+'#'+id);renderList();renderDetail();
 if(fly&&window.PetrolLive?.active)window.PetrolLive.focus(s);else if(fly&&map)map.flyTo({center:s.coordinates,zoom:14.5,duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:500});
 if(scroll&&matchMedia('(max-width:760px)').matches){$('detail').scrollIntoView({behavior:'smooth',block:'start'});$('detail').focus({preventScroll:true});}
}
function fitAll(){if(window.PetrolLive?.active){window.PetrolLive.fit();return;}if(!map)return;const list=scopedStations();if(!list.length)return;const bounds=new maplibregl.LngLatBounds();list.forEach(s=>bounds.extend(s.coordinates));map.fitBounds(bounds,{padding:{top:110,bottom:65,left:55,right:70},maxZoom:14,duration:0});}
function initMap(){
 if(!window.maplibregl){$('map-error').hidden=false;return;}
 try{
  map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/positron',center:[115.201,-8.787],zoom:12,minZoom:7,maxZoom:18,attributionControl:false,cooperativeGestures:false,scrollZoom:true});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');map.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');
  markers=stations.map(s=>{const element=document.createElement('button');element.className='map-pin';element.innerHTML=`<span class="pin-number">${s.number}</span><span class="pin-caption"></span>`;element.dataset.side=s.id==='bypass-27'?'left':'right';element.addEventListener('click',()=>selectStation(s.id,true,true));return {id:s.id,element,marker:new maplibregl.Marker({element}).setLngLat(s.coordinates).addTo(map)};});
  map.on('load',()=>{mapReady=true;$('map-error').hidden=true;fitAll();renderList();});map.on('zoomend',()=>renderList());
  setTimeout(()=>{if(!mapReady&&!window.PetrolLive?.active)$('map-error').hidden=false;},12000);renderList();
 }catch{$('map-error').hidden=false;}
}
async function loadData(){
 try{const r=await fetch('stations.json?v=20261015-bali',{cache:'no-store'});if(!r.ok)throw Error();dataset=await r.json();if(!dataset.stations?.length||!dataset.areas?.length)throw Error();applyChecks();
 $('area').innerHTML='<option value="all">All Bali</option>'+dataset.areas.map(a=>`<option value="${a.id}">${e(a.name)}</option>`).join('');
 const wanted=new URL(location.href).searchParams.get('area');$('area').value=dataset.areas.some(a=>a.id===wanted)||wanted==='all'?wanted:'nusa-dua';
 const hash=location.hash.slice(1);if(stations.some(s=>s.id===hash)){selected=hash;if(!scopedStations().some(s=>s.id===hash))$('area').value='all';}
 renderList();renderDetail();initMap();
 }catch{$('stations').innerHTML='<li class="empty">Station locations could not load. Reload the page to retry.</li>';}
}
function changeScope(){batchPage=0;selected=null;const url=new URL(location.href);url.hash='';url.searchParams.set('area',$('area').value);history.replaceState(null,'',url);window.PetrolLive?.scopeChanged();renderList();renderDetail();fitAll();}
$('area').addEventListener('change',()=>{$('search').value='';changeScope();});$('search').addEventListener('input',()=>{batchPage=0;window.PetrolLive?.scopeChanged();renderList();});
function changeBatch(delta){batchPage=Math.max(0,Math.min(Math.ceil(scopedStations().length/5)-1,batchPage+delta));window.PetrolLive?.scopeChanged();renderList();}
$('batch-previous').addEventListener('click',()=>changeBatch(-1));$('batch-next').addEventListener('click',()=>changeBatch(1));$('show-all').addEventListener('click',fitAll);
$('locate').addEventListener('click',()=>{if(!navigator.geolocation){notify('Location is unavailable. Choose an area.');return;}$('locate').disabled=true;navigator.geolocation.getCurrentPosition(pos=>{origin=[pos.coords.longitude,pos.coords.latitude];if(!$('area').querySelector('[value="nearby"]'))$('area').insertAdjacentHTML('afterbegin','<option value="nearby">Near me · 8 km</option>');$('area').value='nearby';$('search').value='';$('locate').disabled=false;changeScope();},()=>{$('locate').disabled=false;notify('Location unavailable. Choose an area instead.');},{timeout:12000,maximumAge:60000});});
$('retry-map').addEventListener('click',()=>{map?.remove();map=null;markers=[];initMap();});
function openHelp(){$('help').hidden=false;$('help-toggle').setAttribute('aria-expanded','true');$('help-close').focus();}
function closeHelp(){$('help').hidden=true;$('help-toggle').setAttribute('aria-expanded','false');$('help-toggle').focus();}
$('help-toggle').addEventListener('click',()=>{$('help').hidden?openHelp():closeHelp();});$('method-link').addEventListener('click',openHelp);$('help-close').addEventListener('click',closeHelp);document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('help').hidden)closeHelp();});
window.addEventListener('hashchange',()=>selectStation(location.hash.slice(1),true));
setInterval(()=>{if(dataset){applyChecks();renderList();renderDetail();}},60000);
// Let the map handle the gesture; cancel the browser's page-zoom default.
document.querySelector('.map-wrap').addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)event.preventDefault();},{passive:false,capture:true});
window.petrolReady=loadData();
