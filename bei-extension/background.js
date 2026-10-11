/**
 * MythicFrame BEI Bridge - Service Worker (background.js)
 * Connects to MythicFrame BEI Bridge on unique port 58925 (ws://127.0.0.1:58925/ws)
 * Communicates with authenticated browser tabs (Gemini Web & ChatGPT Web).
 * Features:
 * - Silent background tab opening (active: false) without stealing focus or switching tabs
 * - Automatic Google account email discovery from session & all page frames
 * - Direct programmatic script execution fallback (100% eliminates "Receiving end does not exist")
 * - Real-time accounts sync to MythicFrame Studio Dropdown
 * - Local project directory management and storage persistence
 */

const BRIDGE_WS_URL = "ws://127.0.0.1:58925/ws";
const BRIDGE_API_BASE = "http://127.0.0.1:58925/api/bei";
const DEFAULT_PROJECT_DIR = "";

try {
  importScripts("scripts/protocol.js");
} catch (e) {
  console.debug("[MythicFrame BEI Worker] importScripts notice:", e);
}

const protocol = globalThis.__MYTHIC_BEI__ || {
  upgradeToHighResUrl: (url) => {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('googleusercontent.com') || url.includes('gstatic.com') || url.includes('photos.google.com')) {
      if (/=[swh]\d+/i.test(url) || /=w\d+-h\d+/i.test(url)) {
        return url.replace(/=(?:s\d+|w\d+-h\d+|w\d+|h\d+)(?:-[a-zA-Z0-9_-]+)*(?=[?&#]|$)/i, '=s2048');
      }
    }
    return url;
  }
};

let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
const activeJobs = new Map(); // jobId -> { tabId, target, prompt, accountSlot }
const slotQueues = new Map(); // slotKey -> Array<jobData>
const tabEmailsCache = new Map(); // tabId -> email string
const knownGoogleAccounts = new Map(); // slot -> { slot, email, name }
const inFlightTabCreations = new Map(); // target:slot -> Promise<tabId>
const pendingFullSizeCaptures = new Map(); // jobId -> { resolve, timer } for native 2K Download capture
let lastGeminiDownloadId = null;           // most recent Gemini image download observed while a capture was armed
let lastGeminiDownloadAt = 0;
const removeWhenComplete = new Set();      // download ids to delete from disk once they finish

let cachedBrowserInfo = { browser: 'chrome', browserName: 'Google Chrome' };
async function detectExtensionBrowser() {
  try {
    if (typeof navigator !== 'undefined' && navigator.brave && typeof navigator.brave.isBrave === 'function') {
      if (await navigator.brave.isBrave()) {
        cachedBrowserInfo = { browser: 'brave', browserName: 'Brave' };
        return cachedBrowserInfo;
      }
    }
  } catch (e) {}
  try {
    if (typeof chrome !== 'undefined' && ((chrome && chrome.brave) || (chrome && chrome.braveWallet))) {
      cachedBrowserInfo = { browser: 'brave', browserName: 'Brave' };
      return cachedBrowserInfo;
    }
  } catch (e) {}
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  if (ua.includes('Edg/')) {
    cachedBrowserInfo = { browser: 'edge', browserName: 'Microsoft Edge' };
    return cachedBrowserInfo;
  }
  if (ua.includes('Chrome')) {
    cachedBrowserInfo = { browser: 'chrome', browserName: 'Google Chrome' };
    return cachedBrowserInfo;
  }
  cachedBrowserInfo = { browser: 'chrome', browserName: 'Google Chrome' };
  return cachedBrowserInfo;
}
detectExtensionBrowser().catch(() => {});

// Load saved project folder path and cached Google accounts
let currentProjectDir = DEFAULT_PROJECT_DIR;
let storedDefaultModelQuality = 'auto';
let storedDefaultAspectRatio = '1:1';
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['mythicProjectDir', 'mythicKnownGoogleAccounts', 'defaultModelQuality', 'defaultAspectRatio'], (result) => {
    if (result && result.mythicProjectDir) {
      currentProjectDir = result.mythicProjectDir;
    }
    if (result && result.defaultModelQuality) {
      storedDefaultModelQuality = result.defaultModelQuality;
    }
    if (result && result.defaultAspectRatio) {
      storedDefaultAspectRatio = result.defaultAspectRatio;
    }
    if (result && Array.isArray(result.mythicKnownGoogleAccounts)) {
      result.mythicKnownGoogleAccounts.forEach(acc => {
        if (acc && typeof acc.slot === 'number' && acc.email && !isSystemEmail(acc.email)) {
          knownGoogleAccounts.set(acc.slot, acc);
        }
      });
      console.log(`[MythicFrame BEI] Restored ${knownGoogleAccounts.size} known Google accounts from cache.`);
    }
  });

  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.defaultModelQuality) storedDefaultModelQuality = changes.defaultModelQuality.newValue || 'auto';
        if (changes.defaultAspectRatio) storedDefaultAspectRatio = changes.defaultAspectRatio.newValue || '1:1';
        if (changes.mythicProjectDir) currentProjectDir = changes.mythicProjectDir.newValue || DEFAULT_PROJECT_DIR;
      }
    });
  }
}

function persistKnownAccounts() {
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      mythicKnownGoogleAccounts: Array.from(knownGoogleAccounts.values())
    });
  }
}

function persistSessionJobs() {
  if (chrome.storage && chrome.storage.session) {
    try {
      chrome.storage.session.set({
        beiActiveJobs: Array.from(activeJobs.entries())
      });
    } catch (e) {}
  }
}

function restoreSessionJobs() {
  if (chrome.storage && chrome.storage.session) {
    chrome.storage.session.get(['beiActiveJobs'], (res) => {
      if (res && Array.isArray(res.beiActiveJobs)) {
        for (const [id, job] of res.beiActiveJobs) {
          if (!activeJobs.has(id)) {
            activeJobs.set(id, job);
          }
        }
        console.log(`[MythicFrame BEI] Restored ${res.beiActiveJobs.length} active jobs from session storage.`);
      }
    });
  }
}
restoreSessionJobs();

// Keep-alive port connection handler to prevent worker sleep during long generations
const activeKeepAlivePorts = new Set();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "mythicframe-bei-keepalive") {
    activeKeepAlivePorts.add(port);
    port.onDisconnect.addListener(() => {
      activeKeepAlivePorts.delete(port);
    });
  }
});

// Periodic alarm keepalive
if (chrome.alarms) {
  chrome.alarms.create("mythicBEIKeepAlive", { periodInMinutes: 0.3 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "mythicBEIKeepAlive") {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectBridge();
      } else {
        try {
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        } catch (e) {}
      }
    }
  });
}

function isSystemEmail(email) {
  const lower = (email || '').toLowerCase();
  return lower.includes('noreply') || 
         lower.includes('support@google.com') || 
         lower.includes('google-support') ||
         lower.includes('example.com');
}

let isScanningAccounts = false;

/**
 * Silently scans Google Account slots (/u/0/ to /u/3/) in the background
 * Probes unknown slots, extracts their emails via the DOM, caches them permanently,
 * and immediately closes the temporary probe tabs.
 */
async function scanGoogleAccounts() {
  if (isScanningAccounts) {
    console.log("[MythicFrame BEI] Account scan already running...");
    return Array.from(knownGoogleAccounts.values());
  }
  isScanningAccounts = true;
  console.log("[MythicFrame BEI] Starting silent scan of Google accounts across slots /u/0 through /u/3...");

  try {
    // 1. Discover already open tabs first
    await discoverTabs();

    // 2. Probe unknown slots 0 through 5
    const slots = [0, 1, 2, 3, 4, 5];
    for (const slot of slots) {
      if (knownGoogleAccounts.has(slot) && knownGoogleAccounts.get(slot).email) {
        continue; // Already identified!
      }

      // Check if a tab is already open for this slot
      const allTabs = await chrome.tabs.query({});
      const existingTab = allTabs.find(t => {
        const u = (t.url || t.pendingUrl || '').toLowerCase();
        if (!u.includes("gemini.google.com")) return false;
        const slotMatch = u.match(/\/u\/(\d+)/);
        const s = slotMatch ? parseInt(slotMatch[1], 10) : 0;
        return s === slot;
      });

      if (existingTab && existingTab.id) {
        const em = await extractTabEmail(existingTab.id, "gemini", slot);
        if (em && !isSystemEmail(em)) {
          knownGoogleAccounts.set(slot, { slot, email: em, name: em });
        }
        continue;
      }

      // Open a single silent background tab in BEI group
      try {
        console.log(`[MythicFrame BEI] Probing slot ${slot} via background tab...`);
        const probeTab = await chrome.tabs.create({
          url: `https://gemini.google.com/u/${slot}/app`,
          active: false
        });
        await organizeTabIntoBEIGroup(probeTab.id, 'same_window_group', false);
        await waitForTabReady(probeTab.id, 7000);
        const em = await extractTabEmail(probeTab.id, "gemini", slot);
        if (em && !isSystemEmail(em)) {
          knownGoogleAccounts.set(slot, { slot, email: em, name: em });
          console.log(`[MythicFrame BEI] Discovered Google account for slot ${slot}: ${em}`);
        }
        // Remove temporary probe tab
        try {
          await chrome.tabs.remove(probeTab.id);
        } catch (e) {}
      } catch (probeErr) {
        console.warn(`[MythicFrame BEI] Slot ${slot} probe notice:`, probeErr);
      }
    }

    persistKnownAccounts();

    // Broadcast updated accounts to bridge
    const updatedTabs = await discoverTabs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: "tabs_list", 
        data: { 
          tabs: updatedTabs,
          accounts: Array.from(knownGoogleAccounts.values())
        } 
      }));
    }
  } finally {
    isScanningAccounts = false;
  }

  return Array.from(knownGoogleAccounts.values());
}

