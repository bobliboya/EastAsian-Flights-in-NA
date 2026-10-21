// App controller: data loading, map layers, filter state and route selection.
import { arrowHTML, bilingual, bilingualNote, catalogOptionHTML, chevronHTML,
  countryHeadingHTML, createAirlineRenderer, createFlightRenderer, escapeHTML,
  groupByCountry, stackedNamesHTML } from './display.js';
import { pacific, routeColor, routeCurve } from './geometry.js';
import { canPreviewFocus, canPreviewHover, isTouchInput, setupBrandTooltips,
  setupInputTracking, setupTopbarMenu } from './controls.js';
import { createCatalogMultiselect } from './multiselect.js';
import { setupPlaceLabels } from './place-labels.js';

async function init() {
  if (!window.L) throw new Error('地图库加载失败，请检查网络后刷新。 / Map library failed to load. Check your connection and refresh.');
  const paths = ['airports.json', 'airlines.json', 'flights.json', 'world-countries.geojson', 'routes.json'];
  const [airports, airlines, rawFlights, countries, services] = await Promise.all(paths.map(async path => {
    const res = await fetch(`src/data/${path}`, { cache: 'no-store' }); if (!res.ok) throw new Error(`无法读取 / Failed to load ${path}`);
    return res.json();
  }));
  const airportByCode = Object.fromEntries(airports.map(a => [a.iata_code, a]));
  const routeEndpoints = (origin, destination) => airportByCode[origin]?.region === 'asia_pacific'
    ? [origin, destination] : [destination, origin];
  const airlineByCode = Object.fromEntries(airlines.map(a => [a.iata_code, a]));
  const locations = Object.fromEntries(airports.map(a => [a.iata_code, [a.latitude, a.longitude]]));
  // Route evidence drives the network; a missing timetable is not a missing route.
  const serviceKeys = new Set(services.map(r => `${r.airline}:${r.origin}-${r.destination}`));
  const flights = rawFlights.filter(f => {
    const origin = airportByCode[f.origin], destination = airportByCode[f.destination];
    if (!origin || !destination || origin.region === destination.region) return false;
    const [a, b] = routeEndpoints(f.origin, f.destination);
    return serviceKeys.has(`${f.airline}:${a}-${b}`);
  });
  document.querySelector('#catalog-note').textContent = '班表按每周班数与运营星期展示，资料时效见各航班备注；实际安排以航司公布为准。 / Weekly frequencies and operating days are shown. See each flight’s note for timeliness; airline schedules prevail.';
  // Topbar totals describe the whole site. Only #flight-summary follows filters.
  const catalogAirports = new Set(services.flatMap(route => [route.origin, route.destination]));
  const catalogAirlines = new Set(services.map(route => route.airline));
  const catalogRoutes = new Set(services.map(route => `${route.origin}-${route.destination}`));
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
  // Leaflet's default attribution includes a flag; retain the library credit as text only.
  map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
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
  const lines = L.layerGroup().addTo(map), markers = L.layerGroup().addTo(map);
  const layoutPlaceLabels = setupPlaceLabels({ map, airports, locations, lines });

  const airlineSelect = document.querySelector('#airline');
  const asiaSelect = document.querySelector('#asia-airport'), americaSelect = document.querySelector('#north-america-airport');
  const backButton = document.querySelector('#filter-back');
  const airportHTML = code => escapeHTML(code);
  const airlineHTML = createAirlineRenderer(airlineByCode);
  const flightDetailsHTML = createFlightRenderer(airlineHTML);
  setupBrandTooltips();
  const airportMultiselect = (container, region, placeholder) => createCatalogMultiselect(container, {
    items: airports.filter(airport => airport.region === region),
    placeholder,
    addLabel: '添加机场 / Add airports',
    optionHTML: airport => catalogOptionHTML(airport),
    tagHTML: escapeHTML,
    onChange: applyFilters,
  });
  const selectedAirlines = createCatalogMultiselect(airlineSelect, {
    items: airlines,
    placeholder: '全部航空公司 / All airlines',
    addLabel: '添加航空公司 / Add airlines',
    optionHTML: airline => catalogOptionHTML(airline, true),
    tagHTML: escapeHTML,
    onChange: applyFilters,
  });
  const asiaAirports = airportMultiselect(asiaSelect, 'asia_pacific', '全部亚太区机场 / All Asia Pacific airports');
  const americaAirports = airportMultiselect(americaSelect, 'north_america', '全部北美区机场 / All North American airports');
  // Empty selectedRoute means list mode. render() clears detail mode, but preserves expansion sets.
  let selectedRoute = '';
  const collapsedRoutes = new Set();
  const collapsedCountries = new Set();
  function setCardExpanded(card, expanded) {
    card.querySelector('.route-card-toggle').setAttribute('aria-expanded', String(expanded));
    card.querySelector('.route-card-toggle').title = `${expanded ? '收起 / Collapse' : '展开 / Expand'} ${card.dataset.routeKey}`;
    card.querySelector('.filtered-flights').hidden = !expanded;
    if (expanded) collapsedRoutes.delete(card.dataset.routeKey); else collapsedRoutes.add(card.dataset.routeKey);
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
    return (!selectedAirlines.size || selectedAirlines.has(f.airline))
      && (!asiaAirports.size || asiaAirports.has(asia))
      && (!americaAirports.size || americaAirports.has(america));
  }
  function updateBackButton() {
    backButton.parentElement.hidden = !selectedRoute;
    backButton.disabled = !selectedRoute;
    backButton.title = '返回航班列表 / Back to flight list';
  }
  function applyFilters() {
    const next = filterState();
    if (JSON.stringify(next) !== JSON.stringify(appliedFilters)) { collapsedRoutes.clear(); collapsedCountries.clear(); }
    appliedFilters = next;
    render();
    document.querySelector('.panel-scroll').scrollTop = 0;
  }
  // Airport popup lifecycle: marker hover/click → popup → delayed close.
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
      card.innerHTML = `<h3><span class="airport-card-code">${airportHTML(code)}</span>${stackedNamesHTML(a.name_cn, a.name_en)}</h3><p>${escapeHTML(bilingual(a.city_cn, a.city))} · ${escapeHTML(a.region === 'asia_pacific' ? '亚太区 / Asia Pacific' : '北美区 / North America')}</p><div class="airport-count">${connections.length ? `<span>${destinations.size} 目的地 / Destinations</span><span>${records.length} 记录 / Records</span>` : '当前筛选下没有已收录的航线 / No cataloged routes match these filters'}</div>`;
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
    // Tooltips are created lazily on hover; most lines have no tooltip yet.
    lines.eachLayer(line => { if (line.getTooltip()?.isOpen()) constrainOverlay(line.getTooltip()); });
    if (!routePicker.hidden) constrainOverlay({ getElement: () => routePicker });
  }));
  // Dense route picker and selected-route highlighting share the same route geometry.
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
      L.tooltip({ permanent:true, interactive:false, direction:index === 0 ? 'left' : 'right', offset:[index === 0 ? -8 : 8, 0], className:'airport-label' })
        .setLatLng(pacific(locations[code])).setContent(airportHTML(code)).addTo(endpointLabels);
    });
  }
  // Sidebar views: render() builds the list; showRoute() switches to one route.
  function serviceDetails(route) {
    return route.services.map(service => {
      const hasTimetable = route.flights.some(f => f.airline === service.airline);
      const note = service.note;
      if (hasTimetable && !note) return '';
      return `<div class="filtered-flight">${airlineHTML(service.airline)}${hasTimetable ? '' : ' · 班表未录入 / Timetable unavailable'}${note ? `<br>${escapeHTML(bilingualNote(note))}` : ''}</div>`;
    }).join('');
  }
  function showRoute(route) {
    document.querySelector('#route-list-actions').hidden = true;
    closeRoutePicker();
    selectedRoute = route.key;
    updateBackButton();
    if (airportPopup) map.closePopup(airportPopup);
    const list = route.flights.map(flightDetailsHTML).join('');
    document.querySelector('#flight-summary').textContent = `${route.flights.length} 记录 / Records\n1 航线 / Routes`;
    document.querySelector('#route-list').hidden = true;
    const detail = document.querySelector('#route-detail');
    const endpoints = [route.a, route.b].map(code => {
      const airport = airportByCode[code];
      return `<div class="catalog-option">${catalogOptionHTML(airport)}</div>`;
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
      line.on('mousemove', () => { if (line.getTooltip()?.isOpen()) constrainOverlay(line.getTooltip()); });
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
    document.querySelector('#flight-summary').textContent = `${filtered.length} 记录 / Records\n${routes.size} 航线 / Routes`;
    details.innerHTML = !routes.size ? '<p>当前筛选下没有已收录的直飞航线。 / No cataloged nonstop routes match these filters.</p>' : '';
    groupByCountry([...routes.values()], route => airportByCode[route.a].country_or_region).forEach(([country, countryRoutes]) => {
      const group = document.createElement('details'); group.className = 'route-country-group';
      group.dataset.country = country; group.open = !collapsedCountries.has(country);
      group.addEventListener('toggle', () => {
        if (!group.isConnected) return;
        if (group.open) collapsedCountries.delete(country); else collapsedCountries.add(country);
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
          row.innerHTML = `${airlineHTML(f.airline, f.airline + f.flight_number)}<br>${escapeHTML(f.origin)} ${arrowHTML()} ${escapeHTML(f.destination)} · ${escapeHTML(f.aircraft || '机型未录入 / Aircraft unspecified')}`;
          flightList.append(row);
        });
        const detailButton = document.createElement('button'); detailButton.type = 'button'; detailButton.className = 'route-details-button';
        detailButton.textContent = '查看细节 / View details'; detailButton.onclick = () => showRoute(route); flightList.append(detailButton);
        card.append(flightList); group.append(card); setCardExpanded(card, !collapsedRoutes.has(route.key));
      });
    });
    updateExpansionButtons();
    layoutPlaceLabels();
  }
  function setAllRoutesExpanded(expanded) {
    document.querySelectorAll('#details .route-country-group').forEach(group => {
      group.open = expanded;
      if (expanded) collapsedCountries.delete(group.dataset.country);
      else collapsedCountries.add(group.dataset.country);
    });
    document.querySelectorAll('#details .route-card').forEach(card => setCardExpanded(card, expanded));
    updateExpansionButtons();
  }
  document.querySelector('#expand-all-routes').onclick = () => setAllRoutesExpanded(true);
  document.querySelector('#collapse-all-routes').onclick = () => setAllRoutesExpanded(false);
  backButton.onclick = () => {
    if (selectedRoute) render();
  };
  document.querySelector('#reset').onclick = () => {
    collapsedRoutes.clear();
    collapsedCountries.clear();
    document.querySelectorAll('.catalog-country-group').forEach(group => { group.open = false; });
    asiaAirports.set([]);
    americaAirports.set([]);
    selectedAirlines.set([]);
    applyFilters();
    framePacific();
  };
  render();
}
setupInputTracking();
setupTopbarMenu();
init().catch(error => { document.querySelector('#status').textContent = `${error.message} 请通过本地 HTTP 服务打开此页面。 / Open this page through a local HTTP server.`; document.querySelector('#stats').textContent = '地图未能初始化 / Map initialization failed'; });
