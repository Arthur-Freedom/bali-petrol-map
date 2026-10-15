const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),P=require('../dist/core.js');
const source=fs.readFileSync('dist/live.js','utf8');

async function setup({onPost,onRequest,monthlyRemaining=900,dailyRemaining=50,dailyLimit=50,monthlyLimit=900,provider='tomtom-orbis-v2',savedReadings=[],initialHandle='remembered.'+'a'.repeat(43)}={}){
 const elements=new Map(),events=new Map(),posts=[],sources=new Map(),layers=[],timers=new Map(),scripts=[];
 let handle=initialHandle,timerId=0;
 const element=id=>({id,hidden:false,disabled:false,checked:false,value:id==='refresh-mode'?'area':'',dataset:{},style:{},remove(){this.removed=true;},addEventListener:(name,fn)=>events.set(id+':'+name,fn),querySelector:()=>({textContent:''})});
 const $=id=>id==='refresh-station'&&!elements.has(id)?null:(elements.has(id)?elements.get(id):(elements.set(id,element(id)),elements.get(id)));
 const base=Array.from({length:15},(_,i)=>({id:'s'+i,coordinates:[115+i*.001,-8],shortName:'Station '+i,checkedAt:null}));
 let remainingChecks=dailyRemaining,stationNextAt={};
 const limits=()=>({dailyLimit,dailyUsed:dailyLimit-remainingChecks,remainingChecks,stationNextAt:{...stationNextAt},resetAt:Date.now()+86400000,monthlyLimit,remainingMonthlyChecks:monthlyRemaining,monthlyResetAt:Date.now()+86400000});
 class MapStub{panTo(){}setZoom(){}fitBounds(){}addListener(){}getZoom(){return 13}}
 const context={P,$,selected:null,stations:base,dataset:{stations:base},mapReady:true,map:{resize(){},isStyleLoaded:()=>false,getSource:id=>sources.get(id),addSource(id,source){sources.set(id,{...source,setData(data){this.data=data;}});},addLayer(layer){layers.push(layer);}},scopeCenter:()=>[115,-8],scopedStations:()=>context.stations,
  updateMarker(){},renderList(){},renderDetail(){},updateSnapshot(){},selectStation(){},
  applyChecks(){context.stations=base.map(s=>P.mergeLive(s,context.PetrolLive.readings.get(s.id)));},
  Date,Map,Set,Promise,URLSearchParams,encodeURIComponent,Error,TypeError,AbortController,AbortSignal,

  PetrolOwner:{get:()=>handle,clear(){handle='';}},petrolReady:Promise.resolve(),
  document:{hidden:false,createElement:()=>element('pin'),addEventListener(){},head:{appendChild(script){scripts.push(script);}}},addEventListener:(name,fn)=>events.set('window:'+name,fn),setInterval(){},setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout(id){timers.delete(id);},location:{},
  fetch:async(url,options)=>{
   if(onRequest){const reply=await onRequest({url,options,context});if(reply)return reply;}
   if(url.includes('/api/saved'))return new Response(JSON.stringify({schemaVersion:1,stations:savedReadings,next:null,archive:{pendingChecks:0,lastArchivedAt:null}}));
   if(url.endsWith('/api/logout'))return new Response('{}');
   if(options.method!=='POST')return new Response(JSON.stringify({...limits(),ownerId:'18115558',provider}));
   const ids=JSON.parse(options.body).stationIds;posts.push(ids);
   if(onPost){const reply=await onPost({ids,posts,context});if(reply)return reply;}
   remainingChecks-=ids.length;monthlyRemaining-=ids.length;for(const id of ids)stationNextAt[id]=Date.now()+900000;
   return new Response(JSON.stringify({...limits(),stations:ids.map(id=>({id,approach:{method:'entrance-road-v1',status:'unmapped',routes:[],selectedId:null},jamMetres:0,slowMetres:0,provider:'tomtom-orbis-v2',radiusMetres:250,coveredMetres:500,closedMetres:0,nearestRoadMetres:0,checkedAt:new Date().toISOString(),segments:[{from:base.find(s=>s.id===id).coordinates,to:[base.find(s=>s.id===id).coordinates[0]+.001,-8],speed:'NORMAL',relativeSpeed:1,closed:false}]}))}));
  }};
 context.window=context;vm.runInNewContext(source,context);await new Promise(setImmediate);
 return {context,elements,events,posts,sources,layers,timers,scripts,$,setHandle(value){handle=value;},resetCooldowns(){stationNextAt={};}};
}

