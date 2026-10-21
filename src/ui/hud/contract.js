// City HUD contract. The engine may publish view.city. Until that lands, the
// same shape is filled from the drawer, the crew, and the upgrade catalog.
// Stubbed fields are marked so the HUD never pretends the engine said them.

export const CITY_CATEGORIES = [
  { id: 'cook', label: 'Cook' },
  { id: 'comfort', label: 'Comfort' },
  { id: 'hype', label: 'Hype' },
  { id: 'crew', label: 'Crew' },
];

// Drawer milestones on the way to the $1,200 pitch. Replaced wholesale when
// view.city.era arrives.
const ERA_LADDER = [
  { id: 'cart', name: 'Cart', cash: 0, rep: 0 },
  { id: 'stand', name: 'Stand', cash: 250, rep: 25 },
  { id: 'row', name: 'Quad row', cash: 700, rep: 40 },
  { id: 'campus', name: 'Campus', cash: 1200, rep: 55 },
];

const STUB_ITEMS = [
  { id: 'grill', category: 'cook', name: 'Burner' },
  { id: 'register', category: 'cook', name: 'Second window' },
  { id: 'tipJar', category: 'comfort', name: 'Tip jar' },
  { id: 'neon', category: 'hype', name: 'Neon' },
  { id: 'secondCooler', category: 'crew', name: 'Cooler pad' },
];

const STUB_SLOTS = [
  { id: 'pad-grill', accepts: ['cook'], nx: 0.64, ny: 0.56 },
  { id: 'pad-window', accepts: ['cook'], nx: 0.36, ny: 0.64 },
  { id: 'pad-comfort', accepts: ['comfort'], nx: 0.5, ny: 0.74 },
  { id: 'pad-hype', accepts: ['hype'], nx: 0.72, ny: 0.4 },
  { id: 'pad-crew', accepts: ['crew'], nx: 0.28, ny: 0.72 },
];

function requirement(id, label, have, need) {
  const got = Number(have) || 0;
  const wanted = Number(need) || 0;
  return { id, label, have: got, need: wanted, met: got >= wanted };
}

function stubEra(view) {
  const cash = Number(view?.cash) || 0;
  const rep = Number(view?.manager?.reputation) || 0;
  const goal = Number(view?.season?.goal) || 1200;
  const ladder = ERA_LADDER.map((step, index) => index === ERA_LADDER.length - 1 ? { ...step, cash: Math.max(step.cash, goal) } : step);
  let index = 0;
  for (let i = 0; i < ladder.length; i += 1) {
    if (cash >= ladder[i].cash && rep >= ladder[i].rep) index = i;
  }
  const current = ladder[index];
  const next = ladder[index + 1] || null;
  const cashSpan = next ? Math.max(1, next.cash - current.cash) : 1;
  const repSpan = next ? Math.max(1, next.rep - current.rep) : 1;
  const progress = next
    ? Math.max(0, Math.min(1, Math.min((cash - current.cash) / cashSpan, (rep - current.rep) / repSpan)))
    : 1;
  return {
    id: current.id,
    name: current.name,
    index,
    count: ladder.length,
    progress,
    stub: true,
    next: next ? {
      id: next.id,
      name: next.name,
      requires: [
        requirement('cash', `$${next.cash} in the drawer`, cash, next.cash),
        requirement('rep', `Reputation ${next.rep}`, rep, next.rep),
      ],
    } : null,
  };
}

function publishedEra(era) {
  const requires = Array.isArray(era.next?.requires) ? era.next.requires.map(row => ({
    id: row.id || row.label,
    label: row.label || String(row.id || ''),
    have: Number(row.have) || 0,
    need: Number(row.need) || 0,
    met: row.met != null ? !!row.met : (Number(row.have) || 0) >= (Number(row.need) || 0),
  })) : [];
  return {
    id: era.id || 'era',
    name: era.name || 'Era',
    index: Number(era.index) || 0,
    count: Number(era.count) || 0,
    progress: Math.max(0, Math.min(1, Number(era.progress) || 0)),
    stub: false,
    next: era.next ? { id: era.next.id || '', name: era.next.name || 'Next', requires } : null,
  };
}

function stubItems(config) {
  const catalog = config?.manager?.upgrades || {};
  return STUB_ITEMS.map(item => {
    const row = catalog[item.id] || {};
    return {
      id: item.id,
      engineId: item.id,
      category: item.category,
      name: item.name,
      cost: Number(row.cost) || 0,
      level: 0,
      max: Number(row.max) || 1,
      speed: Number(row.speed) || 0,
      demand: Number(row.demand) || 0,
      tip: Number(row.tip) || 0,
    };
  });
}

function publishedItems(categories) {
  const items = [];
  for (const category of categories) {
    for (const item of category.items || []) {
      items.push({
        id: item.id,
        engineId: item.engineId || item.id,
        category: category.id,
        name: item.name || item.id,
        cost: Number(item.cost) || 0,
        level: Number(item.level) || 0,
        max: Number(item.max) || 1,
        speed: Number(item.speed) || 0,
        demand: Number(item.demand) || 0,
        tip: Number(item.tip) || 0,
        effect: item.effect || '',
        payback: item.payback || '',
      });
    }
  }
  return items;
}

