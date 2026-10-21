// Cuts the painted sheets named in docs/iso-asset-list.md.
// Each file is a magenta grid. Feet sit at the bottom center of the cell.
// index.json lists only the files that are actually in the repo, so a missing
// sheet does not 404.

import { makeCanvas } from '../util.js';
import { keyMagenta, lifeSitGrid } from './students.js';
import { compositeSprite, compositeImage } from '../art/composite.js';
import { prepareCrewLoops, LOOP_HOLDS, LOOP_FPS, MATT_RELEASE_FRAME } from './crewLoops.js';

export const CREW_NAMES = ['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west'];

const MANIFEST = {
  'iso-ground.png': { id: 'ground' },
  'iso-stand-table.png': { id: 'stand', era: 'table' },
  'iso-stand-tent.png': { id: 'stand', era: 'tent' },
  'iso-stand-counter.png': { id: 'stand', era: 'stand' },
  'iso-stand-truck.png': { id: 'stand', era: 'truck' },
  'iso-stand-stall.png': { id: 'stall' },
  'iso-rig.png': { id: 'rig' },
  'iso-bubbles.png': { id: 'bubbles', cols: 6, rows: 1 },
  'iso-lamp.png': { id: 'lamps', cols: 2, rows: 1 },
  'iso-crew-idle.png': { id: 'crewIdle', cols: 7, rows: 1 },
  'iso-crew-work.png': { id: 'crewWork', cols: 7, rows: 1 },
  'iso-crew-walk.png': { id: 'crewWalk', cols: 7, rows: 4 },
  'iso-crew-carry.png': { id: 'crewCarry', cols: 7, rows: 3 },
  'iso-students.png': { id: 'students', cols: 6, rows: 4 },
  'iso-campus-life.png': { id: 'campusLife', cols: 6, rows: 3 },
  'iso-life.png': { id: 'life', cols: 4, rows: 3 },
  'iso-life-sit.png': { id: 'lifeSit' },
  'iso-customers.png': { id: 'customers', cols: 8, rows: 4 },
  'iso-customers-pay.png': { id: 'customersPay', cols: 8, rows: 1 },
  'iso-coin.png': { id: 'coin', cols: 3, rows: 1 },
  'iso-goods.png': { id: 'goods', cols: 8, rows: 1 },
  'iso-grackle.png': { id: 'grackle', cols: 8, rows: 1 },
  'iso-prop-surge.png': { id: 'prop', key: 'surge' },
  'iso-sig-props.png': { id: 'sig', cols: 5, rows: 1 },
  'iso-sig-props-2.png': { id: 'sig2', cols: 4, rows: 1 },
  'iso-prop-grill.png': { id: 'prop', key: 'grill' },
  'iso-prop-salsa.png': { id: 'prop', key: 'salsa' },
  'iso-prop-neon.png': { id: 'prop', key: 'neon' },
  'iso-prop-picnic.png': { id: 'prop', key: 'picnic' },
  'iso-prop-speaker.png': { id: 'prop', key: 'speaker' },
  'iso-prop-tip.png': { id: 'prop', key: 'tip' },
  'iso-prop-card-reader.png': { id: 'prop', key: 'cardReader' },
  'iso-prop-press.png': { id: 'prop', key: 'press' },
  'iso-prop-tray.png': { id: 'prop', key: 'tray' },
  'iso-prop-megaphone.png': { id: 'prop', key: 'megaphone' },
  'iso-prop-monitor.png': { id: 'prop', key: 'monitor' },
  'iso-prop-ring.png': { id: 'prop', key: 'ring' },
  'iso-prop-live.png': { id: 'prop', key: 'live' },
  'iso-prop-franchise.png': { id: 'prop', key: 'franchise' },
  'iso-prop-hacky.png': { id: 'hacky', cols: 4, rows: 1 },
  'iso-prop-vault.png': { id: 'vault' },
  'iso-coin-spin.png': { id: 'coin', cols: 6, rows: 1 },
  'iso-prop-cannon.png': { id: 'prop', key: 'cannon' },
  'iso-prop-moped.png': { id: 'prop', key: 'moped' },
  'iso-prop-dj.png': { id: 'prop', key: 'dj' },
  'iso-prop-crypto.png': { id: 'prop', key: 'crypto' },
  'iso-prop-briefcase.png': { id: 'prop', key: 'briefcase' },
  'iso-prop-velvet.png': { id: 'prop', key: 'velvet' },
  'iso-prop-menu-gold.png': { id: 'prop', key: 'menuGold' },
  'plaza-props-chatgpt.png': { id: 'plaza' },
};

