import { emit } from './events.js';
import { bookSale, payFine } from './economy.js';
import { pourAgenda } from './bigRush.js';
import { attachDaleCard } from './deck.js';
import { hasPerk, procCombos } from './crew.js';
import { bumpStat } from './achievements.js';
import { difficultyMods } from './difficulty.js';
import { noteDecision } from './pacing.js';
import { clamp, money } from './util.js';

export function blankHack() {
  return {
    used: false,
    channel: 0,
    pending: null,
    demandAdd: 0,
    demandUntil: 0,
    guac: false,
    tipMult: 1,
    priceMult: 1,
    patienceMult: 1,
  };
}

export function blankInspector() {
  return { timer: 0, mute: 0, pending: 0, seenToday: false };
}

function effectScale(state, config) {
  let scale = 1;
  if (hasPerk(state, 'antonio', 'quietHands')) scale *= config.crew.quietEffect;
  if (hasPerk(state, 'antonio', 'loudExploit')) scale *= config.crew.loudEffect;
  return scale;
}

function suspicionGain(state, config, base) {
  let n = base;
  if (hasPerk(state, 'antonio', 'quietHands')) n *= config.crew.quietSuspicion;
  if (hasPerk(state, 'antonio', 'loudExploit')) n *= config.crew.loudSuspicion;
  if (state.combosUnlocked.includes('executiveDecision')) n += 2;
  return n * difficultyMods({ state, config }).suspicion;
}

export function hackAvailable(game) {
  const s = game.state;
  const cfg = game.config.hacks;
  if (s.hack.used || s.hack.channel > 0) return false;
  if (s.phase === 'telegraph') return true;
  return s.phase === 'rush' && s.phaseT >= cfg.openAt && s.phaseT <= cfg.closeAt;
}

export function startHack(game, targetId) {
  const s = game.state;
  const cfg = game.config.hacks;
  if (s.hack.used) return { ok: false, reason: 'already-used' };
  if (s.phase !== 'rush' && s.phase !== 'telegraph') return { ok: false, reason: 'wrong-phase' };
  if (s.phase === 'rush' && (s.phaseT < cfg.openAt || s.phaseT > cfg.closeAt)) return { ok: false, reason: 'wrong-phase' };
  const target = cfg.targets[targetId];
  if (!target) return { ok: false, reason: 'unknown-target' };
  s.hack.used = true;
  s.hack.pending = targetId;
  let channel = cfg.channel;
  if (hasPerk(s, 'antonio', 'secondMonitor')) channel -= game.config.crew.channelCut;
  if (hasPerk(s, 'antonio', 'headphones')) channel -= cfg.headphoneCut;
  s.hack.channel = Math.max(cfg.channelFloor, channel);
  emit(game, { type: 'hackStart', targetId, textKey: target.textKey, cue: 'hack.typing' });
  noteDecision(game);
  return { ok: true };
}

function applyEffect(game, effect, scale) {
  const s = game.state;
  if (effect.burst) {
    const n = Math.max(1, Math.round(effect.burst * scale));
    const window = effect.burstWindow || 10;
    for (let i = 0; i < n; i++) {
      s.schedule.push({
        at: s.t + (window * (i + 1)) / (n + 1),
        spec: {
          kind: 'hack',
          source: 'hack',
          guac: effect.guac != null ? !!effect.guac : null,
          tipMult: effect.tipMult ?? null,
          priceMult: effect.priceMult ?? null,
        },
      });
    }
  }
  if (effect.demandAdd) {
    s.hack.demandAdd = effect.demandAdd * scale;
    s.hack.demandUntil = s.t + (effect.duration || 60);
  }
  if (effect.patienceMult) s.hack.patienceMult = effect.patienceMult;
  if (effect.guac) s.hack.guac = true;
  if (effect.tipMult) s.hack.tipMult = effect.tipMult;
  if (effect.priceMult) s.hack.priceMult = effect.priceMult;
}

