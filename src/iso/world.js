// 2:1 isometric. +i runs down-right, +j runs down-left.
// screenX = (i - j) * 32, screenY = (i + j) * 16. Matches iso-target-mockup.png:
// stand centered, line from the lower-left, rig to the right, Old Main top-right.

export const HALF_W = 32;
export const HALF_H = 16;

export function project(i, j, z = 0) {
  return [(i - j) * HALF_W, (i + j) * HALF_H - z];
}

export function unproject(x, y) {
  const a = x / HALF_W;
  const b = y / HALF_H;
  return [(a + b) / 2, (b - a) / 2];
}

// Crew, the service window, and the rig. Ambient paths stay outside this.
export const CLEAR = { i0: 9.4, i1: 17.8, j0: 5.8, j1: 12.4 };

export function inClear(i, j, pad = 0) {
  return i >= CLEAR.i0 - pad && i <= CLEAR.i1 + pad && j >= CLEAR.j0 - pad && j <= CLEAR.j1 + pad;
}

export const STAND = { i: 12.4, j: 9.4 };
export const WINDOW = { i: 12.15, j: 11.55 };
export const RIG = { i: 16.14, j: 8.81 };
export const OLD_MAIN = { i: 15.6, j: 0.8 };

export const CREW = {
  // Counter crew are spaced down the bar and set back so faces clear the lip.
  jared: { i: 10.9, j: 7.45, task: 'register' },
  phillip: { i: 12.65, j: 6.85, task: 'prep' },
  ali: { i: 14.4, j: 6.25, task: 'grill' },
  matt: { i: 16.1, j: 5.7, task: 'handoff' },
  aaron: { i: 15.9, j: 11.15, task: 'floor' },
  antonio: { i: 16.69, j: 8.59, task: 'rig' },
  west: { i: 9.05, j: 10.35, task: 'west' },
};

export const CRATE = { i: 14.15, j: 6.55 };
export const COOLER = { i: 15.55, j: 6.45 };

// Full serpent. The tail (index 0) is where people join. The head is the service window.
export const LINE = [
  { i: 1.6, j: 21.2 },
  { i: 8.2, j: 19.4 },
  { i: 3.4, j: 18.2 },
  { i: 8.6, j: 16.6 },
  { i: 4.6, j: 15.4 },
  { i: 8.9, j: 14.0 },
  { i: 6.4, j: 14.9 },
  { i: 11.2, j: 15.15 },
  { i: 14.8, j: 14.35 },
  { i: 12.15, j: 12.75 },
];

// Lunch rope stays on the brick in front of the stand, inside the phone frame.
// ?line=55 and Big Rush use the full serpent above.
export const LINE_SHORT = [
  { i: 10.35, j: 12.95 },
  { i: 13.15, j: 12.65 },
  { i: 11.05, j: 12.15 },
  { i: 13.55, j: 11.85 },
  { i: 12.15, j: 11.55 },
];

// Off the rope, south of the snake, clear of the crew and the window.
export const TRASH = { i: 11.6, j: 17.35 };

// Unscaled screen pixels between the two posts of one rope span.
// Posts are 252 source px apart and plazaScreenHeight draws a ~248px cell at 70px.
export const ROPE_GAP = 71;

export function fullQueue(lineCount, view) {
  return (Number(lineCount) || 0) >= 55 || !!view?.bigRush?.active;
}

export function queuePath(lineCount, view) {
  return fullQueue(lineCount, view) ? LINE : LINE_SHORT;
}

// Keep paying customers off the crew, the rig, and the service window.
// The head of the rope stays south of the window so feet do not cover faces.
const CREW_KEEP = {
  aaron: 1.75,
  west: 1.7,
  matt: 1.6,
  antonio: 1.75,
  jared: 1.3,
  phillip: 1.3,
  ali: 1.3,
};

export function nudgeOffCrew(at) {
  if (!at) return at;
  let i = at.i;
  let j = at.j;
  if (Math.hypot(i - RIG.i, j - RIG.j) < 2.25) {
    const dx = i - RIG.i;
    const dy = j - RIG.j;
    const len = Math.hypot(dx, dy) || 1;
    i = RIG.i + (dx / len) * 2.35;
    j = RIG.j + Math.max(0.55, dy / len) * 2.35;
  }
  for (let n = 0; n < 5; n++) {
    let hit = null;
    let need = 0;
    for (const [who, pos] of Object.entries(CREW)) {
      const radius = CREW_KEEP[who] || 1.25;
      if (Math.hypot(i - pos.i, j - pos.j) < radius) { hit = pos; need = radius; break; }
    }
    if (!hit) break;
    j += 0.48;
    i += i < hit.i ? -0.32 : 0.32;
    if (Math.hypot(i - hit.i, j - hit.j) < need * 0.9) j += 0.35;
  }
  return { ...at, i, j };
}

