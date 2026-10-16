const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/core.js'),catalog=require('../dist/stations.json');
const now=Date.parse('2026-10-15T02:10:00+08:00'),at='2026-10-15T02:00:00+08:00';
const unmapped=()=>({method:'entrance-road-v1',status:'unmapped',routes:[],selectedId:null});
const station=(id,jamMetres,extra={})=>{const jam=Math.min(200,jamMetres||0),slow=Math.min(200-jam,extra.slowMetres||0),run=jam+slow;return {id,name:id,shortName:id,coordinates:[115,-8],jamMetres,slowMetres:0,coveredMetres:2000,closedMetres:0,checkedAt:at,approach:Number.isFinite(jamMetres)?{method:'entrance-road-v1',status:'matched',selectedId:'road',routes:[{id:'road',continuousSlowMetres:run,jamMetres:jam,slowMetres:slow,closedMetres:0,targetMetres:200,pathMetres:200,coveredMetres:200,complete:true,extent:run===200?'limit':'ended'}]}:unmapped(),...extra};};
test('Google listed closures never override congestion or exclude a station',()=>{
 const low=station('quiet',0,{operatingStatus:'closed',operatingSource:'google_listing',operatingCheckedAt:at}),busy=station('busy',700);
 assert.equal(P.status(low,now).label,'No slow roads reported');assert.equal(P.status(low,now).blocked,false);assert.equal(P.opening(low,now).label,'Listed closed · unverified');assert.equal(P.ordered([busy,low],null,now)[0].id,'quiet');
});

test('a flowing approach and slow surrounding roads remain distinct visible measurements',()=>{
 const s=station('zero-approach',0);s.jamMetres=80;s.slowMetres=120;
 assert.equal(P.approachSummary(s),'No slowdown detected on approach');
 assert.equal(P.nearbyLabel(s),'Nearby: ≈ 200 m slow / congested');
 assert.equal(P.approachRoute(s).continuousSlowMetres,0);
 s.approach.status='partial';assert.equal(P.approachSummary(s),'Approach partly covered');
 assert.equal(P.nearbyLabel({}),'Nearby traffic unknown');
});
test('only a recent explicit firsthand closure can block, never a legacy unsourced closure',()=>{
 const s=station('x',0,{operatingStatus:'closed',operatingCheckedAt:at});assert.equal(P.status(s,now).blocked,false);
 assert.equal(P.status({...s,operatingSource:'firsthand'},now).blocked,true);
 assert.equal(P.status({...s,operatingSource:'firsthand'},Date.parse(at)+23*60000).blocked,false);
 assert.equal(P.status({...s,operatingSource:'firsthand',operatingCheckedAt:'2026-10-14T00:00:00+08:00'},now).blocked,false);
});
test('traffic refresh never freshens opening information or invents waiting minutes',()=>{
 const s=station('x',null,{operatingStatus:'closed',operatingSource:'firsthand',operatingCheckedAt:'2026-10-14T00:00:00+08:00'}),merged=P.mergeLive(s,{jamMetres:0,checkedAt:at});assert.equal(P.status(merged,now).blocked,false);assert.equal(merged.operatingCheckedAt,s.operatingCheckedAt);assert.equal(merged.waitMinutes,undefined);
});
test('unknown, failed and stale readings cannot beat current observations',()=>{
 const old=station('old',0,{checkedAt:'2026-10-14T00:00:00+08:00'}),failed=station('failed',0,{refreshFailed:true}),unknown=station('unknown',null),fresh=station('fresh',900);
 assert.equal(P.ordered([old,failed,unknown,fresh],null,now)[0].id,'fresh');assert.equal(P.status(old,now).label,'Earlier: no slow roads reported');assert.equal(P.status(unknown,now).label,'Not checked');
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
 assert.equal(P.status(zero,now).tone,'neutral');assert.equal(P.status(zero,now).label,'No slow roads reported');
 assert.equal(P.status(orange,now).tone,'medium');assert.equal(P.status(red,now).tone,'long');
 assert.deepEqual(P.ordered([orange,zero,red],null,now).map(s=>s.id),['zero','red','orange']);
 assert.equal(P.compareTraffic(zero,station('also-zero',0,{slowMetres:0})),0);
});

