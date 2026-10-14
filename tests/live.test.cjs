const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),P=require('../dist/core.js');
const source=fs.readFileSync('dist/live.js','utf8');

async function setup({onPost,monthlyRemaining=900}={}){
 const elements=new Map(),events=new Map(),posts=[],polylines=[],layers=[];
 const element=id=>({id,hidden:false,disabled:false,checked:false,value:id==='refresh-mode'?'area':'',dataset:{},style:{},addEventListener:(name,fn)=>events.set(id+':'+name,fn),querySelector:()=>({textContent:''})});
 const $=id=>id==='refresh-station'&&!elements.has(id)?null:(elements.has(id)?elements.get(id):(elements.set(id,element(id)),elements.get(id)));
 const base=Array.from({length:15},(_,i)=>({id:'s'+i,coordinates:[115+i*.001,-8],shortName:'Station '+i,checkedAt:null}));
 let remainingChecks=50,stationNextAt={};
 const limits=()=>({remainingChecks,stationNextAt:{...stationNextAt},resetAt:Date.now()+86400000,monthlyLimit:900,remainingMonthlyChecks:monthlyRemaining,monthlyResetAt:Date.now()+86400000});
 class MapStub{panTo(){}setZoom(){}fitBounds(){}addListener(){}getZoom(){return 13}}
 const context={P,$,selected:null,stations:base,dataset:{stations:base},map:{resize(){}},scopeCenter:()=>[115,-8],scopedStations:()=>context.stations,
  updateMarker(){},renderList(){},renderDetail(){},updateSnapshot(){},selectStation(){},
  applyChecks(){context.stations=base.map(s=>P.mergeLive(s,context.PetrolLive.readings.get(s.id)));},
  Date,Map,Set,Promise,URLSearchParams,encodeURIComponent,Error,
  google:{maps:{Map:MapStub,TrafficLayer:class{constructor(options){this.options=options;layers.push(this)}setMap(map){this.map=map}},ControlPosition:{RIGHT_CENTER:1},LatLngBounds:class{extend(){}},OverlayView:class{setMap(){}},Polyline:class{constructor(options){this.options=options;polylines.push(this)}setMap(map){this.map=map}}}},
  PetrolOwner:{get:()=> 'remembered.'+'a'.repeat(43),clear(){}},petrolReady:Promise.resolve(),
  document:{hidden:false,createElement:()=>element('pin'),addEventListener(){},head:{appendChild(){}}},addEventListener(){},setInterval(){},location:{},
  fetch:async(url,options)=>{
   if(options.method!=='POST')return new Response(JSON.stringify({...limits(),mapsKey:'fake-display-key'}));
   const ids=JSON.parse(options.body).stationIds;posts.push(ids);
   if(onPost)await onPost({ids,posts,context});
   remainingChecks-=ids.length;monthlyRemaining-=ids.length;for(const id of ids)stationNextAt[id]=Date.now()+900000;
   return new Response(JSON.stringify({...limits(),stations:ids.map(id=>({id,jamMetres:0,slowMetres:0,approachMetres:1000,checkedAt:new Date().toISOString(),segments:[{from:[115,-8],to:[115.01,-8],speed:'NORMAL'}]}))}));
  }};
 context.window=context;vm.runInNewContext(source,context);await new Promise(setImmediate);
 return {context,elements,events,posts,polylines,layers,$};
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

test('native traffic auto-refreshes; sampled NORMAL routes never paint green over it',async()=>{
 const s=await setup();assert.equal(s.layers.length,1);assert.equal(s.layers[0].options.autoRefresh,true);assert.ok(s.layers[0].map);
 await s.context.PetrolLive.refreshStation('s3');
 assert.equal(s.polylines.length,1);const line=s.polylines[0];assert.equal(line.options.strokeOpacity,0);assert.equal(line.options.strokeColor,'#285cab');assert.ok(line.options.icons.length);assert.equal(line.map,null);
 s.context.selected='s3';s.context.PetrolLive.updateMarkers();assert.ok(line.map);
 s.context.selected='s4';s.context.PetrolLive.updateMarkers();assert.equal(line.map,null);
 s.context.PetrolLive.clear();assert.equal(s.layers[0].map,null);assert.equal(s.$('road-legend').hidden,true);
});

test('an area refresh stops at the monthly balance and explains the monthly stop',async()=>{
 const s=await setup({monthlyRemaining:2});assert.equal(s.$('traffic-refresh').textContent,'Refresh next 2');
 await s.events.get('traffic-refresh:click')();assert.deepEqual(s.posts.map(p=>p.length),[2]);
 assert.equal(s.$('traffic-refresh').textContent,'Monthly safety limit');assert.equal(s.$('traffic-refresh').disabled,true);
 assert.match(s.$('check-budget').textContent,/48 station checks left today.*0\/900 left this month/);
 assert.match(s.$('refresh-summary').textContent,/More checks next month/);
});
