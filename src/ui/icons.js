import { loadIconAtlas, ICON_NAMES, resolveIconName } from './iconAtlas.js';

export function icon(name, size = 20) {
  const resolved = resolveIconName(name);
  if (!ICON_NAMES.includes(resolved)) throw new RangeError(`Unknown UI icon: ${name}`);
  const canvas = document.createElement('canvas');
  canvas.className = 'tt-icon'; canvas.dataset.icon = name;
  canvas.setAttribute('aria-hidden', 'true');
  const scale = Math.min(3, globalThis.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(size * scale);
  canvas.style.width = canvas.style.height = `${size}px`;
  const context = canvas.getContext?.('2d');
  // Labels remain usable if canvas/image APIs are unavailable; no emoji fallback.
  if (!context || typeof Image === 'undefined') return canvas;
  loadIconAtlas().then(atlas => {
    if (!canvas.isConnected) return;
    const sprite = atlas.sprites[resolved];
    context.imageSmoothingEnabled = false;
    context.drawImage(atlas.canvas, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, canvas.width, canvas.height);
    canvas.dataset.ready = 'true';
  }).catch(() => { canvas.hidden = true; canvas.parentElement?.classList.remove('icon-only'); });
  return canvas;
}

export function iconize(node, name, size = 20) {
  node.classList.add('with-icon'); node.prepend(icon(name, size)); return node;
}
