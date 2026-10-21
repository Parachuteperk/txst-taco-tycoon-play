// Plaza crowd layout for the painted watch scene.
// Paying customers follow map.queue. Ambient students use the side paths
// and stay outside the crew, the service window, and Antonio's table.
//
// Fast-forward hook (Codex owns the skip clock). The watch scene eases the
// camera and speeds bob when any of these is set:
//   opts.fastForward
//   view.fastForward
//   view.live.fastForward
//   view.live.speed === 'skip' or view.manager.speed === 'skip'
// main.js also sets opts.fastForward while runtime.timelapse is active.

const BODY = {
  jared: [100, 175],
  phillip: [100, 175],
  ali: [110, 175],
  matt: [150, 210],
  aaron: [140, 230],
  antonio: [160, 240],
  west: [140, 220],
};

export const AMBIENT_PATHS = [
  [{ x: 46, y: 690 }, { x: 70, y: 900 }, { x: 400, y: 930 }],
  [{ x: 1632, y: 490 }, { x: 1638, y: 800 }, { x: 1488, y: 928 }],
  [{ x: 160, y: 630 }, { x: 600, y: 648 }],
  [{ x: 1340, y: 590 }, { x: 1608, y: 575 }],
];

function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax - aw / 2 < bx + bw / 2 && ax + aw / 2 > bx - bw / 2
    && ay - ah < by + 12 && ay + 6 > by - bh;
}

function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi) inside = !inside;
  }
  return inside;
}

export function pathLength(path) {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return n;
}

export function pointAt(path, dist) {
  if (!path?.length) return { x: 0, y: 0, ang: 0 };
  let s = Math.max(0, dist);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    if (s <= L) {
      const u = s / L;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ang: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    s -= L;
  }
  const a = path.at(-2) || path[0], b = path.at(-1);
  return { x: b.x, y: b.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function hitsCrew(map, x, y, w = 70, h = 124) {
  const stations = map?.stations || {};
  for (const [who, st] of Object.entries(stations)) {
    if (!st || who === 'dale') continue;
    const [bw, bh] = BODY[who] || [110, 180];
    if (overlap(x, y, w, h, st.x, st.y, bw, bh)) return who;
  }
  const rig = map?.rig;
  if (rig && rig.enabled !== false && overlap(x, y, w, h, rig.x, rig.y, 250, 290)) return 'rig';
  const poly = map?.counter?.poly;
  if (poly?.length && pointInPoly(poly, x, y - h * 0.62)) return 'window';
  return null;
}

export function offCrew(map, x, y, salt = 0) {
  const pw = map?.plate?.w || 1672;
  const ph = map?.plate?.h || 941;
  let px = x;
  let py = y;
  for (let n = 0; n < 12 && hitsCrew(map, px, py); n++) {
    py = Math.min(ph - 8, py + 14);
    px += ((salt + n) % 2 ? 9 : -9);
    px = Math.max(18, Math.min(pw - 18, px));
  }
  return { x: px, y: py };
}

export function lineSpacing(len, count, preferred = 52) {
  if (count <= 1) return preferred;
  const fit = len / (count - 1);
  return Math.max(42, Math.min(preferred, fit));
}

export function spreadLine(map, count, t = 0) {
  const path = map?.queue || [];
  const len = pathLength(path);
  const spacing = lineSpacing(len, count, map?.queueSpacing || 52);
  const spots = [];
  for (let i = 0; i < count; i++) {
    const along = i * spacing + Math.sin(t * 1.4 + i * 0.7) * 1.4;
    let at = pointAt(path, along);
    at = offCrew(map, at.x, at.y, i);
    let guard = 0;
    while (spots.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < 16) && guard < 8) {
      at = offCrew(map, at.x + ((i + guard) % 2 ? 12 : -12), Math.min((map?.plate?.h || 941) - 8, at.y + 6), i + guard + 3);
      guard++;
    }
    spots.push({ ...at, ang: pointAt(path, along).ang });
  }
  return { spots, spacing, len };
}

export function ambientCount(view, phone) {
  const phase = view?.phase;
  const minutes = view?.clock?.minutes;
  const openPhase = ['preopen', 'calm', 'telegraph', 'rush', 'closing'].includes(phase);
  const openClock = Number.isFinite(minutes) && minutes >= 600 && minutes < 780;
  if (!openPhase && !openClock) return 0;
  const m = Number.isFinite(minutes) ? minutes : (phase === 'rush' ? 710 : 650);
  let n;
  if (m < 670) n = phone ? 5 : 7;
  else if (m < 705) n = phone ? 9 : 14;
  else if (m < 750) n = phone ? 16 : 26;
  else n = phone ? 6 : 9;
  return Math.max(3, Math.min(phone ? 24 : 36, n));
}

export function ambientAnchors(map, count, t = 0) {
  const out = [];
  let n = 0;
  while (out.length < count && n < count * 12) {
    const path = AMBIENT_PATHS[n % AMBIENT_PATHS.length];
    const len = pathLength(path);
    const speed = 0.035 + (n % 5) * 0.012;
    const u = ((n * 0.41 + t * speed) % 1 + 1) % 1;
    const at = pointAt(path, u * len);
    const x = at.x + ((n % 3) - 1) * 12;
    const y = at.y + (n % 2 ? 7 : -5);
    const pw = map?.plate?.w || 1672;
    const ph = map?.plate?.h || 941;
    const kind = n % 8 === 0 ? 'bike' : n % 8 === 1 ? 'skate' : n % 8 === 2 ? 'scooter' : 'walk';
    if (x > 12 && y > 12 && x < pw - 12 && y < ph - 12 && !hitsCrew(map, x, y, 54, 88)) {
      out.push({ x, y, ang: at.ang, kind, slot: n });
    }
    n++;
  }
  return out;
}

export function fastForwardOn(view, opts) {
  if (opts?.fastForward) return true;
  if (view?.fastForward) return true;
  if (view?.live?.fastForward) return true;
  const speed = view?.live?.speed ?? view?.manager?.speed;
  return speed === 'skip';
}

export function researchVisible(view, opts) {
  if (opts?.research) return true;
  const manager = view?.manager;
  if (!manager) return false;
  if (manager.project && (manager.project.id || (manager.project.daysDone || 0) > 0)) return true;
  return (manager.projects || []).some((row) => (row.level || 0) > 0 || (row.daysDone || 0) > 0);
}
