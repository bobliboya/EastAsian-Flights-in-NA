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
  assert.equal(route.checked_on, catalog.route_snapshot.checked_on);
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
    assert.equal(f.checked_on, catalog.checked_on);
    const a = airportByCode.get(f.origin), b = airportByCode.get(f.destination);
    const key = a?.region === 'asia_pacific' ? `${f.airline}:${f.origin}-${f.destination}` : `${f.airline}:${f.destination}-${f.origin}`;
    assert(currentKeys.has(key), `Timetable without a researched route: ${key}`);
  }
  for (const code of [f.origin, f.destination]) assert(airportByCode.has(code) || excluded.has(code), `Unexplained legacy endpoint ${code}`);
  const a = airportByCode.get(f.origin), b = airportByCode.get(f.destination);
  if (a && b && a.region !== b.region) visible++;
}
assert.equal(flights[0].flight_number, '0127');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const path of ['src/js/app.js', 'src/css/style.css']) {
  assert(html.includes(path)); assert(fs.existsSync(new URL(`../${path}`, import.meta.url)));
}
console.log(`PASS: ${airports.length} airports, ${airlines.length} airline records, ${routes.length} sourced airline/route records (${currentRoutes.length} current/seasonal), ${flights.length} timetable records (${visible} in geographic scope).`);
