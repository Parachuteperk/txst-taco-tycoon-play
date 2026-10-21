// Characters: ~20x36-scale humans (enlarged from spec's 16x32 so faces read; see report) built from parts (legs, torso, arms, head, hair, face, props),
// baked per pose into small canvases. Feet sit on row FY; all humans share one scale.
import { hex, mix, scale, makeCanvas, rng } from './util.js';

export const FW = 30, FH = 58, FY = 54, AX = 14; // frame size, feet row, anchor x
const BX = 4; // body-box x offset inside the frame

const ramp = (base, lit, shade) => {
  const b = hex(base);
  return { lit: lit ? hex(lit) : mix(scale(b, 1.16), [255, 226, 166], 0.12), base: b, shade: shade ? hex(shade) : mix(scale(b, 0.72), [74, 63, 107], 0.12) };
};
const SKIN = [
  ['#F0D2B8', '#D9B394'], ['#E8B896', '#C9946F'], ['#C68A5E', '#A06C45'], ['#A8704A', '#85553A'], ['#6E4630', '#553422'],
].map(([l, s]) => ({ lit: mix(hex(l), [255, 236, 210], 0.25), base: hex(l), shade: hex(s) }));

// ---------------------------------------------------------------------------------------------
// Character definitions. Values follow Visual Spec v2 section 6 plus Aaron's overrides (Ali, Mrs. West).
export const CREW = {
  jared: { name: 'JARED', accent: '#2E9C95', skin: 1, hair: ramp('#5A3A22'), hairStyle: 'short', shirt: ramp('#2E9C95', '#45B5AD', '#22827C'), collar: '#F3E6C8', pants: ramp('#3B4F7A'), shoes: '#2A2228', hat: 'cap', hatColor: ramp('#2E9C95', '#4CB8B0', '#22827C') },
  phillip: { name: 'PHILLIP', accent: '#F4C66D', skin: 1, hair: ramp('#4A3020'), hairStyle: 'short', shirt: ramp('#F3E6C8'), apron: ramp('#F4C66D', '#FFDB8A', '#D9A94E'), pants: ramp('#2B2B33'), shoes: '#1E1A20', hat: 'toque' },
  ali: { name: 'ALI', accent: '#E0533F', skin: 2, hair: ramp('#141018'), hairStyle: 'short', brows: true, stubble: true, shirt: ramp('#2B2B33', '#3E3E48', '#1E1E24'), pants: ramp('#3B4F7A'), shoes: '#1E1A20', hat: 'bandana', hatColor: ramp('#E0533F', '#F07058', '#B83F2F') },
  matt: { name: 'MATT', accent: '#5E8A4A', skin: 1, hair: ramp('#7A4A26'), hairStyle: 'spiky', shirt: ramp('#F3EEE4'), apron: ramp('#5E8A4A', '#76A35E', '#476B38'), pants: ramp('#3B4F7A'), shoes: '#2A2228', towel: true },
  aaron: { name: 'AARON', accent: '#B8344A', skin: 0, hair: ramp('#E8C460', '#F6DC8A', '#C29A40'), hairStyle: 'short', shirt: ramp('#6B1F2E', '#86303F', '#4A1520'), pants: ramp('#A08D6A'), shoes: '#3A2A20', headset: true, clipboard: true },
  antonio: { name: 'ANTONIO', accent: '#F2D23A', skin: 2, hair: ramp('#1A1A1E'), hairStyle: 'short', shirt: ramp('#2A2E3D', '#41485C', '#1B1E2B'), pants: ramp('#2B2B33'), shoes: '#1E1A20', hood: true, glasses: true, seated: true },
  west: { name: 'MRS. WEST', accent: '#B79AD8', skin: 0, hair: ramp('#8A3B22', '#B5582F', '#5E2616'), hairStyle: 'bouffant', shirt: ramp('#6A0DAD', '#A45FC9', '#480B75'), blouse: '#F3EEE4', pants: ramp('#3A3448'), shoes: '#5A2A34', skinny: true, purse: true, lipstick: true },
};

