// Standing policies run the lunch. The player plans between days.
// While manager.auto is off, none of this touches the rush, so the old
// unit tests still drive a single hack or a single call by hand.

import { emit } from './events.js';
import { choosePerk } from './crew.js';
import { chooseEvent, safeChoiceId } from './deck.js';
import { payCapex } from './economy.js';
import { hireOutpost } from './outpost.js';
import { chooseBeat } from './pacing.js';
import { callTheLine, restock, tapGolden } from './pipeline.js';
import { startHack } from './hacks.js';
import { chooseWest } from './west.js';
import { crewEfficiency, crewForStation, forecastFit, houseItem, managerMods, rivalSteal, visualCrowdCount } from './managerMath.js';
import { createRng, hashSeed } from './rng.js';
import { formatClock, money, weekOf } from './util.js';

export { crewEfficiency, crewForStation, houseItem, managerMods };

export const STAFF_IDS = ['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west'];

const ROLES = {
  jared: { role: 'cashier', station: 'register' },
  phillip: { role: 'prep', station: 'prep' },
  ali: { role: 'grill', station: 'grill' },
  matt: { role: 'runner', station: 'serve' },
  aaron: { role: 'manager', station: 'assemble' },
  antonio: { role: 'hacker', station: null },
  west: { role: 'advisor', station: null },
};

const STATION_TASK = {
  register: 'ringing',
  prep: 'folding',
  grill: 'grilling',
  assemble: 'assembling',
  serve: 'running',
};

function blankStrategy() {
  return {
    price: 'fair',
    portion: 'regular',
    focus: 'balance',
    line: 'cap',
    hack: 'low',
    hold: 'off',
    call: 'off',
    west: 'redirect',
    cards: 'safe',
    golden: true,
    restock: 'default',
  };
}

function blankStaff(tune) {
  const morale = tune?.morale?.start ?? 78;
  const fatigue = tune?.fatigue?.start ?? 6;
  const staff = {};
  for (const id of STAFF_IDS) {
    staff[id] = {
      role: ROLES[id].role,
      station: ROLES[id].station,
      shift: true,
      morale: tune?.morale?.person?.[id] ?? morale,
      fatigue: tune?.fatigue?.person?.[id] ?? fatigue,
      perkQueued: null,
    };
  }
  return staff;
}

function blankFinance() {
  return { warned: false, bailout: false, failed: false, loan: 0 };
}

function blankMenu(tune) {
  const items = (tune?.menu || []).map((item) => ({ ...item }));
  return {
    featured: 'quad',
    enabled: ['quad', 'street'],
    items,
  };
}

export function blankManager(config) {
  const tune = config?.manager;
  return {
    engaged: false,
    auto: false,
    holding: false,
    morning: false,
    hacked: false,
    called: false,
    hireOutpost: false,
    boost: 0,
    tipBoost: 1,
    speed: 1,
    strategy: blankStrategy(),
    staff: blankStaff(tune),
    menu: blankMenu(tune),
    upgrades: { grill: 0, register: 0, neon: 0, tipJar: 0, secondCooler: 0 },
    locations: ['stallions', 'alkek'],
    marketing: {
      flyers: false,
      social: false,
      gameDay: false,
      spent: 0,
      returned: 0,
      today: 0,
    },
    history: [],
    report: null,
    dev: { grillTech: 0, prepLine: 0, marketingReach: 0, antonioSoft: 0 },
    project: null,
    forecast: null,
    forecastNext: null,
    forecastToday: null,
    rivalToday: null,
    announced: false,
    telemetry: [],
    telemetryBucket: null,
    results: [],
    standings: null,
    saleFeed: 0,
    reputation: tune?.reputation?.origin ?? 20,
    finance: blankFinance(),
    goals: {},
  };
}

export function ensureManager(state, config) {
  if (!state.manager) state.manager = blankManager(config);
  const m = state.manager;
  if (!m.strategy) m.strategy = blankStrategy();
  if (!m.staff) m.staff = blankStaff(config?.manager);
  for (const id of STAFF_IDS) {
    if (!m.staff[id]) m.staff[id] = { ...blankStaff(config?.manager)[id] };
  }
  if (!m.menu) m.menu = blankMenu(config?.manager);
  if (!m.upgrades) m.upgrades = { grill: 0, register: 0, neon: 0, tipJar: 0, secondCooler: 0 };
  if (!Array.isArray(m.locations)) m.locations = ['stallions', 'alkek'];
  if (!m.marketing) m.marketing = { flyers: false, social: false, gameDay: false, spent: 0, returned: 0, today: 0 };
  if (!Array.isArray(m.history)) m.history = [];
  if (!m.dev) m.dev = { grillTech: 0, prepLine: 0, marketingReach: 0, antonioSoft: 0 };
  if (m.project === undefined) m.project = null;
  if (!Array.isArray(m.telemetry)) m.telemetry = [];
  if (!Array.isArray(m.results)) m.results = [];
  if (!Array.isArray(state.liveFeed)) state.liveFeed = [];
  if (m.reputation == null) m.reputation = config?.manager?.reputation?.origin ?? 20;
  if (!m.finance) m.finance = blankFinance();
  if (!m.goals) m.goals = {};
  return m;
}

export function resetManagerMorning(game) {
  const m = game.state.manager;
  if (!m) return;
  m.morning = false;
  m.hacked = false;
  m.called = false;
  m.boost = 0;
  m.tipBoost = 1;
  m.promoLeft = 0;
  m.marketing.today = 0;
  m.announced = false;
  m.telemetry = [];
  m.telemetryBucket = null;
  m.saleFeed = 0;
  m.tickerAt = -999;
  game.state.liveFeed = [];
  const tune = game.config.manager;
  if (!tune || !m.engaged) return;
  for (const id of STAFF_IDS) {
    const staff = m.staff[id];
    staff.fatigue = Math.max(0, staff.fatigue - tune.fatigue.rest);
  }
}

function pickWeighted(rng, ids, weights) {
  let roll = rng.next() * weights.reduce((n, w) => n + w, 0);
  for (let i = 0; i < ids.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return ids[i];
  }
  return ids[ids.length - 1];
}

