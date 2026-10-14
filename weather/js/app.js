import { CONFIG } from './config.js';
import { getProvider } from './providers/index.js';
import { currentHourIndex, locationId } from './providers/open-meteo.js';
import * as store from './store.js';
import { t, setLanguage, translateDom, LANGUAGES, uvLevel, getLanguage } from './i18n.js';
import {
  formatTemp, formatWind, formatPrecip, formatPressure, formatDistance, formatPercent, compassPoint,
} from './units.js';
import { formatTime, formatHour, formatWeekday, formatDate, formatRelative, dayKey } from './format.js';
import { describeCode } from './weather-codes.js';
import { moonPhase, daylightProgress } from './astro.js';
import { aqiCategory, aqiScalePosition, mainPollutant, pollenLevel } from './aqi.js';
import { iconSvg, glyph } from './ui/icons.js';
import { tempPrecipChart } from './ui/charts.js';
import * as notify from './notify.js';
import { shareWeather } from './share.js';

// ---------------------------------------------------------------------------
// Helpers

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
};

const GRADIENTS = {
  'clear-day': ['#1b4f9c', '#3a7bd5'], 'clear-night': ['#0b1026', '#24305e'],
  'cloudy-day': ['#3d5170', '#6b7f99'], 'cloudy-night': ['#151b27', '#323c4e'],
  'fog-day': ['#56616e', '#7d8894'], 'fog-night': ['#1f242b', '#3b434d'],
  'rain-day': ['#29405f', '#4a6283'], 'rain-night': ['#0e1520', '#273447'],
  'snow-day': ['#4f6d8f', '#7f9bb8'], 'snow-night': ['#1a2333', '#3a4a63'],
  'storm-day': ['#262c3d', '#4a4f66'], 'storm-night': ['#0c0d14', '#272a3b'],
};

// ---------------------------------------------------------------------------
// State

const provider = getProvider();

const state = {
  settings: store.loadSettings(),
  favorites: store.loadFavorites(),
  gps: store.loadMeta('gps'),
  preview: store.loadMeta('preview'),
  activeId: store.loadMeta('active'),
  data: new Map(),
  inflight: new Map(),
  lastError: null,
  chartMode: 'temp',
  map: null,
  mapLoading: null,
  bgKey: null,
  searchAbort: null,
  searchResults: [],
  searchActive: -1,
};

const lang = () => getLanguage();
const fmt = {
  temp: (c) => formatTemp(c, state.settings.tempUnit, lang()),
  wind: (k) => formatWind(k, state.settings.windUnit, lang()),
  precip: (mm) => formatPrecip(mm, state.settings.precipUnit, lang()),
  pressure: (h) => formatPressure(h, state.settings.pressureUnit, lang()),
  distance: (m) => formatDistance(m, state.settings.precipUnit === 'in', lang()),
  pct: (p) => formatPercent(p, lang()),
  time: (ms, tz) => formatTime(ms, { lang: lang(), timeFormat: state.settings.timeFormat, timeZone: tz }),
  hour: (ms, tz) => formatHour(ms, { lang: lang(), timeFormat: state.settings.timeFormat, timeZone: tz }),
  weekday: (ms, tz) => formatWeekday(ms, { lang: lang(), timeZone: tz }),
  date: (ms, tz) => formatDate(ms, { lang: lang(), timeZone: tz }),
  rel: (ms) => formatRelative(ms, { lang: lang() }),
};

const isFav = (id) => state.favorites.some((f) => f.id === id);

function pages() {
  const list = [];
  if (state.gps) list.push(state.gps);
  list.push(...state.favorites);
  if (state.preview && !list.some((l) => l.id === state.preview.id)) list.push(state.preview);
  return list;
}

function activePage() {
  const list = pages();
  return list.find((l) => l.id === state.activeId) || list[0] || null;
}

function setActive(id) {
  state.activeId = id;
  store.saveMeta('active', id);
}

function hydrate(id) {
  if (state.data.has(id)) return state.data.get(id);
  const cached = store.getCached(id);
  if (!cached) return null;
  const entry = { ...cached.data, savedAt: cached.savedAt };
  state.data.set(id, entry);
  return entry;
}

function placeLabel(loc) {
  return loc.isGps ? (loc.name || t('myLocation')) : loc.name;
}

