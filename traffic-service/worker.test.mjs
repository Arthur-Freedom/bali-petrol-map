import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,TrafficBudget,measure,metres,ORIGIN,OWNER,COOLDOWN,STATIONS,ALL_STATIONS} from './worker.mjs';
import P from '../dist/core.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status});
function encode(points){let lat=0,lng=0,out='';const number=n=>{let v=n<0?~(n<<1):n<<1,s='';while(v>=32){s+=String.fromCharCode((32|(v&31))+63);v>>=5;}return s+String.fromCharCode(v+63);};for(const p of points){const a=Math.round(p[1]*1e5),b=Math.round(p[0]*1e5);out+=number(a-lat)+number(b-lng);lat=a;lng=b;}return out;}
const route=(points,intervals)=>({polyline:{encodedPolyline:encode(points)},travelAdvisory:{speedReadingIntervals:intervals}});
const traffic=points=>route(points,[{endPolylinePointIndex:points.length-1,speed:'NORMAL'}]);
function setup({owner=OWNER,authStatus=200,upstream}={}){
 let time=Date.parse('2026-10-15T00:00:00+08:00'),calls=[],authCalls=0;
 const records=new Map(),budget=new TrafficBudget({storage:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,v)}},{},{now:()=>time});
 const env={PAID_FEATURES_ENABLED:'true',TOMTOM_API_KEY:'secret-key',OWNER_AUTH:{fetch:async()=>{authCalls++;return json({ownerId:owner},authStatus)}},TRAFFIC_BUDGET:{idFromName:s=>s,get:()=>budget}};
 const handler=createHandler({now:()=>time,samplerFactory:({key})=>async station=>{
  calls.push({station,key});
  if(upstream){const response=upstream();if(!response.ok)throw Object.assign(Error('Upstream failed'),{code:response.status===429?'provider_limit':undefined});}
  return {provider:'tomtom-orbis-v2',radiusMetres:250,coveredMetres:500,jamMetres:0,slowMetres:0,closedMetres:0,nearestRoadMetres:0,segments:[{from:station.end,to:[station.end[0]+.001,station.end[1]],relativeSpeed:1,closed:false,speed:'NORMAL'}]};
 }});
 const request=({token='remembered.'+'a'.repeat(43),origin=ORIGIN,body='{}',method='POST',path='/api/refresh'}={})=>handler(new Request('https://test'+path,{method,headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='POST'?{body}:{})}),env);
 return {request,calls,records,budget,env,authCalls:()=>authCalls,advance:n=>time+=n};
}
test('unauthenticated, wrong identity, spoofed origin and arbitrary body make zero billable calls',async()=>{
 for(const options of [{token:''},{token:'fake'},{origin:'https://evil.example'},{body:'{"stations":[1]}'}]){const s=setup();assert.ok((await s.request(options)).status>=400);assert.equal(s.calls.length,0);assert.equal(s.records.size,0);}
 for(const opts of [{owner:'999'},{authStatus:401},{authStatus:503}]){const s=setup(opts);assert.ok((await s.request()).status>=400);assert.equal(s.calls.length,0);assert.equal(s.records.size,0);}
});
test('concurrent owner refreshes admit only five fixed station checks and never return the key',async()=>{
 const s=setup(),responses=await Promise.all([s.request(),s.request()]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,429]);assert.equal(s.calls.length,5);assert.equal(s.authCalls(),2);
 const response=responses.find(r=>r.ok),text=await response.text();assert.ok(!text.includes('secret-key'));assert.equal(response.headers.get('Cache-Control'),'no-store');
 const data=JSON.parse(text);assert.equal(data.stations.length,5);assert.ok(data.stations.every(x=>x.jamMetres===0&&x.checkedAt));assert.equal(data.remaining,9);
 for(let i=0;i<5;i++){assert.deepEqual(s.calls[i].station,STATIONS[i]);assert.equal(s.calls[i].key,'secret-key');}
 assert.deepEqual([...s.records.keys()],['budget']);assert.ok(!JSON.stringify([...s.records]).includes('segments'));
});
test('daily budget survives cooldowns and resets at Bali midnight',async()=>{
 const s=setup();for(let i=0;i<10;i++){assert.equal((await s.request()).status,200);s.advance(COOLDOWN);}
 assert.equal((await s.request()).status,429);assert.equal(s.calls.length,50);s.advance(86400000);assert.equal((await s.request()).status,200);
});
test('partial upstream failure does not invent clear roads or a fresh timestamp',async()=>{
 const s=setup({upstream:()=>json({error:{message:'secret-key internal'}},403)}),r=await s.request(),data=await r.json();assert.ok(data.stations.every(s=>s.error&&!s.checkedAt&&s.jamMetres===undefined));assert.ok(!JSON.stringify(data).includes('secret-key'));assert.equal(data.remaining,9);
});

