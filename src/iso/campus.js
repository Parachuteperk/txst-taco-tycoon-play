// Local stand-in for the engine's customers / items / crew / events.
// When view.customers, view.items, and view.crew are all arrays, those win.
// payment(customerId, cash, byCrewId='jared') fires at order time. Handoff has no cash.

import {
  CREW, CRATE, COOLER, RIG, WINDOW, EXIT, PATHS, SIT, CHAT, FRISBEE, GAWK,
  inClear, polyPoint, crowdDensity, ambientCap, queuePath, nudgeOffCrew,
} from './world.js';
import { createAiAli, stepAiAli, applyAiAli } from './aiAli.js';
import { TILES as ENGINE_TILES } from '../sim/layout.js';

// Engine home tile per crew member (src/sim/layout.js CREW_HOME).
const ENGINE_HOME = { jared: ENGINE_TILES.register, phillip: ENGINE_TILES.prep, ali: ENGINE_TILES.grill, matt: ENGINE_TILES.serve, aaron: ENGINE_TILES.assemble };
import {
  blankVault, liveVaultEvents, metalFrom, mockVaultEvents, reduceVault,
} from './vault.js';

const CYCLE = 16;
const SLOTS = [0, 5.4, 10.7];
const PAY_AT = 0.45;
const HAND_AT = 12.15;
const WASTE_AT = 6.4;

const mod = (n, m) => ((n % m) + m) % m;

// Paid customers wait for their own taco off the right end of the counter, outside the crew's clear zone.
const PICKUP = [
  { i: 18.4, j: 10.5 }, { i: 19.2, j: 10.85 }, { i: 20.0, j: 10.6 }, { i: 18.8, j: 11.45 }, { i: 19.6, j: 11.75 }, { i: 20.4, j: 11.45 },
];

function ageCross(prev, now, offset, mark) {
  if (!(now > prev)) return false;
  const a0 = mod(prev + offset, CYCLE);
  const a1 = mod(now + offset, CYCLE);
  if (a1 >= a0) return a0 < mark && a1 >= mark;
  return a0 < mark || a1 >= mark;
}

export function orderStage(age) {
  if (age < 0.4) return { station: 'register', progress: age / 0.4 };
  if (age < 3.2) return { station: 'tortilla', progress: (age - 0.4) / 2.8 };
  if (age < 6.0) return { station: 'grill', progress: (age - 3.2) / 2.8 };
  if (age < 8.8) return { station: 'assemble', progress: (age - 6.0) / 2.8 };
  if (age < 11.6) return { station: 'wrap', progress: (age - 8.8) / 2.8 };
  if (age < 13.4) return { station: 'handoff', progress: (age - 11.6) / 1.8 };
  return { station: 'done', progress: 1 };
}

function slotAge(t, slot) {
  return mod(t + SLOTS[slot], CYCLE);
}

function wastes(t, slot) {
  if (slot !== 2) return false;
  return Math.floor((t + SLOTS[slot]) / CYCLE) % 4 === 3;
}

export function createCampus() {
  return {
    t: null, events: [], coins: [], happy: [], walkouts: [], ambient: [], leaves: [], birds: [], seenCrowd: 0, crew: {},
    vault: blankVault(), vaultFromEngine: false,
  };
}

export function readService(view) {
  if (view && Array.isArray(view.customers) && Array.isArray(view.items) && Array.isArray(view.crew)) {
    return { source: 'engine', customers: view.customers, items: view.items, crew: view.crew };
  }
  return null;
}

export function mockFrame(t) {
  const items = [];
  const customers = [];
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const age = slotAge(t, slot);
    const cycle = Math.floor((t + SLOTS[slot]) / CYCLE);
    const customerId = 4000 + slot * 100 + (cycle % 97);
    const waste = wastes(t, slot);
    const stage = waste && age >= WASTE_AT ? { station: 'trash', progress: Math.min(1, (age - WASTE_AT) / 2) } : orderStage(age);
    if (stage.station !== 'done' && !(waste && age < PAY_AT)) {
      items.push({ id: 8000 + slot, customerId, station: stage.station, progress: stage.progress, waste });
    }
    let state = 'queue';
    if (slot === 0) {
      if (age < 1.1) state = 'paying';
      else if (stage.station === 'handoff') state = 'handoff';
      else if (stage.station === 'done') state = 'leaving';
      else state = 'waiting';
    } else if (waste && age >= WASTE_AT && age < WASTE_AT + 2.4) state = 'walkout';
    else state = 'queue';
    customers.push({
      id: customerId,
      slot,
      state,
      mood: state === 'walkout' ? 'angry' : state === 'handoff' || state === 'leaving' ? 'happy' : state === 'paying' ? 'hungry' : 'wait',
      order: state === 'walkout' ? '' : 'street taco',
      patience: state === 'walkout' ? 0.1 : state === 'waiting' ? 0.45 : 0.8,
      cash: customerId % 5 === 0 ? 0 : 4.25,
      tender: customerId % 5 === 0 ? 'card' : 'cash',
    });
  }
  return { items, customers };
}

