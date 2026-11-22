// MythicFrame BEI — MAIN-world "always active" shim (runs at document_start).
// The old spoof lived in the isolated content-script world, so Gemini/ChatGPT's own code still
// saw the tab as hidden when Chrome was minimized or the tab was in the background, and
// generations stalled until the user switched to the tab. This runs in the page's own world.
(() => {
  if (window.__MYTHIC_BEI_VISIBILITY__) return;
  window.__MYTHIC_BEI_VISIBILITY__ = true;

  const docProto = Document.prototype;
  const realHiddenDesc = Object.getOwnPropertyDescriptor(docProto, 'hidden');
  const isReallyHidden = () => {
    try { return realHiddenDesc && realHiddenDesc.get ? realHiddenDesc.get.call(document) : false; } catch (e) { return false; }
  };

  // 1. Page always reports visible + focused.
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
    document.hasFocus = () => true;
  } catch (e) {}
  const swallow = (e) => { e.stopImmediatePropagation(); };
  try {
    document.addEventListener('visibilitychange', swallow, true);
    document.addEventListener('webkitvisibilitychange', swallow, true);
    window.addEventListener('visibilitychange', swallow, true);
    // Only the WINDOW blur (tab/app lost focus); element blur events must still reach the page.
    window.addEventListener('blur', (e) => { if (e.target === window) swallow(e); }, true);
    document.addEventListener('freeze', swallow, true);
  } catch (e) {}

  // 2. requestAnimationFrame never fires in hidden/minimized pages. Fall back to timers while
  //    really hidden so rendering/streaming code keeps progressing.
  try {
    const realRaf = window.requestAnimationFrame.bind(window);
    const realCaf = window.cancelAnimationFrame.bind(window);
    const timerIds = new Map();
    let nextId = 1e9;
    window.requestAnimationFrame = function (cb) {
      if (!isReallyHidden()) return realRaf(cb);
      const id = nextId++;
      timerIds.set(id, setTimeout(() => { timerIds.delete(id); try { cb(performance.now()); } catch (e) { setTimeout(() => { throw e; }); } }, 16));
      return id;
    };
    window.cancelAnimationFrame = function (id) {
      if (timerIds.has(id)) { clearTimeout(timerIds.get(id)); timerIds.delete(id); return; }
      return realCaf(id);
    };
  } catch (e) {}

  // 3. Chrome's intensive timer throttling (1 wake-up/min after ~5 min hidden) is skipped for
  //    pages with an open WebRTC data channel. A local loopback channel is held ONLY while a
  //    BEI job runs (the content script requests it with a TTL), so normal tabs are unaffected.
  let pcA = null, pcB = null, channel = null, awakeUntil = 0, awakeTimer = null;

  function stopAwake() {
    try { if (channel) channel.close(); } catch (e) {}
    try { if (pcA) pcA.close(); } catch (e) {}
    try { if (pcB) pcB.close(); } catch (e) {}
    pcA = pcB = channel = null;
  }

  async function startAwake() {
    if (pcA || typeof RTCPeerConnection !== 'function') return;
    try {
      pcA = new RTCPeerConnection();
      pcB = new RTCPeerConnection();
      pcA.onicecandidate = (e) => { if (e.candidate && pcB) pcB.addIceCandidate(e.candidate).catch(() => {}); };
      pcB.onicecandidate = (e) => { if (e.candidate && pcA) pcA.addIceCandidate(e.candidate).catch(() => {}); };
      pcB.ondatachannel = (e) => { e.channel.onmessage = () => {}; };
      channel = pcA.createDataChannel('mythic-bei-keepawake');
      const offer = await pcA.createOffer();
      await pcA.setLocalDescription(offer);
      await pcB.setRemoteDescription(offer);
      const answer = await pcB.createAnswer();
      await pcB.setLocalDescription(answer);
      await pcA.setRemoteDescription(answer);
    } catch (e) {
      stopAwake();
    }
  }

  function scheduleStop() {
    if (awakeTimer) clearTimeout(awakeTimer);
    const ms = Math.max(1000, awakeUntil - Date.now());
    awakeTimer = setTimeout(() => {
      if (Date.now() >= awakeUntil) stopAwake(); else scheduleStop();
    }, ms);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== 'MYTHIC_BEI_CONTENT' || d.type !== 'KEEP_AWAKE') return;
    if (d.on) {
      const ttl = Math.min(Math.max(Number(d.ttlMs) || 600000, 30000), 30 * 60 * 1000);
      awakeUntil = Math.max(awakeUntil, Date.now() + ttl);
      startAwake();
      scheduleStop();
    } else {
      awakeUntil = 0;
      stopAwake();
    }
  });
})();