test('area button actually checks all 15 back-to-back without timers or paid page-load calls',async()=>{
 const s=await setup();assert.equal(s.posts.length,0);assert.equal(s.$('traffic-refresh').textContent,'Refresh area · 15');
 await s.events.get('traffic-refresh:click')();
 assert.deepEqual(s.posts.map(p=>p.length),[5,5,5]);assert.equal(new Set(s.posts.flat()).size,15);
 assert.equal(s.context.PetrolLive.readings.size,15);assert.equal(s.$('traffic-refresh').disabled,true);
 assert.match(s.$('owner-status').textContent,/15 of 15 stations updated/);assert.match(s.$('check-budget').textContent,/35 station checks/);
});

test('selected-station refresh sends exactly that one ID, then oldest skips its fresh result',async()=>{
 const s=await setup();await s.context.PetrolLive.refreshStation('s3');assert.deepEqual(Array.from(s.posts[0]),['s3']);
 s.$('refresh-mode').value='oldest';await s.events.get('refresh-mode:change')();await s.events.get('traffic-refresh:click')();
 assert.equal(s.posts.length,2);assert.equal(s.posts[1].length,5);assert.ok(!s.posts[1].includes('s3'));
});

test('changing areas stops further paid batches after the in-flight batch finishes',async()=>{
 const s=await setup({onPost:({context})=>context.PetrolLive.scopeChanged()});
 await s.events.get('traffic-refresh:click')();assert.equal(s.posts.length,1);assert.equal(s.context.PetrolLive.readings.size,5);
 assert.match(s.$('owner-status').textContent,/remaining checks stopped/);
});

test('map colours use exactly the validated readings, with selection emphasis and no provider calls on map movement',async()=>{
 const s=await setup();assert.equal(s.posts.length,0);assert.equal(s.layers.length,4);
 await s.context.PetrolLive.refreshStation('s3');
 let features=s.sources.get('station-traffic').data.features;
 assert.equal(features.length,1);assert.equal(features[0].properties.color,'#43855c');assert.equal(features[0].properties.selected,false);
 s.context.selected='s3';s.context.PetrolLive.updateMarkers();features=s.sources.get('station-traffic').data.features;assert.equal(features[0].properties.selected,true);assert.equal(s.posts.length,1);
 s.context.PetrolLive.readings.get('s3').checkedAt=new Date(Date.now()-900001).toISOString();s.context.PetrolLive.updateMarkers();
 features=s.sources.get('station-traffic').data.features;assert.equal(features.length,1);assert.equal(features[0].properties.stale,true);assert.equal(features[0].properties.color,'#43855c');assert.equal(s.$('earlier-legend').hidden,false);assert.match(s.$('map-layer-note').textContent,/outdated/);
 assert.deepEqual(Array.from(s.layers.find(l=>l.id==='traffic-earlier-colours').paint['line-dasharray']),[2,2]);
 s.context.PetrolLive.clear();assert.equal(s.sources.get('station-traffic').data.features.length,0);assert.equal(s.$('road-legend').hidden,true);
});

test('using the last daily check retains the measurement and blocks all further paid requests',async()=>{
 const s=await setup({dailyRemaining:1});await s.context.PetrolLive.refreshStation('s3');
 const reading=s.context.PetrolLive.readings.get('s3'),time=reading.checkedAt;
 assert.equal(s.$('traffic-refresh').textContent,'Daily refresh limit');assert.equal(s.$('traffic-refresh').disabled,true);
 assert.match(s.$('refresh-summary').textContent,/Saved measurements remain visible with their original times/);
 await s.context.PetrolLive.refreshStation('s3');await s.events.get('traffic-refresh:click')();
 assert.equal(s.posts.length,1);assert.equal(s.context.PetrolLive.readings.get('s3').checkedAt,time);assert.equal(s.sources.get('station-traffic').data.features.length,1);
});

