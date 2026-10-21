import { CREW_PX, SCALE, propScreenHeight, PROP_TILES } from '../art/composite.js';

// Signature upgrades on the iso watch scene. Presentation only.
// Ids and visual fields are the ones in src/data/upgrades.json (gameplay tree).
// That file is not in this branch yet. Nothing here buys, prices, or spends.
//
// Mapped from the catalog that agent wrote:
//   tortilla-cannon / visual tortilla-cannon  -> cannon arcs, misfire bonk
//   meal-prep       / visual meal-prep        -> overnight batch by the cooler
//   twitch-raid     / visual twitch-raid      -> purple burst, students join the rope
//   crypto-rig      / visual crypto-rig       -> fan box, overheat flicker
//   angel-round     / visual angel-round      -> unbranded cash briefcase
//   hostile-takeover / visual hostile-takeover -> rival truck towed, second stall
//   designer-popup  / visual designer-popup   -> velvet rope, gold menu, sunglasses
//   surge-board     / aaron_surge_board       -> lit price board, number follows view.surge.mult
//   grackle-squad   / matt_grackle_squad      -> two trained grackles fly tacos out to the lawn
// Aaron's later word: keep all four of Aaron's and Matt's (surge, franchise, grackles, hacky).
// Not drawn: moped, taco toss, DJ booth, pitch spotlight.

import { CREW, STAND, RIG, LINE, SIT, UPGRADES, WINDOW, inClear } from './world.js';
import { studentSprite } from './students.js';
import { propOr } from './signatureActs.js';

const CREW_IDS = new Set(['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west', 'aiAli', 'ai-ali']);

const FX = {
  'tortilla-cannon': 'cannon',
  tortillacannon: 'cannon',
  cannon: 'cannon',
  'meal-prep': 'meal',
  mealprep: 'meal',
  'twitch-raid': 'raid',
  twitchraid: 'raid',
  raid: 'raid',
  'crypto-rig': 'crypto',
  cryptorig: 'crypto',
  mining: 'crypto',
  'angel-round': 'angel',
  angelround: 'angel',
  angel: 'angel',
  'hostile-takeover': 'takeover',
  hostiletakeover: 'takeover',
  takeover: 'takeover',
  'designer-popup': 'popup',
  designerpopup: 'popup',
  popup: 'popup',
  'hacky-sack': 'hacky',
  hackysack: 'hacky',
  hackySack: 'hacky',
  hacky: 'hacky',
  'franchise-deal': 'franchise',
  franchisedeal: 'franchise',
  franchiseDeal: 'franchise',
  franchise: 'franchise',
  'surge-board': 'surge',
  surgeboard: 'surge',
  surge: 'surge',
  'grackle-squad': 'grackle',
  gracklesquad: 'grackle',
  // Engine catalog ids (src/data/upgrades.json).
  phillip_tortilla_cannon: 'cannon',
  phillip_meal_prep_sunday: 'meal',
  antonio_twitch_raid: 'raid',
  antonio_crypto_rig: 'crypto',
  west_angel_round: 'angel',
  west_hostile_takeover: 'takeover',
  west_designer_popup: 'popup',
  matt_hacky_sack: 'hacky',
  matt_grackle_squad: 'grackle',
  aaron_franchise_deal: 'franchise',
  aaron_surge_board: 'surge',
};

const EVENT_RULES = [
  [/cannon|misfire|tortilla-cannon/i, 'cannon'],
  [/meal-?prep|mealSpoil/i, 'meal'],
  [/twitch|raid/i, 'raid'],
  [/crypto|mining|overheat|breaker/i, 'crypto'],
  [/angel/i, 'angel'],
  [/takeover|hostile/i, 'takeover'],
  [/pop-?up|designer/i, 'popup'],
  [/hacky/i, 'hacky'],
  [/franchise/i, 'franchise'],
];

const EFFECT_FLAGS = {
  cannon: 'cannon',
  mealPrep: 'meal',
  raid: 'raid',
  mining: 'crypto',
  angel: 'angel',
  takeover: 'takeover',
  popup: 'popup',
  hacky: 'hacky',
  franchise: 'franchise',
};

export const SIGNATURE_SLOTS = {
  cannon: { i: 13.45, j: 7.5 },
  crypto: { i: 17.05, j: 5.85 },
  briefcase: { i: 9.85, j: 10.25 },
  menu: { i: 9.55, j: 12.35 },
  stall: { i: 16.85, j: 8.35 },
  surge: { i: 11.85, j: 10.95 },
  surge: { i: 13.2, j: 11.15 },
  flags: { i: 15.55, j: 12.45 },
  hacky: { i: 18.6, j: 10.55 },
  meal: { i: 15.05, j: 6.2 },
};

const STATIONS = [CREW.ali, CREW.matt, CREW.jared, { i: 13.15, j: 8.35 }];
const TOW_FROM = { i: 20.4, j: 14.6 };
const TOW_TO = { i: 25.8, j: 20.2 };
const RAID_GATES = [
  { i: 1.4, j: 20.6 },
  { i: 23.4, j: 17.6 },
  { i: 22.2, j: 4.8 },
  { i: 2.2, j: 6.4 },
];

