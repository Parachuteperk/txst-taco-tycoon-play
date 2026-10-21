// Signature mechanics (design bible §9.5-§9.10; Aaron's overrides: every signature purchasable, no lock).
// Every mechanic is inert unless its node is owned. Rolls use per-run side seeds, never the rush RNG.
// Simplifications are flagged inline (no vibe/quality/West-pull/weather simulation exists yet).
import { createRng, hashSeed } from './rng.js';
import { findNode } from './upgrades.js';

const money = (n) => Math.round(n * 100) / 100;
const HOUR = 75; // game seconds per game hour (bible §9.1)
export const OFFER_SECONDS = 20;
const SERVICE = ['calm', 'telegraph', 'rush', 'closing'];

const owns = (s, id) => !!s.manager?.tree?.owned.includes(id);
const P = (id) => findNode(id)?.effects || {};
const roll = (s, salt) => createRng(hashSeed(`${s.runSeed ?? ''}:${s.day}:sig:${salt}`));
const tickRoll = (s, salt) => createRng(hashSeed(`${s.runSeed ?? ''}:${s.day}:${salt}:${s.step}`));

export function ensureSig(state) {
  const tree = state.manager?.tree;
  if (!tree) return null;
  if (!tree.sig) {
    tree.sig = {
      cannon: { jam: 0, misfires: 0 },
      mealPrep: { portions: 0, madeDay: -99, tacosSeen: 0 },
      hacky: { streak: 0, best: 0, sulk: 0, kickT: 0, idle: 0 },
      grackle: { coins: 0 },
      surge: { mult: 1, t: 0, gougeT: 0 },
      franchise: { sites: [], lastOpenDay: -99, pausedUntil: 0, royalties: 0 },
      raid: { lastDay: -99, active: null, served: 0 },
      crypto: { mined: 0, stall: 0, hourT: 0 },
      angel: { rounds: 0, share: 0, skimmed: 0 },
      takeover: { lastDay: -99, failedUntil: 0 },
      popUp: { lastDay: -99, active: false },
      offers: [],
      policies: {},
      nextOffer: 1,
    };
  }
  return tree.sig;
}

// ---------------------------------------------------------------------------------------------------------
// Multipliers read by the pipeline (all 1 when nothing is owned).
export function signatureSpeed(state, key) {
  const sig = state.manager?.tree?.sig;
  if (!sig) return 1;
  let mult = 1;
  if (key === 'prep' && owns(state, 'phillip_tortilla_cannon')) mult *= sig.cannon.jam > 0 ? 0.6 : 1 + (P('phillip_tortilla_cannon').prepSpeed || 0);
  // Meal Prep Sunday: assembly from the batch takes 2 s instead of 8 s while portions last.
  if (key === 'assemble' && sig.mealPrep.portions > 0) mult *= 8 / (P('phillip_meal_prep_sunday').mealPrepAssemblySeconds || 2);
  return mult;
}

export function signatureDemand(state) {
  const sig = state.manager?.tree?.sig;
  if (!sig) return 1;
  let d = 1;
  if (owns(state, 'ali_special')) d += P('ali_special').crowdPull || 0;
  if (owns(state, 'matt_hacky_sack')) {
    const p = P('matt_hacky_sack');
    d += Math.min(p.hackyCrowdPullCap || 0.12, Math.floor(sig.hacky.streak / 10) * (p.crowdPullPer10Kicks || 0.005));
  }
  if (state.manager.tree.flags.includes('takeover_won')) d += P('west_hostile_takeover').takeoverWinArrivals || 0;
  if (sig.popUp.active) d *= P('west_designer_popup').popUpArrivalMult || 0.45;
  return d;
}

export function signaturePrice(state) {
  const sig = state.manager?.tree?.sig;
  if (!sig) return 1;
  let p = 1;
  if (owns(state, 'aaron_surge_board')) p *= sig.surge.mult;
  if (owns(state, 'ali_special')) p *= 1.1; // placeholder: the Ali Special sells ~10% over the house taco
  if (sig.popUp.active) p *= P('west_designer_popup').popUpPriceMult || 3;
  return p;
}

