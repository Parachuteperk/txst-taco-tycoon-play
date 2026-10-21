// Rules shape: ids, text keys, and the numbers from tuning.js.
// Overrides deep-merge in createGame(seed, save, { config }).
// Speed from perks is capped at perks.speedCap (15%). Holds, calls, and stalls are temporary and sit outside that cap.

import { TUNING as T } from './tuning.js';

const WEST_CHOICES = [
  { id: 'takeAdvice', textKey: 'west.choice.take', effect: {} },
  { id: 'redirect', textKey: 'west.choice.redirect', safe: true, effect: {} },
];

const DALE_CHOICES = [
  { id: 'snack', textKey: 'deck.dale.snack', effect: { suspicion: T.dale.snackSuspicion, fillingTacos: T.dale.snackTacos } },
  { id: 'straightFace', textKey: 'deck.dale.straight', safe: true, effect: {} },
];

function perkRows(crewId, table) {
  const out = {};
  for (const level of Object.keys(table)) {
    out[level] = table[level].map((row) => ({
      id: row.id,
      speed: row.speed,
      ...(row.tip != null ? { tip: row.tip } : {}),
      textKey: `perk.${crewId}.${row.id}`,
    }));
  }
  return out;
}

function campus(id, textKey, loudId, loudKey, safeId, safeKey, extra = {}) {
  return {
    id,
    textKey,
    ...extra,
    choices: [
      { id: loudId, textKey: loudKey, effect: { ...T.deck.effects[id][loudId] } },
      { id: safeId, textKey: safeKey, safe: true, effect: {} },
    ],
  };
}

function hack(textKey, stats) {
  return {
    textKey,
    suspicion: stats.suspicion,
    backfire: stats.backfire,
    effect: { ...stats.effect },
  };
}

const MAYA_COPY = {
  'cheap-taco': {
    arriveKey: 'maya.day1.arrive',
    orderKey: 'maya.day1.order',
    onSuccessText: 'maya.day1.thanks',
  },
  'came-back': {
    arriveKey: 'maya.day2.return',
    onSuccessText: 'maya.day2.chat',
    onFailText: 'maya.day2.rushed',
  },
  'brought-friends': {
    arriveKey: 'maya.day3.friends',
    onSuccessText: 'maya.day3.payoff',
  },
};

const { rows: perkTable, ...perkScalars } = T.perks;

