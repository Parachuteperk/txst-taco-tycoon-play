// Art-asset layer: one painted plate, chroma-keyed crew sheets, screen-space anchors.
// The sim stays in tile space. This file only decides where those actors sit on the plate.
import { frame as custFrame, FY, AX, FW, FH } from './chars.js';
import { loadIsoPack, plainGoldClasp } from './iso/sheets.js';
import { BIG_LINE_PATH } from './queue.js';
import { watchFrame } from './bridge/watchFrame.js';
import { NAV } from './world.js';
import {stationPose,usesPaintedStation} from './bridge/paintedCamera.js';
import { makeCanvas } from './util.js';
import { paintCrewPortrait, portraitHotFromActor } from './ui/portraits.js';
import { collectOwned, loadUpgradeCatalog } from './upgradeVisuals.js';
import {
  customerCrewScale, customerJitter, finishCustomerSprite, paintContactShadow, posedCustomer,
} from './spriteFinish.js';
import { compositeSprite, paintSprite, drawContactShadow, SCALE, PROP_BODY } from './art/composite.js';
import { customerSpriteAt, CUSTOMER_REACTION_MOOD } from './customerReact.js';
import { loadCustomerWalks } from './customerWalk.js';

export const CREW_ORDER = ['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west'];
const WORK = new Set(['work', 'type', 'reach', 'shake', 'blush', 'pinch', 'shrug', 'point']);

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`art failed: ${src}`));
  img.src = src;
});

// Magenta (#FF00FF) and the lighter pink cell fill. r and b stay close, so a
// purple shirt or red bandana (one channel dominant) is left alone. Edges despill.
function chromaKey(img) {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gc = p[i + 1], b = p[i + 2];
    const rb = Math.abs(r - b);
    const mag = Math.min(r, b) - gc;
    const hard = rb < 48 && r > 145 && b > 145 && mag > 55 && gc < 210;
    const soft = !hard && rb < 60 && r > 120 && b > 120 && mag > 28 && gc < 190;
    if (hard) {
      p[i + 3] = 0;
    } else if (soft) {
      const keep = Math.max(0, Math.min(1, (70 - mag) / 42));
      p[i + 3] = Math.round(255 * keep);
      const spill = mag * (1 - keep);
      p[i] = Math.max(0, r - spill * 0.65);
      p[i + 2] = Math.max(0, b - spill * 0.65);
    }
  }
  g.putImageData(data, 0, 0);
  return c;
}

// Flat magenta field (#FF00FF). Hair picks up a pink fringe, so the soft edge
// is keyed out and any blue spill left on the hair is pulled back toward the
// warm color. Crew sheets keep chromaKey; this is only for the student grids.
function chromaKeyCustomers(img) {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const { width, height } = c;
  const image = g.getImageData(0, 0, width, height);
  const p = image.data;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = p[o], gc = p[o + 1], b = p[o + 2];
    const rb = Math.abs(r - b);
    const mag = Math.min(r, b) - gc;
    if (rb < 60 && mag > 40 && gc < 170 && r > 100 && b > 100) {
      if (mag > 90 || gc < 45) {
        p[o + 3] = 0;
      } else {
        const t = Math.max(0, Math.min(1, (mag - 40) / 80));
        p[o + 3] = Math.round(255 * (1 - t));
        p[o + 2] = Math.min(b, gc + Math.max(0, r - gc) * 0.4);
        p[o] = Math.max(0, r - (r - gc) * t * 0.25);
      }
    }
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const o = (y * width + x) * 4;
      if (p[o + 3] < 20) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (p[((y + dy) * width + (x + dx)) * 4 + 3] < 16) { near = true; break; }
        }
      }
      const r = p[o], gc = p[o + 1], b = p[o + 2];
      if (near && b > gc + 25 && b > r * 0.72 && r > 60) {
        p[o + 2] = Math.min(b, gc + Math.max(0, r - gc) * 0.35);
      }
    }
  }
  g.putImageData(image, 0, 0);
  return c;
}

function magentaLeftover(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const p = g.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = 0, bad = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 20) continue;
    opaque++;
    const r = p[i], gc = p[i + 1], b = p[i + 2];
    if (Math.abs(r - b) < 48 && r > 160 && b > 160 && gc < 70) bad++;
  }
  return opaque ? bad / opaque : 1;
}

// v3 is 2×8. Row 2 slot 6 is one couple, so a wide run stays one sprite.
// splitWide is for the reaction sheet only: the couple is two figures there.
function customerRuns(canvas, y0, y1, splitWide) {
  const { col, samples } = inkProfile(canvas, y0, y1);
  const width = col.length;
  const runs = [];
  let s = -1;
  for (let x = 0; x <= width; x++) {
    const hit = x < width && col[x] > samples * 0.04;
    if (hit) { if (s < 0) s = x; }
    else if (s >= 0) { if (x - s > 24) runs.push([s, x - 1]); s = -1; }
  }
  const widths = runs.map(([a, b]) => b - a);
  const median = widths.slice().sort((a, b) => a - b)[widths.length >> 1] || 160;
  const spans = [];
  for (const [a, b] of runs) {
    const wide = (b - a) > median * 1.45;
    if (splitWide && wide) {
      let best = a + Math.floor((b - a) / 2), bestN = Infinity;
      const pad = Math.floor((b - a) * 0.25);
      for (let x = a + pad; x <= b - pad; x++) if (col[x] < bestN) { bestN = col[x]; best = x; }
      spans.push({ x0: a, x1: best, split: true, wide: true, contact: bestN });
      spans.push({ x0: best + 1, x1: b, split: true, wide: true, contact: bestN });
    } else spans.push({ x0: a, x1: b, split: false, wide });
  }
  return spans;
}

function takeCustomerCells(img, splitWide) {
  const keyed = chromaKeyCustomers(img);
  const { width, height } = keyed;
  const { row } = inkProfile(keyed, 0, height);
  let valley = -1, valleyN = Infinity;
  const y0 = Math.floor(height * 0.3), y1 = Math.floor(height * 0.7);
  for (let y = y0; y < y1; y++) if (row[y] < valleyN) { valleyN = row[y]; valley = y; }
  const rows = valley > height * 0.15 ? [[0, valley], [valley + 1, height]] : [[0, height]];
  const cells = [];
  rows.forEach(([ry0, ry1], r) => {
    customerRuns(keyed, ry0, ry1, splitWide).forEach((span, c) => {
      const cell = tight(keyed, span.x0, span.x1, ry0, ry1);
      if (!cell || magentaLeftover(cell) >= 0.08) return;
      cell.row = r;
      cell.col = c;
      cell.split = !!span.split;
      cell.wide = !!span.wide;
      cell.contact = span.contact || 0;
      cells.push(cell);
    });
  });
  cells.rowCounts = rows.map((_, r) => cells.filter((cell) => cell.row === r).length);
  cells.sheet = { width: keyed.width, height: keyed.height };
  return cells;
}

export function sliceKeepGrid(img) {
  const cells = takeCustomerCells(img, false);
  let couple = null;
  cells.forEach((cell) => {
    if (cell.row === cells.rowCounts.length - 1 && cell.wide && (!couple || cell.width > couple.width)) couple = cell;
  });
  if (couple) couple.couple = true;
  cells.coupleIndex = couple ? cells.indexOf(couple) : -1;
  return cells;
}

export function sliceReactionSheet(img) {
  const cells = takeCustomerCells(img, true);
  // Football/phone and the last pair only touch. The couple is the split whose
  // gutter is still full of paint, because they are holding hands.
  let coupleContact = 0;
  for (const cell of cells) if (cell.split && cell.contact > coupleContact) coupleContact = cell.contact;
  const joined = coupleContact > 80;
  cells.forEach((cell) => { cell.couple = joined && cell.split && cell.contact === coupleContact; });
  return cells;
}

function composeSideBySide(parts) {
  const gap = 2;
  const h = Math.max(...parts.map((part) => part.height));
  const w = parts.reduce((n, part) => n + part.width, 0) + gap * Math.max(0, parts.length - 1);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  let x = 0;
  for (const part of parts) {
    g.drawImage(part, x, h - part.height);
    x += part.width + gap;
  }
  c.couple = true;
  return c;
}

function pairCustomerReactions(primary, reactions) {
  const rest = (reactions || []).filter((fig) => fig && !fig.couple);
  const couple = (reactions || []).filter((fig) => fig?.couple);
  let k = 0;
  for (const cell of primary || []) {
    if (cell.couple && couple.length) cell.react = couple.length >= 2 ? composeSideBySide(couple) : couple[0];
    else if (rest[k]) cell.react = rest[k++];
  }
  return primary;
}

// Two rows of students on a flat magenta field. A wide ink run is two people
// standing together, split at the emptiest column.
function sliceCustomerGrid(img) {
  const keyed = chromaKeyCustomers(img);
  const { width, height } = keyed;
  const { row } = inkProfile(keyed, 0, height);
  let valley = -1, valleyN = Infinity;
  const y0 = Math.floor(height * 0.3), y1 = Math.floor(height * 0.7);
  for (let y = y0; y < y1; y++) if (row[y] < valleyN) { valleyN = row[y]; valley = y; }
  const rows = valley > 0 ? [[0, valley], [valley + 1, height]] : [[0, Math.floor(height / 2)], [Math.floor(height / 2), height]];
  const out = [];
  for (const [ry0, ry1] of rows) {
    const { col, samples } = inkProfile(keyed, ry0, ry1);
    const runs = [];
    let s = -1;
    for (let x = 0; x <= width; x++) {
      const hit = x < width && col[x] > samples * 0.04;
      if (hit) { if (s < 0) s = x; }
      else if (s >= 0) { if (x - s > 24) runs.push([s, x - 1]); s = -1; }
    }
    const widths = runs.map(([a, b]) => b - a);
    const median = widths.slice().sort((a, b) => a - b)[widths.length >> 1] || 160;
    const spans = [];
    for (const [a, b] of runs) {
      if (b - a > median * 1.55) {
        let best = a + Math.floor((b - a) / 2), bestN = Infinity;
        const pad = Math.floor((b - a) * 0.25);
        for (let x = a + pad; x <= b - pad; x++) if (col[x] < bestN) { bestN = col[x]; best = x; }
        spans.push([a, best], [best + 1, b]);
      } else spans.push([a, b]);
    }
    for (const [x0, x1] of spans) {
      const cell = tight(keyed, x0, x1, ry0, ry1);
      if (cell && magentaLeftover(cell) < 0.03) out.push(compositeSprite(cell, 'customer'));
    }
  }
  return out;
}


