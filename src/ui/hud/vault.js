// Jared's gold and silver. Engine prices and holdings win.
// Without view.vault the chart is a labeled preview and holdings stay at 0.

import { el, button, money } from '../dom.js';

function wave(base, day, t, salt) {
  const drift = Math.sin((day * 1.3 + t / 55 + salt) * 1.4) * base * 0.04
    + Math.sin((day * 0.7 + t / 140 + salt) * 0.8) * base * 0.07;
  return Math.round((base + drift) * 100) / 100;
}

export function quoteMetals(view) {
  const vault = view?.vault || {};
  const preview = !(Number.isFinite(vault.gold?.price) && Number.isFinite(vault.silver?.price));
  const day = Number(view?.day) || 1;
  const t = Number(view?.t) || 0;
  const goldPrice = preview ? wave(18, day, t, 1) : Number(vault.gold.price);
  const silverPrice = preview ? wave(4.5, day, t, 2) : Number(vault.silver.price);
  const goldHold = Number(vault.gold?.holdings) || 0;
  const silverHold = Number(vault.silver?.holdings) || 0;
  return { preview, day, t, goldPrice, silverPrice, goldHold, silverHold, settle: vault.settle || null };
}

export function netWorth(cash, quote) {
  return (Number(cash) || 0) + quote.goldHold * quote.goldPrice + quote.silverHold * quote.silverPrice;
}

function spark(points, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 180 48');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const nums = points.filter(Number.isFinite);
  if (nums.length < 2) return svg;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = (hi - lo) || 1;
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('points', nums.map((n, i) => `${4 + i * 172 / (nums.length - 1)},${42 - ((n - lo) / span) * 34}`).join(' '));
  svg.append(line);
  return svg;
}

function ouncesFor(side, pct, quote, metal, cash) {
  const price = metal === 'gold' ? quote.goldPrice : quote.silverPrice;
  const held = metal === 'gold' ? quote.goldHold : quote.silverHold;
  if (!(price > 0) || !(pct > 0)) return 0;
  if (side === 'buy') return Math.round(((Number(cash) || 0) * pct) / price * 100) / 100;
  return Math.round(held * pct * 100) / 100;
}

