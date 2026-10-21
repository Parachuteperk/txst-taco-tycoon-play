import { money } from './util.js';

export function blankLedger(cash, tortillasOnHand) {
  return {
    revenue: 0,
    food: 0,
    tips: 0,
    fillingPaid: 0,
    guacPaid: 0,
    purchases: 0,
    tortillasBought: 0,
    tortillasStart: tortillasOnHand,
    tortillasEnd: tortillasOnHand,
    overhead: 0,
    fines: 0,
    capex: 0,
    cogs: 0,
    profit: 0,
    premium: 0,
    tacos: 0,
    walkoffs: 0,
    walkBys: 0,
    wasted: 0,
    goldenHit: 0,
    goldenMiss: 0,
    bestCombo: 0,
    holdSeconds: 0,
    peakLine: 0,
    bigRushId: null,
    hackId: null,
    hackBackfire: false,
    callId: null,
    westChoice: null,
    outpostSold: 0,
    outpostRestocks: 0,
    outpostRevenue: 0,
    cashStart: cash,
    storyKey: null,
    freightProc: false,
    decisions: 0,
    bonus: 0,
    marketing: 0,
    stockout: false,
    settled: false,
  };
}

export function tortillasOnHand(state) {
  return state.inventory.tortillas + (state.outpost ? state.outpost.stock : 0);
}

// Cash identity, true any time the ledger is current (including after a post-close hire):
// cash = cashStart + revenue + bonus + bailout - loanPayment - filling - guac - purchases - overhead - fines - capex - marketing
// bonus is an endless challenge purse. A bailout is the one-time SIFE float. Marketing is drawer cash, like capex, and is not profit.
export function cashBridge(day) {
  return money(
    day.cashStart + day.revenue + (day.bonus || 0) + (day.bailout || 0) - (day.loanPayment || 0)
    - day.fillingPaid - day.guacPaid - day.purchases
    - day.overhead - day.fines - day.capex - (day.marketing || 0),
  );
}

// Profit uses ingredient consumption, not the cash timing of the tortilla buy.
// Leftover tortillas are inventory, not a loss. Capex is not profit.
export function computePnL(day, economy) {
  const consumed = day.tortillasStart + day.tortillasBought - day.tortillasEnd;
  const premium = money(day.purchases - day.tortillasBought * economy.tortilla);
  const cogs = money(day.fillingPaid + day.guacPaid + consumed * economy.tortilla + premium);
  const profit = money(day.revenue - cogs - day.overhead - day.fines);
  return { cogs, profit, premium, consumed };
}

export function bookSale(state, { food, tip, filling = 0, guac = 0, tacos = 1, outpost = false }) {
  const day = state.dayLedger;
  const rev = money(food + tip);
  state.cash = money(state.cash + rev - filling - guac);
  day.revenue = money(day.revenue + rev);
  day.food = money(day.food + food);
  day.tips = money(day.tips + tip);
  day.fillingPaid = money(day.fillingPaid + filling);
  day.guacPaid = money(day.guacPaid + guac);
  day.tacos += tacos;
  if (outpost) {
    day.outpostRevenue = money(day.outpostRevenue + rev);
    day.outpostSold += tacos;
  }
}

export function payFine(state, amount) {
  state.cash = money(state.cash - amount);
  state.dayLedger.fines = money(state.dayLedger.fines + amount);
}

export function payCapex(state, amount) {
  state.cash = money(state.cash - amount);
  state.dayLedger.capex = money(state.dayLedger.capex + amount);
}
