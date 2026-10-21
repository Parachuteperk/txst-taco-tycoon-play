import { initCustomerFlow, stepQuadFlow, quadWorkReady } from './quadFlow.js';
import { stationBoost, demandBoost, patienceBoost, orderExtra, priceBoost } from './upgrades.js';
import { raidArrivals } from './signatures.js';
import { emit } from './events.js';
import { bookSale } from './economy.js';
import {
  comboUnlocked, hasPerk, marginMult, moneyTip, perkDef, procCombos, restockMult,
} from './crew.js';
import { resolveStory } from './story.js';
import { adviceActive } from './west.js';
import { lineCapNow } from './bigRush.js';
import { weekModifiers } from './season.js';
import { difficultyMods } from './difficulty.js';
import { noteDecision } from './pacing.js';
import { arrivalCrowd, houseItem, crewEfficiency, crewForStation, interiorCap, managerMods, projectBonus, reputationMods } from './managerMath.js';
import { clamp, money } from './util.js';
import { initBodies, placeAll, stepHaul } from '../sim/layout.js';

// Placeholder until Claude retunes paid walkouts. Refund can exceed the undelivered share.
const REFUND_HURT = 1.35;

export function blankStations() {
  return {
    register: { queue: [], active: null },
    prep: { queue: [], active: null },
    grill: { queue: [], active: null },
    assemble: { queue: [], active: null },
    serve: { queue: [], active: null },
  };
}

export function blankMods() {
  return { register: 0, prep: 0, grill: 0, serve: 0, patienceDrain: 0, priorityRegular: false };
}

export function blankGolden() {
  return { customerId: null, timeLeft: 0, nextAt: 0 };
}

export function demandMult(game) {
  const s = game.state;
  const a = game.config.arrivals;
  const band = game.config.economy.prices[s.priceBand];
  let mult = band.demand;
  if (s.hack.demandAdd && s.t < s.hack.demandUntil) mult += s.hack.demandAdd;
  mult += Math.min(a.womCap, s.story.wordOfMouth * a.womPerPoint);
  mult += clamp(s.story.trust * a.trustPerPoint, -0.1, 0.08);
  for (const timed of s.timed) {
    if (timed.demandAdd && s.t < timed.until) mult += timed.demandAdd;
  }
  const demand = weekModifiers(game).demand;
  const scaled = mult * (demand == null ? 1 : demand) * difficultyMods(game).demand * managerMods(game).demand * arrivalCrowd(game);
  return Math.max(0, scaled);
}

export function arrivalRate(game) {
  const s = game.state;
  const a = game.config.arrivals;
  if (s.inspector.mute > 0) return 0;
  let base = 0;
  if (s.phase === 'calm') base = a.calmRate;
  else if (s.phase === 'telegraph') base = a.telegraphRate;
  else if (s.phase === 'rush') {
    for (const row of a.rush) {
      if (s.phaseT < row.until) { base = row.rate; break; }
    }
  }
  return base * demandMult(game) * demandBoost(s);
}

function rollPatience(game, kind) {
  const a = game.config.arrivals;
  const scale = weekModifiers(game).patience;
  const patienceScale = (scale == null ? 1 : scale) * difficultyMods(game).patience;
  if (kind === 'regular' || kind === 'maya') return a.regularPatience * patienceScale;
  if (a.patienceMax <= a.patienceMin) return a.patienceMin * patienceScale;
  return (a.patienceMin + game.rng.next() * (a.patienceMax - a.patienceMin)) * patienceScale;
}

export function peopleAtStand(state) {
  if (state.customers) {
    let n = 0;
    for (const c of state.customers) {
      if (c.state === 'line' || c.state === 'ordering' || c.state === 'waiting') n += 1;
    }
    return n;
  }
  let n = state.line.length;
  for (const slot of Object.values(state.stations)) {
    n += slot.queue.length + (slot.active ? 1 : 0);
  }
  return n;
}

function stageLabel(name) {
  if (name === 'prep') return 'warm';
  if (name === 'serve') return 'wrap';
  return name;
}

function stationKey(name) {
  if (name === 'warm') return 'prep';
  if (name === 'wrap') return 'serve';
  return name;
}

// JSON saves the same taco twice (items[] and the station slot). Relink to one object.
export function relinkEntities(state) {
  if (!state) return;
  if (state.customers) {
    const people = new Map(state.customers.map((c) => [c.id, c]));
    if (state.line) state.line = state.line.map((c) => people.get(c.id) || c);
    const reg = state.stations?.register;
    if (reg?.active && people.has(reg.active.id)) reg.active = people.get(reg.active.id);
    if (reg?.queue) reg.queue = reg.queue.map((c) => (c && people.has(c.id) ? people.get(c.id) : c));
  }
  if (state.items && state.stations) {
    const items = new Map(state.items.map((item) => [item.id, item]));
    for (const [name, slot] of Object.entries(state.stations)) {
      if (!slot || name === 'register') continue;
      if (slot.queue) slot.queue = slot.queue.map((entry) => (entry && items.has(entry.id) ? items.get(entry.id) : entry));
      if (slot.active && items.has(slot.active.id)) slot.active = items.get(slot.active.id);
    }
  }
}

