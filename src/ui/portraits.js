import { keyMagenta, despillEdges, alphaBounds } from './iconAtlas.js';
import { crewActivity } from './manager/motion.js';
import { compositeSprite, paintSprite, SCALE } from '../art/composite.js';

export const PORTRAIT_NAMES = ['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west', 'dale'];

// 4×2 source sheets, left to right, top then bottom:
//   jared phillip ali matt
//   aaron antonio west dale
// Source grids stay at assets/art/portraits.png and assets/art/portraits-react.png.
// Each person is a separate keyed file. Replacing assets/art/portraits/west.png
// (and west-react.png) does not re-slice anyone else. mountPortrait() swaps one
// cell in this map the same way.
export const PORTRAIT_CELLS = Object.freeze({
  jared: Object.freeze({ col: 0, row: 0 }),
  phillip: Object.freeze({ col: 1, row: 0 }),
  ali: Object.freeze({ col: 2, row: 0 }),
  matt: Object.freeze({ col: 3, row: 0 }),
  aaron: Object.freeze({ col: 0, row: 1 }),
  antonio: Object.freeze({ col: 1, row: 1 }),
  west: Object.freeze({ col: 2, row: 1 }),
  dale: Object.freeze({ col: 3, row: 1 }),
});

// The sheets are a flat near-magenta, not pure #FF00FF.
// Idle field samples as #FC00FA (252,0,250). React field samples as #F800F3 (248,0,243).
// keyMagenta() around #FF00FF with tolerance 52 covers both fields. Saved cells are already keyed.
export const PORTRAIT_KEY = Object.freeze({
  idle: Object.freeze([252, 0, 250]),
  react: Object.freeze([248, 0, 243]),
  tolerance: 52,
});

const HARD_TASKS = new Set(['ringing', 'folding', 'grilling', 'running', 'hacking', 'holding', 'advising']);

function cellUrl(id, react) {
  return new URL(`../../assets/art/portraits/${id}${react ? '-react' : ''}.png`, import.meta.url).href;
}

export const CREW_PORTRAITS = Object.freeze(Object.fromEntries(PORTRAIT_NAMES.map((id) => [id, Object.freeze({
  idle: cellUrl(id, false),
  react: cellUrl(id, true),
  col: PORTRAIT_CELLS[id].col,
  row: PORTRAIT_CELLS[id].row,
})])));

// West's decorative notes are isolated from the solid portrait silhouette.
// Kept for the existing prep test. The shipped cells keep her music notes and hearts;
// those are part of the portrait, not matte.
export function stripPortraitMarks(pixels, width, cell, name) {
  if (name !== 'west') return;
  const seen = new Uint8Array(cell.width * cell.height), components = [];
  for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) {
    const start = y * cell.width + x; if (seen[start] || pixels[((cell.y + y) * width + cell.x + x) * 4 + 3] < 16) continue;
    const pending = [start], part = []; seen[start] = 1;
    while (pending.length) {
      const n = pending.pop(), px = n % cell.width, py = Math.floor(n / cell.width); part.push(((cell.y + py) * width + cell.x + px) * 4);
      for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
        if (nx < 0 || ny < 0 || nx >= cell.width || ny >= cell.height) continue;
        const next = ny * cell.width + nx; if (seen[next] || pixels[((cell.y + ny) * width + cell.x + nx) * 4 + 3] < 16) continue;
        seen[next] = 1; pending.push(next);
      }
    }
    components.push(part);
  }
  const largest = Math.max(0, ...components.map((part) => part.length));
  for (const part of components) if (part.length < largest * .02) for (const at of part) pixels.fill(0, at, at + 4);
}

const frames = Object.fromEntries(PORTRAIT_NAMES.map((id) => [id, { idle: null, react: null }]));
const pending = new Map();

function cornerIsMatte(pixels, width, height) {
  const spots = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4];
  return spots.some((i) => {
    if (pixels[i + 3] < 200) return false;
    const r = pixels[i] - 255, g = pixels[i + 1], b = pixels[i + 2] - 255;
    return r * r + g * g + b * b <= PORTRAIT_KEY.tolerance * PORTRAIT_KEY.tolerance;
  });
}

function prepareCell(image) {
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const bitmap = ctx.getImageData(0, 0, width, height);
  if (cornerIsMatte(bitmap.data, width, height)) {
    keyMagenta(bitmap.data, PORTRAIT_KEY.tolerance, [255, 0, 255]);
    despillEdges(bitmap.data, width, height, [252, 1, 247]);
    ctx.putImageData(bitmap, 0, 0);
  }
  const bounds = alphaBounds(bitmap.data, width, { x: 0, y: 0, width, height });
  if (!bounds) return compositeSprite(canvas, 'portrait');
  const pad = 8, side = Math.max(bounds.width, bounds.height) + pad * 2;
  const fitted = document.createElement('canvas');
  fitted.width = fitted.height = side;
  const g = fitted.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, Math.floor((side - bounds.width) / 2), Math.floor((side - bounds.height) / 2), bounds.width, bounds.height);
  return compositeSprite(fitted, 'portrait');
}

function loadCell(id, react) {
  const key = `${id}:${react ? 'react' : 'idle'}`;
  if (!pending.has(key)) pending.set(key, new Promise((resolve, reject) => {
    const spec = CREW_PORTRAITS[id];
    if (!spec || typeof Image === 'undefined') { reject(Error('Portrait unavailable')); return; }
    const image = new Image();
    image.onload = () => { try { resolve(prepareCell(image)); } catch (error) { reject(error); } };
    image.onerror = () => reject(Error('Portrait unavailable'));
    image.src = react ? spec.react : spec.idle;
  }));
  return pending.get(key);
}

