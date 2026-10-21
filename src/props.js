// Small props: Fighting Stallions statue, lamps, benches, bins, grackles, a dog.
import { hex, scale, mix, hash2, Raster, makeCanvas, outline } from './util.js';
import { box, tone, textHit, quad } from './iso.js';

// Embossed metal shading from a silhouette mask: lit up-left rims, dark down-right rims.
function shadeMask(mask, r, base, seed) {
  const w = mask.width, h = mask.height;
  const m = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[(y * w + x) * 4 + 3] > 110;
  const hi = scale(base, 1.45), mid = base, lo = scale(base, 0.58), deep = scale(base, 0.42);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      let c = scale(mid, 1 + (hash2(x, y, seed) - 0.5) * 0.12);
      if (!on(x + 1, y + 1) || !on(x + 1, y)) c = lo;
      if (!on(x + 2, y + 2) && on(x + 1, y + 1)) c = scale(mid, 0.8);
      if (!on(x - 1, y - 1) || !on(x - 1, y)) c = hi;
      if (!on(x, y + 1)) c = deep;
      r.put(x, y, c);
    }
  // Dark separation line where this piece overlaps metal already drawn behind it.
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      if (on(x, y) || r.alpha(x, y) === 0) continue;
      if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1)) r.put(x, y, scale(base, 0.38));
    }
}

function stroke(ctx, pts, w) {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.stroke();
}
function blob(ctx, x, y, rx, ry, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Rearing stallion with rider, drawn as filled anatomy (haunch, barrel, chest, arched neck, wedge head,
// bent forelegs, planted hind legs, flowing tail). f = 1 faces right. Hind hooves at (ox, oy); s = scale.
function horseAndRider(w, h, ox, oy, f, s, armUp) {
  const cv = makeCanvas(w, h);
  let c = cv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = c.strokeStyle = '#fff';
  c.lineCap = c.lineJoin = 'round';
  const P = (x, y) => [ox + x * f * s, oy + y * s];
  const poly = (pts) => { c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(...P(...p)) : c.moveTo(...P(...p)))); c.closePath(); c.fill(); };
  const ell = (x, y, rx, ry, rot) => { c.beginPath(); c.ellipse(...P(x, y), rx * s, ry * s, rot * f, 0, Math.PI * 2); c.fill(); };
  const limb = (pts, wd) => { c.lineWidth = wd * s; c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(...P(...p)) : c.moveTo(...P(...p)))); c.stroke(); };
  // Hind legs (planted, angled back) + hooves.
  limb([[2, -14], [-1, -7], [1, 0]], 4.2); limb([[6, -13], [6, -6], [8, 0]], 4.2);
  ell(1.5, 0, 2.2, 1, 0); ell(8.5, 0, 2.2, 1, 0);
  // Tail.
  limb([[-1, -17], [-6, -13], [-8, -6], [-7, -2]], 2.4);
  // Haunch, barrel, chest (body tilted up ~50 degrees).
  ell(3, -16, 7.5, 6.5, 0);
  ell(8, -23, 10, 6.5, -0.85);
  ell(12, -30, 6, 6, 0);
  // Arched neck + head.
  poly([[9, -32], [12, -40], [16, -45], [20, -46], [21, -42], [17, -38], [16, -32]]);
  poly([[17, -47], [24, -44], [26, -41], [24, -39], [20, -41], [17, -42]]);
  poly([[17, -46], [17, -53], [20, -47]]);
  poly([[21, -45], [22, -50], [23, -44]]);
  // Mane.
  limb([[11, -38], [13, -43], [16, -46]], 3.2);
  // Forelegs pawing the air: upper leg forward, knee bent, cannon down.
  limb([[14, -29], [23, -31], [25, -25]], 3.2); limb([[12, -27], [20, -24], [18, -19]], 3.2);
  // Rider leaning forward, one arm raised (own mask so it separates from the horse).
  const horse = cv;
  const rcv = makeCanvas(w, h), rc = rcv.getContext('2d', { willReadFrequently: true });
  rc.fillStyle = rc.strokeStyle = '#fff'; rc.lineCap = rc.lineJoin = 'round';
  const c0 = c;
  c = rc;
  limb([[4, -29], [3, -38], [5, -45]], 4);
  ell(5, -49, 3, 3, 0);
  poly([[1, -51], [9, -51], [7, -53], [3, -53]]);
  limb([[4, -30], [8, -25], [7, -19]], 2.4);
  limb(armUp ? [[5, -43], [0, -49], [-1, -57]] : [[5, -43], [12, -39], [18, -39]], 1.8);
  c = c0;
  return [horse, rcv];
}

