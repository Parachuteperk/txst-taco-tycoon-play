// Per-frame compose. When the painted plate is loaded, the art layer replaces the
// procedural world; the sim, name tags and HUD stay on the same interface.
import { makeCanvas } from './util.js';
import { frame, FY, AX, FW, FH } from './chars.js';
import { ST } from './stand.js';
import { SH_DIR, SHADOW } from './world.js';
import { drawArtScene } from './art.js';
import { drawIsoScene } from './iso/draw.js';

const glowCache = new Map();
function glow(r, color, a) {
  const k = `${r}|${color}|${a}`;
  if (glowCache.has(k)) return glowCache.get(k);
  const c = makeCanvas(r * 2, r * 2), g = c.getContext('2d');
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  const [R, G, B] = [1, 3, 5].map((n) => parseInt(color.slice(n, n + 2), 16));
  gr.addColorStop(0, `rgba(${R},${G},${B},${a})`); gr.addColorStop(0.45, `rgba(${R},${G},${B},${a * 0.45})`); gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
  glowCache.set(k, c);
  return c;
}
const cloudBlob = (() => {
  const c = makeCanvas(300, 120), g = c.getContext('2d');
  g.translate(150, 60); g.scale(1, 0.4);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 150);
  gr.addColorStop(0, 'rgba(74,63,107,1)'); gr.addColorStop(0.6, 'rgba(74,63,107,0.7)'); gr.addColorStop(1, 'rgba(74,63,107,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 150, 0, Math.PI * 2); g.fill();
  return c;
})();

