// Experimental entrance-related road signal, not a petrol queue detector.
// OSM paths point towards a mapped driveway. Match only parallel, same-direction
// TomTom geometry. Missing/ambiguous samples remain unknown, including at zero.
export const METHOD='entrance-road-v1', TARGET=200, STEP=5;
const RAD=Math.PI/180,EARTH=6371000;
export function measureApproaches(segments,access,center){
 if(access?.status!=='mapped'||!access.routes?.length)return {method:METHOD,status:'unmapped',reason:access?.reason||'connected_driveway_missing',routes:[],selectedId:null};
 const sx=EARTH*RAD*Math.cos(center[1]*RAD),sy=EARTH*RAD;
 const project=p=>[(p[0]-center[0])*sx,(p[1]-center[1])*sy],unproject=p=>[Number((center[0]+p[0]/sx).toFixed(7)),Number((center[1]+p[1]/sy).toFixed(7))];
 const edges=segments.filter(s=>s.roadCategory!=='service').map(s=>{const a=project(s.from),b=project(s.to),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);return {...s,a,b,dx,dy,length};}).filter(e=>e.length>0);
 // Bound work on dense intersections: each sample considers only nearby edges.
 const grid=new Map(),cell=25;
 for(const edge of edges){
  const left=Math.floor((Math.min(edge.a[0],edge.b[0])-12)/cell),right=Math.floor((Math.max(edge.a[0],edge.b[0])+12)/cell),bottom=Math.floor((Math.min(edge.a[1],edge.b[1])-12)/cell),top=Math.floor((Math.max(edge.a[1],edge.b[1])+12)/cell);
  for(let x=left;x<=right;x++)for(let y=bottom;y<=top;y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(edge);}
 }
 const routes=access.routes.slice(0,8).map(route=>{
  const path=[...route.coordinates].reverse().map(project),parts=[];let length=0;
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len){parts.push({a,b,dx,dy,len,start:length});length+=len;}}
  length=Math.min(TARGET,length);const samples=[];
  function at(m){const part=parts.find(p=>m<=p.start+p.len+.001)||parts.at(-1),t=Math.min(1,(m-part.start)/part.len);return {point:[part.a[0]+t*part.dx,part.a[1]+t*part.dy],ux:-part.dx/part.len,uy:-part.dy/part.len};}
  for(let start=0;start<length-.1;start+=STEP){
   const take=Math.min(STEP,length-start),p=at(start+take/2),candidates=[];
   for(const edge of grid.get(Math.floor(p.point[0]/cell)+','+Math.floor(p.point[1]/cell))||[]){
    if((edge.dx*p.ux+edge.dy*p.uy)/edge.length<.82)continue;
    const t=((p.point[0]-edge.a[0])*edge.dx+(p.point[1]-edge.a[1])*edge.dy)/edge.length**2;
    // A 1 m tolerance covers quantisation at adjoining tile/feature endpoints.
    if(t< -1/edge.length||t>1+1/edge.length)continue;
    const clamped=Math.max(0,Math.min(1,t)),distance=Math.hypot(p.point[0]-edge.a[0]-clamped*edge.dx,p.point[1]-edge.a[1]-clamped*edge.dy);
    if(distance<=12)candidates.push({edge,distance});
   }
   candidates.sort((a,b)=>a.distance-b.distance);
   const best=candidates[0],conflict=best&&candidates.some(c=>c!==best&&c.distance-best.distance<4&&(Math.abs(c.edge.relativeSpeed-best.edge.relativeSpeed)>.05||c.edge.closed!==best.edge.closed));
   samples.push({take,start,edge:best&&!conflict?best.edge:null,from:unproject(at(start+take).point),to:unproject(at(start).point)});
  }
  const covered=samples.reduce((n,s)=>n+(s.edge?s.take:0),0),complete=route.lengthMetres>=TARGET-1&&length>=TARGET-1&&samples.every(s=>s.edge);
  let run=samples[0]?.edge?0:null,jam=0,slow=0,closed=0,weighted=0,extent='ended';
  for(const s of samples){
   if(!s.edge){extent='gap';break;}
   if(s.edge.relativeSpeed>=.7&&!s.edge.closed)break;
   run+=s.take;weighted+=s.take*s.edge.relativeSpeed;
   if(s.edge.closed)closed+=s.take;
   if(s.edge.relativeSpeed<=.35)jam+=s.take;else slow+=s.take;
   if(s===samples.at(-1))extent=complete?'limit':'gap';
  }
  const matched=samples.filter(s=>s.edge).map(s=>({from:s.from,to:s.to,speed:s.edge.speed,relativeSpeed:s.edge.relativeSpeed,closed:s.edge.closed}));
  const allSlow=samples.reduce((n,s)=>n+(s.edge&&s.edge.relativeSpeed<.7?s.take:0),0);
  return {id:route.id,name:route.name,direction:route.direction,entrance:route.entrance,targetMetres:TARGET,pathMetres:Math.round(length),coveredMetres:Math.round(covered),complete,
   continuousSlowMetres:run===null?null:Math.round(run),jamMetres:Math.round(jam),slowMetres:Math.round(slow),closedMetres:Math.round(closed),
   relativeSpeed:run>0?Number((weighted/run).toFixed(3)):null,extent,otherSlowMetres:Math.max(0,Math.round(allSlow-(run||0))),segments:matched};
 });
 const ranked=routes.filter(r=>r.continuousSlowMetres!==null).sort((a,b)=>b.continuousSlowMetres-a.continuousSlowMetres||b.jamMetres-a.jamMetres||a.id.localeCompare(b.id));
 return {method:METHOD,status:routes.length===access.routes.length&&routes.every(r=>r.complete)?'matched':'partial',routes,selectedId:ranked[0]?.id||null};
}