const SHIRTS = ['#C23B48', '#E3B341', '#2E8A87', '#F3EEE4', '#8A8C92', '#2F3D66', '#D9733A', '#4E8A4A', '#6B1F2E', '#5C7FB0'];
const PANTS = ['#3B4F7A', '#2B2B33', '#A08D6A', '#5A7AA6'];
const HAIRS = ['#2A1D17', '#5A3A22', '#C9A050', '#141018', '#8A4A2A', '#3A2A20'];
const PACKS = ['#2B2B33', '#3E5A3A', '#6B1F2E', '#4A4A52', '#C9A050', '#2F3D66'];
const STYLES = ['short', 'long', 'curly', 'bun', 'buzz', 'pony'];

export function randomCustomer(seed) {
  const R = rng(seed * 7919 + 13);
  const pick = (a) => a[(R() * a.length) | 0];
  const txst = R() < 0.2;
  return {
    customer: true, skin: (R() * 5) | 0, hair: ramp(pick(HAIRS)), hairStyle: pick(STYLES),
    shirt: ramp(txst ? '#6B1F2E' : pick(SHIRTS)), txst, pants: ramp(pick(PANTS)), shorts: R() < 0.55,
    shoes: R() < 0.6 ? '#EDEAE2' : '#2A2228', socks: R() < 0.5,
    pack: R() < 0.4 ? ramp(pick(PACKS)) : null, hat: R() < 0.15 ? 'cap' : null, hatColor: ramp(pick(['#6B1F2E', '#2F3D66', '#EDEAE2', '#1E1E24'])),
    phones: R() < 0.1, board: R() < 0.05,
  };
}