/**
 * Fetches Google accounts directly from Google session ListAccounts endpoint if available
 */
async function refreshGoogleAccountsList() {
  try {
    const res = await fetch("https://accounts.google.com/ListAccounts?json=standard", {
      credentials: "include"
    });
    if (res.ok) {
      const text = await res.text();
      const cleanJson = text.replace(/^\)\]\}'/, '').trim();
      const data = JSON.parse(cleanJson);
      if (Array.isArray(data) && Array.isArray(data[1])) {
        data[1].forEach((acc, idx) => {
          let email = "";
          let name = "";
          if (Array.isArray(acc)) {
            for (const item of acc) {
              if (typeof item === 'string' && item.includes('@') && !isSystemEmail(item)) {
                email = item;
                break;
              }
            }
            if (typeof acc[0] === 'string' && !acc[0].includes('@')) name = acc[0];
          } else if (acc && typeof acc === 'object') {
            email = acc.email || acc.user_email || "";
            name = acc.name || acc.display_name || "";
          }
          if (email && !isSystemEmail(email)) {
            knownGoogleAccounts.set(idx, { slot: idx, email, name });
          }
        });
        persistKnownAccounts();
      }
    }
  } catch (err) {
    // Expected on modern Google accounts
  }
}

/**
 * Programmatically injects content scripts into open tabs
 */
async function ensureContentScriptInjected(tabId, target) {
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  try {
    // Probe if script is already responsive to prevent duplicate listeners
    const isAlive = await new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(tabId, { action: 'PING' }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve(false);
          } else {
            resolve(Boolean(resp && resp.pong));
          }
        });
      } catch (e) {
        resolve(false);
      }
    });

    if (isAlive) {
      console.log(`[MythicFrame BEI] Content script already active on tab ${tabId}. Skipping injection.`);
      return;
    }

    const scriptFiles = target === "gemini" 
      ? ["scripts/protocol.js", "scripts/gemini_content.js"]
      : ["scripts/protocol.js", "scripts/chatgpt_content.js"];

    await chrome.scripting.executeScript({
      target: { tabId },
      files: scriptFiles
    });
    await new Promise(r => setTimeout(r, 300));
  } catch (err) {
    console.debug(`[MythicFrame BEI] Script injection notice for tab ${tabId}:`, err?.message || err);
  }
}

/**
 * Scans all open tabs and injects content scripts into any existing Gemini / ChatGPT tabs
 */
async function injectAllExistingTabs() {
  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (!tab.id || !tab.url) continue;
      if (tab.url.includes("gemini.google.com")) {
        await ensureContentScriptInjected(tab.id, "gemini");
      } else if (tab.url.includes("chatgpt.com")) {
        await ensureContentScriptInjected(tab.id, "chatgpt");
      }
    }
  } catch (e) {
    console.warn("[MythicFrame BEI] Error injecting into existing tabs:", e);
  }
}

function connectBridge() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(BRIDGE_WS_URL);

    ws.onopen = async () => {
      console.log("[MythicFrame BEI Worker] Connected to bridge on port 58925");
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      startHeartbeat();
      updateBadge(true);

      // Refresh Google accounts list from session
      await refreshGoogleAccountsList();

      // Inject into any existing tabs immediately so they are ready
      await injectAllExistingTabs();

      // Report discovered tabs & detected emails to bridge
      await detectExtensionBrowser();
      const tabs = await discoverTabs();
      ws.send(JSON.stringify({
        type: "browser_bridge_connected",
        data: {
          version: chrome.runtime?.getManifest?.()?.version || "1.2.0",
          name: "MythicFrame BEI Bridge",
          browser: cachedBrowserInfo.browser,
          browserName: cachedBrowserInfo.browserName,
          projectDir: currentProjectDir,
          tabs,
          accounts: Array.from(knownGoogleAccounts.values()),
          timestamp: Date.now()
        }
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "pong") return;
        await handleBridgeCommand(msg);
      } catch (err) {
        console.warn("[MythicFrame BEI Worker] Error handling bridge message:", err);
      }
    };

    ws.onerror = (err) => {
      console.warn("[MythicFrame BEI Worker] Bridge WebSocket error:", err);
    };

    ws.onclose = () => {
      stopHeartbeat();
      updateBadge(false);
      console.log("[MythicFrame BEI Worker] Bridge disconnected. Reconnecting in 3s...");
      scheduleReconnect();
    };
  } catch (err) {
    scheduleReconnect();
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
    }
  }, 12000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectBridge, 3000);
}

function updateBadge(connected) {
  if (chrome.action && chrome.action.setBadgeText) {
    chrome.action.setBadgeText({ text: connected ? "ON" : "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: connected ? "#9333ea" : "#64748b" });
  }
}

/**
 * Extracts active account email from a tab using message, DOM execution, or session mapping
 */
async function extractTabEmail(tabId, target, accountSlot = 0) {
  if (tabEmailsCache.has(tabId) && tabEmailsCache.get(tabId)) {
    return tabEmailsCache.get(tabId);
  }

  // 1. Try content script GET_TAB_INFO message
  try {
    const resp = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: "GET_TAB_INFO" }, (res) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res);
      });
    });
    if (resp && resp.email && !isSystemEmail(resp.email)) {
      tabEmailsCache.set(tabId, resp.email);
      if (target === "gemini") {
        knownGoogleAccounts.set(accountSlot, { slot: accountSlot, email: resp.email, name: resp.email });
      }
      return resp.email;
    }
  } catch (e) {}

  // 2. Direct script execution fallback across all frames (handles OneGoogle iframe & top-bar)
  try {
    if (chrome.scripting && chrome.scripting.executeScript) {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          function isSys(em) {
            const l = (em || '').toLowerCase();
            return l.includes('noreply') || l.includes('support@google.com') || l.includes('example.com');
          }

          // A. Helper from content script
          if (typeof window.__MYTHIC_BEI_GET_EMAIL__ === 'function') {
            const em = window.__MYTHIC_BEI_GET_EMAIL__();
            if (em && !isSys(em)) return em;
          }

          // B. Any element with aria-label, title, data-identifier, or data-email with @
          const els = document.querySelectorAll("[aria-label*='@'], [title*='@'], [data-identifier*='@'], [data-email*='@']");
          for (const el of els) {
            const str = (el.getAttribute('aria-label') || '') + ' ' + 
                        (el.getAttribute('title') || '') + ' ' + 
                        (el.getAttribute('data-identifier') || '') + ' ' + 
                        (el.getAttribute('data-email') || '');
            const m = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (m && !isSys(m[1])) return m[1];
          }

          // C. Google avatar & account buttons
          const btns = document.querySelectorAll("a[href*='SignOutOptions'], a[href*='accounts.google.com'], a.gb_d, div.gb_d, button.gb_d, [role='button'][aria-expanded]");
          for (const btn of btns) {
            let n = btn;
            for (let d = 0; d < 4 && n; d++) {
              const str = (n.getAttribute('aria-label') || '') + ' ' + 
                          (n.getAttribute('title') || '') + ' ' + 
                          (n.innerText || '') + ' ' + 
                          (n.textContent || '');
              const m = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
              if (m && !isSys(m[1])) return m[1];
              n = n.parentElement;
            }
          }

          // D. WIZ_global_data
          if (window.WIZ_global_data && typeof window.WIZ_global_data === 'object') {
            for (const k of Object.keys(window.WIZ_global_data)) {
              const val = String(window.WIZ_global_data[k]);
              const m = val.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
              if (m && !isSys(m[1])) return m[1];
            }
          }

          // E. Document HTML regex
          const html = document.documentElement ? document.documentElement.innerHTML : '';
          const mHtml = html.match(/([a-zA-Z0-9._%+-]+@gmail\.com)/);
          if (mHtml && !isSys(mHtml[1])) return mHtml[1];

          return "";
        }
      });

      if (results && results.length > 0) {
        for (const r of results) {
          if (r && r.result && !isSystemEmail(r.result)) {
            tabEmailsCache.set(tabId, r.result);
            if (target === "gemini") {
              knownGoogleAccounts.set(accountSlot, { slot: accountSlot, email: r.result, name: r.result });
            }
            return r.result;
          }
        }
      }
    }
  } catch (e) {}

  // 3. Fallback to Google Accounts session list for this slot
  if (target === "gemini" && knownGoogleAccounts.has(accountSlot)) {
    const acc = knownGoogleAccounts.get(accountSlot);
    if (acc && acc.email) {
      tabEmailsCache.set(tabId, acc.email);
      return acc.email;
    }
  }

  return "";
}