function placeSub(loc) {
  const parts = [loc.admin, loc.country].filter(Boolean);
  if (loc.isGps) parts.unshift(t('myLocation'));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Data loading (cache-first, rate-limited)

async function loadLocation(loc, { force = false } = {}) {
  const entry = hydrate(loc.id);
  const age = entry ? Date.now() - entry.savedAt : Infinity;
  if (entry && (age < CONFIG.minManualRefreshMs || (!force && age < CONFIG.cacheFreshMs))) {
    return { entry, fetched: false };
  }
  if (state.inflight.has(loc.id)) return state.inflight.get(loc.id);

  const job = (async () => {
    const [forecast, aqi, alerts] = await Promise.all([
      provider.getForecast(loc),
      provider.getAirQuality(loc).catch(() => null),
      provider.getAlerts(loc).catch(() => []),
    ]);
    const fresh = { forecast, aqi, alerts, savedAt: Date.now() };
    state.data.set(loc.id, fresh);
    store.setCached(loc.id, { forecast, aqi, alerts }, fresh.savedAt);
    store.pruneCaches(CONFIG.maxFavorites + 2, pages().map((p) => p.id));
    if (forecast.timezone && loc.timezone !== forecast.timezone) {
      loc.timezone = forecast.timezone;
      persistLocations();
    }
    return { entry: fresh, fetched: true };
  })();

  state.inflight.set(loc.id, job);
  try {
    return await job;
  } finally {
    state.inflight.delete(loc.id);
  }
}

async function showActive({ force = false, userInitiated = false } = {}) {
  const loc = activePage();
  if (!loc) {
    showState('empty');
    return;
  }
  const cached = hydrate(loc.id);
  if (cached) render(loc, cached);
  else showState('loading');

  try {
    const { entry, fetched } = await loadLocation(loc, { force });
    if (activePage()?.id !== loc.id) return;
    state.lastError = null;
    render(loc, entry);
    if (userInitiated && !fetched) toast(t('upToDate'));
    if (fetched) afterFetch(loc, entry);
  } catch (err) {
    if (activePage()?.id !== loc.id) return;
    console.warn('Weather load failed', err);
    state.lastError = err;
    if (cached) render(loc, cached);
    else showError(err);
  }
}

function persistLocations() {
  store.saveFavorites(state.favorites);
  store.saveMeta('preview', state.preview);
  if (state.gps) store.saveMeta('gps', state.gps);
  syncServiceWorker();
}

// ---------------------------------------------------------------------------
// Rendering

function showState(name) {
  $('#state-loading').hidden = name !== 'loading';
  $('#state-empty').hidden = name !== 'empty';
  $('#state-error').hidden = name !== 'error';
  $('#weather').hidden = name !== 'weather';
  if (name !== 'weather') {
    $('#alerts').innerHTML = '';
    $('#rain-banner').hidden = true;
    $('#status-banner').hidden = true;
  }
}

function showError(err) {
  $('#error-message').textContent = err?.kind === 'offline' || navigator.onLine === false ? t('errorOffline') : t('errorGeneric');
  showState('error');
}

function showEmpty(message) {
  $('#empty-message').textContent = message || t('welcomeBody');
  showState('empty');
}

function render(loc, entry) {
  const f = entry.forecast;
  const tz = f.timezone;
  const now = Date.now();
  const cur = f.current;
  const desc = describeCode(cur.code);
  const hourIdx = currentHourIndex(f.hourly, now);
  const todayKey = dayKey(now, tz);
  const today = f.daily.find((d) => dayKey(d.time, tz) === todayKey) || f.daily[0];

  showState('weather');
  setBackground(desc.group, cur.isDay);

  // Hero
  $('#place-name').textContent = placeLabel(loc);
  $('#place-sub').textContent = [placeSub(loc), t('localTime', { t: fmt.time(now, tz) })].filter(Boolean).join(' · ');
  $('#hero-icon').innerHTML = iconSvg(desc.icon, cur.isDay, 96);
  $('#hero-temp').textContent = fmt.temp(cur.temp);
  $('#hero-temp').setAttribute('aria-label', `${fmt.temp(cur.temp)}${state.settings.tempUnit.toUpperCase()}`);
  $('#hero-cond').textContent = t(`cond.${desc.key}`);
  $('#hero-feels').textContent = t('feelsLike', { t: fmt.temp(cur.feelsLike) });
  $('#hero-hilo').textContent = t('highLow', { h: fmt.temp(today?.max), l: fmt.temp(today?.min) });

  const precipProb = f.hourly[hourIdx]?.precipProb ?? cur.precipProb;
  $('#quick-stats').innerHTML = [
    ['drop', t('humidity'), fmt.pct(cur.humidity)],
    ['wind', t('wind'), `${fmt.wind(cur.windSpeed)} ${compassPoint(cur.windDir)}`, cur.windDir],
    ['umbrella', t('precipChance'), fmt.pct(precipProb)],
  ].map(([g, label, value, dir]) => `
    <li><span class="qs-icon">${glyph(g, 18)}</span>
      <span class="qs-label">${esc(label)}</span>
      <span class="qs-value">${dir != null ? `<span class="wind-arrow" style="transform:rotate(${(dir + 180) % 360}deg)" aria-hidden="true">${glyph('arrow', 14)}</span>` : ''}<bdi dir="ltr">${esc(value)}</bdi></span>
    </li>`).join('');

  const fav = isFav(loc.id);
  const favBtn = $('#btn-fav');
  favBtn.hidden = !!loc.isGps;
  favBtn.setAttribute('aria-pressed', String(fav));
  favBtn.setAttribute('aria-label', fav ? t('removeFavorite') : t('addFavorite'));
  favBtn.title = favBtn.getAttribute('aria-label');

  renderPager(loc);
  renderStatus(entry);
  renderAlerts(entry.alerts || [], tz);
  renderRainBanner(f.minutely, now);
  renderHourly(f, hourIdx);
  renderDaily(f);
  renderChart(f, hourIdx);
  renderDetails(cur, today);
  renderSunMoon(today, now, tz);
  renderAirQuality(entry.aqi);
  if (state.map) state.map.recenter(loc);
}

function renderStatus(entry) {
  const banner = $('#status-banner');
  const updated = $('#updated');
  updated.textContent = t('updated', { t: fmt.rel(entry.savedAt) });
  updated.title = new Date(entry.savedAt).toLocaleString(lang());
  let msg = '';
  if (state.lastError && (state.lastError.kind === 'offline' || navigator.onLine === false)) msg = t('offline');
  else if (state.lastError || store.isStale(entry)) msg = t('staleData', { t: fmt.rel(entry.savedAt) });
  banner.textContent = msg;
  banner.hidden = !msg;
  banner.classList.toggle('banner-warn', !!msg);
}

function renderPager(loc) {
  const list = pages();
  const pager = $('#pager');
  if (list.length < 2) { pager.innerHTML = ''; return; }
  pager.innerHTML = list.map((p, i) => `
    <button type="button" role="tab" class="dot${p.isGps ? ' dot-gps' : ''}" data-id="${esc(p.id)}"
      aria-selected="${p.id === loc.id}" aria-label="${esc(`${placeLabel(p)} — ${t('slideOf', { i: i + 1, n: list.length })}`)}"></button>`).join('');
}

function renderAlerts(alerts, tz) {
  const box = $('#alerts');
  if (!alerts.length) { box.innerHTML = ''; return; }
  const [first, ...rest] = alerts;
  const item = (a) => `
    <details class="alert sev-${esc(a.severity.toLowerCase())}">
      <summary>${glyph('warning', 20)}<span><strong>${esc(a.event)}</strong>
        ${a.expires ? `<small>${esc(t('alertUntil', { t: `${fmt.weekday(a.expires, tz)} ${fmt.time(a.expires, tz)}` }))}</small>` : ''}</span></summary>
      <div class="alert-body">
        <p class="alert-headline">${esc(a.headline)}</p>
        <p>${esc(a.description).replace(/\n{2,}/g, '<br><br>')}</p>
        ${a.instruction ? `<p><strong>${esc(a.instruction)}</strong></p>` : ''}
        <p class="alert-src">${esc(t('alertFrom', { s: a.sender }))}</p>
      </div>
    </details>`;
  box.innerHTML = item(first) + rest.map(item).join('');
  if (rest.length) {
    box.querySelectorAll('.alert').forEach((el, i) => { if (i > 0) el.classList.add('alert-more'); });
  }
}

function renderRainBanner(minutely, now) {
  const mins = notify.rainStartsIn(minutely, now);
  const b = $('#rain-banner');
  b.hidden = mins == null;
  if (mins != null) b.innerHTML = `${glyph('umbrella', 18)} ${esc(t('rainSoon', { m: mins.toLocaleString(lang()) }))}`;
}

function renderHourly(f, hourIdx) {
  const tz = f.timezone;
  const hours = f.hourly.slice(hourIdx, hourIdx + 48);
  $('#hourly').innerHTML = hours.map((h, i) => {
    const d = describeCode(h.code);
    const label = i === 0 ? t('now') : fmt.hour(h.time, tz);
    return `<li class="hour" aria-label="${esc(`${label}: ${fmt.temp(h.temp)}, ${t(`cond.${d.key}`)}, ${t('precipChance')} ${fmt.pct(h.precipProb)}`)}">
      <span class="hour-time">${esc(label)}</span>
      ${iconSvg(d.icon, h.isDay, 36)}
      <span class="hour-temp">${esc(fmt.temp(h.temp))}</span>
      <span class="hour-pop${h.precipProb >= 30 ? ' wet' : ''}">${glyph('drop', 12)}${esc(fmt.pct(h.precipProb))}</span>
    </li>`;
  }).join('');
}

function renderDaily(f) {
  const tz = f.timezone;
  const days = f.daily;
  $('#h-daily').textContent = t('daily', { n: days.length.toLocaleString(lang()) });
  const lo = Math.min(...days.map((d) => d.min ?? Infinity));
  const hi = Math.max(...days.map((d) => d.max ?? -Infinity));
  const span = Math.max(1, hi - lo);
  const todayKey = dayKey(Date.now(), tz);
  $('#daily').innerHTML = days.map((d, i) => {
    const desc = describeCode(d.code);
    const name = dayKey(d.time, tz) === todayKey ? t('today') : fmt.weekday(d.time, tz);
    const left = ((d.min - lo) / span) * 100;
    const width = ((d.max - d.min) / span) * 100;
    return `<li><button type="button" class="day" data-day="${i}"
        aria-label="${esc(`${name}: ${t(`cond.${desc.key}`)}, ${t('high')} ${fmt.temp(d.max)}, ${t('low')} ${fmt.temp(d.min)}, ${t('precipChance')} ${fmt.pct(d.precipProb)}`)}">
      <span class="day-name">${esc(name)}</span>
      <span class="day-icon">${iconSvg(desc.icon, true, 32)}</span>
      <span class="day-pop${d.precipProb >= 30 ? ' wet' : ''}">${d.precipProb ? esc(fmt.pct(d.precipProb)) : ''}</span>
      <span class="day-lo">${esc(fmt.temp(d.min))}</span>
      <span class="range" aria-hidden="true"><span style="inset-inline-start:${left.toFixed(1)}%;width:${Math.max(4, width).toFixed(1)}%"></span></span>
      <span class="day-hi">${esc(fmt.temp(d.max))}</span>
    </button></li>`;
  }).join('');
}

function renderChart(f, hourIdx) {
  const hours = f.hourly.slice(hourIdx, hourIdx + 48);
  const mode = state.chartMode;
  $('#chart').innerHTML = tempPrecipChart(hours, {
    width: Math.max(600, hours.length * 34),
    height: 200,
    mode,
    labelEvery: 3,
    title: mode === 'temp' ? t('chartTemp') : t('chartPrecip'),
    formatTemp: fmt.temp,
    formatLabel: (ms) => fmt.hour(ms, f.timezone),
  });
  $$('[data-chart]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.chart === mode)));
}

function renderDetails(cur, today) {
  const uvKey = uvLevel(cur.uv);
  const tiles = [
    [t('uvIndex'), cur.uv == null ? '–' : Math.round(cur.uv).toLocaleString(lang()), uvKey ? t(`uv.${uvKey}`) : ''],
    [t('visibility'), fmt.distance(cur.visibility), ''],
    [t('pressure'), fmt.pressure(cur.pressure), ''],
    [t('dewPoint'), fmt.temp(cur.dewPoint), ''],
    [t('cloudCover'), fmt.pct(cur.cloudCover), ''],
    [t('gusts'), fmt.wind(cur.windGust), today?.windMax != null ? `${t('high')} \u2066${fmt.wind(today.windMax)}\u2069` : ''],
  ];
  $('#details').innerHTML = tiles.map(([label, value, note]) => `
    <li class="tile"><span class="tile-label">${esc(label)}</span>
      <span class="tile-value"><bdi dir="ltr">${esc(value)}</bdi></span>
      ${note ? `<span class="tile-note">${esc(note)}</span>` : ''}</li>`).join('');
}

function renderSunMoon(today, now, tz) {
  const sun = $('#sun');
  if (today?.sunrise && today?.sunset) {
    const p = daylightProgress(now, today.sunrise, today.sunset);
    const angle = Math.PI * p;
    const sx = 100 - 90 * Math.cos(angle);
    const sy = 100 - 90 * Math.sin(angle);
    const up = now >= today.sunrise && now <= today.sunset;
    const left = Math.max(0, today.sunset - now);
    const hrs = Math.floor(left / 3600000);
    const mins = Math.round((left % 3600000) / 60000);
    const leftText = `${hrs.toLocaleString(lang())}h ${mins.toLocaleString(lang())}m`;
    const status = up ? t('daylightLeft', { t: leftText })
      : now < today.sunrise ? t('sunNotUp', { t: fmt.time(today.sunrise, tz) }) : t('sunDown');
    sun.innerHTML = `
      <svg viewBox="0 0 200 112" class="sun-arc" role="img" aria-label="${esc(`${t('daylight')}: ${status}`)}">
        <path d="M10 100 A90 90 0 0 1 190 100" class="arc-track"/>
        <path d="M10 100 A90 90 0 0 1 ${sx.toFixed(1)} ${sy.toFixed(1)}" class="arc-done"/>
        <line x1="0" y1="100" x2="200" y2="100" class="arc-horizon"/>
        ${up ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="8" class="arc-sun"/>` : ''}
      </svg>
      <div class="sun-times">
        <span><small>${esc(t('sunrise'))}</small>${esc(fmt.time(today.sunrise, tz))}</span>
        <span><small>${esc(t('sunset'))}</small>${esc(fmt.time(today.sunset, tz))}</span>
      </div>
      <p class="sun-status">${esc(status)}</p>`;
  } else {
    sun.innerHTML = '';
  }

  const m = moonPhase(now);
  const r = 28;
  const cx = 32;
  const cy = 32;
  const k = Math.cos(2 * Math.PI * m.fraction);
  const waxing = m.fraction < 0.5;
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  const lit = `M${cx} ${cy - r} A${r} ${r} 0 0 ${limbSweep} ${cx} ${cy + r} A${(Math.abs(k) * r).toFixed(2)} ${r} 0 0 ${termSweep} ${cx} ${cy - r}Z`;
  $('#moon').innerHTML = `
    <svg viewBox="0 0 64 64" width="72" height="72" class="moon-disc" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" class="moon-dark"/>
      ${m.illumination > 0.01 ? `<path d="${lit}" class="moon-lit"/>` : ''}
    </svg>
    <div><small>${esc(t('moonPhase'))}</small>
      <p class="moon-name">${esc(t(`moon.${m.key}`))}</p>
      <p class="moon-ill">${esc(t('illumination', { p: fmt.pct(m.illumination * 100) }))}</p></div>`;
}

function renderAirQuality(aq) {
  const box = $('#aqi');
  const pollenBox = $('#pollen');
  const cat = aqiCategory(aq?.usAqi);
  if (!cat) {
    box.innerHTML = `<p class="muted">${esc(t('aqiUnavailable'))}</p>`;
  } else {
    const main = mainPollutant(aq.subIndices);
    box.innerHTML = `
      <div class="aqi-row">
        <span class="aqi-value" style="background:${cat.color};color:${cat.text}">${esc(Math.round(aq.usAqi).toLocaleString(lang()))}</span>
        <div><p class="aqi-cat">${esc(t(`aqi.${cat.key}`))}</p>
        ${main ? `<p class="muted">${esc(t('mainPollutant', { p: t(`pollutant.${main.name}`) }))}</p>` : ''}</div>
      </div>
      <div class="aqi-scale" aria-hidden="true"><span style="inset-inline-start:${(aqiScalePosition(aq.usAqi) * 100).toFixed(1)}%"></span></div>`;
  }
  const pollen = Object.entries(aq?.pollen || {}).filter(([, v]) => v != null);
  if (!pollen.length) {
    pollenBox.innerHTML = `<p class="muted">${esc(t('pollenUnavailable'))}</p>`;
  } else {
    pollenBox.innerHTML = `<ul class="pollen">${pollen.map(([k, v]) => {
      const level = pollenLevel(v);
      return `<li class="pollen-${level}"><span>${esc(t(`pollenType.${k}`))}</span><strong>${esc(t(`pollenLevel.${level}`))}</strong></li>`;
    }).join('')}</ul>`;
  }
}

function setBackground(group, isDay) {
  const key = `${group}-${isDay ? 'day' : 'night'}`;
  if (state.bgKey === key) return;
  state.bgKey = key;
  document.body.className = document.body.className.replace(/\bbg-\S+/g, '').trim();
  document.body.classList.add(`bg-${key}`);
  const [top] = GRADIENTS[key] || GRADIENTS['cloudy-day'];
  $('meta[name="theme-color"]').setAttribute('content', top);

  const particles = $('.particles');
  particles.innerHTML = '';
  const kind = group === 'snow' ? 'flake' : group === 'rain' || group === 'storm' ? 'drop' : isDay ? '' : 'star';
  if (!kind) return;
  const count = kind === 'star' ? 40 : 60;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = kind;
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${(-Math.random() * 3).toFixed(2)}s`;
    s.style.animationDuration = `${(kind === 'flake' ? 6 : kind === 'star' ? 3 : 0.8) + Math.random() * 2}s`;
    if (kind === 'star') s.style.top = `${Math.random() * 60}%`;
    frag.appendChild(s);
  }
  particles.appendChild(frag);
}

function openDay(index) {
  const loc = activePage();
  const entry = loc && state.data.get(loc.id);
  if (!entry) return;
  const f = entry.forecast;
  const d = f.daily[index];
  const tz = f.timezone;
  const key = dayKey(d.time, tz);
  const hours = f.hourly.filter((h) => dayKey(h.time, tz) === key);
  const desc = describeCode(d.code);
  $('#dlg-day-title').textContent = fmt.date(d.time, tz);
  $('#day-summary').innerHTML = `
    ${iconSvg(desc.icon, true, 56)}
    <div><p class="cond">${esc(t(`cond.${desc.key}`))}</p>
    <p>${esc(t('highLow', { h: fmt.temp(d.max), l: fmt.temp(d.min) }))}</p></div>
    <ul class="mini-stats">
      <li>${esc(t('precipChance'))}: ${esc(fmt.pct(d.precipProb))} · ${esc(fmt.precip(d.precipSum))}</li>
      <li>${esc(t('wind'))}: <bdi dir="ltr">${esc(fmt.wind(d.windMax))} ${esc(compassPoint(d.windDir))}</bdi></li>
      <li>${esc(t('uvIndex'))}: ${d.uvMax == null ? '–' : esc(Math.round(d.uvMax).toLocaleString(lang()))}</li>
      ${d.sunrise ? `<li>${esc(t('sunrise'))} ${esc(fmt.time(d.sunrise, tz))} · ${esc(t('sunset'))} ${esc(fmt.time(d.sunset, tz))}</li>` : ''}
    </ul>`;
  $('#day-chart').innerHTML = tempPrecipChart(hours, {
    width: Math.max(560, hours.length * 30), height: 180, mode: 'both', labelEvery: 3,
    title: t('chartTemp'), formatTemp: fmt.temp, formatLabel: (ms) => fmt.hour(ms, tz),
  });
  $('#day-table').innerHTML = hours.map((h) => {
    const hd = describeCode(h.code);
    return `<tr><th scope="row">${esc(fmt.hour(h.time, tz))}</th>
      <td>${iconSvg(hd.icon, h.isDay, 28)}<span class="visually-hidden">${esc(t(`cond.${hd.key}`))}</span></td>
      <td>${esc(fmt.temp(h.temp))}</td>
      <td>${glyph('drop', 12)} ${esc(fmt.pct(h.precipProb))}</td>
      <td><bdi dir="ltr">${esc(fmt.wind(h.windSpeed))} ${esc(compassPoint(h.windDir))}</bdi></td></tr>`;
  }).join('');
  openDialog('#dlg-day');
}

// ---------------------------------------------------------------------------
// Locations

function selectLocation(loc) {
  closeSearch();
  $('#search-input').value = '';
  if (!pages().some((p) => p.id === loc.id)) {
    state.preview = loc;
    persistLocations();
  }
  setActive(loc.id);
  showActive();
}

function toggleFavorite() {
  const loc = activePage();
  if (!loc || loc.isGps) return;
  if (isFav(loc.id)) {
    state.favorites = state.favorites.filter((f) => f.id !== loc.id);
    state.preview = loc;
  } else {
    if (state.favorites.length >= CONFIG.maxFavorites) return;
    const { id, name, admin, country, countryCode, lat, lon, timezone } = loc;
    state.favorites.push({ id, name, admin, country, countryCode, lat, lon, timezone, notify: true });
    if (state.preview?.id === loc.id) state.preview = null;
    toast(t('saved'));
  }
  persistLocations();
  const entry = state.data.get(loc.id);
  if (entry) render(loc, entry);
}

function swipeTo(delta) {
  const list = pages();
  if (list.length < 2) return;
  const i = list.findIndex((p) => p.id === activePage()?.id);
  const next = list[(i + delta + list.length) % list.length];
  setActive(next.id);
  showActive();
  $('#hero').classList.remove('slide-left', 'slide-right');
  void $('#hero').offsetWidth;
  $('#hero').classList.add(delta > 0 ? 'slide-left' : 'slide-right');
}

function renderLocationList() {
  const list = $('#loc-list');
  const items = [];
  if (state.gps) items.push({ ...state.gps, fixed: true });
  items.push(...state.favorites);
  if (!state.favorites.length) {
    list.innerHTML = `${state.gps ? itemHtml(items[0], 0) : ''}<li class="muted loc-empty">${esc(t('noSaved'))}</li>`;
    return;
  }
  function itemHtml(loc, idx) {
    const entry = hydrate(loc.id);
    const temp = entry ? fmt.temp(entry.forecast.current.temp) : '';
    const desc = entry ? describeCode(entry.forecast.current.code) : null;
    const tz = entry?.forecast.timezone || loc.timezone;
    const time = tz ? fmt.time(Date.now(), tz) : '';
    const favIdx = idx - (state.gps ? 1 : 0);
    const controls = loc.fixed ? '' : `
      <div class="loc-actions">
        <button type="button" class="icon-btn small" data-act="notify" data-id="${esc(loc.id)}" aria-pressed="${loc.notify !== false}" aria-label="${esc(t('notifyThis'))}" title="${esc(t('notifyThis'))}">${glyph('bell', 18)}</button>
        <button type="button" class="icon-btn small" data-act="up" data-id="${esc(loc.id)}" aria-label="${esc(`${t('moveUp')}: ${loc.name}`)}" ${favIdx === 0 ? 'disabled' : ''}>${glyph('up', 18)}</button>
        <button type="button" class="icon-btn small" data-act="down" data-id="${esc(loc.id)}" aria-label="${esc(`${t('moveDown')}: ${loc.name}`)}" ${favIdx === state.favorites.length - 1 ? 'disabled' : ''}>${glyph('down', 18)}</button>
        <button type="button" class="icon-btn small danger" data-act="delete" data-id="${esc(loc.id)}" aria-label="${esc(`${t('delete')}: ${loc.name}`)}">${glyph('trash', 18)}</button>
      </div>`;
    return `<li class="loc${loc.id === activePage()?.id ? ' active' : ''}">
      <button type="button" class="loc-main" data-act="open" data-id="${esc(loc.id)}">
        <span class="loc-name">${loc.fixed ? glyph('locate', 16) : ''} ${esc(placeLabel(loc))}</span>
        <span class="loc-sub">${esc([loc.admin, loc.country].filter(Boolean).join(', '))}${time ? ` · ${esc(t('localTime', { t: time }))}` : ''}</span>
        <span class="loc-temp">${desc ? iconSvg(desc.icon, entry.forecast.current.isDay, 28) : ''}${esc(temp)}</span>
      </button>${controls}</li>`;
  }
  list.innerHTML = items.map(itemHtml).join('');
}

function onLocationAction(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  const idx = state.favorites.findIndex((f) => f.id === id);
  if (act === 'open') {
    setActive(id);
    closeDialog('#dlg-locations');
    showActive();
    return;
  }
  if (idx < 0) return;
  if (act === 'up' && idx > 0) {
    [state.favorites[idx - 1], state.favorites[idx]] = [state.favorites[idx], state.favorites[idx - 1]];
  } else if (act === 'down' && idx < state.favorites.length - 1) {
    [state.favorites[idx + 1], state.favorites[idx]] = [state.favorites[idx], state.favorites[idx + 1]];
  } else if (act === 'delete') {
    state.favorites.splice(idx, 1);
    if (state.activeId === id) setActive(pages()[0]?.id ?? null);
  } else if (act === 'notify') {
    state.favorites[idx].notify = state.favorites[idx].notify === false;
  }
  persistLocations();
  renderLocationList();
  // Keep focus on the same control after re-render.
  $(`#loc-list button[data-act="${act}"][data-id="${CSS.escape(id)}"]`)?.focus();
  if (act === 'delete') {
    if (pages().length) showActive();
    else showEmpty();
  } else {
    const loc = activePage();
    const entry = loc && state.data.get(loc.id);
    if (entry) renderPager(loc);
  }
}

// ---------------------------------------------------------------------------
// Geolocation

function askGeoExplainer() {
  return new Promise((resolve) => {
    const dlg = $('#dlg-geo');
    const onClick = (e) => {
      const b = e.target.closest('[data-geo]');
      if (!b) return;
      dlg.removeEventListener('click', onClick);
      closeDialog('#dlg-geo');
      resolve(b.dataset.geo === 'yes');
    };
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('cancel', () => { dlg.removeEventListener('click', onClick); resolve(false); }, { once: true });
    openDialog('#dlg-geo');
  });
}

async function geoPermission() {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'prompt';
  }
}

