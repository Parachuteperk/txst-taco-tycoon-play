// Upgrades, eras, props, Jared's vault, the coin flip and AI Ali (design bible §1, §2, §8, §9 plus Aaron's overrides).
// Catalog: src/data/upgrades.js (generated from docs/design/claude-upgrades.md by tools/build-upgrades.mjs).
// Rules that differ from the bible, on Aaron's word: every signature is purchasable (no one-per-crew lock);
// AI Ali is Ali's tier-4 capstone; the coin flip is a rare non-blocking 50/50 card answered by a standing policy.
import { UPGRADES } from '../data/upgrades.js';
import { createRng, hashSeed } from './rng.js';
import { ensureSig, signatureSpeed, signatureDemand, signaturePrice, signaturesMorning, signaturesEvening, signaturesView } from './signatures.js';

const money = (n) => Math.round(n * 100) / 100;

export const ERAS = [
  null,
  { id: 'folding', tacos: 0, stars: 0, cost: 0 },
  { id: 'tent', tacos: 70, stars: 2.0, cost: 250 },
  { id: 'stand', tacos: 280, stars: 3.0, cost: 600 },
  { id: 'truck', tacos: 800, stars: 4.0, cost: 2000 },
];

// §2 props that skill and signature nodes require. Placement is not simulated yet; owning one satisfies prop:<id>.
export const PROPS = {
  igloo_cooler: { name: 'Igloo Cooler', era: 1, cost: 30 },
  speaker: { name: 'Bluetooth Speaker', era: 1, cost: 35 },
  picnic_benches: { name: 'Picnic Benches', era: 2, cost: 80 },
  string_lights: { name: 'String Lights', era: 2, cost: 70 },
  salsa_bar: { name: 'Salsa Bar', era: 2, cost: 150 },
  antonio_pro_rig: { name: "Antonio's Pro Rig", era: 3, cost: 500 },
};

const ALL_CREW = () => Object.entries(UPGRADES.crewUpgrades).flatMap(([crew, list]) => list.map((node) => ({ ...node, crew })));
export function findNode(id) {
  for (const [crew, list] of Object.entries(UPGRADES.crewUpgrades)) {
    const node = list.find((n) => n.id === id);
    if (node) return { ...node, crew, kind: 'crew' };
  }
  for (const [stand, list] of Object.entries(UPGRADES.standUpgrades)) {
    const node = list.find((n) => n.id === id);
    if (node) return { ...node, stand, kind: 'stand' };
  }
  return null;
}

export function ensureUpgrades(state) {
  const m = state.manager;
  if (!m) return null;
  if (!m.tree) {
    m.tree = {
      era: 1, owned: [], props: [], flags: [], milestones: [],
      stall: { open: false, specialty: null },
      vault: { gold: { price: 100, holdings: 0 }, silver: { price: 100, holdings: 0 }, allocation: 0, metal: 'gold', settle: null, history: [] },
      coin: { policy: 'decline', today: 0, lastAt: -999, open: null, results: [], nextId: 1 },
      aiAli: { offline: false, suspectRolled: false, approval: 50 },
    };
  }
  return m.tree;
}

export const stars = (state) => (Number(state.manager?.reputation) || 0) / 20;

function milestoneMet(state, id) {
  return ensureUpgrades(state).milestones.includes(id);
}

export function requirementMet(state, req) {
  const tree = ensureUpgrades(state);
  const [kind, arg] = req.includes('>=') ? req.split('>=') : req.split(':');
  if (kind === 'era') return tree.era >= Number(arg);
  if (kind === 'rep') return stars(state) >= Number(arg);
  if (kind === 'skill') return tree.owned.includes(arg);
  if (kind === 'milestone') return milestoneMet(state, arg);
  if (kind === 'prop') return tree.props.includes(arg) || (arg === 'igloo_cooler' && (state.manager.upgrades?.secondCooler || 0) > 0);
  if (kind === 'flag') return tree.flags.includes(arg);
  if (kind === 'stall') return arg === 'open' ? tree.stall.open : !tree.stall.open;
  if (kind === 'stallSpecialty') return tree.stall.specialty === arg;
  return false;
}