// Volumetric metal shading from a silhouette: normals from a blurred mask, lit from the upper left,
// warm sun rim on lit edges, dark core shadow, subtle patina noise.
function shadeMetal(mask, r, base, seed, rim = [255, 226, 166]) {
  const w = mask.width, h = mask.height;
  const m = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const A = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) A[k] = m[k * 4 + 3] > 110 ? 1 : 0;
  const B = new Float32Array(w * h), R2 = 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0, n = 0;
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { sum += A[yy * w + xx]; n++; }
    }
    B[y * w + x] = sum / n;
  }
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && A[y * w + x] > 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!on(x, y)) continue;
    const gx = B[y * w + x + 1] - B[y * w + x - 1], gy = B[(y + 1) * w + x] - B[(y - 1) * w + x];
    const lit = (gx * 0.7 + gy * 0.8) * 2.4 + 0.15; // gradient points inward; inward toward lower-right = lit upper-left
    let k = 0.74 + lit * 0.6 + (hash2(x >> 1, y >> 1, seed) - 0.5) * 0.08;
    k = Math.max(0.42, Math.min(1.35, k));
    let col = scale(base, k);
    const edgeUL = !on(x - 1, y) || !on(x, y - 1) || !on(x - 1, y - 1);
    const edgeDR = !on(x + 1, y) || !on(x, y + 1);
    if (edgeUL && !edgeDR) col = mix(col, rim, 0.55);
    else if (edgeDR) col = scale(base, 0.5);
    r.put(x, y, col);
  }
  // Dark separation where this piece overlaps metal already drawn behind it.
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (on(x, y) || r.alpha(x, y) === 0) continue;
    if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1)) r.put(x, y, scale(base, 0.34));
  }
}

export function makeStatue() {
  const W = 180, H = 170, cx = 90, base = 150;
  const r = new Raster(W, H);
  const STONE = hex('#D2CBC0');
  // Round pedestal: base step, drum, cap. Lit from the left. "TEXAS STATE" carved on the drum.
  const drum = (rx, ry, top, bot, col, carve) => {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (Math.abs(dx) > 1) continue;
      const e = ry * Math.sqrt(1 - dx * dx);
      const k = 1.1 - 0.42 * ((dx + 1) / 2);
      for (let y = Math.round(top + e); y <= Math.round(bot + e); y++) {
        let c = scale(col, k * (1 + (hash2(x, y, 4) - 0.5) * 0.05));
        if (carve) {
          const tz = y - Math.round(top + e);
          const tx = Math.round(x - cx + 22);
          if (textHit('TEXAS STATE', 0, 0, tx, 13 - tz) ) c = scale(c, 0.68);
          if ((y - top - e) % 9 < 1) c = scale(c, 0.9);
        }
        r.put(x, y, c);
      }
      for (let y = Math.round(top - e); y < Math.round(top + e); y++) r.put(x, y, scale(col, 1.14 + (hash2(x, y, 6) - 0.5) * 0.05));
    }
  };
  drum(34, 17, base - 8, base - 5, scale(STONE, 0.92), false);
  drum(28, 14, base - 32, base - 8, STONE, true);
  drum(30, 15, base - 35, base - 32, scale(STONE, 1.05), false);
  // Several rearing stallions with riders, cast metal (silver-grey), clustered on the plinth.
  // Two riders on two rearing stallions, back to back (cast aluminium, weathered silver-grey).
  const METAL = hex('#8C929A');
  for (const [x, y, f, sc, arm, k, seed] of [[cx - 12, base - 37, -1, 1.3, false, 0.75, 3], [cx + 10, base - 35, 1, 1.45, true, 1.12, 7]]) {
    const [horse, rider] = horseAndRider(W, H, x, y, f, sc, arm);
    shadeMetal(horse, r, scale(METAL, k), seed);
    shadeMetal(rider, r, scale(METAL, k * 1.08), seed + 1);
    // Small equine cues stay high contrast after the sculpture is reduced for phones.
    const mark = (dx, dy, col) => r.put(Math.round(x + dx * f * sc), Math.round(y + dy * sc), hex(col));
    mark(22, -43, '#30343D'); // eye
    mark(25, -41, '#414550'); // nostril
    mark(21, -44, '#DCE0DF'); // brow catches the sun
    for (let n = 0; n < 7; n++) mark(11 + n * 0.7, -37 - n * 1.1, '#4C505A'); // mane

  }
  const cv = makeCanvas(W, H);
  cv.getContext('2d', { willReadFrequently: true }).putImageData(r.img, 0, 0);
  outline(cv, [58, 58, 58], 0.95);
  outline(cv, [58, 58, 58], 0.95);
  return { canvas: cv, ax: cx, ay: base - 4 };
}

