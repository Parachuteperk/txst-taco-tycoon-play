// Renderer-neutral scene contract. This file must not import renderer modules.
import { SCENE_CAST } from './composition.js';
export const SCENE_API_VERSION = 1;
const REQUIRED = ['reset', 'update', 'setPreferences', 'hitTestStand', 'getUiGeometry'];

export function createSceneBridge(renderer) {
  for (const method of REQUIRED) if (typeof renderer?.[method] !== 'function') {
    throw new TypeError(`Scene renderer must implement ${method}()`);
  }
  let preferences = { crewNames: true, titlePreview: true, reducedMotion: false, cast: SCENE_CAST };
  function geometry() {
    const model = renderer.getUiGeometry();
    if (!Array.isArray(model?.protectedRects)) throw new TypeError('getUiGeometry() must return protectedRects[]');
    const protectedRects = model.protectedRects.map(rect => {
      if (!['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(rect[key])) || rect.right <= rect.left || rect.bottom <= rect.top) {
        throw new TypeError('Scene protected rectangles must be positive finite CSS-pixel bounds');
      }
      return { ...rect };
    });
    const anchors = {};
    for (const [name, point] of Object.entries(model.anchors || {})) {
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) anchors[name] = { x: point.x, y: point.y };
    }
    return { protectedRects, anchors };
  }
  return {
    apiVersion: SCENE_API_VERSION,
    reset: () => renderer.reset(),
    // The renderer receives snapshots/events, never the live engine instance.
    update(_game, view, events, dt) { renderer.update(view, events, dt); },
    setPreferences(next) {
      preferences = { ...preferences, ...next };
      renderer.setPreferences({ ...preferences });
    },
    nameTagAlpha: () => preferences.titlePreview || preferences.crewNames ? 1 : 0,
    hitTest: (x, y) => !!renderer.hitTestStand(x, y),
    geometry,
    anchors: () => geometry().anchors,
    protectedRects: () => geometry().protectedRects,
  };
}