// ---------------------------------------------------------------------------------------------------------
// Offers: non-blocking cards; the standing policy answers after 20 s (default decline).
function offer(sig, type, text, data = {}) {
  if (sig.offers.some((o) => o.type === type)) return null;
  const row = { id: `${type}-${sig.nextOffer++}`, type, text, remaining: OFFER_SECONDS, open: true, ...data };
  sig.offers.push(row);
  return row;
}

export function setOfferPolicy(game, key, value) {
  const sig = ensureSig(game.state);
  if (!sig) return { ok: false, reason: 'unavailable' };
  sig.policies[key] = value;
  return { ok: true };
}

export function chooseOffer(game, { id, choice } = {}, emit) {
  const s = game.state;
  const sig = ensureSig(s);
  const row = sig?.offers.find((o) => o.id === id || o.type === id);
  if (!row) return { ok: false, reason: 'closed' };
  sig.offers.splice(sig.offers.indexOf(row), 1);
  const accept = choice === 'accept' || choice === 'yolo';
  const out = { ok: true, id: row.id, type: row.type, accepted: accept };
  if (row.type === 'angel-round' && accept) {
    s.cash = money(s.cash + row.cash);
    sig.angel.rounds += 1;
    sig.angel.share = Math.min(0.5, sig.angel.share + row.share);
    out.cash = row.cash;
  }
  if (row.type === 'twitch-raid' && accept) {
    const p = P('antonio_twitch_raid');
    sig.raid.active = { left: row.size, until: s.t + (p.raidWindowHours || 1) * HOUR, credit: 0 };
    sig.raid.lastDay = s.day;
    out.size = row.size;
  }
  if (row.type === 'hostile-takeover' && accept) {
    const p = P('west_hostile_takeover');
    sig.takeover.lastDay = s.day;
    if (s.cash < p.takeoverPrice) { out.ok = false; out.reason = 'cant-afford'; return out; }
    s.cash = money(s.cash - p.takeoverPrice);
    const stars = (s.manager.reputation || 0) / 20;
    const odds = Math.min(p.takeoverOddsCap || 0.95, (p.takeoverBaseOdds || 0.8) + Math.max(0, Math.round((stars - 4) * 10)) * (p.takeoverOddsPerTenthStar || 0.05) - (choice === 'yolo' ? 0 : 0));
    out.won = roll(s, 'takeover').next() < odds;
    if (out.won) { if (!s.manager.tree.flags.includes('takeover_won')) s.manager.tree.flags.push('takeover_won'); }
    else { s.cash = money(s.cash - (p.takeoverFailFee || 450)); sig.takeover.failedUntil = s.day + (p.takeoverFailExtraDays || 2); }
  }
  if (row.type === 'franchise-scandal') {
    const p = P('aaron_franchise_deal');
    if (accept) { // ride it out: reputation hit, flags pause
      s.manager.reputation = Math.max(0, (s.manager.reputation || 0) + (p.scandalRep || -0.15) * 20);
      sig.franchise.pausedUntil = s.day + (p.scandalPauseDays || 2);
    } else { // cut the flag loose
      sig.franchise.sites.pop();
    }
  }
  emit?.({ type: 'offerResolved', ...out });
  return out;
}

export function cutFranchise(game, siteId, emit) {
  const sig = ensureSig(game.state);
  const k = sig?.franchise.sites.findIndex((site) => site.id === siteId) ?? -1;
  if (k < 0) return { ok: false, reason: 'unknown-choice' };
  sig.franchise.sites.splice(k, 1);
  emit?.({ type: 'franchiseCut', siteId });
  return { ok: true };
}

export function setSurgeCap(game, cap) {
  const sig = ensureSig(game.state);
  if (!sig) return { ok: false, reason: 'unavailable' };
  sig.surge.cap = Math.max(1, Math.min(P('aaron_surge_board').surgeMax || 1.35, Number(cap) || 1.2));
  return { ok: true, cap: sig.surge.cap };
}

