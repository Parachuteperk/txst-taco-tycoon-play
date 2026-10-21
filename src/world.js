// Static world: layout around the stand (origin O = tile 0,0), baked ground + sky + static shadows + dapple,
// and the list of static sprites that join the per-frame Y-sort.
import { rng, hex, mix, makeCanvas, hull, noise2, fbm } from './util.js';
import { iso } from './iso.js';
import { BIG_LINE_PATH } from './queue.js';
import { renderGround } from './ground.js';
import { makeOak, makeShrub } from './oak.js';
import { makeOldMain, OM } from './oldmain.js';
import { buildStand, ST } from './stand.js';
import { makeStatue, makeLamp, makeBench, makeBin, makeBlanket, makeSoonSign } from './props.js';

export const WORLD = { x0: -820, y0: -470, w: 1640, h: 1000 };
export const HORIZON = -100;
export const OLD_MAIN_AT = [2.43, -14.03];
export const STATUE_AT = [5.5, 10];
export const SPOT2 = { i0: 13.4, i1: 17.2, j0: -2.2, j1: 1.4 }; // reserved expansion-stand patch

export const LAYOUT = {
  paths: [
    { along: 'i', perp: [3.4, 5.8], range: [-90, 90] },
    { along: 'j', perp: [9.93, 11.93], range: [-4.6, 90] },
    { along: 'j', perp: [4.6, 6.4], range: [5.6, 7.0] },
    { along: 'i', perp: [-4.5, -3.3], range: [-3, 22] },
  ],
  plazas: [
    { kind: 'stone', ci: STATUE_AT[0], cj: STATUE_AT[1], r: 3.4 },
    { kind: 'brick', i0: -4.2, i1: 9.4, j0: -2.8, j1: 3.42 },
    { kind: 'brick', ...SPOT2 },
    { kind: 'brick', i0: 4.6, i1: 6.4, j0: 3.0, j1: 8.0 },
  ],
  beds: [
    { i0: 2.63, i1: 9.63, j0: -6.65, j1: -5.5 },
    { i0: 12.13, i1: 13.83, j0: -6.65, j1: -5.5 },
    { i0: -1.6, i1: 1.6, j0: 7.4, j1: 14.5 },
    { i0: 13.2, i1: 21.5, j0: 2.2, j1: 3.3 },
    { i0: -9, i1: -4.6, j0: 7.2, j1: 8.6 },
    { i0: 6.8, i1: 9.0, j0: 13.4, j1: 18.5 },
    { i0: -1.6, i1: 2.0, j0: -8.0, j1: -6.9 },
    { i0: 4.4, i1: 9.4, j0: -3.2, j1: -2.4 },
    { i0: -12, i1: -6.5, j0: -1.2, j1: 0.2 },
    { i0: -6.6, i1: -5.2, j0: -7.5, j1: -3.8 },
    { i0: 0.6, i1: 4.2, j0: 15.2, j1: 18.8 },
    { i0: 12.6, i1: 15.6, j0: 9.2, j1: 13.8 },
    { i0: 14.2, i1: 24, j0: 6.2, j1: 7.6 },
    { i0: -8.0, i1: -4.4, j0: -3.0, j1: -1.6 },
    { i0: -5.0, i1: -3.6, j0: -8.0, j1: -5.0 },
    { i0: 2.0, i1: 5.0, j0: 11.5, j1: 12.6 },
  ],
};

// Walk lanes (tile coords) for ambient students; the queue keeps the j=4.6 line on path A.
export const NAV = {
  queue: [[-0.9, 1.6], [-0.6, 2.35], [-0.4, 3.1], [-0.25, 3.85], [-0.1, 4.6], [7.4, 4.6], [13.5, 4.6]],
  pickup: [[7.5, -0.45], [8.15, 0.0], [7.65, 0.4], [8.3, 0.8], [7.95, 1.15]],
  exitA: [[9.0, 0.9], [9.0, 5.3]],
  lanes: [
    { pts: [[-40, 6.7], [40, 6.7]] }, { pts: [[40, 7.5], [-40, 7.5]] },
    { pts: [[10.5, -4.4], [10.5, 40]] }, { pts: [[11.3, 40], [11.3, -4.4]] },
    { pts: [[5.5, 5.8], [5.5, 6.5], [2.9, 8.4], [2.9, 12.0], [5.5, 13.7], [5.5, 30]] },
  ],
  bins: [[9.4, 2.7], [-3.4, 3.15]],
  blankets: [[-9.6, 6.6], [-8.9, -4.5], [14.2, 15.0]],
  stairs: [10.93, -4.53],
};

