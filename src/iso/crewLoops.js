// N-frame crew work strips. Drop-in for the watch-view animator.
// crew-anim-chatgpt.png is 7 rows x 4 frames, one person per row.
// Playback is uneven on purpose: linger frames hold, the action frame is short.
// Feet register to the alpha bbox bottom-center after the magenta key, never
// the raw cell center, so a loop does not skate.

export const CREW_LOOP_NAMES = Object.freeze(['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west']);
export const LOOP_COLS = 4;
export const LOOP_ROWS = 7;
export const LOOP_FPS = 7;
// Matt's arm is out the window on this frame. That is when the taco leaves his hand.
export const MATT_RELEASE_FRAME = 2;

// Weights are beats at LOOP_FPS. 1 beat ≈ 143ms. Action beats are under 1.
export const LOOP_HOLDS = Object.freeze({
  jared: Object.freeze([1.65, 0.5, 1.15, 1.45]),
  phillip: Object.freeze([1.4, 1.05, 0.55, 1.5]),
  ali: Object.freeze([1.5, 1.05, 0.48, 1.4]),
  matt: Object.freeze([1.35, 1.15, 0.42, 1.3]),
  aaron: Object.freeze([1.05, 1.95, 0.62, 1.65]),
  antonio: Object.freeze([1.55, 1.15, 2.25, 1.1]),
  west: Object.freeze([0.62, 1.15, 1.9, 1.25]),
});

// Idle breath between work cycles, in seconds. Antonio never stands up.
const LOOP_REST = Object.freeze({
  jared: 0.5, phillip: 0.62, ali: 0.46, matt: 0.55, aaron: 0.72, antonio: 0, west: 0.68,
});
const LOOP_IDLE_REST = Object.freeze({
  jared: 1.35, phillip: 1.5, ali: 1.2, matt: 1.4, aaron: 0.9, antonio: 0, west: 0.85,
});
const LOOP_PHASE = Object.freeze({
  jared: 0.05, phillip: 0.4, ali: 0.18, matt: 0.62, aaron: 0.27, antonio: 0.11, west: 0.48,
});

const CLASP = [232, 184, 72];
const CLASP_EDGE = [168, 118, 36];

export function cellGrid(width, height, cols = LOOP_COLS, rows = LOOP_ROWS) {
  return { cols, rows, cellW: width / cols, cellH: height / rows };
}

export function loopCycle(who) {
  const holds = LOOP_HOLDS[who] || LOOP_HOLDS.jared;
  return holds.reduce((sum, hold) => sum + hold / LOOP_FPS, 0);
}

export function handoffArc(props) {
  if (!props?.length) return null;
  let best = null;
  for (const prop of props) {
    if (prop.kind !== 'taco' || prop.key !== 'top' || prop.parked) continue;
    const dur = prop.dur || 0.15;
    if ((prop.t || 0) > dur + 0.02) continue;
    if (!best || prop.t < best.t) best = prop;
  }
  return best;
}

// mode 'work' is a strip frame. mode 'idle' is the crew-sheet-action stand pose.
export function workPose(who, time, opts = {}) {
  const holds = LOOP_HOLDS[who] || LOOP_HOLDS.jared;
  const phase = (opts.phase || 0) + (LOOP_PHASE[who] || 0);
  const t = (time || 0) + phase;
  if (who === 'matt' && opts.arc) {
    const dur = opts.arc.dur || 0.15;
    const u = (opts.arc.t || 0) / dur;
    const index = u < 0.42 ? MATT_RELEASE_FRAME : Math.min(holds.length - 1, MATT_RELEASE_FRAME + 1);
    return { mode: 'work', index, local: u < 0.42 ? u / 0.42 : (u - 0.42) / 0.58, synced: true, who };
  }
  if (who === 'matt' && opts.reaching) {
    const age = Math.max(0, opts.reachAge || 0);
    const wind = holds[0] / LOOP_FPS;
    return { mode: 'work', index: age < wind ? 0 : 1, local: age < wind ? age / wind : 1, synced: false, who };
  }
  const duty = who === 'antonio' ? 'seated' : (opts.duty || 'idle');
  const rest = who === 'antonio' ? 0 : (duty === 'work' || who === 'west' || who === 'aaron' ? LOOP_REST[who] : LOOP_IDLE_REST[who]);
  const cycle = loopCycle(who);
  const period = cycle + rest;
  let u = period > 0 ? ((t % period) + period) % period : 0;
  if (rest > 0 && u >= cycle) return { mode: 'idle', index: -1, who, cycle, rest };
  let acc = 0;
  for (let i = 0; i < holds.length; i++) {
    const dt = holds[i] / LOOP_FPS;
    if (u < acc + dt || i === holds.length - 1) {
      return { mode: 'work', index: i, local: dt ? (u - acc) / dt : 0, hold: holds[i], who, cycle };
    }
    acc += dt;
  }
  return { mode: 'work', index: 0, local: 0, who, cycle };
}

