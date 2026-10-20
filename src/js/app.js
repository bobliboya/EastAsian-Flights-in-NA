/* Buildless Leaflet viewer with JSON catalogs and retained historical schedules. */
'use strict';
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pacific = ([lat, lon]) => [lat, lon < 0 ? lon + 360 : lon];
const FLAG_REGIONS = {
  CHN: ['cn', '中国'], HKG: ['hk', '中国香港'], MAC: ['mo', '中国澳门'], TWN: ['tw', '台湾'],
  JPN: ['jp', '日本'], KOR: ['kr', '韩国'], PRK: ['kp', '朝鲜'], SGP: ['sg', '新加坡'],
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
  const flights = rawFlights.filter(f => {
    const origin = airportByCode[f.origin], destination = airportByCode[f.destination];
    if (!origin || !destination || origin.region === destination.region) return false;
    const [a, b] = routeEndpoints(f.origin, f.destination);
    return serviceKeys.has(`${f.airline}:${a}-${b}`)
      && (!f.valid_from || f.valid_from <= catalog.checked_on)
      && (!f.valid_to || f.valid_to >= catalog.checked_on);
  });
  document.querySelector('#catalog-note').textContent = `航线资料核查：${catalog.checked_on}。地图含季节性定期客运航线，未开航计划不计入当前连线。航线与班表独立收录，未核实的班次、时刻和机型不补填。`;
  const catalogAirports = new Set(services.flatMap(r => [r.origin, r.destination]));
  const catalogAirlines = new Set(services.map(r => r.airline));
  const catalogRoutes = new Set(services.map(r => `${r.origin}-${r.destination}`));
  document.querySelector('#stats').innerHTML = `<b>${catalogAirports.size}</b> 机场 &nbsp; <b>${catalogAirlines.size}</b> 航司 &nbsp; <b>${catalogRoutes.size}</b> 航线 &nbsp; <b>${flights.length}</b> 航班记录`;
  const desktop = window.matchMedia('(min-width: 721px)');
  // Fit the same schematic geometry used for drawing and hover selection.
  const pacificBounds = L.latLngBounds(Object.values(locations).map(pacific));
  services.forEach(f => {
    if (locations[f.origin] && locations[f.destination]) {
      routeCurve(locations[f.origin], locations[f.destination]).forEach(point => pacificBounds.extend(point));
    }
  });
  const map = L.map('map', {
    minZoom: 1, maxZoom: 8, zoomSnap: 0, zoomControl: false,
    dragging: !desktop.matches, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: !desktop.matches
  });
  function framePacific() {
    map.invalidateSize({ pan: false });
    map.fitBounds(pacificBounds, {
      paddingTopLeft: [24, 24],
      paddingBottomRight: [24, 24],
      animate: false
    });
  }
  framePacific();
  // Reframe after viewport changes without changing the active filters.
  new ResizeObserver(framePacific).observe(document.querySelector('#map'));
  desktop.addEventListener('change', () => {
    if (desktop.matches) { map.dragging.disable(); map.touchZoom.disable(); }
    else { map.dragging.enable(); map.touchZoom.enable(); }
    framePacific();
  });
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
    a => `${airportHTML(a.iata_code)} · ${escapeHTML(a.name_cn)}`, airportHTML);
  const selectedAirlines = catalogMultiselect(airlineSelect, airlines, '全部航空公司', '添加航空公司',
    a => `${airlineFlag(a.iata_code)}${escapeHTML(a.name_cn)} · ${escapeHTML(a.iata_code)}`,
    code => `${airlineFlag(code)}${escapeHTML(code)}`);
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
  const filterHistory = [];
  const filterState = () => [selectedAirlines.values(), asiaAirports.values(), americaAirports.values()];
  let appliedFilters = filterState();
  function matchesFilters(f) {
    const [asia, america] = routeEndpoints(f.origin, f.destination);
    return (!selectedAirlines.values().length || selectedAirlines.has(f.airline))
      && (!asiaAirports.values().length || asiaAirports.has(asia))
      && (!americaAirports.values().length || americaAirports.has(america));
  }
  function updateBackButton() {
    backButton.disabled = !selectedRoute && !filterHistory.length;
    backButton.textContent = '返回';
    backButton.title = selectedRoute ? '返回航班列表' : filterHistory.length ? '返回上次筛选' : '暂无可返回的记录';
  }
  function applyFilters() {
    const next = filterState();
    if (JSON.stringify(next) !== JSON.stringify(appliedFilters)) { filterHistory.push(appliedFilters); expandedRoutes.clear(); }
    appliedFilters = next;
    render();
    document.querySelector('.panel-scroll').scrollTop = 0;
  }
  let airportPopup = null, popupKey = '', popupCloseTimer, pointerOverCard = false;
  function keepAirportCardOpen() { clearTimeout(popupCloseTimer); popupCloseTimer = null; }
  function scheduleAirportCardClose() {
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
    const nearest = airports.filter(a => locations[a.iata_code]).map(a => ({
      airport: a, distance: map.latLngToContainerPoint(pacific(locations[a.iata_code])).distanceTo(event.containerPoint)
    })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= 20) {
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
  map.on('click', () => {
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
    if (pickerTimer || routePicker.hidden || routePicker.matches(':hover')) return;
    pickerTimer = setTimeout(closeRoutePicker, 100);
  }
  routePicker.onmouseenter = () => { clearTimeout(pickerTimer); pickerTimer = null; };
  routePicker.onmouseleave = () => { hoveredRoute = null; updateRouteAppearance(); scheduleRoutePickerClose(); };
  function nearbyRoutes(point) {
    const candidates = [];
    lines.eachLayer(line => {
      const points = line.getLatLngs().map(latlng => map.latLngToContainerPoint(latlng));
      let distance = Infinity;
      for (let i = 1; i < points.length; i++) distance = Math.min(distance, L.LineUtil.pointToSegmentDistance(point, points[i-1], points[i]));
      if (distance <= 28) candidates.push(line.route);
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
      button.onmouseenter = button.onfocus = () => { hoveredRoute = route; updateRouteAppearance(); };
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
      if (hasTimetable && !status && !note) return '';
      return `<div class="filtered-flight">${airlineFlag(service.airline)}${escapeHTML(airlineName(service.airline))} (${escapeHTML(service.airline)})${status}${hasTimetable ? '' : ' · 班表未录入'}${note ? `<br>${escapeHTML(note)}` : ''}</div>`;
    }).join('');
  }
  function showRoute(route) {
    document.querySelector('#route-list-actions').hidden = true;
    closeRoutePicker();
    selectedRoute = route.key;
    updateBackButton();
    if (airportPopup) map.closePopup(airportPopup);
    document.querySelector('.panel-scroll').scrollTop = 0;
    const list = route.flights.map(f => {
      const running = days.map((d, i) => f[d] === '1' ? ['一', '二', '三', '四', '五', '六', '日'][i] : '').filter(Boolean);
      return `<div class="flight"><strong>${airlineFlag(f.airline)}${escapeHTML(f.airline + f.flight_number)} · ${escapeHTML(airlineName(f.airline))}</strong><br>${escapeHTML(f.origin)} → ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入')}<br>${running.length === 7 ? '每日' : '周' + running.join('、')} · 每周 ${running.length} 班<br>${f.dept_time || f.arri_time ? escapeHTML(`${f.dept_time || '—'} → ${f.arri_time || '—'}`) : '起降时间未录入'}<br>${f.valid_to ? `班表有效至 ${escapeHTML(f.valid_to)}` : '历史班表'}</div>`;
    }).join('');
    document.querySelector('#flight-summary').textContent = `${route.flights.length} 条记录 · 1 条航线`;
    document.querySelector('#details').innerHTML = `<p>${airportHTML(route.a)} · ${escapeHTML(name(route.a))}<br>${airportHTML(route.b)} · ${escapeHTML(name(route.b))}</p>${serviceDetails(route)}${list}`;
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
      line.bindTooltip(`${route.a} ↔ ${route.b}`);
      line.on('mousemove', () => { if (line.isTooltipOpen()) constrainOverlay(line.getTooltip()); });
      line.on('mouseover', () => { hoveredRoute = route; updateRouteAppearance(); });
      line.on('mouseout', () => {
        if (hoveredRoute?.key === route.key) { hoveredRoute = null; updateRouteAppearance(); }
      });
      line.on('click', event => {
        const candidates = nearbyRoutes(event.containerPoint);
        if (candidates.length > 1) showRoutePicker(candidates, event.containerPoint);
        else showRoute(route);
      });
    });
    airports.forEach(a => {
      if (!locations[a.iata_code]) return;
      const code = a.iata_code, isSelected = asiaAirports.has(code) || americaAirports.has(code);
      const marker = L.circleMarker(pacific(locations[code]), { radius: isSelected ? 8 : active.has(code) ? 5 : 3, color: isSelected ? 'var(--route-highlight)' : active.has(code) ? 'var(--airport-active)' : 'var(--airport-inactive)', fillColor: isSelected ? 'var(--route-highlight)' : active.has(code) ? 'var(--airport-fill)' : 'var(--airport-inactive-fill)', fillOpacity: 1, weight: 2, bubblingMouseEvents: false }).addTo(markers);
      marker.getElement()?.setAttribute('aria-label', `${code}机场`);
      marker.on('click', event => {
        if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        showAirportCards(airportCardsFor(code));
      });
      marker.on('mouseover', () => {
        showAirportCards(airportCardsFor(code));
      });
      marker.on('mouseout', scheduleAirportCardClose);
    });
    const details = document.querySelector('#details');
    document.querySelector('#route-list-actions').hidden = false;
    document.querySelector('#flight-summary').textContent = `${filtered.length} 条记录 · ${routes.size} 条航线`;
    details.innerHTML = !routes.size ? '<p>当前筛选下没有已收录的直飞航线。</p>' : '';
    [...routes.values()].forEach(route => {
      const card = document.createElement('div'); card.className = 'route-card';
      card.dataset.routeKey = route.key;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'route-card-toggle';
      button.innerHTML = `<span class="route-card-airports">${airportHTML(route.a)} - ${airportHTML(route.b)}</span><svg class="route-expand-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
      button.setAttribute('aria-controls', `route-flights-${route.key}`);
      button.onmouseenter = button.onfocus = () => { hoveredRoute = route; updateRouteAppearance(); };
      button.onmouseleave = button.onblur = () => {
        if (hoveredRoute?.key === route.key) { hoveredRoute = null; updateRouteAppearance(); }
      };
      button.onclick = () => { setCardExpanded(card, button.getAttribute('aria-expanded') !== 'true'); updateExpansionButtons(); }; card.append(button);
      const flightList = document.createElement('div'); flightList.className = 'filtered-flights';
      flightList.id = `route-flights-${route.key}`;
      flightList.innerHTML = serviceDetails(route);
      route.flights.forEach(f => {
        const row = document.createElement('div'); row.className = 'filtered-flight';
        const frequency = days.filter(day => f[day] === '1').length;
        row.innerHTML = `${airlineFlag(f.airline)}${escapeHTML(f.airline + f.flight_number)} · ${escapeHTML(f.origin)} → ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入')} · 每周 ${frequency} 班${f.valid_to ? '' : '（历史）'}`;
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
    if (selectedRoute) { render(); return; }
    const previous = filterHistory.pop();
    if (!previous) return;
    selectedAirlines.set(previous[0]); asiaAirports.set(previous[1]); americaAirports.set(previous[2]);
    appliedFilters = previous; expandedRoutes.clear(); render();
  };
  document.querySelector('#reset').onclick = () => { expandedRoutes.clear(); asiaAirports.set([]); americaAirports.set([]); selectedAirlines.set([]); applyFilters(); framePacific(); };
  render();
}
init().catch(error => { document.querySelector('#status').textContent = `${error.message} 请通过本地 HTTP 服务打开此页面。`; document.querySelector('#stats').textContent = '地图未能初始化'; });
