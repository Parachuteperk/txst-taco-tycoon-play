// One calm check-in, then the laptop opens with the bell. The goal is that a
// day at 1x never sits 40 seconds with no price, hack, call, West, golden, or beat.

import { emit } from './events.js';

export function blankPacing() {
  return { offered: false, open: false, until: 0, choice: null };
}

export function noteDecision(game) {
  const day = game.state.dayLedger;
  if (day) day.decisions = (day.decisions || 0) + 1;
}

export function playableSeconds(config) {
  let seconds = 0;
  for (const phase of config.phaseOrder || []) {
    if (phase === 'summary') continue;
    seconds += config.phases?.[phase]?.seconds || 0;
  }
  return seconds;
}

export function decisionsPerMinute(decisions, config) {
  const minutes = playableSeconds(config) / 60;
  if (!(minutes > 0)) return 0;
  return decisions / minutes;
}

export function decisionHot(view) {
  if (!view || view.phase === 'summary') return false;
  if (view.phase === 'preopen') return true;
  const prompts = view.prompts || {};
  return !!(prompts.call || prompts.hack || prompts.west || prompts.golden || prompts.beat || prompts.perks);
}

export function stepPacing(game) {
  const cfg = game.config.pacing;
  const pacing = game.state.pacing;
  if (!cfg || !pacing) return;
  const s = game.state;
  if (pacing.open && s.t >= pacing.until - 1e-9) {
    pacing.open = false;
    if (!pacing.choice) pacing.choice = cfg.choices.find((choice) => choice.safe)?.id || null;
  }
  if (pacing.offered || pacing.open) return;
  if (s.phase !== 'calm' || s.phaseT + 1e-9 < cfg.beatAt) return;
  pacing.offered = true;
  pacing.open = true;
  pacing.until = s.t + cfg.window;
  emit(game, { type: 'pacing', textKey: 'pacing.quad', cue: 'pacing.beat' });
}

export function chooseBeat(game, choiceId, auto = false) {
  const pacing = game.state.pacing;
  if (!pacing?.open) return { ok: false, reason: 'not-open' };
  const choice = (game.config.pacing?.choices || []).find((row) => row.id === choiceId);
  if (!choice) return { ok: false, reason: 'unknown-choice' };
  pacing.open = false;
  pacing.choice = choiceId;
  if (choice.effect?.grill) {
    game.state.timed.push({
      grill: choice.effect.grill,
      until: game.state.t + (choice.effect.duration || 20),
    });
  }
  emit(game, {
    type: 'pacing',
    choice: choiceId,
    auto: !!auto,
    textKey: choice.textKey,
    cue: 'pacing.choice',
  });
  if (!auto) noteDecision(game);
  return { ok: true };
}