function geoFailed(message) {
  if (!pages().length) showEmpty(message);
  else toast(message);
}

async function useGps({ explain = true } = {}) {
  if (!('geolocation' in navigator)) { geoFailed(t('geoUnavailable')); return; }
  const perm = await geoPermission();
  if (perm === 'denied') { geoFailed(t('geoDenied')); return; }
  if (perm === 'prompt' && explain && !(await askGeoExplainer())) {
    if (!pages().length) showEmpty();
    return;
  }
  if (!pages().length) showState('loading');
  $('#btn-gps').classList.add('busy');

  navigator.geolocation.getCurrentPosition(async (pos) => {
    $('#btn-gps').classList.remove('busy');
    const { latitude: lat, longitude: lon } = pos.coords;
    const prev = state.gps;
    const moved = !prev || Math.abs(prev.lat - lat) > 0.02 || Math.abs(prev.lon - lon) > 0.02;
    let place = { name: prev?.name || '', admin: prev?.admin || '', country: prev?.country || '', countryCode: prev?.countryCode || '' };
    if (moved) {
      state.data.delete('gps');
      place = await provider.reverseGeocode(lat, lon, { lang: lang() }).catch(() => ({ name: '' }));
    }
    state.gps = { id: 'gps', isGps: true, lat, lon, timezone: prev?.timezone || null, ...place };
    persistLocations();
    setActive('gps');
    showActive({ force: moved });
  }, (err) => {
    $('#btn-gps').classList.remove('busy');
    geoFailed(err.code === err.PERMISSION_DENIED ? t('geoDenied') : t('geoUnavailable'));
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 });
}

