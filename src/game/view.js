import { upgradesView } from './upgrades.js';
import { peopleAtStand } from './pipeline.js';
import { initBodies, placeAll } from '../sim/layout.js';
import { perkDef, permanentSpeed, xpToNext } from './crew.js';
import { clockOf } from './day.js';
import { difficultyMods } from './difficulty.js';
import { hackAvailable } from './hacks.js';
import { onboardSnapshot } from './onboard.js';
import { activeChallenge } from './challenges.js';
import { liveSnapshot, managerSnapshot } from './manager.js';
import { weekModifiers } from './season.js';
import { weekOf } from './util.js';

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function present(c) {
  if (!c) return null;
  if (c.customerId != null && c.patience == null) {
    return {
      id: c.id,
      customerId: c.customerId,
      type: c.type || null,
      station: c.station,
      progress: c.workNeed > 0 ? round3(Math.min(1, c.progress / c.workNeed)) : 0,
      prepped: !!c.prepped,
    };
  }
  return {
    id: c.id,
    kind: c.kind,
    regularId: c.regularId,
    nameKey: c.nameKey,
    tacos: c.tacos,
    patience: round3(c.patience),
    patienceMax: round3(c.patienceMax),
    progress: c.workNeed > 0 ? round3(c.progress / c.workNeed) : 0,
    golden: !!(c.golden && !c.goldenResolved),
    station: c.station,
    source: c.source,
  };
}

const CREW_ORDER = ['jared', 'phillip', 'ali', 'matt', 'aaron', 'antonio', 'west'];

const ERA_NAMES = { folding: 'Folding Table', tent: 'Pop-Up Tent', stand: 'Full Stand', truck: 'Food Truck' };
function cityEra(s, u) {
  const next = u.nextEra;
  const requires = next ? [
    { id: 'tacos', label: 'lifetime tacos', have: next.tacos.have, need: next.tacos.need },
    { id: 'stars', label: 'stars', have: next.stars.have, need: next.stars.need },
    { id: 'cash', label: 'cash', have: Math.floor(s.cash), need: next.cost },
  ] : [];
  const parts = requires.map((r) => Math.min(1, r.need ? r.have / r.need : 1));
  return {
    id: u.era, name: ERA_NAMES[u.era], level: u.eraNumber, index: u.eraNumber - 1, count: 4,
    progress: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 1,
    next: next ? { id: next.id, name: ERA_NAMES[next.id], requires, ready: next.ready } : null,
  };
}

// Eras, stand and stall upgrades, Jared's vault, the coin-flip card and AI Ali (src/game/upgrades.js).
function treeView(s) {
  if (!s.manager) return { stands: { main: { era: 'folding', upgrades: [], specialty: null }, stall: { open: false, specialty: null, upgrades: [], staffedBy: null } }, vault: null, coinFlip: null, upgrades: { owned: [] } };
  const u = upgradesView(s);
  const owned = u.tree.owned;
  const stand = (key) => owned.filter((id) => id.startsWith(`${key}_`));
  return {
    stands: {
      main: { era: u.era, eraNumber: u.eraNumber, next: u.nextEra, upgrades: stand('main'), specialty: null },
      stall: { open: u.tree.stall.open, specialty: u.tree.stall.specialty, upgrades: stand('stall'), staffedBy: null },
    },
    vault: u.vault,
    coinFlip: u.coinFlip,
    aiAli: u.aiAli,
    offers: u.signatures.offers,
    surge: u.signatures.surge,
    franchise: u.signatures.franchise,
    signatures: u.signatures,
    city: { era: cityEra(s, u) },
    upgrades: { owned: owned.slice(), props: u.tree.props.slice(), milestones: u.tree.milestones.slice(), synergies: u.synergies },
  };
}

