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
const busyTabs = new Set(); // tabId -> boolean (strictly locked while job is running)
const tabEmailsCache = new Map(); // tabId -> email string
const knownGoogleAccounts = new Map(); // slot -> { slot, email, name, tier }
const tabChatHistory = new Map(); // tabId -> { chatName, chatUrl, conversationId, target, accountSlot, updatedAt }
const inFlightTabCreations = new Map(); // target:slot -> Promise<tabId>
const pendingFullSizeCaptures = new Map(); // jobId -> { resolve, timer } for native 2K Download capture
let lastGeminiDownloadId = null;           // most recent Gemini image download observed while a capture was armed
let lastGeminiDownloadAt = 0;
const removeWhenComplete = new Set();      // download ids to delete from disk once they finish
const exhaustedSlots = new Map();          // slotKey -> timestamp until which the slot is exhausted

function markSlotExhausted(target, slot, durationMs = 1800000) { // 30 min cooldown
  const key = getSlotKey(target, slot);
  exhaustedSlots.set(key, Date.now() + durationMs);
  console.warn(`[MythicFrame BEI] Marked slot ${key} as QUOTA EXHAUSTED for ${Math.round(durationMs / 60000)} min.`);
}

function isSlotExhausted(target, slot) {
  const key = getSlotKey(target, slot);
  if (!exhaustedSlots.has(key)) return false;
  if (Date.now() > exhaustedSlots.get(key)) {
    exhaustedSlots.delete(key);
    return false;
  }
  return true;
}

// ─── ACCOUNT TIERS ───────────────────────────────────────────────────────────
// tier: 'pro' (Google AI Pro/Ultra), 'free', or 'unknown'. Manual overrides (proEmails in
// mythic_project.json, or the Pro/Free toggle in Settings) always win over page detection.
const accountTierOverrides = new Map(); // email (lowercase) -> 'pro' | 'free'
let lastAccountPriorityOrder = [];      // gemini slots in the user's Settings priority order

function normalizeTier(t) {
  const v = String(t || '').toLowerCase();
  if (v === 'pro' || v === 'advanced' || v === 'ultra') return 'pro';
  if (v === 'free' || v === 'standard') return 'free';
  return 'unknown';
}

function getAccountTier(acc) {
  if (!acc) return 'unknown';
  const email = (acc.email || '').toLowerCase();
  if (email && accountTierOverrides.has(email)) return accountTierOverrides.get(email);
  return normalizeTier(acc.tier);
}

/** Merge account info for a slot without wiping a known tier (the old code overwrote it on every email report). */
function upsertAccount(slot, info) {
  const parsed = (typeof slot === 'number') ? slot : (parseInt(slot, 10) || 0);
  const prev = knownGoogleAccounts.get(parsed);
  const sameAccount = prev && info.email && prev.email && prev.email.toLowerCase() === String(info.email).toLowerCase();
  const merged = { ...(sameAccount || !info.email ? prev : {}), ...info, slot: parsed };
  const incoming = normalizeTier(info.tier);
  if (incoming === 'unknown') {
    merged.tier = sameAccount ? normalizeTier(prev.tier) : 'unknown';
    if (sameAccount && prev.capabilities) merged.capabilities = prev.capabilities;
  } else {
    merged.tier = incoming;
  }
  const changed = !prev || prev.email !== merged.email || normalizeTier(prev.tier) !== merged.tier;
  knownGoogleAccounts.set(parsed, merged);
  if (changed) persistKnownAccounts();
  return merged;
}

function persistTierOverrides() {
  if (chrome.storage && chrome.storage.local) {
    try { chrome.storage.local.set({ mythicTierOverrides: Array.from(accountTierOverrides.entries()) }); } catch (e) {}
  }
}

function restoreTierOverrides() {
  if (chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['mythicTierOverrides'], (res) => {
        if (res && Array.isArray(res.mythicTierOverrides)) {
          for (const [email, tier] of res.mythicTierOverrides) {
            if (!accountTierOverrides.has(email)) accountTierOverrides.set(email, tier);
          }
        }
      });
    } catch (e) {}
  }
}
restoreTierOverrides();

/** Applies overrides sent with a job: proEmails[] and tierOverrides { email: 'pro' | 'free' | 'auto' }. */
function applyTierOverrides(proEmails, tierOverrides) {
  let changed = false;
  if (Array.isArray(proEmails)) {
    for (const e of proEmails) {
      const email = String(e || '').trim().toLowerCase();
      if (email && accountTierOverrides.get(email) !== 'pro') { accountTierOverrides.set(email, 'pro'); changed = true; }
    }
  }
  if (tierOverrides && typeof tierOverrides === 'object') {
    for (const [e, t] of Object.entries(tierOverrides)) {
      const email = String(e || '').trim().toLowerCase();
      if (!email) continue;
      const tier = String(t || '').toLowerCase();
      if (tier === 'pro' || tier === 'free') {
        if (accountTierOverrides.get(email) !== tier) { accountTierOverrides.set(email, tier); changed = true; }
      } else if (accountTierOverrides.has(email) && !(Array.isArray(proEmails) && proEmails.map(x => String(x).toLowerCase()).includes(email))) {
        accountTierOverrides.delete(email); changed = true;
      }
    }
  }
  if (changed) persistTierOverrides();
}

/**
 * Pro-first account choice for Gemini. Order:
 *   1. idle Pro account   2. busy Pro account (queues on its own tab)
 *   3. idle unknown-tier  4. idle Free   5. busy unknown / Free
 * Exhausted (quota) slots are skipped. Ties follow the Settings priority order, then the hinted slot.
 * Returns { slot, reason } or null when no account is known.
 */
function chooseGeminiAccount(hintSlot, dispatchMode) {
  const accounts = Array.from(knownGoogleAccounts.values()).filter(a => a && typeof a.slot === 'number' && a.email);
  if (accounts.length === 0) return null;
  const order = lastAccountPriorityOrder.length ? lastAccountPriorityOrder : [];
  const prio = (slot) => {
    const i = order.indexOf(slot);
    return i === -1 ? 100 + slot : i;
  };
  const tierRank = { pro: 0, unknown: 1, free: 2 };
  const healthy = accounts.filter(a => !isSlotExhausted('gemini', a.slot));
  if (healthy.length === 0) return null;
  const scored = healthy.map(a => {
    const tier = getAccountTier(a);
    const busy = isSlotBusy('gemini', a.slot);
    // Pro: busy Pro still beats idle Free (queue on Pro). Others: idle first.
    const bucket = tier === 'pro' ? (busy ? 1 : 0) : (busy ? 4 : (tier === 'unknown' ? 2 : 3));
    return { a, tier, busy, bucket };
  });
  // Batch ("multi") mode spreads work: any idle account beats a busy Pro.
  if (dispatchMode === 'multi') {
    for (const x of scored) if (x.tier === 'pro' && x.busy) x.bucket = 3.5;
  }
  scored.sort((x, y) =>
    (x.bucket - y.bucket) ||
    (tierRank[x.tier] - tierRank[y.tier]) ||
    (prio(x.a.slot) - prio(y.a.slot)) ||
    ((x.a.slot === hintSlot ? 0 : 1) - (y.a.slot === hintSlot ? 0 : 1)) ||
    (x.a.slot - y.a.slot)
  );
  const best = scored[0];
  const label = best.tier === 'pro' ? (best.busy ? 'Pro account (busy, queued on its tab)' : 'idle Pro account')
    : best.tier === 'unknown' ? 'no Pro available; account tier unknown' : 'no Pro available; Free fallback';
  return { slot: best.a.slot, tier: best.tier, reason: label, summary: scored.map(x => `${x.a.slot}:${x.tier}${x.busy ? '(busy)' : ''}`).join(', ') };
}

function lockTab(tabId) {
  if (tabId) busyTabs.add(tabId);
}

