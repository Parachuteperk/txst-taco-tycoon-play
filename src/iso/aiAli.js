// Ali's capstone, AI Ali. Presentation only: no prices, no stock, no second sheet.
// The engine does not currently emit westDistraction / aiAliIntercept / westSuspects
// and src/data/upgrades.json is not in the tree. When view.customers, view.items,
// and view.crew are arrays, this plays only the events those arrays bring.
// Otherwise a local mock emits the same three event types.

import { CREW } from './world.js';
import { collectOwned, propFlags } from '../upgradeVisuals.js';

export const WEST_EVENTS = ['westDistraction', 'aiAliIntercept', 'westSuspects'];
export const ALI_BITMAP = 'ali';
const CAPSTONE_IDS = ['aiAli', 'ai-ali', 'ai_ali', 'westHandler'];
const WALK_TO = 1.45;
const CHAT = 1.05;
const WALK_BACK = 1.45;
const MATERIALIZE = 0.62;
const SUSPECT = 1.15;

const mod = (n, m) => ((n % m) + m) % m;

function smooth(u) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

function crossed(prev, now, period, mark) {
  if (!(now > prev)) return false;
  const a0 = mod(prev, period);
  const a1 = mod(now, period);
  if (a1 >= a0) return a0 < mark && a1 >= mark;
  return a0 < mark || a1 >= mark;
}

export function engineArraysPresent(view) {
  return !!(view && Array.isArray(view.customers) && Array.isArray(view.items) && Array.isArray(view.crew));
}

function crewEntries(crew) {
  if (!crew) return [];
  if (Array.isArray(crew)) return crew.filter(Boolean);
  if (typeof crew === 'object') {
    return Object.entries(crew).map(([id, row]) => (
      row && typeof row === 'object' ? { id: row.id || id, ...row } : { id }
    ));
  }
  return [];
}

// Capstone owned, or view.crew contains id aiAli / role westHandler.
// Ownership is the same reader as the skill-tree visuals (catalog id ai-ali).
export function aiAliUnlocked(view, opts) {
  if (crewEntries(view?.crew).some((c) => c.id === 'aiAli' || c.role === 'westHandler')) return true;
  const owned = collectOwned(view, opts);
  if (propFlags(owned).clone) return true;
  return CAPSTONE_IDS.some((id) => owned.ids.has(id) || owned.visuals.has(id));
}

// Beside Mrs. West, toward the grill, off her feet and off the rope.
export function aiAliSpots(crew = CREW) {
  const west = crew.west || { i: 10.55, j: 10.85 };
  const ali = crew.ali || { i: 14.35, j: 7.75 };
  return {
    ali: { i: ali.i, j: ali.j },
    west: { i: west.i, j: west.j },
    chat: { i: west.i + 0.78, j: west.j - 0.22 },
    ai: { i: west.i + 0.58, j: west.j - 0.4 },
  };
}

export function createAiAli() {
  return {
    phase: 'idle',
    phaseT: 0,
    u: 0,
    returnFrom: 1,
    queued: false,
    spawned: false,
    introduced: false,
    reveal: 1,
    glitch: false,
    hard: 0,
    squint: 0,
    gush: false,
    nod: 0,
    laugh: 0,
    holdBag: false,
    hearts: [],
    smoke: false,
    bitmap: ALI_BITMAP,
    mockMode: false,
    flickerTick: -1,
    lastT: null,
  };
}

function beginWalk(state) {
  state.phase = 'to';
  state.phaseT = 0;
  state.queued = false;
}

function beginMaterialize(state) {
  if (state.introduced) return;
  state.introduced = true;
  state.spawned = true;
  state.reveal = 0;
  state.holdBag = false;
}

function sendHome(state) {
  if (state.phase === 'idle') return;
  if (state.phase !== 'back') {
    state.phase = 'back';
    state.phaseT = 0;
    state.returnFrom = state.u;
  }
}

function mockWestEvents(state, t, unlocked) {
  if (state.lastT == null) {
    state.lastT = t;
    return [];
  }
  const prev = state.lastT;
  state.lastT = t;
  const out = [];
  if (!unlocked) {
    if (crossed(prev, t, 18, 1)) out.push({ type: 'westDistraction', source: 'mock' });
  } else if (crossed(prev, t, 22, 4)) out.push({ type: 'westSuspects', source: 'mock' });
  return out;
}

