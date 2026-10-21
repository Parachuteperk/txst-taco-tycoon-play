// Hooks the other painters already import. The grade, outline, density snap,
// and contact shadow live in src/art/composite.js. These names only forward.
import { compositeSprite, drawContactShadow, SCALE } from './art/composite.js';

export function customerCrewScale() {
  return SCALE.customer;
}

export function customerJitter() {
  return { x: 0, y: 0 };
}

export function finishCustomerSprite(sprite, role = 'customer') {
  if (!sprite || sprite.composited) return sprite;
  if (typeof sprite.getContext === 'function') return compositeSprite(sprite, role);
  return sprite;
}

export function paintContactShadow(ctx, x, y, destW, opt) {
  drawContactShadow(ctx, x, y, destW, opt);
}

export function posedCustomer(sprite, person) {
  if (!sprite) return null;
  const alt = sprite.react;
  if (!alt || !person) return sprite;
  const state = person.state || person.actor?.state || '';
  const mood = person.mood || person.actor?.mood || '';
  if (state === 'happy' || state === 'eat' || state === 'handoff' || mood === 'happy' || mood === 'impatient' || mood === 'angry' || state === 'walkout') return alt;
  return sprite;
}
