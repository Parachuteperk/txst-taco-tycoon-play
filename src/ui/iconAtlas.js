// Runtime-only sprite preparation. No renderer or game-engine dependencies.
export const ICON_NAMES = Object.freeze([
  'cash', 'tacos', 'queue', 'patience', 'trust', 'tortillas',
  'cooler', 'heat', 'speed', 'combo', 'xp', 'levelUp',
  'perk', 'hire', 'upgrade', 'hack', 'suspicion', 'advice',
  'bigRush', 'weather', 'gameDay', 'finals', 'pause', 'settings',
]);
export const ICON_SHEET = new URL('../../assets/art/icons-sheet.png', import.meta.url).href;
export const ICON_COLUMNS = 6, ICON_ROWS = 4;
export const ICON_ALIASES = Object.freeze({ timer: 'patience', line: 'queue', happiness: 'trust', star: 'xp', upgradeShield: 'levelUp', callLine: 'bigRush', terminal: 'hack', sparkle: 'advice' });
export const resolveIconName = name => ICON_ALIASES[name] || name;

export function gridCell(width, height, index, columns = ICON_COLUMNS, rows = ICON_ROWS) {
  if (!Number.isInteger(index) || index < 0 || index >= columns * rows) throw new RangeError('Unknown icon cell');
  const column = index % columns, row = Math.floor(index / columns);
  // Both 1024/6 and 1376/6 are fractional; use decoded image boundaries.
  const x = Math.floor(column * width / columns), y = Math.floor(row * height / rows);
  return { x, y, width: Math.floor((column + 1) * width / columns) - x, height: Math.floor((row + 1) * height / rows) - y };
}

export function keyMagenta(pixels, tolerance = 40, color = [255, 0, 255]) {
  const limit = tolerance * tolerance;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] - color[0], g = pixels[i + 1] - color[1], b = pixels[i + 2] - color[2];
    if (r * r + g * g + b * b <= limit || pixels[i + 3] === 0) pixels.fill(0, i, i + 4);
  }
  return pixels;
}

// Remove magenta matte from antialiased edge pixels, preserving interior paint.
export function despillEdges(pixels, width, height, color = [252, 1, 247]) {
  const source = pixels.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4;
    if (!source[at + 3]) continue;
    const r = source[at], g = source[at + 1], b = source[at + 2];
    if (Math.min(r, b) - g < 40) continue;
    let edge = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height || !source[((y + dy) * width + x + dx) * 4 + 3]) edge = true;
    }
    if (!edge) continue;
    const matte = Math.min(1, (Math.min(r, b) - g) / Math.max(1, Math.min(color[0], color[2]) - color[1])), alpha = 1 - matte;
    if (alpha < .05) { pixels.fill(0, at, at + 4); continue; }
    pixels[at] = Math.max(0, (r - matte * color[0]) / alpha);
    pixels[at + 1] = Math.max(0, (g - matte * color[1]) / alpha);
    pixels[at + 2] = Math.max(0, (b - matte * color[2]) / alpha);
    pixels[at + 3] = Math.round(source[at + 3] * alpha);
  }
}