test('outdated approach dashes follow continuous geometry without joining gaps or colour changes',async()=>{
 const s=await setup();await s.context.PetrolLive.refreshStation('s3');const reading=s.context.PetrolLive.readings.get('s3');
 reading.checkedAt=new Date(Date.now()-3600000).toISOString();
 const point=n=>[115.003+n*.00001,-8],edge=(a,b,speed='SLOW')=>({from:point(a),to:point(b),speed,closed:false});
 reading.approach.routes=[{segments:[edge(1,0),edge(2,1),edge(4,3),edge(5,4,'TRAFFIC_JAM')]}];
 s.context.PetrolLive.updateMarkers();const approach=s.sources.get('station-traffic').data.features.filter(f=>f.properties.focus);
 assert.equal(approach.length,3);assert.deepEqual(JSON.parse(JSON.stringify(approach[0].geometry.coordinates)),[point(2),point(1),point(0)]);
 assert.ok(approach.every(f=>f.properties.stale));assert.notEqual(approach[1].properties.color,approach[2].properties.color);
});

test('zero budget on a new tab explains missing history without inventing or fetching readings',async()=>{
 const s=await setup({dailyRemaining:0});
 assert.equal(s.posts.length,0);assert.equal(s.context.PetrolLive.readings.size,0);
 assert.match(s.$('refresh-summary').textContent,/before archiving was enabled cannot be recovered/);
});

test('a transient reconnect failure preserves the last result, but a revoked session still clears it',async()=>{
 let state='ok';
 const s=await setup({onRequest:()=>{if(state==='offline')throw new TypeError('fetch failed');if(state==='revoked')return new Response(JSON.stringify({error:'Session expired'}),{status:401});}});
 await s.context.PetrolLive.refreshStation('s3');const time=s.context.PetrolLive.readings.get('s3').checkedAt;
 state='offline';await s.events.get('owner-login:click')();
 assert.equal(s.context.PetrolLive.readings.get('s3').checkedAt,time);assert.equal(s.sources.get('station-traffic').data.features.length,1);
 assert.match(s.$('owner-status').textContent,/Last measurements remain visible/);assert.equal(s.$('traffic-refresh').hidden,true);
 state='revoked';await s.events.get('owner-login:click')();assert.equal(s.context.PetrolLive.readings.size,0);assert.equal(s.posts.length,1);
});

test('an area refresh stops at the monthly balance and explains the monthly stop',async()=>{
 const s=await setup({monthlyRemaining:2});assert.equal(s.$('traffic-refresh').textContent,'Refresh next 2');
 await s.events.get('traffic-refresh:click')();assert.deepEqual(s.posts.map(p=>p.length),[2]);
 assert.equal(s.$('traffic-refresh').textContent,'Monthly safety limit');assert.equal(s.$('traffic-refresh').disabled,true);
 assert.match(s.$('check-budget').textContent,/48 station checks left today.*0\/900 left this month/);
 assert.match(s.$('refresh-summary').textContent,/More checks next month/);
});

test('connection failure preserves old values and dates but removes them from current ranking',async()=>{
 let fail=false;
 const s=await setup({onPost:()=>{if(fail)throw new TypeError('fetch failed');}});
 await s.context.PetrolLive.refreshStation('s3');
 const original={...s.context.PetrolLive.readings.get('s3')};
 fail=true;s.resetCooldowns();
 // Reconnect updates the client cooldowns as a different device would.
 await s.events.get('owner-login:click')();
 await s.context.PetrolLive.refreshStation('s3');
 const retained=s.context.PetrolLive.readings.get('s3');
 assert.equal(retained.checkedAt,original.checkedAt);assert.equal(retained.jamMetres,original.jamMetres);
 assert.equal(retained.refreshFailed,true);assert.equal(P.status(retained).fresh,false);
 assert.match(s.$('owner-status').textContent,/Connection lost/);assert.equal(s.posts.length,2);
});

