import { el, button, money } from '../dom.js';
import { copy } from '../../bridge/copy.js';
import { upgradePayback } from '../manager/model.js';
import { cityModel, inspectRecord } from './contract.js';

function fact(label, node) {
  const cell = el('div', 'city-fact');
  cell.append(el('span', '', label), node);
  return cell;
}

function itemNote(item, catalog) {
  if (item.effect && item.payback) return { effect: item.effect, pay: item.payback, text: `${item.effect}. ${item.payback}` };
  return upgradePayback({ id: item.engineId || item.id, cost: item.cost }, catalog);
}

export function createCityHud(api) {
  const top = el('div', 'city-top');
  const cash = el('strong', 'city-cash', '—');
  const rep = el('strong', 'city-rep', '—');
  const day = el('strong', 'city-day', 'Day 1');
  const time = el('strong', 'city-time', '—');
  const eraName = el('strong', 'city-era-name', 'Cart');
  const vaultBtn = button('—', () => api.manage('Vault'), 'city-vault');
  vaultBtn.setAttribute('aria-label', 'Vault net worth');
  top.append(fact('Cash', cash), fact('Rep', rep), fact('Day', day), fact('Time', time), fact('Era', eraName), fact('Vault', vaultBtn));

  const era = el('div', 'city-era');
  const eraBar = el('progress');
  eraBar.max = 100;
  eraBar.value = 0;
  eraBar.setAttribute('aria-label', 'Era progress');
  const eraNext = el('span', 'city-era-next', '');
  era.append(eraBar, eraNext);

  const speedRow = el('div', 'city-speedbar');
  const build = el('section', 'city-build');
  build.setAttribute('aria-label', 'Build bar');
  const detail = el('p', 'city-detail', 'Pick Cook, Comfort, Hype, or Crew.');
  const items = el('div', 'city-items');
  const cats = el('div', 'city-cats');
  const upgradeBadge = el('span', 'upgrade-badge', '');
  upgradeBadge.hidden = true;
  build.append(detail, items, cats, upgradeBadge);

  const slots = el('div', 'city-slots');
  slots.hidden = true;
  const overlays = el('div', 'city-overlays');
  const readout = el('div', 'city-readout');
  readout.hidden = true;
  const overlayState = { crowd: false, wait: false, happiness: false };
  for (const [id, label] of [['crowd', 'Flow'], ['wait', 'Wait'], ['happiness', 'Mood']]) {
    const control = button(label, () => {
      // One map overlay at a time: turning one on turns the others off, and the scene draws it.
      const on = !overlayState[id];
      for (const key of Object.keys(overlayState)) overlayState[key] = false;
      overlayState[id] = on;
      for (const node of overlays.querySelectorAll('.city-overlay')) {
        const pressed = node === control && on;
        node.setAttribute('aria-pressed', String(pressed));
        node.className = `city-overlay${pressed ? ' is-on' : ''}`;
      }
      document.dispatchEvent(new CustomEvent('quad-overlay', { detail: on ? { crowd: 'flow', wait: 'wait', happiness: 'happy' }[id] : '' }));
      control.setAttribute('aria-pressed', String(overlayState[id]));
      control.className = `city-overlay${overlayState[id] ? ' is-on' : ''}`;
      paintReadout();
    }, 'city-overlay');
    control.setAttribute('aria-pressed', 'false');
    control.setAttribute('aria-label', { crowd: 'Crowd flow', wait: 'Wait time', happiness: 'Happiness' }[id]);
    overlays.append(control);
  }
  overlays.append(readout);

  const inspect = el('section', 'city-inspect');
  inspect.hidden = true;
  inspect.setAttribute('aria-label', 'Inspect');

  let category = 'cook';
  let selected = null;
  let occupied = {};
  let queued = null;
  let itemSig = '';
  let slotSig = '';
  let last = null;
  let watching = false;

  for (const row of [{ id: 'cook', label: 'Cook' }, { id: 'comfort', label: 'Comfort' }, { id: 'hype', label: 'Hype' }, { id: 'crew', label: 'Crew' }]) {
    const control = button(row.label, () => {
      category = row.id;
      selected = null;
      itemSig = '';
      slotSig = '';
      detail.textContent = `Pick a ${row.label} build. Cost, effect, and payback show here.`;
      for (const other of cats.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other.dataset.category === category));
      if (last) update(last.view, last.model, last.when);
    }, 'city-cat');
    control.dataset.category = row.id;
    control.setAttribute('aria-pressed', String(row.id === category));
    cats.append(control);
  }

  function catalog() {
    return api.game().config.manager?.upgrades || {};
  }

  function showInspect(record, extra) {
    if (!record) { inspect.hidden = true; return; }
    inspect.hidden = false;
    inspect.replaceChildren(
      el('strong', '', record.name),
      el('span', 'city-kind', record.kind),
      el('p', '', `Mood · ${record.mood}`),
      el('p', '', `Thought · ${record.thought}`),
      el('p', '', `Order · ${record.order}`),
      el('p', '', record.stats),
    );
    const row = el('div', 'city-inspect-actions');
    row.append(button('Close', () => { inspect.hidden = true; }));
    if (extra?.crewId) row.append(button('Skill tree', () => api.manage(`Crew:${extra.crewId}`)));
    inspect.append(row);
  }

  function inspectCrew(id) {
    const person = last?.model?.crew?.find(row => row.id === id);
    showInspect(inspectRecord('crew', person, copy), { crewId: id });
  }

  function inspectCustomer(id) {
    const customer = (last?.view?.line || []).find(row => String(row.id) === String(id));
    showInspect(inspectRecord('customer', customer, copy));
  }

  function paintReadout() {
    const on = overlayState.crowd || overlayState.wait || overlayState.happiness;
    readout.hidden = !on || !watching;
    if (!on || !last) return;
    const data = cityModel(last.view, last.model, api.game().config);
    readout.replaceChildren();
    if (overlayState.crowd) {
      readout.append(el('p', '', `Crowd flow · ${Math.round(data.overlays.crowd)} on the rope`));
      for (const customer of data.customers.slice(0, 6)) {
        const record = inspectRecord('customer', customer, copy);
        readout.append(button(record.name, () => inspectCustomer(customer.id), 'city-line'));
      }
      if (!data.customers.length) readout.append(el('small', '', 'The rope is empty.'));
    }
    if (overlayState.wait) {
      const wait = data.overlays.wait;
      readout.append(el('p', '', `Wait · ${wait == null ? '—' : `${Math.round(wait)}s average`}`));
    }
    if (overlayState.happiness) readout.append(el('p', '', `Happiness · ${Math.round(data.overlays.happiness)}`));
  }

  function place(item, slot) {
    const open = last && (last.view.phase === 'preopen' || last.view.phase === 'summary' || last.view.manager?.holding);
    if (!open) {
      queued = { engineId: item.engineId, itemId: item.id, slotId: slot.id, name: item.name };
      detail.textContent = `${item.name} is marked on ${slot.id}. The drawer can pay between lunches.`;
      return;
    }
    const result = api.command('buyUpgrade', item.engineId);
    if (result?.ok) {
      occupied = { ...occupied, [slot.id]: item.id };
      queued = null;
      detail.textContent = `Placed ${item.name} on ${slot.id}. ${money(item.cost)} left the drawer.`;
      itemSig = '';
      slotSig = '';
    } else if (result?.reason === 'cant-afford') detail.textContent = `The drawer is short for ${item.name} (${money(item.cost)}).`;
    else if (result?.reason === 'already-used') detail.textContent = `${item.name} is already at the top level.`;
    else detail.textContent = `${item.name} did not place (${result?.reason || 'unavailable'}).`;
    if (last) update(last.view, last.model, last.when);
  }

  function syncItems(data) {
    const list = data.items.filter(item => item.category === category);
    const sig = `${category}|${list.map(item => `${item.id}:${item.level}:${item.cost}`).join(',')}|${selected?.id || ''}`;
    if (sig === itemSig) return;
    itemSig = sig;
    items.replaceChildren();
    for (const item of list) {
      const note = itemNote(item, catalog());
      const control = button(`${item.name} · ${money(item.cost)}`, () => {
        selected = item;
        itemSig = '';
        slotSig = '';
        detail.textContent = `${item.name} · ${money(item.cost)} · ${note.text}`;
        if (last) update(last.view, last.model, last.when);
      }, 'city-item');
      control.dataset.item = item.id;
      control.setAttribute('aria-pressed', String(selected?.id === item.id));
      if (item.level >= item.max) control.disabled = true;
      items.append(control);
    }
    if (!list.length) items.append(el('small', '', 'Nothing in this category yet.'));
  }

  function syncSlots(data) {
    const item = selected ? data.items.find(row => row.id === selected.id) || selected : null;
    const visible = !!(item && watching);
    const openSlots = data.slots.filter(slot => (slot.accepts || []).includes(item?.category) && (slot.free || occupied[slot.id] === item?.id));
    const sig = `${visible}|${item?.id || ''}|${openSlots.map(slot => `${slot.id}:${occupied[slot.id] || ''}:${slot.nx}:${slot.ny}`).join(',')}`;
    slots.hidden = !visible;
    if (!visible || sig === slotSig) return;
    slotSig = sig;
    slots.replaceChildren();
    for (const slot of openSlots) {
      const owned = occupied[slot.id] === item.id;
      const control = button(owned ? 'Upgrade' : 'Place', () => place(item, slot), `city-slot${owned ? ' is-owned' : ' slot-open'}`);
      control.dataset.slot = slot.id;
      control.style.left = `${Math.round(slot.nx * 100)}%`;
      control.style.top = `${Math.round(slot.ny * 100)}%`;
      control.setAttribute('aria-label', `${owned ? 'Upgrade' : 'Place'} ${item.name} on ${slot.id}`);
      slots.append(control);
    }
    if (data.stub.slots) slots.append(el('small', 'city-slot-note', 'Pads sit on the stand until the engine sends tile slots.'));
  }

  function update(view, model, when = {}) {
    last = { view, model, when };
    const data = cityModel(view, model, api.game().config);
    cash.textContent = money(view.cash);
    rep.textContent = String(Math.round(Number(view.manager?.reputation) || 0));
    const shown = when.day || view.day;
    day.textContent = `${when.planningNext ? 'Planning · ' : ''}Day ${shown}`;
    time.textContent = view.clock?.label || '—';
    eraName.textContent = data.era.name;
    eraBar.value = Math.round((data.era.progress || 0) * 100);
    const next = data.era.next;
    const needs = next?.requires?.map(row => `${row.met ? 'met' : 'need'} ${row.label}`).join(' · ') || '';
    eraNext.textContent = next ? `Next ${next.name}${needs ? ` · ${needs}` : ''}` : 'Campus era is open.';
    era.title = data.era.stub ? 'Drawer path toward the pitch. Engine eras replace this bar when they publish.' : data.era.name;
    if (queued && (view.phase === 'preopen' || view.phase === 'summary')) {
      const pending = queued;
      queued = null;
      const result = api.command('buyUpgrade', pending.engineId);
      if (result?.ok) {
        occupied = { ...occupied, [pending.slotId]: pending.itemId };
        detail.textContent = `Placed ${pending.name}. ${money(view.cash)} remains.`;
        itemSig = '';
        slotSig = '';
      } else detail.textContent = result?.reason === 'cant-afford' ? `The drawer is short for ${pending.name}.` : `${pending.name} is still waiting (${result?.reason || 'unavailable'}).`;
    }
    syncItems(data);
    syncSlots(data);
    if (selected) {
      const live = data.items.find(row => row.id === selected.id);
      if (live) {
        const note = itemNote(live, catalog());
        if (!detail.textContent.startsWith('Placed') && !detail.textContent.startsWith('The drawer') && !detail.textContent.includes('marked on')) {
          detail.textContent = `${live.name} · ${money(live.cost)} · level ${live.level}/${live.max} · ${note.text}`;
        }
      }
    }
    paintReadout();
  }

  function setWatching(mode) {
    watching = mode === 'watch';
    overlays.hidden = !watching;
    if (!watching) slots.hidden = true;
    else slotSig = '';
    if (mode !== 'watch' && mode !== 'manager') inspect.hidden = true;
    readout.hidden = !watching || !(overlayState.crowd || overlayState.wait || overlayState.happiness);
  }

  function tap(x, y) {
    if (!watching || !last) return;
    if (selected && !slots.hidden) {
      let best = null;
      let bestDist = 48;
      for (const control of slots.querySelectorAll('button')) {
        const rect = control.getBoundingClientRect?.();
        if (!rect || rect.width < 1) continue;
        const dist = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
        if (dist < bestDist) { best = control; bestDist = dist; }
      }
      if (best) { best.click(); return; }
    }
  }

  const canvas = document.getElementById?.('view');
  if (canvas) {
    let down = null;
    canvas.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
    canvas.addEventListener('pointerup', event => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 8;
      down = null;
      if (!moved) tap(event.clientX, event.clientY);
    });
  }

  function setVault(net, flash) {
    vaultBtn.textContent = money(net);
    vaultBtn.className = `city-vault${flash ? ` settle-${flash}` : ''}`;
  }

  function setUpgradeBadge(count) {
    const n = Number(count) || 0;
    upgradeBadge.hidden = n <= 0;
    upgradeBadge.textContent = n ? String(n) : '';
    if (n) upgradeBadge.setAttribute('aria-label', `${n} upgrades affordable`);
  }

  return { top, era, speedRow, build, slots, overlays, inspect, update, inspectCrew, setWatching, tap, setVault, setUpgradeBadge };
}