function applyLevels(items, model) {
  const owned = new Map((model?.upgrades || []).map(row => [row.id, row]));
  return items.map(item => {
    const row = owned.get(item.engineId) || owned.get(item.id);
    if (!row) return item;
    return { ...item, level: Number(row.level) || 0, max: Number(row.max ?? item.max) || item.max, cost: Number(row.cost ?? item.cost) || item.cost };
  });
}

function stubSlots() {
  return STUB_SLOTS.map(slot => ({ ...slot, free: true, occupied: null, stub: true }));
}

function publishedSlots(slots) {
  return slots.map(slot => ({
    id: slot.id,
    accepts: slot.accepts || CITY_CATEGORIES.map(row => row.id),
    nx: Number.isFinite(slot.nx) ? slot.nx : 0.5,
    ny: Number.isFinite(slot.ny) ? slot.ny : 0.5,
    free: slot.free !== false && !slot.occupied,
    occupied: slot.occupied || null,
    stub: false,
  }));
}

export function cityModel(view, model = {}, config = {}) {
  const city = view?.city || {};
  const era = city.era ? publishedEra(city.era) : stubEra(view);
  const items = applyLevels(Array.isArray(city.build?.categories) ? publishedItems(city.build.categories) : stubItems(config), model);
  const slots = Array.isArray(city.build?.slots) ? publishedSlots(city.build.slots) : stubSlots();
  const categories = CITY_CATEGORIES.map(category => ({
    ...category,
    items: items.filter(item => item.category === category.id),
  }));
  const crew = model.crew || [];
  const morale = crew.filter(person => person.shift !== false && Number.isFinite(person.morale));
  const happiness = Number.isFinite(city.overlays?.happiness)
    ? city.overlays.happiness
    : morale.length ? morale.reduce((sum, person) => sum + person.morale, 0) / morale.length : Number(view?.manager?.reputation) || 0;
  return {
    era,
    categories,
    items,
    slots,
    overlays: {
      crowd: Number.isFinite(city.overlays?.crowd) ? city.overlays.crowd : (view?.live?.visualCrowd ?? view?.lineCount ?? 0),
      wait: Number.isFinite(city.overlays?.wait) ? city.overlays.wait : (view?.live?.avgWait ?? null),
      happiness,
      stub: !city.overlays,
    },
    customers: view?.line || [],
    crew,
    stub: {
      era: !!era.stub,
      slots: !Array.isArray(city.build?.slots),
      items: !Array.isArray(city.build?.categories),
    },
  };
}

export function inspectRecord(kind, source, read = value => value) {
  if (!source) return null;
  if (kind === 'customer') {
    const patience = Number(source.patience);
    const max = Number(source.patienceMax) || 0;
    const ratio = Number.isFinite(patience) && max > 0 ? patience / max : null;
    const fromEngine = !!(source.thought || source.thoughtKey);
    const thought = source.thought || (source.thoughtKey ? read(source.thoughtKey) : null) || (
      ratio == null ? 'No thought yet.'
        : ratio < 0.25 ? 'This line is longer than my class break.'
          : ratio < 0.55 ? 'I can smell the grill. I am still back here.'
            : 'Quad taco. I can wait a minute.'
    );
    const mood = source.mood || (ratio == null ? 'Unknown' : ratio < 0.25 ? 'Leaving' : ratio < 0.55 ? 'Impatient' : 'Willing to wait');
    return {
      kind: 'Customer',
      name: source.name || (source.nameKey ? read(source.nameKey) : 'Customer'),
      mood,
      thought,
      thoughtFromEngine: fromEngine,
      order: source.order || (source.tacos ? `${source.tacos} taco${source.tacos === 1 ? '' : 's'}` : 'No order yet'),
      stats: source.stats || `Patience ${ratio == null ? '—' : `${Math.round(ratio * 100)}%`}${fromEngine ? '' : ' · patience read until the engine sends thoughts'}`,
    };
  }
  if (kind === 'crew') {
    const fromEngine = !!(source.thought || source.thoughtKey);
    return {
      kind: 'Crew',
      name: source.name || source.id,
      mood: source.mood || (Number.isFinite(source.morale) ? `Morale ${Math.round(source.morale)}` : 'On shift'),
      thought: source.thought || (source.thoughtKey ? read(source.thoughtKey) : null) || source.task || 'On the plan.',
      thoughtFromEngine: fromEngine,
      order: source.order || '—',
      stats: source.stats || `Fatigue ${Number.isFinite(source.fatigue) ? Math.round(source.fatigue) : '—'} · ${source.station || source.role || 'unassigned'}`,
    };
  }
  return {
    kind: 'Prop',
    name: source.name || source.id || 'Pad',
    mood: source.mood || (source.level ? `Level ${source.level}` : 'Open pad'),
    thought: source.thought || source.effect || 'A pad on the stand.',
    thoughtFromEngine: !!(source.thought || source.effect),
    order: '—',
    stats: source.stats || source.payback || 'Waiting on a build.',
  };
}
