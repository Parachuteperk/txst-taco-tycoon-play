// Live oaks and shrubs: per-pixel sphere-shaded leaf clumps, quantised to a value ramp.
// Wide, low 2:1 canopy, low forked trunk, roughened silhouette, leaf grain, 1px outline.
import { rng, hash2, hex, smooth, clamp, Raster, makeCanvas, outline } from './util.js';

const RAMP = ['#16240F', '#1D2E15', '#22361E', '#2B4724', '#355A29', '#41682D', '#4E7A32', '#628E3A', '#7EA043', '#98B652'].map(hex);
const SHRUB_RAMP = ['#1D2E15', '#26401C', '#2F4F22', '#3A6029', '#477230', '#568538', '#6A9842', '#86AE4E'].map(hex);
const L = (() => {
  const v = [-0.55, -0.7, 0.55], n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

function lobeSet(R, W, H, top, cx) {
  const lobes = [];
  const n = 5 + Math.floor(W / 32);
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const e = (t - 0.5) * 2;
    lobes.push({
      x: cx + e * W * 0.37 + (R() - 0.5) * W * 0.06,
      y: top + H * 0.5 + e * e * H * 0.16 + (R() - 0.5) * H * 0.12,
      r: W * (0.14 + R() * 0.05),
    });
  }
  for (let k = 0; k < 3; k++) lobes.push({ x: cx + (R() - 0.5) * W * 0.5, y: top + H * 0.3, r: W * (0.13 + R() * 0.04) });
  for (let k = 0; k < 3; k++) lobes.push({ x: cx + (R() - 0.5) * W * 0.6, y: top + H * 0.68, r: W * (0.11 + R() * 0.03) });
  for (let k = 0; k < 4; k++) lobes.push({ x: cx + (R() - 0.5) * W * 0.85, y: top + H * (0.74 + R() * 0.1), r: W * (0.06 + R() * 0.03) });
  for (const l of lobes) l.ry = l.r * 0.7;
  return lobes;
}

function paintCanopy(r, R, lobes, seed, top, H, cx, W, ramp) {
  const subs = [];
  for (const l of lobes) {
    const cnt = Math.round((Math.PI * l.r * l.ry) / 9) + 3;
    for (let k = 0; k < cnt; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.92;
      const rx = 1.8 + R() * 2.4;
      subs.push({ x: l.x + Math.cos(a) * d * l.r, y: l.y + Math.sin(a) * d * l.ry, rx, ry: rx * 0.78, l });
    }
  }
  subs.sort((a, b) => a.y - b.y);
  const nr = ramp.length;
  for (const s of subs) {
    const x0 = Math.floor(s.x - s.rx - 2), x1 = Math.ceil(s.x + s.rx + 2);
    const y0 = Math.floor(s.y - s.ry - 2), y1 = Math.ceil(s.y + s.ry + 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - s.x) / s.rx, dy = (y + 0.5 - s.y) / s.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1 + (hash2(x, y, seed) - 0.5) * 0.7) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
        const sub = dx * L[0] + dy * L[1] + nz * L[2];
        const l = s.l;
        const lx = (x - l.x) / l.r, ly = (y - l.y) / l.ry;
        const lnz = Math.sqrt(Math.max(0, 1 - Math.min(1, lx * lx + ly * ly)));
        const lob = lx * L[0] + ly * L[1] + lnz * L[2];
        const g = (y - top) / H;
        const under = smooth(0.5, 1.05, g);
        const gx = (x - cx) / (W * 0.6);
        let v = 0.16 + 0.36 * sub + 0.24 * lob - 0.3 * under - 0.07 * gx + (hash2(x, y, seed + 5) - 0.5) * 0.24;
        if (sub > 0.62 && lob > 0.1 && hash2(x, y, seed + 6) < 0.3) v += 0.16;
        const idx = clamp(Math.floor(v * nr), 0, nr - 1);
        r.put(x, y, ramp[idx]);
      }
    }
  }
  // A few deep gaps where limbs show through.
  for (let k = 0; k < 4; k++) {
    const l = lobes[(R() * lobes.length) | 0];
    const gx = l.x + (R() - 0.5) * l.r, gy = l.y + l.ry * (0.1 + R() * 0.4);
    const rx = 1.5 + R() * 2, ry = 1 + R() * 0.8;
    for (let y = Math.floor(gy - ry); y <= gy + ry; y++)
      for (let x = Math.floor(gx - rx); x <= gx + rx; x++) {
        const dx = (x - gx) / rx, dy = (y - gy) / ry;
        if (dx * dx + dy * dy < 1 + (hash2(x, y, seed + 9) - 0.5) * 0.6 && r.alpha(x, y) > 0) r.put(x, y, ramp[(hash2(x, y, 3) * 2) | 0]);
      }
  }
}

// 1 sp gold rim (#E2C468) on the sun-facing (upper-left) silhouette edge of the canopy.
function goldRim(r, top, H) {
  const RIM = hex('#E2C468'), out = [];
  for (let y = 1; y < r.h - 1; y++) for (let x = 1; x < r.w - 1; x++) {
    if (r.alpha(x, y) < 200 || y > top + H * 0.75) continue;
    if (r.alpha(x - 1, y) === 0 || r.alpha(x, y - 1) === 0 || r.alpha(x - 1, y - 1) === 0) {
      const k = (y * r.w + x) * 4;
      if (r.d[k + 1] > 70 && hash2(x, y, 77) < 0.8) out.push([x, y]);
    }
  }
  for (const [x, y] of out) r.put(x, y, RIM, 0.85);
}

