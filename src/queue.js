// The experiment follows connected walks, folding past the Stallions plaza without crossing itself.
// Keep the first leg identical to the close-view queue so the ordering station stays legible.
export const BIG_LINE_PATH = [
  [-0.9, 1.6], [-0.6, 2.35], [-0.4, 3.1], [-0.25, 3.85], [-0.1, 4.6],
  [10.9, 4.6], [10.9, 15.5], [2.9, 15.5], [2.9, 8.5],
  [-4.5, 8.5], [-4.5, 15.5], [-9.5, 15.5], [-9.5, 9], [-18, 9],
];
export const BIG_LINE_SPACING = 1.3;

export function pointOnLine(path, distance) {
  let s = Math.max(0, distance);
  for (let n = 1; n < path.length; n++) {
    const a = path[n - 1], b = path[n], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= length) return [a[0] + (b[0] - a[0]) * s / length, a[1] + (b[1] - a[1]) * s / length, Math.atan2(a[1] - b[1], a[0] - b[0])];
    s -= length;
  }
  return [...path.at(-1), Math.PI];
}

// Source-pixel bounds include each person's entire sprite, the business and the statue base.
export function lineBounds(count, path, spacing, project, business) {
  const b = { x0: business.x0 - 10, x1: business.x1 + 45, y0: business.y0 - 10, y1: business.y1 + 10 };
  for (let n = 0; n < count; n++) {
    const [i, j] = pointOnLine(path, n * spacing), [x, y] = project(i, j);
    b.x0 = Math.min(b.x0, x - 16); b.x1 = Math.max(b.x1, x + 16);
    b.y0 = Math.min(b.y0, y - 56); b.y1 = Math.max(b.y1, y + 5);
  }
  const [sx, sy] = project(5.5, 10);
  b.x0 = Math.min(b.x0, sx - 56); b.x1 = Math.max(b.x1, sx + 56);
  b.y0 = Math.min(b.y0, sy - 126); b.y1 = Math.max(b.y1, sy + 20);
  return b;
}

export function fitLineCamera(b, width, height, dpr, world) {
  const margin = 10;
  const fit = Math.floor(Math.min(width * dpr / (b.x1 - b.x0 + margin * 2), height * dpr / (b.y1 - b.y0 + margin * 2)));
  // The visible source canvas must fit within the baked world as well.
  const minK = Math.max(1, Math.ceil(width * dpr / world.w), Math.ceil(height * dpr / world.h));
  const k = Math.max(minK, fit);
  const sw = width * dpr / k, sh = height * dpr / k;
  return {
    k, minK,
    x: Math.max(sw / 2, Math.min(world.w - sw / 2, (b.x0 + b.x1) / 2)),
    y: Math.max(sh / 2, Math.min(world.h - sh / 2, (b.y0 + b.y1) / 2)),
    fits: k <= fit,
  };
}
