import { el } from './dom.js';
import { copy } from '../bridge/copy.js';
import { iconize } from './icons.js';
import { money } from './dom.js';

export function seasonProgress(view) {
  const target = view.season?.goal ?? view.goal?.target ?? 1200;
  const cash = Number.isFinite(view.cash) ? view.cash : 0;
  return { target, cash, value: Math.max(0, Math.min(target, cash)), milestones: view.season?.milestones || [], endless: !!view.season?.endless };
}
// Engine marks milestones at closing. Loading an already-met milestone is silent.
export function reachedMilestones(previous, next) {
  if (!previous || next.day < previous.day || next.t < previous.t || next.season?.endless) return [];
  const met = new Set((previous.season?.milestones || []).filter(row => row.met).map(row => row.id));
  return (next.season?.milestones || []).filter(row => row.met && !met.has(row.id));
}
export const seasonNeedsReview = view => !!(view.season?.summary && view.season.complete && !view.season.endless && view.phase === 'summary');

export function createSeasonProgress() {
  const node = el('div', 'season-progress'), label = iconize(el('div', 'season-goal-label'), 'cash', 16), value = el('span'), bar = el('progress', 'goal');
  label.append(value);
  bar.setAttribute('aria-label', 'SIFE regional pitch and second stand cash goal');
  const marks = el('div', 'milestone-marks'); node.append(label, bar, marks);
  let key = '';
  return { node, update(view) {
    const model = seasonProgress(view);
    // A dedicated text span keeps the atlas icon intact across every tick.
    value.textContent = `${model.endless ? 'Endless Quad' : 'SIFE pitch'} · ${money(model.cash)} / ${money(model.target)}`;
    bar.max = model.target; bar.value = model.value;
    const nextKey = JSON.stringify(model.milestones);
    if (key !== nextKey) {
      key = nextKey; marks.replaceChildren();
      for (const row of model.milestones) {
        const mark = el('span', row.met ? 'milestone met' : 'milestone', money(row.target));
        mark.title = copy(row.textKey); mark.setAttribute('aria-label', `${money(row.target)}${row.met ? ' reached' : ''}`); marks.append(mark);
      }
    }
  } };
}

export function fillSeasonSummary(node, view) {
  const result = view.season.summary, grade = iconize(el('div', 'season-grade', `Grade ${result.grade}`), 'levelUp', 36);
  node.append(grade, el('p', 'season-rank', copy(result.rankKey || result.gradeKey)), el('p', '', copy(result.textKey)));
  node.append(el('p', 'tagline', 'SIFE regional pitch + second stand'));
  const progress = createSeasonProgress(); progress.update(view); node.append(progress.node);
  const stats = el('div', 'stats'), s = result.stats;
  const rows = [['Cash', money(s.cash), 'cash'], ['Tacos sold', s.tacos, 'tacos'], ['Profit', money(s.profit), 'cash'], ['Walked away', s.walkoffs, 'queue'], ['Revenue', money(s.revenue), 'cash'], ['Fines', money(s.fines), 'suspicion'], ['Big Rush days', s.bigRushes, 'bigRush'], ['Hacks', s.hacks, 'hack'], ['Days open', s.days, 'timer']];
  for (const [label, value, image] of rows) {
    const box = el('div', 'stat'); box.append(iconize(el('div', 'stat-label', label), image, 18), el('strong', '', String(value))); stats.append(box);
  }
  node.append(stats);
  if (result.bestDay) node.append(iconize(el('p', 'season-best', `Best day · Week ${result.bestDay.week}, ${result.bestDay.dayName} (Day ${result.bestDay.day}) · ${money(result.bestDay.profit)} profit · ${result.bestDay.tacos} tacos`), 'xp', 22));
}
