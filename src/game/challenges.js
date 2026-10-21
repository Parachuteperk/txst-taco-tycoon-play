// Endless weeks rotate a challenge. The purse lands in the drawer as a bonus,
// not as taco revenue, so operating profit stays the lunch's own math.
// Nothing here runs during the four-week semester, and nothing draws RNG.

import { emit } from './events.js';
import { money, weekOf } from './util.js';

export function blankChallenges() {
  return {
    week: 0,
    id: null,
    progress: 0,
    failed: false,
    rewarded: false,
    notedDay: 0,
    badges: [],
  };
}

export function ensureChallenges(state) {
  if (!state.challenges) state.challenges = blankChallenges();
  const ch = state.challenges;
  if (!Array.isArray(ch.badges)) ch.badges = [];
  if (ch.progress == null) ch.progress = 0;
  if (ch.notedDay == null) ch.notedDay = 0;
  return ch;
}

export function activeChallenge(game) {
  if (!game.state.season?.endless) return null;
  const sem = game.config.semester || {};
  const weeks = sem.weeks || 4;
  const cal = weekOf(game.state.day, sem.daysPerWeek || 5);
  const index = cal.week - weeks;
  if (index < 1) return null;
  const cfg = game.config.challenges;
  const rotation = cfg?.rotation || [];
  if (!rotation.length) return null;
  const id = rotation[(index - 1) % rotation.length];
  const def = cfg?.[id];
  if (!def) return null;
  return { id, ...def };
}

export function syncChallengeWeek(game) {
  const ch = ensureChallenges(game.state);
  const def = activeChallenge(game);
  const cal = weekOf(game.state.day, game.config.semester?.daysPerWeek || 5);
  const id = def?.id || null;
  if (ch.week === cal.week && ch.id === id) return ch;
  ch.week = cal.week;
  ch.id = id;
  ch.progress = 0;
  ch.failed = false;
  ch.rewarded = false;
  ch.notedDay = 0;
  return ch;
}

function pay(game, def) {
  const ch = game.state.challenges;
  if (ch.rewarded) return;
  ch.rewarded = true;
  const cash = money(def.cash || 0);
  const day = game.state.dayLedger;
  if (day && cash > 0) {
    day.bonus = money((day.bonus || 0) + cash);
    game.state.cash = money(game.state.cash + cash);
  }
  ch.badges.push({
    id: def.id,
    textKey: def.badgeKey,
    week: ch.week,
    day: game.state.day,
    cash,
  });
  emit(game, {
    type: 'challenge',
    id: def.id,
    textKey: def.badgeKey,
    cash,
    week: ch.week,
    day: game.state.day,
    cue: 'challenge.pop',
  });
}

export function noteChallengeDay(game) {
  const ch = syncChallengeWeek(game);
  const def = activeChallenge(game);
  if (!def) return ch;
  const s = game.state;
  if (ch.notedDay === s.day) return ch;
  const day = s.dayLedger;
  if (!day) return ch;
  ch.notedDay = s.day;
  if (def.id === 'threeFloods') {
    const walkoffs = day.walkoffs || 0;
    if (day.bigRushId && walkoffs <= (def.maxWalkoffs ?? 0)) ch.progress += 1;
  } else if (def.id === 'noHacks') {
    if (day.hackId) ch.failed = true;
    else if (!ch.failed) ch.progress += 1;
  } else if (def.id === 'bandWeek') {
    ch.progress += day.tacos || 0;
  }
  if (!ch.rewarded && !ch.failed && ch.progress >= (def.target ?? Number.POSITIVE_INFINITY)) pay(game, def);
  return ch;
}