// ---------------------------------------------------------------------------
// Search (debounced autocomplete)

const runSearch = debounce(async (query) => {
  const list = $('#search-results');
  state.searchAbort?.abort();
  if (query.trim().length < 2) { closeSearch(); return; }
  state.searchAbort = new AbortController();
  list.innerHTML = `<li class="muted" role="presentation">${esc(t('searching'))}</li>`;
  openSearch();
  try {
    const results = await provider.searchLocations(query, { signal: state.searchAbort.signal, lang: lang() });
    state.searchResults = results;
    state.searchActive = -1;
    list.innerHTML = results.length
      ? results.map((r, i) => `<li role="option" id="sr-${i}" data-i="${i}" aria-selected="false">
          <span class="sr-name">${esc(r.name)}</span>
          <span class="sr-sub">${esc([r.postcode, r.admin, r.country].filter(Boolean).join(', '))}</span></li>`).join('')
      : `<li class="muted" role="presentation">${esc(t('noResults'))}</li>`;
  } catch (err) {
    if (err?.name === 'AbortError') return;
    list.innerHTML = `<li class="muted" role="presentation">${esc(err?.kind === 'offline' ? t('errorOffline') : t('errorGeneric'))}</li>`;
  }
}, CONFIG.searchDebounceMs);

function openSearch() {
  $('#search-results').hidden = false;
  $('#search-input').setAttribute('aria-expanded', 'true');
}

