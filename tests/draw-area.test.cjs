const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),P=require('../dist/core.js');
const source=fs.readFileSync('dist/draw-area.js','utf8');
function setup(){
 const listeners=new Map(),completed=[];let cancelled=0;
 const surface={clientWidth:600,clientHeight:400,hidden:true,addEventListener(k,f){listeners.set(k,f);},removeEventListener(k){listeners.delete(k);},getBoundingClientRect:()=>({left:50,top:100}),setPointerCapture(id){this.pointer=id;},hasPointerCapture(id){return this.pointer===id;},releasePointerCapture(){this.pointer=null;},focus(){this.focused=true;}};
 const node=()=>({hidden:true,style:{},textContent:''});const box=node(),cursor=node(),status=node();
 const handler=enabled=>({enabled,isEnabled(){return this.enabled;},disable(){this.enabled=false;},enable(){this.enabled=true;}});
 const map={dragPan:handler(true),scrollZoom:handler(true),boxZoom:handler(false),keyboard:handler(true),unproject:([x,y])=>({lng:115+x/10000,lat:-8-y/10000})};
 const context={Petrol:P};context.window=context;vm.runInNewContext(source,context);
 const draw=context.PetrolDraw({map,surface,box,cursor,status,onComplete:b=>completed.push(Array.from(b)),onCancel:()=>cancelled++});
 const send=(type,extra={})=>{const ev={button:0,pointerId:1,clientX:150,clientY:200,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};listeners.get(type)?.(ev);return ev;};
 return {draw,map,surface,box,status,send,completed,listeners,cancelled:()=>cancelled};
}
test('drag selects geographic bounds in either direction and restores only previously enabled map gestures',()=>{
 const s=setup();s.draw.start();assert.equal(s.map.dragPan.enabled,false);assert.equal(s.surface.hidden,false);
 s.send('pointerdown',{clientX:450,clientY:400});s.send('pointermove',{clientX:150,clientY:200});s.send('pointerup',{clientX:150,clientY:200});
 assert.deepEqual(s.completed,[[115.01,-8.03,115.04,-8.01]]);assert.equal(s.map.dragPan.enabled,true);assert.equal(s.map.boxZoom.enabled,false);assert.equal(s.surface.hidden,true);
});
test('two taps select an area, while cancellation discards the unfinished rectangle',()=>{
 const s=setup();s.draw.start();s.send('pointerdown');s.send('pointerup');assert.equal(s.completed.length,0);assert.match(s.status.textContent,/opposite corner/);
 s.send('pointermove',{clientX:350,clientY:300});s.send('pointerdown',{clientX:350,clientY:300});s.send('pointerup',{clientX:350,clientY:300});assert.equal(s.completed.length,1);
 s.draw.start();s.send('pointerdown');s.send('pointercancel');assert.equal(s.draw.active,true);assert.equal(s.box.hidden,true);
 const escape=s.send('keydown',{key:'Escape'});assert.ok(escape.prevented&&escape.stopped);assert.equal(s.cancelled(),1);assert.equal(s.completed.length,1);assert.equal(s.map.scrollZoom.enabled,true);
});
test('keyboard selection, small-area guard and listener cleanup work without mouse input',()=>{
 const s=setup();s.draw.start();s.send('keydown',{key:'Enter'});s.send('keydown',{key:'Enter'});assert.equal(s.completed.length,0);
 s.send('keydown',{key:'ArrowRight',shiftKey:true});s.send('keydown',{key:'ArrowDown',shiftKey:true});s.send('keydown',{key:'Enter'});assert.equal(s.completed.length,1);
 s.draw.start();assert.ok(s.send('wheel').prevented);s.draw.destroy();assert.equal(s.listeners.size,0);assert.equal(s.map.keyboard.enabled,true);
});
test('saved-only view includes outdated successes and retained failures, excludes no-data attempts, and obeys rectangle boundaries',()=>{
 const row=(id,coordinates,extra={})=>({id,name:id,shortName:id,coordinates,jamMetres:0,checkedAt:'2025-01-01T00:00:00Z',...extra});
 const rows=[row('edge',[115,-8]),row('retained',[115.1,-8.1],{refreshFailed:true}),row('outside',[115.3,-8.3]),row('failed-only',[115.1,-8.1],{jamMetres:undefined,checkedAt:undefined,refreshFailed:true})];
 const area={bounds:P.rectangle([115.2,-8.2],[115,-8])};
 assert.deepEqual(P.inScope(rows,area,'',true).map(s=>s.id),['edge','retained']);
 assert.deepEqual(P.inScope(rows,null,'',true).map(s=>s.id),['edge','retained','outside']);
 assert.equal(P.inScope(rows,area,'retained',true).length,1);assert.equal(P.inScope(rows,area).length,3);
 assert.equal(P.rectangle([115,-8],[115,-8.2]),null);assert.equal(P.rectangle([NaN,-8],[115,-8.2]),null);
});
