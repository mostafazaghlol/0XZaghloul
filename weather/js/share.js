// Share current weather as text (Web Share / clipboard) or as a PNG card.

/**
 * @param {{place:string, temp:string, cond:string, high:string, low:string, feels:string,
 *          iconSvg:string, gradient:[string,string], dir:'ltr'|'rtl', updated:string}} info
 * @returns {Promise<Blob>}
 */
export async function renderShareImage(info) {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, info.gradient[0]);
  g.addColorStop(1, info.gradient[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.direction = info.dir;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '600 64px system-ui, sans-serif';
  ctx.fillText(info.place, size / 2, 170, size - 120);

  try {
    const img = new Image();
    const svg = info.iconSvg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    ctx.drawImage(img, size / 2 - 140, 220, 280, 280);
  } catch { /* icon optional */ }

  ctx.font = '700 200px system-ui, sans-serif';
  ctx.fillText(info.temp, size / 2, 700);
  ctx.font = '500 56px system-ui, sans-serif';
  ctx.fillText(info.cond, size / 2, 790, size - 120);
  ctx.font = '400 44px system-ui, sans-serif';
  ctx.fillText(`${info.high}  ·  ${info.low}  ·  ${info.feels}`, size / 2, 870, size - 120);
  ctx.globalAlpha = 0.8;
  ctx.font = '400 32px system-ui, sans-serif';
  ctx.fillText(info.updated, size / 2, 1010, size - 120);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

/** Try Web Share with an image, then text-only, then clipboard. Returns 'shared' | 'copied' | 'downloaded'. */
export async function shareWeather({ text, title, imageInfo }) {
  let file = null;
  if (imageInfo) {
    try {
      const blob = await renderShareImage(imageInfo);
      file = new File([blob], 'weather.png', { type: 'image/png' });
    } catch { /* text only */ }
  }
  if (navigator.share) {
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text, files: [file] });
      } else {
        await navigator.share({ title, text });
      }
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    if (file) download(file);
    return 'copied';
  } catch {
    if (file) { download(file); return 'downloaded'; }
    throw new Error('Sharing is not supported');
  }
}

function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