export function frameScreenHeight(frame, idleHeight) {
  const body = frame?.bodyH || frame?.h || frame?.height || 1;
  const canvasH = frame?.h || frame?.height || body;
  return (idleHeight || body) * (canvasH / body);
}

function isHardMagenta(r, g, b) {
  const rb = Math.abs(r - b);
  const mag = Math.min(r, b) - g;
  return rb < 48 && r > 145 && b > 145 && mag > 55 && g < 210;
}

function isSoftMagenta(r, g, b) {
  const rb = Math.abs(r - b);
  const mag = Math.min(r, b) - g;
  return rb < 60 && r > 120 && b > 120 && mag > 28 && g < 190;
}

function keyMagenta(pixels) {
  const out = new Uint8ClampedArray(pixels);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    if (isHardMagenta(r, g, b)) {
      out[i + 3] = 0;
    } else if (isSoftMagenta(r, g, b)) {
      const mag = Math.min(r, b) - g;
      const keep = Math.max(0, Math.min(1, (70 - mag) / 42));
      out[i + 3] = Math.round((out[i + 3] || 255) * keep);
      const spill = mag * (1 - keep);
      out[i] = Math.max(0, r - spill * 0.65);
      out[i + 2] = Math.max(0, b - spill * 0.65);
    }
  }
  return out;
}

function isDoodleYellow(r, g, b, a) {
  // Speed lines are high-key yellow-orange. Skin and shirts sit darker than this.
  return a > 16 && r > 215 && g > 145 && b < 112 && r - b > 115 && g > b + 40 && r + 6 > g;
}

function stripDoodles(pixels, w, h) {
  const n = w * h;
  const mark = new Uint8Array(n);
  const onBag = (i) => {
    const x = i % w;
    const y = (i - x) / w;
    let near = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const o = (ny * w + nx) * 4;
        const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2], a = pixels[o + 3];
        if (a > 30 && r > 90 && r < 210 && g < 85 && b < 95 && r > g + 45) near++;
      }
    }
    return near > 3;
  };
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (!isDoodleYellow(pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])) continue;
    if (onBag(i)) continue;
    mark[i] = 1;
  }
  const seen = new Uint8Array(n);
  const sparks = [];
  let removed = 0;
  const nearBody = (i) => {
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mark[j]) continue;
        if (pixels[j * 4 + 3] > 20) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < n; i++) {
    if (!mark[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    const comp = [];
    let minX = w, minY = h, maxX = 0, maxY = 0, attached = false;
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      const x = cur % w;
      const y = (cur - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (!attached && nearBody(cur)) attached = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j] || !mark[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const fill = comp.length / (bw * bh);
    const upper = (minY + maxY) / 2 < h * 0.62;
    // Tortillas and flames are dense. A cloud of speed lines is large but sparse.
    const keepFood = (comp.length >= 260 && fill >= 0.42) || (comp.length >= 140 && fill >= 0.58) || (!upper && comp.length >= 180 && fill >= 0.32);
    const thin = Math.min(bw, bh) <= 16 && comp.length < 220;
    const dash = upper && ((fill < 0.4 && comp.length < 1600) || (fill < 0.56 && comp.length < 260));
    const speck = !attached && comp.length < 140;
    if (keepFood || !(thin || dash || speck || comp.length < 40)) continue;
    let sx = 0, sy = 0;
    for (const idx of comp) {
      pixels[idx * 4 + 3] = 0;
      sx += idx % w;
      sy += (idx - (idx % w)) / w;
      removed++;
    }
    if (comp.length >= 8 && sparks.length < 5) {
      const ang = ((minX * 13 + minY * 7) % 8) / 8 * Math.PI;
      sparks.push({
        x: sx / comp.length,
        y: sy / comp.length,
        dx: Math.cos(ang),
        dy: -0.35 - Math.abs(Math.sin(ang)) * 0.4,
        len: Math.max(4, Math.min(10, Math.hypot(bw, bh) * 0.45)),
      });
    }
  }
  return { sparks, removed };
}

function isPortraitSkin(r, g, b) {
  if (r > 200 && b > 180 && g < 80) return false;
  return r > 140 && r < 256 && g > 70 && g < 190 && b > 35 && b < 150 && r > g && g + 5 > b && r - g > 25 && r - g < 140 && g - b > 12 && g - b < 100;
}

export function samplePortraitSkin(pixels, width, height, col = 2, row = 0, cols = 4, rows = 2) {
  const x0 = Math.floor(col * width / cols);
  const x1 = Math.floor((col + 1) * width / cols);
  const y0 = Math.floor(row * height / rows);
  const y1 = Math.floor((row + 1) * height / rows);
  const samples = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * width + x) * 4;
      if ((pixels[o + 3] ?? 255) < 20) continue;
      const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2];
      if (!isPortraitSkin(r, g, b)) continue;
      samples.push([r, g, b, r * 0.299 + g * 0.587 + b * 0.114]);
    }
  }
  if (!samples.length) return { rgb: [209, 118, 70], n: 0 };
  samples.sort((a, b) => a[3] - b[3]);
  // Darker half of the lit face: warm medium brown, not the specular highlight.
  const cut = Math.max(1, Math.floor(samples.length * 0.42));
  const mid = samples[Math.min(samples.length - 1, cut >> 1)];
  return { rgb: [mid[0], mid[1], mid[2]], n: samples.length, lum: mid[3] };
}