test('TomTom quota errors are distinguishable so the client can stop the remaining area checks',async()=>{
 const s=setup({upstream:()=>json({},429)}),data=await(await s.request()).json();
 assert.equal(data.remainingChecks,45);assert.equal(s.calls.length,5);
 assert.ok(data.stations.every(s=>s.errorCode==='provider_limit'&&!s.checkedAt&&s.jamMetres===undefined));
});
test('segment lengths use metres, shared endpoints once, clipped final kilometre',()=>{
 const points=[[0,0],[.004,0],[.008,0],[.012,0]],r=route(points,[{endPolylinePointIndex:1,speed:'TRAFFIC_JAM'},{startPolylinePointIndex:1,endPolylinePointIndex:2,speed:'SLOW'},{startPolylinePointIndex:2,endPolylinePointIndex:3,speed:'NORMAL'}]),m=measure(r,points.at(-1));
 assert.equal(m.approachMetres,1000);assert.ok(Math.abs(m.jamMetres-(1000-2*metres(points[0],points[1])))<6);assert.equal(m.slowMetres,440);assert.equal(m.segments.length,3);
});
test('missing coverage, malformed intervals and endpoints far from station fail closed',()=>{
 const points=[[0,0],[.01,0]];for(const r of [route(points,[]),route(points,[{endPolylinePointIndex:5,speed:'NORMAL'}]),route(points,[{startPolylinePointIndex:1,endPolylinePointIndex:1,speed:'NORMAL'}])])assert.throws(()=>measure(r,points.at(-1)));
 assert.throws(()=>measure(traffic(points),[10,10]));
});
test('different catalogue groups can refresh while duplicate groups are blocked, including reordered IDs',async()=>{
 const s=setup(),ids=ALL_STATIONS.slice(5,8).map(s=>s.id);
 assert.equal((await s.request()).status,200);
 assert.equal((await s.request({body:JSON.stringify({stationIds:ids})})).status,200);
 assert.equal(s.calls.length,8);
 assert.equal((await s.request({body:JSON.stringify({stationIds:[...ids].reverse()})})).status,429);
 assert.equal(s.calls.length,8);
});
test('station selection rejects arbitrary coordinates, unknown IDs, duplicate IDs and more than five',async()=>{
 for(const body of [{stationIds:['not-real']},{stationIds:[]},{stationIds:ALL_STATIONS.slice(0,6).map(s=>s.id)},{stationIds:[STATIONS[0].id,STATIONS[0].id]},{stationIds:[STATIONS[0].id],origin:[0,0]}]){
  const s=setup();assert.equal((await s.request({body:JSON.stringify(body)})).status,400);assert.equal(s.calls.length,0);assert.equal(s.records.size,0);
 }
});
test('worker catalogue matches the public locations exactly',async()=>{
 const {readFile}=await import('node:fs/promises'),data=JSON.parse(await readFile(new URL('../dist/stations.json',import.meta.url)));
 assert.deepEqual(ALL_STATIONS,data.stations.map(s=>({id:s.id,end:s.coordinates,start:s.approachStart})));
});

test('15 distinct stations can be checked back-to-back at the same time',async()=>{
 const s=setup(),ids=ALL_STATIONS.slice(0,15).map(s=>s.id);let data;
 for(let i=0;i<15;i+=5){const r=await s.request({body:JSON.stringify({stationIds:ids.slice(i,i+5)})});assert.equal(r.status,200);data=await r.json();}
 assert.equal(s.calls.length,15);assert.equal(data.remainingChecks,35);
});

