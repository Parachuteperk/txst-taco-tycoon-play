// iso-students.png is 1536×1024, 6×4 cells of 256×256, solid magenta.
// Row 0 walkers toward lower-left, row 1 toward lower-right,
// row 2 bike, skate, scooter, jog, coffee, dog,
// row 3 sits. The widest sit cell is the two friends.
import { makeCanvas } from '../util.js';
import { compositeSprite } from '../art/composite.js';

export const STUDENT_COLS = 6;
export const STUDENT_ROWS = 4;

function isMagenta(r, g, b) {
  const rb = Math.abs(r - b);
  const mag = Math.min(r, b) - g;
  // #FF00FF paper and the bright fringe. Dark purple cloth (Mrs. West's jacket
  // sits near 100,40,100) is not the field, so both channels have to be bright.
  return rb < 60 && mag > 45 && g < 150 && Math.max(r, b) > 148 && Math.min(r, b) > 110;
}

export function keyMagenta(img) {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const image = g.getImageData(0, 0, c.width, c.height);
  const p = image.data;
  const { width, height } = c;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gc = p[i + 1], b = p[i + 2];
    if (!isMagenta(r, gc, b)) continue;
    const mag = Math.min(r, b) - gc;
    if (mag > 80 || gc < 50) p[i + 3] = 0;
    else {
      const t = Math.max(0, Math.min(1, (mag - 35) / 70));
      p[i + 3] = Math.round(255 * (1 - t));
      p[i + 2] = Math.min(b, gc + Math.max(0, r - gc) * 0.35);
      p[i] = Math.max(0, r - (r - gc) * t * 0.2);
    }
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const o = (y * width + x) * 4;
      if (p[o + 3] < 24) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (p[((y + dy) * width + (x + dx)) * 4 + 3] < 12) near = true;
        }
      }
      const r = p[o], gc = p[o + 1], b = p[o + 2];
      if (near && b > gc + 22 && b > r * 0.7 && r > 50) p[o + 2] = Math.min(b, gc + Math.max(0, r - gc) * 0.32);
    }
  }
  g.putImageData(image, 0, 0);
  return c;
}

