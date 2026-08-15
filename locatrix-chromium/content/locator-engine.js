/* Locatrix — locator engine
 * Owner: Dhinesh Kumar V
 *
 * Generates every locator strategy for a DOM element, validates each one
 * against the live document (match count) and assigns a stability score.
 * Framework-neutral: produces raw locator VALUES usable in any GUI
 * automation tool (Selenium, Playwright, Cypress, Robot, Katalon, UFT, ...).
 *
 * Runs 100% locally. No network access.
 */

'use strict';

(function () {
  if (window.__LOCATRIX_ENGINE__) return;

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  const TEST_ATTRS = [
    'data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-qa-id',
    'data-cy', 'data-automation-id', 'data-automation', 'data-auto-id',
    'data-tid', 'data-e2e'
  ];

  const STABILITY = Object.freeze({ HIGH: 'HIGH', MED: 'MED', LOW: 'LOW' });

  // Heuristics for auto-generated / dynamic identifiers, e.g. "user-4821-row",
  // "css-1q2w3e", "ember1234", ":r5:", GUID-ish blobs.
  const DYNAMIC_PATTERNS = [
    /\d{3,}/,
    /^[a-f0-9]{8}-[a-f0-9]{4}/i,
    /^(ember|react|vue|ng|mui|css|sc|chakra|radix|headlessui)[-_:]/i,
    /^:r[0-9a-z]+:$/i,
    /[_-][a-z0-9]{5,}$/i
  ];

  const MAX_CLASSES_IN_SELECTOR = 3;
  const MAX_TEXT_LEN = 60;

  /* ------------------------------------------------------------------ *
   * Small utilities
   * ------------------------------------------------------------------ */

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  function xpathLiteral(text) {
    if (!text.includes("'")) return `'${text}'`;
    if (!text.includes('"')) return `"${text}"`;
    // Mixed quotes -> concat()
    const parts = text.split("'").map((p) => `'${p}'`).join(`, "'", `);
    return `concat(${parts})`;
  }

  function looksDynamic(value) {
    if (!value) return false;
    return DYNAMIC_PATTERNS.some((re) => re.test(value));
  }

  function cleanText(el) {
    const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return t.length > 0 && t.length <= MAX_TEXT_LEN ? t : '';
  }

  function directText(el) {
    // Text belonging to the element itself (not descendants).
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) out += node.textContent;
    }
    return out.trim().replace(/\s+/g, ' ');
  }

  /* ------------------------------------------------------------------ *
   * Validation — count matches inside a root (document / shadow / frame doc)
   * ------------------------------------------------------------------ */

  function countCss(selector, root) {
    try {
      return (root || document).querySelectorAll(selector).length;
    } catch (_e) {
      return -1; // invalid selector
    }
  }

  function countXPath(xpath, root) {
    try {
      const doc = (root && root.ownerDocument) || (root && root.nodeType === 9 ? root : document);
      const ctx = root && root.nodeType !== 9 ? root : doc;
      const res = doc.evaluate(xpath, ctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return res.snapshotLength;
    } catch (_e) {
      return -1;
    }
  }

  function resolveCss(selector, root) {
    try {
      return Array.from((root || document).querySelectorAll(selector));
    } catch (_e) {
      return [];
    }
  }

  function resolveXPath(xpath, root) {
    try {
      const doc = (root && root.ownerDocument) || (root && root.nodeType === 9 ? root : document);
      const ctx = root && root.nodeType !== 9 ? root : doc;
      const res = doc.evaluate(xpath, ctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const out = [];
      for (let i = 0; i < res.snapshotLength; i++) out.push(res.snapshotItem(i));
      return out;
    } catch (_e) {
      return [];
    }
  }

  /* ------------------------------------------------------------------ *
   * Root context — shadow DOM / iframe awareness
   * ------------------------------------------------------------------ */

  function getRoot(el) {
    const root = el.getRootNode ? el.getRootNode() : document;
    return root;
  }

  /** Builds the readable context chain: page → iframe#x → shadow-root(tag) → el */
  function contextChain(el) {
    const chain = [];
    let node = el;
    let guard = 0;
    while (node && guard++ < 20) {
      const root = node.getRootNode ? node.getRootNode() : document;
      if (root instanceof ShadowRoot) {
        const host = root.host;
        chain.unshift(`shadow-root(${host.tagName.toLowerCase()})`);
        node = host;
        continue;
      }
      // Document level — check if inside an iframe (same-origin only).
      const win = root.defaultView;
      if (win && win !== win.top) {
        try {
          const frameEl = win.frameElement;
          if (frameEl) {
            const label = frameEl.id
              ? `iframe#${frameEl.id}`
              : (frameEl.name ? `iframe[name=${frameEl.name}]` : 'iframe');
            chain.unshift(label);
            node = frameEl;
            continue;
          }
        } catch (_e) { /* cross-origin */ }
        chain.unshift('iframe(cross-origin)');
        break;
      }
      break;
    }
    chain.unshift('page');
    return chain;
  }

  /* ------------------------------------------------------------------ *
   * CSS selector builders
   * ------------------------------------------------------------------ */

  function cssByAttr(el, attr) {
    const v = el.getAttribute(attr);
    if (v == null || v === '') return null;
    return `${el.tagName.toLowerCase()}[${attr}="${v.replace(/"/g, '\\"')}"]`;
  }

  function stableClasses(el) {
    return Array.from(el.classList)
      .filter((c) => c && !looksDynamic(c))
      .slice(0, MAX_CLASSES_IN_SELECTOR);
  }

  function cssByClass(el) {
    const cls = stableClasses(el);
    if (!cls.length) return null;
    return `${el.tagName.toLowerCase()}.${cls.map(cssEscape).join('.')}`;
  }

  function nthOfTypePath(el, root) {
    // Structural fallback path: body > div:nth-of-type(2) > form > button
    const parts = [];
    let node = el;
    let guard = 0;
    while (node && node.nodeType === 1 && guard++ < 40) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') { parts.unshift(tag); break; }
      const parent = node.parentElement || (node.parentNode instanceof ShadowRoot ? null : null);
      let seg = tag;
      if (node.id && !looksDynamic(node.id)) {
        parts.unshift(`${tag}#${cssEscape(node.id)}`);
        break;
      }
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) seg += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(seg);
      if (!parent) break;
      node = parent;
    }
    const sel = parts.join(' > ');
    // verify inside root
    if (countCss(sel, root) >= 1) return sel;
    return null;
  }

  /** Shortest unique CSS: try increasingly specific candidates. */
  function shortestUniqueCss(el, root) {
    const tag = el.tagName.toLowerCase();
    const candidates = [];

    if (el.id && !looksDynamic(el.id)) candidates.push(`#${cssEscape(el.id)}`);
    for (const attr of TEST_ATTRS) {
      const c = cssByAttr(el, attr);
      if (c) candidates.push(c);
    }
    for (const attr of ['name', 'aria-label', 'placeholder', 'title', 'alt', 'role', 'type', 'href']) {
      const c = cssByAttr(el, attr);
      if (c && !looksDynamic(el.getAttribute(attr))) candidates.push(c);
    }
    const byClass = cssByClass(el);
    if (byClass) candidates.push(byClass);

    for (const cand of candidates) {
      if (countCss(cand, root) === 1) return cand;
    }
    // Try parent-anchored variants
    const parent = el.parentElement;
    if (parent) {
      let anchor = null;
      if (parent.id && !looksDynamic(parent.id)) anchor = `#${cssEscape(parent.id)}`;
      else {
        const pc = stableClasses(parent);
        if (pc.length) anchor = `${parent.tagName.toLowerCase()}.${pc.map(cssEscape).join('.')}`;
      }
      if (anchor) {
        for (const cand of [byClass, tag]) {
          if (!cand) continue;
          const sel = `${anchor} > ${cand}`;
          if (countCss(sel, root) === 1) return sel;
          const desc = `${anchor} ${cand}`;
          if (countCss(desc, root) === 1) return desc;
        }
      }
    }
    return nthOfTypePath(el, root);
  }

  /* ------------------------------------------------------------------ *
   * XPath builders
   * ------------------------------------------------------------------ */

  function absoluteXPath(el) {
    const segs = [];
    let node = el;
    let guard = 0;
    while (node && node.nodeType === 1 && guard++ < 60) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      let idx = 1;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) idx = same.indexOf(node) + 1;
        segs.unshift(same.length > 1 ? `${tag}[${idx}]` : tag);
      } else {
        segs.unshift(tag);
      }
      node = parent;
    }
    return '/' + segs.join('/');
  }

  function relativeXPath(el, root) {
    const tag = el.tagName.toLowerCase();
    const tries = [];

    if (el.id && !looksDynamic(el.id)) tries.push(`//${tag}[@id=${xpathLiteral(el.id)}]`);
    for (const attr of TEST_ATTRS) {
      const v = el.getAttribute(attr);
      if (v) tries.push(`//${tag}[@${attr}=${xpathLiteral(v)}]`);
    }
    for (const attr of ['name', 'aria-label', 'placeholder', 'title', 'type']) {
      const v = el.getAttribute(attr);
      if (v && !looksDynamic(v)) tries.push(`//${tag}[@${attr}=${xpathLiteral(v)}]`);
    }
    const dt = directText(el);
    if (dt && dt.length <= MAX_TEXT_LEN) {
      tries.push(`//${tag}[normalize-space()=${xpathLiteral(dt)}]`);
    }
    // attribute combos
    const nm = el.getAttribute('name');
    const tp = el.getAttribute('type');
    if (nm && tp) tries.push(`//${tag}[@name=${xpathLiteral(nm)} and @type=${xpathLiteral(tp)}]`);

    for (const t of tries) {
      if (countXPath(t, root) === 1) return t;
    }

    // Anchor to nearest stable ancestor
    let anc = el.parentElement;
    let guard = 0;
    while (anc && guard++ < 15) {
      if (anc.id && !looksDynamic(anc.id)) {
        const base = `//*[@id=${xpathLiteral(anc.id)}]`;
        const rel = relativeStepsBetween(anc, el);
        if (rel) {
          const xp = base + rel;
          if (countXPath(xp, root) === 1) return xp;
        }
        break;
      }
      anc = anc.parentElement;
    }
    return absoluteXPath(el);
  }

  function relativeStepsBetween(ancestor, el) {
    const steps = [];
    let node = el;
    let guard = 0;
    while (node && node !== ancestor && guard++ < 30) {
      const parent = node.parentElement;
      if (!parent) return null;
      const tag = node.tagName.toLowerCase();
      const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      steps.unshift(same.length > 1 ? `${tag}[${same.indexOf(node) + 1}]` : tag);
      node = parent;
    }
    if (node !== ancestor) return null;
    return '/' + steps.join('/');
  }

  function textXPath(el, root) {
    const dt = directText(el);
    const full = cleanText(el);
    const tag = el.tagName.toLowerCase();
    const out = [];
    if (dt && dt.length <= MAX_TEXT_LEN) {
      out.push(`//${tag}[text()=${xpathLiteral(dt)}]`);
      out.push(`//${tag}[normalize-space()=${xpathLiteral(dt)}]`);
    } else if (full) {
      out.push(`//${tag}[contains(normalize-space(),${xpathLiteral(full.slice(0, 30).trim())})]`);
    }
    for (const xp of out) {
      const n = countXPath(xp, root);
      if (n >= 1) return { xpath: xp, count: n };
    }
    return null;
  }

  function containsXPath(el, root) {
    const tag = el.tagName.toLowerCase();
    // Prefer a contains() on a semi-stable attribute; useful for dynamic ids.
    const candidates = [];
    if (el.id && looksDynamic(el.id)) {
      // Stable tokens = the parts of the id that are not digits/hashes,
      // e.g. "user-4821-row" -> ["user", "row"].
      const tokens = el.id.split(/[\d]+|[-_:]+/).filter((t) => t.length >= 3);
      if (tokens.length >= 2) {
        candidates.push(
          `//${tag}[contains(@id,${xpathLiteral(tokens[0])}) and contains(@id,${xpathLiteral(tokens[tokens.length - 1])})]`
        );
      }
      if (tokens.length >= 1) {
        candidates.push(`//${tag}[contains(@id,${xpathLiteral(tokens[0])})]`);
        const prefix = el.id.slice(0, el.id.indexOf(tokens[0]) + tokens[0].length);
        candidates.push(`//${tag}[starts-with(@id,${xpathLiteral(prefix)})]`);
      }
    }
    const cls = stableClasses(el);
    if (cls.length) candidates.push(`//${tag}[contains(@class,${xpathLiteral(cls[0])})]`);
    for (const xp of candidates) {
      const n = countXPath(xp, root);
      if (n >= 1) return { xpath: xp, count: n };
    }
    return null;
  }

  function anchoredXPath(el, root) {
    // "input next to label 'Email'" style — nearest label/heading anchor.
    const tag = el.tagName.toLowerCase();
    if (!/^(input|select|textarea|button)$/i.test(tag)) return null;

    // 1) label[for=id]
    if (el.id) {
      const lbl = (root.nodeType === 9 ? root : el.ownerDocument)
        .querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (lbl) {
        const lt = cleanText(lbl);
        if (lt) {
          const xp = `//label[normalize-space()=${xpathLiteral(lt)}]/following::${tag}[1]`;
          if (countXPath(xp, root) === 1) return xp;
        }
      }
    }
    // 2) preceding visible label/span text within the same form row
    let prev = el.previousElementSibling;
    let guard = 0;
    while (prev && guard++ < 4) {
      const pt = cleanText(prev);
      if (pt && /^(label|span|div|p|td|th)$/i.test(prev.tagName)) {
        const xp = `//*[normalize-space()=${xpathLiteral(pt)}]/following::${tag}[1]`;
        if (countXPath(xp, root) === 1) return xp;
      }
      prev = prev.previousElementSibling;
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Table-aware locator (bonus for data grids)
   * ------------------------------------------------------------------ */

  function tableXPath(el, root) {
    const cell = el.closest && el.closest('td,th');
    if (!cell) return null;
    const row = cell.closest('tr');
    const table = cell.closest('table');
    if (!row || !table) return null;

    const cells = Array.from(row.children).filter((c) => /^(td|th)$/i.test(c.tagName));
    const colIdx = cells.indexOf(cell) + 1;
    if (colIdx < 1) return null;

    // Row anchored by its first non-empty cell text
    const anchorCell = cells.find((c) => cleanText(c));
    if (!anchorCell || anchorCell === cell) {
      const ct = cleanText(cell);
      if (ct) {
        const xp = `//tr[td[normalize-space()=${xpathLiteral(ct)}] | th[normalize-space()=${xpathLiteral(ct)}]]`;
        if (countXPath(xp, root) >= 1) return { xpath: xp, note: 'row by cell text' };
      }
      return null;
    }
    const at = cleanText(anchorCell);
    const xp = `//tr[td[normalize-space()=${xpathLiteral(at)}]]/td[${colIdx}]`;
    const n = countXPath(xp, root);
    if (n >= 1) return { xpath: xp, note: `cell by row text + column ${colIdx}` };
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Scoring
   * ------------------------------------------------------------------ */

  function scoreFor(type, value, unique) {
    if (type.startsWith('data-') || type === 'aria-label') return STABILITY.HIGH;
    if (type === 'id') return looksDynamic(value) ? STABILITY.LOW : (unique ? STABILITY.HIGH : STABILITY.MED);
    if (type === 'name') return unique ? STABILITY.HIGH : STABILITY.MED;
    if (type === 'linkText' || type === 'partialLinkText') return STABILITY.MED;
    if (type === 'cssSelector' || type === 'css (attribute)') return unique ? STABILITY.MED : STABILITY.LOW;
    if (type === 'css (class)') return STABILITY.MED;
    if (type === 'css (structural)') return STABILITY.LOW;
    if (type === 'xpath') return unique ? STABILITY.MED : STABILITY.LOW;
    if (type === 'xpath (text)') return STABILITY.MED;
    if (type === 'xpath (anchored)') return STABILITY.MED;
    if (type === 'xpath (contains)') return STABILITY.MED;
    if (type === 'xpath (table)') return STABILITY.MED;
    if (type === 'xpath (absolute)') return STABILITY.LOW;
    if (type === 'class') return STABILITY.MED;
    if (type === 'tag') return STABILITY.LOW;
    return STABILITY.MED;
  }

  const ORDER = { HIGH: 0, MED: 1, LOW: 2 };

  /* ------------------------------------------------------------------ *
   * Main entry — build the full locator report for an element
   * ------------------------------------------------------------------ */

  function analyze(el) {
    if (!el || el.nodeType !== 1) return null;
    const root = getRoot(el);
    const rows = [];
    const seen = new Set();

    function push(type, value, kind /* 'css' | 'xpath' | 'raw' */, extra) {
      if (value == null || value === '') return;
      const key = type + '\u0000' + value;
      if (seen.has(key)) return;
      seen.add(key);

      let count = -1;
      if (kind === 'css') count = countCss(value, root);
      else if (kind === 'xpath') count = countXPath(value, root);
      else if (kind === 'raw-id') count = countCss(`[id="${String(value).replace(/"/g, '\\"')}"]`, root);
      else if (kind === 'raw-name') count = countCss(`[name="${String(value).replace(/"/g, '\\"')}"]`, root);
      else if (kind === 'raw-class') {
        const cls = String(value).trim().split(/\s+/).map(cssEscape).join('.');
        count = cls ? countCss('.' + cls, root) : -1;
      } else if (kind === 'raw-tag') count = countCss(String(value), root);
      else if (kind === 'raw-linktext') {
        count = resolveXPath(`//a[normalize-space()=${xpathLiteral(String(value))}]`, root).length;
      } else if (kind === 'raw-plinktext') {
        count = resolveXPath(`//a[contains(normalize-space(),${xpathLiteral(String(value))})]`, root).length;
      }

      const unique = count === 1;
      rows.push({
        type,
        value: String(value),
        count,
        unique,
        stability: scoreFor(type, String(value), unique),
        dynamic: (type === 'id' || type === 'name') && looksDynamic(String(value)),
        note: (extra && extra.note) || ''
      });
    }

    const tag = el.tagName.toLowerCase();

    /* --- 1. Test attributes (highest priority) --- */
    function pushAttrValue(attrName, attrValue) {
      const key = attrName + '\u0000' + attrValue;
      if (seen.has(key)) return;
      seen.add(key);
      const count = countCss(`[${attrName}="${attrValue.replace(/"/g, '\\"')}"]`, root);
      const unique = count === 1;
      rows.push({
        type: attrName,
        value: attrValue,
        count,
        unique,
        stability: scoreFor(attrName, attrValue, unique),
        dynamic: false,
        note: ''
      });
    }

    for (const attr of TEST_ATTRS) {
      const v = el.getAttribute(attr);
      if (v) pushAttrValue(attr, v);
    }
    const aria = el.getAttribute('aria-label');
    if (aria) pushAttrValue('aria-label', aria);

    /* --- 2. Core Selenium locator values --- */
    if (el.id) push('id', el.id, 'raw-id');
    const nameAttr = el.getAttribute('name');
    if (nameAttr) push('name', nameAttr, 'raw-name');
    if (el.classList.length) push('class', Array.from(el.classList).join(' '), 'raw-class');
    push('tag', tag, 'raw-tag');

    if (tag === 'a') {
      const lt = cleanText(el);
      if (lt) {
        push('linkText', lt, 'raw-linktext');
        const words = lt.split(' ');
        if (words.length > 2) push('partialLinkText', words.slice(0, 2).join(' '), 'raw-plinktext');
      }
    }

    /* --- 3. CSS selectors --- */
    const uniqueCss = shortestUniqueCss(el, root);
    if (uniqueCss) push('cssSelector', uniqueCss, 'css');
    const byClassSel = cssByClass(el);
    if (byClassSel && byClassSel !== uniqueCss) push('css (class)', byClassSel, 'css');
    for (const attr of ['name', 'placeholder', 'type', 'role', 'title']) {
      const c = cssByAttr(el, attr);
      if (c && c !== uniqueCss) { push('css (attribute)', c, 'css'); break; }
    }
    const structural = nthOfTypePath(el, root);
    if (structural && structural !== uniqueCss) {
      push('css (structural)', structural, 'css', { note: 'auto-generated, less stable' });
    }

    /* --- 4. XPath family --- */
    const relXp = relativeXPath(el, root);
    if (relXp) push('xpath', relXp, 'xpath');

    const txtXp = textXPath(el, root);
    if (txtXp && txtXp.xpath !== relXp) push('xpath (text)', txtXp.xpath, 'xpath');

    const anchXp = anchoredXPath(el, root);
    if (anchXp && anchXp !== relXp) push('xpath (anchored)', anchXp, 'xpath');

    const contXp = containsXPath(el, root);
    if (contXp && contXp.xpath !== relXp) {
      push('xpath (contains)', contXp.xpath, 'xpath', { note: 'dynamic-id safe' });
    }

    const tblXp = tableXPath(el, root);
    if (tblXp) push('xpath (table)', tblXp.xpath, 'xpath', { note: tblXp.note });

    const absXp = absoluteXPath(el);
    if (absXp && absXp !== relXp) {
      push('xpath (absolute)', absXp, 'xpath', { note: 'auto-generated, less stable' });
    }

    /* --- sort: stability then uniqueness --- */
    rows.sort((a, b) => {
      const s = ORDER[a.stability] - ORDER[b.stability];
      if (s !== 0) return s;
      if (a.unique !== b.unique) return a.unique ? -1 : 1;
      return 0;
    });

    /* --- element context --- */
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const visible = !!(rect.width || rect.height) &&
      style.visibility !== 'hidden' && style.display !== 'none';
    const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
    const checked = (typeof el.checked === 'boolean') ? el.checked : null;

    const breadcrumb = [];
    let bNode = el;
    let bGuard = 0;
    while (bNode && bNode.nodeType === 1 && bGuard++ < 6) {
      let part = bNode.tagName.toLowerCase();
      if (bNode.id && !looksDynamic(bNode.id)) part += `#${bNode.id}`;
      else {
        const sc = stableClasses(bNode);
        if (sc.length) part += `.${sc[0]}`;
      }
      breadcrumb.unshift(part);
      bNode = bNode.parentElement;
    }

    const dupId = el.id ? countCss(`[id="${el.id.replace(/"/g, '\\"')}"]`, root) > 1 : false;

    return {
      rows,
      context: {
        tag,
        text: cleanText(el).slice(0, 80),
        value: (el.value != null && String(el.value).length) ? String(el.value).slice(0, 60) : '',
        rect: {
          x: Math.round(rect.x), y: Math.round(rect.y),
          w: Math.round(rect.width), h: Math.round(rect.height)
        },
        visible,
        disabled,
        checked,
        breadcrumb: breadcrumb.join(' > '),
        chain: contextChain(el),
        duplicateId: dupId
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Reverse lookup — highlight-by-locator support
   * ------------------------------------------------------------------ */

  function detectKind(locator) {
    const s = locator.trim();
    if (/^\/\/|^\/|^\(\s*\/\//.test(s)) return 'xpath';
    if (/^\.\//.test(s)) return 'xpath';
    return 'css';
  }

  function findByLocator(locator) {
    const s = (locator || '').trim();
    if (!s) return { kind: null, elements: [], error: 'empty' };
    const kind = detectKind(s);
    let elements = [];
    if (kind === 'xpath') {
      elements = resolveXPath(s, document);
      if (!elements.length) {
        // maybe it is actually a valid css that starts oddly — try css too
        const alt = resolveCss(s, document);
        if (alt.length) return { kind: 'css', elements: alt };
      }
      const valid = countXPath(s, document) >= 0;
      return { kind, elements, error: valid ? null : 'invalid' };
    }
    elements = resolveCss(s, document);
    const valid = countCss(s, document) >= 0;
    return { kind, elements, error: valid ? null : 'invalid' };
  }

  /* ------------------------------------------------------------------ *
   * Nearest-match suggestion — mini self-healing (local heuristics)
   * ------------------------------------------------------------------ */

  function parseIntent(locator) {
    const s = locator.trim();
    const intent = { tag: null, attrs: {}, text: null, idPart: null, classes: [] };

    // XPath forms
    let m = s.match(/^\/\/([a-zA-Z][\w-]*|\*)/);
    if (m) {
      intent.tag = m[1] === '*' ? null : m[1].toLowerCase();
      const attrRe = /@([\w-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g;
      let am;
      while ((am = attrRe.exec(s))) intent.attrs[am[1]] = am[2] != null ? am[2] : am[3];
      const cm = s.match(/contains\(\s*@([\w-]+)\s*,\s*(?:'([^']*)'|"([^"]*)")\s*\)/);
      if (cm) intent.attrs[cm[1]] = (cm[2] != null ? cm[2] : cm[3]);
      const tm = s.match(/(?:text\(\)|normalize-space\(\))\s*=\s*(?:'([^']*)'|"([^"]*)")/);
      if (tm) intent.text = tm[1] != null ? tm[1] : tm[2];
      return intent;
    }
    // CSS forms
    m = s.match(/^([a-zA-Z][\w-]*)/);
    if (m) intent.tag = m[1].toLowerCase();
    const idM = s.match(/#([\w-]+)/);
    if (idM) intent.idPart = idM[1];
    const clsRe = /\.([\w-]+)/g;
    let cm2;
    while ((cm2 = clsRe.exec(s))) intent.classes.push(cm2[1]);
    const attrRe2 = /\[([\w-]+)\s*[*^$|~]?=\s*["']?([^\]"']*)["']?\]/g;
    let am2;
    while ((am2 = attrRe2.exec(s))) intent.attrs[am2[1]] = am2[2];
    return intent;
  }

  function similarity(a, b) {
    // Cheap normalized similarity between two strings (token overlap + prefix).
    if (!a || !b) return 0;
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;
    const ta = new Set(a.split(/[\s_-]+/).filter(Boolean));
    const tb = new Set(b.split(/[\s_-]+/).filter(Boolean));
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    return inter / Math.max(ta.size, tb.size);
  }

  function suggestNearest(brokenLocator, limit) {
    const intent = parseIntent(brokenLocator);
    const max = limit || 3;
    const candidates = [];

    const pool = intent.tag
      ? document.getElementsByTagName(intent.tag)
      : document.querySelectorAll('a,button,input,select,textarea,[role],[data-testid],[id]');

    const attrEntries = Object.entries(intent.attrs);

    for (const el of pool) {
      if (candidates.length > 4000) break;
      let score = 0;
      let signals = 0;

      if (intent.idPart) {
        signals++;
        score += similarity(el.id || '', intent.idPart) * 3;
      }
      for (const [attr, val] of attrEntries) {
        signals++;
        const actual = attr === 'id' ? el.id : el.getAttribute(attr);
        score += similarity(actual || '', val) * (attr.startsWith('data-') ? 3 : 2);
        // also check the same value appearing under any test attribute
        for (const ta of TEST_ATTRS) {
          const tv = el.getAttribute(ta);
          if (tv && similarity(tv, val) > 0.7) score += 1.5;
        }
      }
      if (intent.text) {
        signals++;
        score += similarity(cleanText(el), intent.text) * 3;
      }
      for (const cls of intent.classes) {
        signals++;
        let best = 0;
        for (const c of el.classList) best = Math.max(best, similarity(c, cls));
        score += best * 1.5;
      }
      if (!signals) continue;
      const norm = score / signals;
      if (norm > 0.25) candidates.push({ el, score: norm });
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, max);
    return top.map((c) => {
      const report = analyze(c.el);
      const best = report && report.rows.find((r) => r.unique) || (report && report.rows[0]);
      return {
        confidence: Math.min(0.99, c.score),
        element: c.el,
        tag: c.el.tagName.toLowerCase(),
        preview: cleanText(c.el).slice(0, 50) || (c.el.id ? `#${c.el.id}` : c.el.tagName.toLowerCase()),
        suggestion: best ? { type: best.type, value: best.value } : null
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * Bulk validation
   * ------------------------------------------------------------------ */

  function validateBulk(lines) {
    const out = [];
    for (const raw of lines) {
      const loc = raw.trim();
      if (!loc) continue;
      const res = findByLocator(loc);
      out.push({
        locator: loc,
        kind: res.kind,
        count: res.error === 'invalid' ? -1 : res.elements.length,
        status: res.error === 'invalid'
          ? 'invalid'
          : (res.elements.length === 1 ? 'ok' : (res.elements.length > 1 ? 'multiple' : 'broken'))
      });
    }
    return out;
  }

  window.__LOCATRIX_ENGINE__ = {
    analyze,
    findByLocator,
    suggestNearest,
    validateBulk,
    looksDynamic
  };
})();