function warm(id, react) {
  loadCell(id, react).then((canvas) => { frames[id][react ? 'react' : 'idle'] = canvas; }).catch(() => {});
}

if (typeof Image !== 'undefined') for (const id of PORTRAIT_NAMES) { warm(id, false); warm(id, true); }

// Drop a replacement into the live map. Pass a canvas/image, or omit it to reload west.png.
export function mountPortrait(id, pose, image) {
  if (!frames[id] || (pose !== 'idle' && pose !== 'react')) return false;
  const key = `${id}:${pose}`;
  if (image) {
    const base = image.getContext ? image : prepareCell(image);
    const ready = base.composited ? base : compositeSprite(base, 'portrait');
    frames[id][pose] = ready;
    pending.set(key, Promise.resolve(ready));
    return true;
  }
  pending.delete(key);
  frames[id][pose] = null;
  warm(id, pose === 'react');
  return true;
}

export function portraitFrame(id, react = false) {
  const pair = frames[id];
  if (!pair) return null;
  return (react ? pair.react : pair.idle) || pair.idle || null;
}

export function paintCrewPortrait(ctx, id, x, y, size, react = false) {
  const frame = portraitFrame(id, react);
  if (!frame || !ctx) return false;
  const shown = id === 'dale' ? size * SCALE.dalePortrait : size;
  paintSprite(ctx, frame, x + (size - shown) / 2, y + (size - shown), shown, shown);
  return true;
}

// Reaction face: working hard, blushing, celebrating, or the iso inspect/happy state.
export function portraitReaction(view, person) {
  const row = typeof person === 'string' ? { id: person, shift: true } : person;
  if (!row?.id || row.shift === false) return false;
  if (view && crewActivity(view, row)) return true;
  const mood = `${row.expr || ''} ${row.mood || ''} ${row.anim || ''} ${row.state || ''}`.toLowerCase();
  if (mood.includes('blush')) return true;
  if (mood.includes('happy') || mood.includes('celebrat')) return true;
  if (row.id === 'ali' && view?.west?.status === 'present') return true;
  if (row.id === 'west' && (view?.west?.status === 'present' || view?.deck?.west?.open || view?.prompts?.west)) return true;
  if (row.id === 'dale' && view?.deck?.dale?.open) return true;
  if ((view?.combo?.count || 0) >= 3) return true;
  if (view?.bigRush?.active && HARD_TASKS.has(row.task)) return true;
  const inspect = view?.isoInspect;
  if (inspect) {
    const who = String(inspect.id || inspect.name || '').toLowerCase();
    const mine = who === row.id || who === String(row.name || '').toLowerCase();
    const inspectMood = String(inspect.mood || inspect.state || '').toLowerCase();
    if (mine && (inspect.happy || view?.overlay === 'happy' || ['happy', 'inspect', 'blush', 'celebrate', 'celebrating'].includes(inspectMood))) return true;
  }
  if (view?.overlay === 'happy' && (mood.includes('happy') || String(view?.isoInspect?.id || '') === row.id)) return true;
  return false;
}

export function portraitHotFromActor(actor, extra = {}) {
  if (!actor && extra.overlay !== 'happy' && !extra.inspect) return false;
  const anim = String(actor?.anim || '');
  const expr = String(actor?.expr || '');
  const state = String(actor?.state || actor?.mood || extra.mood || '').toLowerCase();
  const task = String(actor?.task || '');
  if (['work', 'type', 'reach', 'shake', 'blush', 'pinch', 'shrug', 'point'].includes(anim)) return true;
  if (expr === 'blush' || expr === 'happy') return true;
  if (['happy', 'celebrate', 'celebrating', 'inspect', 'blush'].includes(state)) return true;
  if (HARD_TASKS.has(task)) return true;
  if (actor?.carry) return true;
  if (extra.overlay === 'happy') return true;
  if (extra.inspect && ['happy', 'inspect', 'blush', 'celebrate', 'celebrating'].includes(state)) return true;
  return false;
}

export function portrait(name, size = 72, react = false) {
  const shown = name === 'dale' ? Math.max(1, Math.round(size * SCALE.dalePortrait)) : size;
  const canvas = document.createElement('canvas');
  canvas.className = 'crew-portrait';
  canvas.dataset.portrait = name;
  canvas.setAttribute('aria-hidden', 'true');
  const scale = Math.min(3, globalThis.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(shown * scale);
  canvas.style.width = canvas.style.height = `${shown}px`;
  canvas.style.imageRendering = 'pixelated';
  let version = 0;
  canvas.react = (reaction = false) => {
    const request = ++version;
    if (typeof Image === 'undefined' || !canvas.getContext || !CREW_PORTRAITS[name]) return;
    loadCell(name, !!reaction).then((frame) => {
      if (request !== version) return;
      frames[name][reaction ? 'react' : 'idle'] = frame;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintSprite(ctx, frame, 0, 0, canvas.width, canvas.height);
      canvas.dataset.reaction = String(!!reaction);
      canvas.dataset.ready = 'true';
    }).catch(() => { canvas.hidden = true; });
  };
  canvas.react(!!react);
  return canvas;
}
