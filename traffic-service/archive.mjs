import P from '../dist/core.js';
import CATALOGUE from './stations.mjs';

export const MAX_PENDING=2000, MAX_PENDING_BYTES=256*1024*1024, MAX_RECORD_BYTES=900000, PAGE_BYTES=1500000;
const errors=new Set(['provider_limit','provider_auth','provider_unavailable','provider_data','no_coverage','interrupted']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const stamp=time=>new Date(time).toISOString();
const bali=time=>new Date(time+8*3600000).toISOString().replace('Z','+08:00');
const encode=new TextEncoder();
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const empty=()=>({pending:{},lastArchivedAt:null});
const publicReading=reading=>Object.fromEntries(['id','provider','radiusMetres','coveredMetres','jamMetres','slowMetres','closedMetres','nearestRoadMetres','segments','approach','checkedAt'].map(k=>[k,reading[k]]));

// All methods execute inside the budget object's serial queue. Stored traffic
// and the export credential are never accepted from browser request bodies.
export class TrafficArchive {
 constructor(storage,now=Date.now){this.storage=storage;this.now=now;}
 async status(){const meta=await this.storage.get('archive-meta')||empty();return {pendingChecks:Object.keys(meta.pending).length,lastArchivedAt:meta.lastArchivedAt,repository:'https://github.com/Arthur-Freedom/bali-petrol-map/tree/traffic-history'};}
 async reserve(ids,time){
  const meta=await this.storage.get('archive-meta')||empty(),pending={...meta.pending};
  if(Object.keys(pending).length+ids.length>MAX_PENDING||Object.values(pending).reduce((sum,item)=>sum+item.bytes,0)+ids.length*MAX_RECORD_BYTES>MAX_PENDING_BYTES)throw Error('Archive backlog full');
  const batch=crypto.randomUUID(),entries={},reservations=[];
  for(const stationId of ids){
   const id=stamp(time).replaceAll(':','-')+'_'+batch+'_'+stationId;
   const record={schemaVersion:1,id,stationId,provider:'tomtom-orbis-v2',method:'entrance-road-v1',requestedAt:stamp(time),requestedAtWita:bali(time),status:'pending'};
   entries['event:'+id]=record;pending[id]={bytes:MAX_RECORD_BYTES,requestedAt:time,complete:false};reservations.push(id);
  }
  entries['archive-meta']={...meta,pending};return {entries,reservations};
 }
 async finish(reservations,results){
  const meta=await this.storage.get('archive-meta')||empty(),pending={...meta.pending},entries={},stations=[];
  if(!Array.isArray(reservations)||reservations.length!==results.length||results.length>5)throw Error('Invalid archive batch');
  for(let i=0;i<reservations.length;i++){
   const id=reservations[i],base=await this.storage.get('event:'+id),result=results[i],station=CATALOGUE.find(s=>s.id===base?.stationId);
   if(!base||!station||base.status!=='pending'||!pending[id]||result?.id!==station.id)throw Error('Invalid reservation');
   const success=P.validReading(result,station.id,this.now(),station.end),last=await this.storage.get('latest:'+station.id);
   const completedAt=stamp(this.now());
   const record={...base,completedAt,completedAtWita:bali(this.now()),status:success?'success':'failed',...(success?{reading:publicReading(result)}:{errorCode:errors.has(result.errorCode)?result.errorCode:'provider_data'})};
   const payload=JSON.stringify(record),bytes=encode.encode(payload).length;
   if(bytes>MAX_RECORD_BYTES)throw Error('Oversize archive result');
   entries['event:'+id]={payload,sha256:await hash(payload)};pending[id]={...pending[id],bytes,complete:true};
   const prior=last?.reading;
   const reading=success&&(!prior||Date.parse(result.checkedAt)>=Date.parse(prior.checkedAt))?P.withTrend(prior,publicReading(result)):prior;
   const attempt={at:completedAt,status:record.status,...(!success?{errorCode:record.errorCode}:{})};
   entries['latest:'+station.id]={reading:reading||null,lastAttempt:!last?.lastAttempt||Date.parse(attempt.at)>=Date.parse(last.lastAttempt.at)?attempt:last.lastAttempt};
   stations.push(success?reading:result);
  }
  entries['archive-meta']={...meta,pending};await this.storage.put(entries);
  return {stations,archive:{saved:true,...await this.status()}};
 }
 async saved(after=''){
  if(after&&!CATALOGUE.some(s=>s.id===after))return json({error:'Invalid cursor.'},400);
  const values=await this.storage.list({prefix:'latest:',...(after?{startAfter:'latest:'+after}:{}),limit:20});
  const stations=[];let bytes=0,next=null,consumed=0;
  for(const [key,value] of values){
   const stationId=key.slice(7),reading=value.reading,failed=value.lastAttempt?.status==='failed'&&(!reading||Date.parse(value.lastAttempt.at)>=Date.parse(reading.checkedAt));
   const row=reading?{...reading,...(failed?{refreshFailed:true,errorCode:value.lastAttempt.errorCode}:{}),lastAttemptAt:value.lastAttempt?.at}:{id:stationId,refreshFailed:!!failed,errorCode:value.lastAttempt?.errorCode,lastAttemptAt:value.lastAttempt?.at};
   const size=encode.encode(JSON.stringify(row)).length;
   if(stations.length&&bytes+size>PAGE_BYTES)break;
   stations.push(row);bytes+=size;next=stationId;consumed++;
  }
  return json({schemaVersion:1,stations,next:values.size===20||consumed<values.size?next:null,archive:await this.status()});
 }
 async export(){
  // Recover interrupted requests as failures, never as fabricated readings.
  let meta=await this.storage.get('archive-meta')||empty();
  const expired=Object.entries(meta.pending).filter(([,v])=>!v.complete&&this.now()-v.requestedAt>300000);
  for(const [id] of expired){const base=await this.storage.get('event:'+id);await this.finish([id],[{id:base.stationId,errorCode:'interrupted',error:'Traffic check interrupted.'}]);}
  meta=await this.storage.get('archive-meta')||empty();
  const records=[];let bytes=0;
  for(const [id,item] of Object.entries(meta.pending).sort(([a],[b])=>a.localeCompare(b))){
   if(!item.complete)continue;
   const value=await this.storage.get('event:'+id);if(!value?.payload||!value.sha256)throw Error('Incomplete export record');
   const entry={id,...value},size=encode.encode(JSON.stringify(entry)).length;
   if(records.length&&(records.length>=20||bytes+size>PAGE_BYTES))break;
   records.push(entry);bytes+=size;
  }
  return json({schemaVersion:1,records,archive:await this.status()});
 }
 async acknowledge(data){
  if(!Array.isArray(data.records)||!data.records.length||data.records.length>20||!/^[a-f0-9]{40}$/.test(data.commit||''))return json({error:'Invalid acknowledgement.'},400);
  const meta=await this.storage.get('archive-meta')||empty(),pending={...meta.pending},keys=[];
  for(const row of data.records){
   if(typeof row.id!=='string'||row.id.length>200||!/^[a-f0-9]{64}$/.test(row.sha256||''))return json({error:'Invalid record.'},400);
   if(!pending[row.id])continue; // Idempotent after a lost acknowledgement response.
   const saved=await this.storage.get('event:'+row.id);
   if(!saved?.sha256||saved.sha256!==row.sha256)return json({error:'Archive digest mismatch.'},409);
   delete pending[row.id];keys.push('event:'+row.id);
  }
  await this.storage.transaction(async tx=>{await tx.put('archive-meta',{...meta,pending,lastArchivedAt:stamp(this.now()),lastCommit:data.commit});if(keys.length)await tx.delete(keys);});
  return json({ok:true,archive:await this.status()});
 }
 async route(request){const url=new URL(request.url);
  if(url.pathname==='/saved'&&request.method==='GET')return this.saved(url.searchParams.get('after')||'');
  if(url.pathname==='/archive/export'&&request.method==='GET')return this.export();
  if(url.pathname==='/archive/ack'&&request.method==='POST')return this.acknowledge(await request.json());
  if(url.pathname==='/archive/finish'&&request.method==='POST'){const data=await request.json();return json(await this.finish(data.reservations,data.stations));}
  return json({error:'Not found.'},404);
 }
}

export async function exportAuthorized(request,secret){
 if(typeof secret!=='string'||secret.length<43||request.headers.has('Origin'))return false;
 const actual=request.headers.get('Authorization')||'';if(actual.length>200)return false;
 const a=await hash(actual),b=await hash('Bearer '+secret);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