export const CONFIG = {
  step: T.step,
  phaseOrder: ['preopen', 'calm', 'telegraph', 'rush', 'closing', 'summary'],
  phases: {
    preopen: { ...T.phases.preopen },
    calm: { ...T.phases.calm },
    telegraph: { ...T.phases.telegraph },
    rush: { ...T.phases.rush },
    closing: { ...T.phases.closing },
    summary: { ...T.phases.summary },
  },
  closingBeats: [
    { t: T.closing[0], who: 'ali', textKey: 'closing.grillOff' },
    { t: T.closing[1], who: 'phillip', textKey: 'closing.counter' },
    { t: T.closing[2], who: 'jared', textKey: 'closing.cashbox' },
    { t: T.closing[3], who: 'matt', textKey: 'closing.mattSits' },
    { t: T.closing[4], who: 'antonio', textKey: 'closing.antonioHype' },
    { t: T.closing[5], who: 'west', textKey: 'closing.westCookie' },
    { t: T.closing[6], who: 'aaron', textKey: 'closing.seeya' },
  ],
  stations: {
    register: { crew: 'jared', base: T.stations.register },
    prep: { crew: 'phillip', base: T.stations.prep, holdIfGrill: T.stations.holdIfGrill },
    grill: { crew: 'ali', base: T.stations.grill },
    assemble: { crew: 'aaron', base: T.stations.assemble },
    serve: { crew: 'matt', base: T.stations.serve },
  },
  stationOrder: ['register', 'prep', 'grill', 'assemble', 'serve'],
  hold: { boost: T.hold.boost },
  rates: { actionFloor: T.stations.actionFloor, patienceMinMult: T.patience.minMult },
  patience: {
    line: T.patience.line,
    queue: T.patience.queue,
    active: T.patience.active,
    serve: T.patience.serve,
  },
  arrivals: {
    calmRate: T.demand.calmRate,
    telegraphRate: T.demand.telegraphRate,
    rush: T.demand.rush.map((row) => ({ ...row })),
    patienceMin: T.patience.min,
    patienceMax: T.patience.max,
    regularPatience: T.patience.regular,
    regularChance: T.demand.regularChance,
    // Ambient walk-ups stop joining once this many people are at the stand
    // (line plus every station). Extra arrivals emit walkBy. Story guests still join.
    lineCap: T.demand.lineCap,
    jitter: T.demand.jitter,
    womPerPoint: T.demand.womPerPoint,
    womCap: T.demand.womCap,
    trustPerPoint: T.demand.trustPerPoint,
  },
  regulars: [
    { id: 'diego', nameKey: 'regular.diego.name' },
    { id: 'nina', nameKey: 'regular.nina.name' },
    { id: 'bell', nameKey: 'regular.bell.name' },
    { id: 'sam', nameKey: 'regular.sam.name' },
  ],
  economy: {
    startingCash: T.economy.startingCash,
    startingTortillas: T.economy.startingTortillas,
    tortilla: T.economy.tortilla,
    tortillaEmergency: T.economy.tortillaEmergency,
    tortillaCap: T.economy.tortillaCap,
    filling: T.economy.filling,
    guac: T.economy.guac,
    tipBase: T.economy.tipBase,
    regularTip: T.economy.regularTip,
    overhead: T.economy.overhead,
    upsellFlatTip: T.economy.upsellFlatTip,
    prices: {
      student: { ...T.prices.student, textKey: 'price.student' },
      fair: { ...T.prices.fair, textKey: 'price.fair' },
      proud: { ...T.prices.proud, textKey: 'price.proud' },
    },
  },
  golden: { ...T.golden },
  call: {
    openAt: T.call.openAt,
    closeAt: T.call.closeAt,
    choices: {
      protectGrill: { ...T.call.protectGrill, textKey: 'aaron.call.protectGrill' },
      clearLine: { ...T.call.clearLine, textKey: 'aaron.call.clearLine' },
      feedTheRegular: { ...T.call.feedTheRegular, textKey: 'aaron.call.feedTheRegular' },
    },
  },
  hacks: {
    channel: T.hacks.channel,
    // The bell (telegraph) opens the laptop early. This rush window is unchanged
    // so a Big Rush hack still lands at the same moment it did before.
    openAt: T.hacks.openAt,
    closeAt: T.hacks.closeAt,
    dailyDecay: T.hacks.dailyDecay,
    backfireSuspicion: T.hacks.backfireSuspicion,
    headphoneCut: T.hacks.headphoneCut,
    channelFloor: T.hacks.channelFloor,
    targets: {
      classAgenda: hack('hack.classAgenda', T.hacks.targets.classAgenda),
      bellEarly: hack('hack.bellEarly', T.hacks.targets.bellEarly),
      tacoNet: hack('hack.tacoNet', T.hacks.targets.tacoNet),
      freeGuac: hack('hack.freeGuac', T.hacks.targets.freeGuac),
      synergyApp: hack('hack.synergyApp', T.hacks.targets.synergyApp),
    },
  },
  inspector: {
    arriveIn: T.dale.arriveIn,
    fine: T.dale.fine,
    fineAt: T.dale.fineAt,
    fineReset: T.dale.fineReset,
    warnRelief: T.dale.warnRelief,
    watch: T.dale.watch,
    mute: T.dale.mute,
    speed: T.dale.speed,
  },
  west: { ...T.west },
  crew: {
    ...perkScalars,
    // Phillip / Antonio / Aaron pairs are inferred. design/aaron-addons.md names XP,
    // but the perk list was not in the repo (chatgpt-story-response.txt is missing).
    perks: {
      ali: perkRows('ali', perkTable.ali),
      jared: perkRows('jared', perkTable.jared),
      phillip: perkRows('phillip', perkTable.phillip),
      matt: perkRows('matt', perkTable.matt),
      antonio: perkRows('antonio', perkTable.antonio),
      aaron: perkRows('aaron', perkTable.aaron),
    },
  },
  combos: T.combos.map((combo) => ({ ...combo, textKey: `combo.${combo.id}`, effect: { ...combo.effect } })),
  outpost: {
    tip: T.outpost.tip,
    bootTimer: T.outpost.bootTimer,
    freshmanNames: ['Riley', 'Chris', 'Samir', 'Jordan', 'Casey'],
    spots: {
      alkek: { ...T.outpost.spots.alkek, textKey: 'outpost.spot.alkek' },
      lbj: { ...T.outpost.spots.lbj, textKey: 'outpost.spot.lbj' },
      busStop: { ...T.outpost.spots.busStop, textKey: 'outpost.spot.busStop' },
      stallions: { ...T.outpost.spots.stallions, textKey: 'outpost.spot.stallions' },
    },
    quirks: {
      eager: { ...T.outpost.quirks.eager, textKey: 'quirk.eager' },
      shy: { ...T.outpost.quirks.shy, textKey: 'quirk.shy' },
      hustler: { ...T.outpost.quirks.hustler, textKey: 'quirk.hustler' },
      homesick: { ...T.outpost.quirks.homesick, textKey: 'quirk.homesick' },
    },
    // Cost is the price to reach this tier from the one below. Tier 1 is the hire cost.
    // Only tiers 1 and 2 are simulated. 3–6 are data for the later renderer and economy.
    tiers: T.outpost.tiers.map((tier) => ({ ...tier, textKey: `outpost.tier.${tier.id}` })),
  },
  story: {
    enabled: T.story.enabled,
    mayaCheapMult: T.story.mayaCheapMult,
    mayaReturnChance: T.story.mayaReturnChance,
    returnDelay: T.story.returnDelay,
    returnPatience: T.story.returnPatience,
    craftPerSale: T.story.craftPerSale,
    craftPerGoldenSale: T.story.craftPerGoldenSale,
    craftPerGoldenTap: T.story.craftPerGoldenTap,
    trustPerGoldenTap: T.story.trustPerGoldenTap,
    trustWalkoff: T.story.trustWalkoff,
    trustCallRegular: T.story.trustCallRegular,
    trustCold: T.story.trustCold,
    trustWarm: T.story.trustWarm,
    maya: {
      id: 'maya',
      nameKey: 'regular.maya.name',
      beats: T.story.beats.map((beat) => ({ ...beat, ...MAYA_COPY[beat.id] })),
    },
  },
  // Everyday cap is arrivals.lineCap. These days lift it. forceDays (1–5, Mon–Fri)
  // skips the weekly roll for tests. The roll is not the main RNG.
  bigRush: {
    ...T.bigRush,
    causes: [
      { id: 'bigClass', textKey: 'bigRush.bigClass' },
      { id: 'gameDay', textKey: 'bigRush.gameDay' },
    ],
  },
  // Week 1 is an identity ramp: demand, patience, cost, and price stay 1 and the
  // adds stay 0, so the first week does not reshuffle the main rush RNG.
  semester: {
    daysPerWeek: T.semester.daysPerWeek,
    weeks: T.semester.weeks,
    goal: T.semester.goal,
    goalId: 'pitch',
    goalKey: 'goal.pitch',
    ramp: {
      1: { ...T.semester.ramp[1] },
      2: { ...T.semester.ramp[2] },
      3: { ...T.semester.ramp[3] },
      4: { ...T.semester.ramp[4] },
    },
    milestones: [
      { week: 1, id: 'jar', target: T.semester.milestones.jar, textKey: 'season.milestone.jar' },
      { week: 2, id: 'cooler', target: T.semester.milestones.cooler, textKey: 'season.milestone.cooler' },
      { week: 3, id: 'name', target: T.semester.milestones.name, textKey: 'season.milestone.name' },
      { week: 4, id: 'pitch', target: T.semester.milestones.pitch, textKey: 'season.milestone.pitch' },
    ],
    calls: (T.semester.calls || []).map((goal) => ({ ...goal })),
    grades: [
      { id: 'A', min: T.semester.grades.A, textKey: 'season.rank.a' },
      { id: 'B', min: T.semester.grades.B, textKey: 'season.rank.b' },
      { id: 'C', min: T.semester.grades.C, textKey: 'season.rank.c' },
      { id: 'D', min: T.semester.grades.D, textKey: 'season.rank.d' },
      { id: 'F', min: T.semester.grades.F, textKey: 'season.rank.f' },
    ],
  },
  deck: {
    enabled: T.deck.enabled,
    campus: [
      campus('tailgate', 'deck.campus.tailgate', 'setUpEarly', 'deck.campus.tailgate.early', 'stayPut', 'deck.campus.tailgate.stay'),
      campus('kickoff', 'deck.campus.kickoff', 'facePaint', 'deck.campus.kickoff.paint', 'keepCooking', 'deck.campus.kickoff.cook'),
      campus('busCrowd', 'deck.campus.busCrowd', 'meetTheBus', 'deck.campus.busCrowd.meet', 'holdTheCart', 'deck.campus.busCrowd.hold'),
      campus('rain', 'deck.campus.rain', 'shareTheTarp', 'deck.campus.rain.tarp', 'cookThrough', 'deck.campus.rain.through'),
      campus('downpour', 'deck.campus.downpour', 'moveUnderTheOak', 'deck.campus.downpour.oak', 'stayInTheOpen', 'deck.campus.downpour.open'),
      campus('drizzle', 'deck.campus.drizzle', 'towelTheLine', 'deck.campus.drizzle.towel', 'letItBead', 'deck.campus.drizzle.bead'),
      campus('bandPractice', 'deck.campus.band', 'feedTheSection', 'deck.campus.band.feed', 'letThemMarch', 'deck.campus.band.march'),
      campus('sectionals', 'deck.campus.sectionals', 'holdTheBrass', 'deck.campus.sectionals.hold', 'plugEars', 'deck.campus.sectionals.ears'),
      campus('fightSong', 'deck.campus.fightSong', 'singAlong', 'deck.campus.fightSong.sing', 'keepTheBeat', 'deck.campus.fightSong.beat'),
      campus('finalsLibrary', 'deck.campus.finalsLibrary', 'allNighterSpecial', 'deck.campus.finalsLibrary.special', 'normalMenu', 'deck.campus.finalsLibrary.normal', { weekMin: T.deck.finalsWeekMin }),
      campus('finalsQuad', 'deck.campus.finalsQuad', 'coffeeTaco', 'deck.campus.finalsQuad.coffee', 'quietCart', 'deck.campus.finalsQuad.quiet', { weekMin: T.deck.finalsWeekMin }),
      campus('groupProject', 'deck.campus.groupProject', 'feedTheGroup', 'deck.campus.groupProject.feed', 'oneEach', 'deck.campus.groupProject.one', { weekMin: T.deck.finalsWeekMin }),
    ],
    west: [
      { id: 'cheek', textKey: 'deck.west.cheek', choices: WEST_CHOICES },
      { id: 'cookiePurse', textKey: 'deck.west.cookiePurse', choices: WEST_CHOICES },
      { id: 'aliSong', textKey: 'deck.west.aliSong', choices: WEST_CHOICES },
      { id: 'purseStory', textKey: 'deck.west.purseStory', choices: WEST_CHOICES },
    ],
    dale: [
      { id: 'clipboard', textKey: 'deck.dale.clipboard', choices: DALE_CHOICES },
      { id: 'lecture', textKey: 'deck.dale.lecture', choices: DALE_CHOICES },
      { id: 'secondLook', textKey: 'deck.dale.secondLook', choices: DALE_CHOICES },
    ],
  },
  onboard: {
    holdAt: T.onboard.holdAt,
    hints: [
      { id: 'callLine', textKey: 'onboard.callLine' },
      { id: 'holdGrill', textKey: 'onboard.holdGrill' },
      { id: 'terminal', textKey: 'onboard.terminal' },
      { id: 'hire', textKey: 'onboard.hire' },
    ],
  },
  // Normal is identity. Chill is the cozy promise: kinder crowd, cheaper food, a quieter Dale.
  difficulty: {
    default: T.difficulty.default,
    levels: {
      chill: { textKey: 'difficulty.chill', ...T.difficulty.chill },
      normal: { textKey: 'difficulty.normal', ...T.difficulty.normal },
      chaos: { textKey: 'difficulty.chaos', ...T.difficulty.chaos },
    },
  },
  pacing: {
    beatAt: T.pacing.beatAt,
    window: T.pacing.window,
    choices: [
      { id: 'watchTheHill', textKey: 'pacing.watch', safe: true, effect: {} },
      { id: 'warmupTheGrill', textKey: 'pacing.warmup', effect: { ...T.pacing.warmup } },
    ],
  },
  achievements: [
    { id: 'firstBell', stat: 'days', target: T.achievements.firstBell, textKey: 'achievement.firstBell', hintKey: 'achievement.firstBell.hint' },
    { id: 'hundredTacos', stat: 'tacos', target: T.achievements.hundredTacos, textKey: 'achievement.hundredTacos', hintKey: 'achievement.hundredTacos.hint' },
    { id: 'fedTheBand', stat: 'bandTacos', target: T.achievements.fedTheBand, textKey: 'achievement.fedTheBand', hintKey: 'achievement.fedTheBand.hint' },
    { id: 'westProposed', stat: 'advice', target: T.achievements.westProposed, textKey: 'achievement.westProposed', hintKey: 'achievement.westProposed.hint' },
    { id: 'daleWho', stat: 'cleanStreak', target: T.achievements.daleWho, textKey: 'achievement.daleWho', hintKey: 'achievement.daleWho.hint' },
    { id: 'line56', stat: 'bestPeak', target: T.achievements.line56, textKey: 'achievement.line56', hintKey: 'achievement.line56.hint' },
    { id: 'pitchJar', stat: 'cash', target: T.achievements.pitchJar, textKey: 'achievement.pitchJar', hintKey: 'achievement.pitchJar.hint' },
    { id: 'coolerKid', stat: 'hired', target: T.achievements.coolerKid, textKey: 'achievement.coolerKid', hintKey: 'achievement.coolerKid.hint' },
    { id: 'foldingTable', stat: 'outpostTier', target: T.achievements.foldingTable, textKey: 'achievement.foldingTable', hintKey: 'achievement.foldingTable.hint' },
    { id: 'oldMain', stat: 'agenda', target: T.achievements.oldMain, textKey: 'achievement.oldMain', hintKey: 'achievement.oldMain.hint' },
    { id: 'goldenHour', stat: 'bestGolden', target: T.achievements.goldenHour, textKey: 'achievement.goldenHour', hintKey: 'achievement.goldenHour.hint' },
    { id: 'assemblyLine', stat: 'assembly', target: T.achievements.assemblyLine, textKey: 'achievement.assemblyLine', hintKey: 'achievement.assemblyLine.hint' },
    { id: 'handsInPockets', stat: 'pockets', target: T.achievements.handsInPockets, textKey: 'achievement.handsInPockets', hintKey: 'achievement.handsInPockets.hint' },
    { id: 'sawTheLine', stat: 'bestWalkBys', target: T.achievements.sawTheLine, textKey: 'achievement.sawTheLine', hintKey: 'achievement.sawTheLine.hint' },
    { id: 'mayaFriends', stat: 'maya', target: T.achievements.mayaFriends, textKey: 'achievement.mayaFriends', hintKey: 'achievement.mayaFriends.hint' },
    { id: 'stallions', stat: 'stallionSold', target: T.achievements.stallions, textKey: 'achievement.stallions', hintKey: 'achievement.stallions.hint' },
    { id: 'rainQuad', stat: 'rainTacos', target: T.achievements.rainQuad, textKey: 'achievement.rainQuad', hintKey: 'achievement.rainQuad.hint' },
    { id: 'finalsFuel', stat: 'finalsTacos', target: T.achievements.finalsFuel, textKey: 'achievement.finalsFuel', hintKey: 'achievement.finalsFuel.hint' },
    { id: 'gameDayCaptain', stat: 'captain', target: T.achievements.gameDayCaptain, textKey: 'achievement.gameDayCaptain', hintKey: 'achievement.gameDayCaptain.hint' },
    { id: 'fromTheQuad', stat: 'gradeA', target: T.achievements.fromTheQuad, textKey: 'achievement.fromTheQuad', hintKey: 'achievement.fromTheQuad.hint' },
  ],
  challenges: {
    rotation: T.challenges.rotation.slice(),
    threeFloods: {
      textKey: 'challenge.threeFloods',
      hintKey: 'challenge.threeFloods.hint',
      badgeKey: 'challenge.threeFloods.badge',
      target: T.challenges.threeFloods.target,
      maxWalkoffs: T.challenges.threeFloods.maxWalkoffs,
      cash: T.challenges.threeFloods.cash,
      days: T.challenges.threeFloods.days.slice(),
    },
    noHacks: {
      textKey: 'challenge.noHacks',
      hintKey: 'challenge.noHacks.hint',
      badgeKey: 'challenge.noHacks.badge',
      target: T.challenges.noHacks.target,
      cash: T.challenges.noHacks.cash,
    },
    bandWeek: {
      textKey: 'challenge.bandWeek',
      hintKey: 'challenge.bandWeek.hint',
      badgeKey: 'challenge.bandWeek.badge',
      target: T.challenges.bandWeek.target,
      cash: T.challenges.bandWeek.cash,
      cards: T.challenges.bandWeek.cards.slice(),
    },
  },
  manager: {
    ...T.manager,
    menu: T.manager.menu.map((item) => ({ ...item, textKey: `menu.${item.id}` })),
    upgrades: Object.fromEntries(Object.entries(T.manager.upgrades).map(([id, row]) => [id, { ...row, textKey: `upgrade.${id}` }])),
    locations: T.manager.locations.map((row) => ({ ...row, textKey: `outpost.spot.${row.id}` })),
    projects: Object.fromEntries(Object.entries(T.manager.projects).map(([id, row]) => [id, { ...row, textKey: `project.${id}` }])),
    chemistry: {
      ...T.manager.chemistry,
      pairs: T.manager.chemistry.pairs.map((pair) => ({ ...pair, ids: pair.ids.slice(), textKey: `manager.chem.${pair.id}` })),
    },
  },
};
