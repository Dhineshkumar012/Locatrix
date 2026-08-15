/* Locatrix — background service worker
 * Owner: Dhinesh Kumar V
 * Handles: inspect-mode toggling, on-demand content-script injection,
 * restricted-page detection, per-tab state and keyboard command routing.
 * All processing is local. No network calls. No telemetry.
 */

'use strict';

const RESTRICTED_SCHEMES = [
  'chrome:', 'chrome-extension:', 'edge:', 'brave:', 'opera:', 'vivaldi:',
  'about:', 'moz-extension:', 'view-source:', 'devtools:', 'chrome-search:',
  'chrome-untrusted:', 'data:', 'blob:'
];

const RESTRICTED_HOSTS = [
  'chrome.google.com',
  'chromewebstore.google.com',
  'microsoftedge.microsoft.com',
  'addons.mozilla.org',
  'addons.opera.com'
];

/** Tabs where the content script is known to be injected. */
const injectedTabs = new Set();
/** Tabs where inspect mode is currently ON. */
const activeTabs = new Set();

function isRestrictedUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    if (RESTRICTED_SCHEMES.some((s) => u.protocol === s)) return true;
    if (RESTRICTED_HOSTS.some((h) => u.hostname === h)) return true;
    return false;
  } catch (_e) {
    return true;
  }
}

async function ensureInjected(tabId) {
  if (injectedTabs.has(tabId)) return true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'content/settings.js',
        'content/locator-engine.js',
        'content/copy-manager.js',
        'content/tools-drawer.js',
        'content/overlay.js'
      ]
    });
    injectedTabs.add(tabId);
    return true;
  } catch (_e) {
    return false;
  }
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_e) {
    return null;
  }
}

function setBadge(tabId, on) {
  try {
    chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#3ddc84' });
  } catch (_e) { /* tab may be gone */ }
}

async function toggleInspect(tab) {
  if (!tab || tab.id == null) return { ok: false, reason: 'no-tab' };
  if (isRestrictedUrl(tab.url)) return { ok: false, reason: 'restricted' };

  const injected = await ensureInjected(tab.id);
  if (!injected) return { ok: false, reason: 'inject-failed' };

  const turningOn = !activeTabs.has(tab.id);
  const res = await sendToTab(tab.id, {
    type: turningOn ? 'LOCATRIX_START' : 'LOCATRIX_STOP'
  });

  if (res && res.ok) {
    if (turningOn) activeTabs.add(tab.id);
    else activeTabs.delete(tab.id);
    setBadge(tab.id, turningOn);
    return { ok: true, active: turningOn };
  }
  // Content script did not answer (e.g. page reloaded) — reset and retry once.
  injectedTabs.delete(tab.id);
  activeTabs.delete(tab.id);
  const reinjected = await ensureInjected(tab.id);
  if (reinjected) {
    const retry = await sendToTab(tab.id, { type: 'LOCATRIX_START' });
    if (retry && retry.ok) {
      activeTabs.add(tab.id);
      setBadge(tab.id, true);
      return { ok: true, active: true };
    }
  }
  return { ok: false, reason: 'no-response' };
}

/* ---- Message hub (popup <-> background <-> content) ---- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case 'POPUP_TOGGLE_INSPECT': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        sendResponse(await toggleInspect(tabs[0]));
        break;
      }
      case 'POPUP_GET_STATE': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        sendResponse({
          ok: true,
          restricted: !tab || isRestrictedUrl(tab.url),
          active: !!(tab && activeTabs.has(tab.id)),
          incognito: !!(tab && tab.incognito)
        });
        break;
      }
      case 'POPUP_OPEN_TOOLS': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab || isRestrictedUrl(tab.url)) {
          sendResponse({ ok: false, reason: 'restricted' });
          break;
        }
        const injected = await ensureInjected(tab.id);
        if (!injected) { sendResponse({ ok: false, reason: 'inject-failed' }); break; }
        await sendToTab(tab.id, { type: 'LOCATRIX_OPEN_TOOLS' });
        sendResponse({ ok: true });
        break;
      }
      case 'CONTENT_STOPPED': {
        // Content script announced it exited (Esc key).
        if (sender.tab && sender.tab.id != null) {
          activeTabs.delete(sender.tab.id);
          setBadge(sender.tab.id, false);
        }
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, reason: 'unknown-message' });
    }
  })();
  return true; // async response
});

/* ---- Keyboard shortcut ---- */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-inspect') return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  await toggleInspect(tabs[0]);
});

/* ---- Tab lifecycle cleanup ---- */
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
  activeTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    injectedTabs.delete(tabId);
    activeTabs.delete(tabId);
    setBadge(tabId, false);
  }
});
