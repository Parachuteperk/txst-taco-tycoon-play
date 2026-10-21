// Isometric quad. Depth is screen y. The crew paint full size; the campus is smaller and softer.
import { createCampus, stepCampus, bubbleFor } from './campus.js';
import { studentSprite, ambientMotion, ambientSprite, lifeFrame } from './students.js';
import { watchAnimator, arcPoint, easeOutCubic, frameAt } from './anim.js';
import { workPose, handoffArc } from './crewLoops.js';
import { drawSparks } from '../fx.js';
import {
  STAND, WINDOW, RIG, OLD_MAIN, CREW, CRATE, COOLER, TRASH, LAMPS, UPGRADES, FRISBEE, EXIT,
  inClear, sunShift, fitCamera, walkRow, project, queuePath, queueBarriers, nudgeOffCrew,
} from './world.js';
import { paintCrewPortrait, portraitHotFromActor, PORTRAIT_NAMES } from '../ui/portraits.js';
import { paintAliClone } from './aiAli.js';
import {
  createSignatureState, stepSignatures, placeCrew, customerLook, drawMoped, drawShades,
  pushSignatureScene, paintSignatureOverlay,
} from './signatures.js';
import { createActState, stepActs, actPlace, actLook, drawActMoped, pushActs } from './signatureActs.js';
import {
  VAULT, challengerAt, coinArcPoint, coinWorld, crewShown, payoutSprites, watchFocus,
} from './vault.js';
import { paintSprite, drawContactShadow, propScreenHeight, plazaScreenHeight, PROP_TILES, CREW_PX, SCALE } from '../art/composite.js';
import { customerSpriteAt } from '../customerReact.js';
import { collectOwned, propFlags, stallShouldDraw } from '../upgradeVisuals.js';
import { pushUpgradeLayers, drawUpgradeOverlay, lineCheer, drawCheerArms } from './upgradeProps.js';

const CREW_H = CREW_PX;
const LINE_H = CREW_PX * SCALE.customer;
const AMB_H = CREW_PX * SCALE.ambient;
let paintedGround = false;

function spriteImage(sprite) {
  if (!sprite) return null;
  if (sprite.image) {
    if (sprite.anchorY == null) {
      const pad = sprite.image.footPad || 0;
      return { image: sprite.image, anchorX: sprite.image.width / 2, anchorY: sprite.image.height - pad };
    }
    return sprite;
  }
  if (sprite.width) {
    const pad = sprite.footPad || 0;
    return { image: sprite, anchorX: sprite.width / 2, anchorY: sprite.height - pad };
  }
  return null;
}

function spokeShimmer(ctx, dx, dy, w, h, phase) {
  const flicker = 0.22 + 0.62 * Math.abs(Math.sin((phase || 0) * 3.2));
  ctx.save();
  ctx.globalAlpha *= flicker;
  ctx.strokeStyle = 'rgba(255,246,220,0.95)';
  ctx.lineWidth = Math.max(1, h * 0.016);
  const y = dy + h * 0.86;
  const r = Math.max(2, h * 0.07);
  for (const u of [0.26, 0.74]) {
    const x = dx + w * u;
    const a = (phase || 0) * 4.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a + Math.PI) * r * 0.85, y + Math.sin(a + Math.PI) * r * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function paintAmbientStudent(ctx, sprite, x, y, destH, motion, picked, px) {
  const scale = Math.max(1, px || 1);
  const bob = Math.max(-3 * scale, Math.min(3 * scale, (motion?.bob || 0) * scale));
  paint(ctx, sprite, x, y, destH, {
    bob,
    lean: motion?.lean || 0,
    squash: motion?.squash || 1,
    stretch: motion?.stretch || 1,
    flip: !!picked?.flip,
    spoke: !!motion?.spoke,
    phase: motion?.phase || 0,
    alpha: 0.9,
  });
}

function paint(ctx, sprite, x, y, destH, opt = {}) {
  const sp = spriteImage(sprite);
  if (!sp) return;
  const squash = opt.squash || 1;
  const stretch = opt.stretch || 1;
  const sc = destH / sp.image.height;
  const w = sp.image.width * sc * stretch;
  const h = destH * squash;
  if (opt.shadow !== false) drawContactShadow(ctx, Math.round(x), Math.round(y), Math.max(8, w * 0.42), { ground: opt.ground ?? paintedGround });
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + (opt.bob || 0)));
  if (opt.lean) ctx.rotate(opt.lean);
  if (opt.flip) ctx.scale(-1, 1);
  ctx.globalAlpha = opt.alpha ?? 1;
  const dx = Math.round(-sp.anchorX * sc * stretch);
  const dy = Math.round(-sp.anchorY * sc * squash);
  paintSprite(ctx, sp.image, dx, dy, Math.round(w), Math.round(h));
  if (opt.spoke) spokeShimmer(ctx, dx, dy, Math.round(w), Math.round(h), opt.phase || 0);
  if (opt.step) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w, -h * 0.42, w * 2, h * 0.42);
    ctx.clip();
    paintSprite(ctx, sp.image, dx + opt.step, dy, Math.round(w), Math.round(h));
    ctx.restore();
  }
  ctx.restore();
  return w;
}

