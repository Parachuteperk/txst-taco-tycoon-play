// Dev helper for the headless sim and balance tests. Not part of the renderer contract.
// One soft hold, one early Old Main hack, one call, one West choice, golden taps when they appear.
// Perks take the first option. The cooler kid is hired once cash can cover the cooler and a float.

export function createTendPolicy() {
  let setupDay = 0;
  let hackedDay = 0;
  let calledDay = 0;
  return {
    apply(game) {
      const v = game.getView();
      if (v.prompts.beat) game.chooseBeat('watchTheHill');
      if (v.phase === 'preopen' && setupDay !== v.day) {
        setupDay = v.day;
        game.setPrice('fair');
        const bigToday = game.state.weekPlan?.days?.includes(v.dayOfWeek);
        const target = bigToday ? 112 : (v.outpost ? 96 : 74);
        if (v.inventory.tortillas < target) game.restock(target - v.inventory.tortillas);
      }
      if (v.phase === 'rush') {
        const station = v.stations[v.bottleneck];
        const pressure = station.queue + (station.active ? 1 : 0) + (v.bottleneck === 'register' ? v.lineCount : 0);
        const spectacle = v.bigRush.active || v.bigRush.armed;
        game.holdStand(spectacle || pressure >= 2);
        // During a Big Rush the agenda hack is the flood. Other days it stays early.
        if (v.prompts.hack && hackedDay !== v.day && v.rush.t >= (spectacle ? 8 : 12)) {
          hackedDay = v.day;
          game.startHack('classAgenda');
        }
        if (v.prompts.call && calledDay !== v.day && v.rush.t >= (spectacle ? 22 : 50)) {
          calledDay = v.day;
          const grill = v.stations.grill.queue + (v.stations.grill.active ? 1 : 0);
          game.callTheLine(spectacle || v.bottleneck === 'grill' || grill >= 2 ? 'protectGrill' : 'clearLine');
        }
        if (v.prompts.west) game.chooseWest('takeAdvice');
        if (v.prompts.golden) game.tapGolden();
      } else if (v.holding) {
        game.holdStand(false);
      }
      if (v.phase === 'summary') {
        for (const perk of v.pendingPerks) game.choosePerk(perk.crewId, perk.options[0].id);
      }
    },
    maybeHire(game) {
      const v = game.getView();
      if (v.outpost || v.phase !== 'summary' || v.day < 2) return false;
      const cost = game.config.outpost.tiers[0].cost;
      if (v.cash < cost + 70) return false;
      return game.hireOutpost({ spot: 'stallions', quirk: 'shy' }).ok;
    },
  };
}

// Same prep and golden taps, no hold, no hack, no call. West gets redirected if she is still waiting.
export function createHandsOffPolicy() {
  let setupDay = 0;
  return {
    apply(game) {
      const v = game.getView();
      if (v.holding) game.holdStand(false);
      if (v.prompts.beat) game.chooseBeat('watchTheHill');
      if (v.phase === 'preopen' && setupDay !== v.day) {
        setupDay = v.day;
        game.setPrice('fair');
        const bigToday = game.state.weekPlan?.days?.includes(v.dayOfWeek);
        const target = bigToday ? 100 : 74;
        if (v.inventory.tortillas < target) game.restock(target - v.inventory.tortillas);
      }
      if (v.phase === 'rush' && v.prompts.golden) game.tapGolden();
      if (v.prompts.west) game.chooseWest('redirect');
      if (v.phase === 'summary') {
        for (const perk of v.pendingPerks) game.choosePerk(perk.crewId, perk.options[0].id);
      }
    },
  };
}
