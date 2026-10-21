// Presentation contract for the painted renderer. No engine state or art imports.
export const SCENE_CAST = Object.freeze({
  antonio: Object.freeze({ appearance: 'White, slightly chubby', pose: 'seated', station: 'own laptop table', props: ['chair', 'table', 'laptop'] }),
  west: Object.freeze({ appearance: 'Skinny millionaire professor, big auburn updo, designer outfit, luxury handbag', near: 'ali', alwaysVisible: true, regular: true }),
  ali: Object.freeze({ appearance: 'South Asian / Indian, warm brown skin, distinct facial features', station: 'grill' }),
});

// Fit the complete sign + cast + visible queue into the *usable* scene frame.
// Bounds and focus share renderer coordinates; frame is CSS pixels. Do not apply
// a subsequent cover-fit/minimum zoom clamp: that would crop the content again.
export function fitSceneComposition(bounds, frame, padding = 12) {
  if (!bounds.length) throw new TypeError('Composition requires content bounds');
  for (const rect of [...bounds, frame]) {
    if (!['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(rect[key])) || rect.right <= rect.left || rect.bottom <= rect.top) {
      throw new TypeError('Composition requires positive finite rectangles');
    }
  }
  if (!Number.isFinite(padding) || padding < 0) throw new TypeError('Composition padding must be nonnegative');
  const width = frame.right - frame.left - padding * 2;
  const height = frame.bottom - frame.top - padding * 2;
  if (width <= 0 || height <= 0) throw new RangeError('Composition frame is too small');
  const left = Math.min(...bounds.map(r => r.left)), right = Math.max(...bounds.map(r => r.right));
  const top = Math.min(...bounds.map(r => r.top)), bottom = Math.max(...bounds.map(r => r.bottom));
  return {
    focus: { x: (left + right) / 2, y: (top + bottom) / 2 },
    target: { x: (frame.left + frame.right) / 2, y: (frame.top + frame.bottom) / 2 },
    scale: Math.min(width / (right - left), height / (bottom - top)),
  };
}

