// Small / medium / large embeddable widget (widget.html). Shares the provider,
// cache and settings with the main app.

import { CONFIG } from './config.js';
import { getProvider } from './providers/index.js';
import { currentHourIndex, locationId } from './providers/open-meteo.js';
import * as store from './store.js';
import { t, setLanguage } from './i18n.js';
import { formatTemp } from './units.js';
import { formatHour, formatWeekday } from './format.js';
import { describeCode } from './weather-codes.js';
import { iconSvg } from './ui/icons.js';

const GRADIENTS = {
  clear: [['#1b4f9c', '#3a7bd5'], ['#0b1026', '#24305e']],
  cloudy: [['#3d5170', '#6b7f99'], ['#151b27', '#323c4e']],
  fog: [['#56616e', '#7d8894'], ['#1f242b', '#3b434d']],
  rain: [['#29405f', '#4a6283'], ['#0e1520', '#273447']],
  snow: [['#4f6d8f', '#7f9bb8'], ['#1a2333', '#3a4a63']],
  storm: [['#262c3d', '#4a4f66'], ['#0c0d14', '#272a3b']],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function main() {
  const root = document.getElementById('root');
  const params = new URLSearchParams(location.search);
  const size = ['small', 'medium', 'large'].includes(params.get('size')) ? params.get('size') : 'medium';
  root.className = `w ${size}`;
  const settings = store.loadSettings();
  setLanguage(settings.lang);
  document.documentElement.lang = settings.lang;

  let loc;
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (params.has('lat') && Number.isFinite(lat) && Number.isFinite(lon)) {
    loc = { id: locationId(lat, lon), name: params.get('name') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon };
    root.href = `./?lat=${lat}&lon=${lon}&name=${encodeURIComponent(loc.name)}`;
  } else {
    loc = store.loadFavorites()[0] || store.loadMeta('gps');
  }
  if (!loc) {
    root.innerHTML = `<div class="msg">${esc(t('noSaved'))}</div>`;
    return;
  }

  let entry = store.getCached(loc.id);
  if (!entry || Date.now() - entry.savedAt > CONFIG.cacheFreshMs) {
    try {
      const forecast = await getProvider().getForecast(loc);
      entry = { data: { forecast, aqi: null, alerts: [] }, savedAt: Date.now() };
      store.setCached(loc.id, entry.data, entry.savedAt);
    } catch {
      if (!entry) { root.innerHTML = `<div class="msg">${esc(t('errorGeneric'))}</div>`; return; }
    }
  }

  const f = entry.data.forecast;
  const tz = f.timezone;
  const temp = (c) => formatTemp(c, settings.tempUnit, settings.lang);
  const cur = f.current;
  const d = describeCode(cur.code);
  const [a, b] = GRADIENTS[d.group][cur.isDay ? 0 : 1];
  root.style.setProperty('--a', a);
  root.style.setProperty('--b', b);
  const today = f.daily[0];
  const idx = currentHourIndex(f.hourly, Date.now());

  let html = `
    <div class="row"><span class="name">${esc(loc.name)}</span>${iconSvg(d.icon, cur.isDay, 32)}</div>
    <div class="row"><span class="temp">${esc(temp(cur.temp))}</span>
      <span class="muted">${esc(t(`cond.${d.key}`))}<br>${esc(t('highLow', { h: temp(today.max), l: temp(today.min) }))}</span></div>`;
  if (size !== 'small') {
    html += `<div class="hours">${f.hourly.slice(idx + 1, idx + 7).map((h) => `<div>
      <span class="muted">${esc(formatHour(h.time, { lang: settings.lang, timeFormat: settings.timeFormat, timeZone: tz }))}</span>
      ${iconSvg(describeCode(h.code).icon, h.isDay, 22)}<span>${esc(temp(h.temp))}</span></div>`).join('')}</div>`;
  }
  if (size === 'large') {
    html += `<div class="days">${f.daily.slice(1, 6).map((x) => `<div>
      <span>${esc(formatWeekday(x.time, { lang: settings.lang, timeZone: tz }))}</span>${iconSvg(describeCode(x.code).icon, true, 22)}
      <span class="muted">${esc(temp(x.min))}</span><span>${esc(temp(x.max))}</span></div>`).join('')}</div>`;
  }
  root.innerHTML = html;
  root.setAttribute('aria-label', `${loc.name}: ${temp(cur.temp)}, ${t(`cond.${d.key}`)}`);
}

main();
