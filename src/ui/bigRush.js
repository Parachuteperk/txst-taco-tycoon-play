import { el } from './dom.js';
import { icon } from './icons.js';

// view.queue is the total at the stand, including customers inside stations.
// Neither the normal cap nor the Big Rush cap is a presentation limit.
export function crowdCount(view) {
  if (Number.isFinite(view.queue)) return Math.max(0, Math.floor(view.queue));
  // Compatibility with snapshots made before the total-count field landed.
  return (view.line?.length || 0) + Object.values(view.stations || {}).reduce((total, station) =>
    total + (Number.isFinite(station.queue) ? station.queue : 0) + (station.active ? 1 : 0), 0);
}

export function bigRushTitle(view) {
  if (!view.bigRush?.active) return '';
  const causes = { bigClass: 'Class just let out', gameDay: 'Game day' };
  return `Big Rush · ${causes[view.bigRush.id] || 'The Quad is filling up'}`;
}

export function createBigRushHud() {
  const count = el('div', 'crowd-count'), countText = el('span');
  count.append(icon('queue', 16), countText);
  const banner = el('div', 'big-rush-banner'), bannerText = el('span');
  let cause = null;
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.hidden = true;
  return {
    count, banner,
    update(view) {
      const total = crowdCount(view);
      const label = `${total} at the stand`;
      if (countText.textContent !== label) countText.textContent = label;
      const title = bigRushTitle(view);
      // Announce only the event transition; changing counts are not live alerts.
      if (bannerText.textContent !== title) bannerText.textContent = title;
      const nextCause = view.bigRush?.id;
      if (nextCause !== cause || !banner.children.length) {
        cause = nextCause; banner.replaceChildren(icon(cause === 'gameDay' ? 'gameDay' : 'bigRush', 18), bannerText);
      }
      banner.hidden = !title;
      count.classList.toggle('crowd-count-busy', !!view.bigRush?.active);
    },
  };
}
