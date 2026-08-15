/* Locatrix — overlay UI
 * Owner: Dhinesh Kumar V
 *
 * Inspect mode: hover tracking, element highlight box, floating locator
 * panel (isolated in a shadow root), click-to-pin, drag / resize,
 * edge auto-flip, dark / light / auto transparent themes, opacity control.
 *
 * Esc exits. Alt+hover drills into elements underneath the top layer.
 */

'use strict';

(function () {
  if (window.__LOCATRIX_OVERLAY__) return;

  const S = () => window.__LOCATRIX_SETTINGS__;
  const E = () => window.__LOCATRIX_ENGINE__;
  const C = () => window.__LOCATRIX_COPY__;
  const T = () => window.__LOCATRIX_TOOLS__;

  /* ------------------------------------------------------------ state */
  let active = false;
  let pinned = false;
  let settings = null;
  let currentEl = null;
  let currentReport = null;
  let rafPending = false;
  let lastMouse = { x: 0, y: 0 };
  let panelDragged = false; // user moved the panel — stop following cursor

  /* shadow host */
  let hostEl = null;
  let shadow = null;
  let highlightBox = null;
  let tagBadge = null;
  let panel = null;
  let modeBadge = null;

  /* ------------------------------------------------------------ styles */

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }

/* ---------- theme variables ---------- */
.lx-root { --lx-op: 0.92; }
.lx-root[data-theme="dark"] {
  --bg: rgba(13, 18, 30, var(--lx-op));
  --bg2: rgba(23, 30, 48, var(--lx-op));
  --ink: #e8edf7; --muted: #9aa7bd; --border: rgba(90,110,160,.35);
  --accent: #4f8cff; --good: #3ddc84; --warn: #ffb020; --bad: #ff5d5d;
  --chip: rgba(255,255,255,.06); --hover: rgba(79,140,255,.12);
}
.lx-root[data-theme="light"] {
  --bg: rgba(255, 255, 255, var(--lx-op));
  --bg2: rgba(243, 246, 252, var(--lx-op));
  --ink: #1c2536; --muted: #5b6880; --border: rgba(60,80,130,.25);
  --accent: #2f6fe4; --good: #0c9d58; --warn: #b07708; --bad: #d43c3c;
  --chip: rgba(20,40,90,.06); --hover: rgba(47,111,228,.10);
}

/* ---------- highlight box ---------- */
.lx-hl {
  position: fixed; pointer-events: none; z-index: 2147483644;
  border: 2px solid var(--hl, #3ddc84); border-radius: 4px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--hl, #3ddc84) 22%, transparent);
  transition: left .05s linear, top .05s linear, width .05s linear, height .05s linear;
  display: none;
}
.lx-hl-tag {
  position: fixed; pointer-events: none; z-index: 2147483646;
  background: var(--hl, #3ddc84); color: #08110b; font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 4px; display: none; white-space: nowrap;
  font-family: Consolas, monospace;
}

/* ---------- mode badge ---------- */
.lx-mode {
  position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
  z-index: 2147483646; background: var(--bg); color: var(--ink);
  border: 1px solid var(--border); border-radius: 999px;
  padding: 5px 16px; font-size: 12px; backdrop-filter: blur(8px);
  box-shadow: 0 4px 18px rgba(0,0,0,.25); user-select: none;
}
.lx-mode b { color: var(--good); }
.lx-mode .lx-mode-hint { color: var(--muted); margin-left: 8px; }

/* ---------- panel ---------- */
.lx-panel {
  position: fixed; z-index: 2147483646; min-width: 380px; max-width: 560px;
  width: 460px; max-height: 62vh; display: none; flex-direction: column;
  background: var(--bg); color: var(--ink);
  border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,.38); backdrop-filter: blur(10px);
  overflow: hidden; font-size: 12.5px;
}
.lx-panel.lx-show { display: flex; }
.lx-head {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: var(--bg2); border-bottom: 1px solid var(--border);
  cursor: grab; user-select: none;
}
.lx-head:active { cursor: grabbing; }
.lx-title { font-weight: 700; font-size: 12.5px; letter-spacing: .3px; }
.lx-title .lx-brand { color: var(--accent); }
.lx-pin-state {
  font-size: 10.5px; padding: 2px 8px; border-radius: 999px;
  background: var(--chip); color: var(--muted); border: 1px solid var(--border);
}
.lx-pin-state.lx-pinned { color: #b07cff; border-color: #b07cff; }
.lx-head-spacer { flex: 1; }
.lx-btn {
  all: unset; cursor: pointer; padding: 3px 9px; border-radius: 7px;
  background: var(--chip); color: var(--ink); font-size: 11.5px;
  border: 1px solid var(--border); line-height: 1.5; text-align: center;
}
.lx-btn:hover { background: var(--hover); border-color: var(--accent); }
.lx-primary { background: var(--accent); color: #fff; border-color: transparent; }
.lx-primary:hover { filter: brightness(1.1); background: var(--accent); }
.lx-mini { padding: 1px 7px; font-size: 11px; }

/* context strip */
.lx-ctx {
  padding: 7px 12px; border-bottom: 1px solid var(--border);
  color: var(--muted); font-size: 11px; line-height: 1.6;
}
.lx-ctx code { color: var(--ink); font-family: Consolas, monospace; font-size: 11px; }
.lx-ctx .lx-chainpart { color: var(--warn); }
.lx-flag { display: inline-block; padding: 0 7px; margin-left: 5px; border-radius: 999px;
  background: var(--chip); border: 1px solid var(--border); font-size: 10px; }
.lx-flag.lx-flag-warn { color: var(--warn); border-color: var(--warn); }

/* rows */
.lx-rows { overflow-y: auto; overscroll-behavior: contain; flex: 1; }
.lx-row {
  display: grid; grid-template-columns: 46px 108px 1fr auto; gap: 8px;
  align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--border);
}
.lx-row:hover { background: var(--hover); }
.lx-stab { font-size: 9.5px; font-weight: 800; text-align: center; padding: 2px 0;
  border-radius: 5px; letter-spacing: .5px; }
.lx-stab-HIGH { color: var(--good); border: 1px solid var(--good); }
.lx-stab-MED  { color: var(--warn); border: 1px solid var(--warn); }
.lx-stab-LOW  { color: var(--bad);  border: 1px solid var(--bad); }
.lx-type { color: var(--muted); font-size: 11px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.lx-val {
  font-family: Consolas, Menlo, monospace; font-size: 11.5px; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
}
.lx-val.lx-expanded { white-space: normal; word-break: break-all; }
.lx-right { display: flex; align-items: center; gap: 6px; }
.lx-match { font-size: 10px; white-space: nowrap; }
.lx-match-1 { color: var(--good); }
.lx-match-n { color: var(--warn); }
.lx-match-x { color: var(--bad); }
.lx-note { grid-column: 2 / -1; color: var(--muted); font-size: 10px; margin-top: -3px; }

/* footer */
.lx-foot {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: var(--bg2); border-top: 1px solid var(--border);
}
.lx-select {
  all: unset; background: var(--chip); border: 1px solid var(--border);
  border-radius: 7px; padding: 3px 8px; font-size: 11px; color: var(--ink);
  cursor: pointer;
}
.lx-foot-spacer { flex: 1; }
.lx-opacity { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10.5px; }
.lx-opacity input { width: 62px; accent-color: var(--accent); cursor: pointer; }

/* resize handle */
.lx-resize {
  position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
  cursor: nwse-resize; opacity: .5;
}
.lx-resize::after {
  content: ''; position: absolute; right: 3px; bottom: 3px; width: 8px; height: 8px;
  border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted);
}

/* toast */
.lx-toast {
  position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%) translateY(16px);
  z-index: 2147483647; background: #123c26; color: #8fe6b0;
  border: 1px solid #3ddc84; border-radius: 9px; padding: 7px 18px;
  font-size: 12.5px; opacity: 0; pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
}
.lx-toast-show { opacity: 1; transform: translateX(-50%) translateY(0); }
.lx-toast-err { background: #3c1212; color: #ffb3b3; border-color: #ff5d5d; }

/* ---------- tools drawer ---------- */
.lx-drawer {
  position: fixed; top: 0; right: -520px; width: 500px; max-width: 96vw; height: 100vh;
  z-index: 2147483646; background: var(--bg); color: var(--ink);
  border-left: 1px solid var(--border); box-shadow: -12px 0 40px rgba(0,0,0,.35);
  backdrop-filter: blur(12px); transition: right .22s ease;
  display: flex; flex-direction: column; font-size: 12.5px;
}
.lx-drawer-open { right: 0; }
.lx-drawer-head {
  display: flex; align-items: center; gap: 10px; padding: 13px 16px;
  background: var(--bg2); border-bottom: 1px solid var(--border);
}
.lx-drawer-title { font-weight: 700; font-size: 14px; }
.lx-drawer-sub { color: var(--muted); font-size: 11px; flex: 1; }
.lx-tabs { display: flex; border-bottom: 1px solid var(--border); }
.lx-tab {
  all: unset; cursor: pointer; flex: 1; text-align: center; padding: 9px 4px;
  color: var(--muted); font-size: 12px; border-bottom: 2px solid transparent;
}
.lx-tab:hover { color: var(--ink); background: var(--hover); }
.lx-tab-active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 700; }
.lx-tabpane { padding: 14px 16px; overflow-y: auto; flex: 1; }
.lx-hidden { display: none !important; }
.lx-hint { color: var(--muted); font-size: 11.5px; margin: 0 0 10px; line-height: 1.5; }
.lx-inputrow { display: flex; gap: 8px; margin-bottom: 10px; }
.lx-input, .lx-textarea {
  all: unset; flex: 1; background: var(--chip); border: 1px solid var(--border);
  border-radius: 8px; padding: 7px 10px; font-family: Consolas, monospace;
  font-size: 11.5px; color: var(--ink); min-width: 0;
}
.lx-textarea { width: 100%; display: block; margin-bottom: 10px; resize: vertical;
  white-space: pre; line-height: 1.7; }
.lx-input:focus, .lx-textarea:focus { border-color: var(--accent); }
.lx-status { padding: 7px 11px; border-radius: 8px; font-size: 12px; margin-bottom: 10px;
  border: 1px solid var(--border); background: var(--chip); }
.lx-good { color: var(--good); border-color: var(--good); }
.lx-warn { color: var(--warn); border-color: var(--warn); }
.lx-bad  { color: var(--bad);  border-color: var(--bad); }
.lx-bulk-list { display: flex; flex-direction: column; gap: 4px; }
.lx-bulk-row {
  display: flex; align-items: center; gap: 8px; padding: 5px 9px;
  border: 1px solid var(--border); border-radius: 7px; background: var(--chip);
}
.lx-bulk-ico { flex: none; }
.lx-bulk-loc {
  flex: 1; font-family: Consolas, monospace; font-size: 11px; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink);
}
.lx-bulk-loc:hover { color: var(--accent); text-decoration: underline; }
.lx-bulk-meta { color: var(--muted); font-size: 10.5px; white-space: nowrap; }
.lx-heal-card {
  border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px;
  margin-bottom: 8px; background: var(--chip);
}
.lx-heal-top { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.lx-heal-conf { color: #b07cff; font-weight: 700; font-size: 11px;
  border: 1px solid #b07cff; padding: 1px 8px; border-radius: 999px; }
.lx-heal-prev { color: var(--muted); font-size: 11px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.lx-heal-loc { display: flex; gap: 7px; align-items: center; }
.lx-heal-type { color: var(--muted); font-size: 10.5px; white-space: nowrap; }
.lx-heal-val { flex: 1; font-family: Consolas, monospace; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
  color: var(--ink); }
.lx-heal-val:hover { color: var(--accent); }
`;

  /* ------------------------------------------------------------ shadow host */

  function ensureHost() {
    if (hostEl) return;
    hostEl = document.createElement('locatrix-root');
    hostEl.setAttribute('data-locatrix', 'host');
    hostEl.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;';
    shadow = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'lx-root';
    shadow.appendChild(root);

    highlightBox = document.createElement('div');
    highlightBox.className = 'lx-hl';
    root.appendChild(highlightBox);

    tagBadge = document.createElement('div');
    tagBadge.className = 'lx-hl-tag';
    root.appendChild(tagBadge);

    modeBadge = document.createElement('div');
    modeBadge.className = 'lx-mode';
    modeBadge.innerHTML = '<b>● Locatrix</b> inspect mode <span class="lx-mode-hint">click = pin · Alt = drill · Esc = exit</span>';
    root.appendChild(modeBadge);

    panel = document.createElement('div');
    panel.className = 'lx-panel';
    panel.innerHTML = `
      <div class="lx-head">
        <span class="lx-title"><span class="lx-brand">Locatrix</span></span>
        <span class="lx-pin-state">live</span>
        <span class="lx-head-spacer"></span>
        <button class="lx-btn lx-mini lx-btn-tools" title="Locator Tools (validate / highlight / heal)">🧰 Tools</button>
        <button class="lx-btn lx-mini lx-btn-theme" title="Theme: dark / light / auto">🌓</button>
        <button class="lx-btn lx-mini lx-btn-close" title="Exit inspect (Esc)">✕</button>
      </div>
      <div class="lx-ctx"></div>
      <div class="lx-rows"></div>
      <div class="lx-foot">
        <button class="lx-btn lx-primary lx-btn-copyall">⧉ Copy All</button>
        <select class="lx-select lx-fmt">
          <option value="text">as text</option>
          <option value="json">as JSON</option>
        </select>
        <span class="lx-foot-spacer"></span>
        <span class="lx-opacity">op <input type="range" min="55" max="100" value="92" class="lx-op-slider"></span>
      </div>
      <div class="lx-resize"></div>
    `;
    root.appendChild(panel);

    document.documentElement.appendChild(hostEl);

    wirePanel(root);
    applyTheme(root);
  }

  function applyTheme(rootMaybe) {
    const root = rootMaybe || (shadow && shadow.querySelector('.lx-root'));
    if (!root || !settings) return;
    let theme = settings.theme;
    if (theme === 'auto') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light' : 'dark';
    }
    root.setAttribute('data-theme', theme);
    root.style.setProperty('--lx-op', String(settings.opacity));
    root.style.setProperty('--hl', settings.highlightColor);
    const slider = shadow.querySelector('.lx-op-slider');
    if (slider) slider.value = Math.round(settings.opacity * 100);
  }

  /* ------------------------------------------------------------ panel wiring */

  function wirePanel() {
    panel.querySelector('.lx-btn-close').addEventListener('click', stop);
    panel.querySelector('.lx-btn-tools').addEventListener('click', () => {
      T().open({ shadowRoot: shadow });
    });
    panel.querySelector('.lx-btn-theme').addEventListener('click', async () => {
      const order = ['dark', 'light', 'auto'];
      const next = order[(order.indexOf(settings.theme) + 1) % order.length];
      settings.theme = next;
      await S().save({ theme: next });
      applyTheme();
      C().toast(shadow, `Theme: ${next}`, true);
    });
    panel.querySelector('.lx-btn-copyall').addEventListener('click', () => {
      if (!currentReport) return;
      const fmt = panel.querySelector('.lx-fmt').value;
      C().copyAll(shadow, currentReport.rows, currentReport.context, fmt);
    });
    panel.querySelector('.lx-fmt').addEventListener('change', (e) => {
      S().save({ copyAllFormat: e.target.value });
    });
    panel.querySelector('.lx-op-slider').addEventListener('input', (e) => {
      settings.opacity = Number(e.target.value) / 100;
      applyTheme();
    });
    panel.querySelector('.lx-op-slider').addEventListener('change', () => {
      S().save({ opacity: settings.opacity });
    });

    /* drag */
    const head = panel.querySelector('.lx-head');
    let drag = null;
    head.addEventListener('mousedown', (e) => {
      if (e.target.closest('.lx-btn')) return;
      drag = { sx: e.clientX, sy: e.clientY, px: panel.offsetLeft, py: panel.offsetTop };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      panelDragged = true;
      const x = Math.max(4, Math.min(window.innerWidth - 80, drag.px + e.clientX - drag.sx));
      const y = Math.max(4, Math.min(window.innerHeight - 40, drag.py + e.clientY - drag.sy));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
    }, true);
    window.addEventListener('mouseup', () => {
      if (drag) {
        drag = null;
        S().save({ panelState: {
          x: panel.offsetLeft, y: panel.offsetTop,
          w: panel.offsetWidth, h: panel.offsetHeight
        } });
      }
      if (resize) {
        resize = null;
        S().save({ panelState: {
          x: panel.offsetLeft, y: panel.offsetTop,
          w: panel.offsetWidth, h: panel.offsetHeight
        } });
      }
    }, true);

    /* resize */
    let resize = null;
    panel.querySelector('.lx-resize').addEventListener('mousedown', (e) => {
      resize = { sx: e.clientX, sy: e.clientY, w: panel.offsetWidth, h: panel.offsetHeight };
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener('mousemove', (e) => {
      if (!resize) return;
      panel.style.width = Math.max(340, resize.w + e.clientX - resize.sx) + 'px';
      panel.style.maxHeight = Math.max(220, resize.h + e.clientY - resize.sy) + 'px';
    }, true);
  }

  /* ------------------------------------------------------------ rendering */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderReport(report) {
    currentReport = report;
    const ctx = panel.querySelector('.lx-ctx');
    const rowsBox = panel.querySelector('.lx-rows');

    const c = report.context;
    const stateBits = [];
    stateBits.push(c.visible ? 'visible' : 'hidden');
    if (c.disabled) stateBits.push('disabled');
    if (c.checked != null) stateBits.push(c.checked ? 'checked' : 'unchecked');

    let chainHtml = '';
    if (c.chain && c.chain.length > 1) {
      chainHtml = `<div>ctx: ${c.chain.map((p, i) =>
        i === 0 ? esc(p) : `<span class="lx-chainpart">→ ${esc(p)}</span>`).join(' ')}</div>`;
    }
    ctx.innerHTML = `
      <div><code>&lt;${esc(c.tag)}&gt;</code>${c.text ? ' ' + esc(c.text.slice(0, 60)) : ''}
        ${c.duplicateId ? '<span class="lx-flag lx-flag-warn">duplicate id on page</span>' : ''}
      </div>
      <div>${c.rect.w}×${c.rect.h} @ (${c.rect.x},${c.rect.y}) · ${stateBits.join(' · ')}${c.value ? ` · value: <code>${esc(c.value)}</code>` : ''}</div>
      <div>${esc(c.breadcrumb)}</div>
      ${chainHtml}
    `;

    rowsBox.innerHTML = '';
    for (const r of report.rows) {
      const row = document.createElement('div');
      row.className = 'lx-row';
      const matchCls = r.count === 1 ? 'lx-match-1' : (r.count > 1 ? 'lx-match-n' : 'lx-match-x');
      const matchTxt = r.count === 1 ? '✅ unique' : (r.count > 1 ? `⚠ ×${r.count}` : (r.count === 0 ? '❌ 0' : '—'));
      row.innerHTML = `
        <span class="lx-stab lx-stab-${r.stability}">${r.stability}</span>
        <span class="lx-type" title="${esc(r.type)}">${esc(r.type)}</span>
        <span class="lx-val" title="click to expand / collapse">${esc(r.value)}</span>
        <span class="lx-right">
          <span class="lx-match ${matchCls}">${matchTxt}</span>
          <button class="lx-btn lx-mini" title="Copy value">⧉</button>
        </span>
        ${r.note || r.dynamic ? `<span class="lx-note">${r.dynamic ? '⚠ looks dynamic/auto-generated · ' : ''}${esc(r.note || '')}</span>` : ''}
      `;
      row.querySelector('.lx-val').addEventListener('click', (e) => {
        e.target.classList.toggle('lx-expanded');
      });
      row.querySelector('button').addEventListener('click', () => {
        C().copyValue(shadow, r.type, r.value);
      });
      rowsBox.appendChild(row);
    }
  }

  /* ------------------------------------------------------------ positioning */

  function positionPanel() {
    if (panelDragged) return;
    const saved = settings.panelState;
    if (saved && saved.x != null) {
      panel.style.left = Math.min(saved.x, window.innerWidth - 100) + 'px';
      panel.style.top = Math.min(saved.y, window.innerHeight - 60) + 'px';
      if (saved.w) panel.style.width = saved.w + 'px';
      panelDragged = true;
      return;
    }
    const pos = settings.panelPosition;
    const pw = panel.offsetWidth || 460;
    const ph = Math.min(panel.offsetHeight || 380, window.innerHeight * 0.62);
    const pad = 14;
    let x, y;
    if (pos === 'cursor') {
      x = lastMouse.x + 22;
      y = lastMouse.y + 22;
      if (x + pw > window.innerWidth - pad) x = lastMouse.x - pw - 22; // flip left
      if (x < pad) x = pad;
      if (y + ph > window.innerHeight - pad) y = lastMouse.y - ph - 22; // flip up
      if (y < pad) y = pad;
    } else {
      x = pos.includes('l') ? pad : window.innerWidth - pw - pad;
      y = pos.includes('t') ? pad + 40 : window.innerHeight - ph - pad;
    }
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  function positionHighlight(el) {
    const rect = el.getBoundingClientRect();
    highlightBox.style.display = 'block';
    highlightBox.style.left = (rect.left - 2) + 'px';
    highlightBox.style.top = (rect.top - 2) + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';

    tagBadge.style.display = 'block';
    tagBadge.textContent = `<${el.tagName.toLowerCase()}> ${Math.round(rect.width)}×${Math.round(rect.height)}`;
    const bx = Math.max(4, Math.min(rect.left, window.innerWidth - 160));
    const by = rect.top > 26 ? rect.top - 24 : rect.bottom + 4;
    tagBadge.style.left = bx + 'px';
    tagBadge.style.top = by + 'px';
  }

  /* ------------------------------------------------------------ hover engine */

  function pickTarget(x, y, drill) {
    if (!drill) {
      const el = document.elementFromPoint(x, y);
      return sanitize(el);
    }
    const stack = document.elementsFromPoint(x, y).filter((el) => sanitize(el));
    return stack.length > 1 ? stack[1] : (stack[0] || null);
  }

  function sanitize(el) {
    if (!el) return null;
    if (el === hostEl || el.closest && el.closest('[data-locatrix]')) return null;
    if (el === document.documentElement || el === document.body) return null;
    return el;
  }

  function onMouseMove(e) {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (!active || pinned) return;
    if (rafPending) return;
    rafPending = true;
    const drill = e.altKey;
    requestAnimationFrame(() => {
      rafPending = false;
      const el = pickTarget(lastMouse.x, lastMouse.y, drill);
      if (!el || el === currentEl) {
        if (el) positionHighlight(el);
        return;
      }
      currentEl = el;
      positionHighlight(el);
      const report = E().analyze(el);
      if (report) {
        renderReport(report);
        panel.classList.add('lx-show');
        positionPanel();
      }
    });
  }

  function onClick(e) {
    if (!active) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(hostEl)) return; // clicks inside our UI stay normal
    e.preventDefault();
    e.stopPropagation();
    pinned = !pinned;
    const state = panel.querySelector('.lx-pin-state');
    state.textContent = pinned ? '📌 pinned' : 'live';
    state.classList.toggle('lx-pinned', pinned);
    if (!pinned && currentEl) {
      const report = E().analyze(currentEl); // refresh on unpin
      if (report) renderReport(report);
    }
  }

  function onKeyDown(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      const tools = T();
      if (tools.isOpen()) { tools.close(); return; }
      stop();
      try { chrome.runtime.sendMessage({ type: 'CONTENT_STOPPED' }); } catch (_e) { /* noop */ }
    }
  }

  function onScrollOrResize() {
    if (!active) return;
    if (currentEl && document.contains(currentEl)) positionHighlight(currentEl);
    else { highlightBox.style.display = 'none'; tagBadge.style.display = 'none'; }
  }

  /* ------------------------------------------------------------ lifecycle */

  async function start() {
    if (active) return { ok: true, active: true };
    settings = await S().load();
    ensureHost();
    applyTheme();
    const fmt = panel.querySelector('.lx-fmt');
    if (fmt) fmt.value = settings.copyAllFormat;
    active = true;
    pinned = false;
    panelDragged = !!(settings.panelState && settings.panelState.x != null);

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, true);
    return { ok: true, active: true };
  }

  function stop() {
    if (!active) return { ok: true, active: false };
    active = false;
    pinned = false;
    currentEl = null;
    currentReport = null;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize, true);
    if (highlightBox) highlightBox.style.display = 'none';
    if (tagBadge) tagBadge.style.display = 'none';
    if (panel) panel.classList.remove('lx-show');
    if (modeBadge) modeBadge.style.display = 'none';
    T().close();
    return { ok: true, active: false };
  }

  /* re-show mode badge on start */
  const _origStart = start;
  start = async function () {
    const r = await _origStart();
    if (modeBadge) modeBadge.style.display = 'block';
    return r;
  };

  /* settings live-update from popup */
  S().onChange((patch) => {
    if (!settings) return;
    Object.assign(settings, patch);
    if (shadow) applyTheme();
  });

  /* ------------------------------------------------------------ messaging */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg && msg.type) {
      case 'LOCATRIX_START':
        start().then(sendResponse);
        return true;
      case 'LOCATRIX_STOP':
        sendResponse(stop());
        return false;
      case 'LOCATRIX_OPEN_TOOLS':
        (async () => {
          if (!active) await start();
          T().open({ shadowRoot: shadow });
          sendResponse({ ok: true });
        })();
        return true;
      default:
        return false;
    }
  });

  window.__LOCATRIX_OVERLAY__ = { start, stop };
})();