function inkProfile(canvas, y0, y1) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const { width } = canvas;
  const h = Math.max(1, y1 - y0);
  const data = g.getImageData(0, y0, width, h).data;
  const col = new Float32Array(width);
  const row = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[base + x * 4 + 3] > 20) { col[x]++; row[y]++; }
    }
  }
  return { col, row, samples: h };
}

function tight(canvas, x0, x1, y0, y1) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = g.getImageData(x0, y0, w, h).data;
  let minX = w, minY = h, maxX = 0, maxY = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 16) {
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (n < 80) return null;
  const c = makeCanvas(maxX - minX + 1, maxY - minY + 1);
  c.getContext('2d', {willReadFrequently:true}).drawImage(canvas, x0 + minX, y0 + minY, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

// A same-layout sheet is N columns of characters, optionally two rows split by a
// magenta gutter. Gaps are measured after the key. If a row does not yield N
// gaps, the row is cut into N equal columns and trimmed. Swapping the PNG is enough.
function rowBands(canvas) {
  const { height } = canvas;
  if (height < 480) return [[0, height]];
  const { row } = inkProfile(canvas, 0, height);
  let best = -1, bestN = Infinity;
  const y0 = Math.floor(height * 0.3), y1 = Math.floor(height * 0.7);
  const sample = [];
  for (let y = y0; y < y1; y++) {
    const n = row[y];
    if ((y - y0) % 2 === 0) sample.push(n);
    if (n < bestN) { bestN = n; best = y; }
  }
  sample.sort((a, b) => a - b);
  const median = sample[sample.length >> 1] || 1;
  const width = canvas.width;
  // The gap between idle and action is a deep valley. It is not always a
  // perfectly empty row: this sheet still has a few dozen fringe pixels there.
  if (best < 0 || bestN > width * 0.08 || bestN > median * 0.25) return [[0, height]];
  let a = best, b = best;
  const lim = Math.max(bestN * 2.2, width * 0.02);
  while (a > 1 && row[a - 1] <= lim) a--;
  while (b < height - 2 && row[b + 1] <= lim) b++;
  if (a < height * 0.15 || b > height * 0.85) return [[0, height]];
  return [[0, a], [b + 1, height]];
}

function colSpans(canvas, y0, y1, columns) {
  const { col, samples } = inkProfile(canvas, y0, y1);
  const width = col.length;
  const gutters = [];
  let s = -1;
  for (let x = 0; x <= width; x++) {
    const empty = x < width && col[x] / samples < 0.02;
    if (empty) { if (s < 0) s = x; }
    else if (s >= 0) {
      if (x - s > 4) gutters.push([s, x - 1]);
      s = -1;
    }
  }
  const spans = [];
  let prev = 0;
  for (const [gs, ge] of gutters) {
    if (gs - prev > 24) spans.push([prev, gs - 1]);
    prev = ge + 1;
  }
  if (width - 1 - prev > 24) spans.push([prev, width - 1]);
  if (spans.length === columns) return spans;
  const equal = [];
  for (let i = 0; i < columns; i++) {
    equal.push([Math.floor(i * width / columns), Math.floor((i + 1) * width / columns) - 1]);
  }
  return equal;
}

// The action row has baked-in yellow stars and motion ticks. They read as a
// permanent combo. Drop that pure yellow; the combo icon is drawn only on a streak.
function stripSparkles(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const img = g.getImageData(0, 0, width, height);
  const p = img.data;
  const n = width * height;
  const kill = new Uint8Array(n);
  const pure = (i) => {
    const o = i * 4;
    const r = p[o], gc = p[o + 1], b = p[o + 2], a = p[o + 3];
    return a > 16 && r > 235 && gc > 190 && b < 70 && r - b > 160 && gc > b + 120;
  };
  const seen = new Uint8Array(n);
  const stack = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || !pure(i)) continue;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const cur = stack.pop();
      kill[cur] = 1;
      const x = cur % width;
      const y = (cur - x) / width;
      if (x > 0 && !seen[cur - 1] && pure(cur - 1)) { seen[cur - 1] = 1; stack.push(cur - 1); }
      if (x + 1 < width && !seen[cur + 1] && pure(cur + 1)) { seen[cur + 1] = 1; stack.push(cur + 1); }
      if (y > 0 && !seen[cur - width] && pure(cur - width)) { seen[cur - width] = 1; stack.push(cur - width); }
      if (y + 1 < height && !seen[cur + width] && pure(cur + width)) { seen[cur + width] = 1; stack.push(cur + width); }
    }
  }
  const core = kill.slice();
  for (let i = 0; i < n; i++) {
    if (!core[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    const fringe = (j) => {
      if (j < 0 || j >= n || kill[j]) return;
      const o = j * 4;
      const r = p[o], gc = p[o + 1], b = p[o + 2], a = p[o + 3];
      if (a > 16 && r > 210 && gc > 165 && b < 110 && r - b > 100) kill[j] = 1;
    };
    if (x > 0) fringe(i - 1);
    if (x + 1 < width) fringe(i + 1);
    if (y > 0) fringe(i - width);
    if (y + 1 < height) fringe(i + width);
  }
  for (let i = 0; i < n; i++) if (kill[i]) p[i * 4 + 3] = 0;
  g.putImageData(img, 0, 0);
  return canvas;
}

export function sliceSheet(img, columns = 7) {
  const keyed = stripSparkles(chromaKey(img));
  const bands = rowBands(keyed);
  const rows = bands.map(([y0, y1]) => colSpans(keyed, y0, y1, columns)
    .map(([x0, x1]) => tight(keyed, x0, x1, y0, y1))
    .filter(Boolean)
    .map((cell) => compositeSprite(cell, 'crew')));
  return { stand: rows[0] || [], action: rows[1] || [] };
}

// 4x4 student grid. Cells sit on light pink between brighter magenta rules.
// row 3 / col 3 (1-based) is the laptop kid and is not a customer.
function sliceCustomers(img, skip = [[2, 2]]) {
  const raw = makeCanvas(img.width, img.height);
  const rg = raw.getContext('2d', { willReadFrequently: true });
  rg.drawImage(img, 0, 0);
  const { width, height } = raw;
  const data = rg.getImageData(0, 0, width, height).data;
  const rowScore = new Float32Array(height);
  const colScore = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (data[i] > 230 && data[i + 2] > 230 && data[i + 1] < 40) n++;
    }
    rowScore[y] = n / (width / 2);
  }
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = 0; y < height; y += 2) {
      const i = (y * width + x) * 4;
      if (data[i] > 230 && data[i + 2] > 230 && data[i + 1] < 40) n++;
    }
    colScore[x] = n / (height / 2);
  }
  const cuts = (score, limit) => {
    const runs = [];
    let s = -1;
    for (let i = 0; i <= score.length; i++) {
      const hit = i < score.length && score[i] > 0.35;
      if (hit) { if (s < 0) s = i; }
      else if (s >= 0) { if (i - s > 1) runs.push(Math.floor((s + i - 1) / 2)); s = -1; }
    }
    const edges = [0, ...runs, limit];
    const spans = [];
    for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > 20) spans.push([edges[i - 1], edges[i]]);
    return spans;
  };
  let rows = cuts(rowScore, height);
  let cols = cuts(colScore, width);
  if (rows.length !== 4) {
    rows = [];
    for (let i = 0; i < 4; i++) rows.push([Math.floor(i * height / 4), Math.floor((i + 1) * height / 4)]);
  }
  if (cols.length !== 4) {
    cols = [];
    for (let i = 0; i < 4; i++) cols.push([Math.floor(i * width / 4), Math.floor((i + 1) * width / 4)]);
  }
  const keyed = chromaKey(img);
  const skipSet = new Set(skip.map(([r, c]) => `${r},${c}`));
  const out = [];
  rows.forEach(([y0, y1], r) => {
    cols.forEach(([x0, x1], c) => {
      if (skipSet.has(`${r},${c}`)) return;
      const cell = tight(keyed, x0, x1 - 1, y0, y1);
      if (cell) out.push(cell);
    });
  });
  return out;
}