export function eventsBetween(prev, now) {
  if (prev == null || !(now > prev)) return [];
  const from = now - prev > 1.2 ? now - 0.05 : prev;
  const events = [];
  for (let slot = 0; slot < SLOTS.length; slot++) {
    const cycle = Math.floor((now + SLOTS[slot]) / CYCLE);
    const customerId = 4000 + slot * 100 + (cycle % 97);
    const waste = wastes(now, slot);
    if (ageCross(from, now, SLOTS[slot], PAY_AT)) {
      events.push({ type: 'payment', customerId, cash: 4.25, byCrewId: 'jared', tender: customerId % 5 === 0 ? 'card' : 'cash' });
      events.push({ type: 'orderTaken', customerId, byCrewId: 'jared' });
    }
    if (!waste && ageCross(from, now, SLOTS[slot], 0.5)) events.push({ type: 'itemStarted', customerId, station: 'tortilla' });
    if (waste && ageCross(from, now, SLOTS[slot], WASTE_AT)) {
      events.push({ type: 'walkout', customerId });
      events.push({ type: 'waste', customerId, station: 'trash' });
    }
    if (!waste && ageCross(from, now, SLOTS[slot], HAND_AT)) {
      events.push({ type: 'handoff', customerId, itemId: 8000 + slot, byCrewId: 'matt' });
    }
  }
  return events;
}

function lineSpot(index, count, path) {
  const u = count <= 1 ? 1 : 1 - index / (count - 1);
  return polyPoint(path, u);
}

// The rope stays on the open plaza. A step straight toward the camera would
// plant a customer on the rig, so the nudge walks away from the desk and chair.
function clearOfCrew(at) {
  return nudgeOffCrew(at);
}

function moveToward(pos, target, dt, speed) {
  const di = target.i - pos.i;
  const dj = target.j - pos.j;
  const d = Math.hypot(di, dj) || 1;
  const step = Math.min(d, speed * dt);
  return { i: pos.i + di / d * step, j: pos.j + dj / d * step };
}

// Manager view publishes a line array and/or a count. It does not publish view.customers.
export function crowdFromView(view) {
  const real = Array.isArray(view?.line) ? view.line : [];
  const extra = Array.isArray(view?.live?.visualLine) ? view.live.visualLine : [];
  const people = real.concat(extra);
  const nums = [
    view?.live?.visualCrowd,
    view?.live?.lineLength,
    typeof view?.live?.line === 'number' ? view.live.line : undefined,
    view?.lineCount,
    typeof view?.live?.queue === 'number' ? view.live.queue : undefined,
    typeof view?.queue === 'number' ? view.queue : undefined,
  ].filter((n) => Number.isFinite(n) && n > 0);
  const total = Math.max(people.length, nums.length ? Math.max(...nums) : 0);
  return { people, total };
}

function crewTarget(id, items, t) {
  const home = CREW[id];
  if (id === 'phillip') {
    const tortilla = items.find((it) => it.station === 'tortilla' && it.progress < 0.35);
    if (tortilla) return tortilla.progress < 0.12 ? CRATE : home;
  }
  if (id === 'ali') {
    const grill = items.find((it) => it.station === 'grill' && it.progress < 0.22);
    if (grill) return COOLER;
  }
  if (id === 'matt' && items.some((it) => it.station === 'handoff')) return { i: WINDOW.i + 0.35, j: WINDOW.j - 0.45 };
  // Antonio stays on the folding-table station. No laptop walk off the rig.
  if (id === 'antonio') return { i: RIG.i, j: RIG.j };
  return home;
}