export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function smoothstep(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

export function arcPoint(from, to, t, height) {
  const u = smoothstep(t);
  return {
    i: from.i + (to.i - from.i) * u,
    j: from.j + (to.j - from.j) * u,
    z: Math.sin(u * Math.PI) * height,
  };
}

export function bonkSquash(u) {
  return 1 - 0.38 * Math.sin(clamp01(u) * Math.PI);
}

function tokenFx(token) {
  if (token == null || token === false || token === 0) return null;
  const raw = String(token).trim();
  if (!raw) return null;
  return FX[raw] || FX[raw.toLowerCase()] || null;
}

function note(set, token) {
  const fx = tokenFx(token);
  if (fx) set.add(fx);
}

function absorb(set, src) {
  if (!src) return;
  if (Array.isArray(src)) {
    for (const item of src) {
      if (item && typeof item === 'object') {
        if (item.owned === false) continue;
        if (Number.isFinite(item.level) && item.level <= 0 && item.owned !== true) continue;
        note(set, item.id);
        note(set, item.visual);
      } else note(set, item);
    }
    return;
  }
  if (typeof src === 'string') {
    src.split(',').forEach((part) => note(set, part));
    return;
  }
  if (typeof src === 'object') {
    for (const [key, value] of Object.entries(src)) {
      if (Array.isArray(value)) absorb(set, value);
      else if (value && typeof value === 'object') {
        note(set, value.id || key);
        note(set, value.visual);
      } else if (value) note(set, key);
    }
  }
}

export function collectFx(view, opts, events) {
  const set = new Set();
  absorb(set, opts?.upgrades);
  absorb(set, view?.upgrades);
  absorb(set, view?.S?.upgrades);
  absorb(set, view?.manager?.upgrades);
  absorb(set, view?.manager?.trees?.crew);
  absorb(set, view?.manager?.trees?.main);
  absorb(set, view?.manager?.trees?.stall);
  absorb(set, view?.trees?.crew);
  absorb(set, view?.trees?.main);
  absorb(set, view?.trees?.stall);
  for (const stand of [view?.stands?.main, view?.stands?.stall, view?.manager?.stands?.main, view?.manager?.stands?.stall]) {
    absorb(set, stand?.upgrades);
  }
  const crew = view?.crew;
  if (crew && typeof crew === 'object') {
    const rows = Array.isArray(crew) ? crew : Object.values(crew);
    for (const row of rows) absorb(set, row?.upgrades);
  }
  const mods = view?.upgradeMods || view?.manager?.upgradeMods || view?.manager?.mods;
  if (mods && typeof mods === 'object') {
    for (const [key, fx] of Object.entries(EFFECT_FLAGS)) if (mods[key]) set.add(fx);
  }
  for (const event of events || []) {
    const blob = `${event?.type || ''} ${event?.upgradeId || ''} ${event?.visual || ''} ${event?.id || ''}`;
    for (const [rule, fx] of EVENT_RULES) if (rule.test(blob)) set.add(fx);
  }
  set.delete('moped');
  set.delete('toss');
  set.delete('dj');
  set.delete('pitch');
  return set;
}

function eventKey(event, index) {
  return `${event?.t ?? ''}|${event?.day ?? ''}|${event?.type || ''}|${event?.upgradeId || event?.customerId || index}`;
}

export function createSignatureState() {
  return {
    t: 0,
    prevClock: null,
    fx: new Set(),
    live: {},
    seen: new Set(),
    arcs: [],
    parts: [],
    bonks: [],
    raiders: [],
    shots: 0,
    ride: null,
    tow: 1,
    stall: 0,
    flicker: 0,
    pitch: 0,
    beat: 0,
  };
}

function has(state, fx) {
  return state.fx.has(fx) || (state.live[fx] || 0) > 0;
}

function customerTarget(queue) {
  const people = (queue || []).filter((person) => person && !person.kind && !CREW_IDS.has(person.id) && person.state !== 'walkout');
  if (!people.length) return null;
  return people[Math.floor(people.length / 2)];
}

function spawnArc(state, from, to, kind, height, dur, bonkId) {
  if (state.arcs.length >= 4) return;
  state.arcs.push({ from, to, kind, height, dur, age: 0, bonkId: bonkId || null });
}

function spawnPart(state, part, cap) {
  if (state.parts.length >= cap) return;
  state.parts.push(part);
}

function burst(state, at, color, n, cap, z1) {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    spawnPart(state, {
      i: at.i, j: at.j, di: Math.cos(ang) * 0.55, dj: Math.sin(ang) * 0.35,
      z0: 28, z1: z1 || 46, age: 0, life: 0.85, kind: 'dot', color,
    }, cap);
  }
}

export function placeCrew(member, state) {
  if (!member || member.id !== 'matt' || !state?.hack?.spot) return member;
  const spot = state.hack.spot;
  return {
    ...member,
    i: spot.i,
    j: spot.j,
    di: spot.di || 0,
    dj: spot.dj || 0,
    carry: spot.away ? '' : member.carry,
    hackyAway: spot.away || '',
  };
}

