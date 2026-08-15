/* Locatrix — copy manager
 * Owner: Dhinesh Kumar V
 * Clipboard operations (single value / all values) + toast feedback.
 * Values-only output: framework-neutral, usable in any automation tool.
 */

'use strict';

(function () {
  if (window.__LOCATRIX_COPY__) return;

  let toastTimer = null;

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_e) {
      // Fallback for pages where the async clipboard is blocked.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (_e2) {
        return false;
      }
    }
  }

  function toast(shadowRoot, message, ok) {
    if (!shadowRoot) return;
    const mount = shadowRoot.querySelector('.lx-root') || shadowRoot;
    let el = mount.querySelector('.lx-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'lx-toast';
      mount.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('lx-toast-err', !ok);
    el.classList.add('lx-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('lx-toast-show'), 1400);
  }

  async function copyValue(shadowRoot, label, value) {
    const ok = await writeClipboard(value);
    toast(shadowRoot, ok ? `${label} copied ✓` : 'Copy blocked on this page', ok);
    return ok;
  }

  function formatAll(rows, context, format) {
    if (format === 'json') {
      const obj = {
        element: context ? {
          tag: context.tag,
          text: context.text,
          breadcrumb: context.breadcrumb
        } : undefined,
        locators: rows.map((r) => ({
          type: r.type,
          value: r.value,
          matches: r.count,
          unique: r.unique,
          stability: r.stability
        }))
      };
      return JSON.stringify(obj, null, 2);
    }
    // plain text: "type : value"
    const pad = Math.min(22, Math.max(...rows.map((r) => r.type.length)) + 1);
    return rows
      .map((r) => `${r.type.padEnd(pad)}: ${r.value}`)
      .join('\n');
  }

  async function copyAll(shadowRoot, rows, context, format) {
    if (!rows || !rows.length) return false;
    const text = formatAll(rows, context, format || 'text');
    const ok = await writeClipboard(text);
    toast(shadowRoot, ok ? `All ${rows.length} locators copied ✓` : 'Copy blocked on this page', ok);
    return ok;
  }

  window.__LOCATRIX_COPY__ = { copyValue, copyAll, toast, writeClipboard, formatAll };
})();
