/* Locatrix — Locator Tools drawer
 * Owner: Dhinesh Kumar V
 *
 * Paste-based workflows that share the locator engine:
 *   1. Highlight by locator  — paste XPath/CSS, matches flash on the page
 *   2. Bulk validator        — paste a locator list, get a health report
 *   3. Nearest match         — paste a broken locator, get suggestions
 *
 * The drawer renders inside the same isolated shadow root as the overlay.
 */

'use strict';

(function () {
  if (window.__LOCATRIX_TOOLS__) return;

  const FLASH_CLASS_TIME = 2400;
  let flashBoxes = [];
  let host = null;       // provided by overlay: { shadowRoot, getTheme }
  let drawerEl = null;

  function engine() { return window.__LOCATRIX_ENGINE__; }
  function copier() { return window.__LOCATRIX_COPY__; }

  /* ---------------- flash highlight on real page ---------------- */

  function clearFlash() {
    flashBoxes.forEach((b) => b.remove());
    flashBoxes = [];
  }

  function flashElements(elements, color) {
    clearFlash();
    const max = Math.min(elements.length, 60);
    for (let i = 0; i < max; i++) {
      const el = elements[i];
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      const box = document.createElement('div');
      box.setAttribute('data-locatrix', 'flash');
      box.style.cssText = [
        'position:fixed',
        `left:${rect.left - 2}px`,
        `top:${rect.top - 2}px`,
        `width:${rect.width}px`,
        `height:${rect.height}px`,
        `border:2px solid ${color || '#ffb020'}`,
        `box-shadow:0 0 0 4px ${(color || '#ffb020')}33, inset 0 0 0 2px ${(color || '#ffb020')}22`,
        'border-radius:4px',
        'pointer-events:none',
        'z-index:2147483645',
        'transition:opacity .4s ease'
      ].join(';');
      document.documentElement.appendChild(box);
      flashBoxes.push(box);
    }
    if (max) {
      const first = elements[0];
      try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* noop */ }
      // Reposition after the smooth scroll settles.
      setTimeout(() => {
        flashBoxes.forEach((b, i) => {
          const el = elements[i];
          if (!el) return;
          const r = el.getBoundingClientRect();
          b.style.left = `${r.left - 2}px`;
          b.style.top = `${r.top - 2}px`;
        });
      }, 450);
    }
    setTimeout(() => {
      flashBoxes.forEach((b) => (b.style.opacity = '0'));
      setTimeout(clearFlash, 450);
    }, FLASH_CLASS_TIME);
    return max;
  }

  /* ---------------- drawer UI ---------------- */

  function el(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function build() {
    drawerEl = el('div', 'lx-drawer');
    drawerEl.innerHTML = `
      <div class="lx-drawer-head">
        <span class="lx-drawer-title">🧰 Locator Tools</span>
        <span class="lx-drawer-sub">validate • highlight • heal</span>
        <button class="lx-btn lx-drawer-close" title="Close">✕</button>
      </div>
      <div class="lx-tabs">
        <button class="lx-tab lx-tab-active" data-tab="highlight">Highlight</button>
        <button class="lx-tab" data-tab="bulk">Bulk Validate</button>
        <button class="lx-tab" data-tab="heal">Nearest Match</button>
      </div>

      <section class="lx-tabpane" data-pane="highlight">
        <p class="lx-hint">Paste any CSS selector or XPath — matching elements flash on the page.</p>
        <div class="lx-inputrow">
          <input type="text" class="lx-input lx-hl-input" placeholder="e.g.  //button[@id='signin']   or   .btn.primary" spellcheck="false">
          <button class="lx-btn lx-primary lx-hl-go">Highlight</button>
        </div>
        <div class="lx-result lx-hl-result"></div>
      </section>

      <section class="lx-tabpane lx-hidden" data-pane="bulk">
        <p class="lx-hint">Paste locators — one per line (CSS or XPath, auto-detected). All are checked against this page.</p>
        <textarea class="lx-textarea lx-bulk-input" rows="6" spellcheck="false" placeholder="#login-btn&#10;//input[@name='email']&#10;.btn.primary&#10;//div[@id='old-container']"></textarea>
        <div class="lx-inputrow">
          <button class="lx-btn lx-primary lx-bulk-go">Validate All</button>
          <button class="lx-btn lx-bulk-export lx-hidden">Copy Report</button>
        </div>
        <div class="lx-result lx-bulk-result"></div>
      </section>

      <section class="lx-tabpane lx-hidden" data-pane="heal">
        <p class="lx-hint">Paste a locator that no longer works — Locatrix finds the most similar elements on this page and suggests replacements. 100% local heuristics.</p>
        <div class="lx-inputrow">
          <input type="text" class="lx-input lx-heal-input" placeholder="e.g.  //button[@id='signin-old']" spellcheck="false">
          <button class="lx-btn lx-primary lx-heal-go">Suggest</button>
        </div>
        <div class="lx-result lx-heal-result"></div>
      </section>
    `;

    /* tab switching */
    drawerEl.querySelectorAll('.lx-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        drawerEl.querySelectorAll('.lx-tab').forEach((t) => t.classList.remove('lx-tab-active'));
        tab.classList.add('lx-tab-active');
        const name = tab.getAttribute('data-tab');
        drawerEl.querySelectorAll('.lx-tabpane').forEach((p) => {
          p.classList.toggle('lx-hidden', p.getAttribute('data-pane') !== name);
        });
      });
    });

    drawerEl.querySelector('.lx-drawer-close').addEventListener('click', close);

    /* ---- highlight tab ---- */
    const hlInput = drawerEl.querySelector('.lx-hl-input');
    const hlResult = drawerEl.querySelector('.lx-hl-result');
    const runHighlight = () => {
      const res = engine().findByLocator(hlInput.value);
      hlResult.innerHTML = '';
      if (res.error === 'empty') return;
      if (res.error === 'invalid') {
        hlResult.appendChild(el('div', 'lx-status lx-bad', '❌ Invalid locator syntax'));
        return;
      }
      const n = res.elements.length;
      if (n === 0) {
        hlResult.appendChild(el('div', 'lx-status lx-bad', `❌ 0 matches (${res.kind}) — not found on this page`));
      } else if (n === 1) {
        hlResult.appendChild(el('div', 'lx-status lx-good', `✅ 1 match (${res.kind}) — unique`));
      } else {
        hlResult.appendChild(el('div', 'lx-status lx-warn', `⚠ ${n} matches (${res.kind}) — not unique`));
      }
      flashElements(res.elements, n === 1 ? '#3ddc84' : '#ffb020');
    };
    drawerEl.querySelector('.lx-hl-go').addEventListener('click', runHighlight);
    hlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runHighlight(); });

    /* ---- bulk tab ---- */
    const bulkInput = drawerEl.querySelector('.lx-bulk-input');
    const bulkResult = drawerEl.querySelector('.lx-bulk-result');
    const bulkExport = drawerEl.querySelector('.lx-bulk-export');
    let lastReport = null;

    drawerEl.querySelector('.lx-bulk-go').addEventListener('click', () => {
      const lines = bulkInput.value.split('\n');
      const report = engine().validateBulk(lines);
      lastReport = report;
      bulkResult.innerHTML = '';
      if (!report.length) return;

      const okN = report.filter((r) => r.status === 'ok').length;
      const multiN = report.filter((r) => r.status === 'multiple').length;
      const badN = report.length - okN - multiN;

      const summary = el('div', 'lx-status',
        `Checked ${report.length} — ✅ ${okN} unique · ⚠ ${multiN} multiple · ❌ ${badN} broken/invalid`);
      summary.classList.add(badN ? 'lx-warn' : 'lx-good');
      bulkResult.appendChild(summary);

      const list = el('div', 'lx-bulk-list');
      for (const r of report) {
        const row = el('div', 'lx-bulk-row');
        const icon = r.status === 'ok' ? '✅' : r.status === 'multiple' ? '⚠' : '❌';
        const meta = r.status === 'ok' ? 'unique'
          : r.status === 'multiple' ? `${r.count} matches`
          : r.status === 'invalid' ? 'invalid syntax' : 'not found';
        row.innerHTML = `<span class="lx-bulk-ico">${icon}</span>
          <code class="lx-bulk-loc" title="Click to highlight"></code>
          <span class="lx-bulk-meta">${meta}</span>`;
        row.querySelector('.lx-bulk-loc').textContent = r.locator;
        row.querySelector('.lx-bulk-loc').addEventListener('click', () => {
          const res = engine().findByLocator(r.locator);
          if (res.elements.length) flashElements(res.elements, r.status === 'ok' ? '#3ddc84' : '#ffb020');
        });
        list.appendChild(row);
      }
      bulkResult.appendChild(list);
      bulkExport.classList.remove('lx-hidden');
    });

    bulkExport.addEventListener('click', async () => {
      if (!lastReport) return;
      const text = lastReport
        .map((r) => `${r.status.toUpperCase().padEnd(9)} ${String(r.count).padStart(3)}  ${r.locator}`)
        .join('\n');
      await copier().copyValue(host.shadowRoot, 'Report', text);
    });

    /* ---- heal tab ---- */
    const healInput = drawerEl.querySelector('.lx-heal-input');
    const healResult = drawerEl.querySelector('.lx-heal-result');
    const runHeal = () => {
      const loc = healInput.value.trim();
      healResult.innerHTML = '';
      if (!loc) return;

      const direct = engine().findByLocator(loc);
      if (direct.elements.length) {
        healResult.appendChild(el('div', 'lx-status lx-good',
          `This locator still works here — ${direct.elements.length} match(es).`));
        flashElements(direct.elements, '#3ddc84');
        return;
      }
      const suggestions = engine().suggestNearest(loc, 3);
      if (!suggestions.length) {
        healResult.appendChild(el('div', 'lx-status lx-bad',
          '❌ No similar element found on this page.'));
        return;
      }
      healResult.appendChild(el('div', 'lx-status lx-warn',
        `Broken here — ${suggestions.length} possible replacement(s):`));
      for (const s of suggestions) {
        if (!s.suggestion) continue;
        const card = el('div', 'lx-heal-card');
        const pct = Math.round(s.confidence * 100);
        card.innerHTML = `
          <div class="lx-heal-top">
            <span class="lx-heal-conf">${pct}% similar</span>
            <span class="lx-heal-prev"></span>
          </div>
          <div class="lx-heal-loc">
            <span class="lx-heal-type"></span>
            <code class="lx-heal-val" title="Click to highlight"></code>
            <button class="lx-btn lx-mini lx-heal-copy" title="Copy value">⧉</button>
          </div>`;
        card.querySelector('.lx-heal-prev').textContent = `<${s.tag}> ${s.preview}`;
        card.querySelector('.lx-heal-type').textContent = s.suggestion.type;
        card.querySelector('.lx-heal-val').textContent = s.suggestion.value;
        card.querySelector('.lx-heal-val').addEventListener('click', () => {
          flashElements([s.element], '#b07cff');
        });
        card.querySelector('.lx-heal-copy').addEventListener('click', () => {
          copier().copyValue(host.shadowRoot, s.suggestion.type, s.suggestion.value);
        });
        healResult.appendChild(card);
      }
    };
    drawerEl.querySelector('.lx-heal-go').addEventListener('click', runHeal);
    healInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runHeal(); });

    return drawerEl;
  }

  /* ---------------- public api ---------------- */

  function open(hostRef) {
    host = hostRef;
    if (!drawerEl) {
      build();
      const mount = host.shadowRoot.querySelector('.lx-root') || host.shadowRoot;
      mount.appendChild(drawerEl);
    }
    drawerEl.classList.add('lx-drawer-open');
  }

  function close() {
    if (drawerEl) drawerEl.classList.remove('lx-drawer-open');
    clearFlash();
  }

  function isOpen() {
    return !!(drawerEl && drawerEl.classList.contains('lx-drawer-open'));
  }

  function destroy() {
    clearFlash();
    if (drawerEl) { drawerEl.remove(); drawerEl = null; }
    host = null;
  }

  window.__LOCATRIX_TOOLS__ = { open, close, isOpen, destroy, flashElements };
})();