export function drawShades(ctx, x, y, h) {
  if (!ctx || !(h > 0)) return;
  ctx.save();
  ctx.fillStyle = 'rgba(20,16,18,0.88)';
  ctx.fillRect(x - h * 0.12, y - h * 0.72, h * 0.24, Math.max(2, h * 0.03));
  ctx.restore();
}

export function drawMoped() {}

export function customerLook(state, person, index) {
  const id = person?.id;
  const bonk = (state?.bonks || []).find((row) => row.id === id);
  const beat = state?.beat || 0;
  return {
    squash: bonk ? bonkSquash(bonk.age / bonk.dur) : 1,
    bob: 0,
    shades: has(state, 'popup') && ((Number(id) || index) % 4 === 1),
  };
}

const EAST_SHELF = { i: 18.5, j: 8.25 };
const WEST_SHELF = { i: 8.05, j: 8.45 };
const FLAG_ROW = [
  { id: 'ut', name: 'UT', color: '#bf5700' },
  { id: 'am', name: 'A&M', color: '#500000' },
  { id: 'baylor', name: 'BAY', color: '#154734' },
];


function scandalCampus(view, opts) {
  const direct = opts?.scandal ?? (view?.franchise?.scandal ? 'ut' : undefined) ?? view?.live?.scandal ?? view?.scandal ?? view?.manager?.scandal ?? view?.franchiseScandal ?? view?.manager?.franchiseScandal;
  if (direct === true || direct === 1 || direct === '1') return 'ut';
  if (direct && typeof direct === 'object') return String(direct.campus || direct.id || 'ut').toLowerCase();
  if (typeof direct === 'string' && direct && direct !== '0' && direct !== 'false') return direct.toLowerCase();
  const list = view?.franchises || view?.manager?.franchises;
  if (Array.isArray(list)) {
    const hit = list.find((row) => row && (row.scandal || row.smoking));
    if (hit) return String(hit.id || hit.campus || hit.name || 'ut').toLowerCase();
  }
  for (const ev of view?.events || []) {
    const id = `${ev?.type || ''} ${ev?.id || ''}`;
    if (/scandal/i.test(id)) return String(ev.campus || 'ut').toLowerCase();
  }
  return '';
}

const SHELF = { i: 14.65, j: 8.05 };
const FLEE = { i: 10.2, j: 2.6 };

function northOfLawn(i, j) {
  const picnic = UPGRADES.picnic;
  if (j > 11 || (picnic && Math.hypot(i - picnic.i, j - picnic.j) < 4)) return { i: FLEE.i, j: FLEE.j };
  return { i, j };
}

function stepShelfHeist(state, dt, input) {
  if (!state.heist) {
    state.heist = {
      away: 0, last: -100, n: 0,
      birds: [
        { i: 13.5, j: 6.85, homeI: 13.5, homeJ: 6.85, state: 'strut', ft: 0, loot: false, gobble: 0, mirror: false },
        { i: 15.8, j: 6.7, homeI: 15.8, homeJ: 6.7, state: 'strut', ft: 0, loot: false, gobble: 0, mirror: true },
      ],
    };
  }
  const heist = state.heist;
  const matt = (input.crew || []).find((member) => member?.id === 'matt');
  const away = !matt || Math.hypot((matt.i ?? SHELF.i) - SHELF.i, (matt.j ?? SHELF.j) - SHELF.j) > 1.7;
  heist.away = away ? heist.away + dt : 0;
  const busy = heist.birds.some((bird) => bird.state === 'fly' || bird.gobble > 0);
  if (heist.away > 3 && state.t - heist.last > 30 && !busy) {
    const bird = heist.birds.find((row) => row.state === 'strut');
    if (bird) {
      heist.last = state.t;
      heist.n += 1;
      Object.assign(bird, { state: 'fly', ft: 0, fi: bird.i, fj: bird.j, goal: 'shelf', gobblePlan: heist.n % 3 === 0, loot: false });
    }
  }
  for (const bird of heist.birds) {
    if (bird.state === 'fly') {
      const raw = bird.goal === 'shelf' ? SHELF : FLEE;
      const target = northOfLawn(raw.i, raw.j);
      bird.ft += dt;
      const k = Math.min(1, bird.ft / 0.85);
      bird.i = bird.fi + (target.i - bird.fi) * k;
      bird.j = bird.fj + (target.j - bird.fj) * k;
      bird.z = Math.sin(k * Math.PI) * (bird.loot ? 16 : 22);
      if (k < 1) continue;
      if (bird.goal === 'shelf' && bird.gobblePlan) {
        Object.assign(bird, { state: 'gobble', gobble: 1.5, z: 8, loot: false, i: SHELF.i, j: SHELF.j });
        continue;
      }
      if (bird.goal === 'shelf') {
        Object.assign(bird, { goal: 'flee', loot: true, ft: 0, fi: bird.i, fj: bird.j });
        continue;
      }
      Object.assign(bird, { state: 'strut', loot: false, z: 0, i: bird.homeI, j: bird.homeJ });
      continue;
    }
    if (bird.gobble > 0) {
      bird.gobble -= dt;
      bird.i = SHELF.i; bird.j = SHELF.j; bird.z = 8;
      if (bird.gobble <= 0) Object.assign(bird, { state: 'strut', z: 0, i: bird.homeI, j: bird.homeJ });
      continue;
    }
    bird.z = 0;
    bird.i = bird.homeI + Math.sin(state.t * 0.7 + bird.homeI) * 0.12;
    bird.j = bird.homeJ;
  }
}