function isAliSkin(r, g, b, a) {
  if (a < 24) return false;
  if (r < 30 || r > 145 || g < 18 || g > 105 || b > 85) return false;
  if (g < r * 0.55) return false;
  if (r < g + 6 || g + 8 < b || r - b < 8) return false;
  if (r - g > 48) return false;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  return lum > 24 && lum < 110;
}

function liftAliSkin(pixels, w, h, target) {
  const box = alphaBox(pixels, w, h);
  const idx = [];
  let sr = 0, sg = 0, sb = 0;
  const spanY = box ? Math.max(1, box.maxY - box.minY) : h;
  const spanX = box ? Math.max(1, box.maxX - box.minX) : w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (!isAliSkin(pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])) continue;
      if (box) {
        const relY = (y - box.minY) / spanY;
        const relX = (x - box.minX) / spanX;
        const head = relY < 0.46;
        const arm = relY < 0.74 && (relX < 0.24 || relX > 0.76);
        if (!head && !arm) continue;
      }
      idx.push(i);
      sr += pixels[o];
      sg += pixels[o + 1];
      sb += pixels[o + 2];
    }
  }
  const before = idx.length ? [Math.round(sr / idx.length), Math.round(sg / idx.length), Math.round(sb / idx.length)] : [0, 0, 0];
  if (!idx.length) return { before, after: before, n: 0, target };
  const lums = idx.map((i) => {
    const o = i * 4;
    return pixels[o] * 0.299 + pixels[o + 1] * 0.587 + pixels[o + 2] * 0.114;
  }).sort((a, b) => a - b);
  const lo = lums[Math.floor(lums.length * 0.08)];
  const hi = lums[Math.floor(lums.length * 0.92)] || lo + 1;
  const shadow = target.map((v) => v * 0.7);
  const high = target.map((v) => Math.min(248, v * 1.12));
  for (let k = 0; k < idx.length; k++) {
    const o = idx[k] * 4;
    const lum = pixels[o] * 0.299 + pixels[o + 1] * 0.587 + pixels[o + 2] * 0.114;
    const yn = Math.max(0, Math.min(1, (lum - lo) / (hi - lo || 1)));
    const goal = yn < 0.55
      ? shadow.map((v, c) => v + (target[c] - v) * (yn / 0.55))
      : target.map((v, c) => v + (high[c] - v) * ((yn - 0.55) / 0.45));
    for (let c = 0; c < 3; c++) pixels[o + c] = Math.round(pixels[o + c] * 0.16 + goal[c] * 0.84);
  }
  let ar = 0, ag = 0, ab = 0;
  for (const i of idx) {
    const o = i * 4;
    ar += pixels[o];
    ag += pixels[o + 1];
    ab += pixels[o + 2];
  }
  const after = [Math.round(ar / idx.length), Math.round(ag / idx.length), Math.round(ab / idx.length)];
  return { before, after, n: idx.length, target };
}

function isBurgundy(r, g, b, a) {
  return a > 30 && r > 90 && r < 200 && g < 80 && b < 90 && r > g + 50 && r > b + 40;
}