// ---------------------------------------------------------------------------------------------
// Pose: { view: 'front'|'back', walk: frame 0..5 or -1, bob: 0|-1, arms: 'down'|'fwd'|'up'|'tap'|'reach'|'point'|'cheer'|'swing0'|'swing1'|'out',
//         expr: 'neutral'|'happy'|'focused'|'panic'|'blush', blink, tail: 0|1, hold }
// Body box is 20 sp wide (x 0..19); rows are absolute: hair 19.., head 22-33, neck 34, torso 35-45, legs 46-52, shoes 53-54.
const WALK = [[-2, 2, 0, -1], [-1, 1, -1, 0], [1, -1, -1, 0], [2, -2, -1, 0], [1, -1, 0, -1], [-1, 1, 0, -1]];
function paint(def, pose) {
  const cv = makeCanvas(FW, FH);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const P = (x, y, w, h, c) => {
    if (!c || w <= 0 || h <= 0) return;
    ctx.fillStyle = Array.isArray(c) ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : c;
    ctx.fillRect(BX + x, y, w, h);
  };
  const back = pose.view === 'back';
  const sk = SKIN[def.skin];
  const sh = def.shirt, pa = def.pants;
  const skinny = !!def.skinny;
  const drop = def.seated ? (def.hood ? 6 : 10) : 0;
  const w = pose.walk >= 0 ? pose.walk : -1;
  const bob = (pose.bob || 0) + (w === 1 || w === 4 ? -1 : 0);
  const b = bob + drop; // upper-body offset
  const H = def.hair, hs = def.hairStyle;
  const dk = (c, k = 0.55) => scale(Array.isArray(c) ? c : hex(c), k);

  // ---- legs + shoes
  if (!def.seated) {
    let [lx, rx, ly, ry] = w >= 0 ? WALK[w] : [0, 0, 0, 0];
    if (def.power) { lx *= 1.5; rx *= 1.5; }
    lx = Math.round(lx); rx = Math.round(rx);
    const lw = skinny ? 2 : 3, top = 46 + (pose.bob || 0);
    const leg = (x, y, col) => {
      const hgt = 53 - top + y;
      if (def.customer && def.shorts) { P(x, top, lw, 3, col); P(x, top + 3, lw, hgt - 3, x < 9 ? sk.base : sk.shade); if (def.socks) P(x, 51 + y, lw, 2, '#F3EEE4'); }
      else P(x, top, lw, hgt, col);
    };
    const L = skinny ? 7 : 6, Rr = skinny ? 11 : 11;
    leg(L + lx, ly, pa.base);
    leg(Rr + rx, ry, pa.shade);
    if (!(def.customer && def.shorts)) P(L + lx, top, 1, 53 - top + ly, pa.lit);
    const shoe = def.shoes;
    P(L - 1 + lx, 53 + ly, lw + 2, 2, shoe); P(L - 1 + lx, 53 + ly, lw + 1, 1, scale(hex(shoe), 1.25));
    P(Rr + rx, 53 + ry, lw + 1, 2, dk(shoe, 0.85));
  } else {
    P(5, 44 + drop, 10, 3, pa.base); P(12, 44 + drop, 3, 3, pa.shade);
    P(3, 46 + drop, 4, 2, def.shoes);
  }

  // ---- torso
  const tx = skinny ? 6 : 5, tw = skinny ? 8 : 10, ty = 35 + b;
  if (back && def.pack) { P(tx - 1, ty + 1, tw + 2, 9, def.pack.base); P(tx - 1, ty + 1, tw + 2, 2, def.pack.lit); P(tx + tw - 2, ty + 1, 3, 9, def.pack.shade); P(tx + 2, ty + 6, tw - 4, 1, def.pack.shade); }
  else {
    P(tx, ty, tw, 11, sh.base);
    P(tx + tw - 3, ty, 3, 11, sh.shade);
    P(tx, ty, 3, 2, sh.lit); P(tx, ty + 2, 1, 6, sh.lit);
    P(tx, ty + 10, tw, 1, pa.shade);
    if (!back) {
      P(tx + 3, ty, 4, 1, def.collar || sh.shade); P(tx + 4, ty, 2, 1, sk.shade);
      if (def.txst) { P(tx + 3, ty + 3, 3, 2, '#F4C66D'); P(tx + 4, ty + 2, 1, 1, '#F4C66D'); }
      if (def.blouse) { P(tx + 3, ty, 3, 8, def.blouse); for (let k = 0; k < 3; k++) P(tx + 3 + k, ty + 1, 1, 1, '#FFFFFF'); }
      if (def.apron) {
        const A = def.apron;
        P(tx + 1, ty + 2, tw - 2, 10, A.base); P(tx + tw - 3, ty + 2, 2, 10, A.shade); P(tx + 1, ty + 2, 2, 3, A.lit);
        P(tx + 1, ty, 1, 2, A.shade); P(tx + tw - 2, ty, 1, 2, A.shade);
        P(tx + 3, ty + 7, tw - 6, 1, A.shade);
      }
      if (def.pack) { P(tx + 1, ty, 1, 5, def.pack.shade); P(tx + tw - 2, ty, 1, 5, def.pack.shade); }
      if (def.hood) { P(tx + 3, ty + 1, 1, 4, '#D9D6E0'); P(tx + 6, ty + 1, 1, 4, '#D9D6E0'); P(tx + 2, ty + 7, tw - 4, 3, sh.shade); }
      if (def === CREW.west) for (let k = 0; k < 4; k++) P(tx + 2 + k, ty + 1 + (k === 0 || k === 3 ? 0 : 1), 1, 1, '#FFFFFF');
    }
  }

  // ---- arms
  const A = pose.arms || 'down';
  const arm = (side, mode) => {
    const aw = skinny ? 1 : 2;
    const x = side < 0 ? tx - aw : tx + tw;
    const sleeve = side < 0 ? sh.base : sh.shade, skn = side < 0 ? sk.base : sk.shade;
    const y = ty;
    if (mode === 'up') { P(x, y - 4, aw, 4, sleeve); P(x, y - 10, aw, 6, skn); P(x - (side < 0 ? 0 : 0), y - 12, aw + 1, 2, skn); return; }
    if (mode === 'point') { P(x, y, aw, 3, sleeve); P(side < 0 ? x - 7 : x, y + 2, 8, 2, skn); P(side < 0 ? x - 8 : x + 8, y + 2, 1, 1, skn); return; }
    P(x, y, aw, 4, sleeve);
    if (mode === 'fwd' || mode === 'tap' || mode === 'reach' || mode === 'out') {
      const dy = mode === 'tap' ? 1 : 0;
      if (side < 0) {
        const ext = mode === 'reach' ? 4 : mode === 'out' ? 2 : 2;
        P(x - ext, y + 4 + dy, aw + ext, 2, skn); P(x - ext - 1, y + 4 + dy, 2, 3, skn);
      } else {
        const ext = mode === 'reach' ? 6 : mode === 'out' ? -2 : 4;
        if (ext > 0) { P(x - ext, y + 5 + dy, ext + aw, 2, skn); P(x - ext - 1, y + 5 + dy, 2, 2, skn); }
        else { P(x, y + 4, aw + 2, 2, skn); }
      }
      return;
    }
    const sw = mode === 'swing0' ? 1 : mode === 'swing1' ? -1 : 0;
    const off = side < 0 ? sw : -sw;
    P(x + (off > 0 ? -1 : 0) * 0, y + 4, aw, 4 + (off > 0 ? -1 : 0), skn);
    P(x + (off > 0 ? -1 : off < 0 ? 0 : 0), y + 8 + (off > 0 ? -1 : 0), aw, 2, skn);
  };
  const armsL = A === 'cheer' ? 'up' : A;
  const armsR = A === 'cheer' ? 'up' : A === 'up' || A === 'point' ? 'down' : A === 'swing0' ? 'swing1' : A === 'swing1' ? 'swing0' : A === 'reach' ? 'fwd' : A;
  arm(1, back ? (armsR === 'point' ? 'out' : armsR) : armsR);

  // ---- head
  const hy = 22 + b;
  P(7, 34 + b, 6, 1, sk.shade);
  P(5, hy, 10, 1, sk.base); P(4, hy + 1, 12, 9, sk.base); P(5, hy + 10, 10, 1, sk.base); P(6, hy + 11, 8, 1, sk.base);
  P(12, hy + 1, 4, 9, sk.shade); P(12, hy + 10, 3, 1, sk.shade); P(11, hy + 11, 3, 1, sk.shade);
  P(5, hy + 1, 2, 3, sk.lit);
  if (!back) P(16, hy + 5, 1, 2, sk.shade);
  else { P(3, hy + 5, 1, 2, sk.base); }
  if (!back) {
    const E = '#1E1A20', ex = [6, 10], ey = hy + 4;
    const ex2 = pose.expr || 'neutral';
    const browC = scale(H.base, hs === 'bouffant' ? 0.7 : 0.8);
    if (pose.blink) { P(ex[0], ey + 1, 2, 1, E); P(ex[1], ey + 1, 2, 1, E); }
    else if (ex2 === 'happy' || ex2 === 'blush') { for (const x of ex) { P(x, ey + 1, 2, 1, E); P(x - 1, ey + 2, 1, 1, E); P(x + 2, ey + 2, 1, 1, E); } }
    else if (ex2 === 'panic') { for (const x of ex) { P(x, ey, 2, 3, '#FFFFFF'); P(x + 1, ey + 1, 1, 1, E); } P(14, hy + 1, 1, 2, '#9FD9F5'); P(14, hy + 3, 1, 1, '#CFF0FF'); }
    else if (ex2 === 'focused') { for (const x of ex) { P(x, ey + 1, 2, 2, E); } P(5, ey - 1, 3, 1, browC); P(9, ey - 1, 3, 1, browC); P(7, ey, 1, 1, browC); P(9, ey, 1, 1, browC); }
    else { for (const x of ex) { P(x, ey, 2, 3, E); P(x, ey, 1, 1, '#FFFFFF'); } }
    if (ex2 !== 'focused' && !pose.blink) { P(6, ey - 2, 2, 1, browC); P(10, ey - 2, 2, 1, browC); if (def.brows) { P(5, ey - 2, 3, 1, '#141018'); P(10, ey - 2, 3, 1, '#141018'); } }
    P(9, hy + 7, 1, 1, sk.shade);
    const mc = def.lipstick ? '#C2453B' : dk(sk.base, 0.5);
    if (ex2 === 'happy' || ex2 === 'blush') { P(7, hy + 8, 1, 1, mc); P(10, hy + 8, 1, 1, mc); P(8, hy + 9, 2, 1, '#8A2A2A'); P(8, hy + 9, 1, 1, '#E86A6A'); }
    else if (ex2 === 'panic') { P(8, hy + 8, 2, 2, '#5A1A1A'); }
    else P(8, hy + 9, 2, 1, mc);
    const cheek = ex2 === 'blush' ? '#F28FA0' : '#EE9A88';
    P(5, hy + 7, ex2 === 'blush' ? 2 : 1, 1, cheek); P(ex2 === 'blush' ? 11 : 12, hy + 7, ex2 === 'blush' ? 2 : 1, 1, cheek);
    if (def.stubble) { for (let x = 5; x < 14; x += 2) P(x, hy + 9 + (x > 6 && x < 12 ? 1 : 0), 1, 1, scale(sk.shade, 0.72)); P(8, hy + 8, 2, 1, scale(sk.shade, 0.7)); }
    if (def.glasses) { P(5, ey - 1, 4, 1, '#2C2C34'); P(9, ey - 1, 4, 1, '#2C2C34'); P(5, ey + 3, 4, 1, '#2C2C34'); P(9, ey + 3, 4, 1, '#2C2C34'); P(5, ey, 1, 3, '#2C2C34'); P(8, ey, 2, 1, '#2C2C34'); P(12, ey, 1, 3, '#2C2C34'); }
  }

  // ---- hair
  if (hs === 'bouffant') {
    // Piled-high teased auburn updo: tall dome + top knot, tucked at the sides.
    const cx = 10, lobes = [[cx + 0.5, hy - 14, 4.4, 3.8], [cx, hy - 4, 8, 8.2], [cx - 3.5, hy - 8, 4.6, 4.8], [cx + 3.8, hy - 8.5, 4.6, 4.8], [4, hy + 3, 2.2, 3.8], [15.5, hy + 3, 2.4, 4.2]];
    for (let y = hy - 19; y <= hy + 8; y++) for (let x = -1; x <= 20; x++) {
      let n = null;
      for (const [lx, ly, rx, ry] of lobes) { const dx = (x + 0.5 - lx) / rx, dy = (y + 0.5 - ly) / ry; if (dx * dx + dy * dy < 1) { n = [dx, dy]; break; } }
      if (!n) continue;
      if (!back && x >= 5 && x <= 14 && y >= hy + 3) continue;
      const curl = ((x * 7 + y * 13) % 6 === 0 ? 0.35 : 0) - (((x + y * 3) % 5) === 0 ? 0.25 : 0);
      const l = -n[0] * 0.6 - n[1] * 0.75 + curl;
      P(x, y, 1, 1, l > 0.5 ? H.lit : l < -0.25 ? H.shade : H.base);
    }
  } else if (back) {
    P(4, hy - 2, 12, 11, H.base); P(5, hy - 3, 10, 1, H.base); P(12, hy - 2, 4, 11, H.shade); P(5, hy - 3, 4, 2, H.lit);
    if (hs === 'long' || hs === 'curly') { P(3, hy, 14, 14, H.base); P(13, hy, 4, 14, H.shade); }
    if (hs === 'curly') for (let k = 0; k < 7; k++) P(3 + k * 2, hy - 4 + (k % 2), 2, 2, H.base);
    if (hs === 'pony') { P(8, hy + 7, 3, 7, H.base); P(10, hy + 7, 1, 7, H.shade); }
    if (hs === 'bun') { P(7, hy - 6, 6, 4, H.base); P(7, hy - 6, 2, 2, H.lit); }
    if (hs === 'spiky') for (let k = 0; k < 6; k++) P(4 + k * 2, hy - 5 + (k % 2), 2, 3, k < 3 ? H.lit : H.base);
    if (hs === 'buzz') { P(4, hy - 2, 12, 11, mix(H.base, sk.base, 0.45)); }
  } else {
    P(4, hy - 2, 12, 4, H.base); P(5, hy - 3, 10, 1, H.base);
    P(4, hy + 2, 1, 4, H.base); P(13, hy + 1, 3, 6, H.shade); P(12, hy + 1, 1, 2, H.shade);
    if (!def.hat) { P(5, hy + 1, 5, 1, H.base); P(5, hy + 2, 2, 1, H.base); }
    P(5, hy - 3, 5, 2, H.lit);
    if (hs === 'buzz') { P(4, hy - 2, 12, 4, mix(H.base, sk.base, 0.45)); P(13, hy + 1, 3, 6, mix(H.shade, sk.shade, 0.4)); }
    if (hs === 'long') { P(3, hy + 1, 2, 13, H.base); P(14, hy + 1, 3, 14, H.shade); P(3, hy + 1, 1, 6, H.lit); }
    if (hs === 'curly') { P(3, hy - 5, 14, 6, H.base); for (let k = 0; k < 7; k++) P(3 + k * 2, hy - 6 + (k % 2), 2, 2, k < 3 ? H.lit : H.base); P(2, hy + 1, 3, 9, H.base); P(14, hy + 1, 3, 9, H.shade); }
    if (hs === 'bun') { P(7, hy - 7, 6, 4, H.base); P(7, hy - 7, 2, 2, H.lit); }
    if (hs === 'pony') { P(15, hy + 2, 2, 8, H.shade); }
    if (hs === 'spiky') { for (let k = 0; k < 6; k++) { P(4 + k * 2, hy - 6 + (k % 2) * 2, 2, 4, k < 3 ? H.lit : H.base); } }
  }
  // ---- headwear
  if (def.hat === 'cap') {
    const C = def.hatColor;
    P(4, hy - 4, 12, 5, C.base); P(5, hy - 5, 10, 1, C.base); P(12, hy - 4, 4, 5, C.shade); P(5, hy - 5, 4, 2, C.lit);
    if (!back) { P(0, hy + 1, 6, 1, C.shade); P(1, hy, 4, 1, C.base); P(9, hy - 3, 2, 2, '#F3E6C8'); } else P(14, hy + 1, 5, 1, C.shade);
  }
  if (def.hat === 'bandana') {
    const C = def.hatColor;
    P(4, hy - 3, 12, 5, C.base); P(5, hy - 4, 10, 1, C.base); P(12, hy - 3, 4, 5, C.shade); P(5, hy - 4, 5, 1, C.lit);
    for (const [x, y] of [[6, hy - 2], [9, hy], [11, hy - 2], [13, hy]]) P(x, y, 1, 1, '#F3E6C8');
    const t = pose.tail || 0;
    P(16, hy - 1 + t, 2, 2, C.base); P(17, hy + 1 + t, 2, 1, C.shade); P(18, hy + t, 1, 2, C.shade);
  }
  if (def.hat === 'toque') {
    const wob = pose.tail || 0;
    P(5, hy - 4, 10, 4, '#FFFFFF'); P(12, hy - 4, 3, 4, '#DDD6CA'); P(5, hy - 1, 10, 1, '#DDD6CA');
    P(4 + wob, hy - 10, 12, 6, '#FFFFFF'); P(3 + wob, hy - 9, 14, 4, '#FFFFFF'); P(5 + wob, hy - 12, 10, 2, '#FFFFFF');
    P(12 + wob, hy - 11, 4, 7, '#DDD6CA'); P(7 + wob, hy - 9, 1, 4, '#EFEBE3'); P(10 + wob, hy - 10, 1, 5, '#EFEBE3');
  }
  if (def.hood) {
    const C = def.shirt;
    P(5, hy - 4, 10, 2, C.base); P(4, hy - 2, 12, 2, C.base); P(3, hy, 2, 11, C.base); P(15, hy, 2, 11, C.shade);
    P(12, hy - 4, 4, 4, C.shade); P(5, hy - 4, 4, 1, C.lit); P(4, hy, 1, 4, C.lit);
    if (!back) { P(5, hy + 7, 2, 2, '#88C8A2'); P(6, hy + 10, 6, 1, '#94CFAC'); }
  }
  if (def.headset) {
    P(4, hy - 3, 1, 3, '#29202C'); P(5, hy - 4, 10, 1, '#29202C'); P(15, hy - 3, 1, 3, '#29202C');
    if (!back) { P(15, hy + 3, 2, 4, '#29202C'); P(16, hy + 4, 1, 2, '#6B1F2E'); P(9, hy + 8, 6, 1, '#29202C'); P(8, hy + 8, 1, 1, '#ED6658'); }
    else { P(3, hy + 3, 2, 4, '#29202C'); }
  }
  if (def.phones) { P(4, hy - 3, 12, 1, '#1E1E24'); P(3, hy + 3, 2, 4, '#1E1E24'); P(15, hy + 3, 2, 4, '#1E1E24'); }

  // ---- left arm last (lit side, in front)
  arm(-1, back ? (armsL === 'point' ? 'out' : armsL) : armsL);

  // ---- props
  if (def.towel) { const t = pose.tail || 0; P(tx - 2, ty - 1, 5, 2, '#FFFFFF'); P(tx - 2, ty + 1, 3, 4 + t, '#FFFFFF'); P(tx - 2, ty + 1, 1, 4 + t, '#E6E2DA'); }
  if (def.clipboard && !back) {
    const cx = A === 'point' ? tx - 5 : tx - 6;
    P(cx, ty + 2, 6, 9, '#A9713F'); P(cx + 1, ty + 3, 4, 7, '#F3E6C8'); P(cx + 2, ty + 1, 2, 1, '#9AA0A6');
    for (let k = 0; k < 3; k++) P(cx + 1, ty + 4 + k * 2, 3 - (k % 2), 1, '#9AA0A6');
  }
  if (def.purse) {
    const lag = pose.tail || 0;
    P(tx + tw - 1, ty, 1, 6, '#7A2A24');
    P(tx + tw - 1, ty + 5 + lag, 8, 7, '#C0392B'); P(tx + tw + 4, ty + 5 + lag, 3, 7, '#9A332C'); P(tx + tw - 1, ty + 5 + lag, 7, 1, '#E06A5E');
    P(tx + tw + 2, ty + 7 + lag, 2, 1, '#F4C66D'); P(tx + tw, ty + 4 + lag, 5, 1, '#7A2A24');
  }
  if (def.board && !back) { P(tx + tw + 1, ty + 1, 2, 13, '#C9A050'); P(tx + tw + 1, ty + 2, 2, 1, '#1E1E24'); P(tx + tw + 1, ty + 11, 2, 1, '#1E1E24'); }
  const hold = pose.hold;
  if (hold === 'spatula') { const sx = tx - 3, sy = ty - 18; P(sx, sy + 4, 1, 7, '#6A5038'); P(sx - 1, sy, 4, 4, '#C9CDD2'); P(sx - 1, sy, 1, 4, '#E8ECEF'); }
  if (hold === 'spatulaDown') { P(tx - 6, ty + 5, 4, 2, '#C9CDD2'); P(tx - 6, ty + 5, 4, 1, '#E8ECEF'); P(tx - 2, ty + 5, 1, 1, '#6A5038'); }
  if (hold === 'water') { P(tx - 5, ty + 3, 4, 5, '#BFE3F2'); P(tx - 5, ty + 3, 4, 1, '#FFFFFF'); P(tx - 4, ty + 5, 2, 2, '#8CCBE8'); }
  if (hold === 'taco') { P(tx - 6, ty + 4, 6, 3, '#E8B85A'); P(tx - 6, ty + 6, 6, 1, '#C9902E'); P(tx - 5, ty + 3, 4, 1, '#6FA34A'); P(tx - 4, ty + 3, 1, 1, '#D8452F'); P(tx - 2, ty + 3, 1, 1, '#F4C66D'); }
  if (hold === 'crate') { P(tx - 2, ty + 3, tw + 4, 7, '#A9713F'); P(tx - 2, ty + 3, tw + 4, 1, '#D4A066'); P(tx, ty + 5, 3, 2, '#F6E6BE'); P(tx + 5, ty + 5, 3, 2, '#F6E6BE'); P(tx - 2, ty + 9, tw + 4, 1, '#6F4628'); }
  if (hold === 'phone') { P(tx - 3, ty + 3, 2, 4, '#1E1E24'); P(tx - 3, ty + 3, 2, 2, '#7CC8F0'); }
  return cv;
}

