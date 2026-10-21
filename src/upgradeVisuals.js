// Presentation index for src/data/upgrades.json. Costs and purchase rules stay
// in the engine. Each row's visual field is the picture key. If the JSON is
// served later, applyCatalog() adds any visual names it carries.
//
// Visual fields found in the engine catalog:
// jared-quick, jared-upsell, jared-metals, jared-captain,
// phillip-fold, phillip-hand, tortilla-cannon, meal-prep,
// ali-heat, ali-burner, ali-signature, ai-ali,
// matt-sprint, matt-save, hacky-sack,
// aaron-host, aaron-crowd, franchise-deal,
// antonio-mic, antonio-preorder, twitch-raid, crypto-rig,
// west-rate, west-check, angel-round, hostile-takeover, designer-popup,
// crate, canopy, salsa-bar, picnic-table, speakers, neon-sign, extra-grill, food-truck,
// stall-drinks, stall-churros, stall-syrup, stall-second,
// synergy-window, synergy-line, synergy-hype, synergy-patron.

const INDEX = new Map();

function register(id, visual, who, stand = null) {
  if (!id) return;
  INDEX.set(String(id), { id: String(id), visual: visual || String(id), who: who || null, stand });
}

const CREW = [
  ['jared-quick', 'jared'], ['jared-upsell', 'jared'], ['jared-metals', 'jared'], ['jared-captain', 'jared'],
  ['phillip-fold', 'phillip'], ['phillip-hand', 'phillip'], ['tortilla-cannon', 'phillip'], ['meal-prep', 'phillip'],
  ['ali-heat', 'ali'], ['ali-burner', 'ali'], ['ali-signature', 'ali'], ['ai-ali', 'ali'],
  ['matt-sprint', 'matt'], ['matt-save', 'matt'], ['hacky-sack', 'matt'],
  ['aaron-host', 'aaron'], ['aaron-crowd', 'aaron'], ['franchise-deal', 'aaron'],
  ['antonio-mic', 'antonio'], ['antonio-preorder', 'antonio'], ['twitch-raid', 'antonio'], ['crypto-rig', 'antonio'],
  ['west-rate', 'west'], ['west-check', 'west'], ['angel-round', 'west'], ['hostile-takeover', 'west'], ['designer-popup', 'west'],
];
for (const [id, who] of CREW) register(id, id, who);

const MAIN = ['crate', 'canopy', 'salsa-bar', 'picnic-table', 'speakers', 'neon-sign', 'extra-grill', 'food-truck'];
for (const id of MAIN) register(id, id, null, 'main');
const STALL = ['stall-drinks', 'stall-churros', 'stall-syrup', 'stall-second'];
for (const id of STALL) register(id, id, null, 'stall');
for (const id of ['synergy-window', 'synergy-line', 'synergy-hype', 'synergy-patron']) register(id, id, null, 'synergy');

// Legacy manager ids and screenshot aliases. They do not invent new prices.
const ALIAS = {
  grill: ['extra-grill', 'ali'],
  burner: ['ali-burner', 'ali'],
  flatTop: ['extra-grill', 'ali'],
  flattop: ['extra-grill', 'ali'],
  neon: ['neon-sign', null],
  open: ['neon-sign', null],
  openSign: ['neon-sign', null],
  tip: ['tip', 'jared'],
  tipJar: ['tip', 'jared'],
  jar: ['tip', 'jared'],
  'tip-jar': ['tip', 'jared'],
  register: ['register', 'jared'],
  register2: ['register', 'jared'],
  secondRegister: ['register', 'jared'],
  cardReader: ['jared-quick', 'jared'],
  'card-reader': ['jared-quick', 'jared'],
  menu: ['menu', null],
  chalkboard: ['menu', null],
  speakers: ['speakers', null],
  speaker: ['speakers', null],
  table: ['picnic-table', null],
  picnic: ['picnic-table', null],
  salsa: ['salsa-bar', null],
  expansion: ['stall-drinks', null],
  cooler: ['stall-drinks', null],
  stand2: ['stall-drinks', null],
  megaphone: ['aaron-crowd', 'aaron'],
  tortillaPress: ['phillip-fold', 'phillip'],
  'tortilla-press': ['phillip-fold', 'phillip'],
  trayCart: ['matt-sprint', 'matt'],
  'tray-cart': ['matt-sprint', 'matt'],
  thirdMonitor: ['twitch-raid', 'antonio'],
  'third-monitor': ['twitch-raid', 'antonio'],
  ringLight: ['crypto-rig', 'antonio'],
  'ring-light': ['crypto-rig', 'antonio'],
  live: ['twitch-raid', 'antonio'],
  LIVE: ['twitch-raid', 'antonio'],
  sparkles: ['hostile-takeover', 'west'],
  'gold-sparkles': ['hostile-takeover', 'west'],
};
for (const [id, [visual, who]] of Object.entries(ALIAS)) {
  if (!INDEX.has(id)) register(id, visual, who, visual.startsWith('stall-') ? 'stall' : null);
}

let stallEra = 'truck';

export function stallUnlockEra() {
  return stallEra;
}

