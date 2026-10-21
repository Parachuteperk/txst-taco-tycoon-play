// One compositing pass for every character, prop, and portrait.
// Call it when a sheet is sliced. Replacing customers-chatgpt.png, a portrait
// cell, or a future customer regen runs this same function. No per-sheet colors.
//
// Plate grade measured from assets/art/bg-plate.png, every 5th pixel:
//   shadow  L 30–80   n=15861  rgb 94.27, 39.81, 29.62   luma 54.93
//   mid     L 100–160 n=18050  rgb 205.34, 104.35, 57.26 luma 129.17
//   high    L 175–230 n=9534   rgb 251.42, 186.74, 85.98 luma 194.59
// Outline ink, L 8–28, n=3032: rgb 37.30, 12.12, 11.60.
// Crew density: idle opaque heights on crew-sheet-action.png are
// 321, 348, 326, 319, 340, 323, 338 (median 326). Iso crew cell is 200×280.

import { makeCanvas } from '../util.js';
import { HALF_W, HALF_H } from '../iso/world.js';

export const OUTLINE_PX = 2;
export const OUTLINE_RGB = Object.freeze([37, 12, 12]);

export const PLATE_STOPS = Object.freeze([
  Object.freeze({ luma: 54.93, rgb: Object.freeze([94.27, 39.81, 29.62]) }),
  Object.freeze({ luma: 129.17, rgb: Object.freeze([205.34, 104.35, 57.26]) }),
  Object.freeze({ luma: 194.59, rgb: Object.freeze([251.42, 186.74, 85.98]) }),
]);

// One warmth for every sprite. How far the pixel moves toward the plate chroma.
export const PLATE_MIX = 0.28;

// Crew stay richer. Customers and props give up more chroma.
export const SATURATION = Object.freeze({
  crew: 0.04,
  portrait: 0.06,
  customer: 0.18,
  prop: 0.16,
});

// Crew is the largest body. Customers are 12% smaller. Dale's portrait is not a lead.
export const SCALE = Object.freeze({
  crew: 1,
  customer: 0.88,
  ambient: 0.68,
  dalePortrait: 0.64,
});

// Screen height of a crew sprite at camera scale 1. 118 / 32 tile-heights.
export const CREW_PX = 118;

export const CREW_BODY_PX = 326;
export const CREW_ISO_CELL = Object.freeze({ w: 200, h: 280 });

export const GRID = Object.freeze({
  halfW: HALF_W,
  halfH: HALF_H,
  tileW: HALF_W * 2,
  tileH: HALF_H * 2,
});

// Footprint width in 64×32 diamonds. Height follows the sprite aspect.
export const PROP_TILES = Object.freeze({
  grill: 1.5,
  salsa: 1.5,
  neon: 2,
  picnic: 2,
  speaker: 1,
  tip: 1,
  stand: 5,
  stall: 3.5,
  rig: 3,
  cooler: 0.75,
  goods: 0.45,
  coin: 0.3,
  plazaPost: 2,
});

export const PROP_BODY = Object.freeze({
  taco: 0.22,
  tortilla: 0.2,
  coin: 0.12,
  cash: 0.18,
  box: 0.28,
});

// Light is upper-left. The contact sits down-screen and to the right.
export const CONTACT = Object.freeze({
  dx: 0.62,
  dy: 0.9,
  alpha: 0.36,
  alphaOnGround: 0.08,
  rgb: OUTLINE_RGB,
});

const PEOPLE = new Set(['crew', 'customer', 'portrait']);

function roleKey(role) {
  if (role === 'student' || role === 'customer') return 'customer';
  if (role === 'portrait' || role === 'crew' || role === 'prop') return role;
  return 'prop';
}

export function densityCap(role) {
  const key = roleKey(role);
  const body = Math.min(CREW_BODY_PX, CREW_ISO_CELL.h);
  if (key === 'customer') return Math.round(body * SCALE.customer);
  if (key === 'portrait') return body;
  return 0;
}

export function isoSpriteHeight(role, camScale = 1) {
  const key = role === 'student' ? 'ambient' : role;
  const mul = SCALE[key] ?? SCALE.customer;
  return CREW_PX * mul * camScale;
}

export function propScreenHeight(sprite, tiles = 1, camScale = 1) {
  const src = sprite?.image || sprite;
  const span = (Number(tiles) || 1) * GRID.tileW * (Number(camScale) || 1);
  if (!src?.width || !src?.height) return (Number(tiles) || 1) * GRID.tileH * (Number(camScale) || 1);
  return span * (src.height / src.width);
}

// Plaza pieces share one source-pixel size. The post is plazaPost tile-heights tall.
export function plazaScreenHeight(sprite, reference, camScale = 1) {
  const src = sprite?.image || sprite;
  const post = reference?.image || reference;
  const srcH = src?.height || 1;
  const postH = post?.height || srcH;
  return srcH * ((PROP_TILES.plazaPost * GRID.tileH * (Number(camScale) || 1)) / postH);
}

