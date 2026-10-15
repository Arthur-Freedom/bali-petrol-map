import test from 'node:test';
import assert from 'node:assert/strict';
import {measureApproaches} from './approach.mjs';
const center=[115.2,-8.8],point=(x,y=0)=>[center[0]+x/(6371000*Math.PI/180*Math.cos(center[1]*Math.PI/180)),center[1]+y/(6371000*Math.PI/180)];
const edge=(a,b,speed=.2,y=0)=>({from:point(a,y),to:point(b,y),relativeSpeed:speed,closed:false,speed:speed<=.35?'TRAFFIC_JAM':speed<.7?'SLOW':'NORMAL'});
const access={status:'mapped',routes:[{id:'inbound',name:'Access Road',direction:'east',entrance:center,coordinates:[point(-200),center],lengthMetres:200}]};
const read=lines=>measureApproaches(lines,access,center);

test('continuous incoming slow stretch stops at faster traffic, excluding other slow pockets',()=>{
 const result=read([edge(-200,-150,.2),edge(-150,-80,1),edge(-80,0,.5)]),r=result.routes[0];
 assert.equal(result.status,'matched');assert.equal(r.continuousSlowMetres,80);assert.equal(r.slowMetres,80);assert.equal(r.jamMetres,0);assert.equal(r.otherSlowMetres,50);assert.equal(r.extent,'ended');
});
test('opposite direction, parallel road and crossing junction cannot add to the approach length',()=>{
 const crossing={from:point(-100,-150),to:point(-100,150),relativeSpeed:.1,speed:'TRAFFIC_JAM',closed:false};
 const r=read([edge(-200,0,1),edge(0,-200,.1),edge(-200,0,.1,20),crossing]).routes[0];
 assert.equal(r.continuousSlowMetres,0);assert.equal(r.coveredMetres,200);
});
test('a fully slow approach is a lower bound, never an exact queue length',()=>{
 const r=read([edge(-200,0,.2)]).routes[0];assert.equal(r.continuousSlowMetres,200);assert.equal(r.extent,'limit');assert.equal(r.waitMinutes,undefined);assert.equal(r.relativeSpeed,.2);
});
test('coverage gaps are not bridged and incomplete coverage is not eligible for ranking',()=>{
 const a=read([edge(-200,-100,.2),edge(-80,0,.2)]);assert.equal(a.status,'partial');assert.equal(a.routes[0].continuousSlowMetres,80);assert.equal(a.routes[0].extent,'gap');
 const b=read([edge(-200,-20,1)]);assert.equal(b.status,'partial');assert.equal(b.routes[0].continuousSlowMetres,null);
});
test('conflicting nearby parallel geometries are ambiguous, not optimistically clear',()=>{
 const r=read([edge(-200,0,1),edge(-200,0,.1,2)]);assert.equal(r.status,'partial');assert.equal(r.routes[0].continuousSlowMetres,null);
});
test('nearby congestion never fabricates a mapped entrance, and road closures remain explicit',()=>{
 const no=measureApproaches([edge(-200,0,.1)],null,center);assert.equal(no.status,'unmapped');assert.deepEqual(no.routes,[]);
 const r=read([{...edge(-200,0,0),closed:true}]).routes[0];assert.equal(r.closedMetres,200);
});
test('multiple incoming directions use the longest signal, and one incomplete direction blocks a recommendation',()=>{
 const routes=[...access.routes,{...access.routes[0],id:'other',coordinates:[point(200),center]}],lines=[edge(-200,0,.2),edge(200,20,1),edge(20,0,.5)];
 const full=measureApproaches(lines,{status:'mapped',routes},center);assert.equal(full.status,'matched');assert.equal(full.selectedId,'inbound');
 const partial=measureApproaches(lines.slice(0,2),{status:'mapped',routes},center);assert.equal(partial.status,'partial');
});
test('tile or feature splits at the same point preserve the continuous length',()=>{
 const result=read([edge(-200,-123,.2),edge(-123,-80,.2),edge(-80,0,.2)]);assert.equal(result.status,'matched');assert.equal(result.routes[0].continuousSlowMetres,200);
});
test('service-road observations cannot impersonate the incoming public road',()=>{
 const result=read([{...edge(-200,0,.2),roadCategory:'service'}]);assert.equal(result.status,'partial');assert.equal(result.routes[0].continuousSlowMetres,null);
});
