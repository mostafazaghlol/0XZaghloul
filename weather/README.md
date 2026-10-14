# Weather

A fast, installable weather website. It is plain static HTML/CSS/JS (ES modules, no build step), so GitHub Pages serves it as-is at `/weather/`.

Data comes from [Open-Meteo](https://open-meteo.com/) (forecast, geocoding, air quality; free, no API key), the [US National Weather Service](https://www.weather.gov/) (official alerts), [RainViewer](https://www.rainviewer.com/) (radar) and [OpenStreetMap](https://www.openstreetmap.org/) (map tiles).

## Run locally

```bash
cd weather
npm start            # http://localhost:8080/
npm test             # unit tests (parsing, unit conversion, storage, astronomy…)
npm install && npm run test:e2e   # UI tests in headless Chromium (Playwright), all APIs mocked
```

## Features

| Area | What's implemented |
| --- | --- |
| Location | GPS with an explainer before the browser prompt. If permission is denied, the page explains and falls back to search. Autocomplete search (debounced) by city name, ZIP/postal code, or `lat, lon`. Saved locations: switch by swiping the main card, by the pager dots, or from the list. Reorder, delete, per-location notifications, and the local time of each location. |
| Current | Temperature, feels-like, condition and icon, today's high/low, humidity, wind speed and direction, chance of precipitation, UV, visibility, pressure, dew point, cloud cover, gusts. Sunrise/sunset with a daylight arc. Moon phase (computed locally). |
| Forecasts | 48-hour horizontal hourly scroll and a 10-day daily list. Tap a day to see its hourly details. Temperature and precipitation charts (dependency-free SVG). |
| Alerts | NWS severe-weather alerts in a prominent banner (US coverage). Banner when rain is starting within the hour (15-minute data). |
| Notifications | Severe alerts, "rain starting soon", and a daily forecast at a time you choose. These work while the page is open, and in the background via Periodic Background Sync when the site is installed as an app on browsers that support it. |
| Map | Lazy-loaded Leaflet map with an animated RainViewer radar loop (past frames plus nowcast frames when available). Temperature, wind and cloud layers are sampled from Open-Meteo on a grid over the visible area. |
| Air & health | US AQI with a colour scale and the main pollutant. Pollen levels (Europe; other regions show "unavailable"). |
| Settings | °C/°F, km/h/mph/m/s, mm/in, hPa/inHg, 12h/24h, light/dark/system theme. Languages: English, Español, العربية (right-to-left). Defaults follow your browser locale. |
| UI/UX | Current conditions are visible without scrolling. Pull to refresh, a refresh button, and an "Updated …" timestamp. Loading skeleton, empty, error and offline states. Backgrounds change with the weather and time of day (with rain, snow and star particles, turned off for reduced motion). Screen-reader labels, keyboard navigation and rem-based text. |
| Extras | Share as text or as a generated PNG card (Web Share API, with a clipboard/download fallback). Installable PWA. Embeddable widget at `widget.html?lat=…&lon=…&name=…&size=small|medium|large`. |

## Architecture

```
js/
  config.js            endpoints, refresh/caching intervals (override with window.WX_CONFIG)
  providers/
    index.js           provider registry: the only API surface the UI uses
    open-meteo.js      Open-Meteo implementation + pure parsers
    nws-alerts.js      official alerts provider (composed in)
    http.js            fetch wrapper: timeouts, typed errors
  store.js             settings, favourites, per-location data cache (localStorage)
  units.js, format.js  conversions and locale/timezone-aware formatting
  i18n.js              string tables (en, es, ar)
  app.js               UI controller
  ui/                  icons, charts, map
  notify.js, share.js, astro.js, aqi.js, weather-codes.js
sw.js                  offline app shell + background notification checks
server/server.mjs      optional static server + API-key proxy
```

**Swapping providers:** add a module that implements `getForecast`, `searchLocations`, `reverseGeocode`, `getAirQuality`, `getGrid` (and optionally `getAlerts`). It should return the normalised shapes produced by `open-meteo.js`. Then register it in `providers/index.js` and set `CONFIG.provider`.

**API keys:** no key is needed or shipped. For a keyed provider (OpenWeatherMap, WeatherAPI, Tomorrow.io), run `server/server.mjs` with the key in an environment variable (`OWM_API_KEY`, `WEATHERAPI_KEY`, `TOMORROW_API_KEY`) and call `/api/<provider>/…`. The server adds the key upstream, so it never reaches the browser.

**Rate limits and offline use:**
- Each location's last response is cached.
- Cached data younger than 10 minutes is used without a network call.
- Refreshes happen automatically every 15 minutes. Manual refreshes are ignored if the last fetch was less than a minute ago.
- Search is debounced, and an in-flight search is aborted when a new one starts.
- When offline, or when a fetch fails, the cached forecast stays on screen with a "saved data from …" notice.

## Limitations

- **Native-only features:** websites can't provide OS home-screen widgets, lock-screen widgets or watch complications. The embeddable widget page and the installable PWA are the web equivalents.
- **Alert coverage:** official alerts come from NWS, which covers the US only. Open-Meteo has no global alerts feed. Another regional source can be added as an alerts provider.
- **Background notifications:** true push needs a push server. Here, background checks rely on Periodic Background Sync, which only works in Chromium-based browsers when the site is installed.
- **Radar availability:** RainViewer's free tier limits zoom and may omit nowcast frames. The map then shows only the past frames.