function carryOf(id, items, t) {
  if (id === 'phillip' && items.some((it) => it.station === 'tortilla' && it.progress < 0.35)) return 'tortilla';
  if (id === 'ali' && items.some((it) => it.station === 'grill' && it.progress < 0.22)) return 'meat';
  if (id === 'matt' && items.some((it) => it.station === 'handoff' || it.station === 'wrap')) return 'taco';
  return '';
}

const PATH_KEYS = ['west', 'south', 'east', 'northL', 'northR'];

function makeAmbient(n, phone) {
  const cap = ambientCap(phone);
  const list = [];
  for (let id = 0; id < cap; id++) {
    const key = PATH_KEYS[id % PATH_KEYS.length];
    list.push({
      id: n + id,
      key,
      u: (id * 0.17) % 1,
      speed: 0.045 + (id % 5) * 0.008,
      mode: 'walk',
      kind: ambientKind(id),
    });
  }
  return list;
}

function ambientKind(id) {
  if (id === 6) return 'guide';
  if (id === 8) return 'balloon';
  if (id === 10) return 'frisbee';
  if (id % 17 === 0) return 'bike';
  if (id % 17 === 1) return 'skate';
  if (id % 17 === 2) return 'scooter';
  if (id % 17 === 3) return 'jog';
  if (id % 17 === 4) return 'coffee';
  if (id % 17 === 5) return 'dog';
  if (id % 11 === 0) return 'sit';
  if (id % 13 === 0) return 'chat';
  if (id % 9 === 0) return 'gawk';
  return 'walk';
}

function placeAmbient(a, t) {
  if (a.kind === 'sit') {
    const spot = SIT[a.id % SIT.length];
    return { i: spot.i, j: spot.j, face: 1 };
  }
  if (a.kind === 'chat') return { i: CHAT.i, j: CHAT.j, face: 1 };
  if (a.mode === 'join' && a.goal) return { i: a.i, j: a.j, face: a.face || 1 };
  if (a.kind === 'gawk') {
    const spot = GAWK[a.id % GAWK.length];
    return { i: spot.i, j: spot.j, face: spot.i < 12 ? 1 : -1 };
  }
  const at = polyPoint(PATHS[a.key], a.u);
  if (inClear(at.i, at.j)) return null;
  const [sx, sy] = [at.di - at.dj, at.di + at.dj];
  return { i: at.i, j: at.j, face: sx >= 0 ? 1 : -1, moving: true, sy };
}

