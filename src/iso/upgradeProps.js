// Skill-tree props for the watch scene. Painted pngs win. Missing files get a
// code stand-in so a purchase changes pixels now. Mrs. West's capstone is
// sparkles only: no letters, no logo on the handbag.
import { CREW, RIG, STAND, UPGRADES, WINDOW } from './world.js';
import { createFx } from '../fx/fx.js';
import { noteOwned, propFlags, stallShouldDraw } from '../upgradeVisuals.js';

// Beside the main stand, clear of the crew (matt ~15.5, antonio ~15.85) and
// the service window (12.15, 11.55). stall-drinks requires era "truck".
export const STALL_AT = { i: 18.15, j: 8.65 };

const HOME = {
  card: { i: 11.35, j: 8.95 },
  press: { i: 13.4, j: 8.75 },
  tray: { i: 16.2, j: 7.95 },
  monitor: { i: 16.85, j: 7.35 },
  ring: { i: 15.15, j: 7.45 },
};

function fxOf(art) {
  if (!art._skillFx) art._skillFx = createFx();
  return art._skillFx;
}

function feet(crewList, id) {
  const member = crewList?.find((row) => row.id === id);
  return member ? { i: member.i, j: member.j } : (CREW[id] || STAND);
}

export function drawCardReader(ctx, x, y, s) {
  ctx.fillStyle = '#2a241f';
  ctx.fillRect(x - 11 * s, y - 14 * s, 22 * s, 11 * s);
  ctx.fillStyle = '#9fd7e8';
  ctx.fillRect(x - 7 * s, y - 11 * s, 9 * s, 4 * s);
  ctx.fillStyle = '#3d8f4a';
  ctx.fillRect(x + 5 * s, y - 10 * s, 3 * s, 3 * s);
}

export function drawTipJar(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(214, 232, 240, 0.9)';
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 4 * s);
  ctx.lineTo(x - 5 * s, y - 18 * s);
  ctx.lineTo(x + 5 * s, y - 18 * s);
  ctx.lineTo(x + 7 * s, y - 4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8b84a';
  ctx.fillRect(x - 3 * s, y - 10 * s, 2 * s, 2 * s);
  ctx.fillRect(x + 1 * s, y - 8 * s, 2 * s, 2 * s);
  ctx.strokeStyle = '#8d5a30';
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();
}

export function drawPlancha(ctx, x, y, s) {
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(x - 16 * s, y - 8 * s, 32 * s, 7 * s);
  ctx.fillStyle = '#6e1630';
  ctx.fillRect(x - 14 * s, y - 12 * s, 28 * s, 4 * s);
  ctx.fillStyle = '#c9844a';
  ctx.fillRect(x - 12 * s, y - 11 * s, 10 * s, 2 * s);
}

export function drawPress(ctx, x, y, s) {
  ctx.fillStyle = '#76777b';
  ctx.fillRect(x - 11 * s, y - 8 * s, 22 * s, 5 * s);
  ctx.fillRect(x - 11 * s, y - 16 * s, 22 * s, 4 * s);
  ctx.fillStyle = '#c4a574';
  ctx.fillRect(x - 2 * s, y - 30 * s, 4 * s, 16 * s);
  ctx.fillStyle = '#e7c98a';
  ctx.fillRect(x - 6 * s, y - 12 * s, 12 * s, 2 * s);
}

export function drawTrayCart(ctx, x, y, s) {
  ctx.fillStyle = '#6e1630';
  ctx.fillRect(x - 14 * s, y - 16 * s, 28 * s, 10 * s);
  ctx.fillStyle = '#e7c98a';
  ctx.fillRect(x - 16 * s, y - 20 * s, 24 * s, 4 * s);
  ctx.fillStyle = '#f6e6be';
  ctx.fillRect(x - 8 * s, y - 24 * s, 10 * s, 4 * s);
  ctx.fillStyle = '#2a241f';
  ctx.beginPath();
  ctx.arc(x - 8 * s, y - 4 * s, 3.5 * s, 0, Math.PI * 2);
  ctx.arc(x + 8 * s, y - 4 * s, 3.5 * s, 0, Math.PI * 2);
  ctx.fill();
}

export function drawMegaphone(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x + 8 * s, y - 42 * s);
  ctx.rotate(-0.6);
  ctx.fillStyle = '#f4c66d';
  ctx.beginPath();
  ctx.moveTo(0, -3 * s);
  ctx.lineTo(18 * s, -9 * s);
  ctx.lineTo(18 * s, 9 * s);
  ctx.lineTo(0, 3 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6e1630';
  ctx.fillRect(-7 * s, -4 * s, 8 * s, 8 * s);
  ctx.restore();
}