function polyLen(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

export function pointOnPoly(pts, dist) {
  if (!pts.length) return { x: 0, y: 0, ang: 0 };
  let s = Math.max(0, dist);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    if (s <= L) {
      const u = s / L;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ang: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    s -= L;
  }
  const a = pts.at(-2) || pts[0], b = pts.at(-1);
  return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

function counterFrontY(poly, x) {
  if (!poly?.length) return null;
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if (x0 === x1 || x < Math.min(x0, x1) || x > Math.max(x0, x1)) continue;
    const y = y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    if (best == null || y > best) best = y;
  }
  return best;
}

// Customers belong on the plaza. A projected station point that lands on the
// counter, or in front of the rig, is moved to a pickup tile on the open brick.
function plazaFeet(map, pos, salt) {
  if (!pos) return pos;
  const poly = map.counter?.poly;
  const front = counterFrontY(poly, pos.x);
  const onStand = front != null && pos.x > 740 && pos.x < 1280 && pos.y < front + 170;
  const rig = map.rig;
  const reach = (map.sprite?.standPx || 220) * 0.86;
  const onRig = rig && Math.abs(pos.x - rig.x) < reach && pos.y > rig.y - reach * 1.45 && pos.y < rig.y + 40;
  if (!onStand && !onRig) return pos;
  const slots = (map.pickup && map.pickup.length) ? map.pickup : (map.queue || []);
  return slots.length ? slots[Math.abs(salt || 0) % slots.length] : pos;
}

function arcOn(path, i, j) {
  let best = 1e9, at = 0, acc = 0;
  for (let n = 1; n < path.length; n++) {
    const ax = path[n - 1][0], ay = path[n - 1][1], bx = path[n][0], by = path[n][1];
    const abx = bx - ax, aby = by - ay;
    const L2 = abx * abx + aby * aby || 1e-6;
    const u = Math.max(0, Math.min(1, ((i - ax) * abx + (j - ay) * aby) / L2));
    const d = Math.hypot(ax + abx * u - i, ay + aby * u - j);
    if (d < best) { best = d; at = acc + Math.sqrt(L2) * u; }
    acc += Math.sqrt(L2);
  }
  return { at, dist: best, total: acc };
}

function fitAffine(stations) {
  const pts = CREW_ORDER.map((n) => stations[n]).filter((p) => p && Number.isFinite(p.i));
  const solve = (key) => {
    let a00 = 0, a01 = 0, a02 = 0, a11 = 0, a12 = 0, a22 = 0, b0 = 0, b1 = 0, b2 = 0;
    for (const p of pts) {
      const r = [p.i, p.j, 1];
      a00 += r[0] * r[0]; a01 += r[0] * r[1]; a02 += r[0];
      a11 += r[1] * r[1]; a12 += r[1]; a22 += 1;
      const y = p[key];
      b0 += r[0] * y; b1 += r[1] * y; b2 += y;
    }
    const A = [[a00, a01, a02], [a01, a11, a12], [a02, a12, a22]];
    const B = [b0, b1, b2];
    for (let c = 0; c < 3; c++) {
      let piv = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [B[c], B[piv]] = [B[piv], B[c]];
      const d = A[c][c] || 1e-8;
      for (let r = 0; r < 3; r++) if (r !== c) {
        const f = A[r][c] / d;
        for (let k = c; k < 3; k++) A[r][k] -= f * A[c][k];
        B[r] -= f * B[c];
      }
      for (let k = c; k < 3; k++) A[c][k] /= d;
      B[c] /= d;
    }
    return B;
  };
  const X = solve('x'), Y = solve('y');
  return (i, j) => ({ x: X[0] * i + X[1] * j + X[2], y: Y[0] * i + Y[1] * j + Y[2] });
}

function prepOccluders(plate, list) {
  return (list || []).filter((o) => o.enabled !== false).map((o) => {
    const c = makeCanvas(Math.max(1, o.w), Math.max(1, o.h));
    const g = c.getContext('2d');
    g.drawImage(plate, o.x, o.y, o.w, o.h, 0, 0, o.w, o.h);
    return { ...o, canvas: c };
  });
}

// A polygon cut of the painted counter. Drawn after the station crew so the
// fascia hides them from the waist down and the plate's own grill stays visible.
function prepCounter(plate, counter) {
  const poly = counter?.poly;
  if (!poly || poly.length < 3) return null;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(plate.width, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(plate.height, Math.ceil(Math.max(...ys)));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(plate, x0, y0, w, h, 0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  poly.forEach((p, i) => (i ? g.lineTo(p[0] - x0, p[1] - y0) : g.moveTo(p[0] - x0, p[1] - y0)));
  g.closePath();
  g.fill();
  // Sort at the back edge. Behind-counter crew are clamped under it; the plaza
  // cast (Aaron, the line, West) paints after the fascia and stays in front.
  return { canvas: c, x: x0, y: y0, w, h, baseline: Math.min(...ys) };
}

function yOnLine(line, x) {
  if (!line?.length) return null;
  if (x <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    if (x <= x1 || i === line.length - 1) {
      const u = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * u;
    }
  }
  return line[line.length - 1][1];
}

// Dale + props sit on #F801F8. Tolerance is 40. Soft purple foot shadows are not part of the sprite.
function sliceDale(img) {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gc = p[i + 1], b = p[i + 2];
    const near = Math.abs(r - 248) <= 40 && Math.abs(b - 248) <= 40 && gc <= 41;
    const pink = Math.abs(r - b) < 40 && r > 180 && b > 180 && Math.min(r, b) - gc > 55 && gc < 140;
    const shadow = Math.abs(r - b) < 36 && gc + 10 < Math.min(r, b) && Math.max(r, b) < 200 && Math.min(r, b) > 6;
    if (near || pink || shadow) {
      p[i + 3] = 0;
    } else if (Math.abs(r - b) < 50 && r > 140 && b > 140 && Math.min(r, b) - gc > 28) {
      const mag = Math.min(r, b) - gc;
      const keep = Math.max(0, Math.min(1, (50 - mag) / 28));
      p[i + 3] = Math.round(255 * keep);
      const spill = mag * (1 - keep);
      p[i] = Math.max(0, r - spill * 0.7);
      p[i + 2] = Math.max(0, b - spill * 0.7);
    }
  }
  g.putImageData(data, 0, 0);
  // Measured on this sheet, then trimmed to the opaque pixels.
  const boxes = {
    dale: [55, 8, 390, 812],
    taco: [465, 80, 645, 248],
    laptop: [468, 555, 640, 740],
    drink: [490, 298, 620, 498],
    drink2: [665, 552, 848, 740],
    burrito: [772, 88, 980, 252],
    cash: [882, 572, 1070, 730],
    chips: [1058, 88, 1262, 242],
    cooler: [1126, 296, 1246, 490],
    coin: [1138, 596, 1232, 700],
  };
  const out = {};
  for (const [name, [x0, y0, x1, y1]] of Object.entries(boxes)) {
    const cell = tight(c, x0, x1, y0, y1);
    if (cell) out[name] = compositeSprite(cell, name === 'dale' ? 'customer' : 'prop');
  }
  return out;
}

// #FC01F7, tolerance 40. The tip jar is clear glass: only magenta connected to
// the image edge is removed, so the coins inside the jar survive.
function keySheet(img, { tol = 40, flood = false } = {}) {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  const w = c.width, h = c.height;
  const hard = (i) => {
    const r = p[i], gc = p[i + 1], b = p[i + 2];
    return Math.abs(r - 252) <= tol && Math.abs(b - 247) <= tol && Math.abs(gc - 1) <= tol;
  };
  if (flood) {
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const k = y * w + x;
      if (seen[k]) return;
      const i = k * 4;
      if (!hard(i)) return;
      seen[k] = 1;
      p[i + 3] = 0;
      stack.push(k);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const k = stack.pop();
      const x = k % w, y = (k / w) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0 || !hard(i)) continue;
      p[i] = 226; p[i + 1] = 234; p[i + 2] = 236; p[i + 3] = 70;
    }
  } else {
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gc = p[i + 1], b = p[i + 2];
      if (hard(i)) { p[i + 3] = 0; continue; }
      const mag = Math.min(r, b) - gc;
      if (Math.abs(r - b) < 50 && r > 140 && b > 140 && mag > 28 && gc < 180) {
        const keep = Math.max(0, Math.min(1, (50 - mag) / 28));
        p[i + 3] = Math.round(255 * keep);
        const spill = mag * (1 - keep);
        p[i] = Math.max(0, r - spill * 0.7);
        p[i + 2] = Math.max(0, b - spill * 0.7);
      }
    }
  }
  g.putImageData(data, 0, 0);
  return c;
}

function sliceUpgrades(img) {
  const keyed = keySheet(img);
  const boxes = {
    grill: [62, 174, 461, 595],
    open: [550, 170, 789, 399],
    register: [508, 400, 728, 629],
    tip: [822, 362, 957, 581],
    menu: [1016, 244, 1261, 589],
  };
  const out = {};
  for (const [name, [x0, y0, x1, y1]] of Object.entries(boxes)) {
    const cell = tight(keyed, x0, x1, y0, y1);
    if (cell) out[name] = compositeSprite(cell, 'prop');
  }
  // Retake the tip jar from an edge flood so the glass interior is not punched out.
  const flooded = keySheet(img, { flood: true });
  const tip = tight(flooded, 822, 957, 362, 581);
  if (tip) out.tip = compositeSprite(tip, 'prop');
  return out;
}

function sliceExpansion(img) {
  const keyed = keySheet(img);
  const cell = tight(keyed, 360, 980, 40, 720);
  return cell ? compositeSprite(cell, 'prop') : null;
}

// Owned ids: grill, open, register, tip, menu, expansion.
// sim.view.upgrades or sim.S.upgrades may be an object of flags or a list.
// ?upgrades=grill,open&expansion=1 is the screenshot hook.
function ownedSet(sim, opts) {
  const view = opts?.view || sim?.view || null;
  const owned = collectOwned(view, opts, sim?.S);
  const names = owned.legacy;
  if (sim?.S?.expansion || sim?.view?.expansion || sim?.S?.cooler || opts?.expansion) names.add('expansion');
  return names;
}

const ICON_NAMES = [
  'cash', 'tacos', 'line', 'timer', 'heart', 'tortillas',
  'cooler', 'grill', 'bolt', 'combo', 'star', 'shield',
  'perk', 'hire', 'wrench', 'terminal', 'eye', 'sparkle',
  'megaphone', 'weather', 'football', 'books', 'pause', 'settings',
];

function sliceIcons(img) {
  const keyed = keySheet(img);
  const cols = 6, rows = 4;
  const out = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * img.width / cols);
      const x1 = Math.floor((c + 1) * img.width / cols) - 1;
      const y0 = Math.floor(r * img.height / rows);
      const y1 = Math.floor((r + 1) * img.height / rows) - 1;
      const cell = tight(keyed, x0, x1, y0, y1);
      const name = ICON_NAMES[r * cols + c];
      if (cell && name) out[name] = compositeSprite(cell, 'prop');
    }
  }
  return out;
}

function inkSpans(canvas, y0, y1) {
  const { col, samples } = inkProfile(canvas, y0, y1);
  const width = col.length;
  const gutters = [];
  let s = -1;
  for (let x = 0; x <= width; x++) {
    const empty = x < width && col[x] / samples < 0.012;
    if (empty) { if (s < 0) s = x; }
    else if (s >= 0) {
      if (x - s > 8) gutters.push([s, x - 1]);
      s = -1;
    }
  }
  const spans = [];
  let prev = 0;
  for (const [gs, ge] of gutters) {
    if (gs - prev > 28) spans.push([prev, gs - 1]);
    prev = ge + 1;
  }
  if (width - 1 - prev > 28) spans.push([prev, width - 1]);
  return spans;
}

