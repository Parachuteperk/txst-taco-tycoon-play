// Seeded event cards. The draw uses its own RNG so Maya and the rush stay put.
// A card left open at the summary takes its safe choice, which has an empty
// effect, so an untouched day does not move cash or demand.

import { activeChallenge } from './challenges.js';
import { emit } from './events.js';
import { chooseWest } from './west.js';
import { weekModifiers } from './season.js';
import { difficultyMods } from './difficulty.js';
import { noteDecision } from './pacing.js';
import { createRng, hashSeed } from './rng.js';
import { clamp, money, weekOf } from './util.js';

export function blankDeck() {
  return { campus: null, west: null, dale: null, patrolAt: null };
}

export function ensureDeck(state) {
  if (!state.deck) state.deck = blankDeck();
  return state.deck;
}

function eligible(list, week) {
  return (list || []).filter((card) => {
    if (card.weekMin != null && week < card.weekMin) return false;
    if (card.weekMax != null && week > card.weekMax) return false;
    return true;
  });
}

function cardState(deckName, def, extra = {}) {
  return {
    deck: deckName,
    id: def.id,
    textKey: def.textKey,
    open: true,
    choice: null,
    kind: extra.kind || null,
    choices: def.choices.map((choice) => ({
      id: choice.id,
      textKey: choice.textKey,
      safe: !!choice.safe,
    })),
  };
}

function pickCard(list, rng, week) {
  const pool = eligible(list, week);
  if (!pool.length) return null;
  return pool[rng.int(pool.length)];
}

export function beginDeckDay(game) {
  const deck = ensureDeck(game.state);
  deck.campus = null;
  deck.west = null;
  deck.dale = null;
  deck.patrolAt = null;
  const cfg = game.config.deck;
  if (!cfg?.enabled) return;
  const week = weekOf(game.state.day, game.config.semester.daysPerWeek).week;
  const rng = createRng(hashSeed(`${game.seed}|deck|${game.state.day}`));
  let campusList = cfg.campus;
  const band = activeChallenge(game);
  if (band?.id === 'bandWeek' && band.cards?.length) {
    const only = campusList.filter((card) => band.cards.includes(card.id));
    if (only.length) campusList = only;
  }
  const campus = pickCard(campusList, rng, week);
  if (campus) {
    deck.campus = cardState('campus', campus);
    emit(game, {
      type: 'eventCard',
      deck: 'campus',
      id: campus.id,
      textKey: campus.textKey,
      cue: 'deck.card',
    });
  }
  const chance = (weekModifiers(game).dale || 0) * difficultyMods(game).dale;
  if (chance > 0 && cfg.dale?.length) {
    const patrol = createRng(hashSeed(`${game.seed}|dale-patrol|${game.state.day}`));
    if (patrol.next() < chance) {
      const rush = game.config.phases.rush.seconds || 120;
      deck.patrolAt = 24 + patrol.next() * Math.max(1, rush - 48);
    }
  }
}

export function attachWestCard(game) {
  const cfg = game.config.deck;
  if (!cfg?.enabled || !cfg.west?.length) return;
  const week = weekOf(game.state.day, game.config.semester.daysPerWeek).week;
  const rng = createRng(hashSeed(`${game.seed}|west-card|${game.state.day}`));
  const card = pickCard(cfg.west, rng, week);
  if (!card) return;
  const deck = ensureDeck(game.state);
  deck.west = cardState('west', card);
  emit(game, { type: 'eventCard', deck: 'west', id: card.id, textKey: card.textKey, cue: 'deck.card' });
}

export function attachDaleCard(game, kind) {
  const cfg = game.config.deck;
  if (!cfg?.enabled || !cfg.dale?.length) return;
  const week = weekOf(game.state.day, game.config.semester.daysPerWeek).week;
  const rng = createRng(hashSeed(`${game.seed}|dale-card|${game.state.day}|${kind}`));
  const card = pickCard(cfg.dale, rng, week);
  if (!card) return;
  const deck = ensureDeck(game.state);
  deck.dale = cardState('dale', card, { kind });
  emit(game, { type: 'eventCard', deck: 'dale', id: card.id, textKey: card.textKey, kind, cue: 'deck.card' });
}