function stepHacky(state, dt, input) {
  if (!state.hack) state.hack = { streak: 0, kickT: 0, pop: 0, groan: 0, drop: 0, live: false };
  const hack = state.hack;
  if (!has(state, 'hacky')) {
    hack.live = false;
    hack.spot = null;
    return;
  }
  const view = input.view;
  const rush = !!(view?.rush?.active || view?.phase === 'rush' || view?.phase === 'telegraph' || view?.bigRush?.active || view?.live?.handoffRush);
  const busy = rush || (input.queue || []).some((person) => person?.state === 'handoff') || (input.items || []).some((it) => it && (it.station === 'handoff' || it.station === 'wrap'));
  hack.live = !busy && (state.t % 22) < 8;
  const circle = SIGNATURE_SLOTS.hacky;
  hack.spot = hack.live || hack.groan > 0 ? { i: circle.i, j: circle.j, di: 0, dj: 0, away: 'kick' } : null;
  if (hack.groan > 0) {
    hack.groan = Math.max(0, hack.groan - dt);
    hack.drop = Math.max(0, hack.drop - dt);
    hack.pop = Math.max(0, hack.pop - dt);
    return;
  }
  if (!hack.live || dt <= 0) {
    hack.pop = Math.max(0, hack.pop - dt);
    return;
  }
  hack.kickT += dt;
  hack.pop = Math.max(0, hack.pop - dt * 1.3);
  if (hack.kickT < 0.48) return;
  hack.kickT = 0;
  hack.streak += 1;
  hack.pop = 1;
  if (hack.streak >= 8) {
    hack.streak = 0;
    hack.groan = 1.15;
    hack.drop = 0.7;
  }
}