export function missing(state, node) {
  return (node.requires || []).filter((req) => !requirementMet(state, req));
}

function charge(state, cost) {
  if (state.cash < cost) return false;
  state.cash = money(state.cash - cost);
  if (state.dayLedger) state.dayLedger.capex = money((state.dayLedger.capex || 0) + cost);
  return true;
}

// Instant, mid-day included (bible §8.1). Crew nodes in tier order is enforced by their skill: requirements.
export function buyCrewUpgrade(game, crewId, id) {
  const s = game.state;
  const tree = ensureUpgrades(s);
  const node = findNode(id);
  if (!node || node.kind !== 'crew' || (crewId && node.crew !== crewId)) return { ok: false, reason: 'unknown-choice' };
  if (tree.owned.includes(id)) return { ok: false, reason: 'already-used' };
  const gaps = missing(s, node);
  if (gaps.length) return { ok: false, reason: 'locked', missing: gaps };
  if (!charge(s, node.cost)) return { ok: false, reason: 'cant-afford' };
  tree.owned.push(id);
  game.emitUpgrade?.({ type: 'upgradeBought', id, crewId: node.crew, cost: node.cost });
  return { ok: true, id, crewId: node.crew };
}

export function buyStandUpgrade(game, standId, id) {
  const s = game.state;
  const tree = ensureUpgrades(s);
  const node = findNode(id);
  if (!node || node.kind !== 'stand' || (standId && node.stand !== standId)) return { ok: false, reason: 'unknown-choice' };
  if (tree.owned.includes(id)) return { ok: false, reason: 'already-used' };
  const gaps = missing(s, node);
  if (gaps.length) return { ok: false, reason: 'locked', missing: gaps };
  if (!charge(s, node.cost)) return { ok: false, reason: 'cant-afford' };
  tree.owned.push(id);
  if (node.stand === 'stall' && node.tier === 0) {
    tree.stall.open = true;
    tree.stall.specialty = id.replace('stall_open_', '');
  }
  return { ok: true, id, standId: node.stand };
}

export function buyProp(game, id) {
  const s = game.state;
  const tree = ensureUpgrades(s);
  const prop = PROPS[id];
  if (!prop) return { ok: false, reason: 'unknown-choice' };
  if (tree.props.includes(id)) return { ok: false, reason: 'already-used' };
  if (tree.era < prop.era) return { ok: false, reason: 'locked', missing: [`era>=${prop.era}`] };
  if (!charge(s, prop.cost)) return { ok: false, reason: 'cant-afford' };
  tree.props.push(id);
  return { ok: true, id };
}

// Eras are optional and change between days (bible §1). West approval and the health grade are not
// simulated yet, so E3/E4 gate on tacos, stars and cash only.
export function eraProgress(state) {
  const tree = ensureUpgrades(state);
  const next = ERAS[tree.era + 1];
  if (!next) return null;
  const tacos = state.lifetime?.tacos || 0;
  return {
    era: tree.era + 1, id: next.id, cost: next.cost,
    tacos: { have: tacos, need: next.tacos }, stars: { have: Math.round(stars(state) * 10) / 10, need: next.stars },
    ready: tacos >= next.tacos && stars(state) >= next.stars && state.cash >= next.cost,
  };
}

export function advanceEra(game) {
  const s = game.state;
  if (!['summary', 'preopen'].includes(s.phase)) return { ok: false, reason: 'wrong-phase' };
  const p = eraProgress(s);
  if (!p) return { ok: false, reason: 'already-used' };
  if (p.tacos.have < p.tacos.need || p.stars.have < p.stars.need) return { ok: false, reason: 'locked' };
  if (!charge(s, p.cost)) return { ok: false, reason: 'cant-afford' };
  ensureUpgrades(s).era = p.era;
  return { ok: true, era: p.era, id: p.id };
}

