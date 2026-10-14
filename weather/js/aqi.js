// US EPA AQI categories and pollen levels.

const AQI_BANDS = [
  { max: 50, key: 'good', color: '#00e400', text: '#0b2e0b' },
  { max: 100, key: 'moderate', color: '#ffff00', text: '#3a3a00' },
  { max: 150, key: 'usg', color: '#ff7e00', text: '#3a1d00' },
  { max: 200, key: 'unhealthy', color: '#ff0000', text: '#ffffff' },
  { max: 300, key: 'veryUnhealthy', color: '#8f3f97', text: '#ffffff' },
  { max: Infinity, key: 'hazardous', color: '#7e0023', text: '#ffffff' },
];

export function aqiCategory(aqi) {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi)) return null;
  return AQI_BANDS.find((b) => aqi <= b.max);
}

/** Position of an AQI value on a 0..1 scale bar (capped at 300). */
export function aqiScalePosition(aqi) {
  return Math.min(1, Math.max(0, aqi / 300));
}

/** Pick the pollutant with the highest sub-index. */
export function mainPollutant(subIndices) {
  let best = null;
  for (const [name, value] of Object.entries(subIndices || {})) {
    if (typeof value !== 'number') continue;
    if (!best || value > best.value) best = { name, value };
  }
  return best;
}

/** Rough pollen level from grains/m³. */
export function pollenLevel(grains) {
  if (typeof grains !== 'number' || !Number.isFinite(grains)) return null;
  if (grains < 1) return 'none';
  if (grains < 20) return 'low';
  if (grains < 80) return 'moderate';
  if (grains < 200) return 'high';
  return 'veryHigh';
}
