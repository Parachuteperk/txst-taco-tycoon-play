// Ground: one continuous textured surface baked per pixel. No tiles, no grid lines.
import { hex, mix, scale, hash2, noise2, fbm, smooth, rng, makeCanvas } from './util.js';

const G_DARK = hex('#214A30'), G_LIGHT = hex('#68983E'), G_DRY = hex('#A5AA4D');
const CONC = hex('#C8B28C'), JOINT = hex('#9A8C78'), CURB = hex('#8F8379'), LIP = hex('#E5CDA4'), WEAR = hex('#D6C29C');
const STONE = hex('#D2BE98');
const BRICK = hex('#A85B3B'), MORTAR = hex('#6D422E');
const SOIL = hex('#4A3426');

export const S_GRASS = 0, S_CONC = 1, S_STONE = 2, S_BRICK = 3, S_BED = 4;

function onPath(p, i, j, x, y) {
  const along = p.along === 'i' ? i : j, perp = p.along === 'i' ? j : i;
  if (along < p.range[0] || along > p.range[1]) return null;
  const ja = (noise2(x * 0.45, y * 0.45, 7) - 0.5) * 0.16;
  const jb = (noise2(x * 0.45, y * 0.45, 8) - 0.5) * 0.16;
  const a = p.perp[0] + ja, b = p.perp[1] + jb;
  if (perp < a || perp > b) return null;
  return { along, perp, a, b, t: (perp - a) / (b - a) };
}

function concrete(hit, x, y, seed) {
  const { along, perp, a, b, t } = hit;
  const slab = Math.floor(along / 1.0), lane = t < 0.5 ? 0 : 1;
  let k = 1 + (hash2(slab, lane, seed) - 0.5) * 0.06;
  k += (hash2(x, y, 11) - 0.5) * 0.07;
  k += (fbm(x * 0.04, y * 0.04, 12, 2) - 0.5) * 0.1;
  let c = scale(CONC, k);
  if (Math.abs(t - 0.5) < 0.22) c = mix(c, WEAR, 0.3);
  const fa = along - Math.round(along);
  if (Math.abs(fa) < 0.035 || Math.abs((perp - (a + b) / 2)) < 0.03) c = mix(c, JOINT, 0.5);
  if (hash2(x >> 1, y >> 1, 13) < 0.012) c = scale(c, 0.9);
  if (b - perp < 0.13) c = CURB;
  else if (perp - a < 0.07) c = LIP;
  return c;
}

function stonePlaza(pl, i, j, x, y) {
  const di = i - pl.ci, dj = j - pl.cj;
  const d = Math.hypot(di, dj) + (noise2(x * 0.5, y * 0.5, 21) - 0.5) * 0.1;
  if (d > pl.r) return null;
  const ang = (Math.atan2(dj, di) / (Math.PI * 2) + 1) % 1;
  if (d > pl.r - 0.45) {
    const n = Math.round(Math.PI * 2 * pl.r * 5);
    const s = ang * n, ring = d > pl.r - 0.22 ? 1 : 0;
    const f = s + ring * 0.5;
    if (f - Math.floor(f) < 0.12 || Math.abs(d - (pl.r - 0.22)) < 0.03) return [S_BRICK, MORTAR];
    return [S_BRICK, scale(BRICK, 1 + (hash2(Math.floor(f), ring, 5) - 0.5) * 0.14)];
  }
  const rk = d * 2.2, ring = Math.floor(rk);
  const n = Math.max(6, Math.round(Math.PI * 2 * (ring + 0.5) * 1.1));
  const s = ang * n + ring * 0.37, seg = Math.floor(s);
  let c = scale(STONE, 1 + (hash2(ring, seg, 9) - 0.5) * 0.08 + (hash2(x, y, 3) - 0.5) * 0.06);
  if (rk - ring < 0.08 || s - seg < 0.05) c = mix(c, JOINT, 0.55);
  return [S_STONE, c];
}