function neonCount(canvas) {
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 40 && data[i] > 220 && data[i + 1] < 70 && data[i + 2] < 70) n++;
  }
  return n;
}

// Shift `other` so its desk lands on `ref`. Hoodie pixels are ignored; they move.
function matchShift(ref, other) {
  const rd = ref.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, ref.width, ref.height).data;
  const od = other.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, other.width, other.height).data;
  let best = -1, bx = 0, by = 0;
  const step = 4;
  for (let oy = -18; oy <= 18; oy += 3) {
    for (let ox = -24; ox <= 24; ox += 3) {
      let score = 0;
      for (let y = 0; y < ref.height; y += step) {
        for (let x = 0; x < ref.width; x += step) {
          const i = (y * ref.width + x) * 4;
          if (rd[i + 3] < 40) continue;
          const r0 = rd[i], g0 = rd[i + 1], b0 = rd[i + 2];
          if (g0 > r0 + 18 && g0 > b0 + 8) continue;
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= other.width || yy >= other.height) continue;
          const j = (yy * other.width + xx) * 4;
          if (od[j + 3] < 40) continue;
          const d = Math.abs(r0 - od[j]) + Math.abs(g0 - od[j + 1]) + Math.abs(b0 - od[j + 2]);
          if (d < 72) score++;
        }
      }
      if (score > best) { best = score; bx = ox; by = oy; }
    }
  }
  return { dx: -bx, dy: -by };
}

// Top row: empty desk, empty chair, LIVE sign. Bottom row: four whole scenes
// (typing, lean, fist pump, sip). Frames share one canvas so the desk stays put.
export function sliceRig(img) {
  const keyed = chromaKey(img);
  const bands = rowBands(keyed);
  const [ty0, ty1] = bands[0];
  const [by0, by1] = bands[1] || [Math.floor(img.height * 0.48), img.height];
  const top = inkSpans(keyed, ty0, ty1).map(([x0, x1]) => tight(keyed, x0, x1, ty0, ty1)).filter(Boolean);
  let desk = null, live = null, chair = null, liveN = 0;
  for (const cell of top) {
    if (!desk || cell.width * cell.height > desk.width * desk.height) desk = cell;
  }
  for (const cell of top) {
    if (cell === desk) continue;
    const n = neonCount(cell);
    if (n > liveN) { live = cell; liveN = n; }
  }
  for (const cell of top) {
    if (cell === desk || cell === live) continue;
    if (!chair || cell.width * cell.height > chair.width * chair.height) chair = cell;
  }
  let bottoms = inkSpans(keyed, by0, by1);
  if (bottoms.length !== 4) {
    bottoms = [];
    for (let i = 0; i < 4; i++) bottoms.push([Math.floor(i * keyed.width / 4), Math.floor((i + 1) * keyed.width / 4) - 1]);
  }
  const cells = bottoms.map(([x0, x1]) => tight(keyed, x0, x1, by0, by1)).filter(Boolean);
  const names = ['type', 'lean', 'pump', 'sip'];
  if (cells.length < 4) return null;
  const placed = [{ cell: cells[0], dx: 0, dy: 0 }];
  for (let i = 1; i < 4; i++) {
    const shift = matchShift(cells[0], cells[i]);
    placed.push({ cell: cells[i], ...shift });
  }
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const p of placed) {
    minX = Math.min(minX, p.dx);
    minY = Math.min(minY, p.dy);
    maxX = Math.max(maxX, p.dx + p.cell.width);
    maxY = Math.max(maxY, p.dy + p.cell.height);
  }
  const W = maxX - minX, H = maxY - minY;
  const frames = {};
  placed.forEach((p, i) => {
    const c = makeCanvas(W, H);
    c.getContext('2d').drawImage(p.cell, p.dx - minX, p.dy - minY);
    frames[names[i]] = compositeSprite(c, 'prop');
  });
  const pad = frames.type?.footPad || 0;
  return {
    frames,
    desk: desk ? compositeSprite(desk, 'prop') : null,
    chair: chair ? compositeSprite(chair, 'prop') : null,
    live: live ? compositeSprite(live, 'prop') : null,
    w: frames.type?.width || W,
    h: frames.type?.height || H,
    anchorX: -minX + cells[0].width / 2 + pad,
    anchorY: -minY + cells[0].height + pad,
  };
}

// Engine contract: draw view.line, then view.live.visualLine (source 'visual',
// stable ids). visualCrowd / lineLength is the total. The legacy sim has no
// view, so the art demo uses the same shape: the real queue, then visual bodies.
function custPick(list, id) {
  if (!list?.length) return null;
  let h = (Math.abs(id | 0) + 1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return list[(h >>> 0) % list.length];
}

function lineSprite(art, id, person) {
  const list = art?.customers;
  if (!list?.length) return null;
  const base = custPick(list, id ?? 0);
  const posed = posedCustomer(base, person);
  if (posed && posed !== base) return posed;
  if (!art.customerReactions?.length) return base;
  const slot = list.indexOf(base);
  if (slot < 0) return base;
  return customerSpriteAt(art, slot, person) || base;
}

export function presentationLine(sim, opts, S) {
  const view = opts?.view || sim?.view || null;
  // ?line=55 is a camera proof. It wins over a mounted engine view so the
  // wide snake still draws; normal play never sets forcedLine.
  if (!sim?.forcedLine && view && (Array.isArray(view.line) || Array.isArray(view.live?.visualLine))) {
    const real = Array.isArray(view.line) ? view.line : [];
    const extra = Array.isArray(view.live?.visualLine) ? view.live.visualLine : [];
    const people = real.concat(extra);
    const counts = [view.live?.visualCrowd, view.live?.lineLength, typeof view.live?.line === 'number' ? view.live.line : undefined, view.lineCount, typeof view.live?.queue === 'number' ? view.live.queue : undefined, typeof view.queue === 'number' ? view.queue : undefined].filter((n) => Number.isFinite(n) && n > 0);
    const total = Math.max(people.length, counts.length ? Math.max(...counts) : 0);
    // visualCrowd is the count the scene owes. Fill any gap the arrays left
    // so a lunch crowd cannot disappear when only the count was published.
    for (let i = people.length; i < total; i++) {
      people.push({ id: 900000 + i, source: 'visual', kind: 'student', patience: 24, patienceMax: 28 });
    }
    return { people, engine: true, total };
  }
  const real = (S?.queue || []).map((a) => ({
    id: a.id, source: 'sim', patience: a.patience ?? 20, patienceMax: 28, actor: a,
  }));
  const wide = !!sim?.forcedLine;
  const total = wide ? Math.max(real.length, 55) : Math.max(real.length, 12);
  const people = real.slice();
  for (let i = real.length; i < total; i++) {
    people.push({ id: 100000 + i, source: 'visual', kind: 'student', patience: 24, patienceMax: 28 });
  }
  return { people, engine: false, total };
}

export async function loadArt(url = 'assets/art/bg-plate.map.json') {
  const map = await (await fetch(url)).json();
  const [plate, standImg, actionImg, custImg, geminiImg, daleImg, upgradeImg, expansionImg, rigImg, reactImg] = await Promise.all([
    loadImage('assets/art/bg-plate.png'),
    loadImage('assets/art/crew-sheet.png').catch(() => null),
    loadImage('assets/art/crew-sheet-action.png').catch(() => null),
    loadImage('assets/art/customers-chatgpt-v3.png').catch(() => null),
    loadImage('assets/art/customers-gemini.png').catch(() => null),
    loadImage('assets/art/dale-props-gemini.png').catch(() => null),
    loadImage('assets/art/upgrades-gemini.png').catch(() => null),
    loadImage('assets/art/expansion-stand-gemini.png').catch(() => null),
    loadImage('assets/art/antonio-gamer-rig.png').catch(() => null),
    loadImage('assets/art/customers-chatgpt-react.png').catch(() => null),
  ]);
  // icons-gemini.png is in-scene only (suspicion eye, combo burst). The file
  // was not in this upload, so this stays empty instead of 404ing.
  const iconImg = null;
  // crew-sheet-action.png is the world sheet: row 1 idle, row 2 the work pose,
  // columns Jared, Phillip, Ali, Matt, Aaron, Antonio, Mrs. West.
  // crew-sheet.png is the fallback when that file is missing or not 7 columns.
  // crew-sheet-gemini.png is a front-facing reference only. Its column order is
  // not this one, and its Ali reads older, so it is never sliced into the crew.
  const fromAction = actionImg ? sliceSheet(actionImg) : { stand: [], action: [] };
  const fromStand = standImg ? sliceSheet(standImg) : { stand: [], action: [] };
  const stand = fromAction.stand.length >= 7 ? fromAction.stand : fromStand.stand;
  const action = fromAction.action.length >= 7 ? fromAction.action : stand;
  const crew = {};
  CREW_ORDER.forEach((name, i) => {
    crew[name] = { stand: stand[i] || stand[0], action: action[i] || stand[i] || stand[0] };
  });
  plainGoldClasp(crew.west?.stand);
  if (crew.west?.action && crew.west.action !== crew.west.stand) plainGoldClasp(crew.west.action);
  // customers-chatgpt-v3.png is the line: 2 rows of 8. The couple stays one cell.
  // customers-chatgpt.png stays on disk and is not sliced back into the pool.
  // Gemini is filler only. v3 is listed twice so it dominates that filler.
  const raw = custImg ? sliceKeepGrid(custImg) : [];
  const reactionFigs = reactImg ? sliceReactionSheet(reactImg) : [];
  pairCustomerReactions(raw, reactionFigs);
  const baked = raw.map((cell) => {
    const react = cell.react || null;
    const out = compositeSprite(cell, 'customer');
    out.couple = !!cell.couple;
    return { out, react: react ? compositeSprite(react, 'customer') : null, couple: !!cell.couple, col: cell.col };
  });
  const primary = baked.map((row) => row.out);
  const primaryReact = baked.map((row) => row.react);
  const extra = (geminiImg ? sliceCustomers(geminiImg) : []).filter((cell) => magentaLeftover(cell) < 0.03).map((cell) => compositeSprite(cell, 'customer'));
  const customers = primary.length >= 8 ? primary.concat(primary, extra) : (primary.length ? primary : extra);
  const customerReactions = primary.length >= 8 ? primaryReact.concat(primaryReact, extra.map(() => null)) : primaryReact;
  const dalePack = daleImg ? sliceDale(daleImg) : {};
  const dale = dalePack.dale || null;
  const props = dalePack;
  const upgrades = upgradeImg ? sliceUpgrades(upgradeImg) : {};
  const expansion = expansionImg ? sliceExpansion(expansionImg) : null;
  const icons = iconImg ? sliceIcons(iconImg) : {};
  const rig = rigImg ? sliceRig(rigImg) : null;
  const facingRig = await loadImage('assets/art/antonio-facing-rig.png').catch(() => null);
  const graded = gradePlate(plate);
  map.plate = { w: graded.width, h: graded.height };
  const qLen = polyLen(map.queue || []);
  const [iso, customerWalk] = await Promise.all([
    loadIsoPack(loadImage),
    loadCustomerWalks(loadImage),
  ]);
  await loadUpgradeCatalog();
  return {
    map, plate: graded, crew, customers, customersV3: primary, customerWalk, customerReactions, dale, props, upgrades, expansion, icons, rig, facingRig, ready: true,
    customerSheet: {
      file: 'assets/art/customers-chatgpt-v3.png',
      reaction: 'assets/art/customers-chatgpt-react.png',
      rows: raw.rowCounts,
      sheet: raw.sheet,
      coupleIndex: raw.coupleIndex,
      coupleCol: baked.find((row) => row.couple)?.col ?? null,
      reactionRows: reactionFigs.rowCounts,
      reactionFigures: reactionFigs.length,
      scale: SCALE.customer,
    },
    iso, isoCamera: true,
    occluders: prepOccluders(graded, map.occluders),
    counter: prepCounter(graded, map.counter),
    qLen,
    project() { return fitAffine(map.stations); },
  };
}

// Pull extreme orange back toward gray by ~10%, and lift deep shadows toward violet
// so the painted plate and the crew sprites sit in the same light.
function gradePlate(img) {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const image = g.getImageData(0, 0, c.width, c.height);
  const p = image.data;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i], gc = p[i + 1], b = p[i + 2];
    const max = r > gc ? (r > b ? r : b) : (gc > b ? gc : b);
    const min = r < gc ? (r < b ? r : b) : (gc < b ? gc : b);
    const l = (max + min) * 0.5;
    const d = max - min;
    if (d > 16) {
      let hue;
      if (max === r) hue = ((gc - b) / d) % 6;
      else if (max === gc) hue = (b - r) / d + 2;
      else hue = (r - gc) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      const sat = d / (255 - Math.abs(max + min - 255) || 1);
      if ((hue <= 46 || hue >= 348) && sat > 0.4) {
        const amt = 0.1 * Math.min(1, (sat - 0.4) / 0.4);
        const gray = (r + gc + b) / 3;
        r += (gray - r) * amt;
        gc += (gray - gc) * amt;
        b += (gray - b) * amt;
      }
    }
    const shade = Math.max(0, Math.min(1, (128 - l) / 128));
    const v = shade * shade * 0.2;
    p[i] = r * (1 - v) + 64 * v;
    p[i + 1] = gc * (1 - v) + 42 * v;
    p[i + 2] = b * (1 - v) + 92 * v;
  }
  g.putImageData(image, 0, 0);
  // Vignette is baked once. Doing it per frame was a full-canvas fill on top of the plate blit.
  const cx = c.width * 0.62, cy = c.height * 0.52;
  const rad = Math.hypot(c.width, c.height) * 0.62;
  const vg = g.createRadialGradient(cx, cy, Math.min(c.width, c.height) * 0.2, cx, cy, rad);
  vg.addColorStop(0, 'rgba(18,8,16,0)');
  vg.addColorStop(0.55, 'rgba(22,10,20,0.04)');
  vg.addColorStop(0.82, 'rgba(20,8,24,0.26)');
  vg.addColorStop(1, 'rgba(12,4,18,0.48)');
  g.fillStyle = vg;
  g.fillRect(0, 0, c.width, c.height);
  const sky = g.createLinearGradient(0, 0, 0, c.height * 0.34);
  sky.addColorStop(0, 'rgba(18,6,24,0.28)');
  sky.addColorStop(1, 'rgba(18,6,24,0)');
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, c.height * 0.34);
  return c;
}