// Posts and rope along the camera side of the path. The window vertex is left
// open so a post does not sit on the service window. Corner pieces at the
// turns, a single post at each end of the rail, rope spans tiled between them.
export function queueBarriers(path, gap = ROPE_GAP) {
  const pieces = [];
  if (!path || path.length < 2) return { pieces, sign: path?.[0] || { i: 0, j: 0 } };
  const screen = path.map((p) => project(p.i, p.j));
  const last = path.length - 1;
  const rail = 40;
  const at = (n) => {
    let dx;
    let dy;
    if (n <= 0) {
      dx = screen[1][0] - screen[0][0];
      dy = screen[1][1] - screen[0][1];
    } else if (n >= last) {
      dx = screen[last][0] - screen[last - 1][0];
      dy = screen[last][1] - screen[last - 1][1];
    } else {
      dx = screen[n + 1][0] - screen[n - 1][0];
      dy = screen[n + 1][1] - screen[n - 1][1];
    }
    const len = Math.hypot(dx, dy) || 1;
    return [screen[n][0] + (-dy / len) * rail, screen[n][1] + (dx / len) * rail];
  };
  for (let n = 0; n < last; n++) {
    const [x, y] = at(n);
    const [i, j] = unproject(x, y);
    pieces.push({ kind: n === 0 || n === last - 1 ? 'post' : 'corner', i, j, flip: false });
  }
  for (let n = 1; n < last; n++) {
    const a = at(n - 1);
    const b = at(n);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const inset = gap * 0.4;
    const flip = dx < 0;
    for (let d = inset + gap * 0.5; d < len - inset; d += gap) {
      const u = d / len;
      const [i, j] = unproject(a[0] + dx * u, a[1] + dy * u);
      pieces.push({ kind: 'span', i, j, flip });
    }
  }
  const travel = Math.hypot(screen[1][0] - screen[0][0], screen[1][1] - screen[0][1]) || 1;
  const ox = -(screen[1][1] - screen[0][1]) / travel;
  const oy = (screen[1][0] - screen[0][0]) / travel;
  const backX = (screen[0][0] - screen[1][0]) / travel;
  const backY = (screen[0][1] - screen[1][1]) / travel;
  const [si, sj] = unproject(screen[0][0] + ox * (rail + 34) + backX * 30, screen[0][1] + oy * (rail + 34) + backY * 30);
  return { pieces, sign: { i: si, j: sj } };
}

export const EXIT = [
  { i: 13.2, j: 12.3 },
  { i: 16.4, j: 15.2 },
  { i: 21.5, j: 17.2 },
];

export const PATHS = {
  west: [{ i: 2.2, j: 8 }, { i: 2.2, j: 19 }],
  south: [{ i: 4, j: 18.6 }, { i: 22, j: 18.6 }],
  east: [{ i: 21.2, j: 6 }, { i: 21.2, j: 17.2 }],
  northL: [{ i: 1.2, j: 5.15 }, { i: 8.8, j: 5.15 }],
  northR: [{ i: 18.4, j: 5.15 }, { i: 24.2, j: 5.15 }],
};

export const SIT = [
  { i: 5.1, j: 8.2 },
  { i: 6.4, j: 16.2 },
  { i: 20.1, j: 13.4 },
  { i: 19.4, j: 16.4 },
];
export const CHAT = { i: 4.3, j: 12.2 };
export const FRISBEE = [{ i: 5.0, j: 6.1 }, { i: 7.4, j: 5.55 }];
export const GAWK = [{ i: 8.55, j: 13.35 }, { i: 18.5, j: 13.15 }];

export const UPGRADES = {
  grill: { i: 15.9, j: 8.05 },
  salsa: { i: 16.6, j: 8.7 },
  neon: { i: 12.5, j: 7.7 },
  picnic: { i: 18.8, j: 15.2 },
  speaker: { i: 8.2, j: 11.2 },
  tip: { i: 11.9, j: 8.9 },
};

export const LAMPS = [
  { i: 4.2, j: 6.4 },
  { i: 20.4, j: 6.2 },
  { i: 7.2, j: 17.4 },
  { i: 19.2, j: 17.6 },
];

// Desktop, pulled back: stand centered, line from the lower plaza, rig to the side,
// Old Main in the top corner, and headroom for the full SIFE TACOS sign.
export const FRAME = [
  { i: 3.4, j: 18.2 },
  { i: 16.4, j: 0.5, z: 220 },
  { i: 17.5, j: 6.1, z: 40 },
  { i: 10.55, j: 10.85, z: 170 },
  { i: 12.4, j: 9.4, z: 200 },
];

export const WIDE_FRAME = [
  { i: 1.4, j: 21.4 },
  { i: 16.4, j: 0.4, z: 210 },
  { i: 17.4, j: 8.2 },
  { i: 8.2, j: 14.2 },
];

