// Events the renderer and the audio layer subscribe to.
// Use game.on(fn) during tick, or game.drainEvents() after tick. Not both,
// or the same beat will be handled twice.

export const EVENT_TYPES = [
  'upgradeBought',
  'milestone',
  'metalSettle',
  'coinFlipChallenge',
  'coinFlipResult',
  'westSuspects',
  'offerResolved',
  'franchiseCut',
  'franchiseOpened',
  'mealPrep',
  'designerPopUp',
  'cannonMisfire',
  'hackyDrop',
  'hackyLegend',
  'grackleCoin',
  'cryptoOverheat',
  'dayStart',
  'phaseChange',
  'rushTelegraph',
  'sale',
  'walkoff',
  'walkBy',
  'bigRush',
  'goldenReady',
  'goldenHit',
  'goldenMiss',
  'combo',
  'bottleneck',
  'stockout',
  'restock',
  'callTheLine',
  'hackStart',
  'hackResolve',
  'hackBackfire',
  'inspectorArrives',
  'inspectorLeaves',
  'westArrives',
  'westPinch',
  'westAdvice',
  'westCookies',
  'westChoice',
  'levelUp',
  'perkChoice',
  'perkChosen',
  'outpostHired',
  'outpostSale',
  'outpostRestock',
  'outpostUpgrade',
  'storyBeat',
  'regularArrives',
  'closingBeat',
  'dayEnd',
  'goalReached',
  'eventCard',
  'seasonEnd',
  'pacing',
  'achievement',
  'challenge',
  'dayReport',
  'marketing',
  'ticker',
  'rival',
  'forecast',
  'project',
  'morale',
  'standings',
  'cashWarning',
  'bailout',
  'orderTaken',
  'payment',
  'itemStarted',
  'itemStageDone',
  'handoff',
  'walkout',
  'waste',
  'gameOver',
];

const FEED_TYPES = new Set([
  'dayStart', 'phaseChange', 'sale', 'walkoff', 'walkBy', 'bigRush',
  'goldenReady', 'goldenHit', 'goldenMiss', 'combo', 'callTheLine', 'restock',
  'hackStart', 'hackResolve', 'hackBackfire', 'inspectorArrives', 'inspectorLeaves',
  'westArrives', 'westPinch', 'westAdvice', 'westCookies', 'levelUp', 'perkChosen',
  'outpostHired', 'outpostSale', 'outpostUpgrade', 'storyBeat', 'challenge', 'achievement',
  'dayReport', 'stockout', 'goalReached', 'rushTelegraph', 'closingBeat',
  'seasonEnd', 'eventCard', 'marketing', 'ticker', 'rival', 'forecast', 'project',
  'morale', 'standings', 'cashWarning', 'bailout', 'gameOver',
]);

function pushFeed(game, event) {
  if (!event?.textKey || !FEED_TYPES.has(event.type) || !game.state) return;
  if (event.type === 'sale' && !event.golden) {
    const m = game.state.manager;
    if (m) {
      m.saleFeed = (m.saleFeed || 0) + 1;
      const every = game.config?.manager?.saleEvery || 4;
      if (m.saleFeed % every !== 0) return;
    }
  }
  if (!Array.isArray(game.state.liveFeed)) game.state.liveFeed = [];
  game.state.liveFeed.push({
    t: event.t,
    day: event.day,
    textKey: event.textKey,
    type: event.type,
    id: event.comboId || event.crewId || event.id || null,
  });
  const cap = game.config?.manager?.feed || 12;
  if (game.state.liveFeed.length > cap) {
    game.state.liveFeed.splice(0, game.state.liveFeed.length - cap);
  }
}

export function emit(game, event) {
  const full = {
    t: game.state?.t ?? 0,
    day: game.state?.day ?? 0,
    ...event,
  };
  game.events.push(full);
  if (game.events.length > 2000) game.events.splice(0, game.events.length - 2000);
  pushFeed(game, full);
  for (const fn of game.listeners) fn(full);
  return full;
}
