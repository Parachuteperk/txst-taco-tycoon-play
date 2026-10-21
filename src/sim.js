// Simulation: concurrent stations, ticket rail, queue switchback, pickup cluster, money flow, crew behaviours,
// Mrs. West, ambient crowd, grackles. Positions are tiles relative to the stand origin; props/particles are world sp.
import { rng } from './util.js';
import { CREW, randomCustomer } from './chars.js';
import { ST } from './stand.js';
import { NAV, STATUE_AT, SPOT2 } from './world.js';
import { BIG_LINE_PATH, BIG_LINE_SPACING, pointOnLine, lineBounds } from './queue.js';

const SPEED = { walk: 2.3, power: 3.0, run: 3.6, amble: 1.7 };
const PRICE = 2;
const KEEP_OUT = { i0: 0, i1: 6, j0: 2.0, j1: 4.5 };

export function createSim(world, seed = 1, options = {}) {
  const forcedLine = Number.isFinite(options.line) ? Math.max(0, Math.min(55, Math.floor(options.line))) : 0;
  const queuePath = forcedLine ? BIG_LINE_PATH : NAV.queue;
  const queueSpacing = forcedLine ? BIG_LINE_SPACING : 1.35;
  const R = rng(seed);
  const wx = world.wx;
  const P = (i, j, z = 0) => wx(i, j, z);
  const S = {
    t: 0, cash: 150, cashShown: 150, rush: 0.85, sales: 0, combo: 0, comboFlash: 0,
    actors: [], props: [], parts: [], texts: [], tickets: [], grackles: [], litter: [],
    tortillas: 24, jar: 0, drawer: 0, coal: 0, grillStall: 0, restocking: false,
    suspicion: 2,
    queue: [], orders: [], readyShelf: [], prepQ: [], grillQ: [], violations: 0,
  };
  let uid = 0;

  // ---------------------------------------------------------------------------------------------
  // Actors
  const actor = (def, i, j, kind, extra = {}) => {
    const a = { id: ++uid, def, i, j, kind, view: 'front', mirror: false, path: [], speed: SPEED.walk, anim: 'idle', arms: 'down',
      expr: 'neutral', hold: '', phase: R(), blinkAt: 2 + R() * 3, blink: 0, wait: 0, ...extra };
    S.actors.push(a);
    return a;
  };
  const crew = {};
  const st = ST.stations;
  crew.jared = actor(CREW.jared, st.register, ST.staffJ, 'crew', { home: [st.register, ST.staffJ] });
  crew.phillip = actor(CREW.phillip, st.prep, ST.staffJ, 'crew', { home: [st.prep, ST.staffJ] });
  crew.ali = actor(CREW.ali, st.grill, ST.staffJ, 'crew', { home: [st.grill, ST.staffJ] });
  crew.matt = actor(CREW.matt, st.pickup, ST.staffJ, 'crew', { home: [st.pickup, ST.staffJ] });
  crew.aaron = actor(CREW.aaron, 7.0, -2.4, 'crew', { home: [7.0, -2.4], mirror: false });
  crew.antonio = actor(CREW.antonio, -2.85, -1.65, 'crew', { seated: true });
  crew.west = null;
  crew.dale = null;
  const station = { register: { busy: 0 }, prep: { busy: 0 }, grill: { busy: 0 }, pickup: { busy: 0 } };

  const setPath = (a, pts, speed = SPEED.walk) => { a.path = pts.map((p) => [...p]); a.speed = speed; };
  const face = (a, di, dj) => {
    const dx = di - dj, dy = di + dj;
    if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
    a.view = dy > 0 ? 'front' : 'back';
    a.mirror = dx > 0;
  };
  const dist = (a, p) => Math.hypot(a.i - p[0], a.j - p[1]);

  // ---------------------------------------------------------------------------------------------
  // Props, particles, floating text (juice budget: <=6 particles per sale, <=40 on screen, <=2 texts)
  const tween = (o) => { S.props.push({ t: 0, ...o }); return o; };
  const particle = (o) => { if (S.parts.length < 40) S.parts.push({ t: 0, ...o }); };
  const text = (s, x, y, color = '#F4C66D') => { if (S.texts.length < 2) S.texts.push({ s, x, y, t: 0, color }); };
  const counterZ = ST.cTop;
  const SPOTS = {
    drawer: P(st.register, 1.15, counterZ + 3), stack: P(1.85, 1.35, counterZ), grill: P(st.grill, 1.22, counterZ + 2),
    shelf: (k) => P(4.95 + k * 0.22, 1.15, counterZ + 1), jar: P(5.95, 1.65, counterZ + 6), prepHand: P(st.prep, 1.0, counterZ + 2),
  };
  const railX = (i) => P(i + 0.42, ST.awnJ, ST.railZ - 2);

  // ---------------------------------------------------------------------------------------------
  // Customers
  const custDefs = Array.from({ length: 48 }, (_, k) => randomCustomer(k + 3));
  let custN = 0;
  const newCust = () => custDefs[custN++ % custDefs.length];
  const slotPos = (k) => pointOnLine(queuePath, k * queueSpacing);
  const seedLine = () => {
    while (S.queue.length < forcedLine) {
      const k = S.queue.length, [i, j, angle] = slotPos(k);
      const c = actor(newCust(), i, j, 'cust', { state: 'toQueue', patience: 0, slot: k, s: k * queueSpacing });
      face(c, Math.cos(angle), Math.sin(angle));
      S.queue.push(c);
    }
  };
  const spawnCustomer = () => {
    if (forcedLine || S.queue.length >= 11) return;
    const fromLeft = R() < 0.55;
    const start = fromLeft ? [-26, 5.4] : R() < 0.5 ? [30, 5.4] : [10.9, 26];
    const c = actor(newCust(), ...start, 'cust', { state: 'toQueue', patience: 0 });
    S.queue.push(c);
    routeToSlot(c, true);
  };
  const routeToSlot = (c, fresh) => {
    const k = S.queue.indexOf(c);
    const [i, j] = slotPos(k);
    if (fresh) {
      const pts = [];
      if (c.i > 10 && c.j > 6) pts.push([10.9, 5.35]);
      if (j < 4.5) pts.push([-1.5, 5.35], [-1.5, 4.6], [-0.1, 4.6], ...NAV.queue.slice(0, 4).filter((p) => p[1] > j).reverse());
      else pts.push([i + 0.5, 5.35]);
      pts.push([i, j]);
      setPath(c, pts);
    } else {
      // Shuffle forward along the polyline's corners so nobody cuts across the keep-out band.
      const pts = [], q = queuePath, newS = k * queueSpacing;
      let acc = 0;
      const verts = q.map((p, n) => { if (n) acc += Math.hypot(p[0] - q[n - 1][0], p[1] - q[n - 1][1]); return [p, acc]; });
      // Current arc position = projection of where the customer actually is.
      let cur = 0, best = 1e9;
      for (let n = 0; n < q.length - 1; n++) {
        const A = q[n], B = q[n + 1], L2 = (B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2;
        const u = Math.max(0, Math.min(1, ((c.i - A[0]) * (B[0] - A[0]) + (c.j - A[1]) * (B[1] - A[1])) / L2));
        const d = Math.hypot(A[0] + (B[0] - A[0]) * u - c.i, A[1] + (B[1] - A[1]) * u - c.j);
        if (d < best) { best = d; cur = verts[n][1] + u * Math.sqrt(L2); }
      }
      for (const [p, s] of verts.slice().reverse()) if (s > newS && s < cur) pts.push(p);
      pts.push([i, j]);
      setPath(c, pts);
    }
    c.slot = k; c.s = k * queueSpacing;
  };

  // Ambient students on walkways.
  const spawnAmbient = () => {
    const lane = NAV.lanes[(R() * NAV.lanes.length) | 0];
    const pts = lane.pts.map(([i, j]) => [i + (R() - 0.5) * 0.25, j + (R() - 0.5) * 0.18]);
    const a = actor(custDefs[(R() * custDefs.length) | 0], ...pts[0], 'amb');
    setPath(a, pts.slice(1), SPEED.walk * (0.8 + R() * 0.35));
    if (R() < 0.12 && lane === NAV.lanes[6]) a.rub = true;
  };
  // Static sitters: blankets, the statue's low wall, a laptop bench.
  const sit = (def, i, j, view = 'front', mirror = false, hold = '') => actor({ ...def, seated: true }, i, j, 'sitter', { view, mirror, hold });
  sit(custDefs[40], NAV.blankets[0][0] + 0.4, NAV.blankets[0][1] + 0.5, 'front', false, 'taco');
  sit(custDefs[41], NAV.blankets[0][0] + 1.2, NAV.blankets[0][1] + 0.6, 'front', true);
  const blanketGuy = sit(custDefs[42], NAV.blankets[1][0] + 0.6, NAV.blankets[1][1] + 0.6, 'front', true);
  sit(custDefs[43], 8.45, 8.4, 'front', false, 'taco');
  sit(custDefs[44], 8.85, 9.35, 'front', false, 'taco');
  sit(custDefs[45], 8.95, 10.4, 'front', false);
  sit(custDefs[46], 16.3, -5.95, 'front', false, 'phone');
  sit(custDefs[47], 9.9, 14.85, 'front', false, 'taco');
  sit(custDefs[39], 10.7, 14.85, 'front', true, 'taco');
  sit(custDefs[38], 12.9, 8.4, 'front', true);
  sit(custDefs[37], -10.1, -2.75, 'front', false, 'phone');
  sit(custDefs[35], 14.6, 15.5, 'front', false, 'taco');
  sit(custDefs[34], 15.4, 15.6, 'front', true, 'taco');
  sit(custDefs[33], 14.9, 16.2, 'back', false);
  sit(custDefs[32], 16.7, 18.75, 'front', false, 'phone');
  sit(custDefs[31], 17.5, 18.75, 'front', true);
  sit(custDefs[28], -5.8, -4.0, 'front', false, 'taco');
  sit(custDefs[27], -4.5, -4.0, 'front', true, 'taco');
  sit(custDefs[26], 3.2, -5.0, 'front', false, 'taco');
  sit(custDefs[25], 4.5, -5.2, 'front', true, 'phone');
  // A frisbee pair on the lawn (spec cluster), tossing on a loop.
  S.frisbee = { a: actor(custDefs[30], 17.6, 13.6, 'sitter', { view: 'front', mirror: false }), b: actor(custDefs[29], 13.2, 18.4, 'sitter', { view: 'back', mirror: true }), t: 0 };
  sit(custDefs[36], -9.3, -2.75, 'front', true, 'taco');
  // A hired freshman waiting at the reserved second-stand spot with a cooler of pre-made tacos.
  const freshman = actor({ ...randomCustomer(999), shirt: CREW.jared.shirt, hat: 'cap', hatColor: CREW.matt.apron }, SPOT2.i0 + 1.2, SPOT2.j0 + 2.4, 'crew2', { hold: 'crate' });

  // ---------------------------------------------------------------------------------------------
  // Orders + stations
  const newTicket = (order, online) => {
    const from = online ? P(-2.85, -0.95, 26) : P(st.register, 1.1, counterZ + 8);
    const tk = { order, x: from[0], y: from[1], tx: from[0], ty: from[1], online, a: 1, drop: 0 };
    S.tickets.push(tk);
    order.ticket = tk;
    moveTicket(order, 'prep');
  };
  const moveTicket = (order, where) => {
    const tk = order.ticket;
    if (!tk) return;
    const same = S.tickets.filter((t) => t !== tk && t.at === where).length;
    const p = railX(st[where]);
    tk.at = where; tk.tx = p[0] + Math.min(same, 4) * 2; tk.ty = p[1];
  };
  const startOrder = (cust, online = false) => {
    const o = { id: ++uid, cust, online, stage: 'prepQ' };
    S.orders.push(o);
    S.prepQ.push(o);
    newTicket(o, online);
    return o;
  };

  // ---------------------------------------------------------------------------------------------
  // Mrs. West
  const westEvent = () => {
    const w = actor(CREW.west, 10.9, 13, 'west', { state: 'arrive', power: true });
    setPath(w, [[10.9, 1.2], [8.6, -1.7], [4.55, -0.55]], SPEED.power);
    crew.west = w;
  };

  // Inspector Dale. He walks up, stands in the plaza in front of the window, then leaves.
  const DALE = { name: 'DALE', accent: '#C45A4A' };
  const daleEvent = () => {
    const d = actor(DALE, 14.5, 4.2, 'dale', { state: 'arrive' });
    setPath(d, [[11.2, 0.4], [8.2, -1.2]]);
    crew.dale = d;
  };

  // ---------------------------------------------------------------------------------------------
  // Grackles
  for (let k = 0; k < 7; k++) {
    const spots = [[-2.2, 2.6], [8.4, 3.2], [2.0, 6.4], [9.6, 1.6], [-5.5, 2.0], [5.2, 7.0], [10.6, 6.2]];
    const [i, j] = spots[k];
    S.grackles.push({ i, j, z: 0, male: k % 3 !== 2, mirror: R() < 0.5, state: 'walk', t: R() * 2, hop: 0, peck: 0 });
  }
  S.grackles.push({ i: 1.6, j: ST.back - 0.05, z: ST.boardH + 2, male: true, perch: true, mirror: false, state: 'perch', t: 0, hop: 0, peck: 0 });

  // ---------------------------------------------------------------------------------------------
  let nextCust = 0.5, nextAmb = 0, nextPing = 20, westAt = 41, daleAt = 0, aaronT = 4, aaronStep = 0, mattAway = 0, lastHeist = -20;
  // Antonio has been on the laptop since open. Each online ping adds one.
  // Dale only walks up once that meter is high.
  let suspicion = 2;
  S.bellIn = 52;

  function moveActor(a, dt) {
    if (!a.path.length) return false;
    const tgt = a.path[0];
    const dx = tgt[0] - a.i, dy = tgt[1] - a.j, d = Math.hypot(dx, dy);
    const step = a.speed * dt;
    if (d <= step) { a.i = tgt[0]; a.j = tgt[1]; a.path.shift(); }
    else { a.i += (dx / d) * step; a.j += (dy / d) * step; }
    face(a, dx, dy);
    if (a.kind !== 'crew' && a.kind !== 'west' && a.i > KEEP_OUT.i0 && a.i < KEEP_OUT.i1 && a.j > KEEP_OUT.j0 && a.j < KEEP_OUT.j1) { S.violations++; if ((S.vlog ||= []).length < 30) S.vlog.push([a.kind, a.state, +a.i.toFixed(2), +a.j.toFixed(2), JSON.stringify(a.path.slice(0, 3))]); }
    return true;
  }

  function step(dt) {
    S.t += dt;
    const t = S.t;

    // Arrivals.
    nextCust -= dt;
    if (nextCust <= 0) { spawnCustomer(); nextCust = 1.5 + R() * 1.2 - S.rush * 0.4; }
    nextAmb -= dt;
    const ambCount = S.actors.filter((a) => a.kind === 'amb').length;
    if (nextAmb <= 0 && ambCount < 10 + S.rush * 22) { spawnAmbient(); nextAmb = 0.35 + R() * 0.6; }

    // Register (Jared).
    const head = S.queue[0];
    if (station.register.busy > 0) {
      station.register.busy -= dt;
      crew.jared.anim = 'work';
      if (station.register.busy <= 0) {
        const c = station.register.cust;
        S.drawer = 2;
        S.cash += PRICE; S.sales++;
        startOrder(c);
        c.state = 'toPickup';
        S.queue.shift();
        S.queue.forEach((q) => routeToSlot(q, false));
        const spot = NAV.pickup[(S.sales + 2) % NAV.pickup.length];
        setPath(c, [[-1.7, 2.3], [-1.5, 5.3], [8.0, 5.3], [7.9, 2.4], spot]);
        c.order = S.orders[S.orders.length - 1];
      }
    } else if (head && !head.path.length && head.slot === 0 && S.actors.filter((a) => a.kind === 'cust' && (a.state === 'toPickup' || a.state === 'waitPickup')).length < NAV.pickup.length) {
      station.register.busy = 0.35 + R() * 0.2;
      station.register.cust = head;
      const from = P(head.i, head.j, 22), to = SPOTS.drawer;
      tween({ kind: 'cash', from, to, dur: 0.35, apex: 6, key: 'counter' });
      head.view = 'back'; head.mirror = true;
    } else crew.jared.anim = 'idle';

    // Prep (Phillip).
    if (station.prep.busy > 0) {
      station.prep.busy -= dt;
      const o = station.prep.order;
      const el = station.prep.dur - station.prep.busy;
      if (!station.prep.top && el > 0.25) {
        station.prep.top = true;
        ['#E0533F', '#5E8A4A', '#F4C66D'].forEach((c, n) => tween({ kind: 'bit', color: c, from: [SPOTS.prepHand[0] + 6 + n * 3, SPOTS.prepHand[1] - 4], to: [SPOTS.prepHand[0] - 2 + n, SPOTS.prepHand[1]], dur: 0.15 + n * 0.05, apex: 4, key: 'counter' }));
      }
      if (station.prep.busy <= 0) {
        S.grillQ.push(o);
        tween({ kind: 'taco', from: SPOTS.prepHand, to: SPOTS.grill, dur: 0.3, apex: 2, key: 'counter', order: o, park: 'grill' });
        moveTicket(o, 'grill');
      }
    } else if (S.prepQ.length && S.tortillas > 0 && !S.restocking) {
      const o = S.prepQ.shift();
      station.prep.busy = station.prep.dur = 0.6 + R() * 0.3;
      station.prep.order = o; station.prep.top = false;
      S.tortillas--;
      tween({ kind: 'tortilla', from: SPOTS.stack, to: SPOTS.prepHand, dur: 0.2, apex: 3, key: 'counter' });
    }
    crew.phillip.anim = station.prep.busy > 0 ? 'work' : S.tortillas <= 0 ? 'shrug' : 'idle';

    // Grill (Ali). Mrs. West stalls it.
    S.grillStall = Math.max(0, S.grillStall - dt);
    if (station.grill.busy > 0 && S.grillStall <= 0) {
      station.grill.busy -= dt;
      const el = station.grill.dur - station.grill.busy;
      const o = station.grill.order;
      if (Math.floor(el / 0.15) !== Math.floor((el - dt) / 0.15)) particle({ kind: 'steam', x: SPOTS.grill[0] + (R() - 0.5) * 12, y: SPOTS.grill[1] - 3, life: 0.6 + R() * 0.5, big: true });
      if (!station.grill.flipped && el > station.grill.dur * 0.45) {
        station.grill.flipped = true;
        S.coal = 0.25;
        crew.ali.flipT = 0.35;
        const tk = S.props.find((p) => p.order === o && p.parked);
        if (tk) { tk.flip = 0; tk.flipDur = 0.35; }
        crew.ali.flips = (crew.ali.flips || 0) + 1;
      }
      if (station.grill.busy <= 0) {
        const slot = S.readyShelf.length;
        S.readyShelf.push(o);
        const tp = S.props.find((p) => p.order === o && p.parked);
        if (tp) { tp.from = SPOTS.grill; tp.to = SPOTS.shelf(Math.min(slot, 3)); tp.t = 0; tp.dur = 0.25; tp.parked = false; tp.park = 'shelf'; tp.apex = 2; }
        moveTicket(o, 'pickup');
      }
    } else if (station.grill.busy <= 0 && S.grillQ.length && S.grillStall <= 0) {
      const o = S.grillQ.shift();
      station.grill.busy = station.grill.dur = 0.9 + R() * 0.5;
      station.grill.order = o; station.grill.flipped = false;
    }
    crew.ali.anim = S.grillStall > 0 ? 'blush' : S.aliShake > 0 ? 'shake' : station.grill.busy > 0 ? 'work' : 'idle';
    S.coal = Math.max(0, S.coal - dt);

    // Pickup / handoff (Matt) + restock + online delivery runs.
    const m = crew.matt;
    if (m.task === 'deliver' || m.task === 'restock') {
      if (!moveActor(m, dt)) {
        if (m.task === 'restock') {
          if (m.hold !== 'crate') { m.hold = 'crate'; setPath(m, [[2.0, -0.6]], SPEED.run * 0.8); }
          else if (!m.dropped) { m.dropped = true; m.hold = ''; S.tortillas = 24; S.restocking = false; setPath(m, [[st.pickup, -0.5], m.home], SPEED.run); }
          else { m.task = null; m.dropped = false; face(m, 0, 1); }
        } else {
          if (m.hold === 'taco') { m.hold = ''; blanketGuy.hold = 'taco'; blanketGuy.expr = 'happy'; setPath(m, [[-1.8, -2.1], [-1.0, -0.55], [st.pickup, -0.55], m.home], SPEED.run); }
          else { m.task = null; face(m, 0, 1); }
        }
      }
      m.anim = m.path.length ? 'run' : 'idle';
    } else if (station.pickup.busy > 0) {
      station.pickup.busy -= dt;
      m.anim = 'reach';
      if (station.pickup.busy <= 0) {
        const o = station.pickup.order;
        S.readyShelf.splice(S.readyShelf.indexOf(o), 1);
        const tp = S.props.find((p) => p.order === o);
        if (tp) S.props.splice(S.props.indexOf(tp), 1);
        if (o.ticket) { o.ticket.drop = 0.001; }
        S.readyShelf.forEach((r2, k) => { const p2 = S.props.find((p) => p.order === r2); if (p2) { p2.to = SPOTS.shelf(Math.min(k, 3)); p2.from = [p2.x ?? p2.to[0], p2.y ?? p2.to[1]]; p2.t = 0; p2.dur = 0.2; p2.parked = false; } });
        if (o.online) {
          m.task = 'deliver'; m.hold = 'taco';
          setPath(m, [[st.pickup, -0.55], [-1.0, -0.55], [-1.8, -2.1], [NAV.blankets[1][0] + 1.4, NAV.blankets[1][1] + 0.9]], SPEED.run);
        } else {
          const c = o.cust;
          const cp = P(c.i, c.j, 18);
          tween({ kind: 'taco', from: P(st.pickup + 0.9, 1.0, counterZ + 4), to: cp, dur: 0.15, apex: 3, key: 'top', done: () => { c.hold = 'taco'; } });
          c.state = 'happy'; c.happyT = 0.6; c.expr = 'happy';
          S.combo++;
          if (S.combo % 10 === 0) { S.comboFlash = 1.2; text('+COMBO', P(3, 0, 70)[0], P(3, 0, 70)[1], '#FFE076'); }
          if (R() < 0.4) {
            const tip = 1 + ((R() * 3) | 0);
            S.cash += tip;
            tween({ kind: tip >= 2 ? 'cash' : 'coin', from: cp, to: SPOTS.jar, dur: 0.35, apex: 8, key: 'top', done: () => { S.jar = Math.min(5, S.jar + 0.5); } });
            if (tip >= 2) text(`+$${tip}`, cp[0], cp[1] - 18);
          }
        }
        m.hold = o.online ? 'taco' : '';
      }
    } else if (S.tortillas < 3 && !S.restocking && !S.readyShelf.length) {
      S.restocking = true; m.task = 'restock';
      setPath(m, [[st.pickup, -0.5], [5.9, -0.45]], SPEED.run);
    } else if (S.readyShelf.length) {
      const o = S.readyShelf.find((r2) => r2.online || (r2.cust && r2.cust.state === 'waitPickup' && !r2.cust.path.length));
      if (o) { station.pickup.busy = 0.45 + R() * 0.25; station.pickup.order = o; }
      m.anim = 'idle';
    } else m.anim = 'idle';
    S.drawer = Math.max(0, S.drawer - dt * 6);

    // Antonio stays seated at the rig. Typing and leaning are the loop.
    // A sale is a fist pump. A sip comes around every ten seconds.
    nextPing -= dt;
    if ((crew.antonio._seenSales ?? S.sales) !== S.sales) {
      if (S.sales > (crew.antonio._seenSales ?? 0)) crew.antonio.pumpT = 0.85;
      crew.antonio._seenSales = S.sales;
    }
    crew.antonio.pumpT = Math.max(0, (crew.antonio.pumpT || 0) - dt);
    if ((crew.antonio.sipAt ?? 0) <= 0) crew.antonio.sipAt = 9 + R() * 4;
    crew.antonio.sipAt -= dt;
    if (crew.antonio.sipAt <= 0 && !(crew.antonio.pumpT > 0)) {
      crew.antonio.sipT = 0.95;
      crew.antonio.sipAt = 9 + R() * 5;
    }
    crew.antonio.sipT = Math.max(0, (crew.antonio.sipT || 0) - dt);
    const pumping = crew.antonio.pumpT > 0;
    const sipping = !pumping && crew.antonio.sipT > 0;
    const leaning = !pumping && !sipping && Math.floor(t / 1.6) % 3 === 2;
    crew.antonio.anim = pumping ? 'pump' : sipping ? 'sip' : leaning ? 'lean' : 'type';
    S.rig = {
      pose: crew.antonio.anim,
      glow: (Math.sin(t * 1.7) + 1) / 2,
      hue: (t * 0.15) % 1,
      flicker: Math.sin(t * 23) > 0.92,
      live: Math.floor(t * 1.6) % 2 === 0,
    };
    if (nextPing <= 0) {
      nextPing = 26 + R() * 10;
      crew.antonio.pingT = 0.8;
      suspicion = Math.min(5, suspicion + 1);
      S.suspicion = suspicion;
      startOrder(null, true);
    }
    crew.antonio.pingT = Math.max(0, (crew.antonio.pingT || 0) - dt);

    // Aaron supervises from a clear lane beside the workers; nearby customers can still receive water.
    const A = crew.aaron;
    if (!moveActor(A, dt)) {
      aaronT -= dt;
      A.anim = A.pointT > 0 ? 'point' : 'idle';
      A.pointT = Math.max(0, (A.pointT || 0) - dt);
      if (aaronT <= 0) {
        aaronStep = (aaronStep + 1) % 3;
        const legs = [[7.0, -2.4], [7.5, -2.0], [7.3, -2.2]];
        const target = legs[aaronStep];
        setPath(A, [target]);
        aaronT = 4 + R() * 3;
      }
      if (!A.path.length && A.pointT <= 0 && R() < dt * 0.4) {
        A.pointT = 1.2;
        const worst = S.queue.filter((q) => q.patience > 12).sort((a, b) => b.patience - a.patience)[0];
        if (worst && dist(A, [worst.i, worst.j]) < 3.5) { worst.patience = 0; worst.water = 2.5; A.hold = 'water'; setTimeout0(() => (A.hold = ''), 0.8); }
        face(A, -1, -0.2);
      }
    } else A.anim = 'walk';
    A.view = 'front'; A.mirror = false;

    // Inspector Dale shows up only while Antonio's suspicion meter is high.
    if (suspicion >= 3 && t >= daleAt && !crew.dale) daleEvent();
    const dale = crew.dale;
    if (dale) {
      if (dale.state === 'arrive' && !moveActor(dale, dt)) {
        dale.state = 'inspect';
        dale.inspectT = 40;
        dale.anim = 'idle';
        dale.view = 'front';
        dale.mirror = false;
      } else if (dale.state === 'inspect') {
        dale.inspectT -= dt;
        dale.anim = 'idle';
        if (dale.inspectT <= 0) {
          dale.state = 'leave';
          setPath(dale, [[11.2, 0.4], [14.5, 8], [18, 16]]);
        }
      } else if (dale.state === 'leave' && !moveActor(dale, dt)) {
        S.actors.splice(S.actors.indexOf(dale), 1);
        crew.dale = null;
        suspicion = 0;
        S.suspicion = 0;
        daleAt = t + 70 + R() * 40;
      }
      if (dale.state !== 'inspect') dale.anim = dale.path?.length ? 'walk' : 'idle';
      dale.view = 'front';
      dale.mirror = false;
    }

    // Mrs. West: once per day plus sometimes in a rush.
    if (t >= westAt && !crew.west) westEvent();
    const w = crew.west;
    if (w) {
      if (w.state === 'arrive' && !moveActor(w, dt)) { w.state = 'pinch'; w.pinchT = 1.6; face(w, -0.3, 1); S.grillStall = 2; crew.ali.expr = 'blush'; S.coal = 0.4; }
      else if (w.state === 'pinch') {
        w.pinchT -= dt; w.anim = 'pinch';
        if (w.pinchT <= 0) {
          w.state = 'leave';
          for (let k = 0; k < 6; k++) tween({ kind: 'coin', from: P(w.i, w.j, 20), to: SPOTS.jar, dur: 0.3 + k * 0.08, apex: 10 + k, key: 'top', done: () => { S.jar = Math.min(5, S.jar + 0.3); } });
          S.cash += 6; text('+$6', P(w.i, w.j, 44)[0], P(w.i, w.j, 44)[1], '#FF9EC0');
          setPath(w, [[8.6, -1.7], [10.9, 1.2], [10.9, 30]], SPEED.power);
          crew.ali.expr = 'neutral';
        }
      } else if (w.state === 'leave' && !moveActor(w, dt)) { S.actors.splice(S.actors.indexOf(w), 1); crew.west = null; westAt = t + 50 + R() * 30; }
      if (w.state !== 'pinch') w.anim = 'walk';
      // A three-quarter front view keeps her face visible as she approaches Ali.
      w.view = 'front'; w.mirror = false;
      w.noteT = (w.noteT || 0) - dt;
      if (w.noteT <= 0) { w.noteT = 0.55; const np = P(w.i, w.j, 58); particle({ kind: 'note', x: np[0] + 6 + R() * 6, y: np[1], life: 1.1 }); }
    }

    // Customers.
    for (const a of S.actors.slice()) {
      if (a.kind === 'amb') {
        if (!moveActor(a, dt)) {
          if (a.rub && !a.rubbed) { a.rubbed = true; a.anim = 'rub'; a.rubT = 2; face(a, STATUE_AT[0] - a.i, STATUE_AT[1] - a.j); continue; }
          if (a.rubT > 0) { a.rubT -= dt; if (a.rubT <= 0) setPath(a, [[3.5, 30]]); continue; }
          S.actors.splice(S.actors.indexOf(a), 1);
        } else a.anim = 'walk';
        continue;
      }
      if (a.kind !== 'cust') continue;
      if (a.state === 'toQueue') {
        if (!moveActor(a, dt)) {
          a.anim = 'idle';
          const k = S.queue.indexOf(a);
          if (k >= 0) { const sp = slotPos(k); face(a, Math.cos(sp[2]), Math.sin(sp[2])); }
          // Waiting customers glance around and chat with their neighbours, so faces show along the line.
          if (k >= 2 && Math.sin(t * 0.45 + a.phase * 9) > -0.1) { a.view = 'front'; a.mirror = Math.sin(t * 0.3 + a.phase * 5) > 0; }
          a.patience += dt * (0.6 + S.rush * 0.6);
          if (a.water > 0) { a.water -= dt; a.hold = 'water'; } else if (a.hold === 'water') a.hold = '';
          a.anim = a.patience > 20 ? 'crossed' : a.patience > 14 ? 'tap' : a.patience > 8 ? 'phone' : 'idle';
          if (!forcedLine && a.patience > 28 && S.queue[0] !== a) {
            a.state = 'leave'; S.combo = 0; a.anim = 'walk';
            S.queue.splice(k, 1); S.queue.forEach((q) => routeToSlot(q, false));
            setPath(a, [[a.i - 0.2, 5.4], [-30, 5.4]]);
            particle({ kind: 'puff', x: P(a.i, a.j, 34)[0], y: P(a.i, a.j, 34)[1], life: 0.6 });
          }
        } else a.anim = 'walk';
      } else if (a.state === 'toPickup') {
        if (!moveActor(a, dt)) { a.state = 'waitPickup'; a.anim = 'idle'; face(a, -1, -0.15); }
        else a.anim = 'walk';
      } else if (a.state === 'happy') {
        a.happyT -= dt; a.anim = 'idle';
        if (a.happyT <= 0) {
          a.state = 'eat'; a.eat = 4; a.expr = 'neutral';
          const east = R() < 0.5;
          setPath(a, [NAV.exitA[0], NAV.exitA[1], east ? [36, 5.5] : [-30, 5.5]], SPEED.amble);
        }
      } else if (a.state === 'eat' || a.state === 'leave') {
        if (a.state === 'eat') {
          a.eat -= dt;
          if (a.eat <= 0 && a.hold === 'taco') {
            a.hold = '';
            if (R() < 0.15) S.litter.push({ i: a.i + (R() - 0.5) * 0.4, j: a.j + 0.3 });
          }
        }
        if (!moveActor(a, dt)) S.actors.splice(S.actors.indexOf(a), 1);
        else a.anim = 'walk';
      }
    }

    if (forcedLine) seedLine();

    // Crew idles: blinks, desync, flip pose timer.
    for (const a of S.actors) {
      a.blinkAt -= dt;
      if (a.blinkAt <= 0) { a.blink = 0.12; a.blinkAt = 2.5 + R() * 2.5; }
      a.blink = Math.max(0, a.blink - dt);
    }
    crew.ali.flipT = Math.max(0, (crew.ali.flipT || 0) - dt);

    // Props / tweens.
    for (const p of S.props.slice()) {
      if (p.parked) continue;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const e = 1 - (1 - k) * (1 - k);
      p.x = p.from[0] + (p.to[0] - p.from[0]) * e;
      p.y = p.from[1] + (p.to[1] - p.from[1]) * e - Math.sin(k * Math.PI) * (p.apex || 0);
      if (k >= 1) {
        if (p.park) { p.parked = true; p.x = p.to[0]; p.y = p.to[1]; }
        else { S.props.splice(S.props.indexOf(p), 1); p.done && p.done(); }
      }
    }
    for (const p of S.props) if (p.flipDur) { p.flip += dt; if (p.flip >= p.flipDur) p.flipDur = 0; }
    // Tickets slide along the rail; torn tickets drop and fade.
    for (const tk of S.tickets.slice()) {
      tk.x += (tk.tx - tk.x) * Math.min(1, dt * 10);
      tk.y += (tk.ty - tk.y) * Math.min(1, dt * 10);
      if (tk.drop) { tk.drop += dt; tk.y += dt * 20; tk.a = 1 - tk.drop / 0.3; if (tk.drop > 0.3) S.tickets.splice(S.tickets.indexOf(tk), 1); }
    }
    // Particles + texts.
    for (const p of S.parts.slice()) { p.t += dt; if (p.t > p.life) S.parts.splice(S.parts.indexOf(p), 1); }
    for (const x of S.texts.slice()) { x.t += dt; if (x.t > 1.2) S.texts.splice(S.texts.indexOf(x), 1); }
    S.comboFlash = Math.max(0, S.comboFlash - dt);
    S.cashShown += (S.cash - S.cashShown) * Math.min(1, dt / 0.3);

    // Grackles: strut-hop, peck, flee when someone comes within a tile.
    for (const g of S.grackles) {
      g.t += dt;
      if (g.perch) continue;
      if (g.state === 'fly') {
        g.ft += dt;
        const k = Math.min(1, g.ft / 0.8);
        g.i = g.fi + (g.ti - g.fi) * k; g.j = g.fj + (g.tj - g.fj) * k; g.z = Math.sin(k * Math.PI) * 26;
        if (g.heist) g.z = 14 * k + Math.sin(k * Math.PI) * 18;
        if (k >= 1) {
          if (g.heist) {
            // Snatch: the taco is lost, the order is remade, Ali shakes his spatula.
            const o = g.heist;
            g.heist = null; g.loot = true;
            const k2 = S.readyShelf.indexOf(o);
            if (k2 >= 0) {
              S.readyShelf.splice(k2, 1);
              const tp = S.props.find((p) => p.order === o);
              if (tp) S.props.splice(S.props.indexOf(tp), 1);
              S.prepQ.unshift(o); moveTicket(o, 'prep');
              S.aliShake = 1.2; S.heists = (S.heists || 0) + 1;
            }
            Object.assign(g, { ft: 0, fi: g.i, fj: g.j, ti: 14 + R() * 4, tj: -6 - R() * 3, z0: 14, mirror: true });
            continue;
          }
          g.state = 'walk'; g.z = 0;
          if (g.loot) { g.loot = false; g.i = -2 + R() * 4; g.j = 6 + R(); }
        }
        continue;
      }
      const near = S.actors.some((a) => a.kind !== 'sitter' && Math.abs(a.i - g.i) + Math.abs(a.j - g.j) < 1.0);
      if (near) {
        g.state = 'fly'; g.ft = 0; g.fi = g.i; g.fj = g.j;
        const lit = S.litter[(R() * Math.max(1, S.litter.length)) | 0];
        const tgt = lit && R() < 0.6 ? [lit.i + 0.3, lit.j] : [[-2.4, 2.4], [8.6, 3.1], [1.6, 6.6], [-5.6, 1.7], [5.4, 7.2], [10.4, 6.6]][(R() * 6) | 0];
        g.ti = tgt[0] + (R() - 0.5) * 0.6; g.tj = tgt[1] + (R() - 0.5) * 0.4; g.mirror = g.ti > g.i;
        continue;
      }
      if (g.t > 0.7 + (g.i * 13 % 1) * 0.6) {
        g.t = 0;
        if (R() < 0.5) { g.peck = 0.3; } else { g.hop = 0.2; const d = (R() - 0.5) * 0.5; g.i += d; g.j += (R() - 0.5) * 0.25; g.mirror = d > 0; }
      }
      g.peck = Math.max(0, g.peck - dt); g.hop = Math.max(0, g.hop - dt);
    }
    // Grackle heist: at most one per 30 s, only while Matt has been away from the shelf for > 3 s.
    mattAway = m.task ? mattAway + dt : 0;
    const loot = S.readyShelf.find((o) => !o.online);
    if (mattAway > 3 && loot && t - lastHeist > 30) {
      const g = S.grackles.find((q) => !q.perch && q.state === 'walk');
      if (g) {
        lastHeist = t;
        Object.assign(g, { state: 'fly', ft: 0, fi: g.i, fj: g.j, ti: 5.1, tj: 1.15, heist: loot, mirror: 5.1 > g.i });
      }
    }
    S.aliShake = Math.max(0, (S.aliShake || 0) - dt);
    // Rush telegraph: Old Main's doors glow for 15 s before the bell; then a class pours out of the steps.
    S.bellIn -= dt;
    if (S.bellIn <= 0) {
      S.bellIn = 60;
      for (let k = 0; k < 7; k++) setTimeout0(() => {
        const a = actor(custDefs[(R() * custDefs.length) | 0], NAV.stairs[0] + (R() - 0.5) * 0.6, NAV.stairs[1] - 0.3, 'amb');
        setPath(a, [[10.9 + (R() - 0.5) * 0.6, 2], [10.9 + (R() - 0.5) * 0.6, 40]], SPEED.walk);
      }, k * 0.35);
    }
    // Frisbee arc between the pair.
    const fz = S.frisbee; fz.t += dt;
    const fk = (fz.t % 1.6) / 1.6, dir = Math.floor(fz.t / 1.6) % 2;
    const [fa, fb] = dir ? [fz.b, fz.a] : [fz.a, fz.b];
    fz.x = fa.i + (fb.i - fa.i) * fk; fz.y = fa.j + (fb.j - fa.j) * fk; fz.z = 26 + Math.sin(fk * Math.PI) * 30;
    fa.anim = fk < 0.15 ? 'throw' : 'idle'; fb.anim = fk > 0.8 ? 'catch' : 'idle';
    runTimers(dt);
  }

  const timers = [];
  function setTimeout0(fn, s) { timers.push({ fn, s }); }
  function runTimers(dt) { for (const tm of timers.slice()) { tm.s -= dt; if (tm.s <= 0) { timers.splice(timers.indexOf(tm), 1); tm.fn(); } } }

  if (forcedLine) { seedLine(); S.rush = 1; }
  return { S, step, crew, freshman, P, SPOTS, forcedLine,
    lineBounds: () => lineBounds(Math.max(S.queue.length, forcedLine), queuePath, queueSpacing, P, world.biz),
  };
}
