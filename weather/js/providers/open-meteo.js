// Open-Meteo provider (https://open-meteo.com) — free, no API key.
// Parsers are exported separately so they can be unit-tested.

import { CONFIG } from '../config.js';
import { getJson, withQuery } from './http.js';

const CURRENT_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation',
  'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m',
  'wind_gusts_10m', 'dew_point_2m', 'visibility', 'uv_index',
];
const HOURLY_VARS = [
  'temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation',
  'weather_code', 'is_day', 'wind_speed_10m', 'wind_direction_10m', 'relative_humidity_2m', 'uv_index',
];
const DAILY_VARS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max',
  'precipitation_sum', 'sunrise', 'sunset', 'uv_index_max', 'wind_speed_10m_max', 'wind_direction_10m_dominant',
];
const AQ_POLLUTANTS = ['pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide', 'sulphur_dioxide', 'carbon_monoxide'];
const POLLEN = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'];

const toMs = (s) => (typeof s === 'number' ? s * 1000 : null);
const val = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function buildForecastUrl(lat, lon, base = CONFIG.endpoints.forecast) {
  return withQuery(base, {
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: CURRENT_VARS,
    hourly: HOURLY_VARS,
    daily: DAILY_VARS,
    minutely_15: 'precipitation',
    forecast_minutely_15: 8,
    forecast_days: CONFIG.forecastDays,
    timezone: 'auto',
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
  });
}

/** Index of the hourly slot containing `nowMs` (last slot starting at or before it). */
export function currentHourIndex(hourly, nowMs) {
  let idx = 0;
  for (let i = 0; i < hourly.length; i++) {
    if (hourly[i].time <= nowMs) idx = i;
    else break;
  }
  return idx;
}

/**
 * Normalise an Open-Meteo forecast response.
 * Output units: °C, km/h, mm, hPa, metres; all times epoch ms.
 */
export function parseForecast(json, location = {}) {
  if (!json || !json.current || !json.hourly || !json.daily) throw new Error('Malformed forecast response');
  const c = json.current;
  const h = json.hourly;
  const d = json.daily;

  const hourly = (h.time || []).map((t, i) => ({
    time: toMs(t),
    temp: val(h.temperature_2m?.[i]),
    feelsLike: val(h.apparent_temperature?.[i]),
    precipProb: val(h.precipitation_probability?.[i]),
    precip: val(h.precipitation?.[i]),
    code: h.weather_code?.[i] ?? null,
    isDay: h.is_day?.[i] !== 0,
    windSpeed: val(h.wind_speed_10m?.[i]),
    windDir: val(h.wind_direction_10m?.[i]),
    humidity: val(h.relative_humidity_2m?.[i]),
    uv: val(h.uv_index?.[i]),
  }));

  const daily = (d.time || []).map((t, i) => ({
    time: toMs(t),
    code: d.weather_code?.[i] ?? null,
    max: val(d.temperature_2m_max?.[i]),
    min: val(d.temperature_2m_min?.[i]),
    precipProb: val(d.precipitation_probability_max?.[i]),
    precipSum: val(d.precipitation_sum?.[i]),
    sunrise: toMs(d.sunrise?.[i]),
    sunset: toMs(d.sunset?.[i]),
    uvMax: val(d.uv_index_max?.[i]),
    windMax: val(d.wind_speed_10m_max?.[i]),
    windDir: val(d.wind_direction_10m_dominant?.[i]),
  }));

  const m = json.minutely_15;
  const minutely = m?.time
    ? m.time.map((t, i) => ({ time: toMs(t), precip: val(m.precipitation?.[i]) }))
    : [];

  const currentTime = toMs(c.time);
  const hourIdx = currentHourIndex(hourly, currentTime);

  return {
    location: {
      ...location,
      lat: location.lat ?? json.latitude,
      lon: location.lon ?? json.longitude,
      timezone: json.timezone || location.timezone || 'UTC',
    },
    timezone: json.timezone || 'UTC',
    utcOffsetSeconds: json.utc_offset_seconds ?? 0,
    current: {
      time: currentTime,
      temp: val(c.temperature_2m),
      feelsLike: val(c.apparent_temperature),
      code: c.weather_code ?? null,
      isDay: c.is_day !== 0,
      humidity: val(c.relative_humidity_2m),
      windSpeed: val(c.wind_speed_10m),
      windDir: val(c.wind_direction_10m),
      windGust: val(c.wind_gusts_10m),
      precip: val(c.precipitation),
      precipProb: hourly[hourIdx]?.precipProb ?? null,
      pressure: val(c.pressure_msl),
      cloudCover: val(c.cloud_cover),
      dewPoint: val(c.dew_point_2m),
      visibility: val(c.visibility),
      uv: val(c.uv_index),
    },
    hourly,
    daily,
    minutely,
  };
}