function arriveInspector(game) {
  const s = game.state;
  const cfg = game.config.inspector;
  const fine = s.suspicion >= cfg.fineAt;
  const fineAmount = money(cfg.fine * difficultyMods(game).fine);
  emit(game, {
    type: 'inspectorArrives',
    textKey: fine ? 'inspector.fine' : 'inspector.warning',
    nameKey: 'inspector.dale',
    fine,
    cue: 'inspector.sting',
  });
  if (fine) {
    payFine(s, fineAmount);
    s.suspicion = cfg.fineReset;
  } else {
    s.suspicion = Math.max(0, s.suspicion - cfg.warnRelief);
  }
  const band = game.config.economy.prices[s.priceBand];
  const n = Math.min(fine ? 1 : 2, s.inventory.tortillas);
  if (n > 0) {
    s.inventory.tortillas -= n;
    bookSale(s, {
      food: money(band.price * n),
      tip: money(0.25 * n),
      filling: money(game.config.economy.filling * n),
      tacos: n,
    });
    emit(game, {
      type: 'sale',
      source: 'inspector',
      tacos: n,
      textKey: 'sale.taco',
      cue: 'sale.chime',
      regularId: null,
    });
  }
  s.inspector.timer = cfg.watch;
  s.inspector.mute = cfg.mute;
  s.inspector.seenToday = true;
  attachDaleCard(game, 'inspection');
}

export function resolveHack(game, targetId) {
  const target = game.config.hacks.targets[targetId];
  const s = game.state;
  let chance = Math.min(1, target.backfire * difficultyMods(game).backfire);
  if (hasPerk(s, 'antonio', 'alibi')) chance *= game.config.crew.alibiMult;
  if (hasPerk(s, 'antonio', 'earpiece')) chance *= game.config.crew.earpieceMult;
  if (game.rng.next() < chance) {
    const bump = suspicionGain(s, game.config, game.config.hacks.backfireSuspicion);
    s.suspicion = clamp(Math.round(s.suspicion + bump), 0, 100);
    s.dayLedger.hackId = targetId;
    s.dayLedger.hackBackfire = true;
    s.inspector.pending = game.config.inspector.arriveIn;
    emit(game, {
      type: 'hackBackfire',
      targetId,
      textKey: 'hack.backfire',
      suspicion: s.suspicion,
      cue: 'hack.backfire',
    });
    return { ok: true, backfire: true };
  }
  const gain = suspicionGain(s, game.config, target.suspicion);
  s.suspicion = clamp(Math.round(s.suspicion + gain), 0, 100);
  applyEffect(game, target.effect, effectScale(s, game.config));
  if (targetId === 'classAgenda') {
    pourAgenda(game);
    bumpStat(game, 'agenda');
  }
  s.dayLedger.hackId = targetId;
  emit(game, {
    type: 'hackResolve',
    targetId,
    textKey: target.textKey,
    suspicion: s.suspicion,
    cue: 'hack.resolve',
  });
  procCombos(game, 'hackSuccess');
  return { ok: true, backfire: false };
}

export function stepHack(game, dt) {
  const s = game.state;
  if (s.hack.channel > 0) {
    s.hack.channel -= dt;
    if (s.hack.channel <= 0) {
      s.hack.channel = 0;
      const pending = s.hack.pending;
      s.hack.pending = null;
      if (s.phase !== 'rush' || !pending) {
        emit(game, { type: 'hackResolve', fizzle: true, textKey: 'hack.fizzle', targetId: pending });
      } else {
        resolveHack(game, pending);
      }
    }
  }
  if (s.inspector.pending > 0) {
    s.inspector.pending -= dt;
    if (s.inspector.pending <= 0) {
      s.inspector.pending = 0;
      arriveInspector(game);
    }
  }
  if (s.inspector.timer > 0) {
    s.inspector.timer -= dt;
    s.inspector.mute = Math.max(0, s.inspector.mute - dt);
    if (s.inspector.timer <= 0) {
      s.inspector.timer = 0;
      s.inspector.mute = 0;
      emit(game, { type: 'inspectorLeaves', textKey: 'inspector.leaves' });
    }
  }
}
