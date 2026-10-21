// Crew trees, stand paths, and signature cards.
// The design catalog is docs/design/claude-upgrades.md. src/data/upgrades.json
// replaces it when the engine publishes that file.
// Aaron's overrides: every signature stays purchasable (no one-per-crew lock),
// and AI Ali is the top node of Ali's skill tree. Ali's signature card is
// The Ali Special. Pitch Night, the Hype DJ Booth, the Dorm Delivery Moped,
// and Trick Shot Toss are not shown.

import { el, button, money } from '../dom.js';
import { portrait } from '../portraits.js';
import { BIBLE_RAW, parseUpgradeMarkdown } from './bible.js';

export const CREW_IDS = ['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west'];
const DROPPED = /pitch night|hype dj|dorm delivery|trick shot/i;
const SIGNATURE_TIER = 5;
const TREE_TOP = new Set(['ali_ai_ali']);
const SLIDE_IN = new Set(['jared_coin_flip', 'west_angel_round', 'antonio_twitch_raid', 'west_hostile_takeover']);
const WIDGETS = {
  jared_vault: 'vault',
  jared_coin_flip: 'coin',
  aaron_surge_board: 'surge',
  aaron_franchise_deal: 'franchise',
  matt_grackle_squad: 'grackle',
  matt_hacky_sack: 'hacky',
  ali_ai_ali: 'ai',
};

const NAMES = {
  jared: 'Jared', phillip: 'Phillip', ali: 'Ali', matt: 'Matt', aaron: 'Aaron', antonio: 'Antonio', west: 'Mrs. West',
};

function emptyCatalog() {
  const crewUpgrades = {};
  const signatures = {};
  for (const id of CREW_IDS) {
    crewUpgrades[id] = [];
    signatures[id] = [];
  }
  return { source: 'bible', crewUpgrades, signatures, standUpgrades: { main: [], stall: [] } };
}

export function fallbackCatalog() {
  return normalizeCatalog(BIBLE_RAW, emptyCatalog(), 'bible');
}

function displayName(row) {
  if (row.id === 'antonio_twitch_raid') return 'Stream Raid';
  return row.name || row.id;
}

function isSignature(row) {
  if (TREE_TOP.has(row.id) || row.top) return false;
  return !!(row.signature || row.kind === 'signature' || (Number(row.tier) || 0) >= SIGNATURE_TIER);
}

function cleanNode(row) {
  const name = displayName(row);
  const top = TREE_TOP.has(row.id) || !!row.top;
  return {
    id: row.id,
    tier: Number(row.tier) || 0,
    name,
    cost: Number(row.cost) || 0,
    requires: Array.isArray(row.requires) ? row.requires.slice() : [],
    effects: row.effects || {},
    visual: row.visual || '',
    blurb: row.blurb || row.description || row.visual || '',
    risk: Number.isFinite(row.risk) ? row.risk : null,
    reward: Number.isFinite(row.reward) ? row.reward : null,
    signature: isSignature(row),
    event: !!(row.event || row.kind === 'event' || SLIDE_IN.has(row.id)),
    pending: !!row.pending,
    top,
    widget: row.widget || WIDGETS[row.id] || widgetFor(row.id, name),
  };
}

export function widgetFor(id = '', name = '') {
  const key = `${id} ${name}`.toLowerCase();
  if (key.includes('vault')) return 'vault';
  if (key.includes('coin')) return 'coin';
  if (key.includes('ai ali') || key.includes('ai-ali')) return 'ai';
  if (key.includes('surge')) return 'surge';
  if (key.includes('franchise')) return 'franchise';
  if (key.includes('grackle')) return 'grackle';
  if (key.includes('hacky')) return 'hacky';
  return '';
}

export function droppedName(name = '') {
  return DROPPED.test(name);
}

function keep(node) {
  return node?.id && !droppedName(node.name) && !droppedName(node.id);
}

