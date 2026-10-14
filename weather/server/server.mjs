#!/usr/bin/env node
// Tiny zero-dependency static server + API proxy.
//
// The site works as plain static files (e.g. GitHub Pages) with Open-Meteo,
// which needs no key. If you switch to a keyed provider, run this server and
// set CONFIG.proxyBase = '/api' so requests go through here; the key is added
// server-side from an environment variable and never reaches the browser.
//
//   OWM_API_KEY=... WEATHERAPI_KEY=... TOMORROW_API_KEY=... node server/server.mjs
//
//   GET /api/<provider>/<path>?<query>  ->  https://<upstream>/<path>?<query>&<key>

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const UPSTREAMS = {
  owm: { base: 'https://api.openweathermap.org', keyParam: 'appid', env: 'OWM_API_KEY' },
  weatherapi: { base: 'https://api.weatherapi.com', keyParam: 'key', env: 'WEATHERAPI_KEY' },
  tomorrow: { base: 'https://api.tomorrow.io', keyParam: 'apikey', env: 'TOMORROW_API_KEY' },
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Simple per-IP rate limit for the proxy: 60 requests / minute.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 60;
}

async function proxy(req, res, url) {
  const [, , name, ...rest] = url.pathname.split('/');
  const up = UPSTREAMS[name];
  if (!up) { res.writeHead(404).end('Unknown provider'); return; }
  const key = process.env[up.env];
  if (!key) { res.writeHead(503).end(`${up.env} is not configured`); return; }
  if (rateLimited(req.socket.remoteAddress)) { res.writeHead(429).end('Too many requests'); return; }
  const target = new URL(`/${rest.join('/')}`, up.base);
  url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  target.searchParams.set(up.keyParam, key);
  try {
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } });
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'public, max-age=300' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.writeHead(502).end('Upstream error');
  }
}

async function serveStatic(res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(301, { Location: `${url.pathname}/` }).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return proxy(req, res, url);
    return serveStatic(res, url);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(`Weather site on http://localhost:${PORT}/`));
}
