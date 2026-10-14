// Persistence: settings, favourite locations and the last-fetched data per
// location (offline cache). Uses localStorage with an in-memory fallback for
// private mode / blocked storage.

import { CONFIG } from './config.js';
import { defaultUnitsForLocale } from './units.js';

const PREFIX = 'wx.';
const memory = new Map();

function storage() {
  try {
    const s = globalThis.localStorage;
    const probe = `${PREFIX}probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function read(key, fallback) {
  try {
    const s = storage();
    const raw = s ? s.getItem(PREFIX + key) : memory.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  const raw = JSON.stringify(value);
  try {
    const s = storage();
    if (s) s.setItem(PREFIX + key, raw);
    else memory.set(key, raw);
  } catch {
    // Quota exceeded: drop old caches and retry once.
    pruneCaches(0);
    try { storage()?.setItem(PREFIX + key, raw); } catch { memory.set(key, raw); }
  }
}

function remove(key) {
  try { storage()?.removeItem(PREFIX + key); } catch { /* ignore */ }
  memory.delete(key);
}

export function defaultSettings(locale = globalThis.navigator?.language || 'en-US') {
  const lang = locale.split('-')[0];
  const uses12h = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 !== false;
  return {
    ...defaultUnitsForLocale(locale),
    timeFormat: uses12h ? '12' : '24',
    theme: 'system',
    lang: ['en', 'ar', 'es'].includes(lang) ? lang : 'en',
    notifySevere: false,
    notifyRainSoon: false,
    notifyDaily: false,
    dailyTime: '07:30',
  };
}

export function loadSettings() {
  return { ...defaultSettings(), ...read('settings', {}) };
}

export function saveSettings(settings) {
  write('settings', settings);
}

export function loadFavorites() {
  const list = read('favorites', []);
  return Array.isArray(list) ? list.filter((l) => l && typeof l.lat === 'number' && typeof l.lon === 'number') : [];
}

export function saveFavorites(list) {
  write('favorites', list.slice(0, CONFIG.maxFavorites));
}

export function loadMeta(key, fallback = null) {
  return read(`meta.${key}`, fallback);
}

export function saveMeta(key, value) {
  write(`meta.${key}`, value);
}

/** @returns {{data: object, savedAt: number} | null} */
export function getCached(id) {
  const entry = read(`cache.${id}`, null);
  return entry && entry.data && typeof entry.savedAt === 'number' ? entry : null;
}

export function setCached(id, data, now = Date.now()) {
  const index = read('cacheIndex', {});
  index[id] = now;
  write(`cache.${id}`, { data, savedAt: now });
  write('cacheIndex', index);
}

/** Remove cached entries beyond the newest `keep`. */
export function pruneCaches(keep = 15, protectedIds = []) {
  const index = read('cacheIndex', {});
  const ids = Object.keys(index).sort((a, b) => index[b] - index[a]);
  ids.slice(keep).forEach((id) => {
    if (protectedIds.includes(id)) return;
    remove(`cache.${id}`);
    delete index[id];
  });
  try { storage()?.setItem(`${PREFIX}cacheIndex`, JSON.stringify(index)); } catch { /* ignore */ }
}

export function cacheAge(entry, now = Date.now()) {
  return entry ? now - entry.savedAt : Infinity;
}

export const isFresh = (entry, now = Date.now()) => cacheAge(entry, now) < CONFIG.cacheFreshMs;
export const isStale = (entry, now = Date.now()) => cacheAge(entry, now) > CONFIG.staleAfterMs;
