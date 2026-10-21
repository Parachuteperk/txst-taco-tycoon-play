import { el, button, money, select } from './dom.js';
import { copy, hackKeys, eventCopy } from '../bridge/copy.js';
import { recordDay } from '../shell/storage.js';
import { createBigRushHud } from './bigRush.js';
import { pendingPerks, perkCardModel, createPerkOptions } from './perkCard.js';
import { createSafeUiLayout } from './layout.js';
import { icon, iconize } from './icons.js';
import { openEventCards, eventCardKey, eventCardModel, fillEventCard } from './eventCard.js';
import { createSeasonProgress, reachedMilestones, seasonNeedsReview, fillSeasonSummary } from './season.js';
import { createOnboarding } from './onboarding.js';
import { portrait } from './portraits.js';

export function createUI(api) {
  const root = el('div'); root.id = 'taco-ui'; document.body.append(root);
  const dusk = el('div', 'dusk'); dusk.hidden = true;
  const hud = el('div', 'hud'), left = el('div', 'hud-block'), day = el('div', 'eyebrow'), clock = el('div', 'clock');
  const clockValue = el('span'); clock.append(icon('timer', 18), clockValue);
  const track = el('div', 'rush-track'), fill = el('i'); track.append(fill);
  const bigRushHud = createBigRushHud(), semesterProgress = createSeasonProgress(); left.append(day, clock, track, bigRushHud.count, bigRushHud.banner, semesterProgress.node);
  const right = el('div', 'hud-right'), cash = el('div', 'hud-block cash'), cashValue = el('span');
  cash.append(icon('cash', 22), cashValue);
  const mute = button('Sound on', () => api.toggleSound()), pause = iconize(button('Pause game', () => api.pause(), 'icon-only'), 'pause', 22); pause.setAttribute('aria-label', 'Pause game');
  right.append(cash, mute, pause); hud.append(left, right);
  const combo = el('div', 'combo'), comboValue = el('span'), actions = el('div', 'actions'), hint = el('div', 'hint');
  combo.append(icon('combo', 22), comboValue); combo.hidden = true;
  const dock = el('div', 'controls-dock'); dock.append(hint, actions);
  const layout = createSafeUiLayout(root);
  const toasts = el('div', 'toasts'); toasts.setAttribute('aria-live', 'polite');
  const sheet = el('section', 'sheet'); sheet.hidden = true; sheet.setAttribute('aria-label', 'Stand choices');
  const modal = el('div', 'modal'); modal.hidden = true;
  const ring = el('div', 'ring'); ring.hidden = true;
  const golden = iconize(button('Golden handoff', () => api.invoke('tapGolden'), 'world-label golden'), 'combo', 22); golden.hidden = true;
  const agenda = el('div', 'world-label'); agenda.hidden = true;
  root.append(dusk, hud, combo, toasts, agenda, golden, dock, sheet, ring, modal);
  let v = null, panel = '', panelKey = '', openModal = '', displayedCash = null, oldFocus = null;
  let nextToast = 0, queue = [], agendaUntil = 0, codeAt = 0, settings = {}, perkFlow = false;
  let activeEvent = null, seasonReviewed = false, modalOnboard = null;
  const deferredEvents = new Set();
  const tutorial = createOnboarding((...args) => api.invoke(...args), openHint); root.append(tutorial.node);
  const playing = () => !openModal;
  layout.register('hud-status', left, { prefer: 'top-left', priority: 11, preferredWidth: () => innerWidth <= 600 ? 154 : 220, resizeWidth: true, minWidth: 138, active: playing });
  layout.register('hud-cash-menu', right, { prefer: 'top-right', priority: 10, active: playing });
  layout.register('controls', dock, { prefer: 'bottom-center', priority: 30, active: () => !panel && playing() });
  layout.register('choices', sheet, { prefer: 'bottom-right', priority: 0, preferredWidth: 420, resizeWidth: true, minWidth: 220, scroll: true, minHeight: 104, active: () => !!panel && playing() });
  layout.register('onboarding', tutorial.node, {prefer:'bottom-center',priority:25,preferredWidth:330,resizeWidth:true,minWidth:220,scroll:true,minHeight:100,active:()=>!panel&&playing()});
  layout.register('combo', combo, { prefer: 'top-right', priority: 40, active: () => !panel && playing() });
  layout.register('speech', toasts, { prefer: 'top-center', priority: 50, preferredWidth: 340, resizeWidth: true, minWidth: 190, active: () => !panel && (!openModal || ['summary', 'season'].includes(openModal)) });
  layout.register('golden', golden, { priority: 20, anchor: geometry => geometry.anchors.golden, active: () => !panel && playing() });
  layout.register('agenda', agenda, { priority: 55, anchor: geometry => geometry.anchors.agenda, active: () => !panel && playing() });
  layout.register('hold', ring, { priority: 25, anchor: () => ({x:Number(ring.dataset.anchorX),y:Number(ring.dataset.anchorY)}), active: () => !panel && playing() });
  const toast = text => { if (!text) return; if (queue.at(-1) !== text) queue.push(text); queue = queue.slice(-5); };
  const act = (label, method, args = [], desc = '', iconName = null) => { const b = button(label, () => api.invoke(method, ...args)); if (iconName) iconize(b, iconName); if (desc) b.append(el('small', '', desc)); return b; };
  function actionButton(label, compact, onClick, iconName) {
    const b = button('', onClick); b.setAttribute('aria-label', label);
    b.append(icon(iconName, 18), el('span', 'label-full', label), el('span', 'label-compact', compact));
    return b;
  }
  function closeSheet() { if (panel === 'event' && activeEvent && v) deferredEvents.add(eventCardKey(v, activeEvent)); activeEvent = null; panel = ''; panelKey = ''; sheet.hidden = true; sheet.replaceChildren(); api.hold.release(); }
  function startSheet(id, title, subtitle = '') {
    api.hold.release(); panel = id; sheet.removeAttribute('aria-description'); sheet.hidden = false; sheet.className = `sheet ui-positioned ${id === 'hack' ? 'terminal' : ''}`; sheet.replaceChildren();
    const head = el('div', 'sheet-header');
    const heading = iconize(el('h2', '', title), { call: 'callLine', hack: 'hack', channel: 'hack', supplies: 'tortillas', outpost: 'cooler', perk: 'levelUp', west: 'advice', event: activeEvent ? eventCardModel(activeEvent).icon : 'weather' }[id] || 'settings', 26);
    head.append(heading, button('×', () => { if (panel === 'perk') perkFlow = false; closeSheet(); })); sheet.append(head);
    if (subtitle) sheet.append(el('p', '', subtitle));
    return sheet;
  }
  function optionsCard(id, title, desc, options) {
    const node = startSheet(id, title, desc), choices = el('div', 'options');
    options.forEach(([label, method, args, detail]) => { const b = button(label, () => { if (api.invoke(method, ...args).ok) closeSheet(); }); iconize(b, id === 'call' ? ({ protectGrill: 'heat', clearLine: 'speed', feedTheRegular: 'trust' }[args[0]] || 'queue') : args[0] === 'redirect' ? 'patience' : 'advice'); if (detail) b.append(el('small', '', detail)); choices.append(b); }); node.append(choices);
  }
  function showEvent(card) {
    activeEvent = card;
    const model = eventCardModel(card), node = startSheet('event', model.title);
    node.dataset.eventDeck = card.deck; node.dataset.eventId = card.id;
    fillEventCard(node, card, v, (deck, id) => {
      const result = api.invoke('chooseEvent', deck, id);
      if (result.ok) closeSheet();
      return result;
    });
  }
  function openHint(id) {
    if (openModal === 'summary') closeModal();
    if (id === 'callLine' && v.prompts.call) showCall();
    if (id === 'terminal' && v.prompts.hack) { showHack(); api.invoke('dismissHint', id); }
    if (id === 'hire') { showOutpost(); api.invoke('dismissHint', id); }
  }
  function showCall() {
    optionsCard('call', copy('aaron.call.title'), 'One call for this rush. Choose the tradeoff.', [
      ['Protect the Grill', 'callTheLine', ['protectGrill'], 'Ali faster; the line loses patience faster.'],
      ['Clear the Line', 'callTheLine', ['clearLine'], 'Prep and pickup faster; grill slower; calmer line.'],
      ['Feed the Regular', 'callTheLine', ['feedTheRegular'], 'Next regular goes first; everyone else gets grumpier.'],
    ]);
  }
  function showHack() {
    const node = startSheet('hack', copy('antonio.hack.title'), 'Pick a target. Hold it briefly to launch. One prank per rush.');
    node.setAttribute('aria-description', copy('character.antonio.description'));
    node.append(el('div', 'eyebrow', copy('character.antonio.role')));
    const choices = el('div', 'options');
    for (const [id, target] of Object.entries(api.game().config.hacks.targets)) {
      const b = button(copy(`antonio.hack.${hackKeys[id]}.label`), () => {});
      iconize(b, 'hack');
      b.append(el('small', '', `${copy(`antonio.hack.${hackKeys[id]}.hint`)} · ${Math.round(target.backfire * 100)}% backfire · +${target.suspicion} suspicion`));
      let timer;
      const cancel = () => { clearTimeout(timer); b.classList.remove('selected'); };
      const launch = () => { cancel(); const result = api.invoke('startHack', id); if (result.ok) { panelKey = ''; showChannel(); } };
      b.addEventListener('pointerdown', e => { if (e.button !== 0) return; b.setPointerCapture(e.pointerId); b.classList.add('selected'); timer = setTimeout(launch, 350); });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, cancel);
      b.addEventListener('click', e => { if (e.detail === 0) launch(); });
      choices.append(b);
    }
    node.append(choices, iconize(el('p', 'status', `Dale’s suspicion: ${v.suspicion}/100 · eases each morning`), 'suspicion', 18));
  }
  function showChannel() {
    const node = startSheet('channel', 'ANTONIO.EXE / running', 'Antonio has it from here.');
    node.append(el('pre', 'code', '> connecting to taco.local…'), el('p', 'status', '')); codeAt = 0;
  }
  function showSupplies() {
    const node = startSheet('supplies', 'Before the bell', 'Tortillas keep tomorrow. Rush restocks cost more and pause prep.');
    const stock = el('p', 'stock'), stockValue = el('span', 'stock-value', `${v.inventory.tortillas} tortillas in the cooler`); stock.append(icon('tortillas'), stockValue); node.append(stock);
    const restock = act('Buy 30 tortillas', 'restock', [30], '', 'tortillas');
    restock.append(el('small', '', v.phase === 'rush' ? 'Emergency price: up to $17.40' : 'Wholesale: up to $8.40'));
    node.append(restock);
    if (v.phase === 'preopen') {
      const prices = el('div', 'options');
      for (const [id, price] of Object.entries(api.game().config.economy.prices)) {
        const b = act(`${id[0].toUpperCase() + id.slice(1)} · ${money(price.price)}`, 'setPrice', [id], copy(price.textKey)); iconize(b, 'cash'); b.classList.toggle('selected', v.priceBand === id); b.addEventListener('click', showSupplies); prices.append(b);
      }
      node.append(el('p', '', 'Today’s taco price'), prices);
    }
  }
  function showOutpost() {
    const node = startSheet('outpost', 'A little taco empire', v.outpost ? `${v.outpost.name} · ${v.outpost.stock} tacos · ${v.outpost.status.replace(/([A-Z])/g, ' $1').toLowerCase()}` : 'Hire a freshman with a cooler. $100 + daily wages.');
    const spots = select('Campus spot', Object.entries(api.game().config.outpost.spots).map(([id, s]) => [id, copy(s.textKey)]), v.outpost?.spot || 'alkek');
    node.append(spots.wrap);
    if (!v.outpost) {
      const candidates = select('Freshman', [['eager', 'Benny · fast, sometimes forgets to charge'], ['shy', 'Priya · slower, better tips'], ['hustler', 'Chuy · higher prices, fewer sales'], ['homesick', 'Jules · slow walk, generous friends']], 'eager');
      iconize(candidates.wrap, 'hire');
      const hire = button('Hire · $100', () => {
        const names = { eager: 'Benny', shy: 'Priya', hustler: 'Chuy', homesick: 'Jules' };
        if (api.invoke('hireOutpost', { spot: spots.input.value, quirk: candidates.input.value, name: names[candidates.input.value] }).ok) { v = api.game().getView(); showOutpost(); }
      }); node.append(candidates.wrap, iconize(hire, 'hire'));
    } else {
      node.append(iconize(button('Move cooler', () => api.invoke('setOutpostSpot', spots.input.value)), 'cooler'));
      if (v.outpost.tier === 1) node.append(iconize(button('Folding Table · $220', () => { if (api.invoke('upgradeOutpost').ok) { v = api.game().getView(); showOutpost(); } }), 'upgrade'));
    }
    for (const tier of api.game().config.outpost.tiers) node.append(iconize(el('div', `tier ${tier.simulated ? '' : 'locked'}`, `${tier.tier}. ${tier.id.replace(/([A-Z])/g, ' $1')} · ${money(tier.cost)}${tier.simulated ? '' : ' · coming later'}`), tier.tier === 1 ? 'cooler' : 'upgrade', 16));
    if (!['summary', 'preopen'].includes(v.phase)) { node.append(el('p', 'status', 'Hiring, moving, and upgrades open between days.')); node.querySelectorAll('button,select').forEach(b => { if (b.textContent !== '×') b.disabled = true; }); }
  }
  function modalPanel(kind, title) {
    closeSheet(); modalOnboard = null; layout.remove('title-logo'); if (kind === 'title') perkFlow = false; oldFocus = document.activeElement; openModal = kind; root.classList.toggle('on-title', kind === 'title'); modal.className = 'modal'; modal.hidden = false; modal.replaceChildren();
    const node = el('section', 'modal-panel'); node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', title); node.tabIndex = -1;
    layout.register('modal-card', node, {prefer:kind==='title'?'bottom-right':'bottom-center',priority:0,preferredWidth:kind==='title'?420:520,resizeWidth:true,minWidth:220,scroll:true,minHeight:120});
    modal.append(node); const heading = el('h2', '', title); if (kind === 'pause' || kind === 'summary') iconize(heading, kind === 'pause' ? 'pause' : 'tacos', 28); node.append(el('div', 'eyebrow', 'Texas State · San Marcos'), heading); queueMicrotask(() => node.focus()); return node;
  }
  function closeModal() { modalOnboard = null; layout.remove('modal-card'); layout.remove('title-logo'); root.classList.remove('on-title'); modal.hidden = true; modal.replaceChildren(); openModal = ''; oldFocus?.focus?.(); }
  function title(saved) {
    seasonReviewed = false; deferredEvents.clear();
    const node = modalPanel('title', 'Quad Taco Tycoon'); node.querySelector('h2').remove();
    modal.classList.add('title-screen');
    node.classList.add('title-menu');
    const logo = el('h1', 'title-logo'); logo.setAttribute('aria-label', 'TXST Quad Taco Tycoon');
    logo.append(el('span', 'title-campus', 'TXST'), el('span', '', 'Quad Taco Tycoon'));
    modal.prepend(logo); layout.register('title-logo', logo, {prefer:'top-center',priority:1,preferredWidth:()=>innerWidth>600?800:360,resizeWidth:true,minWidth:180});
    node.append(el('p', 'tagline', 'Six friends. One stand. A very hungry Quad.'), el('p', 'title-description', 'Feed the Quad, impress Professor West, and save $1,200 for the SIFE regional pitch and a second stand.'));
    const choices = el('div', 'options');
    if (saved) choices.append(button(`Continue · Day ${saved.state?.day || 1}`, () => { if (api.start(saved)) closeModal(); }, 'primary'));
    choices.append(button(saved ? 'New semester…' : 'Open the stand', () => {
      if (saved) { newConfirm(); return; }
      api.start(); closeModal();
    }, saved ? '' : 'primary'));
    [...choices.children].forEach(choice => iconize(choice, 'tacos'));
    node.append(choices, el('p', 'legend', 'Hold the stand or Space to help. Drag the Quad to pan. Scroll or pinch to zoom. R resets the view.'));
  }
  function newConfirm() {
    const node = modalPanel('confirm', 'Start a new semester?'); node.append(el('p', '', 'Your saved semester will be replaced when you open the stand.'));
    node.append(button('Keep my semester', () => title(api.saved())), button('Open a new stand', () => { api.start(); closeModal(); }, 'primary'));
  }
  function pauseMenu() {
    const node = modalPanel('pause', 'Take a breather'); node.append(el('p', '', 'The Quad can wait. Your day is saved.'));
    const options = el('div', 'options'); options.append(iconize(button('Back to the Quad', () => { closeModal(); api.resume(); }, 'primary'), 'tacos'), button(settings.muted ? 'Sound: off' : 'Sound: on', () => { api.toggleSound(); pauseMenu(); }), button(settings.crewNames ? 'Crew names: on' : 'Crew names: off', () => { api.toggleCrewNames(); pauseMenu(); }), button(settings.reducedMotion ? 'Reduced motion: on' : 'Reduced motion: off', () => { api.toggleMotion(); pauseMenu(); }), button('Supplies', () => { closeModal(); api.resume(); showSupplies(); }), button('Cooler Kid', () => { closeModal(); api.resume(); showOutpost(); }), button('Save & title', () => api.toTitle()));
    const names = ['tacos', 'settings', 'hire', 'speed', 'tortillas', 'cooler', 'settings'];
    [...options.children].forEach((choice, index) => { if (index) iconize(choice, names[index]); });
    node.append(options);
  }
  function showSeason() {
    const node = modalPanel('season', 'Semester results');
    iconize(node.querySelector('h2'), 'perk', 28);
    fillSeasonSummary(node, v);
    node.append(iconize(button('Review final day', () => { seasonReviewed = true; summary(); }, 'primary'), 'tacos'));
  }
  function summary() {
    if (seasonNeedsReview(v) && !seasonReviewed) { showSeason(); return; }
    const node = modalPanel('summary', copy('closing.title')), s = v.today;
    node.append(el('p', 'tagline', `Day ${v.day} · ${v.dayName} · ${copy('closing.photo.caption')}`));
    const stats = el('div', 'stats');
    for (const [label, value] of [['Tacos sold', s.tacos], ['Walked away', s.walkoffs], ['Revenue (includes tips)', money(s.revenue)], ['Tips', money(s.tips)], ['COGS + overhead + fines', money(s.cogs + s.overhead + s.fines)], ['Profit', money(s.profit)], ['Cash in drawer', money(v.cash)], ['Capital purchases', money(s.capex)]]) { const box = el('div', 'stat'); box.append(iconize(el('div', 'stat-label', label), label === 'Tacos sold' ? 'tacos' : label === 'Walked away' ? 'queue' : label === 'Capital purchases' ? 'upgrade' : 'cash', 18)); box.append(el('strong', '', value)); stats.append(box); }
    node.append(stats, el('p', '', `SIFE regional pitch + second stand · ${money(v.cash)} / ${money(v.season?.goal ?? v.goal.target)}`));
    const goal = el('progress', 'goal'); goal.max = v.goal.target; goal.value = Math.max(0, v.cash); goal.setAttribute('aria-label', 'Semester cash goal'); node.append(goal);
    if (s.storyKey) node.append(el('p', '', copy(s.storyKey)));
    node.append(el('p', 'legend', 'Legend board · best daily profit'));
    for (const [i, row] of recordDay(v).entries()) node.append(el('div', 'legend', `${i + 1}. Day ${row.day} · ${money(row.profit)} · ${row.tacos} tacos`));
    modalOnboard = createOnboarding((...args) => api.invoke(...args), openHint); modalOnboard.update(v); node.append(modalOnboard.node);
    if (seasonNeedsReview(v)) node.append(iconize(button('Semester results', showSeason), 'perk'));
    const choices = el('div', 'options');
    choices.append(button(pendingPerks(v).length ? 'Choose crew perks' : seasonNeedsReview(v) ? 'Start endless mode →' : 'Next day →', () => { if (pendingPerks(v).length) { perkFlow = true; closeModal(); showPerk(); } else { if (api.invoke('acknowledgeDay').ok) closeModal(); } }, 'primary'), button('Cooler Kid / upgrades', () => { closeModal(); showOutpost(); }));
    iconize(choices.children[0], pendingPerks(v).length ? 'perk' : 'tacos'); iconize(choices.children[1], 'cooler'); node.append(choices);
  }
  function showPerk() {
    const picks = pendingPerks(v), perk = picks[0];
    if (!perk) { perkFlow = false; summary(); return; }
    const model = perkCardModel(perk, picks.length);
    const node = startSheet('perk', model.title, model.description);
    const member = (v.crewStats || (Array.isArray(v.crew) ? {} : v.crew))?.[perk.crewId];
    const perkFace = el('div', 'portrait-slot'); perkFace.append(portrait(perk.crewId, 56, true));
    node.append(perkFace);
    if (member) node.append(iconize(el('p', 'status', `${member.xp} / ${member.xpToNext} XP toward next level`), 'xp', 18));
    node.append(createPerkOptions(model, id => {
      const result = api.invoke('choosePerk', perk.crewId, id);
      if (result.ok) closeSheet();
      return result;
    }));
    if (perk.crewId === 'antonio') node.setAttribute('aria-description', copy('character.antonio.description'));
    panelKey = JSON.stringify(perk);
    // New crew pick gets focus once. Tick updates must not rebuild focused buttons.
    queueMicrotask(() => node.querySelector('.perk-choice')?.focus());
  }
  function update(next, events, dt, prefs) {
    const previous = v; v = next; settings = prefs;
    bigRushHud.update(v); semesterProgress.update(v); tutorial.update(v); modalOnboard?.update(v);
    for (const milestone of reachedMilestones(previous, v)) toast({ text: `Milestone reached · ${money(milestone.target)} · ${copy(milestone.textKey)}`, icon: 'xp' }); root.classList.toggle('on-big-rush', !!v.bigRush?.active);
    if (v.bigRush?.active) while (toasts.children.length > 1) toasts.firstChild.remove();
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
    day.textContent = `Day ${v.day} · ${v.dayName} · ${v.phase === 'preopen' ? 'setting up' : v.phase}`;
    clockValue.textContent = v.clock.label; fill.style.width = `${v.rush.progress * 100}%`;
    displayedCash = displayedCash === null || settings.reducedMotion ? v.cash : displayedCash + (v.cash - displayedCash) * Math.min(1, dt / .15);
    cashValue.textContent = money(Math.abs(displayedCash - v.cash) < .01 ? v.cash : displayedCash);
    cash.setAttribute('aria-label', `Cash ${money(v.cash)}`); mute.textContent = settings.muted ? 'Sound off' : 'Sound on'; mute.setAttribute('aria-pressed', String(settings.muted));
    comboValue.textContent = `${v.combo.count}× golden rhythm`; combo.hidden = v.combo.count < 3;
    dusk.hidden = !['closing', 'summary'].includes(v.phase);
    hint.textContent = v.holding ? `Tending ${v.bottleneck === 'serve' ? 'pickup' : v.bottleneck}` : 'Hold the stand to help';
    hint.hidden = !!panel || !!openModal || (!v.holding && (v.phase !== 'preopen' || v.phaseT > 6));
    dock.hidden = !!panel || !!openModal;
    const geometry = api.scene.geometry();
    const anchors = geometry.anchors;
    golden.hidden = !v.prompts.golden || !!openModal || !!panel || !anchors.golden;
    if (!golden.hidden) { golden.style.left = `${anchors.golden.x}px`; golden.style.top = `${anchors.golden.y}px`; }
    agenda.hidden = performance.now() > agendaUntil || !!openModal || !anchors.agenda;
    if (!agenda.hidden) { agenda.style.left = `${anchors.agenda.x}px`; agenda.style.top = `${anchors.agenda.y}px`; }
    for (const e of events) {
      if (!['sale', 'outpostSale', 'bottleneck', 'walkoff', 'walkBy', 'goldenReady', 'goldenMiss', 'perkChoice', 'phaseChange', 'westPinch', 'eventCard', 'seasonEnd'].includes(e.type) && e.textKey) toast(eventCopy(e));
      if (e.type === 'hackResolve' && !e.fizzle) { agenda.textContent = copy(`antonio.hack.${hackKeys[e.targetId]}.target`); agendaUntil = performance.now() + 8500; }
      if (['hackResolve', 'hackBackfire'].includes(e.type) && panel === 'channel') closeSheet();
    }
    if (queue.length && performance.now() > nextToast && toasts.children.length < (v.bigRush?.active ? 1 : 2) && (!openModal || ['summary', 'season'].includes(openModal))) { const message = queue.shift(), n = el('div', 'toast', typeof message === 'string' ? message : message.text); if (message.icon) iconize(n, message.icon); toasts.append(n); nextToast = performance.now() + 2000; setTimeout(() => n.remove(), 4200); }
    if (panel === 'channel' && v.hack.channel > 0 && performance.now() > codeAt) { codeAt = performance.now() + 200; sheet.querySelector('pre').textContent = `> ssh old-main.local\n> set hunger = false;\n> agenda.write('go get tacos');\n> ${'▰'.repeat(Math.max(1, Math.floor((3.2 - v.hack.channel) * 5)))} ${v.hack.channel.toFixed(1)}s`; }
    if (previous?.phase === 'preopen' && v.phase !== 'preopen' && ['supplies', 'outpost'].includes(panel)) closeSheet();
    if (panel === 'supplies') { const stock = sheet.querySelector('.stock-value'); if (stock) stock.textContent = `${v.inventory.tortillas} tortillas in the cooler`; }
    if (panel === 'call' && !v.prompts.call || panel === 'hack' && !v.prompts.hack || panel === 'west' && !v.prompts.west || panel === 'perk' && !pendingPerks(v).length) closeSheet();
    if (panel === 'event' && (!v.deck?.[activeEvent?.deck]?.open || v.deck[activeEvent.deck].id !== activeEvent.id)) closeSheet();
    if (!openModal && !panel && v.phase !== 'summary') {
      const pending = openEventCards(v).find(card => !deferredEvents.has(eventCardKey(v, card)));
      if (pending) showEvent(pending);
    }
    if (v.prompts.west && !v.deck?.west?.open && !openModal && !panel) {
      optionsCard('west', copy('west.card.title'), copy(v.west.adviceKey), [['Take the advice', 'chooseWest', ['takeAdvice'], 'Let the professor finish her pinch; calm the line.'], ['Cookies for the line', 'chooseWest', ['redirect'], 'Catered cookies buy patience; Ali gets back to work sooner.']]);
      const westFace = el('div', 'portrait-slot'); westFace.append(portrait('west', 56, true));
      sheet.querySelector('.sheet-header')?.after(westFace);
      sheet.setAttribute('aria-description', copy('character.west.description'));
    }
    if (panel === 'west' || panel === 'event' && activeEvent?.deck === 'west') { let bar = sheet.querySelector('.timer-track'); if (!bar) { bar = el('div', 'timer-track'); bar.append(el('i')); sheet.append(bar); } bar.firstChild.style.width = `${Math.max(0, (api.game().state.west.choiceUntil - v.t) / api.game().config.west.choiceWindow) * 100}%`; }
    if (v.phase === 'summary' && !openModal && !panel) { if (perkFlow && pendingPerks(v).length) showPerk(); else { perkFlow = false; summary(); } }
    if (panel === 'perk' && pendingPerks(v).length && panelKey !== JSON.stringify(pendingPerks(v)[0])) showPerk();
    const key = [v.phase, v.prompts.call, v.prompts.hack, !!v.outpost, !!panel, ...openEventCards(v).map(card => eventCardKey(v, card))].join(':');
    if (actions.dataset.key !== key) {
      actions.dataset.key = key; actions.replaceChildren();
      if (panel) { layout.update(geometry); return; }
      const event = openEventCards(v)[0];
      if (event && v.phase !== 'summary') actions.append(actionButton(eventCardModel(event).title, 'Event', () => showEvent(event), eventCardModel(event).icon));
      if (v.prompts.call) actions.append(actionButton('Call the Line', 'Call line', showCall, 'callLine'));
      if (v.prompts.hack) actions.append(actionButton('Antonio’s laptop', 'Laptop', showHack, 'hack'));
      if (v.phase !== 'summary') actions.append(actionButton(v.inventory.tortillas < 12 ? 'Low stock · supplies' : 'Supplies', v.inventory.tortillas < 12 ? 'Low stock' : 'Supplies', showSupplies, 'tortillas'));
      if (['preopen', 'summary'].includes(v.phase)) actions.append(actionButton('Cooler Kid', 'Cooler Kid', showOutpost, 'cooler'));
      if (v.phase === 'summary') actions.append(actionButton('Day summary', 'Summary', summary, 'cash'));
    }
    layout.update(geometry);
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (openModal === 'pause') { closeModal(); api.resume(); } else if (!openModal) { if (panel) { if (panel === 'perk') perkFlow = false; closeSheet(); } else api.pause(); } }
    if (modal.hidden && panel && /^[123]$/.test(e.key) && !e.target.closest('select,input')) sheet.querySelectorAll('.options button')[Number(e.key) - 1]?.click();
    if (e.key === 'Tab' && !modal.hidden) { const items = [...modal.querySelectorAll('button,select,input,[tabindex="0"]')].filter(n => !n.disabled); if (!items.length) return; const first = items[0], last = items.at(-1); if (e.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) { e.preventDefault(); first.focus(); } }
  });
  return { update, title, pauseMenu, closeModal, closeSheet, toast, ring, blocked: () => !!openModal || !!panel, get modal() { return openModal; } };
}