function buildForecast(game, week) {
  const tune = game.config.manager.forecast;
  const rng = createRng(hashSeed(`${game.seed}|forecast|${week}`));
  const heavy = [];
  const nHeavy = rng.chance(tune.twoHeavy) ? 2 : 1;
  while (heavy.length < nHeavy) {
    const dow = 1 + rng.int(5);
    if (!heavy.includes(dow)) heavy.push(dow);
  }
  const days = [];
  for (let dow = 1; dow <= 5; dow += 1) {
    const weather = pickWeighted(rng, ['clear', 'hot', 'rain', 'wind'], tune.weather);
    let crowd = heavy.includes(dow) ? 'heavy' : (rng.chance(tune.light) ? 'light' : 'steady');
    if (crowd === 'heavy' && rng.chance(tune.miss)) crowd = 'steady';
    if (crowd !== 'heavy' && rng.chance(tune.falseAlarm)) crowd = 'heavy';
    let dale = rng.next() < 0.55 ? 'low' : rng.next() < 0.65 ? 'med' : 'high';
    if ((game.state.suspicion || 0) >= tune.daleSuspicion && dale === 'low') dale = 'med';
    let event = 'quiet';
    if (crowd === 'heavy') event = ['gameDay', 'band', 'exam'][rng.int(3)];
    else if (crowd === 'steady' && rng.chance(0.25)) event = 'club';
    days.push({
      day: (week - 1) * game.config.semester.daysPerWeek + dow,
      dayOfWeek: dow,
      dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][dow - 1],
      weather,
      crowd,
      dale,
      event,
    });
  }
  return { week, days };
}

function rollRival(game) {
  const tune = game.config.manager.rival;
  const rng = createRng(hashSeed(`${game.seed}|rival|${game.state.day}`));
  const nameKey = `rival.${tune.id}`;
  if (!rng.chance(tune.chance)) return { present: false, id: tune.id, nameKey, price: 0, speed: 1, steal: 0 };
  const price = money(tune.priceMin + rng.next() * (tune.priceMax - tune.priceMin));
  const speed = Math.round((tune.speedMin + rng.next() * (tune.speedMax - tune.speedMin)) * 100) / 100;
  return { present: true, id: tune.id, nameKey, price, speed, steal: 0 };
}

export function prepareBoard(game) {
  const m = ensureManager(game.state, game.config);
  const cal = weekOf(game.state.day, game.config.semester.daysPerWeek);
  if (m.forecastNext?.week === cal.week) {
    m.forecast = m.forecastNext;
    m.forecastNext = null;
  }
  if (!m.forecast || m.forecast.week !== cal.week) m.forecast = buildForecast(game, cal.week);
  m.forecastToday = m.forecast.days.find((row) => row.dayOfWeek === cal.dayOfWeek) || null;
  m.rivalToday = rollRival(game);
}

function activePairs(game) {
  const pairs = game.config.manager?.chemistry?.pairs || [];
  const staff = game.state.manager?.staff || {};
  return pairs.filter((pair) => pair.ids.every((id) => staff[id]?.shift));
}

function announceBoard(game) {
  const m = game.state.manager;
  if (m.announced) return;
  m.announced = true;
  const today = m.forecastToday;
  if (today) {
    emit(game, {
      type: 'forecast',
      textKey: `forecast.card.${today.crowd}`,
      weather: today.weather,
      dale: today.dale,
      event: today.event,
      cue: 'deck.card',
    });
  }
  emit(game, {
    type: 'rival',
    textKey: m.rivalToday?.present ? 'rival.arrive' : 'rival.quiet',
    id: m.rivalToday?.id || null,
    cue: 'crowd.pass',
  });
  const pair = activePairs(game)[0];
  if (pair) emit(game, { type: 'morale', textKey: pair.textKey, id: pair.id, cue: 'combo.hit' });
}

function stepTicker(game) {
  const m = game.state.manager;
  const every = game.config.manager?.tickerSeconds || 8;
  if (game.state.t - (m.tickerAt || 0) < every) return;
  m.tickerAt = game.state.t;
  const keys = ['manager.tick.quiet', 'manager.tick.cash', 'manager.tick.grill'];
  if ((game.state.line?.length || 0) >= 6) keys.push('manager.tick.line');
  if (m.rivalToday?.present) keys.push('manager.tick.rival');
  const slot = Math.floor(game.state.t / every);
  emit(game, { type: 'ticker', textKey: keys[slot % keys.length], cue: 'crowd.pass' });
}

export function sampleTelemetry(game) {
  const m = game.state.manager;
  const tune = game.config.manager;
  const phase = game.config.phases[game.state.phase];
  if (!m || !tune || !phase || game.state.phase === 'summary') return;
  let mins = phase.clockEnd;
  if (phase.seconds > 0) {
    const u = Math.min(1, Math.max(0, game.state.phaseT / phase.seconds));
    mins = phase.clockStart + (phase.clockEnd - phase.clockStart) * u;
  }
  const bucket = Math.floor(mins / (tune.telemetryMinutes || 10));
  if (m.telemetryBucket === bucket && m.telemetry.length > 0) return;
  m.telemetryBucket = bucket;
  const simMin = (game.state.t || 0) / 60;
  const tacos = game.state.dayLedger?.tacos || 0;
  m.telemetry.push({
    t: Math.round((game.state.t || 0) * 100) / 100,
    clock: formatClock(mins),
    minutes: Math.round(mins),
    tacosPerMin: simMin > 1 / 60 ? Math.round((tacos / simMin) * 10) / 10 : 0,
    line: game.state.line?.length || 0,
    cash: game.state.cash,
  });
  const cap = tune.telemetryCap || 18;
  if (m.telemetry.length > cap) m.telemetry.splice(0, m.telemetry.length - cap);
}