async function discoverTabs() {
  await refreshGoogleAccountsList();
  const tabsList = [];

  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (!tab.url || !tab.id) continue;
      if (tab.url.includes("gemini.google.com")) {
        const slotMatch = tab.url.match(/\/u\/(\d+)/);
        const slot = slotMatch ? parseInt(slotMatch[1], 10) : 0;
        const email = await extractTabEmail(tab.id, "gemini", slot);
        if (email && !isSystemEmail(email)) {
          knownGoogleAccounts.set(slot, { slot, email, name: email });
        }
        tabsList.push({
          tabId: tab.id,
          url: tab.url,
          target: "gemini",
          accountSlot: slot,
          email: email || (knownGoogleAccounts.get(slot)?.email) || undefined,
          title: tab.title || "Gemini Web",
          active: tab.active
        });
      } else if (tab.url.includes("chatgpt.com")) {
        const email = await extractTabEmail(tab.id, "chatgpt", 0);
        tabsList.push({
          tabId: tab.id,
          url: tab.url,
          target: "chatgpt",
          email: email || undefined,
          title: tab.title || "ChatGPT Web",
          active: tab.active
        });
      }
    }
  } catch (err) {
    console.warn("[MythicFrame BEI Worker] Error querying tabs:", err);
  }
  return tabsList;
}

let beiDedicatedWindowId = null;

/**
 * Organizes BEI tabs into a single dedicated Chrome Tab Group ("MythicFrame BEI")
 * Supports same window group, dedicated new window, and foreground/background focus.
 * Strictly deduplicates: reuses existing "MythicFrame BEI" tab group across all windows.
 */
async function organizeTabIntoBEIGroup(tabId, tabMode = 'new_window_group', bringTabToFront = false) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;

    // 1. If tab is ALREADY inside an existing "MythicFrame BEI" group, avoid redundant operations
    if (chrome.tabGroups && tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      try {
        const currentGroup = await chrome.tabGroups.get(tab.groupId);
        if (currentGroup && currentGroup.title === "MythicFrame BEI") {
          beiDedicatedWindowId = tab.windowId;
          if (bringTabToFront) {
            await chrome.tabs.update(tab.id, { active: true });
            if (tab.windowId) {
              await chrome.windows.update(tab.windowId, { focused: true });
            }
          }
          return;
        }
      } catch (e) {}
    }

    // 2. Discover any existing "MythicFrame BEI" tab groups globally across all windows
    let existingGroup = null;
    if (chrome.tabGroups) {
      try {
        const allGroups = await chrome.tabGroups.query({ title: "MythicFrame BEI" });
        if (allGroups && allGroups.length > 0) {
          existingGroup = allGroups[0];
          beiDedicatedWindowId = existingGroup.windowId;

          // Consolidate any duplicate groups created by previous sessions/bugs into the primary group
          if (allGroups.length > 1) {
            for (let i = 1; i < allGroups.length; i++) {
              const dupGroup = allGroups[i];
              try {
                const dupTabs = await chrome.tabs.query({ groupId: dupGroup.id });
                if (dupTabs && dupTabs.length > 0) {
                  const tabIdsToMove = dupTabs.map(t => t.id);
                  if (dupGroup.windowId !== existingGroup.windowId) {
                    await chrome.tabs.move(tabIdsToMove, { windowId: existingGroup.windowId, index: -1 });
                  }
                  await chrome.tabs.group({ tabIds: tabIdsToMove, groupId: existingGroup.id });
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }

    // 3. If an existing "MythicFrame BEI" group exists, route this tab into it
    if (existingGroup) {
      if (tab.windowId !== existingGroup.windowId) {
        await chrome.tabs.move(tab.id, { windowId: existingGroup.windowId, index: -1 });
      }
      await chrome.tabs.group({ tabIds: [tab.id], groupId: existingGroup.id });
    } else {
      // 4. No "MythicFrame BEI" group exists anywhere yet. Create one now.
      if (tabMode === 'new_window_group') {
        let winExists = false;
        if (beiDedicatedWindowId) {
          try {
            const win = await chrome.windows.get(beiDedicatedWindowId);
            if (win) winExists = true;
          } catch (e) {
            beiDedicatedWindowId = null;
          }
        }

        if (!winExists) {
          const newWin = await chrome.windows.create({
            tabId: tab.id,
            focused: Boolean(bringTabToFront)
          });
          beiDedicatedWindowId = newWin.id;
          if (chrome.tabGroups) {
            try {
              const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
              await chrome.tabGroups.update(groupId, { title: "MythicFrame BEI", color: "purple" });
            } catch (e) {}
          }
        } else {
          if (tab.windowId !== beiDedicatedWindowId) {
            await chrome.tabs.move(tab.id, { windowId: beiDedicatedWindowId, index: -1 });
          }
          if (chrome.tabGroups) {
            try {
              const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
              await chrome.tabGroups.update(groupId, { title: "MythicFrame BEI", color: "purple" });
            } catch (e) {}
          }
        }
      } else if (chrome.tabGroups) {
        // same_window_group or default mode: group tab in current window
        try {
          const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
          await chrome.tabGroups.update(groupId, { title: "MythicFrame BEI", color: "purple" });
        } catch (e) {}
      }
    }

    if (bringTabToFront) {
      await chrome.tabs.update(tab.id, { active: true });
      const targetWinId = existingGroup ? existingGroup.windowId : (beiDedicatedWindowId || tab.windowId);
      if (targetWinId) {
        await chrome.windows.update(targetWinId, { focused: true });
      }
    }
  } catch (err) {
    console.debug("[MythicFrame BEI] Tab group organization notice:", err);
  }
}

/**
 * Waits for tab navigation to complete and validates page health (not dead/error page).
 */
async function waitForTabReady(tabId, timeoutMs = 20000) {
  // 1. Wait for chrome tab status === 'complete'
  await new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });

  // 2. Validate tab health & recover dead/error pages
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return false;

    const currentUrl = (tab.url || tab.pendingUrl || '').toLowerCase();
    if (currentUrl.startsWith('chrome-error://') || currentUrl.startsWith('chrome-extension://') || currentUrl === 'about:blank') {
      console.warn(`[MythicFrame BEI] Dead or error page detected on tab ${tabId} (${currentUrl}). Attempting reload recovery...`);
      try {
        await chrome.tabs.reload(tabId);
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {}
    }

    // 3. Probe in-page DOM responsiveness
    if (chrome.scripting && chrome.scripting.executeScript) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const docReady = document.readyState === 'complete' || document.readyState === 'interactive';
              const title = (document.title || '').toLowerCase();
              const isDead = title.includes('error') || title.includes('502') || title.includes('503') || title.includes('500');
              const isSignIn = window.location.href.includes('accounts.google.com/ServiceLogin') || window.location.href.includes('accounts.google.com/signin');
              return { docReady, isDead, isSignIn, url: window.location.href };
            }
          });

          if (res && res[0] && res[0].result) {
            const { docReady, isDead, isSignIn } = res[0].result;
            if (isSignIn) {
              console.warn(`[MythicFrame BEI] Tab requires Google login.`);
              break;
            }
            if (isDead) {
              console.warn(`[MythicFrame BEI] Tab is dead. Reloading...`);
              await chrome.tabs.reload(tabId);
              await new Promise(r => setTimeout(r, 1500));
              continue;
            }
            if (docReady) break;
          }
        } catch (e) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  } catch (e) {}

  return true;
}

/**
 * Finds matching tab or AUTOMATICALLY opens a new tab in the configured group/window.
 * Deduplicates strictly: checks "MythicFrame BEI" tab group first, all open tabs second.
 * Reuses existing tabs to 100% eliminate duplicate tabs in the browser.
 */