export function stepAiAli(state, input = {}) {
  const t = input.t || 0;
  const dt = Math.max(0, Math.min(0.05, input.dt ?? 0.016));
  const view = input.view || null;
  const unlocked = aiAliUnlocked(view, input.opts);
  const engine = input.engine != null ? !!input.engine : engineArraysPresent(view);
  const incoming = (input.events || []).filter((ev) => WEST_EVENTS.includes(ev?.type));
  state.mockMode = !engine && incoming.length === 0;
  let events = incoming;
  if (state.mockMode) events = mockWestEvents(state, t, unlocked);
  if (unlocked && !state.introduced && !events.some((ev) => ev.type === 'aiAliIntercept' || ev.type === 'westDistraction')) {
    events = events.concat([{ type: 'aiAliIntercept', source: engine ? 'crew' : 'unlock' }]);
  }

  for (const ev of events) {
    if (ev.type === 'westDistraction') {
      if (unlocked) {
        if (!state.introduced) beginMaterialize(state);
        sendHome(state);
      } else if (state.phase === 'idle') beginWalk(state);
      else state.queued = true;
    } else if (ev.type === 'aiAliIntercept') {
      beginMaterialize(state);
      sendHome(state);
    } else if (ev.type === 'westSuspects') {
      state.hard = SUSPECT;
      state.squint = SUSPECT;
    }
  }

  if (state.phase === 'to' || state.phase === 'chat' || state.phase === 'back') {
    state.phaseT += dt;
    const dur = state.phase === 'chat' ? CHAT : state.phase === 'to' ? WALK_TO : WALK_BACK;
    const p = Math.min(1, state.phaseT / dur);
    if (state.phase === 'to') state.u = smooth(p);
    else if (state.phase === 'chat') state.u = 1;
    else state.u = (state.returnFrom ?? 1) * (1 - smooth(p));
    if (p >= 1) {
      if (state.phase === 'to') {
        state.phase = 'chat';
        state.phaseT = 0;
        state.u = 1;
      } else if (state.phase === 'chat') {
        state.phase = 'back';
        state.phaseT = 0;
        state.returnFrom = 1;
      } else {
        state.phase = 'idle';
        state.phaseT = 0;
        state.u = 0;
        state.returnFrom = 1;
        if (state.queued && !unlocked) beginWalk(state);
        else state.queued = false;
      }
    }
  }

  if (unlocked && (state.phase === 'to' || state.phase === 'chat')) sendHome(state);
  if (state.reveal < 1) state.reveal = Math.min(1, state.reveal + dt / MATERIALIZE);
  state.hard = Math.max(0, state.hard - dt);
  state.squint = Math.max(0, state.squint - dt);
  state.smoke = state.u > 0.05;
  state.gush = state.spawned && state.squint <= 0 && state.reveal > 0.35;
  state.holdBag = state.spawned && state.reveal > 0.82 && state.squint <= 0;
  state.nod = state.spawned ? Math.max(0, Math.sin(t * 2.2)) : 0;
  state.laugh = state.spawned && state.squint <= 0 && Math.sin(t * 0.7) > 0.72 ? 1 : 0;
  const tick = Math.floor(t * 12);
  state.glitch = !!(state.spawned && state.hard <= 0 && tick !== state.flickerTick && tick % 19 === 0);
  state.flickerTick = tick;
  if (state.gush && state.hearts && Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
    state.hearts.push({ t, n: state.hearts.length });
  }
  state.hearts = (state.hearts || []).filter((heart) => t - heart.t < 1.3);
  state.bitmap = ALI_BITMAP;
  state.atGrill = state.phase === 'idle' && state.u < 0.02;
  return state;
}

export function aliFeet(state, spots = aiAliSpots()) {
  const u = state.u || 0;
  const moving = state.phase === 'to' || state.phase === 'back';
  const sign = state.phase === 'back' ? -1 : 1;
  return {
    i: spots.ali.i + (spots.chat.i - spots.ali.i) * u,
    j: spots.ali.j + (spots.chat.j - spots.ali.j) * u,
    di: moving ? (spots.chat.i - spots.ali.i) * sign : 0,
    dj: moving ? (spots.chat.j - spots.ali.j) * sign : 0,
  };
}

export function applyAiAli(state, frame, spots = aiAliSpots()) {
  const crew = frame.crew || (frame.crew = []);
  const ali = crew.find((c) => c.id === 'ali');
  if (ali && state.u > 0.001) {
    const feet = aliFeet(state, spots);
    ali.i = feet.i;
    ali.j = feet.j;
    ali.di = feet.di;
    ali.dj = feet.dj;
    ali.carry = '';
  }
  if (state.spawned) {
    let clone = crew.find((c) => c.id === 'aiAli' || c.role === 'westHandler');
    const existed = !!clone && Number.isFinite(clone.i) && Number.isFinite(clone.j);
    if (!clone) {
      clone = { id: 'aiAli', role: 'westHandler', task: 'west', i: spots.ai.i, j: spots.ai.j, di: 0, dj: 0 };
      crew.push(clone);
    }
    if (!existed) {
      clone.i = spots.ai.i;
      clone.j = spots.ai.j;
      clone.di = 0;
      clone.dj = 0;
    }
    clone.id = clone.id || 'aiAli';
    clone.role = 'westHandler';
    clone.bitmap = ALI_BITMAP;
    clone.reveal = state.reveal;
    clone.glitch = state.glitch;
    clone.hard = state.hard > 0;
    clone.nod = state.nod;
    clone.laugh = state.laugh;
    clone.holdBag = state.holdBag;
  }
  const west = crew.find((c) => c.id === 'west');
  if (west) west.squint = state.squint > 0;
  frame.aiAli = {
    smoke: state.smoke,
    hearts: state.hearts,
    gush: state.gush,
    bitmap: ALI_BITMAP,
    mockMode: state.mockMode,
    spawned: state.spawned,
  };
  return frame;
}