// ---------------------------------------------------------------------------------------------------------
// Effects. Deltas from owned tree and stand nodes sum per stat (bible §8.1 stat dictionary). Signature
// nodes carry mechanic parameters instead and are read by their own systems.
export function effects(state) {
  const tree = state.manager?.tree;
  const out = {};
  if (!tree) return out;
  const skillMult = 1 + sumOf(tree, 'skillMultiplier');
  for (const id of tree.owned) {
    const node = findNode(id);
    if (!node || node.signature) continue;
    const scale = node.kind === 'crew' && node.tier <= 2 ? skillMult : 1;
    for (const [k, v] of Object.entries(node.effects || {})) if (typeof v === 'number' && k !== 'skillMultiplier') out[k] = (out[k] || 0) + v * scale;
  }
  for (const syn of activeSynergies(state)) for (const [k, v] of Object.entries(syn.effects || {})) if (typeof v === 'number') out[k] = (out[k] || 0) + v;
  return out;
}

function sumOf(tree, key) {
  let n = 0;
  for (const id of tree.owned) { const node = findNode(id); if (!node?.signature && typeof node?.effects?.[key] === 'number') n += node.effects[key]; }
  return n;
}

export function activeSynergies(state) {
  const tree = state.manager?.tree;
  if (!tree) return [];
  return (UPGRADES.synergies || []).filter((syn) => (syn.requires || []).every((req) => (req.startsWith('skill:') ? tree.owned.includes(req.slice(6)) : !req.startsWith('layout:'))));
}

// Station speed multiplier from upgrades. Grill capacity is one simulated slot, so each extra slot is
// worth +50% grill throughput (placeholder until the engine simulates parallel slots).
export function stationBoost(state, key) {
  const e = effects(state);
  let add = e.pipelineSpeed || 0;
  if (key === 'register') add += e.checkoutSpeed || 0;
  if (key === 'prep') add += (e.prepSpeed || 0) + (e.batchSize || 0) * 0.25;
  if (key === 'grill') add += (e.grillSpeed || 0) + (e.grillCapacity || 0) * 0.5;
  if (key === 'assemble' || key === 'serve') add += (e.handoffSpeed || 0) + (e.trayCapacity || 0) * 0.2;
  if (key === 'grill' && aiAliActive(state)) add += 0.1; // Ali stays on the grill (no West pulls).
  return (1 + add) * signatureSpeed(state, key);
}

export function demandBoost(state) {
  const e = effects(state);
  return (1 + (e.crowdPull || 0) + ((state.manager?.tree?.era || 1) >= 4 ? (e.truckCrowdPull || 0) : 0)) * signatureDemand(state);
}

export function priceBoost(state) { return signaturePrice(state); }

export function patienceBoost(state) {
  const e = effects(state);
  return 1 + (e.linePatience || 0) - (e.seatedPerceivedWait || 0) * 0.5;
}

// Extra tip per paid order: tipRate is a probability of a $0.50 tip, upsellRate of a $1.20 margin add-on.
export function orderExtra(state, rng) {
  const e = effects(state);
  let extra = 0;
  if (e.tipRate && rng.next() < e.tipRate) extra += 0.5;
  if (e.upsellRate && rng.next() < e.upsellRate) extra += 1.2;
  return money(extra);
}

// ---------------------------------------------------------------------------------------------------------
// AI Ali (§9.3): the clone keeps Mrs. West busy so the real Ali stays on the grill.
export function aiAliOwned(state) { return !!state.manager?.tree?.owned.includes('ali_ai_ali'); }
export function aiAliActive(state) { return aiAliOwned(state) && !state.manager.tree.aiAli.offline; }

