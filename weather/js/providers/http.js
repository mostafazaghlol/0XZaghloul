import { CONFIG } from '../config.js';

export class ApiError extends Error {
  /** @param {'offline'|'network'|'timeout'|'http'|'parse'|'api'} kind */
  constructor(kind, message, status) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * fetch + JSON with a timeout and normalised errors.
 * Abort signals from the caller propagate as a regular AbortError.
 */
export async function getJson(url, { signal, fetchImpl = globalThis.fetch, timeoutMs = CONFIG.requestTimeoutMs } = {}) {
  if (globalThis.navigator && navigator.onLine === false) {
    throw new ApiError('offline', 'You appear to be offline');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new ApiError('timeout', 'Request timed out')), timeoutMs);
  const onAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });

  let res;
  try {
    res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: 'application/json, application/geo+json' } });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (ctrl.signal.reason instanceof ApiError) throw ctrl.signal.reason;
    throw new ApiError('network', 'Network request failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.ok ? 'parse' : 'http', `Unexpected response (${res.status})`, res.status);
  }
  if (!res.ok) {
    throw new ApiError('http', body?.reason || body?.detail || `HTTP ${res.status}`, res.status);
  }
  if (body && body.error === true) throw new ApiError('api', body.reason || 'API error');
  return body;
}

export function withQuery(base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return url.toString();
}
