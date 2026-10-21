// Old Main, built from textured 3D planes: buff brick, cream arch hoods and string courses,
// maroon hipped roof, gabled pavilions, dormers, a steep tower with a spire, and front stairs.
import { hex, mix, scale, hash2, Raster, makeCanvas, outline } from './util.js';
import { quad, box, tone } from './iso.js';

const BRICK = hex('#E3B97E'), CREAM = hex('#F2E6CC'), CREAM_D = hex('#D2C2A0');
const STONE = hex('#C4A880'), FRAME = hex('#6A2A26'), GLASS = hex('#2C3E50'), GLASS_L = hex('#56627A');
const SASH = hex('#E6DCC4'), GLINT = hex('#FFC870'), DOOR = hex('#5A2E1C');
const ROOF = hex('#B5473E'), ROOF_D = hex('#5C2330'), RIDGE = hex('#D2766A'), STEP = hex('#D8CCB4');

export const OM = { Li: 11.5, Lj: 6.5, H: 114, R: 48, pc: 8.5 };
const { Li, Lj, H, R, pc } = OM;
const HALF = Lj / 2;
const roofZ = (j) => H + R * Math.min(1, (Lj - j) / HALF);

function brick(xi, zi, seed = 0) {
  const row = Math.floor(zi / 3), off = row & 1 ? 3 : 0;
  const bi = Math.floor((xi + off) / 6);
  let k = 1 + (hash2(bi, row, 7 + seed) - 0.5) * 0.1 + (hash2(xi, zi, 3) - 0.5) * 0.05;
  if (zi % 3 === 0) k *= 1.05;
  else if ((xi + off) % 6 === 0) k *= 1.03;
  return scale(BRICK, k);
}

// Arched window: glass, sash cross, dark-red frame, cream hood and sill.
function archWin(dx, zi, zb, zt, glint) {
  const ac = zt - 3;
  if (zi === zb - 1 && Math.abs(dx) <= 4) return CREAM;
  if (zi < zb || zi > zt + 2) return null;
  const r = zi <= ac ? Math.abs(dx) : Math.hypot(dx, zi - ac);
  if (zi > ac - 1 && r >= 3.1 && r < 4.6) return CREAM;
  if (r <= 2.3) {
    if (dx === 0 || zi === Math.round(zb + (ac - zb) * 0.5)) return SASH;
    if (glint) {
      if (dx > 1.3 || zi === zb) return hex('#76502A');
      return zi > ac - 2 ? hex('#FFF0B0') : zi > zb + 3 ? hex('#F1C44D') : hex('#D98B35');
    }
    // Deep blue glass and a narrow warm reflection preserve the recessed window columns.
    const t = (zi - zb) / Math.max(1, ac + 2 - zb);
    if (Math.abs(dx) > 1.5 || zi === zb) return hex('#182634');
    if (dx < 0 && t > 0.65) return hex('#6B8790');
    return GLASS;
  }
  if (r <= 3.3 && zi <= ac + 3) return FRAME;
  return null;
}

// Generic Old Main wall texture in face-local pixels (xi along, zi up).
function wall(xi, zi, len, h, bays, opts = {}) {
  const { floors = [[17, 39], [51, 72], [85, 104]], basement = true, cornice = true, seed = 0 } = opts;
  if (cornice && zi >= h - 6) {
    if (zi === h - 5 && xi % 3 === 0) return CREAM_D;
    return zi >= h - 2 ? CREAM : mix(CREAM, CREAM_D, 0.4);
  }
  if (cornice && zi >= h - 9) return scale(brick(xi, zi, seed), 0.72);
  if (opts.extra) {
    const e = opts.extra(xi, zi);
    if (e) return e;
  }
  if (basement && zi < 12) {
    for (const b of bays) {
      const dx = xi - b;
      if (Math.abs(dx) <= 2 && zi >= 4 && zi <= 8) return zi === 8 ? CREAM_D : GLASS;
    }
    let c = scale(STONE, 1 + (hash2(Math.floor((xi + (zi >> 2) * 3) / 8), zi >> 2, 5) - 0.5) * 0.1);
    if (zi % 4 === 0) c = scale(c, 0.85);
    if (zi < 3) c = scale(c, 0.78 + zi * 0.06);
    return c;
  }
  if (zi === 12 || zi === 13 || zi === 45 || zi === 46 || zi === 79 || zi === 80) return zi === 13 || zi === 46 || zi === 80 ? CREAM : CREAM_D;
  for (const b of bays) {
    const dx = xi - b;
    if (Math.abs(dx) > 5) continue;
    for (const [zb, zt] of floors) {
      const w = archWin(dx, zi, zb, zt, hash2(b, zb, 99 + seed) < 0.45);
      if (w) return w;
      if (Math.abs(dx) <= 4.8 && zi >= zb - 2 && zi <= zt + 2) return scale(brick(xi, zi, seed), dx > 0 ? 0.58 : 0.76);
    }
  }
  let c = brick(xi, zi, seed);
  // Cream stone quoins at the corners, alternating long and short blocks.
  const qw = ((zi / 5) | 0) & 1 ? 6 : 4;
  if (xi < qw || xi >= len - qw) c = zi % 5 === 0 ? CREAM_D : CREAM;
  return c;
}