// One device-pixel scale for every crew sprite. Snapped to quarter steps so the
// reference head lands inside the review band (desktop 72–80 CSS px, phone 48–56).
export function snapSpriteScale(raw, headPx, dpr, band) {
  const mid = (band[0] + band[1]) / 2;
  let best = raw, err = Infinity, hit = false;
  for (let n = 1; n <= 24; n++) {
    const k = n * 0.25;
    const head = headPx * k / dpr;
    if (head < band[0] - 0.35 || head > band[1] + 0.35) continue;
    const e = Math.abs(head - mid);
    if (!hit || e < err - 0.01 || (Math.abs(e - err) < 0.01 && k > best)) {
      hit = true; err = e; best = k;
    }
  }
  if (hit) return best;
  const lo = band[0] * dpr / headPx, hi = band[1] * dpr / headPx;
  return Math.max(lo, Math.min(hi, raw));
}

export function frameMetrics(art, opt) {
  const sp = art.map.sprite || {};
  const pw = art.map.plate?.w || 1672;
  const ph = art.map.plate?.h || 941;
  const ref = art.crew?.jared?.stand;
  const headPx = sp.headPx || 96;
  const bodyPx = ref?.height || sp.bodyPx || 351;
  // standPx is the reference body height in plate pixels. Smaller than the old
  // lock so the counter meets the waist instead of the sprites towering over it.
  const standPx = sp.standPx || 200;
  const insetTop = opt.insetTop || 0;
  const insetBottom = opt.insetBottom || 0;
  const visH = Math.max(1, opt.dh - insetTop - insetBottom);
  // Cover the whole viewport. An explicit scale from the painted-camera fit wins.
  // Zoom 1 is the widest view that still fills the canvas.
  const cover = Math.max(opt.dw / pw, opt.dh / ph);
  const zoom = Math.max(1, opt.zoom || 1);
  const s = Number.isFinite(opt.scale)&&opt.scale>0?opt.scale:cover*zoom;
  const k = (s * standPx) / bodyPx;
  return {
    k, s, base: k / zoom, bodyPx, standPx, headPx, cover,
    span: opt.dw / s,
    visH, centerY: opt.dh / 2,
    focusX: opt.fx, focusY: opt.fy,
    headCss: headPx * k / opt.dpr,
  };
}

function viewOf(art, cam, dw, dh, dpr, portrait, rush, opt) {
  const f = art.map.framing;
  const spec = rush ? (portrait ? f.rushPhone || f.rush : f.rush) : (portrait ? f.phone : f.desktop);
  return {
    ...frameMetrics(art, {
      dw, dh, dpr, portrait,
      zoom: cam.zoom ?? spec.zoom ?? 1,
      scale: cam.sceneScale,
      fx: cam.fx ?? spec.focus[0],
      fy: cam.fy ?? spec.focus[1],
    }),
    spec,
  };
}

function toScreen(v, x, y, dw, dh) {
  return [(x - v.focusX) * v.s + dw / 2, (y - v.focusY) * v.s + (v.centerY ?? dh / 2)];
}

function drawAnchored(ctx, img, anchorX, anchorY, x, y, height) {
  if (!img) return;
  const sc = height / img.height;
  paintSprite(ctx, img, Math.round(x - anchorX * sc), Math.round(y - anchorY * sc), Math.round(img.width * sc), Math.round(img.height * sc));
}

function drawSprite(ctx, img, feetX, feetY, height, bob, squash, flip) {
  if (!img) return;
  const sc = height / img.height;
  const w = img.width * sc;
  const h = height * squash;
  const pad = img.footPad || 0;
  ctx.save();
  ctx.translate(Math.round(feetX), Math.round(feetY + bob));
  if (flip) ctx.scale(-1, 1);
  paintSprite(ctx, img, Math.round(-w / 2), Math.round(-h + pad * (h / img.height)), Math.round(w), Math.round(h));
  ctx.restore();
}

function footShadow(ctx, sx, sy, destW) {
  // The painted plate already carries the ground shadows. Keep the contact mark faint.
  drawContactShadow(ctx, sx, sy, Math.max(6, destW * 0.28), { ground: true });
}

function custPose(a, t) {
  const p = { view: a.view || 'front', expr: a.expr || 'neutral', blink: a.blink > 0, hold: a.hold || '' };
  if (a.anim === 'walk' || a.anim === 'run') {
    p.walk = Math.floor((t + (a.phase || 0)) * (a.anim === 'run' ? 12 : 10)) % 6;
    p.arms = p.walk % 3 === 0 ? 'down' : p.walk < 3 ? 'swing0' : 'swing1';
  } else {
    p.walk = -1;
    p.bob = Math.floor((t + (a.phase || 0)) * 1.4) % 2 ? -1 : 0;
    if (a.anim === 'phone') p.hold = 'phone';
    if (a.anim === 'crossed') p.arms = 'fwd';
  }
  if (a.state === 'happy' || a.state === 'eat') p.expr = 'happy';
  return p;
}

// The engine publishes the crowd (view.line, view.live.visualLine, visualCrowd).
// A plate polyline is used only when the view actually carries one.
export function ropeOf(view, map) {
  const live = view?.live;
  const candidates = [live?.rope, live?.queuePath, live?.path, view?.rope, view?.queuePath];
  for (const raw of candidates) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const points = raw.map((p) => {
      if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) return { x: p[0], y: p[1] };
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
      return null;
    });
    if (points.every(Boolean)) return { points, source: 'engine' };
  }
  return { points: map?.queue || [], source: 'map' };
}