function crewBodies(game) {
  const s = game.state;
  if (!s.bodies) initBodies(s);
  placeAll(s);
  const rows = CREW_ORDER.map((id) => {
    const body = s.bodies[id] || { x: 0, y: 0, task: 'ready' };
    const staff = s.manager?.staff?.[id];
    const station = staff ? staff.station : null;
    const active = station && s.stations?.[station] ? s.stations[station].active : null;
    const targetItemId = active && active.customerId != null ? active.id : null;
    let task = s.haul?.crewId === id ? 'hauling' : (body.task === 'hauling' ? 'ready' : body.task || 'ready');
    if (s.haul?.crewId === id) task = 'hauling';
    else if (targetItemId) task = 'working';
    else if (staff && staff.shift === false) task = 'off';
    return {
      id,
      station: station || null,
      task,
      targetItemId,
      pos: { x: round3(body.x), y: round3(body.y) },
      upgrades: s.manager?.tree ? (upgradesView(s).byCrew[id] || []) : [],
      role: staff?.role || null,
      target: null,
    };
  });
  // AI Ali (Ali's capstone) is a presentation crew row; never in CREW_IDS / STAFF_IDS.
  if (s.manager?.tree?.owned.includes('ali_ai_ali')) {
    const ali = rows.find((r) => r.id === 'ali');
    rows.push({ id: 'aiAli', station: null, task: s.manager.tree.aiAli.offline ? 'off' : 'westHandler', targetItemId: null, pos: ali ? { ...ali.pos } : { x: 0, y: 0 }, upgrades: [], role: 'westHandler', target: 'west' });
  }
  return rows;
}

function viewCustomers(state) {
  return (state.customers || []).map((c) => ({
    id: c.id,
    state: c.state || 'line',
    pos: { x: round3(c.pos?.x ?? 0), y: round3(c.pos?.y ?? 0) },
    queueIndex: c.queueIndex || 0,
    orderItems: (c.orderItems || []).map((item) => ({ id: item.id, type: item.type })),
    patience: round3(c.patience),
    patienceMax: round3(c.patienceMax),
    thought: c.thought || null,
    mood: c.mood ?? null,
    needs: c.needs || null,
    paid: !!c.paid,
    paidCash: c.paidCash || 0,
  }));
}

function viewItems(state) {
  return (state.items || []).filter((item) => item.station !== 'done').map((item) => ({
    id: item.id,
    customerId: item.customerId,
    type: item.type,
    station: item.station,
    progress: item.workNeed > 0 ? round3(Math.min(1, item.progress / item.workNeed)) : 0,
    heldBy: item.heldBy || null,
    pos: { x: round3(item.pos?.x ?? 0), y: round3(item.pos?.y ?? 0) },
  }));
}

