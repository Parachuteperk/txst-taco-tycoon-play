// Student walk cycles. Sheets are 4 columns x 8 rows on near-magenta (#FA03FC),
// margins uneven, so frames are cut from ink bounds after the key, not a fixed grid.
// Row = person, column = walk frame. Sheet 1 is v3 figures 0-7. Sheet 2 is 8-15.
// v3 index 13 (sheet 2 row 6, 1-based) is the couple: one wide frame, not two people.
//
// The watch animator accepts these as N-frame strips per customer id
// (`{ frames, fps }` or a plain array). playCustomerWalk is the eased player.

import { makeCanvas, outline } from './util.js';

export const WALK_KEY = Object.freeze([250, 3, 252]);
export const WALK_TOLERANCE = 40;
export const WALK_COUNT = 16;
export const WALK_FPS = 7;
export const SHUFFLE_FPS = 6;
export const STORM_FPS = 13;
export const STEP_BOB = 2;

const PURE = Object.freeze([255, 0, 255]);

function dist2(r, g, b, color) {
  const dr = r - color[0];
  const dg = g - color[1];
  const db = b - color[2];
  return dr * dr + dg * dg + db * db;
}

// Hard key at Euclidean tolerance, then pull the pink fringe off edge pixels.
export function keyWalkPixels(pixels, width, height, tolerance = WALK_TOLERANCE, color = WALK_KEY) {
  const out = new Uint8ClampedArray(pixels);
  const limit = tolerance * tolerance;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (out[o + 3] === 0) {
      out[o] = out[o + 1] = out[o + 2] = 0;
      continue;
    }
    const r = out[o];
    const g = out[o + 1];
    const b = out[o + 2];
    if (dist2(r, g, b, color) <= limit || dist2(r, g, b, PURE) <= limit) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    }
  }
  despillWalk(out, width, height, color);
  return out;
}

export function despillWalk(pixels, width, height, color = WALK_KEY) {
  const source = pixels.slice();
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (!source[o + 3]) continue;
    const r = source[o];
    const g = source[o + 1];
    const b = source[o + 2];
    const mag = Math.min(r, b) - g;
    if (mag < 28 || Math.abs(r - b) > 70) continue;
    const x = i % width;
    const y = (i / width) | 0;
    let edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (!edge) {
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!source[((y + dy) * width + (x + dx)) * 4 + 3]) edge = true;
        }
      }
    }
    if (!edge) continue;
    const matte = Math.min(1, mag / 90);
    const alpha = 1 - matte;
    if (alpha < 0.08) {
      pixels[o] = pixels[o + 1] = pixels[o + 2] = pixels[o + 3] = 0;
      continue;
    }
    pixels[o] = Math.max(0, Math.min(255, (r - matte * color[0]) / alpha));
    pixels[o + 1] = Math.max(0, Math.min(255, (g - matte * color[1]) / alpha));
    pixels[o + 2] = Math.max(0, Math.min(255, (b - matte * color[2]) / alpha));
    pixels[o + 3] = Math.round(source[o + 3] * alpha);
    if (pixels[o + 2] > pixels[o + 1] + 18) {
      pixels[o + 2] = Math.min(pixels[o + 2], pixels[o + 1] + Math.max(0, pixels[o] - pixels[o + 1]) * 0.35);
    }
  }
  return pixels;
}

function projectionBands(score, minInk) {
  const spans = [];
  let start = -1;
  for (let i = 0; i <= score.length; i++) {
    if (i < score.length && score[i] > minInk) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      spans.push([start, i - 1]);
      start = -1;
    }
  }
  return spans;
}

function splitTall(score, spans) {
  if (spans.length < 2) return spans;
  const heights = spans.map(([a, b]) => b - a + 1).sort((a, b) => a - b);
  const median = heights[heights.length >> 1] || 1;
  const out = [];
  for (const [a, b] of spans) {
    const h = b - a + 1;
    if (h < median * 1.65 || spans.length >= 8) {
      out.push([a, b]);
      continue;
    }
    let valley = a + (h >> 1);
    let valleyN = Infinity;
    const pad = Math.floor(h * 0.2);
    for (let y = a + pad; y <= b - pad; y++) {
      if (score[y] < valleyN) { valleyN = score[y]; valley = y; }
    }
    let peak = 0;
    for (let y = a; y <= b; y++) if (score[y] > peak) peak = score[y];
    if (valleyN < peak * 0.15) {
      out.push([a, valley - 1], [valley + 1, b]);
    } else out.push([a, b]);
  }
  return out.filter(([a, b]) => b - a > 24);
}