test('single station uses one check and cannot bypass cooldown by changing groups',async()=>{
 const s=setup(),ids=ALL_STATIONS.slice(0,2).map(s=>s.id);
 let r=await s.request({body:JSON.stringify({stationIds:[ids[0]]})});assert.equal((await r.json()).remainingChecks,49);
 assert.equal((await s.request({body:JSON.stringify({stationIds:ids})})).status,429);assert.equal(s.calls.length,1);
 r=await s.request({body:JSON.stringify({stationIds:[ids[1]]})});assert.equal(r.status,200);assert.equal((await r.json()).remainingChecks,48);
});

test('single-station refreshes still stop at exactly 50 daily station checks',async()=>{
 const s=setup();for(const station of ALL_STATIONS.slice(0,50))assert.equal((await s.request({body:JSON.stringify({stationIds:[station.id]})})).status,200);
 assert.equal((await s.request({body:JSON.stringify({stationIds:[ALL_STATIONS[50].id]})})).status,429);assert.equal(s.calls.length,50);
});

test('migration preserves previous spending and cooldowns across overlapping selections',async()=>{
 const s=setup(),day='2026-10-15',id=STATIONS[0].id,nextAt=Date.parse(day+'T00:15:00+08:00');
 s.records.set('budget',{day,count:3,groups:{[STATIONS.map(s=>s.id).sort().join(',')]:nextAt}});
 let data=await(await s.request({method:'GET',path:'/api/session'})).json();assert.equal(data.remainingChecks,35);assert.equal(data.stationNextAt[id],nextAt);
 assert.equal((await s.request({body:JSON.stringify({stationIds:[id]})})).status,429);
 assert.equal((await s.request({body:JSON.stringify({stationIds:[ALL_STATIONS[10].id]})})).status,200);
 data=await(await s.request({method:'GET',path:'/api/session'})).json();assert.equal(data.remainingChecks,34);
});

