// Weekly patterns use local departure weekdays; a return need not leave on the same day.
export function auditRoundTrips(flights, airports, declaredPairs = []) {
  const regions = new Map(airports.map(a => [a.iata_code, a.region]));
  const groups = new Map();
  const errors = [];
  for (const f of flights) {
    const outbound = regions.get(f.origin) === 'asia_pacific';
    const asia = outbound ? f.origin : f.destination;
    const america = outbound ? f.destination : f.origin;
    const key = `${f.airline}:${asia}-${america}`;
    if (!groups.has(key)) groups.set(key, [[], []]);
    groups.get(key)[outbound ? 0 : 1].push(f);
  }
  for (const [key, directions] of groups) {
    const totals = directions.map(rows => rows.reduce((n, f) => n + f.weekly_flights, 0));
    const label = rows => rows.map(f => `${f.airline}${f.flight_number}=${f.weekly_flights}`).join(', ') || 'missing';
    if (totals[0] !== totals[1]) {
      errors.push(`${key}: unequal weekly totals ${totals.join('/')} (${directions.map(label).join(' / ')})`);
    }
    // Comparing multisets catches 3+4 versus 2+5, even when route totals balance.
    const frequencies = directions.map(rows => rows.map(f => f.weekly_flights).sort((a, b) => a - b).join(','));
    if (frequencies[0] !== frequencies[1]) {
      errors.push(`${key}: unmatched reverse flight frequencies [${frequencies.join('] / [')}]`);
    }
  }
  for (const pair of declaredPairs) {
    const rows = flights.filter(f => f.airline === pair.airline
      && ((f.origin === pair.origin && f.destination === pair.destination)
        || (f.origin === pair.destination && f.destination === pair.origin)));
    if (!rows.length) continue; // Routes with no timetable remain valid.
    const out = rows.find(f => f.flight_number === pair.outbound && f.origin === pair.origin);
    const back = rows.find(f => f.flight_number === pair.inbound && f.origin === pair.destination);
    const id = `${pair.airline}${pair.outbound}/${pair.inbound}`;
    if (!out || !back) errors.push(`${id}: missing declared return flight on ${pair.origin}-${pair.destination}`);
    else if (out.weekly_flights !== back.weekly_flights) errors.push(`${id}: unequal paired weekly frequencies`);
  }
  return { routeCount: groups.size, errors };
}