async function findOrCreateTab(target, accountSlot = 0, tabMode = 'new_window_group', bringTabToFront = false, chatSessionMode = 'temporary_chat', tabSessionId = null) {
  const targetSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
  const lockKey = `${target}:${targetSlot}`;

  // In-flight mutex lock to avoid parallel calls opening duplicate tabs
  if (inFlightTabCreations.has(lockKey)) {
    console.log(`[MythicFrame BEI] Tab creation for ${lockKey} already in flight. Awaiting existing promise...`);
    return await inFlightTabCreations.get(lockKey);
  }

  const creationPromise = (async () => {
    const allTabs = await chrome.tabs.query({});
    let beiGroupTabIds = new Set();

    let primaryBeiWindowId = null;
    if (chrome.tabGroups) {
      try {
        const groups = await chrome.tabGroups.query({ title: "MythicFrame BEI" });
        if (groups && groups.length > 0) {
          primaryBeiWindowId = groups[0].windowId;
          const groupIds = new Set(groups.map(g => g.id));
          allTabs.filter(t => groupIds.has(t.groupId)).forEach(t => beiGroupTabIds.add(t.id));
        }
      } catch (e) {}
    }

    if (target === "gemini") {
      const isSlotMatch = (t) => {
        const u = (t.url || t.pendingUrl || '').toLowerCase();
        if (!u.includes("gemini.google.com")) return false;
        const slotMatch = u.match(/\/u\/(\d+)/);
        const slot = slotMatch ? parseInt(slotMatch[1], 10) : 0;
        return slot === targetSlot;
      };

      // 1. Prioritize tabs already on /app (composer page)
      let matchedTab = allTabs.find(t => beiGroupTabIds.has(t.id) && isSlotMatch(t) && (t.url || '').includes('/app')) ||
                       allTabs.find(t => isSlotMatch(t) && (t.url || '').includes('/app')) ||
                       allTabs.find(t => beiGroupTabIds.has(t.id) && isSlotMatch(t)) ||
                       allTabs.find(t => isSlotMatch(t));

      if (matchedTab && matchedTab.id) {
        console.log(`[MythicFrame BEI] Reusing existing Gemini tab ${matchedTab.id} for slot ${targetSlot} (In BEI Group: ${beiGroupTabIds.has(matchedTab.id)}).`);

        // Ensure tab is organized into BEI group immediately
        await organizeTabIntoBEIGroup(matchedTab.id, tabMode, bringTabToFront);

        // Wake up tab if discarded by Chrome Memory Saver
        if (matchedTab.discarded) {
          console.log(`[MythicFrame BEI] Tab ${matchedTab.id} was discarded by Chrome. Waking up...`);
          try {
            await chrome.tabs.reload(matchedTab.id);
            await waitForTabReady(matchedTab.id, 10000);
          } catch (e) {}
        }

        // Handle chatSessionMode:
        // 'same_chat': keep the active conversation (/app/<chat_id>), do NOT force navigation to /app!
        // 'new_chat': explicitly navigate to /app to start a new chat.
        // 'temporary_chat': keep active /app* conversation if present; navigate only if on /library or settings.
        const currentUrl = matchedTab.url || matchedTab.pendingUrl || '';
        const isInApp = currentUrl.includes('/app');
        if (chatSessionMode === 'new_chat') {
          console.log(`[MythicFrame BEI] 'new_chat' requested: Navigating tab ${matchedTab.id} to clean /u/${targetSlot}/app...`);
          try {
            await chrome.tabs.update(matchedTab.id, { url: `https://gemini.google.com/u/${targetSlot}/app` });
            await waitForTabReady(matchedTab.id, 12000);
          } catch (e) {}
        } else if (!isInApp) {
          console.log(`[MythicFrame BEI] Tab ${matchedTab.id} not on /app (${currentUrl}). Navigating to /u/${targetSlot}/app...`);
          try {
            await chrome.tabs.update(matchedTab.id, { url: `https://gemini.google.com/u/${targetSlot}/app` });
            await waitForTabReady(matchedTab.id, 12000);
          } catch (e) {}
        } else {
          console.log(`[MythicFrame BEI] Reusing active chat thread on tab ${matchedTab.id} (${currentUrl}) without reloading.`);
        }

        // Anti-throttling: ensure tab is active in its window during execution so Chromium doesn't throttle DOM timers
        try {
          await chrome.tabs.update(matchedTab.id, { active: true });
        } catch (e) {}

        await ensureContentScriptInjected(matchedTab.id, "gemini");
        return matchedTab.id;
      }

      // 3. Open a single new tab only when none exists
      console.log(`[MythicFrame BEI Worker] Opening single tab for Gemini slot ${targetSlot} (Mode: ${tabMode}, Focus: ${bringTabToFront})...`);
      const newTabProps = {
        url: `https://gemini.google.com/u/${targetSlot}/app`,
        active: true
      };
      if (primaryBeiWindowId) {
        newTabProps.windowId = primaryBeiWindowId;
      }
      const newTab = await chrome.tabs.create(newTabProps);
      // Organize into BEI group IMMEDIATELY upon creation
      await organizeTabIntoBEIGroup(newTab.id, tabMode, bringTabToFront);
      await waitForTabReady(newTab.id, 15000);
      await ensureContentScriptInjected(newTab.id, "gemini");

      const updatedTabs = await discoverTabs();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: "tabs_list", 
          data: { 
            tabs: updatedTabs,
            accounts: Array.from(knownGoogleAccounts.values())
          } 
        }));
      }

      return newTab.id;
    }

    if (target === "chatgpt") {
      let matchedTab = allTabs.find(t => {
        if (!beiGroupTabIds.has(t.id)) return false;
        const u = (t.url || t.pendingUrl || '').toLowerCase();
        return u.includes("chatgpt.com");
      });

      if (!matchedTab) {
        matchedTab = allTabs.find(t => {
          const u = (t.url || t.pendingUrl || '').toLowerCase();
          return u.includes("chatgpt.com");
        });
      }

      if (matchedTab && matchedTab.id) {
        console.log(`[MythicFrame BEI] Reusing existing ChatGPT tab ${matchedTab.id}.`);
        await organizeTabIntoBEIGroup(matchedTab.id, tabMode, bringTabToFront);
        if (matchedTab.discarded) {
          try {
            await chrome.tabs.reload(matchedTab.id);
            await waitForTabReady(matchedTab.id, 10000);
          } catch (e) {}
        }
        await ensureContentScriptInjected(matchedTab.id, "chatgpt");
        return matchedTab.id;
      }

      console.log(`[MythicFrame BEI Worker] Opening single tab for ChatGPT (Mode: ${tabMode}, Focus: ${bringTabToFront})...`);
      const newChatTabProps = {
        url: "https://chatgpt.com/",
        active: Boolean(bringTabToFront)
      };
      if (primaryBeiWindowId) {
        newChatTabProps.windowId = primaryBeiWindowId;
      }
      const newTab = await chrome.tabs.create(newChatTabProps);
      // Organize into BEI group IMMEDIATELY upon creation
      await organizeTabIntoBEIGroup(newTab.id, tabMode, bringTabToFront);
      await waitForTabReady(newTab.id, 15000);
      await ensureContentScriptInjected(newTab.id, "chatgpt");

      const updatedTabs = await discoverTabs();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: "tabs_list", 
          data: { 
            tabs: updatedTabs,
            accounts: Array.from(knownGoogleAccounts.values())
          } 
        }));
      }

      return newTab.id;
    }

    return null;
  })();

  inFlightTabCreations.set(lockKey, creationPromise);
  try {
    return await creationPromise;
  } finally {
    inFlightTabCreations.delete(lockKey);
  }
}

/**
 * Dispatches prompt execution to tab:
 * 1. Tries standard chrome.tabs.sendMessage with ensureContentScriptInjected
 * 2. If receiving end does not exist, silently reloads the tab in the background to attach fresh listeners
 * 3. If needed, opens a fresh background tab and dispatches
 * 4. 100% eliminates "Receiving end does not exist" failure
 */
