import {copy} from '../bridge/copy.js';

const ROTATE_SEC = 3.2;

export function liveFeed(entry, view) {
  if (!entry) return '';
  if (entry.type === 'dayReport') return `${view?.today?.tacos ?? 0} tacos sold · ${view?.today?.walkoffs ?? 0} walkouts. Daily report ready.`;
  if (entry.type === 'walkoff' || entry.type === 'walkBy') {
    const n = view?.today?.walkoffs || 0;
    const line = copy(entry.textKey || '');
    return n > 1 ? `${n} walkouts. ${line}` : line;
  }
  return copy(entry.textKey || '');
}

function whoFor(entry) {
  const key = `${entry?.type || ''} ${entry?.textKey || ''}`;
  if (/walkoff|walkBy/.test(key)) return 'matt';
  if (/sale/.test(key)) return 'jared';
  if (/dale|inspector/i.test(key)) return 'dale';
  if (/rival/i.test(key)) return 'antonio';
  if (/west/i.test(key)) return 'west';
  if (/grill|ali/i.test(key)) return 'ali';
  if (/hack/i.test(key)) return 'antonio';
  return null;
}

function hot(entry) {
  const type = entry?.type || '';
  const key = entry?.textKey || '';
  if (['walkoff', 'walkBy', 'inspectorArrives', 'inspectorLeaves', 'rival', 'hackBackfire'].includes(type)) return true;
  if (/dale|inspector|rival|walkoff|cash\.warning|cash\.bailout|gameOver/i.test(key)) return true;
  if (type === 'sale' && entry.golden) return true;
  return false;
}

// Distinct headlines from the live feed, newest first. Ordinary taco sales
// collapse into one spike so they cannot pin the ticker on a single ambient line.
export function tickerLines(feed, view) {
  const rows = Array.isArray(feed) ? feed : [];
  const lines = [];
  const seen = new Set();
  let sales = 0;
  const push = (entry, text, isHot) => {
    const line = (text || '').trim();
    if (!line || seen.has(line)) return;
    seen.add(line);
    lines.push({
      text: line,
      who: whoFor(entry),
      hot: !!isHot,
      key: `${entry?.day ?? ''}:${entry?.t ?? ''}:${entry?.type ?? ''}:${entry?.textKey ?? ''}:${entry?.count ?? ''}`,
    });
  };
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const entry = rows[i];
    if (entry?.type === 'sale' && entry.textKey !== 'sale.golden') { sales += 1; continue; }
    push(entry, liveFeed(entry, view), hot(entry));
  }
  if (sales >= 3) push({ type: 'sale', textKey: 'sale.taco', count: sales }, `Sales spike. ${sales} tacos just handed off.`, true);
  else if (sales > 0) push({ type: 'sale', textKey: 'sale.taco' }, copy('sale.taco'), false);
  if (view?.live?.rival?.present) push({ type: 'rival', textKey: 'rival.arrive' }, copy('rival.arrive'), true);
  return lines.slice(0, 8);
}

export function advanceTicker(state, feed, view, dt) {
  const lines = tickerLines(feed, view);
  const base = state || { index: 0, age: 0, hotKey: '', tacos: view?.today?.tacos || 0, walkoffs: view?.today?.walkoffs || 0 };
  if (!lines.length) return { ...base, text: base.text || '', who: base.who || null, lines };
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const sold = (view?.today?.tacos || 0) - (base.tacos || 0);
  const walked = (view?.today?.walkoffs || 0) - (base.walkoffs || 0);
  if (walked > 0) {
    const text = walked === 1
      ? 'A walkout. Someone checked the clock and left hungry.'
      : `${walked} walkouts. The rope is longer than their patience.`;
    return { index: 0, age: 0, hold: true, hotKey: `walk:${view.today.walkoffs}`, tacos: view.today.tacos || 0, walkoffs: view.today.walkoffs, text, who: 'matt', lines };
  }
  if (sold >= 4) {
    return {
      index: 0, age: 0, hold: true, hotKey: `sale:${view.today.tacos}`, tacos: view.today.tacos, walkoffs: view?.today?.walkoffs || 0,
      text: `Sales spike. ${sold} tacos just went out.`, who: 'jared', lines,
    };
  }
  let index = base.index || 0;
  let age = (base.age || 0) + step;
  let hotKey = base.hotKey || '';
  if (base.hold && base.text && age < ROTATE_SEC) {
    return { ...base, age, lines, text: base.text, who: base.who || null };
  }
  const newestHot = lines.find((line) => line.hot);
  if (newestHot && newestHot.key !== hotKey) {
    return { index: lines.indexOf(newestHot), age: 0, hold: true, hotKey: newestHot.key, tacos: base.tacos || 0, walkoffs: base.walkoffs || 0, text: newestHot.text, who: newestHot.who, lines };
  }
  if (lines.length > 1 && age >= ROTATE_SEC) {
    age = 0;
    index = (index + 1) % lines.length;
  }
  if (index >= lines.length) index = 0;
  const current = lines[index];
  return { index, age, hold: false, hotKey, tacos: base.tacos || 0, walkoffs: base.walkoffs || 0, text: current.text, who: current.who, lines };
}
