// Engine-owned travel. Presentation reads these positions; it never advances an order.
import { emit } from './events.js';
import { stagePoint, ORDER, SPAWNS, EXIT, queuePoint, pickupPoint } from './quadGround.js';
export const QUAD = { left: -480, right: 480, top: -310, bottom: 350 };
export const HOMES = {
  jared: stagePoint([-96, 28]), phillip: stagePoint([-175, 15]), ali: stagePoint([-185, -40]),
  aaron: stagePoint([40, 90]), matt: stagePoint([220, 60]), antonio: stagePoint([180, -48]), west: stagePoint([-250, -45]),
};
// Delivery routes stay outside the building footprint; each visit collects that job's item.
export const ROUTES = {
  serve: [[240,180],[75,180],[75,250],[75,180],[240,180],HOMES.matt],
};
export const STATION_IDS = { register: 'jared', prep: 'phillip', grill: 'ali', assemble: 'aaron', serve: 'matt' };
export function move(body, target, distance) {
  const dx = target[0] - body.x, dy = target[1] - body.y, d = Math.hypot(dx, dy);
  const k = d ? Math.min(1, distance / d) : 0;
  body.x += dx * k; body.y += dy * k;
  return d <= distance + .01;
}
export function initCustomerFlow(game, c) {
  if (!game.config.quadFlow) return;
  c.map = { x: SPAWNS[c.id%3][0], y: SPAWNS[c.id%3][1], journey: 'approach', holdingTaco: false };
}
export function stepQuadFlow(game, dt) {
  if (!game.config.quadFlow) return;
  const s = game.state;
  s.quadCrew ||= Object.fromEntries(Object.entries(HOMES).map(([id, p]) => [id, { x: p[0], y: p[1], task: 'ready', itemId: null }]));
  // Reserve the exchange slot until the receiver clears the next customer's path.
  const front=pickupPoint(0);
  let waiting=s.customers.filter(c=>c.map?.receiveUntil>s.t || (c.state==='leaving'&&c.map?.holdingTaco&&!c.map.exited&&Math.hypot(c.map.x-front[0],c.map.y-front[1])<55)).length;
  for (const c of s.customers) {
    if (!c.map) initCustomerFlow(game, c);
    const p = c.map;
    if (p.exited) continue;
    let target;
    if (c.state === 'line') {
      const i = Math.max(0, s.line.indexOf(c));
      target = queuePoint(i,s.line.length);
      if (move(p, target, dt * 115) && p.journey !== 'queue') {
        p.journey = 'queue'; emit(game, { type: 'customerQueued', customerId: c.id });
      }
    } else if (c.state === 'ordering') {
      move(p, ORDER, dt * 115); p.journey = 'pay';
    } else if (c.state === 'waiting') {
      const i = waiting++;
      target = pickupPoint(i);
      // Approach below the exchange, then turn up at the assigned waiting slot.
      // Walking straight along y=274 would brush through the receiver's body.
      if (!p.pickupRouted) {
        const waypoint=p.x<80&&p.y<310?[p.x,310]:[target[0],310];
        if(move(p,waypoint,dt*115)&&waypoint[0]===target[0])p.pickupRouted=true;
      }else if(move(p,target,dt*115)&&p.journey!=='pickup'){
        p.journey='pickup';emit(game,{type:'customerAtPickup',customerId:c.id});
      }
    } else if (c.state === 'leaving') {
      if (p.receiveUntil > s.t) { p.journey = 'receive'; continue; }
      if (p.journey !== 'leave') {
        p.holdingTaco = c.delivered >= (c.tacos || 1);
        p.journey = 'leave'; p.bubbleUntil = s.t + 2;
        emit(game, { type: 'customerDeparted', customerId: c.id, holdingTaco: p.holdingTaco });
      }
      if (move(p, EXIT, dt * 100)) p.exited = true;
    }
  }
  for (const [station, id] of Object.entries(STATION_IDS)) {
    const b = s.quadCrew[id], job = s.stations[station].active, home = HOMES[id];
    if (!job) { move(b, home, dt * 35); b.task = 'ready'; b.itemId = null; continue; }
    if (b.itemId !== job.id) {
      b.itemId = job.id; b.leg = 0; b.task = station === 'serve' ? 'collect' : 'work';
    }
    if (station !== 'serve') b.task = move(b, home, dt * 110) ? 'work' : 'return';
    if (b.task === 'collect' || b.task === 'carry') {
      const route = ROUTES[station];
      if (move(b, route[b.leg], dt * 240)) b.leg++;
      b.task = b.leg >= route.length ? 'work' : b.leg >= route.length / 2 ? 'carry' : 'collect';
    }
  }
  // Stock hauling uses the existing engine's restock task rather than an idle loop.
  if (s.haul && !s.stations.prep.active) { const b = s.quadCrew.phillip; b.task = 'restock'; move(b, s.haul.phase === 'out' ? stagePoint([-170, -30]) : HOMES.phillip, dt * 110); }
}
export function quadWorkReady(game, station, work) {
  if (!game.config.quadFlow) return true;
  if (station === 'register') return work.map?.journey === 'pay' && Math.hypot(work.map.x - ORDER[0], work.map.y - ORDER[1]) < 2;
  if (station === 'serve') {
    const c = game.state.customers.find(c => c.id === work.customerId);
    const front=pickupPoint(0);
    if (c?.map?.journey !== 'pickup'||Math.hypot(c.map.x-front[0],c.map.y-front[1])>2) return false;
  }
  return game.state.quadCrew?.[STATION_IDS[station]]?.task === 'work';
}
