// Capture phase prevents a hold on the business from starting the camera drag.
export function installHold({ canvas, hitTest, allowed, setHold, ring }) {
  let pointer = null, origin = null, timer = null, active = false;
  function release() { clearTimeout(timer); pointer = null; active = false; setHold(false); ring.hidden = true; }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !allowed() || !hitTest(e.clientX, e.clientY)) return;
    e.stopImmediatePropagation(); canvas.setPointerCapture(e.pointerId);
    pointer = e.pointerId; origin = [e.clientX, e.clientY];
    timer = setTimeout(() => { if (pointer === null) return; active = true; setHold(true); ring.dataset.anchorX = String(origin[0]); ring.dataset.anchorY = String(origin[1]); ring.hidden = false; navigator.vibrate?.(8); }, 220);
  }, true);
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    e.stopImmediatePropagation();
    if (Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) > 32) release();
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => { if (e.pointerId === pointer) { e.stopImmediatePropagation(); release(); } }, true);
  addEventListener('keydown', e => { if (e.code !== 'Space' || e.repeat || e.target.closest('button,input,select,textarea,dialog')) return; if (allowed()) { e.preventDefault(); active = true; setHold(true); } });
  addEventListener('keyup', e => { if (e.code === 'Space' && active) release(); });
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', release);
  return { release };
}
