// WMO weather interpretation codes (used by Open-Meteo) -> condition keys.
// Other providers map their own codes onto the same keys.

const TABLE = {
  0: ['clear', 'clear'],
  1: ['mainlyClear', 'clear'],
  2: ['partlyCloudy', 'cloudy'],
  3: ['overcast', 'cloudy'],
  45: ['fog', 'fog'],
  48: ['rimeFog', 'fog'],
  51: ['drizzleLight', 'rain'],
  53: ['drizzle', 'rain'],
  55: ['drizzleDense', 'rain'],
  56: ['freezingDrizzle', 'rain'],
  57: ['freezingDrizzle', 'rain'],
  61: ['rainLight', 'rain'],
  63: ['rain', 'rain'],
  65: ['rainHeavy', 'rain'],
  66: ['freezingRain', 'rain'],
  67: ['freezingRain', 'rain'],
  71: ['snowLight', 'snow'],
  73: ['snow', 'snow'],
  75: ['snowHeavy', 'snow'],
  77: ['snowGrains', 'snow'],
  80: ['showersLight', 'rain'],
  81: ['showers', 'rain'],
  82: ['showersViolent', 'rain'],
  85: ['snowShowers', 'snow'],
  86: ['snowShowers', 'snow'],
  95: ['thunderstorm', 'storm'],
  96: ['thunderstormHail', 'storm'],
  99: ['thunderstormHail', 'storm'],
};

/**
 * @returns {{key: string, group: 'clear'|'cloudy'|'fog'|'rain'|'snow'|'storm', icon: string}}
 */
export function describeCode(code) {
  const [key, group] = TABLE[code] || ['unknown', 'cloudy'];
  let icon = group;
  if (code === 1 || code === 2) icon = 'partly';
  if (code === 3) icon = 'cloudy';
  if (group === 'rain' && code >= 51 && code <= 57) icon = 'drizzle';
  return { key, group, icon };
}
