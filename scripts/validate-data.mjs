import assert from 'node:assert/strict';
import fs from 'node:fs';
const data = new URL('../src/data/', import.meta.url);
const read = file => JSON.parse(fs.readFileSync(new URL(file, data), 'utf8'));
const airports = read('airports.json'), airlines = read('airlines.json'), catalog = read('catalog-metadata.json');
const airportByCode = new Map(airports.map(a => [a.iata_code, a]));
const airlineByCode = new Map(airlines.map(a => [a.iata_code, a]));
assert.equal(airportByCode.size, airports.length, 'Duplicate airport IATA code');
assert.equal(airlineByCode.size, airlines.length, 'Duplicate airline IATA code');
function checkSources(ids) {
  assert(ids?.length, 'Missing source references');
  for (const id of ids) assert(catalog.sources[id], `Unknown source ${id}`);
}
function checkService(service) {
  const a = airportByCode.get(service.origin), b = airportByCode.get(service.destination);
  assert(a && b, `Unknown qualifying airport: ${service.origin}-${service.destination}`);
  assert.notEqual(a.region, b.region, 'Qualifying service must cross catalog regions');
  checkSources(service.source_ids);
}
for (const a of airports) {
  assert.match(a.iata_code, /^[A-Z]{3}$/);
  assert.match(a.icao_code, /^[A-Z0-9]{4}$/);
  assert(a.name_en && a.name_cn && a.city && a.city_cn);
  assert(catalog.regions[a.region]?.countries_or_regions.includes(a.country_or_region));
  assert(Number.isFinite(a.latitude) && Math.abs(a.latitude) <= 90);
  assert(Number.isFinite(a.longitude) && Math.abs(a.longitude) <= 180);
  assert(new Intl.DateTimeFormat('en', { timeZone: a.timezone }));
  assert(['active', 'seasonal', 'announced'].includes(a.service_status));
  if (a.service_status === 'announced') assert(a.service_start > catalog.checked_on);
  assert.equal(a.checked_on, catalog.checked_on);
  checkSources(a.source_ids); checkService(a.qualifying_service);
  assert(airlineByCode.has(a.qualifying_service.airline));
}
for (const a of airlines) {
  assert.match(a.iata_code, /^[A-Z0-9]{2}$/);
  assert(a.ticket_code === null || /^\d{3}$/.test(a.ticket_code));
  assert([null, 'OW', 'SA', 'ST'].includes(a.alliance));
  assert(['active', 'operating_affiliate'].includes(a.service_status));
  checkSources(a.source_ids); checkService(a.qualifying_service);
  if (a.marketing_carrier) assert(airlineByCode.has(a.marketing_carrier));
}
assert.equal(catalog.counts.airports, airports.length);
assert.equal(catalog.counts.current_airports, airports.filter(a => a.service_status !== 'announced').length);
assert.equal(catalog.counts.announced_airports, airports.filter(a => a.service_status === 'announced').length);
assert.equal(catalog.counts.independent_airlines, airlines.filter(a => a.service_status === 'active').length);
assert.equal(catalog.counts.operating_affiliates, airlines.filter(a => a.service_status === 'operating_affiliate').length);
assert(airportByCode.get('TFU').name_cn.includes('天府'));
assert(!airportByCode.has('CTU') && !airportByCode.has('GUM'));
assert.equal(airlineByCode.get('AS').legacy_iata_codes[0], 'HA');
const flights = read('flights.json');
const routes = read('routes.json');
const routeIds = new Set();
for (const route of routes) {
  assert(!routeIds.has(route.id), `Duplicate route ${route.id}`); routeIds.add(route.id);
  assert.equal(route.id, `${route.airline}:${route.origin}-${route.destination}`);
  assert(airlineByCode.has(route.airline));
  assert.equal(airportByCode.get(route.origin)?.region, 'asia_pacific');
  assert.equal(airportByCode.get(route.destination)?.region, 'north_america');
  assert(['active', 'seasonal', 'announced'].includes(route.service_status));
  assert(route.checked_on <= catalog.route_snapshot.checked_on);
  checkSources(route.source_ids);
  if (route.service_status === 'announced') assert(route.service_start > catalog.checked_on);
  if (route.service_start && route.service_end) assert(route.service_start <= route.service_end);
}
assert.equal(catalog.route_snapshot.records, routes.length);
const currentRoutes = routes.filter(r => r.service_status !== 'announced'
  && (!r.service_start || r.service_start <= catalog.checked_on)
  && (r.service_status === 'seasonal' || !r.service_end || r.service_end >= catalog.checked_on));
