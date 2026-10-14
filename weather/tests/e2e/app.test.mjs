// UI tests for the main flows, in headless Chromium with every external API
// mocked (see tests/fixtures.mjs). Run: npm run test:e2e

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from '../../server/server.mjs';
import { forecastJson, geocodingJson, airQualityJson, nwsAlertsJson } from '../fixtures.mjs';

let server;
let browser;
let base;

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** New context with all third-party traffic mocked. */
async function newPage({ geolocation, failApi = false, locale = 'en-GB', apiCalls } = {}) {
  const context = await browser.newContext({
    locale,
    serviceWorkers: 'block',
    viewport: { width: 400, height: 860 },
    ...(geolocation ? { geolocation, permissions: ['geolocation'] } : {}),
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    apiCalls?.push(url.hostname + url.pathname);
    if (failApi) return route.abort('internetdisconnected');
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    switch (url.hostname) {
      case 'api.open-meteo.com': {
        const lat = Number(url.searchParams.get('latitude'));
        return json(forecastJson({ baseTemp: lat > 35 ? 10 : 24, rainSoon: lat > 35 }));
      }
      case 'geocoding-api.open-meteo.com': return json(geocodingJson);
      case 'air-quality-api.open-meteo.com': return json(airQualityJson);
      case 'api.weather.gov': return json(nwsAlertsJson());
      case 'api.bigdatacloud.net': return json({ city: 'Testville', principalSubdivision: 'Test State', countryName: 'Egypt', countryCode: 'EG' });
      default: return route.abort();
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.errors = errors;
  return page;
}

async function searchAndPick(page, query, index = 0) {
  await page.fill('#search-input', query);
  const option = page.locator('#search-results [role="option"]').nth(index);
  await option.waitFor();
  await option.click();
  await page.locator('#weather').waitFor();
}

test('first visit without location permission explains, then shows the empty state', async () => {
  const page = await newPage();
  await page.goto(base);
  const dlg = page.locator('#dlg-geo');
  await dlg.waitFor();
  assert.match(await dlg.textContent(), /Use your location\?/);
  await page.click('[data-geo="no"]');
  await page.locator('#state-empty').waitFor();
  assert.equal(await page.locator('#state-empty h1').textContent(), 'Find your weather');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('search with autocomplete shows current conditions, hourly and daily forecasts', async () => {
  const calls = [];
  const page = await newPage({ apiCalls: calls });
  await page.goto(base);
  await page.click('[data-geo="no"]');

  // Debounced: typing quickly fires only one geocoding request.
  await page.locator('#search-input').pressSequentially('Cair', { delay: 30 });
  await page.locator('#search-results [role="option"]').first().waitFor();
  assert.equal(calls.filter((c) => c.startsWith('geocoding')).length, 1);
  assert.equal(await page.locator('#search-results [role="option"]').count(), 2);

  // Keyboard selection
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.locator('#weather').waitFor();

  assert.equal(await page.textContent('#place-name'), 'Cairo');
  assert.equal(await page.textContent('#hero-temp'), '24°');
  assert.equal(await page.textContent('#hero-cond'), 'Partly cloudy');
  assert.match(await page.textContent('#hero-feels'), /Feels like 25°/);
  assert.match(await page.textContent('#hero-hilo'), /H 30°\s+L 18°/);
  assert.match(await page.textContent('#quick-stats'), /55%/);
  assert.match(await page.textContent('#quick-stats'), /14 km\/h NW/);
  assert.ok((await page.locator('#hourly li').count()) >= 24);
  assert.equal(await page.locator('#daily li').count(), 10);
  assert.equal(await page.textContent('#h-daily'), '10-day forecast');
  assert.match(await page.textContent('#aqi'), /87/);
  assert.match(await page.textContent('#aqi'), /Moderate/);
  assert.match(await page.textContent('#aqi'), /PM2\.5/);
  assert.match(await page.textContent('#pollen'), /Olive/);
  assert.match(await page.textContent('#details'), /1,013 hPa/);
  assert.match(await page.textContent('#updated'), /Updated/);
  assert.equal(await page.locator('#alerts .alert').count(), 0, 'no NWS alerts outside the US');
  assert.equal(calls.filter((c) => c.startsWith('api.weather.gov')).length, 0);

  // Current conditions are visible without scrolling.
  for (const sel of ['#hero-temp', '#hero-cond', '#hero-hilo', '#quick-stats']) {
    const box = await page.locator(sel).boundingBox();
    assert.ok(box.y + box.height <= 860, `${sel} above the fold`);
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('unit and time-format settings update the display', async () => {
  const page = await newPage();
  await page.goto(base);
  await page.click('[data-geo="no"]');
  await searchAndPick(page, 'Cairo');

  await page.click('#btn-settings');
  await page.selectOption('select[name="tempUnit"]', 'f');
  await page.selectOption('select[name="windUnit"]', 'ms');
  await page.selectOption('select[name="pressureUnit"]', 'inHg');
  await page.selectOption('select[name="timeFormat"]', '24');
  await page.keyboard.press('Escape');

  assert.equal(await page.textContent('#hero-temp'), '75°');
  assert.match(await page.textContent('#quick-stats'), /4\.0 m\/s/);
  assert.match(await page.textContent('#details'), /29\.92 inHg/);
  assert.match(await page.textContent('#sun'), /06:00/);

  // Persisted across reloads
  await page.reload();
  await page.locator('#weather').waitFor();
  assert.equal(await page.textContent('#hero-temp'), '75°');
  await page.context().close();
});

test('favourites: save, switch, reorder, delete; US location shows official alerts', async () => {
  const page = await newPage();
  await page.goto(base);
  await page.click('[data-geo="no"]');

  await searchAndPick(page, 'Cairo', 0);
  await page.click('#btn-fav');
  assert.equal(await page.getAttribute('#btn-fav', 'aria-pressed'), 'true');

  await searchAndPick(page, 'Cairo', 1); // Cairo, Illinois
  await page.click('#btn-fav');
  assert.match(await page.textContent('#place-sub'), /Illinois/);
  await page.locator('#alerts .alert').first().waitFor();
  assert.equal(await page.locator('#alerts .alert').count(), 2, 'expired alert filtered out');
  assert.match(await page.locator('#alerts .alert').first().textContent(), /Tornado Warning/);
  assert.equal(await page.isVisible('#rain-banner'), true);
  assert.match(await page.textContent('#rain-banner'), /Rain starting in about/);

  // Pager: two locations, switch back with a dot.
  assert.equal(await page.locator('#pager .dot').count(), 2);
  await page.locator('#pager .dot').first().click();
  await page.waitForFunction(() => document.querySelector('#place-sub').textContent.includes('Egypt'));

  // Locations list: local times, reorder and delete.
  await page.click('#btn-locations');
  const names = () => page.locator('#loc-list .loc-name').allTextContents();
  assert.deepEqual((await names()).map((s) => s.trim()), ['Cairo', 'Cairo']);
  assert.match(await page.textContent('#loc-list'), /Local time/);
  const firstSub = await page.locator('#loc-list .loc-sub').first().textContent();
  assert.match(firstSub, /Egypt/);
  await page.locator('#loc-list [data-act="down"]').first().click();
  assert.match(await page.locator('#loc-list .loc-sub').first().textContent(), /Illinois/);
  await page.locator('#loc-list [data-act="delete"]').first().click();
  assert.equal(await page.locator('#loc-list .loc').count(), 1);
  await page.locator('#loc-list [data-act="open"]').first().click();
  assert.match(await page.textContent('#place-sub'), /Egypt/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('tapping a day opens hourly details for that day', async () => {
  const page = await newPage();
  await page.goto(base);
  await page.click('[data-geo="no"]');
  await searchAndPick(page, 'Cairo');
  await page.locator('#daily .day').nth(2).click();
  await page.locator('#dlg-day[open]').waitFor();
  assert.equal(await page.locator('#day-table tr').count(), 24);
  assert.ok(await page.locator('#day-chart svg').count());
  await page.click('#dlg-day [data-close]');
  assert.equal(await page.locator('#dlg-day[open]').count(), 0);
  await page.context().close();
});

test('GPS location loads directly when permission is granted', async () => {
  const page = await newPage({ geolocation: { latitude: 30.05, longitude: 31.23 } });
  await page.goto(base);
  await page.locator('#weather').waitFor();
  assert.equal(await page.textContent('#place-name'), 'Testville');
  assert.match(await page.textContent('#place-sub'), /My location/);
  assert.equal(await page.isHidden('#btn-fav'), true);
  await page.context().close();
});

test('offline / failed refresh keeps showing cached data, flagged as stale', async () => {
  const page = await newPage();
  await page.goto(base);
  await page.click('[data-geo="no"]');
  await searchAndPick(page, 'Cairo');
  await page.click('#btn-fav');

  // Age the cache so a refetch is attempted, then make every API call fail.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('wx.cache.')) continue;
      const v = JSON.parse(localStorage.getItem(k));
      v.savedAt -= 2 * 3600e3;
      localStorage.setItem(k, JSON.stringify(v));
    }
  });
  await page.context().unrouteAll({ behavior: 'ignoreErrors' });
  await page.context().route('**/*', (route) => (new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort('internetdisconnected')));
  await page.reload();
  await page.locator('#status-banner:not([hidden])').waitFor();
  assert.match(await page.textContent('#status-banner'), /Showing saved data from 2 hours ago/);
  assert.equal(await page.textContent('#hero-temp'), '24°');
  await page.context().close();
});

test('error state with retry when there is no cached data', async () => {
  const page = await newPage({ failApi: true });
  await page.goto(`${base}?lat=30.04&lon=31.24&name=Cairo`);
  await page.locator('#state-error:not([hidden])').waitFor();
  assert.match(await page.textContent('#error-message'), /didn’t respond/);
  assert.equal(await page.isVisible('#btn-retry'), true);
  await page.context().close();
});

test('Arabic switches to right-to-left with translated UI', async () => {
  const page = await newPage();
  await page.goto(base);
  await page.click('[data-geo="no"]');
  await searchAndPick(page, 'Cairo');
  await page.click('#btn-settings');
  await page.selectOption('select[name="lang"]', 'ar');
  await page.keyboard.press('Escape');
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  assert.equal(await page.getAttribute('html', 'lang'), 'ar');
  assert.equal(await page.textContent('#h-hourly'), 'التوقعات كل ساعة');
  assert.equal(await page.textContent('#hero-cond'), 'غائم جزئيًا');
  await page.context().close();
});

test('dark theme setting applies', async () => {
  const page = await newPage();
  await page.goto(base);
  await page.click('[data-geo="no"]');
  await page.click('#btn-settings');
  await page.selectOption('select[name="theme"]', 'dark');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.selectOption('select[name="theme"]', 'system');
  assert.equal(await page.getAttribute('html', 'data-theme'), null);
  await page.context().close();
});

test('widget renders small/medium/large sizes', async () => {
  const page = await newPage();
  for (const [size, hours, days] of [['small', 0, 0], ['medium', 6, 0], ['large', 6, 5]]) {
    await page.goto(`${base}widget.html?lat=30.04&lon=31.24&name=Cairo&size=${size}`);
    await page.locator('#root .temp').waitFor();
    assert.equal(await page.textContent('#root .name'), 'Cairo');
    assert.equal(await page.locator('#root .hours > div').count(), hours);
    assert.equal(await page.locator('#root .days > div').count(), days);
  }
  await page.context().close();
});

test('map degrades gracefully when the map library cannot load', async () => {
  const page = await newPage(); // cdnjs is not mocked, so Leaflet fails to load
  await page.goto(base);
  await page.click('[data-geo="no"]');
  await searchAndPick(page, 'Cairo');
  await page.click('#btn-map');
  await page.locator('#map .map-status:not([hidden])').waitFor();
  assert.equal(await page.textContent('#map .map-status'), 'The map could not be loaded.');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
