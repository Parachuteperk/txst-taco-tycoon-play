import { upgradesMorning, upgradesEvening } from './upgrades.js';
import { emit } from './events.js';
import { blankLedger, cashBridge, computePnL, tortillasOnHand } from './economy.js';
import { awardShiftXp, checkCombos, clipboardCut } from './crew.js';
import { blankHack, blankInspector } from './hacks.js';
import { tierByNumber, refreshOutpostDay } from './outpost.js';
import {
  blankGolden, blankMods, blankStations, flushRemaining,
} from './pipeline.js';
import { armBigRush, endBigRush, ensureWeekPlan } from './bigRush.js';
import { touchAchievements } from './achievements.js';
import { beginDeckDay, resolveOpenCards } from './deck.js';
import { difficultyMods } from './difficulty.js';
import { blankPacing } from './pacing.js';
import { noteSeasonDay, weekModifiers } from './season.js';
import { noteChallengeDay, syncChallengeWeek } from './challenges.js';
import { scheduleStory } from './story.js';
import { blankWest, scheduleWest } from './west.js';
import { applyDrawer, ensureManager, finishManagerDay, prepareBoard, resetManagerMorning } from './manager.js';
import { formatClock, money, weekOf } from './util.js';
import { initBodies } from '../sim/layout.js';

export function clockOf(state, config) {
  const phase = config.phases[state.phase];
  let mins = phase.clockEnd;
  if (state.phase !== 'summary' && phase.seconds > 0) {
    const u = Math.min(1, Math.max(0, state.phaseT / phase.seconds));
    mins = phase.clockStart + (phase.clockEnd - phase.clockStart) * u;
  }
  return { minutes: Math.round(mins * 10) / 10, label: formatClock(mins) };
}

export function beginDay(game, first) {
  ensureManager(game.state, game.config);
  resetManagerMorning(game);
  const s = game.state;
  if (!first) {
    s.day += 1;
    s.suspicion = Math.max(0, s.suspicion - game.config.hacks.dailyDecay);
  }
  s.step = 0;
  s.t = 0;
  s.phase = 'preopen';
  s.phaseSteps = 0;
  s.phaseT = 0;
  s.line = [];
  s.customers = [];
  if (game.config.quadFlow) s.quadCrew = null;
  s.items = [];
  s.stations = blankStations();
  s.schedule = [];
  s.arrivalCredit = 0;
  s.mods = blankMods();
  s.timed = [];
  s.hack = blankHack();
  s.call = { used: false, choice: null };
  s.west = blankWest();
  s.golden = blankGolden();
  s.combo = { count: 0, lastHitAt: -999 };
  s.inspector = blankInspector();
  s.holding = false;
  s.bottleneck = 'grill';
  s.prepPause = 0;
  s.grillStall = 0;
  s.serveStall = 0;
  s.sinceServe = 99;
  s.preppedBuffer = 0;
  s.stockout = false;
  s.throughput = { register: 0, prep: 0, grill: 0, assemble: 0, serve: 0 };
  s.closingBeatIndex = 0;
  if (!s.nextId) s.nextId = 1;
  initBodies(s);
  s.bigRush = { active: false, armed: false, id: null, textKey: null, cap: 0, waveLeft: 0, credit: 0, until: 0 };
  s.pacing = blankPacing();
  syncChallengeWeek(game);
  ensureWeekPlan(game);
  prepareBoard(game);
  beginDeckDay(game);
  refreshOutpostDay(game);
  upgradesMorning(game, (e) => emit(game, e));
  s.dayLedger = blankLedger(s.cash, tortillasOnHand(s));
  const cal = weekOf(s.day, game.config.semester.daysPerWeek);
  emit(game, { type: 'dayStart', textKey: 'day.start', week: cal.week, dayName: cal.dayName });
  emit(game, { type: 'phaseChange', phase: 'preopen', textKey: 'phase.preopen' });
  touchAchievements(game);
}

export function settleDay(game) {
  const s = game.state;
  const day = s.dayLedger;
  if (day.settled) return day;
  const wage = s.outpost ? (tierByNumber(game.config, s.outpost.tier)?.wage || 0) : 0;
  const weekOverhead = weekModifiers(game).overhead || 0;
  const rawOverhead = Math.max(0, game.config.economy.overhead + wage + weekOverhead - clipboardCut(s, game.config));
  day.overhead = money(rawOverhead * difficultyMods(game).overhead);
  s.cash = money(s.cash - day.overhead);
  day.tortillasEnd = tortillasOnHand(s);
  const report = computePnL(day, game.config.economy);
  day.cogs = report.cogs;
  day.profit = report.profit;
  day.premium = report.premium;
  applyDrawer(game);
  day.settled = true;
  s.lifetime.revenue = money(s.lifetime.revenue + day.revenue);
  s.lifetime.profit = money(s.lifetime.profit + day.profit);
  s.lifetime.tacos += day.tacos;
  s.lifetime.days += 1;
  upgradesEvening(game, (e) => emit(game, e));
  return day;
}