// The supplied art spills tiny shadows over two row boundaries. Remove only
// small disconnected fragments touching a cell edge; retain detached sparkles.
export function removeBorderFragments(pixels, imageWidth, cell) {
  const opaque = (x, y) => pixels[((cell.y + y) * imageWidth + cell.x + x) * 4 + 3] >= 16;
  let touchesBorder = false;
  for (let x = 0; x < cell.width; x++) if (opaque(x, 0) || opaque(x, cell.height - 1)) touchesBorder = true;
  for (let y = 0; y < cell.height; y++) if (opaque(0, y) || opaque(cell.width - 1, y)) touchesBorder = true;
  if (!touchesBorder) return;
  const visited = new Uint8Array(cell.width * cell.height), components = [];
  let largest = 0;
  for (let start = 0; start < visited.length; start++) {
    const sx = start % cell.width, sy = Math.floor(start / cell.width);
    if (visited[start] || pixels[((sy + cell.y) * imageWidth + sx + cell.x) * 4 + 3] < 16) continue;
    const pending = [start], component = []; let border = false; visited[start] = 1;
    while (pending.length) {
      const local = pending.pop(), x = local % cell.width, y = Math.floor(local / cell.width);
      component.push(((y + cell.y) * imageWidth + x + cell.x) * 4);
      if (x === 0 || x === cell.width - 1 || y === 0 || y === cell.height - 1) border = true;
      for (const [nx, ny] of [[x-1,y], [x+1,y], [x,y-1], [x,y+1]]) {
        if (nx < 0 || nx >= cell.width || ny < 0 || ny >= cell.height) continue;
        const next = ny * cell.width + nx;
        if (visited[next] || pixels[((ny + cell.y) * imageWidth + nx + cell.x) * 4 + 3] < 16) continue;
        visited[next] = 1; pending.push(next);
      }
    }
    largest = Math.max(largest, component.length); components.push({ component, border });
  }
  for (const { component, border } of components) if (border && component.length < largest * .02) for (const at of component) pixels.fill(0, at, at + 4);
}

export function alphaBounds(pixels, imageWidth, cell) {
  let left = cell.x + cell.width, top = cell.y + cell.height, right = -1, bottom = -1;
  for (let y = cell.y; y < cell.y + cell.height; y++) for (let x = cell.x; x < cell.x + cell.width; x++) {
    if (pixels[(y * imageWidth + x) * 4 + 3] < 16) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function offscreen(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}

export function createIconAtlas(source, { tileSize = 192, padding = 12, tolerance = 40, canvasFactory = offscreen, names = ICON_NAMES, columns = ICON_COLUMNS, rows = ICON_ROWS, processCell } = {}) {
  const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
  if (!width || !height) throw new Error('Icon sheet has no decoded pixels');
  const keyed = canvasFactory(width, height), context = keyed.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const bitmap = context.getImageData(0, 0, width, height);
  keyMagenta(bitmap.data, tolerance);
  despillEdges(bitmap.data, width, height);
  for (let index = 0; index < names.length; index++) { const cell = gridCell(width, height, index, columns, rows); removeBorderFragments(bitmap.data, width, cell); processCell?.(bitmap.data, width, cell, names[index]); }
  context.putImageData(bitmap, 0, 0);
  const canvas = canvasFactory(tileSize * columns, tileSize * rows), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = {};
  for (const [index, name] of names.entries()) {
    const cell = gridCell(width, height, index, columns, rows), bounds = alphaBounds(bitmap.data, width, cell);
    const x = (index % columns) * tileSize, y = Math.floor(index / columns) * tileSize;
    if (bounds) {
      const square = Math.max(bounds.width, bounds.height) + padding * 2;
      const scale = tileSize / square, w = Math.round(bounds.width * scale), h = Math.round(bounds.height * scale);
      ctx.drawImage(keyed, bounds.x, bounds.y, bounds.width, bounds.height, x + Math.floor((tileSize - w) / 2), y + Math.floor((tileSize - h) / 2), w, h);
    }
    sprites[name] = Object.freeze({ x, y, width: tileSize, height: tileSize, cell, bounds });
  }
  return Object.freeze({ canvas, sprites: Object.freeze(sprites), tileSize });
}

let atlasPromise;
export function loadIconAtlas() {
  if (!atlasPromise) atlasPromise = new Promise((resolve, reject) => {
    const sheet = new Image(); sheet.decoding = 'async';
    sheet.onload = () => { try { resolve(createIconAtlas(sheet)); } catch (error) { reject(error); } };
    sheet.onerror = () => reject(new Error('Could not load UI icon sheet'));
    sheet.src = ICON_SHEET;
  });
  return atlasPromise;
}
