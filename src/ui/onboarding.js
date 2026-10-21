import { el, button } from './dom.js';
import { copy } from '../bridge/copy.js';
import { iconize } from './icons.js';

const STEPS = { callLine: { label: 'Show Call the Line', icon: 'callLine' }, holdGrill: { icon: 'heat' }, terminal: { label: 'Open terminal', icon: 'hack' }, hire: { label: 'Open hire screen', icon: 'hire' } };
export function onboardingModel(view) {
  const hint = view.onboard?.active ? view.onboard.current : null;
  return hint ? { ...hint, ...STEPS[hint.id], body: copy(hint.textKey) } : null;
}
export function createOnboarding(invoke, open) {
  const node = el('aside', 'onboarding-bubble'); node.setAttribute('aria-label', 'First day guide');
  const message = el('div'); message.setAttribute('aria-live', 'polite');
  const controls = el('div', 'onboarding-controls'); node.append(message, controls); node.hidden = true;
  let key = '';
  return { node, update(view) {
    const model = onboardingModel(view); node.hidden = !model;
    const nextKey = model ? `${model.id}:${model.step}` : '';
    if (key === nextKey) return; key = nextKey;
    message.replaceChildren(); controls.replaceChildren();
    if (!model) return;
    node.dataset.hint = model.id;
    message.append(iconize(el('div', 'eyebrow', `First day · ${model.step}/${model.steps}`), model.icon, 18), el('p', '', model.body));
    if (model.label) controls.append(button(model.label, () => open(model.id)));
    controls.append(button('Got it', () => invoke('dismissHint', model.id)), button('Skip guide', () => invoke('dismissOnboarding')));
  } };
}
