const {test} = require('node:test');
const assert = require('node:assert/strict');
const {updateObservation} = require('../scripts/update-observation.cjs');
const data = require('../dist/observations.json');
const fixture = {...data, stations:data.stations.map(s=>({...s,checkedAt:s.length?'2026-10-14T10:45:00+08:00':null}))};
const input = {STATION:'nusa-dua',MINIMUM:'50',MAXIMUM:'100',PERTALITE:'unknown',PERTAMAX:'available',OBSERVED_AT:'2026-10-15T12:00',NOTE:'Red approach checked against the map scale.'};
const now = Date.parse('2026-10-15T12:00:00+08:00');
test('a shared update changes only the observed station and preserves actual observation time',()=>{
  const result=updateObservation(fixture,input,now);
  assert.deepEqual(result.stations[0].length,[50,100]);
  assert.equal(result.stations[0].stock.pertamax,'available');
  assert.equal(result.checkedAt,'2026-10-15T12:00:00+08:00');
  assert.deepEqual(result.stations.slice(1),fixture.stations.slice(1));
  assert.deepEqual(fixture.stations[0].length,data.stations[0].length);
});
test('fuel-only checks remove the obsolete traffic measurement',()=>{
  const result=updateObservation(fixture,{...input,MINIMUM:'',MAXIMUM:''},now);
  assert.equal(result.stations[0].length,null);
  assert.throws(()=>updateObservation(fixture,{...input,MINIMUM:'',MAXIMUM:'',PERTAMAX:'unknown'},now));
});
test('updates reject unknown stations, stale replacements, invalid dates, future times and invalid ranges',()=>{
  for (const patch of [{STATION:'unknown'},{OBSERVED_AT:'2026-10-13T12:00'},{OBSERVED_AT:'2026-10-16T12:00'},{OBSERVED_AT:'2026-02-30T12:00'},{OBSERVED_AT:''},{MINIMUM:''},{MINIMUM:'200'},{MAXIMUM:'-2'},{MAXIMUM:'NaN'},{PERTAMAX:'yes'},{NOTE:''}]) {
    assert.throws(()=>updateObservation(fixture,{...input,...patch},now));
  }
});