export function stepCampus(state, input) {
  const t = input.t || 0;
  const dt = Math.max(0, Math.min(0.05, input.dt ?? (state.t == null ? 0 : t - state.t)));
  const engine = readService(input.view);
  // Engine events arrive per frame on input.events (the bridge's S.watchEvents); the mock makes its own.
  state.events = engine ? (Array.isArray(input.events) ? input.events : (input.view.events || [])).slice() : eventsBetween(state.t, t);
  if (!state.leaving) state.leaving = [];
  for (const ev of state.events) {
    // Money only moves at Jared's window: a coin pops for a cash payment and never at the handoff.
    if (ev.type === 'payment' && (!engine || Number(ev.cash) > 0)) state.coins.push({ t, i: CREW.jared.i, j: CREW.jared.j, id: ev.customerId, kind: ev.tender === 'card' ? 'card' : 'coin' });
    if (ev.type === 'handoff') {
      state.happy.push({ t, id: ev.customerId });
      if (engine && !state.leaving.some((l) => l.id === ev.customerId)) state.leaving.push({ t, id: ev.customerId, from: state.spots?.[ev.customerId] || PICKUP[0] });
    }
    if (ev.type === 'walkout') state.walkouts.push({ t, id: ev.customerId, u: 0 });
  }
  state.leaving = state.leaving.filter((l) => t - l.t < 4);
  // Vault / coin-flip. Mock only when the engine is not supplying the service
  // arrays and has not emitted metalSettle / coinFlip* yet. Register coins stay
  // on state.coins; challenge payouts live on state.vault.payout.
  const liveVault = liveVaultEvents(input);
  if (liveVault.length) state.vaultFromEngine = true;
  if (!state.vault) state.vault = blankVault();
  if (engine) {
    for (const ev of liveVault) if (!state.events.includes(ev)) state.events.push(ev);
  } else if (!state.vaultFromEngine) {
    state.events.push(...mockVaultEvents(state.t, t));
  } else {
    for (const ev of liveVault) state.events.push(ev);
  }
  state.vault = reduceVault(state.vault, state.events, t);
  const held = metalFrom(null, input.view);
  if (held) state.vault.metal = held;
  state.t = t;
  state.coins = state.coins.filter((c) => t - c.t < 0.9);
  state.happy = state.happy.filter((c) => t - c.t < 1.5);
  state.walkouts = state.walkouts.filter((c) => t - c.t < 2.6);
  for (const w of state.walkouts) w.u = Math.min(1, (t - w.t) / 2.4);

  const frame = engine
    ? { source: 'engine', items: engine.items, customers: engine.customers, crew: engine.crew }
    : mockFrame(t);
  if (!engine) {
    const crew = {};
    for (const id of Object.keys(CREW)) {
      const prev = state.crew[id] || { ...CREW[id] };
      const target = crewTarget(id, frame.items, t);
      const next = moveToward(prev, target, dt || 0.016, id === 'antonio' ? 1.1 : 1.6);
      crew[id] = { ...next, di: target.i - prev.i, dj: target.j - prev.j, task: CREW[id].task, carry: carryOf(id, frame.items, t) };
    }
    state.crew = crew;
    frame.crew = Object.entries(crew).map(([id, pos]) => ({ id, ...pos }));
    const route = queuePath(input.lineCount, input.view);
    const fromView = crowdFromView(input.view);
    const count = Math.max(frame.customers.length, Math.min(55, fromView.total || input.lineCount || 9));
    frame.queue = [];
    for (let i = 0; i < count; i++) {
      const known = fromView.people[i] || frame.customers[i];
      const at = clearOfCrew(i === 0 ? polyPoint(route, 1) : lineSpot(i, count, route));
      frame.queue.push({
        id: known?.id ?? 5000 + i,
        i: at.i,
        j: at.j,
        state: known?.state || 'queue',
        mood: known?.mood || (i > 6 ? 'impatient' : 'wait'),
        order: known?.order ?? 'street taco',
        patience: known?.patience ?? Math.max(0.15, 1 - i / count),
        face: 1,
      });
    }
    for (const w of state.walkouts) {
      const at = polyPoint(EXIT, w.u);
      frame.queue.push({ id: w.id, i: at.i, j: at.j, state: 'walkout', mood: 'angry', order: '', patience: 0.05, face: 1 });
    }
  } else {
    // Every engine customer is drawn where the engine says they are in the service:
    // ordering = paying Jared at the head of the rope, line = on the rope, waiting = pickup cluster.
    const route = queuePath(input.lineCount, input.view);
    const roped = engine.customers.filter((c) => c.state === 'line' || c.state === 'ordering')
      .sort((a, b) => (a.state === 'ordering' ? -1 : 0) - (b.state === 'ordering' ? -1 : 0) || (a.queueIndex ?? 0) - (b.queueIndex ?? 0));
    const waiting = engine.customers.filter((c) => c.state === 'waiting');
    const count = Math.max(roped.length, Math.min(55, input.lineCount || 0));
    const mood = (c, fallback) => c.mood || (c.patienceMax ? (c.patience / c.patienceMax < 0.35 ? 'impatient' : 'wait') : fallback);
    state.spots = {};
    frame.queue = Array.from({ length: count }, (_, i) => {
      const c = roped[i] || {};
      const at = clearOfCrew(i === 0 ? polyPoint(route, 1) : lineSpot(i, count, route));
      if (c.id != null) state.spots[c.id] = at;
      return {
        id: c.id ?? 5000 + i, i: at.i, j: at.j,
        state: c.state === 'ordering' ? 'paying' : 'queue',
        mood: mood(c, i > 6 ? 'impatient' : 'wait'),
        order: 'street taco', patience: c.patienceMax ? c.patience / c.patienceMax : Math.max(0.15, 1 - i / Math.max(1, count)), face: 1,
      };
    });
    waiting.forEach((c, k) => {
      const at = PICKUP[k % PICKUP.length], ring = Math.floor(k / PICKUP.length);
      const spot = { i: at.i + ring * 0.55, j: at.j + ring * 0.45 };
      state.spots[c.id] = spot;
      frame.queue.push({ id: c.id, i: spot.i, j: spot.j, state: 'waiting', mood: mood(c, 'wait'), order: 'street taco', patience: c.patienceMax ? c.patience / c.patienceMax : 0.6, face: -1 });
    });
    for (const l of state.leaving) {
      const u = Math.min(1, (t - l.t) / 3.6), end = EXIT[EXIT.length - 1];
      frame.queue.push({ id: l.id, i: l.from.i + (end.i - l.from.i) * u, j: l.from.j + (end.j - l.from.j) * u, state: 'handoff', mood: 'happy', order: '', patience: 1, face: 1, walking: true });
    }
    // Per-taco items: map engine stage names onto the painted goods and aim the finished taco at its own customer.
    const STAGE = { warm: 'tortilla', prep: 'tortilla', grill: 'grill', assemble: 'assemble', wrap: 'wrap', serve: 'wrap' };
    frame.items = engine.items.map((it) => ({ ...it, station: STAGE[it.station] || it.station, to: state.spots[it.customerId] || null }));
    frame.crew = engine.crew;
    const fromView = crowdFromView(input.view);
    if (fromView.total > frame.queue.length) {
      const route = queuePath(fromView.total, input.view);
      frame.queue = Array.from({ length: Math.min(55, fromView.total) }, (_, i) => {
        const c = fromView.people[i] || engine.customers[i] || {};
        const at = clearOfCrew(i === 0 ? polyPoint(route, 1) : lineSpot(i, fromView.total, route));
        return {
          id: c.id ?? 5000 + i, i: at.i, j: at.j, state: c.state || 'queue',
          mood: c.mood || 'wait', order: c.order || 'street taco',
          patience: c.patience ?? 0.7, face: 1,
        };
      });
    }
  }
  if (!Array.isArray(frame.crew)) frame.crew = [];
  if (engine) frame.crew = frame.crew.map((c) => ({ ...c }));
  for (const [id, pos] of Object.entries(CREW)) {
    let row = frame.crew.find((c) => c.id === id);
    if (!row) { row = { id, di: 0, dj: 0 }; frame.crew.push(row); }
    // Engine supply haul: map progress home -> crate (engine tiles) onto the painted walk to the crate.
    const home = ENGINE_HOME[id];
    if (engine && row.task === 'hauling' && row.pos && home) {
      const span = Math.hypot(ENGINE_TILES.crate.x - home.x, ENGINE_TILES.crate.y - home.y) || 1;
      const u = Math.max(0, Math.min(1, Math.hypot(row.pos.x - home.x, row.pos.y - home.y) / span));
      const prev = state.haulU?.[id] ?? 0;
      const back = u < prev - 1e-4 || (state.haulBack?.[id] && u < 0.999);
      (state.haulU ||= {})[id] = u; (state.haulBack ||= {})[id] = back;
      row.i = pos.i + (CRATE.i - pos.i) * u; row.j = pos.j + (CRATE.j - pos.j) * u;
      row.di = (CRATE.i - pos.i) * (back ? -1 : 1); row.dj = (CRATE.j - pos.j) * (back ? -1 : 1);
      row.carry = back ? 'tortilla' : '';
    } else if (engine && state.haulU?.[id] != null) { delete state.haulU[id]; delete state.haulBack[id]; }
    if (!Number.isFinite(row.i)) { row.i = pos.i; row.j = pos.j; }
    if (id === 'antonio') { row.i = RIG.i; row.j = RIG.j; row.di = 0; row.dj = 0; row.carry = ''; }
    if (id === 'west') { row.i = pos.i; row.j = pos.j; }
  }

  const minutes = input.minutes ?? 690;
  const density = crowdDensity(minutes, input.reputation ?? 20, !!input.marketing);
  const phone = !!input.phone;
  if (!state.ambient.length || state.phone !== phone) {
    state.ambient = makeAmbient(1, phone);
    state.phone = phone;
  }
  const cap = ambientCap(phone);
  const activeN = Math.max(4, Math.min(cap, Math.round(cap * Math.min(1, density))));
  const crowd = input.view?.live?.visualCrowd;
  const arrived = Number.isFinite(crowd) && crowd > state.seenCrowd;
  if (Number.isFinite(crowd)) state.seenCrowd = crowd;
  const mockJoin = !Number.isFinite(crowd) && Math.floor(t / 18) !== Math.floor((t - dt) / 18) && t > 1;
  if ((arrived || mockJoin) && !state.ambient.some((a) => a.mode === 'join')) {
    const walker = state.ambient.find((a) => a.kind === 'walk');
    if (walker) {
      walker.mode = 'join';
      const tail = queuePath(input.lineCount, input.view)[0];
      walker.i = walker.i ?? tail.i - 1;
      walker.j = walker.j ?? tail.j;
      walker.goal = tail;
    }
  }
  for (const a of state.ambient) {
    if (a.mode === 'join' && a.goal) {
      const next = moveToward(a, a.goal, dt || 0.016, 1.3);
      if (inClear(next.i, next.j)) {
        a.mode = 'walk';
        a.goal = null;
      } else {
        a.i = next.i;
        a.j = next.j;
        if (Math.hypot(a.goal.i - a.i, a.goal.j - a.j) < 0.25) { a.mode = 'walk'; a.goal = null; a.u = 0; }
      }
    } else {
      const slow = a.kind === 'gawk' ? 0.22 : a.kind === 'balloon' ? 0.12 : a.kind === 'frisbee' ? 0.2 : a.kind === 'guide' ? 0.35 : a.kind === 'bike' ? 1.7 : a.kind === 'skate' || a.kind === 'scooter' ? 1.45 : 1;
      a.u = (a.u + a.speed * slow * (dt || 0.016)) % 1;
    }
  }
  frame.ambient = [];
  for (let i = 0; i < activeN; i++) {
    const a = state.ambient[i];
    const at = placeAmbient(a, t);
    if (!at || inClear(at.i, at.j)) continue;
    frame.ambient.push({ ...a, ...at });
  }
  const phase = input.view?.phase;
  const open = (Number.isFinite(minutes) && minutes >= 600 && minutes < 780)
    || ['preopen', 'calm', 'telegraph', 'rush', 'closing'].includes(phase);
  if (open && frame.ambient.length < 3) {
    const seeds = [
      { i: 3.2, j: 16.6, kind: 'walk' },
      { i: 20.6, j: 15.4, kind: 'skate' },
      { i: 4.4, j: 8.5, kind: 'bike' },
    ];
    for (const seed of seeds) {
      if (frame.ambient.length >= 3) break;
      if (inClear(seed.i, seed.j)) continue;
      frame.ambient.push({ id: 880 + frame.ambient.length, face: 1, mode: 'walk', ...seed });
    }
  }
  frame.density = density;
  frame.items = frame.items || [];
  ensureLife(state, t, dt);
  if (!state.aiAli) state.aiAli = createAiAli();
  stepAiAli(state.aiAli, {
    t,
    dt,
    view: input.view,
    events: engine ? state.events : (input.events || []),
    engine: !!engine,
    opts: input.opts,
  });
  applyAiAli(state.aiAli, frame);
  state.frame = frame;
  return state;
}