// Visible (non-transparent) bounds of a sprite image, cached per image, so name tags sit on the painted body
// even when the figure is not centred in its cell.
const inkBoxes = new WeakMap();
function inkBox(image) {
  if (!image) return null;
  let box = inkBoxes.get(image);
  if (box) return box;
  box = { x0: 0, y0: 0, x1: image.width, y1: image.height };
  try {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (c && image.width && image.height) {
      c.width = image.width; c.height = image.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(image, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) {
        // Head x: mean column of opaque pixels in the top 12% of the visible box.
        const band = y0 + Math.max(2, Math.round((y1 - y0) * 0.12));
        let sum = 0, n = 0;
        for (let y = y0; y <= band; y++) for (let x = x0; x <= x1; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { sum += x; n++; }
        box = { x0, y0, x1: x1 + 1, y1: y1 + 1, headX: n ? sum / n : (x0 + x1 + 1) / 2 };
      }
    }
  } catch { /* tainted or headless: fall back to the full cell */ }
  inkBoxes.set(image, box);
  return box;
}

// Screen-space head point of a sprite painted with paint(ctx, sprite, x, y, destH, opt).
function headOf(sprite, x, y, destH, opt = {}) {
  const sp = spriteImage(sprite);
  if (!sp) return null;
  const sc = destH / sp.image.height, box = inkBox(sp.image);
  const flip = opt.flip ? -1 : 1;
  const cx = x + flip * ((box.headX ?? (box.x0 + box.x1) / 2) - sp.anchorX) * sc * (opt.stretch || 1);
  const top = y + (opt.bob || 0) + (box.y0 - sp.anchorY) * sc * (opt.squash || 1);
  return { x: cx, top };
}

function walkFrame(rowFrames, t) {
  if (!rowFrames) return null;
  const frames = Array.isArray(rowFrames) ? rowFrames : [rowFrames];
  if (!frames.length) return null;
  return frames[Math.floor(t * 8) % frames.length];
}

function isoPoly(ctx, cam, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let n = 0; n < pts.length; n++) {
    const [x, y] = cam.to(pts[n][0], pts[n][1]);
    if (n === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawGround(ctx, cam, pack, dw, dh) {
  if (!pack?.ground) {
    ctx.fillStyle = '#6d8a4c';
    ctx.fillRect(0, 0, dw, dh);
    isoPoly(ctx, cam, [[0, 4.6], [26, 4.6], [26, 6.2], [0, 6.2]], '#d4b48a');
    isoPoly(ctx, cam, [[0, 17.4], [26, 17.4], [26, 21.5], [0, 21.5]], '#c9a67c');
    isoPoly(ctx, cam, [[1.2, 4], [3.4, 4], [3.4, 21], [1.2, 21]], '#d7b48a');
    isoPoly(ctx, cam, [[20.2, 4], [22.4, 4], [22.4, 21], [20.2, 21]], '#d7b48a');
    isoPoly(ctx, cam, [[8.2, 6.4], [18.6, 6.4], [18.6, 15.8], [8.2, 15.8]], '#b5654a');
    isoPoly(ctx, cam, [[9.4, 7.2], [16.8, 7.2], [16.8, 13.6], [9.4, 13.6]], '#a85a42');
    return;
  }
  // Painted plate already has bricks, lamps, and shadows. No diamond grid on top.
  // Map the image across the quad, then cover the canvas around the stand.
  ctx.fillStyle = '#c4553a';
  ctx.fillRect(0, 0, dw, dh);
  const x0 = project(0, 22)[0];
  const y0 = project(0, 0)[1] - 260;
  const x1 = project(26, 0)[0];
  const y1 = project(26, 22)[1];
  const dx = x0 * cam.s + cam.ox;
  const dy = y0 * cam.s + cam.oy;
  const w = (x1 - x0) * cam.s;
  const h = (y1 - y0) * cam.s;
  // Share the camera with the sprites. A second cover zoom cropped Old Main
  // and slid the plate off the crew's feet.
  ctx.drawImage(pack.ground, dx, dy, w, h);
}

function box(ctx, cam, i, j, w, d, h, top, left, right) {
  const [x, y] = cam.to(i, j);
  const s = cam.s;
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - w * s, y - w * 0.5 * s);
  ctx.lineTo(x - w * s, y - w * 0.5 * s - h * s);
  ctx.lineTo(x, y - h * s);
  ctx.fill();
  ctx.fillStyle = right;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + d * s, y - d * 0.5 * s);
  ctx.lineTo(x + d * s, y - d * 0.5 * s - h * s);
  ctx.lineTo(x, y - h * s);
  ctx.fill();
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(x, y - h * s);
  ctx.lineTo(x - w * s, y - w * 0.5 * s - h * s);
  ctx.lineTo(x + (d - w) * s, y - (d + w) * 0.5 * s - h * s);
  ctx.lineTo(x + d * s, y - d * 0.5 * s - h * s);
  ctx.fill();
}

function drawStand(ctx, cam, era, pack) {
  const sprite = pack?.stands?.[era];
  if (sprite) {
    const [x, y] = cam.to(STAND.i, STAND.j);
    const h = propScreenHeight(sprite, PROP_TILES.stand, cam.s);
    paint(ctx, sprite, x, y, h);
    if (era === 'stand') {
      ctx.save();
      ctx.translate(x - h * 0.06, y - h * 0.38);
      ctx.fillStyle = '#f4c66d';
      ctx.font = `700 ${Math.max(11, h * 0.075)}px Silkscreen, ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SIFE TACOS', 0, 0);
      ctx.restore();
    }
    return;
  }
  if (era === 'table') {
    box(ctx, cam, STAND.i, STAND.j, 28, 18, 16, '#c9844a', '#a86b38', '#8d5a30');
    return;
  }
  if (era === 'tent') {
    box(ctx, cam, STAND.i, STAND.j, 34, 22, 18, '#e6d2a8', '#c4a574', '#b08f62');
    const [x, y] = cam.to(STAND.i, STAND.j);
    ctx.fillStyle = '#7a1f33';
    ctx.beginPath();
    ctx.moveTo(x, y - 70 * cam.s);
    ctx.lineTo(x - 40 * cam.s, y - 28 * cam.s);
    ctx.lineTo(x + 28 * cam.s, y - 28 * cam.s);
    ctx.fill();
    return;
  }
  if (era === 'truck') {
    box(ctx, cam, STAND.i, STAND.j, 46, 28, 36, '#f2efe6', '#d7d2c6', '#6e1630');
    return;
  }
  box(ctx, cam, STAND.i, STAND.j, 40, 26, 22, '#e7c98a', '#b5654a', '#6e1630');
  const [x, y] = cam.to(STAND.i, STAND.j);
  ctx.fillStyle = '#6e1630';
  ctx.fillRect(x - 36 * cam.s, y - 58 * cam.s, 74 * cam.s, 10 * cam.s);
  ctx.fillStyle = '#f4c66d';
  ctx.fillRect(x - 36 * cam.s, y - 54 * cam.s, 74 * cam.s, 3 * cam.s);
}

function drawOldMain(ctx, cam) {
  box(ctx, cam, OLD_MAIN.i, OLD_MAIN.j, 70, 36, 150, '#c9844a', '#e7d7bf', '#6e1630');
  box(ctx, cam, OLD_MAIN.i - 1.2, OLD_MAIN.j + 0.4, 18, 10, 90, '#d8c7ae', '#efe4d4', '#8d5a30');
}

function eraOf(view, opts) {
  const asked = opts.era || view?.standTier;
  if (asked === 'table' || asked === 'tent' || asked === 'stand' || asked === 'truck') return asked;
  // The engine's main-stand era picks the painted stand (folding table on day 1, then tent, counter, truck).
  const ERA = { folding: 'table', cart: 'table', table: 'table', tent: 'tent', stand: 'stand', counter: 'stand', row: 'truck', truck: 'truck', campus: 'truck' };
  const engineEra = ERA[view?.stands?.main?.era];
  if (engineEra) return engineEra;
  const locs = view?.manager?.locations || [];
  if (locs.some((l) => l.unlocked && l.id && l.id !== 'stallions')) return 'truck';
  return 'stand';
}

function ownedProps(view, opts) {
  const names = new Set(String(opts.upgrades || '').split(',').map((s) => s.trim()).filter(Boolean));
  const u = view?.manager?.upgrades || {};
  if (u.grill) names.add('grill');
  if (u.neon) names.add('neon');
  if (u.tipJar) names.add('tip');
  if (names.has('speakers')) names.add('speaker');
  if (names.has('table')) names.add('picnic');
  return names;
}

const COIN_POSE = [
  { rx: 1, ry: 0.72 },
  { rx: 0.66, ry: 0.72 },
  { rx: 0.28, ry: 0.72 },
  { rx: 0.08, ry: 0.78 },
  { rx: 0.34, ry: 0.72 },
  { rx: 0.78, ry: 0.72 },
];

function drawCoinPose(ctx, x, y, frame, s, alpha = 1) {
  const pose = COIN_POSE[(frame || 0) % 6];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = '#c9842a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7 * pose.rx * s, 7 * pose.ry * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4c66d';
  ctx.beginPath();
  ctx.ellipse(-0.5 * s, -0.3 * s, 5 * pose.rx * s, 5 * pose.ry * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpinCoin(ctx, pack, x, y, frame, s, alpha = 1) {
  const cell = pack?.coin?.[frame % 6];
  if (cell) {
    paint(ctx, cell, x, y, 18 * s, { alpha, shadow: false });
    return;
  }
  drawCoinPose(ctx, x, y, frame, s, alpha);
}

function drawVaultProp(ctx, cam, pack, vault, now) {
  const metal = vault?.metal;
  if (pack?.vault) {
    paint(ctx, pack.vault, ...cam.to(VAULT.i, VAULT.j), 52 * cam.s);
  } else {
    const gold = metal === 'gold';
    const silver = metal === 'silver';
    const top = gold ? '#e8c56a' : silver ? '#e4e8ee' : '#8d6a45';
    const left = gold ? '#b08a3c' : silver ? '#aeb6c0' : '#6b4a30';
    const right = gold ? '#7a5a28' : silver ? '#8e969e' : '#5a3e28';
    box(ctx, cam, VAULT.i, VAULT.j, 11, 8, 9, top, left, right);
  }
  if (metal === 'gold' || metal === 'silver') {
    const [x, y] = cam.to(VAULT.i, VAULT.j);
    const g = (Math.sin(now * 4.2) + 1) / 2;
    ctx.fillStyle = metal === 'gold'
      ? `rgba(255,236,170,${0.25 + g * 0.55})`
      : `rgba(255,255,255,${0.28 + g * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(x - 2 * cam.s, y - 12 * cam.s, (2 + g * 3) * cam.s, 1.4 * cam.s, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function challengerSprite(art, pack, id) {
  // customers-chatgpt-v3.png is not in this tree. Prefer that sheet if a loader
  // parked frames on art.customersV3, else the line sheet, else a walk frame.
  const v3 = art?.customersV3;
  if (v3?.length) return v3[Math.abs(id) % v3.length];
  if (art?.customers?.length) return art.customers[Math.abs(id) % art.customers.length];
  return studentSprite(pack?.students, 'walk', id, 1);
}

function bubbleText(kind) {
  if (kind === 'hungry') return 'hungry';
  if (kind === 'long') return 'long line';
  if (kind === 'best') return 'best taco';
  if (kind === 'angry') return 'ugh';
  return '';
}

export function drawIsoScene(ctx, env) {
  const { art, sim, cam, dw, dh, dpr, opts, S } = env;
  const view = opts.view || sim.view || null;
  if (!art._campus) art._campus = createCampus();
  const now = (typeof performance !== 'undefined' ? performance.now() : (S.t || 0) * 1000) / 1000;
  const marketing = !!view?.manager?.marketing && Object.entries(view.manager.marketing).some(([k, v]) => v === true && k !== 'spent' && k !== 'returned' && k !== 'today');
  stepCampus(art._campus, {
    t: now,
    view,
    phone: dw / Math.max(1, dpr) < 700,
    minutes: view?.clock?.minutes ?? 690,
    reputation: view?.manager?.reputation ?? 20,
    marketing,
    lineCount: Math.max(view?.live?.visualCrowd || 0, sim?.forcedLine || 0, (S?.bigRush?.active || view?.bigRush?.active) ? 55 : 0) || undefined,
    opts,
    events: sim?.S?.watchEvents || sim?.isoEvents,
  });
  const frame = art._campus.frame || { queue: [], ambient: [], items: [], crew: [] };
  const pack = art.iso || {};
  const phone = !!(opts.phone || dw < dh);
  const anim = watchAnimator();
  anim.configure({ phone });
  const fastForward = !!(opts.fastForward || view?.fastForward || view?.live?.fastForward || view?.live?.speed === 'skip' || view?.manager?.speed === 'skip');
  anim.step(undefined, {
    clock: now,
    hidden: typeof document !== 'undefined' && document.hidden,
    bigRush: !!(view?.bigRush?.active || S?.bigRush?.active),
    comboFlash: S?.comboFlash || 0,
    phone,
    fastForward,
    events: art._campus.events || [],
  });
  const wide = (sim?.forcedLine || 0) >= 50 || (view?.live?.visualCrowd || 0) >= 50 || !!(view?.bigRush?.active || S?.bigRush?.active);
  const zoom = Math.max(0.72, Math.min(2.5, (cam.zoom || 1) * (anim.rushZoom || 1) * (fastForward ? 0.93 : 1) * (wide ? 0.86 : phone ? 1 : 0.94)));
  const dockTop = (phone ? 144 : 112) * dpr;
  let fit = fitCamera(
    dw, dh, zoom,
    cam.panX || 0,
    cam.panY || 0,
    wide,
    opts.safe,
  );
  const bands = opts.keepClear || [];
  if (bands.length) {
    const bot = bands.filter((r) => r.edge === 'bottom').reduce((n, r) => Math.min(n, (r.top || 0) * dpr), dh);
    const [, standY] = fit.to(CREW.west.i, CREW.west.j);
    const limit = bot - Math.max(28, 64 * (dpr || 1));
    if (standY > limit) {
      const dy = standY - limit;
      const raw = fit;
      fit = { ...raw, to(i, j, z = 0) { const p = raw.to(i, j, z); return [p[0], p[1] - dy]; } };
    }
  }
  const sun = sunShift(view?.clock?.minutes ?? 690);
  const era = eraOf(view, opts);
  const owned = collectOwned(view, opts, sim?.S);
  const flags = propFlags(owned);
  flags.research = !!(view?.manager?.project && (view.manager.project.id || view.manager.project.daysDone > 0))
    || (view?.manager?.projects || []).some((row) => (row.level || 0) > 0 || (row.daysDone || 0) > 0);
  const showStall = stallShouldDraw(owned);
  const painted = !!pack.ground;
  paintedGround = painted;
  const shadow = painted ? 0 : 0.28;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (!painted) {
    ctx.fillStyle = '#1d4c86';
    ctx.fillRect(0, 0, dw, dh);
  }
  drawGround(ctx, fit, pack, dw, dh);
  if (!painted) drawOldMain(ctx, fit);

  const layers = [];
  const push = (i, j, draw, yBias = 0) => {
    const [x, y] = fit.to(i, j);
    layers.push({ y: y + yBias, draw });
  };

  const plaza = pack.plaza;
  const propH = (sprite) => plazaScreenHeight(sprite, fit.s);
  if (plaza?.boxes) {
    push(CRATE.i, CRATE.j, () => paint(ctx, plaza.boxes, ...fit.to(CRATE.i, CRATE.j), propH(plaza.boxes)), -6);
  } else if (!painted) {
    push(CRATE.i, CRATE.j, () => box(ctx, fit, CRATE.i, CRATE.j, 10, 8, 8, '#c4a574', '#8d5a30', '#6b4424'));
  } else if (pack.goods?.[4]) {
    push(CRATE.i, CRATE.j, () => paint(ctx, pack.goods[4], ...fit.to(CRATE.i, CRATE.j), propScreenHeight(pack.goods[4], PROP_TILES.cooler, fit.s)));
  }
  if (plaza?.cooler) {
    push(COOLER.i, COOLER.j, () => paint(ctx, plaza.cooler, ...fit.to(COOLER.i, COOLER.j), propH(plaza.cooler)), -6);
  } else if (!painted) {
    push(COOLER.i, COOLER.j, () => box(ctx, fit, COOLER.i, COOLER.j, 8, 6, 12, '#d7d2c6', '#9aa7b2', '#6e1630'));
  } else if (pack.goods?.[3]) {
    push(COOLER.i, COOLER.j, () => paint(ctx, pack.goods[3], ...fit.to(COOLER.i, COOLER.j), propScreenHeight(pack.goods[3], PROP_TILES.cooler, fit.s)));
  }
  push(STAND.i, STAND.j - 0.2, () => drawStand(ctx, fit, era, pack));

  if (!painted) {
    for (const lamp of LAMPS) {
      push(lamp.i, lamp.j, () => {
        const [x, y] = fit.to(lamp.i, lamp.j);
        ctx.fillStyle = '#3a2418';
        ctx.fillRect(x - 2, y - 28 * fit.s, 4, 28 * fit.s);
        const glow = sun.lamps ? 0.55 + Math.abs(Math.sin(now * 9 + lamp.i)) * 0.45 : 0.15;
        ctx.fillStyle = sun.lamps ? `rgba(244,198,109,${glow})` : '#5c4030';
        ctx.beginPath();
        ctx.arc(x, y - 30 * fit.s, 5 * fit.s, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  // iso-ground.png already paints the lamps lit, with shadows. iso-lamp.png
  // cannot swap those pixels, so a second post is not stacked on them.

  pushUpgradeLayers(ctx, {
    push, fit, pack, paint, flags, crewList: frame.crew?.length ? frame.crew : Object.entries(CREW).map(([id, pos]) => ({ id, ...pos })),
    now, art, showStall,
  });

  push(VAULT.i, VAULT.j, () => drawVaultProp(ctx, fit, pack, art._campus.vault, now), -6);

  if (!art._sig) art._sig = createSignatureState();
  const sig = stepSignatures(art._sig, {
    view,
    opts,
    events: S?.watchEvents || S?.signatureEvents || view?.events || art._campus?.events || [],
    clock: Number.isFinite(S?.t) ? S.t : null,
    now,
    reduced: !!(S?.reducedMotion || opts.reducedMotion),
    phone,
    queue: frame.queue || [],
    crew: frame.crew || [],
    items: frame.items || [],
  });
  if (!art._acts) art._acts = createActState();
  stepActs(art._acts, {
    view, opts,
    events: S?.watchEvents || S?.signatureEvents || view?.events || art._campus?.events || [],
    clock: Number.isFinite(S?.t) ? S.t : null,
    now, reduced: !!(S?.reducedMotion || opts.reducedMotion), phone, queue: frame.queue || [],
  });
  const crewList = (frame.crew?.length ? frame.crew : Object.entries(CREW).map(([id, pos]) => ({ id, ...pos }))).map((member) => actPlace(placeCrew(member, sig), art._acts));
  const antonio = crewList.find((member) => member.id === 'antonio');
  const antonioAway = !!(antonio && antonio.carry === 'laptop' && !pack.crew?.antonio?.work);
  const workHasDesk = !!(pack.crew?.antonio?.work && pack.antonioRigInWork !== false);
  // The work-frame pixels already include the desk and a monitor. Drawing
  // iso-rig.png as well stacks a second station. Anchor, if used, is the
  // bottom center of the whole rig bitmap.
  if (!workHasDesk && pack.rig) {
    push(RIG.i, RIG.j, () => paint(ctx, pack.rig, ...fit.to(RIG.i, RIG.j), propScreenHeight(pack.rig, PROP_TILES.rig, fit.s)));
  }
  const showTable = !!(plaza?.table && !pack.rig && !workHasDesk);
  if (plaza) {
    const lineCount = Math.max(view?.live?.visualCrowd || 0, sim?.forcedLine || 0, (S?.bigRush?.active || view?.bigRush?.active) ? 55 : 0) || 0;
    const dress = queueBarriers(queuePath(lineCount, view));
    for (const piece of dress.pieces) {
      const sprite = piece.kind === 'span' ? plaza.span : piece.kind === 'corner' ? plaza.corner : plaza.post;
      if (!sprite) continue;
      push(piece.i, piece.j, () => {
        paint(ctx, sprite, ...fit.to(piece.i, piece.j), propH(sprite), { flip: piece.flip });
      });
    }
    if (dress.sign) {
      push(dress.sign.i, dress.sign.j, () => {
        const [x, y] = fit.to(dress.sign.i, dress.sign.j);
        if (plaza.sign) paint(ctx, plaza.sign, x, y, propH(plaza.sign));
      });
    }
    if (plaza.trash) push(TRASH.i, TRASH.j, () => paint(ctx, plaza.trash, ...fit.to(TRASH.i, TRASH.j), propH(plaza.trash)));
    if (showTable) {
      push(RIG.i, RIG.j, () => paint(ctx, plaza.table, ...fit.to(RIG.i, RIG.j), propH(plaza.table)), -8);
    }
  }
  art._tagHeads = {};
  for (const member of crewList) {
    const who = member.id;
    const clone = who === 'aiAli';
    const spriteWho = clone ? 'ali' : who;
    const pose = pack.crew?.[spriteWho];
    const laptop = who === 'antonio' && member.carry === 'laptop' && !pose?.work;
    const away = member.hackyAway;
    const moving = away === 'walk' || (!clone && !away && (Math.hypot(member.di || 0, member.dj || 0) > 0.04 || member.carry === 'laptop' || member.carry === 'tortilla' || member.carry === 'meat'));
    const row = walkRow(member.di || 0, member.dj || (moving ? -0.2 : 0));
    const carryRow = member.carry === 'laptop' ? 2 : member.carry === 'meat' ? 1 : member.carry === 'tortilla' ? 0 : -1;
    const cycle = pose?.walk?.[row];
    const framed = walkFrame(cycle, now);
    const multi = Array.isArray(cycle) && cycle.length > 1;
    let sprite = pose?.idle;
    // Antonio's painted work cell faces the camera and includes the whole rig.
    // A rear-view cell keeps the facing crew-sheet sprite and still hides a
    // second desk. Walking off with the laptop uses carry/walk.
    const faceOn = pack.antonioFacesCamera !== false;
    if (away === 'walk') sprite = framed || pose?.idle || sprite;
    else if (away === 'kick') sprite = pose?.idle || sprite;
    else if (member.onMoped) sprite = framed || pose?.idle || sprite;
    else if (who === 'antonio' && laptop) sprite = framed || pose?.idle || sprite;
    else if (who === 'antonio' && !laptop) sprite = art.crew?.antonio?.action || art.crew?.antonio?.stand || sprite;
    else if (carryRow >= 0 && pose?.carry) sprite = pose.carry[carryRow] || framed || sprite;
    else if (moving && framed) sprite = framed;
    else if (!moving && pose?.work && (spriteWho === 'jared' || spriteWho === 'phillip' || spriteWho === 'ali' || spriteWho === 'matt')) sprite = pose.work;
    if (!sprite) sprite = art.crew?.[spriteWho]?.stand;
    if (clone) sprite = pose?.work || pose?.idle || art.crew?.ali?.stand || art.crew?.ali?.action || sprite;
    const sheet = art.crew?.[spriteWho];
    const workStrip = pose?.workStrip?.frames?.length ? pose.workStrip : (sheet?.workStrip?.frames?.length ? sheet.workStrip : null);
    const propArc = who === 'matt' ? handoffArc(S?.props) : null;
    const liveArc = who === 'matt' ? (anim.arcsLive?.() || [])[0] : null;
    const arc = propArc || (liveArc ? { t: liveArc.u, dur: 1 } : null);
    const played = (!clone && !away && !member.onMoped && !moving && workStrip?.frames?.length) ? workPose(spriteWho, anim.time, {
      duty: who === 'antonio' ? 'seated' : 'work',
      arc,
      phase: (who.length || 1) * 0.17,
    }) : null;
    const motion = anim.crewPose(spriteWho, {
      working: played ? played.mode === 'work' : (who === 'antonio' || who === 'west' || who === 'aaron' || (!moving && (spriteWho === 'jared' || spriteWho === 'phillip' || spriteWho === 'ali' || spriteWho === 'matt'))),
      idle: sheet?.stand || sprite,
      work: sheet?.action || pose?.work || sprite,
      idleStrip: sheet?.idleStrip,
      workStrip,
      forceIndex: played?.mode === 'work' ? played.index : undefined,
      phase: (who?.length || 1) * 0.41,
    });
    // Iso cells stay until the registered chatgpt strip is on the pack.
    // Iso crew sheets are a different paint. The world cast is the action sheet.
    if (!clone && !member.onMoped && !workStrip && sheet?.stand && sheet?.action) {
      sprite = who === 'antonio' ? sheet.action : (motion.frame || sheet.stand);
    }
    let loopFrame = null;
    if (played?.mode === 'work') {
      loopFrame = workStrip.frames[played.index];
      if (loopFrame) sprite = loopFrame;
    } else if (played?.mode === 'idle') {
      sprite = sheet?.stand || pose?.idle || sprite;
    }
    const seated = who === 'antonio' && !!(pose?.loop?.[2] || workStrip);
    const phase = now * 6 + (who?.length || 1);
    const bob = loopFrame ? 0 : motion.bob * Math.max(1, fit.s * 0.85);
    const step = moving && !multi ? Math.round(Math.sin(phase) * 2.2 * fit.s) : 0;
    const atRig = who === 'antonio' && !laptop;
    const base = atRig ? { i: RIG.i + 0.55, j: RIG.j - 0.22 } : member;
    const shown = crewShown({ ...member, i: base.i, j: base.j }, art._campus.vault, now);
    push(shown.i, shown.j, () => {
      const [x, y] = fit.to(shown.i, shown.j);
      const bodyH = (loopFrame?.bodyH ? CREW_H * (loopFrame.h / loopFrame.bodyH) : (atRig && workHasDesk ? CREW_H * 1.35 : CREW_H)) * fit.s;
      if (clone) {
        drawContactShadow(ctx, x, y, bodyH * 0.42, { ground: painted });
        paintAliClone(ctx, sprite, x, y, bodyH, {
          bob,
          reveal: member.reveal ?? 1,
          glitch: !!member.glitch,
          hard: !!member.hard,
          nod: member.nod || 0,
          laugh: !!member.laugh,
          holdBag: !!member.holdBag,
        });
      } else {
        if (member.onMoped) drawActMoped(ctx, x, y, fit.s, pack, paint);
        const poseSquash = shown.squash || 1;
        const squash = (motion.squash || 1) * poseSquash;
        const counterCrew = who === 'jared' || who === 'phillip' || who === 'ali' || who === 'matt';
        const lift = loopFrame ? 0 : (counterCrew ? bodyH * 0.28 : 0);
        paint(ctx, sprite, x, y - lift, bodyH, { bob, step, squash, stretch: motion.stretch || 1, lean: loopFrame ? 0 : (motion.lean || 0) });
        (art._tagHeads ||= {})[who] = headOf(sprite, x, y - lift, bodyH, { bob, squash, stretch: motion.stretch || 1 });
        if (loopFrame?.sparks?.length && played?.local != null && played.local < 0.75) {
          drawSparks(ctx, loopFrame.sparks, x, y - lift, bodyH / (loopFrame.h || 1), 0.8 * (1 - played.local));
        }
        if (who === 'jared' && shown.kind === 'facepalm' && shown.env > 0.08) {
          ctx.fillStyle = '#f0c7a6';
          ctx.beginPath();
          ctx.ellipse(x, y - bodyH * 0.72, 7 * fit.s * shown.env, 5 * fit.s * shown.env, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (who === 'west' && member.squint) {
        const brow = y - bodyH * 0.72;
        ctx.strokeStyle = '#2a1c18';
        ctx.lineWidth = Math.max(1, fit.s);
        ctx.beginPath();
        ctx.moveTo(x - 7 * fit.s, brow);
        ctx.lineTo(x - 2 * fit.s, brow + 2 * fit.s);
        ctx.moveTo(x + 2 * fit.s, brow + 2 * fit.s);
        ctx.lineTo(x + 7 * fit.s, brow);
        ctx.stroke();
      }
      if (member.carry === 'taco' && pack.goods?.[5]) paint(ctx, pack.goods[5], x + 12 * fit.s, y - 34 * fit.s, 22 * fit.s);
      else if (member.carry && carryRow < 0) {
        ctx.fillStyle = '#f6e6be';
        ctx.fillRect(x + 8 * fit.s, y - 40 * fit.s, 12 * fit.s, 8 * fit.s);
      }
    });
  }

  const ai = frame.aiAli;
  if (ai?.smoke) {
    push(CREW.ali.i, CREW.ali.j, () => {
      const [x, y] = fit.to(CREW.ali.i, CREW.ali.j);
      const puff = (now * 1.3) % 1;
      ctx.globalAlpha = 0.38 * (1 - puff);
      ctx.fillStyle = '#d7d0c8';
      ctx.beginPath();
      ctx.arc(x + 8 * fit.s, y - 42 * fit.s - puff * 18 * fit.s, (3.5 + puff * 3) * fit.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }
  for (const heart of ai?.hearts || []) {
    const k = Math.max(0, Math.min(1, (now - heart.t) / 1.3));
    push(CREW.west.i + 0.15, CREW.west.j, () => {
      const [x, y] = fit.to(CREW.west.i, CREW.west.j);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#e05878';
      const hx = x - 10 * fit.s + (heart.n % 3) * 5 * fit.s;
      const hy = y - CREW_H * fit.s * 0.62 - k * 22 * fit.s;
      ctx.beginPath();
      ctx.arc(hx - 2 * fit.s, hy, 2.2 * fit.s, 0, Math.PI * 2);
      ctx.arc(hx + 2 * fit.s, hy, 2.2 * fit.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  const queue = frame.queue || [];
  const route = queuePath(Math.max(queue.length, view?.live?.visualCrowd || 0, sim?.forcedLine || 0), view);
  const walkStrips = art.customerWalk || art.customerWalks;
  // Waiting-for-pickup and handed-off customers already carry their own spots; only the rope is laid out.
  const offRope = (person) => person.state === 'waiting' || (person.state === 'handoff' && person.walking);
  const roped = queue.filter((person) => !offRope(person));
  const ropeSpots = anim.placeLine(roped, route, {
    head: 'end',
    exit: EXIT,
    walkStrips,
    walkIndex: (person, n) => {
      const v3 = art.customersV3?.length || walkStrips?.length || 16;
      const pool = art.customers?.length || v3;
      return Math.abs(person?.id ?? n) % pool % v3;
    },
  });
  const lineSpots = queue.map((person) => (offRope(person)
    ? { i: person.i, j: person.j, walking: !!person.walking, flip: person.walking ? false : (person.face ?? 1) < 0, bob: 0, frameHint: person.state === 'handoff' ? 'cheer' : 'idle' }
    : ropeSpots[roped.indexOf(person)]));
  queue.forEach((person, index) => {
    if (person.kind) return;
    const placed = lineSpots[index] || person;
    const nudged = nudgeOffCrew(placed);
    const spot = { ...placed, i: nudged.i, j: nudged.j };
    const walked = spot.pose === 'walk' || spot.pose === 'leave';
    const custIndex = art.customers?.length ? Math.abs(person.id || index) % art.customers.length : index;
    const hinted = walked
      ? { id: person.id, state: 'queue', mood: 'wait' }
      : person.state === 'walkout' || person.mood === 'angry'
        ? person
        : spot.frameHint === 'cheer'
          ? { ...person, state: person.state || 'handoff' }
          : spot.frameHint === 'impatient'
            ? { ...person, mood: person.mood === 'happy' ? person.mood : 'impatient' }
            : person;
    let sprite = walked && spot.frame ? spot.frame : customerSpriteAt(art, custIndex, { ...hinted, walking: !!spot.walking });
    if (!walked && spot.frameHint === 'impatient' && art.reactions?.impatient?.length) sprite = frameAt(art.reactions.impatient, anim.time + index, 6) || sprite;
    else if (!walked && spot.frameHint === 'cheer' && art.reactions?.cheer?.length) sprite = frameAt(art.reactions.cheer, anim.time + index, 8) || sprite;
    const moving = !!spot.walking || person.state === 'walkout' || person.state === 'leaving';
    const phase = now * 7 + index;
    const cheer = !walked && (lineCheer(flags, person, moving) || spot.frameHint === 'cheer');
    const look = customerLook(sig, person, index);
    const act = actLook(art._acts, person, index);
    look.bob += act.bob;
    push(spot.i, spot.j, () => {
      const [x, y] = fit.to(spot.i, spot.j);
      if (opts.overlay === 'happy') ctx.globalAlpha = 0.9;
      const bob = walked
        ? (spot.bob || 0) * dpr
        : ((spot.bob || 0) + look.bob + (cheer ? Math.abs(Math.sin(phase * 1.4)) * -4 : 0)) * Math.max(1, fit.s * 0.85);
      paint(ctx, sprite, x, y, LINE_H * fit.s, {
        bob,
        squash: walked ? 1 : (spot.squash || 1) * look.squash,
        stretch: walked ? 1 : (spot.stretch || 1),
        lean: walked ? 0 : (spot.lean || 0),
        sway: walked ? (spot.sway || 0) * dpr : 0,
        flip: !!spot.flip,
        step: walked ? Math.round(((spot.lag || 0) - (spot.sway || 0)) * dpr) : (spot.walking ? Math.round(Math.sin(phase) * 2 * fit.s) : 0),
        crisp: !!walked,
        alpha: 0.96,
      });
      if (spot.hold === 'taco' && pack.goods?.[5]) paint(ctx, pack.goods[5], x + 8 * fit.s, y - 26 * fit.s, 16 * fit.s, { bob: Math.abs(Math.sin(phase)) * -2 });
      if (look.shades) drawShades(ctx, x, y, LINE_H * fit.s);
      if (cheer) drawCheerArms(ctx, x, y, fit.s);
      if (opts.overlay === 'wait') {
        ctx.fillStyle = person.patience < 0.35 ? '#c23b48' : person.patience < 0.6 ? '#e6c98a' : '#6e8b4b';
        ctx.fillRect(x - 8, y + 4, 16 * person.patience, 3);
      }
      ctx.globalAlpha = 1;
    });
  });

  const students = pack.students;
  for (const person of frame.ambient || []) {
    if (inClear(person.i, person.j, 0.45)) continue;
    const sheet = students ? { ...students, lifeSit: pack.lifeSit } : { lifeSit: pack.lifeSit };
    const picked = ambientSprite(sheet, person, now);
    const motion = ambientMotion(person, now, { shuffle: picked.shuffle });
    const sprite = picked.sprite || (art.customers?.length ? art.customers[Math.abs(person.id || 0) % art.customers.length] : null);
    const px = Math.max(1, dpr || 1);
    push(person.i, person.j, () => {
      const [x, y] = fit.to(person.i, person.j);
      paintAmbientStudent(ctx, sprite, x, y, AMB_H * fit.s * (person.kind === 'bike' ? 1.05 : 1), motion, picked, px);
      ctx.globalAlpha = 1;
    }, -14 * fit.s);
  }

  const stationPair = {
    grill: [CREW.ali, CREW.phillip],
    tortilla: [CRATE, CREW.phillip],
    assemble: [CREW.phillip, CREW.matt],
    wrap: [CREW.matt, WINDOW],
    handoff: [CREW.matt, WINDOW],
    register: [CREW.jared, CREW.phillip],
    trash: [CREW.phillip, CRATE],
  };
  let grilling = false;
  for (const item of frame.items || []) {
    if (item.station === 'grill') grilling = true;
    const pair = item.station === 'wrap' && item.to ? [CREW.matt, item.to] : (stationPair[item.station] || [CREW.jared, CREW.jared]);
    const arc = arcPoint({ x: pair[0].i, y: pair[0].j }, { x: pair[1].i, y: pair[1].j }, item.progress || 0, 0);
    const lift = Math.sin(arc.u * Math.PI) * 22;
    push(arc.x, arc.y, () => {
      const [x, y] = fit.to(arc.x, arc.y, lift);
      const rise = 0;
      const goodAt = item.station === 'handoff' || item.station === 'wrap' ? 5
        : item.station === 'assemble' ? 1
        : item.station === 'tortilla' ? ((item.progress || 0) < 0.45 ? 0 : 1)
        : item.station === 'grill' ? 2
        : null;
      const good = goodAt == null || item.station === 'trash' ? null : pack.goods?.[goodAt];
      if (good) paint(ctx, good, x, y - 36 * fit.s - rise, 20 * fit.s);
      else {
        ctx.fillStyle = item.station === 'grill' ? '#e07a3d' : item.station === 'trash' ? '#8d8d93' : '#f6e6be';
        ctx.fillRect(x - 6 * fit.s, y - 36 * fit.s - rise, 12 * fit.s, 7 * fit.s);
      }
      if (item.station === 'grill') {
        ctx.fillStyle = `rgba(255,180,60,${0.3 + Math.sin(now * 14) * 0.2})`;
        ctx.fillRect(x - 2, y - 46 * fit.s - rise, 3, 6);
      }
    });
  }

  anim.grill(grilling);
  for (const coin of art._campus.coins || []) {
    const k = easeOutCubic(Math.max(0, Math.min(1, (now - coin.t) / 0.9)));
    push(coin.i, coin.j, () => {
      const [x, y] = fit.to(coin.i, coin.j);
      ctx.globalAlpha = 1 - k;
      const pay = coin.kind === 'card' ? pack.goods?.[7] : pack.goods?.[6];
      if (pay) paint(ctx, pay, x + 10, y - 30 * fit.s - k * 28, 16 * fit.s, { alpha: 1 - k });
      else {
        ctx.fillStyle = '#f4c66d';
        ctx.beginPath();
        ctx.arc(x + 10, y - 30 * fit.s - k * 28, 4 * fit.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  const challenger = challengerAt(art._campus.vault?.challenger, now);
  if (challenger) {
    const sprite = challengerSprite(art, pack, challenger.id);
    const phase = now * 7 + (challenger.id || 0);
    push(challenger.i, challenger.j, () => {
      const [x, y] = fit.to(challenger.i, challenger.j);
      paint(ctx, sprite, x, y, LINE_H * fit.s, {
        bob: (challenger.moving ? Math.abs(Math.sin(phase)) * -4 : Math.sin(phase * 0.4)) * fit.s,
        squash: challenger.moving ? 1 - Math.abs(Math.sin(phase)) * 0.05 : 1,
      });
    });
  }

  const flip = art._campus.vault?.flip;
  if (flip && now >= flip.t && now < flip.until) {
    const arc = coinWorld(coinArcPoint((now - flip.t) / (flip.until - flip.t || 1)));
    push(arc.i, arc.j, () => {
      const [x, y] = fit.to(arc.i, arc.j, arc.z);
      drawSpinCoin(ctx, pack, x, y, arc.frame, fit.s);
    });
  }
  for (const payout of art._campus.vault?.payout || []) {
    for (const coin of payoutSprites(payout, now)) {
      push(coin.i, coin.j, () => {
        const [x, y] = fit.to(coin.i, coin.j, coin.z);
        drawSpinCoin(ctx, pack, x, y, coin.frame, fit.s * 0.85);
      });
    }
  }
  const reaction = art._campus.vault?.reaction;
  if (reaction && now >= reaction.t && now < reaction.until) {
    const env = Math.sin(Math.PI * ((now - reaction.t) / (reaction.until - reaction.t || 1)));
    const at = reaction.kind === 'cheer' ? CREW.jared : watchFocus(art._campus.vault, now);
    push(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      ctx.globalAlpha = Math.max(0, env);
      ctx.fillStyle = reaction.kind === 'cheer' ? '#f4c66d' : '#d7c4cf';
      ctx.font = `${Math.max(11, 13 * fit.s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(reaction.kind === 'cheer' ? 'yeah!' : 'aww', x, y - CREW_H * fit.s - 8);
      ctx.globalAlpha = 1;
    });
  }

  for (const leaf of art._campus.leaves || []) {
    if (inClear(leaf.i, leaf.j)) continue;
    const paintedLeaf = lifeFrame(pack.life, 'leaves', now, leaf.ph || 0);
    push(leaf.i, leaf.j, () => {
      const [x, y] = fit.to(leaf.i, leaf.j);
      if (paintedLeaf) {
        paint(ctx, paintedLeaf, x, y, 16 * fit.s, { shadow: false, alpha: 0.9 });
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(now + leaf.ph) * 0.6);
      ctx.fillStyle = 'rgba(196,122,48,0.85)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4 * fit.s, 2 * fit.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  const disc = (Math.sin(now * 1.4) + 1) / 2;
  const fi = FRISBEE[0].i + (FRISBEE[1].i - FRISBEE[0].i) * disc;
  const fj = FRISBEE[0].j + (FRISBEE[1].j - FRISBEE[0].j) * disc;
  const paintedDisc = lifeFrame(pack.life, 'frisbee', now, 0);
  push(fi, fj, () => {
    const [x, y] = fit.to(fi, fj, 18 + Math.sin(now * 2.8) * 10);
    if (paintedDisc) {
      paint(ctx, paintedDisc, x, y, 14 * fit.s, { shadow: false });
      return;
    }
    ctx.fillStyle = '#f4c66d';
    ctx.beginPath();
    ctx.ellipse(x, y, 7 * fit.s, 2.4 * fit.s, now * 3, 0, Math.PI * 2);
    ctx.fill();
  });

  if (opts.overlay === 'heat') {
    for (const person of frame.ambient || []) {
      const [x, y] = fit.to(person.i, person.j);
      ctx.fillStyle = 'rgba(224,102,88,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, y, 18 * fit.s, 8 * fit.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  pushActs(ctx, { state: art._acts, fit, pack, push, paint });
  pushSignatureScene(ctx, {
    state: sig, fit, pack, push, paint, students: pack.students, customers: art.customers,
    queue: frame.queue || [],
  });

  layers.sort((a, b) => a.y - b.y);
  for (const layer of layers) layer.draw();
  if (opts.overlay === 'flow') {
    // Crowd flow: warm heat under everyone on the Quad, chevrons showing the rope and exit direction.
    const chevrons = (path, color) => {
      for (let n = 0; n < path.length - 1; n++) {
        const a = path[n], b = path[n + 1], steps = Math.max(1, Math.round(Math.hypot(b.i - a.i, b.j - a.j) / 1.4));
        for (let k = 0; k < steps; k++) {
          const u = (k + ((now * 0.8) % 1)) / steps, i = a.i + (b.i - a.i) * u, j = a.j + (b.j - a.j) * u;
          const [x, y] = fit.to(i, j), [x2, y2] = fit.to(b.i, b.j), ang = Math.atan2(y2 - y, x2 - x);
          const sz = Math.max(1.6 * dpr, 2.2 * fit.s);
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(30,20,24,0.75)'; ctx.lineWidth = 6 * sz / 1.6; ctx.beginPath(); ctx.moveTo(-6 * sz, -6 * sz); ctx.lineTo(4 * sz, 0); ctx.lineTo(-6 * sz, 6 * sz); ctx.stroke();
          ctx.strokeStyle = color; ctx.lineWidth = 3.4 * sz / 1.6; ctx.stroke(); ctx.restore();
        }
      }
    };
    for (const person of [...(frame.ambient || []), ...(frame.queue || [])]) {
      const [x, y] = fit.to(person.i, person.j);
      const heat = ctx.createRadialGradient(x, y, 0, x, y, 34 * fit.s);
      heat.addColorStop(0, 'rgba(232,96,72,0.45)'); heat.addColorStop(1, 'rgba(232,96,72,0)');
      ctx.fillStyle = heat;
      ctx.beginPath(); ctx.ellipse(x, y, 34 * fit.s, 15 * fit.s, 0, 0, Math.PI * 2); ctx.fill();
    }
    chevrons(queuePath(frame.queue?.length || 0, view), 'rgba(244,198,109,0.9)');
    chevrons(EXIT, 'rgba(126,200,160,0.9)');
  }
  if (opts.overlay === 'happy') {
    // Mood: a dot over every customer, green happy / gold waiting / red about to walk.
    for (const person of frame.queue || []) {
      const [x, y] = fit.to(person.i, person.j);
      const p = person.state === 'handoff' ? 1 : person.patience ?? 0.6;
      ctx.fillStyle = person.state === 'walkout' || p < 0.3 ? '#d4483e' : p < 0.6 ? '#f0c24b' : '#5fbf6a';
      ctx.beginPath(); ctx.arc(x, y - LINE_H * fit.s - 8 * dpr, Math.max(5 * dpr, 6 * fit.s), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,24,0.8)'; ctx.lineWidth = dpr; ctx.stroke();
    }
  }
  paintSignatureOverlay(ctx, fit, sig);
  drawUpgradeOverlay(ctx, {
    fit, flags, crewList: frame.crew?.length ? frame.crew : Object.entries(CREW).map(([id, pos]) => ({ id, ...pos })),
    now, art, owned,
  });
  art._lineN = (frame.queue || []).filter((person) => person.state !== 'walkout').length;

  for (const bird of art._campus.birds || []) {
    const [x, y] = fit.to(bird.i, bird.j, 90);
    const paintedBird = lifeFrame(pack.life, 'birds', now, bird.i || 0);
    if (paintedBird) {
      paint(ctx, paintedBird, x, y, 22 * fit.s, { shadow: false });
      continue;
    }
    const flap = Math.sin(now * 10 + bird.i) * 4 * fit.s;
    ctx.strokeStyle = '#1c2430';
    ctx.lineWidth = Math.max(1, fit.s);
    ctx.beginPath();
    ctx.moveTo(x - 7 * fit.s, y);
    ctx.quadraticCurveTo(x - 3 * fit.s, y - 5 * fit.s - flap, x, y);
    ctx.quadraticCurveTo(x + 3 * fit.s, y - 5 * fit.s + flap, x + 7 * fit.s, y);
    ctx.stroke();
  }

  const hits = [];
  const note = (person, label) => {
    const kind = bubbleFor(person, queue.length);
    if (!kind && person.kind !== 'crew') return;
    const pulse = Math.sin(now * 0.9 + (Number(person.id) || 0) * 1.7) > 0.35;
    const show = kind && (person.state === 'paying' || person.state === 'walkout' || person.state === 'handoff' || person.mood === 'impatient' || person.kind === 'gawk' || (person.state === 'waiting' && pulse));
    const [x, y] = fit.to(person.i, person.j);
    if (show) {
      const bubbleKind = person.state === 'handoff' ? 'taco' : person.kind === 'gawk' ? 'question' : kind;
      const bubble = pack.bubbles?.[{ hungry: 0, long: 1, best: 2, angry: 3, taco: 4, question: 5 }[bubbleKind]];
      if (bubble) paint(ctx, bubble, x, y - CREW_H * fit.s - 6, 40 * fit.s);
      else {
        ctx.fillStyle = 'rgba(255,248,236,0.92)';
        ctx.fillRect(x - 28, y - CREW_H * fit.s - 16, 56, 14);
        ctx.fillStyle = '#3a2418';
        ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(bubbleText(kind), x, y - CREW_H * fit.s - 5);
      }
    }
    hits.push({
      id: person.id, name: label, mood: person.mood || person.state || '', order: person.order || person.carry || '',
      x: (x - 20) / dpr, y: (y - CREW_H * fit.s) / dpr, w: 40 / dpr, h: (CREW_H * fit.s) / dpr,
    });
  };
  for (const member of crewList) note({ ...member, kind: 'crew', state: member.carry ? 'work' : 'idle' }, member.id);
  for (const person of queue) note(person, 'student');
  art._isoHits = hits;

  const inspect = art._isoInspect;
  if (inspect) {
    const who = String(inspect.id || inspect.name || '').toLowerCase();
    const known = PORTRAIT_NAMES.includes(who);
    const hot = portraitHotFromActor(inspect, { overlay: opts.overlay, mood: inspect.mood, inspect: true });
    const face = 36 * dpr;
    ctx.fillStyle = 'rgba(43,12,24,0.92)';
    const cardX = dw - (known ? 228 : 196) * dpr;
    const cardY = (opts.phone ? 150 : 118) * dpr;
    ctx.fillRect(cardX, cardY, (known ? 212 : 180) * dpr, 52 * dpr);
    if (known) paintCrewPortrait(ctx, who, cardX + 6 * dpr, cardY + 8 * dpr, face, hot);
    ctx.fillStyle = '#f6e7c8';
    ctx.textAlign = 'left';
    ctx.font = `${12 * dpr}px sans-serif`;
    const textX = cardX + (known ? face + 12 * dpr : 8 * dpr);
    ctx.fillText(`${inspect.name || 'student'} · ${inspect.mood || 'here'}`, textX, cardY + 20 * dpr);
    ctx.fillText(inspect.order ? `order: ${inspect.order}` : 'no order', textX, cardY + 38 * dpr);
  }

  // Overlays are chosen from the HUD (Flow / Wait / Mood); the scene keeps only the zoom toggle.
  const buttons = [
    ['zoom', zoom > 1.4 ? 'Quad' : 'Close'],
  ];
  art._isoUi = [];
  buttons.forEach((btn, n) => {
    const x = 8 * dpr + n * 58 * dpr;
    const y = (opts.phone ? 150 : 118) * dpr;
    ctx.fillStyle = opts.overlay === btn[0] ? '#f4c66d' : 'rgba(43,12,24,0.8)';
    ctx.fillRect(x, y, 54 * dpr, 22 * dpr);
    ctx.fillStyle = '#f6e7c8';
    ctx.font = `${11 * dpr}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(btn[1], x + 27 * dpr, y + 15 * dpr);
    art._isoUi.push({ id: btn[0], x: x / dpr, y: y / dpr, w: 54, h: 22 });
  });

  const names = ['JARED', 'PHILLIP', 'ALI', 'MATT', 'AARON', 'ANTONIO', 'MRS. WEST'];
  const tagAlpha = typeof opts.tagAlpha === 'function' ? opts.tagAlpha() : 0;
  ctx.textAlign = 'center';
  // Phone tags are a size smaller so seven of them fit around one counter without sliding off their owners.
  ctx.font = `600 ${Math.max(10, (phone ? 10 : 12) * dpr)}px sans-serif`;
  const tagSlots = [];
  if (tagAlpha > 0.2) {
  const dockTopPx = (opts.keepClear || []).filter((r) => r.edge === 'top').reduce((n, r) => Math.max(n, (r.bottom || 0) * dpr), (phone ? 144 : 112) * dpr) + 4 * dpr;
  const dockBotPx = (opts.keepClear || []).filter((r) => r.edge === 'bottom').reduce((n, r) => Math.min(n, (r.top || dh / Math.max(1, dpr)) * dpr), dh - (phone ? dh * 0.24 : dh * 0.18)) - 4 * dpr;
  crewList.forEach((member) => {
    const anchor = member.id === 'antonio' ? { i: RIG.i + 0.55, j: RIG.j - 0.22 } : member;
    let [x, y] = fit.to(anchor.i, anchor.j);
    const head = art._tagHeads?.[member.id];
    const label = member.id === 'aiAli' ? 'AI ALI' : (names[Object.keys(CREW).indexOf(member.id)] || member.id);
    const portraitId = member.id === 'aiAli' ? 'ali' : member.id;
    const moving = Math.hypot(member.di || 0, member.dj || 0) > 0.04;
    const stationed = !moving && ['jared', 'phillip', 'ali', 'matt'].includes(member.id);
    const hot = portraitHotFromActor({
      ...member,
      task: member.carry ? 'running' : stationed ? 'grilling' : member.task,
    }, { overlay: opts.overlay });
    const face = (phone ? 13 : 16) * dpr;
    const text = String(label).toUpperCase();
    const cardW = Math.ceil(ctx.measureText(text).width + face + 12 * dpr);
    const cardH = face + 4 * dpr;
    x = Math.max(cardW / 2 + 2, Math.min(dw - cardW / 2 - 2, x));
    // Sit the tag just above the painted head that was actually drawn this frame.
    if (head) x = Math.max(cardW / 2 + 2, Math.min(dw - cardW / 2 - 2, head.x));
    const lift = head ? 0 : ({ phillip: 26, matt: 28, west: 18, aaron: 10, aiAli: 32 }[member.id] || 0);
    let top = head ? head.top - cardH - 3 * dpr : y - CREW_H * fit.s - cardH - 2 * dpr - lift;
    top = Math.max(dockTopPx, Math.min(dockBotPx - cardH, top));
    const hits = (px, py) => tagSlots.some((q) => Math.abs(q.x - px) < (q.w + cardW) / 2 - 4 * dpr && Math.abs(q.top - py) < cardH * 0.85);
    if (hits(x, top)) {
      const down = Math.min(dockBotPx - cardH, top + cardH + 6 * dpr);
      const up = Math.max(dockTopPx, top - cardH - 6 * dpr);
      const right = Math.min(dw - cardW / 2 - 2, x + cardW * 0.55);
      const left = Math.max(cardW / 2 + 2, x - cardW * 0.55);
      // Stack upward first so the tag stays over its own head; slide sideways only as a last resort.
      const up2 = Math.max(dockTopPx, top - 2 * (cardH + 6 * dpr));
      if (member.id === 'west' && !hits(x, down)) top = down;
      else if (!hits(x, up)) top = up;
      else if (!hits(x, up2)) top = up2;
      else if (!hits(right, top)) x = right;
      else if (!hits(left, top)) x = left;
      else if (!hits(x, down)) top = down;
    }
    tagSlots.push({ x, top, w: cardW });
    ctx.fillStyle = 'rgba(30,22,24,0.7)';
    ctx.fillRect(x - cardW / 2, top, cardW, cardH);
    paintCrewPortrait(ctx, portraitId, x - cardW / 2 + dpr, top + dpr, face, hot);
    ctx.fillStyle = '#f6e7c8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x - cardW / 2 + face + 4 * dpr, top + cardH / 2);
  });
  }
  const [jx, jy] = fit.to(CREW.jared.i, CREW.jared.j);
  const [gx, gy] = fit.to(CREW.ali.i, CREW.ali.j);
  const [mx, my] = fit.to(CREW.matt.i, CREW.matt.j);
  const [tx, ty] = fit.to(UPGRADES.tip.i, UPGRADES.tip.j);
  const [standX, standY] = fit.to(STAND.i, STAND.j);
  const bird = anim.gracklePose();
  const gi = 4.2 + bird.u * 2.4;
  const gj = 16.6;
  if (!inClear(gi, gj)) {
    const [x, y] = fit.to(gi, gj, bird.hop);
    ctx.fillStyle = '#1c2430';
    ctx.beginPath();
    ctx.ellipse(x, y - 3 * fit.s, 4.5 * fit.s, 2.4 * fit.s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (bird.peck) {
      ctx.fillStyle = '#f4c66d';
      ctx.fillRect(x + (bird.flip ? -6 : 3) * fit.s, y - 4 * fit.s, 2 * fit.s, 1.5 * fit.s);
    }
  }
  const head = lineSpots.find((spot) => spot) || null;
  if (head) {
    const [hx, hy] = fit.to(head.i, head.j);
    anim.toss({ x: mx, y: my - 28 * fit.s }, { x: hx, y: hy - 22 * fit.s });
  }
  for (const arc of anim.arcsLive()) {
    const p = arcPoint(arc.from, arc.to, arc.u, 26);
    if (pack.goods?.[5]) paint(ctx, pack.goods[5], p.x, p.y, 18 * fit.s);
  }
  anim.present(ctx, {
    jared: { x: jx, y: jy },
    grill: { x: gx, y: gy },
    jar: { x: tx, y: ty },
    stand: { x: standX, y: standY - 36 * fit.s },
    viewportWidth: dw,
  });
  ctx.restore();
}
