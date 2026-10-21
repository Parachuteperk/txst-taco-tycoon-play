export const STEP = 0.05;

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function money(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function deepMerge(base, over) {
  if (over === undefined) return structuredClone(base);
  if (Array.isArray(over)) return structuredClone(over);
  if (over && typeof over === 'object') {
    const src = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    const out = {};
    const keys = new Set([...Object.keys(src), ...Object.keys(over)]);
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(over, k)) out[k] = deepMerge(src[k], over[k]);
      else out[k] = structuredClone(src[k]);
    }
    return out;
  }
  return over;
}

export function formatClock(mins) {
  const day = 24 * 60;
  let m = ((mins % day) + day) % day;
  let h = Math.floor(m / 60);
  const min = Math.floor(m % 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')} ${ap}`;
}

export function weekOf(day, daysPerWeek) {
  const d = Math.max(1, day);
  return {
    week: Math.floor((d - 1) / daysPerWeek) + 1,
    dayOfWeek: ((d - 1) % daysPerWeek) + 1,
    dayName: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(d - 1) % daysPerWeek],
  };
}
