import { el, button } from './dom.js';
import { perkCopy } from '../bridge/copy.js';
import { iconize } from './icons.js';

// Current engine view contract; no XP thresholds or perk mechanics live in UI.
// Absence is allowed while integrating an engine snapshot without crew progression.
export function pendingPerks(view) {
  return Array.isArray(view.pendingPerks) ? view.pendingPerks : [];
}

export function perkCardModel(row, remaining) {
  const name = row.crewId[0].toUpperCase() + row.crewId.slice(1);
  return {
    title: `${name} · level ${row.level}`,
    description: `Choose one skill for tomorrow’s shift.${remaining > 1 ? ` ${remaining} crew picks remaining.` : ''}`,
    options: row.options.map(option => {
      const text = perkCopy(option.textKey || option.id), split = text.indexOf('. ');
      return {
        id: option.id,
        label: split < 0 ? text : text.slice(0, split),
        description: split < 0 ? '' : text.slice(split + 2),
      };
    }),
  };
}

export function createPerkOptions(model, onChoose) {
  const choices = el('div', 'options perk-options');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Choose one crew perk');
  let submitting = false;
  for (const [index, option] of model.options.entries()) {
    const pick = button(`${index + 1}. ${option.label}`, () => {
      if (submitting) return;
      submitting = true;
      const result = onChoose(option.id);
      // A rejected engine action keeps the same reviewable choices available.
      // Successful commands replace the card from the next engine snapshot.
      if (!result?.ok) submitting = false;
      else for (const item of choices.querySelectorAll('button')) item.disabled = true;
    }, 'perk-choice');
    iconize(pick, 'perk');
    if (option.description) pick.append(el('small', '', option.description));
    choices.append(pick);
  }
  return choices;
}
