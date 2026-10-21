import { t, createSeededRng } from '../content/strings.js';
import { TEXT } from '../game/text.js';
const rng = createSeededRng(20261020);
export const hackKeys = { classAgenda: 'agenda', bellEarly: 'bell', tacoNet: 'wifi', freeGuac: 'guac', synergyApp: 'rivalApp' };
const aliases = {
  'hack.backfire': 'antonio.hack.generic.backfire',
  'inspector.arrive': 'dale.arrive', 'inspector.warning': 'dale.warning',
  'closing.grillOff': 'closing.step.clean', 'closing.counter': 'closing.step.clean',
  'closing.cashbox': 'closing.step.cash', 'closing.mattSits': 'closing.step.delivery',
  'closing.antonioHype': 'closing.step.laptop', 'closing.aaronLooks': 'closing.step.memory',
  'maya.day1.thanks': 'maya.day1.leave', 'maya.day2.return': 'maya.day2.arrive',
  'maya.day2.chat': 'maya.day2.leave', 'inspector.leaves': 'dale.exit',
};
// Descriptions in the content pack sometimes promise different mechanics. Engine
// English is authoritative for these labels; never advertise a nonexistent perk.
export function copy(key, vars = {}) {
  if (!key) return '';
  const value = t(aliases[key] || key, vars, rng);
  return value === (aliases[key] || key) ? TEXT[key] || key.replaceAll('.', ' ') : value;
}
export function perkCopy(key) { return TEXT[key] || copy(key); }
export function eventCopy(e) {
  if (e.type === 'hackResolve' && !e.fizzle) return copy(`antonio.hack.${hackKeys[e.targetId]}.success`);
  if (e.type === 'hackStart') return 'Antonio: opening the laptop…';
  return copy(e.textKey);
}