function spendMarketing(game) {
  const m = game.state.manager;
  const tune = game.config.manager;
  const s = game.state;
  const crowd = m.forecastToday?.crowd || 'steady';
  const big = s.weekPlan?.days?.includes(weekOf(s.day, game.config.semester.daysPerWeek).dayOfWeek);
  const flags = [
    ['flyers', true],
    ['social', true],
    // Game-day ads fit a heavy card or a real Big Rush. A light Tuesday does not.
    ['gameDay', crowd === 'heavy' || !!big],
  ];
  let demand = 0;
  let tip = 1;
  let spent = 0;
  for (const [id, on] of flags) {
    if (!on || !m.marketing[id]) continue;
    const row = tune.marketing[id];
    if (s.cash < row.cost) continue;
    s.cash = money(s.cash - row.cost);
    spent = money(spent + row.cost);
    let scale = crowd === 'heavy' ? 1.35 : crowd === 'light' ? 0.32 : 1;
    if (id === 'gameDay' && crowd !== 'heavy' && !big) scale *= 0.4;
    demand += (row.demand || 0) * scale;
    if (row.tip) tip *= row.tip;
  }
  s.dayLedger.marketing = money((s.dayLedger.marketing || 0) + spent);
  m.marketing.today = spent;
  m.marketing.spent = money(m.marketing.spent + spent);
  m.boost = demand;
  m.tipBoost = tip;
  const levels = (m.upgrades?.grill || 0) + (m.dev?.grillTech || 0);
  const tray = tune.marketing?.tray ?? 0;
  m.promoLeft = levels > 0 && demand > 0 ? Math.max(0, Math.round(levels * demand * tray)) : 0;
  s.promoCredit = 0;
  if (demand > 0) {
    // Ads buy a little patience. The promo tray is what turns a fitting buy into sales,
    // and it stays shut until the grill can cook past the rope.
    s.timed.push({ demandAdd: demand, patienceDrain: -0.22, until: s.t + 999 });
    emit(game, { type: 'marketing', textKey: 'manager.marketing', cue: 'crowd.pass' });
  }
}

function applyMorning(game) {
  const m = game.state.manager;
  const s = game.state;
  if (m.strategy.price && game.config.economy.prices[m.strategy.price]) s.priceBand = m.strategy.price;
  const table = game.config.manager.restock[m.strategy.restock] || game.config.manager.restock.default;
  const big = s.weekPlan?.days?.includes(weekOf(s.day, game.config.semester.daysPerWeek).dayOfWeek);
  const target = big ? table.big : (s.outpost ? table.outpost : table.normal);
  if (s.inventory.tortillas < target) restock(game, target - s.inventory.tortillas);
  spendMarketing(game);
  m.morning = true;
  announceBoard(game);
}

function resolveNews(game) {
  const m = game.state.manager;
  const wait = game.config.manager.interveneSeconds;
  const s = game.state;
  for (const name of ['campus', 'dale']) {
    const card = s.deck?.[name];
    if (!card?.open || card.choice) continue;
    if (card.resolveAt == null) {
      card.resolveAt = s.t + wait;
      continue;
    }
    if (s.t + 1e-9 < card.resolveAt) continue;
    const id = m.strategy.cards === 'loud'
      ? loudChoiceId(game, name, card)
      : safeChoiceId(game, name, card);
    if (id) chooseEvent(game, name, id, true);
  }
  const west = s.west;
  if (west?.choiceOpen) {
    if (west.interveneAt == null) {
      west.interveneAt = s.t + wait;
    } else if (s.t + 1e-9 >= west.interveneAt) {
      const choice = m.strategy.west === 'advice' ? 'takeAdvice' : 'redirect';
      chooseWest(game, choice, true);
    }
  }
}

function loudChoiceId(game, deckName, card) {
  const list = game.config.deck?.[deckName] || [];
  const def = list.find((row) => row.id === card.id);
  const loud = def?.choices?.find((choice) => !choice.safe);
  return loud?.id || safeChoiceId(game, deckName, card);
}

export function stampIntervene(game, card) {
  if (!game.state.manager?.engaged || !card) return;
  card.resolveAt = (game.state.t || 0) + (game.config.manager?.interveneSeconds || 4);
}

export function stampWestIntervene(game) {
  const m = game.state.manager;
  if (!m?.engaged || !game.state.west) return;
  game.state.west.interveneAt = game.state.t + (game.config.manager?.interveneSeconds || 4);
}

export function stepDirector(game) {
  const m = game.state.manager;
  if (!m?.auto || m.holding) return;
  const s = game.state;
  const tune = game.config.manager;
  if (s.phase === 'preopen' && !m.morning) applyMorning(game);
  if (s.pacing?.open) chooseBeat(game, 'watchTheHill', true);
  if (s.phase === 'rush') {
    const target = tune.hack[m.strategy.hack];
    const spectacle = !!(s.bigRush?.active || s.bigRush?.armed);
    if (target && !m.hacked && s.phaseT >= (spectacle ? tune.hackAt.spectacle : tune.hackAt.normal)) {
      if (startHack(game, target).ok) m.hacked = true;
    }
    if (m.strategy.call === 'auto' && !m.called && s.phaseT >= (spectacle ? tune.callAt.spectacle : tune.callAt.normal)) {
      const grill = s.stations.grill;
      const grillLoad = grill.queue.length + (grill.active ? 1 : 0);
      const choice = spectacle || s.bottleneck === 'grill' || grillLoad >= 2 ? 'protectGrill' : 'clearLine';
      if (callTheLine(game, choice).ok) m.called = true;
    }
    if (m.strategy.hold === 'auto') {
      const name = s.bottleneck || 'grill';
      const slot = s.stations[name];
      const pressure = (slot?.queue.length || 0) + (slot?.active ? 1 : 0) + (name === 'register' ? s.line.length : 0);
      s.holding = spectacle || pressure >= tune.holdPressure;
    } else if (s.holding) s.holding = false;
    if (m.strategy.golden && s.golden?.customerId && s.golden.timeLeft > 0) tapGolden(game);
  } else if (s.holding) s.holding = false;
  resolveNews(game);
  stepTicker(game);
}

export function applyQueuedPerks(game) {
  const m = game.state.manager;
  if (!m?.auto) return;
  const pending = game.state.pendingPerks.slice();
  for (const row of pending) {
    const wanted = m.staff[row.crewId]?.perkQueued;
    const perkId = wanted && row.options.includes(wanted) ? wanted : row.options[0];
    if (perkId) choosePerk(game, row.crewId, perkId);
    if (m.staff[row.crewId]) m.staff[row.crewId].perkQueued = null;
  }
}

