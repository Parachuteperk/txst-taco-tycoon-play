// One transition for Start Day and Return to Watch. A preopen phase can be
// either held, fresh or already running; native Start Day distinguishes them.
export function enterWatch(game, manager) {
  const view = game.getView();
  const needsStart = view.phase === 'preopen' || view.phase === 'summary' || view.manager?.planning === true || view.manager?.holding === true;
  let transition = { ok: true };
  if (needsStart) {
    const result = manager.action(game, 'startDay');
    if (!result?.ok && !['already-started','day-in-progress'].includes(result?.reason)) return result || { ok: false, reason: 'unavailable' };
    transition = { ...result, ok: true };
  }
  const next = game.getView();
  if (next.phase === 'summary' || next.manager?.planning || next.manager?.holding) return { ok: false, reason: next.manager?.holding ? 'holding' : 'day-not-open' };
  if (next.manager && (!next.manager.auto || next.manager.engaged === false)) {
    const result = manager.action(game, 'setPolicy', { auto: true, engaged: true });
    if (!result?.ok) return result || { ok: false, reason: 'unavailable' };
  }
  return transition;
}