function tight(canvas, x0, y0, x1, y1) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const w = x1 - x0;
  const h = y1 - y0;
  const data = g.getImageData(x0, y0, w, h).data;
  let minX = w, minY = h, maxX = 0, maxY = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        n++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (n < 40) return null;
  const c = makeCanvas(maxX - minX + 1, maxY - minY + 1);
  c.getContext('2d').drawImage(canvas, x0 + minX, y0 + minY, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

export function sliceIsoStudents(img) {
  const keyed = keyMagenta(img);
  const cw = Math.floor(img.width / STUDENT_COLS);
  const ch = Math.floor(img.height / STUDENT_ROWS);
  const cells = [];
  for (let r = 0; r < STUDENT_ROWS; r++) {
    for (let c = 0; c < STUDENT_COLS; c++) {
      const cell = tight(keyed, c * cw, r * ch, (c + 1) * cw, (r + 1) * ch);
      cells.push(cell ? compositeSprite(cell, 'customer') : null);
    }
  }
  const sit = cells.slice(18, 24);
  let pairIndex = 2;
  let widest = 0;
  sit.forEach((cell, i) => {
    if (cell && cell.width > widest) { widest = cell.width; pairIndex = i; }
  });
  return {
    walkSW: cells.slice(0, 6),
    walkSE: cells.slice(6, 12),
    bike: cells[12],
    skate: cells[13],
    scooter: cells[14],
    jog: cells[15],
    coffee: cells[16],
    dog: cells[17],
    sit,
    pair: sit[pairIndex] || sit[2],
    pairIndex,
  };
}

export function studentSprite(pack, kind, variant = 0, face = 1) {
  if (!pack) return null;
  if (kind === 'bike') return pack.bike;
  if (kind === 'skate') return pack.skate;
  if (kind === 'scooter') return pack.scooter;
  if (kind === 'jog') return pack.jog;
  if (kind === 'coffee') return pack.coffee;
  if (kind === 'dog') return pack.dog;
  if (kind === 'chat') return pack.pair || pack.sit?.[0];
  if (kind === 'sit') return pack.sit?.[variant % Math.max(1, pack.sit.length)] || null;
  const row = face < 0 ? pack.walkSW : pack.walkSE;
  return row?.[variant % Math.max(1, row.length)] || null;
}

// Code motion on the single painted cell. Amounts are CSS pixels; the drawer
// multiplies by dpr and does not multiply by the camera scale.
export const AMBIENT_BOB_PX = 2.5;
export const AMBIENT_BOB_CAP = 3;
export const AMBIENT_BREATHE_PX = 1;
export const AMBIENT_LEAN_DEG = 4;
export const AMBIENT_LEAN_RAD = (AMBIENT_LEAN_DEG * Math.PI) / 180;
export const AMBIENT_SQUASH = 0.045;
export const AMBIENT_STRETCH = 0.03;

const AMBIENT_MOVERS = new Set(['walk', 'jog', 'bike', 'skate', 'scooter', 'coffee', 'dog']);
const AMBIENT_SITTERS = new Set(['sit', 'chat']);
// Bike is painted toward lower-left. The other single frames face lower-right.
const PAINTED_FACE = Object.freeze({
  frisbee: 1,
  guide: -1,
  balloon: -1,
  bike: -1,
  skate: 1,
  scooter: 1,
  jog: 1,
  coffee: 1,
  dog: 1,
});

export function smoothStep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function travelFace(person) {
  if (!person) return 1;
  if (person.face < 0) return -1;
  if (person.face > 0) return 1;
  const sx = (person.di || 0) - (person.dj || 0);
  if (sx < 0) return -1;
  if (sx > 0) return 1;
  return 1;
}

export function ambientMover(person) {
  if (!person) return false;
  const kind = person.kind || 'walk';
  if (AMBIENT_SITTERS.has(kind) || kind === 'gawk') return false;
  if (person.mode === 'join') return true;
  return AMBIENT_MOVERS.has(kind);
}

export function ambientMotion(person, time, opt = {}) {
  const id = Math.abs(person?.id || 0);
  const kind = person?.kind || 'walk';
  const sitter = AMBIENT_SITTERS.has(kind);
  const mover = ambientMover(person);
  const rate = kind === 'bike' ? 7.2 : kind === 'jog' ? 8.4 : kind === 'skate' || kind === 'scooter' ? 7.6 : 6.2;
  const phase = (time || 0) * (sitter || !mover ? 1.15 : rate) + id * 0.71;
  const wave = Math.sin(phase);
  const mag = smoothStep(Math.abs(wave));
  let bob = 0;
  let lean = 0;
  let squash = 1;
  let stretch = 1;
  if (sitter) {
    bob = opt.shuffle ? 0 : Math.sin(phase) * AMBIENT_BREATHE_PX;
  } else if (mover) {
    bob = -Math.min(AMBIENT_BOB_CAP, AMBIENT_BOB_PX * mag);
    lean = travelFace(person) * Math.sign(wave || 1) * mag * AMBIENT_LEAN_RAD;
    const plant = 1 - mag;
    squash = 1 - plant * AMBIENT_SQUASH;
    stretch = 1 + plant * AMBIENT_STRETCH;
  } else {
    bob = Math.sin(phase) * AMBIENT_BREATHE_PX;
  }
  bob = Math.max(-AMBIENT_BOB_CAP, Math.min(AMBIENT_BOB_CAP, bob));
  return { bob, lean, squash, stretch, phase, mover, sitter, spoke: kind === 'bike' && mover };
}

function cellAt(row, index) {
  if (!row?.length) return null;
  return row[Math.abs(index) % row.length] || null;
}

// Prefer the painted lower-left or lower-right row. Mirror only when the cell
// we had to pick faces the opposite way from travel.
export function ambientSprite(pack, person, time) {
  if (!pack) return { sprite: null, flip: false, shuffle: false };
  const kind = person?.kind || 'walk';
  const face = travelFace(person);
  const variant = Math.abs(person?.id || 0);
  if (kind === 'sit' || kind === 'chat') {
    const idle = pack.lifeSit;
    if (idle?.length) {
      const i = Math.floor((time || 0) * 1.5 + variant * 0.37) % idle.length;
      return { sprite: idle[i], flip: false, shuffle: true };
    }
    if (kind === 'chat') return { sprite: pack.pair || pack.sit?.[0] || null, flip: false, shuffle: false };
    const sit = pack.sit || [];
    return { sprite: sit.length ? sit[variant % sit.length] : null, flip: false, shuffle: false };
  }
  if (Object.prototype.hasOwnProperty.call(PAINTED_FACE, kind)) {
    // Alternate painted variants (bike2, scooter2, skate2) when the campus-life sheet supplies them.
    const sprite = (variant % 2 && pack[`${kind}2`]) || pack[kind] || null;
    return { sprite, flip: !!sprite && PAINTED_FACE[kind] !== face, shuffle: false };
  }
  const primary = face < 0 ? pack.walkSW : pack.walkSE;
  const fallback = face < 0 ? pack.walkSE : pack.walkSW;
  if (primary?.length) return { sprite: cellAt(primary, variant), flip: false, shuffle: false };
  if (fallback?.length) return { sprite: cellAt(fallback, variant), flip: true, shuffle: false };
  return { sprite: null, flip: false, shuffle: false };
}

// Optional iso-life-sit.png: one row of a few idle frames, or a short grid of
// near-square cells. Absent file means the caller keeps iso-students sit cells.
export function lifeSitGrid(width, height) {
  const w = Math.max(1, Math.round(width || 1));
  const h = Math.max(1, Math.round(height || 1));
  let best = null;
  const maxCols = Math.min(8, w);
  const maxRows = Math.min(4, h);
  for (let rows = 1; rows <= maxRows; rows++) {
    for (let cols = 1; cols <= maxCols; cols++) {
      const cw = w / cols;
      const ch = h / rows;
      const aspect = cw / ch;
      if (aspect < 0.8 || aspect > 1.25) continue;
      const count = cols * rows;
      const err = Math.abs(1 - aspect) + (count > 6 ? 0.08 : 0);
      if (!best || err < best.err || (err === best.err && count > best.cols * best.rows && count <= 6)) {
        best = { cols, rows, err };
      }
    }
  }
  if (!best) return { cols: Math.max(1, Math.round(w / h)), rows: 1 };
  return { cols: best.cols, rows: best.rows };
}

export function lifeFrame(life, group, time, phase = 0) {
  const frames = life?.[group];
  if (!frames?.length) return null;
  const fps = group === 'birds' ? 8 : 4;
  const i = Math.floor((time || 0) * fps + phase) % frames.length;
  return frames[Math.abs(i) % frames.length];
}
