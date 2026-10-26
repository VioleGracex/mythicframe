/**
 * MythicFrame BEI Bridge - ChatGPT Web Content Script
 * Injected into https://chatgpt.com/*
 * Resilient against context reloads, tab navigation, and service worker restarts.
 */

(() => {
  const protocol = globalThis.__MYTHIC_BEI__ || {
    isGeneratedImage: (img) => img && (img.src || '').includes('oai'),
    imageToBase64: async (img) => img.src,
    fetchBlobAsBase64: async (url) => url
  };

  console.log('[MythicFrame BEI] ChatGPT content script attached.');

  // ─── FAKE ACTIVE MODE ────────────────────────────────────────────────────────
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
    window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  } catch (e) {}

  let silentAudioCtx = null;
  function ensureBackgroundCpuAwake() {
    try {
      // Chrome Autoplay Policy Guard: Never instantiate or resume AudioContext without user activation
      if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) {
        return;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass && (!silentAudioCtx || silentAudioCtx.state === 'closed')) {
        silentAudioCtx = new AudioContextClass();
        const osc = silentAudioCtx.createOscillator();
        const gain = silentAudioCtx.createGain();
        gain.gain.value = 0.00001;
        osc.connect(gain);
        gain.connect(silentAudioCtx.destination);
        try {
          osc.start();
        } catch (e) {}
        if (silentAudioCtx.state === 'suspended') {
          silentAudioCtx.resume().catch(() => {});
        }
      }
    } catch (e) {}
  }

  // Defer AudioContext background wake until user interaction to comply with Chrome Autoplay policy
  try {
    const onUserInteraction = () => {
      ensureBackgroundCpuAwake();
    };
    window.addEventListener('click', onUserInteraction, { capture: true, passive: true, once: true });
    window.addEventListener('keydown', onUserInteraction, { capture: true, passive: true, once: true });
  } catch (e) {}

  function reportProgress(jobId, step, detail) {
    if (!jobId) return;
    try {
      console.log(`[MythicFrame BEI Progress] [${step}] ${detail}`);
      chrome.runtime.sendMessage({
        type: 'GENERATION_PROGRESS',
        data: {
          jobId,
          step,
          detail,
          timestamp: Date.now()
        }
      });
    } catch (e) {}
  }

  const COMPOSER_SELECTORS = [
    "#prompt-textarea",
    "div#prompt-textarea[contenteditable='true']",
    "textarea[data-id='root']",
    "textarea[placeholder*='Message' i]",
    "textarea"
  ];

  const SEND_BUTTON_SELECTORS = [
    "button[data-testid='send-button']",
    "button[aria-label*='Send prompt' i]",
    "button[aria-label*='Send' i]",
    "button.mb-1.me-1"
  ];

  const CHATGPT_REFUSAL_PATTERNS = [
    /cannot generate/i,
    /unable to generate/i,
    /i can't generate/i,
    /i cannot generate/i,
    /content policy/i,
    /against our policies/i,
    /against our safety/i,
    /violates our usage/i,
    /safety guidelines/i,
    /i am unable to create/i,
    /i'm unable to create/i,
    /i cannot create/i,
    /cannot fulfill this request/i,
    /i am sorry, but i cannot/i,
    /i'm sorry, but i cannot/i,
    /not allowed to create/i,
    /unable to fulfill/i
  ];

  const CHATGPT_RATE_LIMIT_PATTERNS = [
    /reached your limit/i,
    /hit the plus limit/i,
    /rate limit/i,
    /limit reached/i,
    /too many requests/i,
    /try again after/i,
    /try again later/i,
    /usage limit/i,
    /capacity/i,
    /temporarily unavailable/i
  ];

  const CHATGPT_CANCELLATION_PATTERNS = [
    /generation stopped/i,
    /response was stopped/i,
    /you stopped this response/i,
    /stopped generating/i
  ];

  const STOP_BUTTON_SELECTORS = [
    "button[data-testid='stop-button']",
    "button[aria-label*='Stop' i]",
    "button.stop-button",
    "[aria-label*='Stop streaming' i]"
  ];

  function isStopButtonElement(target) {
    if (!target) return false;
    const btn = target.closest(STOP_BUTTON_SELECTORS.join(', '));
    if (btn) return true;
    const anyBtn = target.closest('button, [role="button"]');
    if (anyBtn) {
      const aria = (anyBtn.getAttribute('aria-label') || '').toLowerCase();
      const text = (anyBtn.innerText || anyBtn.textContent || '').trim().toLowerCase();
      if (aria.includes('stop') || text === 'stop') return true;
      if (anyBtn.querySelector('svg rect')) return true; // ChatGPT stop square icon
    }
    return false;
  }

  function clickStopButton() {
    console.log('[MythicFrame BEI] Attempting to click native Stop button in ChatGPT...');
    let clicked = false;
    for (const sel of STOP_BUTTON_SELECTORS) {
      try {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent !== null && !btn.disabled) {
          btn.click();
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          clicked = true;
          break;
        }
      } catch (e) {}
    }
    if (!clicked) {
      const allButtons = document.querySelectorAll('button, [role="button"]');
      for (const btn of allButtons) {
        if (isStopButtonElement(btn) && btn.offsetParent !== null && !btn.disabled) {
          btn.click();
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          clicked = true;
          break;
        }
      }
    }
    setTimeout(() => {
      for (const sel of STOP_BUTTON_SELECTORS) {
        try {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null && !btn.disabled) btn.click();
        } catch (e) {}
      }
    }, 250);
    return clicked;
  }

  function isChatGPTActivelyGenerating() {
    for (const sel of STOP_BUTTON_SELECTORS) {
      try {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent !== null && !btn.disabled) return true;
      } catch (e) {}
    }
    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const btn of allButtons) {
      if (isStopButtonElement(btn) && btn.offsetParent !== null && !btn.disabled) return true;
    }
    const streaming = document.querySelector('.result-streaming, [data-testid*="stop"], [aria-label*="Stop generating" i]');
    if (streaming && streaming.offsetParent !== null) return true;
    return false;
  }

  let activeRunningJobId = null;
  let activeCancelHandler = null;

  document.addEventListener('click', (event) => {
    if (!activeRunningJobId || typeof activeCancelHandler !== 'function') return;
    if (isStopButtonElement(event.target)) {
      console.log(`[MythicFrame BEI] Detected user click on Stop button in ChatGPT! Job: ${activeRunningJobId}`);
      activeCancelHandler('User clicked Stop in ChatGPT Web');
    }
  }, true);

  function getComposerElement() {
    for (const sel of COMPOSER_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el;
      } catch (e) {}
    }
    return null;
  }

  function getSendButton() {
    for (const sel of SEND_BUTTON_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true') {
          return el;
        }
      } catch (e) {}
    }
    return null;
  }

  function setComposerText(composer, text) {
    composer.focus();
    if (composer.tagName.toLowerCase() === 'textarea') {
      composer.value = text;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      composer.innerHTML = '';
      const lines = text.split('\n');
      for (const line of lines) {
        const p = document.createElement('p');
        p.textContent = line || '\u00A0';
        composer.appendChild(p);
      }
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function clearComposer() {
    try {
      // 1. Remove all attachments/chips
      const closeButtons = Array.from(document.querySelectorAll(
        "button[aria-label*='Remove' i], button[aria-label*='Delete' i], [data-testid*='attachment'] button, button.close, [aria-label*='remove attachment' i], [aria-label*='remove file' i]"
      ));
      for (const btn of closeButtons) {
        try { btn.click(); } catch (e) {}
      }

      // 2. Reset any file inputs
      const fileInputs = document.querySelectorAll("input[type='file']");
      for (const input of fileInputs) {
        try {
          input.value = '';
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) {}
      }

      // 3. Clear text
      const composer = getComposerElement();
      if (composer) {
        composer.focus();
        if (composer.tagName.toLowerCase() === 'textarea') {
          composer.value = '';
          composer.dispatchEvent(new Event('input', { bubbles: true }));
          composer.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          composer.innerHTML = '';
          composer.textContent = '';
          const p = document.createElement('p');
          composer.appendChild(p);
          composer.dispatchEvent(new Event('input', { bubbles: true }));
          composer.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      console.log('[MythicFrame BEI] ChatGPT composer cleared.');
    } catch (e) {}
  }

  async function attachReferenceImages(images, composer) {
    if (!images || images.length === 0) return;
    try {
      clearComposer();
      const files = [];
      images.forEach((img, idx) => {
        const url = typeof img === 'string' ? img : img.url;
        if (url && url.startsWith('data:image/')) {
          const arr = url.split(',');
          const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          let ext = 'png';
          if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
          else if (mime.includes('webp')) ext = 'webp';
          else if (mime.includes('gif')) ext = 'gif';
          files.push(new File([u8arr], `reference_${idx + 1}.${ext}`, { type: mime }));
        }
      });

      if (files.length === 0) return;

      const fileInput = document.querySelector("input[type='file'][accept*='image'], input[type='file']");
      if (fileInput) {
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1200));
        return;
      }

      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      composer.dispatchEvent(pasteEvent);
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.warn('[MythicFrame BEI] Error attaching reference images to ChatGPT:', e);
    }
  }

  async function executePrompt(jobId, prompt, timeoutSeconds = 900, images = []) {
    let keepAlivePort = null;
    try {
      if (chrome.runtime && chrome.runtime.connect) {
        keepAlivePort = chrome.runtime.connect({ name: 'mythicframe-bei-keepalive' });
      }
    } catch (e) {}

    reportProgress(jobId, 'connecting', 'Connecting to ChatGPT Web composer...');

    // Wait up to 12s for composer to exist
    let composer = getComposerElement();
    if (!composer) {
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 500));
        composer = getComposerElement();
        if (composer) break;
      }
    }

    if (!composer) {
      if (keepAlivePort) keepAlivePort.disconnect();
      clearComposer();
      try {
        chrome.runtime.sendMessage({
          type: 'GENERATION_FAILED',
          data: { jobId, error: 'ChatGPT Web composer textarea not found after waiting. Is the tab loaded?' }
        });
      } catch (e) {}
      return;
    }

    // Always clear composer cleanly before starting
    reportProgress(jobId, 'clearing', 'Preparing pristine ChatGPT composer...');
    clearComposer();
    await new Promise(r => setTimeout(r, 300));
    composer = getComposerElement() || composer;

    // Attach reference images if provided
    if (images && images.length > 0) {
      reportProgress(jobId, 'uploading_references', `Uploading reference image(s) (1/${images.length})...`);
      await attachReferenceImages(images, composer);
      reportProgress(jobId, 'references_uploaded', 'Reference image attached successfully.');
    }

    const existingImages = new Set();
    protocol.getAllImagesRecursively(document.body).forEach(img => {
      if (img.src) existingImages.add(img.src);
      if (img.currentSrc) existingImages.add(img.currentSrc);
    });

    const existingMessages = new Set(
      document.querySelectorAll('[data-message-author-role="assistant"], div.agent-turn, div[class*="assistant"], article')
    );

    let promptToSend = prompt;
    if (!promptToSend.toLowerCase().startsWith('create image:') && !promptToSend.toLowerCase().startsWith('create an image')) {
      promptToSend = `Create an image of: ${promptToSend}`;
    }

    reportProgress(jobId, 'submitting_prompt', 'Submitting prompt directive to ChatGPT...');
    setComposerText(composer, promptToSend);
    await new Promise(r => setTimeout(r, 600));

    let sendBtn = getSendButton();
    if (sendBtn) {
      sendBtn.click();
    } else {
      composer.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      }));
    }

    reportProgress(jobId, 'generating', 'Prompt submitted! Waiting for ChatGPT / DALL-E generation...');
    console.log(`[MythicFrame BEI] Prompt submitted to ChatGPT for job ${jobId}. Watching for generated image...`);

    const startTime = Date.now();
    const timeoutMs = (timeoutSeconds || 900) * 1000;
    let lastHeartbeatTime = Date.now();
    let imageDelivered = false;
    let jobCancelled = false;

    const handleCancel = (reason = 'User stopped generation in ChatGPT Web') => {
      if (imageDelivered || jobCancelled) return;
      jobCancelled = true;
      activeRunningJobId = null;
      activeCancelHandler = null;
      clearInterval(checkInterval);
      if (keepAlivePort) keepAlivePort.disconnect();
      clickStopButton();
      clearComposer();

      console.log(`[MythicFrame BEI] Generation cancelled for job ${jobId}: ${reason}`);
      try {
        chrome.runtime.sendMessage({
          type: 'GENERATION_CANCELLED',
          data: {
            jobId,
            reason
          }
        });
      } catch (e) {}
    };

    activeRunningJobId = jobId;
    activeCancelHandler = handleCancel;

    const deliverImage = async (imgOrUrl, width, height) => {
      if (imageDelivered || jobCancelled) return;
      imageDelivered = true;
      activeRunningJobId = null;
      activeCancelHandler = null;
      clearInterval(checkInterval);
      if (keepAlivePort) keepAlivePort.disconnect();

      reportProgress(jobId, 'capturing_image', 'Generated image detected! Extracting asset...');

      let finalData = '';
      let srcUrl = '';

      if (typeof imgOrUrl === 'string') {
        srcUrl = protocol.upgradeToHighResUrl ? protocol.upgradeToHighResUrl(imgOrUrl) : imgOrUrl;
        finalData = srcUrl;
      } else {
        const rawSrc = imgOrUrl.currentSrc || imgOrUrl.src || '';
        srcUrl = protocol.upgradeToHighResUrl ? protocol.upgradeToHighResUrl(rawSrc) : rawSrc;
        try {
          if (rawSrc.startsWith('blob:') || rawSrc.startsWith('data:')) {
            finalData = rawSrc.startsWith('blob:') ? await protocol.fetchBlobAsBase64(rawSrc) : rawSrc;
          } else if (srcUrl.startsWith('http')) {
            finalData = srcUrl;
          } else {
            finalData = await protocol.imageToBase64(imgOrUrl);
          }
        } catch (e) {
          finalData = srcUrl;
        }
      }

      console.log(`[MythicFrame BEI] Successfully captured ChatGPT image for job ${jobId}`);
      try {
        chrome.runtime.sendMessage({
          type: 'GENERATION_COMPLETED',
          data: {
            jobId,
            image: finalData,
            target: 'chatgpt',
            metadata: {
              srcUrl,
              width: width || 1024,
              height: height || 1024
            }
          }
        });
      } catch (err) {
        console.warn('[MythicFrame BEI] ChatGPT delivery notice:', err);
      }
    };

    const checkInterval = setInterval(async () => {
      try {
        if (imageDelivered || jobCancelled) {
          clearInterval(checkInterval);
          return;
        }

        const elapsed = Date.now() - startTime;
        const isGenerating = isChatGPTActivelyGenerating();

        if (isGenerating && elapsed > timeoutMs) {
          // Never abort while ChatGPT is actively generating or streaming!
          if (Math.floor(elapsed / 1000) % 3 === 0) {
            reportProgress(jobId, 'generating', `ChatGPT is still generating (active in browser)... (${Math.round(elapsed/1000)}s)`);
          }
        } else if (elapsed > timeoutMs) {
          clearInterval(checkInterval);
          activeRunningJobId = null;
          activeCancelHandler = null;
          if (keepAlivePort) keepAlivePort.disconnect();
          clearComposer();
          try {
            chrome.runtime.sendMessage({
              type: 'GENERATION_FAILED',
              data: { jobId, error: `Generation timed out after ${timeoutSeconds}s waiting for ChatGPT image.` }
            });
          } catch (e) {}
          return;
        }

        if (isGenerating && Math.floor(elapsed / 1000) % 3 === 0) {
          reportProgress(jobId, 'generating', `ChatGPT is generating image... (${Math.round(elapsed/1000)}s)`);
        }

      // 1. Check for newly generated images
      const allImages = protocol.getAllImagesRecursively(document.body);
      for (const img of allImages) {
        const src = img.currentSrc || img.src;
        if (!src || existingImages.has(src)) continue;

        const isDallE = (img.alt || '').toLowerCase().includes('dall-e') ||
                        (img.alt || '').toLowerCase().includes('generated') ||
                        src.includes('oaidalleapiprodscus') ||
                        src.includes('files.oaiusercontent.com') ||
                        src.includes('backend-api/files');

        if ((isDallE || protocol.isGeneratedImage(img)) && img.complete && (img.naturalWidth > 80 || img.naturalHeight > 80)) {
          await deliverImage(img, img.naturalWidth, img.naturalHeight);
          return;
        }
      }

      // 2. Cancellation, Refusal and Quota / Rate Limit Detection
      const allCurrentMessages = Array.from(
        document.querySelectorAll('[data-message-author-role="assistant"], div.agent-turn, div[class*="assistant"], article')
      );
      const newMessages = allCurrentMessages.filter(m => !existingMessages.has(m));
      const targetMessage = newMessages.length > 0 
        ? newMessages[newMessages.length - 1] 
        : (allCurrentMessages.length > existingMessages.size ? allCurrentMessages[allCurrentMessages.length - 1] : allCurrentMessages[allCurrentMessages.length - 1]);

      if (targetMessage) {
        const text = (targetMessage.innerText || targetMessage.textContent || '').trim();
        if (text.length > 5) {
          // Cancellation Detection
          for (const pat of CHATGPT_CANCELLATION_PATTERNS) {
            if (pat.test(text)) {
              handleCancel(`ChatGPT response was stopped: "${text.substring(0, 100)}"`);
              return;
            }
          }

          // Rate Limit Detection
          for (const pat of CHATGPT_RATE_LIMIT_PATTERNS) {
            if (pat.test(text)) {
              activeRunningJobId = null;
              activeCancelHandler = null;
              clearInterval(checkInterval);
              if (keepAlivePort) keepAlivePort.disconnect();
              clearComposer();
              const quotaMsg = `ChatGPT rate limit or quota exceeded: "${text.substring(0, 150)}". Please try again later or switch to Gemini in MythicFrame.`;
              console.warn(`[MythicFrame BEI] ${quotaMsg}`);
              try {
                chrome.runtime.sendMessage({
                  type: 'GENERATION_FAILED',
                  data: { jobId, error: quotaMsg }
                });
              } catch (e) {}
              return;
            }
          }

          // Refusal Detection
          for (const pat of CHATGPT_REFUSAL_PATTERNS) {
            if (pat.test(text)) {
              activeRunningJobId = null;
              activeCancelHandler = null;
              clearInterval(checkInterval);
              if (keepAlivePort) keepAlivePort.disconnect();
              clearComposer();
              const excerpt = text.length > 200 ? text.substring(0, 200) + '...' : text;
              const refusalMsg = `ChatGPT declined generation: ${excerpt}`;
              console.warn(`[MythicFrame BEI] ${refusalMsg}`);
              try {
                chrome.runtime.sendMessage({
                  type: 'GENERATION_FAILED',
                  data: { jobId, error: refusalMsg }
                });
              } catch (e) {}
              return;
            }
          }
        }
      }

      // 3. Check for any error/alert toast containers
      const alerts = document.querySelectorAll('[role="alert"], div[class*="error"], div[data-testid*="error"]');
      for (const alertEl of alerts) {
        const alertText = (alertEl.innerText || alertEl.textContent || '').trim();
        if (alertText) {
          for (const pat of CHATGPT_RATE_LIMIT_PATTERNS) {
            if (pat.test(alertText)) {
              activeRunningJobId = null;
              activeCancelHandler = null;
              clearInterval(checkInterval);
              if (keepAlivePort) keepAlivePort.disconnect();
              clearComposer();
              const quotaMsg = `ChatGPT rate limit exceeded: "${alertText}". Please try again later or switch to Gemini in MythicFrame.`;
              console.warn(`[MythicFrame BEI] ${quotaMsg}`);
              try {
                chrome.runtime.sendMessage({
                  type: 'GENERATION_FAILED',
                  data: { jobId, error: quotaMsg }
                });
              } catch (e) {}
              return;
            }
          }
        }
      }
    } catch (err) {
      console.error('[MythicFrame BEI] ChatGPT checkInterval non-fatal polling error:', err);
    }
  }, 1000);
  }

  function extractChatGPTAccountEmail() {
    try {
      const userBtn = document.querySelector("[data-testid='user-menu-button'], button[aria-label*='User profile' i], [aria-label*='account' i]");
      if (userBtn) {
        const text = (userBtn.textContent || '') + ' ' + (userBtn.getAttribute('aria-label') || '') + ' ' + (userBtn.getAttribute('title') || '');
        const match = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (match) return match[1];
      }
      const els = document.querySelectorAll("[data-testid*='profile'], [aria-label*='profile' i]");
      for (const el of els) {
        const text = el.textContent || '';
        const match = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (match) return match[1];
      }
    } catch (e) {}
    return "";
  }

  // Expose global execution methods so background worker can invoke directly via executeScript
  window.__MYTHIC_BEI_EXECUTE_PROMPT__ = executePrompt;
  window.__MYTHIC_BEI_GET_EMAIL__ = extractChatGPTAccountEmail;

  window.addEventListener('__MYTHIC_BEI_EXECUTE_PROMPT__', (e) => {
    if (e.detail) {
      const { jobId, prompt, timeoutSeconds, images } = e.detail;
      executePrompt(jobId, prompt, timeoutSeconds, images);
    }
  });

  // Re-attach message listener safely to handle extension context reloads
  if (window.__MYTHIC_BEI_CHATGPT_MSG_LISTENER__ && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.removeListener(window.__MYTHIC_BEI_CHATGPT_MSG_LISTENER__);
    } catch (e) {}
  }

  const messageListener = (request, sender, sendResponse) => {
    if (request.action === 'GET_TAB_INFO') {
      const email = extractChatGPTAccountEmail();
      sendResponse({
        success: true,
        target: 'chatgpt',
        email: email,
        url: window.location.href,
        title: document.title,
        composerReady: Boolean(getComposerElement())
      });
      return true;
    }

    if (request.action === 'EXECUTE_PROMPT') {
      const { jobId, prompt, timeoutSeconds, images } = request.data || {};
      executePrompt(jobId, prompt, timeoutSeconds, images);
      sendResponse({ success: true, started: true });
      return true;
    }

    if (request.action === 'CANCEL_GENERATION' || request.action === 'CLEAR_COMPOSER') {
      clickStopButton();
      if (typeof activeCancelHandler === 'function') {
        activeCancelHandler('Cancelled from MythicFrame Studio');
      } else {
        clearComposer();
      }
      sendResponse({ success: true, cleared: true, stopped: true });
      return true;
    }
  };

  window.__MYTHIC_BEI_CLEAR_COMPOSER__ = clearComposer;
  window.__MYTHIC_BEI_CLICK_STOP_BUTTON__ = clickStopButton;
  window.__MYTHIC_BEI_CANCEL__ = () => {
    clickStopButton();
    if (typeof activeCancelHandler === 'function') {
      activeCancelHandler('Cancelled from MythicFrame Studio');
    } else {
      clearComposer();
    }
  };

  try {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
      window.__MYTHIC_BEI_CHATGPT_MSG_LISTENER__ = messageListener;
    }
  } catch (err) {
    console.warn('[MythicFrame BEI] Could not bind onMessage listener in ChatGPT:', err);
  }
})();
