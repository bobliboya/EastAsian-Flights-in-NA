// Pure HTML and text formatting. No DOM, network or map state.
const NOTE_TRANSLATIONS = {
  "杭州始发航班经停青岛；地图仅连接青岛—温哥华不停站航段。": "Flights originating in Hangzhou stop at Qingdao; only the nonstop Qingdao–Vancouver segment is mapped.",
  "票帝注明10月25日起增加杭州技术经停；该日期后不再计作不停站航线，需再次核实。": "The schedule source lists a technical stop in Hangzhou from October 25. The route is excluded from nonstop counts after that date and requires reconfirmation."
};
export const bilingualNote = note => bilingual(note, NOTE_TRANSLATIONS[note]);
export const bilingual = (zh, en) => en && en !== zh ? `${zh} / ${en}` : zh;
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// SVG arrows keep their shape across Apple platforms and system fonts.
export const arrowHTML = (both = false) => `<svg class="inline-arrow" viewBox="0 0 24 24" role="img" aria-label="${both ? '往返 / Both directions' : '至 / To'}" focusable="false"><path d="M4 12h16m-6-6 6 6-6 6${both ? 'M10 6l-6 6 6 6' : ''}"/></svg>`;
export const chevronHTML = '<svg class="filter-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
export function departureSummary(f) {
  const zh = ['一', '二', '三', '四', '五', '六', '日'];
  const en = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const weekdays = [...f.weekdays];
  const frequency = `每周${f.weekly_flights}班 / ${f.weekly_flights} Flights per week`;
  if (f.weekly_flights === 7) return frequency;
  return `${frequency}\n${weekdays.map(d => zh[Number(d) - 1]).join(' ')} / ${weekdays.map(d => en[Number(d) - 1]).join(' ')}`;
}
export const REGION_NAMES = {
  CHN: ['中国大陆', 'Mainland China'], HKG: ['中国香港', 'Hong Kong, China'], TWN: ['台湾地区', 'Taiwan'],
  JPN: ['日本', 'Japan'], KOR: ['韩国', 'South Korea'], SGP: ['新加坡', 'Singapore'],
  USA: ['美国', 'United States'], CAN: ['加拿大', 'Canada']
};
export const stackedNamesHTML = (zh, en) => `<span class="bilingual-lines"><span>${escapeHTML(zh)}</span><span lang="en">${escapeHTML(en || zh)}</span></span>`;
export const countryHeadingHTML = country => {
  const [zh, en] = REGION_NAMES[country] || [country, country];
  return stackedNamesHTML(zh, en);
};
export function groupByCountry(items, countryOf) {
  const order = Object.keys(REGION_NAMES), groups = new Map();
  items.forEach(item => {
    const country = countryOf(item);
    if (!groups.has(country)) groups.set(country, []);
    groups.get(country).push(item);
  });
  return [...groups].sort(([a], [b]) => (order.indexOf(a) < 0 ? 999 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 999 : order.indexOf(b)));
}
const allianceNames = { SA: '星空联盟 / Star Alliance', OW: '寰宇一家 / oneworld', ST: '天合联盟 / SkyTeam' };
const allianceLogoHTML = alliance => allianceNames[alliance] ? `<span class="brand-mark alliance-mark" tabindex="0" data-brand-tip="${escapeHTML(allianceNames[alliance])}" aria-label="${escapeHTML(allianceNames[alliance])}"><img class="alliance-logo" src="src/assets/alliances/${escapeHTML(alliance)}.svg" alt="" width="18" height="18" loading="lazy"></span>` : '';
export const catalogOptionHTML = (item, airline = false) => `${airline ? `<img class="airline-logo" src="src/assets/airlines/${escapeHTML(item.iata_code)}.png" alt="" width="20" height="20" loading="lazy">` : ''}<span class="catalog-code">${escapeHTML(item.iata_code)}</span>${stackedNamesHTML(item.name_cn, item.name_en)}${airline ? allianceLogoHTML(item.alliance) : ''}`;

// Build renderers once after the airline catalog has loaded.
export function createAirlineRenderer(airlineByCode) {
  const airlineName = code => bilingual(airlineByCode[code]?.name_cn || code, airlineByCode[code]?.name_en);
  function airlineHTML(code, identifier = code) {
    const airline = airlineByCode[code];
    const airlineTip = `${airlineName(code)} · ${code}${airline?.alliance ? '' : ' · 无联盟 / Unaffiliated'}`;
    const logo = `<span class="brand-mark" tabindex="0" data-brand-tip="${escapeHTML(airlineTip)}" aria-label="${escapeHTML(airlineTip)}"><img class="airline-logo" src="src/assets/airlines/${escapeHTML(code)}.png" alt="" width="20" height="20" loading="lazy"></span>`;
    return `<span class="airline-identity">${logo}<span class="airline-code">${escapeHTML(identifier)}</span>${stackedNamesHTML(airline?.name_cn || code, airline?.name_en || code)}${allianceLogoHTML(airline?.alliance)}</span>`;
  }
  return airlineHTML;
}

export function createFlightRenderer(airlineHTML) {
  function flightDetailsHTML(f) {
    return `<div class="flight">
      <strong>${airlineHTML(f.airline, f.airline + f.flight_number)}</strong><br>
      ${escapeHTML(f.origin)} ${arrowHTML()} ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入 / Aircraft unspecified')}<br>
      ${departureSummary(f).split('\n').map(escapeHTML).join('<br>')}<br>备注 / Note：${escapeHTML(bilingualNote(f.note))}
    </div>`;
  }
  return flightDetailsHTML;
}
