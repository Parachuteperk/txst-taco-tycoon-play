import { createAudio } from '../audio/audio.js';
const cues = {
  'sale.chime': 'registerDing', 'sale.chime.soft': 'coinDrop', 'golden.ready': 'orderTicket',
  'golden.flourish': 'goldenHandoff', 'combo.hit': 'combo', 'bell.telegraph': 'rushBell',
  'hack.typing': 'antonioTyping', 'hack.resolve': 'hackSuccess', 'hack.backfire': 'hackBackfire',
  'inspector.sting': 'hackBackfire', 'west.entrance': 'westYoohoo', 'west.pinch': 'spatulaFlip',
  'west.advice': 'customerHappy', 'west.cookies': 'customerHappy', 'aaron.whistle': 'rushBell',
  'crowd.roar': 'rushBell', 'crowd.ease': 'customerHappy',
  'level.up': 'combo', 'closing.beat': 'tortillaSlap', 'day.dusk': 'closingChime', 'goal.reached': 'chaChing',
  'deck.card': 'orderTicket', 'deck.choice': 'customerHappy', 'season.end': 'closingChime',
};
export function createSound(settings) {
  const audio = createAudio(); let grill = null, active = false;
  audio.setMuted(settings.muted);
  async function unlock() { if (await audio.unlock()) { active = true; audio.music.start(); } }
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
  return {
    unlock,
    mute(on) { audio.setMuted(on); },
    pause(on) { if (on) { audio.music.stop(); grill?.stop(); grill = null; } else if (active) audio.music.start(); },
    update(v, events) {
      audio.music.setIntensity(v.rush.active ? .8 : v.phase === 'closing' || v.phase === 'summary' ? 0 : .25);
      if (active && v.stations.grill.active && !grill) grill = audio.play('grillSizzle', { loop: true, intensity: .25 }) || null;
      if (!v.stations.grill.active && grill) { grill.stop(); grill = null; }
      for (const e of events) if (cues[e.cue]) audio.play(cues[e.cue], { count: v.combo.count });
    },
  };
}
