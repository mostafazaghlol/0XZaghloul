// Moon phase and daylight helpers (pure, no network).

const SYNODIC_MONTH = 29.530588853; // days
// Reference new moon: 2000-01-06 18:14 UTC
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 86400000;

const PHASES = [
  'newMoon',
  'waxingCrescent',
  'firstQuarter',
  'waxingGibbous',
  'fullMoon',
  'waningGibbous',
  'lastQuarter',
  'waningCrescent',
];

/**
 * @param {number} ms epoch milliseconds
 * @returns {{age: number, fraction: number, illumination: number, key: string}}
 *   age in days since new moon, fraction 0..1 through the cycle,
 *   illumination 0..1 of the visible disc.
 */
export function moonPhase(ms) {
  const days = (ms - REF_NEW_MOON) / DAY_MS;
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const fraction = age / SYNODIC_MONTH;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const key = PHASES[Math.round(fraction * 8) % 8];
  return { age, fraction, illumination, key };
}

/**
 * Progress of the sun across the sky, clamped to 0..1.
 * Returns null when sunrise/sunset are unavailable (polar day/night).
 */
export function daylightProgress(now, sunrise, sunset) {
  if (!sunrise || !sunset || sunset <= sunrise) return null;
  return Math.min(1, Math.max(0, (now - sunrise) / (sunset - sunrise)));
}
