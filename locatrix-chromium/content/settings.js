/* Locatrix — settings module (content side)
 * Owner: Dhinesh Kumar V
 * Central defaults + storage access shared by overlay, tools drawer and popup.
 */

'use strict';

(function () {
  if (window.__LOCATRIX_SETTINGS__) return;

  const DEFAULTS = Object.freeze({
    theme: 'auto',            // 'dark' | 'light' | 'auto'
    opacity: 0.92,            // 0.5 – 1
    highlightColor: '#3ddc84',
    panelPosition: 'cursor',  // 'cursor' | 'tl' | 'tr' | 'bl' | 'br'
    copyAllFormat: 'text',    // 'text' | 'json'
    panelState: null          // remembered drag position/size {x,y,w,h}
  });

  const api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

  function load() {
    return new Promise((resolve) => {
      try {
        api.storage.local.get(Object.keys(DEFAULTS), (raw) => {
          resolve(Object.assign({}, DEFAULTS, raw || {}));
        });
      } catch (_e) {
        resolve(Object.assign({}, DEFAULTS));
      }
    });
  }

  function save(patch) {
    return new Promise((resolve) => {
      try {
        api.storage.local.set(patch, () => resolve(true));
      } catch (_e) {
        resolve(false);
      }
    });
  }

  function onChange(callback) {
    try {
      api.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const patch = {};
        for (const key of Object.keys(changes)) {
          if (key in DEFAULTS) patch[key] = changes[key].newValue;
        }
        if (Object.keys(patch).length) callback(patch);
      });
    } catch (_e) { /* storage unavailable */ }
  }

  window.__LOCATRIX_SETTINGS__ = { DEFAULTS, load, save, onChange };
})();