export function getView(game) {
  const s = game.state;
  const cfg = game.config;
  const cal = weekOf(s.day, cfg.semester.daysPerWeek);
  const clock = clockOf(s, cfg);
  const rushDur = cfg.phases.rush.seconds;
  let rushProgress = 0;
  if (s.phase === 'telegraph') rushProgress = 0.08 * Math.min(1, s.phaseT / cfg.phases.telegraph.seconds);
  else if (s.phase === 'rush') rushProgress = Math.min(1, s.phaseT / rushDur);
  else if (s.phase === 'closing' || s.phase === 'summary') rushProgress = 1;
  if (!s.bodies) initBodies(s);
  placeAll(s);
  const stations = {};
  for (const name of cfg.stationOrder) {
    const slot = s.stations[name];
    stations[name] = {
      crew: cfg.stations[name].crew,
      queue: slot.queue.length,
      active: present(slot.active),
    };
  }
  const crewStats = {};
  for (const [id, member] of Object.entries(s.crew)) {
    crewStats[id] = {
      id,
      level: member.level,
      xp: member.xp,
      xpToNext: xpToNext(cfg, member.level),
      perks: member.perks.slice(),
      speed: permanentSpeed(cfg, id, member.perks),
    };
  }
  const day = s.dayLedger;
  return {
    day: s.day,
    week: cal.week,
    dayOfWeek: cal.dayOfWeek,
    dayName: cal.dayName,
    phase: s.phase,
    phaseT: round3(s.phaseT),
    phaseDuration: cfg.phases[s.phase].seconds,
    t: round3(s.t),
    clock,
    rush: {
      active: s.phase === 'rush',
      telegraph: s.phase === 'telegraph',
      t: s.phase === 'rush' ? round3(s.phaseT) : 0,
      duration: rushDur,
      progress: round3(rushProgress),
    },
    cash: s.cash,
    suspicion: s.suspicion,
    priceBand: s.priceBand,
    inventory: { tortillas: s.inventory.tortillas },
    holding: s.holding,
    bottleneck: s.bottleneck,
    queue: peopleAtStand(s),
    lineCount: s.line.length,
    line: s.line.map(present),
    customers: viewCustomers(s),
    items: viewItems(s),
    bigRush: {
      active: !!s.bigRush?.active,
      armed: !!s.bigRush?.armed,
      id: s.bigRush?.id || null,
      textKey: s.bigRush?.active || s.bigRush?.armed ? s.bigRush.textKey : null,
      cap: s.bigRush?.active ? (s.bigRush.cap || cfg.bigRush.cap) : cfg.arrivals.lineCap,
    },
    stations,
    prompts: {
      call: s.phase === 'rush' && !s.call.used && s.phaseT >= cfg.call.openAt && s.phaseT <= cfg.call.closeAt,
      hack: hackAvailable(game),
      west: s.west.choiceOpen,
      beat: !!s.pacing?.open,
      golden: !!(s.golden.customerId && s.golden.timeLeft > 0),
      summary: s.phase === 'summary',
      perks: s.pendingPerks.length > 0,
    },
    call: { used: s.call.used, choice: s.call.choice },
    hack: {
      used: s.hack.used,
      channel: round3(Math.max(0, s.hack.channel)),
      pending: s.hack.pending,
      id: day.hackId,
    },
    west: {
      status: s.west.status,
      choiceOpen: s.west.choiceOpen,
      adviceKey: s.west.adviceKey,
      interveneAt: s.west.interveneAt ?? null,
      choice: day.westChoice,
    },
    golden: {
      open: !!(s.golden.customerId && s.golden.timeLeft > 0),
      customerId: s.golden.customerId,
      timeLeft: round3(Math.max(0, s.golden.timeLeft)),
    },
    combo: { count: s.combo.count },
    crew: crewBodies(game),
    crewStats,
    ...treeView(s),
    pendingPerks: s.pendingPerks.map((p) => ({
      crewId: p.crewId,
      level: p.level,
      options: p.options.map((id) => ({ id, textKey: perkDef(cfg, p.crewId, id)?.textKey || id })),
    })),
    combosUnlocked: s.combosUnlocked.slice(),
    outpost: s.outpost ? {
      tier: s.outpost.tier,
      tierId: s.outpost.tierId,
      spot: s.outpost.spot,
      quirk: s.outpost.quirk,
      name: s.outpost.name,
      stock: s.outpost.stock,
      status: s.outpost.status,
      timer: round3(Math.max(0, s.outpost.timer)),
      soldToday: s.outpost.soldToday,
      restocksToday: s.outpost.restocksToday,
      lifetimeSold: s.outpost.lifetimeSold,
    } : null,
    story: {
      maya: {
        beatIndex: s.story.maya.beatIndex,
        beatId: cfg.story.maya.beats[s.story.maya.beatIndex]?.id || null,
        flags: { ...s.story.maya.flags },
        done: s.story.maya.done,
        visits: s.story.maya.visits,
      },
      wordOfMouth: s.story.wordOfMouth,
      trust: Math.round(s.story.trust * 100) / 100,
      craft: Math.round(s.story.craft * 100) / 100,
    },
    today: {
      revenue: day.revenue,
      food: day.food,
      tips: day.tips,
      cogs: day.cogs,
      profit: day.profit,
      overhead: day.overhead,
      fines: day.fines,
      purchases: day.purchases,
      capex: day.capex,
      tacos: day.tacos,
      walkoffs: day.walkoffs,
      walkBys: day.walkBys,
      cashStart: day.cashStart,
      settled: day.settled,
      peakLine: day.peakLine,
      holdSeconds: day.holdSeconds,
      outpostSold: day.outpostSold,
      outpostRevenue: day.outpostRevenue,
      storyKey: day.storyKey,
      bonus: day.bonus || 0,
    },
    goal: {
      id: cfg.semester.goalId,
      nameKey: cfg.semester.goalKey,
      target: cfg.semester.goal,
      cash: s.cash,
      met: s.cash >= cfg.semester.goal,
    },
    difficulty: difficultyView(game),
    pacing: {
      open: !!s.pacing?.open,
      choice: s.pacing?.choice || null,
      decisions: day.decisions || 0,
    },
    achievements: achievementView(game),
    challenges: challengeView(game, cal),
    season: seasonView(game, cal),
    deck: {
      campus: showCard(s.deck?.campus),
      west: showCard(s.deck?.west),
      dale: showCard(s.deck?.dale),
    },
    onboard: onboardSnapshot(game),
    lifetime: { ...s.lifetime },
    manager: managerSnapshot(game),
    live: liveSnapshot(game),
    report: s.manager?.report ? { ...s.manager.report } : null,
  };
}

