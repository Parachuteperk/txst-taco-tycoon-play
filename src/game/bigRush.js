// A Big Rush is a crowd, not a fail state. One or two weekdays a week the cap
// lifts into the 50s, patience stretches so people stay and look like a line,
// and the hold, the call, and Antonio's agenda hack hit harder while it lasts.
// The weekday roll uses its own seed so the main rush RNG does not move.

import { activeChallenge } from './challenges.js';
import { emit } from './events.js';
import { crowdLineCap, managerMods } from './managerMath.js';
import { peopleAtStand, spawnCustomer } from './pipeline.js';
import { createRng, hashSeed } from './rng.js';
import { weekOf } from './util.js';

export function blankBigRush() {
  return {
    active: false,
    armed: false,
    id: null,
    textKey: null,
    cap: 0,
    waveLeft: 0,
    credit: 0,
    until: 0,
  };
}

export function lineCapNow(game) {
  const base = game.config.arrivals?.lineCap ?? 0;
  const br = game.state.bigRush;
  let cap = base;
  if (br?.active) cap = Math.max(base, br.cap || game.config.bigRush?.cap || base);
  else {
    const crowdCap = crowdLineCap(game);
    if (crowdCap) cap = crowdCap;
  }
  const scale = managerMods(game).line;
  return scale && scale !== 1 ? cap * scale : cap;
}

export function ensureWeekPlan(game) {
  const cal = weekOf(game.state.day, game.config.semester.daysPerWeek);
  const cfg = game.config.bigRush;
  if (!cfg?.enabled) {
    game.state.weekPlan = { week: cal.week, days: [], causes: [] };
    return game.state.weekPlan;
  }
  if (game.state.weekPlan?.week === cal.week && Array.isArray(game.state.weekPlan.days)) {
    return game.state.weekPlan;
  }
  if (Array.isArray(cfg.forceDays)) {
    const days = cfg.forceDays.slice();
    const causes = (cfg.forceCauses?.length ? cfg.forceCauses : days.map((_, i) => cfg.causes[i % cfg.causes.length].id)).slice();
    game.state.weekPlan = { week: cal.week, days, causes };
    return game.state.weekPlan;
  }
  const flood = activeChallenge(game);
  if (flood?.id === 'threeFloods' && flood.days?.length) {
    const days = flood.days.slice().sort((a, b) => a - b);
    const causes = days.map((_, i) => cfg.causes[i % cfg.causes.length].id);
    game.state.weekPlan = { week: cal.week, days, causes };
    return game.state.weekPlan;
  }
  const rng = createRng(hashSeed(`${game.seed}|big-rush|${cal.week}`));
  const span = Math.max(0, cfg.maxPerWeek - cfg.minPerWeek);
  let count = cfg.minPerWeek + (span ? rng.int(span + 1) : 0);
  count = Math.max(0, Math.min(game.config.semester.daysPerWeek, count));
  const pool = [];
  for (let d = 1; d <= game.config.semester.daysPerWeek; d++) pool.push(d);
  const days = [];
  for (let i = 0; i < count && pool.length; i++) days.push(pool.splice(rng.int(pool.length), 1)[0]);
  days.sort((a, b) => a - b);
  const causes = days.map(() => cfg.causes[rng.int(cfg.causes.length)].id);
  game.state.weekPlan = { week: cal.week, days, causes };
  return game.state.weekPlan;
}

export function armBigRush(game) {
  const cfg = game.config.bigRush;
  game.state.bigRush = blankBigRush();
  if (!cfg?.enabled) return;
  const plan = ensureWeekPlan(game);
  const cal = weekOf(game.state.day, game.config.semester.daysPerWeek);
  const idx = plan.days.indexOf(cal.dayOfWeek);
  if (idx < 0) return;
  const cause = cfg.causes.find((c) => c.id === plan.causes[idx]) || cfg.causes[0];
  game.state.bigRush = {
    ...blankBigRush(),
    armed: true,
    id: cause.id,
    textKey: cause.textKey,
    cap: cfg.cap,
    until: cfg.startAt + cfg.duration,
  };
}

function beginWave(game) {
  const cfg = game.config.bigRush;
  const br = game.state.bigRush;
  br.armed = false;
  br.active = true;
  br.waveLeft = cfg.wave;
  br.credit = 0;
  br.cap = cfg.cap;
  br.until = game.state.phaseT + cfg.duration;
  game.state.dayLedger.bigRushId = br.id;
  emit(game, {
    type: 'bigRush',
    kind: 'start',
    id: br.id,
    textKey: br.textKey,
    cap: br.cap,
    cue: 'crowd.roar',
  });
}

export function endBigRush(game) {
  const br = game.state.bigRush;
  if (!br?.active && !br?.armed) return;
  const was = br.active;
  const id = br.id;
  const textKey = br.textKey;
  game.state.bigRush = blankBigRush();
  if (!was) return;
  emit(game, { type: 'bigRush', kind: 'end', id, textKey: 'bigRush.end', cue: 'crowd.ease' });
}

// Antonio's class-agenda hack, fired while the flood is up, pours a few more
// students in. It does not start a second spectacle on a quiet day.
export function pourAgenda(game) {
  const cfg = game.config.bigRush;
  const br = game.state.bigRush;
  if (!cfg?.enabled || !br?.active) return false;
  br.waveLeft += cfg.agendaWave;
  br.cap = cfg.cap;
  emit(game, {
    type: 'bigRush',
    kind: 'agenda',
    id: br.id,
    textKey: 'bigRush.agenda',
    cap: br.cap,
    cue: 'crowd.roar',
  });
  return true;
}

export function stepBigRush(game, dt) {
  const cfg = game.config.bigRush;
  const br = game.state.bigRush;
  if (!cfg?.enabled || !br) return;
  const s = game.state;
  if (s.phase === 'rush' && br.armed && !br.active && s.phaseT + 1e-9 >= cfg.startAt) beginWave(game);
  if (br.active && br.waveLeft > 0 && s.phase === 'rush') {
    br.credit += dt * cfg.spawnRate;
    let guard = 0;
    while (br.credit >= 1 && br.waveLeft > 0 && guard++ < 8) {
      br.credit -= 1;
      if (peopleAtStand(s) >= (br.cap || cfg.cap)) {
        br.waveLeft = 0;
        break;
      }
      const spawned = spawnCustomer(game, { source: 'bigRush', respectCap: true });
      br.waveLeft -= 1;
      if (!spawned) {
        br.waveLeft = 0;
        break;
      }
    }
  }
  if (!br.active) return;
  const crowd = peopleAtStand(s);
  const linger = cfg.lingerAbove ?? 18;
  const floodDone = br.waveLeft <= 0 && s.phase === 'rush' && s.phaseT >= br.until;
  const leftRush = s.phase !== 'rush';
  if (leftRush || (floodDone && crowd <= linger)) endBigRush(game);
}
