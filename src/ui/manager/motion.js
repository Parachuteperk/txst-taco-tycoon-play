// HUD presentation only: real-time motion consumes snapshots, never engine/sim state.
export function crewActivity(view, person) {
  if (person.shift === false) return false;
  if (['ringing','folding','grilling','running','hacking','holding','advising'].includes(person.task)) return true;
  if (['off','watching','ready'].includes(person.task)) return false;
  if (typeof person.busy === 'boolean') return person.busy;
  if (Object.values(view.stations || {}).some(slot => slot.crew === person.id && !!slot.active)) return true;
  return person.id === 'antonio' && view.hack?.channel > 0 || person.id === 'aaron' && !!view.holding || person.id === 'west' && view.west?.status === 'present';
}

export function createHudMotion() {
  const counters = new Map(), animations = new Map(), tickers = new Set();
  let reduced = false, watching = false, elapsed = 0;
  function animate(node, frames, options) {
    animations.get(node)?.cancel(); animations.delete(node);
    if (reduced || !node.animate) return null;
    const animation = node.animate(frames, options);
    animations.set(node, animation);
    const clean = () => { if (animations.get(node) === animation) animations.delete(node); };
    animation.onfinish = clean; animation.oncancel = clean;
    return animation;
  }
  function paint(counter) {
    const text = counter.format(counter.value);
    for (const node of counter.nodes) if (node.textContent !== text) node.textContent = text;
  }
  const api = {
    bind(key, nodes, format = String) {
      counters.set(key, { nodes: Array.isArray(nodes) ? nodes : [nodes], format, value: null, target: null, from: null, age: 1 });
    },
    set(key, value) {
      const counter = counters.get(key); if (!counter || !Number.isFinite(value) || value === counter.target) return;
      const first = counter.value === null, changedText = !first && counter.format(value) !== counter.format(counter.target);
      counter.from = first ? value : counter.value; counter.target = value; counter.age = 0;
      for (const node of counter.nodes) node.dataset.value = String(value);
      if (first || reduced || !watching) { counter.value = value; counter.age = 1; paint(counter); }
      else if (changedText) for (const node of counter.nodes) animate(node, [{ opacity: .82 }, { opacity: 1 }], { duration: 230, easing: 'ease-out' });
    },
    tick(dt) {
      if (!watching) return;
      elapsed += Math.max(0, Math.min(.1, dt));
      if (elapsed < 1 / 30) return; // DOM number painting capped at 30Hz, scene keeps its own frame rate.
      const step = elapsed; elapsed = 0;
      for (const counter of counters.values()) {
        if (counter.target === null || counter.age >= 1) continue;
        counter.age = reduced ? 1 : Math.min(1, counter.age + step / .24);
        counter.value = counter.from + (counter.target - counter.from) * (1 - (1 - counter.age) ** 3);
        paint(counter);
      }
    },
    resetCounters() { for (const counter of counters.values()) { counter.value = null; counter.target = null; counter.age = 1; } },
    setReduced(value) {
      const next = !!value; if (next === reduced) return; reduced = next;
      if (typeof document !== 'undefined') document.documentElement.dataset.reducedMotion = String(reduced);
      if (reduced) {
        for (const animation of [...animations.values()]) animation.cancel(); animations.clear();
        for (const counter of counters.values()) if (counter.target !== null) { counter.value = counter.target; counter.age = 1; paint(counter); }
      }
      for (const ticker of tickers) ticker.refresh();
    },
    setWatching(value) { watching = !!value; for (const ticker of tickers) ticker.refresh(); },
    transition(node) { return animate(node, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' }); },
    pulse(node) { return animate(node, [{ backgroundColor: '#e7b65a36' }, { backgroundColor: 'transparent' }], { duration: 600, easing: 'ease-out' }); },
    ticker(viewport, track) {
      let scroll = null, held = false, text = '';
      const stop = () => { scroll?.cancel(); scroll = null; };
      const refresh = () => {
        stop();
        if (reduced || !watching || !track.animate || viewport.hidden) return;
        const overflow = Math.max(0, track.scrollWidth - viewport.clientWidth);
        if (overflow < 2) return;
        // Scroll once to the end, hold, then reset. No duplicate text/live announcements.
        const travel = overflow / 30 * 1000, duration = travel + 2600;
        scroll = animate(track, [{ transform: 'translateX(0)', offset: 0 }, { transform: 'translateX(0)', offset: 1200 / duration }, { transform: `translateX(-${overflow}px)`, offset: (1200 + travel) / duration }, { transform: `translateX(-${overflow}px)`, offset: 1 }], { duration, iterations: Infinity, easing: 'linear' });
        if (held) scroll?.pause();
      };
      for (const event of ['mouseenter', 'focusin']) viewport.addEventListener(event, () => { held = true; scroll?.pause(); });
      for (const event of ['mouseleave', 'focusout']) viewport.addEventListener(event, () => { held = false; if (!reduced && watching) scroll?.play(); });
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refresh) : null;
      observer?.observe(viewport); observer?.observe(track);
      const ticker = { refresh, setText(value) { if (value === text) return; text = value; track.textContent = value; viewport.title = value; refresh(); }, dispose() { stop(); observer?.disconnect(); tickers.delete(ticker); } };
      tickers.add(ticker); return ticker;
    },
  };
  return api;
}
