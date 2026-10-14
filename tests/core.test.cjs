const test=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/core.js'),catalog=require('../dist/stations.json');
const now=Date.parse('2026-10-15T02:10:00+08:00'),at='2026-10-15T02:00:00+08:00';
const station=(id,jamMetres,extra={})=>({id,name:id,shortName:id,coordinates:[115,-8],jamMetres,checkedAt:at,...extra});
test('Google listed closures never override congestion or exclude a station',()=>{
 const low=station('quiet',0,{operatingStatus:'closed',operatingSource:'google_listing',operatingCheckedAt:at}),busy=station('busy',700);
 assert.equal(P.status(low,now).label,'Less busy');assert.equal(P.status(low,now).blocked,false);assert.equal(P.opening(low,now).label,'Listed closed · unverified');assert.equal(P.ordered([busy,low],null,now)[0].id,'quiet');
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
 assert.equal(P.ordered([old,failed,unknown,fresh],null,now)[0].id,'fresh');assert.equal(P.status(old,now).label,'Was less busy');assert.equal(P.status(unknown,now).label,'Not checked');
});
test('all requested areas contain mapped locations and groups cap at five',()=>{
 for(const id of ['kuta','legian','seminyak','canggu','denpasar','pererenan','ubud','gianyar']){const area=catalog.areas.find(a=>a.id===id),list=P.inScope(catalog.stations,area);assert.ok(list.length>0,id);assert.ok(P.batch(list,area.center).length<=5);}
 const area=catalog.areas.find(a=>a.id==='denpasar'),list=P.inScope(catalog.stations,area),a=P.batch(list,area.center),b=P.batch(list,area.center,1);assert.ok(!a.some(s=>b.some(t=>s.id===t.id)));
});
test('catalogue locations are unique, finite and traceable; new locations have no assumed hours',()=>{
 assert.ok(catalog.stations.length>200);assert.equal(new Set(catalog.stations.map(s=>s.id)).size,catalog.stations.length);
 for(const s of catalog.stations){assert.ok(s.coordinates.every(Number.isFinite));assert.ok(s.sourceUrl.startsWith('https://'));assert.ok(s.approachStart.every(Number.isFinite));if(s.id.startsWith('osm-'))assert.equal(s.operatingStatus,'unknown');}
});
