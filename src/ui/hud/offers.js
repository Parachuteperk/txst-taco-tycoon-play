// Coin flip and signature offers. The day is not paused.
// A face or a payout is shown only when the engine sends one.

import { el, button, money } from '../dom.js';

export const COIN_SECONDS = 20;

export const STANDING = [
  { id: 'coinFlip', label: 'Coin flip', choices: [['decline', 'Always decline'], ['small', 'Accept small'], ['yolo', 'YOLO']] },
  { id: 'angel-round', label: 'Angel Round', choices: [['decline', 'Always decline'], ['accept', 'Accept'], ['yolo', 'YOLO']] },
  { id: 'twitch-raid', label: 'Stream Raid', choices: [['decline', 'Always decline'], ['accept', 'Accept'], ['yolo', 'YOLO']] },
  { id: 'hostile-takeover', label: 'Hostile Takeover', choices: [['decline', 'Always decline'], ['accept', 'Accept'], ['yolo', 'YOLO']] },
  { id: 'franchise-scandal', label: 'Franchise scandal', choices: [['decline', 'Always decline'], ['accept', 'Accept'], ['yolo', 'YOLO']] },
];

const COPY = {
  coinFlip: 'A frat guy challenges Jared to a coin flip!',
  'angel-round': 'Mrs. West opens the purse and offers an angel round.',
  'twitch-raid': 'Chat is raiding the Quad. Antonio wants to let them in.',
  'hostile-takeover': 'Mrs. West smiles at the rival and calls it a hostile takeover.',
  'franchise-scandal': 'A franchise flag just caught a campus scandal.',
};

function offerPolicy(settings, id) {
  if (id === 'coinFlip') return settings?.coinFlip || 'decline';
  return settings?.offers?.[id] || 'decline';
}

export function readChallenges(view, events = []) {
  const cards = [];
  const push = row => {
    if (!row?.id || cards.some(card => card.id === row.id)) return;
    cards.push(row);
  };
  if (view?.coinFlip?.open) {
    push({
      kind: 'coinFlip',
      id: String(view.coinFlip.id || `coin-${view.day}`),
      text: view.coinFlip.text || COPY.coinFlip,
      cash: Number.isFinite(view.coinFlip.cash) ? view.coinFlip.cash : view.cash,
      remaining: Number.isFinite(view.coinFlip.remaining) ? view.coinFlip.remaining : COIN_SECONDS,
    });
  }
  const bags = [...(events || [])];
  for (const row of view?.offers || view?.signatureOffers || []) bags.push(row);
  if (view?.franchise?.scandal?.open) bags.push({ ...view.franchise.scandal, type: 'franchise-scandal', id: view.franchise.scandal.id || `scandal-${view.day}` });
  for (const event of bags) {
    const type = event.type || event.kind || event.id;
    if ((type === 'coinFlip' || event.type === 'coinFlip') && event.kind !== 'resolve' && !event.result && !event.face) {
      push({ kind: 'coinFlip', id: String(event.id || `coin-${view?.day}`), text: event.text || COPY.coinFlip, cash: Number.isFinite(event.cash) ? event.cash : view?.cash, remaining: COIN_SECONDS });
    }
    if (['angel-round', 'twitch-raid', 'hostile-takeover', 'franchise-scandal', 'offer'].includes(type) && event.kind !== 'resolve' && event.open !== false) {
      const id = String(event.id || type);
      const kind = ['angel-round', 'twitch-raid', 'hostile-takeover', 'franchise-scandal'].includes(id) ? id : type;
      if (kind === 'offer' && !STANDING.some(row => row.id === id)) continue;
      push({ kind: STANDING.some(row => row.id === kind) ? kind : id, id, text: event.text || COPY[kind] || COPY[id] || 'An offer just walked up.', cash: view?.cash, remaining: Number.isFinite(event.remaining) ? event.remaining : COIN_SECONDS });
    }
  }
  return cards;
}

export function coinOutcome(view, events = []) {
  const published = view?.coinFlip;
  if (published && (published.face || published.result || published.kind === 'resolve')) {
    const face = published.face || published.result;
    if (face === 'heads' || face === 'tails') return { face, payout: Number.isFinite(published.payout) ? published.payout : null, win: published.win };
  }
  for (const event of events || []) {
    if (event.type !== 'coinFlip' && event.kind !== 'resolve') continue;
    const face = event.face || event.result;
    if (face === 'heads' || face === 'tails') return { face, payout: Number.isFinite(event.payout) ? event.payout : null, win: event.win };
  }
  return null;
}

function ring() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('class', 'offer-ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(svg.namespaceURI, 'circle');
  const head = document.createElementNS(svg.namespaceURI, 'circle');
  for (const node of [track, head]) {
    node.setAttribute('cx', '18');
    node.setAttribute('cy', '18');
    node.setAttribute('r', '15');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke-width', '3');
  }
  track.setAttribute('stroke', '#ffffff33');
  head.setAttribute('stroke', 'currentColor');
  head.setAttribute('class', 'offer-ring-head');
  svg.append(track, head);
  return { svg, head };
}

