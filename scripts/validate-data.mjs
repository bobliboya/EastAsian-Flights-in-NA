import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const data = process.env.FLIGHT_DATA_DIR
  ? pathToFileURL(path.resolve(process.env.FLIGHT_DATA_DIR) + path.sep)
  : new URL('../src/data/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, data), 'utf8'));
const airports = read('airports.json'), airlines = read('airlines.json');
const airportByCode = new Map(airports.map(a => [a.iata_code, a]));
const airlineCodes = new Set(airlines.map(a => a.iata_code));
assert.equal(airportByCode.size, airports.length, 'Duplicate airport');
assert.equal(airlineCodes.size, airlines.length, 'Duplicate airline');
for (const airport of airports) {
  assert.deepEqual(Object.keys(airport).sort(), ['city', 'city_cn', 'country_or_region', 'iata_code', 'latitude', 'longitude', 'name_cn', 'name_en', 'region']);
  assert.match(airport.iata_code, /^[A-Z]{3}$/);
  assert(['asia_pacific', 'north_america'].includes(airport.region));
  assert(airport.name_cn && airport.name_en && airport.city && airport.city_cn);
  assert(Number.isFinite(airport.latitude) && Math.abs(airport.latitude) <= 90);
  assert(Number.isFinite(airport.longitude) && Math.abs(airport.longitude) <= 180);
  assert.match(airport.country_or_region, /^[A-Z]{3}$/);
}
for (const airline of airlines) {
  assert.deepEqual(Object.keys(airline).sort(), ['alliance', 'country_or_region', 'iata_code', 'name_cn', 'name_en']);
  assert.match(airline.iata_code, /^[A-Z0-9]{2}$/);
  assert(airline.name_cn && airline.name_en);
  assert.match(airline.country_or_region, /^[A-Z]{3}$/);
  assert([null, 'OW', 'SA', 'ST'].includes(airline.alliance));
}
const routes = read('routes.json'), flights = read('flights.json');
const routeIds = new Set();
for (const route of routes) {
  assert.deepEqual(Object.keys(route).sort(), ['airline', 'destination', 'id', 'note', 'origin']);
  assert(airlineCodes.has(route.airline), `Unknown airline: ${route.airline}`);
  assert.equal(route.id, `${route.airline}:${route.origin}-${route.destination}`);
  assert(!routeIds.has(route.id), `Duplicate route: ${route.id}`);
  routeIds.add(route.id);
  assert.equal(airportByCode.get(route.origin)?.region, 'asia_pacific', `Invalid origin: ${route.id}`);
  assert.equal(airportByCode.get(route.destination)?.region, 'north_america', `Invalid destination: ${route.id}`);
  assert.equal(typeof route.note, 'string');
}
const flightIds = new Set();
for (const flight of flights) {
  assert.deepEqual(Object.keys(flight).sort(), ['aircraft', 'airline', 'destination', 'flight_number', 'note', 'origin', 'weekdays', 'weekly_flights']);
  const id = `${flight.airline}:${flight.flight_number}:${flight.origin}-${flight.destination}`;
  assert(!flightIds.has(id), `Duplicate flight: ${id}`);
  flightIds.add(id);
  assert.match(flight.flight_number, /^\d{4}$/);
  assert.match(flight.weekdays, /^[1-7]+$/);
  assert.equal(new Set(flight.weekdays).size, flight.weekdays.length, `Duplicate weekday: ${id}`);
  assert(Number.isInteger(flight.weekly_flights) && flight.weekly_flights >= 1 && flight.weekly_flights <= 7);
  assert.equal(flight.weekly_flights, flight.weekdays.length, `Weekly count mismatch: ${id}`);
  assert(typeof flight.note === 'string' && flight.note.trim(), `Missing timeliness note: ${id}`);
  assert.equal(typeof flight.aircraft, 'string');
  assert(!flight.aircraft || /^[AB]\d{2}[0-9A-Z]( \/ [AB]\d{2}[0-9A-Z])*$/.test(flight.aircraft), `Invalid aircraft code: ${id}`);
  const originAirport = airportByCode.get(flight.origin);
  const destinationAirport = airportByCode.get(flight.destination);
  assert(originAirport && destinationAirport && originAirport.region !== destinationAirport.region, `Invalid endpoints: ${id}`);
  const [asia, america] = originAirport.region === 'asia_pacific' ? [flight.origin, flight.destination] : [flight.destination, flight.origin];
  assert(routeIds.has(`${flight.airline}:${asia}-${america}`), `Flight without route: ${id}`);
}
console.log(`PASS: ${routes.length} current airline-route records, ${flights.length} weekly flight records.`);