function releaseTab(tabId) {
  if (tabId) busyTabs.delete(tabId);
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'anonymous';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) return 'masked';
  const user = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}***@${domain}`;
}

function emitAuditLog(event, details, extra = {}) {
  const logItem = {
    event,
    details,
    timestamp: Date.now(),
    ...extra
  };
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "AUDIT_LOG",
        data: logItem
      }));
    }
  } catch (e) {}
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['bei_recent_logs'], (res) => {
        const logs = Array.isArray(res.bei_recent_logs) ? res.bei_recent_logs : [];
        logs.push(logItem);
        if (logs.length > 200) logs.splice(0, logs.length - 200);
        chrome.storage.local.set({ bei_recent_logs: logs });
      });
    }
  } catch (e) {}
}

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
          if (job && job.tabId) {
            lockTab(job.tabId);
          }
        }
        console.log(`[MythicFrame BEI] Restored ${res.beiActiveJobs.length} active jobs and tab locks from session storage.`);
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
    const slots = [0, 1];
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
          upsertAccount(slot, { slot, email: em, name: em });
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
          upsertAccount(slot, { slot, email: em, name: em });
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
            upsertAccount(idx, { slot: idx, email, name });
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

async function isBridgeServerListening() {
  try {
    const res = await fetch("http://127.0.0.1:58925/status", {
      method: "GET",
      signal: AbortSignal.timeout ? AbortSignal.timeout(600) : undefined
    });
    return res.status < 500;
  } catch (e) {
    return false;
  }
}

async function connectBridge() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  // Pre-flight check: verify bridge port is listening before creating WebSocket
  // to completely eliminate net::ERR_CONNECTION_REFUSED error banners in chrome://extensions
  const isListening = await isBridgeServerListening();
  if (!isListening) {
    updateBadge(false);
    scheduleReconnect();
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
        if (msg.type === "pong") {
          if (Array.isArray(msg.pendingJobIds)) reconcileWithServer(msg.pendingJobIds);
          return;
        }
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
        upsertAccount(accountSlot, { slot: accountSlot, email: resp.email, name: resp.email, tier: resp.tier });
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
            const emailFound = r.result;
            tabEmailsCache.set(tabId, emailFound);
            if (target === "gemini") {
              try {
                chrome.scripting.executeScript({
                  target: { tabId },
                  func: () => {
                    if (typeof window.__MYTHIC_BEI_GET_TIER__ === 'function') {
                      return window.__MYTHIC_BEI_GET_TIER__();
                    }
                    return { tier: 'unknown', capabilities: { image: true, video: false, music: true, text: true } };
                  }
                }).then(tierRes => {
                  const tData = tierRes?.[0]?.result || { tier: 'unknown', capabilities: { image: true, video: false, music: true, text: true } };
                  upsertAccount(accountSlot, {
                    slot: accountSlot,
                    email: emailFound,
                    name: emailFound,
                    tier: tData.tier,
                    capabilities: tData.capabilities
                  });
                  persistKnownAccounts();
                }).catch(() => {
                  upsertAccount(accountSlot, {
                    slot: accountSlot,
                    email: emailFound,
                    name: emailFound,
                    tier: 'unknown',
                    capabilities: { image: true, video: false, music: true, text: true }
                  });
                });
              } catch (e) {
                upsertAccount(accountSlot, {
                  slot: accountSlot,
                  email: emailFound,
                  name: emailFound,
                  tier: 'unknown',
                  capabilities: { image: true, video: false, music: true, text: true }
                });
              }
            }
            return emailFound;
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
          upsertAccount(slot, { slot, email, name: email });
        }
        const chatInfo = tabChatHistory.get(tab.id);
        const rawTitle = (tab.title || '').replace(/^Gemini\s*[-–—|•]\s*/i, '').replace(/\s*[-–—|•]\s*Gemini$/i, '').trim();
        const chatName = chatInfo?.chatName || (rawTitle && rawTitle.toLowerCase() !== 'gemini' ? rawTitle : 'New Chat');
        tabsList.push({
          tabId: tab.id,
          url: tab.url,
          target: "gemini",
          accountSlot: slot,
          email: email || (knownGoogleAccounts.get(slot)?.email) || undefined,
          tier: getAccountTier(knownGoogleAccounts.get(slot)),
          chatName,
          title: tab.title || "Gemini Web",
          active: tab.active
        });
      } else if (tab.url.includes("chatgpt.com")) {
        const email = await extractTabEmail(tab.id, "chatgpt", 0);
        const chatInfo = tabChatHistory.get(tab.id);
        const rawTitle = (tab.title || '').replace(/^ChatGPT\s*[-–—|•]\s*/i, '').replace(/\s*[-–—|•]\s*ChatGPT$/i, '').trim();
        const chatName = chatInfo?.chatName || (rawTitle && rawTitle.toLowerCase() !== 'chatgpt' ? rawTitle : 'New Chat');
        tabsList.push({
          tabId: tab.id,
          url: tab.url,
          target: "chatgpt",
          email: email || undefined,
          tier: 'standard',
          chatName,
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
            try {
              await chrome.tabs.update(tab.id, { active: true });
              if (tab.windowId) {
                await chrome.windows.update(tab.windowId, { focused: true });
              }
            } catch (e) {}
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
async function findOrCreateTab(target, accountSlot = 0, tabMode = 'new_window_group', bringTabToFront = false, chatSessionMode = 'new_chat', tabSessionId = null, dispatchMode = 'single') {
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
      const getSlotFromUrl = (urlStr) => {
        const u = (urlStr || '').toLowerCase();
        const m = u.match(/\/u\/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      };

      const isSlotMatch = (t) => {
        const u = (t.url || t.pendingUrl || '').toLowerCase();
        if (!u.includes("gemini.google.com")) return false;
        return getSlotFromUrl(u) === targetSlot;
      };

      const isCleanComposerTab = (t) => {
        const u = (t.url || t.pendingUrl || '').toLowerCase();
        return u.includes("gemini.google.com");
      };

      const allGeminiTabs = allTabs.filter(t => (t.url || t.pendingUrl || '').toLowerCase().includes("gemini.google.com"));
      // Strict Concurrency & Multi-AI Guard: Never reuse a tab locked by an active in-flight job!
      const availableGeminiTabs = allGeminiTabs.filter(t => !busyTabs.has(t.id));

      let matchedTab = null;
      // STRICT MULTI-AI ISOLATION:
      // If the MythicFrame BEI tab group exists, ONLY reuse tabs inside the BEI group.
      // Never touch external browser tabs that belong to other AIs or user browsing sessions!
      if (beiGroupTabIds.size > 0) {
        matchedTab = availableGeminiTabs.find(t => beiGroupTabIds.has(t.id) && isSlotMatch(t));
        if (!matchedTab) {
          // Strict account match: never reuse another account's tab (that sent jobs to the wrong slot).
          const safeCandidates = availableGeminiTabs.filter(t => !t.pinned);
          matchedTab = safeCandidates.find(t => isSlotMatch(t)) || null;
        }
      } else {
        // Cold start before group creation: claim existing tab for slot, or any available unpinned gemini tab
        const safeCandidates = availableGeminiTabs.filter(t => !t.pinned && (!t.groupId || t.groupId === (chrome.tabGroups ? chrome.tabGroups.TAB_GROUP_ID_NONE : -1)));
        matchedTab = safeCandidates.find(t => isSlotMatch(t)) || null;
      }

      if (matchedTab && matchedTab.id) {
        const currentUrl = matchedTab.url || matchedTab.pendingUrl || '';
        const actualSlot = getSlotFromUrl(currentUrl);
        const email = await extractTabEmail(matchedTab.id, "gemini", actualSlot);

        console.log(`[MythicFrame BEI] Reusing idle Gemini tab ${matchedTab.id} for slot ${actualSlot} (In BEI Group: ${beiGroupTabIds.has(matchedTab.id)}).`);
        emitAuditLog('TAB_REUSED', `Reusing Gemini tab ${matchedTab.id} on slot ${actualSlot}`, {
          tabId: matchedTab.id,
          target: 'gemini',
          accountSlot: actualSlot,
          email: maskEmail(email),
          isBatch: dispatchMode === 'multi'
        });

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

        const isInApp = currentUrl.includes('/app');
        if (chatSessionMode === 'new_chat' && !isCleanComposerTab(matchedTab)) {
          console.log(`[MythicFrame BEI] 'new_chat' requested: Navigating tab ${matchedTab.id} to clean /u/${actualSlot}/app...`);
          try {
            await chrome.tabs.update(matchedTab.id, { url: `https://gemini.google.com/u/${actualSlot}/app` });
            await waitForTabReady(matchedTab.id, 12000);
            emitAuditLog('TAB_NAVIGATED', `Navigated tab ${matchedTab.id} to /u/${actualSlot}/app (new_chat)`, {
              tabId: matchedTab.id,
              accountSlot: actualSlot,
              email: maskEmail(email)
            });
          } catch (e) {}
        } else if (!isInApp) {
          console.log(`[MythicFrame BEI] Tab ${matchedTab.id} not on /app (${currentUrl}). Navigating to /u/${actualSlot}/app...`);
          try {
            await chrome.tabs.update(matchedTab.id, { url: `https://gemini.google.com/u/${actualSlot}/app` });
            await waitForTabReady(matchedTab.id, 12000);
            emitAuditLog('TAB_NAVIGATED', `Navigated tab ${matchedTab.id} from ${currentUrl} to /u/${actualSlot}/app`, {
              tabId: matchedTab.id,
              accountSlot: actualSlot,
              email: maskEmail(email)
            });
          } catch (e) {}
        } else {
          console.log(`[MythicFrame BEI] Reusing active chat thread on tab ${matchedTab.id} (${currentUrl}) without reloading.`);
        }

        if (bringTabToFront) {
          try {
            await chrome.tabs.update(matchedTab.id, { active: true });
          } catch (e) {}
        }

        await ensureContentScriptInjected(matchedTab.id, "gemini");
        return matchedTab.id;
      }

      // No idle clean matching tab available: Open a dedicated tab strictly for this task!
      console.log(`[MythicFrame BEI Worker] Opening dedicated tab for Gemini slot ${targetSlot} (Mode: ${tabMode}, Focus: ${bringTabToFront}, Batch: ${dispatchMode === 'multi'}, ChatMode: ${chatSessionMode})...`);
      const newTabProps = {
        url: `https://gemini.google.com/u/${targetSlot}/app`,
        active: Boolean(bringTabToFront)
      };
      if (primaryBeiWindowId) {
        newTabProps.windowId = primaryBeiWindowId;
      } else if (allTabs.length > 0 && allTabs[0].windowId) {
        newTabProps.windowId = allTabs[0].windowId;
      }
      let newTab;
      try {
        newTab = await chrome.tabs.create(newTabProps);
      } catch (tabErr) {
        console.warn(`[MythicFrame BEI Worker] tabs.create fallback: ${tabErr.message}`);
        const newWin = await chrome.windows.create({
          url: newTabProps.url,
          focused: Boolean(bringTabToFront)
        });
        primaryBeiWindowId = newWin.id;
        newTab = newWin.tabs && newWin.tabs[0] ? newWin.tabs[0] : (await chrome.tabs.query({ windowId: newWin.id }))[0];
      }
      // Organize into BEI group IMMEDIATELY upon creation
      await organizeTabIntoBEIGroup(newTab.id, tabMode, bringTabToFront);
      await waitForTabReady(newTab.id, 15000);
      await ensureContentScriptInjected(newTab.id, "gemini");

      const email = await extractTabEmail(newTab.id, "gemini", targetSlot);
      emitAuditLog('TAB_OPENED', `Opened new Gemini tab ${newTab.id} for slot ${targetSlot}`, {
        tabId: newTab.id,
        target: 'gemini',
        accountSlot: targetSlot,
        email: maskEmail(email),
        isBatch: dispatchMode === 'multi'
      });

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
      const isCleanChatGptTab = (t) => {
        const u = (t.url || t.pendingUrl || '').toLowerCase();
        return /^https?:\/\/(?:chatgpt\.com|chat\.openai\.com)\/?(?:\?.*)?$/i.test(u);
      };

      const availableChatGptTabs = allTabs.filter(t => {
        const u = (t.url || t.pendingUrl || '').toLowerCase();
        return (u.includes("chatgpt.com") || u.includes("chat.openai.com")) && !busyTabs.has(t.id);
      });

      let matchedTab = null;
      if (beiGroupTabIds.size > 0) {
        if (chatSessionMode === 'same_chat') {
          matchedTab = availableChatGptTabs.find(t => beiGroupTabIds.has(t.id));
          if (!matchedTab) {
            matchedTab = availableChatGptTabs.find(t => t.active) || availableChatGptTabs[0];
          }
        } else {
          matchedTab = availableChatGptTabs.find(t => beiGroupTabIds.has(t.id) && isCleanChatGptTab(t)) ||
                       availableChatGptTabs.find(t => beiGroupTabIds.has(t.id));
        }
      } else {
        const safeCandidates = availableChatGptTabs.filter(t => !t.pinned && (!t.groupId || t.groupId === (chrome.tabGroups ? chrome.tabGroups.TAB_GROUP_ID_NONE : -1)));
        if (chatSessionMode === 'same_chat') {
          matchedTab = safeCandidates[0];
        } else {
          matchedTab = safeCandidates.find(t => isCleanChatGptTab(t)) || safeCandidates[0];
        }
      }

      if (matchedTab && matchedTab.id) {
        console.log(`[MythicFrame BEI] Reusing idle ChatGPT tab ${matchedTab.id}.`);
        await organizeTabIntoBEIGroup(matchedTab.id, tabMode, bringTabToFront);
        if (matchedTab.discarded) {
          try {
            await chrome.tabs.reload(matchedTab.id);
            await waitForTabReady(matchedTab.id, 10000);
          } catch (e) {}
        }
        if (chatSessionMode === 'new_chat' && !isCleanChatGptTab(matchedTab)) {
          console.log(`[MythicFrame BEI] 'new_chat' requested: Navigating ChatGPT tab ${matchedTab.id} to clean https://chatgpt.com/...`);
          try {
            await chrome.tabs.update(matchedTab.id, { url: "https://chatgpt.com/" });
            await waitForTabReady(matchedTab.id, 12000);
          } catch (e) {}
        }
        await ensureContentScriptInjected(matchedTab.id, "chatgpt");
        return matchedTab.id;
      }

      console.log(`[MythicFrame BEI Worker] Opening dedicated tab for ChatGPT (Mode: ${tabMode}, Focus: ${bringTabToFront})...`);
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
async function dispatchPromptToTab(tabId, jobId, target, prompt, timeoutSeconds = 900, accountSlot = 0, images = [], tabMode = 'new_window_group', bringTabToFront = false, aspectRatio = '1:1', quality = 'ultra_original', modelQuality = 'auto', chatSessionMode = 'same_chat') {
  // Step 1: Attempt direct message dispatch with script injection
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await ensureContentScriptInjected(tabId, target);
      const resp = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('tabs.sendMessage timeout after 4s')), 4000);
        chrome.tabs.sendMessage(tabId, {
          action: "EXECUTE_PROMPT",
          data: { jobId, target, prompt, timeoutSeconds, images, quality, aspectRatio, modelQuality, chatSessionMode }
        }, (response) => {
          clearTimeout(timer);
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
      const timer = setTimeout(() => reject(new Error('tabs.sendMessage reload attempt timeout after 4s')), 4000);
      chrome.tabs.sendMessage(tabId, {
        action: "EXECUTE_PROMPT",
        data: { jobId, target, prompt, timeoutSeconds, images, quality, aspectRatio, modelQuality, chatSessionMode }
      }, (response) => {
        clearTimeout(timer);
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

  // Step 3: Direct execution fallback via chrome.scripting.executeScript (No uncontrolled recovery tabs)

  console.log(`[MythicFrame BEI] Dispatching via direct executeScript fallback to tab ${tabId}...`);
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (jId, pText, tSec, imgs, qVal, arVal, mqVal, csMode) => {
        if (typeof window.__MYTHIC_BEI_EXECUTE_PROMPT__ === 'function') {
          window.__MYTHIC_BEI_EXECUTE_PROMPT__(jId, pText, tSec, imgs, qVal, arVal, mqVal, 0, csMode);
          return { success: true, method: 'global_fn' };
        }
        window.dispatchEvent(new CustomEvent('__MYTHIC_BEI_EXECUTE_PROMPT__', {
          detail: { jobId: jId, prompt: pText, timeoutSeconds: tSec, images: imgs, quality: qVal, aspectRatio: arVal, modelQuality: mqVal, chatSessionMode: csMode }
        }));
        return { success: true, method: 'custom_event' };
      },
      args: [jobId, prompt, timeoutSeconds, images, quality, aspectRatio, modelQuality, chatSessionMode]
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

// ─── PER-TAB WORKERS ─────────────────────────────────────────────────────────
// Every BEI tab is an independent worker with its own FIFO queue and its own chat.
// Tabs on the same account run in parallel; a job is never sent to two tabs.
const tabQueues = new Map();      // tabId -> Array<jobData> (waiting, not started)
const tabStarting = new Set();    // tabIds currently preparing a job (between dequeue and dispatch)
const tabChatState = new Map();   // tabId -> { projectId, turns, badStreak, regenCount, lastPromptHash, lastOutcome, lastAspectRatio, chatId, lastUsedAt }
const slotTabCounts = new Map();  // slotKey -> worker tab count last seen
const cancelledJobIds = new Set(); // recently cancelled jobs (guards the dequeue -> dispatch window)

// Auto new-chat thresholds (same project). A different project ALWAYS gets a new chat.
const CHAT_MAX_TURNS = 12;                 // long threads drift and slow Gemini down
const CHAT_IDLE_RESET_MS = 45 * 60 * 1000; // stale thread after 45 min idle
const CHAT_BAD_STREAK_LIMIT = 2;           // 2 bad results in a row -> fresh chat
const CHAT_REGEN_LIMIT = 2;                // same prompt sent a 3rd time -> fresh chat
const TAB_QUEUE_LIMIT = 16;
const NEXT_JOB_SETTLE_MS = 1200;           // let the page settle before the next queued job

function sendToBridge(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(payload)); } catch (e) {}
  }
}

function rememberCancelled(jobId) {
  if (!jobId) return;
  cancelledJobIds.add(jobId);
  if (cancelledJobIds.size > 200) {
    const first = cancelledJobIds.values().next().value;
    cancelledJobIds.delete(first);
  }
}

function persistTabChatState() {
  if (chrome.storage && chrome.storage.session) {
    try { chrome.storage.session.set({ beiTabChatState: Array.from(tabChatState.entries()) }); } catch (e) {}
  }
}

function restoreTabChatState() {
  if (chrome.storage && chrome.storage.session) {
    try {
      chrome.storage.session.get(['beiTabChatState'], (res) => {
        if (res && Array.isArray(res.beiTabChatState)) {
          for (const [tabId, state] of res.beiTabChatState) {
            if (!tabChatState.has(tabId)) tabChatState.set(tabId, state);
          }
        }
      });
    } catch (e) {}
  }
}
restoreTabChatState();

function hashPrompt(str) {
  const s = String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function extractConversationId(url) {
  const u = String(url || '');
  const m = u.match(/\/app\/([a-zA-Z0-9_-]{8,})/) || u.match(/\/c\/([a-zA-Z0-9-]{8,})/);
  return m ? m[1] : null;
}

function isTabWorking(tabId) {
  return busyTabs.has(tabId) || tabStarting.has(tabId);
}

function getTabLoad(tabId) {
  return (isTabWorking(tabId) ? 1 : 0) + ((tabQueues.get(tabId) || []).length);
}

function countSlotLoad(target, slot) {
  const key = getSlotKey(target, slot);
  let n = 0;
  for (const job of activeJobs.values()) {
    if (getSlotKey(job.target, job.accountSlot) === key) n++;
  }
  for (const q of tabQueues.values()) {
    for (const j of q) if (getSlotKey(j.target, j.accountSlot) === key) n++;
  }
  return n;
}

// A slot (account) is busy only when every one of its tabs already has work.
function isSlotBusy(target, slot) {
  const tabs = Math.max(1, slotTabCounts.get(getSlotKey(target, slot)) || 1);
  return countSlotLoad(target, slot) >= tabs;
}

function tabMatchesSlot(tab, target, slot) {
  const u = (tab.url || tab.pendingUrl || '').toLowerCase();
  if (target === 'gemini') {
    if (!u.includes('gemini.google.com')) return false;
    const m = u.match(/\/u\/(\d+)/);
    return (m ? parseInt(m[1], 10) : 0) === slot;
  }
  if (target === 'chatgpt') {
    return u.includes('chatgpt.com') || u.includes('chat.openai.com');
  }
  return false;
}

// Worker tabs for an account: strictly same target + same account slot. Never another account's tab.
async function getWorkerTabs(target, slot) {
  const parsed = (typeof slot === 'number') ? slot : (parseInt(slot, 10) || 0);
  const allTabs = await chrome.tabs.query({});
  let beiGroupIds = new Set();
  if (chrome.tabGroups) {
    try {
      const groups = await chrome.tabGroups.query({ title: 'MythicFrame BEI' });
      beiGroupIds = new Set((groups || []).map(g => g.id));
    } catch (e) {}
  }
  const noGroup = chrome.tabGroups ? chrome.tabGroups.TAB_GROUP_ID_NONE : -1;
  const matches = allTabs.filter(t => t.id && !t.pinned && tabMatchesSlot(t, target, parsed));
  const inBeiGroup = matches.filter(t => beiGroupIds.has(t.groupId));
  // Prefer tabs inside the BEI group; otherwise only ungrouped tabs (never the user's own tab groups).
  const workers = inBeiGroup.length > 0 ? inBeiGroup : matches.filter(t => !t.groupId || t.groupId === noGroup);
  slotTabCounts.set(getSlotKey(target, parsed), workers.length);
  return workers;
}

// Least-loaded tab wins; on a tie prefer the tab whose chat already belongs to this project.
function pickTabForJob(tabs, job) {
  const project = job.projectId || 'default';
  const sameProject = (id) => ((tabChatState.get(id) || {}).projectId === project ? 1 : 0);
  const sorted = [...tabs].sort((a, b) =>
    (getTabLoad(a.id) - getTabLoad(b.id)) ||
    (sameProject(b.id) - sameProject(a.id)) ||
    (a.id - b.id)
  );
  return sorted[0].id;
}

/**
 * Decides whether the job continues the tab's current chat or starts a fresh one.
 * Returns [mode, reason]. Different project => always a new chat.
 */
function decideChatMode(tab, job) {
  const project = job.projectId || 'default';
  const s = tabChatState.get(tab.id);
  if (job.chatSessionMode === 'new_chat') return ['new_chat', 'caller requested a new chat'];
  if (!s) return ['new_chat', 'no tracked chat on this tab yet'];
  if (s.projectId !== project) return ['new_chat', `different project (${s.projectId} -> ${project})`];

  const currentConv = extractConversationId(tab.url || tab.pendingUrl);
  if (s.chatId && currentConv && currentConv !== s.chatId) return ['new_chat', 'tab was moved to another conversation'];
  if (s.lastOutcome === 'refused') return ['new_chat', 'last result was a safety/policy refusal'];
  if (s.lastOutcome === 'stuck') return ['new_chat', 'last generation got stuck or timed out'];
  if (s.badStreak >= CHAT_BAD_STREAK_LIMIT) return ['new_chat', `${s.badStreak} bad results in a row`];
  if (s.lastPromptHash === hashPrompt(job.prompt) && (s.regenCount + 1) >= CHAT_REGEN_LIMIT) {
    return ['new_chat', 'same prompt re-sent repeatedly (results not accepted)'];
  }
  if (s.turns >= CHAT_MAX_TURNS) return ['new_chat', `chat reached ${s.turns} turns (context drift)`];
  if (s.lastUsedAt && (Date.now() - s.lastUsedAt) > CHAT_IDLE_RESET_MS) return ['new_chat', 'chat idle for 45+ min'];
  if (s.lastAspectRatio && job.aspectRatio && s.lastAspectRatio !== job.aspectRatio) {
    return ['new_chat', `aspect ratio changed (${s.lastAspectRatio} -> ${job.aspectRatio}); Gemini tends to repeat the previous ratio in a thread`];
  }
  return ['same_chat', 'same project, chat healthy'];
}

function noteChatTurn(tabId, job, chatMode) {
  const now = Date.now();
  const h = hashPrompt(job.prompt);
  let s = tabChatState.get(tabId);
  if (chatMode === 'new_chat' || !s) {
    s = { projectId: job.projectId || 'default', turns: 0, badStreak: 0, regenCount: 0, lastPromptHash: null, lastOutcome: null, lastAspectRatio: null, chatId: null, createdAt: now };
  }
  s.regenCount = (s.lastPromptHash === h) ? (s.regenCount || 0) + 1 : 0;
  s.lastPromptHash = h;
  s.turns = (s.turns || 0) + 1;
  s.lastUsedAt = now;
  s.lastAspectRatio = job.aspectRatio || s.lastAspectRatio;
  s.lastOutcome = 'running';
  tabChatState.set(tabId, s);
  persistTabChatState();
}

function classifyFailure(text) {
  const t = String(text || '');
  if (/polic|safety|guideline|can['’]?t (help|create|generate|make)|unable to (create|generate|make)|not able to (create|generate)|refus|violat|blocked|not allowed/i.test(t)) return 'refused';
  if (/stuck|no output|timed? ?out|timeout/i.test(t)) return 'stuck';
  return 'failed';
}

// outcome: 'success' | 'failed' | 'rate_limited' | 'user_cancelled' | 'text'
function recordTabOutcome(tabId, outcome, errorText = '') {
  const s = tabChatState.get(tabId);
  if (!s) return;
  s.lastUsedAt = Date.now();
  if (outcome === 'success') {
    s.badStreak = 0;
    s.lastOutcome = 'success';
  } else if (outcome === 'rate_limited') {
    s.lastOutcome = 'rate_limited'; // account quota, not the chat's fault
  } else if (outcome === 'user_cancelled') {
    s.lastOutcome = 'cancelled';
  } else if (outcome === 'text') {
    if (s.lastOutcome === 'running') s.lastOutcome = 'success';
  } else {
    s.lastOutcome = classifyFailure(errorText);
    s.badStreak = (s.badStreak || 0) + 1;
  }
  tabChatState.set(tabId, s);
  persistTabChatState();
}

/** Ends an active job: unlocks its tab, records the chat outcome, starts that tab's next job. */
function finishJob(jobId, outcome, errorText = '') {
  const job = activeJobs.get(jobId);
  if (!job) return null;
  activeJobs.delete(jobId);
  persistSessionJobs();
  if (job.tabId) {
    releaseTab(job.tabId);
    recordTabOutcome(job.tabId, job.isText ? 'text' : outcome, errorText);
    const tabId = job.tabId;
    setTimeout(() => processTabQueue(tabId), NEXT_JOB_SETTLE_MS);
  }
  return job;
}

function stopGenerationOnTab(tabId, jobId) {
  if (!tabId) return;
  try {
    chrome.tabs.sendMessage(tabId, { action: "CANCEL_GENERATION", data: { jobId } }, () => { void chrome.runtime.lastError; });
  } catch (e) {}
  if (chrome.scripting && chrome.scripting.executeScript) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof window.__MYTHIC_BEI_CANCEL__ === 'function') window.__MYTHIC_BEI_CANCEL__();
        if (typeof window.__MYTHIC_BEI_CLICK_STOP_BUTTON__ === 'function') window.__MYTHIC_BEI_CLICK_STOP_BUTTON__();
        const btns = document.querySelectorAll("button[aria-label*='Stop' i], button.stop-button, [aria-label*='Stop response' i]");
        for (const b of btns) { if (b && !b.disabled) b.click(); }
      }
    }).catch(() => {});
  }
}