export const SHADOW = '#8C5830';
export const SH_DIR = [0.944, 0.33];

export function buildWorld({ bigLine = false } = {}) {
  const t0 = performance.now();
  const W = { ...WORLD, h: 1800 };
  const layout = bigLine ? { ...LAYOUT, paths: [...LAYOUT.paths] } : LAYOUT;
  if (bigLine) for (let n = 5; n < BIG_LINE_PATH.length - 1; n++) {
    const a = BIG_LINE_PATH[n], b = BIG_LINE_PATH[n + 1], alongI = a[1] === b[1];
    const fixed = alongI ? a[1] : a[0];
    layout.paths.push({ along: alongI ? 'i' : 'j', perp: [fixed - 0.85, fixed + 0.85], range: [Math.min(alongI ? a[0] : a[1], alongI ? b[0] : b[1]) - 0.85, Math.max(alongI ? a[0] : a[1], alongI ? b[0] : b[1]) + 0.85] });
  }
  const wx = (i, j, z = 0) => { const p = iso(i, j, z); return [p[0] - W.x0, p[1] - W.y0]; };
  const ground = renderGround(W, layout, 5).canvas;
  const g = ground.getContext('2d');

  // --- Sky above the horizon: warm sunset gradient, low sun at the upper left, a hazy San Marcos skyline.
  const hy = HORIZON - W.y0;
  const sky = g.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#9A5A8A'); sky.addColorStop(0.4, '#C9899B'); sky.addColorStop(0.75, '#F4A27C'); sky.addColorStop(1, '#FFC070');
  g.fillStyle = sky; g.fillRect(0, 0, W.w, hy + 2);
  const sun = wx(-11, -1.5); sun[1] = hy - 26;
  const sg = g.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], 160);
  sg.addColorStop(0, 'rgba(255,248,214,1)'); sg.addColorStop(0.12, 'rgba(255,236,170,0.95)'); sg.addColorStop(0.4, 'rgba(255,196,110,0.35)'); sg.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = sg; g.fillRect(0, 0, W.w, hy + 2);
  g.fillStyle = 'rgba(206,132,120,0.35)';
  const SR = rng(12);
  for (let x = 0; x < W.w; x += 30 + SR() * 60) {
    const bh = 4 + SR() * 12, bw = 10 + SR() * 18;
    g.fillRect(Math.round(x), Math.round(hy - bh), Math.round(bw), Math.round(bh + 2));
    if (SR() < 0.3) g.fillRect(Math.round(x + bw / 2 - 1), Math.round(hy - bh - 6), 3, 6);
  }
  const CR = rng(481);
  for (let n = 0; n < 85; n++) {
    const cx = CR() * W.w, cy = hy - 15 - CR() * 155, rw = 12 + CR() * 48;
    for (let k = 0; k < 7; k++) {
      const x = Math.round(cx + k * rw / 5), y = Math.round(cy + Math.sin(k * 1.7 + n) * 3);
      g.fillStyle = k % 3 ? '#EA9B89' : '#CE8A92';
      g.fillRect(x, y, Math.round(rw / 3), 2 + Math.round(CR() * 3));
      g.fillStyle = '#FFD08F'; g.fillRect(x + 2, y + 4, Math.round(rw / 4), 1);
    }
  }
  // Atmospheric haze just below the horizon.
  const hz = g.createLinearGradient(0, hy, 0, hy + 70);
  hz.addColorStop(0, 'rgba(255,170,100,0.25)'); hz.addColorStop(1, 'rgba(255,170,100,0)');
  g.fillStyle = hz; g.fillRect(0, hy, W.w, 40);

  // --- Shadow layer (opaque, multiplied in later) and dapple spot layers.
  const shadow = makeCanvas(W.w, W.h), sx = shadow.getContext('2d', { willReadFrequently: true });
  sx.fillStyle = sx.strokeStyle = SHADOW;
  const canopyMask = makeCanvas(W.w, W.h), cm = canopyMask.getContext('2d', { willReadFrequently: true });
  cm.fillStyle = '#fff';
  const ell = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  const poly = (pts) => { const h = hull(pts); sx.beginPath(); h.forEach((p, k) => (k ? sx.lineTo(...p) : sx.moveTo(...p))); sx.closePath(); sx.fill(); };
  const off = (h) => [SH_DIR[0] * h * 0.55, SH_DIR[1] * h * 0.55];
  const boxShadow = (i0, i1, j0, j1, h) => {
    const o = off(h), pts = [];
    for (const [i, j] of [[i0, j0], [i1, j0], [i1, j1], [i0, j1]]) { const p = wx(i, j); pts.push(p, [p[0] + o[0], p[1] + o[1]]); }
    poly(pts);
  };

  const statics = [];
  const add = (spr, i, j, key = null, extra = {}) => {
    const p = wx(i, j);
    statics.push({ c: spr.canvas, x: Math.round(p[0] - spr.ax), y: Math.round(p[1] - spr.ay), key: key ?? p[1], ...extra });
  };

  // --- Old Main.
  const om = makeOldMain();
  const [oi, oj] = OLD_MAIN_AT;
  add({ canvas: om.canvas, ax: om.ox, ay: om.oy }, oi, oj, HORIZON + 5 - W.y0, { landmark: true });
  boxShadow(oi, oi + OM.Li, oj, oj + OM.Lj, OM.H + OM.R * 0.6);

  // --- Stand pieces + Antonio's table + A-frame.
  const st = buildStand();
  const S = (c) => ({ canvas: c, ax: st.ox, ay: st.oy });
  add(S(st.backPiece), 0, 0, wx(0, ST.back)[1] - 1);
  add(S(st.cooler), 0, 0, wx(5.95, -0.6)[1]);
  add(S(st.counter), 0, 0, wx(5.4, 0.2)[1] + 1, { counter: true });
  add(S(st.aframe), 0, 0, wx(-1.5, 0.25)[1]);
  add(S(st.table), 0, 0, wx(-2.85, -0.5)[1]);
  boxShadow(0, ST.len, ST.back - 0.1, ST.back + 0.05, ST.boardH);
  boxShadow(0, ST.len, ST.cBack, ST.cFront, ST.cTop);

  // --- Statue.
  const statue = makeStatue();
  add(statue, ...STATUE_AT);
  {
    const p = wx(...STATUE_AT), pts = [];
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const c = [p[0] + Math.cos(a) * 30, p[1] + Math.sin(a) * 15];
      const o = off(36);
      pts.push(c, [c[0] + o[0], c[1] + o[1]]);
    }
    poly(pts);
    const o = off(110);
    ell(sx, p[0] + o[0] * 0.75, p[1] + o[1] * 0.75, 30, 9, 0.3);
  }

  // --- Oaks: framing trees (none over the work rect), back tree line along the horizon, margin fill.
  const oaks = new Map();
  const oak = (w, seed, haze = false) => {
    const k = `${w}:${seed}:${haze}`;
    if (!oaks.has(k)) oaks.set(k, makeOak(seed, w, haze));
    return oaks.get(k);
  };
  const trees = [];
  const plant = (i, j, w, seed, opts = {}) => {
    if (bigLine && nearExperimentalWalk(i, j, 2.3)) return;
    const t = oak(w, seed);
    add(t, i, j, null, { tree: true, ...opts });
    const p = wx(i, j);
    trees.push({ i, j, x: p[0], y: p[1], t });
    for (const l of t.lobes) {
      const o = off(l.z * 0.9);
      ell(sx, p[0] + l.x + o[0], p[1] + o[1] * 0.6 + 6, l.rx * 1.05, l.ry * 0.55);
      ell(cm, p[0] + l.x + o[0], p[1] + o[1] * 0.6 + 6, l.rx * 1.05, l.ry * 0.55);
    }
    sx.lineWidth = t.trunk * 0.8; sx.lineCap = 'round';
    const o = off(t.H * 0.5);
    sx.beginPath(); sx.moveTo(p[0], p[1]); sx.lineTo(p[0] + o[0], p[1] + o[1]); sx.stroke();
  };
  const FRAME_TREES = [[0, -6.2, 200, 3], [-10.5, -4.5, 200, 5], [-13.5, 1.5, 200, 2], [-10, 9.5, 180, 4], [16.2, -11, 200, 6], [-7.5, -8.5, 125, 14], [-14, -1, 135, 16], [-17, 12, 190, 1], [24, 2, 200, 7]];
  for (const [i, j, w, s] of FRAME_TREES) plant(i, j, w, s, { portraitShiftX: i === 0 ? -65 : 0 });
  const BR = rng(31);
  for (let x = -780; x < 840; x += 120 + BR() * 70) {
    const y = HORIZON + 2 + BR() * 6;
    const t = oak(80 + ((BR() * 3) | 0) * 14, 21 + ((BR() * 4) | 0), true);
    const p = [x - W.x0, y - W.y0];
    statics.push({ c: t.canvas, x: Math.round(p[0] - t.ax), y: Math.round(p[1] - t.ay), key: p[1] - 40, tree: true });
  }
  const MR = rng(9);
  for (let y = HORIZON + 40; y < W.y0 + W.h + 100; y += 70) {
    for (let x = W.x0 + 30; x < W.x0 + W.w; x += 130) {
      const px = x + (MR() - 0.5) * 70, py = y + (MR() - 0.5) * 30;
      if (px > -330 && px < 470 && py < 330) continue;
      const i = (px / 16 + py / 8) / 2, j = (py / 8 - px / 16) / 2;
      if (nearPath(i, j, 1.5) || (bigLine && nearExperimentalWalk(i, j, 2.3))) continue;
      plant(i, j, 170 + ((MR() * 3) | 0) * 15, 1 + ((MR() * 7) | 0));
    }
  }

  // --- Beds: flowering shrubs; low foreground bushes.
  const SH = [makeShrub(201, 24, ['#E86A8A', '#F3EEE4', '#F2C14E']), makeShrub(202, 28, ['#E04A5A', '#F3E6C8']), makeShrub(203, 22, ['#F2C14E', '#F7E08A']), makeShrub(204, 26, ['#C08AD8', '#F3EEE4', '#E86A8A'])];
  const FR = rng(77);
  for (const b of LAYOUT.beds) {
    for (let i = b.i0 + 0.4; i < b.i1 - 0.2; i += 0.9 + FR() * 0.4)
      for (let j = b.j0 + 0.4; j < b.j1 - 0.2; j += 0.9 + FR() * 0.4) {
        const s = SH[(FR() * SH.length) | 0];
        if (bigLine && nearExperimentalWalk(i, j, 1.4)) continue;
        add(s, i, j);
        const p = wx(i, j);
        ell(sx, p[0] + 8, p[1] + 3, s.W * 0.6, s.W * 0.2);
      }
  }

  // --- Lamps (with TXST banners), benches, bins, blankets, the reserved second-stand spot.
  const lampL = makeLamp(false), lampR = makeLamp(true);
  const lamps = [[-4.0, 3.1, lampL], [9.75, 1.0, lampR], [8.9, -3.0, lampL], [14.1, 6.0, lampR], [-1.8, 6.1, lampL], [20.5, 3.15, lampL], [8.8, 13.9, lampR]];
  const glows = [];
  for (const [i, j, l] of lamps) {
    add(l, i, j);
    const p = wx(i, j);
    glows.push({ x: p[0] - l.ax + l.glow[0], y: p[1] - l.ay + l.glow[1], r: 24, kind: 'lamp' });
    glows.push({ x: p[0], y: p[1] - 2, r: 26, kind: 'pool' });
    sx.lineWidth = 2; const o = off(60); sx.beginPath(); sx.moveTo(...p); sx.lineTo(p[0] + o[0], p[1] + o[1]); sx.stroke();
  }
  const bI = makeBench(true), bJ = makeBench(false);
  for (const [i, j, b] of [[15.4, -6.3, bI], [-8.5, 6.0, bI], [9.2, 14.6, bI], [12.6, -4.4, bI], [-10.5, -3.0, bI], [16.2, 18.4, bI]]) {
    add(b, i, j, wx(i + b.L[0] * 0.5, j)[1]);
    boxShadow(i, i + b.L[0], j, j + b.L[1], 16);
  }
  const bin = makeBin();
  for (const [i, j] of NAV.bins) { add(bin, i, j); boxShadow(i, i + 0.5, j, j + 0.5, 14); }
  NAV.blankets.forEach(([i, j], k) => add(makeBlanket(['#C23B48', '#2E8A87', '#E3B341'][k]), i, j, wx(i, j)[1] - 30));
  const sign = makeSoonSign();
  add(sign, SPOT2.i0 + 2.0, SPOT2.j0 + 1.2);

  // --- Dapple: punch light holes into tree shadows, plus two shimmer states of warm spots.
  const dapple = [makeCanvas(W.w, W.h), makeCanvas(W.w, W.h)];
  {
    const md = cm.getImageData(0, 0, W.w, W.h).data;
    const sd = sx.getImageData(0, 0, W.w, W.h);
    const dd = dapple.map((c) => c.getContext('2d').createImageData(W.w, W.h));
    for (let y = 0; y < W.h; y += 1) for (let x = 0; x < W.w; x += 1) {
      const k = (y * W.w + x) * 4;
      if (!md[k + 3] || y < hy + 70) continue;
      const n = fbm(x * 0.19, y * 0.3, 3, 2);
      if (n > 0.7) sd.data[k + 3] = 0;
      for (let s = 0; s < 2; s++) {
        const n2 = fbm(x * 0.19 + s * 0.9, y * 0.3 + s * 0.5, 3, 2);
        if (n2 > 0.68) { const q = dd[s].data; q[k] = 255; q[k + 1] = 216; q[k + 2] = 146; q[k + 3] = 255 * 0.22; }
      }
    }
    sx.putImageData(sd, 0, 0);
    dapple.forEach((c, s) => c.getContext('2d').putImageData(dd[s], 0, 0));
  }

  // Business bbox (stand + queue + pickup + Antonio) in world sp, for camera framing.
  const pts = [[0, ST.back, 56], [ST.len, ST.back, 56], [ST.len, ST.cFront, 0], [0, ST.cFront, 0], [-3.6, -1.6, 30], [-0.9, 1.6, 32], [-0.1, 4.6, 0], [7.4, 4.6, 32], [7.4, 1.2, 32]];
  const bx = pts.map(([i, j, z]) => wx(i, j, z));
  const biz = { x0: Math.min(...bx.map((p) => p[0])), x1: Math.max(...bx.map((p) => p[0])), y0: Math.min(...bx.map((p) => p[1])), y1: Math.max(...bx.map((p) => p[1])) };

  const inv = (x, y, z = 0) => { const sx = x + W.x0, sy = y + W.y0 + z; return [(sx / 16 + sy / 8) / 2, (sy / 8 - sx / 16) / 2]; };
  const sp = wx(...STATUE_AT);
  biz.statueX = sp[0] - 34;
  return { bounds: W, ground, shadow, dapple, statics, glows, trees, biz, wx, inv, ms: Math.round(performance.now() - t0) };
}

function nearPath(i, j, pad) {
  for (const p of LAYOUT.paths) {
    const along = p.along === 'i' ? i : j, perp = p.along === 'i' ? j : i;
    if (along > p.range[0] - pad && along < p.range[1] + pad && perp > p.perp[0] - pad && perp < p.perp[1] + pad) return true;
  }
  return false;
}

function nearExperimentalWalk(i, j, pad) {
  return BIG_LINE_PATH.slice(5, -1).some((a, k) => {
    const b = BIG_LINE_PATH[k + 6];
    return i >= Math.min(a[0], b[0]) - pad && i <= Math.max(a[0], b[0]) + pad && j >= Math.min(a[1], b[1]) - pad && j <= Math.max(a[1], b[1]) + pad;
  });
}