function luma(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function plateAt(l) {
  const stops = PLATE_STOPS;
  if (l <= stops[0].luma) return stops[0].rgb;
  const last = stops[stops.length - 1];
  if (l >= last.luma) return last.rgb;
  let a = stops[0];
  let b = stops[1];
  for (let i = 1; i < stops.length; i++) {
    if (l <= stops[i].luma) { a = stops[i - 1]; b = stops[i]; break; }
  }
  const t = (l - a.luma) / (b.luma - a.luma || 1);
  return [
    a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t,
    a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t,
    a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t,
  ];
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function gradePixel(r, g, b, role) {
  const key = roleKey(role);
  const L = luma(r, g, b);
  const plate = plateAt(L);
  const pL = luma(plate[0], plate[1], plate[2]) || 1;
  let rr = r + (plate[0] * (L / pL) - r) * PLATE_MIX;
  let gg = g + (plate[1] * (L / pL) - g) * PLATE_MIX;
  let bb = b + (plate[2] * (L / pL) - b) * PLATE_MIX;
  const amount = SATURATION[key] ?? SATURATION.prop;
  const y = luma(rr, gg, bb);
  rr += (y - rr) * amount;
  gg += (y - gg) * amount;
  bb += (y - bb) * amount;
  return [clampByte(rr), clampByte(gg), clampByte(bb)];
}

function pixelsOf(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  return g.getImageData(0, 0, canvas.width, canvas.height).data;
}

function paintPixels(canvas, data) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let image = { data, width: canvas.width, height: canvas.height };
  if (typeof ImageData === 'function') {
    try { image = new ImageData(data, canvas.width, canvas.height); } catch { /* pixel mock */ }
  }
  g.putImageData(image, 0, 0);
}

function downsample(canvas, targetH) {
  const targetW = Math.max(1, Math.round(canvas.width * (targetH / canvas.height)));
  const src = pixelsOf(canvas);
  const dst = new Uint8ClampedArray(targetW * targetH * 4);
  const sw = canvas.width;
  const sh = canvas.height;
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / targetH));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / targetW));
      const from = (sy * sw + sx) * 4;
      const to = (y * targetW + x) * 4;
      dst[to] = src[from];
      dst[to + 1] = src[from + 1];
      dst[to + 2] = src[from + 2];
      dst[to + 3] = src[from + 3];
    }
  }
  const out = makeCanvas(targetW, targetH);
  paintPixels(out, dst);
  return out;
}

function gradeCanvas(canvas, role) {
  const data = pixelsOf(canvas);
  const people = PEOPLE.has(roleKey(role));
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 8) { data[i + 3] = 0; continue; }
    const [r, g, b] = gradePixel(data[i], data[i + 1], data[i + 2], role);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = people ? (a >= 128 ? 255 : 0) : a;
  }
  paintPixels(canvas, data);
  return canvas;
}

function outlineCanvas(canvas, pad = OUTLINE_PX) {
  const sw = canvas.width;
  const sh = canvas.height;
  const src = pixelsOf(canvas);
  const dw = sw + pad * 2;
  const dh = sh + pad * 2;
  const dst = new Uint8ClampedArray(dw * dh * 4);
  const solid = new Uint8Array(dw * dh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const from = (y * sw + x) * 4;
      const to = ((y + pad) * dw + (x + pad)) * 4;
      dst[to] = src[from];
      dst[to + 1] = src[from + 1];
      dst[to + 2] = src[from + 2];
      dst[to + 3] = src[from + 3];
      if (src[from + 3] > 140) solid[(y + pad) * dw + (x + pad)] = 1;
    }
  }
  const [or, og, ob] = OUTLINE_RGB;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const at = y * dw + x;
      if (solid[at]) continue;
      let hit = false;
      for (let dy = -pad; dy <= pad && !hit; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= dh) continue;
        for (let dx = -pad; dx <= pad; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= dw) continue;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > pad) continue;
          if (solid[yy * dw + xx]) { hit = true; break; }
        }
      }
      if (!hit) continue;
      const k = at * 4;
      dst[k] = or;
      dst[k + 1] = og;
      dst[k + 2] = ob;
      dst[k + 3] = 255;
    }
  }
  const out = makeCanvas(dw, dh);
  paintPixels(out, dst);
  out.footPad = pad;
  out.composited = true;
  out.compositeRole = canvas.compositeRole;
  return out;
}

// Grade, desaturate, snap people to the crew pixel grid, then a 2px outline.
export function compositeSprite(canvas, role = 'crew') {
  if (!canvas || canvas.composited || typeof canvas.getContext !== 'function') return canvas;
  const key = roleKey(role);
  const cap = densityCap(key);
  let src = canvas;
  if (cap && src.height > cap + 4) src = downsample(src, cap);
  src.compositeRole = key;
  gradeCanvas(src, key);
  return outlineCanvas(src, OUTLINE_PX);
}

export function compositeImage(img, role = 'prop') {
  if (!img) return null;
  if (img.composited) return img;
  if (typeof img.getContext === 'function' && img.width && img.height) return compositeSprite(img, role);
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  return compositeSprite(c, role);
}

export function paintSprite(ctx, image, dx, dy, dw, dh) {
  if (!ctx || !image) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, dx, dy, dw, dh);
}

// `span` is the footprint the drawer already measured (sprite width, or a fraction of it).
export function drawContactShadow(ctx, x, y, span, opt = {}) {
  if (!ctx || !(span > 0)) return;
  const rx = Math.max(5, span);
  const ry = Math.max(2, rx * 0.34);
  const ox = rx * CONTACT.dx;
  const oy = ry * CONTACT.dy;
  const a = opt.ground ? CONTACT.alphaOnGround : CONTACT.alpha;
  const [r, g, b] = CONTACT.rgb;
  ctx.beginPath();
  ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
  ctx.ellipse(x + ox, y + oy * 0.45, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