function removeQueuedJob(jobId) {
  for (const [tabId, q] of tabQueues.entries()) {
    const idx = q.findIndex(j => j.jobId === jobId);
    if (idx !== -1) {
      q.splice(idx, 1);
      return tabId;
    }
  }
  return null;
}

/** Puts a job on exactly one worker tab's queue (opening a tab only if the account has none). */
async function routeJobToTab(job) {
  const tabs = await getWorkerTabs(job.target, job.accountSlot);
  let tabId;
  if (tabs.length === 0) {
    tabId = await findOrCreateTab(job.target, job.accountSlot, job.tabMode, job.bringTabToFront, 'same_chat', job.tabSessionId, job.dispatchMode);
    if (!tabId) throw new Error(`No browser tab found or created for target: ${job.target} (slot: ${job.accountSlot})`);
    slotTabCounts.set(getSlotKey(job.target, job.accountSlot), 1);
  } else {
    tabId = pickTabForJob(tabs, job);
  }

  if (!tabQueues.has(tabId)) tabQueues.set(tabId, []);
  const q = tabQueues.get(tabId);
  if (q.length >= TAB_QUEUE_LIMIT) {
    throw new Error(`Tab queue full for ${job.target} (slot ${job.accountSlot}, tab ${tabId}).`);
  }
  q.push(job);

  const ahead = q.length - 1 + (isTabWorking(tabId) ? 1 : 0);
  if (ahead > 0) {
    emitAuditLog('JOB_QUEUED', `Queued job ${job.jobId} on tab ${tabId} (${ahead} ahead, project: ${job.projectId})`, {
      jobId: job.jobId, tabId, target: job.target, accountSlot: job.accountSlot,
      email: maskEmail(tabEmailsCache.get(tabId)), isBatch: job.dispatchMode === 'multi'
    });
    sendToBridge({
      type: "GENERATION_PROGRESS",
      data: { jobId: job.jobId, step: 'queued', position: ahead, detail: `Queued on tab ${tabId} (${ahead} job(s) ahead)...`, timestamp: Date.now() }
    });
  }
  processTabQueue(tabId);
  return tabId;
}

