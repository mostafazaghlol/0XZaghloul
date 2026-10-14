// Locale- and timezone-aware date/time formatting with memoised Intl objects.

const cache = new Map();

function dtf(lang, options) {
  const key = lang + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(lang, options);
    } catch {
      // Unknown timezone etc. — fall back to UTC.
      f = new Intl.DateTimeFormat(lang, { ...options, timeZone: 'UTC' });
    }
    cache.set(key, f);
  }
  return f;
}

const cycle = (tf) => (tf === '24' ? 'h23' : 'h12');

export function formatTime(ms, { lang = 'en', timeFormat = '12', timeZone } = {}) {
  return dtf(lang, { hour: 'numeric', minute: '2-digit', hourCycle: cycle(timeFormat), timeZone }).format(ms);
}

export function formatHour(ms, { lang = 'en', timeFormat = '12', timeZone } = {}) {
  const opts = timeFormat === '24'
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }
    : { hour: 'numeric', hourCycle: 'h12', timeZone };
  return dtf(lang, opts).format(ms);
}

export function formatWeekday(ms, { lang = 'en', timeZone, long = false } = {}) {
  return dtf(lang, { weekday: long ? 'long' : 'short', timeZone }).format(ms);
}

export function formatDate(ms, { lang = 'en', timeZone } = {}) {
  return dtf(lang, { weekday: 'long', month: 'short', day: 'numeric', timeZone }).format(ms);
}

/** Calendar day key (YYYY-MM-DD) of an instant in a timezone. */
export function dayKey(ms, timeZone) {
  return dtf('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(ms);
}

export function formatRelative(ms, { lang = 'en', now = Date.now() } = {}) {
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  let rtf = cache.get(`rtf${lang}`);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    cache.set(`rtf${lang}`, rtf);
  }
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