function starAndCause(game) {
  const s = game.state;
  const day = s.dayLedger;
  const stations = s.throughput || {};
  let bestName = s.bottleneck || 'grill';
  let best = -1;
  for (const name of ['register', 'prep', 'grill', 'serve']) {
    const count = stations[name] || 0;
    const tied = count === best;
    const better = count > best;
    if (better || (tied && name === s.bottleneck)) {
      best = count;
      bestName = name;
    }
  }
  let star = crewForStation(game, bestName) || game.config.stations[bestName].crew;
  let gained = -999;
  for (const id of STAFF_IDS) {
    const row = s.manager?.staff?.[id];
    if (!row?.shift) continue;
    if ((row.gained || 0) > gained) {
      gained = row.gained || 0;
      star = id;
    }
  }
  let cause = 'manager.cause.smooth';
  if (!s.manager.staff.ali?.shift) cause = 'manager.cause.grillDark';
  else if ((day.fines || 0) > 0) cause = 'manager.cause.dale';
  else if (day.stockout || (s.inventory.tortillas <= 0 && day.walkoffs > day.tacos)) cause = 'manager.cause.stockout';
  else if (day.bigRushId && day.walkoffs > day.tacos) cause = 'manager.cause.flood';
  else if (day.walkoffs >= Math.max(12, Math.round((day.tacos || 0) * 0.45))) cause = 'manager.cause.line';
  return { star, cause };
}

export function finishManagerDay(game) {
  const m = ensureManager(game.state, game.config);
  const s = game.state;
  const day = s.dayLedger;
  if (!day?.settled) return;
  const tune = game.config.manager;
  const pairs = activePairs(game);
  let tired = false;
  const loadFor = {
    cashier: 'register', prep: 'prep', grill: 'grill', runner: 'serve',
    manager: 'manager', hacker: 'hacker', advisor: 'advisor',
  };
  for (const id of STAFF_IDS) {
    const staff = m.staff[id];
    const before = staff.fatigue;
    if (!staff.shift) {
      staff.fatigue = Math.max(0, staff.fatigue - (tune.fatigue.restOff ?? 34));
      staff.morale = Math.min(tune.morale.cap, staff.morale + (tune.morale.rest ?? 5));
      staff.gained = staff.fatigue - before;
      continue;
    }
    const station = loadFor[staff.role] || 'manager';
    const load = (tune.fatigue.station?.[station] ?? 4) + (day.tacos || 0) * (tune.fatigue.perTaco || 0);
    staff.fatigue = Math.min(tune.fatigue.cap, staff.fatigue + load);
    staff.gained = staff.fatigue - before;
    staff.morale = day.profit > 0
      ? Math.min(tune.morale.cap, staff.morale + tune.morale.profitUp)
      : Math.max(tune.morale.floor, staff.morale - tune.morale.lossDown);
    for (const pair of pairs) {
      if (pair.ids.includes(id)) staff.morale = Math.min(tune.morale.cap, staff.morale + (pair.morale || 0));
    }
    const over = staff.fatigue >= tune.fatigue.tiredAt || day.tacos >= tune.fatigue.overworkAt;
    if (over && station === 'grill') {
      staff.morale = Math.max(tune.morale.floor, staff.morale - tune.morale.overworkDown);
      tired = true;
    }
  }
  if (m.engaged && tune.reputation) {
    const strategy = m.strategy || {};
    let delta = 0;
    if (strategy.focus === 'quality') delta += 3;
    if (strategy.focus === 'speed') delta -= 1;
    if (strategy.portion === 'generous') delta += 2;
    if (strategy.portion === 'skimpy') delta -= 3;
    if (strategy.price === 'proud') delta += 2;
    if (strategy.price === 'fair') delta += 1;
    if (strategy.price === 'student') delta -= 3;
    if ((day.walkoffs || 0) > (day.tacos || 0)) delta -= 2;
    // Paid customers who left before their taco: -1 per 4 wasted tacos, at most -2 a day.
    delta -= Math.min(2, Math.floor((day.wasted || 0) / 4));
    m.reputation = Math.max(tune.reputation.floor ?? 0, Math.min(tune.reputation.cap ?? 100, (m.reputation ?? tune.reputation.origin ?? 20) + delta));
  }
  const { star, cause } = starAndCause(game);
  if (m.marketing.today > 0) {
    const served = (day.tacos || 0) / Math.max(1, (day.tacos || 0) + (day.walkoffs || 0));
    const returned = money(day.revenue * ((m.boost || 0) / (1 + (m.boost || 0))) * served);
    m.marketing.returned = money((m.marketing.returned || 0) + returned);
  }
  const cal = weekOf(s.day, game.config.semester.daysPerWeek);
  const board = scoreRival(game, day);
  const fit = m.engaged ? forecastFit(game) : null;
  m.report = {
    day: s.day,
    dayName: cal.dayName,
    week: cal.week,
    sold: day.tacos,
    walked: day.walkoffs,
    profit: day.profit,
    revenue: day.revenue,
    cash: s.cash,
    star,
    starKey: `manager.star.${star}`,
    cause,
    textKey: 'manager.report',
    planFit: fit == null ? null : Math.round(fit * 100) / 100,
    planKey: fit == null ? null : planKeyFor(fit, tune),
    rivalSold: board.rivalSold,
    share: board.share,
    rating: board.rating,
  };
  noteGoals(game, day);
  m.history.push({
    day: s.day,
    dayName: cal.dayName,
    week: cal.week,
    revenue: day.revenue,
    cogs: day.cogs,
    overhead: day.overhead,
    fines: day.fines,
    marketing: day.marketing || 0,
    profit: day.profit,
    cash: s.cash,
    sold: day.tacos,
    walked: day.walkoffs,
  });
  if (m.history.length > 40) m.history.splice(0, m.history.length - 40);
  if (m.auto && m.hireOutpost && !s.outpost && s.day >= 2 && s.cash >= game.config.outpost.tiers[0].cost + tune.hireFloat) {
    hireOutpost(game, { spot: 'stallions', quirk: 'shy' });
    m.report.cash = s.cash;
    m.history[m.history.length - 1].cash = s.cash;
  }
  if (cal.dayOfWeek === game.config.semester.daysPerWeek) m.forecastNext = buildForecast(game, cal.week + 1);
  advanceProject(game);
  emit(game, {
    type: 'dayReport',
    textKey: m.report.textKey,
    star,
    cause,
    profit: day.profit,
    sold: day.tacos,
    walked: day.walkoffs,
    planKey: m.report.planKey,
    cue: 'day.dusk',
  });
  if (m.engaged || m.auto) {
    if (tired) emit(game, { type: 'morale', textKey: 'manager.morale.tired', cue: 'crew.sigh' });
    emit(game, { type: 'standings', textKey: 'rival.standings', cue: 'day.dusk' });
  }
}

