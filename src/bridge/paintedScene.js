// Painted-renderer scene adapter. Reuses the legacy visual bridge for sim updates
// and preferences, but reports UI geometry (protected rects, anchors, stand hit
// area) in CSS px from the painted plate's anchors (assets/art/bg-plate.map.json).
import { createLegacySceneBridge } from './legacyScene.js';
import {stationPose,paintedContentBounds,usesPaintedStation} from './paintedCamera.js';
import { watchFrame, clipProtectedRects } from './watchFrame.js';

export function createPaintedSceneBridge({ sim, art, screen, plateToCss }) {
  const map = art.map;
  const standPx = map.sprite?.standPx || 200;
  const rectOf = (pts, kind, id) => {
    const c = pts.map(([x, y]) => plateToCss(x, y));
    return { kind, id, left: Math.min(...c.map(p => p[0])), right: Math.max(...c.map(p => p[0])), top: Math.min(...c.map(p => p[1])), bottom: Math.max(...c.map(p => p[1])) };
  };
  const feet = who => {const pose=stationPose(art,who);return [pose.x,pose.y];};
  const standRect = () => {
    const whole=map.composition?.stand;
    if(whole)return rectOf([[whole.left,whole.top],[whole.right,whole.bottom]],'stand','stand');
    const poly = map.counter?.poly || [];
    const ys = poly.map(p => p[1]);
    const top = Math.min(...ys) - standPx * (1 - (map.counter?.waist??.56)) - 20;
    return rectOf([...poly, [poly[0]?.[0] ?? 0, top], [poly[poly.length - 1]?.[0] ?? 0, top]], 'stand', 'stand');
  };
  const legacy = createLegacySceneBridge({ sim, screen, hitTest: (x, y) => {
    const r = standRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  } });
  const bridge = {
    ...legacy,
    protectedRects() {
      // Every cast silhouette is protected, including Antonio and West in the plaza.
      // The Watch dock has its own reserved rail; never exclude crew to fit chrome.
      const crew = paintedContentBounds(art).filter(r=>map.stations?.[r.id]&&r.id!=='dale').map(r=>rectOf([[r.left,r.top],[r.right,r.bottom]],'crew',`crew-${r.id}`));
      const bounds = [standRect(), ...crew];
      const oldMain=map.oldMain?{left:map.oldMain.x,top:map.oldMain.y,right:map.oldMain.x+map.oldMain.w,bottom:map.oldMain.y+map.oldMain.h}:map.uiGeometry?.oldMain;
      if(oldMain)bounds.push(rectOf([[oldMain.left,oldMain.top],[oldMain.right,oldMain.bottom]],'oldMain','old-main'));
      // Also protect roaming cast at their current projected positions.
      for (const actor of sim.S.actors.filter(a => a.kind === 'crew' || a.kind === 'west')) {
        const who = Object.keys(sim.crew).find(id => sim.crew[id] === actor);
        const home = map.stations[who];
        // Match the painted renderer's station snap; do not protect a second,
        // fictitious projected copy of an actor already drawn at a station.
        if (usesPaintedStation(map,who,actor)) continue;
        const foot = screen(actor.i, actor.j), up = screen(actor.i, actor.j, 58);
        const h = Math.abs(foot[1] - up[1]);
        bounds.push({ kind: 'crew', id: `moving-${actor.id}`, left: foot[0] - h * 0.35, right: foot[0] + h * 0.35, top: foot[1] - h - 14, bottom: foot[1] + 8 });
      }
      return typeof document !== 'undefined' && ['watch','manager'].includes(document.body.dataset.quadMode)
        ? clipProtectedRects(bounds, watchFrame(innerWidth, innerHeight,true,document.body.dataset.quadMode==='manager')) : bounds;
    },
    anchors() {
      const [mx, my] = feet('matt');
      const golden = plateToCss(mx, my - standPx - 24);
      const s = map.stations.aaron;
      const agenda = plateToCss(s.x, s.y - standPx - 30);
      const stand = map.composition?.stand;
      const cx = stand ? (stand.left + stand.right) / 2 : ((map.stations.jared?.x || 0) + (map.stations.ali?.x || 0)) / 2;
      const top = stand?.top ?? map.sign?.y ?? 360;
      const popup = plateToCss(cx, top - 36);
      return { golden: { x: golden[0], y: golden[1] }, agenda: { x: agenda[0], y: agenda[1] }, popup: { x: popup[0], y: popup[1] } };
    },
    keepClearRects() {
      const w = typeof innerWidth === 'number' ? innerWidth : 1440;
      const h = typeof innerHeight === 'number' ? innerHeight : 900;
      const mode = typeof document !== 'undefined' && document.body?.dataset?.quadMode;
      const frame = watchFrame(w, h, true, mode === 'manager');
      const phone = w <= 600;
      const bottom = Math.max(h - frame.bottom, h * (phone ? 0.24 : 0.18));
      return [
        { id: 'hud-top', edge: 'top', left: 0, top: 0, right: w, bottom: frame.top },
        { id: 'hud-bottom', edge: 'bottom', left: 0, top: h - bottom, right: w, bottom: h },
      ];
    },
  };
  bridge.getCastBounds = () => paintedContentBounds(art).filter(r=>map.stations?.[r.id]&&r.id!=='dale').map(r=>rectOf([[r.left,r.top],[r.right,r.bottom]],'crew',`crew-${r.id}`));
  // Unclipped scenery bounds support renderer-independent framing QA.
  bridge.getSceneryBounds=()=>paintedContentBounds(art).filter(r=>['sign','oldMain','stand'].includes(r.id)).map(r=>rectOf([[r.left,r.top],[r.right,r.bottom]],r.id,r.id));
  bridge.geometry = () => ({ protectedRects: bridge.protectedRects(), anchors: bridge.anchors(), keepClear: bridge.keepClearRects() });
  return bridge;
}
