// Provider registry. The UI only talks to the object returned by
// getProvider(), so a different weather source can be plugged in by adding a
// module that implements the same interface and registering it here:
//
//   getForecast(location, {signal})        -> Forecast (see open-meteo.js parseForecast)
//   searchLocations(query, {signal, lang}) -> Location[]
//   reverseGeocode(lat, lon, {signal})     -> {name, admin, country, countryCode}
//   getAirQuality(location, {signal})      -> AirQuality | null
//   getGrid(points, {signal})              -> GridPoint[]   (map overlays)
//   getAlerts(location, {signal})          -> Alert[]
//
// Providers that need API keys should be called through CONFIG.proxyBase so
// the key stays on the server (see server/server.mjs).

import { CONFIG } from '../config.js';
import { createOpenMeteoProvider } from './open-meteo.js';
import { createNwsAlertsProvider } from './nws-alerts.js';

const REGISTRY = {
  'open-meteo': createOpenMeteoProvider,
};

let instance;

export function getProvider(id = CONFIG.provider) {
  if (instance && instance.id === id) return instance;
  const factory = REGISTRY[id];
  if (!factory) throw new Error(`Unknown weather provider "${id}"`);
  const weather = factory();
  const alerts = createNwsAlertsProvider();
  instance = {
    ...weather,
    getAlerts: weather.getAlerts || alerts.getAlerts,
    attributions: [weather.attribution, alerts.attribution],
  };
  return instance;
}