function framed(image) {
  const pad = image?.footPad || 0;
  return { image, anchorX: image.width / 2, anchorY: image.height - pad };
}

export function sliceGrid(img, cols, rows, role = 'crew') {
  const keyed = keyMagenta(img);
  const cw = img.width / cols;
  const ch = img.height / rows;
  const frames = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = makeCanvas(Math.round(cw), Math.round(ch));
      cell.getContext('2d').drawImage(keyed, c * cw, r * ch, cw, ch, 0, 0, cell.width, cell.height);
      const image = compositeSprite(cell, role);
      frames.push({ ...framed(image), col: c, row: r });
    }
  }
  return frames;
}

function packStudents(frames) {
  return {
    walkSW: frames.slice(0, 6),
    walkSE: frames.slice(6, 12),
    bike: frames[12],
    skate: frames[13],
    scooter: frames[14],
    jog: frames[15],
    coffee: frames[16],
    dog: frames[17],
    sit: frames.slice(18, 24),
    pair: frames[20],
  };
}

function emptyPack() {
  return { ground: null, stands: {}, stall: null, rig: null, crew: {}, props: {}, students: null, life: null, lifeSit: null, goods: null, bubbles: null, lamps: null, plaza: null };
}

// plaza-props-chatgpt.png is one magenta row, not an even grid. Cells left to right:
// post, rope span, corner post, line-start sign, trash, folding table, cooler, boxes.
// Feet sit at the bottom center of each sliced cell. Tolerance ~40 from #FF00FF, then despill.
const PLAZA_CELLS = [
  { name: 'post', x0: 48, y0: 250, x1: 125, y1: 497, footX: 86, footY: 497 },
  { name: 'span', x0: 171, y0: 259, x1: 500, y1: 497, footX: 336, footY: 497 },
  { name: 'corner', x0: 544, y0: 248, x1: 860, y1: 497, footX: 697, footY: 497 },
  { name: 'sign', x0: 903, y0: 259, x1: 1123, y1: 508, footX: 981, footY: 508 },
  { name: 'trash', x0: 1162, y0: 228, x1: 1339, y1: 514, footX: 1271, footY: 514 },
  { name: 'table', x0: 1376, y0: 261, x1: 1667, y1: 528, footX: 1463, footY: 528 },
  { name: 'cooler', x0: 1703, y0: 218, x1: 1908, y1: 497, footX: 1813, footY: 497 },
  { name: 'boxes', x0: 1938, y0: 248, x1: 2126, y1: 498, footX: 2032, footY: 498 },
];