export function drawMonitor(ctx, x, y, s) {
  ctx.fillStyle = '#1c2430';
  ctx.fillRect(x - 11 * s, y - 30 * s, 20 * s, 14 * s);
  ctx.fillStyle = '#67e8f9';
  ctx.fillRect(x - 9 * s, y - 28 * s, 16 * s, 9 * s);
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(x - 2 * s, y - 16 * s, 4 * s, 8 * s);
}

export function drawRingLight(ctx, x, y, s, now) {
  ctx.strokeStyle = `rgba(255, 244, 220, ${0.55 + Math.sin(now * 3) * 0.3})`;
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.beginPath();
  ctx.arc(x, y - 46 * s, 13 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2a241f';
  ctx.fillRect(x - 1.5 * s, y - 33 * s, 3 * s, 30 * s);
}

export function drawLiveBadge(ctx, x, y, s, now) {
  const pulse = 0.45 + (Math.sin(now * 5.5) + 1) * 0.27;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#c0392b';
  const w = 30 * s;
  const h = 12 * s;
  ctx.fillRect(x - w / 2, y - 58 * s, w, h);
  ctx.fillStyle = '#fff4dc';
  ctx.font = `${Math.max(8, Math.round(8 * s))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LIVE', x, y - 58 * s + h / 2);
  ctx.restore();
}

export function drawSparkles(ctx, x, y, s, now, amount = 8) {
  for (let i = 0; i < amount; i++) {
    const angle = now * 1.7 + i * (Math.PI * 2 / amount);
    const radius = (18 + (i % 3) * 7) * s;
    const px = x + Math.cos(angle) * radius;
    const py = y - 46 * s + Math.sin(angle) * radius * 0.42;
    ctx.fillStyle = i % 2 ? '#fff4dc' : '#e8b84a';
    const arm = (2 + (i % 2)) * s;
    ctx.fillRect(px - arm, py, arm * 2, Math.max(1, s));
    ctx.fillRect(px, py - arm, Math.max(1, s), arm * 2);
  }
}

export function drawLevelRing(ctx, x, y, s, age) {
  const k = Math.max(0, Math.min(1, age / 0.7));
  const ease = 1 - (1 - k) ** 3;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#fff4dc';
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  ctx.beginPath();
  ctx.arc(x, y - 48 * s, (10 + ease * 34) * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(244, 198, 109, ${0.35 * (1 - k)})`;
  ctx.beginPath();
  ctx.arc(x, y - 48 * s, (8 + ease * 12) * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawStallCart(ctx, x, y, s) {
  ctx.fillStyle = '#6e1630';
  ctx.fillRect(x - 28 * s, y - 34 * s, 56 * s, 26 * s);
  ctx.fillStyle = '#f4c66d';
  ctx.beginPath();
  ctx.moveTo(x - 36 * s, y - 34 * s);
  ctx.lineTo(x, y - 58 * s);
  ctx.lineTo(x + 36 * s, y - 34 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d7e8f2';
  ctx.fillRect(x + 6 * s, y - 48 * s, 8 * s, 12 * s);
  ctx.fillStyle = '#c9844a';
  ctx.fillRect(x + 7 * s, y - 52 * s, 6 * s, 4 * s);
  ctx.fillStyle = '#2a241f';
  ctx.beginPath();
  ctx.arc(x - 16 * s, y - 6 * s, 5 * s, 0, Math.PI * 2);
  ctx.arc(x + 16 * s, y - 6 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegacyStandIn(ctx, x, y, s, key) {
  if (key === 'grill') drawPlancha(ctx, x, y, s);
  else if (key === 'tip') drawTipJar(ctx, x, y, s);
  else if (key === 'neon') {
    ctx.fillStyle = '#67e8f9';
    ctx.fillRect(x - 18 * s, y - 22 * s, 36 * s, 8 * s);
    ctx.fillStyle = '#f4c66d';
    ctx.fillRect(x - 16 * s, y - 20 * s, 32 * s, 3 * s);
  } else if (key === 'salsa') {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x - 8 * s, y - 10 * s, 7 * s, 6 * s);
    ctx.fillStyle = '#3d8f4a';
    ctx.fillRect(x + 1 * s, y - 10 * s, 7 * s, 6 * s);
  } else if (key === 'picnic') {
    ctx.fillStyle = '#8d5a30';
    ctx.fillRect(x - 16 * s, y - 10 * s, 32 * s, 5 * s);
  } else if (key === 'speaker') {
    ctx.fillStyle = '#2a241f';
    ctx.fillRect(x - 6 * s, y - 22 * s, 12 * s, 16 * s);
    ctx.fillStyle = '#6e1630';
    ctx.beginPath();
    ctx.arc(x, y - 14 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function extraPin(ctx, x, y, s, kind) {
  if (kind === 'metals') {
    ctx.fillStyle = '#e8b84a';
    ctx.beginPath();
    ctx.arc(x - 4 * s, y - 8 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d2d0cc';
    ctx.beginPath();
    ctx.arc(x + 3 * s, y - 7 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'cannon') {
    ctx.fillStyle = '#76777b';
    ctx.fillRect(x - 4 * s, y - 14 * s, 18 * s, 5 * s);
  } else if (kind === 'meal') {
    ctx.fillStyle = '#c4a574';
    ctx.fillRect(x - 8 * s, y - 8 * s, 16 * s, 6 * s);
    ctx.fillRect(x - 6 * s, y - 14 * s, 12 * s, 6 * s);
  } else if (kind === 'clone') {
    ctx.fillStyle = '#8d5a30';
    ctx.beginPath();
    ctx.arc(x, y - 16 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x - 5 * s, y - 20 * s, 10 * s, 2 * s);
  } else if (kind === 'hacky') {
    ctx.fillStyle = '#3d8f4a';
    ctx.beginPath();
    ctx.arc(x, y - 8 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'franchise') {
    ctx.fillStyle = '#6e1630';
    ctx.fillRect(x - 1 * s, y - 20 * s, 2 * s, 16 * s);
    ctx.fillStyle = '#f4c66d';
    ctx.beginPath();
    ctx.moveTo(x, y - 20 * s);
    ctx.lineTo(x + 10 * s, y - 16 * s);
    ctx.lineTo(x, y - 12 * s);
    ctx.fill();
  }
}

function paintOr(ctx, sprite, paintFn, x, y, height) {
  if (sprite && paintFn) {
    paintFn(ctx, sprite, x, y, height);
    return true;
  }
  return false;
}

export function pushUpgradeLayers(ctx, { push, fit, pack, paint, flags, crewList, now, art, showStall }) {
  const s = fit.s;
  const put = (i, j, draw, bias = 0) => push(i, j, draw, bias);
  const legacy = [
    ['grill', flags.plancha, UPGRADES.grill],
    ['neon', flags.neon, UPGRADES.neon],
    ['tip', flags.tip, UPGRADES.tip],
    ['salsa', flags.salsa, UPGRADES.salsa],
    ['picnic', flags.picnic, UPGRADES.picnic],
    ['speaker', flags.speaker, UPGRADES.speaker],
  ];
  for (const [key, on, at] of legacy) {
    if (!on || !at) continue;
    const sprite = pack.props?.[key];
    put(at.i, at.j, () => {
      const [x, y] = fit.to(at.i, at.j);
      if (!paintOr(ctx, sprite, paint, x, y, 78 * s)) drawLegacyStandIn(ctx, x, y, s, key);
    });
  }
  if (flags.cardReader) {
    put(HOME.card.i, HOME.card.j, () => {
      const [x, y] = fit.to(HOME.card.i, HOME.card.j);
      if (!paintOr(ctx, pack.props?.cardReader, paint, x, y, 48 * s)) drawCardReader(ctx, x, y, s);
    });
  }
  if (flags.plancha && !pack.props?.grill) {
    put(UPGRADES.grill.i + 0.45, UPGRADES.grill.j + 0.25, () => {
      const [x, y] = fit.to(UPGRADES.grill.i + 0.45, UPGRADES.grill.j + 0.25);
      drawPlancha(ctx, x, y, s * 0.85);
    });
  }
  if (flags.press) {
    put(HOME.press.i, HOME.press.j, () => {
      const [x, y] = fit.to(HOME.press.i, HOME.press.j);
      if (!paintOr(ctx, pack.props?.press, paint, x, y, 52 * s)) drawPress(ctx, x, y, s);
    });
  }
  if (flags.tray) {
    put(HOME.tray.i, HOME.tray.j, () => {
      const [x, y] = fit.to(HOME.tray.i, HOME.tray.j);
      if (!paintOr(ctx, pack.props?.tray, paint, x, y, 64 * s)) drawTrayCart(ctx, x, y, s);
    });
  }
  const aaron = feet(crewList, 'aaron');
  if (flags.megaphone) {
    put(aaron.i, aaron.j, () => {
      const [x, y] = fit.to(aaron.i, aaron.j);
      if (!paintOr(ctx, pack.props?.megaphone, paint, x, y, 40 * s)) drawMegaphone(ctx, x, y, s);
    }, -20);
  }
  if (flags.monitor) {
    put(HOME.monitor.i, HOME.monitor.j, () => {
      const [x, y] = fit.to(HOME.monitor.i, HOME.monitor.j);
      if (!paintOr(ctx, pack.props?.monitor, paint, x, y, 56 * s)) drawMonitor(ctx, x, y, s);
    });
  }
  if (flags.ring) {
    put(HOME.ring.i, HOME.ring.j, () => {
      const [x, y] = fit.to(HOME.ring.i, HOME.ring.j);
      if (!paintOr(ctx, pack.props?.ring, paint, x, y, 70 * s)) drawRingLight(ctx, x, y, s, now);
    });
  }
  if (flags.research) {
    put(9.35, 8.35, () => {
      const [x, y] = fit.to(9.35, 8.35);
      ctx.fillStyle = '#6e1630';
      ctx.beginPath();
      ctx.arc(x, y - 8 * s, 11 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4c66d';
      ctx.beginPath();
      ctx.arc(x, y - 8 * s, 6 * s, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (showStall) {
    put(STALL_AT.i, STALL_AT.j, () => {
      const [x, y] = fit.to(STALL_AT.i, STALL_AT.j);
      if (!paintOr(ctx, pack.stall, paint, x, y, 150 * s)) drawStallCart(ctx, x, y, s);
    });
  }
  const pins = [
    [flags.metals, 'metals', 'jared'],
  ];
  for (const [on, kind, who] of pins) {
    if (!on) continue;
    const anchor = feet(crewList, who);
    put(anchor.i + 0.35, anchor.j + 0.2, () => {
      const [x, y] = fit.to(anchor.i + 0.35, anchor.j + 0.2);
      extraPin(ctx, x, y, s, kind);
    });
  }
  const fx = fxOf(art);
  if (flags.sizzle && now - (art._sizzleAt || 0) > (flags.bigSizzle ? 0.07 : 0.16)) {
    art._sizzleAt = now;
    const [x, y] = fit.to(UPGRADES.grill.i, UPGRADES.grill.j, 26);
    fx.sizzle(x, y - 8);
    if (flags.bigSizzle) fx.sizzle(x + 18 * s, y - 4);
  }
}

export function lineCheer(flags, person, moving) {
  if (!flags?.hype || moving) return false;
  const nearWindow = Math.hypot(person.i - WINDOW.i, person.j - WINDOW.j) < 3.4;
  const nearAaron = Math.hypot(person.i - CREW.aaron.i, person.j - CREW.aaron.j) < 2.6;
  return nearWindow || nearAaron;
}

export function drawCheerArms(ctx, x, y, s) {
  ctx.strokeStyle = '#f4c66d';
  ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, y - 28 * s);
  ctx.lineTo(x - 12 * s, y - 40 * s);
  ctx.moveTo(x + 6 * s, y - 28 * s);
  ctx.lineTo(x + 12 * s, y - 40 * s);
  ctx.stroke();
}

export function drawUpgradeOverlay(ctx, { fit, flags, crewList, now, art, owned }) {
  const s = fit.s;
  noteOwned(art, owned.rows, now);
  const fx = fxOf(art);
  const dt = art._skillFxAt == null ? 0.016 : Math.min(0.05, Math.max(0, now - art._skillFxAt));
  art._skillFxAt = now;
  for (const burst of art._upgradeBursts || []) {
    if (burst._fx) continue;
    burst._fx = true;
    const who = burst.who && CREW[burst.who] ? burst.who : (burst.stand === 'stall' ? null : burst.who);
    const at = who ? feet(crewList, who) : (burst.stand === 'stall' ? STALL_AT : STAND);
    const [x, y] = fit.to(at.i, at.j, 36);
    fx.levelUp(x, y);
  }
  fx.update(dt);
  fx.draw(ctx, { x: 0, y: 0, zoom: 1, viewportWidth: ctx.canvas?.width || 0 });
  for (const burst of art._upgradeBursts || []) {
    const who = burst.who && CREW[burst.who] ? burst.who : null;
    const at = who ? feet(crewList, who) : (burst.stand === 'stall' ? STALL_AT : { i: RIG.i, j: RIG.j });
    const [x, y] = fit.to(at.i, at.j);
    drawLevelRing(ctx, x, y, s, now - burst.t0);
  }
  if (flags.live) {
    const at = feet(crewList, 'antonio');
    const [x, y] = fit.to(at.i + 0.85, at.j - 0.15, 20);
    drawLiveBadge(ctx, x, y, s, now);
  }
  if (flags.sparkles || flags.angel) {
    const at = feet(crewList, 'west');
    const [x, y] = fit.to(at.i, at.j);
    drawSparkles(ctx, x, y, s, now, flags.sparkles ? 8 : 4);
  }
}
