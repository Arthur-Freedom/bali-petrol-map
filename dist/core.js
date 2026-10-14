(function(root){
  'use strict';
  const mean=s=>s.length?(s.length[0]+s.length[1])/2:Infinity;
  function distance(a,b){const rad=Math.PI/180;const x=(b[1]-a[1])*rad,y=(b[0]-a[0])*rad;const h=Math.sin(x/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(y/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
  function formatLength(v){if(!v)return 'Not checked';const f=n=>n>=1000?`${Number((n/1000).toFixed(1))} km`:`${n} m`;if(v[0]===v[1])return f(v[0]);return v[0]>=1000?`${(v[0]/1000).toFixed(1)}–${(v[1]/1000).toFixed(1)} km`:`${v[0]}–${v[1]} m`;}
  const severity=s=>!s.length?'unknown':mean(s)<250?'short':mean(s)<900?'medium':'long';
  function availability(s,fuel){const stock=s.stock||{};if(fuel!=='either')return stock[fuel]||'unknown';if(Object.values(stock).includes('available'))return 'available';return stock.pertalite==='out'&&stock.pertamax==='out'?'out':'unknown';}
  function ordered(stations,sort,origin,fuel){return [...stations].sort((a,b)=>{const unavailable=(availability(a,fuel)==='out')-(availability(b,fuel)==='out');if(unavailable)return unavailable;if(sort==='distance'&&origin)return distance(origin,a.coordinates)-distance(origin,b.coordinates);if(sort==='name')return a.name.localeCompare(b.name);return mean(a)-mean(b)||a.name.localeCompare(b.name);});}
  function waitRange(length,spacing,rows,pumps,seconds){if(!length||![spacing,rows,pumps,seconds].every(v=>Number.isFinite(v)&&v>0))return null;return length.map(m=>Math.ceil(m/spacing*rows*seconds/(pumps*60)));}
  function validCheck(c){return c&&(c.length===null||(Array.isArray(c.length)&&c.length.length===2&&c.length.every(v=>Number.isFinite(v)&&v>=0&&v<=10000)&&c.length[0]<=c.length[1]))&&Number.isFinite(Date.parse(c.checkedAt))&&c.stock&&['pertalite','pertamax'].every(k=>['available','out','unknown'].includes(c.stock[k]));}
  const api={mean,distance,formatLength,severity,availability,ordered,waitRange,validCheck};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.Petrol=api;
})(typeof window!=='undefined'?window:globalThis);
