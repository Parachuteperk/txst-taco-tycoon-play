// Jared's lockbox and the rare coin flip. Presentation only.
// Searched src/ (including src/game and the merged gameplay rules) for
// metalSettle, coinFlipChallenge, and coinFlipResult: the engine does not emit
// them. This module animates those payloads when they arrive, and the iso mock
// fires the same shapes only while view.customers / view.items / view.crew are
// not the engine's arrays. Flying coins here are not register cash.

import { CREW } from './world.js';

export const VAULT = { i: 10.85, j: 8.35 };
export const CHALLENGER_START = { i: 6.6, j: 15.4 };
export const CHALLENGER_SPOT = { i: 12.35, j: 11.85 };

const VAULT_CYCLE = 42;
const MARKS = [
  { at: 8, kind: 'good' },
  { at: 20, kind: 'bad' },
  { at: 30, kind: 'challenge' },
  { at: 33.1, kind: 'result' },
];

const STAND_WINS = new Set(['jared', 'stand', 'vault', 'house', 'sife', 'register']);
const CHALLENGER_WINS = new Set(['challenger', 'student', 'customer', 'visitor']);

export function isVaultEvent(ev) {
  return ev?.type === 'metalSettle' || ev?.type === 'coinFlipChallenge' || ev?.type === 'coinFlipResult';
}

export function blankVault() {
  return {
    metal: null,
    pose: null,
    watch: null,
    flip: null,
    challenger: null,
    payout: [],
    reaction: null,
    source: null,
  };
}

function clamp01(u) {
  return Math.min(1, Math.max(0, u));
}

// Smoothstep. Used for the coin's travel so the arc is not a straight lerp.
export function smoothstep(u) {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
}

export function poseEnvelope(u) {
  const t = clamp01(u);
  if (t === 0 || t === 1) return 0;
  return Math.sin(Math.PI * t);
}

export function metalFrom(event, view) {
  const candidates = [
    event?.metal,
    event?.holding,
    view?.vault?.metal,
    view?.jared?.metal,
    view?.metal,
    view?.manager?.vault?.metal,
    view?.manager?.metal,
  ];
  for (const raw of candidates) {
    const s = String(raw || '').toLowerCase();
    if (s === 'gold' || s === 'silver') return s;
  }
  return null;
}

export function settleIsGood(event) {
  if (!event) return null;
  if (typeof event.good === 'boolean') return event.good;
  if (typeof event.bad === 'boolean') return !event.bad;
  const raw = event.outcome ?? event.settle ?? event.quality;
  if (raw == null) return null;
  const s = String(raw).toLowerCase();
  if (s === 'good' || s === 'up' || s === 'win' || s === 'profit') return true;
  if (s === 'bad' || s === 'down' || s === 'loss' || s === 'lose') return false;
  return null;
}

export function settlePose(event) {
  if (!event || (event.type && event.type !== 'metalSettle')) return null;
  const good = settleIsGood(event);
  if (good === true) return 'hug';
  if (good === false) return 'facepalm';
  return null;
}

export function flipWinner(event) {
  if (!event) return null;
  if (typeof event.standWins === 'boolean') return event.standWins ? 'stand' : 'challenger';
  if (typeof event.jaredWins === 'boolean') return event.jaredWins ? 'stand' : 'challenger';
  const raw = event.winner ?? event.wonBy ?? event.who ?? event.side;
  if (raw == null) return null;
  const s = String(raw).toLowerCase();
  if (STAND_WINS.has(s)) return 'stand';
  if (CHALLENGER_WINS.has(s)) return 'challenger';
  return null;
}

export function payoutTarget(winner) {
  if (winner === 'stand') return { i: VAULT.i, j: VAULT.j, who: 'stand' };
  if (winner === 'challenger') return { i: CHALLENGER_SPOT.i, j: CHALLENGER_SPOT.j, who: 'challenger' };
  return null;
}

// Out and back with smoothstep, height on a sine bell. Not a linear tent.
export function coinArcPoint(u) {
  const t = clamp01(u);
  const travel = t < 0.5 ? smoothstep(t * 2) : smoothstep((1 - t) * 2);
  const height = t === 0 || t === 1 ? 0 : Math.sin(Math.PI * t);
  const frame = Math.floor(t * 18) % 6;
  return { travel, height, frame };
}

