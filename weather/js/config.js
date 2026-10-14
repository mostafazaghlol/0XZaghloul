// Runtime configuration. Nothing secret lives here.
//
// Open-Meteo needs no API key. If you switch to a provider that does
// (OpenWeatherMap, WeatherAPI, Tomorrow.io), point `proxyBase` at the bundled
// proxy (server/server.mjs) which injects the key from an environment
// variable on the server side, so the key never ships to the browser.
//
// Deployments can override any value by defining `window.WX_CONFIG` before
// app.js loads (e.g. in an optional config.local.js).

const defaults = {
  provider: 'open-meteo',
  proxyBase: null,

  endpoints: {
    forecast: 'https://api.open-meteo.com/v1/forecast',
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
    airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    reverseGeocoding: 'https://api.bigdatacloud.net/data/reverse-geocode-client',
    nwsAlerts: 'https://api.weather.gov/alerts/active',
    rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
  },

  // Rate limiting / freshness
  refreshIntervalMs: 15 * 60 * 1000, // automatic background refresh
  cacheFreshMs: 10 * 60 * 1000, // cached data younger than this is used without refetching
  minManualRefreshMs: 60 * 1000, // pull-to-refresh is ignored more often than this
  staleAfterMs: 60 * 60 * 1000, // cached data older than this is flagged as stale
  searchDebounceMs: 350,
  requestTimeoutMs: 12 * 1000,

  forecastDays: 10,
  maxFavorites: 20,
};

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v;
  }
  return out;
}

export const CONFIG = merge(defaults, globalThis.WX_CONFIG);
