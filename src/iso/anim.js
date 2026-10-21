// Watch-view motion. One clock, eased motion, N-frame strips.
//
// A painted loop drops in without a rewrite: pass a longer array as
// `idleStrip` or `workStrip` (or `{ frames, fps }`). frameAt() indexes it.
// Until those strips exist, idleStrip/workStrip are the two cells of
// crew-sheet-action.png (row 1 idle, row 2 work) and the body bobs.
//
// Positions stay with the layout. This module only eases along a path it is
// given and returns bob, squash, lean, and which frame to draw.

import { createFx } from '../fx/fx.js';
import { playCustomerWalk, STORM_FPS, WALK_FPS } from '../customerWalk.js';

export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function smoothstep(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

export function smootherstep(t) {
  const u = clamp01(t);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

export function easeOutCubic(t) {
  const u = clamp01(t);
  return 1 - (1 - u) ** 3;
}

export function easeInOutCubic(t) {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2;
}

/** Exponential ease. k stays in (0, 1), so this never overshoots and is not a linear lerp. */
export function easeToward(current, target, dt, rate = 6) {
  if (!(dt > 0) || !Number.isFinite(current) || !Number.isFinite(target)) return current;
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}

export function arcPoint(from, to, u, lift = 28) {
  const e = smootherstep(u);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e - Math.sin(e * Math.PI) * lift,
    u: e,
  };
}

function stripFrames(strip) {
  if (strip == null) return [];
  if (Array.isArray(strip)) return strip;
  if (Array.isArray(strip.frames)) return strip.frames;
  return [strip];
}

// Uneven holds: a beat of 1 lasts 1/fps seconds. Missing holds stay on the metronome.
function holdIndex(holds, time, fps) {
  const cycle = holds.reduce((sum, hold) => sum + hold / fps, 0) || 1;
  let u = ((time % cycle) + cycle) % cycle;
  let acc = 0;
  for (let i = 0; i < holds.length; i++) {
    const dt = holds[i] / fps;
    if (u < acc + dt || i === holds.length - 1) return i;
    acc += dt;
  }
  return 0;
}

/** N-frame strip. A single sprite is a 1-frame strip. `{ frames, fps, holds }` sets the rate. */
export function frameAt(strip, time, fallbackFps = 8) {
  if (strip == null) return null;
  const frames = stripFrames(strip);
  const n = frames.length;
  if (!n) return null;
  if (n === 1) return frames[0];
  return frames[frameIndex(strip, time, fallbackFps)];
}

export function frameIndex(strip, time, fallbackFps = 8) {
  if (strip == null) return 0;
  const frames = stripFrames(strip);
  const n = frames.length || 1;
  const fps = !Array.isArray(strip) && Number.isFinite(strip?.fps) ? strip.fps : fallbackFps;
  if (n <= 1) return 0;
  const holds = !Array.isArray(strip) && Array.isArray(strip?.holds) ? strip.holds : null;
  if (holds && holds.length === n) return holdIndex(holds, Math.max(0, time), fps);
  return Math.floor(Math.max(0, time) * fps) % n;
}

/**
 * Coins only on a cash payment at Jared.
 * Handoff / sale carries a taco, not a coin. Card payments stay quiet.
 * Missing tender is cash: the engine books cash and has no card rail.
 */
export function shouldPopCoin(event) {
  if (!event) return false;
  const type = event.type;
  if (type === 'handoff' || type === 'sale' || type === 'serve' || type === 'walkout' || type === 'walkoff') return false;
  if (type !== 'payment') return false;
  const who = event.byCrewId || event.by || 'jared';
  if (who !== 'jared') return false;
  const tender = event.tender || event.pay || 'cash';
  return tender === 'cash';
}

function pathKey(path) {
  const p = path?.[0];
  if (!p) return 'x';
  return typeof p.i === 'number' ? 'i' : 'x';
}

function xy(p, key) {
  if (!p) return [0, 0];
  if (key === 'i') return [p.i || 0, p.j || 0];
  return [p.x || 0, p.y || 0];
}

export function pathLength(path) {
  if (!path || path.length < 2) return 0;
  const key = pathKey(path);
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1], key);
    const [bx, by] = xy(path[i], key);
    n += Math.hypot(bx - ax, by - ay);
  }
  return n;
}

