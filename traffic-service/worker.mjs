export const ORIGIN='https://arthur-freedom.github.io';
export const OWNER='18115558';
export const COOLDOWN=15*60*1000, DAILY_LIMIT=50, MONTHLY_LIMIT=900;
const AUTH='https://bali-cinema-owner-refresh.honeymooninbali.workers.dev';
import CATALOGUE from './stations.mjs';
export const ALL_STATIONS=CATALOGUE;
export const STATIONS=CATALOGUE.filter(s=>['nusa-dua','bypass-30x','bypass-27','dharmawangsa','jimbaran-02'].includes(s.id));
export function requestStations(text){
 if(text.length>2048)return null;
 try{const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')return null;
 if(Object.keys(data).length===0)return STATIONS;
 if(Object.keys(data).length!==1||!Array.isArray(data.stationIds)||data.stationIds.length<1||data.stationIds.length>5||new Set(data.stationIds).size!==data.stationIds.length)return null;
 const stations=data.stationIds.map(id=>CATALOGUE.find(s=>s.id===id));return stations.every(Boolean)?stations:null;
 }catch{return null;}
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
async function boundedBody(request){
 const declared=Number(request.headers.get('Content-Length'));
 if(declared>2048)return null;
 const reader=request.body?.getReader();if(!reader)return '';
 let size=0,text='';const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return null;}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
export function metres(a,b){const r=Math.PI/180,dlat=(b[1]-a[1])*r,dlon=(b[0]-a[0])*r,h=Math.sin(dlat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
export function decodePolyline(value){let i=0,lat=0,lng=0,points=[];const next=()=>{let shift=0,result=0,b;do{if(i>=value.length||shift>30)throw Error('Invalid polyline');b=value.charCodeAt(i++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):result>>1;};while(i<value.length){lat+=next();lng+=next();points.push([lng/1e5,lat/1e5]);}return points;}
export function measure(route,end){
  const points=decodePolyline(route.polyline?.encodedPolyline||'');
  const intervals=route.travelAdvisory?.speedReadingIntervals;
  if(points.length<2||metres(points.at(-1),end)>150||!Array.isArray(intervals)||!intervals.length)throw Error('No verified approach traffic');
  const speeds=new Array(points.length-1);
  for(const part of intervals){const start=part.startPolylinePointIndex??0,end=part.endPolylinePointIndex;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>points.length-1||end<=start||!['NORMAL','SLOW','TRAFFIC_JAM'].includes(part.speed))throw Error('Invalid intervals');for(let i=start;i<end;i++){if(speeds[i])throw Error('Overlapping intervals');speeds[i]=part.speed;}}
  let covered=0,jam=0,slow=0;const segments=[];
  for(let i=points.length-2;i>=0&&covered<1000;i--){const length=metres(points[i],points[i+1]);if(!length)continue;if(!speeds[i])throw Error('Incomplete coverage');const take=Math.min(length,1000-covered),ratio=take/length;const from=[points[i+1][0]+(points[i][0]-points[i+1][0])*ratio,points[i+1][1]+(points[i][1]-points[i+1][1])*ratio];segments.push({from,to:points[i+1],speed:speeds[i]});covered+=take;if(speeds[i]==='TRAFFIC_JAM')jam+=take;else if(speeds[i]==='SLOW')slow+=take;}
  if(covered<500)throw Error('Approach too short');
  return {jamMetres:Math.round(jam/10)*10,slowMetres:Math.round(slow/10)*10,approachMetres:Math.round(covered),segments};
}

// One globally named object. Admission serializes the shared daily budget and
// per-station cooldown across tabs. Google content is never persisted.
export class TrafficBudget {
  constructor(state,env,{now=Date.now}={}){this.storage=state.storage;this.now=now;this.pending=Promise.resolve();}
  fetch(request){const run=this.pending.then(()=>this.admit(request));this.pending=run.catch(()=>{});return run;}
  async admit(request){
    const now=this.now(),day=new Date(now+8*3600000).toISOString().slice(0,10),month=day.slice(0,7);
    const saved=await this.storage.get('budget')||{day,used:0};
    // Conservatively charge each old five-station attempt as five checks.
    const legacySpent=saved.used??(saved.count||0)*5,used=saved.day===day?legacySpent:0;
    // Rollout is on the app's first usage day; preserve its existing charges.
    // If an un-migrated record is found on a later day in that month, fail closed.
    const monthlyUsed=saved.month===month?saved.monthlyUsed:saved.month?0:saved.day?.startsWith(month)?(saved.day===day||saved.day==='2026-10-15'?legacySpent:MONTHLY_LIMIT):0;
    if(!Number.isInteger(used)||used<0||!Number.isInteger(monthlyUsed)||monthlyUsed<0)throw Error('Invalid budget');
    const midnight=Date.parse(day+'T00:00:00+08:00')+86400000;
    const [year,monthNumber]=month.split('-').map(Number),monthlyResetAt=Date.UTC(year,monthNumber,1)-8*3600000;
    const groups=saved.day===day?{...saved.groups}:{};
    if(saved.day===day&&saved.nextAt&&!saved.groups)groups[STATIONS.map(s=>s.id).sort().join(',')]=saved.nextAt;
    const stationNextAt=saved.day===day?{...saved.stationNextAt}:{};
    for(const [group,time] of Object.entries(groups))for(const id of group.split(','))stationNextAt[id]=Math.max(stationNextAt[id]||0,time);
    const limits=(spent=used,monthSpent=monthlyUsed)=>({groups,stationNextAt,resetAt:midnight,dailyNextAt:spent>=DAILY_LIMIT?midnight:0,remainingChecks:Math.max(0,DAILY_LIMIT-spent),remaining:Math.max(0,Math.floor(Math.min(DAILY_LIMIT-spent,MONTHLY_LIMIT-monthSpent)/5)),monthlyLimit:MONTHLY_LIMIT,monthlyUsed:monthSpent,remainingMonthlyChecks:Math.max(0,MONTHLY_LIMIT-monthSpent),monthlyResetAt});
    if(request.method==='GET'){
      if(!saved.month)await this.storage.put('budget',{day,used,month,monthlyUsed,groups,stationNextAt});
      return json(limits());
    }
    const group=(await request.json()).group;
    if(typeof group!=='string'||group.length>700)return json({error:'Invalid group.'},400);
    const ids=group.split(',');
    if(ids.length>5||new Set(ids).size!==ids.length||!ids.every(id=>CATALOGUE.some(s=>s.id===id)))return json({error:'Invalid stations.'},400);
    if(monthlyUsed+ids.length>MONTHLY_LIMIT)return json({...limits(),error:'Monthly safety limit reached. Traffic checks resume next month.'},429);
    if(used+ids.length>DAILY_LIMIT)return json({...limits(),error:'Daily station-check budget reached. More checks after midnight in Bali.'},429);
    if(ids.some(id=>now<(stationNextAt[id]||0)))return json({...limits(),error:'A station in this request was checked recently. Other stations can be checked now.'},429);
    groups[group]=now+COOLDOWN;
    for(const id of ids)stationNextAt[id]=now+COOLDOWN;
    await this.storage.put('budget',{day,used:used+ids.length,month,monthlyUsed:monthlyUsed+ids.length,groups,stationNextAt});
    return json(limits(used+ids.length,monthlyUsed+ids.length));
  }
}
export function createHandler({fetch:send=globalThis.fetch,now=Date.now}={}){
 return async(request,env)=>{
  let response;
  try{
    const path=new URL(request.url).pathname;let requestedStations;
    if(request.headers.get('Origin')!==ORIGIN)response=json({error:'Owner website access required.'},403);
    else if(request.method==='OPTIONS')response=new Response(null,{status:204});
    else if(!((path==='/api/session'&&request.method==='GET')||(path==='/api/refresh'&&request.method==='POST')))response=json({error:'Not found.'},404);
    else if(env.PAID_FEATURES_ENABLED!=='true')response=json({error:'Paid map features are paused by the owner.'},503);
    else if(request.method==='POST'&&(request.headers.get('Content-Type')!=='application/json'||!(requestedStations=requestStations((await boundedBody(request))??'invalid'))))response=json({error:'Invalid refresh request.'},400);
    else{
      const authorization=request.headers.get('Authorization')||'';
      if(!/^Bearer remembered\.[A-Za-z0-9_-]{43}$/.test(authorization))response=json({error:'Sign in as Arthur-Freedom to refresh traffic.'},401);
      else{
        const verified=await env.OWNER_AUTH.fetch(new Request(AUTH+'/api/session',{headers:{Origin:ORIGIN,Authorization:authorization}}));
        if(!verified.ok)response=json({error:verified.status===401||verified.status===403?'Please sign in as Arthur-Freedom.':'GitHub verification is temporarily unavailable.'},verified.status===401||verified.status===403?verified.status:503);
        else if(String((await verified.json()).ownerId)!==OWNER)response=json({error:'Only Arthur-Freedom can refresh traffic.'},403);
        else{
          const budget=env.TRAFFIC_BUDGET.get(env.TRAFFIC_BUDGET.idFromName('owner-global'));
          if(path==='/api/session'){
            const allowance=await budget.fetch(new Request('https://budget/',{method:'GET'}));
            response=allowance.ok?json({ownerId:OWNER,login:'Arthur-Freedom',mapsKey:env.GOOGLE_MAPS_BROWSER_KEY,...await allowance.json()}):json({error:'Spending protection is temporarily unavailable.'},503);
          }
          else if(!env.GOOGLE_ROUTES_KEY)response=json({error:'Traffic service is not configured.'},503);
          else{
            const allowance=await budget.fetch(new Request('https://budget/',{method:'POST',body:JSON.stringify({group:requestedStations.map(s=>s.id).sort().join(',')})})),limits=await allowance.json();
            if(!allowance.ok)response=json(limits,allowance.status);
            else{
              const waypoint=coordinate=>({location:{latLng:{latitude:coordinate[1],longitude:coordinate[0]}}});
              const stations=await Promise.all(requestedStations.map(async station=>{
                try{
                  const result=await send('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.GOOGLE_ROUTES_KEY,'X-Goog-FieldMask':'routes.polyline.encodedPolyline,routes.travelAdvisory.speedReadingIntervals'},body:JSON.stringify({origin:waypoint(station.start),destination:waypoint(station.end),travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE_OPTIMAL',extraComputations:['TRAFFIC_ON_POLYLINE'],polylineQuality:'HIGH_QUALITY',computeAlternativeRoutes:false})});
                  if(result.status===429)return {id:station.id,error:'Google request limit reached.',errorCode:'provider_limit'};
                  if(!result.ok)throw Error('Upstream failed');
                  const measured=measure((await result.json()).routes?.[0]||{},station.end);
                  return {id:station.id,...measured,checkedAt:new Date(now()).toISOString()};
                }catch{return {id:station.id,error:'Traffic unavailable for this approach.'};}
              }));
              response=json({stations,...limits});
            }
          }
        }
      }
    }
  }catch{response=json({error:'Traffic service is temporarily unavailable.'},503);}
  const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('Vary','Origin');headers.set('X-Content-Type-Options','nosniff');
  if(request.headers.get('Origin')===ORIGIN){headers.set('Access-Control-Allow-Origin',ORIGIN);headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');}
  return new Response(response.body,{status:response.status,headers});
 };
}
export default {fetch:createHandler()};