test('missing, duplicate, malformed and unrequested rows never become successful traffic readings',async()=>{
 const s=await setup({onPost:()=>new Response(JSON.stringify({stations:[
  {id:'s0',jamMetres:0},
  {id:'s1',error:'No coverage'},
  {id:'s2',error:'duplicate'},{id:'s2',error:'duplicate'},
  {id:'outside-selection',jamMetres:0},
 ]}))});
 await s.events.get('traffic-refresh:click')();
 assert.equal(s.context.PetrolLive.readings.has('outside-selection'),false);
 assert.equal(s.context.PetrolLive.readings.size,5);assert.equal(s.posts.length,1);
 assert.ok([...s.context.PetrolLive.readings.values()].every(r=>r.refreshFailed&&!r.checkedAt));
 assert.match(s.$('owner-status').textContent,/incomplete results.*Remaining checks stopped/);
});

test('provider exhaustion stops remaining batches and automatic repeats',async()=>{
 const s=await setup({onPost:({ids})=>new Response(JSON.stringify({stations:ids.map(id=>({id,error:'Limit',errorCode:'provider_limit'}))}))});
 s.$('auto-refresh').checked=true;await s.events.get('auto-refresh:change')();await new Promise(setImmediate);
 assert.equal(s.posts.length,1);assert.equal(s.$('auto-refresh').checked,false);
 assert.match(s.$('owner-status').textContent,/TomTom’s request limit.*Remaining checks stopped/);
});

test('systemic provider failures stop after the first batch instead of spending an entire area budget',async()=>{
 for(const errorCode of ['provider_auth','provider_unavailable','provider_data']){
  const s=await setup({onPost:({ids})=>new Response(JSON.stringify({stations:ids.map(id=>({id,error:'Traffic service failed.',errorCode}))}))});
  s.$('auto-refresh').checked=true;await s.events.get('auto-refresh:change')();await new Promise(setImmediate);
  assert.equal(s.posts.length,1);assert.equal(s.$('auto-refresh').checked,false);assert.match(s.$('owner-status').textContent,/Traffic service failed.*Remaining checks stopped/);
 }
});

test('a hanging request times out, unlocks controls and is never retried automatically',async()=>{
 let hang=false;
 const s=await setup({onRequest:({options})=>hang?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))):undefined});
 hang=true;const running=s.events.get('traffic-refresh:click')();await new Promise(setImmediate);
 const timer=[...s.timers.values()].find(t=>t.ms===35000);assert.ok(timer);timer.fn();await running;
 assert.match(s.$('owner-status').textContent,/timed out.*No automatic retry/);
 assert.equal(s.$('traffic-refresh').disabled,false);assert.equal(s.posts.length,0);assert.equal(s.timers.size,0);
});

test('a late old-session 401 cannot erase a newly signed-in session',async()=>{
 let rejectOld,hold=false;
 const s=await setup({onRequest:({options})=>hold&&options.headers.Authorization.endsWith('a'.repeat(43))?new Promise(resolve=>{rejectOld=resolve;}):undefined});
 hold=true;const old=s.events.get('owner-login:click')();await new Promise(setImmediate);
 s.setHandle('remembered.'+'b'.repeat(43));s.events.get('window:owner-session-change')();await new Promise(setImmediate);
 rejectOld(new Response(JSON.stringify({error:'Expired'}),{status:401}));await old;
 assert.equal(s.context.PetrolOwner.get(),'remembered.'+'b'.repeat(43));assert.equal(s.context.PetrolLive.active,true);
 assert.match(s.$('owner-status').textContent,/Signed in as Arthur-Freedom/);
});

test('sign-out cancels further refresh batches and stale responses do not restore traffic',async()=>{
 let finish;
 const s=await setup({onPost:()=>new Promise(resolve=>{finish=resolve;})});
 const running=s.events.get('traffic-refresh:click')();await new Promise(setImmediate);
 await s.events.get('owner-logout:click')();finish();await running;
 assert.equal(s.posts.length,1);assert.equal(s.context.PetrolLive.readings.size,0);assert.equal(s.context.PetrolLive.active,false);
 assert.match(s.$('owner-status').textContent,/Signed out/);
});