function isClaspGold(r, g, b, a) {
  return a > 30 && r > 185 && g > 130 && b < 170 && g > b + 35 && r - g < 100;
}

function isDarkInk(r, g, b, a) {
  return a > 24 && r < 95 && g < 75 && b < 75;
}

function paintWestClasp(pixels, w, h) {
  let top = h, bot = 0, left = w, right = 0, ink = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3] < 16) continue;
      ink++;
      if (y < top) top = y;
      if (y > bot) bot = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (ink < 80) return { beforeDark: 0, afterDark: 0, painted: 0 };
  const yStart = top + Math.floor((bot - top) * 0.45);
  const seen = new Uint8Array(w * h);
  let bag = null;
  for (let y = yStart; y <= bot; y++) {
    for (let x = left; x <= right; x++) {
      const s = y * w + x;
      if (seen[s]) continue;
      const o = s * 4;
      if (!isBurgundy(pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])) continue;
      const stack = [s];
      seen[s] = 1;
      let n = 0, minX = x, maxX = x, minY = y, maxY = y, gold = 0;
      while (stack.length) {
        const cur = stack.pop();
        const cx = cur % w;
        const cy = (cur - cx) / w;
        n++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < left || ny < yStart || nx > right || ny > bot) continue;
            const ns = ny * w + nx;
            const no = ns * 4;
            if (isClaspGold(pixels[no], pixels[no + 1], pixels[no + 2], pixels[no + 3])) gold++;
            if (!dx && !dy) continue;
            if (seen[ns]) continue;
            if (!isBurgundy(pixels[no], pixels[no + 1], pixels[no + 2], pixels[no + 3])) continue;
            seen[ns] = 1;
            stack.push(ns);
          }
        }
      }
      if (n > 200 && (!bag || gold > bag.gold)) bag = { n, minX, maxX, minY, maxY, gold };
    }
  }
  if (!bag) return { beforeDark: 0, afterDark: 0, painted: 0 };
  const gseen = new Uint8Array(w * h);
  const parts = [];
  const cx = (bag.minX + bag.maxX) / 2;
  const cy = (bag.minY + bag.maxY) / 2;
  const bagH = bag.maxY - bag.minY || 1;
  for (let y = bag.minY; y <= bag.maxY; y++) {
    for (let x = bag.minX; x <= bag.maxX; x++) {
      const s = y * w + x;
      if (gseen[s]) continue;
      const o = s * 4;
      if (!isClaspGold(pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])) continue;
      const stack = [s];
      gseen[s] = 1;
      let n = 0, minX = x, maxX = x, minY = y, maxY = y, bagN = 0;
      while (stack.length) {
        const cur = stack.pop();
        const px = cur % w;
        const py = (cur - px) / w;
        n++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const no = (ny * w + nx) * 4;
            if (isBurgundy(pixels[no], pixels[no + 1], pixels[no + 2], pixels[no + 3])) bagN++;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) continue;
            if (nx < bag.minX || ny < bag.minY || nx > bag.maxX || ny > bag.maxY) continue;
            const ns = ny * w + nx;
            if (gseen[ns]) continue;
            if (!isClaspGold(pixels[no], pixels[no + 1], pixels[no + 2], pixels[no + 3])) continue;
            gseen[ns] = 1;
            stack.push(ns);
          }
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (n < 4 || n > 160 || bw > 28 || bh > 24) continue;
      if ((minY - bag.minY) / bagH < 0.22) continue;
      parts.push({ n, minX, maxX, minY, maxY, bagN });
    }
  }
  const used = new Uint8Array(parts.length);
  const clusters = [];
  for (let i = 0; i < parts.length; i++) {
    if (used[i]) continue;
    const group = [parts[i]];
    used[i] = 1;
    for (let grew = true; grew;) {
      grew = false;
      for (let j = 0; j < parts.length; j++) {
        if (used[j]) continue;
        const near = group.some((p) => parts[j].minX <= p.maxX + 7 && parts[j].maxX >= p.minX - 7 && parts[j].minY <= p.maxY + 7 && parts[j].maxY >= p.minY - 7);
        if (!near) continue;
        used[j] = 1;
        group.push(parts[j]);
        grew = true;
      }
    }
    let minX = w, minY = h, maxX = 0, maxY = 0, n = 0, bagN = 0;
    for (const p of group) {
      n += p.n;
      bagN += p.bagN;
      if (p.minX < minX) minX = p.minX;
      if (p.maxX > maxX) maxX = p.maxX;
      if (p.minY < minY) minY = p.minY;
      if (p.maxY > maxY) maxY = p.maxY;
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (n < 28 || n > 260 || bw < 10 || bh < 8 || bw > 36 || bh > 30) continue;
    const mx = (minX + maxX) / 2;
    const my = (minY + maxY) / 2;
    clusters.push({ n, minX, maxX, minY, maxY, d: Math.hypot(mx - cx, my - cy), bagN });
  }
  clusters.sort((a, b) => (b.bagN / b.n) - (a.bagN / a.n) || a.d - b.d);
  const logo = clusters[0];
  if (!logo) return { beforeDark: 0, afterDark: 0, painted: 0 };
  const x0 = logo.minX - 2;
  const y0 = logo.minY - 2;
  const x1 = logo.maxX + 2;
  const y1 = logo.maxY + 2;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  let beforeDark = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const nx = (x - mx) / rx;
      const ny = (y - my) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const o = (y * w + x) * 4;
      if (isDarkInk(pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])) beforeDark++;
    }
  }
  let painted = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const nx = (x - mx) / (rx || 1);
      const ny = (y - my) / (ry || 1);
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const o = (y * w + x) * 4;
      const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2], a = pixels[o + 3];
      if (a < 16) continue;
      if (!isClaspGold(r, g, b, a) && !isBurgundy(r, g, b, a) && !isDarkInk(r, g, b, a)) continue;
      const edge = d > 0.72;
      pixels[o] = edge ? CLASP_EDGE[0] : CLASP[0];
      pixels[o + 1] = edge ? CLASP_EDGE[1] : CLASP[1];
      pixels[o + 2] = edge ? CLASP_EDGE[2] : CLASP[2];
      pixels[o + 3] = 255;
      painted++;
    }
  }
  let afterDark = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const nx = (x - mx) / (rx || 1);
      const ny = (y - my) / (ry || 1);
      if (nx * nx + ny * ny > 0.92) continue;
      const o = (y * w + x) * 4;
      if (isDarkInk(pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])) afterDark++;
    }
  }
  return { beforeDark, afterDark, painted, box: { x0, y0, x1, y1 } };
}

