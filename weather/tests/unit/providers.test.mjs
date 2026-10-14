import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseForecast, parseGeocoding, parseAirQuality, parseGrid, parseCoordinates, buildForecastUrl,
  currentHourIndex, locationId, createOpenMeteoProvider,
} from '../../js/providers/open-meteo.js';
import { parseNwsAlerts, isCovered, createNwsAlertsProvider } from '../../js/providers/nws-alerts.js';
import { ApiError } from '../../js/providers/http.js';
import { forecastJson, geocodingJson, airQualityJson, nwsAlertsJson } from '../fixtures.mjs';

const NOW = Date.UTC(2026, 9, 14, 9, 20); // 12:20 in Cairo (UTC+3)

test('parseForecast normalises current conditions', () => {
  const f = parseForecast(forecastJson({ now: NOW }), { id: 'x', name: 'Cairo' });
  assert.equal(f.timezone, 'Africa/Cairo');
  assert.equal(f.location.name, 'Cairo');
  assert.equal(f.location.timezone, 'Africa/Cairo');
  assert.equal(f.current.temp, 24);
  assert.equal(f.current.feelsLike, 25);
  assert.equal(f.current.code, 2);
  assert.equal(f.current.isDay, true);
  assert.equal(f.current.humidity, 55);
  assert.equal(f.current.windSpeed, 14.4);
  assert.equal(f.current.windDir, 315);
  assert.equal(f.current.pressure, 1013.2);
  assert.equal(f.current.visibility, 24140);
  assert.equal(f.current.time % 1000, 0, 'times are epoch ms');
  assert.ok(Math.abs(f.current.time - NOW) < 15 * 60000);
});

test('parseForecast builds hourly, daily and minutely series', () => {
  const f = parseForecast(forecastJson({ now: NOW }));
  assert.equal(f.hourly.length, 240);
  assert.equal(f.daily.length, 10);
  assert.equal(f.minutely.length, 8);
  assert.equal(f.hourly[1].time - f.hourly[0].time, 3600000);
  assert.equal(f.daily[0].sunset - f.daily[0].sunrise, 12 * 3600000);
  assert.equal(f.daily[0].precipProb, 60);
  assert.equal(f.hourly[0].isDay, false);
  // Current precip probability comes from the current hour.
  const idx = currentHourIndex(f.hourly, f.current.time);
  assert.equal(f.current.precipProb, f.hourly[idx].precipProb);
});

test('parseForecast tolerates missing values and rejects malformed data', () => {
  const json = forecastJson({ now: NOW });
  json.current.uv_index = null;
  delete json.minutely_15;
  const f = parseForecast(json);
  assert.equal(f.current.uv, null);
  assert.deepEqual(f.minutely, []);
  assert.throws(() => parseForecast({}), /Malformed/);
});

test('currentHourIndex picks the slot containing now', () => {
  const hourly = [0, 1, 2, 3].map((h) => ({ time: h * 3600000 }));
  assert.equal(currentHourIndex(hourly, 0), 0);
  assert.equal(currentHourIndex(hourly, 3600000 * 1.5), 1);
  assert.equal(currentHourIndex(hourly, 3600000 * 10), 3);
});

test('parseGeocoding maps results', () => {
  const r = parseGeocoding(geocodingJson);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], {
    id: '30.063,31.250', name: 'Cairo', admin: 'Cairo Governorate', country: 'Egypt', countryCode: 'EG',
    lat: 30.06263, lon: 31.24967, timezone: 'Africa/Cairo', postcode: '',
  });
  assert.equal(r[1].postcode, '62914');
  assert.deepEqual(parseGeocoding({}), []);
});

test('parseAirQuality extracts AQI, sub-indices and pollen', () => {
  const aq = parseAirQuality(airQualityJson);
  assert.equal(aq.usAqi, 87);
  assert.equal(aq.subIndices.pm2_5, 87);
  assert.equal(aq.pollen.grass, 12.5);
  assert.equal(aq.pollen.birch, null);
  assert.equal(parseAirQuality({}), null);
});

