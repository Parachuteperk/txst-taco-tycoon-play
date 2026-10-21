import { TUNING } from './tuning.js';

export { CONFIG } from './config.js';
export { TUNING };
export { TEXT } from './text.js';
export { EVENT_TYPES } from './events.js';
export { SAVE_VERSION, createGame, load, loadGame, migrate, serialize } from './createGame.js';
export { cashBridge, computePnL } from './economy.js';
export { permanentSpeed, xpToNext } from './crew.js';
export { arrivalRate, stationSpeed, detectBottleneck } from './pipeline.js';
export { createTendPolicy, createHandsOffPolicy } from './autoPolicy.js';

export const SPEED_CAP = TUNING.perks.speedCap;
