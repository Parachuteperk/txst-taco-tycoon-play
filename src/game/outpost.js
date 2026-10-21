import { touchAchievements } from './achievements.js';
import { emit } from './events.js';
import { noteDecision } from './pacing.js';
import { bookSale, payCapex } from './economy.js';
import { money } from './util.js';

export function tierByNumber(config, tier) {
  return config.outpost.tiers.find((t) => t.tier === tier) || null;
}

function liveTier(game) {
  const base = tierByNumber(game.config, game.state.outpost.tier);
  const over = game.config.outpost.simOverride;
  if (!over || !base?.simulated) return base;
  return { ...base, ...over };
}

function sellInterval(game, tier) {
  const spot = game.config.outpost.spots[game.state.outpost.spot];
  const quirk = game.config.outpost.quirks[game.state.outpost.quirk];
  return (tier.sellEvery / spot.traffic) * (quirk.sellMult || 1);
}

function walkTime(game) {
  const spot = game.config.outpost.spots[game.state.outpost.spot];
  const quirk = game.config.outpost.quirks[game.state.outpost.quirk];
  return spot.walk * (quirk.walkMult || 1);
}

function openForSales(phase) {
  return phase === 'calm' || phase === 'telegraph' || phase === 'rush';
}

export function hireOutpost(game, opts = {}) {
  const s = game.state;
  if (s.outpost) return { ok: false, reason: 'already-hired' };
  if (s.phase !== 'summary' && s.phase !== 'preopen') return { ok: false, reason: 'wrong-phase' };
  const spotId = opts.spot;
  const quirkId = opts.quirk || 'shy';
  if (!game.config.outpost.spots[spotId]) return { ok: false, reason: 'unknown-spot' };
  if (!game.config.outpost.quirks[quirkId]) return { ok: false, reason: 'unknown-quirk' };
  const tier = tierByNumber(game.config, 1);
  if (!opts.paid) {
    if (s.cash < tier.cost) return { ok: false, reason: 'cant-afford' };
    payCapex(s, tier.cost);
  }
  const names = game.config.outpost.freshmanNames;
  const name = opts.name || names[game.rng.int(names.length)];
  s.outpost = {
    tier: 1,
    tierId: tier.id,
    spot: spotId,
    quirk: quirkId,
    name,
    stock: 0,
    status: 'restocking',
    timer: game.config.outpost.bootTimer,
    soldToday: 0,
    restocksToday: 0,
    lifetimeSold: 0,
    friendCount: 0,
  };
  emit(game, {
    type: 'outpostHired',
    spot: spotId,
    quirk: quirkId,
    name,
    tier: 1,
    textKey: 'outpost.hired',
    spotKey: game.config.outpost.spots[spotId].textKey,
  });
  noteDecision(game);
  touchAchievements(game);
  return { ok: true };
}

export function upgradeOutpost(game) {
  const s = game.state;
  if (!s.outpost) return { ok: false, reason: 'not-hired' };
  if (s.phase !== 'summary' && s.phase !== 'preopen') return { ok: false, reason: 'wrong-phase' };
  const next = tierByNumber(game.config, s.outpost.tier + 1);
  if (!next) return { ok: false, reason: 'max-tier' };
  if (!next.simulated) return { ok: false, reason: 'tier-not-simulated' };
  if (s.cash < next.cost) return { ok: false, reason: 'cant-afford' };
  payCapex(s, next.cost);
  s.outpost.tier = next.tier;
  s.outpost.tierId = next.id;
  emit(game, { type: 'outpostUpgrade', tier: next.tier, tierId: next.id, textKey: 'outpost.upgrade' });
  noteDecision(game);
  touchAchievements(game);
  return { ok: true };
}

export function setOutpostSpot(game, spotId) {
  const s = game.state;
  if (!s.outpost) return { ok: false, reason: 'not-hired' };
  if (s.phase !== 'summary' && s.phase !== 'preopen') return { ok: false, reason: 'wrong-phase' };
  if (!game.config.outpost.spots[spotId]) return { ok: false, reason: 'unknown-spot' };
  const locations = s.manager?.locations;
  if (s.manager?.engaged && Array.isArray(locations) && !locations.includes(spotId)) {
    return { ok: false, reason: 'locked' };
  }
  s.outpost.spot = spotId;
  return { ok: true };
}

function sellOne(game, tier) {
  const o = game.state.outpost;
  const quirk = game.config.outpost.quirks[o.quirk];
  o.stock -= 1;
  o.soldToday += 1;
  o.lifetimeSold += 1;
  o.friendCount += 1;
  const free = quirk.freeChance > 0 && game.rng.next() < quirk.freeChance;
  const friend = quirk.friendEvery && o.friendCount % quirk.friendEvery === 0;
  const filling = game.config.economy.filling;
  if (free) {
    bookSale(game.state, { food: 0, tip: 0, filling, tacos: 1, outpost: true });
    emit(game, { type: 'outpostSale', free: true, price: 0, tip: 0, spot: o.spot, textKey: 'outpost.hired', cue: 'sale.chime.soft' });
    return;
  }
  const price = money(tier.price + (quirk.priceAdd || 0));
  let tip = game.config.outpost.tip * (quirk.tipMult || 1);
  if (friend) tip += quirk.friendTip || 0;
  tip = money(tip);
  bookSale(game.state, { food: price, tip, filling, tacos: 1, outpost: true });
  emit(game, {
    type: 'outpostSale',
    free: false,
    price,
    tip,
    spot: o.spot,
    friend: !!friend,
    textKey: 'sale.taco',
    cue: 'sale.chime.soft',
  });
}

export function stepOutpost(game, dt) {
  const o = game.state.outpost;
  if (!o || game.state.phase === 'summary') return;
  const tier = liveTier(game);
  if (!tier?.simulated) return;
  o.timer -= dt;
  if (o.timer > 0) return;
  if (o.status === 'selling') {
    if (!openForSales(game.state.phase)) {
      o.timer = 0.5;
      return;
    }
    if (o.stock <= 0) {
      o.status = 'walkingBack';
      o.timer = walkTime(game);
      emit(game, { type: 'outpostRestock', phase: 'leave', amount: 0, textKey: 'outpost.restock' });
      return;
    }
    sellOne(game, tier);
    o.timer = sellInterval(game, tier);
    return;
  }
  if (o.status === 'walkingBack') {
    o.status = 'restocking';
    o.timer = tier.restockTime;
    return;
  }
  if (o.status === 'restocking') {
    const want = tier.capacity - o.stock;
    const take = Math.min(want, game.state.inventory.tortillas);
    if (take <= 0) {
      o.timer = 1;
      return;
    }
    game.state.inventory.tortillas -= take;
    o.stock += take;
    o.restocksToday += 1;
    game.state.dayLedger.outpostRestocks += 1;
    emit(game, { type: 'outpostRestock', phase: 'fill', amount: take, stock: o.stock, textKey: 'outpost.restock' });
    o.status = 'walkingOut';
    o.timer = walkTime(game);
    return;
  }
  if (o.status === 'walkingOut') {
    o.status = 'selling';
    o.timer = Math.min(1, sellInterval(game, tier));
  }
}

export function refreshOutpostDay(game) {
  const state = game.state;
  if (!state.outpost) return;
  const o = state.outpost;
  o.soldToday = 0;
  o.restocksToday = 0;
  if (o.stock > 0) {
    o.status = 'selling';
    o.timer = 1;
  } else {
    o.status = 'restocking';
    o.timer = game.config.outpost.bootTimer;
  }
}