async function processTabQueue(tabId) {
  if (!tabId || isTabWorking(tabId)) return;
  const q = tabQueues.get(tabId);
  if (!q || q.length === 0) return;
  const job = q.shift();

  if (cancelledJobIds.has(job.jobId)) return processTabQueue(tabId);
  if (job.deadline && Date.now() > job.deadline) {
    emitAuditLog('JOB_EXPIRED', `Dropped job ${job.jobId}: expired while waiting in tab ${tabId} queue`, { jobId: job.jobId, tabId, target: job.target, accountSlot: job.accountSlot });
    sendToBridge({ type: "GENERATION_FAILED", data: { jobId: job.jobId, error: 'Job expired while waiting in the tab queue' } });
    return processTabQueue(tabId);
  }

  tabStarting.add(tabId);
  lockTab(tabId);
  try {
    await startJobOnTab(job, tabId);
    tabStarting.delete(tabId);
  } catch (err) {
    tabStarting.delete(tabId);
    const wasCancelled = cancelledJobIds.has(job.jobId);
    if (activeJobs.has(job.jobId)) {
      finishJob(job.jobId, wasCancelled ? 'user_cancelled' : 'failed', err.message || String(err));
    } else {
      releaseTab(tabId);
      setTimeout(() => processTabQueue(tabId), 200);
    }
    if (!wasCancelled) {
      sendToBridge({ type: "GENERATION_FAILED", data: { jobId: job.jobId, error: err.message || String(err) } });
    }
  }
}

