// Projected-world pixel coordinates; no renderer or DOM dependency.
export const MAX_PARTICLES = 512;
export const PALETTE = Object.freeze(['#501214', '#E8B84A', '#FFF4DC', '#C0392B', '#76777B', '#A5A6AA', '#D2D0CC']);
const STEAM = 1, SPARK = 2, TACO = 3, TEXT = 4, CONFETTI = 5, FACE = 6, PULSE = 7, STAR = 8, BANNER = 9;
// 3x5 bitmap lettering avoids platform font/emoji differences and text raster allocations.
const FONT = Object.freeze({
  ' ': '000000000000000', '+': '000010111010000', '-': '000000111000000', '.': '000000000000010',
  '$': '011110010011110', '!': '010010010000010', '?': '110001010000010',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '101111111111101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
});
function lettering(ctx, text, x, y, scale) {
  for (let i = 0; i < text.length; i++) {
    const glyph = FONT[text[i]] || FONT['?'];
    for (let k = 0; k < 15; k++) if (glyph[k] === '1') {
      ctx.fillRect(x + (i * 4 + k % 3) * scale, y + Math.floor(k / 3) * scale, scale, scale);
    }
  }
}

export function createFx(contextOrOptions = {}, configuration = {}) {
  const defaultContext = typeof contextOrOptions?.fillRect === 'function' ? contextOrOptions : null;
  const options = defaultContext ? configuration : contextOrOptions;
  const capacity = Number.isFinite(options.capacity)
    ? Math.max(1, Math.min(MAX_PARTICLES, Math.floor(options.capacity))) : 256;
  const random = options.random || Math.random;
  const pool = new Array(capacity), active = new Uint16Array(capacity), free = new Uint16Array(capacity);
  for (let i = 0; i < capacity; i++) {
    pool[i] = { type: 0, x: 0, y: 0, endX: 0, endY: 0, vx: 0, vy: 0, age: 0, life: 0, size: 0, color: 0, text: '', variant: 0 };
    free[i] = capacity - i - 1;
  }
  let count = 0, available = capacity, disposed = false;
  const media = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = options.reducedMotion === undefined ? !!media?.matches : !!options.reducedMotion;
  const stats = Object.seal({ capacity, active: 0, free: capacity, emitted: 0, dropped: 0, highWater: 0 });
  function clear() {
    while (count) {
      const index = active[--count];
      pool[index].text = ''; free[available++] = index;
    }
    stats.active = 0; stats.free = available;
  }
  function preference(event) {
    if (options.reducedMotion !== undefined) return;
    reduced = event.matches;
    if (reduced) clear();
  }
  if (media?.addEventListener) media.addEventListener('change', preference);
  else if (media?.addListener) media.addListener(preference);
  function spawn(type, x, y, life, color, size, vx = 0, vy = 0) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!available) { stats.dropped++; return null; }
    const index = free[--available], p = pool[index];
    active[count++] = index;
    p.type = type; p.x = x; p.y = y; p.endX = x; p.endY = y;
    p.age = 0; p.life = life; p.color = color; p.size = size;
    p.vx = vx; p.vy = vy; p.text = ''; p.variant = 0;
    stats.active = count; stats.free = available; stats.emitted++;
    if (count > stats.highWater) stats.highWater = count;
    return p;
  }
  function burst(x, y, amount, type) {
    if (reduced) { spawn(STAR, x, y, 0.65, 1, 3); return; }
    for (let i = 0; i < amount; i++) {
      const angle = random() * Math.PI * 2, speed = 12 + random() * 36;
      spawn(type, x, y, 0.55 + random() * 0.55, 1 + i % 3, 1 + i % 2,
        Math.cos(angle) * speed, Math.sin(angle) * speed - 10);
    }
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || disposed) return;
    for (let i = count - 1; i >= 0; i--) {
      const p = pool[active[i]];
      p.age += dt;
      if (p.age >= p.life) {
        p.text = ''; free[available++] = active[i]; active[i] = active[--count];
      }
    }
    stats.active = count; stats.free = available;
  }
  function draw(ctx = defaultContext, camera) {
    // Camera is a top-left origin in projected world pixels, zoom is pixels/world pixel.
    const cx = camera?.x ?? 0, cy = camera?.y ?? 0, zoom = camera?.zoom ?? 1;
    if (!ctx || !(zoom > 0) || !Number.isFinite(zoom) || !Number.isFinite(cx) || !Number.isFinite(cy) || disposed) return;
    const viewportWidth = camera?.viewportWidth ?? ((ctx.canvas?.width ?? 0) / (options.pixelRatio || 1));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < count; i++) {
      const p = pool[active[i]], t = p.age, u = t / p.life;
      let wx = p.x, wy = p.y;
      if (!reduced) {
        wx += p.vx * t; wy += p.vy * t;
        if (p.type === SPARK || p.type === CONFETTI || p.type === STAR) wy += 30 * t * t;
        if (p.type === TACO) { wx = p.x + (p.endX - p.x) * u; wy = p.y + (p.endY - p.y) * u - 64 * u * (1 - u); }
      }
      const x = Math.round((wx - cx) * zoom), y = Math.round((wy - cy) * zoom);
      const s = Math.max(1, Math.round(zoom)), size = Math.max(1, Math.round(p.size * zoom));
      ctx.globalAlpha = reduced ? 1 : Math.min(1, (1 - u) * 4);
      ctx.fillStyle = PALETTE[p.color];
      switch (p.type) {
        case TEXT: {
          const tx = x - Math.floor((p.text.length * 4 - 1) * s / 2);
          ctx.fillStyle = PALETTE[0]; lettering(ctx, p.text, tx + s, y + s, s);
          ctx.fillStyle = PALETTE[1]; lettering(ctx, p.text, tx, y, s); break;
        }
        case BANNER: {
          // HUD feedback stays on screen when the world camera pans or zooms.
          const bx = viewportWidth > 0 ? Math.round(viewportWidth / 2) : x;
          const by = 24, w = 158;
          ctx.fillStyle = PALETTE[0]; ctx.fillRect(bx - w / 2, by - 8, w, 36);
          ctx.fillStyle = PALETTE[1]; ctx.fillRect(bx - w / 2, by - 8, w, 2);
          lettering(ctx, 'BIG RUSH!', bx - 35, by, 2); break;
        }
        case TACO:
          ctx.fillStyle = PALETTE[3]; ctx.fillRect(x - 3*s, y - 2*s, 6*s, 2*s);
          ctx.fillStyle = PALETTE[2]; ctx.fillRect(x - 4*s, y, 8*s, 2*s);
          ctx.fillStyle = PALETTE[1]; ctx.fillRect(x - 3*s, y + 2*s, 6*s, 2*s); break;
        case FACE:
          ctx.fillStyle = PALETTE[2]; ctx.fillRect(x - 6*s, y - 6*s, 13*s, 12*s); ctx.fillRect(x - 2*s, y + 6*s, 2*s, 2*s);
          ctx.fillStyle = PALETTE[p.variant ? 3 : 0];
          ctx.fillRect(x - 3*s, y - 2*s, s, s); ctx.fillRect(x + 3*s, y - 2*s, s, s);
          ctx.fillRect(x - 2*s, y + (p.variant ? 2 : 3)*s, 5*s, s);
          ctx.fillRect(x - 3*s, y + (p.variant ? 3 : 2)*s, s, s); ctx.fillRect(x + 3*s, y + (p.variant ? 3 : 2)*s, s, s);
          if (p.variant) { ctx.fillRect(x - 4*s, y - 4*s, 2*s, s); ctx.fillRect(x + 3*s, y - 4*s, 2*s, s); }
          break;
        case PULSE: {
          const r = reduced ? 10*s : Math.round((7 + 20*u)*zoom), edge = 2*s;
          ctx.fillRect(x-r, y-r, 2*r, edge); ctx.fillRect(x-r, y+r, 2*r+edge, edge);
          ctx.fillRect(x-r, y-r, edge, 2*r); ctx.fillRect(x+r, y-r, edge, 2*r);
          lettering(ctx, '!', x-s, y-2*s, s); break;
        }
        case STAR:
          ctx.fillRect(x-size, y, size*2+s, s); ctx.fillRect(x, y-size, s, size*2+s); break;
        case STEAM:
          ctx.globalAlpha *= 0.45;
          ctx.fillRect(x, y, size, size); ctx.fillRect(x+s, y-s, size, size); break;
        default: ctx.fillRect(x, y, size, p.type === CONFETTI ? size*2 : size);
      }
    }
    ctx.restore();
  }
  function steam(x, y) {
    if (!reduced) for (let i = 0; i < 3; i++) spawn(STEAM, x + random()*8-4, y, 0.8+random()*0.5, 4+i%3, 2+i%2, random()*6-3, -12-random()*10);
  }
  function sizzle(x, y) {
    if (!reduced) for (let i = 0; i < 5; i++) spawn(SPARK, x, y, 0.25+random()*0.2, i%2 ? 1 : 2, 1, random()*30-15, -15-random()*20);
  }
  function tacoToss(x, y, targetX, targetY, duration = 0.55) {
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
    const p = spawn(TACO, reduced ? targetX : x, reduced ? targetY : y, Number.isFinite(duration) && duration > 0 ? duration : 0.55, 1, 2);
    if (p) { p.endX = targetX; p.endY = targetY; }
  }
  function cashPop(text, x, y) {
    const p = spawn(TEXT, x, y, 1.15, 1, 1, 0, reduced ? 0 : -16);
    if (p) p.text = String(text).slice(0, 32).toUpperCase();
  }
  function comboBurst(x, y) { burst(x, y, 24, STAR); }
  function rushConfetti(x, y) { spawn(BANNER, x, y, 1.8, 1, 1); if (!reduced) burst(x, y, 48, CONFETTI); }
  function bubble(x, y, angry = false) {
    const p = spawn(FACE, x, y, 1.25, 2, 1, 0, reduced ? 0 : -6);
    if (p) p.variant = angry ? 1 : 0;
  }
  function happy(x, y) { bubble(x, y); }
  function angry(x, y) { bubble(x, y, true); }
  function suspicionPulse(x, y) { spawn(PULSE, x, y, 0.9, 3, 1); }
  function levelUp(x, y) { burst(x, y, 16, STAR); }
  function dispose() {
    clear(); disposed = true;
    if (media?.removeEventListener) media.removeEventListener('change', preference);
    else if (media?.removeListener) media.removeListener(preference);
  }
  return { update, draw, steam, sizzle, tacoToss, cashPop, comboBurst, rushConfetti, bubble, happy, angry, suspicionPulse, levelUp, clear, dispose, stats };
}
