// Dependency-free SVG chart: temperature line over precipitation-probability
// bars, sharing one time axis.

const NS = 'http://www.w3.org/2000/svg';

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * @param {Array<{time:number,temp:number|null,precipProb:number|null}>} points
 * @param {{width?:number,height?:number,formatTemp:(c:number)=>string,formatLabel:(ms:number)=>string,
 *          labelEvery?:number,mode?:'temp'|'precip'|'both', title:string}} opts
 * @returns {string} SVG markup
 */
export function tempPrecipChart(points, opts) {
  const { width = 720, height = 220, formatTemp, formatLabel, labelEvery = 3, mode = 'both', title = '' } = opts;
  const pad = { t: 26, r: 12, b: 28, l: 12 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const n = points.length;
  if (!n) return '';

  const step = w / n;
  const x = (i) => pad.l + step * i + step / 2;

  const temps = points.map((p) => p.temp).filter((v) => typeof v === 'number');
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const span = Math.max(1, tMax - tMin);
  const yT = (v) => pad.t + h * 0.08 + (h * 0.6) * (1 - (v - tMin) / span);
  const yP = (p) => pad.t + h - (h * (p || 0)) / 100;

  let svg = `<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}" class="chart">`;

  // Precipitation probability bars
  if (mode !== 'temp') {
    points.forEach((p, i) => {
      if (!p.precipProb) return;
      const y = yP(p.precipProb);
      svg += `<rect class="chart-bar" x="${(x(i) - step * 0.35).toFixed(1)}" y="${y.toFixed(1)}" width="${(step * 0.7).toFixed(1)}" height="${(pad.t + h - y).toFixed(1)}" rx="2"/>`;
    });
  }

  // Temperature line + area
  if (mode !== 'precip' && temps.length) {
    const pts = points.map((p, i) => (typeof p.temp === 'number' ? [x(i), yT(p.temp)] : null)).filter(Boolean);
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
    const area = `${line}L${pts[pts.length - 1][0].toFixed(1)} ${pad.t + h}L${pts[0][0].toFixed(1)} ${pad.t + h}Z`;
    svg += `<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>`;
    points.forEach((p, i) => {
      if (i % labelEvery || typeof p.temp !== 'number') return;
      svg += `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${yT(p.temp).toFixed(1)}" r="3"/>`;
      svg += `<text class="chart-val" x="${x(i).toFixed(1)}" y="${(yT(p.temp) - 8).toFixed(1)}" text-anchor="middle">${esc(formatTemp(p.temp))}</text>`;
    });
  }

  if (mode === 'precip') {
    points.forEach((p, i) => {
      if (i % labelEvery || !p.precipProb) return;
      svg += `<text class="chart-val" x="${x(i).toFixed(1)}" y="${(yP(p.precipProb) - 5).toFixed(1)}" text-anchor="middle">${p.precipProb}%</text>`;
    });
  }

  // Time axis labels
  points.forEach((p, i) => {
    if (i % labelEvery) return;
    svg += `<text class="chart-axis" x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle">${esc(formatLabel(p.time))}</text>`;
  });

  return `${svg}</svg>`;
}
