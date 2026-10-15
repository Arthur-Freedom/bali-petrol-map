const test=require('node:test'),assert=require('node:assert/strict'),{derive}=require('../scripts/import-access.cjs'),catalog=require('../dist/stations.json');
const xy=(x,y=0)=>({lon:115+x/111000,lat:-8+y/111000});
const way=(id,nodes,points,tags)=>({type:'way',id,nodes,geometry:points.map(p=>xy(...p)),tags});
function fixture(oneway='yes'){
 return {elements:[{type:'node',id:1,...xy(0,25),tags:{amenity:'fuel'}},
  way(10,[10,11,12,13],[[-300,0],[0,0],[50,0],[300,0]],{highway:'primary',oneway:'yes',name:'Main Road'}),
  way(20,[11,20,21,12],[[0,0],[0,20],[40,20],[50,0]],{highway:'service',oneway})]};
}
const station={id:'osm-node-1',coordinates:[115,-8+25/111000]};
test('OSM one-way driveway maps the entry, not its separate exit',()=>{
 const s=derive(fixture(),[station])[0];assert.equal(s.access.status,'mapped');assert.equal(s.access.routes.length,1);assert.equal(s.access.routes[0].entrance[0],115);assert.equal(s.access.routes[0].lengthMetres,200);
});
test('reversing driveway flow changes the mapped entrance',()=>{
 const s=derive(fixture('-1'),[station])[0];assert.equal(s.access.status,'mapped');assert.equal(s.access.routes.length,1);assert.ok(s.access.routes[0].entrance[0]>115);
});
test('nearby main roads without a connected service road never become an entrance',()=>{
 const raw=fixture();raw.elements.pop();assert.equal(derive(raw,[station])[0].access.status,'unmapped');
});
test('private access and distant fuel matches stay unmapped',()=>{
 const raw=fixture();raw.elements[2].tags.access='private';assert.equal(derive(raw,[station])[0].access.status,'unmapped');
 assert.equal(derive(fixture(),[{...station,coordinates:[116,-8]}])[0].access.status,'unmapped');
});
test('every published mapped approach has a traceable service connection, bounded path and direction',()=>{
 for(const s of catalog.stations){if(s.access?.status!=='mapped')continue;
  assert.match(s.access.source,/^https:\/\/www.openstreetmap.org\//);assert.equal(s.access.method,'osm-service-connection-v1');assert.ok(s.access.routes.length<=8);
  for(const r of s.access.routes){assert.ok(r.accessWays.length);assert.ok(r.roadWays.length);assert.ok(r.lengthMetres>=30&&r.lengthMetres<=200);assert.equal(r.targetMetres,200);assert.ok(r.coordinates.length>=2);assert.ok(r.direction);}
 }
});
