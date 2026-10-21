import { el, button } from './dom.js';
import { copy } from '../bridge/copy.js';
import { icon, iconize } from './icons.js';
import { portrait } from './portraits.js';

const PEOPLE = { west: { title: 'Mrs. West · business professor', icon: 'advice', portrait: 'west' }, dale: { title: 'Inspector Dale', icon: 'suspicion', portrait: 'dale' }, campus: { title: 'Around the Quad', icon: 'weather', portrait: 'campus' } };
export const eventCardKey = (view, card) => `${view.day}:${card.deck}:${card.id}`;
export function openEventCards(view) {
  return ['west', 'dale', 'campus'].map(deck => view.deck?.[deck]).filter(card => card?.open && !card.choice);
}
export function eventCardModel(card) {
  const person = PEOPLE[card.deck] || PEOPLE.campus;
  return { ...person, body: copy(card.textKey), choices: card.choices.map(choice => ({ ...choice, label: copy(choice.textKey) })) };
}

export function fillEventCard(node, card, view, choose) {
  const model = eventCardModel(card), intro = el('div', 'event-intro');
  const slot = el('div', 'portrait-slot'); slot.dataset.portrait = model.portrait;
  slot.setAttribute('aria-hidden', 'true');
  if (model.portrait === 'west' || model.portrait === 'dale') {
    // West's card is her blushing visit. Dale's card is the inspection.
    slot.append(portrait(model.portrait, 56, true));
  } else slot.append(icon(model.icon, 44));
  intro.append(slot, el('p', 'event-body', model.body)); node.append(intro);
  if (card.deck === 'west') {
    node.setAttribute('aria-description', copy('character.west.description'));
    node.append(el('p', 'event-advice', copy(view.west?.adviceKey)));
  }
  const options = el('div', 'options');
  let picked = false;
  for (const choice of model.choices) {
    const control = iconize(button(choice.label, () => {
      if (picked) return;
      const result = choose(card.deck, choice.id);
      if (result?.ok) { picked = true; options.querySelectorAll('button').forEach(b => { b.disabled = true; }); }
    }), choice.safe ? 'trust' : model.icon);
    control.dataset.choice = choice.id; control.dataset.safe = String(choice.safe);
    control.append(el('small', 'choice-kind', choice.safe ? 'Safe choice' : 'Take action'));
    options.append(control);
  }
  node.append(options);
  return node;
}
