const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),P=require('../dist/core.js');
const source=fs.readFileSync('dist/app.js','utf8');
function setup({ready=true,mobile=false}={}){
 const elements=new Map(),requests=[],pins=[],fits=[],sources=new Map(),layers=new Map(),events={},urls=[];
 function element(){return {hidden:false,disabled:false,textContent:'',value:'',dataset:{},style:{setProperty(){}},attributes:{},children:new Map(),addEventListener(name,fn){this[name]=fn;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},querySelector(selector){if(selector==='[value="nearby"]')return this.nearby?{}:null;if(!this.children.has(selector))this.children.set(selector,element());return this.children.get(selector);},insertAdjacentHTML(){this.nearby=true;},scrollIntoView(){this.scrolled=true;},focus(){}};}
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};$('area').value='nusa-dua';
 const map={fitBounds(bounds,options){fits.push({points:bounds.points,options});},getSource:id=>sources.get(id),addSource(id,s){sources.set(id,{...s,setData(data){this.data=data;}});},getLayer:id=>layers.get(id),addLayer(layer){layers.set(layer.id,layer);},addControl(){},getZoom:()=>15,on(name,callback){events[name]=callback;}};
 class Marker{constructor({element}){this.element=element;pins.push(this);}setLngLat(point){this.point=point;return this;}addTo(){return this;}getElement(){return this.element;}remove(){this.removed=true;}}
 class Bounds{constructor(){this.points=[];}extend(point){this.points.push(point);return this;}}
 const context={Petrol:P,document:{getElementById:$,createElement:element,querySelector:()=>$('map-wrap'),querySelectorAll:()=>[],addEventListener(){}},navigator:{geolocation:{getCurrentPosition(success,error,options){requests.push({success,error,options});}}},maplibregl:{Map:class{constructor(){return map;}},Marker,LngLatBounds:Bounds,NavigationControl:class{},AttributionControl:class{}},history:{replaceState(a,b,url){urls.push(String(url));}},location:{href:'https://example.test/?area=nusa-dua',pathname:'/',search:'?area=nusa-dua',hash:''},matchMedia:q=>({matches:mobile&&q==='(max-width:760px)'}),fetch:()=>new Promise(()=>{}),setInterval(){},setTimeout(){},clearTimeout(){},addEventListener(){},URL,Intl,console,testMap:map};
 context.window=context;vm.createContext(context);vm.runInContext(source,context);
 vm.runInContext(`dataset={areas:[],stations:[]};stations=[];map=testMap;mapReady=${ready};`,context);
 return {context,$,requests,pins,fits,sources,events,urls,click(){ $('locate').click(); },fix(accuracy=25,point=[115.214,-8.792]){requests.at(-1).success({coords:{longitude:point[0],latitude:point[1],accuracy},timestamp:Date.parse('2026-10-15T06:00:00Z')});}};
}
test('Near me draws the measured position and accuracy, focuses locally even without stations, and keeps coordinates out of the URL',()=>{
 const s=setup({mobile:true});s.click();assert.equal(s.$('locate').disabled,true);assert.match(s.$('location-status').textContent,/Finding/);s.fix();
 const pin=s.pins.find(p=>p.element.className==='user-location');assert.deepEqual(Array.from(pin.point),[115.214,-8.792]);assert.equal(pin.element.querySelector('.location-label').textContent,'You are here');
 const ring=s.sources.get('location-accuracy').data.geometry.coordinates[0];for(const p of ring)assert.ok(Math.abs(P.distance(pin.point,p)*1000-25)<.1);
 assert.equal(s.fits.length,1);assert.equal(s.fits[0].options.maxZoom,16);for(const p of s.fits[0].points)assert.ok(P.distance(pin.point,p)<.13);
 assert.match(s.$('location-status').textContent,/25 m.*14:00 WITA/);assert.equal(s.$('map-wrap').scrolled,true);assert.equal(s.$('locate').disabled,false);
 assert.deepEqual({...s.requests[0].options},{enableHighAccuracy:true,timeout:15000,maximumAge:0});assert.equal(s.urls.at(-1),'https://example.test/?area=nearby');
});
test('coarse fixes stay explicitly approximate and repeated location requests update one marker',()=>{
 const s=setup();s.click();s.fix(1500);const pin=s.pins[0];assert.equal(pin.element.querySelector('.location-label').textContent,'Approximate location');assert.match(s.$('location-status').textContent,/1.5 km/);
 for(const p of s.fits[0].points)assert.ok(Math.abs(P.distance(pin.point,p)-1.5)<.001);
 s.click();s.fix(30,[115.215,-8.791]);assert.equal(s.pins.length,1);assert.deepEqual(Array.from(pin.point),[115.215,-8.791]);assert.equal(pin.element.querySelector('.location-label').textContent,'You are here');
 s.click();s.requests.at(-1).error({code:3});assert.equal(s.$('locate').disabled,false);assert.match(s.$('location-status').textContent,/timed out.*Still showing your last fix/);assert.deepEqual(Array.from(pin.point),[115.215,-8.791]);
});
test('denied or invalid location never draws a fabricated position',()=>{
 const s=setup();s.click();s.requests[0].error({code:1});assert.match(s.$('location-status').textContent,/access blocked/);assert.equal(s.pins.length,0);
 s.click();s.fix(NaN);assert.equal(s.pins.length,0);assert.equal(s.fits.length,0);assert.equal(s.$('locate').disabled,false);
});
test('a location acquired before map load is drawn and focused once the map is ready',()=>{
 const s=setup({ready:false});s.click();s.fix();assert.equal(s.fits.length,0);
 s.context.initMap();s.events.load();assert.equal(s.pins.length,1);assert.equal(s.fits.length,1);assert.equal(s.fits[0].options.maxZoom,16);
});