async function prepareWorkerTab(tab, target, slot, chatMode, tabMode, bringTabToFront) {
  const tabId = tab.id;
  await organizeTabIntoBEIGroup(tabId, tabMode, bringTabToFront);
  // Chrome Memory Saver must never discard a worker tab mid-queue.
  try { await chrome.tabs.update(tabId, { autoDiscardable: false }); } catch (e) {}

  if (tab.discarded) {
    try {
      await chrome.tabs.reload(tabId);
      await waitForTabReady(tabId, 15000);
    } catch (e) {}
  }

  const url = tab.url || tab.pendingUrl || '';
  let navigateTo = null;
  if (target === 'gemini') {
    const inApp = /gemini\.google\.com\/(u\/\d+\/)?app/i.test(url);
    const inThread = /\/app\/[a-zA-Z0-9_-]{8,}/.test(url);
    if (!inApp || (chatMode === 'new_chat' && inThread)) navigateTo = `https://gemini.google.com/u/${slot}/app`;
  } else if (target === 'chatgpt') {
    const isClean = /^https?:\/\/(?:chatgpt\.com|chat\.openai\.com)\/?(?:\?.*)?$/i.test(url);
    if (chatMode === 'new_chat' && !isClean) navigateTo = 'https://chatgpt.com/';
  }
  if (navigateTo) {
    try {
      await chrome.tabs.update(tabId, { url: navigateTo });
      await waitForTabReady(tabId, 15000);
      emitAuditLog('TAB_NAVIGATED', `Navigated tab ${tabId} to ${navigateTo} (${chatMode})`, { tabId, target, accountSlot: slot, email: maskEmail(tabEmailsCache.get(tabId)) });
    } catch (e) {}
  }

  // Ghost Mode: only steal focus when explicitly requested
  if (bringTabToFront) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      const info = await chrome.tabs.get(tabId);
      if (info && info.windowId) { try { await chrome.windows.update(info.windowId, { focused: true }); } catch (e) {} }
    } catch (e) {}
  }

  await ensureContentScriptInjected(tabId, target);
}

