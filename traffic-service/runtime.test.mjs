import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {fixtureTile} from './test-fixtures.mjs';
import STATIONS from './stations.mjs';
import P from '../dist/core.js';

test('complete refresh executes in workerd with its native fetch, real budget object and synthetic upstream',async()=>{
 const built=await build({stdin:{contents:"export {default,TrafficBudget} from './worker.mjs';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,format:'esm',platform:'browser',write:false});
 const origin='https://arthur-freedom.github.io',token='Bearer remembered.'+'a'.repeat(43),station=STATIONS.find(s=>s.id==='bypass-27');let calls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-10-06',host:'127.0.0.1',port:0,
  bindings:{PAID_FEATURES_ENABLED:'true',TOMTOM_API_KEY:'synthetic-test-key',ARCHIVE_EXPORT_KEY:'x'.repeat(43)},
  durableObjects:{TRAFFIC_BUDGET:{className:'TrafficBudget',useSQLite:true}},
  serviceBindings:{OWNER_AUTH:async req=>new Response(JSON.stringify({ownerId:'18115558'}),{status:req.headers.get('Authorization')===token?200:401})},
  outboundService:async req=>{
   calls++;const url=new URL(req.url),match=url.pathname.match(/\/tile\/15\/(\d+)\/(\d+)$/);
   assert.equal(url.origin,'https://api.tomtom.com');assert.ok(match);assert.equal(req.headers.get('TomTom-Api-Key'),'synthetic-test-key');
   return new Response(fixtureTile(Number(match[1]),Number(match[2]),station.end,station.access.routes[0].coordinates));
  }
 }));
 try{
  const invoke=(authorization=token)=>mf.dispatchFetch('https://test/api/refresh',{method:'POST',headers:{Origin:origin,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({stationIds:['bypass-27']})});
  assert.equal((await invoke('Bearer fake')).status,401);assert.equal(calls,0);
  const response=await invoke(),data=await response.json();assert.equal(response.status,200);
  assert.equal(data.stations[0].provider,'tomtom-orbis-v2',JSON.stringify(data.stations));assert.ok(data.stations[0].jamMetres>=199);assert.equal(data.dailyLimit,1000);assert.equal(data.dailyUsed,1);assert.equal(data.remainingChecks,999);assert.equal(calls,2);
  assert.equal(data.stations[0].approach.status,'matched');assert.equal(data.stations[0].approach.routes[0].continuousSlowMetres,200);assert.equal(P.validReading(data.stations[0],station.id,Date.now(),station.end),true);
  assert.equal((await invoke()).status,429);assert.equal(calls,2);
  assert.equal(data.archive.saved,true);
  const saved=await(await mf.dispatchFetch('https://test/api/saved',{headers:{Origin:origin,Authorization:token}})).json();
  assert.equal(saved.stations[0].checkedAt,data.stations[0].checkedAt);assert.equal(saved.stations[0].approach.routes[0].continuousSlowMetres,200);assert.equal(calls,2);
  const exported=await(await mf.dispatchFetch('https://test/internal/archive/export',{headers:{Authorization:'Bearer '+'x'.repeat(43)}})).json();
  assert.equal(exported.records.length,1);assert.equal(JSON.parse(exported.records[0].payload).status,'success');
  const ack=await mf.dispatchFetch('https://test/internal/archive/ack',{method:'POST',headers:{Authorization:'Bearer '+'x'.repeat(43),'Content-Type':'application/json'},body:JSON.stringify({commit:'a'.repeat(40),records:exported.records.map(({id,sha256})=>({id,sha256}))})});
  assert.equal(ack.status,200);assert.equal(calls,2);
 }finally{await mf.dispose();}
});