function alphaBox(pixels, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3] < 16) continue;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return null;
  return { minX, minY, maxX, maxY, n, footX: (minX + maxX) / 2, footY: maxY };
}

function bodySpan(pixels, w, h, box) {
  const x0 = Math.floor(box.minX + (box.maxX - box.minX) * 0.3);
  const x1 = Math.ceil(box.minX + (box.maxX - box.minX) * 0.7);
  let top = box.maxY;
  let bot = box.minY;
  let n = 0;
  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (y * w + x) * 4;
      if (pixels[o + 3] < 16) continue;
      const r = pixels[o], g = pixels[o + 1], b = pixels[o + 2];
      if (r > 200 && g > 110 && b < 130) continue;
      n++;
      if (y < top) top = y;
      if (y > bot) bot = y;
    }
  }
  const span = bot - top + 1;
  return n > 30 && span > 20 ? span : box.maxY - box.minY + 1;
}

function trimFrame(pixels, width, box, sparks, cell) {
  const w = box.maxX - box.minX + 1;
  const h = box.maxY - box.minY + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((box.minY + y) * width + (box.minX + x)) * 4;
      const d = (y * w + x) * 4;
      out[d] = pixels[s];
      out[d + 1] = pixels[s + 1];
      out[d + 2] = pixels[s + 2];
      out[d + 3] = pixels[s + 3];
    }
  }
  const anchorX = box.footX - box.minX;
  const anchorY = h;
  const moved = (sparks || []).map((spark) => ({
    x: spark.x - box.footX,
    y: spark.y - box.footY,
    dx: spark.dx,
    dy: spark.dy,
    len: spark.len,
  }));
  return {
    w, h, pixels: out, anchorX, anchorY,
    bodyH: bodySpan(pixels, width, h, box),
    sparks: moved,
    cell,
  };
}

export function footAnchorVariance(frames) {
  const feet = frames.map((frame) => {
    const box = alphaBox(frame.pixels, frame.w, frame.h);
    return {
      x: box.footX - frame.anchorX,
      y: box.footY - (frame.anchorY - 1),
    };
  });
  const mean = (key) => feet.reduce((s, p) => s + p[key], 0) / feet.length;
  const mx = mean('x');
  const my = mean('y');
  const spread = (key, m) => Math.max(...feet.map((p) => Math.abs(p[key] - m)));
  return { feet, varianceX: spread('x', mx), varianceY: spread('y', my) };
}

