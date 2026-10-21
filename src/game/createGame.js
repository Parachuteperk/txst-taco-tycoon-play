import { emit } from './events.js';
import {
  buyCrewUpgrade, buyStandUpgrade, buyProp, advanceEra, invest, sell, setVaultPolicy, coinFlip, setCoinPolicy, stepCoinFlip, ensureUpgrades,
} from './upgrades.js';
import { stepSignatures, chooseOffer, setOfferPolicy, cutFranchise, setSurgeCap } from './signatures.js';
import { CONFIG } from './config.js';
import { TEXT } from './text.js';
import { beginDay, enterPhase, settleDay, stepClosing } from './day.js';
import { cashBridge } from './economy.js';
import { addXp, blankCrew, choosePerk } from './crew.js';
import { blankStory } from './story.js';
import { startHack, stepHack } from './hacks.js';
import { hireOutpost, setOutpostSpot, stepOutpost, upgradeOutpost } from './outpost.js';
import {
  arrivalRate, callTheLine, restock, spawnCustomer, stepArrivals, stepGolden, stepPipeline, stepTimed, tapGolden,
  relinkEntities,
} from './pipeline.js';
import { stepBigRush } from './bigRush.js';
import { touchAchievements, blankAchievements, ensureAchievements } from './achievements.js';
import { beginDeckDay, blankDeck, chooseEvent, ensureDeck, stepDeck } from './deck.js';
import { beginEndless, blankSeason, ensureSeason } from './season.js';
import {
  applyQueuedPerks, blankManager, ensureManager, sampleTelemetry, setMenu, setPolicy, setSpeed as applySpeed,
  assignCrew, buyUpgrade, startDay as beginManagedDay, startProject, stepDirector,
} from './manager.js';
import { blankOnboard, dismissHint, dismissOnboarding, ensureOnboard } from './onboard.js';
import { ensureDifficulty, setDifficulty } from './difficulty.js';
import { blankPacing, chooseBeat, noteDecision, stepPacing } from './pacing.js';
import { blankChallenges, ensureChallenges, noteChallengeDay } from './challenges.js';
import { arriveWest, chooseWest, stepWest } from './west.js';
import { getView } from './view.js';
import { createRng, hashSeed } from './rng.js';
import { deepMerge, money } from './util.js';

export const SAVE_VERSION = 1;

// Add a function here when SAVE_VERSION bumps: MIGRATIONS[oldVersion] = (data) => next.
const MIGRATIONS = {};

export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('bad save');
  if (data.version == null) throw new Error('unsupported save version undefined');
  if (data.version > SAVE_VERSION) throw new Error(`unsupported save version ${data.version}`);
  let current = data;
  while (current.version < SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) throw new Error(`unsupported save version ${current.version}`);
    current = step(current);
    if (!current || current.version == null) throw new Error('bad migration');
  }
  if (current.version !== SAVE_VERSION) throw new Error(`unsupported save version ${current.version}`);
  return current;
}

// serialize(state) -> JSON. Pass seed and rngState so a load can continue the same rush.
export function serialize(state, meta = {}) {
  return JSON.stringify({
    version: SAVE_VERSION,
    seed: meta.seed ?? null,
    rngState: meta.rngState ?? null,
    state,
  });
}

export function load(json, options) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  const data = migrate(structuredClone(raw));
  return createGame(data.seed ?? 1, data, options);
}

function initialState(config) {
  return {
    day: 1,
    cash: money(config.economy.startingCash),
    inventory: { tortillas: config.economy.startingTortillas },
    suspicion: 0,
    priceBand: 'fair',
    crew: blankCrew(),
    combosUnlocked: [],
    pendingPerks: [],
    story: blankStory(),
    outpost: null,
    lifetime: { revenue: 0, profit: 0, tacos: 0, days: 0 },
    season: blankSeason(),
    deck: blankDeck(),
    onboard: blankOnboard(),
    difficulty: config.difficulty?.default || 'normal',
    pacing: blankPacing(),
    achievements: blankAchievements(),
    challenges: blankChallenges(),
    goalAnnounced: false,
    manager: blankManager(config),
    liveFeed: [],
    bankMs: 0,
    nextId: 1,
  };
}