function dedupe(nodes) {
  const seen = new Set();
  const out = [];
  for (const node of nodes) {
    if (!node?.id || seen.has(node.id)) continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

function splitRows(rows) {
  const tree = [];
  const sig = [];
  for (const node of rows) {
    if (node.top || node.id === 'ali_ai_ali') {
      node.signature = false;
      node.top = true;
      node.widget = node.widget || 'ai';
      tree.push(node);
    } else if (node.signature) sig.push(node);
    else tree.push(node);
  }
  return { tree: tree.filter(node => node.top).concat(tree.filter(node => !node.top)), sig };
}

export function normalizeCatalog(raw, fallback = fallbackCatalog(), source = 'engine') {
  if (!raw || typeof raw !== 'object') return fallback;
  const crewUpgrades = {};
  const signatures = {};
  for (const id of CREW_IDS) {
    const rows = Array.isArray(raw.crewUpgrades?.[id]) ? raw.crewUpgrades[id].map(cleanNode).filter(keep) : null;
    const extra = Array.isArray(raw.signatures?.[id]) ? raw.signatures[id].map(cleanNode).filter(keep) : [];
    if (!rows) {
      crewUpgrades[id] = fallback.crewUpgrades[id];
      signatures[id] = dedupe(extra.length ? extra : fallback.signatures[id]);
      continue;
    }
    const split = splitRows(dedupe(rows.concat(extra)));
    // A published crew array owns both columns. An empty signature list stays
    // empty so a bought signature cannot be refilled from the fallback, and
    // buying one never removes the others.
    crewUpgrades[id] = split.tree;
    signatures[id] = split.sig;
  }
  const stands = raw.standUpgrades || {};
  return {
    source,
    crewUpgrades,
    signatures,
    standUpgrades: {
      main: Array.isArray(stands.main) ? stands.main.map(cleanNode).filter(keep) : fallback.standUpgrades.main,
      stall: Array.isArray(stands.stall) ? stands.stall.map(cleanNode).filter(keep) : fallback.standUpgrades.stall,
    },
  };
}

let loading = null;
export function loadUpgradeFile() {
  if (!loading) {
    loading = fetch(new URL('../../data/upgrades.json', import.meta.url))
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return loading;
}

let bibleLoading = null;
export function loadBibleFile() {
  if (!bibleLoading) {
    bibleLoading = fetch(new URL('../../../docs/design/claude-upgrades.md', import.meta.url))
      .then(res => (res.ok ? res.text() : ''))
      .then(text => parseUpgradeMarkdown(text))
      .catch(() => null);
  }
  return bibleLoading;
}

export function createUpgradeBook() {
  let catalog = fallbackCatalog();
  const local = new Set();
  let pending = null;
  let ready = false;
  function refresh(onReady) {
    if (ready) return Promise.resolve(catalog);
    if (!pending) {
      pending = Promise.all([loadUpgradeFile(), loadBibleFile()]).then(([engine, parsed]) => {
        ready = true;
        if (engine) catalog = normalizeCatalog(engine, catalog, 'engine');
        else if (parsed) catalog = normalizeCatalog(parsed, catalog, 'bible');
        if (engine || parsed) onReady?.(catalog);
        return catalog;
      });
    } else if (onReady) pending.then(next => { if (next.source === 'engine') onReady(next); });
    return pending;
  }
  return {
    refresh,
    local,
    noteOwned(id) { if (id) local.add(id); },
    get catalog() { return catalog; },
  };
}

export function ownedIds(view, model, local = new Set()) {
  const ids = new Set(local);
  const bags = [
    view?.manager?.ownedUpgrades,
    view?.manager?.crewUpgradeIds,
    view?.manager?.standUpgradeIds,
    view?.upgrades?.owned,
    model?.raw?.ownedUpgrades,
    model?.raw?.upgrades?.owned,
  ];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const row of bag) ids.add(typeof row === 'string' ? row : row?.id);
  }
  for (const person of model?.crew || []) {
    for (const row of person.upgrades || person.crewUpgrades || []) ids.add(typeof row === 'string' ? row : row?.id);
  }
  return ids;
}

const PERCENT_KEYS = {
  checkoutSpeed: 'checkout', prepSpeed: 'prep', grillSpeed: 'grill', handoffSpeed: 'handoff',
  upsellRate: 'upsell', tipRate: 'tips', wasteRate: 'waste', holdDecay: 'hold decay',
  walkoutSave: 'walk-off saves', seatedPerceivedWait: 'seated wait', returnRate: 'return',
  linePatience: 'patience', crowdPull: 'crowd', hypeRate: 'hype', viralChance: 'viral chance',
  viralDuration: 'viral time', preorderShare: 'pre-orders', loanRate: 'loan rate',
  grantMultiplier: 'grants', skillMultiplier: 'skill prices', weatherShield: 'weather shield',
  restockSpeed: 'restock', spoilageRate: 'spoilage', stallCrowdPull: 'stall crowd',
  crossSell: 'cross-sell', truckCrowdPull: 'truck crowd', pipelineSpeed: 'pipeline',
  seatedUpsell: 'seated upsell', signaturePriceTolerance: 'price tolerance',
};
const COUNT_KEYS = {
  grillCapacity: 'grill slots', batchSize: 'batch', prepBuffer: 'prep buffer', trayCapacity: 'trays',
  tableService: 'table service', tacoCall: 'taco call', loanCap: 'loan cap', extraCheckpoint: 'checkpoint',
  stipend: 'stipend', storageCap: 'storage', stallCapacity: 'stall slots', stallStaffMax: 'stall staff',
  stallPrice: 'stall price', openHours: 'open hours', vibe: 'vibe', grillQuality: 'grill quality',
  prepQuality: 'prep quality', checkoutMood: 'checkout mood', investorScore: 'investor score',
  westApproval: 'West approval', duskVibe: 'dusk vibe',
};
const FLAG_KEYS = {
  vault: 'vault', coinFlip: 'coin flip', surgePricing: 'surge pricing', franchiseDeal: 'franchise',
  hackySack: 'hacky sack', grackleSquad: 'grackle squad', streamRaid: 'stream raid', cryptoRig: 'crypto rig',
  angelRound: 'angel round', designerPopUp: 'designer pop-up', hostileTakeover: 'hostile takeover',
  signatureTaco: 'Ali Special', mealPrep: 'meal prep', stallOpen: 'opens the stall',
};

export function effectText(effects = {}) {
  const bits = [];
  if (effects.speed) bits.push(`+${Math.round(effects.speed * 100)}% speed`);
  if (effects.demand) bits.push(`+${Math.round(effects.demand * 100)}% demand`);
  if (effects.tip) bits.push(`+${Math.round(effects.tip * 100)}% tips`);
  if (effects.morale) bits.push(`+${Math.round(effects.morale)} morale`);
  if (effects.patience) bits.push(`+${Math.round(effects.patience * 100)}% patience`);
  for (const [key, label] of Object.entries(PERCENT_KEYS)) {
    if (!Number.isFinite(effects[key]) || effects[key] === 0) continue;
    const pct = Math.round(effects[key] * 100);
    bits.push(`${pct > 0 ? '+' : ''}${pct}% ${label}`);
  }
  for (const [key, label] of Object.entries(COUNT_KEYS)) {
    if (!Number.isFinite(effects[key]) || effects[key] === 0) continue;
    const n = effects[key];
    bits.push(`${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(2)} ${label}`);
  }
  if (!bits.length) {
    for (const [key, label] of Object.entries(FLAG_KEYS)) if (effects[key]) { bits.push(label); break; }
  }
  return bits.slice(0, 3).join(', ');
}

export function eraLevel(view) {
  const era = view?.city?.era || view?.era;
  const level = Number(era?.level ?? era?.number ?? (typeof era === 'number' ? era : NaN));
  if (Number.isFinite(level) && level > 0 && level <= 8) return level;
  const id = String(era?.id || '').toLowerCase();
  if (id === 'cart') return 1;
  if (id === 'stand') return 2;
  if (id === 'row' || id === 'quad') return 3;
  if (id === 'campus') return 4;
  return 1;
}

export function starRating(view) {
  const direct = Number(view?.stars ?? view?.rating ?? view?.manager?.stars);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 5) return direct;
  const rep = Number(view?.manager?.reputation ?? view?.reputation);
  if (Number.isFinite(rep)) return rep / 20;
  return 0;
}

