import test from 'node:test';
import assert from 'node:assert/strict';
import Pbf from 'pbf';
import {createSampler,decodeTile,measureTiles,tilesFor,ZOOM} from './traffic.mjs';
import STATIONS from './stations.mjs';
const center=[115.2,-8.8],east=m=>[center[0]+m/(6371000*Math.PI/180*Math.cos(center[1]*Math.PI/180)),center[1]];
const tiles=(lines,c=center)=>tilesFor(c).map(t=>({...t,lines}));
const line=(a,b,relativeSpeed=1,closed=false)=>({coordinates:[a,b],relativeSpeed,closed});

test('circle clipping counts only 500 m across a 250 m radius, even with tile margins',()=>{
 const reading=measureTiles(tiles([line(east(-1000),east(1000),.2)]),center);
 assert.equal(reading.coveredMetres,500);assert.equal(reading.jamMetres,500);assert.equal(reading.slowMetres,0);assert.equal(reading.nearestRoadMetres,0);
});
test('tile seams and exact duplicates do not double count; opposite directions stay separate',()=>{
 const road=line(east(-1000),east(1000),.5),reverse=line(east(1000),east(-1000),1);
 const reading=measureTiles(tiles([road,road,reverse]),center);
 assert.equal(reading.coveredMetres,1000);assert.equal(reading.slowMetres,500);assert.equal(reading.jamMetres,0);
});
test('incomplete, distant and malformed traffic cannot become a zero-congestion reading',()=>{
 assert.throws(()=>measureTiles(tiles([]),center));
 assert.throws(()=>measureTiles(tiles([line(east(0),east(100))]),center));
 const offset=p=>[p[0],p[1]+.0015];
 assert.throws(()=>measureTiles(tiles([line(offset(east(-300)),offset(east(300)))]),center));
 assert.throws(()=>measureTiles(tiles([line(east(-300),east(300),NaN)]),center));
});
test('every catalogue station fits within the hard four-tile limit',()=>{
 for(const s of STATIONS){const t=tilesFor(s.end);assert.ok(t.length>=1&&t.length<=4,s.id);}
});

// Synthetic MVT: no downloaded traffic is stored in the test suite.
function vectorBytes({category='primary',relative=.2,closed=false}={}){
 const p=new Pbf();
 p.writeMessage(3,(_,layer)=>{
  layer.writeStringField(1,'Traffic flow');layer.writeVarintField(15,2);layer.writeVarintField(5,4096);
  for(const k of ['road_category','relative_speed','road_closure'])layer.writeStringField(3,k);
  layer.writeMessage(4,(_,v)=>v.writeStringField(1,category),null);
  layer.writeMessage(4,(_,v)=>v.writeDoubleField(3,relative),null);
  layer.writeMessage(4,(_,v)=>v.writeBooleanField(7,closed),null);
  layer.writeMessage(2,(_,f)=>{f.writeVarintField(3,2);f.writePackedVarint(2,[0,0,1,1,2,2]);f.writePackedVarint(4,[9,2000,4000,10,4000,0]);},null);
 });return p.finish();
}
test('real MVT decoding reads Orbis relative speed, filters motorways, and distinguishes road closures',()=>{
 const {x,y}=tilesFor(center)[0];
 const tile=decodeTile(vectorBytes(),x,y);assert.equal(tile.lines.length,1);assert.equal(tile.lines[0].relativeSpeed,.2);assert.equal(tile.lines[0].closed,false);
 for(const category of ['motorway','motorway_link','track'])assert.equal(decodeTile(vectorBytes({category}),x,y).lines.length,0);
 assert.equal(decodeTile(vectorBytes({closed:true}),x,y).lines[0].relativeSpeed,0);
 assert.equal(decodeTile(vectorBytes({relative:NaN}),x,y).lines.length,0);
 assert.throws(()=>decodeTile(new Uint8Array([255]),x,y));
});
test('sampler shares tiles inside a batch, uses a header secret, bounds concurrency and never retries',async()=>{
 let calls=0,inFlight=0,peak=0;const urls=[];
 const sample=createSampler({key:'private-test-key',fetch:async(url,options)=>{
  calls++;urls.push(url);peak=Math.max(peak,++inFlight);await new Promise(resolve=>setTimeout(resolve,2));inFlight--;
  assert.equal(options.headers['TomTom-Api-Key'],'private-test-key');assert.equal(options.redirect,'manual');assert.ok(!url.includes('private-test-key'));
  return new Response(vectorBytes());
 }});
 const stations=STATIONS.slice(0,5),expected=new Set(stations.flatMap(s=>tilesFor(s.end).map(t=>t.x+','+t.y))).size;
 await Promise.allSettled([...stations,stations[0]].map(sample));
 assert.equal(calls,expected);assert.ok(peak<=4);assert.ok(urls.every(u=>u.startsWith(`https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/${ZOOM}/`)));
});
test('provider limits, HTTP failures, oversized and corrupt tiles reject instead of returning clear roads',async()=>{
 for(const response of [()=>new Response('{}',{status:429}),()=>new Response('{}',{status:403}),()=>new Response(new Uint8Array([255])),()=>new Response('',{headers:{'Content-Length':'1048577'}})]){
  let calls=0;const sample=createSampler({key:'test',fetch:async()=>{calls++;return response();}});
  await assert.rejects(sample(STATIONS[0]));assert.ok(calls<=4);
 }
 const sample=createSampler({key:'test',fetch:async()=>new Response('',{status:429})});
 await assert.rejects(sample(STATIONS[0]),{code:'provider_limit'});
});
