// Official severe-weather alerts from the US National Weather Service
// (api.weather.gov, free, no key). Open-Meteo has no alerts feed, so this is
// composed in as a separate alerts provider. Locations outside its coverage
// simply return no alerts.

import { CONFIG } from '../config.js';
import { getJson, withQuery } from './http.js';

const SEVERITY_RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

// Rough bounding boxes for NWS coverage (CONUS, Alaska, Hawaii, PR/USVI, Guam).
const COVERAGE = [
  [24, 50, -125, -66],
  [51, 72, -180, -129],
  [18, 23, -161, -154],
  [17, 19, -68, -64],
  [13, 14, 144, 146],
];

export function isCovered({ lat, lon, countryCode }) {
  if (countryCode) return ['US', 'PR', 'VI', 'GU', 'AS', 'MP'].includes(countryCode.toUpperCase());
  return COVERAGE.some(([s, n, w, e]) => lat >= s && lat <= n && lon >= w && lon <= e);
}

export function parseNwsAlerts(json, nowMs = Date.now()) {
  return (json?.features || [])
    .map((f) => f.properties || {})
    .map((p) => ({
      id: p.id,
      event: p.event || 'Weather alert',
      headline: p.headline || p.event || '',
      severity: p.severity || 'Unknown',
      urgency: p.urgency || '',
      description: p.description || '',
      instruction: p.instruction || '',
      sender: p.senderName || 'National Weather Service',
      effective: p.effective ? Date.parse(p.effective) : null,
      expires: p.ends || p.expires ? Date.parse(p.ends || p.expires) : null,
      url: p['@id'] || null,
    }))
    .filter((a) => !a.expires || a.expires > nowMs)
    .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
}

export function createNwsAlertsProvider({ fetchImpl } = {}) {
  return {
    id: 'nws',
    attribution: { name: 'National Weather Service', url: 'https://www.weather.gov/' },
    async getAlerts(location, { signal } = {}) {
      if (!isCovered(location)) return [];
      const url = withQuery(CONFIG.endpoints.nwsAlerts, { point: `${location.lat.toFixed(4)},${location.lon.toFixed(4)}` });
      const json = await getJson(url, { signal, fetchImpl: fetchImpl || globalThis.fetch.bind(globalThis) });
      return parseNwsAlerts(json);
    },
  };
}
