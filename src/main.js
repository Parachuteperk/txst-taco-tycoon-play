// Boot: build the world, prewarm the sim, then run the render loop.
// The camera frames the painted plate (assets/art/bg-plate.png), not the old tile map.
import { buildWorld } from './world.js';
import { createSim } from './sim.js';
import { createRenderer } from './render.js';
import { assertClearances } from './stand.js';
import { clamp } from './util.js';
// Gameplay hook: the engine owns time, customers, and money; the bridge owns animation.
import { createRuntime } from './shell/runtime.js';
import { loadArt, hitHandle, mapJson, frameMetrics } from './art.js';
import { createPaintedSceneBridge } from './bridge/paintedScene.js';
import { watchFrame, drawInWatchFrame, setWatchSafeInsets } from './bridge/watchFrame.js';

import {fitPaintedCamera,clampPaintedCamera} from './bridge/paintedCamera.js';

const params = new URLSearchParams(location.search);
const artPromise = loadArt();
const view = document.getElementById('view');
const dctx = view.getContext('2d');
const world = buildWorld();
const art = await artPromise;
const line = Number(params.get('line'));
const sim = createSim(world, 7, Number.isFinite(line) && line > 0 ? { line } : {});
const renderer = createRenderer(world, sim, art);
assertClearances(43);

const PREWARM = 0; // Engine-backed play must never prewarm the independent demo economy.
for (let t = 0; t < PREWARM; t += 0.05) sim.step(0.05);
renderer.debug.hits = 0; renderer.debug.frames = 0; sim.S.violations = 0;
if (params.get('debug') === 'map') renderer.debug.map = true;
else if (params.has('debug')) renderer.debug.on = true;

const cam = { x: 0, y: 0, k: 3, k0: 3, fx: 960, fy: 500, zoom: 1, zoomTarget: 1, panX: 0, panY: 0, panTargetX: 0, panTargetY: 0 };
let fitted=null;
const sceneFrame=()=>watchFrame(vw,vh,['watch','manager'].includes(document.body.dataset.quadMode),document.body.dataset.quadMode==='manager');
function metrics() {
  cam.sceneScale=fitted?fitted.scale*cam.zoom*dpr:undefined;
  return frameMetrics(art, {
    dw: view.width || 1, dh: view.height || 1, dpr, portrait: portrait(),
    zoom: cam.zoom, fx: cam.fx, fy: cam.fy, scale:cam.sceneScale,
  });
}
let dpr = 1, vw = 0, vh = 0;
const portrait = () => vh > vw;
function framing() {
  const f = art.map.framing;
  if (sim.forcedLine) return portrait() ? (f.rushPhone || f.rush) : f.rush;
  return portrait() ? f.phone : f.desktop;
}
function anchor() {
  if (art.isoCamera) {
    fitted = null;
    cam.zoom = cam.zoomTarget = 1;
    cam.panX = cam.panTargetX = 0;
    cam.panY = cam.panTargetY = 0;
    return;
  }
  fitted=['watch','manager','title'].includes(document.body.dataset.quadMode)?fitPaintedCamera(art,sceneFrame(),vw,vh,{wide:!!sim.S.bigRush?.active||sim.S.queue.length>20}):null;
  if(fitted){cam.fx=fitted.fx;cam.fy=fitted.fy;cam.zoom=1;cam.k=cam.k0=3;return;}
  const fr = framing();
  cam.fx = fr.focus[0];
  cam.fy = fr.focus[1];
  cam.zoom = fr.zoom ?? 1;
  cam.k = cam.k0 = 3;
}
function clampCam() {
  if (art.isoCamera) return;
  if(fitted){clampPaintedCamera(cam,fitted,sceneFrame(),vw,vh);metrics();return;}
  const m = art.map.plate;
  const met = metrics();
  const halfW = met.span / 2;
  const halfH = view.height / (2 * met.s);
  cam.fx = halfW * 2 >= m.w ? m.w / 2 : clamp(cam.fx, halfW, m.w - halfW);
  cam.fy = halfH * 2 >= m.h ? m.h / 2 : clamp(cam.fy, halfH, m.h - halfH);
}
function resize() {
  dpr = window.devicePixelRatio || 1;
  vw = innerWidth; vh = innerHeight;
  const safeStyle = getComputedStyle(document.documentElement);
  setWatchSafeInsets({ top: parseFloat(safeStyle.getPropertyValue('--quad-safe-top')), bottom: parseFloat(safeStyle.getPropertyValue('--quad-safe-bottom')) });
  view.width = Math.round(vw * dpr); view.height = Math.round(vh * dpr);
  view.style.width = `${vw}px`; view.style.height = `${vh}px`;
  anchor();
}
function zoomSpan(dir, fx, fy) {
  if (art.isoCamera) {
    cam.zoomTarget = clamp(cam.zoomTarget * (dir > 0 ? 0.86 : 1.16), 0.72, 2.5);
    return;
  }
  const before = cam.zoom;
  const next = clamp(before * (dir > 0 ? 0.86 : 1.16), 1, 2.4);
  if (next === before) return;
  const m0 = metrics();
  const px = cam.fx + (fx - vw / 2) * (m0.span / vw);
  const py = cam.fy + (fy - vh / 2) * (m0.span / vw);
  cam.zoom = next;
  const m1 = metrics();
  cam.fx = px - (fx - vw / 2) * (m1.span / vw);
  cam.fy = py - (fy - vh / 2) * (m1.span / vw);
}
addEventListener('resize', resize);
resize();