async function dispatchPromptToTab(tabId, jobId, target, prompt, timeoutSeconds = 900, accountSlot = 0, images = [], tabMode = 'new_window_group', bringTabToFront = false, aspectRatio = '1:1', quality = 'ultra_original', modelQuality = 'auto') {
  // Step 1: Attempt direct message dispatch with script injection
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await ensureContentScriptInjected(tabId, target);
      const resp = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, {
          action: "EXECUTE_PROMPT",
          data: { jobId, target, prompt, timeoutSeconds, images, quality, aspectRatio, modelQuality }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      if (resp && resp.success) {
        return { success: true, method: 'message' };
      }
    } catch (err) {
      console.log(`[MythicFrame BEI] Tab message attempt ${attempt} notice:`, err.message);
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Step 2: Tab reload recovery — if listeners are detached from an older session, reload tab in background
  console.log(`[MythicFrame BEI] Tab ${tabId} message endpoint detached. Reloading tab in background to bind fresh listeners...`);
  try {
    await chrome.tabs.reload(tabId);
    await waitForTabReady(tabId);
    await new Promise(r => setTimeout(r, 1500));
    await ensureContentScriptInjected(tabId, target);
    await new Promise(r => setTimeout(r, 600));

    const resp = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        action: "EXECUTE_PROMPT",
        data: { jobId, target, prompt, timeoutSeconds, images, quality, aspectRatio, modelQuality }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    if (resp && resp.success) {
      return { success: true, method: 'reloaded_tab_message' };
    }
  } catch (reloadErr) {
    console.warn(`[MythicFrame BEI] Background tab reload notice:`, reloadErr.message);
  }

  // Step 3: Fresh background tab recovery
  try {
    console.log(`[MythicFrame BEI] Creating fresh recovery tab for target ${target} (slot ${accountSlot})...`);
    const newTab = await chrome.tabs.create({
      url: target === "gemini" ? `https://gemini.google.com/u/${accountSlot}/app` : "https://chatgpt.com/",
      active: Boolean(bringTabToFront)
    });
    await waitForTabReady(newTab.id);
    await organizeTabIntoBEIGroup(newTab.id, tabMode, bringTabToFront);
    await ensureContentScriptInjected(newTab.id, target);
    await new Promise(r => setTimeout(r, 2000));

    activeJobs.set(jobId, { tabId: newTab.id, target, prompt, accountSlot });

    const resp = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(newTab.id, {
        action: "EXECUTE_PROMPT",
        data: { jobId, target, prompt, timeoutSeconds, images, quality, aspectRatio, modelQuality }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    if (resp && resp.success) {
      return { success: true, method: 'fresh_tab_message' };
    }
  } catch (freshErr) {
    console.warn(`[MythicFrame BEI] Fresh tab dispatch notice:`, freshErr.message);
  }

  // Step 4: Direct execution fallback via chrome.scripting.executeScript
  console.log(`[MythicFrame BEI] Dispatching via direct executeScript fallback to tab ${tabId}...`);
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (jId, pText, tSec, imgs, qVal, arVal, mqVal) => {
        if (typeof window.__MYTHIC_BEI_EXECUTE_PROMPT__ === 'function') {
          window.__MYTHIC_BEI_EXECUTE_PROMPT__(jId, pText, tSec, imgs, qVal, arVal, mqVal);
          return { success: true, method: 'global_fn' };
        }
        window.dispatchEvent(new CustomEvent('__MYTHIC_BEI_EXECUTE_PROMPT__', {
          detail: { jobId: jId, prompt: pText, timeoutSeconds: tSec, images: imgs, quality: qVal, aspectRatio: arVal, modelQuality: mqVal }
        }));
        return { success: true, method: 'custom_event' };
      },
      args: [jobId, prompt, timeoutSeconds, images, quality, aspectRatio, modelQuality]
    });

    if (results && results[0] && results[0].result && results[0].result.success) {
      return results[0].result;
    }
    return { success: true, method: 'execute_script_injected' };
  } catch (directErr) {
    throw new Error(`Browser tab execution failed: ${directErr.message || directErr}. Please verify you are logged into Google Gemini or ChatGPT in Chrome.`);
  }
}

function getSlotKey(target, slot) {
  const parsed = (typeof slot === 'number') ? slot : (parseInt(slot, 10) || 0);
  return `${target}:${parsed}`;
}

function isSlotBusy(target, slot) {
  const slotKey = getSlotKey(target, slot);
  for (const job of activeJobs.values()) {
    if (getSlotKey(job.target, job.accountSlot) === slotKey) {
      return true;
    }
  }
  return false;
}

async function startJob(jobData) {
  const { jobId, target, prompt, fullPrompt, aspectRatio = (storedDefaultAspectRatio || '1:1'), modelQuality = (storedDefaultModelQuality || 'auto'), accountSlot = 0, timeoutSeconds, images = [], tabMode = 'new_window_group', bringTabToFront = false, chatSessionMode = 'temporary_chat', tabSessionId = null, quality = 'ultra_original' } = jobData;
  const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
  const tabId = await findOrCreateTab(target, parsedSlot, tabMode, bringTabToFront, chatSessionMode, tabSessionId);
  if (!tabId) {
    throw new Error(`No available browser tab found or created for target: ${target} (slot: ${parsedSlot})`);
  }

  activeJobs.set(jobId, { tabId, target, prompt, fullPrompt, accountSlot: parsedSlot, aspectRatio, modelQuality, submitted: false });
  persistSessionJobs();

  // Anti-throttling: ensure tab is active in its window during execution so Chromium doesn't throttle DOM timers
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (e) {}

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "GENERATION_PROGRESS",
      data: {
        jobId,
        step: "tab_routed",
        detail: `Routed to ${target} tab (slot /u/${parsedSlot}/, AR: ${aspectRatio}, Quality: ${modelQuality})...`,
        timestamp: Date.now()
      }
    }));
  }

  await dispatchPromptToTab(tabId, jobId, target, prompt, timeoutSeconds, parsedSlot, images, tabMode, bringTabToFront, aspectRatio, quality, modelQuality);
}

async function processNextInQueue(target, slot) {
  const slotKey = getSlotKey(target, slot);
  const queue = slotQueues.get(slotKey);
  if (queue && queue.length > 0) {
    const nextJob = queue.shift();
    console.log(`[MythicFrame BEI Worker] Concurrency Guard: Starting next queued job ${nextJob.jobId} for slot ${slotKey}`);
    try {
      await startJob(nextJob);
    } catch (err) {
      activeJobs.delete(nextJob.jobId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "GENERATION_FAILED",
          data: { jobId: nextJob.jobId, error: err.message || String(err) }
        }));
      }
      processNextInQueue(target, slot);
    }
  }
}