export function pointAlong(path, dist) {
  const key = pathKey(path);
  if (!path?.length) return { x: 0, y: 0, i: 0, j: 0, ang: 0 };
  if (path.length === 1) {
    const [x, y] = xy(path[0], key);
    return { x, y, i: x, j: y, ang: 0 };
  }
  let s = Math.max(0, dist);
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1], key);
    const [bx, by] = xy(path[i], key);
    const L = Math.hypot(bx - ax, by - ay) || 1e-6;
    if (s <= L || i === path.length - 1) {
      const u = Math.max(0, Math.min(1, s / L));
      const x = ax + (bx - ax) * u;
      const y = ay + (by - ay) * u;
      return { x, y, i: x, j: y, ang: Math.atan2(by - ay, bx - ax) };
    }
    s -= L;
  }
  const [x, y] = xy(path[path.length - 1], key);
  return { x, y, i: x, j: y, ang: 0 };
}

function hash(id) {
  const s = String(id ?? 0);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function leavingState(person) {
  const state = person?.state;
  return state === 'walkout' || state === 'leaving' || state === 'eat' || state === 'happy' || person?.departing;
}

export function createAnimator(options = {}) {
  const fx = options.fx || createFx({ capacity: options.phone ? 32 : 48, reducedMotion: options.reducedMotion });
  const tracks = new Map();
  const fxQueue = [];
  const liveArcs = [];
  const cheer = new Map();
  const storm = new Map();
  const hopUntil = new Map();
  let time = 0;
  let lastDt = 0;
  let lastClock = null;
  let hidden = !!options.hidden;
  let phone = !!options.phone;
  let rushZoom = 1;
  let prevCombo = 0;
  let pendingTaco = 0;
  let lastSteam = -10;
  let lastPrune = 0;
  let leafN = phone ? 6 : 10;
  const leaves = Array.from({ length: 12 }, (_, i) => ({
    x: (i * 0.173) % 1,
    y: (i * 0.271) % 1,
    ph: i * 1.31,
    s: 0.7 + (i % 3) * 0.15,
  }));
  const grackle = { u: 0.2, from: 0.15, to: 0.72, hop: 0, pause: 0.4, dir: 1, peck: 0 };

  function track(id, seed) {
    const key = id ?? 'anon';
    let row = tracks.get(key);
    if (!row) {
      row = { seen: time, ...seed };
      tracks.set(key, row);
    }
    row.seen = time;
    return row;
  }

  function prune() {
    if (time - lastPrune < 2.5) return;
    lastPrune = time;
    for (const [id, row] of tracks) if (time - row.seen > 8) tracks.delete(id);
    if (tracks.size > 96) {
      const drop = tracks.size - 80;
      let n = 0;
      for (const id of tracks.keys()) {
        tracks.delete(id);
        if (++n >= drop) break;
      }
    }
  }

  function configure(next = {}) {
    if (next.phone != null) {
      phone = !!next.phone;
      leafN = phone ? 6 : 10;
    }
    if (next.hidden != null) hidden = !!next.hidden;
  }

  function step(dt, signals = {}) {
    if (signals.phone != null || signals.hidden != null) configure(signals);
    if (typeof document !== 'undefined' && document.hidden) hidden = true;
    let use = Number.isFinite(dt) ? dt : 0;
    if (signals.clock != null) {
      use = lastClock == null ? 0 : Math.min(0.05, Math.max(0, signals.clock - lastClock));
      lastClock = signals.clock;
    }
    if (hidden || signals.hidden) use = 0;
    use = Math.max(0, Math.min(0.05, use));
    lastDt = use;
    time += use * (signals.fastForward ? 2.6 : 1);

    const rushTarget = signals.bigRush ? (phone ? 1.035 : 1.05) : 1;
    rushZoom = easeToward(rushZoom, rushTarget, use, 2.2);
    const flash = signals.comboFlash || 0;
    if (flash > 0 && prevCombo <= 0) {
      hopUntil.set('__all', time + 0.32);
      fxQueue.push({ kind: 'combo', anchor: 'stand' });
    }
    prevCombo = flash;

    for (const [id, until] of cheer) if (time > until) cheer.delete(id);
    for (const [id, until] of hopUntil) if (time > until) hopUntil.delete(id);
    for (const [id, until] of storm) if (time > until) storm.delete(id);
    for (const arc of liveArcs) arc.age += use;
    for (let i = liveArcs.length - 1; i >= 0; i--) if (liveArcs[i].age >= liveArcs[i].dur) liveArcs.splice(i, 1);

    const leafDt = use;
    for (let i = 0; i < leafN; i++) {
      const leaf = leaves[i];
      const drift = 0.035 + (i % 4) * 0.012;
      leaf.y = easeToward(leaf.y, leaf.y + drift, leafDt, 1.4);
      leaf.x = easeToward(leaf.x, (leaf.x + Math.sin(time * 0.35 + leaf.ph) * 0.02 + 1) % 1, leafDt, 1.1);
      if (leaf.y > 1.05) leaf.y = -0.05;
    }
    if (grackle.pause > 0) {
      grackle.pause = Math.max(0, grackle.pause - use);
      grackle.peck = Math.sin(time * 7 + 1.2) > 0.55 ? 1 : 0;
    } else {
      grackle.peck = 0;
      const target = grackle.dir > 0 ? grackle.to : grackle.from;
      grackle.u = easeToward(grackle.u, target, use, 3.4);
      grackle.hop = Math.abs(Math.sin(time * 10));
      if (Math.abs(grackle.u - target) < 0.02) {
        grackle.dir *= -1;
        grackle.pause = 0.55 + (grackle.dir > 0 ? 0.25 : 0.1);
        grackle.hop = 0;
      }
    }
    prune();
    if (signals.events) for (const ev of signals.events) note(ev);
    return use;
  }

  function note(event) {
    if (!event) return;
    if (event.type === 'combo') {
      hopUntil.set('__all', time + 0.32);
      fxQueue.push({ kind: 'combo', anchor: 'stand' });
    }
    if (event.type === 'sale' || event.type === 'handoff') {
      pendingTaco += 1;
      if (event.customerId != null) cheer.set(event.customerId, time + 0.7);
      hopUntil.set('matt', time + 0.3);
      if ((event.tip || 0) > 0) fxQueue.push({ kind: 'clink', anchor: 'jar', text: `+$${event.tip}` });
    }
    if (event.type === 'walkout' || event.type === 'walkoff') {
      if (event.customerId != null) storm.set(event.customerId, time + 4);
    }
    if (shouldPopCoin(event)) {
      const text = event.text || (Number.isFinite(event.cash) ? `+$${event.cash}` : '+$');
      fxQueue.push({ kind: 'coin', anchor: 'stand', text: String(text).slice(0, 12) });
    }
  }

  function grill(active) {
    if (!active || hidden) return;
    if (time - lastSteam < (phone ? 0.28 : 0.16)) return;
    lastSteam = time;
    fxQueue.push({ kind: 'steam', anchor: 'grill' });
    if (Math.sin(time * 6.5) > 0.2) fxQueue.push({ kind: 'sizzle', anchor: 'grill' });
  }

  function toss(from, to) {
    if (!from || !to || pendingTaco <= 0) return 0;
    let n = 0;
    while (pendingTaco > 0 && n < 3) {
      pendingTaco--;
      n++;
      liveArcs.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, age: 0, dur: 0.68 });
      fx.tacoToss(from.x, from.y, to.x, to.y, 0.68);
    }
    return n;
  }

  function present(ctx, anchors = {}) {
    for (const ev of fxQueue) {
      const p = anchors[ev.anchor] || anchors.jared || anchors.stand;
      if (!p) continue;
      if (ev.kind === 'coin') fx.cashPop(ev.text || '+$', p.x, p.y - 42);
      else if (ev.kind === 'clink') fx.sizzle(p.x, p.y - 18);
      else if (ev.kind === 'steam') fx.steam(p.x, p.y - 28);
      else if (ev.kind === 'sizzle') fx.sizzle(p.x, p.y - 20);
      else if (ev.kind === 'combo') fx.comboBurst(p.x, p.y - 30);
    }
    fxQueue.length = 0;
    fx.update(lastDt);
    if (ctx) fx.draw(ctx, { x: 0, y: 0, zoom: 1, viewportWidth: anchors.viewportWidth || 0 });
  }

  function hopAmp(id) {
    const until = hopUntil.get(id) || hopUntil.get('__all') || 0;
    if (until <= time) return 0;
    const u = 1 - (until - time) / 0.32;
    return Math.sin(clamp01(u) * Math.PI) * 9;
  }

  function crewPose(id, spec = {}) {
    const phase = Number.isFinite(spec.phase) ? spec.phase : hash(id) * 2.4;
    const typing = id === 'antonio';
    const gesturing = id === 'west';
    const working = !!(spec.working || typing);
    const wave = Math.sin((time + phase) * Math.PI * 2 * (working ? 1.65 : 0.7));
    // Antonio stays in the seated action-sheet cell. The idle cell is him standing with a laptop.
    const acting = typing
      ? true
      : gesturing
        ? wave > 0.05
        : working
          ? wave > -0.15
          : wave > 0.72;
    const idleStrip = spec.idleStrip?.frames?.length ? spec.idleStrip : (spec.idleStrip?.length ? spec.idleStrip : (spec.idle ? [spec.idle] : []));
    const workStrip = spec.workStrip?.frames?.length ? spec.workStrip : (spec.workStrip?.length ? spec.workStrip : (spec.work ? [spec.work] : idleStrip));
    const strip = acting ? workStrip : idleStrip;
    const frames = stripFrames(strip);
    const held = !Array.isArray(strip) && Array.isArray(strip?.holds);
    const gate = smoothstep(wave * 0.5 + 0.5);
    const squash = acting ? 1 - 0.07 * gate : 1 + Math.sin((time + phase) * 2.2) * 0.018;
    const stretch = acting ? 1 + 0.045 * gate : 1;
    const breathe = Math.sin((time + phase) * 2.15) * 2.5;
    // Multi-frame work strips are foot-registered. Breathing would skate them.
    const bob = (acting && held) ? -hopAmp(id) * 0.25 : breathe - hopAmp(id);
    const lean = (acting ? 0.07 : 0.012 * Math.sin(time + phase)) * (id === 'west' ? -1 : 1);
    const rate = acting ? (frames.length > 2 ? 7 : 8) : 4;
    const forced = Number.isInteger(spec.forceIndex) ? spec.forceIndex : -1;
    return {
      id,
      frame: forced >= 0 && frames[forced] ? frames[forced] : frameAt(strip, time + phase, rate),
      index: forced >= 0 ? forced : frameIndex(strip, time + phase, rate),
      count: frames.length,
      acting,
      sheet: acting ? 'work' : 'idle',
      bob,
      squash,
      stretch,
      lean,
      pinned: typing || !!spec.pinned,
      dx: 0,
      dy: 0,
    };
  }

  function bodyOf(person, moving, impatient, cheering, storming, hold) {
    const phase = hash(person.id) * 6.2;
    const rate = storming ? 13 : moving ? 9 : impatient ? 8 : 2.3;
    const step = moving || impatient ? Math.abs(Math.sin(time * rate + phase)) : 0;
    const breathe = Math.sin(time * 2.1 + phase) * (moving ? 0.6 : 1.5);
    let bob = breathe - step * (storming ? 5.2 : moving ? 4.2 : impatient ? 1.8 : 0);
    if (cheering) bob -= Math.abs(Math.sin(time * 7.4 + phase)) * 8;
    if (hold === 'taco' && moving) bob -= Math.abs(Math.sin(time * 6.2 + phase)) * 2.6;
    const squash = storming
      ? 0.92 - step * 0.04
      : 1 - step * (moving ? 0.06 : impatient ? 0.035 : 0.01);
    const stretch = 1 + (1 - squash) * 0.55;
    let frameHint = 'idle';
    if (storming) frameHint = 'angry';
    else if (cheering) frameHint = 'cheer';
    else if (impatient) frameHint = 'impatient';
    else if (moving) frameHint = 'walk';
    return { bob, squash, stretch, lean: storming ? 0.14 : moving ? 0.04 : 0, frameHint, step };
  }

  // Side-view students face screen-right. Flip when travel runs toward screen-left.
  function screenLeft(face) {
    return (Math.cos(face) - Math.sin(face)) < 0;
  }

  // N-frame walk strips, one array per customer id (v3 order). Playback is eased.
  // The 2px bob is tied to the frame, planted on footfalls and up between them.
  function applyWalk(spot, slot, opts) {
    if (!spot) return spot;
    const strips = opts?.walkStrips;
    const count = strips?.length || 0;
    if (count && Number.isFinite(spot.face)) spot.flip = screenLeft(spot.face);
    if (!count) return spot;
    const picked = typeof opts.walkIndex === 'function' ? opts.walkIndex(spot.person, slot) : slot;
    const index = ((picked % count) + count) % count;
    const strip = strips[index];
    const storm = spot.frameHint === 'angry';
    const moving = !!spot.walking || storm;
    if (!strip?.length || !moving) return spot;
    const played = playCustomerWalk(strip, time + index * 0.17, { fps: storm ? STORM_FPS : WALK_FPS, storm });
    const bite = spot.hold === 'taco' ? -Math.abs(Math.sin(time * 10 + index)) * 3 : 0;
    spot.frame = played.frame;
    spot.bob = played.bob + bite;
    spot.sway = played.sway;
    spot.lag = played.lag;
    spot.pose = storm ? 'leave' : 'walk';
    spot.lean = 0;
    return spot;
  }

  function placeLine(people, path, opts = {}) {
    const list = people || [];
    if (!path?.length) {
      return list.map((person) => ({
        x: person?.x || 0, y: person?.y || 0, i: person?.i || 0, j: person?.j || 0,
        ang: 0, flip: false, walking: false, hold: '', bob: Math.sin(time * 2) * 1.4,
        squash: 1, stretch: 1, lean: 0, frameHint: 'idle', step: 0,
      }));
    }
    const length = opts.length ?? pathLength(path);
    const tiles = pathKey(path) === 'i';
    const swayAmp = opts.sway ?? (tiles ? 0.035 : 1.6);
    const moveEps = tiles ? 0.003 : 0.4;
    const head = opts.head || 'start';
    const waiting = [];
    list.forEach((person, index) => {
      if (!leavingState(person)) waiting.push(index);
    });
    const spacing = Number.isFinite(opts.spacing)
      ? opts.spacing
      : (waiting.length <= 1 ? 0 : length / Math.max(1, waiting.length - 1));
    const out = new Array(list.length);
    let slot = 0;
    for (let n = 0; n < list.length; n++) {
      const person = list[n];
      if (leavingState(person) && opts.exit?.length) {
        out[n] = exitOne(person, opts.exit, n, opts);
        continue;
      }
      const index = waiting.indexOf(n);
      const ordinal = index >= 0 ? index : slot;
      slot += 1;
      const target = head === 'end'
        ? Math.max(0, length - ordinal * spacing)
        : Math.min(length, ordinal * spacing);
      const behind = head === 'end' ? target - spacing * 0.62 : target + spacing * 0.62;
      const row = track(`line:${person.id ?? n}`, { dist: Math.max(0, Math.min(length, behind)), prev: null });
      const before = row.dist;
      row.dist = easeToward(row.dist, target, lastDt, 2.8);
      row.prev = before;
      const at = pointAlong(path, row.dist);
      const moving = Math.abs(row.dist - before) > moveEps;
      const patience = person.patienceMax ? person.patience / person.patienceMax : (person.patience ?? 1);
      const impatient = person.mood === 'impatient' || person.mood === 'angry' || patience < 0.35;
      const cheering = cheer.has(person.id) || person.state === 'happy' || person.golden;
      const body = bodyOf(person, moving, impatient && !moving, cheering, false, cheering ? 'taco' : '');
      let face = head === 'end' ? at.ang : at.ang + Math.PI;
      if (moving) face = (head === 'end' ? row.dist > before : row.dist < before) ? (head === 'end' ? at.ang : at.ang + Math.PI) : at.ang;
      const sway = Math.sin(time * (moving ? 7 : 2.2) + hash(person.id) * 4) * swayAmp * (moving ? 1 : 0.25);
      const ox = -Math.sin(at.ang) * sway;
      const oy = Math.cos(at.ang) * sway;
      out[n] = applyWalk({
        x: at.x + ox, y: at.y + oy, i: at.i + ox, j: at.j + oy, ang: at.ang, face,
        flip: Math.cos(face) < 0,
        walking: moving,
        hold: cheering ? 'taco' : '',
        person,
        ...body,
      }, n, opts);
    }
    return out;
  }

  function exitOne(person, path, slot = 0, opts = null) {
    const storming = storm.has(person.id) || person.state === 'walkout' || person.mood === 'angry';
    const row = track(`exit:${person.id}`, { u: 0 });
    row.u = easeToward(row.u, 1, lastDt, storming ? 2.15 : 0.95);
    const length = pathLength(path);
    const at = pointAlong(path, row.u * length);
    const moving = row.u < 0.98;
    const cheering = !storming && (cheer.has(person.id) || person.hold === 'taco' || person.state === 'happy' || person.state === 'eat' || person.state === 'leaving');
    const body = bodyOf(person, moving, false, cheering, storming, storming ? '' : 'taco');
    return applyWalk({
      x: at.x, y: at.y, i: at.i, j: at.j, ang: at.ang, face: at.ang,
      flip: Math.cos(at.ang) < 0,
      walking: moving,
      hold: storming ? '' : 'taco',
      person,
      ...body,
    }, slot, opts);
  }

  function placeExit(people, path) {
    if (!path?.length) return (people || []).map(() => null);
    return (people || []).map((person) => exitOne(person, path));
  }

  function actorMotion(actor) {
    if (!actor) return { bob: 0, squash: 1, stretch: 1, lean: 0, flip: false, walking: false, frameHint: 'idle', hold: '' };
    const row = track(`act:${actor.id}`, { i: actor.i, j: actor.j });
    const di = (actor.i ?? 0) - (row.i ?? actor.i ?? 0);
    const dj = (actor.j ?? 0) - (row.j ?? actor.j ?? 0);
    row.i = actor.i;
    row.j = actor.j;
    const moving = actor.anim === 'walk' || actor.anim === 'run' || Math.hypot(di, dj) > 0.004;
    const storming = storm.has(actor.id) || actor.state === 'walkout';
    const impatient = actor.anim === 'tap' || actor.anim === 'crossed' || actor.patience > 14;
    const cheering = cheer.has(actor.id) || actor.state === 'happy' || actor.hold === 'taco';
    const body = bodyOf(actor, moving, impatient && !moving, cheering, storming, storming ? '' : (actor.hold === 'taco' ? 'taco' : ''));
    return {
      ...body,
      flip: di - dj > 0.002 ? true : di - dj < -0.002 ? false : !!actor.mirror,
      walking: moving,
      hold: storming ? '' : (actor.hold || (cheering ? 'taco' : '')),
    };
  }

  function leafPoses() {
    return leaves.slice(0, leafN).map((leaf) => ({
      x: leaf.x,
      y: leaf.y,
      rot: Math.sin(time * 0.8 + leaf.ph) * 0.8,
      s: leaf.s,
    }));
  }

  function gracklePose() {
    return {
      u: grackle.u,
      hop: grackle.hop * 5,
      peck: grackle.peck,
      flip: grackle.dir < 0,
    };
  }

  function lampGlow(index = 0) {
    const n = Math.sin(time * 9 + index * 2.2);
    if (n > 0.86) return 0.28;
    return 0.62 + smoothstep(n * 0.5 + 0.5) * 0.38;
  }

  function arcsLive() {
    return liveArcs.map((arc) => ({ from: arc.from, to: arc.to, u: arc.dur ? arc.age / arc.dur : 1 }));
  }

  function dispose() {
    fx.dispose();
    tracks.clear();
  }

  return {
    configure, step, note, grill, toss, present, crewPose, placeLine, placeExit, actorMotion,
    leafPoses, gracklePose, lampGlow, arcsLive, shouldPopCoin, dispose, fx,
    get time() { return time; },
    get hidden() { return hidden; },
    get rushZoom() { return rushZoom; },
    get lastDt() { return lastDt; },
    setHidden(v) { hidden = !!v; },
  };
}

let singleton = null;

export function watchAnimator() {
  if (!singleton) singleton = createAnimator();
  return singleton;
}

export function resetWatchAnimator() {
  singleton?.dispose();
  singleton = null;
}

// Painted 4-frame crew loops (uneven holds) live beside this clock.
// A strip drops in by passing workStrip/idleStrip to crewPose, or by calling workPose.
export {
  CREW_LOOP_NAMES, LOOP_COLS, LOOP_ROWS, LOOP_FPS, LOOP_HOLDS, MATT_RELEASE_FRAME,
  cellGrid, loopCycle, handoffArc, workPose, frameScreenHeight, footAnchorVariance,
  prepareCrewLoops, framesToCanvases,
} from './crewLoops.js';