function sawTheLine(game) {
  const day = game.state.dayLedger;
  day.walkoffs += 1;
  day.walkBys += 1;
  emit(game, {
    type: 'walkBy',
    reason: 'sawTheLine',
    line: peopleAtStand(game.state),
    textKey: 'arrival.sawTheLine',
    cue: 'crowd.pass',
  });
}

export function spawnCustomer(game, partial = {}) {
  const s = game.state;
  const cfg = game.config;
  const cap = lineCapNow(game);
  const storyGuest = partial.forceJoin || partial.storyBeat || partial.kind === 'maya' || partial.source === 'maya-friend';
  if (cap > 0 && !storyGuest && peopleAtStand(s) >= cap) {
    sawTheLine(game);
    return null;
  }
  let kind = partial.kind || 'student';
  let regularId = partial.regularId || null;
  let nameKey = partial.nameKey || null;
  if (!partial.kind && cfg.arrivals.regularChance > 0 && game.rng.next() < effectiveRegularChance(game)) {
    kind = 'regular';
    const reg = cfg.regulars[game.rng.int(cfg.regulars.length)];
    regularId = reg.id;
    nameKey = reg.nameKey;
  }
  let patienceMax = partial.patience != null ? partial.patience : rollPatience(game, kind);
  if (s.hack.patienceMult && s.hack.patienceMult !== 1) patienceMax *= s.hack.patienceMult;
  patienceMax *= patienceBoost(s);
  if (s.bigRush?.active && partial.patience == null) {
    patienceMax = Math.max(patienceMax, cfg.bigRush?.patienceFloor || patienceMax);
  }
  const band = cfg.economy.prices[s.priceBand];
  const priceMult = partial.priceMult != null ? partial.priceMult : (s.hack.priceMult || 1);
  const cheap = partial.cheapest ? cfg.story.mayaCheapMult : 1;
  const weekPrice = weekModifiers(game).price;
  const price = money(band.price * priceMult * cheap * (weekPrice == null ? 1 : weekPrice) * difficultyMods(game).price * managerMods(game).price * priceBoost(s));
  const customer = {
    id: s.nextId++,
    kind,
    regularId,
    nameKey,
    storyBeat: partial.storyBeat || null,
    tacos: partial.tacos || 1,
    price,
    patience: patienceMax,
    patienceMax,
    patienceAtServe: null,
    station: 'line',
    progress: 0,
    workNeed: cfg.stations.register.base,
    golden: false,
    goldenResolved: null,
    prepped: false,
    guac: partial.guac != null ? partial.guac : !!s.hack.guac,
    upsold: false,
    tipMult: partial.tipMult != null ? partial.tipMult : (s.hack.tipMult || 1),
    source: partial.source || 'walkup',
    state: 'line',
    pos: { x: 23, y: 20 },
    queueIndex: 0,
    orderItems: [],
    paid: false,
    paidCash: 0,
    cashierId: null,
    delivered: 0,
    foodBooked: 0,
    tipBooked: 0,
    refunded: 0,
    itemType: partial.itemType || (game.config.quadFlow ? houseItem(game)?.id : null) || 'quad',
  };
  const front = s.mods.priorityRegular && (regularId || kind === 'regular' || kind === 'maya');
  if (front) s.line.unshift(customer);
  else s.line.push(customer);
  if (!s.customers) s.customers = [];
  s.customers.push(customer);
  initCustomerFlow(game, customer);
  customer.queueIndex = Math.max(0, s.line.indexOf(customer));
  placeAll(s);
  if (kind === 'regular' || kind === 'maya') {
    emit(game, {
      type: 'regularArrives',
      regularId,
      nameKey,
      customerId: customer.id,
      textKey: partial.arriveKey || nameKey,
    });
    if (partial.orderKey) {
      emit(game, { type: 'storyBeat', beatId: customer.storyBeat, outcome: 'arrive', textKey: partial.orderKey, regularId });
    }
  }
  return customer;
}

function effectiveRegularChance(game) {
  const base = game.config.arrivals.regularChance;
  const bumped = hasPerk(game.state, 'jared', 'regularsFavorite') ? base + 0.1 : base;
  return Math.max(0, bumped + (weekModifiers(game).regularAdd || 0) + (reputationMods(game).regulars || 0));
}

export function stepArrivals(game, dt) {
  const s = game.state;
  if (s.schedule.length) {
    const keep = [];
    for (const item of s.schedule) {
      if (item.at <= s.t + 1e-9) {
        const extra = item.spec.extraFriends || 0;
        const spec = { ...item.spec };
        delete spec.extraFriends;
        spawnCustomer(game, spec);
        for (let i = 0; i < extra; i++) spawnCustomer(game, { kind: 'student', source: 'maya-friend' });
      } else keep.push(item);
    }
    s.schedule = keep;
  }
  if (!['calm', 'telegraph', 'rush'].includes(s.phase)) return;
  const rate = arrivalRate(game);
  if (rate <= 0) return;
  s.arrivalCredit += rate * dt;
  let guard = 0;
  while (s.arrivalCredit >= 1 && guard++ < 8) {
    const step = game.config.arrivals.jitter ? (0.85 + game.rng.next() * 0.3) : 1;
    s.arrivalCredit -= step;
    spawnCustomer(game, {});
  }
  // Stream Raid viewers arrive on top of normal traffic during the raid window.
  for (let n = raidArrivals(s, dt); n > 0; n--) spawnCustomer(game, {});
}

