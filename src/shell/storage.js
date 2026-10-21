const SAVE = 'txst-taco-save-v1', SETTINGS = 'txst-taco-settings-v1';
export function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
export function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function loadSave() { return read(SAVE); }
export function saveGame(game) { return write(SAVE, game.save()); }
export function clearSave() { try { localStorage.removeItem(SAVE); return true; } catch { return false; } }
export function loadSettings() { return { muted: false, crewNames: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, coinFlip: 'decline', surgeCap: 1.2, offers: {}, ...read(SETTINGS) }; }
export function saveSettings(settings) { return write(SETTINGS, settings); }
export function recordDay(v) {
  const key = 'txst-taco-legends-v1', stored = read(key);
  const rows = Array.isArray(stored) ? stored.filter(r => r && Number.isFinite(r.profit) && Number.isFinite(r.tacos)) : [];
  const row = { day: v.day, profit: v.today.profit, tacos: v.today.tacos, id: `${v.day}:${v.t}:${v.cash}:${v.today.revenue}` };
  if (!rows.some(r => r.id === row.id)) rows.push(row);
  rows.sort((a, b) => b.profit - a.profit); write(key, rows.slice(0, 3)); return rows.slice(0, 3);
}
