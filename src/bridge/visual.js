// Presentation only. Never calls sim.step(): its independent economy must stay off.
// Queue identities are read from engine.state because getView exposes only queue counts.
import { randomCustomer, CREW } from '../chars.js';
import { NAV, SPOT2 } from '../world.js';
import { ST } from '../stand.js';

const perksOf=(v,id)=>(v.crewStats||(Array.isArray(v.crew)?{}:v.crew)||{})[id]?.perks||[];
export function createVisualBridge(sim) {
  const { S, crew, P } = sim;
  const customers = new Map(), tickets = new Map();
  // The renderer caches poses by definition identity. Reuse a finite cast so
  // continuous ambient arrivals cannot grow its sprite cache forever.
  const customerDefs = Array.from({ length: 48 }, (_, n) => randomCustomer(n + 3));
  const daleDef = { ...randomCustomer(800), name: 'Inspector Dale', shirt: CREW.matt.apron, hat: 'cap', hatColor: CREW.jared.hatColor };
  let day = 0, uid = 10000, ambientAt = 0;
  const make = (def, i, j, kind) => {
    const a = { id: ++uid, def, i, j, kind, view: 'front', mirror: false, path: [], speed: 2.8, anim: 'idle', arms: 'down', expr: 'neutral', hold: '', phase: uid % 17 / 17, blink: 0 };
    a.enteredAt=S.t; S.actors.push(a); return a;
  };
  const move = (a, target, dt, speed = 4) => {
    const di = target[0] - a.i, dj = target[1] - a.j, d = Math.hypot(di, dj);
    a.anim = d > .06 ? 'walk' : 'idle';
    if (d > .06) { const f = Math.min(1, dt * speed / d); a.i += di * f; a.j += dj * f; a.view = di + dj > 0 ? 'front' : 'back'; a.mirror = di - dj > 0; }
    return d < .1;
  };
  function queueSlot(index) {
    let length = index * .75;
    for (let n = 1; n < NAV.queue.length; n++) {
      const a = NAV.queue[n - 1], b = NAV.queue[n], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length <= d) return [a[0] + (b[0] - a[0]) * length / d, a[1] + (b[1] - a[1]) * length / d];
      length -= d;
    }
    // Big Rush can exceed the short authored line. Continue along its final
    // segment instead of stacking every overflow customer at the same point.
    const tail = NAV.queue.at(-1), before = NAV.queue.at(-2);
    const di = tail[0] - before[0], dj = tail[1] - before[1], distance = Math.hypot(di, dj) || 1;
    return [tail[0] + di / distance * length, tail[1] + dj / distance * length];
  }
  function effect(kind, from, to, dur = .4) {
    S.props.push({ kind, from, to, x: from[0], y: from[1], dur, t: 0, key: 'counter' });
  }
  function update(game, v, events, dt) {
    // The painted renderer reads this snapshot. view.line is the register
    // queue; view.live.visualLine is the rest of the crowd. Do not spawn a
    // second set of bodies for those ids.
    sim.view = v;
    if (v.day !== day) {
      day = v.day; S.tagStarted = performance.now(); customers.clear(); tickets.clear();
      S.actors = S.actors.filter(a => !['cust', 'west', 'dale'].includes(a.kind));
      S.props = []; S.parts = []; S.texts = []; crew.west = null;
      ambientAt = 0;
    }
    S.t += dt; S.cash = v.cash; S.cashShown += (v.cash - S.cashShown) * Math.min(1, dt / .3);
    S.bigRush = v.bigRush || { active: false, id: null };
    S.crowdCount = v.live?.visualCrowd ?? v.live?.lineLength ?? v.queue ?? v.lineCount;
    S.rush = v.rush.active ? .85 : .15; S.sales = v.today.tacos; S.tortillas = v.inventory.tortillas;
    S.combo = v.combo.count; S.jar = Math.min(5, v.today.tips / 4);
    S.bellIn = v.rush.telegraph ? v.phaseDuration - v.phaseT : 50;
    S.drawer = Math.max(0, S.drawer - dt * 5); S.comboFlash = Math.max(0, S.comboFlash - dt);
    S.coal = v.stations.grill.active ? .3 : 0;
    // Route every customer outside the protected counter band, including station transitions.
    const present = new Set();
    function customer(c, target, stage) {
      present.add(c.id);
      let a = customers.get(c.id);
      if (!a) {
        const start = c.source === 'visual' ? [target[0]-.35-(c.id%3)*.12,target[1]+.55] : c.source === 'hack' ? [NAV.stairs[0], NAV.stairs[1]] : [-20, 5.4];
        a = make(customerDefs[c.id % customerDefs.length], ...start, 'cust'); customers.set(c.id, a);
        a.route = c.source === 'hack' ? [[10.9, 5.4], [-1.6, 5.4]] : [];
      }
      // Presentation ids can return as the authored crowd ebbs and grows.
      if (a.departing) { a.departing=false; a.route=[]; }
      if (a.stage !== stage) {
        if (stage !== 'line' && stage !== 'register') {
          if (a.i < 0) a.route = [[-1.6, 5.4], [8.1, 5.4], [8.1, 2.2]];
          else if (a.j >= 4.5) a.route = [[a.i, 5.4], [8.1, 5.4], [8.1, 2.2]];
        }
        a.stage = stage;
      }
      // Approach the short queue leg from the left; the engine can move a
      // customer into register before their visual walk has caught up.
      if (c.source !== 'visual' && ['line', 'register'].includes(stage) && target[1] < 4.5 && a.j >= 4.5 && a.i > -.9 && !a.route?.length) a.route = [[-1.6, 5.4], [-1.6, target[1]]];
      const goal = a.route?.length ? a.route[0] : target;
      if (move(a, goal, dt) && a.route?.length) a.route.shift();
      a.patience = Math.max(0, c.patienceMax - c.patience);
      if (a.anim === 'idle') a.anim = a.patience > 20 ? 'crossed' : a.patience > 14 ? 'tap' : a.patience > 8 ? 'phone' : 'idle';
      a.engineId = c.id;
      a.visualOnly = c.source === 'visual';
      a.state = 'engine'; a.hold = ''; a.expr = c.golden ? 'happy' : 'neutral';
      return a;
    }
    // Engine-authored presentation bodies supplement real waiting customers.
    // They never enter stations, tickets or any gameplay transaction.
    const drawnLine = [...v.line, ...(v.live?.visualLine || [])];
    // The customer paying Jared holds the window spot; the rope starts one slot back.
    const atWindow = Array.isArray(v.customers) && Array.isArray(v.items) && v.customers.some((c) => c.state === 'ordering') ? 1 : 0;
    drawnLine.forEach((c, n) => customer(c, queueSlot(n + atWindow), 'line'));
    // Per-taco engine: station queues hold taco items, so bodies come from view.customers
    // (ordering at the register, paid customers at their own pickup spot) and tickets from the items.
    const perTaco = Array.isArray(v.customers) && Array.isArray(v.items);
    const pickupAt = (k) => k < NAV.pickup.length ? NAV.pickup[k] : [8.3 + (k - NAV.pickup.length) * .72, 1.8 + (k - NAV.pickup.length) * .72];
    if (perTaco) {
      let k = 0;
      for (const c of v.customers) {
        if (c.state === 'ordering') customer(c, queueSlot(0), 'register');
        else if (c.state === 'waiting') customer(c, pickupAt(k++), 'waiting');
      }
    }
    const order = ['register', 'prep', 'grill', 'assemble', 'serve'].filter((name) => v.stations[name]);
    const activeTickets = new Set();
    let pickupN = 0;
    for (const [n, name] of order.entries()) {
      const slot = v.stations[name], member = crew[slot.crew] || crew.aaron;
      member.anim = slot.active ? name === 'serve' ? 'reach' : 'work' : 'idle';
      if (name === 'prep' && !v.inventory.tortillas) member.anim = 'shrug';
      if (name === 'grill') { member.flipT = slot.active && slot.active.progress > .5 && slot.active.progress < .72 ? .3 : 0; if (game.state.grillStall > 0) member.anim = 'blush'; }
      const all = [...game.state.stations[name].queue, ...(slot.active ? [slot.active] : [])];
      for (const c of all) {
        if (!perTaco) {
          // Every paid customer has a unique pickup spot; modulo slots hid the crowd.
          const pickupIndex = name === 'register' ? 0 : pickupN++;
          customer(c, name === 'register' ? queueSlot(0) : pickupAt(pickupIndex), name);
        }
        if (name === 'register') continue;
        activeTickets.add(c.id);
        const i = ST.stations[name === 'serve' ? 'pickup' : name === 'assemble' ? 'grill' : name];
        const p = P(i + .42, ST.awnJ, ST.railZ - 2);
        let ticket = tickets.get(c.id);
        if (!ticket) { ticket = { x: p[0], y: p[1], a: 1 }; tickets.set(c.id, ticket); }
        ticket.x += (p[0] - ticket.x) * Math.min(1, dt * 10); ticket.y += (p[1] - ticket.y) * Math.min(1, dt * 10);
      }
      if (slot.active && name !== 'register') {
        const from = name === 'prep' ? sim.SPOTS.stack : name === 'grill' ? sim.SPOTS.prepHand : name === 'assemble' ? sim.SPOTS.grill : sim.SPOTS.shelf(0);
        const to = name === 'prep' ? sim.SPOTS.prepHand : name === 'grill' ? sim.SPOTS.grill : sim.SPOTS.shelf(0);
        const f = Math.min(1, slot.active.progress * 4);
        const doubleFlip = name === 'grill' && perksOf(v,'ali').includes('doubleFlip');
        if (doubleFlip) S.props.push({ transient: true, kind: 'taco', x: to[0] + 6, y: to[1] - (member.flipT ? Math.sin(slot.active.progress * Math.PI) * 10 : 0), key: 'counter' });
        S.props.push({ transient: true, kind: name === 'prep' ? 'tortilla' : 'taco', x: from[0] + (to[0] - from[0]) * f, y: from[1] + (to[1] - from[1]) * f, key: 'counter', flipDur: name === 'grill' && member.flipT ? .35 : 0, flip: (slot.active.progress - .5) * 1.6 });
        if (name === 'grill' && S.parts.length < 12 && Math.floor(S.t * 8) !== Math.floor((S.t - dt) * 8)) S.parts.push({ kind: 'steam', x: to[0], y: to[1] - 3, t: 0, life: .7 });
      }
    }
    for (const [id, a] of customers) if (!present.has(id)) {
      if (!a.departing) { a.departing = true; a.route = [[8.1, 2.3], [8.1, 5.4], [30, 5.4]]; if (a.i < 0) a.route = [[-1.6, 5.4], [-30, 5.4]]; else if (a.j >= 4.5) a.route = [[a.i, 5.4], [30, 5.4]]; }
      if (move(a, a.route[0], dt, 2.5)) a.route.shift();
      if (!a.route.length) { S.actors.splice(S.actors.indexOf(a), 1); customers.delete(id); }
    }
    S.queueSpacing=.75;
    S.queue = drawnLine.map(c => customers.get(c.id));
    for (const id of tickets.keys()) if (!activeTickets.has(id)) tickets.delete(id);
    S.tickets = [...tickets.values()].slice(0, 8);
    crew.antonio.anim = v.hack.channel > 0 ? 'type' : 'idle'; crew.antonio.pingT = v.hack.channel > 0 ? .5 : 0;
    crew.aaron.anim = v.holding || v.call.choice ? 'point' : 'idle';
    if (perksOf(v,'ali').includes('showman') && v.stations.grill.active && Math.sin(S.t * 2) > .8) crew.ali.flipT = .3;
    if (perksOf(v,'matt').includes('trayBalance') && v.stations.serve.active) {
      const p = sim.SPOTS.shelf(1); S.props.push({ transient: true, kind: 'taco', x: p[0], y: p[1], key: 'counter' });
    }
    // Restock events send Matt toward the cooler, without changing engine stock.
    if (S.runnerUntil > S.t) move(crew.matt, [5.8, -.9], dt, perksOf(v,'matt').includes('sprint') ? 5 : 3);
    else if (Math.hypot(crew.matt.i - ST.stations.pickup, crew.matt.j - ST.staffJ) > .1) move(crew.matt, [ST.stations.pickup, ST.staffJ], dt, 4);

    // West is a visual regular near Ali even when no advice event is open.
    // Presence never changes the engine deck, cooldown, station or cash.
    if (!crew.west) crew.west = make(CREW.west, 4.55, -.55, 'west');
    crew.west.anim = v.west.choiceOpen ? 'pinch' : 'idle';
    let dale = S.actors.find(a => a.kind === 'dale');
    if (game.state.inspector.timer > 0 && !dale) { dale = make(daleDef, -2.2, 1.6, 'dale'); dale.hold = 'phone'; }
    if (dale && game.state.inspector.timer <= 0 && move(dale, [-20, 5.4], dt)) S.actors.splice(S.actors.indexOf(dale), 1);
    const f = sim.freshman, out = v.outpost;
    if (!out) { f.hidden = true; f.i = -100; f.j = -100; }
    else {
      if (f.hidden) { f.i = 7.8; f.j = -.9; }
      f.hidden = false; f.hold = 'crate';
      const away = [SPOT2.i0 + 1.2, SPOT2.j0 + 2.4], home = [7.8, -.9];
      const target = out.status === 'walkingBack' || out.status === 'restocking' ? home : away;
      move(f, target, dt, 2.5); if (out.status === 'selling') f.anim = 'reach';
    }
    S.watchEvents = events;
    for (const e of events) {
      if (e.type === 'sale') {
        S.drawer = 2; const a = customers.get(e.customerId); if (a) a.expr = 'happy';
        effect('coin', a ? P(a.i, a.j, 20) : sim.SPOTS.shelf(0), sim.SPOTS.drawer);
      }
      if (e.type === 'combo') S.comboFlash = 1;
      if (e.type === 'restock') S.runnerUntil = S.t + 2.5;
    }
    S.props = S.props.filter(p => { if (p.transient) { p.transient = false; p.dur = .001; p.t = 0; return true; } p.t += dt; if (p.t >= p.dur) return false; const k = p.t / p.dur; if (p.from) { p.x = p.from[0] + (p.to[0] - p.from[0]) * k; p.y = p.from[1] + (p.to[1] - p.from[1]) * k - Math.sin(k * Math.PI) * 6; } return true; });
    S.parts = S.parts.filter(p => (p.t += dt) < p.life);
    ambientAt -= dt;
    const ambientCap = v.rush.active ? 26 : 14;
    const ambientNow = () => S.actors.filter(a => a.kind === 'amb').length;
    // A calm 10:50 used to show nobody until walkers trickled in. Seed a few
    // immediately, then keep the slower arrival cadence.
    while (ambientAt <= 0 && ambientNow() < ambientCap) {
      const lane = NAV.lanes[uid % NAV.lanes.length].pts;
      const a = make(customerDefs[uid % customerDefs.length], ...lane[0], 'amb');
      const u = (uid % 7) / 7;
      a.i = lane[0][0] + (lane.at(-1)[0] - lane[0][0]) * u;
      a.j = lane[0][1] + (lane.at(-1)[1] - lane[0][1]) * u;
      a.path = lane.slice(1).map(p => [...p]);
      if (ambientNow() >= 4) { ambientAt = .6; break; }
    }
    for (const a of [...S.actors]) {
      a.blink = Math.sin(S.t * 2 + a.phase * 17) > .995 ? .1 : 0;
      if (a.kind === 'amb' && a.path.length && move(a, a.path[0], dt, 2.1)) { a.path.shift(); if (!a.path.length) S.actors.splice(S.actors.indexOf(a), 1); }
    }
    for (const g of S.grackles) { g.t += dt; g.peck = Math.sin(S.t * 3 + g.i) > .8 ? .2 : 0; }
    const frisbee = S.frisbee; if (frisbee) { const k = (S.t % 3) / 3; frisbee.x = frisbee.a.i + (frisbee.b.i - frisbee.a.i) * k; frisbee.y = frisbee.a.j + (frisbee.b.j - frisbee.a.j) * k; frisbee.z = 25 + Math.sin(k * Math.PI) * 25; }
  }
  return { update, reset() { day = 0; } };
}
