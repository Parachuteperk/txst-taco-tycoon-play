/**
 * TXST Quad Taco Tycoon — entirely procedural Web Audio.
 * No context is allocated until unlock() is called from a user gesture.
 * Timing is AudioContext-based; the timer is only a scheduling lookahead.
 */
const MAX_VOICES = 12;
const STEP_SECONDS = 60 / 88 / 4; // 88 BPM, sixteenth notes.
const LOOKAHEAD_SECONDS = 0.14;
const SCHEDULER_MS = 55;
const TAU = Math.PI * 2;

function clamp(value, low = 0, high = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : low;
}

function midi(number) {
  return 440 * Math.pow(2, (number - 69) / 12);
}

/**
 * SFX names (camelCase): registerDing, coinDrop, tortillaSlap,
 * grillSizzle, spatulaFlip, orderTicket, goldenHandoff, combo,
 * customerHappy, customerAnnoyed, rushBell, antonioTyping,
 * hackSuccess, hackBackfire, westYoohoo, grackleSquawk,
 * closingChime, chaChing.
 */
export function createAudio() {
  let context = null;
  let compressor = null;
  let masterBus = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuffer = null;
  let destroyed = false;
  let muted = false;
  const volumes = { master: 0.55, music: 0.34, sfx: 0.55 };
  const voices = new Set();
  let grillHandle = null;
  const musicState = {
    active: false,
    intensity: 0,
    timer: null,
    nextTime: 0,
    step: 0
  };

  function changeGain(node, value, duration = 0.025) {
    if (!context || !node) return;
    const time = context.currentTime;
    const param = node.gain;
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
    param.linearRampToValueAtTime(value, time + duration);
  }

  function updateVolumes() {
    changeGain(masterBus, muted ? 0 : volumes.master);
    changeGain(musicBus, volumes.music);
    changeGain(sfxBus, volumes.sfx);
  }

  function setupContext() {
    if (context || destroyed) return;
    const AudioContextType = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextType) return;
    try {
      context = new AudioContextType({ latencyHint: 'interactive' });
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 7;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.22;

      masterBus = context.createGain();
      musicBus = context.createGain();
      sfxBus = context.createGain();
      masterBus.gain.value = muted ? 0 : volumes.master;
      musicBus.gain.value = volumes.music;
      sfxBus.gain.value = volumes.sfx;
      musicBus.connect(masterBus);
      sfxBus.connect(masterBus);
      masterBus.connect(compressor);
      compressor.connect(context.destination);

      // One short, reusable noise buffer for all percussion and grill audio.
      const length = Math.floor(context.sampleRate * 0.6);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      // Deterministic colored-ish noise: no runtime random calls in SFX.
      let seed = 0x53a9f217;
      let previous = 0;
      for (let i = 0; i < length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const white = (seed >>> 0) / 2147483648 - 1;
        previous = previous * 0.2 + white * 0.8;
        data[i] = previous;
      }
    } catch (_error) {
      // Unsupported / disabled audio: gameplay continues silently.
      context = null;
      compressor = masterBus = musicBus = sfxBus = noiseBuffer = null;
    }
  }

  async function unlock() {
    if (destroyed) return false;
    setupContext();
    if (!context) return false;
    // Start the silent source BEFORE yielding; required by some iOS versions.
    try {
      const silent = context.createBufferSource();
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(masterBus);
      silent.start(0);
      silent.onended = () => silent.disconnect();
      if (context.state !== 'running') await context.resume();
      if (musicState.active && !musicState.timer) startScheduler();
      return context.state === 'running';
    } catch (_error) {
      return false;
    }
  }

  function reserve(category) {
    if (!context || context.state !== 'running' || destroyed) return null;
    if (voices.size < MAX_VOICES) return true;
    if (category !== 'sfx') return null;
    // SFX gets priority over ambient music, never over other SFX.
    const candidate = Array.from(voices).find((v) => v.category === 'music');
    if (!candidate) return null;
    fadeAndStop(candidate, context.currentTime + 0.012);
    voices.delete(candidate);
    return true;
  }

  function fadeAndStop(voice, at) {
    const now = context ? context.currentTime : 0;
    const stopAt = Math.max(now + 0.012, at);
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0.0001, stopAt);
      voice.source.stop(stopAt + 0.005);
    } catch (_error) {
      // The source may already have completed.
    }
  }

  function attach(source, gain, filter, category) {
    const voice = { source, gain, filter, category };
    voices.add(voice);
    source.onended = () => {
      voices.delete(voice);
      source.disconnect();
      gain.disconnect();
      if (filter) filter.disconnect();
    };
    source.connect(filter || gain);
    if (filter) filter.connect(gain);
    gain.connect(category === 'music' ? musicBus : sfxBus);
    return voice;
  }

  function envelope(gain, time, length, peak, attack = 0.006, release = 0.08) {
    const p = gain.gain;
    const end = time + length;
    const rise = Math.min(attack, length * 0.35);
    const fall = Math.min(release, length * 0.6);
    p.setValueAtTime(0.0001, time);
    p.linearRampToValueAtTime(Math.max(0.0002, peak), time + rise);
    p.setValueAtTime(Math.max(0.0002, peak), Math.max(time + rise, end - fall));
    p.exponentialRampToValueAtTime(0.0001, end);
  }

  function tone(hz, time, length, options = {}) {
    const category = options.category || 'sfx';
    if (!reserve(category)) return false;
    const start = Math.max(context.currentTime + 0.002, time);
    const duration = Math.max(0.04, length);
    const source = context.createOscillator();
    const gain = context.createGain();
    let filter = null;
    source.type = options.wave || 'sine';
    source.frequency.setValueAtTime(Math.max(20, hz), start);
    if (options.to) {
      source.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.to), start + duration * 0.85
      );
    }
    if (options.filter) {
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.filter;
      filter.Q.value = 0.6;
    }
    envelope(gain, start, duration, options.amp ?? 0.075,
      options.attack ?? 0.006, options.release ?? 0.08);
    attach(source, gain, filter, category);
    source.start(start);
    source.stop(start + duration + 0.012);
    return true;
  }

  function noise(time, length, options = {}) {
    const category = options.category || 'sfx';
    if (!reserve(category)) return false;
    const start = Math.max(context.currentTime + 0.002, time);
    const duration = Math.max(0.035, length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    source.loop = true;
    filter.type = options.filterType || 'bandpass';
    filter.frequency.value = options.frequency ?? 1100;
    filter.Q.value = options.q ?? 0.8;
    envelope(gain, start, duration, options.amp ?? 0.045,
      options.attack ?? 0.004, options.release ?? 0.07);
    attach(source, gain, filter, category);
    source.start(start);
    source.stop(start + duration + 0.012);
    return true;
  }

  function arpeggio(notes, time, interval, options = {}) {
    notes.forEach((hz, index) => {
      tone(hz, time + index * interval, options.length ?? 0.16, options);
    });
  }

  function stopGrill() {
    if (!grillHandle) return;
    const handle = grillHandle;
    grillHandle = null;
    handle.stop();
  }

  function startGrill(intensity = 0.5) {
    if (!context || context.state !== 'running' || destroyed) return null;
    if (grillHandle) {
      grillHandle.setIntensity(intensity);
      return grillHandle;
    }
    if (!reserve('sfx')) return null;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = noiseBuffer;
    source.loop = true;
    filter.type = 'bandpass';
    filter.Q.value = 0.45;
    gain.gain.setValueAtTime(0.0001, now);
    const voice = attach(source, gain, filter, 'sfx');
    source.start(now);
    let stopped = false;
    const handle = {
      setIntensity(level) {
        if (stopped) return;
        const amount = clamp(level);
        filter.frequency.setTargetAtTime(900 + amount * 2700, context.currentTime, 0.09);
        gain.gain.setTargetAtTime(0.012 + amount * 0.055, context.currentTime, 0.12);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        fadeAndStop(voice, context.currentTime + 0.13);
        if (grillHandle === handle) grillHandle = null;
      }
    };
    grillHandle = handle;
    handle.setIntensity(intensity);
    return handle;
  }

  // SFX names are API keys, not tied to artwork or animation code.
  const effects = {
    registerDing(time) {
      tone(880, time, 0.25, { amp: 0.105, release: 0.2 });
      tone(1320, time + 0.012, 0.2, { amp: 0.035, release: 0.16 });
    },
    coinDrop(time) {
      tone(1030, time, 0.13, { to: 630, wave: 'triangle', amp: 0.065 });
      tone(1460, time + 0.11, 0.12, { to: 820, amp: 0.05 });
    },
    tortillaSlap(time) {
      noise(time, 0.1, { frequency: 650, q: 0.7, amp: 0.11, release: 0.085 });
      tone(145, time, 0.09, { to: 95, wave: 'triangle', amp: 0.075 });
    },
    spatulaFlip(time) {
      noise(time, 0.13, { frequency: 2800, amp: 0.055 });
      tone(610, time + 0.025, 0.09, { to: 1020, amp: 0.042 });
    },
    orderTicket(time) {
      noise(time, 0.055, { frequency: 3300, amp: 0.065 });
      noise(time + 0.065, 0.065, { frequency: 2700, amp: 0.045 });
    },
    goldenHandoff(time) {
      arpeggio([587.33, 739.99, 880, 1174.66], time, 0.085,
        { amp: 0.064, length: 0.28, release: 0.2 });
    },
    combo(time, opts) {
      const count = Math.max(1, Math.min(12, Math.floor(Number(opts.count ?? 1) || 1)));
      const shift = Math.min(7, Math.floor(count / 2));
      const base = midi(67 + shift);
      arpeggio([base, base * 1.25, base * 1.5], time, 0.075,
        { wave: 'triangle', amp: 0.065, length: 0.21 });
    },
    customerHappy(time) {
      tone(520, time, 0.17, { to: 680, wave: 'triangle', amp: 0.048 });
      tone(784, time + 0.1, 0.2, { amp: 0.055 });
    },
    customerAnnoyed(time) {
      tone(390, time, 0.2, { to: 260, wave: 'triangle', amp: 0.06 });
      tone(290, time + 0.15, 0.19, { to: 195, amp: 0.04 });
    },
    rushBell(time) {
      tone(784, time, 0.48, { amp: 0.085, release: 0.34 });
      tone(1175, time + 0.028, 0.4, { amp: 0.05, release: 0.3 });
    },
    antonioTyping(time) {
      for (let i = 0; i < 5; i++) {
        noise(time + i * 0.052, 0.04, {
          frequency: 2000 + (i % 3) * 550, amp: 0.027, release: 0.025
        });
      }
    },
    hackSuccess(time) {
      tone(390, time, 0.09, { to: 510, wave: 'square', filter: 1900, amp: 0.036 });
      arpeggio([659, 880, 1318], time + 0.1, 0.1,
        { amp: 0.05, length: 0.22 });
    },
    hackBackfire(time) {
      tone(690, time, 0.16, { to: 350, wave: 'sawtooth', filter: 1250, amp: 0.047 });
      tone(590, time + 0.2, 0.2, { to: 280, wave: 'sawtooth', filter: 1050, amp: 0.048 });
      tone(490, time + 0.45, 0.25, { to: 220, wave: 'triangle', amp: 0.065 });
    },
    westYoohoo(time) {
      // A friendly rising/falling synth contour, not sampled speech.
      tone(430, time, 0.2, { to: 690, wave: 'triangle', amp: 0.065 });
      tone(760, time + 0.19, 0.22, { to: 550, wave: 'triangle', amp: 0.066 });
    },
    grackleSquawk(time) {
      tone(880, time, 0.1, { to: 410, wave: 'sawtooth', filter: 1700, amp: 0.045 });
      tone(700, time + 0.12, 0.12, { to: 330, wave: 'square', filter: 1400, amp: 0.026 });
    },
    closingChime(time) {
      arpeggio([440, 523.25, 659.25, 880], time, 0.22,
        { amp: 0.055, length: 0.6, release: 0.47 });
    },
    chaChing(time) {
      noise(time, 0.08, { frequency: 2600, amp: 0.055 });
      tone(980, time + 0.07, 0.27, { amp: 0.09, release: 0.2 });
      tone(1470, time + 0.115, 0.29, { amp: 0.045, release: 0.22 });
      tone(1960, time + 0.16, 0.27, { amp: 0.032, release: 0.22 });
    }
  };

  // Intentionally few aliases; public names above are the stable contract.
  const aliases = {
    cashRegister: 'chaChing',
    customerLeavesAnnoyed: 'customerAnnoyed',
    antonioHackSuccess: 'hackSuccess',
    antonioHackBackfire: 'hackBackfire',
    mrsWestYoohoo: 'westYoohoo'
  };

  function play(name, opts = {}) {
    if (destroyed || !context || context.state !== 'running' || muted) return false;
    const key = aliases[name] || name;
    if (key === 'grillSizzle') {
      if (opts.loop === false) {
        noise(context.currentTime + 0.01, 0.55, {
          filterType: 'bandpass', frequency: 2000,
          amp: 0.028 + clamp(opts.intensity ?? 0.5) * 0.055,
          release: 0.26
        });
        return true;
      }
      return startGrill(opts.intensity ?? 0.5) || false;
    }
    const effect = Object.prototype.hasOwnProperty.call(effects, key) ? effects[key] : null;
    if (!effect) return false;
    effect(context.currentTime + 0.012, opts);
    return true;
  }

  // Am - F - C - G; lightly syncopated bass, soft hand percussion and
  // accordion-tinged upper melody layered as the rush gets busier.
  const CHORDS = [
    { chord: [57, 60, 64], bass: 45 },
    { chord: [53, 57, 60], bass: 41 },
    { chord: [55, 60, 64], bass: 36 },
    { chord: [55, 59, 62], bass: 43 }
  ];
  const MELODY = [76, 79, 81, 79, 72, 76, 77, 76,
    76, 79, 84, 79, 74, 71, 74, 79];

  function scheduleStep(time, step) {
    if (muted) return;
    const at = step % 16;
    const bar = Math.floor(step / 16) % CHORDS.length;
    const harmony = CHORDS[bar];
    const intensity = musicState.intensity;
    if (at === 0) {
      // Rounded, restrained pad: three sine/triangle voices per bar.
      harmony.chord.forEach((note, index) => tone(midi(note), time, 1.7, {
        category: 'music', wave: index === 1 ? 'triangle' : 'sine',
        amp: 0.028 + intensity * 0.006, attack: 0.16, release: 0.55,
        filter: 1050 + intensity * 800
      }));
    }
    if (at === 0 || at === 7 || (intensity > 0.45 && at === 10)) {
      const note = harmony.bass + (at === 7 ? 7 : 0);
      tone(midi(note), time, 0.28, {
        category: 'music', wave: 'triangle',
        amp: 0.065 + intensity * 0.02, release: 0.17, filter: 450
      });
    }
    if (intensity > 0.12 && (at === 4 || at === 12)) {
      noise(time, 0.09, { category: 'music', frequency: 850,
        amp: 0.028 + intensity * 0.012, release: 0.065 });
    }
    if (intensity > 0.38 && at % 4 === 2) {
      noise(time, 0.055, { category: 'music', frequency: 4200,
        amp: 0.011 + intensity * 0.01, release: 0.035 });
    }
    if (intensity > 0.63 && (at === 3 || at === 10 || at === 14)) {
      const melodyNote = MELODY[(bar * 4 + Math.floor(at / 4)) % MELODY.length];
      tone(midi(melodyNote), time, 0.15, {
        category: 'music', wave: 'square', filter: 950,
        amp: 0.018 + intensity * 0.008, release: 0.09
      });
    }
  }

  function scheduleMusic() {
    if (!context || !musicState.active || context.state !== 'running' || destroyed) return;
    const now = context.currentTime;
    if (musicState.nextTime < now - STEP_SECONDS) {
      // Browser tab was suspended: skip late notes, never fast-forward them.
      musicState.nextTime = now + 0.04;
    }
    while (musicState.nextTime < now + LOOKAHEAD_SECONDS) {
      scheduleStep(musicState.nextTime, musicState.step);
      musicState.nextTime += STEP_SECONDS;
      musicState.step = (musicState.step + 1) % 64;
    }
  }

  function startScheduler() {
    if (!context || context.state !== 'running' || musicState.timer ||
        !musicState.active || destroyed || (typeof document !== 'undefined' && document.hidden)) return;
    musicState.nextTime = context.currentTime + 0.035;
    scheduleMusic();
    musicState.timer = setInterval(scheduleMusic, SCHEDULER_MS);
  }

  function stopScheduler() {
    if (musicState.timer !== null) clearInterval(musicState.timer);
    musicState.timer = null;
  }

  function stopMusicVoices() {
    if (!context) return;
    for (const voice of Array.from(voices)) {
      if (voice.category === 'music') {
        fadeAndStop(voice, context.currentTime + 0.06);
        voices.delete(voice);
      }
    }
  }

  const music = Object.freeze({
    start() {
      if (destroyed || !context) return false; // Call unlock() on a gesture first.
      musicState.active = true;
      if (context.state === 'running') startScheduler();
      return true;
    },
    stop() {
      musicState.active = false;
      stopScheduler();
      stopMusicVoices();
    },
    setIntensity(value) {
      musicState.intensity = clamp(value);
      return musicState.intensity;
    }
  });

  function setMuted(value) {
    muted = Boolean(value);
    updateVolumes();
    return muted;
  }

  /** setVolume('music', 0.4) OR setVolume({ master: .5, music: .3 }). */
  function setVolume(channel, value) {
    if (channel && typeof channel === 'object') {
      for (const key of ['master', 'music', 'sfx']) {
        if (Object.prototype.hasOwnProperty.call(channel, key)) {
          volumes[key] = clamp(channel[key]);
        }
      }
    } else if (Object.prototype.hasOwnProperty.call(volumes, channel)) {
      volumes[channel] = clamp(value);
    }
    updateVolumes();
    return { ...volumes };
  }

  function onVisibilityChange() {
    if (!musicState.active || !context) return;
    if (document.hidden) {
      stopScheduler();
    } else {
      // Resuming an already-unlocked context may be rejected by a browser;
      // in that case the next explicit gesture can call unlock() again.
      Promise.resolve(context.resume()).then(startScheduler).catch(() => {});
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  function destroy() {
    if (destroyed) return;
    music.stop();
    stopGrill();
    destroyed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (context) {
      for (const voice of Array.from(voices)) fadeAndStop(voice, context.currentTime + 0.012);
      voices.clear();
      const closing = context.close();
      if (closing && typeof closing.catch === 'function') closing.catch(() => {});
    }
  }

  return Object.freeze({
    unlock,
    setMuted,
    setVolume,
    play,
    music,
    destroy
  });
}

export default createAudio;