export function enterPhase(game, phase) {
  const s = game.state;
  if (!game.config.phaseOrder.includes(phase)) return;
  if (phase === 'summary' && s.dayLedger?.settled) return;
  s.phase = phase;
  s.phaseSteps = 0;
  s.phaseT = 0;
  emit(game, { type: 'phaseChange', phase, textKey: `phase.${phase}` });
  if (phase === 'telegraph') {
    emit(game, {
      type: 'rushTelegraph',
      textKey: 'rush.telegraph',
      rushIn: game.config.phases.telegraph.seconds,
      cue: 'bell.telegraph',
    });
  }
  if (phase === 'rush') {
    s.mods = blankMods();
    s.hack = blankHack();
    s.call = { used: false, choice: null };
    s.west = blankWest();
    s.timed = [];
    s.golden = blankGolden();
    s.golden.nextAt = s.t + game.config.golden.firstAt;
    s.combo = { count: 0, lastHitAt: -999 };
    s.preppedBuffer = s.crew.phillip.perks.includes('miseEnPlace') ? game.config.crew.miseCount : 0;
    s.closingBeatIndex = 0;
    scheduleWest(game);
    scheduleStory(game);
    armBigRush(game);
  }
  if (phase === 'closing') {
    endBigRush(game);
    s.mods = blankMods();
    s.timed = [];
    s.hack.demandAdd = 0;
    s.hack.guac = false;
    s.closingBeatIndex = 0;
  }
  if (phase === 'summary') {
    resolveOpenCards(game);
    flushRemaining(game);
    noteChallengeDay(game);
    const day = settleDay(game);
    awardShiftXp(game);
    checkCombos(game);
    const cal = weekOf(s.day, game.config.semester.daysPerWeek);
    emit(game, {
      type: 'dayEnd',
      week: cal.week,
      dayName: cal.dayName,
      revenue: day.revenue,
      food: day.food,
      tips: day.tips,
      cogs: day.cogs,
      overhead: day.overhead,
      fines: day.fines,
      profit: day.profit,
      purchases: day.purchases,
      capex: day.capex,
      cash: s.cash,
      cashStart: day.cashStart,
      tacos: day.tacos,
      walkoffs: day.walkoffs,
      walkBys: day.walkBys,
      goldenHit: day.goldenHit,
      goldenMiss: day.goldenMiss,
      bestCombo: day.bestCombo,
      holdSeconds: day.holdSeconds,
      peakLine: day.peakLine,
      bigRushId: day.bigRushId,
      hackId: day.hackId,
      hackBackfire: day.hackBackfire,
      callId: day.callId,
      westChoice: day.westChoice,
      outpostSold: day.outpostSold,
      outpostRestocks: day.outpostRestocks,
      outpostRevenue: day.outpostRevenue,
      suspicion: s.suspicion,
      storyKey: day.storyKey,
      tortillas: s.inventory.tortillas,
      textKey: day.storyKey || 'day.summary.line',
      cue: 'day.dusk',
      goal: {
        id: game.config.semester.goalId,
        target: game.config.semester.goal,
        cash: s.cash,
        met: s.cash >= game.config.semester.goal,
      },
    });
    if (!s.goalAnnounced && s.cash >= game.config.semester.goal) {
      s.goalAnnounced = true;
      emit(game, {
        type: 'goalReached',
        textKey: game.config.semester.goalKey,
        target: game.config.semester.goal,
        cash: s.cash,
        cue: 'goal.reached',
      });
    }
    noteSeasonDay(game);
    touchAchievements(game);
    finishManagerDay(game);
  }
}

export function stepClosing(game) {
  if (game.state.phase !== 'closing') return;
  const beats = game.config.closingBeats;
  while (game.state.closingBeatIndex < beats.length && game.state.phaseT >= beats[game.state.closingBeatIndex].t - 1e-9) {
    const beat = beats[game.state.closingBeatIndex];
    game.state.closingBeatIndex += 1;
    emit(game, { type: 'closingBeat', who: beat.who, textKey: beat.textKey, cue: 'closing.beat' });
  }
}

export { cashBridge };
