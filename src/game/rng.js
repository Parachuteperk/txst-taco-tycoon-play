// Mulberry32. Same seed and same draws always replay the same rush.

export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    const n = seed >>> 0;
    return n === 0 ? 0x6d2b79f5 : n;
  }
  const str = String(seed ?? 'quad');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 0x6d2b79f5;
}

export function createRng(seed) {
  let s = hashSeed(seed);
  return {
    next() {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(this.next() * n);
    },
    chance(p) {
      return this.next() < p;
    },
    getState() {
      return s >>> 0;
    },
    setState(n) {
      s = n >>> 0;
    },
  };
}