function columnRuns(pixels, width, y0, y1, minInk) {
  const col = new Int32Array(width);
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) if (pixels[(row + x) * 4 + 3] > 16) col[x]++;
  }
  const runs = projectionBands(col, minInk);
  const merged = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run[0] - prev[1] - 1 < 18) prev[1] = run[1];
    else merged.push(run.slice());
  }
  return merged;
}

function tightBox(pixels, width, x0, x1, y0, y1) {
  let minX = x1;
  let minY = y1;
  let maxX = x0;
  let maxY = y0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      if (pixels[(row + x) * 4 + 3] <= 16) continue;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n < 400 || maxX < minX) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const crop = new Uint8ClampedArray(w * h * 4);
  for (let y = minY; y <= maxY; y++) {
    const src = (y * width + minX) * 4;
    const dst = (y - minY) * w * 4;
    crop.set(pixels.subarray(src, src + w * 4), dst);
    for (let x = 0; x < w; x++) {
      const o = dst + x * 4;
      if (crop[o + 3] <= 16) crop[o] = crop[o + 1] = crop[o + 2] = crop[o + 3] = 0;
    }
  }
  return {
    x: minX,
    y: minY,
    w,
    h,
    // Bottom-center of the ink bbox. A lifted shoe does not drag the body sideways.
    anchorX: w / 2,
    anchorY: h,
    pixels: crop,
  };
}

function mutePixels(pixels, amount = 0.16) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 8) continue;
    const y = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    pixels[i] += (y - pixels[i]) * amount;
    pixels[i + 1] += (y - pixels[i + 1]) * amount;
    pixels[i + 2] += (y - pixels[i + 2]) * amount;
  }
  return pixels;
}

// Detect character frames from keyed RGBA. People are rows. Frames in a row
// stay separate; a gap under 18px is a hole inside one sprite (the couple).
export function detectInkFrames(pixels, width, height) {
  const row = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 0; x < width; x++) if (pixels[(base + x) * 4 + 3] > 16) row[y]++;
  }
  let rows = splitTall(row, projectionBands(row, 6)).filter(([a, b]) => b - a > 40);
  if (rows.length === 4) {
    const cols = columnRuns(pixels, width, 0, height - 1, 8);
    if (cols.length === 8) {
      rows = cols.map(([a, b]) => [a, b]);
    }
  }
  const people = [];
  rows.forEach(([y0, y1], rowIndex) => {
    const runs = columnRuns(pixels, width, y0, y1, 2);
    const frames = [];
    runs.forEach(([x0, x1], col) => {
      const box = tightBox(pixels, width, x0, x1, y0, y1);
      if (!box) return;
      box.row = rowIndex;
      box.col = col;
      mutePixels(box.pixels, 0.16);
      frames.push(box);
    });
    if (frames.length) people.push(frames);
  });
  if (people.length === 4 && people.every((frames) => frames.length >= 6)) {
    const transposed = [];
    const cols = Math.max(...people.map((frames) => frames.length));
    for (let c = 0; c < cols; c++) {
      const strip = [];
      for (let r = 0; r < people.length; r++) {
        const frame = people[r][c];
        if (!frame) continue;
        frame.row = c;
        frame.col = r;
        strip.push(frame);
      }
      if (strip.length) transposed.push(strip);
    }
    return transposed;
  }
  return people;
}

export function sliceWalkPixels(pixels, width, height) {
  const keyed = keyWalkPixels(pixels, width, height);
  return detectInkFrames(keyed, width, height);
}

export function walkSheetSummary(rows) {
  const widths = rows.map((frames) => frames.map((frame) => frame.w));
  const count = widths.reduce((n, row) => n + row.length, 0);
  const all = widths.flat().filter((w) => w > 0).sort((a, b) => a - b);
  const mid = all[all.length >> 1] || 0;
  let coupleRow = -1;
  let coupleWidth = 0;
  widths.forEach((row, i) => {
    const wide = Math.max(...row, 0);
    if (wide > mid * 1.25 && wide > coupleWidth) {
      coupleWidth = wide;
      coupleRow = i;
    }
  });
  return { count, widths, coupleRow, coupleWidth };
}

