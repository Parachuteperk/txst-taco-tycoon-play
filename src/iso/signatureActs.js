// Moped, taco toss, DJ booth, and Pitch Night. Presentation only.
// These four are not ids in the gameplay catalog (Matt is grackle-squad /
// hacky-sack, Aaron is surge-board / franchise-deal). They draw when that id,
// visual field, or a matching engine event is present. No purchase logic.

import { CREW, LINE, inClear } from './world.js';

const FX = {
  'dorm-moped': 'moped',
  'matt-moped': 'moped',
  moped: 'moped',
  'trick-shot': 'toss',
  'trick-shot-toss': 'toss',
  'taco-toss': 'toss',
  trickshot: 'toss',
  'hype-dj': 'dj',
  'dj-booth': 'dj',
  hypedj: 'dj',
  dj: 'dj',
  'pitch-night': 'pitch',
  'sife-pitch': 'pitch',
  pitchnight: 'pitch',
};

const RULES = [
  [/moped|dorm-?delivery|dormDelivery/i, 'moped'],
  [/trick-?shot|taco-?toss|tacoToss/i, 'toss'],
  [/pitch-?night|sife-?pitch|pitchNight/i, 'pitch'],
  [/hype-?dj|dj-?booth|djBooth/i, 'dj'],
];

const DJ = { i: 14.45, j: 11.15 };

