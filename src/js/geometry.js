// Route drawing and hit testing must use these same Pacific coordinates.
export const pacific = ([lat, lon]) => [lat, lon < 0 ? lon + 360 : lon];
// Schematic arcs in Mercator space; mirror southern routes below the endpoint chord.
export const ROUTE_CURVE = {
  mirrorBelowLatitude: 35,
  bendFactor: 0.18,
  maxBendDegrees: 26,
  samples: 81
};
export function routeCurve(start, end) {
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
export const routeColor = (country, highlighted = false) => `var(--route-${({CHN:'greater-china', HKG:'greater-china', MAC:'greater-china', TWN:'greater-china', JPN:'japan', KOR:'korea', PRK:'korea', SGP:'singapore'})[country] || 'color'}${highlighted ? '-highlight' : ''})`;
