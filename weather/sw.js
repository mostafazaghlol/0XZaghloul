/* Service worker: offline app shell + background notification checks. */

const VERSION = 'wx-v1';
const SHELL = [
  './',
  './index.html',
  './widget.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/app.js',
  './js/widget.js',
  './js/config.js',
  './js/units.js',
  './js/format.js',
  './js/i18n.js',
  './js/store.js',
  './js/astro.js',
  './js/aqi.js',
  './js/notify.js',
  './js/share.js',
  './js/weather-codes.js',
  './js/providers/index.js',
  './js/providers/http.js',
  './js/providers/open-meteo.js',
  './js/providers/nws-alerts.js',
  './js/ui/icons.js',
  './js/ui/charts.js',
  './js/ui/map.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('wx-v') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Same-origin assets: stale-while-revalidate. API calls go straight to the
// network; the page keeps its own data cache for offline use.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('Offline', { status: 503 });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => c.url.startsWith(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});

// ---- Background checks (Periodic Background Sync, installed PWA only) ----

async function readJson(cacheName, key, fallback) {
  try {
    const res = await (await caches.open(cacheName)).match(key);
    return res ? await res.json() : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(cacheName, key, value) {
  const cache = await caches.open(cacheName);
  await cache.put(key, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
}

async function checkLocation(loc, st, seen) {
  if (st.notifySevere && (!loc.countryCode || loc.countryCode === 'US')) {
    try {
      const res = await fetch(`${st.endpoints.nwsAlerts}?point=${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`);
      if (res.ok) {
        const json = await res.json();
        for (const f of json.features || []) {
          const p = f.properties || {};
          if (!p.id || seen.alerts.includes(p.id)) continue;
          seen.alerts.push(p.id);
          await self.registration.showNotification(`${p.event} — ${loc.name}`, { body: p.headline || '', tag: `alert-${p.id}`, icon: 'icons/icon.svg' });
        }
      }
    } catch { /* ignore */ }
  }
  if (st.notifyRainSoon || st.notifyDaily) {
    try {
      const url = `${st.endpoints.forecast}?latitude=${loc.lat}&longitude=${loc.lon}&minutely_15=precipitation&forecast_minutely_15=5&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto&timeformat=unixtime`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const now = Date.now();
      const m = json.minutely_15 || {};
      const times = (m.time || []).map((t) => t * 1000);
      const precip = m.precipitation || [];
      const idx = times.findIndex((t) => t + 15 * 60000 > now);
      if (st.notifyRainSoon && idx >= 0 && (precip[idx] || 0) < 0.1) {
        const hit = times.findIndex((t, i) => i > idx && t <= now + 3600000 && (precip[i] || 0) >= 0.1);
        if (hit > 0 && now - (seen.rain[loc.id] || 0) > 3600000) {
          seen.rain[loc.id] = now;
          const mins = Math.max(5, Math.round((times[hit] - now) / 60000));
          await self.registration.showNotification(`${st.strings.rainSoonTitle} — ${loc.name}`, { body: `~${mins} min`, tag: `rain-${loc.id}`, icon: 'icons/icon.svg' });
        }
      }
      return json.daily;
    } catch { /* ignore */ }
  }
  return null;
}

async function backgroundCheck() {
  const st = await readJson('wx-state', 'state.json', null);
  if (!st || !st.locations?.length) return;
  const seen = await readJson('wx-state', 'seen.json', { alerts: [], rain: {}, daily: '' });
  for (const [i, loc] of st.locations.entries()) {
    const daily = await checkLocation(loc, st, seen);
    const today = new Date().toDateString();
    if (i === 0 && st.notifyDaily && daily && seen.daily !== today) {
      const [h, mm] = (st.dailyTime || '07:30').split(':').map(Number);
      const due = new Date();
      due.setHours(h, mm, 0, 0);
      if (Date.now() >= due.getTime()) {
        seen.daily = today;
        const conv = (c) => Math.round(st.tempUnit === 'f' ? (c * 9) / 5 + 32 : c);
        await self.registration.showNotification(st.strings.dailyTitle.replace('{place}', loc.name), {
          body: `↑ ${conv(daily.temperature_2m_max[0])}°  ↓ ${conv(daily.temperature_2m_min[0])}°  ☂ ${daily.precipitation_probability_max[0] ?? 0}%`,
          tag: 'daily',
          icon: 'icons/icon.svg',
        });
      }
    }
  }
  seen.alerts = seen.alerts.slice(-200);
  await writeJson('wx-state', 'seen.json', seen);
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'wx-refresh') event.waitUntil(backgroundCheck());
});