function planKeyFor(fit, tune) {
  if (fit >= (tune.forecast?.sharp ?? 0.68)) return 'manager.plan.sharp';
  if (fit >= (tune.forecast?.loose ?? 0.45)) return 'manager.plan.loose';
  return 'manager.plan.miss';
}

function scoreRival(game, day) {
  const m = game.state.manager;
  const tune = game.config.manager.rival;
  const cal = weekOf(game.state.day, game.config.semester.daysPerWeek);
  const present = !!(m.engaged && m.rivalToday?.present);
  const steal = present ? rivalSteal(game) : 0;
  if (m.rivalToday) m.rivalToday.steal = steal;
  // Their tacos are the demand they took, so the board matches the 10–25% steal.
  const rivalSold = present ? Math.max(1, Math.round((day.tacos || 0) * steal / Math.max(0.05, 1 - steal))) : 0;
  const tipRate = day.revenue > 0 ? day.tips / day.revenue : 0;
  const leave = day.walkoffs / Math.max(1, day.tacos + day.walkoffs);
  let rating = 3.4 + (tipRate - 0.1) * 5 - leave * 1.6;
  rating = Math.max(1, Math.min(5, Math.round(rating * 10) / 10));
  let rivalRating = 0;
  if (present) {
    const fair = game.config.economy.prices.fair.price;
    rivalRating = 3.3 + (fair - m.rivalToday.price) * 0.35 + (m.rivalToday.speed - 1) * 0.8;
    rivalRating = Math.max(1, Math.min(5, Math.round(rivalRating * 10) / 10));
  }
  const share = day.tacos + rivalSold > 0 ? Math.round((day.tacos / (day.tacos + rivalSold)) * 100) / 100 : 1;
  m.results.push({
    week: cal.week,
    day: game.state.day,
    sold: day.tacos,
    rivalSold,
    rating,
    rivalRating,
    present,
  });
  if (m.results.length > 40) m.results.splice(0, m.results.length - 40);
  const weekRows = m.results.filter((row) => row.week === cal.week);
  const ourSold = weekRows.reduce((n, row) => n + row.sold, 0);
  const theirSold = weekRows.reduce((n, row) => n + row.rivalSold, 0);
  const ourRating = weekRows.length ? Math.round((weekRows.reduce((n, row) => n + row.rating, 0) / weekRows.length) * 10) / 10 : rating;
  const rivalDays = weekRows.filter((row) => row.present);
  const theirRating = rivalDays.length ? Math.round((rivalDays.reduce((n, row) => n + row.rivalRating, 0) / rivalDays.length) * 10) / 10 : 0;
  const weekShare = ourSold + theirSold > 0 ? Math.round((ourSold / (ourSold + theirSold)) * 100) / 100 : 1;
  const rows = [
    { id: 'sife', nameKey: 'manager.stand.sife', sold: ourSold, rating: ourRating, share: weekShare },
    { id: 'rival', nameKey: `rival.${tune.id}`, sold: theirSold, rating: theirRating, share: Math.round((1 - weekShare) * 100) / 100 },
  ].sort((a, b) => b.sold - a.sold || (a.id === 'sife' ? -1 : 1));
  rows.forEach((row, index) => { row.rank = index + 1; });
  m.standings = { week: cal.week, rows };
  return { rivalSold, share, rating };
}

function advanceProject(game) {
  const m = game.state.manager;
  const project = m.project;
  if (!project) return;
  const def = game.config.manager.projects?.[project.id];
  if (!def) { m.project = null; return; }
  project.daysDone += 1;
  const progress = project.daysDone / def.days;
  if (project.daysDone < def.days) {
    if (m.engaged || m.auto) {
      emit(game, { type: 'project', id: project.id, textKey: 'project.progress', progress, cue: 'crew.work' });
    }
    return;
  }
  m.dev[project.id] = (m.dev[project.id] || 0) + 1;
  m.project = null;
  if (m.engaged || m.auto) {
    emit(game, { type: 'project', id: project.id, textKey: 'project.done', cue: 'goal.reached' });
  }
}

const PRESETS = {
  planned: {
    strategy: {
      price: 'fair', portion: 'regular', focus: 'speed', line: 'serpentine', hack: 'med',
      hold: 'auto', call: 'auto', west: 'advice', cards: 'safe', golden: true, restock: 'planned',
    },
    hireOutpost: true,
    marketing: { flyers: false, social: false, gameDay: true },
    featured: 'quad',
    enabled: ['quad', 'street'],
  },
  default: {
    strategy: {
      price: 'fair', portion: 'regular', focus: 'balance', line: 'cap', hack: 'low',
      hold: 'off', call: 'off', west: 'redirect', cards: 'safe', golden: true, restock: 'default',
    },
    hireOutpost: false,
    marketing: { flyers: false, social: false, gameDay: false },
    featured: 'quad',
    enabled: ['quad', 'street'],
  },
};

export function applyPreset(game, name) {
  const preset = PRESETS[name];
  if (!preset) return { ok: false, reason: 'unknown-choice' };
  const m = ensureManager(game.state, game.config);
  m.engaged = true;
  m.auto = true;
  m.strategy = { ...preset.strategy };
  m.hireOutpost = preset.hireOutpost;
  m.marketing = { ...m.marketing, ...preset.marketing };
  m.menu.featured = preset.featured;
  m.menu.enabled = preset.enabled.slice();
  for (const id of STAFF_IDS) {
    m.staff[id].shift = true;
    m.staff[id].station = ROLES[id].station;
    m.staff[id].role = ROLES[id].role;
  }
  return { ok: true, preset: name };
}

const POLICY_KEYS = ['price', 'portion', 'focus', 'line', 'hack', 'hold', 'call', 'west', 'cards', 'golden', 'restock'];
const POLICY_KEY_ALIAS = { pace: 'focus' };
const POLICY_VALUE_ALIAS = {
  portion: { standard: 'regular' },
  focus: { balanced: 'balance' },
  hack: { off: 'low', careful: 'med', bold: 'high' },
  line: { balanced: 'cap', fast: 'serpentine' },
};

