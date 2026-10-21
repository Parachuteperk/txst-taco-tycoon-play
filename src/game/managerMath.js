// Pure reads of the manager plan. No imports, so the pipeline can use them
// without a cycle through the director.

export function stickerPrice(game) {
  const m = game.state.manager;
  const prices = game.config.economy.prices;
  const fair = prices.fair?.price || 4.25;
  const band = prices[m?.strategy?.price]?.price || fair;
  const menu = houseItem(game);
  const focus = game.config.manager?.focus?.[m?.strategy?.focus] || game.config.manager?.focus?.balance || { price: 1 };
  const menuMul = menu?.price ? menu.price / fair : 1;
  return band * menuMul * (focus.price || 1);
}

export function managerMods(game) {
  const identity = { demand: 1, speed: 1, tip: 1, price: 1, cost: 1, line: 1 };
  const m = game.state.manager;
  const tune = game.config.manager;
  if (!m?.engaged || !tune) return identity;
  const portion = tune.portion[m.strategy.portion] || tune.portion.regular;
  const focus = tune.focus[m.strategy.focus] || tune.focus.balance;
  const line = tune.line[m.strategy.line] ?? 1;
  const menu = houseItem(game);
  const bandPrice = game.config.economy.prices[m.strategy.price]?.price || menu?.price || 1;
  const rep = reputationMods(game);
  let demand = portion.demand * (menu?.popularity ?? 1);
  demand *= tune.elasticity?.[m.strategy.price] ?? 1;
  demand += (m.upgrades.neon || 0) * (tune.upgrades.neon.demand || 0);
  const dev = m.dev || {};
  demand += (dev.marketingReach || 0) * (tune.projects?.marketingReach?.demand || 0);
  demand += (dev.antonioSoft || 0) * (tune.projects?.antonioSoft?.demand || 0);
  const steal = rivalSteal(game);
  if (m.rivalToday) m.rivalToday.steal = steal;
  demand *= 1 - steal;
  const fit = forecastFit(game);
  demand *= 1 + (fit - 0.5) * (tune.forecast?.fitSwing || 0);
  demand *= rep.demand;
  let tip = portion.tip * focus.tip * rep.tip;
  tip *= 1 + (m.upgrades.tipJar || 0) * (tune.upgrades.tipJar.tip || 0);
  tip *= 1 + (dev.antonioSoft || 0) * (tune.projects?.antonioSoft?.tip || 0);
  if (m.tipBoost && m.tipBoost !== 1) tip *= m.tipBoost;
  let speed = focus.speed * (1 + chemistrySpeed(game));
  return {
    demand,
    speed,
    tip,
    price: stickerPrice(game) / bandPrice,
    cost: portion.cost * (menu ? menu.cost / game.config.economy.filling : 1),
    line,
  };
}

export function houseItem(game) {
  const menu = game.state.manager?.menu;
  const tune = game.config.manager?.menu || [];
  if (!menu) return null;
  const pool = tune.filter((item) => (menu.enabled || []).includes(item.id));
  return pool.find((item) => item.id === menu.featured) || pool[0] || null;
}

export function crewForStation(game, name) {
  const key = name === 'warm' ? 'prep' : name === 'wrap' ? 'serve' : name;
  const m = game.state.manager;
  if (!m?.engaged) return game.config.stations[key]?.crew || null;
  const found = Object.entries(m.staff).find(([, row]) => row.station === key && row.shift);
  return found ? found[0] : null;
}

export function crewEfficiency(game, id) {
  const m = game.state.manager;
  const tune = game.config.manager;
  if (!m?.engaged || !tune) return 1;
  const staff = m.staff[id];
  if (!staff?.shift) return tune.closed;
  const span = tune.morale.span || 400;
  const morale = (staff.morale - tune.morale.start) / span;
  const fatigue = staff.fatigue * tune.fatigue.weight;
  const raw = 1 + morale - fatigue;
  return Math.max(tune.effFloor, Math.min(tune.effCap, raw));
}

export function projectBonus(game, station) {
  const m = game.state.manager;
  const projects = game.config.manager?.projects;
  if (!m?.engaged || !projects) return 0;
  const dev = m.dev || {};
  if (station === 'grill') return (dev.grillTech || 0) * (projects.grillTech?.speed || 0);
  if (station === 'prep') return (dev.prepLine || 0) * (projects.prepLine?.speed || 0);
  return 0;
}