let drag = null, lastTap = 0, pointer = null, tagWake = -1e9;
const pts = new Map();
const dist2 = () => { const [a, b] = [...pts.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
view.addEventListener('pointerdown', (e) => {
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  view.setPointerCapture(e.pointerId);
  const handle = renderer.debug.map ? hitHandle(e.clientX, e.clientY, dpr) : null;
  if (handle?.pt && Number.isFinite(handle.pt.x)) {
    drag = { handle, x: e.clientX, y: e.clientY, ox: handle.pt.x, oy: handle.pt.y, moved: true };
  } else if (art.isoCamera) {
    drag = { x: e.clientX, y: e.clientY, panX: cam.panTargetX, panY: cam.panTargetY, moved: false };
  } else {
    drag = { x: e.clientX, y: e.clientY, fx: cam.fx, fy: cam.fy, moved: false };
  }
  if (pts.size === 2) drag.pinch = dist2();
  pointer = [e.clientX, e.clientY]; tagWake = performance.now();
});
view.addEventListener('pointermove', (e) => {
  pointer = [e.clientX, e.clientY]; tagWake = performance.now();
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2 && drag?.pinch) {
    const d = dist2(), [a, b] = [...pts.values()];
    if (art.isoCamera) {
      cam.zoomTarget = clamp(cam.zoomTarget * (d / drag.pinch), 0.72, 2.5);
      drag.pinch = d;
      return;
    }
    if (d / drag.pinch > 1.12) { zoomSpan(-1, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); drag.pinch = d; }
    else if (d / drag.pinch < 0.89) { zoomSpan(1, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); drag.pinch = d; }
    return;
  }
  if (!drag) return;
  if (art.isoCamera && !drag.handle) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
    cam.panTargetX = drag.panX + (e.clientX - drag.x) * dpr;
    cam.panTargetY = drag.panY + (e.clientY - drag.y) * dpr;
    return;
  }
  const scale = metrics().span / vw;
  if (drag.handle) {
    drag.handle.pt.x = Math.round(drag.ox + (e.clientX - drag.x) * scale);
    drag.handle.pt.y = Math.round(drag.oy + (e.clientY - drag.y) * scale);
    return;
  }
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
  cam.fx = drag.fx - (e.clientX - drag.x) * scale;
  cam.fy = drag.fy - (e.clientY - drag.y) * scale;
});
// The HUD's Flow / Wait / Mood toggles choose the overlay the iso scene paints.
document.addEventListener('quad-overlay', (event) => { art._isoOverlay = event.detail || ''; });
function hitBox(box, x, y) {
  return !!box && x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
}
const up = (e) => {
  pts.delete(e.pointerId);
  if (drag && !drag.moved && !drag.handle) {
    const now = performance.now();
    if (art.isoCamera) {
      const ui = (art._isoUi || []).find((box) => hitBox(box, e.clientX, e.clientY));
      if (ui) {
        if (ui.id === 'zoom') cam.zoomTarget = cam.zoomTarget > 1.4 ? 1 : 1.85;
        else art._isoOverlay = art._isoOverlay === ui.id ? '' : ui.id;
      } else {
        const person = (art._isoHits || []).find((box) => hitBox(box, e.clientX, e.clientY));
        if (person) art._isoInspect = person;
        else if (now - lastTap < 300) anchor();
        lastTap = now;
      }
    } else {
      if (now - lastTap < 300) anchor();
      lastTap = now;
    }
  }
  if (!pts.size) drag = null;
};
view.addEventListener('pointerup', up);
view.addEventListener('pointercancel', up);
view.addEventListener('wheel', (e) => { e.preventDefault(); zoomSpan(e.deltaY, e.clientX, e.clientY); }, { passive: false });
addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') anchor();
  if (e.key === 'F2') { renderer.debug.map = !renderer.debug.map; e.preventDefault(); }
  if ((e.key === 'c' || e.key === 'C') && renderer.debug.map) {
    const text = mapJson(art);
    navigator.clipboard?.writeText(text).catch(() => {});
    console.log(text);
  }
});