test('extra sampled roads cannot dilute the nearby slowdown total, and entrance mapping does not suppress valid traffic',()=>{
 const a=station('few-roads',0,{slowMetres:150,coveredMetres:500}),b=station('many-roads',0,{slowMetres:150,coveredMetres:2000}),c=station('longer',0,{slowMetres:200,coveredMetres:3000});
 assert.equal(P.compareTraffic(a,b),0);assert.ok(P.compareTraffic(a,c)<0);assert.equal(P.status(a,now).waitMinutes,undefined);
 const unknown=station('no-access',0,{approach:unmapped()});assert.equal(P.status(unknown,now).rankable,true);assert.equal(P.ordered([unknown,c],null,now)[0].id,'no-access');
});

test('refresh planning respects the monthly balance even after the daily counter resets',()=>{
 const list=Array.from({length:5},(_,i)=>station('s'+i,null)),budget={remainingChecks:0,resetAt:now-1,remainingMonthlyChecks:2,monthlyResetAt:now+86400000,monthlyLimit:900};
 assert.equal(P.refreshPlan(list,[115,-8],budget,'area',now).targets.length,2);
 assert.equal(P.refreshPlan(list,[115,-8],{...budget,remainingMonthlyChecks:0},'area',now).targets.length,0);
 assert.equal(P.refreshPlan(list,[115,-8],{...budget,monthlyResetAt:now-1},'area',now).targets.length,5);
});

test('traffic responses require current timestamps, complete numbers and usable geometry',()=>{
 const reading={id:'one',approach:unmapped(),provider:'tomtom-orbis-v2',radiusMetres:250,nearestRoadMetres:20,closedMetres:0,jamMetres:100,slowMetres:200,coveredMetres:1000,checkedAt:at,segments:[{from:[115,-8],to:[115.001,-8],speed:'SLOW',relativeSpeed:.5,closed:false}]},clock=Date.parse(at)+1000;
 assert.equal(P.validReading(reading,'one',clock),true);
 for(const patch of [{slowMetres:undefined},{jamMetres:-1},{coveredMetres:0},{jamMetres:2000},{checkedAt:'not a date'},{checkedAt:new Date(clock+61000).toISOString()},{checkedAt:new Date(clock-300001).toISOString()},{segments:[]},{segments:[{from:[null,-8],to:[115,-8],speed:'NORMAL'}]}])assert.equal(P.validReading({...reading,...patch},'one',clock),false);
 assert.equal(P.validReading(reading,'another-station',clock),false);
});

test('traffic stays comparable for two hours while refresh eligibility remains independent',()=>{
 const s=station('one',100),base=Date.parse(at);
 for(const age of [23*60000,2*60*60000-1]){
  const clock=base+age;
  assert.equal(P.fresh(at,clock),true);assert.equal(P.status(s,clock).rankable,true);
  assert.equal(P.refreshPlan([s],[115,-8],{remainingChecks:1,stationNextAt:{one:base+15*60000}},'area',clock).targets.length,1);
 }
 assert.equal(P.fresh(at,base+2*60*60000),false);assert.equal(P.status(s,base+2*60*60000).rankable,false);
 assert.equal(P.fresh('not a date',base),false);assert.equal(P.fresh(new Date(base+61000).toISOString(),base),false);
});

test('traffic geometry must stay near the requested station and use the expected provider',()=>{
 const reading={id:'one',approach:unmapped(),provider:'tomtom-orbis-v2',radiusMetres:250,nearestRoadMetres:0,closedMetres:0,jamMetres:0,slowMetres:0,coveredMetres:500,checkedAt:at,segments:[{from:[115,-8],to:[115.001,-8],speed:'NORMAL',relativeSpeed:1,closed:false}]};
 assert.equal(P.validReading(reading,'one',Date.parse(at),[116,-8]),false);
 assert.equal(P.validReading({...reading,provider:'google'},'one',Date.parse(at)),false);
 assert.equal(P.validReading({...reading,segments:[{...reading.segments[0],relativeSpeed:.1}]},'one',Date.parse(at)),false);
});