export function stepDeck(game) {
  const deck = game.state.deck;
  if (!deck || deck.patrolAt == null) return;
  const s = game.state;
  if (s.phase !== 'rush' || s.phaseT + 1e-9 < deck.patrolAt) return;
  deck.patrolAt = null;
  if (s.inspector?.seenToday || deck.dale?.open) return;
  attachDaleCard(game, 'patrol');
}

function choiceDef(game, deckName, card, choiceId) {
  const list = game.config.deck?.[deckName] || [];
  const def = list.find((row) => row.id === card.id);
  return def?.choices?.find((choice) => choice.id === choiceId) || null;
}

export function safeChoiceId(game, deckName, card) {
  const list = game.config.deck?.[deckName] || [];
  const def = list.find((row) => row.id === card.id);
  const safe = def?.choices?.find((choice) => choice.safe);
  return safe?.id || null;
}

function applyEffect(game, effect) {
  if (!effect) return;
  const s = game.state;
  if (effect.suspicion) s.suspicion = clamp(Math.round(s.suspicion + effect.suspicion), 0, 100);
  let filling = 0;
  if (effect.filling) filling += effect.filling;
  if (effect.fillingTacos) filling += game.config.economy.filling * effect.fillingTacos;
  if (filling) {
    const cost = money(filling);
    s.cash = money(s.cash - cost);
    s.dayLedger.fillingPaid = money(s.dayLedger.fillingPaid + cost);
  }
  const duration = effect.duration || 90;
  if (effect.demandAdd) s.timed.push({ demandAdd: effect.demandAdd, until: s.t + duration });
  if (effect.tipMult && effect.tipMult !== 1) s.timed.push({ tipMult: effect.tipMult, until: s.t + duration });
  if (effect.patienceAdd) {
    for (const customer of s.line) customer.patience += effect.patienceAdd;
  }
  if (effect.trust) s.story.trust += effect.trust;
}

export function chooseEvent(game, deckName, choiceId, auto = false) {
  const deck = ensureDeck(game.state);
  if (deckName !== 'campus' && deckName !== 'west' && deckName !== 'dale') {
    return { ok: false, reason: 'unknown-choice' };
  }
  const card = deck[deckName];
  if (!card?.open) return { ok: false, reason: 'not-open' };
  if (card.choice) return { ok: false, reason: 'already-used' };
  if (deckName === 'west') return chooseWest(game, choiceId, auto);
  const choice = choiceDef(game, deckName, card, choiceId);
  if (!choice) return { ok: false, reason: 'unknown-choice' };
  applyEffect(game, choice.effect);
  card.open = false;
  card.choice = choiceId;
  emit(game, {
    type: 'eventCard',
    deck: deckName,
    id: card.id,
    choice: choiceId,
    auto: !!auto,
    textKey: choice.textKey,
    cue: 'deck.choice',
  });
  if (!auto) noteDecision(game);
  return { ok: true };
}

export function noteWestChoice(game, choiceId) {
  const card = game.state.deck?.west;
  if (!card || card.choice) return;
  card.open = false;
  card.choice = choiceId;
}

export function resolveOpenCards(game) {
  const deck = ensureDeck(game.state);
  for (const name of ['campus', 'dale', 'west']) {
    const card = deck[name];
    if (!card?.open || card.choice) continue;
    if (name === 'west' && !game.state.west?.choiceOpen) {
      card.open = false;
      card.choice = game.state.dayLedger?.westChoice || safeChoiceId(game, name, card);
      continue;
    }
    const id = safeChoiceId(game, name, card);
    if (id) chooseEvent(game, name, id, true);
  }
}
