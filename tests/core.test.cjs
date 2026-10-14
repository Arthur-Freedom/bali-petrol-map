const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/core.js'),catalog=require('../dist/stations.json');
const now=Date.parse('2026-10-15T02:10:00+08:00'),at='2026-10-15T02:00:00+08:00';
const station=(id,jamMetres,extra={})=>({id,name:id,shortName:id,coordinates:[115,-8],jamMetres,checkedAt:at,...extra});
test('Google listed closures never override congestion or exclude a station',()=>{
 const low=station('quiet',0,{operatingStatus:'closed',operatingSource:'google_listing',operatingCheckedAt:at}),busy=station('busy',700);
 assert.equal(P.status(low,now).label,'No slowdown returned');assert.equal(P.status(low,now).blocked,false);assert.equal(P.opening(low,now).label,'Listed closed · unverified');assert.equal(P.ordered([busy,low],null,now)[0].id,'quiet');
});
test('only a recent explicit firsthand closure can block, never a legacy unsourced closure',()=>{
 const s=station('x',0,{operatingStatus:'closed',operatingCheckedAt:at});assert.equal(P.status(s,now).blocked,false);
 assert.equal(P.status({...s,operatingSource:'firsthand'},now).blocked,true);
 assert.equal(P.status({...s,operatingSource:'firsthand',operatingCheckedAt:'2026-10-14T00:00:00+08:00'},now).blocked,false);
});
test('traffic refresh never freshens opening information or invents waiting minutes',()=>{
 const s=station('x',null,{operatingStatus:'closed',operatingSource:'firsthand',operatingCheckedAt:'2026-10-14T00:00:00+08:00'}),merged=P.mergeLive(s,{jamMetres:0,checkedAt:at});assert.equal(P.status(merged,now).blocked,false);assert.equal(merged.operatingCheckedAt,s.operatingCheckedAt);assert.equal(merged.waitMinutes,undefined);
});
test('unknown, failed and stale readings cannot beat current observations',()=>{
 const old=station('old',0,{checkedAt:'2026-10-14T00:00:00+08:00'}),failed=station('failed',0,{refreshFailed:true}),unknown=station('unknown',null),fresh=station('fresh',900);
 assert.equal(P.ordered([old,failed,unknown,fresh],null,now)[0].id,'fresh');assert.equal(P.status(old,now).label,'Earlier: no slowdown returned');assert.equal(P.status(unknown,now).label,'Not checked');
});
test('all requested areas contain mapped locations and API batches cap at five',()=>{
 for(const id of ['kuta','legian','seminyak','canggu','denpasar','pererenan','ubud','gianyar']){const area=catalog.areas.find(a=>a.id===id),list=P.inScope(catalog.stations,area);assert.ok(list.length>0,id);assert.ok(P.refreshPlan(list,area.center).batches.every(b=>b.length<=5));}
 const area=catalog.areas.find(a=>a.id==='denpasar'),list=P.inScope(catalog.stations,area),[a,b]=P.refreshPlan(list,area.center).batches;assert.ok(!a.some(s=>b.some(t=>s.id===t.id)));
});
test('catalogue locations are unique, finite and traceable; new locations have no assumed hours',()=>{
 assert.ok(catalog.stations.length>200);assert.equal(new Set(catalog.stations.map(s=>s.id)).size,catalog.stations.length);
 for(const s of catalog.stations){assert.ok(s.coordinates.every(Number.isFinite));assert.ok(s.sourceUrl.startsWith('https://'));assert.ok(s.approachStart.every(Number.isFinite));if(s.id.startsWith('osm-'))assert.equal(s.operatingStatus,'unknown');}
});

test('one area refresh schedules all 15 stations immediately; cooldown only skips those already checked',()=>{
 const list=Array.from({length:15},(_,i)=>station('s'+i,null));
 let plan=P.refreshPlan(list,[115,-8],{remainingChecks:50},'area',now);
 assert.equal(plan.targets.length,15);assert.deepEqual(plan.batches.map(b=>b.length),[5,5,5]);
 const stationNextAt=Object.fromEntries(plan.batches[0].map(s=>[s.id,now+900000]));
 plan=P.refreshPlan(list,[115,-8],{remainingChecks:45,stationNextAt},'area',now);
 assert.equal(plan.targets.length,10);assert.equal(plan.cooling,5);
 assert.ok(plan.targets.every(s=>!stationNextAt[s.id]));
});

test('oldest mode prioritizes unchecked, then oldest readings, and respects cooldown and exact remaining checks',()=>{
 const list=[station('recent',0),station('old',0,{checkedAt:'2026-10-13T00:00:00Z'}),station('unchecked',null,{checkedAt:null}),station('cooling',null,{checkedAt:null})];
 const budget={remainingChecks:2,stationNextAt:{cooling:now+900000}};
 const plan=P.refreshPlan(list,[115,-8],budget,'oldest',now);
 assert.deepEqual(plan.targets.map(s=>s.id),['unchecked','old']);assert.equal(plan.limited,true);
 assert.equal(P.refreshPlan([list[1]],[115,-8],{remainingChecks:1},'area',now).targets.length,1);
 assert.equal(P.refreshPlan(list,[115,-8],{remainingChecks:0},'area',now).targets.length,0);
 assert.equal(P.refreshPlan(list,[115,-8],{...budget,remainingChecks:0,resetAt:now-1},'area',now).targets.length,4);
});

test('Google Maps links open the place or coordinate pin, never a directions request',()=>{
 for(const s of [catalog.stations[0],catalog.stations.find(s=>s.id.startsWith('osm-'))]){
  const url=new URL(P.placeUrl(s));assert.equal(url.pathname,'/maps/search/');assert.equal(url.searchParams.get('api'),'1');
  assert.equal(url.searchParams.get('query'),`${s.coordinates[1]},${s.coordinates[0]}`);
  assert.equal(url.searchParams.get('query_place_id'),s.placeId||null);
  assert.ok(!url.searchParams.has('origin')&&!url.searchParams.has('destination')&&!url.searchParams.has('dir_action'));
 }
});

test('all-NORMAL responses stay neutral, and orange-only traffic affects classification and ranking',()=>{
 const zero=station('zero',0,{slowMetres:0}),orange=station('orange',0,{slowMetres:600}),red=station('red',10,{slowMetres:0});
 assert.equal(P.status(zero,now).tone,'neutral');assert.equal(P.status(zero,now).label,'No slowdown returned');
 assert.equal(P.status(orange,now).tone,'medium');assert.equal(P.status(red,now).tone,'long');
 assert.deepEqual(P.ordered([orange,zero,red],null,now).map(s=>s.id),['zero','red','orange']);
 assert.equal(P.compareTraffic(zero,station('also-zero',0,{slowMetres:0})),0);
});

test('compare the proportion sampled, then congestion severity, without inventing a queue estimate',()=>{
 const a=station('half',0,{slowMetres:500,approachMetres:1000}),b=station('all',0,{slowMetres:500,approachMetres:500}),c=station('jam',500,{slowMetres:0,approachMetres:1000});
 assert.ok(P.compareTraffic(a,b)<0);assert.ok(P.compareTraffic(a,c)<0);assert.equal(P.status(a,now).waitMinutes,undefined);
});
