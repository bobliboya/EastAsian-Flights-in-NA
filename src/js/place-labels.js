import { escapeHTML } from './display.js';
import { pacific } from './geometry.js';

// Background city labels never intercept map input. Hide a label if no safe position fits.
export function setupPlaceLabels({ map, airports, locations, lines }) {
  const L = window.L;
  // Quiet geographic context below routes; labels never intercept map gestures.
  map.createPane('placeLabels');
  map.getPane('placeLabels').style.zIndex = 350;
  map.getPane('placeLabels').style.pointerEvents = 'none';
  const placeLabels = L.layerGroup().addTo(map);
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

  return layoutPlaceLabels;
}