export function setPolicy(game, patch = {}) {
  const m = ensureManager(game.state, game.config);
  if (patch.preset) {
    const applied = applyPreset(game, patch.preset);
    if (!applied.ok) return applied;
  }
  const strategy = patch.strategy || patch;
  const keys = [...POLICY_KEYS, ...Object.keys(POLICY_KEY_ALIAS)];
  for (const key of keys) {
    if (strategy[key] == null || key === 'preset') continue;
    const dest = POLICY_KEY_ALIAS[key] || key;
    if (!POLICY_KEYS.includes(dest)) continue;
    const value = POLICY_VALUE_ALIAS[dest]?.[strategy[key]] || strategy[key];
    m.strategy[dest] = value;
    if (game.config.quadFlow && dest === 'price' && game.config.economy.prices[value]) game.state.priceBand = value;
  }
  if (patch.marketing) Object.assign(m.marketing, patch.marketing);
  if (patch.hireOutpost != null) m.hireOutpost = !!patch.hireOutpost;
  if (patch.auto != null) m.auto = !!patch.auto;
  if (patch.engaged != null) m.engaged = !!patch.engaged;
  return { ok: true };
}

const STATION_IDS = new Set(['register', 'prep', 'grill', 'assemble', 'serve', 'stall']);
const STATION_ALIAS = { warm: 'prep', wrap: 'serve', floor: null, hack: null, advisor: null };

export function assignCrew(game, id, patch = {}) {
  const m = ensureManager(game.state, game.config);
  const staff = m.staff[id];
  if (!staff) return { ok: false, reason: 'unknown-choice' };
  if (typeof patch === 'string') {
    const raw = Object.prototype.hasOwnProperty.call(STATION_ALIAS, patch) ? STATION_ALIAS[patch] : patch;
    patch = { station: raw && STATION_IDS.has(raw) ? raw : null };
  }
  if (patch.shift != null) staff.shift = !!patch.shift;
  if (patch.role) staff.role = patch.role;
  if (patch.perk) staff.perkQueued = patch.perk;
  if (patch.station !== undefined) {
    if (patch.station) {
      for (const other of STAFF_IDS) {
        if (other !== id && m.staff[other].station === patch.station) m.staff[other].station = staff.station;
      }
    }
    staff.station = patch.station || null;
  }
  return { ok: true };
}

export function buyUpgrade(game, id, extra = {}) {
  const m = ensureManager(game.state, game.config);
  const s = game.state;
  const open = s.phase === 'summary' || s.phase === 'preopen' || m.holding;
  if (!open) return { ok: false, reason: 'wrong-phase' };
  if (id === 'location') {
    const spot = extra.spot || extra.id;
    const row = game.config.manager.locations.find((item) => item.id === spot);
    if (!row) return { ok: false, reason: 'unknown-choice' };
    if (m.locations.includes(spot)) return { ok: false, reason: 'already-used' };
    if (s.cash < row.cost) return { ok: false, reason: 'cant-afford' };
    s.cash = money(s.cash - row.cost);
    if (s.dayLedger) s.dayLedger.capex = money((s.dayLedger.capex || 0) + row.cost);
    m.locations.push(spot);
    return { ok: true, id: spot };
  }
  const row = game.config.manager.upgrades[id];
  if (!row) return { ok: false, reason: 'unknown-choice' };
  const level = m.upgrades[id] || 0;
  if (level >= row.max) return { ok: false, reason: 'already-used' };
  if (s.cash < row.cost) return { ok: false, reason: 'cant-afford' };
  s.cash = money(s.cash - row.cost);
  if (s.dayLedger) s.dayLedger.capex = money((s.dayLedger.capex || 0) + row.cost);
  m.upgrades[id] = level + 1;
  if (id === 'secondCooler' && !s.outpost && (s.phase === 'summary' || s.phase === 'preopen')) {
    hireOutpost(game, { spot: 'stallions', quirk: 'shy', paid: true });
  }
  return { ok: true, id, level: m.upgrades[id] };
}

export function setMenu(game, spec = {}) {
  const m = ensureManager(game.state, game.config);
  const known = new Set((game.config.manager.menu || []).map((item) => item.id));
  if (spec.enabled) {
    const enabled = spec.enabled.filter((id) => known.has(id));
    if (enabled.length < 2 || enabled.length > 4) return { ok: false, reason: 'unknown-choice' };
    m.menu.enabled = enabled;
  }
  if (spec.featured) {
    if (!m.menu.enabled.includes(spec.featured)) return { ok: false, reason: 'unknown-choice' };
    m.menu.featured = spec.featured;
  }
  return { ok: true };
}

function engageMorning(game) {
  const m = ensureManager(game.state, game.config);
  const s = game.state;
  const fresh = !m.auto || m.holding;
  m.holding = false;
  m.engaged = true;
  m.auto = true;
  if (!fresh) return false;
  // Rewind a fresh preopen so the morning policy (price, restock, the board)
  // still runs. prepareBoard already ran inside beginDay.
  m.morning = false;
  m.announced = false;
  s.phase = 'preopen';
  s.step = 0;
  s.t = 0;
  s.phaseSteps = 0;
  s.phaseT = 0;
  s.bankMs = 0;
  return true;
}

function noteGoals(game, day) {
  const m = game.state.manager;
  const calls = game.config.semester?.calls || [];
  if (!m.goals) m.goals = {};
  for (const goal of calls) {
    if (m.goals[goal.id]) continue;
    let hit = false;
    if (goal.kind === 'line') hit = (day.peakRegister || 0) >= goal.target;
    else if (goal.kind === 'cash') hit = game.state.cash >= goal.target;
    else if (goal.kind === 'reputation') hit = (m.reputation || 0) >= goal.target;
    else if (goal.kind === 'share') {
      const ours = m.standings?.rows?.find((row) => row.id === 'sife');
      const friday = weekOf(game.state.day, game.config.semester?.daysPerWeek || 5).dayOfWeek
        === (game.config.semester?.daysPerWeek || 5);
      hit = friday && (ours?.share || 0) >= goal.target && (ours?.sold || 0) > 0 && (m.report?.rivalSold || 0) > 0;
    }
    if (hit) m.goals[goal.id] = game.state.day;
  }
}

