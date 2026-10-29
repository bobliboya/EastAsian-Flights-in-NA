import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogOptionHTML, countryHeadingHTML, createAirlineRenderer,
  createFlightRenderer, departureSummary, groupByCountry } from '../src/js/display.js';
import { nearbyAirports, pacific, routeCurve, routeColor, ROUTE_CURVE } from '../src/js/geometry.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));
const airlines = read('airlines.json');
const renderAirline = createAirlineRenderer(Object.fromEntries(airlines.map(a => [a.iata_code, a])));
const renderFlight = createFlightRenderer(renderAirline);

// User-facing display rules: count in both languages; daily flights omit weekdays.
const flight = { airline: 'CA', flight_number: '0001', origin: 'PEK', destination: 'LAX',
  aircraft: '', weekly_flights: 2, weekdays: '26', note: '资料待核实' };
assert(renderFlight(flight).includes('每周2班 / 2 Flights per week<br>二 六 / TUE SAT'));
assert(renderFlight({ ...flight, weekly_flights: 3, weekdays: '135' })
  .includes('每周3班 / 3 Flights per week<br>一 三 五 / MON WED FRI'));
const daily = renderFlight({ ...flight, weekly_flights: 7, weekdays: '1234567' });
assert(daily.includes('每周7班 / 7 Flights per week<br>备注'));
assert(!daily.includes('MON') && !daily.includes('周一'));
assert(!renderFlight({ ...flight, note: '<script>alert(1)</script>' }).includes('<script>'));
assert(!renderFlight({ ...flight, aircraft: '<img onerror=alert(1)>' }).includes('<img onerror='));

// Logos stay in the agreed order; alliance logos are last and absent for nonmembers.
for (const airline of airlines) {
  const option = catalogOptionHTML(airline, true);
  const card = renderAirline(airline.iata_code, `${airline.iata_code}0001`);
  for (const [html, codeClass] of [[option, 'catalog-code'], [card, 'airline-code']]) {
    assert(html.indexOf('class="airline-logo"') < html.indexOf(`class="${codeClass}"`));
    assert(html.indexOf(`class="${codeClass}"`) < html.indexOf('class="bilingual-lines"'));
    assert.equal(html.includes('alliance-logo'), Boolean(airline.alliance));
    if (airline.alliance) assert(html.indexOf('bilingual-lines') < html.indexOf('alliance-logo'));
    assert(!html.includes('country-flag'));
  }
}
assert(countryHeadingHTML('CHN').includes('Mainland China'));
assert(countryHeadingHTML('TWN').includes('台湾地区'));
assert(countryHeadingHTML('TWN').includes('>Taiwan<'));
assert(!countryHeadingHTML('TWN').includes('<img'));
assert.deepEqual(groupByCountry([{ region: 'TWN' }, { region: 'CHN' }], a => a.region).map(([key]) => key), ['CHN', 'TWN']);

// Drawn lines and route hit tests need identical samples and unmodified endpoints.
assert.deepEqual(pacific([40, -120]), [40, 240]);
for (const [start, end, direction] of [[[20, 120], [20, -120], -1], [[40, 120], [40, -120], 1]]) {
  const points = routeCurve(start, end);
  assert.equal(points.length, ROUTE_CURVE.samples);
  assert.deepEqual(points[0], pacific(start));
  assert.deepEqual(points.at(-1), pacific(end));
  assert((points[Math.floor(points.length / 2)][0] - start[0]) * direction > 0);
  assert(points.every(point => point.every(Number.isFinite)));
}
assert.equal(routeColor('CHN', true), 'var(--route-greater-china-highlight)');
assert.equal(routeColor('TWN'), routeColor('CHN'));

const flights = read('flights.json');
for (const f of flights) {
  assert(renderFlight(f).includes(`每周${f.weekly_flights}班 / ${f.weekly_flights} Flights per week`));
  assert.equal(departureSummary(f).split('\n').length, f.weekly_flights === 7 ? 1 : 2);
}
console.log(`PASS: display rules, logos, regions, geometry and ${flights.length} flight cards.`);

// Nearby-airport choice uses real distances, not a hardcoded city-pair list.
const airports = read('airports.json');
const neighbors = code => nearbyAirports(airports.find(a => a.iata_code === code), airports).map(a => a.iata_code);
for (const group of [['LAX', 'ONT', 'SAN'], ['HKG', 'SZX', 'CAN'], ['HND', 'NRT'], ['JFK', 'EWR']]) {
  for (const code of group) {
    assert.equal(neighbors(code)[0], code, 'The chosen airport must anchor the popup');
    group.forEach(member => assert(neighbors(code).includes(member), `${code} must offer ${member}`));
  }
}
assert(!neighbors('SEA').includes('YVR'), 'Do not expand beyond the geographic radius');
assert.deepEqual(neighbors('SIN'), ['SIN']);
assert.deepEqual(nearbyAirports(undefined, airports), []);
const chain = [0, 1.5, 3].map((longitude, i) => ({ iata_code: String(i), latitude: 0, longitude, region: 'test' }));
assert.deepEqual(nearbyAirports(chain[0], chain).map(a => a.iata_code), ['0', '1'], 'No transitive chaining');
console.log('PASS: nearby airport choices, anchor order and radius boundaries.');
