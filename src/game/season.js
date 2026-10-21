// Four class weeks, then the SIFE regional pitch. Week 1's ramp is identity.
// Later weeks raise demand, ingredient cost, menu price, overhead, regulars,
// and the chance Dale walks by on his own. After the Friday summary the
// semester is over; the next morning is endless and keeps the week-4 ramp.

import { emit } from './events.js';
import { money, weekOf } from './util.js';

export function blankSeason() {
  return {
    endless: false,
    complete: false,
    closedDay: 0,
    met: {},
    summary: null,
    records: blankRecords(),
  };
}

function blankRecords() {
  return {
    best: null,
    walkoffs: 0,
    fines: 0,
    bigRushes: 0,
    hacks: 0,
    tacos: 0,
    revenue: 0,
    profit: 0,
  };
}

export function ensureSeason(state) {
  if (!state.season) state.season = blankSeason();
  if (!state.season.met) state.season.met = {};
  if (!state.season.records) state.season.records = blankRecords();
  return state.season;
}

const IDENTITY = { demand: 1, patience: 1, cost: 1, price: 1, regularAdd: 0, overhead: 0, dale: 0 };

export function weekModifiers(game) {
  const sem = game.config.semester || {};
  const ramp = sem.ramp || {};
  const weeks = sem.weeks || 4;
  const cal = weekOf(game.state.day, sem.daysPerWeek || 5);
  let week = cal.week;
  if (week > weeks || game.state.season?.endless) week = weeks;
  const row = ramp[week] || ramp[String(week)] || ramp[1] || {};
  return {
    demand: row.demand ?? IDENTITY.demand,
    patience: row.patience ?? IDENTITY.patience,
    cost: row.cost ?? IDENTITY.cost,
    price: row.price ?? IDENTITY.price,
    regularAdd: row.regularAdd ?? IDENTITY.regularAdd,
    overhead: row.overhead ?? IDENTITY.overhead,
    dale: row.dale ?? IDENTITY.dale,
  };
}

export function gradeFor(cash, config) {
  const grades = config.semester?.grades || [];
  for (const grade of grades) {
    if (cash >= grade.min) return grade;
  }
  return grades[grades.length - 1] || { id: 'F', textKey: 'season.rank.f' };
}

export function noteSeasonDay(game) {
  const s = game.state;
  const season = ensureSeason(s);
  const day = s.dayLedger;
  if (!day?.settled || season.closedDay === s.day) return;
  season.closedDay = s.day;
  const sem = game.config.semester;
  const cal = weekOf(s.day, sem.daysPerWeek);
  const rec = season.records;
  rec.walkoffs += day.walkoffs || 0;
  rec.fines = money(rec.fines + (day.fines || 0));
  rec.tacos += day.tacos || 0;
  rec.revenue = money(rec.revenue + (day.revenue || 0));
  rec.profit = money(rec.profit + (day.profit || 0));
  rec.bigRushes += day.bigRushId ? 1 : 0;
  rec.hacks += day.hackId ? 1 : 0;
  if (!rec.best || day.profit > rec.best.profit) {
    rec.best = {
      day: s.day,
      dayName: cal.dayName,
      week: cal.week,
      profit: day.profit,
      tacos: day.tacos,
      revenue: day.revenue,
    };
  }
  for (const milestone of sem.milestones || []) {
    if (s.cash >= milestone.target) season.met[milestone.id] = true;
  }
  const weeks = sem.weeks || 4;
  const lastDay = weeks * sem.daysPerWeek;
  if (season.complete || season.endless || s.day !== lastDay) return;
  const grade = gradeFor(s.cash, game.config);
  const goalMet = s.cash >= sem.goal;
  season.summary = {
    grade: grade.id,
    gradeKey: grade.textKey,
    rankKey: grade.textKey,
    bestDay: rec.best,
    stats: {
      cash: s.cash,
      tacos: rec.tacos,
      revenue: rec.revenue,
      profit: rec.profit,
      walkoffs: rec.walkoffs,
      fines: rec.fines,
      bigRushes: rec.bigRushes,
      hacks: rec.hacks,
      days: s.lifetime.days,
    },
    goalMet,
    textKey: goalMet ? 'season.end.win' : 'season.end.done',
  };
  season.complete = true;
  emit(game, {
    type: 'seasonEnd',
    textKey: season.summary.textKey,
    grade: grade.id,
    rankKey: grade.textKey,
    cash: s.cash,
    goalMet,
    bestDay: rec.best?.day ?? null,
    cue: 'season.end',
  });
}

export function beginEndless(game) {
  const season = ensureSeason(game.state);
  if (season.complete && !season.endless) season.endless = true;
}