// Day start: vault allocation and roll, AI Ali status, stipend. Day end: milestones and the clone's suspicion roll.
// Side rolls use their own seeded stream (run seed + day + purpose) so they never shift the rush RNG.
function sideRng(state, salt) { return createRng(hashSeed(`${state.runSeed ?? ''}:${state.day}:${salt}:${state.lifetime?.days || 0}`)); }

export function upgradesMorning(game, emit) {
  const s = game.state;
  if (s.runSeed == null) s.runSeed = game.seed;
  const tree = ensureUpgrades(s);
  tree.aiAli.offline = false;
  const e = effects(s);
  if (e.stipend) { s.cash = money(s.cash + e.stipend); }
  if (tree.owned.includes('jared_vault')) vaultMorning(game, emit);
  tree.coin.today = 0;
  tree.coin.open = null;
  ensureSig(s);
  signaturesMorning(game, emit);
}

export function upgradesEvening(game, emit) {
  const s = game.state;
  const tree = ensureUpgrades(s);
  const day = s.dayLedger || {};
  const add = (id) => { if (!tree.milestones.includes(id)) { tree.milestones.push(id); emit({ type: 'milestone', id }); } };
  if ((s.lifetime?.tacos || 0) >= 100) add('first_100');
  if ((day.tacos || 0) >= 180) add('game_day_hero');
  if (s.day >= 3 && (day.fines || 0) === 0 && (day.tacos || 0) > 0) add('clean_kitchen');
  if ((day.tacos || 0) >= 20 && (day.walkoffs || 0) < 0.1 * ((day.tacos || 0) + (day.walkoffs || 0))) add('community_project');
  if (s.cash >= 500) add('pitch_day'); // placeholder: no Investor Visit event exists yet
  if (aiAliOwned(s) && !tree.aiAli.suspectRolled) {
    const rng = sideRng(s, 'clone');
    const node = findNode('ali_ai_ali').effects;
    if (rng.next() < (node.cloneSuspicionChance || 0.03)) {
      tree.aiAli.suspectRolled = true;
      const roll = rng.next();
      let outcome = 'buysIt';
      if (roll >= node.cloneBuyItOdds && roll < node.cloneBuyItOdds + node.cloneStartupOdds) {
        outcome = 'startup';
        const check = tree.era >= 4 ? node.cloneSeedCheckE4 : node.cloneSeedCheckE3;
        s.cash = money(s.cash + check);
      } else if (roll >= node.cloneBuyItOdds + node.cloneStartupOdds) {
        outcome = 'busted';
        tree.aiAli.offline = true;
      }
      tree.aiAli.approval += outcome === 'busted' ? -10 : outcome === 'buysIt' ? 10 : 0;
      emit({ type: 'westSuspects', outcome });
    }
  }
  if (tree.owned.includes('jared_vault')) vaultEvening(game, emit);
  signaturesEvening(game, emit);
}

// ---------------------------------------------------------------------------------------------------------
// Jared's gold & silver vault (§9.4, Aaron req 7). Policy puts 0-50% of cash in at the start of the day
// (cap $2,000). Each day rolls 75% up / 25% down: gold +4% / -7%, silver +8% / -18%. Withdrawals cost 2%.
function vaultParams() { return findNode('jared_vault').effects; }

function vaultMorning(game, emit) {
  const s = game.state;
  const v = ensureUpgrades(s).vault;
  const p = vaultParams();
  const want = Math.min(p.vaultMaxAllocation ?? 0.5, Math.max(0, v.allocation || 0));
  if (want > 0) {
    const value = metalValue(v);
    const target = Math.min(p.vaultCap ?? 2000, (s.cash + value) * want);
    const buy = money(Math.max(0, target - value));
    if (buy > 1 && s.cash >= buy) invest(game, v.metal, buy / v[v.metal].price, { quiet: true });
  }
}