function collectIds(view, paths) {
  const set = new Set();
  for (const path of paths) {
    let value = view;
    for (const key of path.split('.')) value = value?.[key];
    if (Array.isArray(value)) {
      for (const row of value) {
        if (typeof row === 'string') set.add(row);
        else if (row?.id && row.unlocked !== false) set.add(row.id);
      }
    } else if (value && typeof value === 'object') {
      for (const [key, flag] of Object.entries(value)) if (flag) set.add(key);
    }
  }
  return set;
}

export function upgradeContext(view, owned = new Set()) {
  const stallSpecialty = view?.stall?.specialty || view?.stands?.stall?.specialty || view?.city?.stall?.specialty || '';
  const stallOpen = !!(view?.stall?.open || view?.stands?.stall?.open || view?.city?.stall?.open || [...owned].some(id => String(id).startsWith('stall_open')));
  return {
    era: eraLevel(view),
    stars: starRating(view),
    owned,
    milestones: collectIds(view, ['milestones', 'achievements', 'manager.milestones', 'manager.achievements']),
    flags: collectIds(view, ['flags', 'manager.flags', 'city.flags']),
    props: collectIds(view, ['props', 'manager.props', 'city.props']),
    layouts: collectIds(view, ['layout', 'city.layout', 'manager.layout']),
    stallOpen,
    stallSpecialty: String(stallSpecialty || ''),
  };
}