export function makeOak(seed, W, haze = false) {
  const R = rng(seed);
  const H = Math.round(W * 0.58);
  const trunkVis = Math.round(W * 0.19);
  const pad = 12;
  const cw = Math.round(W * 1.22) + pad * 2, top = pad;
  const ay = top + H + trunkVis, ch = ay + 6;
  const ax = Math.round(cw / 2);
  const cv = makeCanvas(cw, ch);
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  // Trunk with root flare, forking low.
  const fw = Math.max(12, W * 0.14), tw = fw * 0.6, forkY = ay - trunkVis - H * 0.12;
  const grad = ctx.createLinearGradient(ax - fw / 2, 0, ax + fw / 2, 0);
  grad.addColorStop(0, '#4E3E2C'); grad.addColorStop(0.45, '#33281C'); grad.addColorStop(1, '#1A140E');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(ax - fw * 0.7, ay);
  ctx.quadraticCurveTo(ax - tw * 0.6, ay - 3, ax - tw / 2, ay - trunkVis * 0.45);
  ctx.lineTo(ax - tw * 0.7, forkY);
  ctx.lineTo(ax + tw * 0.8, forkY);
  ctx.lineTo(ax + tw / 2, ay - trunkVis * 0.45);
  ctx.quadraticCurveTo(ax + tw * 0.6, ay - 3, ax + fw * 0.75, ay);
  ctx.closePath();
  ctx.fill();
  // Low spreading limbs.
  const lobes = lobeSet(R, W, H, top, ax);
  ctx.lineCap = 'round';
  const limbs = lobes.slice(0, 5 + Math.floor(W / 32)).filter((_, k) => k % 2 === 0 || R() < 0.4);
  for (const l of limbs) {
    ctx.strokeStyle = l.x < ax ? '#33281C' : '#221A12';
    ctx.lineWidth = Math.max(3, tw * 0.55);
    ctx.beginPath();
    ctx.moveTo(ax + (l.x < ax ? -2 : 2), forkY + 4);
    ctx.quadraticCurveTo((ax + l.x) / 2, forkY - 4, l.x, l.y + l.ry * 0.3);
    ctx.stroke();
  }
  // Bark streaks.
  ctx.fillStyle = 'rgba(26,18,12,0.5)';
  for (let k = 0; k < 10; k++) ctx.fillRect(Math.round(ax - tw / 2 + R() * tw), Math.round(forkY + R() * trunkVis * 0.4), 1, Math.round(trunkVis * 0.6));
  ctx.fillStyle = 'rgba(160,140,110,0.35)';
  ctx.fillRect(Math.round(ax - tw / 2), Math.round(forkY + 4), 1, Math.round(trunkVis * 0.8));

  const r = new Raster(cw, ch);
  r.d.set(ctx.getImageData(0, 0, cw, ch).data);
  paintCanopy(r, R, lobes, seed, top, H, ax, W, RAMP);
  goldRim(r, top, H);
  // Backlit far trees: darkened warm silhouettes, keeping only the gold rim bright.
  if (haze) { const d = r.d, sil = [58, 44, 36]; for (let k = 0; k < d.length; k += 4) if (d[k + 3] && !(d[k] > 200 && d[k + 1] > 180)) { d[k] = d[k] * 0.45 + sil[0] * 0.55; d[k + 1] = d[k + 1] * 0.45 + sil[1] * 0.55; d[k + 2] = d[k + 2] * 0.45 + sil[2] * 0.55; } }
  ctx.clearRect(0, 0, cw, ch);
  ctx.putImageData(r.img, 0, 0);
  outline(cv);
  const sh = lobes.map((l) => ({ x: l.x - ax, z: ay - l.y, rx: l.r, ry: l.ry }));
  return { canvas: cv, ax, ay, W, H: ay - top, lobes: sh, trunk: fw };
}

export function makeShrub(seed, W, flowers = null) {
  const R = rng(seed);
  const H = Math.round(W * 0.62);
  const pad = 4, cw = Math.round(W * 1.2) + pad * 2, top = pad, ay = top + H + 1, ch = ay + 3;
  const ax = Math.round(cw / 2);
  const cv = makeCanvas(cw, ch);
  const r = new Raster(cw, ch);
  const lobes = [];
  const n = 3 + Math.floor(W / 10);
  for (let k = 0; k < n; k++) {
    const e = n === 1 ? 0 : (k / (n - 1) - 0.5) * 2;
    lobes.push({ x: ax + e * W * 0.32, y: top + H * 0.55 - (1 - e * e) * H * 0.12, r: W * (0.24 + R() * 0.08) });
  }
  for (const l of lobes) l.ry = l.r * 0.8;
  paintCanopy(r, R, lobes, seed, top, H, ax, W, SHRUB_RAMP);
  if (flowers) {
    const fc = flowers.map(hex);
    for (let k = 0; k < W * 2.4; k++) {
      const x = Math.round(ax + (R() - 0.5) * W * 0.95), y = Math.round(top + H * (0.25 + R() * 0.6));
      if (r.alpha(x, y) > 0) r.put(x, y, fc[(R() * fc.length) | 0]);
    }
  }
  cv.getContext('2d', { willReadFrequently: true }).putImageData(r.img, 0, 0);
  outline(cv);
  return { canvas: cv, ax, ay, W };
}
