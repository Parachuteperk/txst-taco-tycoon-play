// Legacy scene adapter. Replace/inject this boundary for the painted renderer;
// shell/UI consume CSS-pixel anchors and protected rectangles, never sim actors.
import { createVisualBridge } from './visual.js';
import { FW, FH, FY, AX } from '../chars.js';
import { OLD_MAIN_AT } from '../world.js';
import { OM } from '../oldmain.js';
import { clipProtectedRects, watchFrame } from './watchFrame.js';

export function createLegacySceneBridge({ sim, screen, hitTest }) {
  const visual = createVisualBridge(sim);
  let preferences = { crewNames: true, titlePreview: true, reducedMotion: false };
  const bridge = {
    reset: visual.reset,
    hitTest,
    setPreferences(next) {
      preferences = { ...preferences, ...next };
      sim.S.titlePreview = preferences.titlePreview;
      sim.S.showCrewNames = preferences.crewNames;
      sim.S.reducedMotion = !!preferences.reducedMotion;
      if (preferences.reducedMotion) { sim.S.parts.length = 0; sim.S.comboFlash = 0; }
    },
    nameTagAlpha() { return preferences.titlePreview || preferences.crewNames ? 1 : 0; },
    update(game, view, events, dt) {
      visual.update(game, view, events, dt);
      if (preferences.reducedMotion) { sim.S.parts.length = 0; sim.S.comboFlash = 0; }
    },
    anchors() {
      const matt = sim.crew.matt;
      const golden = screen(matt.i, matt.j, 42), agenda = screen(10.93, -6.73, 60);
      return { golden: { x: golden[0], y: golden[1] }, agenda: { x: agenda[0], y: agenda[1] } };
    },
    protectedRects() {
      const corners = [screen(-.3, -1.5, 64), screen(-.3, 2.2), screen(6.5, -1.5, 64), screen(6.5, 2.2)];
      const stand = { kind: 'stand', id: 'stand', left: Math.min(...corners.map(p => p[0])), top: Math.min(...corners.map(p => p[1])), right: Math.max(...corners.map(p => p[0])), bottom: Math.max(...corners.map(p => p[1])) };
      const crew = sim.S.actors.filter(actor => actor.kind === 'crew' || actor.kind === 'crew2' || actor.kind === 'west').map(actor => {
        const feet = screen(actor.i, actor.j), up = screen(actor.i, actor.j, 1);
        const scale = Math.abs(up[1] - feet[1]);
        return { kind: 'crew', id: `crew-${actor.id}`, left: feet[0] - AX * scale, right: feet[0] + (FW - AX) * scale, top: feet[1] - FY * scale, bottom: feet[1] + (FH - FY) * scale };
      });
      const [i, j] = OLD_MAIN_AT;
      const points = [];
      for (const x of [-.5, OM.Li + .5]) for (const y of [-.5, OM.Lj + .5]) {
        points.push(screen(i + x, j + y), screen(i + x, j + y, OM.H + OM.R));
      }
      points.push(screen(i + OM.pc, j + OM.Lj - 1.5, OM.H + OM.R + 84));
      for (const x of [OM.pc - 2, OM.pc + 2]) points.push(screen(i + x, j + OM.Lj + 6));
      const oldMain = { kind: 'oldMain', id: 'old-main', left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
      const bounds = [stand, ...crew, oldMain];
      return typeof document !== 'undefined' && document.body.dataset.quadMode === 'watch'
        ? clipProtectedRects(bounds, watchFrame(innerWidth, innerHeight)) : bounds;
    },
  };
  bridge.geometry = () => ({ protectedRects: bridge.protectedRects(), anchors: bridge.anchors() });
  return bridge;
}