export function keyPlazaMagenta(img) {
  const c = makeCanvas(img.width, img.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const image = g.getImageData(0, 0, c.width, c.height);
  const p = image.data;
  const w = c.width;
  const h = c.height;
  const tol = 46;
  const keyed = new Uint8Array(w * h);
  for (let i = 0, px = 0; i < p.length; i += 4, px++) {
    const r = p[i];
    const gc = p[i + 1];
    const b = p[i + 2];
    const dist = Math.hypot(r - 255, gc, b - 255);
    const field = Math.abs(r - b) < 40 && Math.min(r, b) - gc > 60 && gc < 80 && r > 150 && b > 150;
    if (dist < tol || field) {
      p[i + 3] = 0;
      keyed[px] = 1;
    } else if (dist < tol + 28 && Math.abs(r - b) < 50 && gc < 100 && Math.min(r, b) > gc + 30) {
      p[i + 3] = Math.round(255 * ((dist - tol) / 28));
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = y * w + x;
      if (keyed[px]) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
          if (keyed[yy * w + xx]) touch = true;
        }
      }
      if (!touch) continue;
      const o = px * 4;
      const r = p[o];
      const gc = p[o + 1];
      const b = p[o + 2];
      const fringe = Math.abs(r - b) < 48 && Math.min(r, b) - gc > 22 && Math.min(r, b) > gc * 1.8 && r > 50 && b > 50 && gc < 140;
      if (fringe) {
        p[o + 3] = 0;
        keyed[px] = 1;
        continue;
      }
      const spill = Math.min(r, b) - gc;
      if (spill > 14 && Math.abs(r - b) < 70 && gc < 180) {
        const s = Math.max(0, Math.min(1, (spill - 14) / 80));
        p[o] = Math.max(0, Math.round(r - Math.max(0, r - gc) * s * 0.85));
        p[o + 2] = Math.max(0, Math.round(b - Math.max(0, b - gc) * s * 0.85));
        p[o + 3] = Math.round(p[o + 3] * (1 - s * 0.55));
      }
    }
  }
  g.putImageData(image, 0, 0);
  return c;
}

export function slicePlaza(img) {
  const keyed = keyPlazaMagenta(img);
  const out = { spanGap: 252 };
  for (const cell of PLAZA_CELLS) {
    const left = cell.footX - cell.x0;
    const right = cell.x1 - cell.footX;
    const half = Math.max(left, right);
    const sw = cell.x1 - cell.x0 + 1;
    const sh = cell.footY - cell.y0 + 1;
    const canvas = makeCanvas(half * 2 + 1, sh);
    canvas.getContext('2d').drawImage(keyed, cell.x0, cell.y0, sw, sh, half - left, 0, sw, sh);
    const image = compositeSprite(canvas, 'prop');
    const pad = image.footPad || 0;
    out[cell.name] = { image, anchorX: half + pad, anchorY: image.height - pad };
  }
  return out;
}

// 7 columns is one frame per direction. The sheet that landed is 5600×1120,
// 28 columns of 200×280, four painted cells per person. Both slice the same way.
export function walkStride(cols) {
  return Math.max(1, Math.round(cols / 7));
}

function hasInk(frame) {
  const img = frame?.image;
  if (!img?.width) return false;
  const g = img.getContext('2d', { willReadFrequently: true });
  const data = g.getImageData(0, 0, img.width, img.height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 32) if (data[i] > 24) n++;
  return n > 12;
}

