/* Locatrix — popup logic | Owner: Dhinesh Kumar V */

'use strict';

const api = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

const DEFAULTS = {
  theme: 'auto',
  opacity: 0.92,
  highlightColor: '#3ddc84',
  panelPosition: 'cursor',
  copyAllFormat: 'text',
  panelState: null
};

function $(sel) { return document.querySelector(sel); }

function send(message) {
  return new Promise((resolve) => {
    try {
      api.runtime.sendMessage(message, (res) => {
        void api.runtime.lastError; // swallow
        resolve(res || null);
      });
    } catch (_e) { resolve(null); }
  });
}

function loadSettings() {
  return new Promise((resolve) => {
    api.storage.local.get(Object.keys(DEFAULTS), (raw) =>
      resolve(Object.assign({}, DEFAULTS, raw || {})));
  });
}

function saveSettings(patch) {
  return new Promise((resolve) => api.storage.local.set(patch, () => resolve()));
}

function reflectToggle(active) {
  const btn = $('#toggle');
  const label = $('#toggle-label');
  btn.classList.toggle('active', !!active);
  label.textContent = active ? 'Stop Inspecting' : 'Start Inspecting';
}

async function init() {
  /* --- state --- */
  const state = await send({ type: 'POPUP_GET_STATE' });
  if (state) {
    if (state.restricted) $('#restricted').classList.remove('hidden');
    if (state.incognito) $('#incognito').classList.remove('hidden');
    reflectToggle(state.active);
    if (state.restricted) {
      $('#toggle').disabled = true;
      $('#toggle').style.opacity = 0.5;
      $('#toggle').style.pointerEvents = 'none';
      $('#tools').style.opacity = 0.5;
      $('#tools').style.pointerEvents = 'none';
    }
  }

  /* --- main actions --- */
  $('#toggle').addEventListener('click', async () => {
    const res = await send({ type: 'POPUP_TOGGLE_INSPECT' });
    if (res && res.ok) {
      reflectToggle(res.active);
      if (res.active) window.close();
    } else if (res && res.reason === 'restricted') {
      $('#restricted').classList.remove('hidden');
    }
  });

  $('#tools').addEventListener('click', async () => {
    const res = await send({ type: 'POPUP_OPEN_TOOLS' });
    if (res && res.ok) window.close();
    else if (res && res.reason === 'restricted') $('#restricted').classList.remove('hidden');
  });

  /* --- settings --- */
  const settings = await loadSettings();

  // theme segment
  const seg = $('#theme-seg');
  function paintSeg() {
    seg.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === settings.theme));
  }
  paintSeg();
  seg.addEventListener('click', async (e) => {
    const v = e.target && e.target.dataset && e.target.dataset.v;
    if (!v) return;
    settings.theme = v;
    paintSeg();
    await saveSettings({ theme: v });
  });

  // opacity
  const op = $('#opacity');
  const opVal = $('#opacity-val');
  op.value = Math.round(settings.opacity * 100);
  opVal.textContent = op.value + '%';
  op.addEventListener('input', () => { opVal.textContent = op.value + '%'; });
  op.addEventListener('change', async () => {
    await saveSettings({ opacity: Number(op.value) / 100 });
  });

  // highlight color
  const hl = $('#hl-color');
  hl.value = settings.highlightColor;
  hl.addEventListener('change', async () => {
    await saveSettings({ highlightColor: hl.value });
  });

  // position
  const pos = $('#pos');
  pos.value = settings.panelPosition;
  pos.addEventListener('change', async () => {
    await saveSettings({ panelPosition: pos.value, panelState: null });
  });

  // copy format
  const fmt = $('#fmt');
  fmt.value = settings.copyAllFormat;
  fmt.addEventListener('change', async () => {
    await saveSettings({ copyAllFormat: fmt.value });
  });

  // reset panel
  $('#reset-panel').addEventListener('click', async () => {
    await saveSettings({ panelState: null });
    const b = $('#reset-panel');
    b.textContent = 'Done ✓';
    setTimeout(() => { b.textContent = 'Reset'; }, 900);
  });
}

document.addEventListener('DOMContentLoaded', init);