// ---------------------------------------------------------------------------------------------------------
export function signaturesMorning(game, emit) {
  const s = game.state;
  const sig = ensureSig(s);
  if (!sig) return;
  sig.offers = [];
  sig.raid.active = null;
  sig.popUp.active = false;
  sig.hacky.streak = 0;
  sig.mealPrep.tacosSeen = 0;
  const era = s.manager.tree.era;
  if (owns(s, 'phillip_meal_prep_sunday')) {
    const p = P('phillip_meal_prep_sunday');
    if (s.day - sig.mealPrep.madeDay >= (p.mealPrepShelfDays || 2)) sig.mealPrep.portions = 0;
    if (s.day - sig.mealPrep.madeDay >= (p.mealPrepCooldownNights || 2)) { sig.mealPrep.portions = p.mealPrepPortions || 80; sig.mealPrep.madeDay = s.day; emit({ type: 'mealPrep', portions: sig.mealPrep.portions }); }
  }
  if (owns(s, 'west_angel_round') && sig.angel.rounds < (P('west_angel_round').angelRoundsPerRun || 1) && era >= 2) {
    const p = P('west_angel_round');
    const late = era >= 3;
    offer(sig, 'angel-round', `Mrs. West offers ${late ? '$1,200 for 15%' : '$600 for 10%'} of the stand.`, { cash: late ? p.angelCashE3 : p.angelCashE2, share: late ? p.angelShareE3 : p.angelShareE2 });
  }
  if (owns(s, 'antonio_twitch_raid')) {
    const p = P('antonio_twitch_raid');
    const r = roll(s, 'raid');
    if (s.day - sig.raid.lastDay >= (p.raidCooldownDays || 2) && r.next() < (p.raidLandChance || 0.7)) {
      const size = Math.round((p.raidSizeMin || 40) + r.next() * ((p.raidSizeMax || 60) - (p.raidSizeMin || 40)));
      offer(sig, 'twitch-raid', `Chat wants to raid the Quad: ${size} hungry viewers in the next hour.`, { size });
    }
  }
  if (owns(s, 'west_hostile_takeover') && !s.manager.tree.flags.includes('takeover_won') && s.day >= sig.takeover.failedUntil && s.day - sig.takeover.lastDay >= 3) {
    offer(sig, 'hostile-takeover', `Mrs. West can buy out Taco Synergy LLC for $${P('west_hostile_takeover').takeoverPrice}.`);
  }
  if (owns(s, 'west_designer_popup') && s.day - sig.popUp.lastDay >= (P('west_designer_popup').popUpCooldownDays || 4)) {
    sig.popUp.active = true; // placeholder: vibe/quality floors are not simulated; reputation stands in
    sig.popUp.lastDay = s.day;
    emit({ type: 'designerPopUp' });
  }
}

export function signaturesEvening(game, emit) {
  const s = game.state;
  const sig = ensureSig(s);
  if (!sig) return;
  const day = s.dayLedger || {};
  if (sig.angel.share > 0 && (day.profit || 0) > 0) {
    const skim = money(day.profit * sig.angel.share);
    s.cash = money(s.cash - skim);
    sig.angel.skimmed = money(sig.angel.skimmed + skim);
  }
  if (sig.popUp.active && (s.manager.reputation || 0) / 20 < 4) {
    s.manager.reputation = Math.max(0, s.manager.reputation + (P('west_designer_popup').popUpBacklashRep || -0.3) * 20);
  }
  if (owns(s, 'aaron_franchise_deal')) {
    const p = P('aaron_franchise_deal');
    const f = sig.franchise;
    const stars = (s.manager.reputation || 0) / 20;
    for (const site of f.sites) {
      // Placeholder royalty base: each flag sells like half of today's main stand.
      const royalty = money((day.revenue || 0) * 0.5 * (p.franchiseRoyaltyRate || 0.08) * (stars >= (p.franchiseRoyaltyRepPivot || 4.5) ? 1.25 : 1));
      s.cash = money(s.cash + royalty);
      f.royalties = money(f.royalties + royalty);
      site.royalties = money((site.royalties || 0) + royalty);
    }
    if (s.day >= f.pausedUntil && f.sites.length < (p.franchiseMax || 3) && s.day - f.lastOpenDay >= (p.franchiseOpenIntervalDays || 1)) {
      const names = ['Alkek', 'LBJ Center', 'Bobcat Stadium'];
      f.sites.push({ id: `flag-${f.sites.length + 1}`, name: names[f.sites.length] || `Flag ${f.sites.length + 1}`, day: s.day, royalties: 0 });
      f.lastOpenDay = s.day;
      emit({ type: 'franchiseOpened', sites: f.sites.length });
    }
    const chance = (p.scandalChancePerDay || 0.05) * (stars >= (p.scandalHighRepThreshold || 4.5) ? (p.scandalHighRepMult || 0.5) : 1);
    if (f.sites.length && roll(s, 'scandal').next() < chance) {
      offer(sig, 'franchise-scandal', `The ${f.sites[f.sites.length - 1].name} flag is in a campus scandal. Cut it loose?`);
    }
  }
}

