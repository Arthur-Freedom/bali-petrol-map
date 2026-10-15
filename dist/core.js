(function(root){
 'use strict';
 function distance(a,b){const r=Math.PI/180,x=(b[1]-a[1])*r,y=(b[0]-a[0])*r,h=Math.sin(x/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(y/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
 function fresh(date,now=Date.now()){const t=Date.parse(date);return Number.isFinite(t)&&now-t<900000&&t<=now+60000;}
 function opening(s,now=Date.now()){
   const state=s.operatingStatus||'unknown',source=s.operatingSource||'unknown',recent=fresh(s.operatingCheckedAt,now),firsthand=source==='firsthand';
   const label=state==='unknown'?'Opening unconfirmed':firsthand?(recent?'Reported ':'Earlier report: ')+state:'Listed '+state+' · unverified';
   return {label,state,source,recent,checkedAt:s.operatingCheckedAt,blocked:state==='closed'&&firsthand&&recent};
 }
 function status(s,now=Date.now()){
   const measured=Number.isFinite(s.jamMetres),recent=fresh(s.checkedAt,now)&&!s.refreshFailed,op=opening(s,now);
   const route=approachRoute(s),matched=s.approach?.status==='matched',rankable=measured&&recent&&matched&&!op.blocked;
   const closed=s.approach?.routes?.some(r=>r.closedMetres>0);
   const tone=op.blocked?'unavailable':!matched?'unknown':closed?'unavailable':route?.jamMetres>0?'long':route?.continuousSlowMetres>0?'medium':'neutral';
   const base=op.blocked?'Reported closed':!measured?(s.refreshFailed?'Traffic unavailable':'Not checked'):!matched?(s.approach?.status==='partial'?'Approach partly covered':'Entrance not mapped'):closed?'Road closure on an approach':route?.continuousSlowMetres===0?'No slowdown at mapped access':route?.jamMetres>0?'Congested approach':'Slow approach';
   return {tone,label:measured&&!recent&&!op.blocked?'Earlier: '+base.toLowerCase():base,fresh:recent,measured,rankable,blocked:op.blocked,opening:op};
 }
 function approachRoute(s){return s.approach?.routes?.find(r=>r.id===s.approach.selectedId)||null;}
 function approachLabel(route){if(!route||route.continuousSlowMetres===null)return 'Unknown';const n=route.continuousSlowMetres,m=n===0?0:Math.max(10,Math.round(n/10)*10);return route.extent==='limit'?`${m}+ m`:route.extent==='gap'&&n>0?`At least ${m} m`:`${n>0?'≈ ':''}${m} m`;}
 function slowdown(s){return Math.max(0,s.jamMetres||0)+Math.max(0,s.slowMetres||0);}
 function slowPercent(s){return Math.min(100,Math.round(slowdown(s)/Math.max(1,s.coveredMetres||1000)*100));}
 function compareTraffic(a,b){
   const x=approachRoute(a),y=approachRoute(b);if(a.approach?.status!=='matched'||b.approach?.status!=='matched'||!x||!y)return 0;
   return Number(a.approach.routes.some(r=>r.closedMetres>0))-Number(b.approach.routes.some(r=>r.closedMetres>0))||Math.round(x.continuousSlowMetres/10)-Math.round(y.continuousSlowMetres/10)||(x.extent==='limit'&&y.extent==='limit'?0:Math.round(x.jamMetres/10)-Math.round(y.jamMetres/10));
 }
 function withTrend(previous,next){
   const a=approachRoute(previous||{}),b=approachRoute(next),dt=Date.parse(next.checkedAt)-Date.parse(previous?.checkedAt);
   let trend={state:'first',checks:1,since:next.checkedAt};
   const comparable=previous&&a&&b&&!previous.refreshFailed&&previous.approach?.status==='matched'&&next.approach?.status==='matched'&&a.id===b.id&&previous.approach.method===next.approach.method&&dt>=14*60000&&dt<=45*60000&&previous.approach.routes.map(r=>r.id).sort().join(',')===next.approach.routes.map(r=>r.id).sort().join(',');
   if(comparable){
    const delta=b.continuousSlowMetres-a.continuousSlowMetres,limited=a.extent==='limit'&&b.extent==='limit';
    const state=limited?'at_limit':delta>=20?'longer':delta<=-20?'shorter':'similar';
    const persists=a.continuousSlowMetres>0&&b.continuousSlowMetres>0;
    trend={state,previousAt:previous.checkedAt,checks:persists?2:1,since:persists?previous.checkedAt:next.checkedAt};
   }else if(previous)trend.state='not_comparable';
   return {...next,trend};
 }
 function trendLabel(s){
   if(!status(s).fresh)return 'Check again for a current comparison';
   if(s.approach?.status!=='matched')return 'Trend unavailable · incomplete approach coverage';
   const t=s.trend;if(!t||t.state==='first')return 'First reading · trend needs another check';
   if(t.state==='not_comparable')return 'Trend unavailable · checks not comparable';
   const gap=Math.round((Date.parse(s.checkedAt)-Date.parse(t.previousAt))/60000);
   return ({longer:'Slow stretch grew',shorter:'Slow stretch shrank',similar:'Similar slow stretch',at_limit:'At least 200 m in both checks'})[t.state]+` · vs ${gap} min earlier`;
 }
 function ordered(stations,origin,now=Date.now()){
   return [...stations].sort((a,b)=>{const x=status(a,now),y=status(b,now);return Number(x.blocked)-Number(y.blocked)||Number(!x.rankable)-Number(!y.rankable)||(x.rankable&&y.rankable?compareTraffic(a,b):0)||Number(!(x.measured&&x.fresh))-Number(!(y.measured&&y.fresh))||Number(!x.measured)-Number(!y.measured)||(origin?distance(origin,a.coordinates)-distance(origin,b.coordinates):0)||a.shortName.localeCompare(b.shortName);});
 }
 function inScope(stations,area,query=''){
   const q=query.trim().toLowerCase();return stations.filter(s=>(!area||distance(area.center,s.coordinates)<=area.radius)&&(!q||[s.name,s.shortName,s.area,s.address].join(' ').toLowerCase().includes(q)));
 }
 function placeUrl(s){const query=`${s.coordinates[1]},${s.coordinates[0]}`;return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${s.placeId?'&query_place_id='+encodeURIComponent(s.placeId):''}`;}
 function refreshPlan(stations,center,budget={},mode='area',now=Date.now()){
   const byDistance=(a,b)=>distance(center,a.coordinates)-distance(center,b.coordinates)||a.id.localeCompare(b.id);
   const oldest=s=>{const time=Date.parse(s.checkedAt);return Number.isFinite(time)?time:0;};
   const list=[...stations].sort(mode==='oldest'?(a,b)=>oldest(a)-oldest(b)||byDistance(a,b):byDistance);
   const stationNextAt=budget.resetAt&&now>=budget.resetAt?{}:budget.stationNextAt||{};
   const cooling=list.filter(s=>(stationNextAt[s.id]||0)>now);
   const ready=list.filter(s=>(stationNextAt[s.id]||0)<=now);
   const wanted=mode==='oldest'?ready.slice(0,5):ready;
   const daily=budget.resetAt&&now>=budget.resetAt?50:Math.max(0,budget.remainingChecks??50);
   const monthly=budget.monthlyResetAt&&now>=budget.monthlyResetAt?(budget.monthlyLimit??900):Math.max(0,budget.remainingMonthlyChecks??900);
   const available=Math.min(daily,monthly);
   const targets=wanted.slice(0,available),batches=[];
   for(let i=0;i<targets.length;i+=5)batches.push(targets.slice(i,i+5));
   return {targets,batches,total:list.length,eligible:wanted.length,cooling:cooling.length,nextAt:cooling.length?Math.min(...cooling.map(s=>stationNextAt[s.id])):0,limited:targets.length<wanted.length,remainingChecks:available};
 }
 function mergeLive(base,reading){const data={...base,refreshFailed:!!reading?.refreshFailed,live:!!reading?.checkedAt};for(const key of ['jamMetres','slowMetres','closedMetres','coveredMetres','radiusMetres','nearestRoadMetres','provider','checkedAt','errorCode','approach','trend'])data[key]=reading?.[key]??null;return data;}
 function validApproach(a,point,center){
   if(!a||a.method!=='entrance-road-v1'||!['matched','partial','unmapped'].includes(a.status)||!Array.isArray(a.routes)||a.routes.length>8)return false;
   if(a.status==='unmapped')return a.routes.length===0&&a.selectedId===null;
   if(!a.routes.length||new Set(a.routes.map(r=>r?.id)).size!==a.routes.length)return false;
   if(a.selectedId!==null&&!a.routes.some(r=>r.id===a.selectedId))return false;
   const valid=a.routes.every(r=>r&&typeof r.id==='string'&&r.id.length<=80&&typeof r.name==='string'&&r.name.length<=200&&typeof r.direction==='string'&&r.direction.length<=20&&point(r.entrance)&&(!center||distance(center,r.entrance)<=.101)&&r.targetMetres===200&&typeof r.complete==='boolean'&&[r.pathMetres,r.coveredMetres,r.jamMetres,r.slowMetres,r.closedMetres,r.otherSlowMetres].every(n=>Number.isFinite(n)&&n>=0&&n<=201)&&r.coveredMetres<=r.pathMetres+1&&[null,...Array.from({length:201},(_,i)=>i)].includes(r.continuousSlowMetres)&&r.jamMetres+r.slowMetres<=(r.continuousSlowMetres||0)+1&&r.closedMetres<=r.jamMetres+1&&[null,'ended','gap','limit'].includes(r.extent)&&(r.relativeSpeed===null||Number.isFinite(r.relativeSpeed)&&r.relativeSpeed>=0&&r.relativeSpeed<.7)&&Array.isArray(r.segments)&&r.segments.length<=41&&r.segments.every(s=>point(s.from)&&point(s.to)&&(!center||distance(center,s.from)<=.264&&distance(center,s.to)<=.264)&&Number.isFinite(s.relativeSpeed)&&s.relativeSpeed>=0&&s.relativeSpeed<=1&&typeof s.closed==='boolean'&&(!s.closed||s.relativeSpeed===0)&&s.speed===(s.relativeSpeed<=.35?'TRAFFIC_JAM':s.relativeSpeed<.7?'SLOW':'NORMAL'))&&(!r.complete||r.pathMetres>=199&&r.coveredMetres>=199&&r.continuousSlowMetres!==null));
   return valid&&(a.status!=='matched'||a.routes.every(r=>r.complete)&&a.selectedId!==null);
 }
 function validReading(reading,id,now=Date.now(),center,maxAge=300000){
   if(!reading||reading.id!==id||reading.error)return false;
   const {jamMetres:jam,slowMetres:slow,closedMetres:closed,coveredMetres:length,nearestRoadMetres:near,segments,checkedAt}=reading,time=Date.parse(checkedAt);
   if(reading.provider!=='tomtom-orbis-v2'||reading.radiusMetres!==250||![jam,slow,closed,length,near].every(Number.isFinite)||jam<0||slow<0||closed<0||closed>jam+1||near<0||near>100||length<150||length>20000||jam+slow>length+2||!Number.isFinite(time)||time>now+60000||now-time>maxAge)return false;
   const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
   return validApproach(reading.approach,point,center)&&Array.isArray(segments)&&segments.length>0&&segments.length<=3000&&segments.every(s=>s&&point(s.from)&&point(s.to)&&(!center||distance(center,s.from)<=.251&&distance(center,s.to)<=.251)&&Number.isFinite(s.relativeSpeed)&&s.relativeSpeed>=0&&s.relativeSpeed<=1&&typeof s.closed==='boolean'&&(!s.closed||s.relativeSpeed===0)&&s.speed===(s.relativeSpeed<=.35?'TRAFFIC_JAM':s.relativeSpeed<.7?'SLOW':'NORMAL'));
 }
 function validSavedReading(reading,id,now=Date.now(),center){return validReading(reading,id,now,center,Infinity);}
 const api={distance,fresh,opening,status,approachRoute,approachLabel,withTrend,trendLabel,slowdown,slowPercent,compareTraffic,ordered,inScope,refreshPlan,placeUrl,mergeLive,validReading,validSavedReading};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.Petrol=api;
})(typeof window!=='undefined'?window:globalThis);
