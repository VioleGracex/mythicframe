/**
 * MythicFrame BEI Bridge - Popup Logic
 * Controls localhost launchers, project folder persistence, and account email discovery.
 */

const BRIDGE_PORT = 58925;
const STUDIO_PORT = 3488;
const DEFAULT_PROJECT_DIR = "D:\\GeminiWeb\\mythicframe";

async function checkBridgeStatus() {
  const badge = document.getElementById('statusBadge');
  
  // 1. First probe background worker directly via messaging
  let workerConnected = false;
  try {
    const workerStatus = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_WORKER_STATUS' }, (resp) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(resp);
      });
    });
    if (workerStatus && workerStatus.wsConnected) {
      workerConnected = true;
    }
  } catch (e) {}

  // 2. Also probe HTTP status endpoint
  let httpOk = false;
  const urls = [
    `http://127.0.0.1:${BRIDGE_PORT}/api/bei/status`,
    `http://localhost:${BRIDGE_PORT}/api/bei/status`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        httpOk = true;
        const data = await res.json();
        if (data.connected || workerConnected) {
          badge.textContent = 'Connected';
          badge.className = 'badge badge-connected';
        } else {
          badge.textContent = 'Bridge Up (No Tab)';
          badge.className = 'badge badge-connected';
        }
        return data;
      }
    } catch (e) {}
  }

  if (workerConnected) {
    badge.textContent = 'Connected (WS)';
    badge.className = 'badge badge-connected';
  } else {
    badge.textContent = 'Offline';
    badge.className = 'badge badge-disconnected';
  }
  return null;
}

async function updateTabs() {
  const geminiStatus = document.getElementById('geminiTabStatus');
  const chatgptStatus = document.getElementById('chatgptTabStatus');
  const geminiEmail = document.getElementById('geminiEmail');
  const chatgptEmail = document.getElementById('chatgptEmail');

  chrome.runtime.sendMessage({ type: 'QUERY_TABS_STATUS' }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.tabs) {
      geminiStatus.textContent = 'Scanning...';
      chatgptStatus.textContent = 'Scanning...';
      return;
    }

    const tabs = resp.tabs || [];
    const geminiTab = tabs.find(t => t.target === 'gemini');
    const accounts = resp.accounts || [];

    if (geminiTab) {
      geminiStatus.textContent = 'Active (Ready)';
      geminiStatus.className = 'target-status status-online';
      const email = geminiTab.email || (accounts.find(a => a.slot === (geminiTab.accountSlot || 0))?.email);
      if (email) {
        geminiEmail.textContent = `📧 ${email}`;
        geminiEmail.className = 'account-email font-mono account-detected';
      } else {
        geminiEmail.textContent = `Scanning email...`;
        geminiEmail.className = 'account-email font-mono text-slate-400';
      }
    } else {
      const defaultAcc = accounts[0];
      geminiStatus.textContent = 'Not Open';
      geminiStatus.className = 'target-status status-offline';
      geminiEmail.textContent = defaultAcc?.email ? `📧 ${defaultAcc.email} (Opens on generate)` : 'Auto-opens in background on generate';
      geminiEmail.className = 'account-email font-mono text-slate-400';
    }

    if (chatgptTab) {
      chatgptStatus.textContent = 'Active (Ready)';
      chatgptStatus.className = 'target-status status-online';
      if (chatgptTab.email) {
        chatgptEmail.textContent = `📧 ${chatgptTab.email}`;
        chatgptEmail.className = 'account-email font-mono account-detected';
      } else {
        chatgptEmail.textContent = 'Session Connected';
        chatgptEmail.className = 'account-email font-mono text-slate-300';
      }
    } else {
      chatgptStatus.textContent = 'Not Detected';
      chatgptStatus.className = 'target-status status-offline';
      chatgptEmail.textContent = 'Will auto-open in Chrome on generation';
      chatgptEmail.className = 'account-email font-mono text-slate-500';
    }
  });
}

