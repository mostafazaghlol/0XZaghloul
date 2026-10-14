import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { moonPhase, daylightProgress } from '../../js/astro.js';
import { aqiCategory, mainPollutant, pollenLevel } from '../../js/aqi.js';
import { describeCode } from '../../js/weather-codes.js';
import { formatTime, formatHour, dayKey } from '../../js/format.js';
import { t, setLanguage, uvLevel } from '../../js/i18n.js';
import { rainStartsIn } from '../../js/notify.js';

// Minimal localStorage for store.js
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const store = await import('../../js/store.js');

test('moon phase at known dates', () => {
  const newMoon = moonPhase(Date.UTC(2024, 3, 8, 18, 21)); // total solar eclipse
  assert.equal(newMoon.key, 'newMoon');
  assert.ok(newMoon.illumination < 0.02);
  const full = moonPhase(Date.UTC(2024, 3, 23, 23, 49));
  assert.equal(full.key, 'fullMoon');
  assert.ok(full.illumination > 0.98);
  assert.equal(moonPhase(Date.UTC(2024, 3, 15, 19, 13)).key, 'firstQuarter');
});

test('daylight progress', () => {
  assert.equal(daylightProgress(5, 10, 20), 0);
  assert.equal(daylightProgress(15, 10, 20), 0.5);
  assert.equal(daylightProgress(25, 10, 20), 1);
  assert.equal(daylightProgress(15, null, 20), null);
});

test('AQI categories and main pollutant', () => {
  assert.equal(aqiCategory(12).key, 'good');
  assert.equal(aqiCategory(50).key, 'good');
  assert.equal(aqiCategory(51).key, 'moderate');
  assert.equal(aqiCategory(175).key, 'unhealthy');
  assert.equal(aqiCategory(420).key, 'hazardous');
  assert.equal(aqiCategory(null), null);
  assert.deepEqual(mainPollutant({ pm2_5: 87, ozone: 40, no2: null }), { name: 'pm2_5', value: 87 });
  assert.equal(mainPollutant({}), null);
  assert.equal(pollenLevel(0), 'none');
  assert.equal(pollenLevel(95), 'high');
  assert.equal(pollenLevel(null), null);
});

test('weather codes map to groups and icons', () => {
  assert.deepEqual(describeCode(0), { key: 'clear', group: 'clear', icon: 'clear' });
  assert.equal(describeCode(2).icon, 'partly');
  assert.equal(describeCode(53).icon, 'drizzle');
  assert.equal(describeCode(65).group, 'rain');
  assert.equal(describeCode(75).group, 'snow');
  assert.equal(describeCode(99).group, 'storm');
  assert.equal(describeCode(1234).key, 'unknown');
});

test('time formatting honours 12/24h and timezone', () => {
  const ms = Date.UTC(2026, 9, 14, 13, 5);
  assert.equal(formatTime(ms, { timeFormat: '24', timeZone: 'UTC' }), '13:05');
  assert.match(formatTime(ms, { timeFormat: '12', timeZone: 'UTC' }), /^1:05\sPM$/);
  assert.equal(formatTime(ms, { timeFormat: '24', timeZone: 'Asia/Tokyo' }), '22:05');
  assert.equal(formatHour(ms, { timeFormat: '24', timeZone: 'UTC' }), '13:05');
  assert.match(formatHour(ms, { timeFormat: '12', timeZone: 'UTC' }), /^1\sPM$/);
  assert.equal(dayKey(Date.UTC(2026, 9, 14, 23, 0), 'Africa/Cairo'), '2026-10-15');
  assert.equal(formatTime(ms, { timeFormat: '24', timeZone: 'Not/AZone' }), '13:05', 'falls back to UTC');
});

test('i18n lookup, interpolation and fallback', () => {
  setLanguage('es');
  assert.equal(t('feelsLike', { t: '20°' }), 'Sensación 20°');
  assert.equal(t('cond.rain'), 'Lluvia');
  setLanguage('ar');
  assert.equal(t('today'), 'اليوم');
  assert.equal(t('pollutant.pm2_5'), 'PM2.5', 'falls back to English');
  assert.equal(t('missing.key'), 'missing.key');
  setLanguage('xx');
  assert.equal(t('today'), 'Today');
  assert.equal(uvLevel(2), 'low');
  assert.equal(uvLevel(11), 'extreme');
});

test('rainStartsIn detects rain within the next hour only when currently dry', () => {
  const now = Date.UTC(2026, 0, 1, 12, 5);
  const q = (i, precip) => ({ time: Date.UTC(2026, 0, 1, 12, 0) + i * 900000, precip });
  assert.equal(rainStartsIn([q(0, 0), q(1, 0), q(2, 0.5), q(3, 1)], now), 25);
  assert.equal(rainStartsIn([q(0, 0.4), q(1, 0.5)], now), null, 'already raining');
  assert.equal(rainStartsIn([q(0, 0), q(1, 0), q(2, 0), q(3, 0), q(4, 0)], now), null);
  assert.equal(rainStartsIn([q(0, 0), q(6, 1)], now), null, 'beyond one hour');
  assert.equal(rainStartsIn([], now), null);
});

beforeEach(() => mem.clear());

test('store: settings, favourites and cache freshness', () => {
  const s = store.loadSettings();
  assert.ok(['c', 'f'].includes(s.tempUnit));
  store.saveSettings({ ...s, tempUnit: 'f' });
  assert.equal(store.loadSettings().tempUnit, 'f');

  store.saveFavorites([{ id: 'a', name: 'A', lat: 1, lon: 2 }, { bogus: true }]);
  assert.deepEqual(store.loadFavorites().map((f) => f.id), ['a']);

  const now = 1_000_000_000;
  store.setCached('a', { forecast: { x: 1 } }, now);
  const entry = store.getCached('a');
  assert.deepEqual(entry.data, { forecast: { x: 1 } });
  assert.equal(store.isFresh(entry, now + 5 * 60000), true);
  assert.equal(store.isFresh(entry, now + 11 * 60000), false);
  assert.equal(store.isStale(entry, now + 30 * 60000), false);
  assert.equal(store.isStale(entry, now + 61 * 60000), true);
  assert.equal(store.getCached('missing'), null);
});

test('store: pruneCaches keeps newest entries and protected ids', () => {
  for (let i = 0; i < 5; i++) store.setCached(`id${i}`, { i }, 1000 + i);
  store.pruneCaches(2, ['id0']);
  assert.ok(store.getCached('id4'));
  assert.ok(store.getCached('id3'));
  assert.ok(store.getCached('id0'), 'protected');
  assert.equal(store.getCached('id1'), null);
});

test('store: corrupt JSON falls back to defaults', () => {
  localStorage.setItem('wx.favorites', '{not json');
  assert.deepEqual(store.loadFavorites(), []);
});

test('store: malformed browser locales do not crash defaults', () => {
  assert.doesNotThrow(() => store.defaultSettings('en-US@posix'));
  assert.equal(store.defaultSettings('en-US@posix').tempUnit, 'f');
  assert.equal(store.defaultSettings('ar_EG.UTF-8').lang, 'ar');
  assert.equal(store.defaultSettings('!!').lang, 'en');
});
