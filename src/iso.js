// 2:1 isometric projection at internal (half) resolution: tiles are 32x16, z is in pixels.
// +i runs down-right on screen, +j runs down-left. Sun is upper-left, so the SW face
// (normal +j) is lit at 0.86 and the SE face (normal +i) sits in shade at 0.64.
import { hex, mix, scale } from './util.js';

export const TW = 32, TH = 16;
export const iso = (i, j, z = 0) => [(i - j) * 16, (i + j) * 8 - z];

// Golden hour: shadows are 1.6x the noon (+0.35h, +0.12h) offset.
export const SHADOW_K = 1.6;
export const shadowOff = (h) => [0.35 * h * SHADOW_K, 0.12 * h * SHADOW_K];

const COOL = hex('#3A2848');
export function tone(c, face) {
  if (face === 'se') return mix(scale(c, 0.64), COOL, 0.08);
  if (face === 'sw') return scale(c, 0.86);
  return c;
}

// Rasterise a 3D parallelogram P0 + u*A + v*B (u,v in [0,1]) into a Raster.
// shader(u, v) returns [r,g,b] / [r,g,b,a] or null to leave the pixel alone.
export function quad(r, ox, oy, P0, A, B, shader) {
  const p0x = (P0[0] - P0[1]) * 16 + ox, p0y = (P0[0] + P0[1]) * 8 - P0[2] + oy;
  const ax = (A[0] - A[1]) * 16, ay = (A[0] + A[1]) * 8 - A[2];
  const bx = (B[0] - B[1]) * 16, by = (B[0] + B[1]) * 8 - B[2];
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-6) return;
  const xs = [p0x, p0x + ax, p0x + bx, p0x + ax + bx];
  const ys = [p0y, p0y + ay, p0y + by, p0y + ay + by];
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(r.w, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(r.h, Math.ceil(Math.max(...ys)));
  const eu = 0.6 / Math.max(1, Math.hypot(ax, ay)), ev = 0.6 / Math.max(1, Math.hypot(bx, by));
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5 - p0y;
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5 - p0x;
      const u = (px * by - py * bx) / det;
      const v = (ax * py - ay * px) / det;
      if (u < -eu || u > 1 + eu || v < -ev || v > 1 + ev) continue;
      const c = shader(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)), x, y);
      if (c) r.put(x, y, c, c.length > 3 ? c[3] : 1);
    }
  }
}

// Axis-aligned box. fill(face, u, v, len, hgt) -> colour; face in 'sw' | 'se' | 'top'.
export function box(r, ox, oy, i0, i1, j0, j1, z0, z1, fill) {
  const h = z1 - z0;
  quad(r, ox, oy, [i0, j1, z0], [i1 - i0, 0, 0], [0, 0, h], (u, v, x, y) => fill('sw', u, v, (i1 - i0) * 16, h, x, y));
  quad(r, ox, oy, [i1, j1, z0], [0, j0 - j1, 0], [0, 0, h], (u, v, x, y) => fill('se', u, v, (j1 - j0) * 16, h, x, y));
  quad(r, ox, oy, [i0, j0, z1], [i1 - i0, 0, 0], [0, j1 - j0, 0], (u, v, x, y) => fill('top', u, v, (i1 - i0) * 16, (j1 - j0) * 16, x, y));
}

export const solid = (c) => (face) => tone(c, face);

// 3x5 pixel font for signage.
const GLYPHS = {
  T: ['111', '010', '010', '010', '010'], A: ['010', '101', '111', '101', '101'],
  C: ['011', '100', '100', '100', '011'], O: ['010', '101', '101', '101', '010'],
  S: ['011', '100', '010', '001', '110'], I: ['111', '010', '010', '010', '111'],
  F: ['111', '100', '110', '100', '100'], E: ['111', '100', '110', '100', '111'],
  X: ['101', '101', '010', '101', '101'], $: ['011', '110', '010', '011', '110'],
  2: ['110', '001', '010', '100', '111'], Q: ['010', '101', '101', '011', '001'],
  U: ['101', '101', '101', '101', '111'], R: ['110', '101', '110', '101', '101'],
  N: ['101', '111', '111', '111', '101'], D: ['110', '101', '101', '101', '110'], M: ['101', '111', '111', '101', '101'], ' ': ['000', '000', '000', '000', '000'],
};
// Is face-local pixel (x, z) inside `text` drawn with its bottom-left at (tx, tz)? z grows upward.
export function textHit(text, tx, tz, x, z) {
  const row = 4 - (z - tz);
  if (row < 0 || row > 4) return false;
  const col = x - tx;
  if (col < 0) return false;
  const ch = Math.floor(col / 4), cx = col % 4;
  if (ch >= text.length || cx === 3) return false;
  const g = GLYPHS[text[ch]];
  return !!g && g[row][cx] === '1';
}