function smoothstep(t) {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

// Eased clock: contact frames hold, the step between them eases through.
// Returns a fractional frame in [0, count).
export function easedWalkFrame(time, count, fps = WALK_FPS) {
  const n = Math.max(1, count | 0);
  const span = n / Math.max(0.1, fps);
  let u = (time % span) / span;
  if (u < 0) u += 1;
  const steps = 2;
  const s = u * steps;
  const i = Math.min(steps - 1, Math.floor(s));
  const e = smoothstep(s - i);
  return ((i + e) / steps) * n;
}

// Bob peaks between footfalls (odd frames / the passing pose), planted at even frames.
// Sway is the torso. Lag is the same sway delayed half a frame, so hair and the
// backpack trail the step.
export function walkMotion(frame) {
  const bob = -STEP_BOB * Math.abs(Math.sin(frame * Math.PI / 2));
  const sway = Math.sin(frame * Math.PI / 2) * 1.5;
  const lag = Math.sin((frame - 0.55) * Math.PI / 2) * 2.4;
  return { bob, sway, lag };
}

export function customerWalkIndex(id, count = WALK_COUNT) {
  let h = (Math.abs(id | 0) + 1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h >>> 0) % Math.max(1, count);
}

export function playCustomerWalk(strip, time, opts = {}) {
  const frames = !strip ? [] : Array.isArray(strip) ? strip : (strip.frames || []);
  const count = frames.length || 1;
  const fps = Number.isFinite(opts.fps) ? opts.fps : (opts.storm ? STORM_FPS : WALK_FPS);
  const frameIndex = count <= 1 ? 0 : easedWalkFrame(time, count, fps);
  const index = Math.floor(frameIndex) % count;
  const frame = frames[index] || null;
  return { frame, index, frameIndex, count, fps, ...walkMotion(frameIndex) };
}

function pixelsOf(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0);
  return g.getImageData(0, 0, canvas.width, canvas.height).data;
}

function canvasFromFrame(frame) {
  const pad = 2;
  const canvas = makeCanvas(frame.w + pad * 2, frame.h + pad * 2);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  const image = g.createImageData(frame.w, frame.h);
  image.data.set(frame.pixels);
  g.putImageData(image, pad, pad);
  outline(canvas, [30, 26, 32], 0.85);
  return {
    image: canvas,
    anchorX: pad + frame.anchorX,
    anchorY: pad + frame.anchorY,
    width: canvas.width,
    height: canvas.height,
    srcW: frame.w,
    srcH: frame.h,
    row: frame.row,
    col: frame.col,
    couple: frame.w > 170,
  };
}

async function gradeFrame(sprite) {
  let composite = null;
  try {
    composite = (await import('./art/composite.js')).compositeSprite;
  } catch { /* sizing stub may be absent during a parallel edit */ }
  if (typeof composite !== 'function') return sprite;
  const graded = composite(sprite.image, 'customer') || sprite.image;
  if (!graded || graded === sprite.image) return sprite;
  const pad = graded.footPad || 0;
  return {
    ...sprite,
    image: graded,
    anchorX: graded.width / 2,
    anchorY: graded.height - pad,
    width: graded.width,
    height: graded.height,
  };
}

export async function framesFromSheet(img) {
  const scratch = makeCanvas(img.width, img.height);
  const g = scratch.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, img.width, img.height).data;
  const rows = sliceWalkPixels(data, img.width, img.height);
  const presented = [];
  for (const row of rows) {
    const strip = [];
    for (const frame of row) strip.push(await gradeFrame(canvasFromFrame(frame)));
    presented.push(strip);
  }
  return presented;
}

// Two walk sheets, row-major, 16 strips. Sheet 2 continues at index 8.
export async function loadCustomerWalks(loadImage) {
  const [first, second] = await Promise.all([
    loadImage('assets/art/customers-walk-chatgpt-1.png').catch(() => null),
    loadImage('assets/art/customers-walk-chatgpt-2.png').catch(() => null),
  ]);
  const strips = [];
  if (first) strips.push(...await framesFromSheet(first));
  if (second) strips.push(...await framesFromSheet(second));
  return strips;
}

export async function loadCustomerSheet(loadImage, src) {
  const img = await loadImage(src).catch(() => null);
  if (!img) return [];
  const rows = await framesFromSheet(img);
  return rows.flat();
}