export function parseGeocoding(json) {
  return (json?.results || []).map((r) => ({
    id: locationId(r.latitude, r.longitude),
    name: r.name,
    admin: r.admin1 || '',
    country: r.country || '',
    countryCode: r.country_code || '',
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone || null,
    postcode: r.postcodes?.[0] || '',
  }));
}

export function parseAirQuality(json) {
  const c = json?.current;
  if (!c) return null;
  const sub = {};
  for (const p of AQ_POLLUTANTS) sub[p] = val(c[`us_aqi_${p}`]);
  const concentrations = {};
  for (const p of AQ_POLLUTANTS) concentrations[p] = val(c[p]);
  const pollen = {};
  for (const p of POLLEN) pollen[p.replace('_pollen', '')] = val(c[p]);
  return {
    time: toMs(c.time),
    usAqi: val(c.us_aqi),
    europeanAqi: val(c.european_aqi),
    subIndices: sub,
    concentrations,
    pollen,
  };
}

export function parseGrid(json) {
  const list = Array.isArray(json) ? json : [json];
  return list.map((r) => ({
    lat: r.latitude,
    lon: r.longitude,
    temp: val(r.current?.temperature_2m),
    windSpeed: val(r.current?.wind_speed_10m),
    windDir: val(r.current?.wind_direction_10m),
    cloudCover: val(r.current?.cloud_cover),
  }));
}

/** Parse "lat, lon" input. Returns null if the text is not a coordinate pair. */
export function parseCoordinates(text) {
  const m = String(text).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function locationId(lat, lon) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

export function createOpenMeteoProvider({ fetchImpl } = {}) {
  const get = (url, opts = {}) => getJson(url, { ...opts, fetchImpl: fetchImpl || globalThis.fetch.bind(globalThis) });
  const ep = CONFIG.endpoints;

  return {
    id: 'open-meteo',
    attribution: { name: 'Open-Meteo', url: 'https://open-meteo.com/' },

    async getForecast(location, { signal } = {}) {
      const json = await get(buildForecastUrl(location.lat, location.lon), { signal });
      return parseForecast(json, location);
    },

    async searchLocations(query, { signal, lang = 'en' } = {}) {
      const coords = parseCoordinates(query);
      if (coords) {
        return [{
          id: locationId(coords.lat, coords.lon),
          name: `${coords.lat.toFixed(3)}°, ${coords.lon.toFixed(3)}°`,
          admin: '', country: '', countryCode: '', isCoordinates: true,
          ...coords,
        }];
      }
      const json = await get(withQuery(ep.geocoding, { name: query.trim(), count: 8, language: lang, format: 'json' }), { signal });
      return parseGeocoding(json);
    },

    async reverseGeocode(lat, lon, { signal, lang = 'en' } = {}) {
      const json = await get(withQuery(ep.reverseGeocoding, { latitude: lat, longitude: lon, localityLanguage: lang }), { signal });
      return {
        name: json.city || json.locality || json.principalSubdivision || '',
        admin: json.principalSubdivision || '',
        country: json.countryName || '',
        countryCode: json.countryCode || '',
      };
    },

    async getAirQuality(location, { signal } = {}) {
      const json = await get(withQuery(ep.airQuality, {
        latitude: location.lat.toFixed(4),
        longitude: location.lon.toFixed(4),
        current: ['us_aqi', 'european_aqi', ...AQ_POLLUTANTS, ...AQ_POLLUTANTS.map((p) => `us_aqi_${p}`), ...POLLEN],
        timezone: 'auto',
        timeformat: 'unixtime',
      }), { signal });
      return parseAirQuality(json);
    },

    /** Current temp/wind/cloud for many points in one request (map overlays). */
    async getGrid(points, { signal } = {}) {
      const json = await get(withQuery(ep.forecast, {
        latitude: points.map((p) => p.lat.toFixed(3)),
        longitude: points.map((p) => p.lon.toFixed(3)),
        current: ['temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'cloud_cover'],
        timeformat: 'unixtime',
      }), { signal });
      return parseGrid(json);
    },
  };
}