export function chemistrySpeed(game) {
  const m = game.state.manager;
  const pairs = game.config.manager?.chemistry?.pairs || [];
  if (!m?.engaged) return 0;
  let extra = 0;
  for (const pair of pairs) {
    if (pair.ids.every((id) => m.staff[id]?.shift)) extra += pair.speed || 0;
  }
  return extra;
}

export function rivalSteal(game) {
  const m = game.state.manager;
  const tune = game.config.manager?.rival;
  const rival = m?.rivalToday;
  if (!m?.engaged || !rival?.present || !tune) return 0;
  const menu = houseItem(game);
  const price = stickerPrice(game);
  const gap = (price - rival.price) / Math.max(0.5, rival.price);
  const focus = game.config.manager.focus[m.strategy.focus] || game.config.manager.focus.balance;
  let steal = tune.base;
  if (gap > 0) steal += gap * tune.priceWeight;
  else steal += gap * (tune.undercut ?? tune.priceWeight);
  steal -= Math.max(0, (focus.speed || 1) - (rival.speed || 1)) * tune.speedWeight;
  if (menu?.id && menu.id !== 'quad') steal -= tune.special || 0;
  const min = tune.min ?? 0;
  if (steal < min) steal = min;
  if (steal > tune.max) steal = tune.max;
  return Math.round(steal * 1000) / 1000;
}

export function crowdRow(game) {
  const m = game.state.manager;
  if (!m?.engaged) return null;
  const id = m.forecastToday?.crowd || 'steady';
  return game.config.manager?.crowd?.[id] || null;
}

export function arrivalCrowd(game) {
  const row = crowdRow(game);
  if (!row) return 1;
  let mult = row.demand ?? 1;
  const phase = game.state.phase;
  const until = row.earlyUntil ?? 36;
  if (phase === 'calm' || phase === 'telegraph' || (phase === 'rush' && (game.state.phaseT || 0) < until)) {
    mult *= row.early ?? 1;
  }
  return mult;
}

export function crowdLineCap(game) {
  if (game.state.bigRush?.active) return null;
  const row = crowdRow(game);
  return row?.cap ?? null;
}

export function interiorCap(game) {
  const tune = game.config.manager?.capacity;
  if (!game.state.manager?.engaged || !tune) return Infinity;
  return tune.interior ?? 4;
}

export function reputationMods(game) {
  const m = game.state.manager;
  const tune = game.config.manager?.reputation;
  if (!m?.engaged || !tune) return { demand: 1, tip: 1, regulars: 0 };
  const origin = tune.origin ?? 20;
  const d = ((m.reputation ?? origin) - origin) / 100;
  return {
    demand: 1 + d * (tune.demand || 0),
    tip: 1 + d * (tune.tip || 0),
    regulars: d * (tune.regulars || 0),
  };
}

// The drawn crowd is the real register line. A Big Rush reports everyone at the stand
// once that wave is the larger number. No phantom customers are added.
export function visualCrowdCount(lineLength, atStand, state) {
  const line = Math.max(0, lineLength || 0);
  const stand = Math.max(line, atStand || 0);
  if (state?.bigRush?.active) return stand;
  return line;
}

export function forecastFit(game) {
  const m = game.state.manager;
  const today = m?.forecastToday;
  const tune = game.config.manager?.forecast;
  if (!m?.engaged || !today || !tune) return 0.5;
  const strategy = m.strategy;
  let score = 0;
  if (today.crowd === 'heavy') {
    score += (strategy.hold === 'auto' ? 0.34 : 0) + (strategy.call === 'auto' ? 0.33 : 0) + (strategy.restock === 'planned' ? 0.33 : 0);
  } else if (today.crowd === 'light') {
    score += 0.45 + (strategy.hack === 'low' ? 0.25 : 0) + (m.marketing?.gameDay ? 0 : 0.3);
  } else score += 0.62;
  if (today.dale === 'high') score += strategy.hack === 'low' ? 1 : strategy.hack === 'med' ? 0.4 : 0.05;
  else if (today.dale === 'low') score += strategy.hack === 'high' ? 0.85 : strategy.hack === 'med' ? 0.7 : 0.45;
  else score += strategy.hack === 'med' ? 0.8 : 0.55;
  if (today.weather === 'rain') score += strategy.focus === 'speed' ? 0.4 : 0.75;
  else if (today.weather === 'hot') score += strategy.focus === 'speed' ? 0.85 : 0.5;
  else score += 0.7;
  return Math.max(0, Math.min(1, score / 3));
}
