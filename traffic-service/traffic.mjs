import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';

export const PROVIDER='tomtom-orbis-v2', RADIUS=250, ZOOM=15;
const N=2**ZOOM, EARTH=6371000, RAD=Math.PI/180;
const MAX_BYTES=1024*1024;
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<85;
const tileXY=p=>[(p[0]+180)/360*N,(1-Math.asinh(Math.tan(p[1]*RAD))/Math.PI)/2*N];
const tileLL=(x,y)=>[x/N*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/N)))/RAD];
export function tilesFor(center){
 if(!point(center))throw Error('Invalid location');
 const dy=RADIUS/EARTH/RAD,dx=dy/Math.cos(center[1]*RAD);
 const [left,top]=tileXY([center[0]-dx,center[1]+dy]),[right,bottom]=tileXY([center[0]+dx,center[1]-dy]);
 const tiles=[];
 for(let x=Math.floor(left);x<=Math.floor(right);x++)for(let y=Math.floor(top);y<=Math.floor(bottom);y++)tiles.push({x,y});
 if(tiles.length>4)throw Error('Tile budget exceeded');
 return tiles;
}
export function decodeTile(bytes,x,y){
 const layer=new VectorTile(new Pbf(bytes)).layers['Traffic flow'];
 if(!layer||layer.length>10000)throw Error('Missing traffic layer');
 const lines=[];
 for(let i=0;i<layer.length;i++){
  const feature=layer.feature(i),p=feature.properties;
  if(feature.type!==2||['motorway','motorway_link','track'].includes(p.road_category))continue;
  if(typeof p.road_category!=='string')continue;
  const closed=p.road_closure===true,relative=closed?0:p.relative_speed;
  if(!Number.isFinite(relative)||relative<0||relative>1)continue;
  const geometry=feature.toGeoJSON(x,y,ZOOM).geometry;
  for(const coordinates of geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates){
   if(!Array.isArray(coordinates)||coordinates.length<2||!coordinates.every(point))throw Error('Invalid traffic geometry');
   lines.push({coordinates,relativeSpeed:relative,closed});
  }
 }
 return {x,y,lines};
}

// Clip to the tile first (MVT can contain a margin), then to the station's circle.
// Opposite travel directions remain distinct and are described as road directions.
export function measureTiles(tiles,center){
 if(!point(center))throw Error('Invalid location');
 const sx=EARTH*RAD*Math.cos(center[1]*RAD),sy=EARTH*RAD;
 const project=p=>[(p[0]-center[0])*sx,(p[1]-center[1])*sy];
 const unproject=p=>[Number((center[0]+p[0]/sx).toFixed(7)),Number((center[1]+p[1]/sy).toFixed(7))];
 let total=0,jam=0,slow=0,closedMetres=0,nearest=Infinity;const segments=[],seen=new Set();
 for(const tile of tiles){
  const [xmin,ymax]=project(tileLL(tile.x,tile.y)),[xmax,ymin]=project(tileLL(tile.x+1,tile.y+1));
  for(const line of tile.lines)for(let i=1;i<line.coordinates.length;i++){
   const a=project(line.coordinates[i-1]),b=project(line.coordinates[i]),d=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...d);
   if(!length)continue;
   let lo=0,hi=1;
   for(const [axis,min,max] of [[0,xmin,xmax],[1,ymin,ymax]]){
    if(Math.abs(d[axis])<1e-9){if(a[axis]<min||a[axis]>max){hi=-1;break;}}
    else{const t1=(min-a[axis])/d[axis],t2=(max-a[axis])/d[axis];lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
   }
   const aa=length**2,bb=2*(a[0]*d[0]+a[1]*d[1]),cc=a[0]**2+a[1]**2-RADIUS**2,discriminant=bb**2-4*aa*cc;
   if(discriminant<=0||hi<=lo)continue;
   const root=Math.sqrt(discriminant);lo=Math.max(lo,(-bb-root)/(2*aa));hi=Math.min(hi,(-bb+root)/(2*aa));
   if(hi<=lo)continue;
   const from=unproject([a[0]+lo*d[0],a[1]+lo*d[1]]),to=unproject([a[0]+hi*d[0],a[1]+hi*d[1]]);
   const key=from.join(',')+'>'+to.join(',');if(seen.has(key))continue;seen.add(key);
   const take=(hi-lo)*length,relative=line.relativeSpeed;
   if(!Number.isFinite(relative)||relative<0||relative>1)throw Error('Invalid speed');
   const speed=relative<=.35?'TRAFFIC_JAM':relative<.7?'SLOW':'NORMAL';
   const nearT=Math.max(lo,Math.min(hi,-(a[0]*d[0]+a[1]*d[1])/aa));
   nearest=Math.min(nearest,Math.hypot(a[0]+nearT*d[0],a[1]+nearT*d[1]));
   total+=take;if(speed==='TRAFFIC_JAM')jam+=take;else if(speed==='SLOW')slow+=take;if(line.closed)closedMetres+=take;
   segments.push({from,to,speed,relativeSpeed:relative,closed:!!line.closed});
   if(segments.length>3000||total>20000)throw Error('Excessive traffic geometry');
  }
 }
 if(total<150||nearest>100)throw Error('Insufficient nearby road coverage');
 return {provider:PROVIDER,radiusMetres:RADIUS,coveredMetres:Math.round(total),jamMetres:Math.round(jam),slowMetres:Math.round(slow),closedMetres:Math.round(closedMetres),nearestRoadMetres:Math.round(nearest),segments};
}
async function readBytes(response){
 if(Number(response.headers.get('Content-Length'))>MAX_BYTES)throw Error('Oversize tile');
 const reader=response.body?.getReader();if(!reader)throw Error('Empty tile');
 const chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES){await reader.cancel();throw Error('Oversize tile');}chunks.push(value);}}finally{reader.releaseLock();}
 const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}
export function createSampler({fetch:send=globalThis.fetch,key,signal=AbortSignal.timeout(20000)}={}){
 // Request-local sharing only: no retained provider content or calls on page views.
 const cache=new Map(),queue=[];let active=0,limited=false;
 async function limitedFetch(job){
  if(active>=4)await new Promise(resolve=>queue.push(resolve));else active++;
  try{if(limited||signal.aborted)throw Object.assign(Error('Traffic unavailable'),{code:limited?'provider_limit':undefined});return await job();}
  finally{const next=queue.shift();if(next)next();else active--;}
 }
 function getTile({x,y}){
  const id=x+','+y;
  if(!cache.has(id))cache.set(id,limitedFetch(async()=>{
   const result=await send(`https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/${ZOOM}/${x}/${y}?apiVersion=2`,{headers:{'TomTom-Api-Key':key,Accept:'application/vnd.mapbox-vector-tile'},redirect:'error',signal});
   if(result.status===429){limited=true;throw Object.assign(Error('Provider limit'),{code:'provider_limit'});}
   if(!result.ok)throw Error('Traffic unavailable');
   return decodeTile(await readBytes(result),x,y);
  }));
  return cache.get(id);
 }
 return async station=>measureTiles(await Promise.all(tilesFor(station.end).map(getTile)),station.end);
}