function difficultyView(game) {
  const mods = difficultyMods(game);
  return {
    id: mods.id,
    textKey: mods.textKey,
    demand: mods.demand,
    patience: mods.patience,
    cost: mods.cost,
    price: mods.price,
    overhead: mods.overhead,
    dale: mods.dale,
    suspicion: mods.suspicion,
    backfire: mods.backfire,
    fine: mods.fine,
  };
}

function achievementView(game) {
  const saved = game.state.achievements || { unlocked: {}, progress: {} };
  const list = (game.config.achievements || []).map((def) => ({
    id: def.id,
    textKey: def.textKey,
    hintKey: def.hintKey,
    target: def.target,
    progress: saved.progress?.[def.id] || 0,
    unlocked: !!saved.unlocked?.[def.id],
    day: saved.unlocked?.[def.id]?.day ?? null,
  }));
  return {
    unlocked: list.filter((row) => row.unlocked).length,
    total: list.length,
    list,
  };
}

function challengeView(game, cal) {
  const def = activeChallenge(game);
  const saved = game.state.challenges || { badges: [] };
  const same = !!def && saved.id === def.id && saved.week === cal.week;
  const badges = (saved.badges || []).map((badge) => ({
    id: badge.id,
    textKey: badge.textKey,
    week: badge.week,
    day: badge.day,
    cash: badge.cash,
  }));
  return {
    id: def?.id || null,
    textKey: def?.textKey || null,
    hintKey: def?.hintKey || null,
    badgeKey: def?.badgeKey || null,
    week: cal.week,
    progress: same ? saved.progress || 0 : 0,
    target: def?.target || 0,
    cash: def?.cash || 0,
    done: same ? !!saved.rewarded : false,
    failed: same ? !!saved.failed : false,
    badges,
  };
}

function showCard(card) {
  if (!card) return null;
  return {
    deck: card.deck,
    id: card.id,
    textKey: card.textKey,
    open: card.open,
    choice: card.choice,
    resolveAt: card.resolveAt ?? null,
    kind: card.kind || null,
    choices: card.choices.map((choice) => ({ id: choice.id, textKey: choice.textKey, safe: !!choice.safe })),
  };
}

function seasonView(game, cal) {
  const s = game.state;
  const sem = game.config.semester;
  const season = s.season;
  const weeks = sem.weeks || 4;
  const days = weeks * sem.daysPerWeek;
  const milestones = (sem.milestones || []).map((milestone) => ({
    week: milestone.week,
    id: milestone.id,
    target: milestone.target,
    met: !!season?.met?.[milestone.id],
    textKey: milestone.textKey,
  }));
  const summary = season?.summary
    ? {
      grade: season.summary.grade,
      gradeKey: season.summary.gradeKey,
      rankKey: season.summary.rankKey,
      bestDay: season.summary.bestDay ? { ...season.summary.bestDay } : null,
      stats: { ...season.summary.stats },
      goalMet: season.summary.goalMet,
      textKey: season.summary.textKey,
    }
    : null;
  return {
    week: cal.week,
    weeks,
    day: s.day,
    days,
    endless: !!season?.endless,
    complete: !!season?.complete,
    goal: sem.goal,
    milestone: milestones.find((milestone) => milestone.week === Math.min(cal.week, weeks)) || null,
    milestones,
    ramp: weekModifiers(game),
    summary,
  };
}
