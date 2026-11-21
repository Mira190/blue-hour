// How much there is to look at in a still: its tones, read from the picture a player would see (issue 144: SKY GATE's
// hall passed its check as a black wall from edge to edge, because the check measured the floor under the feet and not
// the frame). The PNG is decoded by the page that took it (no decoder among the tools): drawn small on a 2D canvas and
// its luma counted.
//   const { tones, flat } = require('./tone');
//   const t = await tones(page, await page.screenshot());   -> { sd, share, mean }
//     sd     the luma's standard deviation, of 255
//     share  the share of the frame within 6 of its commonest luma (0 to 1)
//     mean   the mean luma
//   flat(t) -> a sentence when the frame is one flat tone (sd under 7, or over 0.85 of it one tone), else ''
async function tones(p, png) {
  return p.evaluate(async b64 => {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = `data:image/png;base64,${b64}`; });
    const w = 160, h = Math.max(1, Math.round(160 * im.height / im.width)), c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, n = w * h, hist = new Array(256).fill(0);
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const l = Math.round(0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]); hist[l]++; s += l; s2 += l * l; }
    let best = 0;
    for (let l = 0; l < 256; l++) { let k = 0; for (let j = Math.max(0, l - 6); j <= Math.min(255, l + 6); j++) k += hist[j]; best = Math.max(best, k); }
    const mean = s / n;
    return { sd: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(1), share: +(best / n).toFixed(3), mean: +mean.toFixed(1) };
  }, png.toString('base64'));
}
const flat = t => (t.sd < 7 ? `its tones are within ${t.sd} of 255 of one another` : t.share > 0.85 ? `${Math.round(t.share * 100)}% of it is one tone` : '');
module.exports = { tones, flat };