function gradeFrame(pixels, w, h, who, grade) {
  if (typeof grade === 'function') grade(pixels, w, h, who);
}

// pixels is the raw sheet. portrait is the lit Ali portrait (3rd cell, top row).
// grade, when the shared pipeline is present, runs per trimmed frame.
export function prepareCrewLoops(pixels, width, height, options = {}) {
  const grid = cellGrid(width, height, options.cols || LOOP_COLS, options.rows || LOOP_ROWS);
  const keyed = keyMagenta(pixels);
  const portrait = options.portrait;
  const target = portrait?.pixels
    ? samplePortraitSkin(portrait.pixels, portrait.width, portrait.height, portrait.col ?? 2, portrait.row ?? 0, portrait.cols ?? 4, portrait.rows ?? 2)
    : { rgb: [209, 118, 70], n: 0 };
  const loops = {};
  const report = { grid, ali: null, clasp: [], doodles: 0, target: target.rgb, portraitSamples: target.n };
  CREW_LOOP_NAMES.forEach((name, row) => {
    const frames = [];
    for (let col = 0; col < grid.cols; col++) {
      const x0 = Math.round(col * grid.cellW);
      const y0 = Math.round(row * grid.cellH);
      const x1 = Math.round((col + 1) * grid.cellW);
      const y1 = Math.round((row + 1) * grid.cellH);
      const cw = x1 - x0;
      const ch = y1 - y0;
      const cell = new Uint8ClampedArray(cw * ch * 4);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const s = ((y0 + y) * width + (x0 + x)) * 4;
          const d = (y * cw + x) * 4;
          cell[d] = keyed[s];
          cell[d + 1] = keyed[s + 1];
          cell[d + 2] = keyed[s + 2];
          cell[d + 3] = keyed[s + 3];
        }
      }
      const doodles = stripDoodles(cell, cw, ch);
      report.doodles += doodles.removed;
      let skin = null;
      if (name === 'ali') {
        skin = liftAliSkin(cell, cw, ch, target.rgb);
        if (!report.ali) report.ali = { before: [0, 0, 0], after: [0, 0, 0], n: 0, frames: [] };
        report.ali.frames.push(skin);
      }
      let clasp = null;
      if (name === 'west') {
        clasp = paintWestClasp(cell, cw, ch);
        report.clasp.push(clasp);
      }
      const box = alphaBox(cell, cw, ch);
      const frame = trimFrame(cell, cw, box, doodles.sparks, {
        col, row, cellW: cw, cellH: ch,
        footX: box.footX, footY: box.footY,
        rawDx: box.footX - (cw - 1) / 2,
        rawDy: box.footY - (ch - 1),
      });
      gradeFrame(frame.pixels, frame.w, frame.h, name, options.grade);
      frame.skin = skin;
      frame.clasp = clasp;
      frames.push(frame);
    }
    loops[name] = {
      name,
      frames,
      holds: LOOP_HOLDS[name],
      fps: LOOP_FPS,
      release: name === 'matt' ? MATT_RELEASE_FRAME : -1,
    };
  });
  if (report.ali?.frames?.length) {
    const sum = (key, ch) => report.ali.frames.reduce((s, f) => s + f[key][ch] * f.n, 0);
    const n = report.ali.frames.reduce((s, f) => s + f.n, 0) || 1;
    report.ali.before = [0, 1, 2].map((c) => Math.round(sum('before', c) / n));
    report.ali.after = [0, 1, 2].map((c) => Math.round(sum('after', c) / n));
    report.ali.n = n;
  }
  report.feet = {};
  for (const name of CREW_LOOP_NAMES) report.feet[name] = footAnchorVariance(loops[name].frames);
  return { loops, report, names: CREW_LOOP_NAMES };
}

export function framesToCanvases(loop, makeCanvas) {
  return loop.frames.map((frame) => {
    const canvas = makeCanvas(frame.w, frame.h);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const image = g.createImageData(frame.w, frame.h);
    image.data.set(frame.pixels);
    g.putImageData(image, 0, 0);
    return {
      image: canvas,
      anchorX: frame.anchorX,
      anchorY: frame.anchorY,
      bodyH: frame.bodyH,
      w: frame.w,
      h: frame.h,
      sparks: frame.sparks,
    };
  });
}