function vaultEvening(game, emit) {
  const s = game.state;
  const v = ensureUpgrades(s).vault;
  const p = vaultParams();
  const rng = sideRng(s, 'vault');
  const up = rng.next() < (p.vaultUpChance ?? 0.75);
  // The bible stores down-moves as negative numbers; normalize either sign.
  const move = { gold: up ? Math.abs(p.goldUp ?? 0.04) : -Math.abs(p.goldDown ?? 0.07), silver: up ? Math.abs(p.silverUp ?? 0.08) : -Math.abs(p.silverDown ?? 0.18) };
  const before = metalValue(v);
  v.gold.price = money(v.gold.price * (1 + move.gold));
  v.silver.price = money(v.silver.price * (1 + move.silver));
  const delta = money(metalValue(v) - before);
  v.settle = { day: s.day, up, gold: move.gold, silver: move.silver, delta };
  v.history.push({ day: s.day, gold: v.gold.price, silver: v.silver.price });
  if (v.history.length > 30) v.history.shift();
  emit({ type: 'metalSettle', metal: v.metal, good: up, outcome: up ? 'good' : 'bad', delta });
}

export function metalValue(v) { return money(v.gold.holdings * v.gold.price + v.silver.holdings * v.silver.price); }

export function invest(game, metal, ounces, opts = {}) {
  const s = game.state;
  const tree = ensureUpgrades(s);
  if (!tree.owned.includes('jared_vault')) return { ok: false, reason: 'locked', missing: ['skill:jared_vault'] };
  const v = tree.vault;
  if (!v[metal] || !(ounces > 0)) return { ok: false, reason: 'unknown-choice' };
  const cost = money(ounces * v[metal].price);
  if (metalValue(v) + cost > (vaultParams().vaultCap ?? 2000) + 0.01) return { ok: false, reason: 'vault-full' };
  if (s.cash < cost) return { ok: false, reason: 'cant-afford' };
  s.cash = money(s.cash - cost);
  v[metal].holdings = Math.round((v[metal].holdings + ounces) * 1000) / 1000;
  v.metal = metal;
  return { ok: true, metal, ounces, cost };
}

export function sell(game, metal, ounces) {
  const s = game.state;
  const v = ensureUpgrades(s).vault;
  if (!v[metal] || !(ounces > 0) || v[metal].holdings < ounces - 1e-6) return { ok: false, reason: 'unknown-choice' };
  const gross = ounces * v[metal].price;
  const net = money(gross * (1 - (vaultParams().vaultWithdrawFee ?? 0.02)));
  v[metal].holdings = Math.max(0, Math.round((v[metal].holdings - ounces) * 1000) / 1000);
  s.cash = money(s.cash + net);
  return { ok: true, metal, ounces, cash: net };
}

export function setVaultPolicy(game, { allocation, metal } = {}) {
  const v = ensureUpgrades(game.state).vault;
  if (allocation != null) v.allocation = Math.max(0, Math.min(vaultParams().vaultMaxAllocation ?? 0.5, Number(allocation) || 0));
  if (metal === 'gold' || metal === 'silver') v.metal = metal;
  return { ok: true, allocation: v.allocation, metal: v.metal };
}

// ---------------------------------------------------------------------------------------------------------
// Coin flip (Aaron req 7 + §9.4 numbers): a rare double-or-nothing offer from a happy customer. It is a
// non-blocking card: the standing policy (decline / small / yolo) answers it automatically after 20 s.
// Win: the customer pays double the stake. Lose: their taco is on the house. Edge: free taco, hype burst.
export const COIN_SECONDS = 20;