function stepOne(game) {
  const s = game.state;
  if (s.phase === 'summary') return;
  const dt = game.config.step;
  s.step += 1;
  s.phaseSteps += 1;
  s.t = s.step * dt;
  s.phaseT = s.phaseSteps * dt;
  if (s.holding && s.phase !== 'preopen') s.dayLedger.holdSeconds += dt;
  stepWest(game);
  stepPacing(game);
  stepDeck(game);
  stepHack(game, dt);
  stepBigRush(game, dt);
  stepArrivals(game, dt);
  if (s.phase === 'calm' || s.phase === 'telegraph' || s.phase === 'rush' || s.phase === 'closing') {
    stepPipeline(game, dt);
  }
  stepOutpost(game, dt);
  stepCoinFlip(game, dt, (e) => emit(game, e));
  stepSignatures(game, dt, (e) => emit(game, e));
  stepGolden(game, dt);
  stepDirector(game);
  sampleTelemetry(game);
  stepTimed(game);
  stepClosing(game);
  touchAchievements(game);
  const need = Math.round(game.config.phases[s.phase].seconds / dt);
  if (need > 0 && s.phaseSteps >= need) {
    const order = game.config.phaseOrder;
    const next = order[order.indexOf(s.phase) + 1];
    if (next) enterPhase(game, next);
  }
}

