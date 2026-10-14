// Inline SVG weather icons (64×64 viewBox). Decorative: callers supply the
// accessible label separately.

const SUN = '<circle cx="32" cy="32" r="11" fill="#FFC83D"/><g stroke="#FFC83D" stroke-width="4" stroke-linecap="round"><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/></g>';
const MOON = '<path d="M40 12a20 20 0 1 0 12 30A16 16 0 0 1 40 12z" fill="#E6E9F5"/>';
const CLOUD = (y = 0, fill = '#F2F5FA', stroke = '#9AA6B8') =>
  `<path transform="translate(0 ${y})" d="M20 46h26a10 10 0 0 0 1-20 14 14 0 0 0-27-2 11 11 0 0 0 0 22z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const SMALL_SUN = '<g transform="translate(-6 -8) scale(.7)"><circle cx="32" cy="32" r="11" fill="#FFC83D"/><g stroke="#FFC83D" stroke-width="4" stroke-linecap="round"><path d="M32 12v5M12 32h5M18 18l4 4M46 18l-4 4"/></g></g>';
const SMALL_MOON = '<g transform="translate(-4 -6) scale(.65)"><path d="M40 12a20 20 0 1 0 12 30A16 16 0 0 1 40 12z" fill="#E6E9F5"/></g>';
const DROPS = (n = 3, len = 7) => {
  const xs = [22, 32, 42].slice(0, n);
  return `<g stroke="#4DA3FF" stroke-width="3" stroke-linecap="round">${xs.map((x) => `<path d="M${x} 50l-2 ${len}"/>`).join('')}</g>`;
};
const FLAKES = '<g fill="#DDEBFF" stroke="#7FA7D9" stroke-width="1"><circle cx="22" cy="54" r="3"/><circle cx="32" cy="58" r="3"/><circle cx="42" cy="54" r="3"/></g>';
const BOLT = '<path d="M34 42l-8 12h7l-3 9 10-13h-7l4-8z" fill="#FFD43B" stroke="#C99700" stroke-width="1"/>';
const FOG = '<g stroke="#B6C0CE" stroke-width="4" stroke-linecap="round"><path d="M12 50h40M16 57h32"/></g>';

const ICONS = {
  clear: (day) => (day ? SUN : MOON),
  partly: (day) => (day ? SMALL_SUN : SMALL_MOON) + CLOUD(4),
  cloudy: () => CLOUD(-6, '#D5DCE6', '#8A96A8') + CLOUD(2),
  fog: () => CLOUD(-6) + FOG,
  drizzle: () => CLOUD(-6) + DROPS(3, 4),
  rain: () => CLOUD(-6) + DROPS(3, 8),
  snow: () => CLOUD(-8) + FLAKES,
  storm: () => CLOUD(-8, '#C3CAD6', '#6B7787') + BOLT,
};

export function iconSvg(name, isDay = true, size = 48) {
  const draw = ICONS[name] || ICONS.cloudy;
  return `<svg class="wx-icon" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${draw(isDay)}</svg>`;
}

/** Small UI glyphs (stroke icons using currentColor). */
const GLYPHS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  warning: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  drop: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/>',
  wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/>',
  umbrella: '<path d="M23 12a11 11 0 0 0-22 0zM12 12v8a2 2 0 0 0 4 0"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>',
  arrow: '<path d="M12 3v18M6 9l6-6 6 6"/>',
};

export function glyph(name, size = 20) {
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPHS[name] || ''}</svg>`;
}
