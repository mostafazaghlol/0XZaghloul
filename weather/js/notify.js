// Local notifications: severe-weather alerts, "rain starting soon", and an
// optional daily forecast. Delivered while the page is open; when installed
// as a PWA on browsers with Periodic Background Sync, sw.js also checks in the
// background using the state mirrored by syncStateToServiceWorker().

import { loadMeta, saveMeta } from './store.js';

export const notificationsSupported = () => 'Notification' in globalThis;
export const permission = () => (notificationsSupported() ? Notification.permission : 'denied');

export async function requestPermission() {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export async function show(title, body, { tag, url } = {}) {
  if (permission() !== 'granted') return false;
  const options = { body, tag, icon: 'icons/icon.svg', badge: 'icons/icon.svg', data: { url: url || location.href } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, options); return true; }
  } catch { /* fall through */ }
  try { new Notification(title, options); return true; } catch { return false; }
}

/**
 * Minutes until precipitation starts within the next hour, or null.
 * Only fires when it is currently dry.
 */
export function rainStartsIn(minutely, nowMs, threshold = 0.1) {
  if (!minutely?.length) return null;
  const upcoming = minutely.filter((m) => m.time + 15 * 60000 > nowMs && m.time <= nowMs + 60 * 60000);
  if (!upcoming.length) return null;
  const [first, ...rest] = upcoming;
  if ((first.precip ?? 0) >= threshold) return null; // already raining
  const hit = rest.find((m) => (m.precip ?? 0) >= threshold);
  if (!hit) return null;
  return Math.max(5, Math.round((hit.time - nowMs) / 60000));
}

/** Notify once per alert id. */
export async function notifyNewAlerts(placeName, alerts) {
  const seen = new Set(loadMeta('seenAlerts', []));
  for (const a of alerts) {
    if (!a.id || seen.has(a.id)) continue;
    seen.add(a.id);
    await show(`${a.event} — ${placeName}`, a.headline, { tag: `alert-${a.id}` });
  }
  saveMeta('seenAlerts', [...seen].slice(-200));
}

/** Notify at most once per location per hour about imminent rain. */
export async function notifyRainSoon(locId, title, body) {
  const log = loadMeta('rainNotified', {});
  if (Date.now() - (log[locId] || 0) < 60 * 60000) return;
  log[locId] = Date.now();
  saveMeta('rainNotified', log);
  await show(title, body, { tag: `rain-${locId}` });
}

/**
 * Fire `callback` once per day after `hhmm` local time while the page is open.
 * Returns a cancel function.
 */
export function scheduleDaily(getTime, callback) {
  const check = () => {
    const hhmm = getTime();
    if (!hhmm) return;
    const now = new Date();
    const today = now.toDateString();
    const [h, m] = hhmm.split(':').map(Number);
    const due = new Date(now);
    due.setHours(h, m, 0, 0);
    if (now >= due && loadMeta('dailyNotified') !== today) {
      saveMeta('dailyNotified', today);
      callback();
    }
  };
  check();
  const id = setInterval(check, 60000);
  return () => clearInterval(id);
}

/** Mirror the bits the service worker needs into Cache Storage. */
export async function syncStateToServiceWorker(state) {
  try {
    const cache = await caches.open('wx-state');
    await cache.put('state.json', new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
    const reg = await navigator.serviceWorker?.ready;
    if (reg && 'periodicSync' in reg && (state.notifySevere || state.notifyRainSoon || state.notifyDaily)) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null);
      if (status?.state === 'granted') await reg.periodicSync.register('wx-refresh', { minInterval: 30 * 60000 });
    }
  } catch { /* unsupported: foreground-only notifications */ }
}
