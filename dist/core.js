(function(root){
 'use strict';
 function distance(a,b){const r=Math.PI/180,x=(b[1]-a[1])*r,y=(b[0]-a[0])*r,h=Math.sin(x/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(y/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
 function fresh(date,now=Date.now()){const t=Date.parse(date);return Number.isFinite(t)&&now-t<=3600000&&t<=now+600000;}
 function opening(s,now=Date.now()){
   const state=s.operatingStatus||'unknown',source=s.operatingSource||'unknown',recent=fresh(s.operatingCheckedAt,now),firsthand=source==='firsthand';
   const label=state==='unknown'?'Opening unconfirmed':firsthand?(recent?'Reported ':'Earlier report: ')+state:'Listed '+state+' · unverified';
   return {label,state,source,recent,checkedAt:s.operatingCheckedAt,blocked:state==='closed'&&firsthand&&recent};
 }
 function status(s,now=Date.now()){
   const measured=Number.isFinite(s.jamMetres),recent=fresh(s.checkedAt,now)&&!s.refreshFailed,op=opening(s,now);
   const tone=op.blocked?'unavailable':!measured?'unknown':s.jamMetres>0?'long':s.slowMetres>0?'medium':'neutral';
   const base=op.blocked?'Reported closed':({neutral:'No slowdown returned',medium:'Slow traffic reported',long:'Congestion reported',unknown:s.refreshFailed?'Traffic unavailable':'Not checked'})[tone];
   return {tone,label:measured&&!recent&&!op.blocked?'Earlier: '+base.toLowerCase():base,fresh:recent,measured,blocked:op.blocked,opening:op};
 }
 function slowdown(s){return Math.max(0,s.jamMetres||0)+Math.max(0,s.slowMetres||0);}
 function compareTraffic(a,b){const length=s=>Math.max(1,s.approachMetres||1000);return slowdown(a)/length(a)-slowdown(b)/length(b)||(a.jamMetres||0)/length(a)-(b.jamMetres||0)/length(b);}
 function ordered(stations,origin,now=Date.now()){
   return [...stations].sort((a,b)=>{const x=status(a,now),y=status(b,now);return Number(x.blocked)-Number(y.blocked)||Number(!(x.measured&&x.fresh))-Number(!(y.measured&&y.fresh))||Number(!x.measured)-Number(!y.measured)||(x.measured&&y.measured?compareTraffic(a,b):0)||(origin?distance(origin,a.coordinates)-distance(origin,b.coordinates):0)||a.shortName.localeCompare(b.shortName);});
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
   const available=budget.resetAt&&now>=budget.resetAt?50:Math.max(0,budget.remainingChecks??50);
   const targets=wanted.slice(0,available),batches=[];
   for(let i=0;i<targets.length;i+=5)batches.push(targets.slice(i,i+5));
   return {targets,batches,total:list.length,eligible:wanted.length,cooling:cooling.length,nextAt:cooling.length?Math.min(...cooling.map(s=>stationNextAt[s.id])):0,limited:targets.length<wanted.length,remainingChecks:available};
 }
 function mergeLive(base,reading){return {...base,jamMetres:reading?.jamMetres??null,slowMetres:reading?.slowMetres??null,approachMetres:reading?.approachMetres??null,checkedAt:reading?.checkedAt??null,refreshFailed:!!reading?.refreshFailed,live:!!reading?.checkedAt};}
 const api={distance,fresh,opening,status,slowdown,compareTraffic,ordered,inScope,refreshPlan,placeUrl,mergeLive};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.Petrol=api;
})(typeof window!=='undefined'?window:globalThis);