function closeSearch() {
  $('#search-results').hidden = true;
  $('#search-input').setAttribute('aria-expanded', 'false');
  $('#search-input').removeAttribute('aria-activedescendant');
  state.searchActive = -1;
}

function moveSearchSelection(delta) {
  const n = state.searchResults.length;
  if (!n) return;
  state.searchActive = (state.searchActive + delta + n) % n;
  $$('#search-results [role="option"]').forEach((el, i) => el.setAttribute('aria-selected', String(i === state.searchActive)));
  $('#search-input').setAttribute('aria-activedescendant', `sr-${state.searchActive}`);
  $(`#sr-${state.searchActive}`)?.scrollIntoView({ block: 'nearest' });
}

function chooseSearchResult(i) {
  const r = state.searchResults[i];
  if (!r) return;
  const loc = { ...r };
  delete loc.isCoordinates;
  selectLocation(loc);
  if (r.isCoordinates) {
    provider.reverseGeocode(r.lat, r.lon, { lang: lang() })
      .then((p) => {
        if (!p.name) return;
        Object.assign(loc, p);
        persistLocations();
        const entry = state.data.get(loc.id);
        if (activePage()?.id === loc.id && entry) render(loc, entry);
      })
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Settings, theme, language

function applyTheme() {
  const { theme } = state.settings;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function applyLanguage() {
  setLanguage(state.settings.lang);
  translateDom();
  const loc = activePage();
  const entry = loc && state.data.get(loc.id);
  if (entry && !$('#weather').hidden) render(loc, entry);
}

function fillSettingsForm() {
  const form = $('#settings-form');
  $('#lang-select').innerHTML = Object.entries(LANGUAGES)
    .map(([code, l]) => `<option value="${code}" lang="${code}">${esc(l.name)}</option>`).join('');
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = !!state.settings[el.name];
    else el.value = state.settings[el.name];
  }
  form.elements.dailyTime.disabled = !state.settings.notifyDaily;
  $('#notify-hint').textContent = notify.permission() === 'denied' && notify.notificationsSupported() ? t('notifyBlocked') : t('notifyNote');
}

async function onSettingsChange(e) {
  const el = e.target;
  if (!el.name) return;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'checkbox' && value) {
    const perm = await notify.requestPermission();
    if (perm !== 'granted') {
      value = false;
      el.checked = false;
      $('#notify-hint').textContent = t('notifyBlocked');
    }
  }
  state.settings = { ...state.settings, [el.name]: value };
  store.saveSettings(state.settings);
  $('#settings-form').elements.dailyTime.disabled = !state.settings.notifyDaily;
  if (el.name === 'theme') applyTheme();
  if (el.name === 'lang') { applyLanguage(); fillSettingsForm(); return; }
  syncServiceWorker();
  const loc = activePage();
  const entry = loc && state.data.get(loc.id);
  if (entry) render(loc, entry);
}

// ---------------------------------------------------------------------------
// Notifications

function locationsWantingNotifications() {
  return [...(state.gps ? [state.gps] : []), ...state.favorites.filter((f) => f.notify !== false)];
}

function afterFetch(loc, entry) {
  const s = state.settings;
  if (loc.notify === false) return;
  if (!loc.isGps && !isFav(loc.id)) return;
  if (s.notifySevere && entry.alerts?.length) notify.notifyNewAlerts(placeLabel(loc), entry.alerts);
  if (s.notifyRainSoon) {
    const mins = notify.rainStartsIn(entry.forecast.minutely, Date.now());
    if (mins != null) notify.notifyRainSoon(loc.id, `${t('rainSoonTitle')} — ${placeLabel(loc)}`, t('rainSoon', { m: mins }));
  }
}

async function backgroundCheck() {
  const s = state.settings;
  if (!(s.notifySevere || s.notifyRainSoon)) return;
  for (const loc of locationsWantingNotifications()) {
    if (loc.id === activePage()?.id) continue;
    try {
      const { entry, fetched } = await loadLocation(loc);
      if (fetched) afterFetch(loc, entry);
    } catch { /* try again next interval */ }
  }
}

async function sendDailySummary() {
  const loc = pages()[0];
  if (!loc) return;
  try {
    const { entry } = await loadLocation(loc);
    const f = entry.forecast;
    const d = f.daily.find((x) => dayKey(x.time, f.timezone) === dayKey(Date.now(), f.timezone)) || f.daily[0];
    const desc = describeCode(d.code);
    await notify.show(
      t('dailyNotifTitle', { place: placeLabel(loc) }),
      `${t(`cond.${desc.key}`)}. ${t('highLow', { h: fmt.temp(d.max), l: fmt.temp(d.min) })}. ${t('precipChance')} ${fmt.pct(d.precipProb)}`,
      { tag: 'daily' },
    );
  } catch { /* offline */ }
}

function syncServiceWorker() {
  const s = state.settings;
  notify.syncStateToServiceWorker({
    notifySevere: s.notifySevere,
    notifyRainSoon: s.notifyRainSoon,
    notifyDaily: s.notifyDaily,
    dailyTime: s.dailyTime,
    tempUnit: s.tempUnit,
    locations: locationsWantingNotifications().map(({ id, name, lat, lon, countryCode }) => ({ id, name: name || t('myLocation'), lat, lon, countryCode })),
    strings: { rainSoonTitle: t('rainSoonTitle'), dailyTitle: t('dailyNotifTitle', { place: '{place}' }) },
    endpoints: { forecast: CONFIG.endpoints.forecast, nwsAlerts: CONFIG.endpoints.nwsAlerts },
  });
}

// ---------------------------------------------------------------------------
// Share

async function onShare() {
  const loc = activePage();
  const entry = loc && state.data.get(loc.id);
  if (!entry) return;
  const f = entry.forecast;
  const cur = f.current;
  const desc = describeCode(cur.code);
  const today = f.daily[0];
  const text = t('shareText', {
    place: placeLabel(loc),
    temp: `${fmt.temp(cur.temp)}${state.settings.tempUnit.toUpperCase()}`,
    cond: t(`cond.${desc.key}`),
    h: fmt.temp(today?.max),
    l: fmt.temp(today?.min),
    feels: fmt.temp(cur.feelsLike),
  });
  try {
    const result = await shareWeather({
      title: placeLabel(loc),
      text,
      imageInfo: {
        place: placeLabel(loc),
        temp: fmt.temp(cur.temp),
        cond: t(`cond.${desc.key}`),
        high: `${t('high')} ${fmt.temp(today?.max)}`,
        low: `${t('low')} ${fmt.temp(today?.min)}`,
        feels: t('feelsLike', { t: fmt.temp(cur.feelsLike) }),
        iconSvg: iconSvg(desc.icon, cur.isDay, 280),
        gradient: GRADIENTS[state.bgKey] || GRADIENTS['cloudy-day'],
        dir: LANGUAGES[lang()].dir,
        updated: t('updated', { t: new Date(entry.savedAt).toLocaleString(lang()) }),
      },
    });
    if (result === 'copied') toast(t('shareCopied'));
  } catch {
    toast(t('errorGeneric'));
  }
}

// ---------------------------------------------------------------------------
// Map

async function onShowMap() {
  const container = $('#map');
  container.hidden = false;
  $('#btn-map').hidden = true;
  if (state.map || state.mapLoading) return;
  const { createWeatherMap } = await import('./ui/map.js');
  state.mapLoading = createWeatherMap(container, {
    provider,
    getCenter: () => activePage(),
    formatTemp: fmt.temp,
    formatWind: fmt.wind,
    formatTime: (ms) => fmt.time(ms, activePage()?.timezone),
    t,
  });
  try {
    state.map = await state.mapLoading;
  } catch {
    const status = container.querySelector('.map-status');
    status.textContent = t('mapLoadFailed');
    status.hidden = false;
  } finally {
    state.mapLoading = null;
  }
}

// ---------------------------------------------------------------------------
// Dialogs, toast

function openDialog(sel) {
  const dlg = $(sel);
  if (!dlg.open) dlg.showModal();
}

function closeDialog(sel) {
  const dlg = $(sel);
  if (dlg.open) dlg.close();
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------------------------------------------------------------------------
// Gestures: swipe between locations, pull to refresh

function bindGestures() {
  const hero = $('#hero');
  let sx = 0;
  let sy = 0;
  hero.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  hero.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const rtl = document.documentElement.dir === 'rtl';
      swipeTo((dx < 0) !== rtl ? 1 : -1);
    }
  }, { passive: true });

  const ptr = $('#ptr');
  const THRESHOLD = 80;
  let startY = null;
  let pull = 0;
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || document.querySelector('dialog[open]') || e.target.closest('.map, .search-results')) { startY = null; return; }
    startY = e.touches[0].clientY;
    pull = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    pull = Math.max(0, e.touches[0].clientY - startY);
    if (pull < 10) return;
    ptr.classList.add('visible');
    ptr.style.transform = `translateY(${Math.min(pull, 120) - 60}px)`;
    ptr.querySelector('.ptr-text').textContent = pull > THRESHOLD ? t('releaseToRefresh') : t('pullToRefresh');
  }, { passive: true });
  window.addEventListener('touchend', async () => {
    if (startY == null) return;
    startY = null;
    if (pull > THRESHOLD && activePage()) {
      ptr.classList.add('loading');
      ptr.querySelector('.ptr-text').textContent = t('refreshing');
      await showActive({ force: true, userInitiated: true });
    }
    ptr.classList.remove('visible', 'loading');
    ptr.style.transform = '';
    pull = 0;
  });
}

