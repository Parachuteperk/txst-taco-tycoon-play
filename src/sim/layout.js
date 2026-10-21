// Tile spots for the isometric renderer. Coordinates are tiles, not pixels.
// Bodies start on their station tile. A restock haul is the only walk in this pass.
// Walk speed is 3.2 tiles/s. Work does not wait on distance.

export const TILES = {
  register: { x: 24, y: 18 },
  prep: { x: 25, y: 18 },
  warm: { x: 25, y: 18 },
  grill: { x: 26, y: 18 },
  assemble: { x: 28, y: 18 },
  serve: { x: 29, y: 18 },
  wrap: { x: 29, y: 18 },
  order: { x: 24, y: 19 },
  wait: { x: 24, y: 20 },
  line: { x: 23, y: 20 },
  crate: { x: 24, y: 16 },
  cooler: { x: 25, y: 16 },
  advisor: { x: 23, y: 17 },
  hacker: { x: 22, y: 17 },
  floor: { x: 28, y: 16 },
};

const CREW_HOME = {
  jared: TILES.register,
  phillip: TILES.prep,
  ali: TILES.grill,
  matt: TILES.serve,
  aaron: TILES.assemble,
  antonio: TILES.hacker,
  west: TILES.advisor,
};

const WALK = 3.2;

export function initBodies(state) {
  state.bodies = {};
  for (const [id, tile] of Object.entries(CREW_HOME)) {
    state.bodies[id] = { x: tile.x, y: tile.y, task: 'ready', targetItemId: null };
  }
  state.haul = null;
}

export function placeAll(state) {
  const line = state.line || [];
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (!c || c.state !== 'line') continue;
    c.queueIndex = i;
    c.pos = { x: TILES.line.x - i, y: TILES.line.y + i };
  }
  let wait = 0;
  for (const c of state.customers || []) {
    if (c.state === 'waiting') {
      c.queueIndex = wait;
      c.pos = { x: TILES.wait.x + wait, y: TILES.wait.y };
      wait += 1;
    } else if (c.state === 'ordering') {
      c.queueIndex = 0;
      c.pos = { x: TILES.order.x, y: TILES.order.y };
    } else if ((c.state === 'leaving' || c.state === 'served' || c.state === 'passing') && !c.pos) {
      c.pos = { x: TILES.line.x - 1, y: TILES.line.y + 3 };
    }
  }
  for (const item of state.items || []) {
    const key = item.station === 'warm' || item.station === 'ordered' ? 'prep'
      : item.station === 'wrap' || item.station === 'handoff' || item.station === 'done' ? 'serve'
        : item.station;
    const tile = TILES[key] || TILES.serve;
    item.pos = { x: tile.x, y: tile.y };
  }
}

export function stepHaul(state, dt) {
  const haul = state.haul;
  if (!haul || !state.bodies) return;
  const body = state.bodies[haul.crewId];
  if (!body) {
    state.haul = null;
    return;
  }
  const dest = haul.phase === 'back' ? TILES.prep : TILES.crate;
  const dx = dest.x - body.x;
  const dy = dest.y - body.y;
  const dist = Math.hypot(dx, dy);
  body.task = 'hauling';
  body.targetItemId = null;
  if (dist <= 0.15) {
    body.x = dest.x;
    body.y = dest.y;
    if (haul.phase === 'out') haul.phase = 'back';
    else {
      body.task = 'ready';
      state.haul = null;
    }
    return;
  }
  const step = Math.min(dist, WALK * dt);
  body.x += (dx / dist) * step;
  body.y += (dy / dist) * step;
}