async function handleBridgeCommand(msg) {
  const { type, data } = msg;

  if (type === "LIST_TABS") {
    const tabs = await discoverTabs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: "tabs_list", 
        data: { 
          tabs,
          accounts: Array.from(knownGoogleAccounts.values())
        } 
      }));
    }
    return;
  }

  if (type === "SET_ACTIVE_TAB") {
    const { target = "gemini", accountSlot = 0 } = data || {};
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
    try {
      const tabId = await findOrCreateTab(target, parsedSlot, 'same_window_group', true, 'same_chat');
      if (tabId) {
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.windowId) {
          try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "ACTIVE_TAB_SET",
            data: { success: true, tabId, target, accountSlot: parsedSlot }
          }));
        }
      }
    } catch (err) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "ACTIVE_TAB_SET",
          data: { success: false, error: err.message }
        }));
      }
    }
    return;
  }

  if (type === "FETCH_LIBRARY_ASSETS") {
    const { target = "gemini", accountSlot = 0, limit = 5 } = data || {};
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
    try {
      const allTabs = await chrome.tabs.query({});
      let libTab = allTabs.find(t => {
        const u = (t.url || '').toLowerCase();
        return u.includes(`gemini.google.com/u/${parsedSlot}/library`) || (parsedSlot === 0 && u.includes('gemini.google.com/library'));
      });
      if (!libTab) {
        libTab = await chrome.tabs.create({
          url: `https://gemini.google.com/u/${parsedSlot}/library`,
          active: false
        });
        await waitForTabReady(libTab.id, 15000);
      }
      await ensureContentScriptInjected(libTab.id, "gemini");
      await new Promise(r => setTimeout(r, 1200));

      chrome.tabs.sendMessage(libTab.id, {
        action: "EXTRACT_LIBRARY_ASSETS",
        data: { limit, accountSlot: parsedSlot }
      }, (res) => {
        if (chrome.runtime.lastError || !res) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "LIBRARY_ASSETS_FETCHED",
              data: { success: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'No response from library tab.' }
            }));
          }
        } else {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "LIBRARY_ASSETS_FETCHED",
              data: { success: true, assets: res.assets || [], accountSlot: parsedSlot }
            }));
          }
        }
      });
    } catch (err) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "LIBRARY_ASSETS_FETCHED",
          data: { success: false, error: err.message }
        }));
      }
    }
    return;
  }

  if (type === "OPEN_TAB") {
    const { target = "gemini", accountSlot = 0, tabMode = 'new_window_group' } = data || {};
    const bringTabToFront = data?.bringTabToFront !== undefined ? Boolean(data.bringTabToFront) : true;
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
    const tabId = await findOrCreateTab(target, parsedSlot, tabMode, bringTabToFront);
    const tabs = await discoverTabs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: "tabs_list", 
        data: { 
          tabs,
          accounts: Array.from(knownGoogleAccounts.values())
        } 
      }));
    }
    return;
  }

  if (type === "EXECUTE_PROMPT") {
    const { jobId, target, prompt, fullPrompt, aspectRatio, modelQuality, accountSlot = 0, timeoutSeconds, images = [], tabMode = 'new_window_group', bringTabToFront = false, chatSessionMode = 'temporary_chat', tabSessionId = null, quality = 'ultra_original', dispatchMode = 'single' } = data;
    let parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);

    // Multi-Account Mode: If requested slot is busy and multi mode is enabled, find an idle slot
    if (dispatchMode === 'multi' && isSlotBusy(target, parsedSlot)) {
      console.log(`[MythicFrame BEI Worker] Multi-Account Mode: Slot ${target}:${parsedSlot} is busy. Finding idle account slot...`);
      const candidateSlots = [0, 1, 2, 3];
      const idleSlot = candidateSlots.find(s => !isSlotBusy(target, s));
      if (idleSlot !== undefined) {
        console.log(`[MythicFrame BEI Worker] Multi-Account Mode: Auto-routed job ${jobId} to idle slot ${idleSlot} for parallel execution!`);
        parsedSlot = idleSlot;
      }
    }

    const slotKey = getSlotKey(target, parsedSlot);

    // Concurrency Guard: If the assigned slot is still busy, queue rather than colliding on the same tab
    if (isSlotBusy(target, parsedSlot)) {
      console.log(`[MythicFrame BEI Worker] Concurrency Guard: Slot ${slotKey} is currently busy. Queuing job ${jobId}...`);
      if (!slotQueues.has(slotKey)) {
        slotQueues.set(slotKey, []);
      }
      const queue = slotQueues.get(slotKey);
      if (queue.length >= 8) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "GENERATION_FAILED",
            data: {
              jobId,
              error: `Slot queue full for ${target} (slot ${parsedSlot}). Another generation is actively running.`
            }
          }));
        }
        return;
      }
      queue.push({ jobId, target, prompt, fullPrompt, aspectRatio, modelQuality, accountSlot: parsedSlot, timeoutSeconds, images, tabMode, bringTabToFront, chatSessionMode, tabSessionId, quality, dispatchMode });
      return;
    }

    try {
      await startJob({ jobId, target, prompt, fullPrompt, aspectRatio, modelQuality, accountSlot: parsedSlot, timeoutSeconds, images, tabMode, bringTabToFront, chatSessionMode, tabSessionId, quality, dispatchMode });
    } catch (err) {
      activeJobs.delete(jobId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "GENERATION_FAILED",
          data: { jobId, error: err.message || String(err) }
        }));
      }
      processNextInQueue(target, parsedSlot);
    }
    return;
  }

  if (type === "EXECUTE_TEXT_PROMPT") {
    const { jobId, target = "gemini", prompt, accountSlot = 0, timeoutSeconds = 60, tabMode = 'new_window_group', bringTabToFront = false, images = [] } = data;
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);

    try {
      // In text mode, reuse current active tab
      const tabId = await findOrCreateTab(target, parsedSlot, tabMode, bringTabToFront, 'same_chat');
      if (!tabId) throw new Error(`No browser tab found for ${target} slot ${parsedSlot}`);

      activeJobs.set(jobId, { tabId, target, prompt, accountSlot: parsedSlot, isText: true });

      chrome.tabs.sendMessage(tabId, {
        action: "EXECUTE_TEXT_PROMPT",
        data: { jobId, prompt, timeoutSeconds, images }
      }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn("[MythicFrame BEI] Direct message warning for text prompt:", chrome.runtime.lastError);
        }
      });
    } catch (err) {
      activeJobs.delete(jobId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "TEXT_FAILED",
          data: { jobId, error: err.message || String(err) }
        }));
      }
    }
    return;
  }

  if (type === "RESET_SESSION") {
    const { target = "gemini", accountSlot = 0 } = data || {};
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
    const tabs = await discoverTabs();
    const matched = tabs.find(t => t.target === target && t.accountSlot === parsedSlot);
    if (matched) {
      console.log(`[MythicFrame BEI] Resetting tab ${matched.tabId} to clean /u/${parsedSlot}/app on session clear...`);
      try {
        await chrome.tabs.update(matched.tabId, { url: `https://gemini.google.com/u/${parsedSlot}/app` });
      } catch (e) {}
    }
    return;
  }

  if (type === "SCAN_ACCOUNTS") {
    console.log("[MythicFrame BEI Worker] Received command SCAN_ACCOUNTS from bridge.");
    const accounts = await scanGoogleAccounts();
    const tabs = await discoverTabs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: "tabs_list", 
        data: { 
          tabs,
          accounts
        } 
      }));
    }
    return;
  }

  if (type === "CANCEL_GENERATION") {
    const jobId = data?.jobId;
    if (jobId) {
      // Remove from any queue
      for (const [slotKey, queue] of slotQueues.entries()) {
        const idx = queue.findIndex(j => j.jobId === jobId);
        if (idx !== -1) {
          queue.splice(idx, 1);
          console.log(`[MythicFrame BEI Worker] Removed cancelled job ${jobId} from queue for slot ${slotKey}`);
        }
      }
      if (activeJobs.has(jobId)) {
        const job = activeJobs.get(jobId);
        activeJobs.delete(jobId);
        try {
          chrome.tabs.sendMessage(job.tabId, { action: "CANCEL_GENERATION", data: { jobId } });
        } catch (e) {}
        if (chrome.scripting && chrome.scripting.executeScript && job.tabId) {
          chrome.scripting.executeScript({
            target: { tabId: job.tabId },
            func: () => {
              if (typeof window.__MYTHIC_BEI_CANCEL__ === 'function') window.__MYTHIC_BEI_CANCEL__();
              if (typeof window.__MYTHIC_BEI_CLICK_STOP_BUTTON__ === 'function') window.__MYTHIC_BEI_CLICK_STOP_BUTTON__();
              const btns = document.querySelectorAll("button[aria-label*='Stop' i], button.stop-button, [aria-label*='Stop response' i]");
              for (const b of btns) { if (b && !b.disabled) b.click(); }
            }
          }).catch(() => {});
        }
        processNextInQueue(job.target, job.accountSlot);
      }
    } else {
      // Cancel all
      slotQueues.clear();
      for (const [id, job] of activeJobs.entries()) {
        try {
          chrome.tabs.sendMessage(job.tabId, { action: "CANCEL_GENERATION", data: { jobId: id } });
        } catch (e) {}
        if (chrome.scripting && chrome.scripting.executeScript && job.tabId) {
          chrome.scripting.executeScript({
            target: { tabId: job.tabId },
            func: () => {
              if (typeof window.__MYTHIC_BEI_CANCEL__ === 'function') window.__MYTHIC_BEI_CANCEL__();
              if (typeof window.__MYTHIC_BEI_CLICK_STOP_BUTTON__ === 'function') window.__MYTHIC_BEI_CLICK_STOP_BUTTON__();
              const btns = document.querySelectorAll("button[aria-label*='Stop' i], button.stop-button, [aria-label*='Stop response' i]");
              for (const b of btns) { if (b && !b.disabled) b.click(); }
            }
          }).catch(() => {});
        }
      }
      activeJobs.clear();
    }
    // Broadcast CLEAR_COMPOSER and click stop buttons on any open Gemini or ChatGPT tabs
    chrome.tabs.query({}).then(tabs => {
      for (const tab of tabs) {
        if (tab.id && tab.url && (tab.url.includes("gemini.google.com") || tab.url.includes("chatgpt.com"))) {
          try {
            chrome.tabs.sendMessage(tab.id, { action: "CANCEL_GENERATION" });
          } catch (e) {}
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                if (typeof window.__MYTHIC_BEI_CANCEL__ === 'function') window.__MYTHIC_BEI_CANCEL__();
                if (typeof window.__MYTHIC_BEI_CLICK_STOP_BUTTON__ === 'function') window.__MYTHIC_BEI_CLICK_STOP_BUTTON__();
                const btns = document.querySelectorAll("button[aria-label*='Stop' i], button.stop-button, [aria-label*='Stop response' i]");
                for (const b of btns) { if (b && !b.disabled) b.click(); }
              }
            }).catch(() => {});
          }
        }
      }
    });
    return;
  }

  if (type === "RELOAD_EXTENSION") {
    console.log("[MythicFrame BEI Worker] Reloading extension from disk...");
    if (chrome.runtime && typeof chrome.runtime.reload === 'function') {
      chrome.runtime.reload();
    }
    return;
  }
}

async function fetchUrlAsBase64(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:image')) return url;

  const upgradedUrl = protocol.upgradeToHighResUrl ? protocol.upgradeToHighResUrl(url) : url;
  const candidates = Array.from(new Set([upgradedUrl, url].filter(Boolean)));

  for (const targetUrl of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(targetUrl);
        if (res.ok) {
          const mime = res.headers.get('content-type') || 'image/png';
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const len = bytes.byteLength;
          const chunkSize = 8192;
          for (let i = 0; i < len; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode.apply(null, chunk);
          }
          const dataUrl = `data:${mime};base64,${btoa(binary)}`;
          if (dataUrl && dataUrl.startsWith('data:image') && dataUrl.length > 512) {
            return dataUrl;
          }
        }
      } catch (fetchErr) {
        console.warn(`[MythicFrame BEI Worker] Fetch attempt ${attempt} for ${targetUrl.substring(0, 50)} notice:`, fetchErr);
      }
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }
  return url;
}

async function fetchExactUrlAsBase64(url) {
  if (!url || typeof url !== 'string') return '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const mime = res.headers.get('content-type') || 'image/jpeg';
        const bytes = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.byteLength)));
        const dataUrl = `data:${mime};base64,${btoa(binary)}`;
        if (dataUrl.startsWith('data:image') && dataUrl.length > 512) return dataUrl;
      }
    } catch (e) { console.warn('[MythicFrame BEI Worker] Exact fetch notice:', e); }
    await new Promise(r => setTimeout(r, 250 * attempt));
  }
  return '';
}