function roofTex(u, v, alongPx, rows, edge, x, y) {
  const rv = v * rows, row = Math.floor(rv), fr = rv - row;
  const col = Math.floor(u * alongPx / 4 + (row & 1) * 0.5);
  let c = scale(ROOF, 1 + (hash2(col, row, 61) - 0.5) * 0.12 + (hash2(x, y, 62) - 0.5) * 0.05);
  if (fr < 0.22) c = scale(c, 0.78);
  if (edge) c = RIDGE;
  if (v < 0.03) c = ROOF_D;
  return c;
}

function gable(xi, zi, half, gh, oculus) {
  // Triangle face above the cornice: brick infill, cream raking trim, round window.
  const t = zi, lim = half * (1 - t / gh);
  const ax = Math.abs(xi - half);
  if (ax > lim) return null;
  if (lim - ax < 1.8) return CREAM;
  if (oculus) {
    const d = Math.hypot(xi - half, zi - oculus.z);
    if (d <= oculus.r - 1.2) return xi === Math.round(half) || zi === oculus.z ? SASH : zi > oculus.z ? GLASS_L : GLASS;
    if (d <= oculus.r + 0.6) return CREAM;
  }
  return brick(xi, zi + 200);
}

export function makeOldMain() {
  const ox = 132, oy = 160, W = 340, Ht = 330;
  const r = new Raster(W, Ht);
  const Q = (P0, A, B, sh) => quad(r, ox, oy, P0, A, B, sh);

  // Chimneys (behind everything).
  for (const [ci, cj] of [[2.9, 2.0], [9.2, 2.3]]) {
    box(r, ox, oy, ci, ci + 0.5, cj, cj + 0.5, H + 20, H + 62, (f, u, v, len, h, x, y) => {
      if (f === 'top') return scale(CREAM_D, 0.7);
      const zi = Math.floor(v * h);
      return tone(zi > h - 4 ? CREAM : brick(Math.floor(u * len), zi), f);
    });
  }

  // Back roof slopes (visible slivers behind the ridge).
  const o = 0.25, eave = H - 3.4, rise = R + 3.4, run = HALF + o;
  Q([-o, -o, eave], [Li + 2 * o, 0, 0], [0, run, rise], (u, v, x, y) => {
    const i = -o + u * (Li + 2 * o);
    if (i < -o + v * run || i > Li + o - v * run) return null;
    return roofTex(u, v, 190, 18, false, x, y);
  });
  Q([-o, -o, eave], [0, Lj + 2 * o, 0], [run, 0, rise], (u, v, x, y) => {
    const j = -o + u * (Lj + 2 * o);
    if (j < -o + v * run || j > Lj + o - v * run) return null;
    return roofTex(u, v, 110, 18, false, x, y);
  });

  // Main walls.
  const bSW = [55, 71, 87, 103, 168];
  const bSE = [16, 34, 52, 70, 88];
  Q([0, Lj, 0], [Li, 0, 0], [0, 0, H], (u, v) => mix(tone(wall(Math.floor(u * Li * 16), Math.floor(v * H), Li * 16, H, bSW), 'sw'), [255, 200, 130], 0.18 * (1 - u) * (0.4 + v * 0.6)));
  Q([Li, Lj, 0], [0, -Lj, 0], [0, 0, H], (u, v) => tone(wall(Math.floor(u * Lj * 16), Math.floor(v * H), Lj * 16, H, bSE, { seed: 4 }), 'se'));

  // Front roof slopes: SW trapezoid and SE hip triangle.
  Q([-o, Lj + o, eave], [Li + 2 * o, 0, 0], [0, -run, rise], (u, v, x, y) => {
    const i = -o + u * (Li + 2 * o);
    const lo = -o + v * run, hi = Li + o - v * run;
    if (i < lo || i > hi) return null;
    const edge = i - lo < 0.09 || hi - i < 0.09 || v > 0.985;
    return scale(roofTex(u, v, 190, 18, edge, x, y), 0.95);
  });
  Q([Li + o, Lj + o, eave], [0, -(Lj + 2 * o), 0], [-run, 0, rise], (u, v, x, y) => {
    const j = Lj + o - u * (Lj + 2 * o);
    const lo = -o + v * run, hi = Lj + o - v * run;
    if (j < lo || j > hi) return null;
    const edge = j - lo < 0.09 || hi - j < 0.09;
    return tone(roofTex(u, v, 110, 18, edge, x, y), 'se');
  });

  // Dormers on the SW slope and the SE hip.
  const dormerFace = (xi, zi, w, hgt, gh) => {
    if (zi >= hgt) return gable(xi, zi - hgt, w / 2, gh, null);
    const dx = xi - Math.floor(w / 2);
    const win = archWin(dx, zi, 2, hgt - 1, false);
    if (win) return win;
    return xi < 1 || xi >= w - 1 ? CREAM : brick(xi, zi, 3);
  };
  for (const id of [4.2, 5.9]) {
    const jd = Lj - 0.8, z0 = roofZ(jd) - 2, wall = 11, gh = 8;
    Q([id + 0.55, jd, z0], [0, -1.3, 0], [0, 0, wall], (u, v) => {
      const j = jd - u * 1.3, z = z0 + v * wall;
      return z < roofZ(j) ? null : tone(brick(Math.floor(u * 20), Math.floor(v * wall)), 'se');
    });
    Q([id - 0.55, jd, z0], [1.1, 0, 0], [0, 0, wall + gh], (u, v) =>
      dormerFace(Math.floor(u * 17.6), Math.floor(v * (wall + gh)), 17.6, wall, gh) && tone(dormerFace(Math.floor(u * 17.6), Math.floor(v * (wall + gh)), 17.6, wall, gh), 'sw'));
    const zr = z0 + wall + gh;
    Q([id, jd + 0.12, zr], [0, -1.6, 0], [-0.68, 0, -gh - 1], (u, v, x, y) => roofTex(u, v, 26, 4, v < 0.08, x, y));
    Q([id, jd + 0.12, zr], [0, -1.6, 0], [0.68, 0, -gh - 1], (u, v, x, y) => tone(roofTex(u, v, 26, 4, v < 0.08, x, y), 'se'));
  }
  {
    const idd = Li - 0.8, jc = HALF, z0 = roofZ(Lj - 0.8) - 2, wall = 11, gh = 8;
    Q([idd, jc + 0.55, z0], [-1.3, 0, 0], [0, 0, wall], (u, v) => {
      const i = idd - u * 1.3, z = z0 + v * wall;
      return z < H + R * Math.min(1, (Li - i) / HALF) ? null : tone(brick(Math.floor(u * 20), Math.floor(v * wall)), 'sw');
    });
    Q([idd, jc + 0.55, z0], [0, -1.1, 0], [0, 0, wall + gh], (u, v) => {
      const c = dormerFace(Math.floor(u * 17.6), Math.floor(v * (wall + gh)), 17.6, wall, gh);
      return c && tone(c, 'se');
    });
    const zr = z0 + wall + gh;
    Q([idd + 0.12, jc, zr], [-1.6, 0, 0], [0, -0.68, -gh - 1], (u, v, x, y) => roofTex(u, v, 26, 4, v < 0.08, x, y));
    Q([idd + 0.12, jc, zr], [-1.6, 0, 0], [0, 0.68, -gh - 1], (u, v, x, y) => scale(roofTex(u, v, 26, 4, v < 0.08, x, y), 0.9));
  }

  // Tower behind the central pavilion, rising out of the roof.
  const t0 = pc - 1.1, t1 = pc + 1.1, tj0 = Lj - 2.6, tj1 = Lj - 0.4, tz = H + R + 14;
  const louver = (xi, zi, w) => {
    for (const c of [w * 0.3, w * 0.7]) {
      const dx = xi - Math.round(c);
      if (Math.abs(dx) <= 2 && zi >= tz - 24 && zi <= tz - 12) {
        const top = tz - 14;
        if (zi > top && Math.hypot(dx, zi - top) > 2.4) continue;
        return zi % 2 ? hex('#2A2226') : hex('#4A3E3E');
      }
      if (Math.abs(dx) <= 3 && zi >= tz - 25 && zi <= tz - 9 && (Math.abs(dx) === 3 || zi >= tz - 11)) return CREAM;
    }
    return null;
  };
  Q([t0, tj1, 0], [2.2, 0, 0], [0, 0, tz], (u, v) => {
    const z = v * tz;
    if (z < roofZ(tj1)) return null;
    const xi = Math.floor(u * 35), zi = Math.floor(z);
    if (zi >= tz - 4) return tone(zi >= tz - 2 ? CREAM : CREAM_D, 'sw');
    return tone(louver(xi, zi, 35) || brick(xi, zi, 2), 'sw');
  });
  Q([t1, tj1, 0], [0, -2.2, 0], [0, 0, tz], (u, v) => {
    const j = tj1 - u * 2.2, z = v * tz;
    if (z < roofZ(j)) return null;
    const xi = Math.floor(u * 35), zi = Math.floor(z);
    if (zi >= tz - 4) return tone(zi >= tz - 2 ? CREAM : CREAM_D, 'se');
    return tone(louver(xi, zi, 35) || brick(xi, zi, 2), 'se');
  });
  // Steep pyramid roof with fish-scale shingles, then the spire.
  const ap = [pc, (tj0 + tj1) / 2, tz + 48];
  const scales = (u, v, x, y) => {
    const row = Math.floor(v * 16), fr = v * 16 - row;
    const cu = u * 8 + (row & 1) * 0.5, fu = cu - Math.floor(cu) - 0.5;
    let c = scale(ROOF, 0.92 + (hash2(Math.floor(cu), row, 8) - 0.5) * 0.1);
    if (fr < 0.25 + fu * fu * 1.2) c = scale(c, 0.74);
    if (v < 0.05) c = CREAM_D;
    return c;
  };
  const e0 = [t0 - 0.2, tj1 + 0.2, tz], e1 = [t1 + 0.2, tj1 + 0.2, tz], e2 = [t1 + 0.2, tj0 - 0.2, tz];
  const tri = (P, A, B, sh) => Q(P, A, B, (u, v, x, y) => (u + v > 1.002 ? null : sh(u + v * 0.5, v, x, y)));
  tri(e0, [e1[0] - e0[0], e1[1] - e0[1], 0], [ap[0] - e0[0], ap[1] - e0[1], ap[2] - e0[2]], (u, v, x, y) => scales(u, v, x, y));
  tri(e1, [e2[0] - e1[0], e2[1] - e1[1], 0], [ap[0] - e1[0], ap[1] - e1[1], ap[2] - e1[2]], (u, v, x, y) => tone(scales(u, v, x, y), 'se'));
  {
    const sx = Math.round((ap[0] - ap[1]) * 16 + ox), sy = Math.round((ap[0] + ap[1]) * 8 - ap[2] + oy);
    for (let k = 0; k < 22; k++) {
      r.put(sx, sy - k, k > 18 ? CREAM : hex('#D8D2C4'));
      if (k < 12) r.put(sx + 1, sy - k, hex('#8E8678'));
    }
    for (const dk of [6, 13]) { r.put(sx - 1, sy - dk, CREAM); r.put(sx + 1, sy - dk, CREAM); r.put(sx + 2, sy - dk, hex('#8E8678')); }
    r.put(sx - 1, sy - 19, CREAM); r.put(sx + 1, sy - 19, CREAM);
  }

  // Pavilion: projecting bay with its own facade, front gable and gable roof.
  const pavilion = (i0, i1, jf, gh, front, oculus) => {
    const wpx = (i1 - i0) * 16;
    Q([i1, jf, 0], [0, -(jf - Lj), 0], [0, 0, H], (u, v) =>
      tone(wall(Math.floor(u * (jf - Lj) * 16), Math.floor(v * H), (jf - Lj) * 16, H, []), 'se'));
    Q([i0, jf, 0], [i1 - i0, 0, 0], [0, 0, H + gh], (u, v) => {
      const xi = Math.floor(u * wpx), zi = Math.floor(v * (H + gh));
      if (zi >= H) return (() => { const c = gable(xi, zi - H, wpx / 2, gh, oculus); return c && tone(c, 'sw'); })();
      return tone(front(xi, zi, wpx), 'sw');
    });
    const zr = H + gh + 1, back = jf - Lj + 2.3, half = (i1 - i0) / 2 + 0.18;
    const mid = (i0 + i1) / 2;
    Q([mid, jf + 0.15, zr], [0, -back, 0], [-half, 0, -gh - 4], (u, v, x, y) => {
      const z = zr - v * (gh + 4), j = jf + 0.15 - u * back;
      if (z < roofZ(j) - 1) return null;
      return roofTex(u, v, 40, 9, u < 0.04 || v < 0.03, x, y);
    });
    Q([mid, jf + 0.15, zr], [0, -back, 0], [half, 0, -gh - 4], (u, v, x, y) => {
      const z = zr - v * (gh + 4), j = jf + 0.15 - u * back;
      if (z < roofZ(j) - 1) return null;
      return tone(roofTex(u, v, 40, 9, u < 0.04 || v < 0.03, x, y), 'se');
    });
  };
  // Left end pavilion: paired windows, round gable window.
  pavilion(0, 2.6, Lj + 0.6, 30, (xi, zi, w) => wall(xi, zi, w, H, [Math.round(w / 2) - 8, Math.round(w / 2) + 8], { seed: 2 }), { z: 12, r: 5 });
  // Central entrance pavilion: big arched door with fanlight, triple windows above.
  const door = (xi, zi, w) => {
    const dx = xi - Math.floor(w / 2);
    const zb = 12, zt = 42, hw = 7, ac = zt - hw;
    if (zi < zb || zi > zt + 3) return null;
    const rr = zi <= ac ? Math.abs(dx) : Math.hypot(dx, zi - ac);
    if (rr > hw + 2.2) return null;
    if (rr > hw) return zi > ac - 4 || Math.abs(dx) > hw ? CREAM : null;
    if (zi > ac - 1) return rr < 2 || Math.abs(dx) === Math.round((zi - ac) * 0.6) ? SASH : GLASS_L;
    if (zi === ac - 1) return CREAM_D;
    if (dx === 0) return hex('#24150E');
    return (Math.abs(dx) === 3 || zi % 8 === 0) ? hex('#4E3020') : DOOR;
  };
  pavilion(pc - 1.2, pc + 1.2, Lj + 0.8, 34, (xi, zi, w) =>
    wall(xi, zi, w, H, [Math.round(w / 2) - 9, Math.round(w / 2), Math.round(w / 2) + 9], { floors: [[51, 72], [85, 104]], extra: (x2, z2) => door(x2, z2, w), seed: 5 }),
  { z: 13, r: 7 });

  // Front stairs with iron railings.
  const jS = Lj + 0.8, steps = 6, depth = 2.2;
  for (let k = 0; k < steps; k++) {
    const ja = jS + k * (depth / steps), jb = ja + depth / steps, zt = 12 - k * 2;
    box(r, ox, oy, pc - 1.05, pc + 1.05, ja, jb, 0, zt, (f, u, v, len, h) => {
      if (f === 'top') return scale(STEP, v > 0.8 ? 1.08 : 1);
      return tone(scale(STEP, 0.9), f);
    });
  }
  const P = (i, j, z) => [Math.round((i - j) * 16 + ox), Math.round((i + j) * 8 - z + oy)];
  const line = (a, b, c) => {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    for (let k = 0; k <= n; k++) r.put(Math.round(a[0] + ((b[0] - a[0]) * k) / n), Math.round(a[1] + ((b[1] - a[1]) * k) / n), c);
  };
  const IRON = hex('#1E1A20');
  for (const si of [pc - 1.0, pc + 1.0]) {
    line(P(si, jS, 20), P(si, jS + depth, 8), IRON);
    for (let k = 0; k <= 3; k++) {
      const jj = jS + (k * depth) / 3, zz = 12 - (k * 12) / 3;
      line(P(si, jj, Math.max(0, zz - 2)), P(si, jj, zz + 8), IRON);
    }
  }
  // Door lanterns.
  for (const si of [pc - 0.85, pc + 0.85]) {
    const p = P(si, Lj + 0.8, 34);
    r.put(p[0], p[1], hex('#FFD58A')); r.put(p[0], p[1] + 1, hex('#E8A84A')); r.put(p[0], p[1] - 1, IRON);
  }

  const cv = makeCanvas(W, Ht);
  cv.getContext('2d').putImageData(r.img, 0, 0);
  outline(cv);
  return { canvas: cv, ox, oy };
}