export function applyCatalog(data) {
  if (!data || typeof data !== 'object') return;
  const crew = data.crewUpgrades || {};
  for (const [who, list] of Object.entries(crew)) {
    for (const row of list || []) register(row.id, row.visual || row.id, who);
  }
  for (const stand of ['main', 'stall']) {
    for (const row of data.standUpgrades?.[stand] || []) {
      register(row.id, row.visual || row.id, null, stand);
      if (stand === 'stall' && row.requires?.era) stallEra = row.requires.era;
    }
  }
  for (const row of data.synergies || []) register(row.id, row.visual || row.id, null, 'synergy');
}

export async function loadUpgradeCatalog() {
  // src/data/upgrades.json is not in this repo. A fetch would 404 in the console.
  // applyCatalog() still accepts a payload when a later catalog is handed in.
  return false;
}

function addRow(rows, id, visual, who, stand) {
  const key = String(id || visual || '').trim();
  if (!key) return;
  const known = INDEX.get(key);
  const alias = ALIAS[key];
  const resolvedVisual = visual || known?.visual || (alias ? alias[0] : key);
  const resolvedWho = who || known?.who || (alias ? alias[1] : null);
  const resolvedStand = stand || known?.stand || (String(resolvedVisual).startsWith('stall-') ? 'stall' : null);
  const rid = known?.id || key;
  if (!rows.has(rid)) rows.set(rid, { id: rid, visual: resolvedVisual, who: resolvedWho, stand: resolvedStand });
}

function readList(rows, src, fallbackWho = null, stand = null) {
  if (src == null || src === false) return;
  if (typeof src === 'string') {
    src.split(',').forEach((part) => addRow(rows, part.trim(), null, fallbackWho, stand));
    return;
  }
  if (Array.isArray(src)) {
    for (const item of src) {
      if (item == null) continue;
      if (typeof item === 'string' || typeof item === 'number') addRow(rows, String(item), null, fallbackWho, stand);
      else if (typeof item === 'object') {
        if (item.owned === false || item.level === 0) continue;
        const owned = item.owned === true || (typeof item.level === 'number' && item.level > 0) || item.visual || item.tier || item.id;
        if (!owned || !item.id) continue;
        addRow(rows, item.id, item.visual, item.who || item.crew || fallbackWho, item.stand || stand);
      }
    }
    return;
  }
  if (typeof src === 'object') {
    for (const [key, value] of Object.entries(src)) {
      if (value == null || value === false || value === 0) continue;
      if (typeof value === 'number' || value === true) addRow(rows, key, null, fallbackWho, stand);
      else if (Array.isArray(value)) readList(rows, value, key, stand);
      else if (typeof value === 'object') {
        if (value.level === 0 || value.owned === false) continue;
        if (value.level > 0 || value.owned || value.visual || value.id) {
          addRow(rows, value.id || key, value.visual, value.who || value.crew || fallbackWho, value.stand || stand);
        }
      }
    }
  }
}

function legacyNames(row) {
  const names = new Set();
  const keys = [row.id, row.visual];
  for (const key of keys) {
    if (['grill', 'burner', 'ali-burner', 'extra-grill', 'flatTop', 'flattop', 'ali-heat'].includes(key)) names.add('grill');
    if (['neon', 'neon-sign', 'open', 'openSign'].includes(key)) names.add('open');
    if (['tip', 'tipJar', 'jar', 'tip-jar', 'jared-upsell', 'jared-captain', 'jared-metals'].includes(key)) names.add('tip');
    if (['register', 'register2', 'secondRegister', 'jared-quick', 'card-reader', 'cardReader'].includes(key)) names.add('register');
    if (['menu', 'chalkboard'].includes(key)) names.add('menu');
    if (['expansion', 'cooler', 'stand2', 'secondCooler', 'coolerKid', 'stall-drinks', 'stall-second', 'food-truck'].includes(key)) names.add('expansion');
    if (['speakers', 'speaker'].includes(key)) names.add('speaker');
    if (['picnic-table', 'picnic', 'table'].includes(key)) names.add('picnic');
    if (['salsa-bar', 'salsa'].includes(key)) names.add('salsa');
  }
  return names;
}

