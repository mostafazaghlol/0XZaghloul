// Unit conversion and value formatting. All provider data is normalised to
// metric base units: °C, km/h, mm, hPa, metres.

export const TEMP_UNITS = ['c', 'f'];
export const WIND_UNITS = ['kmh', 'mph', 'ms'];
export const PRECIP_UNITS = ['mm', 'in'];
export const PRESSURE_UNITS = ['hPa', 'inHg'];

const WIND_LABEL = { kmh: 'km/h', mph: 'mph', ms: 'm/s' };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function convertTemp(c, unit) {
  if (!isNum(c)) return null;
  return unit === 'f' ? (c * 9) / 5 + 32 : c;
}

export function convertWind(kmh, unit) {
  if (!isNum(kmh)) return null;
  if (unit === 'mph') return kmh / 1.609344;
  if (unit === 'ms') return kmh / 3.6;
  return kmh;
}

export function convertPrecip(mm, unit) {
  if (!isNum(mm)) return null;
  return unit === 'in' ? mm / 25.4 : mm;
}

export function convertPressure(hpa, unit) {
  if (!isNum(hpa)) return null;
  return unit === 'inHg' ? hpa * 0.0295299830714 : hpa;
}

/** Visibility in metres -> km or miles. */
export function convertDistance(m, imperial) {
  if (!isNum(m)) return null;
  return imperial ? m / 1609.344 : m / 1000;
}

function num(v, digits, locale) {
  // Avoid "-0"
  const rounded = Number(v.toFixed(digits));
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const DASH = '–';

export function formatTemp(c, unit, locale = 'en') {
  const v = convertTemp(c, unit);
  return v == null ? DASH : `${num(v, 0, locale)}°`;
}

export function formatWind(kmh, unit, locale = 'en') {
  const v = convertWind(kmh, unit);
  return v == null ? DASH : `${num(v, unit === 'ms' ? 1 : 0, locale)} ${WIND_LABEL[unit] || 'km/h'}`;
}

export function formatPrecip(mm, unit, locale = 'en') {
  const v = convertPrecip(mm, unit);
  return v == null ? DASH : `${num(v, unit === 'in' ? 2 : 1, locale)} ${unit === 'in' ? 'in' : 'mm'}`;
}

export function formatPressure(hpa, unit, locale = 'en') {
  const v = convertPressure(hpa, unit);
  return v == null ? DASH : `${num(v, unit === 'inHg' ? 2 : 0, locale)} ${unit === 'inHg' ? 'inHg' : 'hPa'}`;
}

export function formatDistance(m, imperial, locale = 'en') {
  const v = convertDistance(m, imperial);
  if (v == null) return DASH;
  return `${num(v, v < 10 ? 1 : 0, locale)} ${imperial ? 'mi' : 'km'}`;
}

export function formatPercent(p, locale = 'en') {
  return isNum(p) ? `${num(p, 0, locale)}%` : DASH;
}

/** Degrees -> 16-point compass abbreviation. */
export function compassPoint(deg) {
  if (!isNum(deg)) return '';
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[i];
}

/** Sensible defaults for a browser locale (US-style vs metric). */
export function defaultUnitsForLocale(locale = 'en') {
  const region = (locale.split('-')[1] || '').toUpperCase();
  const imperial = ['US', 'LR', 'MM'].includes(region);
  return {
    tempUnit: imperial ? 'f' : 'c',
    windUnit: imperial ? 'mph' : 'kmh',
    precipUnit: imperial ? 'in' : 'mm',
    pressureUnit: imperial ? 'inHg' : 'hPa',
  };
}