export function smoothAct(t) {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

function note(set, token) {
  if (token == null || token === false || token === 0) return;
  const raw = String(token).trim();
  const fx = FX[raw] || FX[raw.toLowerCase()];
  if (fx) set.add(fx);
}

function absorb(set, src) {
  if (!src) return;
  if (Array.isArray(src)) {
    for (const item of src) {
      if (item && typeof item === 'object') { note(set, item.id); note(set, item.visual); }
      else note(set, item);
    }
    return;
  }
  if (typeof src === 'string') { src.split(',').forEach((part) => note(set, part)); return; }
  if (typeof src === 'object') {
    for (const [key, value] of Object.entries(src)) {
      if (Array.isArray(value)) absorb(set, value);
      else if (value && typeof value === 'object') { note(set, value.id || key); note(set, value.visual); }
      else if (value) note(set, key);
    }
  }
}

export function actFx(view, opts, events) {
  const set = new Set();
  absorb(set, opts?.upgrades);
  absorb(set, view?.upgrades);
  absorb(set, view?.manager?.upgrades);
  absorb(set, view?.manager?.trees?.crew);
  absorb(set, view?.trees?.crew);
  for (const event of events || []) {
    const blob = `${event?.type || ''} ${event?.upgradeId || ''} ${event?.visual || ''} ${event?.id || ''}`;
    for (const [rule, fx] of RULES) if (rule.test(blob)) set.add(fx);
  }
  return set;
}

export function rideAt(t) {
  const phase = ((t % 16) + 16) % 16;
  const home = CREW.matt;
  const edge = { i: 24.2, j: 19.4 };
  if (phase < 3.2 || phase >= 14.8) return null;
  if (phase < 8.4) {
    const u = smoothAct((phase - 3.2) / 5.2);
    return { i: home.i + (edge.i - home.i) * u, j: home.j + (edge.j - home.j) * u, di: edge.i - home.i, dj: edge.j - home.j };
  }
  if (phase < 9.6) return { i: edge.i + 0.4, j: edge.j + 0.25, di: 1, dj: 1 };
  const back = smoothAct((phase - 9.6) / 5.2);
  return { i: edge.i + (home.i - edge.i) * back, j: edge.j + (home.j - edge.j) * back, di: home.i - edge.i, dj: home.j - edge.j };
}

function arcAt(from, to, t, height) {
  const u = smoothAct(t);
  return {
    i: from.i + (to.i - from.i) * u,
    j: from.j + (to.j - from.j) * u,
    z: Math.sin(u * Math.PI) * height,
  };
}

export function createActState() {
  return { t: 0, prev: null, fx: new Set(), arcs: [], notes: [], ride: null, pitch: 0, beat: 0, tossAt: 0, seen: new Set() };
}

function has(state, fx) {
  return state.fx.has(fx);
}

export function stepActs(state, input = {}) {
  const hidden = input.hidden ?? (typeof document !== 'undefined' && document.hidden);
  const reduced = !!input.reduced;
  const clock = Number.isFinite(input.clock) ? input.clock : (Number.isFinite(input.now) ? input.now : null);
  let dt = 0;
  if (!hidden && !reduced && clock != null) {
    if (state.prev != null) dt = Math.max(0, Math.min(0.05, clock - state.prev));
    state.prev = clock;
  } else if (clock != null) state.prev = clock;
  state.t += dt;
  const events = input.events || [];
  state.fx = actFx(input.view, input.opts, events);
  const motion = dt > 0;
  state.ride = has(state, 'moped') && motion ? rideAt(state.t) : null;
  if (has(state, 'dj')) state.beat = state.t * 2.05;
  if (has(state, 'pitch')) state.pitch = Math.max(state.pitch, 0.55);
  else state.pitch = Math.max(0, state.pitch - dt * 0.8);
  const queue = (input.queue || []).filter((person) => person && person.state !== 'walkout' && person.id !== 'matt');
  if (motion && has(state, 'toss') && !state.ride && state.t - state.tossAt > 2.7 && queue.length) {
    state.tossAt = state.t;
    const guest = queue[Math.floor(queue.length / 2)];
    if (state.arcs.length < 4) state.arcs.push({ from: CREW.matt, to: guest, age: 0, dur: 0.7, height: 30 });
  }
  const cap = input.phone ? 22 : 36;
  if (motion && has(state, 'dj')) {
    const kick = Math.floor(state.beat);
    if (kick !== state.kick) {
      state.kick = kick;
      for (let n = 0; n < 3 && state.notes.length < cap; n++) {
        state.notes.push({ i: DJ.i, j: DJ.j, age: 0, life: 0.9, di: (n - 1) * 0.25, dj: -0.05 });
      }
    }
  }
  if (motion) {
    for (const arc of state.arcs) arc.age += dt;
    state.arcs = state.arcs.filter((arc) => arc.age < arc.dur);
    for (const note of state.notes) note.age += dt;
    state.notes = state.notes.filter((note) => note.age < note.life);
  }
  return state;
}

export function actPlace(member, state) {
  if (!member || member.id !== 'matt' || !state?.ride) return member;
  return { ...member, i: state.ride.i, j: state.ride.j, di: state.ride.di, dj: state.ride.dj, onMoped: true };
}

export function actLook(state, person, index) {
  const beat = state?.beat || 0;
  return {
    bob: has(state || { fx: new Set() }, 'dj') ? Math.pow(Math.max(0, Math.sin(beat * Math.PI)), 1.6) * 4.2 : 0,
  };
}

export function propOr(ctx, pack, key, x, y, h, paint, standIn) {
  const sprite = pack?.props?.[key];
  if (sprite && paint) paint(ctx, sprite, x, y, h);
  else standIn(ctx, x, y, h);
}

export function drawActMoped(ctx, x, y, s, pack, paint) {
  propOr(ctx, pack, 'moped', x, y, 42 * s, paint, (c, px, py, h) => {
    c.save();
    c.translate(px, py);
    c.scale(h / 42, h / 42);
    c.fillStyle = '#6e1630';
    c.fillRect(-16, -10, 28, 7);
    c.fillStyle = '#f4c66d';
    c.fillRect(8, -16, 8, 8);
    c.fillStyle = '#2a241f';
    c.beginPath();
    c.arc(-12, -2, 5, 0, Math.PI * 2);
    c.arc(12, -2, 5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  });
}

export function pushActs(ctx, env) {
  const { state, fit, pack, push, paint } = env;
  if (!state) return;
  const s = fit.s;
  if (state.fx.has('dj')) {
    const kick = Math.pow(Math.max(0, Math.sin((state.beat || 0) * Math.PI)), 1.6);
    push(DJ.i, DJ.j, () => {
      const [x, y] = fit.to(DJ.i, DJ.j);
      propOr(ctx, pack, 'dj', x, y, (58 + kick * 6) * s, paint, (c, px, py, h) => {
        c.save();
        c.translate(px, py);
        const k = h / 58;
        c.fillStyle = '#2a241f';
        c.fillRect(-18 * k, -16 * k, 36 * k, 14 * k);
        c.fillStyle = '#6e1630';
        c.fillRect(-16 * k, -28 * k, 8 * k, 14 * k);
        c.fillRect(8 * k, -30 * k, 8 * k, 16 * k);
        c.fillStyle = `rgba(244,198,109,${0.35 + kick * 0.55})`;
        c.beginPath();
        c.arc(-12 * k, -22 * k, (4 + kick * 3) * k, 0, Math.PI * 2);
        c.arc(12 * k, -24 * k, (4 + kick * 3) * k, 0, Math.PI * 2);
        c.fill();
        c.restore();
      });
    });
  }
  if (state.pitch > 0.04) {
    push(CREW.aaron.i, CREW.aaron.j, () => {
      const [x, y] = fit.to(CREW.aaron.i, CREW.aaron.j);
      const a = 0.22 * state.pitch;
      const grd = ctx.createLinearGradient(x, y - 150 * s, x, y);
      grd.addColorStop(0, `rgba(244,198,109,${a})`);
      grd.addColorStop(1, 'rgba(244,198,109,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(x, y - 8 * s);
      ctx.lineTo(x - 28 * s, y - 130 * s);
      ctx.lineTo(x + 28 * s, y - 130 * s);
      ctx.closePath();
      ctx.fill();
    }, -6);
  }
  for (const arc of state.arcs) {
    const p = arcAt(arc.from, arc.to, arc.age / arc.dur, arc.height);
    if (inClear(p.i, p.j, -0.2) && p.z < 8) continue;
    push(p.i, p.j, () => {
      const [x, y] = fit.to(p.i, p.j, p.z);
      ctx.fillStyle = '#e8b85a';
      ctx.fillRect(x - 4 * s, y - 2 * s, 8 * s, 3 * s);
      ctx.fillStyle = '#6fa34a';
      ctx.fillRect(x - 3 * s, y - 3 * s, 5 * s, 1.5 * s);
    });
  }
  for (const note of state.notes) {
    const u = smoothAct(note.age / note.life);
    const i = note.i + note.di * u;
    const j = note.j + note.dj * u;
    if (inClear(i, j, 0.1)) continue;
    push(i, j, () => {
      const [x, y] = fit.to(i, j, 20 + u * 28);
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = '#f4c66d';
      ctx.fillRect(x, y, 2.4 * s, 2.4 * s);
      ctx.globalAlpha = 1;
    });
  }
}