export async function loadIsoPack(loadImage, fetchIndex = fetch) {
  const pack = emptyPack();
  let files = [];
  try {
    const res = await fetchIndex('assets/art/iso/index.json');
    if (res?.ok) files = (await res.json()).files || [];
  } catch { /* no index, keep placeholders */ }
  await Promise.all(files.map(async (name) => {
    const spec = MANIFEST[name];
    if (!spec || name === 'iso-target-mockup.png') return;
    const img = await loadImage(`assets/art/iso/${name}`).catch(() => null);
    if (!img) return;
    if (spec.id === 'ground') { pack.ground = img; return; }
    if (spec.id === 'rig') {
      // Bottom center of the whole 520×400 bitmap. The chair sits to the right
      // and its wheels do not touch the cell bottom, so this is not a chair anchor.
      const image = compositeImage(keyMagenta(img), 'prop');
      pack.rig = { image, anchorX: image.width / 2, anchorY: image.height };
      return;
    }
    if (spec.id === 'stall' && img.width > 900) {
      // Measured 2080×420: four 520×420 ideas. The last cell is the taco stall.
      const cols = Math.max(1, Math.round(img.width / 520));
      const frames = sliceGrid(img, cols, 1, 'prop');
      pack.stall = frames[frames.length - 1] || frames[0];
      return;
    }
    if (spec.id === 'stand' || spec.id === 'stall' || spec.id === 'prop') {
      // Single-image sprites are painted on flat magenta too; key them before the shared grade.
      const sprite = framed(compositeImage(keyMagenta(img), 'prop'));
      if (spec.id === 'stand') pack.stands[spec.era] = sprite;
      else if (spec.id === 'prop') pack.props[spec.key] = sprite;
      else pack[spec.id] = sprite;
      return;
    }
    if (spec.id === 'vault') {
      pack.vault = framed(compositeImage(keyMagenta(img), 'prop'));
      return;
    }
    if (spec.id === 'coin') {
      pack.coin = sliceGrid(img, spec.cols || Math.max(1, Math.round(img.width / img.height)), 1, 'prop').map((frame) => ({
        ...frame,
        anchorX: frame.image.width / 2,
        anchorY: frame.image.height / 2,
      }));
      return;
    }
    if (spec.id === 'plaza') { pack.plaza = slicePlaza(img); return; }
    if (spec.id === 'life') {
      const frames = sliceGrid(img, spec.cols || 4, spec.rows || 3, 'prop');
      pack.life = {
        leaves: frames.slice(0, 4).filter(hasInk),
        birds: frames.slice(4, 8).filter(hasInk),
        frisbee: frames[8] && hasInk(frames[8]) ? [frames[8]] : [],
      };
      return;
    }
    if (spec.id === 'lifeSit') {
      const grid = lifeSitGrid(img.width, img.height);
      const frames = sliceGrid(img, grid.cols, grid.rows, 'customer').filter(hasInk);
      if (frames.length) pack.lifeSit = frames;
      return;
    }
    const cols = spec.id === 'crewWalk' ? Math.max(7, Math.round(img.width / 200)) : spec.cols;
    const rows = spec.id === 'crewWalk' ? Math.max(1, Math.round(img.height / 280)) : spec.rows;
    const role = spec.id === 'students' || spec.id === 'campusLife' ? 'customer' : (spec.id === 'crewIdle' || spec.id === 'crewWork' || spec.id === 'crewWalk' || spec.id === 'crewCarry') ? 'crew' : 'prop';
    const frames = sliceGrid(img, cols, rows, role);
    if (spec.id === 'students') pack.students = packStudents(frames);
    else if (spec.id === 'campusLife') pack.campusLife = frames;
    else if (spec.id === 'goods') pack.goods = frames.map((frame) => (hasInk(frame) ? frame : null));
    else if (spec.id === 'bubbles') pack.bubbles = frames;
    else if (spec.id === 'lamps') pack.lamps = frames;
    else if (spec.id === 'hacky') pack.hacky = frames;
    else if (spec.id === 'grackle') pack.grackle = frames;
    else if (spec.id === 'customersPay') pack.customersPay = frames;
    else if (spec.id === 'customers') {
      pack.customers = {
        idle: frames.slice(0, 8),
        walk: frames.slice(8, 16),
        eat: frames.slice(16, 24),
        angry: frames.slice(24, 32),
      };
    } else if (spec.id === 'sig') {
      // $3, $7, flags, scandal flags, hacky ball. No moped and no DJ.
      if (!pack.props.surge) pack.props.surge = frames[0];
      if (!pack.props.surgeHot) pack.props.surgeHot = frames[1];
      pack.props.franchise = frames[2];
      pack.props.franchiseScandal = frames[3];
      if (!pack.hacky) pack.hacky = frames[4] ? [frames[4]] : null;
    } else if (spec.id === 'sig2') {
      // Cannon, DJ booth, crypto rack, vault. The DJ cell is not assigned.
      if (!pack.props.cannon) pack.props.cannon = frames[0];
      if (!pack.props.crypto) pack.props.crypto = frames[2];
      if (!pack.vault) pack.vault = frames[3];
    }
    else if (spec.id === 'crewIdle' || spec.id === 'crewWork') {
      CREW_NAMES.forEach((who, i) => { pack.crew[who] = pack.crew[who] || {}; pack.crew[who][spec.id === 'crewIdle' ? 'idle' : 'work'] = frames[i]; });
    } else if (spec.id === 'crewWalk') {
      const per = walkStride(cols);
      CREW_NAMES.forEach((who, i) => {
        pack.crew[who] = pack.crew[who] || {};
        pack.crew[who].walk = [0, 1, 2, 3].map((row) => frames.slice(row * cols + i * per, row * cols + i * per + per));
      });
    } else if (spec.id === 'crewCarry') {
      CREW_NAMES.forEach((who, i) => {
        pack.crew[who] = pack.crew[who] || {};
        pack.crew[who].carry = [0, 1, 2].map((row) => frames[row * 7 + i]);
      });
    }
  }));
  frameLook(pack.crew?.antonio?.work);
  // Measured iso-crew-work.png column 6: Antonio faces the camera at a desk
  // with a monitor. That cell is the rig, so iso-rig.png is not stacked on it.
  pack.antonioFacesCamera = true;
  pack.antonioRigInWork = !!pack.crew?.antonio?.work;
  if (pack.crew.antonio) pack.crew.antonio.carry = null;
  plainGoldClasp(pack.crew?.west?.idle?.image);
  plainGoldClasp(pack.crew?.west?.work?.image);
  const anim = await loadImage('assets/art/crew-anim-chatgpt.png').catch(() => null);
  if (anim) {
    const portrait = await loadImage('assets/art/portraits.png').catch(() => null);
    const sheetPx = imagePixels(anim);
    const facePx = portrait ? imagePixels(portrait) : null;
    const prepared = prepareCrewLoops(sheetPx.pixels, sheetPx.width, sheetPx.height, facePx ? {
      portrait: { pixels: facePx.pixels, width: facePx.width, height: facePx.height },
    } : {});
    pack.crewReport = prepared.report;
    CREW_NAMES.forEach((who) => {
      const loop = prepared.loops[who];
      const frames = loop.frames.map((frame) => finishLoopFrame(frame));
      pack.crew[who] = pack.crew[who] || {};
      pack.crew[who].loop = frames;
      pack.crew[who].workStrip = {
        frames,
        holds: LOOP_HOLDS[who],
        fps: LOOP_FPS,
        release: who === 'matt' ? MATT_RELEASE_FRAME : -1,
      };
    });
  }
  // iso-campus-life.png (6x3, 180x260): walkers / bikes, scooters, skaters / study pair, frisbee pair,
  // dog walker, tour guide, balloon vendor, squirrel. It is the richer paint, so it wins over iso-students.
  if (pack.campusLife?.length >= 18) {
    const f = pack.campusLife.map((frame) => (hasInk(frame) ? frame : null));
    const row = (r) => f.slice(r * 6, r * 6 + 6).filter(Boolean);
    const base = pack.students || {};
    pack.students = {
      ...base,
      walkSW: row(0).length ? row(0) : base.walkSW,
      walkSE: row(0).length ? [] : base.walkSE,
      bike: f[6] || base.bike, bike2: f[7], scooter: f[8] || base.scooter, scooter2: f[9], skate: f[10] || base.skate, skate2: f[11],
      pair: f[12] || base.pair, frisbee: f[13], dog: f[14] || base.dog, guide: f[15], balloon: f[16], squirrel: f[17],
      sit: [f[12], ...(base.sit || [])].filter(Boolean),
    };
  }
  return pack;
}