export function makeLamp(flipBanner = false) {
  const W = 26, H = 66, cx = 12;
  const r = new Raster(W, H);
  const IRON = hex('#23202A'), IRON_L = hex('#4A4652');
  for (let y = 12; y < H - 3; y++) { r.put(cx, y, IRON_L); r.put(cx + 1, y, IRON); }
  for (let x = cx - 2; x <= cx + 3; x++) { r.put(x, H - 2, IRON); r.put(x, H - 3, IRON); r.put(x, H - 4, IRON_L); }
  // Lantern
  for (let x = cx - 2; x <= cx + 3; x++) { r.put(x, 2, IRON); r.put(x, 11, IRON); }
  r.put(cx, 0, IRON); r.put(cx + 1, 0, IRON); r.put(cx - 1, 1, IRON); r.put(cx + 2, 1, IRON); r.put(cx, 1, IRON); r.put(cx + 1, 1, IRON);
  for (let y = 3; y <= 10; y++) { r.put(cx - 2, y, IRON); r.put(cx + 3, y, IRON); for (let x = cx - 1; x <= cx + 2; x++) r.put(x, y, y < 6 ? hex('#FFF1C4') : hex('#FFC870')); }
  // TXST banner on an arm.
  const bx = flipBanner ? cx - 11 : cx + 3;
  for (let x = 0; x < 9; x++) r.put(bx + x, 15, IRON);
  for (let y = 16; y < 34; y++) for (let x = 0; x < 9; x++) {
    let c = x < 2 ? hex('#86303F') : hex('#6B1F2E');
    if (y === 33 && (x === 4)) continue;
    const by = y - 16;
    if (by >= 2 && by <= 5 && x >= 2 && x <= 6 && !(by === 2 && (x === 4))) c = hex('#F4C66D');
    if (textHit('TX', 1, -12, x, -by)) c = hex('#F3E6C8');
    if (textHit('ST', 1, -18, x, -by)) c = hex('#F3E6C8');
    r.put(bx + x, y, c);
  }
  const cv = makeCanvas(W, H);
  cv.getContext('2d', { willReadFrequently: true }).putImageData(r.img, 0, 0);
  outline(cv);
  return { canvas: cv, ax: cx + 1, ay: H - 2, glow: [cx + 0.5, 6] };
}

export function makeBench(alongI = true) {
  const W = 70, H = 44, ox = 35, oy = 28;
  const r = new Raster(W, H);
  const WOOD = hex('#A9713F'), IRON = hex('#2A2228');
  const L = alongI ? [2.0, 0.45] : [0.45, 2.0];
  const leg = (i, j) => box(r, ox, oy, i, i + 0.08, j, j + 0.08, 0, 7, (f) => tone(IRON, f));
  leg(0.05, 0.05); leg(L[0] - 0.1, 0.05); leg(0.05, L[1] - 0.1); leg(L[0] - 0.1, L[1] - 0.1);
  if (alongI) box(r, ox, oy, 0, L[0], 0, 0.08, 7, 16, (f, u, v) => tone(scale(WOOD, Math.floor(v * 6) % 2 ? 0.85 : 1), f));
  else box(r, ox, oy, 0, 0.08, 0, L[1], 7, 16, (f, u, v) => tone(scale(WOOD, Math.floor(v * 6) % 2 ? 0.85 : 1), f));
  box(r, ox, oy, 0, L[0], 0, L[1], 7, 8, (f, u, v) => tone(scale(WOOD, 1.1), f));
  const cv = makeCanvas(W, H);
  cv.getContext('2d', { willReadFrequently: true }).putImageData(r.img, 0, 0);
  outline(cv);
  return { canvas: cv, ax: ox, ay: oy, L };
}