export function stepSignatures(game, dt, emit) {
  const s = game.state;
  const sig = s.manager?.tree?.sig;
  if (!sig) return;
  // Offers time out into the standing policy.
  for (const row of sig.offers.slice()) {
    row.remaining -= dt;
    if (row.remaining <= 0) chooseOffer(game, { id: row.id, choice: sig.policies[row.type] || 'decline' }, emit);
  }
  if (!SERVICE.includes(s.phase)) return;
  // Tortilla Cannon misfires: ~one shot every 2 s while prep works; a misfire loses a tortilla and jams.
  if (owns(s, 'phillip_tortilla_cannon')) {
    const p = P('phillip_tortilla_cannon');
    sig.cannon.jam = Math.max(0, sig.cannon.jam - dt);
    if (sig.cannon.jam <= 0 && s.stations?.prep?.active && tickRoll(s, 'cannon').next() < (p.misfireChance || 0.04) * dt * 0.5) {
      sig.cannon.jam = p.misfireJamSeconds || 20;
      sig.cannon.misfires += 1;
      if (s.inventory?.tortillas > 0) s.inventory.tortillas -= 1;
      emit({ type: 'cannonMisfire' });
    }
  }
  // Meal Prep portions are used by tacos handed off today.
  if (sig.mealPrep.portions > 0) {
    const tacos = s.dayLedger?.tacos || 0;
    sig.mealPrep.portions = Math.max(0, sig.mealPrep.portions - Math.max(0, tacos - sig.mealPrep.tacosSeen));
    sig.mealPrep.tacosSeen = tacos;
  }
  // Hacky Sack: Matt kicks while pickup is idle; the streak pulls a crowd, a drop makes him sulk.
  if (owns(s, 'matt_hacky_sack')) {
    const p = P('matt_hacky_sack');
    const h = sig.hacky;
    if (h.sulk > 0) h.sulk -= dt;
    else if (!s.stations?.serve?.active) {
      h.idle += dt;
      if (h.idle >= (p.hackyIdleThresholdSeconds || 3)) {
        h.kickT += dt;
        while (h.kickT >= (p.kickIntervalSeconds || 1.5)) {
          h.kickT -= p.kickIntervalSeconds || 1.5;
          if (tickRoll(s, `kick${h.streak}`).next() < (p.kickDropChance || 0.01)) { h.streak = 0; h.sulk = p.hackySulkSeconds || 20; emit({ type: 'hackyDrop' }); break; }
          h.streak += 1; h.best = Math.max(h.best, h.streak);
          if (h.streak === (p.hackyLegendStreak || 200)) emit({ type: 'hackyLegend' });
        }
      }
    } else h.idle = 0;
  }
  // Grackle Squad: the trained birds occasionally bring back a lost coin from the lawn.
  if (owns(s, 'matt_grackle_squad')) {
    const p = P('matt_grackle_squad');
    if (tickRoll(s, 'grackle').next() < (p.grackleCoinChance || 0.005) * dt * (p.grackleCount || 2)) {
      s.cash = money(s.cash + (p.grackleCoinValue || 5));
      sig.grackle.coins += 1;
      emit({ type: 'grackleCoin', cash: p.grackleCoinValue || 5 });
    }
  }
  // Surge pricing board: every 30 s the multiplier steps toward the line-length target.
  if (owns(s, 'aaron_surge_board')) {
    const p = P('aaron_surge_board');
    const u = sig.surge;
    u.t += dt;
    if (u.t >= (p.surgeUpdateSeconds || 30)) {
      u.t = 0;
      const line = (s.line || []).length;
      const target = Math.max(p.surgeMin || 0.85, Math.min(u.cap || p.surgeMax || 1.35, 1 + (line - (p.surgeLineBase || 4)) * (p.surgeLineStep || 0.04)));
      const cap = p.surgeStepCap || 0.05;
      u.mult = Math.round((u.mult + Math.max(-cap, Math.min(cap, target - u.mult))) * 100) / 100;
    }
    if (u.mult >= (p.gougeThreshold || 1.2)) {
      u.gougeT += dt;
      if (u.gougeT > (p.gougeGraceHours || 1) * HOUR) s.manager.reputation = Math.max(0, s.manager.reputation + (p.gougeRepPerHour || -0.1) * 20 * dt / HOUR);
    } else u.gougeT = 0;
  }
  // Crypto rig: yields cash per game hour unless it overheated.
  if (owns(s, 'antonio_crypto_rig')) {
    const p = P('antonio_crypto_rig');
    const c = sig.crypto;
    c.stall = Math.max(0, c.stall - dt);
    c.hourT += dt;
    if (c.hourT >= HOUR) {
      c.hourT -= HOUR;
      const r = tickRoll(s, 'crypto');
      if (r.next() < (p.overheatChancePerHour || 0.03)) { c.stall = p.overheatStallSeconds || 30; emit({ type: 'cryptoOverheat' }); }
      else if (c.stall <= 0) {
        const y = money((p.cryptoYieldPerHour || 10) * ((p.cryptoYieldMin || 0.4) + r.next() * ((p.cryptoYieldMax || 1.6) - (p.cryptoYieldMin || 0.4))));
        s.cash = money(s.cash + y);
        c.mined = money(c.mined + y);
      }
    }
  }
}

