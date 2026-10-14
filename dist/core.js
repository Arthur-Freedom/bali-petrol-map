(function(root){
  'use strict';
  const mean=s=>s.length?(s.length[0]+s.length[1])/2:Infinity;
  const fresh=(s,now=Date.now())=>Number.isFinite(Date.parse(s.checkedAt))&&now-Date.parse(s.checkedAt)<=3600000&&Date.parse(s.checkedAt)<=now+600000;
  const validRange=(v,max)=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&n>=0&&n<=max)&&v[0]<=v[1];
  function distance(a,b){const rad=Math.PI/180;const x=(b[1]-a[1])*rad,y=(b[0]-a[0])*rad;const h=Math.sin(x/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(y/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
  function formatLength(v){if(!v)return 'Not checked';const f=n=>n>=1000?`${Number((n/1000).toFixed(1))} km`:`${n} m`;if(v[0]===v[1])return f(v[0]);return v[0]>=1000?`${(v[0]/1000).toFixed(1)}–${(v[1]/1000).toFixed(1)} km`:`${v[0]}–${v[1]} m`;}
  function formatWait(v){return v?(v[0]===v[1]?`${v[0]} min`:`${v[0]}–${v[1]} min`):'Wait unknown';}
  function severity(s){if(s.waitMinutes){const m=(s.waitMinutes[0]+s.waitMinutes[1])/2;return m<=15?'short':m<=45?'medium':'long';}return !s.length?'unknown':mean(s)<250?'short':mean(s)<900?'medium':'long';}
  function availability(s,fuel){const stock=s.stock||{};if(fuel!=='either')return stock[fuel]||'unknown';if(Object.values(stock).includes('available'))return 'available';return stock.pertalite==='out'&&stock.pertamax==='out'?'out':'unknown';}
  function status(s,fuel='either',now=Date.now()){
    const recent=fresh(s,now)&&!s.refreshFailed,measured=!!(s.length||s.waitMinutes);
    const closed=recent&&s.operatingStatus==='closed',out=recent&&availability(s,fuel)==='out';
    const tone=closed||out?'unavailable':severity(s);
    const label=closed?'Closed':out?'Fuel reported out':({short:'Less busy',medium:'Busy',long:'Very busy',unknown:'Unknown'})[tone];
    return {tone,label:!recent&&measured&&!closed&&!out?'Was '+label.toLowerCase():label,baseLabel:label,fresh:recent,measured,blocked:closed||out,wait:s.waitMinutes?formatWait(s.waitMinutes):null,basis:s.waitMinutes?'Reported wait':'Traffic-based estimate'};
  }
  function ordered(stations,sort,origin,fuel,now=Date.now()){
    const order={short:0,medium:1,long:2,unknown:3};
    return [...stations].sort((a,b)=>{
      const as=status(a,fuel,now),bs=status(b,fuel,now),blocked=Number(as.blocked)-Number(bs.blocked);
      if(blocked)return blocked;
      if(sort==='distance'&&origin)return distance(origin,a.coordinates)-distance(origin,b.coordinates);
      if(sort==='name')return a.name.localeCompare(b.name);
      const hasData=Number(!as.measured)-Number(!bs.measured);if(hasData)return hasData;
      const age=Number(!as.fresh)-Number(!bs.fresh);if(age)return age;
      const category=order[severity(a)]-order[severity(b)];if(category)return category;
      if(a.waitMinutes&&b.waitMinutes)return a.waitMinutes[0]+a.waitMinutes[1]-b.waitMinutes[0]-b.waitMinutes[1]||a.name.localeCompare(b.name);
      return mean(a)-mean(b)||a.name.localeCompare(b.name);
    });
  }
  function waitRange(length,spacing,rows,pumps,seconds){if(!validRange(length,10000)||![spacing,rows,pumps,seconds].every(v=>Number.isFinite(v)&&v>0))return null;return length.map(m=>Math.ceil(m/spacing*rows*seconds/(pumps*60)));}
  function validCheck(c){return c&&(c.length===null||validRange(c.length,10000))&&(c.waitMinutes==null||validRange(c.waitMinutes,720))&&(c.operatingStatus==null||['open','closed','unknown'].includes(c.operatingStatus))&&Number.isFinite(Date.parse(c.checkedAt))&&c.stock&&['pertalite','pertamax'].every(k=>['available','out','unknown'].includes(c.stock[k]));}
  function mergeLive(base,reading,now=Date.now()){
    if(!reading)return base;
    const keep=fresh(base,now);
    return {...base,length:[reading.jamMetres,reading.jamMetres],checkedAt:reading.checkedAt,live:true,personal:false,refreshFailed:!!reading.refreshFailed,
      waitMinutes:keep?base.waitMinutes:null,operatingStatus:keep?base.operatingStatus:'unknown',
      stock:keep?base.stock:{pertalite:'unknown',pertamax:'unknown'},observationCheckedAt:keep?base.checkedAt:null,
      note:`Google traffic: ${reading.jamMetres} m congested and ${reading.slowMetres} m slow on the sampled ${reading.approachMetres} m approach. This is road congestion, not a measured pump queue.${reading.refreshFailed?' Latest refresh failed; this is the previous reading.':''}`};
  }
  const api={mean,distance,formatLength,formatWait,severity,availability,ordered,waitRange,validCheck,fresh,status,mergeLive};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.Petrol=api;
})(typeof window!=='undefined'?window:globalThis);