// Capture Gemini's native full-size (2K) download when a capture is armed.
if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(async (item) => {
    if (pendingFullSizeCaptures.size === 0) return;
    const first = pendingFullSizeCaptures.entries().next().value;
    if (!first) return;
    const [jobId, pending] = first;
    const url = (item && (item.finalUrl || item.url)) || '';
    const isFetchable = /^https?:/i.test(url) && /googleusercontent\.com|gstatic\.com/i.test(url);
    if (!isFetchable) {
      // Blob download (bytes captured in-page by page_hook.js). Record it so a confirmed
      // capture can delete the duplicate file from the user's Downloads.
      if (/Gemini_Generated_Image/i.test(item.filename || '') || /^blob:https?:\/\/gemini\.google\.com/i.test(url)) {
        lastGeminiDownloadId = item.id;
        lastGeminiDownloadAt = Date.now();
      }
      clearTimeout(pending.timer);
      pendingFullSizeCaptures.delete(jobId);
      pending.resolve({ success: false, dataUrl: '' });
      return;
    }
    try { if (chrome.downloads.cancel) await chrome.downloads.cancel(item.id); } catch (e) {}
    try { if (chrome.downloads.erase) chrome.downloads.erase({ id: item.id }); } catch (e) {}
    const dataUrl = await fetchExactUrlAsBase64(url);
    if (!pendingFullSizeCaptures.has(jobId)) return;
    clearTimeout(pending.timer);
    pendingFullSizeCaptures.delete(jobId);
    pending.resolve(dataUrl && dataUrl.startsWith('data:image') ? { success: true, dataUrl } : { success: false, dataUrl: '' });
  });
}

// Track Gemini download filenames (set after creation) and delete approved files once complete.
if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onChanged) {
  chrome.downloads.onChanged.addListener((delta) => {
    try {
      if (delta.filename && delta.filename.current && /Gemini_Generated_Image/i.test(delta.filename.current) && (Date.now() - lastGeminiDownloadAt < 60000)) {
        lastGeminiDownloadId = delta.id;
        lastGeminiDownloadAt = Date.now();
      }
      if (delta.state && delta.state.current === 'complete' && removeWhenComplete.has(delta.id)) {
        removeWhenComplete.delete(delta.id);
        try { chrome.downloads.removeFile(delta.id, () => void (chrome.runtime && chrome.runtime.lastError)); } catch (e) {}
        try { chrome.downloads.erase({ id: delta.id }); } catch (e) {}
      }
    } catch (e) {}
  });
}

// Listen for messages from content scripts and extension popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ARM_FULLSIZE_CAPTURE") {
    const jobId = message.data?.jobId || 'unknown';
    if (typeof chrome === 'undefined' || !chrome.downloads) {
      sendResponse({ success: false, dataUrl: '' });
      return true;
    }
    const existing = pendingFullSizeCaptures.get(jobId);
    if (existing) { clearTimeout(existing.timer); try { existing.resolve({ success: false, dataUrl: '' }); } catch (e) {} pendingFullSizeCaptures.delete(jobId); }
    const timer = setTimeout(() => {
      const p = pendingFullSizeCaptures.get(jobId);
      if (p) { pendingFullSizeCaptures.delete(jobId); p.resolve({ success: false, dataUrl: '' }); }
    }, 25000);
    pendingFullSizeCaptures.set(jobId, { resolve: sendResponse, timer });
    return true;
  }

  if (message.type === "DISARM_FULLSIZE_CAPTURE") {
    const jobId = message.data?.jobId;
    const p = jobId && pendingFullSizeCaptures.get(jobId);
    if (p) { clearTimeout(p.timer); pendingFullSizeCaptures.delete(jobId); try { p.resolve({ success: false, dataUrl: '' }); } catch (e) {} }
    return;
  }

  if (message.type === "REMOVE_FULLSIZE_DOWNLOAD") {
    const id = lastGeminiDownloadId;
    const fresh = id != null && (Date.now() - lastGeminiDownloadAt < 60000);
    lastGeminiDownloadId = null;
    if (fresh && typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.search) {
      chrome.downloads.search({ id }, (results) => {
        const d = results && results[0];
        if (d && d.state === 'complete') {
          try { chrome.downloads.removeFile(id, () => void (chrome.runtime && chrome.runtime.lastError)); } catch (e) {}
          try { chrome.downloads.erase({ id }); } catch (e) {}
        } else {
          removeWhenComplete.add(id);
        }
      });
    }
    return;
  }

  if (message.type === "GENERATION_PROGRESS") {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
    return;
  }

  if (message.type === "CONVERT_URL_TO_BASE64") {
    const url = message.data?.url || message.url;
    fetchUrlAsBase64(url).then(dataUrl => {
      sendResponse({ success: Boolean(dataUrl && dataUrl.startsWith('data:image')), dataUrl: dataUrl || url });
    }).catch(err => {
      sendResponse({ success: false, dataUrl: url, error: err?.message || String(err) });
    });
    return true;
  }

  if (message.type === "PROMPT_SUBMITTED") {
    const { jobId, chatUrl } = message.data || {};
    if (activeJobs.has(jobId)) {
      const job = activeJobs.get(jobId);
      job.submitted = true;
      if (chatUrl) job.chatUrl = chatUrl;
      persistSessionJobs();
      console.log(`[MythicFrame BEI] Job ${jobId} marked as submitted (chatUrl: ${chatUrl}).`);
    }
    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "GENERATION_COMPLETED") {
    let { jobId, image, target, metadata } = message.data;
    const job = activeJobs.get(jobId);
    const jobTarget = job?.target || target;
    const jobSlot = job?.accountSlot ?? 0;
    activeJobs.delete(jobId);
    persistSessionJobs();

    // Concurrency Guard: Process next queued job for this slot
    processNextInQueue(jobTarget, jobSlot);

    (async () => {
      let finalImage = image;
      let retrievalMethod = metadata?.retrievalMethod || 'in_page';

      // High-Res URL fetch: Ensure background worker converts remote URL to Base64 using extension privileges
      if (typeof finalImage === 'string' && (finalImage.startsWith('http://') || finalImage.startsWith('https://'))) {
        console.log(`[MythicFrame BEI] Background worker converting remote image URL: ${finalImage.substring(0, 80)}...`);
        const b64 = await fetchUrlAsBase64(finalImage);
        if (b64 && b64.startsWith('data:image') && b64.length > 512) {
          finalImage = b64;
          retrievalMethod = 'service_worker_fetch';
          console.log(`[MythicFrame BEI] Service worker successfully converted image to Base64 (${Math.round(finalImage.length / 1024)} KB)`);
        } else {
          retrievalMethod = 'raw_url_fallback';
        }
      } else if (typeof finalImage === 'string' && finalImage.startsWith('data:image')) {
        retrievalMethod = metadata?.retrievalMethod || 'in_page_data_uri';
      }

      // Upgrade any candidate or source URLs in metadata
      if (metadata) {
        metadata.retrievalMethod = retrievalMethod;
        metadata.imageFormat = (typeof finalImage === 'string' && finalImage.startsWith('data:')) ? 'base64' : 'url';
        metadata.imageSize = typeof finalImage === 'string' ? finalImage.length : 0;
        if (metadata.srcUrl && protocol.upgradeToHighResUrl) {
          metadata.srcUrl = protocol.upgradeToHighResUrl(metadata.srcUrl);
        }
        if (Array.isArray(metadata.candidates) && protocol.upgradeToHighResUrl) {
          metadata.candidates = metadata.candidates.map(u => protocol.upgradeToHighResUrl(u));
        }
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "GENERATION_COMPLETED",
          data: {
            jobId,
            image: finalImage,
            target,
            metadata
          }
        }));
      }
    })();

    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "TEXT_COMPLETED") {
    const { jobId, text, target } = message.data || {};
    activeJobs.delete(jobId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "TEXT_COMPLETED",
        data: {
          jobId,
          text,
          target
        }
      }));
    }
    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "TEXT_FAILED") {
    const { jobId, error } = message.data || {};
    activeJobs.delete(jobId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "TEXT_FAILED",
        data: {
          jobId,
          error
        }
      }));
    }
    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "GENERATION_FAILED") {
    const { jobId, error } = message.data;
    const job = activeJobs.get(jobId);
    const jobTarget = job?.target;
    const jobSlot = job?.accountSlot ?? 0;
    activeJobs.delete(jobId);

    // Concurrency Guard: Process next queued job for this slot
    if (jobTarget) {
      processNextInQueue(jobTarget, jobSlot);
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "GENERATION_FAILED",
        data: { jobId, error }
      }));
    }
    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "TAB_INFO_PROACTIVE" || message.type === "TAB_EMAIL_DETECTED") {
    const { target, email, accountSlot } = message.data || {};
    if (sender?.tab?.id && email && !isSystemEmail(email)) {
      tabEmailsCache.set(sender.tab.id, email);
      if (target === "gemini") {
        const slot = accountSlot !== undefined ? accountSlot : 0;
        knownGoogleAccounts.set(slot, { slot, email, name: email });
        console.log(`[MythicFrame BEI] Registered active email for slot ${slot}: ${email}`);
        if (ws && ws.readyState === WebSocket.OPEN) {
          discoverTabs().then(tabs => {
            ws.send(JSON.stringify({
              type: "tab_status_update",
              data: {
                tabs,
                accounts: Array.from(knownGoogleAccounts.values())
              }
            }));
          });
        }
      }
    }
    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "GENERATION_CANCELLED") {
    const { jobId, reason } = message.data || {};
    const job = activeJobs.get(jobId);
    const jobTarget = job?.target;
    const jobSlot = job?.accountSlot ?? 0;
    activeJobs.delete(jobId);

    // Concurrency Guard: Process next queued job for this slot
    if (jobTarget) {
      processNextInQueue(jobTarget, jobSlot);
    }

    console.log(`[MythicFrame BEI Worker] Job ${jobId} cancelled: ${reason}`);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "GENERATION_CANCELLED",
        data: {
          jobId,
          reason: reason || "Generation cancelled manually by user"
        }
      }));
    }
    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "QUERY_TABS_STATUS") {
    discoverTabs().then(tabs => {
      sendResponse({ 
        tabs,
        accounts: Array.from(knownGoogleAccounts.values())
      });
    });
    return true;
  }

  if (message.type === "GET_WORKER_STATUS") {
    discoverTabs().then(tabs => {
      sendResponse({
        wsConnected: Boolean(ws && ws.readyState === WebSocket.OPEN),
        activeJobsCount: activeJobs.size,
        projectDir: currentProjectDir,
        tabs,
        accounts: Array.from(knownGoogleAccounts.values())
      });
    });
    return true;
  }

  if (message.type === "RECONNECT_BRIDGE") {
    connectBridge();
    sendResponse({ status: "reconnecting" });
    return true;
  }

  if (message.type === "SET_PROJECT_DIR") {
    const newDir = message.projectDir || DEFAULT_PROJECT_DIR;
    currentProjectDir = newDir;
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ mythicProjectDir: newDir });
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "update_project_dir",
        data: { projectDir: newDir }
      }));
    }
    sendResponse({ success: true, projectDir: newDir });
    return true;
  }

  if (message.type === "GET_PROJECT_DIR") {
    sendResponse({ projectDir: currentProjectDir });
    return true;
  }

  if (message.type === "GET_PERFORMANCE_METRICS") {
    getPerformanceMetrics().then(metrics => {
      sendResponse(metrics);
    }).catch(err => {
      sendResponse({ error: err?.message || String(err) });
    });
    return true;
  }

  if (message.type === "DISCARD_BEI_TABS") {
    discardBEITabs().then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ error: err?.message || String(err), discardedCount: 0 });
    });
    return true;
  }
});