export function stationSpeed(game, name) {
  const key = stationKey(name);
  const cfg = game.config;
  const station = cfg.stations[key];
  if (!station) return 0;
  const engaged = !!game.state.manager?.engaged;
  const crewId = engaged ? crewForStation(game, key) : station.crew;
  if (!crewId) return 0;
  const perm = 1 + permanentFrom(game, crewId);
  let action = 1 + (game.state.mods[key] || 0);
  if (game.state.holding && game.state.bottleneck === key) {
    let boost = cfg.hold.boost;
    if (game.state.bigRush?.active) boost *= cfg.bigRush.holdMult || 1;
    if (hasPerk(game.state, 'aaron', 'steadyVoice')) boost += cfg.crew.steadyHold;
    if (hasPerk(game.state, 'aaron', 'pepTalk')) boost += cfg.crew.pepHold;
    action += boost;
  }
  for (const timed of game.state.timed) {
    if (game.state.t < timed.until && timed[key]) action += timed[key];
  }
  if (hasPerk(game.state, 'aaron', 'whistle') && game.state.call.choice) action += cfg.crew.whistleBoost;
  if (game.state.inspector.timer > 0) action *= cfg.inspector.speed;
  let speed = perm * Math.max(game.config.rates.actionFloor, action);
  if (engaged) {
    const mods = managerMods(game);
    speed *= mods.speed * crewEfficiency(game, crewId);
    const up = game.state.manager.upgrades || {};
    if (key === 'grill') speed *= 1 + (up.grill || 0) * (cfg.manager.upgrades.grill?.speed || 0);
    if (key === 'register') speed *= 1 + (up.register || 0) * (cfg.manager.upgrades.register?.speed || 0);
    speed *= 1 + projectBonus(game, key);
  }
  speed *= stationBoost(game.state, key);
  return speed;
}

function permanentFrom(game, crewId) {
  // Local import cycle guard: crew.permanentSpeed is pure.
  const member = game.state.crew[crewId];
  if (!member) return 0;
  const perks = member.perks;
  let sum = 0;
  const levels = game.config.crew.perks[crewId];
  for (const id of perks) {
    for (const list of Object.values(levels)) {
      const def = list.find((p) => p.id === id);
      if (def?.speed) sum += def.speed;
    }
  }
  return Math.min(game.config.crew.speedCap, Math.max(0, sum));
}