test('concurrent distinct requests cannot exceed the final daily check',async()=>{
 const s=setup();s.records.set('budget',{day:'2026-10-15',used:49,stationNextAt:{},groups:{}});
 const results=await Promise.all(ALL_STATIONS.slice(0,2).map(station=>s.request({body:JSON.stringify({stationIds:[station.id]})})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(s.calls.length,1);assert.equal(s.records.get('budget').used,50);
});

test('monthly limit survives daily resets and atomically blocks the 901st check',async()=>{
 const s=setup();s.records.set('budget',{day:'2026-10-15',used:0,month:'2026-10',monthlyUsed:899,stationNextAt:{},groups:{}});
 const results=await Promise.all(ALL_STATIONS.slice(0,2).map(station=>s.request({body:JSON.stringify({stationIds:[station.id]})})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(s.calls.length,1);assert.equal(s.records.get('budget').monthlyUsed,900);
 s.advance(86400000);assert.equal((await s.request()).status,429);assert.equal(s.calls.length,1);
 const limits=await(await s.request({method:'GET',path:'/api/session'})).json();assert.equal(limits.remainingChecks,50);assert.equal(limits.remainingMonthlyChecks,0);assert.equal(limits.monthlyResetAt,Date.parse('2026-11-01T00:00:00+08:00'));
 s.advance(16*86400000);assert.equal((await s.request()).status,200);assert.equal(s.records.get('budget').monthlyUsed,5);
});

test('failed upstream requests consume the monthly budget, without retries',async()=>{
 const s=setup({upstream:()=>json({},500)});s.records.set('budget',{day:'2026-10-15',used:0,month:'2026-10',monthlyUsed:895});
 const data=await(await s.request()).json();assert.equal(data.remainingMonthlyChecks,0);assert.equal(s.calls.length,5);
 s.advance(COOLDOWN);assert.equal((await s.request()).status,429);assert.equal(s.calls.length,5);
});

test('migrating the first usage day preserves charges even if first reconnect is tomorrow',async()=>{
 const s=setup();s.records.set('budget',{day:'2026-10-15',used:22,stationNextAt:{},groups:{}});s.advance(86400000);
 const data=await(await s.request({method:'GET',path:'/api/session'})).json();assert.equal(data.monthlyUsed,22);assert.equal(data.remainingChecks,50);assert.equal(s.records.get('budget').monthlyUsed,22);
});

test('disabled or missing kill-switch configuration exposes no key and makes no paid calls',async()=>{
 for(const enabled of ['false',undefined])for(const options of [{},{method:'GET',path:'/api/session'}]){
  const s=setup();s.env.PAID_FEATURES_ENABLED=enabled;const response=await s.request(options);assert.equal(response.status,503);assert.ok(!(await response.text()).includes('map-key'));assert.equal(s.calls.length,0);assert.equal(s.authCalls(),0);
 }
});

test('spending-guard failure and corrupt counters fail closed before key release or provider calls',async()=>{
 for(const mode of ['unavailable','corrupt'])for(const options of [{},{method:'GET',path:'/api/session'}]){
  const s=setup();if(mode==='unavailable')s.env.TRAFFIC_BUDGET.get=()=>({fetch:async()=>json({},503)});else s.records.set('budget',{day:'2026-10-15',used:-1,month:'2026-10',monthlyUsed:-1});
  const r=await s.request(options);assert.equal(r.status,503);assert.ok(!(await r.text()).includes('map-key'));assert.equal(s.calls.length,0);
 }
});

test('large bodies are rejected before identity lookups and paid requests',async()=>{
 const s=setup();assert.equal((await s.request({body:' '.repeat(4096)+'{}'})).status,400);assert.equal(s.calls.length,0);assert.equal(s.authCalls(),0);
});

test('spoofed origin with a plausible fake session and wrong owner never reveal the display key',async()=>{
 for(const options of [{authStatus:401},{owner:'other-user'}]){
  const s=setup(options),response=await s.request({method:'GET',path:'/api/session'});
  assert.ok([401,403].includes(response.status));assert.ok(!(await response.text()).includes('map-key'));assert.equal(s.calls.length,0);assert.equal(s.records.size,0);
 }
});

test('owner session returns provider metadata but no API credentials',async()=>{
 const s=setup(),data=await(await s.request({method:'GET',path:'/api/session'})).json();
 assert.equal(data.provider,'tomtom-orbis-v2');assert.equal(data.radiusMetres,250);assert.equal(data.mapsKey,undefined);assert.ok(!JSON.stringify(data).includes('secret-key'));assert.equal(s.calls.length,0);
});
test('missing TomTom secret fails before reserving a check',async()=>{
 const s=setup();delete s.env.TOMTOM_API_KEY;assert.equal((await s.request()).status,503);assert.equal(s.calls.length,0);assert.equal(s.records.size,0);
});

test('runtime incident restores only recorded broken-deployment admissions, exactly once',async()=>{
 const s=setup(),oldId=STATIONS[0].id,failedIds=STATIONS.slice(1,3).map(s=>s.id),oldAt=Date.parse('2026-10-15T03:00:00Z')+COOLDOWN,failedAt=Date.parse('2026-10-15T03:09:00Z')+COOLDOWN;
 s.advance(11.5*3600000);
 s.records.set('budget',{day:'2026-10-15',used:46,month:'2026-10',monthlyUsed:46,groups:{[oldId]:oldAt,[failedIds.join(',')]:failedAt},stationNextAt:{[oldId]:oldAt,...Object.fromEntries(failedIds.map(id=>[id,failedAt]))}});
 const session=()=>s.request({method:'GET',path:'/api/session'}).then(r=>r.json());
 const data=await session();assert.equal(data.remainingChecks,6);assert.equal(data.remainingMonthlyChecks,856);assert.equal(data.stationNextAt[oldId],oldAt);assert.equal(data.stationNextAt[failedIds[0]],undefined);
 assert.equal((await session()).remainingChecks,6);assert.equal(s.records.get('budget').recoveredChecks,2);
 assert.equal((await s.request({body:JSON.stringify({stationIds:failedIds})})).status,200);
 assert.equal((await session()).remainingChecks,4);assert.equal((await session()).remainingMonthlyChecks,854);
});