export function createOfferDeck(api) {
  const root = el('aside', 'offer-card');
  root.hidden = true;
  root.setAttribute('aria-label', 'Offer');
  const kicker = el('p', 'offer-kicker', '');
  const copy = el('p', 'offer-copy', '');
  const chips = el('div', 'offer-chips');
  const actions = el('div', 'offer-actions');
  const clock = ring();
  const seconds = el('span', 'offer-seconds', '20');
  const status = el('p', 'offer-status', '');
  const stage = el('div', 'coin-stage');
  stage.hidden = true;
  const coin = el('div', 'coin', '');
  const burst = el('p', 'coin-burst', '');
  const deckNote = el('p', 'offer-wait', '');
  deckNote.hidden = true;
  stage.append(coin, burst);
  root.append(kicker, copy, chips, actions, clock.svg, seconds, status);

  let active = null;
  let wager = 0.1;
  let left = COIN_SECONDS;
  const closed = new Set();
  let pendingFlip = '';

  function cashOf() {
    return Number(active?.cash) || 0;
  }

  function paintChips() {
    chips.replaceChildren();
    if (active?.kind !== 'coinFlip') {
      chips.hidden = true;
      return;
    }
    chips.hidden = false;
    for (const pct of [0.1, 0.25, 0.5]) {
      const control = button(`${Math.round(pct * 100)}% · ${money(cashOf() * pct)}`, () => {
        wager = pct;
        paintChips();
      }, 'offer-chip');
      control.setAttribute('aria-pressed', String(wager === pct));
      chips.append(control);
    }
  }

  function hide() {
    active = null;
    root.hidden = true;
  }

  function commandFor(choice, pct) {
    if (!active) return { ok: false, reason: 'closed' };
    if (active.kind === 'coinFlip') {
      const stake = choice === 'pass' ? 0 : Math.round(cashOf() * pct * 100) / 100;
      return api.command('coinFlip', { id: active.id, choice, wager: stake });
    }
    const method = active.kind === 'franchise-scandal' ? 'franchiseScandal' : 'chooseOffer';
    return api.command(method, { id: active.id, choice });
  }

  function showStage(outcome, reduced) {
    stage.hidden = false;
    if (!outcome) {
      coin.textContent = '';
      coin.className = reduced ? 'coin' : 'coin is-spin';
      burst.textContent = 'The engine has not settled the flip.';
      return;
    }
    coin.className = 'coin';
    coin.textContent = outcome.face === 'heads' ? 'Heads' : 'Tails';
    if (outcome.payout == null) burst.textContent = `${outcome.face === 'heads' ? 'Heads' : 'Tails'}. The engine has not sent a payout.`;
    else burst.textContent = `${outcome.win === false ? 'Lost' : 'Won'} ${money(Math.abs(outcome.payout))}.`;
  }

  function answer(choice, reduced) {
    if (!active) return;
    const id = active.id;
    const kind = active.kind;
    const pct = choice === 'yolo' ? 0.5 : choice === 'small' ? 0.1 : wager;
    const sent = choice === 'pass' ? 'pass' : 'accept';
    closed.add(id);
    const result = commandFor(sent, choice === 'pass' ? 0 : pct);
    hide();
    if (kind === 'coinFlip' && sent === 'accept') {
      pendingFlip = id;
      const outcome = result?.face || result?.result ? coinOutcome({ coinFlip: result }) : null;
      showStage(outcome, reduced);
      if (!result?.ok || !outcome) burst.textContent = 'The engine has not settled the flip.';
    } else if (!result?.ok) {
      deckNote.hidden = false;
      deckNote.textContent = 'This offer waits on the engine. Nothing was charged.';
    }
    return result;
  }

  function open(card, settings) {
    active = card;
    left = card.remaining ?? COIN_SECONDS;
    wager = 0.1;
    root.hidden = false;
    root.dataset.offer = card.kind;
    kicker.textContent = STANDING.find(row => row.id === card.kind)?.label || 'Offer';
    copy.textContent = card.text;
    status.textContent = '';
    actions.replaceChildren(
      button('Accept', () => answer('accept', false), 'node-buy'),
      button('Pass', () => answer('pass', false), 'node-buy'),
    );
    paintChips();
    paintClock(settings);
  }

  function paintClock() {
    const frac = Math.max(0, Math.min(1, left / COIN_SECONDS));
    const length = 2 * Math.PI * 15;
    clock.head.setAttribute('stroke-dasharray', String(length));
    clock.head.setAttribute('stroke-dashoffset', String(length * (1 - frac)));
    seconds.textContent = String(Math.ceil(left));
  }

  function applyPolicy(settings) {
    if (!active) return;
    const policy = offerPolicy(settings, active.kind);
    const reduced = !!settings?.reducedMotion;
    if (active.kind === 'coinFlip') {
      if (policy === 'small') answer('small', reduced);
      else if (policy === 'yolo') answer('yolo', reduced);
      else answer('pass', reduced);
      return;
    }
    if (policy === 'accept' || policy === 'yolo') answer(policy, reduced);
    else answer('pass', reduced);
  }

  function update(view, events, dt, settings) {
    const outcome = coinOutcome(view, events);
    if (outcome && pendingFlip) showStage(outcome, settings?.reducedMotion);
    const cards = readChallenges(view, events).filter(card => !closed.has(card.id));
    if (active && !cards.some(card => card.id === active.id) && active.kind !== 'coinFlip') hide();
    if (!active && cards.length) open(cards[0], settings);
    if (!active) return;
    if (Number.isFinite(dt)) left -= dt;
    paintClock();
    if (left <= 0) applyPolicy(settings);
  }

  return { root, stage, note: deckNote, update, get active() { return active; } };
}

export function renderPolicies(parent, settings, onChange) {
  const box = el('details', 'strategy-offers');
  box.append(el('summary', '', 'Coin flip and signature offers'));
  for (const row of STANDING) {
    const group = el('fieldset', 'policy-segments');
    group.append(el('legend', '', row.label));
    const current = offerPolicy(settings, row.id);
    for (const [id, text] of row.choices) {
      const control = button(text, () => onChange(row.id, id));
      control.setAttribute('aria-pressed', String(current === id));
      group.append(control);
    }
    box.append(group);
  }
  box.append(el('small', 'strategy-copy', 'If nobody taps the card, the standing call answers when the ring runs out. Decline lets the day run itself.'));
  parent.append(box);
}