export function collectOwned(view, opts = {}, state = null) {
  const rows = new Map();
  readList(rows, opts?.upgrades);
  readList(rows, opts?.expansion ? 'expansion' : null);
  readList(rows, view?.upgrades);
  readList(rows, view?.manager?.upgrades);
  readList(rows, state?.upgrades);
  readList(rows, view?.manager?.skills);
  readList(rows, view?.skills);
  const trees = view?.manager?.trees || view?.trees;
  if (trees?.crew && typeof trees.crew === 'object') {
    for (const [who, list] of Object.entries(trees.crew)) readList(rows, list, who);
  }
  readList(rows, trees?.main, null, 'main');
  readList(rows, trees?.stall, null, 'stall');
  const stands = view?.manager?.stands;
  readList(rows, stands?.main?.upgrades, null, 'main');
  readList(rows, stands?.stall?.upgrades, null, 'stall');
  const crew = view?.crew;
  if (crew && typeof crew === 'object' && !Array.isArray(crew)) {
    for (const [who, member] of Object.entries(crew)) {
      if (!member || typeof member !== 'object') continue;
      readList(rows, member.upgrades, who);
      readList(rows, member.skills, who);
      readList(rows, member.owned, who);
    }
  }
  if (Array.isArray(view?.manager?.staff)) {
    for (const member of view.manager.staff) {
      readList(rows, member?.upgrades, member?.id);
      readList(rows, member?.skills, member?.id);
    }
  }
  const list = [...rows.values()];
  const legacy = new Set();
  for (const row of list) for (const name of legacyNames(row)) legacy.add(name);
  const stallOpen = !!(stands?.stall?.open || view?.stall?.open);
  const era = opts?.era || view?.standTier || stands?.main?.era || view?.world?.era || view?.manager?.era || '';
  if (stallOpen || list.some((row) => row.stand === 'stall' || String(row.visual).startsWith('stall-'))) legacy.add('expansion');
  if (view?.outpost) legacy.add('expansion');
  return {
    rows: list,
    ids: new Set(list.map((row) => row.id)),
    visuals: new Set(list.map((row) => row.visual)),
    legacy,
    stallOpen,
    era: String(era || ''),
  };
}

function has(owned, ...names) {
  return names.some((name) => owned.ids.has(name) || owned.visuals.has(name));
}

export function propFlags(owned) {
  return {
    cardReader: has(owned, 'jared-quick', 'jared-captain', 'card-reader', 'cardReader', 'register'),
    tip: has(owned, 'tip', 'tipJar', 'jar', 'tip-jar', 'jared-upsell', 'jared-metals', 'jared-captain'),
    plancha: has(owned, 'grill', 'burner', 'ali-burner', 'extra-grill', 'flatTop', 'flattop'),
    sizzle: has(owned, 'ali-heat', 'ali-burner', 'ali-signature', 'grill', 'burner', 'extra-grill'),
    bigSizzle: has(owned, 'ali-burner', 'extra-grill', 'grill', 'burner'),
    press: has(owned, 'phillip-fold', 'phillip-hand', 'tortilla-press', 'tortillaPress'),
    tray: has(owned, 'matt-sprint', 'matt-save', 'tray-cart', 'trayCart'),
    megaphone: has(owned, 'aaron-host', 'aaron-crowd', 'megaphone'),
    hype: has(owned, 'aaron-crowd', 'synergy-hype', 'aaron-host', 'megaphone'),
    monitor: has(owned, 'antonio-mic', 'twitch-raid', 'third-monitor', 'thirdMonitor'),
    ring: has(owned, 'crypto-rig', 'ring-light', 'ringLight'),
    live: has(owned, 'twitch-raid', 'antonio-preorder', 'live', 'LIVE'),
    sparkles: has(owned, 'hostile-takeover', 'sparkles', 'gold-sparkles'),
    neon: has(owned, 'neon', 'neon-sign', 'open', 'openSign'),
    salsa: has(owned, 'salsa', 'salsa-bar'),
    picnic: has(owned, 'picnic', 'picnic-table', 'table'),
    speaker: has(owned, 'speaker', 'speakers'),
    metals: has(owned, 'jared-metals'),
    cannon: has(owned, 'tortilla-cannon'),
    meal: has(owned, 'meal-prep'),
    clone: has(owned, 'ai-ali'),
    hacky: has(owned, 'hacky-sack'),
    franchise: has(owned, 'franchise-deal'),
    angel: has(owned, 'angel-round', 'west-check', 'west-rate', 'designer-popup'),
  };
}

export function stallShouldDraw(owned) {
  if (!owned) return false;
  if (owned.stallOpen) return true;
  if ([...owned.visuals].some((visual) => String(visual).startsWith('stall-'))) return true;
  if ([...owned.ids].some((id) => String(id).startsWith('stall-'))) return true;
  if (owned.legacy?.has('expansion')) return true;
  return owned.era === stallUnlockEra();
}

// First snapshot is the baseline. A later new id bursts once. Dropping an id
// lets a rebuy burst again. Already-owned ids do not burst every frame.
export function noteOwned(store, rows, now = 0) {
  const ids = rows.map((row) => row.id);
  store._upgradeBursts = store._upgradeBursts || [];
  if (!store._upgradeBaselined) {
    store._upgradeBaselined = true;
    store._upgradeSeen = new Set(ids);
    return [];
  }
  store._upgradeSeen = store._upgradeSeen || new Set();
  const fresh = [];
  for (const row of rows) {
    if (store._upgradeSeen.has(row.id)) continue;
    store._upgradeSeen.add(row.id);
    const burst = { id: row.id, who: row.who, visual: row.visual, stand: row.stand, t0: now };
    fresh.push(burst);
    store._upgradeBursts.push(burst);
  }
  const live = new Set(ids);
  for (const id of [...store._upgradeSeen]) if (!live.has(id)) store._upgradeSeen.delete(id);
  store._upgradeBursts = store._upgradeBursts.filter((burst) => now - burst.t0 < 0.85);
  return fresh;
}
