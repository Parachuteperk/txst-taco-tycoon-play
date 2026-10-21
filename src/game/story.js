import { emit } from './events.js';

export function blankStory() {
  return {
    maya: { beatIndex: 0, flags: {}, attempts: 0, done: false, visits: 0 },
    wordOfMouth: 0,
    trust: 0,
    craft: 0,
  };
}

export function scheduleStory(game) {
  const cfg = game.config.story;
  if (!cfg.enabled) return;
  const st = game.state.story.maya;
  const maya = cfg.maya;
  if (st.done) {
    if (game.rng.next() < cfg.mayaReturnChance) {
      game.state.schedule.push({
        at: game.state.t + cfg.returnDelay,
        spec: { kind: 'maya', regularId: 'maya', nameKey: maya.nameKey, source: 'maya', patience: cfg.returnPatience },
      });
    }
    return;
  }
  const beat = maya.beats[st.beatIndex];
  if (!beat) return;
  if (beat.requiresFlag && !st.flags[beat.requiresFlag]) return;
  game.state.schedule.push({
    at: game.state.t + (beat.at ?? 16),
    spec: {
      kind: 'maya',
      regularId: 'maya',
      nameKey: maya.nameKey,
      storyBeat: beat.id,
      patience: beat.patience,
      cheapest: !!beat.cheapest,
      source: 'maya',
      extraFriends: beat.extraStudents || 0,
      arriveKey: beat.arriveKey || null,
      orderKey: beat.orderKey || null,
    },
  });
}

export function resolveStory(game, customer, result) {
  if (!customer.storyBeat || customer.regularId !== 'maya') return;
  const cfg = game.config.story;
  const st = game.state.story.maya;
  const beat = cfg.maya.beats.find((b) => b.id === customer.storyBeat);
  if (!beat) return;
  st.visits += 1;
  st.attempts += 1;
  if (result === 'walked') {
    game.state.dayLedger.storyKey = 'maya.walked';
    emit(game, {
      type: 'storyBeat',
      beatId: beat.id,
      regularId: 'maya',
      outcome: 'walked',
      textKey: 'maya.walked',
    });
    return;
  }
  let outcome = 'served';
  let textKey = beat.onSuccessText;
  const kind = beat.successIf === 'kind'
    && (customer.goldenResolved === 'hit' || (customer.patienceAtServe != null && customer.patienceAtServe >= beat.kindRatio));
  if (beat.successIf === 'kind' && !kind) {
    outcome = 'cold';
    textKey = beat.onFailText || beat.onSuccessText;
  } else {
    if (beat.successFlag) st.flags[beat.successFlag] = true;
    if (beat.wordOfMouth) game.state.story.wordOfMouth += beat.wordOfMouth;
    st.beatIndex += 1;
    if (st.beatIndex >= cfg.maya.beats.length) st.done = true;
    if (beat.successIf === 'kind') outcome = 'kind';
  }
  game.state.dayLedger.storyKey = textKey;
  game.state.story.trust += outcome === 'cold' ? cfg.trustCold : cfg.trustWarm;
  emit(game, {
    type: 'storyBeat',
    beatId: beat.id,
    regularId: 'maya',
    outcome,
    textKey,
    done: st.done,
  });
}
