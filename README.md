# 🔍 Locatrix

**Locator inspector for test automation — hover any element, get every locator value instantly.**

Owner: **Dhinesh Kumar V** · Version 1.0.0 · 100% local — no data ever leaves your browser.

---

## What it does

| Feature | Description |
|---|---|
| **Inspect mode** | Toggle on → hover any element → floating panel shows ALL locator values at once |
| **Full locator coverage** | `data-testid` / `data-qa` / `data-cy` / `aria-label` (ranked on top), id, name, class, tag, linkText, partialLinkText, CSS variants (unique / class / attribute / structural), XPath variants (relative, text, anchored-to-label, contains for dynamic ids, table-aware, absolute) |
| **Uniqueness check** | Every value is live-validated: ✅ unique · ⚠ ×N matches · ❌ not found |
| **Stability ranking** | HIGH / MED / LOW badges — dynamic/auto-generated values are flagged |
| **Values only** | Raw locator values, framework-neutral — paste into Selenium, Playwright, Cypress, Robot Framework, Katalon, UFT, WebdriverIO, anything |
| **Click to pin** | Freeze the panel, scroll and copy safely; click again to unpin |
| **Copy** | Per-row copy + Copy All (plain text or JSON) with toast feedback |
| **Element context** | Size/position, visible/disabled/checked state, DOM breadcrumb, shadow-DOM / iframe context chain, duplicate-id warning |
| **🧰 Locator Tools** | **Highlight** — paste any CSS/XPath, matches flash on the page with count · **Bulk Validate** — paste your locator list, get a ✅/⚠/❌ health report with copyable summary · **Nearest Match** — paste a broken locator, get ranked replacement suggestions (local heuristics) |
| **Themes** | Transparent dark / transparent light / auto (follows OS), opacity slider, custom highlight color |
| **Panel** | Draggable, resizable, remembers position, auto-flips near screen edges |
| **Shortcut** | `Ctrl+Shift+X` (`Cmd+Shift+X` on Mac) toggles inspect mode · `Esc` exits · `Alt`+hover drills into stacked elements |

---

## Install

### Chrome / Edge / Brave / Opera / Vivaldi (any Chromium browser)

1. Unzip the package (or use the `locatrix-chromium` folder directly).
2. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
3. Turn ON **Developer mode** (toggle in the corner).
4. Click **Load unpacked** and select the `locatrix-chromium` folder.
5. Pin Locatrix to the toolbar (puzzle icon → pin).

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `locatrix-firefox/manifest.json`.

> Temporary add-ons unload when Firefox closes. For a permanent install, the
> extension must be signed via [addons.mozilla.org](https://addons.mozilla.org)
> (free) — upload the `locatrix-firefox` folder as a zip.

### Safari (macOS)

Safari requires converting the extension into a Mac app (one-time, needs Xcode):

```bash
xcrun safari-web-extension-converter /path/to/locatrix-chromium --app-name Locatrix
```

Then enable it via Safari → Settings → Extensions. Distribution outside your
own Mac requires an Apple Developer account.

---

## Using it in Private / Incognito windows

Browsers block ALL extensions in private windows until you allow them manually
(this is a browser security rule — it cannot be bypassed by any extension):

- **Chrome / Edge / Brave / Opera:** extensions page → Locatrix → **Details** → enable **Allow in Incognito / InPrivate**.
- **Firefox:** `about:addons` → Locatrix → **Run in Private Windows: Allow**.

Locatrix shows a reminder in its popup when it detects a private window.

---

## Quick start

1. Open any normal website (or the included `test-page.html`).
2. Click the Locatrix icon → **Start Inspecting** (or press `Ctrl+Shift+X`).
3. Hover elements — the panel follows and updates live.
4. **Click** an element to pin it. Copy any value with ⧉, or **Copy All**.
5. Press **Esc** to exit.
6. Open **🧰 Locator Tools** for paste-based workflows:
   - **Highlight** — verify a locator visually before using it in a test
   - **Bulk Validate** — paste your Page-Object locator list after a deployment; broken ones show ❌
   - **Nearest Match** — paste a locator that broke; get the closest replacement candidates with confidence %

---

## Notes & limitations

- Browser-internal pages (`chrome://…`, extension stores) are protected by the
  browser — Locatrix shows a friendly notice instead of failing.
- Cross-origin iframes cannot be inspected from the parent page (browser
  security boundary). Same-origin iframes and open shadow roots are supported
  and shown in the context chain.
- On pages with a strict clipboard policy, Locatrix automatically falls back
  to a secondary copy method.

## Privacy

Locatrix performs **all** analysis inside your browser. It makes **zero**
network requests, contains no analytics or telemetry, and stores only your own
preferences (theme, opacity, panel position) in local extension storage.

Permissions used: `activeTab` (access the current tab only when you invoke
Locatrix), `scripting` (inject the inspector on demand), `storage` (save your
preferences).

---

© Dhinesh Kumar V — Locatrix v1.0.0