function drawGrackleCarry(ctx, x, y, s, frame, eating, carry) {
  const flap = [-11, -3, 8, -2][frame % 4] * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#10141a';
  ctx.beginPath();
  ctx.moveTo(-2 * s, 0);
  ctx.lineTo(-16 * s, 3 * s);
  ctx.lineTo(-8 * s, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 7 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7 * s, -1.2 * s, 2.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eating ? '#f0c27a' : '#d7a441';
  ctx.beginPath();
  ctx.moveTo(9 * s, -1.4 * s);
  ctx.lineTo(14 * s, eating ? 1.2 * s : -0.4 * s);
  ctx.lineTo(9 * s, eating ? 0.6 * s : -2.2 * s);
  ctx.fill();
  ctx.fillStyle = '#f4c66d';
  ctx.fillRect(7 * s, -2.2 * s, 1.2 * s, 1.2 * s);
  ctx.fillStyle = '#0c1016';
  ctx.beginPath();
  ctx.moveTo(-1 * s, -1 * s);
  ctx.quadraticCurveTo(-8 * s, flap, -13 * s, flap * 0.3);
  ctx.lineTo(-1 * s, 2 * s);
  ctx.fill();
  ctx.restore();
  if (carry && !eating) {
    ctx.fillStyle = '#e7c98a';
    ctx.beginPath();
    ctx.ellipse(x + s, y + 3 * s, 4 * s, 2 * s, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6e8b4b';
    ctx.fillRect(x - s, y + 2 * s, 4 * s, 1.2 * s);
  }
}

export function stepSignatures(state, input = {}) {
  const hidden = input.hidden ?? (typeof document !== 'undefined' && document.hidden);
  const reduced = !!input.reduced;
  const clock = Number.isFinite(input.clock) ? input.clock : null;
  let dt = 0;
  if (!hidden && !reduced && clock != null) {
    if (state.prevClock != null) dt = Math.max(0, Math.min(0.05, clock - state.prevClock));
    state.prevClock = clock;
  } else if (clock != null) state.prevClock = clock;
  if (dt === 0 && !hidden && !reduced && Number.isFinite(input.now)) {
    if (state.prevNow != null) dt = Math.max(0, Math.min(0.05, input.now - state.prevNow));
    state.prevNow = input.now;
  }
  state.t += dt;
  const events = input.events || [];
  state.fx = collectFx(input.view, input.opts, events);
  state.surgeMult = Number(input.view?.surge?.mult) || 1;
  for (let n = 0; n < events.length; n++) {
    const key = eventKey(events[n], n);
    if (state.seen.has(key)) continue;
    state.seen.add(key);
    const blob = `${events[n]?.type || ''} ${events[n]?.upgradeId || ''} ${events[n]?.visual || ''}`;
    for (const [rule, fx] of EVENT_RULES) {
      if (!rule.test(blob)) continue;
      state.live[fx] = Math.max(state.live[fx] || 0, 4.5);
      if (fx === 'cannon' && /misfire/i.test(blob)) state.forceBonk = true;
      if (fx === 'crypto') state.flicker = Math.max(state.flicker, 0.85);
      if (fx === 'raid') state.forceRaid = true;
      if (fx === 'takeover') state.tow = 0;
    }
  }
  if (state.seen.size > 80) state.seen.clear();
  for (const key of Object.keys(state.live)) state.live[key] = Math.max(0, state.live[key] - dt);
  const cap = input.phone ? 22 : 36;
  const queue = input.queue || [];
  const motion = dt > 0;

  if (motion && has(state, 'cannon') && state.t - (state.cannonAt || 0) > 2.35) {
    state.cannonAt = state.t;
    state.shots += 1;
    const guest = customerTarget(queue);
    const misfire = !!state.forceBonk || (guest && state.shots % 7 === 3);
    state.forceBonk = false;
    if (misfire && guest) spawnArc(state, SIGNATURE_SLOTS.cannon, guest, 'tortilla', 34, 0.72, guest.id);
    else spawnArc(state, SIGNATURE_SLOTS.cannon, STATIONS[state.shots % STATIONS.length], 'tortilla', 26, 0.62, null);
  }
  state.scandal = scandalCampus(input.view, input.opts);
  state.ride = null;
  state.pitch = 0;
  stepShelfHeist(state, motion ? dt : 0, input);
  stepHacky(state, motion ? dt : 0, input);
  if (motion && (state.forceRaid || (has(state, 'raid') && state.t - (state.raidAt || 0) > 18))) {
    state.forceRaid = false;
    state.raidAt = state.t;
    burst(state, { i: RIG.i, j: RIG.j }, '#b07cff', input.phone ? 6 : 10, cap, 52);
    const gates = input.phone ? 6 : 10;
    for (let n = 0; n < gates && state.raiders.length < gates; n++) {
      const gate = RAID_GATES[n % RAID_GATES.length];
      const tail = LINE[Math.min(2, n % 3)];
      state.raiders.push({ i: gate.i, j: gate.j, goal: tail, id: 7000 + state.shots * 20 + n, face: gate.i < 12 ? 1 : -1 });
    }
  }
  if (motion && has(state, 'crypto') && state.t - (state.heatAt || 0) > 16) {
    state.heatAt = state.t;
    state.flicker = 0.8;
    burst(state, SIGNATURE_SLOTS.crypto, '#c8c4bc', 4, cap, 30);
  }
  state.flicker = Math.max(0, state.flicker - dt * 1.3);

  if (has(state, 'takeover')) {
    if (state.tow >= 1 && state.stall <= 0) state.tow = 0;
    if (motion) state.tow = Math.min(1, state.tow + dt / 3.2);
    const shown = smoothstep(Math.max(0, state.tow - 0.35) / 0.65);
    state.stall = reduced || hidden ? 1 : shown;
  } else {
    state.tow = 1;
    state.stall = 0;
  }

  if (motion) {
    for (const arc of state.arcs) arc.age += dt;
    for (const arc of state.arcs) {
      if (arc.bonkId && arc.age >= arc.dur && !arc.bonked && !CREW_IDS.has(arc.bonkId)) {
        arc.bonked = true;
        state.bonks.push({ id: arc.bonkId, age: 0, dur: 0.48 });
      }
    }
    state.arcs = state.arcs.filter((arc) => arc.age < arc.dur + 0.05 && arc.kind !== 'taco' && arc.kind !== 'grackle');
    for (const bonk of state.bonks) bonk.age += dt;
    state.bonks = state.bonks.filter((bonk) => bonk.age < bonk.dur);
    for (const part of state.parts) part.age += dt;
    state.parts = state.parts.filter((part) => part.age < part.life);
    const speed = 1.35;
    for (const raider of state.raiders) {
      const di = raider.goal.i - raider.i;
      const dj = raider.goal.j - raider.j;
      const dist = Math.hypot(di, dj) || 1;
      const step = Math.min(dist, speed * dt);
      const ni = raider.i + (di / dist) * step;
      const nj = raider.j + (dj / dist) * step;
      if (inClear(ni, nj, 0.2)) { raider.done = true; continue; }
      raider.i = ni;
      raider.j = nj;
      if (dist < 0.28) raider.done = true;
    }
    state.raiders = state.raiders.filter((raider) => !raider.done);
  }
  state.raining = input.weather === 'rain' || input.view?.manager?.forecastToday?.weather === 'rain';
  state.cap = cap;
  return state;
}

function standBox(ctx, x, y, s, w, h, top, left) {
  ctx.fillStyle = left;
  ctx.fillRect(x - w * s, y - h * s, w * s, h * s);
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(x - w * s, y - h * s);
  ctx.lineTo(x, y - (h + w * 0.35) * s);
  ctx.lineTo(x + w * 0.45 * s, y - h * s);
  ctx.closePath();
  ctx.fill();
}

export function pushSignatureScene(ctx, env) {
  const { state, fit, pack, push, paint, students, customers } = env;
  if (!state) return;
  const s = fit.s;
  const own = (fx) => has(state, fx);

  if (own('cannon')) {
    const at = SIGNATURE_SLOTS.cannon;
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      propOr(ctx, pack, 'cannon', x, y, 48 * s, paint, (c, px, py, h) => {
        c.save();
        c.translate(px, py);
        const k = h / 48;
        c.fillStyle = '#8d5a30';
        c.fillRect(-8 * k, -16 * k, 16 * k, 16 * k);
        c.fillStyle = '#6e1630';
        c.beginPath();
        c.moveTo(6 * k, -14 * k);
        c.lineTo(22 * k, -28 * k);
        c.lineTo(18 * k, -8 * k);
        c.fill();
        c.restore();
      });
    });
  }

  if (own('meal')) {
    const at = SIGNATURE_SLOTS.meal;
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      const spoiled = state.raining && (state.live.meal || 0) > 0;
      ctx.fillStyle = spoiled ? '#8d8d93' : '#f6e6be';
      for (let n = 0; n < 3; n++) ctx.fillRect(x - 8 * s, y - (10 + n * 5) * s, 16 * s, 4 * s);
    });
  }

  if (own('crypto')) {
    const at = SIGNATURE_SLOTS.crypto;
    const fan = 0.45 + 0.55 * Math.abs(Math.sin(state.t * 9));
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      propOr(ctx, pack, 'crypto', x, y, 40 * s, paint, (c, px, py, h) => {
        standBox(c, px, py, h / 40, 16, 14, '#67e8f9', '#241c28');
        c.fillStyle = `rgba(103,232,249,${0.25 + fan * 0.45})`;
        c.beginPath();
        c.arc(px, py - h * 0.45, h * 0.18 * fan, 0, Math.PI * 2);
        c.fill();
      });
    });
  }

  if (own('angel')) {
    const at = SIGNATURE_SLOTS.briefcase;
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      propOr(ctx, pack, 'briefcase', x, y, 28 * s, paint, (c, px, py, h) => {
        c.save();
        c.translate(px, py);
        const k = h / 28;
        c.fillStyle = '#6b4424';
        c.fillRect(-12 * k, -14 * k, 24 * k, 12 * k);
        c.fillStyle = '#f4c66d';
        c.fillRect(-3 * k, -9 * k, 6 * k, 4 * k);
        c.restore();
      });
    });
  }

  if (own('popup')) {
    const posts = [LINE[0], LINE[2], LINE[4]].filter((p) => p && !inClear(p.i, p.j, 0.15));
    posts.forEach((at) => {
      push(at.i, at.j + 0.35, () => {
        const [x, y] = fit.to(at.i, at.j + 0.35);
        propOr(ctx, pack, 'velvet', x, y, 36 * s, paint, (c, px, py, h) => {
          c.fillStyle = '#3a2418';
          c.fillRect(px - 1.5 * s, py - h, 3 * s, h);
          c.fillStyle = '#6e1630';
          c.fillRect(px - 10 * s, py - h * 0.72, 20 * s, 3 * s);
          c.fillStyle = '#f4c66d';
          c.fillRect(px - 2 * s, py - h - 2 * s, 4 * s, 3 * s);
        });
      });
    });
    const menu = SIGNATURE_SLOTS.menu;
    push(menu.i, menu.j, () => {
      const [x, y] = fit.to(menu.i, menu.j);
      propOr(ctx, pack, 'menuGold', x, y, 46 * s, paint, (c, px, py, h) => {
        c.fillStyle = '#6e1630';
        c.fillRect(px - h * 0.22, py - h, h * 0.44, h * 0.72);
        c.fillStyle = '#f4c66d';
        c.fillRect(px - h * 0.16, py - h * 0.9, h * 0.32, h * 0.5);
      });
    });
  }

  if (own('surge')) {
    const at = SIGNATURE_SLOTS.surge;
    const mult = state.surgeMult || 1;
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      const hot = mult >= 1.2;
      const sprite = hot ? (pack?.props?.surgeHot || pack?.props?.surge) : pack?.props?.surge;
      if (sprite && paint) paint(ctx, sprite, x, y, 70 * s);
      else {
        ctx.fillStyle = '#2a1a20'; ctx.fillRect(x - 3 * s, y - 50 * s, 6 * s, 50 * s);
        ctx.fillStyle = '#1e1a20'; ctx.fillRect(x - 22 * s, y - 70 * s, 44 * s, 24 * s);
      }
      // Live surge multiple on a small LED strip under the board.
      ctx.fillStyle = 'rgba(20,14,18,0.85)'; ctx.fillRect(x - 18 * s, y - 14 * s, 36 * s, 11 * s);
      ctx.fillStyle = hot ? (Math.sin(state.t * 8) > 0 ? '#ff5a4a' : '#ffb04a') : '#7ee08a';
      ctx.font = `700 ${Math.max(8, 9 * s)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`×${mult.toFixed(2)}`, x, y - 8.5 * s);
    });
  }

  if (own('grackle')) {
    // Two trained grackles shuttle tacos from the pickup shelf out to the lawn customers and back.
    const lawn = [SIT?.[0] || { i: 7.5, j: 15.5 }, SIT?.[1] || { i: 19.5, j: 15.8 }];
    for (let n = 0; n < 2; n++) {
      const cycle = (state.t * 0.18 + n * 0.5) % 1, out = cycle < 0.5, u = out ? cycle * 2 : (1 - cycle) * 2;
      const to = lawn[n % lawn.length];
      const i = SHELF.i + (to.i - SHELF.i) * u, j = SHELF.j + (to.j - SHELF.j) * u;
      const lift = 70 + Math.sin(u * Math.PI) * 40;
      push(i, j, () => {
        const [x, y] = fit.to(i, j, lift * s);
        const frames = pack?.grackle;
        const sprite = frames?.length ? frames[Math.floor(state.t * 10 + n * 3) % frames.length] : null;
        const flip = (to.i - to.j > SHELF.i - SHELF.j) !== out;
        if (sprite && paint) paint(ctx, sprite, x, y, 22 * s, { flip, shadow: false });
        else { ctx.fillStyle = '#16121c'; ctx.beginPath(); ctx.ellipse(x, y - 6 * s, 7 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill(); }
        if (out) { ctx.fillStyle = '#e8b85a'; ctx.fillRect(x + (flip ? -9 : 4) * s, y - 4 * s, 6 * s, 3 * s); ctx.fillStyle = '#6fa34a'; ctx.fillRect(x + (flip ? -8 : 5) * s, y - 5 * s, 4 * s, 1.2 * s); }
      }, 400);
    }
  }

  if (own('franchise')) {
    const at = SIGNATURE_SLOTS.flags;
    const smoke = String(state.scandal || '');
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      const sprite = pack?.props?.franchise;
      if (!(sprite && paint)) {
        ctx.fillStyle = '#5c3a22';
        ctx.fillRect(x - 24 * s, y - 40 * s, 48 * s, 34 * s);
        ctx.fillStyle = '#efe2c6';
        ctx.fillRect(x - 21 * s, y - 37 * s, 42 * s, 28 * s);
        ctx.fillStyle = '#b7c98a';
        ctx.beginPath();
        ctx.ellipse(x, y - 24 * s, 14 * s, 8 * s, -0.4, 0, Math.PI * 2);
        ctx.fill();
      } else paint(ctx, sprite, x, y, 78 * s);
      FLAG_ROW.forEach((flag, i) => {
        const fx = x + (i - 1) * 12 * s;
        const fy = y - 34 * s;
        const wave = Math.sin(state.t * 4 + i) * 2 * s;
        const smoking = smoke && (smoke.includes(flag.id) || smoke.includes(flag.name.toLowerCase()));
        if (smoking) {
          ctx.fillStyle = '#4a4038';
          ctx.fillRect(fx, fy, 1.5 * s, 12 * s);
          for (let puff = 0; puff < 3; puff++) {
            const rise = (state.t * 14 + puff * 5) % 14;
            ctx.fillStyle = `rgba(80,80,86,${0.5 - puff * 0.12})`;
            ctx.beginPath();
            ctx.arc(fx + Math.sin(state.t * 3 + puff) * 3 * s, fy - rise * s, (1.8 + puff * 0.6) * s, 0, Math.PI * 2);
            ctx.fill();
          }
          return;
        }
        ctx.fillStyle = '#3a2418';
        ctx.fillRect(fx, fy, 1.3 * s, 12 * s);
        ctx.fillStyle = flag.color;
        ctx.beginPath();
        ctx.moveTo(fx + 1.2 * s, fy);
        ctx.lineTo(fx + 10 * s, fy + 3 * s + wave);
        ctx.lineTo(fx + 1.2 * s, fy + 6 * s);
        ctx.fill();
      });
    });
  }

  if (own('hacky')) {
    const at = SIGNATURE_SLOTS.hacky;
    const hack = state.hack || { streak: 0, kickT: 0, pop: 0, groan: 0, drop: 0, live: true };
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      const ring = hack.groan > 0 ? 2 : Math.min(6, 2 + Math.floor(hack.streak / 2));
      const radius = (16 + ring * 3) * s;
      const shirts = ['#6e1630', '#f4c66d', '#1d4c86', '#5e8a4a', '#500000', '#154734'];
      for (let n = 0; n < ring; n++) {
        const ang = (n / ring) * Math.PI * 2 + 0.4;
        const sx = x + Math.cos(ang) * radius;
        const sy = y + Math.sin(ang) * radius * 0.42;
        ctx.fillStyle = shirts[n % shirts.length];
        ctx.fillRect(sx - 3 * s, sy - 10 * s, 6 * s, 8 * s);
        ctx.fillStyle = '#e6c2a6';
        ctx.beginPath();
        ctx.arc(sx, sy - 12 * s, 2.3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      const kick = hack.live && hack.groan <= 0 ? Math.sin((hack.kickT / 0.48) * Math.PI) : 0;
      const drop = hack.drop > 0 ? (1 - hack.drop / 0.7) * 10 * s : 0;
      const frame = Math.floor(state.t * 8) % 4;
      const sheet = pack?.hacky?.[frame];
      const sx = x + (hack.live ? Math.sin(state.t * 2.2) * 8 * s : 0);
      const sy = y - kick * 16 * s + drop;
      if (sheet && paint) paint(ctx, sheet, sx, sy, 18 * s);
      else {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(frame * 0.5);
        ctx.fillStyle = '#c23b48';
        ctx.beginPath();
        ctx.arc(0, 0, 3.1 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2f6f4e';
        ctx.beginPath();
        ctx.arc(-1 * s, -0.4 * s, 1.4 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (hack.pop > 0 && hack.streak > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, hack.pop);
        ctx.fillStyle = '#f6e7c1';
        ctx.font = `700 ${Math.max(11, 13 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(hack.streak), x, y - 28 * s - (1 - hack.pop) * 10);
        ctx.restore();
      }
      if (hack.groan > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, hack.groan);
        ctx.fillStyle = 'rgba(255,248,236,0.94)';
        ctx.fillRect(x - 18 * s, y - 36 * s, 36 * s, 14 * s);
        ctx.fillStyle = '#3a2418';
        ctx.font = `600 ${Math.max(10, 11 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('oof', x, y - 36 * s + 7 * s);
        ctx.restore();
      }
    });
  }

  for (const bird of state.heist?.birds || []) {
    const height = bird.z || 0;
    push(bird.i, bird.j, () => {
      const [x, y] = fit.to(bird.i, bird.j, height);
      if (bird.gobble > 0) {
        const bite = Math.max(0.25, bird.gobble / 1.5);
        ctx.fillStyle = '#e8b85a';
        ctx.fillRect(x + 4 * s, y - 2 * s, 6 * s * bite, 2 * s);
        ctx.fillStyle = '#6fa34a';
        ctx.fillRect(x + 5 * s, y - 3.2 * s, 3 * s * bite, 1.3 * s);
      }
      drawGrackleCarry(ctx, x, y, s, bird.state === 'fly' ? Math.floor(state.t * 12) % 4 : 1, bird.gobble > 0, !!bird.loot);
    }, -height);
  }

  if (own('takeover') && state.tow < 1) {
    const u = smoothstep(state.tow);
    const i = TOW_FROM.i + (TOW_TO.i - TOW_FROM.i) * u;
    const j = TOW_FROM.j + (TOW_TO.j - TOW_FROM.j) * u;
    push(i, j, () => {
      const [x, y] = fit.to(i, j);
      ctx.save();
      ctx.globalAlpha = 1 - u * 0.35;
      standBox(ctx, x, y, s, 34, 18, '#f2efe6', '#6e1630');
      ctx.strokeStyle = '#3a2418';
      ctx.beginPath();
      ctx.moveTo(x + 20 * s, y - 8 * s);
      ctx.lineTo(x + 36 * s, y - 4 * s);
      ctx.stroke();
      ctx.restore();
    });
  }
  if (own('takeover') && state.stall > 0.02) {
    const at = SIGNATURE_SLOTS.stall;
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      ctx.save();
      ctx.globalAlpha = state.stall;
      if (pack?.stall && paint) paint(ctx, pack.stall, x, y, propScreenHeight(pack.stall, PROP_TILES.stall, s) * state.stall);
      else standBox(ctx, x, y, s, 26, 16, '#f4c66d', '#6e1630');
      ctx.restore();
    });
  }


  for (const arc of state.arcs) {
    const p = arcPoint(arc.from, arc.to, arc.age / arc.dur, arc.height);
    push(p.i, p.j, () => {
      const [x, y] = fit.to(p.i, p.j, p.z);
      if (arc.kind === 'tortilla' || arc.kind == null) {
        ctx.fillStyle = '#f6e6be';
        ctx.beginPath();
        ctx.ellipse(x, y, 5 * s, 2 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  for (const part of state.parts) {
    const u = smoothstep(part.age / part.life);
    const i = part.i + part.di * u;
    const j = part.j + part.dj * u;
    if (inClear(i, j, 0.15) && part.color === '#b07cff') continue;
    push(i, j, () => {
      const [x, y] = fit.to(i, j, part.z0 + (part.z1 - part.z0) * u);
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = part.color;
      ctx.fillRect(x, y, 2.5 * s, 2.5 * s);
      ctx.globalAlpha = 1;
    });
  }

  for (const raider of state.raiders) {
    if (inClear(raider.i, raider.j, 0.15)) continue;
    const sprite = studentSprite(students, 'walk', raider.id, raider.face) || (customers?.length ? customers[raider.id % customers.length] : null);
    push(raider.i, raider.j, () => {
      const [x, y] = fit.to(raider.i, raider.j);
      if (paint && sprite) paint(ctx, sprite, x, y, CREW_PX * SCALE.ambient * s, { alpha: 0.8, bob: Math.abs(Math.sin(state.t * 8 + raider.id)) * -3 * s });
      else {
        ctx.fillStyle = '#3a4a6e';
        ctx.fillRect(x - 4 * s, y - 18 * s, 8 * s, 16 * s);
      }
    });
  }
}

export function paintSignatureOverlay(ctx, fit, state) {
  if (!state || state.flicker <= 0.02) return;
  const [x, y] = fit.to(STAND.i, STAND.j);
  const blink = 0.5 + 0.5 * Math.sin(state.t * 46);
  ctx.save();
  ctx.globalAlpha = state.flicker * (0.12 + blink * 0.18);
  ctx.fillStyle = blink > 0.5 ? '#1a120c' : '#f6e7c1';
  ctx.fillRect(x - 90 * fit.s, y - 80 * fit.s, 180 * fit.s, 70 * fit.s);
  ctx.restore();
}
