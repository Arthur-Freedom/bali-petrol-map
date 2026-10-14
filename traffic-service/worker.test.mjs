import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,TrafficBudget,measure,metres,ORIGIN,OWNER,COOLDOWN,STATIONS} from './worker.mjs';
import P from '../dist/core.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status});
function encode(points){let lat=0,lng=0,out='';const number=n=>{let v=n<0?~(n<<1):n<<1,s='';while(v>=32){s+=String.fromCharCode((32|(v&31))+63);v>>=5;}return s+String.fromCharCode(v+63);};for(const p of points){const a=Math.round(p[1]*1e5),b=Math.round(p[0]*1e5);out+=number(a-lat)+number(b-lng);lat=a;lng=b;}return out;}
const route=(points,intervals)=>({polyline:{encodedPolyline:encode(points)},travelAdvisory:{speedReadingIntervals:intervals}});
const traffic=points=>route(points,[{endPolylinePointIndex:points.length-1,speed:'NORMAL'}]);
function setup({owner=OWNER,authStatus=200,upstream}={}){
 let time=Date.parse('2026-10-15T00:00:00+08:00'),calls=[],authCalls=0;
 const records=new Map(),budget=new TrafficBudget({storage:{get:async k=>records.get(k),put:async(k,v)=>records.set(k,v)}},{},{now:()=>time});
 const env={GOOGLE_ROUTES_KEY:'secret-key',GOOGLE_MAPS_BROWSER_KEY:'map-key',OWNER_AUTH:{fetch:async()=>{authCalls++;return json({ownerId:owner},authStatus)}},TRAFFIC_BUDGET:{idFromName:s=>s,get:()=>budget}};
 const handler=createHandler({now:()=>time,fetch:async(url,options)=>{calls.push({url,options});if(upstream)return upstream();const body=JSON.parse(options.body),end=body.destination.location.latLng;return json({routes:[traffic([[end.longitude-.012,end.latitude],[end.longitude,end.latitude]])]});}});
 const request=({token='remembered.'+'a'.repeat(43),origin=ORIGIN,body='{}',method='POST',path='/api/refresh'}={})=>handler(new Request('https://test'+path,{method,headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='POST'?{body}:{})}),env);
 return {request,calls,records,budget,authCalls:()=>authCalls,advance:n=>time+=n};
}
test('unauthenticated, wrong identity, spoofed origin and arbitrary body make zero billable calls',async()=>{
 for(const options of [{token:''},{token:'fake'},{origin:'https://evil.example'},{body:'{"stations":[1]}'}]){const s=setup();assert.ok((await s.request(options)).status>=400);assert.equal(s.calls.length,0);assert.equal(s.records.size,0);}
 for(const opts of [{owner:'999'},{authStatus:401},{authStatus:503}]){const s=setup(opts);assert.ok((await s.request()).status>=400);assert.equal(s.calls.length,0);assert.equal(s.records.size,0);}
});
test('concurrent owner refreshes admit only five fixed Google queries and never return the key',async()=>{
 const s=setup(),responses=await Promise.all([s.request(),s.request()]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,429]);assert.equal(s.calls.length,5);assert.equal(s.authCalls(),2);
 const response=responses.find(r=>r.ok),text=await response.text();assert.ok(!text.includes('secret-key'));assert.equal(response.headers.get('Cache-Control'),'no-store');
 const data=JSON.parse(text);assert.equal(data.stations.length,5);assert.ok(data.stations.every(x=>x.jamMetres===0&&x.checkedAt));assert.equal(data.remaining,9);
 for(let i=0;i<5;i++){const body=JSON.parse(s.calls[i].options.body);assert.equal(body.destination.location.latLng.longitude,STATIONS[i].end[0]);assert.equal(body.routingPreference,'TRAFFIC_AWARE_OPTIMAL');assert.equal(s.calls[i].options.redirect,'manual');}
 assert.deepEqual([...s.records.keys()],['budget']);assert.ok(!JSON.stringify([...s.records]).includes('segments'));
});
test('daily budget survives cooldowns and resets at Bali midnight',async()=>{
 const s=setup();for(let i=0;i<10;i++){assert.equal((await s.request()).status,200);s.advance(COOLDOWN);}
 assert.equal((await s.request()).status,429);assert.equal(s.calls.length,50);s.advance(86400000);assert.equal((await s.request()).status,200);
});
test('partial upstream failure does not invent clear roads or a fresh timestamp',async()=>{
 const s=setup({upstream:()=>json({error:{message:'secret-key internal'}},403)}),r=await s.request(),data=await r.json();assert.ok(data.stations.every(s=>s.error&&!s.checkedAt&&s.jamMetres===undefined));assert.ok(!JSON.stringify(data).includes('secret-key'));assert.equal(data.remaining,9);
});
test('segment lengths use metres, shared endpoints once, clipped final kilometre',()=>{
 const points=[[0,0],[.004,0],[.008,0],[.012,0]],r=route(points,[{endPolylinePointIndex:1,speed:'TRAFFIC_JAM'},{startPolylinePointIndex:1,endPolylinePointIndex:2,speed:'SLOW'},{startPolylinePointIndex:2,endPolylinePointIndex:3,speed:'NORMAL'}]),m=measure(r,points.at(-1));
 assert.equal(m.approachMetres,1000);assert.ok(Math.abs(m.jamMetres-(1000-2*metres(points[0],points[1])))<6);assert.equal(m.slowMetres,440);assert.equal(m.segments.length,3);
});
test('missing coverage, malformed intervals and endpoints far from station fail closed',()=>{
 const points=[[0,0],[.01,0]];for(const r of [route(points,[]),route(points,[{endPolylinePointIndex:5,speed:'NORMAL'}]),route(points,[{startPolylinePointIndex:1,endPolylinePointIndex:1,speed:'NORMAL'}])])assert.throws(()=>measure(r,points.at(-1)));
 assert.throws(()=>measure(traffic(points),[10,10]));
});
test('live traffic never renews old opening, stock or queue reports',()=>{
 const now=Date.now(),base={checkedAt:new Date(now-3600001).toISOString(),stock:{pertalite:'out',pertamax:'out'},operatingStatus:'closed',waitMinutes:[90,120]},reading={jamMetres:0,slowMetres:0,approachMetres:1000,checkedAt:new Date(now).toISOString()};
 const merged=P.mergeLive(base,reading,now);assert.equal(merged.operatingStatus,'unknown');assert.equal(merged.waitMinutes,null);assert.equal(P.status(merged).blocked,false);assert.equal(P.status(merged).wait,null);assert.equal(merged.stock.pertalite,'unknown');
 const recent=P.mergeLive({...base,checkedAt:reading.checkedAt},reading,now);assert.equal(P.status(recent).blocked,true);
});