// Phone holds all seven crew, their name tags, the rig, the sign, and the near line.
const PHONE_FRAME = [
  { i: 9.55, j: 12.35, z: 200 },
  { i: 7.7, j: 14.35, z: 190 },
  { i: 18.6, j: 6.35, z: 180 },
  { i: 10.9, j: 7.45, z: 180 },
  { i: 16.1, j: 5.7, z: 180 },
  { i: 12.4, j: 9.4, z: 210 },
  { i: 8.35, j: 14.65 },
];

export function polyPoint(path, t) {
  if (!path?.length) return { i: 0, j: 0, di: 1, dj: 0 };
  const lens = [];
  let total = 0;
  for (let n = 1; n < path.length; n++) {
    const d = Math.hypot(path[n].i - path[n - 1].i, path[n].j - path[n - 1].j);
    lens.push(d);
    total += d;
  }
  let dist = ((t % 1) + 1) % 1 * total;
  for (let n = 1; n < path.length; n++) {
    if (dist <= lens[n - 1] || n === path.length - 1) {
      const u = lens[n - 1] ? dist / lens[n - 1] : 0;
      const a = path[n - 1];
      const b = path[n];
      return { i: a.i + (b.i - a.i) * u, j: a.j + (b.j - a.j) * u, di: b.i - a.i, dj: b.j - a.j };
    }
    dist -= lens[n - 1];
  }
  const last = path[path.length - 1];
  return { i: last.i, j: last.j, di: 1, dj: 0 };
}

export function crowdDensity(minutes = 690, reputation = 20, marketingOn = false) {
  let base = 0.3;
  if (minutes < 660) base = 0.34;
  else if (minutes < 700) base = 0.62;
  else if (minutes < 760) base = 1;
  else if (minutes < 900) base = 0.42;
  else base = 0.22;
  const m = ((minutes % 60) + 60) % 60;
  const bell = m < 8 || m > 52 ? 1.38 : 1;
  const rep = 0.8 + Math.max(0, Math.min(100, reputation)) / 100 * 0.45;
  const ads = marketingOn ? 1.28 : 1;
  return Math.max(0.15, Math.min(1.45, base * bell * rep * ads));
}

export function sunShift(minutes = 690) {
  const day = (minutes - 600) / 500;
  const len = 8 + Math.abs(day - 0.15) * 18;
  return {
    dx: Math.cos(-0.8 + day) * len,
    dy: Math.sin(0.4 + day * 0.4) * len * 0.55,
    lamps: minutes >= 990 || minutes < 420,
  };
}

export function ambientCap(phone) {
  return phone ? 24 : 40;
}

// One frame per direction on iso-crew-walk.png: 0 camera/down-right, 1 down-left, 2 up-right, 3 up-left.
export function walkRow(di, dj) {
  const sx = di - dj;
  const sy = di + dj;
  if (sy >= 0) return sx >= 0 ? 0 : 1;
  return sx >= 0 ? 2 : 3;
}

export function fitCamera(dw, dh, zoom = 1, panX = 0, panY = 0, wide = false, safe = null) {
  const portraitGuess = dw < dh;
  const left = safe?.left ?? 0;
  const top = safe?.top ?? (portraitGuess ? dh * (152 / 844) : dh * (118 / 900));
  const right = safe?.right ?? dw;
  const bottom = safe?.bottom ?? (dh - dh * (58 / (portraitGuess ? 844 : 900)));
  const viewW = Math.max(1, right - left);
  const viewH = Math.max(1, bottom - top);
  const portrait = viewW < viewH;
  const pts = (portrait ? PHONE_FRAME : wide ? WIDE_FRAME : FRAME).map((p) => project(p.i, p.j, p.z || 0));
  for (const p of Object.values(CREW)) pts.push(project(p.i, p.j, 150));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const margin = portrait ? 28 : 48;
  const z = Math.max(0.72, Math.min(2.5, zoom || 1));
  const s = Math.min(viewW / (maxX - minX + margin), viewH / (maxY - minY + margin)) * z;
  const [sx, sy] = project(STAND.i, STAND.j);
  const halfW = viewW / (2 * s);
  const halfH = viewH / (2 * s);
  const contains = (fx, fy) => minX >= fx - halfW + 6 && maxX <= fx + halfW - 6 && minY >= fy - halfH + 6 && maxY <= fy + halfH - 6;
  let fx = sx;
  let fy = sy;
  if (!contains(sx, sy)) {
    fx = (minX + maxX) / 2;
    fy = (minY + maxY) / 2;
  }
  const ox = (left + right) / 2 + panX - fx * s;
  const oy = (top + bottom) / 2 + panY - fy * s;
  return {
    s, ox, oy,
    to(i, j, z = 0) {
      const [x, y] = project(i, j, z);
      return [x * s + ox, y * s + oy];
    },
  };
}