// Selective outline (hue-darkened from the darkest neighbour) + sun rim for crew + desaturation for customers.
function finish(cv, def) {
  const w = cv.width, h = cv.height, ctx = cv.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h), s = img.data;
  const out = new Uint8ClampedArray(s);
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && s[(y * w + x) * 4 + 3] > 0;
  const crew = !def.customer;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4;
    if (s[k + 3]) {
      if (!crew) { const g = (s[k] + s[k + 1] + s[k + 2]) / 3; for (let c = 0; c < 3; c++) out[k + c] = s[k + c] + (g - s[k + c]) * 0.12; }
      const ra = crew ? 0.6 : 0.4;
      if (y < 42 && (!op(x - 1, y) || !op(x, y - 1)) && op(x + 1, y + 1)) {
        out[k] = out[k] * (1 - ra) + 255 * ra; out[k + 1] = out[k + 1] * (1 - ra) + 226 * ra; out[k + 2] = out[k + 2] * (1 - ra) + 166 * ra;
      }
      continue;
    }
    let best = null, bl = 1e9;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (!op(x + dx, y + dy)) continue;
      const q = ((y + dy) * w + x + dx) * 4, l = s[q] + s[q + 1] + s[q + 2];
      if (l < bl) { bl = l; best = q; }
    }
    if (best === null) continue;
    if (crew) { out[k] = s[best] * 0.35 + 12; out[k + 1] = s[best + 1] * 0.3 + 8; out[k + 2] = s[best + 2] * 0.38 + 16; }
    else { out[k] = s[best] * 0.55; out[k + 1] = s[best + 1] * 0.55; out[k + 2] = s[best + 2] * 0.55; }
    out[k + 3] = 255;
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  return cv;
}

function flip(cv) {
  const f = makeCanvas(cv.width, cv.height), c = f.getContext('2d', { willReadFrequently: true });
  c.translate(cv.width, 0); c.scale(-1, 1); c.drawImage(cv, 0, 0);
  return f;
}

const cache = new Map();
let uid = 0;
export function frame(def, pose, mirror = false) {
  if (!def._id) def._id = ++uid;
  const key = `${def._id}|${pose.view}|${pose.walk ?? -1}|${pose.bob || 0}|${pose.arms || ''}|${pose.expr || ''}|${pose.blink ? 1 : 0}|${pose.tail || 0}|${pose.hold || ''}|${mirror ? 1 : 0}`;
  let c = cache.get(key);
  if (!c) {
    c = finish(paint(def, { walk: -1, ...pose }), def);
    if (mirror) c = flip(c);
    cache.set(key, c);
  }
  return c;
}
export const cacheSize = () => cache.size;