function ensureLife(state, t, dt) {
  if (!state.leaves.length) {
    state.leaves = Array.from({ length: 10 }, (_, i) => ({
      i: 2.4 + (i * 3.1) % 20,
      j: 3.2 + (i * 1.7) % 15,
      ph: i * 1.3,
    }));
    state.birds = [
      { i: 6, j: 2.4, di: 1.1, dj: -0.2 },
      { i: 18, j: 3.1, di: -0.8, dj: 0.25 },
    ];
  }
  const step = dt || 0.016;
  for (const leaf of state.leaves) {
    leaf.i += Math.sin(t * 0.7 + leaf.ph) * 0.02;
    leaf.j += 0.08 * step;
    if (leaf.j > 20) leaf.j = 3.2;
    if (inClear(leaf.i, leaf.j)) leaf.i += leaf.i < 13 ? -0.5 : 0.5;
  }
  for (const bird of state.birds) {
    bird.i += bird.di * step;
    bird.j += bird.dj * step;
    if (bird.i > 24 || bird.i < 1) bird.di *= -1;
    if (bird.j > 8 || bird.j < 1) bird.dj *= -1;
  }
}

export function bubbleFor(person, lineLength) {
  if (!person) return null;
  if (person.state === 'walkout' || person.mood === 'angry') return 'angry';
  if (person.state === 'handoff' || person.state === 'leaving' || person.mood === 'happy') return 'best';
  if (person.state === 'paying' || person.mood === 'hungry') return 'hungry';
  // Paid and waiting: thinking about their own taco, or that it is taking a while.
  if (person.state === 'waiting') return person.patience < 0.35 || person.mood === 'impatient' ? 'long' : 'taco';
  if ((person.mood === 'impatient' || person.patience < 0.35) && lineLength > 7) return 'long';
  if (person.kind === 'gawk' && person.id % 2 === 0) return 'hungry';
  return null;
}