export function coinWorld(arc) {
  const travel = arc?.travel || 0;
  return {
    i: CREW.jared.i + (CHALLENGER_SPOT.i - CREW.jared.i) * 0.42 * travel,
    j: CREW.jared.j + (CHALLENGER_SPOT.j - CREW.jared.j) * 0.42 * travel,
    z: 30 + (arc?.height || 0) * 46,
    frame: arc?.frame || 0,
  };
}

export function payoutPoint(u, from, to) {
  const along = smoothstep(u);
  const height = Math.sin(Math.PI * clamp01(u));
  return {
    i: from.i + (to.i - from.i) * along,
    j: from.j + (to.j - from.j) * along,
    z: 18 + height * 28,
    frame: Math.floor(clamp01(u) * 12) % 6,
  };
}

export function payoutSprites(payout, now) {
  const target = payoutTarget(payout?.winner);
  if (!target) return [];
  const from = {
    i: (CREW.jared.i + CHALLENGER_SPOT.i) / 2,
    j: (CREW.jared.j + CHALLENGER_SPOT.j) / 2,
  };
  const sprites = [];
  for (let n = 0; n < 4; n++) {
    const start = payout.t + n * 0.07;
    const u = (now - start) / 0.8;
    if (u < 0 || u > 1) continue;
    sprites.push({ ...payoutPoint(u, from, target), winner: payout.winner });
  }
  return sprites;
}

export function challengerAt(ch, now) {
  if (!ch) return null;
  const arrive = 1.35;
  const age = now - ch.t;
  let e = 1;
  let moving = false;
  if (age < arrive) {
    e = smoothstep(age / arrive);
    moving = true;
  } else if (ch.leave != null && now >= ch.leave) {
    const back = Math.min(1, (now - ch.leave) / 1.2);
    e = 1 - smoothstep(back);
    moving = back < 1;
  }
  return {
    id: ch.id,
    i: CHALLENGER_START.i + (CHALLENGER_SPOT.i - CHALLENGER_START.i) * e,
    j: CHALLENGER_START.j + (CHALLENGER_SPOT.j - CHALLENGER_START.j) * e,
    moving,
  };
}

export function crewShown(member, vault, now) {
  let i = member.i;
  let j = member.j;
  let squash = 1;
  let kind = '';
  let env = 0;
  const pose = vault?.pose;
  if (member.id === 'jared' && pose && now >= pose.t && now < pose.until) {
    const dur = pose.until - pose.t || 1;
    env = poseEnvelope((now - pose.t) / dur);
    kind = pose.kind;
    if (kind === 'hug') {
      i += (VAULT.i - member.i) * 0.55 * env;
      j += (VAULT.j - member.j) * 0.55 * env;
      squash = 1 - 0.14 * env;
    } else if (kind === 'facepalm') {
      j += 0.04 * env;
      squash = 1 - 0.1 * env;
    }
    return { i, j, squash, kind, env };
  }
  const watch = vault?.watch;
  if (watch && now >= watch.t && now < watch.until) {
    const dur = watch.until - watch.t || 1;
    env = Math.sin(Math.PI * Math.min(1, (now - watch.t) / dur));
    const coin = watchFocus(vault, now);
    const di = coin.i - i;
    const dj = coin.j - j;
    const d = Math.hypot(di, dj) || 1;
    const amt = member.id === 'antonio' ? 0.03 : member.id === 'west' ? 0.05 : 0.09;
    i += (di / d) * amt * env;
    j += (dj / d) * amt * env;
    kind = 'watch';
  }
  return { i, j, squash, kind, env };
}

export function watchFocus(vault, now) {
  const flip = vault?.flip;
  if (flip && now >= flip.t && now < flip.until) {
    const u = (now - flip.t) / (flip.until - flip.t || 1);
    return coinWorld(coinArcPoint(u));
  }
  return {
    i: (CREW.jared.i + CHALLENGER_SPOT.i) / 2,
    j: (CREW.jared.j + CHALLENGER_SPOT.j) / 2,
    z: 36,
    frame: 0,
  };
}