test('insufficient nearby coverage, a failed refresh and stale zeros cannot win the current road comparison',()=>{
 const busy=station('busy',150),partial=station('partial',0);partial.approach.status='partial';partial.coveredMetres=100;
 const failed=station('failed',0,{refreshFailed:true}),old=station('old',0,{checkedAt:'2026-10-14T00:00:00Z'});
 assert.equal(P.ordered([partial,failed,old,busy],null,now)[0].id,'busy');
 for(const s of [partial,failed,old])assert.equal(P.status(s,now).rankable,false);
});
test('reported nearby road closures rank last without claiming the station is closed',()=>{
 const closed=station('closure',20),long=station('long',200);closed.closedMetres=20;closed.approach.routes[0].closedMetres=20;
 assert.ok(P.compareTraffic(closed,long)>0);assert.equal(P.status(closed,now).label,'Road closure reported nearby');assert.equal(P.status(closed,now).blocked,false);
 const side={...long,closedMetres:20,approach:{...long.approach,routes:[...long.approach.routes,{...closed.approach.routes[0],id:'other'}]}};assert.ok(P.compareTraffic(side,long)>0);
});
test('trend requires comparable directions, coverage, timestamps and successful readings',()=>{
 const old=station('s',50),next=station('s',100,{checkedAt:new Date(Date.parse(at)+900000).toISOString()});
 assert.equal(P.withTrend(null,next).trend.state,'first');assert.equal(P.withTrend(old,next).trend.state,'longer');assert.equal(P.withTrend(next,{...old,checkedAt:new Date(Date.parse(at)+1800000).toISOString()}).trend.state,'shorter');
 for(const previous of [{...old,refreshFailed:true},{...old,checkedAt:next.checkedAt},{...old,checkedAt:'2026-10-14T00:00:00Z'},{...old,approach:{...old.approach,status:'partial'}},{...old,approach:{...old.approach,selectedId:'other'}}])assert.equal(P.withTrend(previous,next).trend.state,'not_comparable');
 const limit=station('s',200),limit2={...limit,checkedAt:next.checkedAt};assert.equal(P.withTrend(limit,limit2).trend.state,'at_limit');
 const b=P.withTrend(old,next);assert.equal(b.trend.checks,2);assert.equal(b.trend.previousAt,at);assert.equal(b.history,undefined);
});
test('approach bounds remain honest without overriding the primary nearby-road comparison',()=>{
 const limit=station('s',200),r=P.approachRoute(limit);assert.equal(P.approachLabel(r),'200+ m');
 assert.equal(P.approachLabel({...r,extent:'gap',continuousSlowMetres:80}),'At least 80 m');assert.equal(P.approachLabel({...r,continuousSlowMetres:null}),'Unknown');
 const orange=station('orange',0,{slowMetres:200});assert.ok(P.compareTraffic(limit,orange)>0);
});


test('daily rollover uses the server ceiling rather than restoring the old 50-check cap',()=>{
 const list=Array.from({length:75},(_,i)=>station('s'+i,null));
 const plan=P.refreshPlan(list,[115,-8],{dailyLimit:1000,remainingChecks:0,resetAt:now-1,monthlyLimit:20000,remainingMonthlyChecks:500},'area',now);
 assert.equal(plan.targets.length,75);assert.equal(plan.batches.length,15);assert.equal(plan.remainingChecks,500);
});


test('the archived Jimbaran screenshot shows 320 m nearby even when its southbound approach is zero',()=>{
 const reading=require('./fixtures/jimbaran-20261016.json'),base=catalog.stations.find(s=>s.id===reading.id),s=P.mergeLive(base,reading),clock=Date.parse(reading.checkedAt)+60000;
 assert.equal(P.validSavedReading(reading,base.id,clock,base.coordinates),true);
 assert.equal(P.approachRoute(s).continuousSlowMetres,0);assert.equal(P.slowdown(s),319);
 assert.equal(P.nearbyValue(s),'≈ 320 m');assert.equal(P.nearbySummary(s),'≈ 320 m slow / congested nearby');
 assert.equal(P.status(s,clock).label,'Slow roads nearby');assert.equal(P.status(s,clock).tone,'medium');
 const less={...s,id:'less',shortName:'Less nearby slowdown',slowMetres:100};
 assert.ok(P.compareTraffic(s,less)>0);assert.equal(P.ordered([s,less],null,clock)[0].id,'less');
 const slow=reading.segments.filter(x=>x.speed!=='NORMAL');assert.ok(slow.every(x=>x.to[1]>x.from[1]));
 assert.ok(Math.abs(slow.reduce((n,x)=>n+P.distance(x.from,x.to)*1000,0)-319)<1);
 assert.equal(P.nearbyValue({...s,jamMetres:null,slowMetres:null}),'Unknown');
});