// ---------------------------------------------------------------------------
// Wiring

function injectGlyphs() {
  $('#btn-locations').innerHTML = glyph('menu', 22);
  $('#btn-gps').innerHTML = glyph('locate', 22);
  $('#btn-settings').innerHTML = glyph('settings', 22);
  $('.search-icon').innerHTML = glyph('search', 18);
  $('#btn-refresh').innerHTML = glyph('refresh', 18);
  $('#btn-share').innerHTML = glyph('share', 18);
  $('#btn-fav').innerHTML = glyph('star', 22);
  $$('[data-close]').forEach((b) => { b.innerHTML = glyph('close', 20); });
  $('[data-map-play]').insertAdjacentHTML('afterbegin', glyph('play', 14));
  $('.empty-art').innerHTML = iconSvg('partly', true, 120);
}

function bindEvents() {
  const input = $('#search-input');
  input.addEventListener('input', () => runSearch(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSearchSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSearchSelection(-1); }
    else if (e.key === 'Escape') { closeSearch(); }
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.searchActive >= 0) chooseSearchResult(state.searchActive);
    else if (state.searchResults.length && !$('#search-results').hidden) chooseSearchResult(0);
  });
  $('#search-results').addEventListener('mousedown', (e) => e.preventDefault());
  $('#search-results').addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) chooseSearchResult(Number(li.dataset.i));
  });
  input.addEventListener('blur', () => setTimeout(closeSearch, 150));

  $('#btn-gps').addEventListener('click', () => useGps());
  $('#empty-gps').addEventListener('click', () => useGps());
  $('#empty-search').addEventListener('click', () => input.focus());
  $('#btn-retry').addEventListener('click', () => showActive({ force: true }));
  $('#btn-refresh').addEventListener('click', () => showActive({ force: true, userInitiated: true }));
  $('#btn-share').addEventListener('click', onShare);
  $('#btn-fav').addEventListener('click', toggleFavorite);
  $('#btn-map').addEventListener('click', onShowMap);

  $('#btn-locations').addEventListener('click', () => { renderLocationList(); openDialog('#dlg-locations'); });
  $('#loc-list').addEventListener('click', onLocationAction);
  $('#btn-settings').addEventListener('click', () => { fillSettingsForm(); openDialog('#dlg-settings'); });
  $('#settings-form').addEventListener('change', onSettingsChange);
  $('#settings-form').addEventListener('submit', (e) => e.preventDefault());

  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
    });
  });

  $('#daily').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (b) openDay(Number(b.dataset.day));
  });
  $$('[data-chart]').forEach((b) => b.addEventListener('click', () => {
    state.chartMode = b.dataset.chart;
    const loc = activePage();
    const entry = loc && state.data.get(loc.id);
    if (entry) renderChart(entry.forecast, currentHourIndex(entry.forecast.hourly, Date.now()));
  }));
  $('#pager').addEventListener('click', (e) => {
    const dot = e.target.closest('[data-id]');
    if (!dot) return;
    setActive(dot.dataset.id);
    showActive();
  });
  $('#hero').addEventListener('keydown', (e) => {
    if (e.target.closest('.pager') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const rtl = document.documentElement.dir === 'rtl';
      swipeTo((e.key === 'ArrowRight') !== rtl ? 1 : -1);
      requestAnimationFrame(() => $('#pager [aria-selected="true"]')?.focus());
    }
  });

  window.addEventListener('online', () => showActive());
  window.addEventListener('offline', () => {
    const loc = activePage();
    const entry = loc && state.data.get(loc.id);
    state.lastError = { kind: 'offline' };
    if (entry) renderStatus(entry);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activePage()) showActive();
  });

  // Periodic refresh (respecting the cache freshness window) + local clock.
  setInterval(() => {
    if (document.visibilityState === 'visible' && activePage()) showActive();
    backgroundCheck();
  }, CONFIG.refreshIntervalMs);
  setInterval(() => {
    const loc = activePage();
    const entry = loc && state.data.get(loc.id);
    if (entry && !$('#weather').hidden) {
      $('#place-sub').textContent = [placeSub(loc), t('localTime', { t: fmt.time(Date.now(), entry.forecast.timezone) })].filter(Boolean).join(' · ');
      $('#updated').textContent = t('updated', { t: fmt.rel(entry.savedAt) });
    }
  }, 30000);

  notify.scheduleDaily(() => (state.settings.notifyDaily ? state.settings.dailyTime : null), sendDailySummary);

  let deferredInstall;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    $('#btn-install').hidden = false;
  });
  $('#btn-install').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    deferredInstall = null;
    $('#btn-install').hidden = true;
  });

  bindGestures();
}

async function firstRun() {
  const perm = 'geolocation' in navigator ? await geoPermission() : 'denied';
  if (perm === 'granted') { useGps({ explain: false }); return; }
  if (perm === 'denied') { showEmpty(t('geoDenied')); return; }
  if (!store.loadMeta('geoAsked')) {
    store.saveMeta('geoAsked', true);
    showEmpty();
    useGps();
    return;
  }
  showEmpty();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(() => syncServiceWorker()).catch(() => {});
}

function init() {
  setLanguage(state.settings.lang);
  translateDom();
  applyTheme();
  injectGlyphs();
  bindEvents();
  registerServiceWorker();

  // Deep link: ?lat=..&lon=..&name=..
  const params = new URLSearchParams(location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (params.has('lat') && Number.isFinite(lat) && Number.isFinite(lon)) {
    selectLocation({ id: locationId(lat, lon), name: params.get('name') || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, lat, lon });
    return;
  }

  if (pages().length) showActive();
  else firstRun();
}

init();