export function reduceVault(state, events, t) {
  const next = {
    ...(state || blankVault()),
    payout: (state?.payout || []).slice(),
  };
  for (const ev of events || []) {
    if (ev?.type === 'metalSettle') {
      const metal = metalFrom(ev);
      if (metal) next.metal = metal;
      const pose = settlePose(ev);
      if (pose) next.pose = { kind: pose, t, until: t + (pose === 'hug' ? 0.85 : 0.7) };
      if (ev.source) next.source = ev.source;
    } else if (ev?.type === 'coinFlipChallenge') {
      next.watch = { t, until: t + 4.2 };
      next.flip = { t: t + 0.45, until: t + 1.7 };
      next.challenger = {
        id: ev.challengerId ?? ev.customerId ?? 1,
        t,
        leave: null,
      };
      if (ev.source) next.source = ev.source;
    } else if (ev?.type === 'coinFlipResult') {
      const winner = flipWinner(ev);
      if (winner) {
        next.reaction = {
          kind: winner === 'stand' ? 'cheer' : 'groan',
          t,
          until: t + 1.15,
          winner,
        };
        next.payout.push({ t, winner, id: ev.customerId || ev.challengerId || 0 });
      }
      if (next.watch) next.watch = { ...next.watch, until: Math.max(next.watch.until, t + 1.2) };
      if (next.challenger && next.challenger.leave == null) {
        next.challenger = { ...next.challenger, leave: t + 1.15 };
      }
      if (ev.source) next.source = ev.source;
    }
  }
  if (next.pose && t >= next.pose.until) next.pose = null;
  if (next.watch && t >= next.watch.until) next.watch = null;
  if (next.flip && t >= next.flip.until) next.flip = null;
  if (next.reaction && t >= next.reaction.until) next.reaction = null;
  next.payout = next.payout.filter((p) => t - p.t < 1.15);
  if (next.challenger && t - next.challenger.t > 6.5) next.challenger = null;
  return next;
}

function crossed(prev, now, mark, cycle) {
  if (prev == null || !(now > prev)) return false;
  const from = now - prev > 1.2 ? now - 0.05 : prev;
  const mod = (n, m) => ((n % m) + m) % m;
  const a0 = mod(from, cycle);
  const a1 = mod(now, cycle);
  if (a1 >= a0) return a0 < mark && a1 >= mark;
  return a0 < mark || a1 >= mark;
}

// Named mock. Rare on a 42s cycle: good settle, bad settle, then a flip.
export function mockVaultEvents(prev, now) {
  if (prev == null || !(now > prev)) return [];
  const events = [];
  const cycle = Math.floor(now / VAULT_CYCLE);
  for (const mark of MARKS) {
    if (!crossed(prev, now, mark.at, VAULT_CYCLE)) continue;
    if (mark.kind === 'good') {
      const metal = cycle % 2 ? 'silver' : 'gold';
      events.push({ type: 'metalSettle', metal, good: true, outcome: 'good', source: 'mock' });
    } else if (mark.kind === 'bad') {
      const metal = cycle % 2 ? 'gold' : 'silver';
      events.push({ type: 'metalSettle', metal, good: false, outcome: 'bad', source: 'mock' });
    } else if (mark.kind === 'challenge') {
      events.push({ type: 'coinFlipChallenge', challengerId: 9100 + (cycle % 16), source: 'mock' });
    } else if (mark.kind === 'result') {
      events.push({
        type: 'coinFlipResult',
        winner: cycle % 2 ? 'challenger' : 'jared',
        source: 'mock',
      });
    }
  }
  return events;
}

export function liveVaultEvents(input) {
  const bag = [...(input?.events || []), ...(input?.view?.events || [])];
  return bag.filter((ev) => isVaultEvent(ev) && ev.source !== 'mock');
}

export function eventsForWatch(engineOn, prev, now, liveEvents = []) {
  const live = (liveEvents || []).filter((ev) => isVaultEvent(ev) && ev.source !== 'mock');
  if (engineOn) return { source: 'engine', events: live };
  return { source: 'mock', events: [...mockVaultEvents(prev, now), ...live] };
}