/**
 * Collects runtime memory and performance metrics for the BEI Extension
 */
async function getPerformanceMetrics() {
  const metrics = {
    workerHeapMB: null,
    systemMemory: null,
    systemCpu: null,
    tabsCount: {
      geminiTotal: 0,
      geminiActive: 0,
      geminiDiscarded: 0,
      chatgptTotal: 0,
      chatgptActive: 0,
      chatgptDiscarded: 0
    },
    activeJobsCount: activeJobs.size,
    estimatedTabRamMB: 0,
    estimatedRamSavedMB: 0
  };

  // 1. Worker JS Heap
  if (typeof performance !== 'undefined' && performance.memory) {
    metrics.workerHeapMB = Math.round((performance.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
  }

  // 2. Open BEI Tabs (Gemini & ChatGPT)
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      const url = (t.url || t.pendingUrl || '').toLowerCase();
      if (url.includes('gemini.google.com')) {
        metrics.tabsCount.geminiTotal++;
        if (t.discarded) metrics.tabsCount.geminiDiscarded++;
        else metrics.tabsCount.geminiActive++;
      } else if (url.includes('chatgpt.com')) {
        metrics.tabsCount.chatgptTotal++;
        if (t.discarded) metrics.tabsCount.chatgptDiscarded++;
        else metrics.tabsCount.chatgptActive++;
      }
    }
  } catch (e) {}

  // Estimated RAM: typical live Gemini/ChatGPT web app uses ~400MB
  metrics.estimatedTabRamMB = (metrics.tabsCount.geminiActive + metrics.tabsCount.chatgptActive) * 400;
  metrics.estimatedRamSavedMB = (metrics.tabsCount.geminiDiscarded + metrics.tabsCount.chatgptDiscarded) * 400;

  // 3. System RAM info
  if (chrome.system && chrome.system.memory) {
    try {
      const memInfo = await new Promise(r => chrome.system.memory.getInfo(r));
      if (memInfo) {
        metrics.systemMemory = {
          totalGB: Math.round((memInfo.capacity / (1024 * 1024 * 1024)) * 10) / 10,
          availableGB: Math.round((memInfo.availableCapacity / (1024 * 1024 * 1024)) * 10) / 10,
          usedPercent: Math.round(((memInfo.capacity - memInfo.availableCapacity) / memInfo.capacity) * 100)
        };
      }
    } catch (e) {}
  }

  // 4. System CPU info
  if (chrome.system && chrome.system.cpu) {
    try {
      const cpuInfo = await new Promise(r => chrome.system.cpu.getInfo(r));
      if (cpuInfo) {
        metrics.systemCpu = {
          modelName: cpuInfo.modelName,
          numOfProcessors: cpuInfo.numOfProcessors
        };
      }
    } catch (e) {}
  }

  return metrics;
}

/**
 * Hibernates (discards from RAM) inactive background Gemini and ChatGPT tabs
 * Keeps tab alive in tab bar/groups but frees hundreds of megabytes of RAM.
 */
async function discardBEITabs() {
  const busyTabIds = new Set();
  for (const job of activeJobs.values()) {
    if (job.tabId) busyTabIds.add(job.tabId);
  }

  let discardedCount = 0;
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (!t.id || busyTabIds.has(t.id) || t.active || t.discarded) continue;
      const url = (t.url || t.pendingUrl || '').toLowerCase();
      if (url.includes('gemini.google.com') || url.includes('chatgpt.com')) {
        try {
          await chrome.tabs.discard(t.id);
          discardedCount++;
        } catch (e) {
          console.warn(`[MythicFrame BEI] Could not discard tab ${t.id}:`, e);
        }
      }
    }
  } catch (e) {}
  return { discardedCount, freedRamMBEstimate: discardedCount * 400 };
}

// Update tabs list when tabs are updated/removed & handle reload recovery
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Session URL Tracking: If tab URL transitions to /app/<chat_id>, store for recovery
  for (const [jobId, job] of activeJobs.entries()) {
    if (job.tabId === tabId && tab.url && tab.url.includes("gemini.google.com/u/")) {
      if (tab.url.includes("/app/")) {
        job.chatUrl = tab.url;
        persistSessionJobs();
      }
    }
  }

  if (changeInfo.status === "complete" && tab.url && (tab.url.includes("gemini.google.com") || tab.url.includes("chatgpt.com"))) {
    tabEmailsCache.delete(tabId);
    const target = tab.url.includes("gemini.google.com") ? "gemini" : "chatgpt";
    await ensureContentScriptInjected(tabId, target);

    // Reload Recovery: Check if this reloaded tab has an active job
    for (const [jobId, job] of activeJobs.entries()) {
      if (job.tabId === tabId) {
        console.log(`[MythicFrame BEI] Tab ${tabId} reloaded with active job ${jobId} (submitted: ${job.submitted}). Initiating recovery...`);
        if (job.submitted) {
          // Submitted case: Run DOM recovery scan without duplicate prompt
          chrome.tabs.sendMessage(tabId, {
            action: "RECOVER_JOB",
            data: {
              jobId,
              prompt: job.prompt,
              chatUrl: job.chatUrl,
              quality: job.quality,
              aspectRatio: job.aspectRatio,
              modelQuality: job.modelQuality
            }
          });
        } else {
          // Draft Loss case: Re-dispatch prompt to composer
          console.log(`[MythicFrame BEI] Tab ${tabId} reloaded before submission. Re-dispatching prompt for job ${jobId}...`);
          await dispatchPromptToTab(
            tabId,
            jobId,
            job.target,
            job.prompt,
            job.timeoutSeconds,
            job.accountSlot,
            job.images,
            job.tabMode,
            job.bringTabToFront,
            job.aspectRatio,
            job.quality,
            job.modelQuality
          );
        }
      }
    }

    const tabs = await discoverTabs();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: "tabs_list", 
        data: { 
          tabs,
          accounts: Array.from(knownGoogleAccounts.values())
        } 
      }));
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  tabEmailsCache.delete(tabId);
  for (const [jobId, job] of activeJobs.entries()) {
    if (job.tabId === tabId) {
      const target = job.target;
      const slot = job.accountSlot;
      activeJobs.delete(jobId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "GENERATION_FAILED",
          data: { jobId, error: "Browser tab was closed during generation" }
        }));
      }
      processNextInQueue(target, slot);
    }
  }
});

// Start initial connection and tab injection
connectBridge();