export function requirementMet(token, ctx) {
  const text = String(token || '');
  const era = /^era>=(\d+(?:\.\d+)?)$/.exec(text);
  if (era) return ctx.era >= Number(era[1]);
  const rep = /^rep>=(\d+(?:\.\d+)?)$/.exec(text);
  if (rep) return ctx.stars >= Number(rep[1]);
  if (text.startsWith('skill:')) return ctx.owned.has(text.slice(6));
  if (text.startsWith('milestone:')) return ctx.milestones.has(text.slice(10));
  if (text.startsWith('prop:')) return ctx.props.has(text.slice(5));
  if (text.startsWith('flag:')) return ctx.flags.has(text.slice(5));
  if (text === 'stall:none') return !ctx.stallOpen;
  if (text === 'stall:open') return !!ctx.stallOpen;
  if (text.startsWith('stallSpecialty:')) return ctx.stallSpecialty === text.slice(15);
  if (text.startsWith('layout:')) return ctx.layouts.has(text.slice(7));
  return ctx.owned.has(text);
}

export function unmetRequires(node, owned, view) {
  const ctx = upgradeContext(view, owned);
  return (node?.requires || []).filter(token => !requirementMet(token, ctx));
}

export function nodeState(node, owned, cash, view) {
  if (!node || node.pending) return 'locked';
  if (owned.has(node.id)) return 'owned';
  // Requirements gate the node. Owning another signature does not.
  if (unmetRequires(node, owned, view).length) return 'locked';
  if ((Number(node.cost) || 0) > (Number(cash) || 0)) return 'short';
  return 'ready';
}

export function affordCount(catalog, owned, cash, view) {
  let count = 0;
  const lists = [
    ...CREW_IDS.flatMap(id => [...(catalog.signatures[id] || []), ...(catalog.crewUpgrades[id] || [])]),
    ...(catalog.standUpgrades?.main || []),
    ...(catalog.standUpgrades?.stall || []),
  ];
  for (const node of lists) {
    if (node.pending) continue;
    if (nodeState(node, owned, cash, view) === 'ready') count += 1;
  }
  return count;
}

function meters(node) {
  if (!Number.isFinite(node.risk) || !Number.isFinite(node.reward)) return null;
  const wrap = el('div', 'risk-reward');
  for (const [key, label] of [['risk', 'Risk'], ['reward', 'Reward']]) {
    const row = el('label', 'rr-row');
    const bar = el('progress');
    bar.max = 100;
    bar.value = Math.round((Number(node[key]) || 0) * 100);
    bar.setAttribute('aria-label', `${node.name} ${label}`);
    row.append(el('span', '', label), bar);
    wrap.append(row);
  }
  return wrap;
}

const MAP_SPOTS = [
  { id: 'quad', name: 'Quad', x: 48, y: 56 },
  { id: 'alkek', name: 'Alkek', x: 22, y: 28 },
  { id: 'lbj', name: 'LBJ', x: 74, y: 22 },
  { id: 'busStop', name: 'Bus stop', x: 28, y: 76 },
  { id: 'stallions', name: 'Stallions', x: 76, y: 72 },
];

export function surgeSeries(view) {
  const published = view?.surge;
  if (Array.isArray(published?.history) && published.history.length) {
    return { preview: false, points: published.history.map(Number).filter(Number.isFinite), price: Number(published.price), cap: published.cap };
  }
  const day = Number(view?.day) || 1;
  const t = Number(view?.t) || 0;
  const points = [];
  for (let i = 0; i < 16; i += 1) {
    const at = t * (i / 15);
    points.push(Math.round((1 + 0.08 * Math.sin(day * 1.7 + at / 48)) * 100) / 100);
  }
  return { preview: true, points, price: points.at(-1), cap: null };
}