const currentKeys = new Set(currentRoutes.map(r => r.id));
assert(currentKeys.has('JD:TAO-YVR') && !currentKeys.has('JD:HGH-YVR'));
assert(!currentKeys.has('AC:CTS-YVR') && !currentKeys.has('DL:NRT-SEA'));
assert(!currentKeys.has('OZ:ICN-HNL'), 'Do not revive obsolete historical services');
assert(currentKeys.has('SQ:SIN-EWR') && currentKeys.has('BR:TPE-IAD'));
assert(currentRoutes.every(r => !['MEX','GUM','SPN','MCO'].includes(r.destination)));
const timetableKeys = new Set();
const excluded = new Set(catalog.exclusions.map(item => item.iata_code));
let visible = 0;
for (const f of flights) {
  const timetableKey = `${f.airline}:${f.flight_number}:${f.origin}-${f.destination}:${f.valid_from || 'legacy'}`;
  assert(!timetableKeys.has(timetableKey), `Duplicate timetable ${timetableKey}`); timetableKeys.add(timetableKey);
  assert(airlineByCode.has(f.airline), `Unknown schedule airline ${f.airline}`);
  assert.equal(typeof f.flight_number, 'string');
  for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) assert(['0', '1'].includes(f[day]));
  if (f.import_batch) {
    checkSources(f.source_ids);
    assert(f.valid_from && f.valid_to && f.valid_from <= f.valid_to);
    assert(f.checked_on <= (catalog.timetable_snapshot?.checked_on || catalog.checked_on));
    if (f.import_batch === catalog.timetable_snapshot?.import_batch) {
      assert.equal(f.checked_on, catalog.timetable_snapshot.checked_on);
      assert(f.aircraft, 'New researched flight must include sourced aircraft');
      assert.equal(f.dept_time, ''); assert.equal(f.arri_time, '');
      assert(f.valid_to <= catalog.timetable_snapshot.review_by);
    }
    if ([catalog.timetable_snapshot?.import_batch, catalog.timetable_snapshot?.seasonal_plan_import_batch].includes(f.import_batch)) {
      assert(f.operating_periods?.length, 'Missing source date periods');
      const expected = [];
      for (let t = Date.parse(`${f.display_from}T00:00:00Z`); t <= Date.parse(`${f.display_to}T00:00:00Z`); t += 86400000) {
        const stamp = new Date(t).toISOString().slice(0,10), day = String(new Date(t).getUTCDay() || 7);
        const planes = new Set(f.operating_periods.filter(p => (!p.valid_from || p.valid_from <= stamp)
          && (!p.valid_to || stamp <= p.valid_to) && p.weekdays.includes(day)).map(p => p.aircraft));
        if (planes.size) expected.push({date:stamp,aircraft:[...planes].sort().join(' / ')});
      }
      assert.deepEqual(f.departures, expected, `Incorrect departure calendar: ${timetableKey}`);
      assert.equal(new Set(f.departures.map(d => d.date)).size,f.departures.length);
    }
    const a = airportByCode.get(f.origin), b = airportByCode.get(f.destination);
    const key = a?.region === 'asia_pacific' ? `${f.airline}:${f.origin}-${f.destination}` : `${f.airline}:${f.destination}-${f.origin}`;
    assert(currentKeys.has(key), `Timetable without a researched route: ${key}`);
  }
  for (const code of [f.origin, f.destination]) assert(airportByCode.has(code) || excluded.has(code), `Unexplained legacy endpoint ${code}`);
  const a = airportByCode.get(f.origin), b = airportByCode.get(f.destination);
  if (a && b && a.region !== b.region) visible++;
}
assert.equal(flights[0].flight_number, '0127');
if (catalog.timetable_snapshot) {
  const snapshot = flights.filter(f => f.import_batch === catalog.timetable_snapshot.import_batch);
  assert.equal(snapshot.length, catalog.timetable_snapshot.records);
  assert.equal(new Set(snapshot.map(f => f.airline)).size, catalog.timetable_snapshot.airlines);
  const snapshotRoutes = new Set(snapshot.map(f => {
    const a = airportByCode.get(f.origin);
    return a.region === 'asia_pacific' ? `${f.airline}:${f.origin}-${f.destination}` : `${f.airline}:${f.destination}-${f.origin}`;
  }));
  assert.equal(snapshotRoutes.size, catalog.timetable_snapshot.airline_route_records);
  for (const id of catalog.timetable_snapshot.missing_airline_routes) assert(!snapshotRoutes.has(id));
  const plans = flights.filter(f => f.import_batch === catalog.timetable_snapshot.seasonal_plan_import_batch);
  assert.equal(plans.length, catalog.timetable_snapshot.seasonal_plan_records);
  assert(plans.every(f => f.valid_from > catalog.timetable_snapshot.checked_on && f.aircraft));
  for (const key of ['AA:NRT-ORD','UA:NRT-ORD','UA:KIX-LAX']) assert(!currentKeys.has(key));
  const ac = n => snapshot.find(f => f.airline === 'AC' && f.flight_number === n);
  assert.equal(ac('0007').departures.length,5);
  assert.equal(ac('0008').departures.length,5);
  assert.equal(ac('0015').departures[0].date,'2026-10-23');
  const sichuan = snapshot.find(f => f.airline === '3U' && f.flight_number === '3859');
  assert.deepEqual(sichuan.departures.map(d => d.date),['2026-10-20','2026-10-23']);
}
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const path of ['src/js/app.js', 'src/css/style.css']) {
  assert(html.includes(path)); assert(fs.existsSync(new URL(`../${path}`, import.meta.url)));
}
console.log(`PASS: ${airports.length} airports, ${airlines.length} airline records, ${routes.length} sourced airline/route records (${currentRoutes.length} current/seasonal), ${flights.length} timetable records (${visible} in geographic scope).`);
