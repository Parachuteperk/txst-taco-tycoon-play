// First morning only. The view picks the hint whose gate is open. Dismissals
// are saved; doing the thing also counts, and getView does not write that down.

export function blankOnboard() {
  return { dismissed: false, done: [] };
}

export function ensureOnboard(state) {
  if (!state.onboard) state.onboard = blankOnboard();
  if (!Array.isArray(state.onboard.done)) state.onboard.done = [];
  return state.onboard;
}

export function dismissHint(game, id) {
  const hints = game.config.onboard?.hints || [];
  if (!hints.some((hint) => hint.id === id)) return { ok: false, reason: 'unknown-choice' };
  const onboard = ensureOnboard(game.state);
  if (!onboard.done.includes(id)) onboard.done.push(id);
  return { ok: true };
}

export function dismissOnboarding(game) {
  ensureOnboard(game.state).dismissed = true;
  return { ok: true };
}

export function onboardSnapshot(game) {
  const onboard = game.state.onboard || blankOnboard();
  const hints = game.config.onboard?.hints || [];
  const s = game.state;
  const cfg = game.config;
  const held = (s.dayLedger?.holdSeconds || 0) > (cfg.onboard?.holdAt ?? 0.4);
  const lived = {
    callLine: !!s.call?.used,
    holdGrill: held,
    terminal: !!s.hack?.used,
    hire: !!s.outpost,
  };
  const doneOf = (id) => onboard.done.includes(id) || !!lived[id];
  const callGate = s.phase === 'rush'
    && !s.call?.used
    && s.phaseT >= cfg.call.openAt
    && s.phaseT <= cfg.call.closeAt;
  const hackGate = s.phase === 'rush'
    && !s.hack?.used
    && (s.hack?.channel || 0) <= 0
    && s.phaseT >= cfg.hacks.openAt
    && s.phaseT <= cfg.hacks.closeAt;
  const callShowing = !doneOf('callLine') && callGate;
  let currentId = null;
  if (s.day === 1 && !onboard.dismissed) {
    if (s.phase === 'summary' && !doneOf('hire')) currentId = 'hire';
    else if (callShowing) currentId = 'callLine';
    else if (s.phase === 'rush' && !doneOf('holdGrill') && !held && !callShowing) currentId = 'holdGrill';
    else if (hackGate && doneOf('callLine') && doneOf('holdGrill') && !doneOf('terminal')) currentId = 'terminal';
  }
  const current = currentId
    ? {
      id: currentId,
      textKey: hints.find((hint) => hint.id === currentId)?.textKey || currentId,
      step: hints.findIndex((hint) => hint.id === currentId) + 1,
      steps: hints.length,
    }
    : null;
  return {
    active: s.day === 1 && !onboard.dismissed,
    dismissed: !!onboard.dismissed,
    current,
    hints: hints.map((hint) => ({ id: hint.id, textKey: hint.textKey, done: doneOf(hint.id) })),
  };
}
