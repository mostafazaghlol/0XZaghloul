// Interactive map: RainViewer radar (past + nowcast frames, animated) plus
// temperature / wind / cloud overlays sampled from the weather provider on a
// grid over the visible area. Leaflet is loaded on demand.

import { CONFIG } from '../config.js';
import { getJson } from '../providers/http.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_BASE = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}`;

let leafletPromise;
function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${LEAFLET_BASE}/leaflet.min.css`;
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = `${LEAFLET_BASE}/leaflet.min.js`;
      s.async = true;
      s.onload = () => resolve(globalThis.L);
      s.onerror = () => { leafletPromise = null; reject(new Error('Leaflet failed to load')); };
      document.head.appendChild(s);
    });
  }
  return leafletPromise;
}

function tempColor(c) {
  // -20°C (blue) .. 40°C (red)
  const f = Math.min(1, Math.max(0, (c + 20) / 60));
  const hue = 240 - f * 240;
  return `hsl(${hue.toFixed(0)} 80% 45%)`;
}

/**
 * @param {HTMLElement} root container with .map-canvas, .map-layers, .map-timeline
 * @param {{provider: object, getCenter: () => {lat:number, lon:number},
 *          formatTemp: (c:number)=>string, formatWind: (k:number)=>string,
 *          formatTime: (ms:number)=>string, t: (k:string)=>string}} deps
 */
export async function createWeatherMap(root, deps) {
  const L = await loadLeaflet();
  const canvas = root.querySelector('.map-canvas');
  const status = root.querySelector('.map-status');
  const playBtn = root.querySelector('[data-map-play]');
  const slider = root.querySelector('.map-slider');
  const frameLabel = root.querySelector('.map-frame-time');
  const { lat, lon } = deps.getCenter();

  const map = L.map(canvas, { zoomControl: true, attributionControl: true }).setView([lat, lon], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  let centerMarker = L.circleMarker([lat, lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);

  let layer = 'radar';
  let frames = [];
  let frameLayers = [];
  let frameIdx = 0;
  let timer = null;
  const gridGroup = L.layerGroup().addTo(map);
  let gridAbort = null;

  const setStatus = (msg) => { status.textContent = msg || ''; status.hidden = !msg; };

  async function loadRadar() {
    try {
      const data = await getJson(CONFIG.endpoints.rainviewer);
      const past = data.radar?.past || [];
      const nowcast = (data.radar?.nowcast || []).map((f) => ({ ...f, forecast: true }));
      frames = [...past, ...nowcast];
      frameLayers = frames.map((f) => L.tileLayer(`${data.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        opacity: 0, maxNativeZoom: 7, maxZoom: 12, zIndex: 10,
        attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
      }));
      slider.max = String(Math.max(0, frames.length - 1));
      showFrame(Math.max(0, past.length - 1));
      setStatus(frames.length ? '' : deps.t('radarUnavailable'));
    } catch {
      setStatus(deps.t('radarUnavailable'));
    }
  }

  function showFrame(i) {
    if (!frames.length) return;
    frameIdx = (i + frames.length) % frames.length;
    frameLayers.forEach((fl, j) => {
      if (j === frameIdx) { if (!map.hasLayer(fl)) fl.addTo(map); fl.setOpacity(0.7); }
      else if (map.hasLayer(fl)) fl.setOpacity(0);
    });
    // Preload the next frame so animation stays smooth.
    const next = frameLayers[(frameIdx + 1) % frameLayers.length];
    if (next && !map.hasLayer(next)) next.addTo(map);
    slider.value = String(frameIdx);
    const f = frames[frameIdx];
    frameLabel.textContent = `${deps.formatTime(f.time * 1000)}${f.forecast ? ` (${deps.t('forecastFrame')})` : ''}`;
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.querySelector('span').textContent = deps.t('play');
  }

  function play() {
    if (!frames.length) return;
    timer = setInterval(() => showFrame(frameIdx + 1), 700);
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.querySelector('span').textContent = deps.t('pause');
  }

  playBtn.addEventListener('click', () => (timer ? stop() : play()));
  slider.addEventListener('input', () => { stop(); showFrame(Number(slider.value)); });

  function setRadarVisible(visible) {
    root.querySelector('.map-timeline').hidden = !visible;
    if (!visible) {
      stop();
      frameLayers.forEach((fl) => map.hasLayer(fl) && map.removeLayer(fl));
    } else if (frames.length) {
      showFrame(frameIdx);
    }
  }

  async function loadGrid() {
    gridAbort?.abort();
    gridGroup.clearLayers();
    if (layer === 'radar') return;
    gridAbort = new AbortController();
    const b = map.getBounds();
    const rows = 5;
    const cols = 6;
    const points = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        points.push({
          lat: b.getSouth() + ((r + 0.5) / rows) * (b.getNorth() - b.getSouth()),
          lon: b.getWest() + ((c + 0.5) / cols) * (b.getEast() - b.getWest()),
        });
      }
    }
    try {
      const grid = await deps.provider.getGrid(points, { signal: gridAbort.signal });
      grid.forEach((g) => {
        let html = '';
        if (layer === 'temp' && g.temp != null) {
          html = `<span class="map-chip" style="background:${tempColor(g.temp)}">${deps.formatTemp(g.temp)}</span>`;
        } else if (layer === 'wind' && g.windSpeed != null) {
          // Arrow points where the wind blows *to* (direction + 180°).
          html = `<span class="map-chip map-wind"><span class="map-arrow" style="transform:rotate(${(g.windDir + 180) % 360}deg)">↑</span>${deps.formatWind(g.windSpeed)}</span>`;
        } else if (layer === 'clouds' && g.cloudCover != null) {
          html = `<span class="map-cloud" style="--c:${g.cloudCover / 100}">${Math.round(g.cloudCover)}%</span>`;
        }
        if (html) {
          gridGroup.addLayer(L.marker([g.lat, g.lon], {
            icon: L.divIcon({ className: 'map-marker', html, iconSize: null }),
            interactive: false,
            keyboard: false,
          }));
        }
      });
      setStatus('');
    } catch (err) {
      if (err?.name !== 'AbortError') setStatus(deps.t('mapLoadFailed'));
    }
  }

  let moveTimer;
  map.on('moveend', () => { clearTimeout(moveTimer); moveTimer = setTimeout(loadGrid, 500); });

  root.querySelectorAll('[data-layer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      layer = btn.dataset.layer;
      root.querySelectorAll('[data-layer]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      setRadarVisible(layer === 'radar');
      loadGrid();
    });
  });

  await loadRadar();

  return {
    recenter({ lat: la, lon: lo }) {
      map.setView([la, lo], map.getZoom());
      centerMarker.remove();
      centerMarker = L.circleMarker([la, lo], { radius: 6, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);
    },
    invalidate() { map.invalidateSize(); },
    refreshRadar: loadRadar,
  };
}
