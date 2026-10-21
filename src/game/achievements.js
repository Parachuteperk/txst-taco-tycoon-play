// Twenty Quad badges. Progress is saved on the state. Unlocking does not move cash.

import { emit } from './events.js';

const BAND = new Set(['bandPractice', 'sectionals', 'fightSong']);
const RAIN = new Set(['rain', 'downpour', 'drizzle']);
const FINALS = new Set(['finalsLibrary', 'finalsQuad', 'groupProject']);

export function blankAchievements() {
  return { unlocked: {}, progress: {}, stats: {} };
}

export function ensureAchievements(state) {
  if (!state.achievements) state.achievements = blankAchievements();
  if (!state.achievements.unlocked) state.achievements.unlocked = {};
  if (!state.achievements.progress) state.achievements.progress = {};
  if (!state.achievements.stats) state.achievements.stats = {};
  return state.achievements;
}

export function bumpStat(game, key, amount = 1) {
  const stats = ensureAchievements(game.state).stats;
  stats[key] = (stats[key] || 0) + amount;
  touchAchievements(game);
}

export function touchAchievements(game) {
  const defs = game.config.achievements || [];
  const board = ensureAchievements(game.state);
  const values = liveStats(game, board.stats);
  for (const def of defs) {
    const value = values[def.stat] || 0;
    board.progress[def.id] = value;
    if (value >= def.target && !board.unlocked[def.id]) {
      board.unlocked[def.id] = { day: game.state.day, t: game.state.t };
      emit(game, {
        type: 'achievement',
        id: def.id,
        textKey: def.textKey,
        day: game.state.day,
        cue: 'achievement.pop',
      });
    }
  }
}

function liveStats(game, stats) {
  const s = game.state;
  const day = s.dayLedger || {};
  const card = s.deck?.campus?.id;
  if ((day.peakLine || 0) > (stats.bestPeak || 0)) stats.bestPeak = day.peakLine;
  if ((day.goldenHit || 0) > (stats.bestGolden || 0)) stats.bestGolden = day.goldenHit;
  if ((day.walkBys || 0) > (stats.bestWalkBys || 0)) stats.bestWalkBys = day.walkBys;
  if (BAND.has(card) && (day.tacos || 0) > (stats.bandTacos || 0)) stats.bandTacos = day.tacos;
  if (RAIN.has(card) && (day.tacos || 0) > (stats.rainTacos || 0)) stats.rainTacos = day.tacos;
  if (FINALS.has(card) && (day.tacos || 0) > (stats.finalsTacos || 0)) stats.finalsTacos = day.tacos;
  if (s.outpost?.spot === 'stallions') stats.stallionSold = s.outpost.lifetimeSold || 0;
  if (day.settled && stats.closedDay !== s.day) {
    stats.closedDay = s.day;
    stats.cleanStreak = s.inspector?.seenToday ? 0 : (stats.cleanStreak || 0) + 1;
    if ((day.holdSeconds || 0) < 1 && day.profit > 0) stats.pockets = 1;
    if (day.bigRushId && day.profit > 0 && (day.peakLine || 0) >= 50) stats.captain = 1;
  }
  const maya = !!(s.story?.maya?.done || day.storyKey === 'maya.day3.payoff');
  return {
    days: s.lifetime?.days || 0,
    tacos: s.lifetime?.tacos || 0,
    cash: s.cash || 0,
    bandTacos: stats.bandTacos || 0,
    advice: stats.advice || 0,
    cleanStreak: stats.cleanStreak || 0,
    bestPeak: stats.bestPeak || 0,
    hired: s.outpost ? 1 : 0,
    outpostTier: s.outpost?.tier || 0,
    agenda: stats.agenda || 0,
    bestGolden: stats.bestGolden || 0,
    assembly: s.combosUnlocked?.includes('assemblyLine') ? 1 : 0,
    pockets: stats.pockets || 0,
    bestWalkBys: stats.bestWalkBys || 0,
    maya: maya ? 1 : 0,
    stallionSold: stats.stallionSold || 0,
    rainTacos: stats.rainTacos || 0,
    finalsTacos: stats.finalsTacos || 0,
    captain: stats.captain || 0,
    gradeA: s.season?.summary?.grade === 'A' ? 1 : 0,
  };
}
