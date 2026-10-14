const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../dist/core.js');
const {updateObservation}=require('../scripts/update-observation.cjs');
const now=Date.parse('2026-10-15T02:00:00+08:00');
const station=(id,length,extra={})=>({id,name:id,length,checkedAt:'2026-10-15T01:50:00+08:00',coordinates:[115,-8],stock:{pertalite:'unknown',pertamax:'unknown'},...extra});
test('traffic comparison never invents a waiting time, including when no red is seen',()=>{
  assert.equal(P.status(station('low',[100,200]),'either',now).label,'Less busy');
  assert.equal(P.status(station('medium',[600,800]),'either',now).label,'Busy');
  assert.equal(P.status(station('high',[1100,1300]),'either',now).label,'Very busy');
  assert.equal(P.status(station('clear',[0,0]),'either',now).wait,null);
  assert.equal(P.status(station('unknown',null),'either',now).label,'Unknown');
});
test('old low traffic cannot outrank a fresh observation or claim to be current',()=>{
  const old=station('old-quiet',[0,20],{checkedAt:'2026-10-14T10:45:00+08:00'}),recent=station('recent-busy',[800,1000]);
  assert.equal(P.status(old,'either',now).label,'Was less busy');
  assert.equal(P.ordered([old,recent],'congestion',null,'either',now)[0].id,'recent-busy');
});
test('current closures and selected-fuel outages cannot be the suggested quiet option',()=>{
  const closed=station('closed',[0,0],{operatingStatus:'closed'}),out=station('out',[10,20],{stock:{pertalite:'out',pertamax:'available'}}),open=station('open',[500,600]);
  assert.equal(P.ordered([closed,out,open],'congestion',null,'pertalite',now)[0].id,'open');
  assert.equal(P.status(closed,'either',now).label,'Closed');
  assert.equal(P.ordered([closed,out,open],'congestion',null,'pertamax',now)[0].id,'out');
  assert.equal(P.status({...closed,checkedAt:'2026-10-14T10:45:00+08:00'},'either',now).blocked,false);
});
test('reported waits take priority over road traffic, with dated language for older reports',()=>{
  const s=station('inside-queue',[0,0],{waitMinutes:[60,90]});
  assert.equal(P.status(s,'either',now).label,'Very busy');
  assert.equal(P.status(s,'either',now).wait,'60–90 min');
  assert.equal(P.status({...s,checkedAt:'2026-10-14T10:45:00+08:00'},'either',now).label,'Was very busy');
  assert.ok(!P.validCheck({...s,waitMinutes:[30,10]}));
  assert.ok(!P.validCheck({...s,waitMinutes:[0,721]}));
});
test('shared wait-only and opening-only updates work without fabricating red-road length',()=>{
  const data={stations:[station('one',[100,200])]},input={STATION:'one',OBSERVED_AT:'2026-10-15T01:55',NOTE:'Observed at the station.',WAIT_MINIMUM:'10',WAIT_MAXIMUM:'20'};
  const updated=updateObservation(data,input,now).stations[0];
  assert.deepEqual(updated.waitMinutes,[10,20]);assert.equal(updated.length,null);
  const closed=updateObservation(data,{STATION:'one',OBSERVED_AT:'2026-10-15T01:55',NOTE:'Google Maps lists closed.',OPERATING_STATUS:'closed'},now).stations[0];
  assert.equal(closed.operatingStatus,'closed');assert.equal(closed.waitMinutes,null);
  assert.throws(()=>updateObservation(data,{...input,WAIT_MAXIMUM:''},now));
});
