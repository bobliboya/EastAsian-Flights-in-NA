/* Buildless Leaflet viewer with JSON catalogs and retained historical schedules. */
'use strict';
// Touch browsers synthesize mouseover before click. Changing the DOM during that
// preview can consume the first tap (notably on iOS). Track the actual input,
// including on hybrid devices, and reserve hover previews for a real mouse.
let inputType = window.matchMedia('(hover: hover)').matches ? 'mouse' : 'touch';
document.addEventListener('pointerdown', event => { inputType = event.pointerType; }, true);
document.addEventListener('pointermove', event => { inputType = event.pointerType; }, true);
document.addEventListener('touchstart', () => { inputType = 'touch'; }, { capture: true, passive: true });
document.addEventListener('keydown', () => { inputType = 'keyboard'; }, true);
const canPreviewHover = () => inputType === 'mouse';
const canPreviewFocus = () => inputType === 'keyboard';

const NOTE_TRANSLATIONS = {
  "2026年公布运营期为6月5日至8月31日。": "Published 2026 operating period: June 5 to August 31.",
  "夏季航线，2026年公布运营季至9月；不代表核查日仍执行。": "Summer route; the published 2026 season ends in September. This does not imply operation on the verification date.",
  "官方公布ORD始发于2027-03-19开航；成田始发为次日。": "The airline announced departures from ORD starting March 19, 2027; departures from Narita start the following day.",
  "杭州始发航班经停青岛；地图仅连接青岛—温哥华不停站航段。": "Flights originating in Hangzhou stop at Qingdao; only the nonstop Qingdao–Vancouver segment is mapped.",
  "洛杉矶始发于2027-03-27开航；关西始发为次日。": "Departures from Los Angeles start March 27, 2027; departures from Kansai start the following day.",
  "票帝注明10月25日起增加杭州技术经停；该日期后不再计作不停站航线，需再次核实。": "The schedule source lists a technical stop in Hangzhou from October 25. The route is excluded from nonstop counts after that date and requires reconfirmation.",
  "机型按航司官方资料更新；第三方索引的旧机型仅保留在来源变体中。": "Aircraft updated using official airline information; older third-party aircraft entries are retained only as source variants.",
  "机型来源有分歧：2026-10-20、2026-10-22、2026-10-24 的 A359／B77W 待航司核实。": "Aircraft sources disagree: A359/B77W on October 20, 22 and 24, 2026 requires airline confirmation.",
  "机型来源有分歧：2026-10-21、2026-10-23 的 A359／B77W 待航司核实。": "Aircraft sources disagree: A359/B77W on October 21 and 23, 2026 requires airline confirmation.",
  "班期来源存在分歧：FlightMapper 为周二、周五，Flight.info 为周二、周六；10月23／24日待航司核实。": "Schedule sources disagree: FlightMapper lists Tuesday/Friday; Flight.info lists Tuesday/Saturday. October 23/24 requires airline confirmation."
};
const bilingualNote = note => bilingual(note, NOTE_TRANSLATIONS[note]);
const bilingual = (zh, en) => en && en !== zh ? `${zh} / ${en}` : zh;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// SVG arrows keep their shape across Apple platforms and system fonts.
const arrowHTML = (both = false) => `<svg class="inline-arrow" viewBox="0 0 24 24" role="img" aria-label="${both ? '往返 / Both directions' : '至 / To'}" focusable="false"><path d="M4 12h16m-6-6 6 6-6 6${both ? 'M10 6l-6 6 6 6' : ''}"/></svg>`;
const chevronHTML = '<svg class="filter-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
// A weekday mask is a recurrence rule, not the number of departures in a
// truncated timetable. Always count actual local departure dates in its window.
function departureSummary(f) {
  const first = f.display_from || f.valid_from, last = f.display_to || f.valid_to;
  if (!first || !last) return '历史班表 · 运营日期未核实 / Historical schedule · Operating dates unverified';
  let departures = f.departures;
  if (!departures) {
    departures = [];
    const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86400000) {
      if (f[days[new Date(t).getUTCDay()]] === '1') departures.push({ date: new Date(t).toISOString().slice(0,10) });
    }
  }
  return `${first} – ${last} · 期间 ${departures.length} 班 / departures in this period`;
}
const pacific = ([lat, lon]) => [lat, lon < 0 ? lon + 360 : lon];
const FLAG_REGIONS = {
  CHN: ['cn', '中国 / China'], HKG: ['hk', '中国香港 / Hong Kong, China'], TWN: ['tw', '台湾 / Taiwan'],
  JPN: ['jp', '日本 / Japan'], KOR: ['kr', '韩国 / South Korea'], SGP: ['sg', '新加坡 / Singapore'],
  USA: ['us', '美国 / United States'], CAN: ['ca', '加拿大 / Canada']
};
const flagHTML = country => {
  const flag = FLAG_REGIONS[country];
  return flag ? `<img class="country-flag" src="src/assets/flags/${flag[0]}.svg" alt="${flag[1]}" title="${flag[1]}" width="20" height="15">` : '';
};
const stackedNamesHTML = (zh, en) => `<span class="bilingual-lines"><span>${escapeHTML(zh)}</span><span lang="en">${escapeHTML(en || zh)}</span></span>`;
const countryHeadingHTML = country => {
  const [zh, en] = (FLAG_REGIONS[country]?.[1] || country).split(' / ');
  return `${flagHTML(country)}${stackedNamesHTML(zh, en)}`;
};
function groupByCountry(items, countryOf) {
  const order = Object.keys(FLAG_REGIONS), groups = new Map();
  items.forEach(item => {
    const country = countryOf(item);
    if (!groups.has(country)) groups.set(country, []);
    groups.get(country).push(item);
  });
  return [...groups].sort(([a], [b]) => (order.indexOf(a) < 0 ? 999 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 999 : order.indexOf(b)));
}
const catalogOptionHTML = (item, airline = false) => `<span class="catalog-code">${escapeHTML(item.iata_code)}${airline ? `<img class="airline-logo" src="src/assets/airlines/${escapeHTML(item.iata_code)}.png" alt="" width="20" height="20" loading="lazy">` : ''}</span>${stackedNamesHTML(item.name_cn, item.name_en)}`;
// Schematic arcs in Mercator space; mirror southern routes below the endpoint chord.
const ROUTE_CURVE = {
  mirrorBelowLatitude: 35,
  bendFactor: 0.18,
  maxBendDegrees: 26,
  samples: 81
};
function routeCurve(start, end) {
  const rad = Math.PI / 180;
  const project = lat => Math.log(Math.tan(Math.PI / 4 + lat * rad / 2));
  const unproject = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / rad;
  const [startLat, startLon] = pacific(start), [endLat, endLon] = pacific(end);
  const y0 = project(startLat), y1 = project(endLat);
  const distance = Math.hypot((endLon - startLon) * rad, y1 - y0);
  const bend = Math.min(distance * ROUTE_CURVE.bendFactor, ROUTE_CURVE.maxBendDegrees * rad);
  const direction = (startLat + endLat) / 2 < ROUTE_CURVE.mirrorBelowLatitude ? -1 : 1;
  return Array.from({ length: ROUTE_CURVE.samples }, (_, i) => {
    const t = i / (ROUTE_CURVE.samples - 1);
    if (i === 0) return [startLat, startLon];
    if (i === ROUTE_CURVE.samples - 1) return [endLat, endLon];
    const y = y0 + (y1 - y0) * t + direction * 4 * t * (1 - t) * bend;
    return [unproject(y), startLon + (endLon - startLon) * t];
  });
}
const routeColor = (country, highlighted = false) => `var(--route-${({CHN:'greater-china', HKG:'greater-china', MAC:'greater-china', TWN:'greater-china', JPN:'japan', KOR:'korea', PRK:'korea', SGP:'singapore'})[country] || 'color'}${highlighted ? '-highlight' : ''})`;
// A single shared tooltip avoids clipping inside scrollable dropdowns.
function setupBrandTooltips() {
  const brandTooltip = document.createElement('div');
  brandTooltip.className = 'brand-tooltip';
  brandTooltip.id = 'brand-tooltip';
  brandTooltip.setAttribute('role', 'tooltip');
  brandTooltip.hidden = true;
  document.body.append(brandTooltip);
  let activeBrand;
  function hideBrandTooltip() {
    activeBrand?.removeAttribute('aria-describedby');
    activeBrand = null;
    brandTooltip.hidden = true;
  }
  function showBrandTooltip(mark) {
    hideBrandTooltip();
    activeBrand = mark;
    brandTooltip.textContent = mark.dataset.brandTip;
    brandTooltip.hidden = false;
    mark.setAttribute('aria-describedby', brandTooltip.id);
    const rect = mark.getBoundingClientRect(), box = brandTooltip.getBoundingClientRect();
    brandTooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - box.width - 8))}px`;
    brandTooltip.style.top = `${rect.top >= box.height + 14 ? rect.top - box.height - 6 : rect.bottom + 6}px`;
  }
  document.addEventListener('mouseover', event => {
    if (!canPreviewHover()) return;
    const mark = event.target.closest('[data-brand-tip]');
    if (mark && mark !== activeBrand) showBrandTooltip(mark);
  });
  document.addEventListener('mouseout', event => {
    if (activeBrand && !activeBrand.contains(event.relatedTarget)) hideBrandTooltip();
  });
  document.addEventListener('focusin', event => {
    if (!canPreviewFocus()) return;
    const mark = event.target.closest('[data-brand-tip]');
    if (mark) showBrandTooltip(mark);
  });
  document.addEventListener('focusout', hideBrandTooltip);
  document.addEventListener('scroll', hideBrandTooltip, true);
  window.addEventListener('resize', hideBrandTooltip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideBrandTooltip(); });
}

async function init() {
  if (!window.L) throw new Error('地图库加载失败，请检查网络后刷新。 / Map library failed to load. Check your connection and refresh.');
  const paths = ['airports.json', 'airlines.json', 'flights.json', 'world-countries.geojson', 'catalog-metadata.json', 'routes.json'];
  const [airports, airlines, rawFlights, countries, catalog, routeCatalog] = await Promise.all(paths.map(async path => {
    const res = await fetch(`src/data/${path}`, { cache: 'no-store' }); if (!res.ok) throw new Error(`无法读取 / Failed to load ${path}`);
    return res.json();
  }));
  const airportByCode = Object.fromEntries(airports.map(a => [a.iata_code, a]));
  const routeEndpoints = (origin, destination) => airportByCode[origin]?.region === 'asia_pacific'
    ? [origin, destination] : [destination, origin];
  const airlineByCode = Object.fromEntries(airlines.map(a => [a.iata_code, a]));
  const locations = Object.fromEntries(airports.map(a => [a.iata_code, [a.latitude, a.longitude]]));
  // Route evidence drives the network; a missing timetable is not a missing route.
  const services = routeCatalog.filter(r => r.service_status !== 'announced'
    && (!r.service_start || r.service_start <= catalog.checked_on)
    && (r.service_status === 'seasonal' || !r.service_end || r.service_end >= catalog.checked_on));
  const serviceKeys = new Set(services.map(r => `${r.airline}:${r.origin}-${r.destination}`));
  const timetableDate = catalog.timetable_snapshot?.checked_on || catalog.checked_on;
  const currentFlights = rawFlights.filter(f => {
    const origin = airportByCode[f.origin], destination = airportByCode[f.destination];
    if (!origin || !destination || origin.region === destination.region) return false;
    const [a, b] = routeEndpoints(f.origin, f.destination);
    return serviceKeys.has(`${f.airline}:${a}-${b}`)
      && (!f.valid_from || f.valid_from <= timetableDate)
      && (!f.valid_to || f.valid_to >= timetableDate);
  });
  const refreshedDirections = new Set(currentFlights.filter(f => f.import_batch === catalog.timetable_snapshot?.import_batch)
    .map(f => `${f.airline}:${f.origin}-${f.destination}`));
  const flights = currentFlights.filter(f => f.import_batch === catalog.timetable_snapshot?.import_batch
    || !refreshedDirections.has(`${f.airline}:${f.origin}-${f.destination}`));
  document.querySelector('#catalog-note').textContent = `航线资料核查：${catalog.route_snapshot?.checked_on || catalog.checked_on}；班表核查：${timetableDate}。班次按标注日期范围计算。地图含季节性定期客运航线，未开航计划不计入当前连线。机型可能调整。 / Routes checked: ${catalog.route_snapshot?.checked_on || catalog.checked_on}; timetables checked: ${timetableDate}. Departure counts apply to the listed date ranges. Seasonal scheduled passenger routes are included; unlaunched services are excluded. Aircraft may change.`;
  const catalogAirports = new Set(services.flatMap(r => [r.origin, r.destination]));
  const catalogAirlines = new Set(services.map(r => r.airline));
  const catalogRoutes = new Set(services.map(r => `${r.origin}-${r.destination}`));
  document.querySelector('#stats').innerHTML = [
    [catalogAirports.size, '机场', 'Airports'], [catalogAirlines.size, '航司', 'Airlines'],
    [catalogRoutes.size, '航线', 'Routes'], [flights.length, '航班', 'Flights']
  ].map(([count, zh, en]) => `<span class="stat-item"><b>${count}</b>${stackedNamesHTML(zh, en)}</span>`).join('');
  const desktop = window.matchMedia('(min-width: 800px)');
  // Fit the same schematic geometry used for drawing and hover selection.
  const pacificBounds = L.latLngBounds(Object.values(locations).map(pacific));
  services.forEach(f => {
    if (locations[f.origin] && locations[f.destination]) {
      routeCurve(locations[f.origin], locations[f.destination]).forEach(point => pacificBounds.extend(point));
    }
  });
  const map = L.map('map', {
    minZoom: 0, maxZoom: 8, zoomSnap: 0, zoomControl: false,
    dragging: true, scrollWheelZoom: true, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: true,
    maxBoundsViscosity: 1, bounceAtZoomLimits: false
  });
  const panelToggle = document.querySelector('#panel-toggle');
  panelToggle.onclick = () => {
    const collapsed = document.body.classList.toggle('panel-collapsed');
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelToggle.setAttribute('aria-label', collapsed ? '恢复面板高度 / Restore panel height' : '降低面板高度 / Reduce panel height');
  };
  function framePacific({ preserveView = false } = {}) {
    const zoom = map.getZoom();
    const previous = preserveView && Number.isFinite(zoom) ? { center: map.getCenter(), zoom } : null;
    map.setMaxBounds(null);
    map.setMinZoom(0);
    map.invalidateSize({ pan: false });
    map.fitBounds(pacificBounds, {
      paddingTopLeft: [24, 24],
      paddingBottomRight: [24, 24],
      animate: false
    });
    // The fitted viewport is the outer limit; zooming in allows bounded panning.
    map.setMinZoom(map.getZoom());
    map.setMaxBounds(map.getBounds());
    if (previous) {
      map.setView(previous.center, Math.max(previous.zoom, map.getMinZoom()), { animate: false });
      map.panInsideBounds(map.options.maxBounds, { animate: false });
    }
  }
  framePacific();
  // Reframe after viewport changes without changing the active filters.
  let mapResizeTimer;
  new ResizeObserver(() => {
    // Resize the renderer during the slide, but recompute bounds only once it settles.
    map.invalidateSize({ pan: false, debounceMoveend: true });
    clearTimeout(mapResizeTimer);
    mapResizeTimer = setTimeout(() => framePacific({ preserveView: true }), 100);
  }).observe(document.querySelector('#map'));
  desktop.addEventListener('change', framePacific);
  map.createPane('land'); map.getPane('land').style.zIndex = 200;
  // Duplicate the geographic world so both sides of the date line meet in the Pacific view.
  [0, 360].forEach(offset => L.geoJSON(countries, {
    pane: 'land', interactive: false,
    coordsToLatLng: coords => L.latLng(coords[1], coords[0] + offset),
    style: { fillColor: 'var(--map-land)', fillOpacity: 1, color: 'var(--map-border)', weight: .7 },
    attribution: 'Map data: <a href="https://www.naturalearthdata.com/">Natural Earth</a>'
  }).addTo(map));
  // Quiet geographic context below routes; labels never intercept map gestures.
  map.createPane('placeLabels');
  map.getPane('placeLabels').style.zIndex = 350;
  map.getPane('placeLabels').style.pointerEvents = 'none';
  const placeLabels = L.layerGroup().addTo(map);
  const lines = L.layerGroup().addTo(map), markers = L.layerGroup().addTo(map);
  const cities = new Map();
  airports.forEach(airport => {
    // Airport city fields sometimes include a secondary town or metro qualifier.
    const city = airport.city_cn?.split(/[／（]/)[0];
    if (!city) return;
    const key = `${airport.country_or_region}:${city}`;
    if (!cities.has(key)) cities.set(key, { name: city, nameEn: airport.city?.split(/[／（(]/)[0].trim(), location: pacific(locations[airport.iata_code]) });
  });
  cities.forEach(city => {
    const label = L.marker(city.location, {
      pane: 'placeLabels', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'map-place-label', html: `<span>${escapeHTML(city.name)}<span class="place-name-en" lang="en">${escapeHTML(city.nameEn || city.name)}</span></span>`, iconSize: null, iconAnchor: [0, 0] })
    }).addTo(placeLabels);
    label.getElement().setAttribute('aria-hidden', 'true');
  });
  function layoutPlaceLabels() {
    const size = map.getSize(), occupied = [], segments = [];
    const airportPoints = airports.map(airport => map.latLngToContainerPoint(pacific(locations[airport.iata_code])));
    lines.eachLayer(line => {
      const points = line.getLatLngs().map(point => map.latLngToContainerPoint(point));
      for (let i = 1; i < points.length; i++) segments.push([points[i - 1], points[i]]);
    });
    const overlaps = (a, b, gap = 0) => a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
    placeLabels.eachLayer(label => {
      const element = label.getElement();
      element.hidden = false;
      const text = element.firstElementChild;
      const point = map.latLngToContainerPoint(label.getLatLng());
      const width = text.offsetWidth, height = text.offsetHeight, gap = 10;
      const offsets = [
        [gap, -height / 2], [-width - gap, -height / 2],
        [-width / 2, -height - gap], [-width / 2, gap],
        [gap, -height - gap], [-width - gap, -height - gap],
        [gap, gap], [-width - gap, gap]
      ];
      const localSegments = segments.filter(([a, b]) => Math.max(a.x, b.x) >= point.x - width - 20 && Math.min(a.x, b.x) <= point.x + width + 20
        && Math.max(a.y, b.y) >= point.y - height - 20 && Math.min(a.y, b.y) <= point.y + height + 20);
      let best = null;
      offsets.forEach(([x, y], preference) => {
        const box = { left: point.x + x, top: point.y + y, right: point.x + x + width, bottom: point.y + y + height };
        if (box.left < 6 || box.right > size.x - 6 || box.top < 6 || box.bottom > size.y - 6
          || occupied.some(other => overlaps(box, other, 6))
          || airportPoints.some(p => overlaps(box, { left: p.x - 7, right: p.x + 7, top: p.y - 7, bottom: p.y + 7 }))) return;
        // Count route strokes crossing the text rectangle using segment clipping.
        const crossings = localSegments.filter(([a, b]) => {
          let start = 0, end = 1;
          for (const [origin, delta, min, max] of [[a.x, b.x - a.x, box.left - 2, box.right + 2], [a.y, b.y - a.y, box.top - 2, box.bottom + 2]]) {
            if (delta === 0) { if (origin < min || origin > max) return false; }
            else {
              const t0 = (min - origin) / delta, t1 = (max - origin) / delta;
              start = Math.max(start, Math.min(t0, t1)); end = Math.min(end, Math.max(t0, t1));
              if (start > end) return false;
            }
          }
          return true;
        }).length;
        const score = crossings * 10 + preference;
        if (!best || score < best.score) best = { box, x, y, score };
      });
      element.hidden = !best;
      if (best) {
        // Position the inner text; Leaflet retains control of the marker transform.
        text.style.transform = `translate(${best.x}px, ${best.y}px)`;
        occupied.push(best.box);
      }
    });
  }
  map.on('moveend zoomend resize', layoutPlaceLabels);
  layoutPlaceLabels();
  document.fonts?.ready.then(layoutPlaceLabels);

  const airlineSelect = document.querySelector('#airline');
  const asiaSelect = document.querySelector('#asia-airport'), americaSelect = document.querySelector('#north-america-airport');
  const backButton = document.querySelector('#filter-back');
  const airlineName = code => bilingual(airlineByCode[code]?.name_cn || code, airlineByCode[code]?.name_en);
  const airportHTML = code => `${flagHTML(airportByCode[code]?.country_or_region)}${escapeHTML(code)}`;
  const airlineFlag = code => flagHTML(airlineByCode[code]?.country_or_region);
  const allianceNames = { SA: '星空联盟 / Star Alliance', OW: '寰宇一家 / oneworld', ST: '天合联盟 / SkyTeam' };
  function airlineHTML(code) {
    const airline = airlineByCode[code];
    const alliance = allianceNames[airline?.alliance] || '无联盟 / Unaffiliated';
    const airlineTip = `${airlineName(code)} · ${code}${airline?.alliance ? '' : ' · 无联盟 / Unaffiliated'}`;
    const logo = `<span class="brand-mark" tabindex="0" data-brand-tip="${escapeHTML(airlineTip)}" aria-label="${escapeHTML(airlineTip)}"><img class="airline-logo" src="src/assets/airlines/${escapeHTML(code)}.png" alt="" width="20" height="20" loading="lazy"></span>`;
    const allianceIcon = airline?.alliance ? `<span class="brand-mark" tabindex="0" data-brand-tip="${escapeHTML(alliance)}" aria-label="${escapeHTML(alliance)}"><img class="alliance-logo" src="src/assets/alliances/${escapeHTML(airline.alliance)}.svg" alt="" width="18" height="18" loading="lazy"></span>` : '';
    return `<span class="airline-identity">${airlineFlag(code)}${stackedNamesHTML(airline?.name_cn || code, airline?.name_en || code)}${logo}${allianceIcon}</span>`;
  }
  setupBrandTooltips();
  function catalogMultiselect(container, items, placeholder, addLabel, optionHTML, tagHTML) {
    const selected = new Set();
    const heading = document.getElementById(container.getAttribute('aria-labelledby'));
    const headingText = heading.textContent;
    const tags = document.createElement('div'); tags.className = 'airport-tags';
    const dropdown = document.createElement('details'); dropdown.className = 'airport-options';
    const summary = document.createElement('summary');
    const options = document.createElement('div'); options.className = 'airport-options-list';
    dropdown.append(summary, options); container.append(tags, dropdown);
    const inputs = [];
    function sync() {
      tags.replaceChildren();
      selected.forEach(code => {
        const tag = document.createElement('button'); tag.type = 'button';
        tag.className = 'airport-tag'; tag.innerHTML = `${tagHTML(code)} ×`;
        tag.setAttribute('aria-label', `移除 / Remove ${code}`);
        tag.onclick = () => { selected.delete(code); sync(); applyFilters(); };
        tags.append(tag);
      });
      inputs.forEach(input => { input.checked = selected.has(input.value); });
      summary.innerHTML = `<span>${escapeHTML(selected.size ? addLabel : placeholder)}</span>${chevronHTML}`;
      heading.textContent = `${headingText} (${selected.size}/${items.length})`;
    }
    groupByCountry(items, item => item.country_or_region).forEach(([country, members]) => {
      const group = document.createElement('details'); group.className = 'catalog-country-group';
      group.setAttribute('role', 'group');
      const groupHeading = document.createElement('summary'); groupHeading.className = 'country-group-heading';
      groupHeading.id = `${container.id}-country-${country}`;
      groupHeading.innerHTML = `${countryHeadingHTML(country)}${chevronHTML.replace('filter-chevron', 'country-chevron')}`;
      group.setAttribute('aria-labelledby', groupHeading.id); group.append(groupHeading); options.append(group);
      members.forEach(a => {
        const label = document.createElement('label');
        const input = document.createElement('input'); input.type = 'checkbox'; input.value = a.iata_code;
        input.onchange = () => {
          if (input.checked) selected.add(input.value); else selected.delete(input.value);
          sync(); applyFilters();
        };
        const text = document.createElement('span'); text.className = 'catalog-option'; text.innerHTML = optionHTML(a);
        label.append(input, text);
        group.append(label); inputs.push(input);
      });
    });
    sync();
    document.addEventListener('click', event => { if (!container.contains(event.target)) dropdown.open = false; });
    container.addEventListener('keydown', event => { if (event.key === 'Escape') { dropdown.open = false; summary.focus(); } });
    return { values: () => [...selected].sort(), has: code => selected.has(code),
      set: codes => { selected.clear(); codes.forEach(code => selected.add(code)); sync(); } };
  }
  const airportMultiselect = (container, region, placeholder) => catalogMultiselect(container,
    airports.filter(a => a.region === region), placeholder, '添加机场 / Add airports',
    a => catalogOptionHTML(a), code => escapeHTML(code));
  const selectedAirlines = catalogMultiselect(airlineSelect, airlines, '全部航空公司 / All airlines', '添加航空公司 / Add airlines',
    a => catalogOptionHTML(a, true),
    code => escapeHTML(code));
  const asiaAirports = airportMultiselect(asiaSelect, 'asia_pacific', '全部亚太区机场 / All Asia Pacific airports');
  const americaAirports = airportMultiselect(americaSelect, 'north_america', '全部北美区机场 / All North American airports');
  let selectedRoute = '';
  const expandedRoutes = new Set();
  const expandedCountries = new Set();
  function setCardExpanded(card, expanded) {
    card.querySelector('.route-card-toggle').setAttribute('aria-expanded', String(expanded));
    card.querySelector('.route-card-toggle').title = `${expanded ? '收起 / Collapse' : '展开 / Expand'} ${card.dataset.routeKey}`;
    card.querySelector('.filtered-flights').hidden = !expanded;
    if (expanded) expandedRoutes.add(card.dataset.routeKey); else expandedRoutes.delete(card.dataset.routeKey);
  }
  function updateExpansionButtons() {
    const cards = [...document.querySelectorAll('#details .route-card')];
    const groups = [...document.querySelectorAll('#details .route-country-group')];
    document.querySelector('#expand-all-routes').disabled = !groups.some(group => !group.open) && !cards.some(card => card.querySelector('.filtered-flights').hidden);
    document.querySelector('#collapse-all-routes').disabled = !groups.some(group => group.open) && !cards.some(card => !card.querySelector('.filtered-flights').hidden);
  }
  const filterState = () => [selectedAirlines.values(), asiaAirports.values(), americaAirports.values()];
  let appliedFilters = filterState();
  function matchesFilters(f) {
    const [asia, america] = routeEndpoints(f.origin, f.destination);
    return (!selectedAirlines.values().length || selectedAirlines.has(f.airline))
      && (!asiaAirports.values().length || asiaAirports.has(asia))
      && (!americaAirports.values().length || americaAirports.has(america));
  }
  function updateBackButton() {
    backButton.parentElement.hidden = !selectedRoute;
    backButton.disabled = !selectedRoute;
    backButton.title = '返回航班列表 / Back to flight list';
  }
  function applyFilters() {
    const next = filterState();
    if (JSON.stringify(next) !== JSON.stringify(appliedFilters)) { expandedRoutes.clear(); expandedCountries.clear(); }
    appliedFilters = next;
    render();
    document.querySelector('.panel-scroll').scrollTop = 0;
  }
  let airportPopup = null, popupKey = '', popupCloseTimer, pointerOverCard = false;
  function keepAirportCardOpen() { clearTimeout(popupCloseTimer); popupCloseTimer = null; }
  function scheduleAirportCardClose() {
    if (!canPreviewHover()) return;
    if (popupCloseTimer || !airportPopup || pointerOverCard) return;
    popupCloseTimer = setTimeout(() => {
      popupCloseTimer = null;
      if (airportPopup) map.closePopup(airportPopup);
    }, 100);
  }
  const airportGroups = [['LAX', 'ONT'], ['HND', 'NRT'], ['JFK', 'EWR'], ['HKG', 'SZX']];
  function airportCardsFor(code) {
    const group = airportGroups.find(codes => codes.includes(code)) || [code];
    return group.map(item => airportByCode[item]).filter(a => a && locations[a.iata_code]);
  }
  function showAirportCards(candidates) {
    if (!candidates.length) return;
    keepAirportCardOpen();
    const key = candidates.map(a => a.iata_code).sort().join(',');
    if (airportPopup && key === popupKey) return;
    if (airportPopup) map.closePopup(airportPopup);
    const content = document.createElement('div'); content.className = 'airport-cards map-choice-panel';
    content.classList.toggle('airport-cards-scrollable', candidates.length >= 3);
    const heading = document.createElement('div'); heading.className = 'map-choice-heading';
    heading.innerHTML = stackedNamesHTML(`附近 ${candidates.length} 座机场 · 请选择`, `Nearby ${candidates.length} airports · Choose one`);
    const body = document.createElement('div'); body.className = 'map-choice-body';
    body.tabIndex = 0; body.setAttribute('aria-label', '附近机场列表 / Nearby airports');
    content.append(heading, body);
    candidates.forEach(a => {
      const code = a.iata_code;
      const records = flights.filter(f => matchesFilters(f) && (f.origin === code || f.destination === code));
      const connections = services.filter(f => matchesFilters(f) && (f.origin === code || f.destination === code));
      const destinations = new Set(connections.map(f => f.origin === code ? f.destination : f.origin));
      const card = document.createElement('article'); card.className = 'airport-info-card';
      const serviceLabel = a.service_status === 'announced' ? `待开航 / Planned · ${a.service_start}` : a.service_status === 'seasonal' ? '含季节性定期客运 / Includes seasonal scheduled services' : '定期客运机场 / Scheduled passenger services';
      card.innerHTML = `<h3><span class="airport-card-code">${airportHTML(code)}</span>${stackedNamesHTML(a.name_cn, a.name_en)}</h3><p>${escapeHTML(bilingual(a.city_cn, a.city))} · ${escapeHTML(bilingual(catalog.regions[a.region].name_cn, a.region === 'asia_pacific' ? 'Asia Pacific' : 'North America'))}<br>${escapeHTML(serviceLabel)}</p><div class="airport-count">${connections.length ? `${destinations.size} 个目的地 / destinations · ${records.length} 条记录 / records` : '当前筛选下没有已收录的航线 / No cataloged routes match these filters'}</div>`;
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = '查看细节 / View details';
      button.onclick = () => {
        (a.region === 'asia_pacific' ? asiaAirports : americaAirports).set([code]); applyFilters();
        document.querySelector('.panel-scroll').scrollTop = 0;
      };
      card.append(button); body.append(card);
    });
    airportPopup = L.popup({ autoPan: false, closeOnClick: false, maxWidth: 340, minWidth: 270, className: 'airport-info-popup', closeButton: true })
      .setLatLng(pacific(locations[candidates[0].iata_code])).setContent(content).openOn(map);
    airportPopup.getElement().querySelector('.leaflet-popup-close-button')?.setAttribute('aria-label', '关闭 / Close');
    popupKey = key;
    airportPopup.getElement().addEventListener('mouseenter', () => {
      pointerOverCard = true; keepAirportCardOpen();
    });
    airportPopup.getElement().addEventListener('mouseleave', () => {
      pointerOverCard = false; scheduleAirportCardClose();
    });
  }
  map.on('popupclose', () => {
    keepAirportCardOpen(); airportPopup = null; popupKey = ''; pointerOverCard = false;
  });
  map.on('mousemove', event => {
    if (!canPreviewHover()) return;
    if (event.originalEvent?.target?.closest?.('.route-picker')) {
      clearTimeout(pickerTimer); pickerTimer = null; return;
    }
    // Popup mousemove events can bubble to the map. Never close a card under the pointer.
    if (pointerOverCard || event.originalEvent?.target?.closest?.('.airport-info-popup')) {
      keepAirportCardOpen(); return;
    }
    if (airportPopup) {
      const rect = airportPopup.getElement().getBoundingClientRect();
      const mapRect = map.getContainer().getBoundingClientRect();
      const point = event.containerPoint;
      const x = point.x + mapRect.left, y = point.y + mapRect.top;
      const anchor = map.latLngToContainerPoint(airportPopup.getLatLng());
      const onCardEdge = x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12;
      const cardEdge = L.point(Math.max(rect.left - mapRect.left, Math.min(anchor.x, rect.right - mapRect.left)), Math.max(rect.top - mapRect.top, Math.min(anchor.y, rect.bottom - mapRect.top)));
      const onBridge = L.LineUtil.pointToSegmentDistance(point, anchor, cardEdge) <= 18;
      if (onCardEdge || onBridge) { keepAirportCardOpen(); return; }
    }
    // Hover must reach the visible marker, rather than its surrounding map area.
    let nearest = null;
    markers.eachLayer(marker => {
      const distance = map.latLngToContainerPoint(marker.getLatLng()).distanceTo(event.containerPoint);
      const radius = marker.getRadius() + (marker.options.weight || 0) / 2;
      if (distance <= radius && (!nearest || distance < nearest.distance)) {
        nearest = { airport: airportByCode[marker.airportCode], distance };
      }
    });
    if (nearest) {
      closeRoutePicker(); showAirportCards(airportCardsFor(nearest.airport.iata_code));
    } else {
      scheduleAirportCardClose();
      if (!routePicker.matches(':hover')) {
        const candidates = nearbyRoutes(event.containerPoint);
        if (candidates.length > 1) showRoutePicker(candidates, event.containerPoint);
        else scheduleRoutePickerClose();
      }
    }
  });
  map.getContainer().addEventListener('mouseleave', scheduleAirportCardClose);
  map.on('click', event => {
    // A finger rarely lands on the visible 2px stroke. Also resolve taps on
    // the surrounding map using the same curve geometry as the route picker.
    if (isTouchInput(event) && !event.originalEvent?.target?.closest?.('.leaflet-control, .leaflet-popup, .route-picker')) {
      if (selectNearbyRoute(event.containerPoint, TOUCH_ROUTE_TOLERANCE)) return;
    }
    closeRoutePicker();
    if (airportPopup) map.closePopup(airportPopup);
    if (selectedRoute) render();
  });
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const endpointLabels = L.layerGroup().addTo(map);
  function constrainOverlay(layer) {
    const element = layer?.getElement();
    if (!element) return;
    const bounds = map.getContainer().getBoundingClientRect(), gap = 8;
    map.getContainer().style.setProperty('--map-overlay-width', `${Math.max(0, bounds.width - gap * 2)}px`);
    map.getContainer().style.setProperty('--map-overlay-height', `${Math.max(0, bounds.height - gap * 2)}px`);
    element.style.translate = '';
    const rect = element.getBoundingClientRect();
    const dx = Math.max(bounds.left + gap - rect.left, Math.min(0, bounds.right - gap - rect.right));
    const dy = Math.max(bounds.top + gap - rect.top, Math.min(0, bounds.bottom - gap - rect.bottom));
    element.style.translate = `${dx}px ${dy}px`;
    element.classList.toggle('edge-adjusted', Math.abs(dx) > 1 || Math.abs(dy) > 1);
  }
  map.on('popupopen tooltipopen', event => {
    constrainOverlay(event.popup || event.tooltip);
    requestAnimationFrame(() => constrainOverlay(event.popup || event.tooltip));
  });
  map.on('moveend zoomend resize', () => requestAnimationFrame(() => {
    if (airportPopup) constrainOverlay(airportPopup);
    endpointLabels.eachLayer(constrainOverlay);
    lines.eachLayer(line => { if (line.isTooltipOpen()) constrainOverlay(line.getTooltip()); });
    if (!routePicker.hidden) constrainOverlay({ getElement: () => routePicker });
  }));
  let hoveredRoute = null;
  const routePicker = document.createElement('div');
  routePicker.className = 'route-picker map-choice-panel'; routePicker.hidden = true;
  routePicker.setAttribute('aria-label', '附近航线选择 / Nearby routes');
  map.getContainer().append(routePicker);
  L.DomEvent.disableClickPropagation(routePicker);
  L.DomEvent.disableScrollPropagation(routePicker);
  let pickerKey = '', pickerTimer, pickerAnchor, pickerRoutes = [];
  function closeRoutePicker() {
    const wasOpen = !routePicker.hidden;
    clearTimeout(pickerTimer); pickerTimer = null; pickerKey = ''; pickerRoutes = []; routePicker.hidden = true;
    if (wasOpen) { hoveredRoute = null; updateRouteAppearance(); }
  }
  function scheduleRoutePickerClose() {
    if (!canPreviewHover()) return;
    if (pickerTimer || routePicker.hidden || routePicker.matches(':hover')) return;
    pickerTimer = setTimeout(closeRoutePicker, 100);
  }
  routePicker.onmouseenter = () => { clearTimeout(pickerTimer); pickerTimer = null; };
  routePicker.onmouseleave = () => { hoveredRoute = null; updateRouteAppearance(); scheduleRoutePickerClose(); };
  const TOUCH_ROUTE_TOLERANCE = 22; // CSS pixels on either side of a route.
  const isTouchInput = event => inputType === 'touch'
    || event.originalEvent?.pointerType === 'touch'
    || event.originalEvent?.sourceCapabilities?.firesTouchEvents;
  function selectNearbyRoute(point, tolerance) {
    const candidates = nearbyRoutes(point, tolerance);
    if (!candidates.length) return false;
    if (airportPopup) map.closePopup(airportPopup);
    if (candidates.length > 1) showRoutePicker(candidates, point);
    else { closeRoutePicker(); showRoute(candidates[0]); }
    return true;
  }
  function nearbyRoutes(point, tolerance = 4) {
    const candidates = [];
    lines.eachLayer(line => {
      const points = line.getLatLngs().map(latlng => map.latLngToContainerPoint(latlng));
      let distance = Infinity;
      for (let i = 1; i < points.length; i++) distance = Math.min(distance, L.LineUtil.pointToSegmentDistance(point, points[i-1], points[i]));
      if (distance <= tolerance) candidates.push(line.route);
    });
    return [...new Map(candidates.map(route => [route.key, route])).values()].sort((a,b) => a.key.localeCompare(b.key));
  }
  function showRoutePicker(candidates, point) {
    clearTimeout(pickerTimer); pickerTimer = null;
    const keepPosition = !routePicker.hidden && point.distanceTo(pickerAnchor) <= 80;
    // Add nearby candidates while exploring the same dense area, without making the panel chase the pointer.
    if (keepPosition) candidates = [...new Map([...pickerRoutes, ...candidates].map(route => [route.key, route])).values()].sort((a,b) => a.key.localeCompare(b.key));
    const key = candidates.map(route => route.key).join(',');
    if (!routePicker.hidden && pickerKey === key) return;
    if (!keepPosition) { closeRoutePicker(); pickerAnchor = point; }
    pickerRoutes = candidates;
    pickerKey = key; routePicker.replaceChildren();
    const heading = document.createElement('div'); heading.className = 'map-choice-heading';
    heading.textContent = `附近 ${candidates.length} 条航线 · 请选择 / Nearby routes · Choose one`; routePicker.append(heading);
    const body = document.createElement('div'); body.className = 'map-choice-body'; routePicker.append(body);
    body.tabIndex = 0; body.setAttribute('aria-label', '附近航线列表 / Nearby routes');
    candidates.forEach(route => {
      const button = document.createElement('button'); button.type = 'button';
      button.innerHTML = `${airportHTML(route.a)} - ${airportHTML(route.b)}`;
      const previewRoute = () => { hoveredRoute = route; updateRouteAppearance(); };
      button.onmouseenter = () => { if (canPreviewHover()) previewRoute(); };
      button.onfocus = () => { if (canPreviewFocus()) previewRoute(); };
      button.onclick = () => { closeRoutePicker(); hoveredRoute = null; showRoute(route); };
      body.append(button);
    });
    routePicker.hidden = false;
    routePicker.style.translate = '';
    routePicker.style.left = `${Math.max(8, Math.min(pickerAnchor.x + 16, map.getSize().x - routePicker.offsetWidth - 8))}px`;
    routePicker.style.top = `${Math.max(8, Math.min(pickerAnchor.y + 16, map.getSize().y - routePicker.offsetHeight - 8))}px`;
  }
  map.getContainer().addEventListener('mouseleave', scheduleRoutePickerClose);
  function updateRouteAppearance() {
    const labeledAirports = new Map();
    lines.eachLayer(line => {
      const highlighted = line.routeKey === selectedRoute || line.routeKey === hoveredRoute?.key;
      line.setStyle({ color: routeColor(airportByCode[line.route.a].country_or_region, highlighted), weight: highlighted ? 4 : 2, opacity: highlighted ? 1 : .65 });
      if (highlighted) [line.route.a, line.route.b].forEach((code, index) => labeledAirports.set(code, index));
    });
    endpointLabels.clearLayers();
    // Keep selected endpoints visible alongside hover previews, without duplicate labels.
    labeledAirports.forEach((index, code) => {
      L.tooltip({ permanent:true, interactive:false, direction:index === 0 ? 'left' : 'right', offset:[index === 0 ? -8 : 8, 0], className:'airport-label route-endpoint-label' })
        .setLatLng(pacific(locations[code])).setContent(airportHTML(code)).addTo(endpointLabels);
    });
  }
  function serviceDetails(route) {
    return route.services.map(service => {
      const hasTimetable = route.flights.some(f => f.airline === service.airline);
      const status = service.service_status === 'seasonal' ? ' · 季节性 / Seasonal' : '';
      const note = service.note || service.season_note;
      const upcoming = hasTimetable ? [] : rawFlights.filter(f => f.airline === service.airline
        && f.service_status === 'seasonal_planned' && f.valid_from > timetableDate
        && ((f.origin === route.a && f.destination === route.b) || (f.origin === route.b && f.destination === route.a)));
      const planned = upcoming.map(f => `<br>${escapeHTML(f.airline + f.flight_number)} · ${escapeHTML(f.origin)} ${arrowHTML()} ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft)} · ${escapeHTML(f.valid_from)} – ${escapeHTML(f.valid_to)}`).join('');
      if (hasTimetable && !status && !note) return '';
      return `<div class="filtered-flight">${airlineHTML(service.airline)} (${escapeHTML(service.airline)})${status}${hasTimetable ? '' : upcoming.length ? ' · 下一运营季计划（未计入当前航班数） / Next-season schedule (excluded from current counts)' : ' · 班表未录入 / Timetable unavailable'}${note ? `<br>${escapeHTML(bilingualNote(note))}` : ''}${planned}</div>`;
    }).join('');
  }
  function flightDetailsHTML(f) {
    const mixedAircraft = new Set(f.departures?.map(d => d.aircraft)).size > 1;
    const notice = f.verification_note || f.aircraft_note;
    const warning = notice ? `<br>${escapeHTML(bilingualNote(notice))}` : '';
    const departureLabels = f.departures?.map(d =>
      d.date.slice(5) + (mixedAircraft ? ` (${d.aircraft})` : '')) || [];
    const dates = departureLabels.length && departureLabels.length <= 7
      ? `<br>出发日期 / Departure dates: ${escapeHTML(departureLabels.join('、'))}` : '';
    const times = f.dept_time || f.arri_time
      ? `${escapeHTML(f.dept_time || '—')} ${arrowHTML()} ${escapeHTML(f.arri_time || '—')}` : '起降时间未录入 / Flight times unavailable';
    const validity = f.valid_to ? `资料适用至 / Valid through ${escapeHTML(f.valid_to)}` : '历史班表 / Historical schedule';
    return `<div class="flight">
      <strong>${escapeHTML(f.airline + f.flight_number)} · ${airlineHTML(f.airline)}</strong><br>
      ${escapeHTML(f.origin)} ${arrowHTML()} ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入 / Aircraft unspecified')}<br>
      ${escapeHTML(departureSummary(f))}${dates}${warning}<br>${times}<br>${validity}
    </div>`;
  }
  function showRoute(route) {
    document.querySelector('#route-list-actions').hidden = true;
    closeRoutePicker();
    selectedRoute = route.key;
    updateBackButton();
    if (airportPopup) map.closePopup(airportPopup);
    const list = route.flights.map(flightDetailsHTML).join('');
    document.querySelector('#flight-summary').textContent = `${route.flights.length} 条记录 / records · 1 条航线 / route`;
    document.querySelector('#route-list').hidden = true;
    const detail = document.querySelector('#route-detail');
    const endpoints = [route.a, route.b].map(code => {
      const airport = airportByCode[code];
      return `<div class="detail-airport catalog-option">${catalogOptionHTML(airport)}</div>`;
    }).join('');
    detail.innerHTML = `<div class="detail-airports">${endpoints}</div>${serviceDetails(route)}${list}`;
    detail.hidden = false;
    document.querySelector('.panel-scroll').scrollTop = 0;
    updateRouteAppearance();
  }
  function render() {
    closeRoutePicker();
    selectedRoute = '';
    updateBackButton();
    hoveredRoute = null;
    endpointLabels.clearLayers();
    if (airportPopup) map.closePopup(airportPopup);
    lines.clearLayers(); markers.clearLayers();
    const filtered = flights.filter(matchesFilters);
    const routes = new Map(), active = new Set();
    services.filter(matchesFilters).forEach(f => {
      if (!locations[f.origin] || !locations[f.destination]) return;
      const [a, b] = routeEndpoints(f.origin, f.destination), key = `${a}-${b}`;
      if (!routes.has(key)) routes.set(key, { a, b, key, flights: [], services: [] });
      routes.get(key).services.push(f); active.add(a); active.add(b);
    });
    filtered.forEach(f => {
      const [a, b] = routeEndpoints(f.origin, f.destination);
      routes.get(`${a}-${b}`)?.flights.push(f);
    });
    routes.forEach(route => {
      const points = routeCurve(locations[route.a], locations[route.b]);
      const line = L.polyline(points, { color: routeColor(airportByCode[route.a].country_or_region), weight: 2, opacity: .65, smoothFactor: 1, bubblingMouseEvents: false }).addTo(lines);
      line.routeKey = route.key;
      line.route = route;
      line.getElement()?.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse') line.unbindTooltip();
      });
      // Tooltips are created only for a real mouse, never during a touch preview.
      line.on('mousemove', () => { if (line.isTooltipOpen()) constrainOverlay(line.getTooltip()); });
      line.on('mouseover', event => {
        if (!canPreviewHover()) return;
        line.bindTooltip(`${escapeHTML(route.a)} ${arrowHTML(true)} ${escapeHTML(route.b)}`).openTooltip(event.latlng);
        hoveredRoute = route; updateRouteAppearance();
      });
      line.on('mouseout', () => {
        if (hoveredRoute?.key === route.key) { hoveredRoute = null; updateRouteAppearance(); }
      });
      line.on('click', event => {
        if (!selectNearbyRoute(event.containerPoint, isTouchInput(event) ? TOUCH_ROUTE_TOLERANCE : 4)) showRoute(route);
      });
    });
    airports.forEach(a => {
      if (!locations[a.iata_code]) return;
      const code = a.iata_code, isSelected = asiaAirports.has(code) || americaAirports.has(code);
      const marker = L.circleMarker(pacific(locations[code]), { radius: isSelected ? 8 : active.has(code) ? 5 : 3, color: isSelected ? 'var(--route-highlight)' : active.has(code) ? 'var(--airport-active)' : 'var(--airport-inactive)', fillColor: isSelected ? 'var(--route-highlight)' : active.has(code) ? 'var(--airport-fill)' : 'var(--airport-inactive-fill)', fillOpacity: 1, weight: 2, bubblingMouseEvents: false }).addTo(markers);
      marker.airportCode = code;
      marker.getElement()?.setAttribute('aria-label', `${code} 机场 / Airport`);
      marker.on('click', event => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        showAirportCards(airportCardsFor(code));
      });
      marker.on('mouseover', () => {
        if (!canPreviewHover()) return;
        showAirportCards(airportCardsFor(code));
      });
      marker.on('mouseout', scheduleAirportCardClose);
    });
    const detail = document.querySelector('#route-detail');
    detail.hidden = true; detail.replaceChildren();
    const details = document.querySelector('#route-list');
    details.hidden = false;
    document.querySelector('#route-list-actions').hidden = false;
    document.querySelector('#flight-summary').textContent = `${filtered.length} 条记录 / records · ${routes.size} 条航线 / routes`;
    details.innerHTML = !routes.size ? '<p>当前筛选下没有已收录的直飞航线。 / No cataloged nonstop routes match these filters.</p>' : '';
    groupByCountry([...routes.values()], route => airportByCode[route.a].country_or_region).forEach(([country, countryRoutes]) => {
      const group = document.createElement('details'); group.className = 'route-country-group';
      group.dataset.country = country; group.open = expandedCountries.has(country);
      group.addEventListener('toggle', () => {
        if (!group.isConnected) return;
        if (group.open) expandedCountries.add(country); else expandedCountries.delete(country);
        updateExpansionButtons();
      });
      const heading = document.createElement('summary'); heading.className = 'country-group-heading';
      heading.id = `route-country-${country}`; heading.innerHTML = `${countryHeadingHTML(country)}${chevronHTML.replace('filter-chevron', 'country-chevron')}`;
      group.setAttribute('aria-labelledby', heading.id); group.append(heading); details.append(group);
      countryRoutes.sort((a, b) => a.key.localeCompare(b.key)).forEach(route => {
        const card = document.createElement('div'); card.className = 'route-card';
        card.dataset.routeKey = route.key;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'route-card-toggle';
        button.innerHTML = `<span class="route-card-airports">${escapeHTML(route.a)} - ${escapeHTML(route.b)}</span><svg class="route-expand-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
        button.setAttribute('aria-controls', `route-flights-${route.key}`);
        const previewRoute = () => { hoveredRoute = route; updateRouteAppearance(); };
        button.onmouseenter = () => { if (canPreviewHover()) previewRoute(); };
        button.onfocus = () => { if (canPreviewFocus()) previewRoute(); };
        button.onmouseleave = button.onblur = () => {
          if (hoveredRoute?.key === route.key) { hoveredRoute = null; updateRouteAppearance(); }
        };
        button.onclick = () => { setCardExpanded(card, button.getAttribute('aria-expanded') !== 'true'); updateExpansionButtons(); }; card.append(button);
        const flightList = document.createElement('div'); flightList.className = 'filtered-flights';
        flightList.id = `route-flights-${route.key}`;
        flightList.innerHTML = serviceDetails(route);
        route.flights.forEach(f => {
          const row = document.createElement('div'); row.className = 'filtered-flight';
          row.innerHTML = `${airlineHTML(f.airline)}<br>${escapeHTML(f.airline + f.flight_number)} · ${escapeHTML(f.origin)} ${arrowHTML()} ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入 / Aircraft unspecified')}`;
          flightList.append(row);
        });
        const detailButton = document.createElement('button'); detailButton.type = 'button'; detailButton.className = 'route-details-button';
        detailButton.textContent = '查看细节 / View details'; detailButton.onclick = () => showRoute(route); flightList.append(detailButton);
        card.append(flightList); group.append(card); setCardExpanded(card, expandedRoutes.has(route.key));
      });
    });
    updateExpansionButtons();
    layoutPlaceLabels();
  }
  document.querySelector('#expand-all-routes').onclick = () => { document.querySelectorAll('#details .route-country-group').forEach(group => { group.open = true; expandedCountries.add(group.dataset.country); }); document.querySelectorAll('#details .route-card').forEach(card => setCardExpanded(card, true)); updateExpansionButtons(); };
  document.querySelector('#collapse-all-routes').onclick = () => { document.querySelectorAll('#details .route-country-group').forEach(group => { group.open = false; expandedCountries.delete(group.dataset.country); }); document.querySelectorAll('#details .route-card').forEach(card => setCardExpanded(card, false)); updateExpansionButtons(); };
  backButton.onclick = () => {
    if (selectedRoute) render();
  };
  document.querySelector('#reset').onclick = () => { expandedRoutes.clear(); expandedCountries.clear(); document.querySelectorAll('.catalog-country-group').forEach(group => { group.open = false; }); asiaAirports.set([]); americaAirports.set([]); selectedAirlines.set([]); applyFilters(); framePacific(); };
  render();
}
function setupTopbarMenu() {
  const header = document.querySelector('.topbar');
  const toggle = document.querySelector('#topbar-menu-toggle');
  const mobile = matchMedia('(max-width: 799px)');
  function setOpen(open) {
    header.dataset.menuOpen = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭顶栏菜单 / Close menu' : '打开顶栏菜单 / Open menu');
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', event => { if (!header.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
  });
  header.addEventListener('focusout', event => { if (!header.contains(event.relatedTarget)) setOpen(false); });
  mobile.addEventListener('change', () => setOpen(false));
}
setupTopbarMenu();
init().catch(error => { document.querySelector('#status').textContent = `${error.message} 请通过本地 HTTP 服务打开此页面。 / Open this page through a local HTTP server.`; document.querySelector('#stats').textContent = '地图未能初始化 / Map initialization failed'; });
