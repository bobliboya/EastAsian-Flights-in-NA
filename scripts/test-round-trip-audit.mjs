import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditRoundTrips } from './round-trip-audit.mjs';
const read = name => JSON.parse(fs.readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const airports = read('airports'), flights = read('flights');
const pairs = JSON.parse(fs.readFileSync(new URL('./data/round-trip-pairs.json', import.meta.url), 'utf8'));
const audit = rows => auditRoundTrips(rows, airports, pairs).errors;
assert.deepEqual(audit(flights), []);
const target = (f, code, number) => f.airline === code && f.flight_number === number;
assert(audit(flights.filter(f => !target(f, 'CA', '0987'))).some(e => e.includes('0987/0988')));
const wrongNumber = flights.map(f => target(f, 'CA', '0987') ? { ...f, flight_number: '0989' } : f);
assert(audit(wrongNumber).some(e => e.includes('missing declared return')));
const wrongFrequency = flights.map(f => target(f, 'AC', '0061') ? { ...f, weekly_flights: 5, weekdays: '12345' } : f);
assert(audit(wrongFrequency).some(e => e.includes('0061/0062')));
// Balanced route totals alone must not hide two mismatched flight groups.
const sample = (n, from, to, frequency) => ({ airline: 'XX', flight_number: n, origin: from, destination: to, weekly_flights: frequency });
assert(auditRoundTrips([
  sample('0001','PEK','LAX',3), sample('0003','PEK','LAX',4),
  sample('0002','LAX','PEK',2), sample('0004','LAX','PEK',5),
], airports).errors.some(e => e.includes('unmatched reverse')));
// Number parity and identical local weekdays are not universal pairing rules.
assert.deepEqual(auditRoundTrips([
  { ...sample('0042','PEK','LAX',2), weekdays: '13' },
  { ...sample('0901','LAX','PEK',2), weekdays: '24' },
], airports).errors, []);
assert.deepEqual(auditRoundTrips([], airports, pairs).errors, []);
for (const [a, b] of [['0061','0062'], ['0005','0006'], ['0007','0008']]) {
  assert.equal(flights.find(f => target(f,'AC',a)).weekly_flights, 7);
  assert.equal(flights.find(f => target(f,'AC',b)).weekly_flights, 7);
}
assert(!flights.some(f => target(f,'AC','0015')), 'One-off AC15 must not be a recurring weekly flight');
console.log('PASS: round-trip audit regressions (missing return, wrong number, frequency mismatch, local day shift).');