// Interlocking 2:1 herringbone pavers. Diagonal bands choose horizontal/vertical
// bricks; adjacent bands share whole brick edges rather than forming basketweave blocks.
function brickRect(pr, i, j, x, y) {
  const jit = (noise2(x * 0.5, y * 0.5, 31) - 0.5) * 0.1;
  if (i < pr.i0 + jit || i > pr.i1 + jit || j < pr.j0 - jit || j > pr.j1 - jit) return null;
  const u = i * 3, v = j * 3, ix = Math.floor(u), iy = Math.floor(v);
  const band = ((ix + iy) % 4 + 4) % 4;
  const horizontal = band < 2;
  const bx = ix - (band === 1 ? 1 : 0), by = iy - (band === 3 ? 1 : 0);
  const fu = u - bx, fv = v - by;
  if (fu < 0.09 || fv < 0.09) return [S_BRICK, MORTAR];
  const variation = hash2(bx, by, 77);
  const base = mix(BRICK, hex('#8B4513'), variation * 0.26);
  let c = scale(base, 0.88 + variation * 0.28 + (hash2(x, y, 4) - 0.5) * 0.06);
  if (fv < 0.19 || fu < 0.17) c = scale(c, 1.12);
  if ((horizontal && fv > 0.88) || (!horizontal && fu > 0.88)) c = scale(c, 0.86);
  if (i > pr.i1 + jit - 0.1 || j > pr.j1 - jit - 0.1) c = scale(c, 0.78);
  return [S_BRICK, c];
}

function bed(b, i, j, x, y) {
  if (i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1) return null;
  const n = hash2(x, y, 41);
  let c = scale(SOIL, 0.9 + n * 0.25);
  if (i > b.i1 - 0.08 || j > b.j1 - 0.08) c = hex('#8E8474');
  return [S_BED, c];
}

export function renderGround(world, layout, seed = 1) {
  const { x0, y0, w, h } = world;
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const surf = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const sy = y + y0;
    for (let x = 0; x < w; x++) {
      const sx = x + x0;
      const i = (sx / 16 + sy / 8) / 2, j = (sy / 8 - sx / 16) / 2;
      let c = null, s = S_GRASS;
      for (const b of layout.beds) {
        const r = bed(b, i, j, sx, sy);
        if (r) { [s, c] = r; break; }
      }
      for (const p of layout.paths) {
        const hit = onPath(p, i, j, sx, sy);
        if (hit) { c = concrete(hit, sx, sy, seed); s = S_CONC; break; }
      }
      for (const pl of layout.plazas) {
        const r = pl.kind === 'stone' ? stonePlaza(pl, i, j, sx, sy) : brickRect(pl, i, j, sx, sy);
        if (r) { [s, c] = r; break; }
      }
      if (!c) {
        const m = smooth(0.32, 0.68, fbm(i / 6, j / 6, 3, 3));
        c = mix(G_DARK, G_LIGHT, m);
        const dry = smooth(0.58, 0.72, fbm(i / 9, j / 9, 9, 2));
        c = mix(c, G_DRY, dry * 0.32);
        c = scale(c, 1 + (hash2(sx >> 1, sy >> 1, 17) - 0.5) * 0.12);
      }
      const k = (y * w + x) * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      surf[y * w + x] = s;
    }
  }

  // Grass blades: 1x2 strokes, base must be on grass so they overhang path edges.
  const R = rng(seed * 7 + 3);
  const put = (x, y, c, a) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const k = (y * w + x) * 4;
    d[k] = d[k] * (1 - a) + c[0] * a; d[k + 1] = d[k + 1] * (1 - a) + c[1] * a; d[k + 2] = d[k + 2] * (1 - a) + c[2] * a;
  };
  const BL = hex('#98B954'), BD = hex('#3F5E36');
  const blades = (w * h) / 7.5;
  for (let n = 0; n < blades; n++) {
    const x = (R() * w) | 0, y = (R() * h) | 0;
    if (surf[y * w + x] !== S_GRASS) continue;
    const c = R() < 0.6 ? BL : BD;
    put(x, y, c, 0.55);
    put(x, y - 1, c, 0.4);
  }
  // Specks and wildflower clusters.
  const FL = ['#E8E0C8', '#D86A8A', '#A98BC8', '#EDE6D2', '#E3C35A'].map(hex);
  for (let n = 0; n < (w * h) / 500; n++) {
    const x = (R() * w) | 0, y = (R() * h) | 0;
    if (surf[y * w + x] === S_GRASS) put(x, y, R() < 0.6 ? FL[0] : FL[1], 0.9);
  }
  for (let n = 0; n < (w * h) / 1800; n++) {
    const cx = R() * w, cy = R() * h, c = FL[(R() * FL.length) | 0], cnt = 4 + R() * 7;
    for (let m = 0; m < cnt; m++) {
      const x = (cx + (R() - 0.5) * 9) | 0, y = (cy + (R() - 0.5) * 5) | 0;
      if (x >= 0 && y >= 0 && x < w && y < h && surf[y * w + x] === S_GRASS) {
        put(x, y, c, 0.95);
        put(x, y + 1, BD, 0.5);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, surf };
}