test('provider version mismatch keeps refresh locked and asks for a reload',async()=>{
 const s=await setup({provider:'old-version'});assert.equal(s.$('traffic-refresh').hidden,true);assert.equal(s.$('owner-login').hidden,false);assert.equal(s.posts.length,0);assert.match(s.$('owner-status').textContent,/Reload this page/);
});


test('reload restores yesterday’s measurement and its overlay at zero daily budget without any refresh POST',async()=>{
 const first=await setup();await first.context.PetrolLive.refreshStation('s3');
 const saved={...first.context.PetrolLive.readings.get('s3'),checkedAt:new Date(Date.now()-86400000).toISOString()};
 const reloaded=await setup({dailyRemaining:0,savedReadings:[saved]});
 assert.equal(reloaded.posts.length,0);assert.equal(reloaded.context.PetrolLive.readings.get('s3').checkedAt,saved.checkedAt);
 assert.equal(reloaded.sources.get('station-traffic').data.features.length,1);assert.equal(reloaded.sources.get('station-traffic').data.features[0].properties.stale,true);
 assert.equal(P.status(reloaded.context.stations.find(s=>s.id==='s3')).rankable,false);assert.match(reloaded.$('owner-status').textContent,/Loaded 1 saved measurement\./);
 assert.match(reloaded.$('refresh-summary').textContent,/including after a reload/);
});

test('an archive save failure retains current values but stops remaining paid batches and repeats',async()=>{
 let base;const first=await setup();await first.context.PetrolLive.refreshStation('s0');base=first.context.PetrolLive.readings.get('s0');
 const s=await setup({onPost:({ids})=>new Response(JSON.stringify({stations:ids.map(id=>({...base,id,segments:[{...base.segments[0],from:[115+Number(id.slice(1))*.001,-8],to:[115+Number(id.slice(1))*.001+.001,-8]}]})),archive:{saved:false,error:'Measurements could not be saved. Further checks stopped; keep this tab open.'}}))});
 s.$('auto-refresh').checked=true;await s.events.get('auto-refresh:change')();await new Promise(setImmediate);
 assert.equal(s.posts.length,1);assert.equal(s.context.PetrolLive.readings.size,5);assert.equal(s.$('auto-refresh').checked,false);assert.match(s.$('owner-status').textContent,/could not be saved/);
});


test('signed-out visitors load the public GitHub backup without calling the Worker or TomTom',async()=>{
 const first=await setup();await first.context.PetrolLive.refreshStation('s3');
 const saved={...first.context.PetrolLive.readings.get('s3'),checkedAt:new Date(Date.now()-3600000).toISOString()},urls=[];
 const s=await setup({initialHandle:'',onRequest:({url})=>{
   urls.push(url);assert.ok(url.startsWith('https://raw.githubusercontent.com/Arthur-Freedom/bali-petrol-map/refs/heads/traffic-history/'));
   return new Response(JSON.stringify(url.includes('index.json')?{schemaVersion:1,updatedAt:saved.checkedAt,stations:{s3:{checkedAt:saved.checkedAt,lastAttemptStatus:'success'}}}:saved));
 }});
 assert.equal(urls.length,2);assert.equal(s.posts.length,0);assert.equal(s.context.PetrolLive.readings.get('s3').checkedAt,saved.checkedAt);
 assert.equal(s.$('traffic-refresh').hidden,true);assert.equal(s.$('archive-status').hidden,false);assert.match(s.$('archive-status').textContent,/GitHub backup/);
 assert.equal(s.sources.get('station-traffic').data.features[0].properties.stale,true);
});


test('server allowance replaces the old 50-check cap and shows accurate usage',async()=>{
 const s=await setup({dailyRemaining:950,dailyLimit:1000,monthlyRemaining:19100,monthlyLimit:20000});
 assert.equal(s.$('traffic-refresh').disabled,false);
 assert.match(s.$('check-budget').textContent,/950 station checks left today.*50\/1000 used.*19100\/20000/);
 await s.events.get('traffic-refresh:click')();
 assert.equal(s.posts.flat().length,15);assert.equal(s.context.PetrolLive.readings.size,15);
 assert.match(s.$('check-budget').textContent,/935 station checks left today.*65\/1000 used/);
});
