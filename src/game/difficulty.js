// Chill, Normal, and Chaos are multipliers on the week ramp. Normal is all ones,
// so a fresh game plays the tuned semester. The id is saved on the state.

const IDENTITY = {
  demand: 1,
  patience: 1,
  cost: 1,
  price: 1,
  overhead: 1,
  dale: 1,
  suspicion: 1,
  backfire: 1,
  fine: 1,
};

export function ensureDifficulty(state, config) {
  const levels = config?.difficulty?.levels || {};
  if (!levels[state.difficulty]) state.difficulty = config?.difficulty?.default || 'normal';
  return state.difficulty;
}

export function difficultyMods(game) {
  const id = game.state.difficulty || game.config.difficulty?.default || 'normal';
  const row = game.config.difficulty?.levels?.[id] || {};
  return {
    id,
    textKey: row.textKey || `difficulty.${id}`,
    demand: row.demand ?? IDENTITY.demand,
    patience: row.patience ?? IDENTITY.patience,
    cost: row.cost ?? IDENTITY.cost,
    price: row.price ?? IDENTITY.price,
    overhead: row.overhead ?? IDENTITY.overhead,
    dale: row.dale ?? IDENTITY.dale,
    suspicion: row.suspicion ?? IDENTITY.suspicion,
    backfire: row.backfire ?? IDENTITY.backfire,
    fine: row.fine ?? IDENTITY.fine,
  };
}

export function setDifficulty(game, id) {
  if (!game.config.difficulty?.levels?.[id]) return { ok: false, reason: 'unknown-choice' };
  game.state.difficulty = id;
  return { ok: true };
}