// Painted renderer camera -> CSS px. Plate px map through the renderer's own
// frame metrics; sim (i, j, z) maps through the art's station affine fit.
const project = art.project();
const Z_PX = (art.map.sprite?.standPx || 200) / 58; // plate px per legacy z unit (FH = 58)
const plateToCss = (x, y) => {
  const m = metrics();
  return [((x - cam.fx) * m.s + view.width / 2) / dpr, ((y - cam.fy) * m.s + view.height / 2) / dpr];
};
const screen = (i, j, z = 0) => { const q = project(i, j); return plateToCss(q.x, q.y - z * Z_PX); };
const paintedScene = createPaintedSceneBridge({ sim, art, screen, plateToCss });
function tagAlpha() { return params.has('tags') ? 1 : runtime.nameTagAlpha(); }
const runtime = createRuntime({ sim, canvas: view, screen, hitTest: paintedScene.hitTest, sceneBridge: paintedScene });
let last = performance.now(), fpsAcc = 0, fpsN = 0, previousMode = '', previousWide=false;
window.__quad = { sim, cam, renderer, world, art, runtime, fps: 0, get safeFrame(){return sceneFrame();}, get pwrHits() { return renderer.debug.hits; }, get keepOut() { return sim.S.violations; } };
let rafOn = true;
function loop(now) {
  if (typeof document !== 'undefined' && document.hidden) { rafOn = false; return; }
  rafOn = true;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { window.__quad.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  // Reframe once on Watch/title entry, preserving manual pan/zoom during play.
  const mode = document.body.dataset.quadMode;
  if (mode !== previousMode) { previousMode = mode; if (mode === 'watch' || mode === 'manager' || mode === 'title') { anchor(); } }
  runtime.step(dt);
  const wide=!!sim.S.bigRush?.active||sim.S.queue.length>20;
  if(wide!==previousWide){previousWide=wide; if (!art.isoCamera) anchor();}
  const skipping = !!(runtime.timelapse || sim.view?.fastForward || sim.view?.live?.fastForward);
  if (art.isoCamera) {
    const zoomGoal = cam.zoomTarget * (skipping ? 0.92 : 1);
    cam.zoom += (zoomGoal - cam.zoom) * Math.min(1, dt * 8);
    cam.panX += (cam.panTargetX - cam.panX) * Math.min(1, dt * 10);
    const panGoal = cam.panTargetY + (skipping ? -16 : 0);
    cam.panY += (panGoal - cam.panY) * Math.min(1, dt * 10);
  }
  clampCam();
  const hole = sceneFrame();
  drawInWatchFrame(dctx,vw,vh,dpr,hole,()=>renderer.draw(cam, cam.k, dctx, view.width, view.height, dpr, {
    phone: portrait(), tagAlpha, pointer, debugMap: renderer.debug.map,
    upgrades: params.get('upgrades') || '',
    expansion: params.get('expansion') === '1',
    fastForward: skipping,
    era: params.get('era') || '',
    view: runtime.game?.getView?.() || null,
    safe: { left: hole.left * dpr, top: hole.top * dpr, right: hole.right * dpr, bottom: hole.bottom * dpr },
    overlay: art._isoOverlay || '',
    keepClear: paintedScene.keepClearRects(),
    popup: paintedScene.anchors().popup,
  }));
  window.__quad.headCss = metrics().headCss;
  window.__quad.spriteK = metrics().k;
  window.__quadReady = true;
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !rafOn) {
    last = performance.now();
    rafOn = true;
    requestAnimationFrame(loop);
  }
});
requestAnimationFrame(loop);