export function createVaultPanel(api) {
  const root = el('div', 'vault-grid');
  const goldHold = el('strong', 'vault-gold-hold', '0 oz');
  const silverHold = el('strong', 'vault-silver-hold', '0 oz');
  const goldValue = el('strong', 'vault-gold-value', '—');
  const silverValue = el('strong', 'vault-silver-value', '—');
  const goldPrice = el('strong', 'vault-gold-price', '—');
  const silverPrice = el('strong', 'vault-silver-price', '—');
  const note = el('p', 'sig-note', '');
  const settleNote = el('p', 'vault-settle', '');
  const goldChart = el('div', 'vault-chart');
  const silverChart = el('div', 'vault-chart');
  const goldSlider = el('input', 'vault-slider');
  const silverSlider = el('input', 'vault-slider');
  for (const slider of [goldSlider, silverSlider]) {
    slider.type = 'range';
    slider.min = '0';
    slider.max = '50';
    slider.step = '1';
    slider.value = '10';
  }
  goldSlider.setAttribute('aria-label', 'Gold trade percent');
  silverSlider.setAttribute('aria-label', 'Silver trade percent');
  const goldPct = el('span', 'vault-pct', '10%');
  const silverPct = el('span', 'vault-pct', '10%');
  goldSlider.addEventListener('input', () => { goldPct.textContent = `${goldSlider.value}%`; });
  silverSlider.addEventListener('input', () => { silverPct.textContent = `${silverSlider.value}%`; });

  let history = { day: 0, gold: [], silver: [] };
  let flash = '';
  let flashFor = 0;
  let settledDay = 0;
  let last = null;

  function pushHistory(quote) {
    if (history.day !== quote.day) history = { day: quote.day, gold: [], silver: [] };
    const engineGold = last?.vault?.gold?.history;
    const engineSilver = last?.vault?.silver?.history;
    if (Array.isArray(engineGold) && engineGold.length) history.gold = engineGold.map(Number).filter(Number.isFinite);
    else if (!history.gold.length || history.gold.at(-1) !== quote.goldPrice) history.gold = [...history.gold, quote.goldPrice].slice(-48);
    if (Array.isArray(engineSilver) && engineSilver.length) history.silver = engineSilver.map(Number).filter(Number.isFinite);
    else if (!history.silver.length || history.silver.at(-1) !== quote.silverPrice) history.silver = [...history.silver, quote.silverPrice].slice(-48);
  }

  function direction(quote) {
    if (quote.settle && typeof quote.settle.up === 'boolean') return quote.settle.up ? 'up' : 'down';
    const goldMove = history.gold.length > 1 ? history.gold.at(-1) - history.gold[0] : 0;
    const silverMove = history.silver.length > 1 ? history.silver.at(-1) - history.silver[0] : 0;
    const delta = goldMove + silverMove;
    if (!delta) return '';
    return delta > 0 ? 'up' : 'down';
  }

  function trade(side, metal) {
    const quote = quoteMetals(last || {});
    const slider = metal === 'gold' ? goldSlider : silverSlider;
    const qty = ouncesFor(side, Number(slider.value) / 100, quote, metal, last?.cash);
    if (!(qty > 0)) {
      note.textContent = side === 'sell' ? 'No ounces to sell. Holdings stay at 0 until the engine reports them.' : 'The drawer cannot buy a fraction that small.';
      return { ok: false, reason: 'empty' };
    }
    const method = side === 'buy' ? 'invest' : 'sell';
    const result = api.command(method, metal, qty);
    note.textContent = result?.ok
      ? `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} oz ${metal}.`
      : `The trade waits on manager.${method}. Cash stays put.`;
    return result;
  }

  function metalCard(metal, priceNode, holdNode, valueNode, chart, slider, pct, quick) {
    const card = el('section', 'manager-card vault-metal');
    card.dataset.metal = metal;
    card.append(el('h3', '', metal === 'gold' ? 'Gold' : 'Silver'), priceNode, chart, el('p', '', 'Holdings'), holdNode, el('p', '', 'Value'), valueNode, slider, pct);
    const row = el('div', 'vault-quick');
    for (const step of [10, 25, 50]) row.append(button(`${step}%`, () => { slider.value = String(step); pct.textContent = `${step}%`; quick(); }));
    card.append(row, button('Buy', () => trade('buy', metal), 'node-buy'), button('Sell', () => trade('sell', metal), 'node-buy'));
    return card;
  }

  root.append(
    note,
    settleNote,
    metalCard('gold', goldPrice, goldHold, goldValue, goldChart, goldSlider, goldPct, () => {}),
    metalCard('silver', silverPrice, silverHold, silverValue, silverChart, silverSlider, silverPct, () => {}),
  );

  function sample(view, dt = 0) {
    last = view;
    const quote = quoteMetals(view);
    pushHistory(quote);
    if (view?.phase === 'summary' && settledDay !== quote.day) {
      settledDay = quote.day;
      flash = direction(quote);
      flashFor = flash ? 2.5 : 0;
    }
    if (flashFor > 0) {
      flashFor = Math.max(0, flashFor - dt);
      if (flashFor === 0) flash = '';
    }
    const net = netWorth(view?.cash, quote);
    return { ...quote, net, flash, history: { gold: history.gold.slice(), silver: history.silver.slice() } };
  }

  function paint(tape) {
    goldPrice.textContent = `${money(tape.goldPrice)} / oz`;
    silverPrice.textContent = `${money(tape.silverPrice)} / oz`;
    goldHold.textContent = `${tape.goldHold} oz`;
    silverHold.textContent = `${tape.silverHold} oz`;
    goldValue.textContent = money(tape.goldHold * tape.goldPrice);
    silverValue.textContent = money(tape.silverHold * tape.silverPrice);
    goldChart.replaceChildren(spark(tape.history.gold, 'Gold price'));
    silverChart.replaceChildren(spark(tape.history.silver, 'Silver price'));
    root.className = `vault-grid${tape.flash ? ` settle-${tape.flash}` : ''}`;
    const preview = tape.preview ? 'Preview prices from the day clock. Holdings stay at 0 until the engine reports them.' : 'Prices and holdings from the vault.';
    if (!note.textContent.startsWith('The trade') && !note.textContent.startsWith('Bought') && !note.textContent.startsWith('Sold') && !note.textContent.startsWith('No ounces')) note.textContent = preview;
    const move = tape.flash === 'up' ? 'Day close · up' : tape.flash === 'down' ? 'Day close · down' : '';
    settleNote.textContent = move;
    return tape;
  }

  function update(view, dt = 0) {
    const tape = sample(view, dt);
    paint(tape);
    return tape;
  }

  return { root, update, sample, paint, get flash() { return flash; } };
}
