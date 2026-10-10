// MythicFrame BEI — MAIN-world page hook.
// Gemini renders the full-size (2K) master only when its native Download runs, then
// saves it via a page-side blob: download that the extension background cannot fetch.
// This hook (injected into the page's own JS context) captures that Blob and hands the
// bytes to the isolated content script via window.postMessage. Armed only during a
// capture window so it never touches unrelated blobs.
(() => {
  if (window.__MYTHIC_BEI_PAGE_HOOK__) return;
  window.__MYTHIC_BEI_PAGE_HOOK__ = true;

  let armed = false;
  let captured = false;

  function post(dataUrl) {
    try { window.postMessage({ source: 'MYTHIC_BEI_PAGE', type: 'FULLSIZE_CAPTURE', dataUrl }, '*'); } catch (e) {}
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      try {
        const fr = new FileReader();
        fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
        fr.onerror = () => resolve('');
        fr.readAsDataURL(blob);
      } catch (e) { resolve(''); }
    });
  }

  function maybeCapture(blob) {
    if (!armed || !(blob instanceof Blob)) return;
    if (!/^image\//i.test(blob.type) && blob.size < 150000) return;
    blobToDataUrl(blob).then((d) => {
      if (!d || !d.startsWith('data:image')) return;
      if (d.length > 700000) captured = true; // large enough to be the master, not a preview
      if (d.length > 300000) post(d);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'MYTHIC_BEI_CONTENT') return;
    if (e.data.type === 'ARM_FULLSIZE') { armed = true; captured = false; }
    else if (e.data.type === 'DISARM_FULLSIZE') { armed = false; }
  });

  // Capture the exact Blob Gemini builds for the full-size download.
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    try { maybeCapture(obj); } catch (e) {}
    return origCreate(obj);
  };

  // Backup net: capture the full-size image response fetched during the download.
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      if (armed) {
        p.then((res) => {
          try {
            const u = (res && res.url) || (typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url)) || '';
            if (/googleusercontent\.com|gstatic\.com/i.test(u)) res.clone().blob().then(maybeCapture).catch(() => {});
          } catch (e) {}
        }).catch(() => {});
      }
      return p;
    };
  }

  // Once we have the master bytes, suppress the duplicate Chrome download of that blob.
  document.addEventListener('click', (e) => {
    if (!armed || !captured) return;
    try {
      const a = e.target && e.target.closest && e.target.closest('a[download]');
      if (a && /^blob:/i.test(a.getAttribute('href') || a.href || '')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    } catch (err) {}
  }, true);
})();