function spark(points, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 160 42');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const nums = points.filter(Number.isFinite);
  if (nums.length < 2) return svg;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = (hi - lo) || 1;
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('points', nums.map((n, i) => `${4 + i * 152 / (nums.length - 1)},${36 - ((n - lo) / span) * 30}`).join(' '));
  svg.append(line);
  return svg;
}

export function readCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function grackleLoss(view) {
  return readCount(view?.grackles?.snackLoss ?? view?.grackle?.snackLoss ?? view?.matt?.grackles?.snackLoss);
}

export function hackyLive(view) {
  const sack = view?.hackySack || view?.hacky || {};
  return { streak: readCount(sack.streak), bonus: readCount(sack.bonus ?? sack.crowdBonus) };
}

export function franchiseLive(view) {
  const row = view?.franchise || {};
  const sites = Array.isArray(row.sites) ? row.sites : [];
  return { sites, royalties: readCount(row.royalties), scandal: row.scandal || null };
}

function gougeCap(settings) {
  const raw = Number(settings?.surgeCap);
  if (!Number.isFinite(raw) || raw > 3 || raw < 0.5) return 1.2;
  return Math.min(1.35, Math.max(0.85, raw));
}

function renderSurge(card, view, settings, onCap) {
  const series = surgeSeries(view);
  const cap = gougeCap(settings);
  const slider = el('input', 'surge-cap');
  slider.type = 'range';
  slider.min = '0.85';
  slider.max = '1.35';
  slider.step = '0.05';
  slider.value = String(cap);
  slider.setAttribute('aria-label', 'Surge gouge cap');
  const readout = el('strong', 'surge-readout', `Gouge cap ${cap.toFixed(2)}×`);
  slider.addEventListener('input', () => {
    const next = Number(slider.value);
    readout.textContent = `Gouge cap ${next.toFixed(2)}×`;
    onCap?.(next);
  });
  card.append(slider, readout, spark(series.points, series.preview ? 'Preview surge chart' : 'Surge price'));
  const price = series.preview ? `Preview flex ${series.price.toFixed(2)}×` : `Live flex ${Number.isFinite(series.price) ? series.price.toFixed(2) : '—'}×`;
  card.append(el('p', 'sig-note', series.preview ? `${price}. The engine price replaces this chart. The cap stays on this screen until the engine applies it.` : price));
}

function renderFranchise(card, view, onCut) {
  const live = franchiseLive(view);
  const map = el('div', 'campus-map');
  map.setAttribute('aria-label', 'Campus franchise map');
  const flagged = new Set(live.sites.map(site => (typeof site === 'string' ? site : site.id)));
  for (const spot of MAP_SPOTS) {
    const flag = flagged.has(spot.id);
    const mark = el('span', `map-spot${flag ? ' has-flag' : ''}`, flag ? `${spot.name} · flag` : spot.name);
    mark.style.left = `${spot.x}%`;
    mark.style.top = `${spot.y}%`;
    map.append(mark);
  }
  card.append(map);
  card.append(el('p', 'sig-note', live.royalties == null ? 'Daily royalties — waiting on the engine.' : `Daily royalties ${money(live.royalties)}.`));
  if (!live.sites.length) {
    const cut = button('Cut loose · no flag yet', () => {}, 'cut-loose');
    cut.disabled = true;
    card.append(cut, el('small', 'sig-note', 'No franchise flags until the engine reports a site. A scandal card slides in from the side when one opens.'));
    return;
  }
  for (const site of live.sites) {
    const id = typeof site === 'string' ? site : site.id;
    const name = (typeof site === 'object' && site.name) || MAP_SPOTS.find(spot => spot.id === id)?.name || id;
    card.append(button(`Cut loose · ${name}`, () => onCut?.(id), 'cut-loose'));
  }
}

function renderGrackle(card, view) {
  const yard = el('div', 'grackle-yard');
  yard.setAttribute('aria-hidden', 'true');
  yard.append(el('span', 'grackle-lawn', ''), el('span', 'grackle-table', ''), el('span', 'grackle-table grackle-table-b', ''), el('span', 'grackle', ''), el('span', 'grackle', ''), el('span', 'grackle', ''));
  const loss = grackleLoss(view);
  const counter = el('strong', 'snack-loss', loss == null ? '—' : String(loss));
  counter.setAttribute('aria-label', 'Snack loss');
  card.append(yard, el('p', '', 'Snack loss'), counter);
  card.append(el('small', 'sig-note', loss == null ? 'Snack loss publishes with the engine. The birds on the card are the picture, not a count.' : 'Snacks the grackles kept.'));
}

