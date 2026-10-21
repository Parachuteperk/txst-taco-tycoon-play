import { emit } from './events.js';
import { bumpStat } from './achievements.js';
import { attachWestCard, noteWestChoice } from './deck.js';
import { noteDecision } from './pacing.js';

export function blankWest() {
  return {
    spawned: false,
    at: null,
    status: 'idle',
    choiceOpen: false,
    choiceUntil: 0,
    adviceKey: null,
    buff: null,
    buffUntil: 0,
  };
}

export function scheduleWest(game) {
  const w = game.config.west;
  if (!w.enabled) {
    game.state.west.at = null;
    return;
  }
  const span = w.atMax - w.atMin;
  game.state.west.at = w.atMin + (span > 0 ? game.rng.next() * span : 0);
}

export function adviceKeyFor(game) {
  const s = game.state;
  if (s.line.length >= game.config.west.queueAdviceAt) return 'west.advice.queue';
  if (s.bottleneck === 'grill') return 'west.advice.grill';
  return 'west.advice.wave';
}

export function arriveWest(game) {
  const s = game.state;
  const w = game.config.west;
  s.west.spawned = true;
  s.west.status = 'present';
  s.west.choiceOpen = true;
  s.west.choiceUntil = s.t + w.choiceWindow;
  s.west.adviceKey = adviceKeyFor(game);
  s.grillStall = w.pinchStall;
  emit(game, {
    type: 'westArrives',
    textKey: 'west.arrive',
    adviceKey: s.west.adviceKey,
    cue: 'west.entrance',
  });
  emit(game, { type: 'westPinch', textKey: 'west.pinch', cue: 'west.pinch', stall: w.pinchStall });
  attachWestCard(game);
}

export function stepWest(game) {
  const s = game.state;
  const w = s.west;
  if (s.phase === 'rush' && !w.spawned && w.at != null && s.phaseT >= w.at - 1e-9) arriveWest(game);
  if (w.choiceOpen && s.t >= w.choiceUntil - 1e-9) chooseWest(game, 'redirect', true);
}

export function chooseWest(game, choice, auto = false) {
  const s = game.state;
  if (!s.west.choiceOpen) return { ok: false, reason: 'not-open' };
  if (choice !== 'takeAdvice' && choice !== 'redirect') return { ok: false, reason: 'unknown-choice' };
  const cfg = game.config.west;
  s.west.choiceOpen = false;
  s.west.status = 'done';
  s.dayLedger.westChoice = choice;
  if (choice === 'takeAdvice') {
    s.west.buff = 'advice';
    s.west.buffUntil = s.t + cfg.adviceDuration;
    s.story.trust += cfg.adviceTrust;
    const ahead = Math.min(game.config.phases.rush.seconds, s.phaseT + cfg.forecastLook);
    let forecast = game.config.arrivals.rush[game.config.arrivals.rush.length - 1].rate;
    for (const row of game.config.arrivals.rush) {
      if (ahead < row.until) { forecast = row.rate; break; }
    }
    emit(game, {
      type: 'westAdvice',
      textKey: s.west.adviceKey,
      forecastRate: forecast,
      cue: 'west.advice',
    });
  } else {
    s.grillStall = Math.min(s.grillStall, cfg.redirectStall);
    for (const c of s.line) if (c && c.patience != null) c.patience += cfg.cookiePatience;
    for (const name of game.config.stationOrder) {
      for (const c of s.stations[name].queue) {
        if (c && c.patience != null) c.patience += cfg.cookiePatience * cfg.cookieQueueScale;
      }
    }
    for (const c of s.customers || []) {
      if (c && c.patience != null && (c.state === 'waiting' || c.state === 'ordering')) {
        c.patience += cfg.cookiePatience * cfg.cookieQueueScale;
      }
    }
    s.story.trust += cfg.cookieTrust;
    emit(game, { type: 'westCookies', textKey: 'west.cookies', cue: 'west.cookies' });
  }
  emit(game, {
    type: 'westChoice',
    choice,
    auto,
    textKey: choice === 'takeAdvice' ? 'west.choice.take' : 'west.choice.redirect',
  });
  noteWestChoice(game, choice);
  if (!auto) {
    noteDecision(game);
    if (choice === 'takeAdvice') bumpStat(game, 'advice');
  }
  return { ok: true };
}

export function adviceActive(state) {
  return state.west.buff === 'advice' && state.t < state.west.buffUntil;
}