export function detectBottleneck(state, config) {
  const cap = config?.stations?.prep?.holdIfGrill ?? 3;
  const grill = state.stations.grill;
  const grillLoad = grill.queue.length + (grill.active ? 1 : 0);
  // Once Ali is stacked, the soft hold belongs on the grill even if the line is long.
  if (grillLoad >= cap) return 'grill';
  let best = 'grill';
  let bestScore = -1;
  for (const name of ['register', 'prep', 'grill', 'assemble', 'serve']) {
    const slot = state.stations[name];
    if (!slot) continue;
    let score = slot.queue.length * 10 + (slot.active ? 6 : 0);
    if (name === 'register') score += Math.min(state.line.length, 3);
    if (name === 'grill') score += 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

function findCustomer(state, id) {
  const hit = state.customers?.find((c) => c.id === id);
  if (hit) return hit;
  return state.line.find((c) => c.id === id) || null;
}

function parentOf(game, work) {
  if (work?.customerId == null) return work;
  return findCustomer(game.state, work.customerId) || work;
}

export function tipFor(game, customer) {
  const eco = game.config.economy;
  const band = eco.prices[game.state.priceBand];
  let tip = eco.tipBase * band.tip * (customer.tipMult || 1);
  if (customer.kind === 'regular' || customer.kind === 'maya') tip *= eco.regularTip;
  if (customer.upsold) tip += game.config.economy.upsellFlatTip;
  if (hasPerk(game.state, 'phillip', 'heavyHand')) tip += game.config.crew.heavyHandTip;
  if (hasPerk(game.state, 'jared', 'receiptPoet')) tip += game.config.crew.receiptTip;
  if (hasPerk(game.state, 'matt', 'smile')) tip += game.config.crew.smileTip;
  if (hasPerk(game.state, 'ali', 'salsaCloud')) tip += game.config.crew.salsaTip;
  for (const crewId of Object.keys(game.state.crew)) {
    for (const perkId of game.state.crew[crewId].perks) {
      const extra = perkDef(game.config, crewId, perkId)?.tip;
      if (extra) tip += extra;
    }
  }
  for (const timed of game.state.timed) {
    if (timed.tipMult && game.state.t < timed.until) tip *= timed.tipMult;
  }
  tip *= managerMods(game).tip;
  return moneyTip(tip);
}

function goldenTip(game) {
  let g = game.config.golden.tip;
  if (hasPerk(game.state, 'ali', 'showman')) g *= game.config.golden.showmanTip;
  const combo = game.state.combo.count || 1;
  g *= 1 + (combo - 1) * game.config.golden.comboStep;
  return moneyTip(g);
}

function recordSale(game, customer, opts = {}) {
  const tip = opts.tip != null ? opts.tip : tipFor(game, customer);
  let food = opts.food != null ? opts.food : money(customer.price * customer.tacos * marginMult(game.state));
  const tacos = opts.tacos != null ? opts.tacos : customer.tacos;
  bookSale(game.state, { food, tip, tacos });
  game.state.story.craft += game.config.story.craftPerSale;
  if (customer.goldenResolved === 'hit') game.state.story.craft += game.config.story.craftPerGoldenSale;
  if (opts.markServed !== false) game.state.sinceServe = 0;
  const golden = customer.goldenResolved === 'hit';
  emit(game, {
    type: 'sale',
    customerId: customer.id,
    regularId: customer.regularId,
    source: customer.source,
    tacos: customer.tacos,
    food,
    tip,
    golden,
    textKey: golden ? 'sale.golden' : 'sale.taco',
    cue: golden ? 'golden.flourish' : 'sale.chime',
  });
  if (opts.resolve !== false) resolveStory(game, customer, 'served');
  if (golden && game.state.combo.count >= 2) {
    emit(game, {
      type: 'combo',
      kind: 'streak',
      comboId: 'golden',
      count: game.state.combo.count,
      textKey: 'combo.streak',
      cue: 'combo.hit',
    });
  }
  return { food, tip };
}

function pullItems(state, customerId) {
  const pulled = [];
  for (const name of ['prep', 'grill', 'assemble', 'serve']) {
    const slot = state.stations[name];
    if (!slot) continue;
    if (slot.active && slot.active.customerId === customerId) {
      pulled.push(slot.active);
      slot.active = null;
    }
    slot.queue = slot.queue.filter((item) => {
      if (item.customerId === customerId) {
        pulled.push(item);
        return false;
      }
      return true;
    });
  }
  return pulled;
}

function refundPaid(game, customer, hurt = REFUND_HURT) {
  if (!customer.paid || !(customer.paidCash > 0)) return 0;
  const total = customer.orderItems?.length || customer.tacos || 1;
  const undelivered = Math.max(0, total - (customer.delivered || 0));
  if (undelivered <= 0) return 0;
  const cap = money(customer.paidCash * hurt);
  let amount = money(customer.paidCash * (undelivered / total) * hurt);
  amount = money(Math.min(amount, Math.max(0, cap - (customer.refunded || 0))));
  if (!(amount > 0)) return 0;
  const day = game.state.dayLedger;
  const foodPeel = Math.min(customer.foodBooked || 0, amount);
  customer.foodBooked = money((customer.foodBooked || 0) - foodPeel);
  day.food = money(day.food - foodPeel);
  const tipPeel = Math.min(customer.tipBooked || 0, amount - foodPeel);
  customer.tipBooked = money((customer.tipBooked || 0) - tipPeel);
  day.tips = money(day.tips - tipPeel);
  day.revenue = money(day.revenue - amount);
  game.state.cash = money(game.state.cash - amount);
  customer.refunded = money((customer.refunded || 0) + amount);
  // Reputation for refunded walkouts is settled once at day end (see manager.js), capped, so a slow
  // lunch cannot erase a quality strategy one refund at a time.
  return amount;
}

function walkOff(game, customer, opts = {}) {
  if (!customer || customer.state === 'leaving') return;
  const s = game.state;
  customer.state = 'leaving';
  const lineAt = s.line.indexOf(customer);
  if (lineAt >= 0) s.line.splice(lineAt, 1);
  if (s.stations.register.active === customer) s.stations.register.active = null;
  const pulled = pullItems(s, customer.id);
  const prepped = pulled.filter((item) => item.prepped);
  if (prepped.length) customer.prepped = true;
  const refund = refundPaid(game, customer, opts.hurt ?? REFUND_HURT);
  if (s.golden.customerId === customer.id) {
    s.golden.customerId = null;
    s.golden.timeLeft = 0;
  }
  s.dayLedger.walkoffs += 1;
  if (prepped.length) s.dayLedger.wasted += prepped.length;
  else if (customer.prepped) s.dayLedger.wasted += customer.tacos || 1;
  const spectacle = customer.source === 'bigRush';
  s.story.trust += spectacle ? (game.config.bigRush?.farewellTrust ?? 0) : game.config.story.trustWalkoff;
  emit(game, {
    type: 'walkoff',
    customerId: customer.id,
    regularId: customer.regularId,
    prepped: customer.prepped,
    farewell: spectacle,
    refund,
    textKey: spectacle ? 'bigRush.farewell' : 'sale.walkoff',
  });
  emit(game, {
    type: 'walkout',
    customerId: customer.id,
    regularId: customer.regularId,
    prepped: customer.prepped,
    refund,
  });
  for (const item of prepped) {
    item.station = 'done';
    emit(game, { type: 'waste', itemId: item.id, customerId: customer.id });
  }
  resolveStory(game, customer, 'walked');
}

function openGolden(game, customer) {
  const cfg = game.config.golden;
  const g = game.state.golden;
  if (!cfg.enabled || game.state.phase !== 'rush') return;
  if (g.customerId) return;
  if (game.state.t < g.nextAt) return;
  customer.golden = true;
  let window = cfg.window;
  if (hasPerk(game.state, 'ali', 'showman')) window *= cfg.showmanWindow;
  g.customerId = customer.id;
  g.timeLeft = window;
  const span = cfg.periodMax <= cfg.periodMin
    ? cfg.periodMin
    : cfg.periodMin + game.rng.next() * (cfg.periodMax - cfg.periodMin);
  g.nextAt = game.state.t + span;
  emit(game, {
    type: 'goldenReady',
    customerId: customer.id,
    window,
    textKey: 'golden.ready',
    cue: 'golden.ready',
  });
}

function chargePlate(game, customer) {
  const s = game.state;
  if (s.inventory.tortillas < customer.tacos) {
    if (!s.stockout) {
      s.stockout = true;
      s.dayLedger.stockout = true;
      emit(game, { type: 'stockout', textKey: 'stockout', tortillas: s.inventory.tortillas });
    }
    return false;
  }
  s.inventory.tortillas -= customer.tacos;
  s.stockout = false;
  const eco = game.config.economy;
  let filling = eco.filling * customer.tacos;
  if (hasPerk(s, 'phillip', 'heavyHand')) filling += game.config.crew.heavyHandCost * customer.tacos;
  if (hasPerk(s, 'phillip', 'scrapSaver')) filling = Math.max(0, filling - game.config.crew.scrapFilling * customer.tacos);
  const costScale = weekModifiers(game).cost;
  filling *= (costScale == null ? 1 : costScale) * difficultyMods(game).cost * managerMods(game).cost;
  const guac = customer.guac ? eco.guac * customer.tacos : 0;
  s.cash = money(s.cash - filling - guac);
  s.dayLedger.fillingPaid = money(s.dayLedger.fillingPaid + filling);
  s.dayLedger.guacPaid = money(s.dayLedger.guacPaid + guac);
  customer.prepped = true;
  if (customer.customerId != null) {
    const parent = findCustomer(s, customer.customerId);
    if (parent) parent.prepped = true;
  }
  return true;
}

function beginStation(game, name, work) {
  const s = game.state;
  let need = game.config.stations[name].base;
  if (name === 'register') work.state = 'ordering';
  if (name === 'register' && hasPerk(s, 'jared', 'upsell') && game.config.crew.upsellChance > 0 && game.rng.next() < game.config.crew.upsellChance) {
    work.upsold = true;
    work.price = money(work.price + game.config.crew.upsellPrice);
    need += game.config.crew.upsellExtra;
  }
  if (name === 'prep') {
    if (s.prepPause > 0) return false;
    if (!chargePlate(game, work)) return false;
    if (hasPerk(s, 'phillip', 'miseEnPlace') && s.preppedBuffer > 0) {
      s.preppedBuffer -= 1;
      need *= game.config.crew.miseFactor;
    }
  }
  if (name === 'grill' && comboUnlocked(s, 'assemblyLine')) {
    const effect = game.config.combos.find((c) => c.id === 'assemblyLine').effect;
    need *= effect.grillNeed;
  }
  if (name === 'serve') {
    const customer = parentOf(game, work);
    if (customer.patienceAtServe == null) {
      customer.patienceAtServe = customer.patienceMax > 0 ? customer.patience / customer.patienceMax : 0;
    }
    if (hasPerk(s, 'matt', 'trayBalance') && s.sinceServe < game.config.crew.trayWindow) need *= game.config.crew.trayFactor;
    if (comboUnlocked(s, 'fastHandoff')) {
      const effect = game.config.combos.find((c) => c.id === 'fastHandoff').effect;
      need *= effect.serveNeed;
    }
    if (comboUnlocked(s, 'versionTwo')) {
      const roll = game.rng.next();
      const effect = game.config.combos.find((c) => c.id === 'versionTwo').effect;
      if (roll < effect.jamChance) {
        s.serveStall = Math.max(s.serveStall, 1);
        emit(game, { type: 'combo', kind: 'proc', comboId: 'versionTwo', pair: ['matt', 'antonio'], textKey: 'combo.versionTwo', cue: 'combo.hit' });
      } else if (roll < effect.jamChance + effect.zipChance) {
        need *= 0.2;
        emit(game, { type: 'combo', kind: 'proc', comboId: 'versionTwo', pair: ['matt', 'antonio'], textKey: 'combo.versionTwo', cue: 'combo.hit' });
      }
    }
    if (!customer.golden) openGolden(game, customer);
  }
  work.station = name === 'prep' ? 'warm' : name === 'serve' ? 'wrap' : name;
  work.progress = 0;
  work.workNeed = need;
  work.heldBy = crewForStation(game, name) || game.config.stations[name]?.crew || null;
  s.stations[name].active = work;
  if (name !== 'register') {
    emit(game, {
      type: 'itemStarted',
      itemId: work.id,
      customerId: work.customerId,
      station: stageLabel(name),
    });
  }
  return true;
}

function payAndSplit(game, customer) {
  const s = game.state;
  const tip = money(tipFor(game, customer) + orderExtra(s, game.rng));
  const food = money(customer.price * (customer.tacos || 1) * marginMult(s));
  const cashBefore = s.cash;
  recordSale(game, customer, { food, tip, tacos: 0, resolve: false, markServed: false });
  customer.paid = true;
  customer.paidCash = money(food + tip);
  customer.foodBooked = food;
  customer.tipBooked = tip;
  customer.state = 'waiting';
  customer.station = 'wait';
  customer.delivered = 0;
  const byCrewId = crewForStation(game, 'register') || game.config.stations.register.crew || 'jared';
  customer.cashierId = byCrewId;
  const n = customer.tacos || 1;
  const type = customer.itemType || 'quad';
  customer.orderItems = [];
  if (!s.items) s.items = [];
  for (let i = 0; i < n; i++) {
    const item = {
      id: s.nextId++,
      customerId: customer.id,
      type,
      station: 'warm',
      progress: 0,
      workNeed: game.config.stations.prep.base,
      heldBy: null,
      prepped: false,
      tacos: 1,
      guac: customer.guac,
      price: customer.price,
      patience: null,
    };
    s.items.push(item);
    customer.orderItems.push({ id: item.id, type });
    s.stations.prep.queue.push(item);
  }
  emit(game, {
    type: 'orderTaken',
    customerId: customer.id,
    tacos: n,
    itemIds: customer.orderItems.map((item) => item.id),
  });
  emit(game, {
    type: 'payment',
    cashBefore, cashAfter: s.cash,
    customerId: customer.id,
    cash: customer.paidCash,
    byCrewId,
  });
}

function markGoldenMiss(game, customer) {
  if (!customer?.golden || customer.goldenResolved) return;
  const s = game.state;
  customer.goldenResolved = 'miss';
  s.dayLedger.goldenMiss += 1;
  emit(game, { type: 'goldenMiss', customerId: customer.id, textKey: 'golden.miss' });
  if (s.golden.customerId === customer.id) {
    s.golden.customerId = null;
    s.golden.timeLeft = 0;
  }
}

function handoffItem(game, item) {
  const s = game.state;
  item.heldBy = null;
  item.station = 'handoff';
  const customer = findCustomer(s, item.customerId);
  emit(game, { type: 'handoff', customerId: item.customerId, itemId: item.id });
  s.dayLedger.tacos += 1;
  s.sinceServe = 0;
  item.station = 'done';
  if (!customer) return;
  customer.delivered = (customer.delivered || 0) + 1;
  const need = customer.orderItems?.length || customer.tacos || 1;
  if (customer.delivered < need) return;
  markGoldenMiss(game, customer);
  if (customer.goldenResolved === 'hit') s.story.craft += game.config.story.craftPerGoldenSale;
  customer.state = 'leaving';
  if (customer.map) {
    customer.map.holdingTaco = true;
    customer.map.receiveAt = s.t;
    customer.map.receiveUntil = s.t + .95; // .55s arc, then .4s receive pose.
  }
  resolveStory(game, customer, 'served');
}

function finishStation(game, name, work) {
  const s = game.state;
  s.throughput[name] = (s.throughput[name] || 0) + 1;
  if (work) work.heldBy = null;
  if (name === 'register') {
    payAndSplit(game, work);
    return;
  }
  emit(game, {
    type: 'itemStageDone',
    itemId: work.id,
    customerId: work.customerId,
    station: stageLabel(name),
  });
  if (name === 'prep') {
    work.station = 'grill';
    s.stations.grill.queue.push(work);
  } else if (name === 'grill') {
    work.station = 'assemble';
    s.stations.assemble.queue.push(work);
  } else if (name === 'assemble') {
    work.station = 'wrap';
    s.stations.serve.queue.push(work);
  } else if (name === 'serve') {
    handoffItem(game, work);
  }
}

function paused(state, name) {
  if (name === 'grill' && state.grillStall > 0) return true;
  if (name === 'prep' && state.prepPause > 0) return true;
  if (name === 'serve' && state.serveStall > 0) return true;
  return false;
}

function kitchenBacklog(state) {
  let n = 0;
  for (const name of ['prep', 'grill', 'assemble', 'serve']) {
    const slot = state.stations[name];
    if (!slot) continue;
    n += slot.queue.length + (slot.active ? 1 : 0);
  }
  return n;
}

function interiorCount(state) {
  if (state.customers) {
    let n = 0;
    for (const c of state.customers) {
      if (c.state === 'ordering' || c.state === 'waiting') n += 1;
    }
    return n;
  }
  let n = 0;
  for (const slot of Object.values(state.stations)) n += slot.queue.length + (slot.active ? 1 : 0);
  return n;
}

function tryPull(game, name) {
  const s = game.state;
  const slot = s.stations[name];
  if (slot.active || paused(s, name)) return;
  if (name === 'register') {
    if (interiorCount(s) >= interiorCap(game)) return;
    const cap = game.config.stations.prep.holdIfGrill ?? 3;
    if (kitchenBacklog(s) >= cap) return;
  }
  // Phillip does not bury Ali. A long grill queue means the line waits before food is committed.
  if (name === 'prep') {
    const grill = s.stations.grill;
    const ahead = grill.queue.length + (grill.active ? 1 : 0);
    const cap = game.config.stations.prep.holdIfGrill ?? 3;
    if (ahead >= cap) return;
  }
  const src = name === 'register' ? s.line : slot.queue;
  if (!src.length) return;
  if (name === 'register' && game.config.quadFlow && src[0].map?.journey !== 'queue') return;
  if (beginStation(game, name, src[0])) src.shift();
}

function patienceRate(game, where) {
  let mult = 1 + (game.state.mods.patienceDrain || 0);
  if (game.state.holding && hasPerk(game.state, 'aaron', 'readTheQuad')) mult *= game.config.crew.readTheQuadDrain;
  if (adviceActive(game.state)) mult *= game.config.west.adviceDrain;
  for (const timed of game.state.timed) {
    if (timed.patienceDrain && game.state.t < timed.until) mult += timed.patienceDrain;
  }
  return Math.max(game.config.rates.patienceMinMult, mult) * game.config.patience[where];
}

function tickPatience(game, dt) {
  const s = game.state;
  const doomed = [];
  const people = s.customers || s.line;
  for (const c of people) {
    if (!c || c.patience == null) continue;
    if (c.state === 'leaving' || c.state === 'served' || c.state === 'passing') continue;
    let where = 'line';
    if (c.state === 'ordering') where = 'active';
    else if (c.state === 'waiting') where = 'active';
    else if (c.state && c.state !== 'line') where = 'queue';
    c.patience -= patienceRate(game, where) * dt;
    if (c.patience <= 0) doomed.push(c);
  }
  for (const c of doomed) walkOff(game, c);
}

export function stepPipeline(game, dt) {
  const s = game.state;
  relinkEntities(s);
  stepQuadFlow(game, dt);
  s.sinceServe += dt;
  for (const name of game.config.stationOrder) {
    const c = s.stations[name].active;
    if (!c || paused(s, name) || !quadWorkReady(game, name, c)) continue;
    c.progress += dt * stationSpeed(game, name);
    if (c.progress >= c.workNeed - 1e-9) {
      s.stations[name].active = null;
      finishStation(game, name, c);
    }
  }
  if (s.grillStall > 0) s.grillStall = Math.max(0, s.grillStall - dt);
  if (s.prepPause > 0) s.prepPause = Math.max(0, s.prepPause - dt);
  if (s.serveStall > 0) s.serveStall = Math.max(0, s.serveStall - dt);
  tickPatience(game, dt);
  for (const name of [...game.config.stationOrder].reverse()) tryPull(game, name);
  for (const name of game.config.stationOrder) tryPull(game, name);
  const next = detectBottleneck(s, game.config);
  if (next !== s.bottleneck) {
    s.bottleneck = next;
    if (['calm', 'telegraph', 'rush'].includes(s.phase)) {
      emit(game, { type: 'bottleneck', station: next, crewId: game.config.stations[next].crew });
    }
  }
  let waiting = peopleAtStand(s);
  if (waiting > s.dayLedger.peakLine) s.dayLedger.peakLine = waiting;
  if (s.line.length > (s.dayLedger.peakRegister || 0)) s.dayLedger.peakRegister = s.line.length;
  if (!s.bodies) initBodies(s);
  stepHaul(s, dt);
  placeAll(s);
  servePromo(game, dt);
}

// A fitting ad buy, once the grill has a real level, cooks a tray beside the line.
// The rope stays at marketing.hold so the lunch still looks full.
function servePromo(game, dt) {
  const s = game.state;
  const m = s.manager;
  if (!m?.engaged || !m.promoLeft) return;
  if (s.phase !== 'calm' && s.phase !== 'telegraph' && s.phase !== 'rush') return;
  const tune = game.config.manager?.marketing || {};
  const hold = tune.hold ?? 8;
  const every = tune.every ?? 3.2;
  s.promoCredit = (s.promoCredit || 0) + dt;
  while (s.promoCredit >= every && m.promoLeft > 0 && s.line.length >= hold) {
    const customer = s.line[0];
    if (!chargePlate(game, customer)) {
      s.promoCredit = 0;
      return;
    }
    s.promoCredit -= every;
    s.line.shift();
    // A promo-tray taco is pre-made, but it is still paid at Jared's window and handed to that customer.
    payAndSplit(game, customer);
    for (const row of customer.orderItems || []) {
      const item = s.items.find((it) => it.id === row.id);
      if (!item) continue;
      const q = s.stations.prep.queue;
      if (q.includes(item)) q.splice(q.indexOf(item), 1);
      item.prepped = true;
      handoffItem(game, item);
      s.items.splice(s.items.indexOf(item), 1);
    }
    m.promoLeft -= 1;
    s.dayLedger.promoSold = (s.dayLedger.promoSold || 0) + (customer.tacos || 1);
  }
}

export function stepGolden(game, dt) {
  const g = game.state.golden;
  if (!g.customerId) return;
  g.timeLeft -= dt;
  if (g.timeLeft > 0) return;
  const customer = findCustomer(game.state, g.customerId);
  if (customer && !customer.goldenResolved) {
    customer.goldenResolved = 'miss';
    game.state.dayLedger.goldenMiss += 1;
    emit(game, { type: 'goldenMiss', customerId: customer.id, textKey: 'golden.miss' });
  }
  g.customerId = null;
  g.timeLeft = 0;
}

export function tapGolden(game) {
  const g = game.state.golden;
  if (!g.customerId || g.timeLeft <= 0) return { ok: false, reason: 'no-window' };
  const customer = findCustomer(game.state, g.customerId);
  if (!customer || customer.goldenResolved) return { ok: false, reason: 'no-window' };
  customer.goldenResolved = 'hit';
  const combo = game.state.combo;
  if (game.state.t - combo.lastHitAt <= game.config.golden.comboWindow) combo.count += 1;
  else combo.count = 1;
  combo.lastHitAt = game.state.t;
  game.state.dayLedger.goldenHit += 1;
  if (combo.count > game.state.dayLedger.bestCombo)   game.state.dayLedger.bestCombo = combo.count;
  game.state.story.craft += game.config.story.craftPerGoldenTap;
  game.state.story.trust += game.config.story.trustPerGoldenTap;
  bookSale(game.state, { food: 0, tip: goldenTip(game), tacos: 0 });
  emit(game, {
    type: 'goldenHit',
    customerId: customer.id,
    combo: combo.count,
    textKey: 'golden.hit',
    cue: 'golden.flourish',
  });
  g.customerId = null;
  g.timeLeft = 0;
  noteDecision(game);
  return { ok: true, combo: combo.count };
}

export function flushRemaining(game) {
  const s = game.state;
  const leftover = (s.customers || []).filter((c) => c.state === 'line' || c.state === 'ordering' || c.state === 'waiting');
  if (!s.customers) {
    leftover.push(...s.line);
    for (const name of game.config.stationOrder) {
      leftover.push(...s.stations[name].queue);
      if (s.stations[name].active) leftover.push(s.stations[name].active);
    }
  }
  for (const c of leftover) walkOff(game, c, { hurt: 1 });
}

export function callTheLine(game, choice) {
  const s = game.state;
  const cfg = game.config.call;
  if (s.phase !== 'rush') return { ok: false, reason: 'wrong-phase' };
  if (s.phaseT < cfg.openAt || s.phaseT > cfg.closeAt) return { ok: false, reason: 'wrong-phase' };
  if (s.call.used) return { ok: false, reason: 'already-used' };
  const def = cfg.choices[choice];
  if (!def) return { ok: false, reason: 'unknown-choice' };
  s.call.used = true;
  s.call.choice = choice;
  let scale = 1;
  if (hasPerk(s, 'aaron', 'steadyVoice')) scale += game.config.crew.steadyScale;
  const speedScale = scale * (s.bigRush?.active ? (game.config.bigRush.callMult || 1) : 1);
  for (const name of game.config.stationOrder) {
    if (def[name]) s.mods[name] += def[name] * speedScale;
  }
  s.mods.patienceDrain += def.patienceDrain || 0;
  if (choice === 'feedTheRegular') {
    s.mods.priorityRegular = true;
    const idx = s.line.findIndex((c) => c.regularId || c.kind === 'maya' || c.kind === 'regular');
    if (idx > 0) {
      const [c] = s.line.splice(idx, 1);
      s.line.unshift(c);
    }
    s.story.trust += game.config.story.trustCallRegular;
  }
  s.dayLedger.callId = choice;
  emit(game, { type: 'callTheLine', choice, textKey: def.textKey, cue: 'aaron.whistle' });
  procCombos(game, choice);
  noteDecision(game);
  return { ok: true };
}

export function restock(game, count) {
  const s = game.state;
  const n = Math.floor(count);
  if (!(n > 0)) return { ok: false, reason: 'bad-count' };
  if (s.phase === 'summary') return { ok: false, reason: 'wrong-phase' };
  const emergency = s.phase === 'rush' || s.phase === 'telegraph' || s.phase === 'closing';
  const eco = game.config.economy;
  let unit = emergency ? eco.tortillaEmergency : eco.tortilla;
  unit *= restockMult(s);
  const room = eco.tortillaCap - s.inventory.tortillas;
  if (room <= 0) return { ok: false, reason: 'full' };
  const affordable = Math.floor((s.cash + 1e-6) / unit);
  if (affordable <= 0) return { ok: false, reason: 'cant-afford' };
  const buy = Math.min(n, room, affordable);
  const cost = money(buy * unit);
  s.cash = money(s.cash - cost);
  s.inventory.tortillas += buy;
  s.dayLedger.purchases = money(s.dayLedger.purchases + cost);
  s.dayLedger.tortillasBought += buy;
  s.stockout = false;
  if (emergency) s.prepPause = Math.max(s.prepPause, 3.5);
  if (!s.bodies) initBodies(s);
  s.haul = { crewId: 'phillip', phase: 'out', left: 1.2, total: 1.2 };
  if (comboUnlocked(s, 'freightGuy') && !s.dayLedger.freightProc) {
    s.dayLedger.freightProc = true;
    procCombos(game, 'restock');
  }
  emit(game, {
    type: 'restock',
    count: buy,
    cost,
    emergency,
    textKey: emergency ? 'restock.emergency' : 'restock.ok',
  });
  noteDecision(game);
  return { ok: true, count: buy, cost };
}

export function stepTimed(game) {
  game.state.timed = game.state.timed.filter((t) => game.state.t < t.until);
}