function spriteImage(sprite) {
  if (!sprite) return null;
  if (sprite.image) return sprite;
  if (sprite.width) return { image: sprite, anchorX: sprite.width / 2, anchorY: sprite.height };
  return null;
}

let washCanvas = null;
function washOf(image, w, h, amount) {
  if (typeof document === 'undefined' || amount <= 0) return null;
  const W = Math.max(1, Math.ceil(w) + 4);
  const H = Math.max(1, Math.ceil(h) + 4);
  if (!washCanvas || washCanvas.width < W || washCanvas.height < H) {
    washCanvas = document.createElement('canvas');
    washCanvas.width = W;
    washCanvas.height = H;
  }
  const g = washCanvas.getContext('2d');
  g.clearRect(0, 0, washCanvas.width, washCanvas.height);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.drawImage(image, 2, 2, w, h);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = `rgba(72, 226, 255, ${amount})`;
  g.fillRect(0, 0, washCanvas.width, washCanvas.height);
  g.globalCompositeOperation = 'source-over';
  return washCanvas;
}

function heldBag(ctx, dx, dy, w, h) {
  const x = dx + w * 0.58;
  const y = dy + h * 0.58;
  const bw = Math.max(4, w * 0.16);
  const bh = Math.max(5, h * 0.14);
  ctx.fillStyle = '#5c3d6e';
  ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = '#e6c36a';
  ctx.fillRect(x + bw * 0.28, y, bw * 0.44, Math.max(1, bh * 0.16));
}

// One draw-time composite of Ali's bitmap. Outline, wash, and glitch slices
// all sample `sprite`. Nothing here loads or caches a second png.
export function paintAliClone(ctx, sprite, x, y, destH, opt = {}) {
  const sp = spriteImage(sprite);
  if (!sp?.image) return null;
  const reveal = opt.reveal == null ? 1 : opt.reveal;
  const eased = smooth(reveal);
  const squash = (opt.squash || 1) * (opt.laugh ? 0.94 : 1);
  const bob = (opt.bob || 0) + (opt.nod > 0 ? -opt.nod * destH * 0.035 : 0);
  const sc = destH / sp.image.height;
  const w = sp.image.width * sc;
  const h = destH * squash;
  const dx = -sp.anchorX * sc;
  const dy = -sp.anchorY * sc * squash;
  const amount = opt.hard ? 0.48 : 0.2;
  const washed = washOf(sp.image, w, h, amount);
  const sheet = washed || sp.image;
  const ox = washed ? dx - 2 : dx;
  const oy = washed ? dy - 2 : dy;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y + bob));
  if (opt.flip) ctx.scale(-1, 1);
  ctx.globalAlpha = (opt.alpha ?? 1) * Math.max(0, eased);
  if (eased < 0.999) {
    ctx.beginPath();
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      const gate = eased * bands - i;
      if (gate <= 0) continue;
      const bh = h / bands;
      ctx.rect(dx - 6, dy + i * bh, w + 14, bh * Math.min(1, gate));
    }
    ctx.clip();
  }
  const dw = washed ? Math.ceil(w) + 4 : w;
  const dh = washed ? Math.ceil(h) + 4 : h;
  const blit = (px, py) => {
    if (washed) ctx.drawImage(sheet, 0, 0, dw, dh, px, py, dw, dh);
    else ctx.drawImage(sp.image, px, py, w, h);
  };
  const shift = opt.hard ? 4 : (1 - eased) * 7;
  if (shift > 0.6) {
    ctx.save();
    ctx.globalAlpha = (opt.alpha ?? 1) * 0.55 * Math.max(0.35, eased);
    blit(ox + shift, oy);
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(94, 246, 255, 0.8)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 0;
  blit(ox, oy);
  ctx.restore();
  if (opt.glitch || opt.hard) {
    const sy = sp.image.height * 0.34;
    const sh = Math.max(1, sp.image.height * (opt.hard ? 0.2 : 0.07));
    const kick = opt.hard ? 5 : 3;
    ctx.drawImage(sp.image, 0, sy, sp.image.width, sh, dx + kick, dy + h * 0.34, w, h * (opt.hard ? 0.2 : 0.07));
  }
  const headY = dy + h * 0.14;
  ctx.fillStyle = 'rgba(186, 255, 255, 0.95)';
  ctx.fillRect(dx + w * 0.64, headY, Math.max(1, w * 0.035), Math.max(1, h * 0.012));
  ctx.fillStyle = 'rgba(120, 236, 255, 0.85)';
  ctx.fillRect(dx + w * 0.66, dy + h * 0.05, Math.max(1, w * 0.018), h * 0.07);
  if (opt.holdBag) heldBag(ctx, dx, dy, w, h);
  ctx.restore();
  return sp.image;
}