export function createRenderer(world, sim, art = null) {
  const src = makeCanvas(8, 8), sctx = src.getContext('2d');
  const dyn = makeCanvas(8, 8), dctx = dyn.getContext('2d');
  const { S, crew } = sim;
  const P = sim.P;
  const stageLights = Array.from({ length: 9 }, (_, n) => P(0.2 + n * 0.7, ST.awnJ + 0.02, ST.awnFront - ST.valance - 2 - Math.sin(n / 8 * Math.PI) * 3));
  const counter = world.statics.find((s) => s.counter);
  const backPieceKey = P(0, ST.back)[1] - 1;
  const motes = Array.from({ length: 8 }, (_, k) => ({ x: Math.random(), y: Math.random(), s: 2 + Math.random() * 2, ph: Math.random() * 6 }));
  const debug = { on: false, hits: 0, frames: 0 };
  let drape = null;

  function pose(a, t) {
    const ph = a.phase || 0;
    const p = { view: a.view, expr: a.expr || 'neutral', blink: a.blink > 0, hold: a.hold || '' };
    const walk = (fps) => { p.walk = Math.floor((t + ph) * fps) % 6; p.arms = p.walk % 3 === 0 ? 'down' : p.walk < 3 ? 'swing0' : 'swing1'; p.tail = p.walk % 2; };
    const breathe = () => { p.bob = Math.floor((t + ph) * 1.4) % 2 ? -1 : 0; p.tail = p.bob ? 1 : 0; };
    const def = a.def;
    switch (a.anim) {
      case 'walk': walk(a.power ? 12 : 10); break;
      case 'run': walk(12); break;
      case 'work':
        breathe(); p.expr = 'focused';
        if (def === crew.jared.def) p.arms = Math.floor(t * 8) % 2 ? 'tap' : 'fwd';
        else if (def === crew.phillip.def) { p.arms = Math.floor(t * 10) % 2 ? 'reach' : 'fwd'; p.tail = Math.floor(t * 10) % 2; }
        else if (def === crew.ali.def) {
          if (a.flipT > 0) { p.arms = 'up'; p.hold = 'spatula'; }
          else { p.arms = Math.floor(t * 8) % 2 ? 'fwd' : 'reach'; p.hold = 'spatulaDown'; }
          p.tail = Math.floor(t * 8) % 2;
        }
        break;
      case 'reach': breathe(); p.arms = 'reach'; p.hold = 'taco'; p.expr = 'happy'; break;
      case 'blush': breathe(); p.expr = 'blush'; p.arms = 'down'; p.hold = 'spatulaDown'; break;
      case 'throw': p.arms = 'point'; p.expr = 'happy'; break;
      case 'catch': p.arms = 'cheer'; p.expr = 'happy'; break;
      case 'shake': p.arms = Math.floor(t * 10) % 2 ? 'up' : 'fwd'; p.hold = 'spatula'; p.expr = 'panic'; break;
      case 'shrug': p.arms = Math.floor(t * 3) % 2 ? 'cheer' : 'out'; p.expr = 'panic'; break;
      case 'point': breathe(); p.arms = 'point'; break;
      case 'type': p.arms = Math.floor((t + ph) * 10) % 2 ? 'fwd' : 'tap'; p.bob = a.pingT > 0 ? -1 : 0; p.expr = a.pingT > 0 ? 'happy' : 'focused'; break;
      case 'pinch': p.arms = Math.floor(t * 8) % 2 ? 'reach' : 'fwd'; p.expr = 'happy'; break;
      case 'phone': breathe(); p.hold = 'phone'; break;
      case 'tap': p.walk = Math.floor(t * 6) % 2 ? 0 : -1; p.expr = 'focused'; break;
      case 'crossed': p.arms = 'fwd'; p.expr = 'focused'; break;
      case 'rub': p.arms = 'reach'; p.expr = 'happy'; break;
      default: breathe(); if (def === crew.ali?.def) p.hold = 'spatulaDown';
    }
    if (S.comboFlash > 0 && a.kind === 'crew' && !a.seated && a !== crew.aaron) p.arms = 'cheer';
    if (a.state === 'happy') p.expr = 'happy';
    if (p.walk === undefined) p.walk = -1;
    return p;
  }

  function draw(cam, k, devCtx, dw, dh, dpr, opts) {
    if (art && art.isoCamera !== false) {
      devCtx.imageSmoothingEnabled = true;
      drawIsoScene(devCtx, { art, sim, world, cam, dw, dh, dpr, opts: { ...opts, debugMap: !!debug.map }, S });
      return { left: 0, top: 0, sw: dw, sh: dh };
    }
    if (art?.ready) {
      devCtx.imageSmoothingEnabled = true;
      drawArtScene(devCtx, { art, sim, world, cam, dw, dh, dpr, opts: { ...opts, debugMap: !!debug.map }, S });
      return { left: 0, top: 0, sw: dw, sh: dh };
    }
    const sw = Math.ceil(dw / k) + 2, sh = Math.ceil(dh / k) + 2;
    if (src.width !== sw || src.height !== sh) { src.width = dyn.width = sw; src.height = dyn.height = sh; }
    const lx = cam.x - dw / k / 2, ly = cam.y - dh / k / 2;
    const left = Math.floor(lx), top = Math.floor(ly), fx = lx - left, fy = ly - top;
    const t = S.t;
    const c = sctx;
    c.imageSmoothingEnabled = false;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = '#4C7234'; c.fillRect(0, 0, sw, sh);
    c.drawImage(world.ground, -left, -top);

    // Ground-level dynamic bits: litter.
    for (const l of S.litter) { const p = P(l.i, l.j); c.fillStyle = '#F3EEE4'; c.fillRect(Math.round(p[0] - left), Math.round(p[1] - top), 3, 2); c.fillStyle = '#E8B85A'; c.fillRect(Math.round(p[0] - left) + 1, Math.round(p[1] - top), 1, 1); }

    // Shadows: static layer + dynamic actors, multiplied once.
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, sw, sh);
    dctx.drawImage(world.shadow, -left, -top);
    dctx.fillStyle = SHADOW;
    for (const a of S.actors) {
      const p = P(a.i, a.j), x = p[0] - left, y = p[1] - top;
      if (x < -60 || y < -20 || x > sw + 60 || y > sh + 40) continue;
      dctx.beginPath(); dctx.ellipse(x + 1, y, 7, 2.5, 0, 0, Math.PI * 2); dctx.fill();
      if (!a.seated) {
        const L = 1.6 * 35;
        dctx.globalAlpha = 0.75;
        dctx.beginPath(); dctx.ellipse(x + SH_DIR[0] * L * 0.5, y + SH_DIR[1] * L * 0.5, L * 0.5, 2.2, Math.atan2(SH_DIR[1], SH_DIR[0]), 0, Math.PI * 2); dctx.fill();
        dctx.globalAlpha = 1;
      }
    }
    for (const g of S.grackles) { const p = P(g.i, g.j); dctx.fillRect(Math.round(p[0] - left - 2), Math.round(p[1] - top), 5, 1); }
    c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.54;
    c.drawImage(dyn, 0, 0);
    // Cloud shadows drifting to the lower right.
    c.globalAlpha = 0.1;
    for (const [ox, oy, sp] of [[0, 0, 4], [700, 260, 3.4]]) {
      const x = ((ox + t * sp) % 1500) - 400 - left - 200, y = ((oy + t * sp * 0.35) % 700) - 300 - top;
      c.drawImage(cloudBlob, x, y);
    }
    // Dappled light: 2-state shimmer at 0.5 Hz.
    c.globalCompositeOperation = 'screen'; c.globalAlpha = 1;
    c.drawImage(world.dapple[Math.floor(t * 0.5 * 2) % 2], -left, -top);
    c.globalCompositeOperation = 'source-over';

    // --- Y-sorted sprites.
    const list = [];
    for (const s of world.statics) {
      // Portrait landmark parallax brings the campus skyline into the narrow composition.
      const sx = s.x + (opts.phone ? (s.landmark ? -180 : s.portraitShiftX || 0) : 0), sy = s.y + (opts.phone && s.landmark ? 55 : 0);
      if (sx - left > sw || sy - top > sh || sx + s.c.width - left < 0 || sy + s.c.height - top < 0) continue;
      list.push({ key: s.key, fn: () => c.drawImage(s.c, sx - left, sy - top) });
    }
    const actorBoxes = [];
    for (const a of S.actors) {
      const p = P(a.i, a.j);
      const x = Math.round(p[0] - left - (a.mirror ? FW - AX : AX)), y = Math.round(p[1] - top - FY);
      if (x > sw || y > sh || x < -FW || y < -FH) continue;
      const fr = frame(a.def, pose(a, t), a.mirror);
      list.push({ key: p[1] + (a.kindKey || 0), fn: () => c.drawImage(fr, x, y) });
      actorBoxes.push({ a, x, y });
    }
    // Counter-top props (stack, parked tacos, drawer, jar, coal) right after the counter.
    list.push({ key: counter.key + 0.5, fn: () => counterProps(c, left, top, t) });
    // Tickets hang from the rail, just in front of the back piece.
    list.push({ key: backPieceKey + 0.5, fn: () => tickets(c, left, top) });
    for (const g of S.grackles) {
      const p = P(g.i, g.j, g.z);
      list.push({ key: g.perch ? backPieceKey + 0.4 : P(g.i, g.j)[1], fn: () => grackle(c, Math.round(p[0] - left), Math.round(p[1] - top), g, t) });
    }
    list.sort((a, b) => a.key - b.key);
    for (const it of list) it.fn();

    if (S.frisbee) { const fp = P(S.frisbee.x, S.frisbee.y, S.frisbee.z); c.fillStyle = '#ED6658'; c.fillRect(Math.round(fp[0] - left) - 2, Math.round(fp[1] - top), 5, 2); c.fillStyle = '#FFB0A0'; c.fillRect(Math.round(fp[0] - left) - 1, Math.round(fp[1] - top), 3, 1); }
    // Props in flight over everything (coins, handoff tacos), particles.
    for (const p of S.props) if (p.key === 'top' && p.x !== undefined) propSprite(c, p, left, top);
    for (const p of S.parts) {
      const k2 = p.t / p.life;
      if (p.kind === 'steam') { c.fillStyle = `rgba(255,255,255,${0.6 * (1 - k2)})`; const s = k2 < 0.3 ? 3 : k2 < 0.7 ? 4 : 5; c.fillRect(Math.round(p.x - left + k2 * 6 - s / 2), Math.round(p.y - top - k2 * 18), s, s); }
      if (p.kind === 'note') { const x = Math.round(p.x - left + Math.sin(p.t * 6) * 2), y = Math.round(p.y - top - k2 * 12); c.globalAlpha = 1 - k2; c.fillStyle = '#FFE7F0'; c.fillRect(x, y, 2, 2); c.fillRect(x + 1, y - 4, 1, 4); c.fillRect(x + 2, y - 4, 2, 1); c.fillStyle = '#B79AD8'; c.fillRect(x, y + 1, 2, 1); c.globalAlpha = 1; }
      if (p.kind === 'puff') { c.fillStyle = `rgba(200,200,210,${0.8 * (1 - k2)})`; c.fillRect(Math.round(p.x - left - 1), Math.round(p.y - top - k2 * 6), 3, 3); }
    }

    // --- Light: glows, golden pool, grade, motes, vignette.
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = '#382C26'; c.lineWidth = 1; c.beginPath();
    stageLights.forEach((p, n) => n ? c.lineTo(Math.round(p[0] - left), Math.round(p[1] - top)) : c.moveTo(Math.round(p[0] - left), Math.round(p[1] - top)));
    c.stroke();
    c.globalCompositeOperation = 'screen';
    const lightsA = 0.55 + (S.comboFlash > 0 ? (Math.floor(t * 10) % 2) * 0.4 : 0);
    for (let n = 0; n < 9; n++) {
      const p = stageLights[n];
      const flick = n === 6 ? (Math.sin(t * 13) > 0.6 ? 0.4 : 1) : 1;
      c.drawImage(glow(9, '#FFE7A0', lightsA * flick), p[0] - left - 9, p[1] - top - 7);
    }
    const gp = P(ST.stations.grill, 1.22, ST.cTop + 2);
    c.drawImage(glow(16, '#FF9A3D', 0.25 + S.coal), gp[0] - left - 16, gp[1] - top - 16);
    const hp = P(ST.stations.pickup, 1.15, ST.cTop + 6);
    c.drawImage(glow(10, '#FFC24A', 0.2), hp[0] - left - 10, hp[1] - top - 10);
    for (const gl of world.glows) {
      if (gl.kind === 'pool') {
        c.save(); c.translate(gl.x - left, gl.y - top); c.scale(1, 0.38);
        c.drawImage(glow(gl.r, '#FFBD61', 0.32), -gl.r, -gl.r);
        c.restore();
      } else {
        c.drawImage(glow(gl.r, '#FFC870', 0.55), gl.x - left - gl.r, gl.y - top - gl.r);
        c.drawImage(glow(8, '#FFF1C4', 0.8), gl.x - left - 8, gl.y - top - 8);
      }
    }
    // Sun shafts from the low sun at the upper left.
    sunShafts(c, left, top, sw, sh, t);
    // Rush telegraph: Old Main's doors pulse warm for the last 15 s before the bell.
    if (S.bellIn < 15) { const dp = P(2.43 + 8.5, -14.03 + 7.3, 26); if (opts.phone) { dp[0] -= 180; dp[1] += 55; } c.drawImage(glow(22, '#FFE076', 0.25 + 0.25 * Math.sin(t * 5)), dp[0] - left - 22, dp[1] - top - 22); }
    const ap = P(-2.85, -1.6, 24);
    c.drawImage(glow(14, '#86F1DA', 0.55), ap[0] - left - 14, ap[1] - top - 14);
    c.globalCompositeOperation = 'source-over';
    // Draped string from the left lamp to the back-board's left post (computed once).
    if (!drape) {
      drape = [];
      const a = P(-4.0, 3.1, 58), b = P(0, ST.back, ST.boardH - 2);
      for (let n = 1; n < 12; n++) {
        const u = n / 12;
        drape.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI) * 10]);
      }
    }
    for (const [x, y] of drape) c.drawImage(glow(8, '#FFE7A0', lightsA * 0.9), x - left - 8, y - top - 6);
    // Bulb cores after the glow so they read as points.
    for (let n = 0; n < 9; n++) {
      const p = stageLights[n];
      c.fillStyle = '#29202C'; c.fillRect(Math.round(p[0] - left), Math.round(p[1] - top) - 1, 1, 1);
      c.fillStyle = '#FFF1C4'; c.fillRect(Math.round(p[0] - left), Math.round(p[1] - top), 2, 2);
    }
    c.fillStyle = '#29202C';
    for (let n = 0; n < drape.length - 1; n++) {
      const [x0, y0] = drape[n], [x1, y1] = drape[n + 1];
      for (let s = 0; s < 1; s += 0.1) c.fillRect(Math.round(x0 + (x1 - x0) * s - left), Math.round(y0 + (y1 - y0) * s - top) - 1, 1, 1);
    }
    for (const [x, y] of drape) { c.fillStyle = '#FFF1C4'; c.fillRect(Math.round(x - left), Math.round(y - top), 2, 2); }
    // Golden pool on the stand.
    c.globalCompositeOperation = 'soft-light';
    const pc = P(3, 0.6, 16);
    c.drawImage(glow(120, '#FFE2A6', 0.32), pc[0] - left - 120, pc[1] - top - 120);
    // Warm/cool split: a light warm wash from the sun side, cool toward the far corner.
    const gr = c.createLinearGradient(0, 0, sw, sh);
    gr.addColorStop(0, 'rgba(255,190,100,0.22)'); gr.addColorStop(0.55, 'rgba(255,170,100,0.06)'); gr.addColorStop(1, 'rgba(96,80,150,0.2)');
    c.fillStyle = gr; c.fillRect(0, 0, sw, sh);
    c.globalCompositeOperation = 'source-over';
    // Split-tone on the GPU: violet into the shadows (multiply), warm into the highlights (soft-light).
    c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgba(214,196,236,0.12)'; c.fillRect(0, 0, sw, sh);
    c.globalCompositeOperation = 'soft-light'; c.fillStyle = 'rgba(255,200,120,0.12)'; c.fillRect(0, 0, sw, sh);
    c.globalCompositeOperation = 'source-over';
    // Dust motes.
    const nm = opts.phone ? 4 : 8;
    for (let n = 0; n < nm; n++) {
      const m = motes[n];
      const x = ((m.x * sw + t * m.s) % sw), y = ((m.y * sh - t * m.s * 0.6) % sh + sh) % sh;
      c.fillStyle = `rgba(255,231,176,${0.35 + 0.25 * Math.sin(t * 2 + m.ph)})`;
      c.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    const r = Math.hypot(sw, sh) / 2;
    const vg = c.createRadialGradient(sw * 0.45, sh * 0.5, r * 0.45, sw / 2, sh / 2, r);
    vg.addColorStop(0, 'rgba(30,20,28,0)'); vg.addColorStop(1, 'rgba(30,20,28,0.38)');
    c.fillStyle = vg; c.fillRect(0, 0, sw, sh);

    // Debug overlay (F2): protected work rect, keep-out band, violators.
    const pwr = workRect();
    let hits = 0;
    for (const b of actorBoxes) {
      if (b.a.kind === 'crew' || b.a.kind === 'west') continue;
      const ax0 = b.x + left, ay0 = b.y + top;
      let over = pwr.some((q) => ax0 + 6 < q.x1 && ax0 + 24 > q.x0 && ay0 + 18 < q.y1 && ay0 + 50 > q.y0);
      for (let yy = ay0 + 18; !over && yy < ay0 + 50; yy += 3) for (let xx = ax0 + 7; xx < ax0 + 23; xx += 3) {
        const [ci, cj] = world.inv(xx, yy, ST.cTop);
        if (ci > 0 && ci < ST.len && cj > ST.cBack && cj < ST.cFront) { over = true; break; }
      }
      const front = P(b.a.i, b.a.j)[1] > counter.key;
      if (over && front) { hits++; if ((debug.log ||= []).length < 30) debug.log.push([b.a.kind, b.a.state, +b.a.i.toFixed(2), +b.a.j.toFixed(2)]); if (debug.on) { c.strokeStyle = '#FF2030'; c.strokeRect(b.x + 0.5, b.y + 0.5, FW - 1, FH - 1); } }
    }
    debug.hits += hits; debug.frames++;
    if (debug.on) {
      c.strokeStyle = '#30C0FF'; for (const q of pwr) c.strokeRect(q.x0 - left + 0.5, q.y0 - top + 0.5, q.x1 - q.x0, q.y1 - q.y0);
      c.strokeStyle = '#FFB020'; c.beginPath();
      [[0, 2], [6, 2], [6, 4.5], [0, 4.5]].forEach(([i, j], n) => { const p = P(i, j); n ? c.lineTo(p[0] - left, p[1] - top) : c.moveTo(p[0] - left, p[1] - top); });
      c.closePath(); c.stroke();
    }

    // --- Upscale once by k with the sub-pixel camera offset.
    devCtx.imageSmoothingEnabled = false;
    devCtx.filter = 'saturate(1.14) contrast(1.06)';
    devCtx.drawImage(src, Math.round(-fx * k), Math.round(-fy * k), sw * k, sh * k);
    devCtx.filter = 'none';

    // --- Device-res overlays: name tags + floating text.
    const toDev = (wx, wy) => [(wx - lx) * k, (wy - ly) * k];
    devCtx.textAlign = 'center'; devCtx.textBaseline = 'middle';
    const fs = Math.max(9, Math.round((opts.phone ? 9 : 11) * dpr));
    devCtx.font = `${fs}px Silkscreen, ui-monospace, monospace`;
    const placed = [];
    for (const a of S.actors) {
      if (!a.def.name || (a.kind !== 'crew' && a.kind !== 'west')) continue;
      const al = opts.tagAlpha(a);
      if (al <= 0.01) continue;
      const headZ = a.def.hat === 'toque' ? 53 : a.def.hairStyle === 'bouffant' ? 62 : a.seated ? 39 : 45;
      const p = P(a.i, a.j, headZ);
      let [dx, dy] = toDev(p[0], p[1]);
      const tw = devCtx.measureText(a.def.name).width, ph = fs + 5 * dpr, pw = tw + 10 * dpr;
      for (let n = 0; n < 4 && placed.some((q) => Math.abs(q[0] - dx) < (q[2] + pw) / 2 + 2 * dpr && Math.abs(q[1] - dy) < ph + 2 * dpr); n++) dy -= ph + 3 * dpr;
      dx = Math.max(pw / 2 + 4 * dpr, Math.min(dw - pw / 2 - 4 * dpr, dx));
      placed.push([dx, dy, pw]);
      devCtx.globalAlpha = al;
      devCtx.fillStyle = 'rgba(30,26,32,0.8)';
      roundRect(devCtx, dx - pw / 2, dy - ph / 2, pw, ph, 4 * dpr); devCtx.fill();
      devCtx.fillStyle = a.def.accent; devCtx.fillRect(Math.round(dx - pw / 2 + 3 * dpr), Math.round(dy + ph / 2 - 2.5 * dpr), Math.round(pw - 6 * dpr), Math.max(1, Math.round(1.5 * dpr)));
      devCtx.fillStyle = '#F3E6C8'; devCtx.fillText(a.def.name, dx, dy - 0.5 * dpr);
      devCtx.globalAlpha = 1;
    }
    devCtx.font = `${Math.round(fs * 1.3)}px Silkscreen, ui-monospace, monospace`;
    for (const x of S.texts) {
      const [dx, dy] = toDev(x.x, x.y - x.t * 14);
      devCtx.globalAlpha = Math.min(1, 2 * (1.2 - x.t));
      devCtx.fillStyle = '#1E1A20'; devCtx.fillText(x.s, dx + dpr, dy + dpr);
      devCtx.fillStyle = x.color; devCtx.fillText(x.s, dx, dy);
      devCtx.globalAlpha = 1;
    }
    return { left, top, sw, sh };
  }

  // Protected Work Rect as a union of boxes: workers' head+torso+hands, counter-top strips, ticket rail (+4 sp).
  function workRect() {
    const out = [];
    const box = (x0, y0, x1, y1) => out.push({ x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 });
    for (const n of ['jared', 'phillip', 'ali', 'matt']) {
      const a = crew[n], p = P(...a.home);
      box(p[0] - 11, p[1] - 38, p[0] + 9, p[1] - 14);
    }
    const rl = P(0, ST.awnJ, ST.railZ), rr = P(ST.len, ST.awnJ, ST.railZ - 8);
    box(rl[0], rl[1], rr[0], rr[1]);
    return out;
  }

  function counterProps(c, left, top, t) {
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x - left), Math.round(y - top), w, h); };
    // Tortilla stack: 1 sp per 4 tortillas.
    const sp = sim.SPOTS.stack, layers = Math.ceil(S.tortillas / 4);
    for (let n = 0; n < layers; n++) { R(sp[0] - 3, sp[1] - 2 - n, 7, 2, '#E2C584'); R(sp[0] - 3, sp[1] - 3 - n, 7, 1, '#F6E6BE'); }
    // Cash drawer.
    const dr = sim.SPOTS.drawer;
    if (S.drawer > 0.1) R(dr[0] - 3 - S.drawer, dr[1] + 3 + S.drawer * 0.5, 5, 2, '#5A5E66');
    // Coal strip on the griddle front edge (3-frame flicker at 6 fps).
    const g0 = sim.P(3.3, 1.5, ST.cTop + 1);
    const cf = Math.floor(t * 6) % 3;
    for (let n = 0; n < 16; n++) R(g0[0] + n, g0[1] + Math.floor(n / 2), 1, 1, (n + cf) % 3 === 0 ? '#FFC24A' : '#F07A2A');
    // Little flames licking up from the griddle while Ali works.
    const gp2 = sim.P(3.8, 1.2, ST.cTop + 2);
    for (let n = 0; n < 4; n++) { const fh = 3 + ((n + cf + Math.floor(t * 9)) % 4) + (S.coal > 0 ? 3 : 0); R(gp2[0] - 6 + n * 4, gp2[1] - fh, 1, fh, n % 2 ? '#FFC24A' : '#FF8A3D'); R(gp2[0] - 6 + n * 4, gp2[1] - fh, 1, 1, '#FFF1C4'); }
    // Tip jar: 5x7 glass with coin levels.
    const j = sim.SPOTS.jar;
    R(j[0] - 2, j[1] - 1, 5, 7, 'rgba(190,225,240,0.55)');
    R(j[0] - 2, j[1] - 1, 5, 1, '#E8F4F8');
    const lvl = Math.round(S.jar);
    for (let n = 0; n < lvl; n++) R(j[0] - 1, j[1] + 4 - n, 3, 1, n % 2 ? '#F4C66D' : '#D9A94E');
    R(j[0] - 2, j[1] + 6, 5, 1, '#9AB8C4');
    // Parked + sliding tacos on the counter.
    for (const p of S.props) if (p.key === 'counter' && p.x !== undefined) propSprite(c, p, left, top);
  }

  function propSprite(c, p, left, top) {
    const x = Math.round(p.x - left), y = Math.round(p.y - top);
    if (p.kind === 'coin') { c.fillStyle = '#F4C66D'; c.fillRect(x - 1, y - 1, 3, 3); c.fillStyle = '#FFF1C4'; c.fillRect(x - 1, y - 1, 1, 1); c.fillStyle = '#B88A2E'; c.fillRect(x + 1, y + 1, 1, 1); return; }
    if (p.kind === 'bit') { c.fillStyle = p.color; c.fillRect(x, y, 1, 1); return; }
    if (p.kind === 'tortilla') { c.fillStyle = '#F6E6BE'; c.fillRect(x - 3, y - 1, 6, 2); return; }
    // Taco: shell + fillings, with a 4-frame spin while flipping.
    const f = p.flipDur ? Math.floor((p.flip / p.flipDur) * 4) % 4 : 0;
    const lift = p.flipDur ? Math.round(Math.sin((p.flip / p.flipDur) * Math.PI) * 10) : 0;
    const yy = y - lift;
    if (f === 1 || f === 3) { c.fillStyle = '#E8B85A'; c.fillRect(x - 1, yy - 2, 2, 4); return; }
    c.fillStyle = '#C9902E'; c.fillRect(x - 3, yy, 6, 1);
    c.fillStyle = '#E8B85A'; c.fillRect(x - 3, yy - 2, 6, 2);
    if (f === 0) { c.fillStyle = '#6FA34A'; c.fillRect(x - 2, yy - 3, 4, 1); c.fillStyle = '#D8452F'; c.fillRect(x - 1, yy - 3, 1, 1); c.fillStyle = '#F4C66D'; c.fillRect(x + 1, yy - 3, 1, 1); }
  }

  function tickets(c, left, top) {
    for (const tk of S.tickets) {
      const x = Math.round(tk.x - left), y = Math.round(tk.y - top);
      c.globalAlpha = Math.max(0, tk.a);
      c.fillStyle = '#6F4628'; if (!tk.drop) c.fillRect(x + 1, y - 1, 1, 2);
      c.fillStyle = '#F3E6C8'; c.fillRect(x - 1, y + 1, 4, 5);
      c.fillStyle = tk.online ? '#2E9C95' : '#C23B48'; c.fillRect(x - 1, y + 1, 4, 1);
      c.fillStyle = '#B8A888'; c.fillRect(x, y + 3, 2, 1); c.fillRect(x, y + 5, 2, 0);
      c.globalAlpha = 1;
    }
    // Antonio's phone ping above the laptop lid.
    if (crew.antonio.pingT > 0) {
      const p = P(-2.85, -0.95, 31 + (0.8 - crew.antonio.pingT) * 6);
      const x = Math.round(p[0] - left), y = Math.round(p[1] - top);
      c.fillStyle = '#1E1A20'; c.fillRect(x - 3, y - 3, 6, 7); c.fillStyle = '#7CFFB2'; c.fillRect(x - 2, y - 2, 4, 4); c.fillStyle = '#1E1A20'; c.fillRect(x - 1, y - 1, 2, 1);
    }
  }

  function grackle(c, x, y, g, t) {
    const body = g.male ? '#14121C' : '#5A4636';
    const f = g.mirror ? -1 : 1;
    const R2 = (dx, dy, w, h, col) => { c.fillStyle = col; c.fillRect(f > 0 ? x + dx : x - dx - w + 1, y + dy, w, h); };
    const lift = g.hop > 0 ? -1 : 0, peck = g.peck > 0 ? 1 : 0;
    if (g.state === 'fly') {
      const up = Math.floor(t * 12) % 2;
      R2(-2, -3, 5, 2, body); R2(-1, up ? -5 : -1, 3, 2, body); R2(2, -4, 2, 1, body);
      if (g.loot) { R2(3, -3, 3, 2, '#E8B85A'); R2(3, -4, 2, 1, '#6FA34A'); }
      return;
    }
    R2(-3, -4 + lift, 5, 3, body); R2(1, -5 + lift + peck, 2, 2, body); R2(-5, -5 + lift, 2, 1, body); R2(-6, -6 + lift, 1, 2, body);
    if (g.male) { R2(-1, -4 + lift, 1, 1, Math.floor(t) % 2 ? '#4B3A7A' : '#2F5A6E'); R2(2, -5 + lift + peck, 1, 1, '#F2D04A'); }
    R2(3, -4 + lift + peck * 2, 1, 1, '#3A3236');
    if (g.loot) { R2(3, -5, 3, 2, '#E8B85A'); R2(3, -6, 2, 1, '#6FA34A'); }
    R2(-1, -1, 1, 1, '#3A3236'); R2(1, -1, 1, 1, '#3A3236');
  }

  return { draw, debug, workRect };
}

