// The open-air SIFE taco stand (Visual Spec v2 section 3). Origin O = tile (0,0); the counter runs along +i.
// Pieces are separate sprites so the crew can stand between the back-board and the counter.
import { hex, mix, scale, hash2, Raster, makeCanvas } from './util.js';
import { quad, box, tone, textHit } from './iso.js';

export const ST = {
  len: 6, back: -1.2, staffJ: 0.2, cFront: 2.0, cBack: 0.8, cTop: 16,
  boardH: 60, awnBack: 62, awnFront: 58, awnJ: -0.4, valance: 3, railZ: 47,
  stations: { register: 0.75, prep: 2.25, grill: 3.75, pickup: 5.25 },
};
const W = 230, H = 170, OX = 70, OY = 100;
const MAROON = hex('#6B1F2E'), MAROON_D = hex('#4A1520'), CREAM = hex('#F3E6C8'), CREAM_D = hex('#D6C6A4');
const WOOD = hex('#D4A066'), WOOD_M = hex('#A9713F'), WOOD_D = hex('#6F4628'), QUESO = hex('#F4C66D');
const STEEL = hex('#9AA0A6');

// 5x7 pixel font for the counter fascia.
const F57 = {
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function text57(s, tx, tz, x, z, pitch = 6) {
  const row = 6 - (z - tz);
  if (row < 0 || row > 6) return false;
  const col = x - tx;
  if (col < 0) return false;
  const ch = Math.floor(col / pitch), cx = col % pitch;
  if (ch >= s.length || cx >= 5) return false;
  return F57[s[ch]][row][cx] === '1';
}
// Bold 5x7: each stroke doubled one pixel to the right, 7 px pitch.
const bold57 = (s, tx, tz, x, z) => text57(s, tx, tz, x, z, 7) || text57(s, tx, tz, x - 1, z, 7);
const paw = (x, z, px, pz) => {
  const dx = x - px, dz = z - pz;
  if (dz >= 0 && dz <= 2 && dx >= 0 && dx <= 3) return !(dz === 2 && (dx === 0 || dx === 3));
  return (dz === 4 && (dx === -1 || dx === 1 || dx === 3)) || (dz === 3 && dx === 4) || (dz === 3 && dx === -2);
};

function toCanvas(r) {
  const c = makeCanvas(r.w, r.h);
  c.getContext('2d').putImageData(r.img, 0, 0);
  return c;
}

export function buildStand() {
  const { len, back, boardH, awnFront, awnJ } = ST;
  // --- Back piece: posts, menu, SIFE banner, notes, shelf, roofless header and ticket rail.
  const rb = new Raster(W, H);
  const bd = (u, v, x, y) => {
    const xi = Math.floor(u * len * 16), zi = Math.floor(v * boardH);
    for (const pi of [0, 3, 6]) if (Math.abs(xi - pi * 16) <= 1.5) return tone(xi - pi * 16 < 0 ? scale(MAROON, 1.1) : MAROON, 'sw');
    // Visible band between the crew's heads (z~38) and the awning (z~58): menu board, SIFE banner,
    // taped order slips, and a shelf of bottles and jars.
    const mx = xi - 36, bx = xi - 62;
    if (mx >= -12 && mx <= 12 && zi >= 33 && zi <= 46) {
      if (mx === -12 || mx === 12 || zi === 33 || zi === 46) return tone(WOOD_M, 'sw');
      if (textHit('TACOS', -9, 40, mx, zi)) return CREAM;
      if (zi < 39 && zi % 2 === 0 && mx > -10 && mx < 10 && hash2(mx, zi, 3) < 0.7) return CREAM_D;
      return hex('#2B3431');
    }
    if (bx >= -11 && bx <= 11 && zi >= 34 && zi <= 46) {
      if (bx === -11 || bx === 11 || zi === 34 || zi === 46) return QUESO;
      if (textHit('SIFE', -7, 38, bx, zi)) return CREAM;
      return MAROON;
    }
    if (zi === 30 || zi === 31) return tone(WOOD_D, 'sw');
    if (zi > 31 && zi < 36 && (xi * 7) % 9 < 3 && (mx < -13 || mx > 13) && (bx < -12 || bx > 12)) return hex(['#D8452F', '#3E8E3A', '#E3B341', '#F3E6C8', '#C9A06C'][xi % 5]);
    if (zi >= 38 && zi <= 44 && hash2(xi >> 2, 1, 9) < 0.5 && xi % 4 !== 3 && (mx < -13 || mx > 13) && (bx < -12 || bx > 12)) return zi === 44 ? hex('#B8A888') : CREAM;
    if (zi > 18 && zi < 29 && (xi % 9 === 2 || xi % 9 === 3)) return tone(scale(hex('#5A3C2A'), 0.75), 'sw');
    const pl = Math.floor(xi / 6);
    let c = scale(hex('#5A3C2A'), 1 + (hash2(pl, 2, 4) - 0.5) * 0.16);
    if (xi % 6 === 0) c = scale(c, 0.62);
    else if (hash2(xi, zi >> 1, 43) < 0.16) c = scale(c, 1.18);
    return tone(c, 'sw');
  };
  quad(rb, OX, OY, [0, back, 0], [len, 0, 0], [0, 0, boardH], bd);
  quad(rb, OX, OY, [len, back, 0], [0, -0.12, 0], [0, 0, boardH], () => tone(MAROON, 'se'));
  // Roofless stage: a narrow rear header leaves the entire worker row open to the sky.
  // The string lights hang between the two end poles; no canopy surface projects over the staff.
  quad(rb, OX, OY, [-0.15, back, awnFront], [len + 0.3, 0, 0], [0, 0, 2], (u, v) => v > 0.65 ? CREAM : MAROON);
  // Ticket rail: a thin wooden bar on two hangers under the awning edge.
  quad(rb, OX, OY, [0.15, awnJ, ST.railZ], [len - 0.3, 0, 0], [0, 0, 1.2], () => WOOD_D);
  for (const hi of [0.2, len - 0.2]) quad(rb, OX, OY, [hi, awnJ, ST.railZ], [0.05, 0, 0], [0, 0, awnFront - ST.valance - ST.railZ], () => WOOD_D);
  const backPiece = toCanvas(rb);

  // --- Cooler (staff side, behind Matt).
  const rcl = new Raster(W, H);
  box(rcl, OX, OY, 5.55, 6.3, -1.15, -0.6, 0, 9, (f, u, v) => tone(f === 'top' ? hex('#8FD0CA') : v > 0.72 ? CREAM : hex('#5BA29C'), f));
  const cooler = toCanvas(rcl);

  // --- Counter with fascia + static top fixtures.
  const rc = new Raster(W, H);
  const { cBack, cFront, cTop } = ST;
  box(rc, OX, OY, 0, len, cBack, cFront, 0, cTop, (f, u, v, L, h) => {
    const xi = Math.floor(u * L), zi = Math.floor(v * h);
    if (f === 'top') {
      const pl = Math.floor(v * h / 4);
      let c = scale(WOOD, 1 + (hash2(pl, 7, 1) - 0.5) * 0.08);
      if (Math.floor(v * h) % 4 === 0) c = scale(c, 0.78);
      if (hash2(Math.floor(u * L), Math.floor(v * h), 71) < 0.12) c = scale(c, 0.88);
      if (v > 0.93) c = mix(c, [255, 240, 210], 0.3);
      return c;
    }
    if (f === 'se') return zi >= h - 1 ? WOOD_M : WOOD_D;
    if (zi >= h - 1) return WOOD;
    if (zi === 0) return scale(MAROON_D, 0.8);
    if (xi < 2 || xi > L - 3) return WOOD_M;
    if (zi === 1 || zi === h - 2 || xi === 2 || xi === L - 3) return QUESO;
    if (bold57('SIFE TACOS', 13, 5, xi, zi)) return CREAM;
    if (bold57('SIFE TACOS', 14, 4, xi, zi)) return scale(MAROON_D, 0.7);
    if (paw(xi, zi, 5, 5) || paw(xi, zi, L - 9, 5)) return CREAM_D;
    return MAROON;
  });
  const top = cTop;
  // Register (Jared): body + teal screen.
  box(rc, OX, OY, 0.45, 1.05, 0.9, 1.35, top, top + 7, (f, u, v) => tone(f === 'top' ? hex('#4A4A52') : v > 0.55 && f === 'sw' ? hex('#2E9C95') : hex('#2B2B33'), f));
  // Topping bins (salsa / cilantro / cheese) by Phillip.
  [['#E0533F', 2.55], ['#5E8A4A', 2.85], ['#F4C66D', 3.15]].forEach(([c, i]) =>
    box(rc, OX, OY, i - 0.13, i + 0.13, 1.0, 1.3, top, top + 2, (f) => tone(f === 'top' ? hex(c) : STEEL, f)));
  // Griddle (Ali).
  box(rc, OX, OY, 3.25, 4.35, 0.95, 1.5, top, top + 2, (f, u, v) => (f === 'top' ? scale(hex('#2B2628'), 1 + (hash2(Math.floor(u * 18), Math.floor(v * 9), 2) - 0.5) * 0.2) : tone(hex('#3A3436'), f)));
  // Heat-lamp shelf (Matt): two posts and a hood.
  box(rc, OX, OY, 4.85, 5.7, 0.95, 1.4, top, top + 1, (f) => tone(STEEL, f));
  for (const pi of [4.88, 5.62]) box(rc, OX, OY, pi, pi + 0.05, 1.15, 1.2, top, top + 12, (f) => tone(hex('#5A5E64'), f));
  box(rc, OX, OY, 4.85, 5.7, 1.0, 1.35, top + 12, top + 14, (f) => tone(hex('#C9CDD2'), f));
  // Napkins, plates, a row of ingredient pans along the back edge, sauce bottles: a busy line.
  box(rc, OX, OY, 1.25, 1.55, 1.55, 1.8, top, top + 3, (f) => tone(hex('#F4F0E6'), f));
  const pans = ['#E0533F', '#F4C66D', '#5E8A4A', '#F3E6C8', '#8A4A2A', '#E8B85A', '#6FA34A', '#D8452F'];
  pans.forEach((c, n) => {
    const i = 0.15 + n * 0.36 + (n > 3 ? 1.5 : 0);
    if (i > 4.7) return;
    box(rc, OX, OY, i, i + 0.3, 0.84, 1.0, top, top + 2, (f, u, v) => (f === 'top' ? (hash2(Math.floor(u * 5), Math.floor(v * 3), n) < 0.5 ? scale(hex(c), 1.12) : hex(c)) : tone(STEEL, f)));
  });
  [['#D8452F', 4.55], ['#3E8E3A', 4.68], ['#F4C66D', 1.95], ['#D8452F', 2.08]].forEach(([c, i]) => {
    box(rc, OX, OY, i, i + 0.08, 1.6, 1.68, top, top + 6, (f) => tone(hex(c), f));
    box(rc, OX, OY, i + 0.02, i + 0.06, 1.62, 1.66, top + 6, top + 8, (f) => tone(hex('#F3E6C8'), f));
  });
  for (const i of [0.15, 5.2]) box(rc, OX, OY, i, i + 0.4, 1.55, 1.9, top, top + 1, (f) => tone(hex('#EDE6D6'), f));
  const counter = toCanvas(rc);

  // --- Chalkboard A-frame beside the queue head.
  const ra = new Raster(W, H);
  quad(ra, OX, OY, [-2.2, 0.25, 0], [1.15, 0, 0], [0, -0.12, 22], (u, v) => {
    const xi = Math.floor(u * 18.4), zi = Math.floor(v * 22);
    if (xi === 0 || xi === 17 || zi === 21 || zi < 3) return tone(WOOD_M, 'sw');
    if (zi < 4) return tone(WOOD_M, 'sw');
    if (textHit('TACO', 2, 14, xi, zi)) return CREAM;
    if (textHit('$2', 2, 6, xi, zi)) return QUESO;
    // chalk doodle taco
    if (zi >= 6 && zi <= 8 && xi >= 10 && xi <= 15) { if (zi === 6 && (xi === 10 || xi === 15)) return hex('#2B3431'); return zi === 8 ? hex('#E8B85A') : xi % 2 ? hex('#6FA34A') : hex('#ED6658'); }
    if (zi === 12 && xi > 1 && xi < 16) return hex('#ED6658');
    return hex('#2B3431');
  });
  const aframe = toCanvas(ra);

  // --- Antonio's workstation: four visible legs, keyboard, raised lid and sticker panel.
  const rt = new Raster(W, H);
  for (const [i, j] of [[-3.65, -1.5], [-2.1, -1.5], [-3.65, -0.55], [-2.1, -0.55]])
    box(rt, OX, OY, i, i + 0.08, j, j + 0.08, 0, 12, (f) => tone(hex('#292832'), f));
  box(rt, OX, OY, -3.7, -2.0, -1.55, -0.5, 12, 14, (f) => tone(f === 'top' ? WOOD : WOOD_D, f));
  box(rt, OX, OY, -3.12, -2.35, -1.22, -0.8, 14, 15, (f, u, v) => {
    if (f !== 'top') return hex('#343743');
    return Math.floor(u * 12) % 2 && Math.floor(v * 6) % 2 ? hex('#A4C5C4') : hex('#444B58');
  });
  quad(rt, OX, OY, [-2.92, -0.68, 15], [0.85, 0, 0], [0, 0.08, 12], (u, v) => {
    const x = Math.floor(u * 13), y = Math.floor(v * 12);
    if (x === 0 || x >= 12 || y === 0 || y >= 11) return hex('#252833');
    if (x < 2 || x > 10) return hex('#485B68');
    // Bright screen with short terminal lines; the lower bezel carries the stickers.
    if (y >= 3 && y <= 9) {
      if (y % 2 === 1 && x >= 3 && x <= 5 + (y % 4)) return hex('#D4FFF0');
      return y > 6 ? hex('#52BDB8') : hex('#78E3D3');
    }
    // Camera-facing laptop lid: three bold stickers with contrasting outlines.
    if (x >= 4 && x <= 6 && y === 2) return MAROON;
    if (x >= 8 && y === 2) return hex('#7CFFB2');
    if (x >= 3 && x <= 4 && y === 1) return hex('#F27878');
    return hex('#647686');
  });
  // A narrow mint keyboard edge echoes the screen without reading as a second monitor.
  box(rt, OX, OY, -3.15, -3.08, -1.22, -0.8, 15, 16, () => hex('#7CFFB2'));
  box(rt, OX, OY, -3.58, -3.4, -0.68, -0.5, 14, 18, (f) => tone(CREAM, f));
  // Low stool: its seat stays below Antonio's torso, preserving his face in the shared table sprite.
  box(rt, OX, OY, -3.15, -2.6, -2.0, -1.45, 2, 4, (f) => tone(hex('#34323D'), f));
  const table = toCanvas(rt);

  return { backPiece, cooler, counter, aframe, table, ox: OX, oy: OY };
}

// Clearance checks from spec P1 (screen-space, at a station's i).
export function assertClearances(tallestCrewZ) {
  const i = ST.stations.prep;
  const toqueY = (i + ST.staffJ) * 8 - tallestCrewZ;
  const railY = (i + ST.awnJ) * 8 - ST.railZ;
  const valY = (i + ST.awnJ) * 8 - (ST.awnFront - ST.valance);
  const res = { awning: toqueY - valY, railToToque: toqueY - railY, railToValance: railY - valY };
  console.assert(res.awning >= 4, 'P1 awning clearance', res);
  console.assert(res.railToToque >= 6 && res.railToValance >= 6, 'P1 ticket rail clearance', res);
  return res;
}