test('parseGrid handles single and multiple locations', () => {
  const one = parseGrid({ latitude: 1, longitude: 2, current: { temperature_2m: 5, wind_speed_10m: 3, wind_direction_10m: 90, cloud_cover: 50 } });
  assert.equal(one.length, 1);
  assert.equal(one[0].cloudCover, 50);
  assert.equal(parseGrid([{ latitude: 1, longitude: 2, current: {} }, { latitude: 3, longitude: 4, current: {} }]).length, 2);
});

test('parseCoordinates', () => {
  assert.deepEqual(parseCoordinates('30.04, 31.24'), { lat: 30.04, lon: 31.24 });
  assert.deepEqual(parseCoordinates('-33.9 151.2'), { lat: -33.9, lon: 151.2 });
  assert.equal(parseCoordinates('Cairo'), null);
  assert.equal(parseCoordinates('95, 10'), null);
  assert.equal(parseCoordinates('10001'), null, 'postal codes are not coordinates');
});

test('buildForecastUrl requests metric units, local timezone and unix times', () => {
  const url = new URL(buildForecastUrl(30.0444, 31.2357));
  assert.equal(url.searchParams.get('latitude'), '30.0444');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
  assert.match(url.searchParams.get('current'), /apparent_temperature/);
  assert.match(url.searchParams.get('daily'), /sunrise/);
});

test('locationId is stable', () => {
  assert.equal(locationId(30.04441, 31.23571), '30.044,31.236');
});

test('provider searchLocations: coordinates skip the network, names hit geocoding', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(geocodingJson), { status: 200 });
  };
  const p = createOpenMeteoProvider({ fetchImpl });
  const coords = await p.searchLocations('40.71, -74.0');
  assert.equal(coords[0].isCoordinates, true);
  assert.equal(calls.length, 0);
  const names = await p.searchLocations('Cairo', { lang: 'ar' });
  assert.equal(names[0].name, 'Cairo');
  assert.match(calls[0], /name=Cairo/);
  assert.match(calls[0], /language=ar/);
});

test('provider surfaces HTTP and API errors as ApiError', async () => {
  const p = createOpenMeteoProvider({
    fetchImpl: async () => new Response(JSON.stringify({ error: true, reason: 'Latitude must be in range' }), { status: 400 }),
  });
  await assert.rejects(p.getForecast({ lat: 1, lon: 1 }), (err) => err instanceof ApiError && err.kind === 'http' && /Latitude/.test(err.message));
  const p2 = createOpenMeteoProvider({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(p2.getForecast({ lat: 1, lon: 1 }), (err) => err.kind === 'network');
});

test('NWS alerts: parse, drop expired, sort by severity', () => {
  const alerts = parseNwsAlerts(nwsAlertsJson(NOW), NOW);
  assert.deepEqual(alerts.map((a) => a.event), ['Tornado Warning', 'Flood Watch']);
  assert.equal(alerts[1].instruction, 'Avoid low-lying areas.');
});

test('NWS coverage check', () => {
  assert.equal(isCovered({ lat: 41.9, lon: -87.6 }), true);
  assert.equal(isCovered({ lat: 30.0, lon: 31.2 }), false);
  assert.equal(isCovered({ lat: 30.0, lon: 31.2, countryCode: 'US' }), true);
  assert.equal(isCovered({ lat: 45.5, lon: -73.6, countryCode: 'CA' }), false);
});

test('NWS provider does not call the network outside coverage', async () => {
  let called = false;
  const p = createNwsAlertsProvider({ fetchImpl: async () => { called = true; return new Response('{}'); } });
  assert.deepEqual(await p.getAlerts({ lat: 30, lon: 31, countryCode: 'EG' }), []);
  assert.equal(called, false);
});