function api(game) {
  return {
    seed: game.seed,
    config: game.config,
    state: game.state,
    tick(dt) {
      const pace = game.state.manager;
      if (pace?.holding) return { ok: false, reason: 'holding', phase: game.state.phase };
      if (pace?.speed === 'skip') {
        let guard = 0;
        while (game.state.phase !== 'summary' && guard++ < 20000) stepOne(game);
        pace.speed = 1;
        game.state.bankMs = 0;
        return;
      }
      if (!Number.isFinite(dt) || dt <= 0) return;
      const scale = pace?.speed === 2 || pace?.speed === 4 ? pace.speed : 1;
      game.state.bankMs += Math.round(dt * scale * 1000);
      if (game.state.bankMs > 5000) game.state.bankMs = 5000;
      const quantum = Math.round(game.config.step * 1000);
      let guard = 0;
      while (game.state.bankMs >= quantum && guard++ < 120) {
        if (game.state.phase === 'summary') {
          game.state.bankMs = 0;
          return;
        }
        stepOne(game);
        game.state.bankMs -= quantum;
      }
    },
    holdStand(on) {
      game.state.holding = !!on;
      return { ok: true };
    },
    callTheLine(choice) {
      return callTheLine(game, choice);
    },
    startHack(target) {
      return startHack(game, target);
    },
    chooseWest(choice) {
      return chooseWest(game, choice, false);
    },
    chooseEvent(deckName, choiceId) {
      return chooseEvent(game, deckName, choiceId, false);
    },
    dismissHint(id) {
      return dismissHint(game, id);
    },
    dismissOnboarding() {
      return dismissOnboarding(game);
    },
    chooseBeat(choice) {
      return chooseBeat(game, choice, false);
    },
    setDifficulty(id) {
      return setDifficulty(game, id);
    },
    tapGolden() {
      return tapGolden(game);
    },
    choosePerk(crewId, perkId) {
      return choosePerk(game, crewId, perkId);
    },
    hireOutpost(opts) {
      return hireOutpost(game, opts || {});
    },
    upgradeOutpost() {
      return upgradeOutpost(game);
    },
    setOutpostSpot(spotId) {
      return setOutpostSpot(game, spotId);
    },
    restock(count) {
      return restock(game, count);
    },
    setPrice(band) {
      if (game.state.phase !== 'preopen') return { ok: false, reason: 'wrong-phase' };
      if (!game.config.economy.prices[band]) return { ok: false, reason: 'unknown-choice' };
      game.state.priceBand = band;
      noteDecision(game);
      return { ok: true };
    },
    setPolicy(patch, value) {
      if (typeof patch === 'string') return setPolicy(game, { strategy: { [patch]: value } });
      return setPolicy(game, patch || {});
    },
    assignCrew(id, patch) {
      return assignCrew(game, id, patch || {});
    },
    buyUpgrade(id, extra) {
      return buyUpgrade(game, id, extra || {});
    },
    // Skill trees, stands, props, eras, Jared's vault and the coin flip (src/game/upgrades.js).
    buyCrewUpgrade(crewId, id) { return buyCrewUpgrade(game, crewId, id); },
    buyStandUpgrade(standId, id) { return buyStandUpgrade(game, standId, id); },
    buyProp(id) { return buyProp(game, id); },
    advanceEra() { return advanceEra(game); },
    invest(metal, ounces) { return invest(game, metal, ounces); },
    sell(metal, ounces) { return sell(game, metal, ounces); },
    setVaultPolicy(patch) { return setVaultPolicy(game, patch || {}); },
    coinFlip(answer) { return coinFlip(game, answer || {}, (e) => emit(game, e)); },
    setCoinPolicy(policy) { return setCoinPolicy(game, policy); },
    // Signature offers and controls (src/game/signatures.js).
    chooseOffer(answer) { return chooseOffer(game, answer || {}, (e) => emit(game, e)); },
    franchiseScandal(answer) { return chooseOffer(game, answer || {}, (e) => emit(game, e)); },
    setOfferPolicy(key, value) { return setOfferPolicy(game, key, value); },
    cutFranchise(siteId) { return cutFranchise(game, siteId, (e) => emit(game, e)); },
    setSurgeCap(cap) { return setSurgeCap(game, cap); },
    setMenu(spec) {
      return setMenu(game, spec || {});
    },
    startProject(id) {
      return startProject(game, id);
    },
    startDay() {
      const result = beginManagedDay(game);
      if (result.advance) {
        beginEndless(game);
        beginDay(game, false);
      }
      return result;
    },
    setSpeed(speed) {
      const result = applySpeed(game, speed);
      if (result.run) {
        let guard = 0;
        while (game.state.phase !== 'summary' && guard++ < 20000) stepOne(game);
        game.state.manager.speed = 1;
        game.state.bankMs = 0;
        result.speed = 1;
        delete result.run;
      }
      return result;
    },
    intervene(deckName, choiceId) {
      return chooseEvent(game, deckName, choiceId, false);
    },
    acknowledgeDay() {
      if (game.state.phase !== 'summary') return { ok: false, reason: 'wrong-phase' };
      applyQueuedPerks(game);
      beginEndless(game);
      beginDay(game, false);
      return { ok: true };
    },
    save() {
      return JSON.parse(serialize(structuredClone(game.state), {
        seed: game.seed,
        rngState: game.rng.getState(),
      }));
    },
    saveJson() {
      return serialize(structuredClone(game.state), {
        seed: game.seed,
        rngState: game.rng.getState(),
      });
    },
    serialize() {
      return this.saveJson();
    },
    drainEvents() {
      const ev = game.events;
      game.events = [];
      return ev;
    },
    on(fn) {
      game.listeners.add(fn);
      return () => game.listeners.delete(fn);
    },
    getView() {
      return getView(game);
    },
    text(key) {
      return TEXT[key] ?? key;
    },
    debug: {
      spawn(partial) {
        return spawnCustomer(game, partial || {});
      },
      setCash(n) {
        game.state.cash = money(n);
      },
      setTortillas(n) {
        game.state.inventory.tortillas = n;
      },
      setSuspicion(n) {
        game.state.suspicion = n;
      },
      setPhase(phase) {
        enterPhase(game, phase);
      },
      forceWest() {
        arriveWest(game);
      },
      grantXp(crewId, amount) {
        addXp(game, crewId, amount);
      },
      arrivalRate() {
        return arrivalRate(game);
      },
      bridge() {
        return cashBridge(game.state.dayLedger);
      },
      touchAchievements() {
        return touchAchievements(game);
      },
      noteChallenges() {
        return noteChallengeDay(game);
      },
      dealCampus() {
        return beginDeckDay(game);
      },
      settle() {
        return settleDay(game);
      },
    },
  };
}

export function createGame(seed = 1, save = null, options = {}) {
  const config = deepMerge(CONFIG, options?.config);
  const game = {
    config,
    rng: createRng(1),
    seed: 1,
    events: [],
    listeners: new Set(),
    state: null,
  };
  if (save) {
    const data = migrate(structuredClone(save));
    game.seed = data.seed;
    game.rng = createRng(data.seed);
    game.rng.setState(data.rngState);
    game.state = data.state;
    relinkEntities(game.state);
    ensureSeason(game.state);
    ensureDeck(game.state);
    ensureOnboard(game.state);
    ensureDifficulty(game.state, game.config);
    ensureAchievements(game.state);
    ensureChallenges(game.state);
    ensureManager(game.state, game.config);
    if (!game.state.pacing) game.state.pacing = blankPacing();
  } else {
    game.seed = hashSeed(seed);
    game.rng = createRng(game.seed);
    game.state = initialState(config);
    beginDay(game, true);
    if (options.autostart === false) game.state.manager.holding = true;
  }
  return api(game);
}

export function loadGame(save, options) {
  return load(save, options);
}
