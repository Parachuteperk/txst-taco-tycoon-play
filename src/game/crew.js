import { emit } from './events.js';
import { noteDecision } from './pacing.js';
import { money } from './util.js';

export const CREW_IDS = ['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio'];

const STATION_CREW = { jared: 'register', phillip: 'prep', ali: 'grill', matt: 'serve' };

export function blankCrew() {
  const crew = {};
  for (const id of CREW_IDS) crew[id] = { xp: 0, level: 1, perks: [] };
  return crew;
}

export function hasPerk(state, crewId, perkId) {
  return !!state.crew[crewId]?.perks.includes(perkId);
}

export function perkDef(config, crewId, perkId) {
  const levels = config.crew.perks[crewId];
  if (!levels) return null;
  for (const list of Object.values(levels)) {
    const found = list.find((p) => p.id === perkId);
    if (found) return found;
  }
  return null;
}

export function xpToNext(config, level) {
  return config.crew.xpBase + (level - 1) * config.crew.xpStep;
}

// Permanent station speed from chosen perks. Never above crew.speedCap.
export function permanentSpeed(config, crewId, perks) {
  let sum = 0;
  for (const id of perks) {
    const def = perkDef(config, crewId, id);
    if (def?.speed) sum += def.speed;
  }
  return Math.min(config.crew.speedCap, Math.max(0, sum));
}

export function comboUnlocked(state, id) {
  return state.combosUnlocked.includes(id);
}

export function checkCombos(game) {
  for (const combo of game.config.combos) {
    if (comboUnlocked(game.state, combo.id)) continue;
    const ready = combo.pair.every((id) => game.state.crew[id].level >= combo.level);
    if (!ready) continue;
    game.state.combosUnlocked.push(combo.id);
    emit(game, {
      type: 'combo',
      kind: 'unlock',
      comboId: combo.id,
      pair: combo.pair.slice(),
      textKey: combo.textKey,
      cue: 'combo.hit',
    });
  }
}

export function procCombos(game, trigger) {
  const fired = [];
  for (const combo of game.config.combos) {
    if (combo.trigger !== trigger) continue;
    if (!comboUnlocked(game.state, combo.id)) continue;
    const effect = combo.effect || {};
    if (effect.duration) {
      game.state.timed.push({
        until: game.state.t + effect.duration,
        serve: effect.serve || 0,
        prep: effect.prep || 0,
        grill: effect.grill || 0,
        register: effect.register || 0,
        tipMult: effect.tipMult || 0,
        demandAdd: effect.demandAdd || 0,
        patienceDrain: effect.patienceDrain || 0,
      });
    }
    emit(game, {
      type: 'combo',
      kind: 'proc',
      comboId: combo.id,
      pair: combo.pair.slice(),
      textKey: combo.textKey,
      cue: 'combo.hit',
    });
    fired.push(combo.id);
  }
  return fired;
}

export function addXp(game, crewId, amount) {
  if (amount <= 0) return;
  const member = game.state.crew[crewId];
  member.xp += amount;
  let guard = 0;
  while (guard++ < 8) {
    const need = xpToNext(game.config, member.level);
    if (member.xp < need) break;
    member.xp -= need;
    member.level += 1;
    emit(game, {
      type: 'levelUp',
      crewId,
      level: member.level,
      textKey: `crew.${crewId}.levelUp`,
      cue: 'level.up',
    });
    const options = game.config.crew.perks[crewId]?.[member.level];
    if (options?.length) {
      const pending = {
        crewId,
        level: member.level,
        options: options.map((p) => p.id),
      };
      game.state.pendingPerks.push(pending);
      emit(game, {
        type: 'perkChoice',
        crewId,
        level: member.level,
        options: options.map((p) => ({ id: p.id, textKey: p.textKey })),
      });
    }
  }
  checkCombos(game);
}

export function awardShiftXp(game) {
  const cfg = game.config.crew;
  const served = game.state.throughput.serve || 0;
  for (const crewId of Object.keys(STATION_CREW)) {
    addXp(game, crewId, cfg.xpShift + cfg.xpPerTaco * served);
  }
  const callBonus = game.state.dayLedger.callId ? cfg.xpCall : 0;
  const hackBonus = game.state.dayLedger.hackId && !game.state.dayLedger.hackBackfire ? cfg.xpHack : 0;
  addXp(game, 'aaron', cfg.xpShift + callBonus + game.state.dayLedger.goldenHit);
  addXp(game, 'antonio', cfg.xpShift + hackBonus);
}

export function choosePerk(game, crewId, perkId) {
  const idx = game.state.pendingPerks.findIndex((p) => p.crewId === crewId);
  if (idx < 0) return { ok: false, reason: 'no-perk' };
  const pending = game.state.pendingPerks[idx];
  if (!pending.options.includes(perkId)) return { ok: false, reason: 'unknown-perk' };
  if (!perkDef(game.config, crewId, perkId)) return { ok: false, reason: 'unknown-perk' };
  game.state.crew[crewId].perks.push(perkId);
  game.state.pendingPerks.splice(idx, 1);
  checkCombos(game);
  emit(game, { type: 'perkChosen', crewId, perkId, textKey: perkDef(game.config, crewId, perkId).textKey });
  noteDecision(game);
  return { ok: true };
}

export function marginMult(state) {
  if (!comboUnlocked(state, 'executiveDecision')) return 1;
  return 1.03;
}

export function restockMult(state) {
  let mult = 1;
  if (comboUnlocked(state, 'freightGuy')) mult *= 0.85;
  if (hasPerk(state, 'phillip', 'tortillaSense')) mult *= 0.9;
  return mult;
}

export function clipboardCut(state, config) {
  let cut = 0;
  if (hasPerk(state, 'aaron', 'clipboard')) cut += config.crew.clipboardCut;
  if (hasPerk(state, 'aaron', 'float')) cut += config.crew.floatCut;
  return cut;
}

export function moneyTip(n) {
  return money(Math.max(0, n));
}
