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

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A weekday mask is a recurrence rule, not the number of departures in a
// truncated timetable. Always count actual local departure dates in its window.
function departureSummary(f) {
  const first = f.display_from || f.valid_from, last = f.display_to || f.valid_to;
  if (!first || !last) return '历史班表 · 运营日期未核实';
  let departures = f.departures;
  if (!departures) {
    departures = [];
    const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86400000) {
      if (f[days[new Date(t).getUTCDay()]] === '1') departures.push({ date: new Date(t).toISOString().slice(0,10) });
    }
  }
  return `${first} 至 ${last} · 期间 ${departures.length} 班`;
}
const pacific = ([lat, lon]) => [lat, lon < 0 ? lon + 360 : lon];
const FLAG_REGIONS = {
  CHN: ['cn', '中国'], HKG: ['hk', '中国香港'], TWN: ['tw', '台湾'],
  JPN: ['jp', '日本'], KOR: ['kr', '韩国'], SGP: ['sg', '新加坡'],
  USA: ['us', '美国'], CAN: ['ca', '加拿大']
};
const flagHTML = country => {
  const flag = FLAG_REGIONS[country];
  return flag ? `<img class="country-flag" src="src/assets/flags/${flag[0]}.svg" alt="${flag[1]}" title="${flag[1]}" width="20" height="15">` : '';
};
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
  if (!window.L) throw new Error('地图库加载失败，请检查网络后刷新。');
  const paths = ['airports.json', 'airlines.json', 'flights.json', 'world-countries.geojson', 'catalog-metadata.json', 'routes.json'];
  const [airports, airlines, rawFlights, countries, catalog, routeCatalog] = await Promise.all(paths.map(async path => {
    const res = await fetch(`src/data/${path}`, { cache: 'no-store' }); if (!res.ok) throw new Error(`无法读取 ${path}`);
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
  document.querySelector('#catalog-note').textContent = `航线资料核查：${catalog.route_snapshot?.checked_on || catalog.checked_on}；班表核查：${timetableDate}。班次按标注日期范围计算。地图含季节性定期客运航线，未开航计划不计入当前连线。机型可能调整。`;
  const catalogAirports = new Set(services.flatMap(r => [r.origin, r.destination]));
  const catalogAirlines = new Set(services.map(r => r.airline));
  const catalogRoutes = new Set(services.map(r => `${r.origin}-${r.destination}`));
  document.querySelector('#stats').innerHTML = `<b>${catalogAirports.size}</b> 机场 &nbsp; <b>${catalogAirlines.size}</b> 航司 &nbsp; <b>${catalogRoutes.size}</b> 航线 &nbsp; <b>${flights.length}</b> 航班`;
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
    panelToggle.setAttribute('aria-label', collapsed ? '恢复面板高度' : '降低面板高度');
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
  const lines = L.layerGroup().addTo(map), markers = L.layerGroup().addTo(map);
  const airlineSelect = document.querySelector('#airline');
  const asiaSelect = document.querySelector('#asia-airport'), americaSelect = document.querySelector('#north-america-airport');
  const backButton = document.querySelector('#filter-back');
  const name = code => airportByCode[code]?.name_cn || code;
  const airlineName = code => airlineByCode[code]?.name_cn || code;
  const airportHTML = code => `${flagHTML(airportByCode[code]?.country_or_region)}${escapeHTML(code)}`;
  const airlineFlag = code => flagHTML(airlineByCode[code]?.country_or_region);
  const allianceNames = { SA: '星空联盟', OW: '寰宇一家', ST: '天合联盟' };
  function airlineHTML(code, label = airlineName(code)) {
    const airline = airlineByCode[code];
    const alliance = allianceNames[airline?.alliance] || '无联盟';
    const airlineTip = `${airlineName(code)} · ${code}${airline?.alliance ? '' : ' · 无联盟'}`;
    const logo = `<span class="brand-mark" tabindex="0" data-brand-tip="${escapeHTML(airlineTip)}" aria-label="${escapeHTML(airlineTip)}"><img class="airline-logo" src="src/assets/airlines/${escapeHTML(code)}.png" alt="" width="20" height="20" loading="lazy"></span>`;
    const allianceIcon = airline?.alliance ? `<span class="brand-mark" tabindex="0" data-brand-tip="${escapeHTML(alliance)}" aria-label="${escapeHTML(alliance)}"><img class="alliance-logo" src="src/assets/alliances/${escapeHTML(airline.alliance)}.svg" alt="" width="18" height="18" loading="lazy"></span>` : '';
    return `<span class="airline-identity">${airlineFlag(code)}${escapeHTML(label)}${logo}${allianceIcon}</span>`;
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
        tag.setAttribute('aria-label', `移除 ${code}`);
        tag.onclick = () => { selected.delete(code); sync(); applyFilters(); };
        tags.append(tag);
      });
      inputs.forEach(input => { input.checked = selected.has(input.value); });
      summary.textContent = selected.size ? addLabel : placeholder;
      heading.textContent = `${headingText} (${selected.size}/${items.length})`;
    }
    items.forEach(a => {
      const label = document.createElement('label');
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = a.iata_code;
      input.onchange = () => {
        if (input.checked) selected.add(input.value); else selected.delete(input.value);
        sync(); applyFilters();
      };
      const text = document.createElement('span'); text.innerHTML = optionHTML(a);
      label.append(input, text);
      options.append(label); inputs.push(input);
    });
    sync();
    document.addEventListener('click', event => { if (!container.contains(event.target)) dropdown.open = false; });
    container.addEventListener('keydown', event => { if (event.key === 'Escape') { dropdown.open = false; summary.focus(); } });
    return { values: () => [...selected].sort(), has: code => selected.has(code),
      set: codes => { selected.clear(); codes.forEach(code => selected.add(code)); sync(); } };
  }
  const airportMultiselect = (container, region, placeholder) => catalogMultiselect(container,
    airports.filter(a => a.region === region), placeholder, '添加机场',
    a => `${airportHTML(a.iata_code)} · ${escapeHTML(a.name_cn)}`, code => escapeHTML(code));
  const selectedAirlines = catalogMultiselect(airlineSelect, airlines, '全部航空公司', '添加航空公司',
    a => airlineHTML(a.iata_code, `${a.iata_code} · ${a.name_cn}`),
    code => escapeHTML(code));
  const asiaAirports = airportMultiselect(asiaSelect, 'asia_pacific', '全部亚太区机场');
  const americaAirports = airportMultiselect(americaSelect, 'north_america', '全部北美区机场');
  let selectedRoute = '';
  const expandedRoutes = new Set();
  function setCardExpanded(card, expanded) {
    card.querySelector('.route-card-toggle').setAttribute('aria-expanded', String(expanded));
    card.querySelector('.route-card-toggle').title = `${expanded ? '收起' : '展开'} ${card.dataset.routeKey}`;
    card.querySelector('.filtered-flights').hidden = !expanded;
    if (expanded) expandedRoutes.add(card.dataset.routeKey); else expandedRoutes.delete(card.dataset.routeKey);
  }
  function updateExpansionButtons() {
    const cards = [...document.querySelectorAll('#details .route-card')];
    document.querySelector('#expand-all-routes').disabled = !cards.some(card => card.querySelector('.filtered-flights').hidden);
    document.querySelector('#collapse-all-routes').disabled = !cards.some(card => !card.querySelector('.filtered-flights').hidden);
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
    backButton.title = '返回航班列表';
  }
  function applyFilters() {
    const next = filterState();
    if (JSON.stringify(next) !== JSON.stringify(appliedFilters)) expandedRoutes.clear();
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
    heading.textContent = `附近 ${candidates.length} 座机场 · 请选择`;
    const body = document.createElement('div'); body.className = 'map-choice-body';
    body.tabIndex = 0; body.setAttribute('aria-label', '附近机场列表');
    content.append(heading, body);
    candidates.forEach(a => {
      const code = a.iata_code;
      const records = flights.filter(f => matchesFilters(f) && (f.origin === code || f.destination === code));
      const connections = services.filter(f => matchesFilters(f) && (f.origin === code || f.destination === code));
      const destinations = new Set(connections.map(f => f.origin === code ? f.destination : f.origin));
      const card = document.createElement('article'); card.className = 'airport-info-card';
      const serviceLabel = a.service_status === 'announced' ? `待开航 · ${a.service_start}` : a.service_status === 'seasonal' ? '含季节性定期客运' : '定期客运机场';
      card.innerHTML = `<h3><span>${airportHTML(code)}</span> ${escapeHTML(a.name_cn)}</h3><p>${escapeHTML(a.name_en)}<br>${escapeHTML(a.city_cn)} · ${escapeHTML(catalog.regions[a.region].name_cn)}<br>${escapeHTML(serviceLabel)}</p><div class="airport-count">${connections.length ? `${destinations.size} 个目的地 · ${records.length} 条航班记录` : '当前筛选下没有已收录的航线'}</div>`;
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = '查看细节';
      button.onclick = () => {
        (a.region === 'asia_pacific' ? asiaAirports : americaAirports).set([code]); applyFilters();
        document.querySelector('.panel-scroll').scrollTop = 0;
      };
      card.append(button); body.append(card);
    });
    airportPopup = L.popup({ autoPan: false, closeOnClick: false, maxWidth: 340, minWidth: 270, className: 'airport-info-popup' })
      .setLatLng(pacific(locations[candidates[0].iata_code])).setContent(content).openOn(map);
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
  routePicker.setAttribute('aria-label', '附近航线选择');
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
    heading.textContent = `附近 ${candidates.length} 条航线 · 请选择`; routePicker.append(heading);
    const body = document.createElement('div'); body.className = 'map-choice-body'; routePicker.append(body);
    body.tabIndex = 0; body.setAttribute('aria-label', '附近航线列表');
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
      const status = service.service_status === 'seasonal' ? ' · 季节性' : '';
      const note = service.note || service.season_note;
      const upcoming = hasTimetable ? [] : rawFlights.filter(f => f.airline === service.airline
        && f.service_status === 'seasonal_planned' && f.valid_from > timetableDate
        && ((f.origin === route.a && f.destination === route.b) || (f.origin === route.b && f.destination === route.a)));
      const planned = upcoming.map(f => `<br>${escapeHTML(f.airline + f.flight_number)} · ${escapeHTML(f.origin)} → ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft)} · ${escapeHTML(f.valid_from)} 至 ${escapeHTML(f.valid_to)}`).join('');
      if (hasTimetable && !status && !note) return '';
      return `<div class="filtered-flight">${airlineHTML(service.airline)} (${escapeHTML(service.airline)})${status}${hasTimetable ? '' : upcoming.length ? ' · 下一运营季计划（未计入当前航班数）' : ' · 班表未录入'}${note ? `<br>${escapeHTML(note)}` : ''}${planned}</div>`;
    }).join('');
  }
  function flightDetailsHTML(f) {
    const mixedAircraft = new Set(f.departures?.map(d => d.aircraft)).size > 1;
    const notice = f.verification_note || f.aircraft_note;
    const warning = notice ? `<br>${escapeHTML(notice)}` : '';
    const departureLabels = f.departures?.map(d =>
      d.date.slice(5) + (mixedAircraft ? ` (${d.aircraft})` : '')) || [];
    const dates = departureLabels.length && departureLabels.length <= 7
      ? `<br>出发日期：${escapeHTML(departureLabels.join('、'))}` : '';
    const times = f.dept_time || f.arri_time
      ? escapeHTML(`${f.dept_time || '—'} → ${f.arri_time || '—'}`) : '起降时间未录入';
    const validity = f.valid_to ? `资料适用至 ${escapeHTML(f.valid_to)}` : '历史班表';
    return `<div class="flight">
      <strong>${escapeHTML(f.airline + f.flight_number)} · ${airlineHTML(f.airline)}</strong><br>
      ${escapeHTML(f.origin)} → ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入')}<br>
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
    document.querySelector('#flight-summary').textContent = `${route.flights.length} 条记录 · 1 条航线`;
    document.querySelector('#route-list').hidden = true;
    const detail = document.querySelector('#route-detail');
    detail.innerHTML = `<p class="detail-airports">${airportHTML(route.a)} · ${escapeHTML(name(route.a))}<br>${airportHTML(route.b)} · ${escapeHTML(name(route.b))}</p>${serviceDetails(route)}${list}`;
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
        line.bindTooltip(`${route.a} ↔ ${route.b}`).openTooltip(event.latlng);
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
      marker.getElement()?.setAttribute('aria-label', `${code}机场`);
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
    document.querySelector('#flight-summary').textContent = `${filtered.length} 条记录 · ${routes.size} 条航线`;
    details.innerHTML = !routes.size ? '<p>当前筛选下没有已收录的直飞航线。</p>' : '';
    [...routes.values()].forEach(route => {
      const card = document.createElement('div'); card.className = 'route-card';
      card.dataset.routeKey = route.key;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'route-card-toggle';
      button.innerHTML = `<span class="route-card-airports">${airportHTML(route.a)} - ${airportHTML(route.b)}</span><svg class="route-expand-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
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
        row.innerHTML = `${airlineHTML(f.airline)}<br>${escapeHTML(f.airline + f.flight_number)} · ${escapeHTML(f.origin)} → ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入')}`;
        flightList.append(row);
      });
      const detailButton = document.createElement('button'); detailButton.type = 'button'; detailButton.className = 'route-details-button';
      detailButton.textContent = '查看细节'; detailButton.onclick = () => showRoute(route); flightList.append(detailButton);
      card.append(flightList); details.append(card); setCardExpanded(card, expandedRoutes.has(route.key));
    });
    updateExpansionButtons();
  }
  document.querySelector('#expand-all-routes').onclick = () => { document.querySelectorAll('#details .route-card').forEach(card => setCardExpanded(card, true)); updateExpansionButtons(); };
  document.querySelector('#collapse-all-routes').onclick = () => { document.querySelectorAll('#details .route-card').forEach(card => setCardExpanded(card, false)); updateExpansionButtons(); };
  backButton.onclick = () => {
    if (selectedRoute) render();
  };
  document.querySelector('#reset').onclick = () => { expandedRoutes.clear(); asiaAirports.set([]); americaAirports.set([]); selectedAirlines.set([]); applyFilters(); framePacific(); };
  render();
}
function setupTopbarMenu() {
  const header = document.querySelector('.topbar');
  const toggle = document.querySelector('#topbar-menu-toggle');
  const mobile = matchMedia('(max-width: 799px)');
  function setOpen(open) {
    header.dataset.menuOpen = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭顶栏菜单' : '打开顶栏菜单');
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
init().catch(error => { document.querySelector('#status').textContent = `${error.message} 请通过本地 HTTP 服务打开此页面。`; document.querySelector('#stats').textContent = '地图未能初始化'; });