export function applyDrawer(game) {
  const s = game.state;
  const day = s.dayLedger;
  const m = ensureManager(s, game.config);
  const tune = game.config.manager?.drawer || {};
  if (!m.finance) m.finance = blankFinance();
  const fin = m.finance;
  if (fin.failed) return;
  if (fin.loan > 0 && s.cash > (tune.warnAt ?? 40)) {
    const pay = Math.min(fin.loan, tune.loanPayment || 18, money(s.cash - (tune.warnAt ?? 40)));
    if (pay > 0) {
      s.cash = money(s.cash - pay);
      fin.loan = money(fin.loan - pay);
      day.loanPayment = money((day.loanPayment || 0) + pay);
    }
  }
  if (s.cash < (tune.warnAt ?? 40) && s.cash >= 0) {
    fin.warned = true;
    emit(game, { type: 'cashWarning', textKey: 'manager.cash.warning', cash: s.cash, cue: 'drawer.thin' });
  }
  if (s.cash < 0 && !fin.bailout) {
    const gift = money(Math.abs(s.cash) + (tune.float ?? 60));
    s.cash = money(s.cash + gift);
    day.bailout = gift;
    fin.bailout = true;
    fin.loan = money((fin.loan || 0) + gift);
    fin.warned = true;
    for (const id of STAFF_IDS) {
      const staff = m.staff[id];
      if (staff) staff.morale = Math.max(game.config.manager.morale.floor, staff.morale - 8);
    }
    emit(game, { type: 'bailout', textKey: 'manager.cash.bailout', cash: s.cash, loan: fin.loan, cue: 'drawer.bailout' });
  } else if (s.cash < 0 && fin.bailout) {
    fin.failed = true;
    emit(game, { type: 'gameOver', textKey: 'manager.cash.gameOver', cash: s.cash, cue: 'drawer.close' });
  }
}

export function startDay(game) {
  const m = ensureManager(game.state, game.config);
  const s = game.state;
  if (m.finance?.failed) return { ok: false, reason: 'game-over', phase: s.phase };
  if (s.phase === 'summary') {
    applyQueuedPerks(game);
    m.holding = false;
    m.engaged = true;
    m.auto = true;
    return { ok: true, advance: true };
  }
  if (s.phase === 'preopen' || m.holding) {
    if (engageMorning(game)) return { ok: true, started: true };
    return { ok: true, reason: 'already-started', phase: 'preopen' };
  }
  return { ok: false, reason: 'day-in-progress', phase: s.phase };
}

export function startProject(game, id) {
  const m = ensureManager(game.state, game.config);
  const s = game.state;
  const open = s.phase === 'summary' || s.phase === 'preopen' || m.holding;
  if (!open) return { ok: false, reason: 'wrong-phase' };
  const def = game.config.manager.projects?.[id];
  if (!def) return { ok: false, reason: 'unknown-choice' };
  if ((m.dev[id] || 0) >= def.max) return { ok: false, reason: 'already-used' };
  if (m.project) return { ok: false, reason: 'busy' };
  if (s.cash < def.cost) return { ok: false, reason: 'cant-afford' };
  payCapex(s, def.cost);
  m.project = { id, daysDone: 0, startedDay: s.day };
  return { ok: true, id, days: def.days };
}

export function setSpeed(game, speed) {
  const m = ensureManager(game.state, game.config);
  if (speed === 'skip') {
    if (m.holding) return { ok: false, reason: 'wrong-phase' };
    m.speed = 'skip';
    return { ok: true, speed: 'skip', run: true };
  }
  if (speed !== 1 && speed !== 2 && speed !== 4) return { ok: false, reason: 'unknown-choice' };
  m.speed = speed;
  return { ok: true, speed };
}

export function liveSnapshot(game) {
  const s = game.state;
  const tune = game.config.manager;
  const people = [];
  for (const c of s.customers || s.line || []) {
    if (!c || c.patience == null) continue;
    if (c.state && c.state !== 'line' && c.state !== 'ordering' && c.state !== 'waiting') continue;
    people.push(c);
  }
  let wait = 0;
  let risk = 0;
  for (const c of people) {
    wait += Math.max(0, (c.patienceMax || 0) - (c.patience || 0));
    if ((c.patience || 0) < (tune?.riskPatience || 6)) risk += 1;
  }
  const minutes = (s.t || 0) / 60;
  const lineLength = s.line?.length || 0;
  const visualCrowd = visualCrowdCount(lineLength, people.length, {
    phase: s.phase,
    phaseT: s.phaseT,
    day: s.day,
    seed: game.seed,
    bigRush: s.bigRush,
  }, game.config);
  const visualLine = [];
  for (let i = lineLength; i < visualCrowd; i += 1) {
    visualLine.push({
      id: 100000 + (s.day || 1) * 1000 + i,
      kind: 'student',
      regularId: null,
      nameKey: null,
      tacos: 1,
      patience: 24,
      patienceMax: 28,
      progress: 0,
      golden: false,
      station: 'line',
      source: 'visual',
    });
  }
  const crew = STAFF_IDS.map((id) => {
    const staff = s.manager?.staff?.[id];
    const station = staff?.station;
    const slot = station && s.stations ? s.stations[station] : null;
    let task = 'watching';
    if (!staff?.shift) task = 'off';
    else if (id === 'west') task = s.west?.status === 'present' ? 'advising' : 'watching';
    else if (id === 'antonio') task = s.hack?.channel > 0 ? 'hacking' : 'watching';
    else if (id === 'aaron') task = s.holding ? 'holding' : 'watching';
    else if (slot?.active) task = STATION_TASK[station] || station;
    else task = 'ready';
    return {
      id,
      role: staff?.role || ROLES[id].role,
      station: staff?.station || null,
      shift: staff?.shift !== false,
      task,
      efficiency: Math.round(crewEfficiency(game, id) * 100) / 100,
      efficiencyPct: Math.round(crewEfficiency(game, id) * 100),
      morale: Number.isFinite(staff?.morale) ? staff.morale : (tune?.morale?.start ?? 78),
      fatigue: Number.isFinite(staff?.fatigue) ? staff.fatigue : (tune?.fatigue?.start ?? 6),
    };
  });
  return {
    tacosPerMin: minutes > 1 / 60 ? Math.round(((s.dayLedger?.tacos || 0) / minutes) * 10) / 10 : 0,
    line: lineLength,
    lineLength: visualCrowd,
    visualCrowd,
    visualLine,
    queue: people.length,
    avgWait: people.length ? Math.round((wait / people.length) * 10) / 10 : 0,
    walkoutRisk: people.length ? Math.round((risk / people.length) * 100) / 100 : 0,
    cash: s.cash,
    speed: s.manager?.speed ?? 1,
    crew,
    feed: (s.liveFeed || []).slice(),
    history: (s.manager?.telemetry || []).map((row) => ({ ...row })),
    rival: s.manager?.rivalToday ? { ...s.manager.rivalToday } : null,
    forecast: s.manager?.forecastToday ? showForecastDay(s.manager.forecastToday) : null,
  };
}