// Soft diagonal light shafts radiating from the sun (screen blend), slowly breathing.
const SUN = { x: -152, y: -126 }; // world sp (relative to stand origin)
function sunShafts(c, left, top, sw, sh, t) {
  const sx = SUN.x + 820 - left, sy = SUN.y + 470 - top;
  c.save();
  for (let n = 0; n < 7; n++) {
    const a = 0.25 + n * 0.11 + Math.sin(t * 0.2 + n) * 0.01, w = 0.035 + (n % 3) * 0.012;
    const g = c.createLinearGradient(sx, sy, sx + Math.cos(a) * 520, sy + Math.sin(a) * 520);
    g.addColorStop(0, 'rgba(255,214,140,0.20)'); g.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(sx, sy);
    c.lineTo(sx + Math.cos(a - w) * 600, sy + Math.sin(a - w) * 600); c.lineTo(sx + Math.cos(a + w) * 600, sy + Math.sin(a + w) * 600);
    c.closePath(); c.fill();
  }
  const g2 = c.createRadialGradient(sx, sy, 0, sx, sy, 220);
  g2.addColorStop(0, 'rgba(255,226,160,0.3)'); g2.addColorStop(1, 'rgba(255,200,120,0)');
  c.fillStyle = g2; c.fillRect(0, 0, sw, sh);
  c.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
