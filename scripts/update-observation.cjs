'use strict';
const fs = require('node:fs');
const path = require('node:path');
const P = require('../dist/core.js');

function updateObservation(data, input, now = Date.now()) {
  const station = data.stations.find(s => s.id === input.STATION);
  if (!station) throw Error('Choose a known station.');
  const min = String(input.MINIMUM ?? '').trim();
  const max = String(input.MAXIMUM ?? '').trim();
  if ((min === '') !== (max === '')) throw Error('Provide both ends of the length range, or leave both blank.');
  const observed = String(input.OBSERVED_AT ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(observed)) throw Error('Enter the actual Bali observation time as YYYY-MM-DDTHH:mm.');
  const checkedAt = observed + ':00+08:00';
  const timestamp = Date.parse(checkedAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp + 8 * 3600000).toISOString().slice(0,16) !== observed) throw Error('Invalid calendar date or time.');
  if (timestamp > now + 600000) throw Error('Observation time cannot be more than 10 minutes in the future.');
  if (station.checkedAt && timestamp < Date.parse(station.checkedAt)) throw Error('An older observation cannot replace a newer one.');
  const length = min === '' ? null : [Number(min), Number(max)];
  const stock = {pertalite: input.PERTALITE || 'unknown', pertamax: input.PERTAMAX || 'unknown'};
  if (!P.validCheck({length, stock, checkedAt})) throw Error('Use a length from 0 to 10,000 metres, in ascending order, and valid fuel statuses.');
  if (!length && Object.values(stock).every(v => v === 'unknown')) throw Error('Record a length or a fuel availability check.');
  const note = String(input.NOTE ?? '').trim();
  if (!note || note.length > 1000) throw Error('Describe what you observed in 1–1,000 characters.');
  const stations = data.stations.map(s => s.id === station.id ? {...s, length, stock, checkedAt, note} : s);
  const latest = stations.filter(s => s.checkedAt).sort((a,b) => Date.parse(b.checkedAt)-Date.parse(a.checkedAt))[0].checkedAt;
  return {...data, checkedAt: latest, stations};
}

if (require.main === module) {
  const file = path.join(__dirname, '../dist/observations.json');
  const updated = updateObservation(JSON.parse(fs.readFileSync(file, 'utf8')), process.env);
  fs.writeFileSync(file, JSON.stringify(updated, null, 2) + '\n');
  console.log('Saved one observation. Other stations retain their original timestamps.');
}
module.exports = {updateObservation};