function loadProjectDirectory() {
  const dirInput = document.getElementById('projectDirInput');
  const saveStatus = document.getElementById('saveStatus');

  chrome.storage.local.get(['mythicProjectDir'], (result) => {
    if (result && result.mythicProjectDir) {
      dirInput.value = result.mythicProjectDir;
    } else {
      dirInput.value = DEFAULT_PROJECT_DIR;
    }
    saveStatus.style.display = 'none';
  });
}

function saveProjectDirectory() {
  const dirInput = document.getElementById('projectDirInput');
  const saveStatus = document.getElementById('saveStatus');
  const path = dirInput.value.trim() || DEFAULT_PROJECT_DIR;

  chrome.storage.local.set({ mythicProjectDir: path }, () => {
    chrome.runtime.sendMessage({ type: 'SET_PROJECT_DIR', projectDir: path });
    saveStatus.textContent = 'Saved!';
    saveStatus.style.display = 'inline-block';
    setTimeout(() => {
      saveStatus.style.display = 'none';
    }, 2000);
  });
}

function copyProjectDirectory() {
  const dirInput = document.getElementById('projectDirInput');
  navigator.clipboard.writeText(dirInput.value.trim()).then(() => {
    const saveStatus = document.getElementById('saveStatus');
    saveStatus.textContent = 'Copied!';
    saveStatus.style.display = 'inline-block';
    setTimeout(() => {
      saveStatus.style.display = 'none';
    }, 2000);
  });
}


function loadPerformanceMetrics() {
  const workerHeapText = document.getElementById('workerHeapText');
  const activeTabsRamText = document.getElementById('activeTabsRamText');
  const systemRamText = document.getElementById('systemRamText');

  chrome.runtime.sendMessage({ type: 'GET_PERFORMANCE_METRICS' }, (metrics) => {
    if (chrome.runtime.lastError || !metrics) {
      if (workerHeapText) workerHeapText.textContent = '~20 MB (Idle)';
      if (activeTabsRamText) activeTabsRamText.textContent = '0 open (0 MB)';
      if (systemRamText) systemRamText.textContent = 'Normal';
      return;
    }

    if (workerHeapText) {
      workerHeapText.textContent = metrics.workerHeapMB 
        ? `${metrics.workerHeapMB} MB (Heap)` 
        : '< 25 MB (Idle)';
    }

    if (activeTabsRamText) {
      const activeCount = (metrics.tabsCount?.geminiActive || 0) + (metrics.tabsCount?.chatgptActive || 0);
      const discardedCount = (metrics.tabsCount?.geminiDiscarded || 0) + (metrics.tabsCount?.chatgptDiscarded || 0);
      if (activeCount === 0 && discardedCount === 0) {
        activeTabsRamText.textContent = '0 open (0 MB)';
      } else if (activeCount === 0 && discardedCount > 0) {
        activeTabsRamText.textContent = `0 active (${discardedCount} hibernated)`;
      } else {
        const hibernatedSuffix = discardedCount > 0 ? ` (${discardedCount} hibernated)` : '';
        activeTabsRamText.textContent = `${activeCount} active (~${metrics.estimatedTabRamMB} MB)${hibernatedSuffix}`;
      }
    }

    if (systemRamText) {
      if (metrics.systemMemory) {
        systemRamText.textContent = `${metrics.systemMemory.availableGB}GB free / ${metrics.systemMemory.totalGB}GB (${metrics.systemMemory.usedPercent}% used)`;
      } else {
        systemRamText.textContent = 'Available';
      }
    }
  });
}