export function makeBin() {
  const r = new Raster(20, 26), ox = 10, oy = 20;
  box(r, ox, oy, 0, 0.5, 0, 0.5, 0, 14, (f, u, v) => tone(hex(f === 'top' ? '#1E1E24' : v > 0.8 ? '#3E5A3A' : '#2E4A2E'), f));
  const cv = makeCanvas(20, 26);
  cv.getContext('2d', { willReadFrequently: true }).putImageData(r.img, 0, 0);
  outline(cv);
  return { canvas: cv, ax: ox, ay: oy };
}

export function makeGrackle(flip = false) {
  const cv = makeCanvas(9, 6), c = cv.getContext('2d');
  c.fillStyle = '#121016';
  c.fillRect(2, 2, 4, 2); c.fillRect(5, 1, 2, 2); c.fillRect(0, 2, 2, 1); c.fillRect(0, 1, 1, 1);
  c.fillStyle = '#5A3A8A'; c.fillRect(3, 2, 1, 1);
  c.fillStyle = '#E8D84A'; c.fillRect(6, 1, 1, 1);
  c.fillStyle = '#3A3236'; c.fillRect(3, 4, 1, 1); c.fillRect(5, 4, 1, 1);
  if (flip) {
    const f = makeCanvas(9, 6), fc = f.getContext('2d');
    fc.translate(9, 0); fc.scale(-1, 1); fc.drawImage(cv, 0, 0);
    return { canvas: f, ax: 4, ay: 5 };
  }
  return { canvas: cv, ax: 4, ay: 5 };
}

export function makeDog() {
  const cv = makeCanvas(12, 10), c = cv.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#8A5A2E'; c.fillRect(2, 3, 6, 3); c.fillRect(7, 1, 3, 3);
  c.fillStyle = '#6A4220'; c.fillRect(2, 6, 1, 2); c.fillRect(7, 6, 1, 2); c.fillRect(4, 5, 4, 1); c.fillRect(1, 2, 1, 2); c.fillRect(8, 1, 1, 1);
  c.fillStyle = '#1E1A20'; c.fillRect(10, 2, 1, 1);
  outline(cv);
  return { canvas: cv, ax: 5, ay: 8 };
}

export function makeBlanket(color = '#C23B48') {
  const r = new Raster(70, 40), ox = 35, oy = 14;
  const c = hex(color), cl = hex('#F3E6C8');
  quad(r, ox, oy, [0, 0, 0], [1.6, 0, 0], [0, 1.4, 0], (u, v) => ((Math.floor(u * 6) + Math.floor(v * 5)) % 2 ? c : cl));
  const cv = makeCanvas(70, 40);
  cv.getContext('2d', { willReadFrequently: true }).putImageData(r.img, 0, 0);
  return { canvas: cv, ax: ox, ay: oy };
}

// Reserved spot for the expansion stand: a staked "COMING SOON" sign.
export function makeSoonSign() {
  const r = new Raster(40, 44), ox = 20, oy = 40;
  box(r, ox, oy, -0.04, 0.04, -0.04, 0.04, 0, 16, (f) => tone(hex('#6A5038'), f));
  quad(r, ox, oy, [-0.7, 0.05, 16], [1.4, 0, 0], [0, 0, 16], (u, v) => {
    const xi = Math.floor(u * 22.4), zi = Math.floor(v * 16);
    if (xi === 0 || xi === 22 || zi === 0 || zi === 15) return hex('#6B1F2E');
    if (textHit('SOON', 3, 3, xi, zi)) return hex('#6B1F2E');
    if (textHit('2ND', 5, 9, xi, zi)) return hex('#C23B48');
    return hex('#F3E6C8');
  });
  const cv = makeCanvas(40, 44);
  cv.getContext('2d', { willReadFrequently: true }).putImageData(r.img, 0, 0);
  outline(cv);
  return { canvas: cv, ax: ox, ay: oy };
}
