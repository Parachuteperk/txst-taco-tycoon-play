// Headless QA. `npm run playtest -- --seed 7 --days 10 --difficulty normal`
// Runs the planned manager preset, then prints each lunch, the daily report, and the badges.

import { pathToFileURL } from 'node:url';
import { createGame } from './index.js';

export function parsePlaytestArgs(argv) {
  const out = { seed: 7, days: 10, difficulty: 'normal' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--seed') out.seed = Number(argv[++i]);
    else if (arg === '--days') out.days = Number(argv[++i]);
    else if (arg === '--difficulty') out.difficulty = argv[++i];
  }
  return out;
}

function shortText(game, key) {
  const text = game.text(key);
  const question = text.indexOf('? ');
  const sentence = text.indexOf('. ', 4);
  let cut = sentence;
  if (question !== -1 && (cut === -1 || question < cut)) cut = question + 1;
  if (cut === -1) return text.replace(/\.$/, '');
  return text.slice(0, cut);
}

function money(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function playtest(options = {}) {
  const seed = options.seed ?? 7;
  const days = options.days ?? 10;
  const difficulty = options.difficulty ?? 'normal';
  const game = createGame(seed);
  const set = game.setDifficulty(difficulty);
  if (!set.ok) {
    const error = new Error(`unknown difficulty ${difficulty}`);
    error.code = 'unknown-difficulty';
    throw error;
  }
  const preset = game.setPolicy({ preset: 'planned' });
  if (!preset.ok) {
    const error = new Error('planned preset missing');
    error.code = 'unknown-preset';
    throw error;
  }
  const rows = [];
  const seen = new Set();
  let guard = 0;
  while (rows.length < days && guard++ < days * 50000) {
    if (game.state.phase !== 'summary') {
      game.tick(0.1);
      continue;
    }
    const view = game.getView();
    const fresh = [];
    for (const row of view.achievements.list) {
      if (!row.unlocked || seen.has(row.id)) continue;
      seen.add(row.id);
      fresh.push({ id: row.id, text: shortText(game, row.textKey) });
    }
    rows.push({
      day: view.day,
      dayName: view.dayName,
      week: view.week,
      sold: view.today.tacos,
      walked: view.today.walkoffs,
      peak: view.today.peakLine,
      profit: view.today.profit,
      cash: view.cash,
      hack: game.state.dayLedger.hackId || null,
      bigRush: game.state.dayLedger.bigRushId || null,
      bonus: view.today.bonus || 0,
      challenge: view.challenges.id,
      star: view.report?.star || null,
      cause: view.report?.cause || null,
      newAchievements: fresh,
    });
    if (rows.length >= days) break;
    game.startDay();
  }
  const view = game.getView();
  return {
    seed,
    days: rows.length,
    difficulty: view.difficulty.id,
    rows,
    achievements: view.achievements.list.filter((row) => row.unlocked).map((row) => ({
      id: row.id,
      day: row.day,
      text: shortText(game, row.textKey),
    })),
    challenges: view.challenges,
  };
}

function cell(value, width) {
  return String(value).padStart(width);
}

export function formatPlaytest(result) {
  const lines = [];
  lines.push('TXST Quad Taco Tycoon — playtest');
  lines.push(`Seed ${result.seed} · ${result.days} days · difficulty ${result.difficulty} · manager, planned preset`);
  lines.push('');
  lines.push('Day  Wk  Sold  Walk  Peak  Profit     Cash       Hack           Rush         Star     Cause');
  for (const row of result.rows) {
    const badges = row.newAchievements.map((badge) => badge.text).join(', ') || '—';
    lines.push([
      row.dayName.padEnd(4),
      cell(row.week, 2),
      cell(row.sold, 5),
      cell(row.walked, 5),
      cell(row.peak, 5),
      cell(money(row.profit), 9),
      cell(money(row.cash), 10),
      cell(row.hack || '—', 14),
      cell(row.bigRush || '—', 11),
      cell(row.star || '—', 8),
      `  ${row.cause || '—'}`,
    ].join(' '));
    if (badges !== '—') lines.push(`     ${badges}`);
  }
  lines.push('');
  lines.push('Achievements unlocked');
  const earnedBadges = result.achievements.slice().sort((a, b) => a.day - b.day || a.text.localeCompare(b.text));
  if (!earnedBadges.length) lines.push('  (none)');
  for (const badge of earnedBadges) {
    lines.push(`  Day ${badge.day}  ${badge.text}`);
  }
  const earned = result.challenges?.badges || [];
  if (earned.length) {
    lines.push('');
    lines.push('Challenge badges');
    for (const badge of earned) {
      lines.push(`  Week ${badge.week} day ${badge.day}  ${badge.textKey}  ${money(badge.cash)}`);
    }
  }
  return lines.join('\n');
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  try {
    console.log(formatPlaytest(playtest(parsePlaytestArgs(process.argv.slice(2)))));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