function hibernateInactiveTabs() {
  const btn = document.getElementById('hibernateTabsBtn');
  const perfStatusBadge = document.getElementById('perfStatusBadge');
  if (btn) btn.disabled = true;

  chrome.runtime.sendMessage({ type: 'DISCARD_BEI_TABS' }, (resp) => {
    if (btn) btn.disabled = false;
    const freed = resp?.freedRamMBEstimate || 0;
    const count = resp?.discardedCount || 0;

    if (perfStatusBadge) {
      perfStatusBadge.textContent = count > 0 ? `Freed ~${freed} MB!` : 'All Tabs Clear';
      perfStatusBadge.style.display = 'inline-block';
      setTimeout(() => {
        perfStatusBadge.style.display = 'none';
      }, 2500);
    }
    loadPerformanceMetrics();
    updateTabs();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProjectDirectory();
  checkBridgeStatus();
  updateTabs();
  loadPerformanceMetrics();

  // Localhost Launchers
  async function launchOrOpenStudio() {
    const btn = document.getElementById('openStudioBtn');
    const feedback = document.getElementById('launcherFeedback');
    const originalHtml = btn.innerHTML;

    const showFeedback = (text, isError = false) => {
      if (feedback) {
        feedback.textContent = text;
        feedback.style.display = 'block';
        feedback.style.color = isError ? '#f87171' : '#a78bfa';
      }
    };

    // 1. First probe if MythicFrame Studio is already alive and running
    let isAlive = false;
    try {
      const res = await fetch(`http://127.0.0.1:${STUDIO_PORT}/api/bei/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(1000)
      });
      if (res.ok) isAlive = true;
    } catch (e) {}

    if (!isAlive) {
      try {
        const res2 = await fetch(`http://localhost:${STUDIO_PORT}/api/bei/status`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(1000)
        });
        if (res2.ok) isAlive = true;
      } catch (e) {}
    }

    // If already alive: focus or open existing studio tab immediately
    if (isAlive) {
      chrome.tabs.query({ url: [`*://localhost:${STUDIO_PORT}/*`, `*://127.0.0.1:${STUDIO_PORT}/*`] }, (tabs) => {
        if (tabs && tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { active: true });
          if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
          chrome.tabs.create({ url: `http://localhost:${STUDIO_PORT}` });
        }
      });
      return;
    }

    // 2. Server is offline: initiate localhost launcher via Windows protocol handler
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-icon">⏳</span><span>Starting Server...</span>`;
    showFeedback('Launching MythicFrame backend server (mythicframe://)...');

    try {
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      frame.src = 'mythicframe://launch';
      document.body.appendChild(frame);
      setTimeout(() => frame.remove(), 4000);
    } catch (e) {
      console.warn('Protocol launch iframe error:', e);
    }

    // Also try native messaging host if registered
    try {
      chrome.runtime.sendNativeMessage('com.mythicframe.launcher', { action: 'launch' }, () => {
        chrome.runtime.lastError;
      });
    } catch (e) {}

    // 3. Poll localhost health until port 3488 answers with 200 OK
    const startTime = Date.now();
    const pollTimer = setInterval(async () => {
      let ready = false;
      try {
        const ping = await fetch(`http://127.0.0.1:${STUDIO_PORT}/api/bei/status`, {
          method: 'GET',
          signal: AbortSignal.timeout(800)
        });
        if (ping.ok) ready = true;
      } catch (e) {}

      if (ready) {
        clearInterval(pollTimer);
        btn.innerHTML = `<span class="btn-icon">✓</span><span>Ready! Opening...</span>`;
        showFeedback('Server online! Opening MythicFrame Studio...');
        setTimeout(() => {
          chrome.tabs.create({ url: `http://localhost:${STUDIO_PORT}` });
          btn.disabled = false;
          btn.innerHTML = originalHtml;
          checkBridgeStatus();
          setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 3000);
        }, 700);
        return;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      btn.innerHTML = `<span class="btn-icon">⏳</span><span>Starting Server (${elapsed}s)...</span>`;

      if (elapsed > 25) {
        clearInterval(pollTimer);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        showFeedback('⚠️ Server not responding. Run run.bat in project folder once to start and register 1-click launcher.', true);
      }
    }, 900);
  }

  document.getElementById('openStudioBtn').addEventListener('click', launchOrOpenStudio);

  document.getElementById('openBridgeBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: `http://localhost:${BRIDGE_PORT}/api/bei/status` });
  });

  // Project Folder settings
  document.getElementById('saveProjectDirBtn').addEventListener('click', saveProjectDirectory);
  document.getElementById('copyProjectDirBtn').addEventListener('click', copyProjectDirectory);

  // Tabs management
  document.getElementById('openGeminiBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://gemini.google.com/u/0/app' });
  });

  document.getElementById('openChatgptBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chatgpt.com/' });
  });

  // Performance / Memory Management
  document.getElementById('hibernateTabsBtn')?.addEventListener('click', hibernateInactiveTabs);

  // Selector Health Diagnostic
  async function runSelectorDiagnostic() {
    const btn = document.getElementById('runDiagnosticBtn');
    const resultsDiv = document.getElementById('diagnosticResults');
    const hint = document.getElementById('diagnosticHint');
    const diagComposer = document.getElementById('diagComposer');
    const diagSend = document.getElementById('diagSend');
    const diagUpload = document.getElementById('diagUpload');

    if (btn) btn.textContent = 'Testing...';
    if (resultsDiv) resultsDiv.style.display = 'grid';

    try {
      const tabs = await chrome.tabs.query({ url: '*://gemini.google.com/*' });
      if (!tabs || tabs.length === 0) {
        if (hint) hint.textContent = '⚠️ No Google Gemini tab open in Chrome. Open Gemini first.';
        if (diagComposer) { diagComposer.textContent = 'Tab Missing'; diagComposer.style.color = '#f87171'; }
        if (diagSend) { diagSend.textContent = 'Tab Missing'; diagSend.style.color = '#f87171'; }
        if (diagUpload) { diagUpload.textContent = 'Tab Missing'; diagUpload.style.color = '#f87171'; }
        if (btn) btn.textContent = 'Run Test';
        return;
      }

      const activeGeminiTab = tabs[0];
      chrome.tabs.sendMessage(activeGeminiTab.id, { action: 'CHECK_SELECTOR_HEALTH' }, (resp) => {
        if (btn) btn.textContent = 'Run Test';
        if (chrome.runtime.lastError || !resp || !resp.selectors) {
          if (hint) hint.textContent = '⚠️ Could not reach Gemini tab. Refresh the tab or wait for it to load.';
          return;
        }
        const s = resp.selectors;
        if (diagComposer) {
          diagComposer.textContent = s.composer.ok ? '✓ OK' : '✗ Missed';
          diagComposer.style.color = s.composer.ok ? '#4ade80' : '#f87171';
        }
        if (diagSend) {
          diagSend.textContent = s.sendButton.ok ? '✓ OK' : '✗ Missed';
          diagSend.style.color = s.sendButton.ok ? '#4ade80' : '#f87171';
        }
        if (diagUpload) {
          diagUpload.textContent = s.uploadTrigger.ok ? '✓ OK' : '✗ Missed';
          diagUpload.style.color = s.uploadTrigger.ok ? '#4ade80' : '#f87171';
        }
        if (hint) {
          const allOk = s.composer.ok && s.sendButton.ok && s.uploadTrigger.ok;
          hint.textContent = allOk 
            ? `✓ All DOM selectors healthy on Tab #${activeGeminiTab.id}. Ready for generation!`
            : `⚠️ Some selectors missed. Dynamic multi-fallbacks are engaged.`;
        }
      });
    } catch (err) {
      if (btn) btn.textContent = 'Run Test';
      if (hint) hint.textContent = `Diagnostic error: ${err.message}`;
    }
  }

  document.getElementById('runDiagnosticBtn')?.addEventListener('click', runSelectorDiagnostic);

  // Reconnect & Refresh
  document.getElementById('reconnectBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RECONNECT_BRIDGE' });
    setTimeout(() => {
      checkBridgeStatus();
      updateTabs();
      loadPerformanceMetrics();
    }, 800);
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    checkBridgeStatus();
    updateTabs();
    loadPerformanceMetrics();
  });

  document.getElementById('reloadExtBtn')?.addEventListener('click', () => {
    chrome.runtime.reload();
  });
});