function renderVaultSig(card, view, onVault) {
  const quote = view?.vault;
  const gold = Number(quote?.gold?.holdings);
  const silver = Number(quote?.silver?.holdings);
  card.append(el('p', 'sig-note', Number.isFinite(gold) || Number.isFinite(silver)
    ? `Holdings · gold ${Number.isFinite(gold) ? gold : 0} oz · silver ${Number.isFinite(silver) ? silver : 0} oz.`
    : 'Holdings stay at 0 until the engine reports them. Prices on the Vault tab are marked when they are a preview.'));
  card.append(button('Open Vault', () => onVault?.(), 'node-buy'));
}

function renderCoinSig(card) {
  card.append(el('p', 'sig-note', 'When a challenge fires, the card slides in from the side. Accept, pass, or let the standing policy answer. The day keeps running.'));
}

function renderAiAli(card, view, model) {
  const published = view?.aiAli || view?.ali?.ai || null;
  const person = model?.crew?.find(row => row.id === 'ali');
  if (published && (published.status || published.text || published.thought)) {
    card.append(el('p', 'ai-ali-live', published.status || published.text || published.thought));
  } else {
    card.append(el('p', 'ai-ali-live', person?.task ? `Grill read · ${person.task}` : 'AI Ali’s readout publishes with the engine.'));
    card.append(el('small', 'sig-note', 'The grill line is Ali’s station, not a guess at what the model decided.'));
  }
}

function renderHacky(card, view) {
  const live = hackyLive(view);
  const circle = el('div', 'sack-circle');
  circle.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 6; i += 1) circle.append(el('span', 'sack-dot', ''));
  const streak = el('strong', 'sack-streak', live.streak == null ? '—' : String(live.streak));
  const bonus = el('strong', 'sack-bonus', live.bonus == null ? '—' : `+${Math.round(live.bonus * (live.bonus <= 1 ? 100 : 1))}${live.bonus <= 1 ? '%' : ''}`);
  streak.setAttribute('aria-label', 'Hacky sack streak');
  bonus.setAttribute('aria-label', 'Crowd bonus');
  card.append(circle, el('p', '', 'Streak'), streak, el('p', '', 'Crowd bonus'), bonus);
  card.append(el('small', 'sig-note', live.streak == null && live.bonus == null ? 'Streak and crowd bonus show here when the engine sends them.' : 'Live from the circle.'));
}

function signatureCard(node, crewId, view, settings, hooks, owned, cash) {
  const card = el('article', `signature-card${node.pending ? ' is-pending' : ''}`);
  card.dataset.signature = node.id;
  card.append(portrait(crewId, 72), el('h3', '', node.name));
  if (node.blurb) card.append(el('p', 'sig-blurb', node.blurb));
  const bars = !node.pending && meters(node);
  if (bars) card.append(bars);
  if (node.widget === 'surge') renderSurge(card, view, settings, hooks.onCap);
  if (node.widget === 'franchise') renderFranchise(card, view, hooks.onCut);
  if (node.widget === 'grackle') renderGrackle(card, view);
  if (node.widget === 'hacky') renderHacky(card, view);
  if (node.widget === 'vault') renderVaultSig(card, view, hooks.onVault);
  if (node.widget === 'coin') renderCoinSig(card);
  if (node.widget === 'ai') renderAiAli(card, view, hooks.model);
  const state = nodeState(node, owned, cash, view);
  if (node.pending) card.append(el('small', 'sig-note', 'Waiting on upgrades.json for this signature.'));
  else {
    const effect = effectText(node.effects);
    const needs = unmetRequires(node, owned, view);
    card.append(el('p', '', `${money(node.cost)}${effect ? ` · ${effect}` : ''} · ${state}`));
    if (needs.length) card.append(el('small', '', `Requires ${needs.join(', ')}`));
    const buy = button(state === 'owned' ? 'Owned' : state === 'short' ? 'Short' : state === 'locked' ? 'Locked' : `Buy · ${money(node.cost)}`, () => hooks.onBuy?.(crewId, node.id), 'node-buy');
    buy.disabled = state !== 'ready';
    card.append(buy);
    card.append(el('small', 'sig-note', node.event
      ? 'Also arrives as a slide-in offer. Buying one signature does not lock the others.'
      : 'Buying one signature does not lock the others.'));
  }
  if (!node.pending && hooks.catalogSource === 'preview') card.append(el('small', 'sig-note', 'Preview card until upgrades.json publishes this signature.'));
  return card;
}