/** Asks the tab whether it is still watching this job. null = no answer (fresh page / no handler). */
function askTabJobStatus(tabId, jobId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    try {
      chrome.tabs.sendMessage(tabId, { action: 'JOB_STATUS', data: { jobId } }, (resp) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve(null);
        else resolve(resp || null);
      });
    } catch (e) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function startJobOnTab(job, tabId) {
  const { jobId, target, prompt, fullPrompt, images = [], timeoutSeconds, tabMode, bringTabToFront, quality, aspectRatio, modelQuality, accountSlot, dispatchMode, projectId, source } = job;
  if (cancelledJobIds.has(jobId)) throw new Error('Job was cancelled before it started');

  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (e) { throw new Error(`Worker tab ${tabId} no longer exists`); }

  const [chatMode, chatReason] = decideChatMode(tab, job);
  await prepareWorkerTab(tab, target, accountSlot, chatMode, tabMode, bringTabToFront);
  if (cancelledJobIds.has(jobId)) throw new Error('Job was cancelled before it started');

  if (!tabEmailsCache.get(tabId)) {
    try { await extractTabEmail(tabId, target, accountSlot); } catch (e) {}
  }

  activeJobs.set(jobId, {
    tabId, target, prompt, fullPrompt, images, timeoutSeconds, tabMode, bringTabToFront, quality,
    accountSlot, aspectRatio, modelQuality, submitted: false, dispatchMode: dispatchMode || 'single',
    projectId, chatMode, chatReason, receivedAt: job.receivedAt, startedAt: Date.now()
  });
  persistSessionJobs();
  noteChatTurn(tabId, job, chatMode);

  emitAuditLog("PROMPT_DISPATCHED", `Dispatched prompt to ${target} tab ${tabId} (slot ${accountSlot}, chat: ${chatMode} - ${chatReason}, project: ${projectId}, source: ${source || 'unknown'}, batch: ${dispatchMode === 'multi'})`, {
    jobId, tabId, target, accountSlot,
    email: maskEmail(tabEmailsCache.get(tabId)),
    promptSummary: prompt ? prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '') : '',
    promptLength: prompt ? prompt.length : 0,
    isBatch: dispatchMode === 'multi'
  });

  sendToBridge({
    type: "GENERATION_PROGRESS",
    data: {
      jobId,
      step: "tab_routed",
      detail: `Routed to ${target} tab ${tabId} (slot /u/${accountSlot}/, ${chatMode === 'new_chat' ? 'new chat' : 'same chat'}: ${chatReason}, AR: ${aspectRatio})...`,
      timestamp: Date.now()
    }
  });

  const live = activeJobs.get(jobId);
  if (live) live.dispatching = true;
  try {
    await dispatchPromptToTab(tabId, jobId, target, prompt, timeoutSeconds, accountSlot, images, tabMode, bringTabToFront, aspectRatio, quality, modelQuality, chatMode);
  } finally {
    const j = activeJobs.get(jobId);
    if (j) j.dispatching = false;
  }
}

/**
 * Drops queued/running jobs the server no longer tracks (it timed out, was cancelled,
 * or restarted). Prevents stale prompts from being sent minutes later.
 */