function imagePixels(img) {
  const canvas = makeCanvas(img.width, img.height);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height);
  return { pixels: data.data, width: canvas.width, height: canvas.height };
}

function finishLoopFrame(frame) {
  const pad = 2;
  const canvas = makeCanvas(frame.w + pad * 2, frame.h + pad * 2);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const image = g.createImageData(frame.w, frame.h);
  image.data.set(frame.pixels);
  g.putImageData(image, pad, pad);
  const finished = compositeSprite(canvas, 'crew');
  return {
    image: finished,
    anchorX: frame.anchorX + pad,
    anchorY: frame.anchorY + pad,
    bodyH: frame.bodyH,
    w: finished.width,
    h: finished.height,
    sparks: frame.sparks,
  };
}

// Mrs. West's bag ships with a gold GG monogram. Replace that cluster with a
// plain clasp. Solid jewelry and the belt buckle are left alone.
export function plainGoldClasp(canvas) {
  if (!canvas?.getContext || !canvas.width) return canvas;
  let image;
  try { image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); }
  catch { return canvas; }
  const p = image.data;
  const w = canvas.width;
  const h = canvas.height;
  const goldAt = (i) => {
    const r = p[i], g = p[i + 1], b = p[i + 2], a = p[i + 3];
    return a > 170 && r > 155 && g > 95 && b < 95 && r - b > 70 && g > b + 18;
  };
  const seen = new Uint8Array(w * h);
  let best = null;
  const yStart = Math.floor(h * 0.42);
  for (let y = yStart; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start] || !goldAt(start * 4)) continue;
      const stack = [start];
      seen[start] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, n = 0;
      for (let k = 0; k < stack.length; k++) {
        const cur = stack[k];
        n++;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < yStart || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (seen[ni] || !goldAt(ni * 4)) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (n < 18 || bw < 12 || bh < 8 || bw > 42 || bh > 30) continue;
      let holes = 0;
      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const o = (yy * w + xx) * 4;
          if (p[o + 3] > 140 && !goldAt(o) && p[o] > 70 && p[o + 1] < 90) holes++;
        }
      }
      if (holes < 8) continue;
      if (!best || n > best.n) best = { minX, minY, maxX, maxY, n, holes };
    }
  }
  if (!best) return canvas;
  const cx = (best.minX + best.maxX) / 2;
  const cy = (best.minY + best.maxY) / 2;
  const rx = (best.maxX - best.minX) / 2 + 0.6;
  const ry = (best.maxY - best.minY) / 2 + 0.6;
  for (let y = best.minY - 1; y <= best.maxY + 1; y++) {
    for (let x = best.minX - 1; x <= best.maxX + 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const o = (y * w + x) * 4;
      const edge = nx * nx + ny * ny > 0.72;
      p[o] = edge ? 176 : 232;
      p[o + 1] = edge ? 124 : 184;
      p[o + 2] = edge ? 32 : 48;
      p[o + 3] = 255;
    }
  }
  canvas.getContext('2d').putImageData(image, 0, 0);
  return canvas;
}

// Antonio's work cell is a front view when skin sits in the upper middle of the
// opaque ink. A wide cell is the desk, monitors, and chair, not just his body.
function frameLook(frame) {
  const img = frame?.image;
  if (!img?.width) return null;
  const g = img.getContext('2d', { willReadFrequently: true });
  const data = g.getImageData(0, 0, img.width, img.height).data;
  let minX = img.width, minY = img.height, maxX = 0, maxY = 0, n = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      if (data[(y * img.width + x) * 4 + 3] < 24) continue;
      n += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (n < 20) return null;
  let face = 0;
  const y1 = minY + (maxY - minY) * 0.42;
  const x0 = minX + (maxX - minX) * 0.22;
  const x1 = minX + (maxX - minX) * 0.78;
  for (let y = minY; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const o = (Math.round(y) * img.width + Math.round(x)) * 4;
      const r = data[o], gc = data[o + 1], b = data[o + 2];
      if (data[o + 3] < 24) continue;
      if (r > 135 && gc > 85 && b > 60 && r > gc && gc > b && r - b > 22) face += 1;
    }
  }
  return { w: maxX - minX, h: maxY - minY, face };
}