function treeNode(node, owned, cash, onBuy, prefix, view) {
  const state = nodeState(node, owned, cash, view);
  const row = el('div', `skill-node${node.tier === 4 && !node.top ? ' is-capstone' : ''}${node.top ? ' is-top' : ''} is-${state}`);
  row.dataset.node = node.id;
  const effect = effectText(node.effects);
  row.append(el('strong', '', `${node.name} · tier ${node.tier}`), el('p', '', `${money(node.cost)}${effect ? ` · ${effect}` : ''}`));
  const needs = unmetRequires(node, owned, view);
  row.append(el('small', '', needs.length ? `Requires ${needs.join(', ')} · ${state}` : state));
  const buy = button(state === 'owned' ? 'Owned' : state === 'ready' ? 'Buy' : state === 'short' ? 'Short' : 'Locked', () => onBuy?.(prefix, node.id), 'node-buy');
  buy.disabled = state !== 'ready';
  row.append(buy);
  return row;
}

export function renderCrew(options) {
  const { catalog, view, model, owned, focus, settings, onBuy, onCap, onCut, onInspect } = options;
  const cash = Number(view?.cash) || 0;
  const grid = el('div', 'manager-grid crew-trees');
  if (catalog.source === 'bible') grid.append(el('p', 'strategy-copy', 'Design catalog. Every signature can be bought once its requirements are met. The purchase lands when the engine accepts it.'));
  else if (catalog.source === 'preview') grid.append(el('p', 'strategy-copy', 'Tier names are a preview. They swap out when upgrades.json arrives.'));
  for (const id of CREW_IDS) {
    const person = model?.crew?.find(row => row.id === id);
    const card = el('section', 'manager-card crew-tree');
    card.id = `crew-tree-${id}`;
    card.dataset.crew = id;
    const head = el('div', 'manager-person');
    head.append(portrait(id, 64), el('h3', '', person?.name || NAMES[id]));
    const ready = [...(catalog.signatures[id] || []), ...(catalog.crewUpgrades[id] || [])].filter(node => !node.pending && nodeState(node, owned, cash, view) === 'ready').length;
    const badge = el('span', 'upgrade-badge', ready ? String(ready) : '');
    badge.hidden = !ready;
    if (ready) badge.setAttribute('aria-label', `${ready} affordable`);
    head.append(badge);
    card.append(head);
    if (onInspect) card.append(button('Inspect', () => onInspect(id), 'node-buy'));
    const hooks = { onBuy, onCap, onCut, onVault: options.onVault, model, catalogSource: catalog.source };
    for (const node of catalog.signatures[id] || []) card.append(signatureCard(node, id, view, settings, hooks, owned, cash));
    for (const node of catalog.crewUpgrades[id] || []) {
      const row = treeNode(node, owned, cash, onBuy, id, view);
      if (node.widget === 'ai' || node.id === 'ali_ai_ali') renderAiAli(row, view, model);
      card.append(row);
    }
    if (focus === id) card.dataset.focus = 'true';
    grid.append(card);
  }
  return grid;
}

export function renderStands(options) {
  const { catalog, owned, cash, onBuy, view } = options;
  const grid = el('div', 'manager-grid stand-paths');
  for (const [id, label] of [['main', 'Main stand'], ['stall', 'Second stall']]) {
    const card = el('section', 'manager-card');
    card.dataset.stand = id;
    card.append(el('h3', '', label));
    if (catalog.source === 'bible') card.append(el('small', 'sig-note', 'Design catalog. The purchase lands when the engine accepts it.'));
    else if (catalog.source === 'preview') card.append(el('small', 'sig-note', 'Preview path until upgrades.json publishes stand upgrades.'));
    for (const node of catalog.standUpgrades[id] || []) card.append(treeNode(node, owned, cash, onBuy, id, view));
    grid.append(card);
  }
  return grid;
}