// Stream raid arrivals: extra walk-ups spread across the raid window (the pipeline spawns them).
export function raidArrivals(state, dt) {
  const r = state.manager?.tree?.sig?.raid?.active;
  if (!r || r.left <= 0) return 0;
  if (state.t >= r.until) { r.left = 0; return 0; }
  r.credit += r.left / Math.max(1, r.until - state.t) * dt;
  const n = Math.floor(r.credit);
  r.credit -= n;
  r.left -= n;
  return n;
}

export function signaturesView(state) {
  const sig = state.manager?.tree?.sig;
  if (!sig) return { offers: [] };
  return {
    offers: sig.offers.map((o) => ({ ...o })),
    surge: owns(state, 'aaron_surge_board') ? { mult: sig.surge.mult, cap: sig.surge.cap ?? null, gouging: sig.surge.gougeT > 0 } : null,
    franchise: owns(state, 'aaron_franchise_deal') ? { sites: sig.franchise.sites.map((x) => ({ ...x })), royalties: sig.franchise.royalties, scandal: sig.offers.find((o) => o.type === 'franchise-scandal') || null } : null,
    hacky: owns(state, 'matt_hacky_sack') ? { streak: sig.hacky.streak, best: sig.hacky.best, sulking: sig.hacky.sulk > 0 } : null,
    grackles: owns(state, 'matt_grackle_squad') ? { coins: sig.grackle.coins } : null,
    cannon: owns(state, 'phillip_tortilla_cannon') ? { jammed: sig.cannon.jam > 0, misfires: sig.cannon.misfires } : null,
    mealPrep: owns(state, 'phillip_meal_prep_sunday') ? { portions: sig.mealPrep.portions } : null,
    crypto: owns(state, 'antonio_crypto_rig') ? { mined: sig.crypto.mined, overheated: sig.crypto.stall > 0 } : null,
    raid: sig.raid.active ? { left: sig.raid.active.left } : null,
    angel: sig.angel.rounds ? { share: sig.angel.share, skimmed: sig.angel.skimmed } : null,
    popUp: sig.popUp.active,
  };
}