export function stepCoinFlip(game, dt, emit) {
  const s = game.state;
  const tree = s.manager?.tree;
  if (!tree?.owned.includes('jared_coin_flip')) return;
  const p = findNode('jared_coin_flip').effects;
  const c = tree.coin;
  if (c.open) {
    c.open.remaining -= dt;
    if (c.open.remaining <= 0) resolveFlip(game, c.policy === 'decline' ? 'pass' : 'accept', c.policy === 'yolo' ? 0.5 : 0.1, emit);
    return;
  }
  const hour = 75;
  if (c.today >= (p.coinFlipDailyCap ?? 3) || s.t - c.lastAt < (p.coinFlipCooldownHours ?? 1) * hour) return;
  if (!['calm', 'rush', 'telegraph'].includes(s.phase)) return;
  const rng = createRng(hashSeed(`${s.day}:flip:${Math.floor(s.t)}`));
  // offer rate is per happy customer; approximate with arrivals ~1/s during service
  if (rng.next() < (p.coinFlipOfferRate ?? 0.02) * dt) {
    c.open = { id: `coin-${s.day}-${c.nextId++}`, remaining: COIN_SECONDS, customerId: s.customers?.find((x) => x.state === 'ordering')?.id ?? null };
    c.lastAt = s.t;
    c.today += 1;
    emit({ type: 'coinFlipChallenge', id: c.open.id, customerId: c.open.customerId, challengerId: c.open.customerId });
  }
}

export function resolveFlip(game, choice, wager, emit) {
  const s = game.state;
  const c = ensureUpgrades(s).coin;
  if (!c.open) return { ok: false, reason: 'closed' };
  const open = c.open;
  c.open = null;
  if (choice === 'pass') { emit?.({ type: 'coinFlipResult', id: open.id, declined: true }); return { ok: true, declined: true }; }
  const p = findNode('jared_coin_flip').effects;
  const rng = createRng(hashSeed(`${s.day}:flipres:${open.id}`));
  const stake = money(Math.min(s.cash, Math.max(1, s.cash * Math.min(0.5, wager || 0.1))));
  const edge = rng.next() < (p.coinFlipEdgeChance ?? 0.02);
  const win = !edge && rng.next() < (p.coinFlipWinChance ?? 0.5);
  const payout = edge ? 0 : win ? stake : -stake;
  s.cash = money(s.cash + payout);
  if (s.dayLedger) s.dayLedger.revenue = money(s.dayLedger.revenue + payout);
  const result = { ok: true, id: open.id, face: win ? 'heads' : 'tails', win, edge, payout, standWins: win };
  c.results.push({ day: s.day, ...result });
  if (c.results.length > 20) c.results.shift();
  emit?.({ type: 'coinFlipResult', ...result, customerId: open.customerId });
  return result;
}

export function coinFlip(game, { choice = 'accept', wager = 0.1 } = {}, emit) { return resolveFlip(game, choice, wager, emit); }
export function setCoinPolicy(game, policy) {
  if (!['decline', 'small', 'yolo'].includes(policy)) return { ok: false, reason: 'unknown-choice' };
  ensureUpgrades(game.state).coin.policy = policy;
  return { ok: true, policy };
}

// ---------------------------------------------------------------------------------------------------------
export function upgradesView(state) {
  const tree = ensureUpgrades(state);
  if (!tree) return {};
  const byCrew = {};
  for (const id of tree.owned) { const node = findNode(id); if (node?.kind === 'crew') (byCrew[node.crew] ||= []).push(id); }
  const v = tree.vault;
  return {
    tree, byCrew,
    era: ERAS[tree.era].id,
    eraNumber: tree.era,
    nextEra: eraProgress(state),
    synergies: activeSynergies(state).map((syn) => syn.id),
    vault: tree.owned.includes('jared_vault') ? {
      gold: { ...v.gold }, silver: { ...v.silver }, metal: v.metal, allocation: v.allocation,
      value: metalValue(v), settle: v.settle, history: v.history.slice(),
    } : null,
    coinFlip: tree.coin.open ? { open: true, id: tree.coin.open.id, remaining: tree.coin.open.remaining, cash: state.cash, policy: tree.coin.policy } : null,
    aiAli: aiAliOwned(state) ? { active: aiAliActive(state), approval: tree.aiAli.approval } : null,
    signatures: signaturesView(state),
  };
}

export { ALL_CREW };
