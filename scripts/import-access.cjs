// Derive candidate entrances from OSM service-road connectivity, never proximity
// to an arbitrary main road. This is map evidence, not a field-verified entrance.
const fs=require('node:fs'),P=require('../dist/core.js');
const TARGET=200,metres=(a,b)=>P.distance(a,b)*1000;
const allowed=t=>!['no','private'].includes(t.access)&&!['no','private'].includes(t.motor_vehicle)&&t.motorcycle!=='no';
const publicRoad=t=>/^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)(?:_link)?$/.test(t.highway||'')&&allowed(t);
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function direction(a,b){const x=(b[0]-a[0])*Math.cos(a[1]*Math.PI/180),y=b[1]-a[1],n=Math.hypot(x,y);return [x/n,y/n];}
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI;
function compass(a,b){const d=direction(a,b);return ['east','north-east','north','north-west','west','south-west','south','south-east'][(Math.round(Math.atan2(d[1],d[0])*4/Math.PI)+8)%8];}
function derive(raw,stations){
 const ways=raw.elements.filter(e=>e.type==='way'&&e.geometry?.length>=2&&e.nodes?.length===e.geometry.length),coords=new Map();
 const service=new Map(),incoming=new Map(),roadNodes=new Set();
 const add=(map,id,edge)=>{if(!map.has(id))map.set(id,[]);map.get(id).push(edge);};
 for(const w of ways){
  w.geometry.forEach((p,i)=>coords.set(w.nodes[i],[p.lon,p.lat]));
  const t=w.tags||{},isPublic=publicRoad(t),isService=t.highway==='service'&&allowed(t);
  if(!isPublic&&!isService)continue;
  const oneway=t.oneway==='-1'?-1:['yes','1','true'].includes(t.oneway)||t.junction==='roundabout'?1:0;
  for(let i=1;i<w.nodes.length;i++){
   const a=w.nodes[i-1],b=w.nodes[i],length=metres(coords.get(a),coords.get(b));if(!length)continue;
   if(isPublic){roadNodes.add(a);roadNodes.add(b);}
   const map=isPublic?incoming:service,edge={way:w.id,name:t.name||t.ref||'Unnamed road',category:t.highway,length};
   if(oneway!==-1)add(map,b,{...edge,from:a,to:b});
   if(oneway!==1)add(map,a,{...edge,from:b,to:a});
  }
 }
 const fuels=raw.elements.filter(e=>e.tags?.amenity==='fuel'&&(e.type==='node'||e.geometry?.length)).map(e=>{
  const ring=e.geometry?.map(p=>[p.lon,p.lat]),center=ring?ring.reduce((p,c)=>[p[0]+c[0]/ring.length,p[1]+c[1]/ring.length],[0,0]):[e.lon,e.lat];return {...e,ring,center};
 });
 return stations.map(s=>{
  const near=fuels.map(f=>({f,d:metres(s.coordinates,f.center)})).filter(x=>x.d<80).sort((a,b)=>a.d-b.d);
  const exact=near.find(x=>s.id===`osm-${x.f.type}-${x.f.id}`),match=exact||near[0];
  const empty=reason=>({status:'unmapped',reason,routes:[]});
  if(!match)return {...s,access:empty('fuel_geometry_missing')};
  const sameSite=f=>f.id===match.f.id&&f.type===match.f.type||(f.ring&&inside(match.f.center,f.ring))||(match.f.ring&&inside(f.center,match.f.ring));
  if(!exact&&near.some(x=>x!==match&&x.d-match.d<12&&!sameSite(x.f)))return {...s,access:empty('station_match_ambiguous')};
  const fuel=near.find(x=>x.f.ring&&sameSite(x.f))?.f||match.f,anchors=[];
  for(const [id,p] of coords)if(service.has(id)&&metres(p,s.coordinates)<100&&((fuel.ring&&inside(p,fuel.ring))||metres(p,fuel.center)<20||metres(p,s.coordinates)<20))anchors.push(id);
  const entries=new Map(),queue=anchors.map(id=>({id,length:0,ways:[]})),best=new Map();
  while(queue.length){const item=queue.shift();if(item.length>160||(best.get(item.id)??Infinity)<=item.length)continue;best.set(item.id,item.length);
   if(roadNodes.has(item.id)){if(item.ways.length&&metres(coords.get(item.id),s.coordinates)<=100)entries.set(item.id,item.ways);continue;}
   for(const edge of service.get(item.id)||[])if(metres(coords.get(edge.from),s.coordinates)<150)queue.push({id:edge.from,length:item.length+edge.length,ways:[...item.ways,edge.way]});
  }
  if(!entries.size||entries.size>4)return {...s,access:empty(entries.size?'too_many_accesses':'connected_driveway_missing')};
  const routes=[];
  for(const [entry,accessWays] of entries)for(const first of incoming.get(entry)||[]){
   let edge=first,length=0,points=[coords.get(entry)],used=new Set([entry]),stop='limit';const sourceWays=new Set();
   while(edge){
    const from=coords.get(edge.from),to=coords.get(edge.to),take=Math.min(edge.length,TARGET-length);
    points.push(take<edge.length?[to[0]+(from[0]-to[0])*take/edge.length,to[1]+(from[1]-to[1])*take/edge.length]:from);length+=take;sourceWays.add(edge.way);
    if(length>=TARGET-.001)break;
    used.add(edge.from);const bearing=direction(from,to);
    const candidates=(incoming.get(edge.from)||[]).filter(e=>!used.has(e.from)).map(e=>({...e,turn:angle(direction(coords.get(e.from),from),bearing),same:e.name===first.name&&e.category===first.category})).filter(e=>e.turn<50).sort((a,b)=>Number(b.same)-Number(a.same)||a.turn-b.turn);
    if(!candidates.length){stop='road_end';break;}
    if(candidates[1]&&candidates[0].same===candidates[1].same&&candidates[1].turn-candidates[0].turn<20){stop='junction_ambiguous';break;}
    edge=candidates[0];
   }
   if(length<30)continue;
   const coordinates=points.reverse().map(p=>p.map(n=>Number(n.toFixed(7))));
   routes.push({id:`${entry}-${first.from}`,name:first.name,direction:compass(coordinates[0],coordinates.at(-1)),entrance:coords.get(entry),coordinates,lengthMetres:Math.round(length),targetMetres:TARGET,stop,accessWays:[...new Set(accessWays)],roadWays:[...sourceWays]});
  }
  return {...s,access:routes.length?{status:'mapped',source:`https://www.openstreetmap.org/${fuel.type}/${fuel.id}`,sourceDate:raw.osm3s?.timestamp_osm_base||null,method:'osm-service-connection-v1',routes}:empty('approach_missing')};
 });
}
if(require.main===module){
 const raw=JSON.parse(fs.readFileSync(process.argv[2]||'.local/osm-access.json','utf8'));
 if(raw.remark||!raw.elements?.length)throw Error('Incomplete OSM extract');
 const catalog=JSON.parse(fs.readFileSync('dist/stations.json','utf8'));catalog.stations=derive(raw,catalog.stations);catalog.accessImportedAt=new Date().toISOString();
 fs.writeFileSync('dist/stations.json',JSON.stringify(catalog,null,2)+'\n');
 fs.writeFileSync('traffic-service/stations.mjs','// Public station and OSM approach allowlist; generated by scripts/import-access.cjs.\nexport default '+JSON.stringify(catalog.stations.map(s=>({id:s.id,end:s.coordinates,start:s.approachStart,access:s.access})))+';\n');
 console.log(JSON.stringify({total:catalog.stations.length,mapped:catalog.stations.filter(s=>s.access.status==='mapped').length,original:catalog.stations.slice(0,5).map(s=>({id:s.id,...s.access}))},null,2));
}
module.exports={derive};