export function managerSnapshot(game) {
  const s = game.state;
  const m = s.manager || blankManager(game.config);
  const tune = game.config.manager;
  const history = m.history || [];
  const cal = weekOf(s.day || 1, game.config.semester?.daysPerWeek || 5);
  const weekRows = history.filter((row) => row.week === cal.week);
  const sum = (rows, key) => money(rows.reduce((n, row) => n + (row[key] || 0), 0));
  const day = s.dayLedger || {};
  const menuItems = (tune?.menu || []).map((item) => ({
    id: item.id,
    textKey: item.textKey,
    cost: item.cost,
    price: item.price,
    popularity: item.popularity,
    enabled: (m.menu?.enabled || []).includes(item.id),
    featured: m.menu?.featured === item.id,
  }));
  const upgrades = Object.entries(tune?.upgrades || {}).map(([id, row]) => ({
    id,
    textKey: row.textKey,
    cost: row.cost,
    level: m.upgrades?.[id] || 0,
    max: row.max,
  }));
  const staff = STAFF_IDS.map((id) => {
    const row = m.staff?.[id] || ROLES[id];
    const xp = s.crew?.[id];
    return {
      id,
      role: row.role,
      station: row.station,
      shift: row.shift !== false,
      perkQueued: row.perkQueued || null,
      level: xp?.level ?? null,
      xp: xp?.xp ?? null,
      perks: xp?.perks ? xp.perks.slice() : [],
      morale: Number.isFinite(row.morale) ? row.morale : (tune?.morale?.start ?? 78),
      fatigue: Number.isFinite(row.fatigue) ? row.fatigue : (tune?.fatigue?.start ?? 6),
    };
  });
  const spent = m.marketing?.spent || 0;
  const returned = m.marketing?.returned || 0;
  return {
    planning: !!(m.holding || s.phase === 'summary'),
    auto: !!m.auto,
    strategy: { ...m.strategy },
    staff,
    crew: staff,
    menu: { featured: m.menu?.featured || null, items: menuItems },
    upgrades,
    locations: (tune?.locations || []).map((row) => ({
      id: row.id,
      textKey: row.textKey,
      cost: row.cost,
      unlocked: (m.locations || []).includes(row.id),
    })),
    marketing: {
      flyers: !!m.marketing?.flyers,
      social: !!m.marketing?.social,
      gameDay: !!m.marketing?.gameDay,
      spent,
      returned,
      roi: spent > 0 ? Math.round((returned / spent) * 100) / 100 : null,
    },
    finances: {
      today: {
        revenue: day.revenue || 0,
        cogs: day.cogs || 0,
        overhead: day.overhead || 0,
        fines: day.fines || 0,
        marketing: day.marketing || 0,
        profit: day.profit || 0,
      },
      week: {
        revenue: sum(weekRows, 'revenue'),
        cogs: sum(weekRows, 'cogs'),
        overhead: sum(weekRows, 'overhead'),
        fines: sum(weekRows, 'fines'),
        marketing: sum(weekRows, 'marketing'),
        profit: sum(weekRows, 'profit'),
      },
      history: history.map((row) => ({ ...row })),
      costs: {
        food: day.cogs || 0,
        tortillas: day.purchases || 0,
        overhead: day.overhead || 0,
        marketing: day.marketing || 0,
        fines: day.fines || 0,
      },
      goal: {
        target: game.config.semester?.goal || 1200,
        cash: s.cash,
        progress: Math.round((s.cash / (game.config.semester?.goal || 1200)) * 1000) / 1000,
      },
    },
    report: m.report ? { ...m.report } : null,
    reputation: m.reputation ?? (tune?.reputation?.origin ?? 20),
    finance: m.finance ? { ...m.finance } : null,
    goals: (tune && game.config.semester?.calls || []).map((goal) => ({
      id: goal.id,
      week: goal.week,
      kind: goal.kind,
      target: goal.target,
      textKey: goal.textKey,
      met: !!m.goals?.[goal.id],
      day: m.goals?.[goal.id] || null,
    })),
    forecast: showForecast(m.forecast),
    upcoming: showForecast(m.forecastNext),
    standings: m.standings ? { week: m.standings.week, rows: m.standings.rows.map((row) => ({ ...row })) } : null,
    project: showProject(game, m),
    projects: projectRows(game, m),
    chemistry: (tune?.chemistry?.pairs || []).map((pair) => ({
      id: pair.id,
      textKey: pair.textKey,
      ids: pair.ids.slice(),
      active: pair.ids.every((id) => m.staff?.[id]?.shift),
      speed: pair.speed,
      morale: pair.morale,
    })),
  };
}

function showForecastDay(day) {
  return {
    ...day,
    weatherKey: `forecast.weather.${day.weather}`,
    crowdKey: `forecast.crowd.${day.crowd}`,
    daleKey: `forecast.dale.${day.dale}`,
    eventKey: `forecast.event.${day.event}`,
  };
}

function showForecast(card) {
  if (!card) return null;
  return { week: card.week, days: card.days.map(showForecastDay) };
}

function showProject(game, m) {
  if (!m.project) return null;
  const def = game.config.manager.projects?.[m.project.id];
  if (!def) return null;
  return {
    id: m.project.id,
    textKey: def.textKey,
    daysDone: m.project.daysDone,
    days: def.days,
    progress: Math.round((m.project.daysDone / def.days) * 100) / 100,
  };
}

function projectRows(game, m) {
  return Object.entries(game.config.manager.projects || {}).map(([id, row]) => ({
    id,
    textKey: row.textKey,
    cost: row.cost,
    days: row.days,
    max: row.max,
    level: m.dev?.[id] || 0,
    active: m.project?.id === id,
    daysDone: m.project?.id === id ? m.project.daysDone : 0,
    progress: m.project?.id === id ? Math.round((m.project.daysDone / row.days) * 100) / 100 : 0,
  }));
}