function drawLineSign(ctx, sx, sy, s) {
  const w = Math.max(70, 92 * s);
  const h = Math.max(16, 20 * s);
  ctx.save();
  ctx.translate(sx, sy - h - 6 * s);
  ctx.fillStyle = '#6e1630';
  ctx.fillRect(-w / 2, -h, w, h);
  ctx.fillStyle = '#f4c66d';
  ctx.fillRect(-w / 2, -h, w, Math.max(2, 2.5 * s));
  ctx.restore();
}

export function drawArtScene(ctx, env) {
  const { art, sim, world, cam, dw, dh, dpr, opts, S } = env;
  const t = S.t;
  const portrait = !!opts.phone;
  const view = opts.view || sim.view || null;
  const crowdN = view?.live?.visualCrowd ?? view?.live?.lineLength ?? 0;
  const rush = !!(sim.forcedLine || view?.bigRush?.active || crowdN >= 50);
  const v = viewOf(art, cam, dw, dh, dpr, portrait, rush, opts);
  const map = art.map;
  const project = art.project();
  const pw = art.plate.width, ph = art.plate.height;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  // Cover-fit. A 2px overscan hides a subpixel seam; the camera clamp keeps
  // the viewport inside the plate so this never reveals a letterbox.
  const [px, py] = toScreen(v, 0, 0, dw, dh);
  // Overscan hides a subpixel seam. The cover scale already fills the canvas.
  ctx.drawImage(art.plate, px - 4, py - 4, pw * v.s + 8, ph * v.s + 8);

  const qPath = sim.forcedLine ? BIG_LINE_PATH : NAV.queue;
  const qSpace = sim.forcedLine ? 1.3 : 1.35;
  const plateSpace = map.queueSpacing || 34;
  const behindNames = new Set(map.counter?.behind || ['jared', 'phillip', 'ali']);
  const waist = map.counter?.waist ?? 0.56;
  const line = presentationLine(sim, opts, S);
  const queued = new Set(S.queue || []);
  art._lineN = line.people.length;
  art._lineEngine = line.engine;

  const items = [];
  const tags = [];
  const boxes = {};
  let westDrawn = false;
  const nameOf = (a) => {
    const hit = CREW_ORDER.find((n) => sim.crew[n] === a);
    return hit || (a.kind === 'west' ? 'west' : null);
  };

  for (const a of S.actors) {
    if (a.kind !== 'crew' && a.kind !== 'west' && a.kind !== 'cust' && a.kind !== 'dale') continue;
    let pos = null;
    let flip = !!a.mirror;
    let behind = false;
    let home = null;
    const who = nameOf(a) || (a.kind === 'dale' ? 'dale' : null);
    if (who === 'antonio') flip = false;
    if (who === 'antonio' && art.facingRig && map.rig?.enabled !== false) continue;
    if (a.kind === 'cust' && queued.has(a)) continue;
    const loopAt = {
      jared: [0.15, 3.1],
      phillip: [1.35, 2.4],
      ali: [0.7, 3.6],
      matt: [2.05, 2.7],
      aaron: [0.4, 2.15],
    }[who];
    const working = loopAt != null && art.crew[who]?.action && (Math.floor((t + loopAt[0] + (a.phase || 0)) * loopAt[1]) % 2 === 1);
    if (who === 'west' && map.stations.west) {
      home = map.stations.west;
      pos = { x: home.x, y: home.y };
      flip = false;
      westDrawn = true;
    } else if (who && usesPaintedStation(map, who, a)) {
      home = map.stations[who];
      pos = { x: home.x, y: home.y };
      if (behindNames.has(who)) {
        const pose = stationPose(art, who, working);
        pos = { x: pose.x, y: pose.y };
        behind = true;
      }
    }
    if (!pos && a.kind === 'cust') {
      const arc = arcOn(qPath, a.i, a.j);
      if (arc.dist < 2.2 || a.state === 'toQueue') {
        pos = pointOnPoly(map.queue, (arc.at / qSpace) * plateSpace);
        flip = Math.cos(pos.ang) > 0.15 ? false : Math.cos(pos.ang) < -0.15 ? true : flip;
      } else if (a.state === 'toPickup' || a.state === 'waitPickup' || a.state === 'happy') {
        const slots = map.pickup || [];
        const slot = slots[(a.id || 0) % Math.max(1, slots.length)] || project(a.i, a.j);
        pos = slot.x !== undefined ? slot : project(a.i, a.j);
      } else if (a.state === 'eat' || a.state === 'leave') {
        pos = pointOnPoly(map.exit?.length ? map.exit : map.queue, (arc.at / Math.max(1, arc.total)) * polyLen(map.exit || map.queue));
      }
    }
    if (!pos) pos = project(a.i, a.j);
    if (a.kind === 'cust') pos = plazaFeet(map, pos, a.id);
    // Nothing draws in the margin outside the plate. That used to be the blur band.
    if (pos.x < 4 || pos.y < 4 || pos.x > pw - 4 || pos.y > ph - 4) continue;

    const wob = Math.sin((t + (a.phase || 0)) * 3.1);
    const bob = wob * (map.sprite?.bob ?? 2.4) * dpr;
    const squash = 1 + wob * 0.025;
    // Idle on even beats, the action-row pose on odd beats. Same feet, so the
    // counter cut still meets the waist when the work pose comes up.
    if (who === 'dale' && !art.dale) continue;
    const sprite = who === 'dale' ? art.dale : who === 'antonio' && art.crew?.antonio?.action ? art.crew.antonio.action : (who && art.crew[who] ? (working ? art.crew[who].action : art.crew[who].stand) : null);
    const painted = !sprite && a.kind === 'cust' ? lineSprite(art, a.id || 0, a) : null;
    const use = sprite || painted;
    if (a.kind === 'cust' && !painted) continue;
    const crewRef = art.crew?.jared?.stand?.height || v.bodyPx;
    const standSprite = who && who !== 'dale' && art.crew[who] ? art.crew[who].stand : null;
    let destH = who === 'dale'
      ? crewRef * v.k
      : painted
        ? crewRef * v.k * SCALE.customer
        : (sprite ? sprite.height * v.k : crewRef * v.k * SCALE.customer);
    if (behind && standSprite) destH = standSprite.height * v.k;
    const destW = use ? use.width * (destH / use.height) : destH * (FW / FH);
    if (a.kind === 'cust' && (pos.y - destH / v.s < 2 || pos.x - destW / (2 * v.s) < 2 || pos.x + destW / (2 * v.s) > pw - 2)) continue;
    // Feet behind the fascia sort before the cut-out even if a tune puts them low.
    const sortY = behind && art.counter ? Math.min(pos.y, art.counter.baseline - 2) : pos.y;
    const slot = behind && home?.slot;
    if (who && art.crew?.[who]) {
      const poses = loopAt && art.crew[who].action ? [art.crew[who].stand, art.crew[who].action] : [art.crew[who].stand];
      const bh = (behind && standSprite ? standSprite.height : Math.max(...poses.map((p) => p.height))) * (v.standPx / v.bodyPx);
      let bx = pos.x - Math.max(...poses.map((p) => p.width)) * (v.standPx / v.bodyPx) / 2;
      let bw = Math.max(...poses.map((p) => p.width)) * (v.standPx / v.bodyPx);
      if (slot) { bx = slot[0]; bw = slot[1] - slot[0]; }
      boxes[who] = { x: bx, y: pos.y - bh, w: bw, h: bh, role: who === 'jared' ? 'register' : who === 'phillip' ? 'prep' : who === 'ali' ? 'grill' : who === 'matt' ? 'handoff' : who === 'aaron' ? 'floor' : '' };
    }
    items.push({
      y: sortY,
      draw: (c) => {
        const [sx, sy] = toScreen(v, pos.x, pos.y, dw, dh);
        let clipped = false;
        if (slot) {
          const [lx] = toScreen(v, slot[0], pos.y, dw, dh);
          const [rx] = toScreen(v, slot[1], pos.y, dw, dh);
          c.save();
          c.beginPath();
          c.rect(Math.min(lx, rx), sy - destH - 28 * dpr, Math.abs(rx - lx), destH + 40 * dpr);
          c.clip();
          clipped = true;
        }
        if (!behind) footShadow(c, sx, sy, destW);
        c.imageSmoothingEnabled = false;
        if (use) drawSprite(c, use, sx, sy, destH, bob, squash, flip);
        else if (a.kind !== 'cust') {
          const fr = custFrame(a.def, custPose(a, t), flip);
          const sc = destH / FH;
          c.drawImage(fr, Math.round(sx - AX * sc), Math.round(sy - FY * sc + bob), Math.round(FW * sc), Math.round(FH * sc * squash));
        }
        if (painted && a.hold === 'taco' && art.props?.taco) {
          drawSprite(c, art.props.taco, sx + destW * 0.16, sy - destH * 0.22, destH * 0.16, 0, 1, false);
        }
        if (who === 'matt' && !working && art.props?.taco && WORK.has(a.anim)) {
          drawSprite(c, art.props.taco, sx + destW * 0.12, sy - destH * 0.34, destH * 0.16, 0, 1, false);
        }
        if (clipped) c.restore();
      },
    });
    if (who && a.def?.name) {
      const [sx, sy] = toScreen(v, pos.x, pos.y, dw, dh);
      const bias = (map.tagBias?.[who] || 0) * dpr;
      tags.push({ a, who, sx, sy: sy - destH - 8 * dpr + bias, name: a.def.name, accent: a.def.accent });
    }
  }

  const owned = ownedSet(sim, opts);
  const spots = map.upgrades || {};
  for (const name of ['grill', 'open', 'register', 'tip', 'menu']) {
    const img = art.upgrades?.[name];
    const at = spots[name];
    if (!owned.has(name) || !at) continue;
    const h = at.h || 100;
    items.push({
      y: at.y,
      draw: (c) => {
        const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
        c.imageSmoothingEnabled = false;
        if (img) drawSprite(c, img, sx, sy, h * v.s, 0, 1, false);
        else {
          c.fillStyle = name === 'grill' ? '#6e1630' : name === 'open' ? '#67e8f9' : name === 'tip' ? '#e8b84a' : '#c4a574';
          c.fillRect(sx - 14 * v.s, sy - 20 * v.s, 28 * v.s, 16 * v.s);
        }
      },
    });
  }
  if (owned.has('expansion') && art.expansion && map.expansion) {
    const at = map.expansion;
    const h = at.h || 240;
    items.push({
      y: at.y,
      draw: (c) => {
        const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
        c.imageSmoothingEnabled = false;
        if (!at.behind) footShadow(c, sx, sy, h * v.s * (art.expansion.width / art.expansion.height));
        c.imageSmoothingEnabled = false;
        drawSprite(c, art.expansion, sx, sy, h * v.s, 0, 1, false);
      },
    });
  }

  if (art.counter) {
    const o = art.counter;
    items.push({
      y: o.baseline,
      draw: (c) => {
        c.imageSmoothingEnabled = true;
        const [sx, sy] = toScreen(v, o.x, o.y, dw, dh);
        c.drawImage(o.canvas, sx, sy, o.w * v.s, o.h * v.s);
      },
    });
  }

  for (const o of art.occluders) {
    if (o.enabled === false) continue;
    items.push({
      y: o.baseline,
      draw: (c) => {
        c.imageSmoothingEnabled = true;
        const [sx, sy] = toScreen(v, o.x, o.y, dw, dh);
        c.drawImage(o.canvas, sx, sy, o.w * v.s, o.h * v.s);
      },
    });
  }
  if (!westDrawn && art.crew?.west && map.stations?.west) {
    const at = map.stations.west;
    const sprite = art.crew.west.stand;
    const destH = sprite.height * v.k;
    const destW = sprite.width * (destH / sprite.height);
    items.push({
      y: at.y,
      draw: (c) => {
        const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
        footShadow(c, sx, sy, destW);
        c.imageSmoothingEnabled = false;
        drawSprite(c, sprite, sx, sy, destH, 0, 1, false);
      },
    });
    const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
    tags.push({ a: { def: { name: 'MRS. WEST' } }, who: 'west', sx, sy: sy - destH - 8 * dpr, name: 'MRS. WEST', accent: '#B79AD8' });
  }

  const rope = ropeOf(view, map);
  const ropePts = rope.points;
  art._ropeSource = rope.source;
  const qLen = polyLen(ropePts);
  const count = line.people.length;
  // Spread a lunch along the bends. A short spacing piles everyone on the first segment.
  const spacing = Math.min(rush ? 64 : 90, (qLen * 0.82) / Math.max(count - 1, 1));
  if (count > 1 && ropePts.length) {
    ctx.save();
    const ropeLen = (count - 1) * spacing;
    // Posts at the bends the rope has reached, so the snake reads as one line.
    let walked = 0;
    const posts = [ropePts[0]];
    for (let i = 1; i < ropePts.length; i++) {
      walked += Math.hypot(ropePts[i].x - ropePts[i - 1].x, ropePts[i].y - ropePts[i - 1].y);
      if (walked > ropeLen + spacing) break;
      posts.push(ropePts[i]);
    }
    for (const post of posts) {
      const [sx, sy] = toScreen(v, post.x, post.y, dw, dh);
      const ph = Math.max(8, v.s * 18);
      const pw = Math.max(2.5, v.s * 4);
      ctx.fillStyle = '#3A2418';
      ctx.fillRect(sx - pw / 2, sy - ph, pw, ph + 2);
      ctx.fillStyle = '#E6C98A';
      ctx.beginPath();
      ctx.arc(sx, sy - ph, pw * 0.95, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(92, 52, 32, 0.92)';
    ctx.lineWidth = Math.max(2, v.s * 2.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = Math.max(2, Math.ceil(ropeLen / 16));
    for (let s = 0; s <= steps; s++) {
      const at = pointOnPoly(ropePts, (s / steps) * ropeLen);
      const [sx, sy] = toScreen(v, at.x, at.y + 2, dw, dh);
      s ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    }
    ctx.stroke();
    const tail = pointOnPoly(ropePts, Math.min(qLen, ropeLen + spacing * 0.85));
    const [tx, ty] = toScreen(v, tail.x, tail.y, dw, dh);
    drawLineSign(ctx, tx, ty - 8 * dpr, Math.max(0.85, v.s));
    ctx.restore();
  }

  const custH = (art.crew?.jared?.stand?.height || v.bodyPx) * v.k * SCALE.customer;
  line.people.forEach((c, i) => {
    const along = i * spacing + Math.sin(t * 1.6 + i * 0.7) * 5;
    const at = pointOnPoly(ropePts, along);
    const sprite = lineSprite(art, c.id ?? i, c);
    if (!sprite) return;
    const remain = c.patienceMax ? c.patience / c.patienceMax : 1;
    const annoyed = remain < 0.35;
    const visual = c.source === 'visual';
    const idn = Math.abs(c.id || i);
    const idle = idn % 5;
    const hop = (c.golden || (visual && i % 6 === Math.floor(t * 0.8) % 6) || idle === 3) ? Math.max(0, Math.sin(t * (idle === 3 ? 5 : 7) + i)) * (idle === 3 ? 3 : 5) * dpr : 0;
    // Face the line, and mirror about half of them so the row isn't sixteen copies of one stance.
    const travelRight = Math.cos(at.ang) >= 0;
    const flip = ((idn * 17) % 2 === 0) ? !travelRight : travelRight;
    const destH = custH;
    const destW = sprite.width * (destH / sprite.height);
    const plateH = destH / v.s;
    const plateW = destW / v.s;
    // Feet and the whole sprite stay on the plate. Nothing draws in the margin.
    if (at.x - plateW / 2 < 2 || at.x + plateW / 2 > pw - 2 || at.y - plateH < 2 || at.y > ph - 2) return;
    const bob = Math.sin(t * (2.4 + idle * 0.45) + idn) * (idle === 2 ? 3.2 : 1.4) * dpr - hop;
    // Behind the counter front, so a customer at the service window cannot paint over the crew.
    const sortY = art.counter ? Math.min(at.y, art.counter.baseline - 1) : at.y;
    items.push({
      y: sortY,
      draw: (g) => {
        const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
        footShadow(g, sx, sy, destW * (annoyed ? 0.85 : 1));
        g.imageSmoothingEnabled = false;
        if (sprite) drawSprite(g, sprite, sx, sy, destH, bob, annoyed ? 0.96 : 1, flip);
      },
    });
  });

  const walkerLanes = [map.spawnRight, map.exit, map.spawnLeft].filter((path) => path?.length > 1);
  const walkerSpots = [];
  for (const path of walkerLanes) {
    const len = polyLen(path);
    const steps = Math.max(4, Math.ceil(len / 28));
    for (let s = 0; s <= steps; s++) {
      const at = pointOnPoly(path, (s / steps) * len);
      const onCrew = (map.stations && Object.entries(map.stations).some(([id, st]) => id !== 'dale' && st && Math.hypot(at.x - st.x, at.y - st.y) < (id === 'antonio' ? 160 : 100)))
        || (map.rig && Math.hypot(at.x - map.rig.x, at.y - map.rig.y) < 160);
      if (!onCrew && (at.y > 860 || at.x < 680 || at.x > 1400)) walkerSpots.push(at);
    }
  }
  const ambs = (S.actors || []).filter((a) => a.kind === 'amb').slice(0, 6);
  ambs.forEach((a, i) => {
    const at = walkerSpots.length
      ? walkerSpots[(i * 2 + Math.floor(((a.phase || 0) + t * 0.15) * walkerSpots.length)) % walkerSpots.length]
      : null;
    if (!at || at.x < 4 || at.y < 4 || at.x > pw - 4 || at.y > ph - 4) return;
    const sprite = lineSprite(art, a.id || i, a);
    const destH = sprite ? custH : v.bodyPx * v.k * 0.78;
    const destW = sprite ? sprite.width * (destH / sprite.height) : destH * 0.5;
    const bob = Math.sin(t * 4 + i) * 1.6 * dpr;
    items.push({
      y: at.y,
      draw: (g) => {
        const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
        footShadow(g, sx, sy, destW);
        g.imageSmoothingEnabled = false;
        if (sprite) drawSprite(g, sprite, sx, sy, destH, bob, 1, i % 2 === 0);
      },
    });
  });

  if (art.facingRig && map.rig?.enabled !== false && (map.rig || map.stations?.antonio)) {
    const anchor = map.rig || map.stations.antonio;
    const img = art.facingRig;
    const frameH = (v.standPx || 200) * 1.15;
    const screenH = frameH * v.s;
    const screenW = screenH * (img.width / img.height);
    const bob = Math.sin(t * 1.6) * 1.4 * dpr;
    items.push({
      y: anchor.y,
      draw: (g) => {
        const [sx, sy] = toScreen(v, anchor.x, anchor.y, dw, dh);
        footShadow(g, sx, sy + 4, screenW * 0.42);
        g.imageSmoothingEnabled = false;
        // Facing composite: monitor backs toward the camera, Antonio's face beside them.
        // No monitor overlay, no debug quad, no rear-only gamer frame.
        drawAnchored(g, img, img.width / 2, img.height, sx, sy + bob, screenH);
      },
    });
    const [sx, sy] = toScreen(v, anchor.x, anchor.y, dw, dh);
    const antonio = sim.crew?.antonio;
    tags.push({
      a: antonio || { def: { name: 'ANTONIO' } },
      who: 'antonio',
      sx: sx + screenW * 0.22,
      sy: sy - screenH * 0.92,
      name: antonio?.def?.name || 'ANTONIO',
      accent: antonio?.def?.accent || '#F2D23A',
    });
    art._rigBox = {
      x: anchor.x - frameH * (img.width / img.height) / 2,
      y: anchor.y - frameH,
      w: frameH * (img.width / img.height),
      h: frameH,
    };
  }
  art._boxes = boxes;

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw(ctx);

  ctx.imageSmoothingEnabled = true;

  // Name tags, small and anchored to the sprite head.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.max(12, Math.round((portrait ? 15 : 13) * dpr));
  ctx.font = `600 ${fs}px Silkscreen, ui-monospace, monospace`;
  const placed = [];
  for (const tag of tags) {
    let al = opts.tagAlpha ? opts.tagAlpha(tag.a) : 1;
    if (opts.pointer && opts.zoomHover !== false) {
      const dx = tag.sx / dpr - opts.pointer[0], dy = (tag.sy + 40 * dpr) / dpr - opts.pointer[1];
      if (Math.hypot(dx, dy) < 80) al = 1;
    }
    if (al <= 0.02) continue;
    const tw = ctx.measureText(tag.name).width;
    const hot = portraitHotFromActor(tag.a, { overlay: opts.overlay });
    const showFace = !!tag.who;
    const facePx = showFace ? Math.max(fs + 6 * dpr, 22 * dpr) : 0;
    const phh = Math.max(fs + 4 * dpr, facePx + 4 * dpr), pw2 = tw + 8 * dpr + (showFace ? facePx + 4 * dpr : 0);
    const crowded = (x, y) => placed.some((q) => Math.abs(q[0] - x) < (q[2] + pw2) / 2 + 6 * dpr && Math.abs(q[1] - y) < phh + 4 * dpr);
    let tx = tag.sx;
    let dy = tag.sy;
    const step = Math.max(10 * dpr, pw2 * 0.55);
    const vstep = phh + 6 * dpr;
    if (crowded(tx, dy)) {
      if (!crowded(tx + step, dy)) tx += step;
      else if (!crowded(tx - step, dy)) tx -= step;
      else if (!crowded(tx, dy + vstep)) dy += vstep;
      else if (!crowded(tx, dy - vstep)) dy -= vstep;
    }
    const safe=watchFrame(dw/dpr,dh/dpr);
    tx=Math.max(safe.left*dpr+pw2/2,Math.min(safe.right*dpr-pw2/2,tx));
    dy=Math.max(safe.top*dpr+phh/2,Math.min(safe.bottom*dpr-phh/2,dy));
    placed.push([tx, dy, pw2]);
    ctx.globalAlpha = al * 0.92;
    ctx.fillStyle = 'rgba(30,22,24,0.62)';
    roundRect(ctx, tx - pw2 / 2, dy - phh / 2, pw2, phh, 3 * dpr);
    ctx.fill();
    ctx.fillStyle = tag.accent || '#F4C66D';
    const barInset = showFace ? facePx + 6 * dpr : 3 * dpr;
    ctx.fillRect(tx - pw2 / 2 + barInset, dy + phh / 2 - 2 * dpr, pw2 - barInset - 3 * dpr, Math.max(1, dpr));
    if (showFace) paintCrewPortrait(ctx, tag.who, tx - pw2 / 2 + 3 * dpr, dy - facePx / 2, facePx, hot);
    ctx.fillStyle = '#F6E7C8';
    ctx.fillText(tag.name, tx + (showFace ? (facePx + 4 * dpr) / 2 : 0), dy);
    ctx.globalAlpha = 1;
  }

  // In-scene icons only. The HUD stays with the integration agent.
  ctx.imageSmoothingEnabled = false;
  if (art.icons?.eye && (S.suspicion || 0) >= 2 && map.stations?.antonio) {
    const at = map.stations.antonio;
    const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
    const head = (art.crew?.antonio?.stand?.height || v.bodyPx) * v.k;
    drawSprite(ctx, art.icons.eye, sx + 34 * dpr, sy - head * 0.78, 26 * dpr, 0, 1, false);
  }
  if (S.comboFlash > 0 && art.icons?.sparkle) {
    const [sx, sy] = toScreen(v, 1120, 360, dw, dh);
    const hop = Math.sin(t * 9) * 5 * dpr;
    drawSprite(ctx, art.icons.sparkle, sx, sy + hop, 34 * dpr, 0, 1, false);
    if (art.icons.combo) drawSprite(ctx, art.icons.combo, sx + 30 * dpr, sy - 8 * dpr + hop, 30 * dpr, 0, 1, false);
  }

  // Served food, the taco toss, and cash — painted props, same projection as the crew.
  ctx.imageSmoothingEnabled = false;
  const propFor = { taco: 'taco', tortilla: 'taco', coin: 'coin', cash: 'cash' };
  for (const p of S.props) {
    if (p.x === undefined) continue;
    const [i, j] = world.inv(p.x, p.y);
    const at = plazaFeet(map, project(i, j), p.kind === 'taco' ? 2 : 1);
    const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
    const key = propFor[p.kind];
    const img = key && art.props?.[key];
    if (img) {
      const hgt = (art.crew?.jared?.stand?.height || v.bodyPx) * v.k * (PROP_BODY[p.kind] || PROP_BODY.taco);
      drawSprite(ctx, img, sx, sy, hgt, 0, 1, false);
    } else if (p.kind === 'bit') {
      ctx.fillStyle = p.color || '#E0533F';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    } else if (p.kind === 'coin') {
      ctx.fillStyle = '#F4C66D'; ctx.fillRect(sx - 3, sy - 3, 6, 6);
    } else if (p.kind === 'taco' || p.kind === 'tortilla') {
      ctx.fillStyle = '#E8B85A'; ctx.beginPath(); ctx.ellipse(sx, sy, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.font = `${Math.round(fs * 1.25)}px Silkscreen, ui-monospace, monospace`;
  ctx.textAlign = 'center';
  for (const x of S.texts) {
    const [i, j] = world.inv(x.x, x.y - x.t * 14);
    const at = project(i, j);
    const [sx, sy] = toScreen(v, at.x, at.y, dw, dh);
    ctx.globalAlpha = Math.min(1, 2 * (1.2 - x.t));
    ctx.fillStyle = '#1E1A20'; ctx.fillText(x.s, sx + dpr, sy + dpr);
    ctx.fillStyle = x.color; ctx.fillText(x.s, sx, sy);
    ctx.globalAlpha = 1;
  }

  if (opts.debugMap) drawMapOverlay(ctx, art, v, dw, dh, dpr);
  ctx.restore();
  return v;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const HANDLES = [];
function drawMapOverlay(ctx, art, v, dw, dh, dpr) {
  HANDLES.length = 0;
  const add = (pt, label, color) => {
    const [sx, sy] = toScreen(v, pt.x, pt.y, dw, dh);
    HANDLES.push({ pt, sx, sy });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx - 7, sy); ctx.lineTo(sx + 7, sy); ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `${11 * dpr}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(label, sx + 8, sy - 6);
  };
  ctx.save();
  ctx.globalAlpha = 0.9;
  const q = art.map.queue || [];
  ctx.strokeStyle = '#7CFFB2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  q.forEach((p, i) => {
    const [sx, sy] = toScreen(v, p.x, p.y, dw, dh);
    i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
  });
  ctx.stroke();
  q.forEach((p, i) => add(p, `q${i}`, '#7CFFB2'));
  for (const [name, p] of Object.entries(art.map.stations || {})) add(p, name, '#FFD25A');
  (art.map.pickup || []).forEach((p, i) => add(p, `p${i}`, '#7AD0FF'));
  for (const key of ['spawnLeft', 'spawnRight', 'exit']) {
    const pts = art.map[key] || [];
    ctx.strokeStyle = '#FF8AD0';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [sx, sy] = toScreen(v, p.x, p.y, dw, dh);
      i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    });
    ctx.stroke();
    pts.forEach((p, i) => add(p, `${key[0]}${i}`, '#FF8AD0'));
  }
  for (const o of art.map.occluders || []) {
    const [sx, sy] = toScreen(v, o.x, o.y, dw, dh);
    ctx.strokeStyle = '#FF5A5A';
    ctx.strokeRect(sx, sy, o.w * v.s, o.h * v.s);
    add({ x: o.x, y: o.baseline, _occ: o }, o.id, '#FF5A5A');
  }
  const poly = art.map.counter?.poly || [];
  if (poly.length) {
    ctx.strokeStyle = '#FF5A5A';
    ctx.beginPath();
    poly.forEach((p, i) => {
      const [sx, sy] = toScreen(v, p[0], p[1], dw, dh);
      i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();
  }
  // 200px grid so a screenshot can be retuned by eye.
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.font = `${10 * dpr}px ui-monospace, monospace`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  for (let x = 0; x <= art.plate.width; x += 200) {
    const [sx] = toScreen(v, x, 0, dw, dh);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, dh); ctx.stroke();
    ctx.fillText(String(x), sx + 2, 14 * dpr);
  }
  for (let y = 0; y <= art.plate.height; y += 200) {
    const [, sy] = toScreen(v, 0, y, dw, dh);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(dw, sy); ctx.stroke();
    ctx.fillText(String(y), 2, sy + 12 * dpr);
  }
  ctx.restore();
}

export function hitHandle(cssX, cssY, dpr) {
  let best = null, bd = 18;
  for (const h of HANDLES) {
    const d = Math.hypot(cssX - h.sx / dpr, cssY - h.sy / dpr);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

export function mapJson(art) {
  const m = art.map;
  const slim = {
    note: m.note, plate: m.plate, sprite: m.sprite, framing: m.framing,
    composition:m.composition, uiGeometry:m.uiGeometry,
    stations: m.stations, pickup: m.pickup, queueSpacing: m.queueSpacing,
    queue: m.queue, spawnLeft: m.spawnLeft, spawnRight: m.spawnRight, exit: m.exit,
    occluders: (m.occluders || []).map(({ id, x, y, w, h, baseline }) => ({ id, x, y, w, h, baseline })),
    counter: m.counter, tagBias: m.tagBias, upgrades: m.upgrades, expansion: m.expansion,
    rig: m.rig, sign: m.sign, oldMain: m.oldMain,
  };
  return JSON.stringify(slim, null, 2);
}
