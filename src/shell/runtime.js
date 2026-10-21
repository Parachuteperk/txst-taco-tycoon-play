import { createGame, TUNING } from '../game/index.js';
import { createSceneBridge } from '../bridge/scene.js';
import { createLegacySceneBridge } from '../bridge/legacyScene.js';
import { createSound } from '../bridge/sound.js';
// Manager-mode UI replaces automatic daytime question cards.
import { createUI } from '../ui/manager/app.js';
import { createManagerAdapter } from '../bridge/manager.js';
import { installHold } from '../ui/hold.js';
import { loadSave, saveGame, clearSave, loadSettings, saveSettings } from './storage.js';
import { enterWatch } from './enterWatch.js';
import { SCENE_CONFIG } from './sceneConfig.js';
import { createReportEvidence } from '../bridge/reporting.js';

export function createRuntime({ sim, canvas, screen, hitTest, sceneBridge, sceneRenderer }) {
  let game = createGame(7, null, { autostart: false, config: SCENE_CONFIG }), running = false, paused = false, planning = true, saveAt = 0;
  const manager = createManagerAdapter(), evidence=createReportEvidence();
  let timelapse=null;
  const settings = loadSettings(), sound = createSound(settings);
  const scene = sceneBridge || (sceneRenderer ? createSceneBridge(sceneRenderer) : createLegacySceneBridge({ sim, screen, hitTest }));
  const fast = new URLSearchParams(location.search).get('fast') === '1';
  let ui, hold, saveWarning = false, lastTransition = null;
  function persist() { if (!saveGame(game) && !saveWarning) { saveWarning = true; ui.toast('Save unavailable. Keep this tab open to keep your semester.'); } }
  const api = {
    scene, manager, get evidence(){return evidence.data;},get timelapse(){return timelapse;}, get hold() { return hold; }, game: () => game, saved: loadSave,
    start(save, configOverride) {
      try { game = createGame(save?.seed ?? 7, save || null, { autostart: false, config: configOverride || SCENE_CONFIG }); if (settings?.coinFlip) game.setCoinPolicy?.(settings.coinFlip); for (const [k, v] of Object.entries(settings?.offers || {})) game.setOfferPolicy?.(k, v); }
      catch { ui.toast('This save could not be loaded. Start a new semester to play.'); return false; }
      scene.reset(); manager.reset();evidence.reset();timelapse=null;
      // Keep standing plans, but require an explicit hire rather than preset consent.
      if (game.getView().manager) manager.action(game, 'setPolicy', save?{hireOutpost:false}:{preset:'planned',hireOutpost:false});
      planning = true; game.holdStand(false); running = true; paused = false; sound.unlock(); sound.pause(false); persist(); return true;
    },
    invoke(method, ...args) {
      const result = typeof game[method] === 'function' ? game[method](...args) : {ok:false,reason:'unavailable'};
      if (!result?.ok) ui.toast({ 'cant-afford': 'The drawer needs a little more cash.', 'wrong-phase': 'That opens between shifts.', 'tier-not-simulated': 'That expansion is coming later.' }[result?.reason] || `Couldn’t do that: ${result?.reason || 'try again'}`);
      else persist();
      return result;
    },
    command(method, ...args) {
      if(method==='setSpeed'&&args[0]==='skip'){
        if(planning||game.getView().phase==='summary')return {ok:false,reason:'day-not-open'};
        if(!timelapse){manager.action(game,'setSpeed',1);timelapse={elapsed:0,duration:4,cashStart:game.getView().cash,revenueStart:game.getView().today.revenue,tacosStart:game.getView().today.tacos};}
        return {ok:true,timelapse:true};
      }
      if(method==='setSpeed')timelapse=null;
      if(method==='setPolicy'&&typeof args[0]==='object'&&args[0].preset)args[0]={...args[0],hireOutpost:false};
      const result = manager.action(game, method, ...args);
      if (result?.ok) persist();
      return result;
    },
    manage(tab) { if (!running) return; const v=game.getView();planning=!timelapse&&!!(v.manager?.planning||v.manager?.holding||v.phase==='summary'); paused=false;hold.release();sound.pause(planning);persist();ui.showManager(tab); },
    watch() {
      if (!running) return;
      const phaseBefore=game.getView().phase;
      if(timelapse&&phaseBefore==='summary'){planning=false;paused=false;ui.showWatch();return;}
      const result=enterWatch(game,manager);
      lastTransition={...result,phaseBefore,phaseAfter:game.getView().phase};
      if (!result.ok) {
        if (result.reason === 'game-over') { ui.showGameOver(); return; }
        ui.notice(`Unable to open the day: ${result.reason || 'unavailable'}. Your plan is saved.`);
        return;
      }
      planning=false;paused=false;hold.release();sound.unlock();sound.pause(false);persist();ui.showWatch();
    },
    pause() { if (!running || paused || ui.modal === 'summary') return; paused = true; hold.release(); sound.pause(true); persist(); ui.pauseMenu(); },
    resume() { paused = false; sound.unlock(); sound.pause(false); },
    toTitle() { hold.release(); persist(); running = false; paused = false; sound.pause(true); ui.title(loadSave()); },
    restart() {
      clearSave();
      timelapse = null;
      const ok = api.start();
      if (ok) ui.showManager();
      return !!ok;
    },
    freshFloat() {
      clearSave();
      timelapse = null;
      const opening = TUNING.economy.startingCash;
      const extra = TUNING.manager?.drawer?.float || 0;
      const ok = api.start(null, { ...SCENE_CONFIG, economy: { startingCash: opening + extra } });
      if (ok) ui.showManager();
      return !!ok;
    },
    setStanding(key, value) {
      if (key === 'coinFlip') { settings.coinFlip = value; game.setCoinPolicy?.(value); }
      else if (key === 'surgeCap') { settings.surgeCap = value; game.setSurgeCap?.(value); }
      else { settings.offers = { ...(settings.offers || {}), [key]: value }; game.setOfferPolicy?.(key, value); }
      saveSettings(settings);
      return settings;
    },
    toggleSound() { settings.muted = !settings.muted; sound.mute(settings.muted); saveSettings(settings); },
    toggleCrewNames() { settings.crewNames = !settings.crewNames; saveSettings(settings); },
    toggleMotion() { settings.reducedMotion = !settings.reducedMotion; saveSettings(settings); },
  };
  ui = createUI(api);
  hold = installHold({ canvas, hitTest: scene.hitTest, allowed: () => running && !paused && !ui.blocked() && game.getView().phase !== 'summary', setHold: on => game.holdStand(on), ring: ui.ring });
  ui.title(loadSave());
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) api.pause(); });
  addEventListener('pagehide', () => { if (running) { hold.release(); persist(); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => ui.toast('Offline install unavailable; the game still works online.'));
  return {
    contractVersion:'manager-native-v20-live', get lastTransition(){return lastTransition;},
    get game() { return game; }, get scene() { return scene; }, nameTagAlpha: () => scene.nameTagAlpha(), get paused() { return paused || planning || !running; },
    step(dt) {
      const active = running && !paused && !planning;
      if (active) {
        manager.automate(game);
        if(timelapse){
          const v=game.getView(),phases=Object.entries(game.config.phases),index=phases.findIndex(([id])=>id===v.phase);
          const remaining=index<0?0:phases.slice(index).reduce((sum,[,p])=>sum+(p.seconds||0),0)-(v.phaseT||0);
          const durationLeft=Math.max(.001,timelapse.duration-timelapse.elapsed);
          game.tick(Math.max(0,remaining)*Math.min(1,dt/durationLeft)+.001);
          timelapse.elapsed+=dt;if(timelapse.elapsed>=timelapse.duration)timelapse=null;
        }else game.tick(dt * manager.rate(game) * (fast ? 12 : 1));
      }
      const v = game.getView(), events = game.drainEvents();
      if (running) {manager.sample(v);evidence.sample(v,events,game.config);}
      // Title animates the existing cast and crowd; the saved engine never ticks.
      scene.setPreferences({ titlePreview: !running, crewNames: settings.crewNames, reducedMotion: settings.reducedMotion });
      if (active || !running) scene.update(game, v, events, active || !settings.reducedMotion ? dt : 0);
      if (active) sound.update(v, events);
      ui.update(v, events, dt, settings);
      if (running && !paused && (saveAt += dt) > 4) { saveAt = 0; persist(); }
      if (events.some(e => e.type === 'dayEnd')) { hold.release(); persist(); }
    },
  };
}