function reconcileWithServer(pendingJobIds) {
  if (!Array.isArray(pendingJobIds)) return;
  const pending = new Set(pendingJobIds);
  const now = Date.now();
  const GRACE_MS = 15000;
  for (const [tabId, q] of tabQueues.entries()) {
    for (let i = q.length - 1; i >= 0; i--) {
      const j = q[i];
      if (!pending.has(j.jobId) && (now - (j.receivedAt || 0)) > GRACE_MS) {
        q.splice(i, 1);
        rememberCancelled(j.jobId);
        emitAuditLog('JOB_DROPPED', `Dropped queued job ${j.jobId} on tab ${tabId}: server no longer waiting for it`, { jobId: j.jobId, tabId, target: j.target, accountSlot: j.accountSlot });
      }
    }
  }
  for (const [jobId, job] of Array.from(activeJobs.entries())) {
    if (!pending.has(jobId) && (now - (job.startedAt || job.receivedAt || 0)) > GRACE_MS) {
      rememberCancelled(jobId);
      stopGenerationOnTab(job.tabId, jobId);
      emitAuditLog('JOB_DROPPED', `Stopped job ${jobId} on tab ${job.tabId}: server no longer waiting for it`, { jobId, tabId: job.tabId, target: job.target, accountSlot: job.accountSlot });
      finishJob(jobId, 'failed', 'stuck: server gave up on this job');
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
    const { target = "gemini", accountSlot = 0, bringTabToFront = false } = data || {};
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
    try {
      const tabId = await findOrCreateTab(target, parsedSlot, 'same_window_group', Boolean(bringTabToFront), 'same_chat');
      if (tabId) {
        if (bringTabToFront) {
          await chrome.tabs.update(tabId, { active: true });
          const tab = await chrome.tabs.get(tabId);
          if (tab && tab.windowId) {
            try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
          }
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

  if (type === "SWITCH_AND_VERIFY_TAB") {
    const { target = "gemini", accountSlot = 0, tabId: requestedTabId, reqId, bringTabToFront = false } = data || {};
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
    try {
      let tabId = requestedTabId;
      if (!tabId) {
        tabId = await findOrCreateTab(target, parsedSlot, 'same_window_group', Boolean(bringTabToFront), 'same_chat');
      }
      if (!tabId) throw new Error(`Could not find or open tab for ${target} slot ${parsedSlot}`);

      // Silent Mode: only activate tab / window if explicitly requested
      if (bringTabToFront) {
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.windowId) {
          try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
        }
      }

      await ensureContentScriptInjected(tabId, target);
      await new Promise(r => setTimeout(r, 300));

      // 2. Query tab state & harvest any finished image
      chrome.tabs.sendMessage(tabId, { action: "VERIFY_AND_HARVEST_IMAGE" }, (res) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr || !res) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "TAB_VERIFIED",
              data: {
                reqId,
                success: false,
                tabId,
                target,
                accountSlot: parsedSlot,
                error: (lastErr && lastErr.message) || 'No response from content script'
              }
            }));
          }
        } else {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "TAB_VERIFIED",
              data: {
                reqId,
                success: true,
                tabId,
                target,
                accountSlot: parsedSlot,
                isGenerating: Boolean(res.isGenerating),
                hasImage: Boolean(res.hasImage),
                image: res.image || null,
                url: res.url,
                title: res.title
              }
            }));
          }
        }
      });
    } catch (err) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "TAB_VERIFIED",
          data: { reqId, success: false, error: err.message }
        }));
      }
    }
    return;
  }

  if (type === "FETCH_LIBRARY_ASSETS") {
    const { target = "gemini", accountSlot = 0, limit = 5 } = data || {};
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);
    let tempTabId = null;
    try {
      const allTabs = await chrome.tabs.query({});
      let libTab = allTabs.find(t => {
        const u = (t.url || '').toLowerCase();
        return u.includes(`gemini.google.com/u/${parsedSlot}/library`) || (parsedSlot === 0 && u.includes('gemini.google.com/library'));
      });
      if (!libTab) {
        libTab = allTabs.find(t => (t.url || '').toLowerCase().includes('gemini.google.com/library'));
      }
      if (!libTab) {
        libTab = await chrome.tabs.create({
          url: `https://gemini.google.com/u/${parsedSlot}/library`,
          active: false
        });
        tempTabId = libTab.id;
        await waitForTabReady(libTab.id, 15000);
      }
      await ensureContentScriptInjected(libTab.id, "gemini");
      await new Promise(r => setTimeout(r, 1200));

      chrome.tabs.sendMessage(libTab.id, {
        action: "EXTRACT_LIBRARY_ASSETS",
        data: { limit, accountSlot: parsedSlot }
      }, (res) => {
        if (tempTabId) {
          try { chrome.tabs.remove(tempTabId); } catch (e) {}
        }
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
      if (tempTabId) {
        try { chrome.tabs.remove(tempTabId); } catch (e) {}
      }
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
    const { jobId, target = "gemini", prompt, projectId = 'default', source = 'unknown', fullPrompt, aspectRatio, modelQuality, timeoutSeconds, images = [], tabMode = 'same_window_group', bringTabToFront = false, chatSessionMode = 'same_chat', tabSessionId = null, quality = 'ultra_original', dispatchMode = 'single', preferredEmail, email } = data;
    let parsedSlot = (typeof data.accountSlot === 'number') ? data.accountSlot : undefined;

    applyTierOverrides(data.proEmails, data.tierOverrides);
    if (Array.isArray(data.priorityOrder)) {
      lastAccountPriorityOrder = data.priorityOrder.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    }

    // Account selection:
    //   1. An explicitly named account (preferredEmail) is always honored.
    //   2. Gemini: Pro accounts first (idle, then busy/queued), then unknown/Free in Settings priority order.
    //      The slot sent by the caller is only a tie-break hint.
    let routeReason = '';
    const targetEmail = (preferredEmail || email || '').trim().toLowerCase();
    let pinnedByEmail = false;
    if (targetEmail) {
      for (const [s, acc] of knownGoogleAccounts.entries()) {
        if (acc && acc.email && acc.email.toLowerCase() === targetEmail) {
          parsedSlot = s;
          pinnedByEmail = true;
          routeReason = `requested account ${maskEmail(acc.email)}`;
          break;
        }
      }
    }
    if (!pinnedByEmail && target === 'gemini') {
      const choice = chooseGeminiAccount(parsedSlot, dispatchMode);
      if (choice) {
        parsedSlot = choice.slot;
        routeReason = `${choice.reason} [accounts: ${choice.summary}]`;
      }
    }
    if (parsedSlot === undefined) parsedSlot = 0;
    if (target === 'gemini') {
      const chosen = knownGoogleAccounts.get(parsedSlot);
      emitAuditLog('ACCOUNT_SELECTED', `Job ${jobId} -> slot ${parsedSlot} (${getAccountTier(chosen)}): ${routeReason || 'default slot'}`, {
        jobId, target, accountSlot: parsedSlot, email: maskEmail(chosen?.email), isBatch: dispatchMode === 'multi'
      });
    }

    // Multi-Account Mode: Route to an idle account slot when multi mode is active and current slot is busy
    // (Gemini already picked an idle account above when one exists; never move off an explicitly requested email.)
    if (dispatchMode === 'multi' && !pinnedByEmail && target !== 'gemini' && isSlotBusy(target, parsedSlot)) {
      console.log(`[MythicFrame BEI Worker] Multi-Account Mode: Slot ${target}:${parsedSlot} is busy. Finding idle account slot...`);
      const knownSlots = Array.from(knownGoogleAccounts.keys());
      const candidateSlots = knownSlots.length > 0 ? knownSlots : [0, 1, 2, 3];
      const idleSlot = candidateSlots.find(s => !isSlotBusy(target, s) && !isSlotExhausted(target, s));
      if (idleSlot !== undefined) {
        console.log(`[MythicFrame BEI Worker] Multi-Account Mode: Auto-routed job ${jobId} to idle slot ${idleSlot} for parallel execution!`);
        emitAuditLog('BATCH_SLOT_ASSIGNED', `Auto-routed batch job ${jobId} to idle slot ${idleSlot}`, {
          jobId,
          target,
          accountSlot: idleSlot,
          isBatch: true,
          email: maskEmail(knownGoogleAccounts.get(idleSlot)?.email)
        });
        parsedSlot = idleSlot;
      }
    }

    // Per-tab queues: the job goes to exactly ONE worker tab of this account (least loaded).
    // Tabs of the same account work in parallel; each tab runs its own queue in order.
    const receivedAt = Date.now();
    const jobData = {
      jobId, target, prompt, fullPrompt, aspectRatio, modelQuality, accountSlot: parsedSlot, timeoutSeconds, images,
      tabMode, bringTabToFront, chatSessionMode, tabSessionId, quality, dispatchMode,
      projectId: projectId || 'default', source, receivedAt,
      deadline: receivedAt + 30 * 60 * 1000 // hard safety net; the server normally cancels much earlier
    };
    try {
      await routeJobToTab(jobData);
    } catch (err) {
      removeQueuedJob(jobId);
      sendToBridge({ type: "GENERATION_FAILED", data: { jobId, error: err.message || String(err) } });
    }
    return;
  }

  if (type === "EXECUTE_TEXT_PROMPT") {
    const { jobId, target = "gemini", prompt, accountSlot = 0, timeoutSeconds = 60, tabMode = 'new_window_group', bringTabToFront = false, images = [] } = data;
    const parsedSlot = (typeof accountSlot === 'number') ? accountSlot : (parseInt(accountSlot, 10) || 0);

    let tabId = null;
    try {
      // In text mode, reuse current active tab
      tabId = await findOrCreateTab(target, parsedSlot, tabMode, bringTabToFront, 'same_chat');
      if (!tabId) throw new Error(`No browser tab found for ${target} slot ${parsedSlot}`);

      lockTab(tabId);
      activeJobs.set(jobId, { tabId, target, prompt, accountSlot: parsedSlot, isText: true, startedAt: Date.now() });

      chrome.tabs.sendMessage(tabId, {
        action: "EXECUTE_TEXT_PROMPT",
        data: { jobId, prompt, timeoutSeconds, images }
      }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn("[MythicFrame BEI] Direct message warning for text prompt:", chrome.runtime.lastError);
        }
      });
    } catch (err) {
      if (tabId) releaseTab(tabId);
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
    const reason = data?.reason || 'user';
    if (jobId) {
      // Single job: touch ONLY that job's tab. Other tabs keep generating.
      rememberCancelled(jobId);
      const queuedOn = removeQueuedJob(jobId);
      if (queuedOn) {
        console.log(`[MythicFrame BEI Worker] Removed cancelled job ${jobId} from tab ${queuedOn} queue (${reason})`);
        emitAuditLog('JOB_DEQUEUED', `Removed job ${jobId} from tab ${queuedOn} queue (${reason})`, { jobId, tabId: queuedOn });
      }
      const job = activeJobs.get(jobId);
      if (job) {
        stopGenerationOnTab(job.tabId, jobId);
        finishJob(jobId, reason === 'timeout' ? 'failed' : 'user_cancelled', reason === 'timeout' ? 'timed out (stuck)' : '');
      }
    } else {
      // Cancel all: clear every tab queue and stop every BEI tab.
      for (const q of tabQueues.values()) for (const j of q) rememberCancelled(j.jobId);
      tabQueues.clear();
      for (const [id, job] of Array.from(activeJobs.entries())) {
        rememberCancelled(id);
        stopGenerationOnTab(job.tabId, id);
        finishJob(id, 'user_cancelled');
      }
      busyTabs.clear();
      chrome.tabs.query({}).then(tabs => {
        for (const tab of tabs) {
          if (tab.id && tab.url && (tab.url.includes("gemini.google.com") || tab.url.includes("chatgpt.com"))) {
            stopGenerationOnTab(tab.id);
          }
        }
      });
    }
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
      const st = job.tabId ? tabChatState.get(job.tabId) : null;
      const conv = extractConversationId(chatUrl);
      if (st && conv) { st.chatId = conv; persistTabChatState(); }
      console.log(`[MythicFrame BEI] Job ${jobId} marked as submitted (chatUrl: ${chatUrl}).`);
    }
    sendResponse({ ack: true });
    return true;
  }

  if (message.type === "GENERATION_COMPLETED") {
    let { jobId, image, target, metadata } = message.data;
    // Ends the job, records a good result for this tab's chat, and starts the tab's next job.
    const job = finishJob(jobId, 'success');
    if (!job) {
      // Second delivery for a job that already completed (or was cancelled): never forward it.
      console.log(`[MythicFrame BEI] Ignoring duplicate GENERATION_COMPLETED for ${jobId} (${metadata?.retrievalMethod || 'unknown'}).`);
      sendResponse({ ack: true, ignored: true });
      return true;
    }
    {
      const sizeKB = typeof image === 'string' ? Math.round(image.length / 1024) : 0;
      const method = metadata?.retrievalMethod || 'unknown';
      const isUrl = typeof image === 'string' && !image.startsWith('data:');
      const small = !isUrl && sizeKB > 0 && sizeKB < 300;
      emitAuditLog(small ? 'IMAGE_CAPTURED_SMALL' : 'IMAGE_CAPTURED',
        `Job ${jobId} image captured on tab ${job.tabId}: ${method}, ${isUrl ? 'url' : sizeKB + ' KB'}${metadata?.width ? `, ${metadata.width}x${metadata.height}` : ''}${small ? ' (small: likely a preview, not the full-size master)' : ''}`,
        { jobId, tabId: job.tabId, target: job.target, accountSlot: job.accountSlot, email: maskEmail(tabEmailsCache.get(job.tabId)) });
    }
    if (job && metadata) {
      metadata.tabId = job.tabId;
      metadata.chatSessionMode = job.chatMode;
      metadata.chatDecision = job.chatReason;
      metadata.projectId = job.projectId;
    }
    if (job && job.tabId && metadata && (metadata.chatUrl || metadata.conversationUrl)) {
      const st = tabChatState.get(job.tabId);
      const conv = extractConversationId(metadata.chatUrl || metadata.conversationUrl);
      if (st && conv) { st.chatId = conv; persistTabChatState(); }
    }

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
    finishJob(jobId, 'text');
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
    finishJob(jobId, 'text');
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
    const { jobId, error, isRateLimited } = message.data;
    const rateLimited = Boolean(isRateLimited || /quota|limit reached|limit resets|rate limit/i.test(error || ''));
    const job = finishJob(jobId, rateLimited ? 'rate_limited' : 'failed', error);

    // If quota or rate limit exceeded, mark slot as exhausted
    if (rateLimited && job && job.target) {
      markSlotExhausted(job.target, job.accountSlot ?? 0);
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
    const { target, email, accountSlot, tier, capabilities } = message.data || {};
    if (sender?.tab?.id && email && !isSystemEmail(email)) {
      tabEmailsCache.set(sender.tab.id, email);
      if (target === "gemini") {
        const slot = accountSlot !== undefined ? accountSlot : 0;
        upsertAccount(slot, capabilities ? { slot, email, name: email, tier, capabilities } : { slot, email, name: email, tier });
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
    // In-page "stuck with no output" cancels count as a bad result for this chat.
    finishJob(jobId, /stuck|no output|timed? ?out/i.test(reason || '') ? 'failed' : 'user_cancelled', reason || '');

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

    // Reload Recovery: only for a REAL reload. Gemini also fires "complete" when it changes the URL
    // to /app/<chat id> after submission; the page's own watcher is still running then, and starting
    // a second one returned half-rendered previews (and re-sent prompts -> duplicates).
    for (const [jobId, job] of Array.from(activeJobs.entries())) {
      if (job.tabId === tabId) {
        if (job.isText || job.dispatching) continue; // dispatchPromptToTab handles its own reloads
        const status = await askTabJobStatus(tabId, jobId);
        if (status && status.running) {
          console.log(`[MythicFrame BEI] Tab ${tabId} URL changed but job ${jobId} is still running in the page. No recovery needed.`);
          continue;
        }
        if (!activeJobs.has(jobId)) continue; // finished while we were asking
        console.log(`[MythicFrame BEI] Tab ${tabId} reloaded with active job ${jobId} (submitted: ${job.submitted}). Initiating recovery...`);
        emitAuditLog('JOB_RECOVERY', `Tab ${tabId} reloaded during job ${jobId} (submitted: ${Boolean(job.submitted)}); recovering`, { jobId, tabId, target: job.target, accountSlot: job.accountSlot });
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
              modelQuality: job.modelQuality,
              images: job.images || []
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
  releaseTab(tabId);
  const cachedEmail = tabEmailsCache.get(tabId);
  tabEmailsCache.delete(tabId);
  tabChatState.delete(tabId);
  persistTabChatState();
  let activeJobFound = false;

  // Jobs still waiting on the closed tab move to another tab of the same account.
  const orphaned = tabQueues.get(tabId) || [];
  tabQueues.delete(tabId);
  for (const job of orphaned) {
    routeJobToTab(job).catch(err => {
      sendToBridge({ type: "GENERATION_FAILED", data: { jobId: job.jobId, error: `Tab closed and re-routing failed: ${err.message || err}` } });
    });
  }

  for (const [jobId, job] of activeJobs.entries()) {
    if (job.tabId === tabId) {
      activeJobFound = true;
      const target = job.target;
      const slot = job.accountSlot;
      activeJobs.delete(jobId);
      persistSessionJobs();
      emitAuditLog("TAB_CLOSED", `Tab ${tabId} was closed while executing job ${jobId}`, {
        tabId,
        target,
        accountSlot: slot,
        email: maskEmail(cachedEmail),
        jobId,
        reason: "closed_during_generation"
      });
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "GENERATION_FAILED",
          data: { jobId, error: "Browser tab was closed during generation" }
        }));
      }
    }
  }

  if (!activeJobFound) {
    emitAuditLog("TAB_CLOSED", `Tab ${tabId} was closed`, {
      tabId,
      email: maskEmail(cachedEmail),
      reason: "user_or_browser_closed"
    });
  }
});

// Start initial connection and tab injection
connectBridge();
