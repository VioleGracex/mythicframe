/**
 * MythicFrame BEI Bridge - Protocol Definitions & Heuristics
 * Scoped under __MYTHIC_BEI__ to ensure zero namespace collision.
 */

(() => {
  const MythicBEIProtocol = {
    BRIDGE_PORT: 58925,
    STUDIO_PORT: 3488,

    COMMANDS: {
      EXECUTE_PROMPT: 'EXECUTE_PROMPT',
      CANCEL_GENERATION: 'CANCEL_GENERATION',
      VERIFY_SESSION: 'VERIFY_SESSION',
      LIST_TABS: 'LIST_TABS',
    },

    AVATAR_PATTERNS: [
      '/ogw/',
      '/a/ACg',
      '/a/default-user',
      'favicon',
      'google_logo',
      'auth0',
      'openai.com/avatars',
      'oaistatic.com/avatars',
      'gemini_sparkle',
      'sparkle',
      'lamda/images',
      'gstatic.com',
      'landing/a/',
      'app_upsell',
    ],

    AVATAR_SIZE_REGEX: /=s\d+(?:-c|-p|-ns|-rw)?/i,

    extractGeminiAccountSlot(url) {
      if (!url) return 0;
      try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/u\/(\d+)/);
        if (match) return parseInt(match[1], 10);
      } catch (e) {
        const match = String(url).match(/\/u\/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
      return 0;
    },

    isGeneratedImage(imgElement) {
      if (!imgElement) return false;
      const src = imgElement.currentSrc || imgElement.src || '';
      if (!src) return false;

      const lower = src.toLowerCase();
      // STRICT INVALIDATION: Reject blank, javascript, page location, or relative page routes
      if (
        lower.startsWith('javascript:') ||
        lower === window.location.href.toLowerCase() ||
        lower === (window.location.origin + '/').toLowerCase() ||
        lower.endsWith('/u/0') ||
        lower.endsWith('/u/0/') ||
        lower.includes('gemini.google.com/app') ||
        lower.includes('gemini.google.com/u/') ||
        lower.includes('chatgpt.com/c/')
      ) {
        return false;
      }

      // Always accept image retrieval endpoints
      if (src.includes('image_retrieval') || src.includes('image_collection')) {
        return true;
      }

      // Filter out obvious avatars and logos
      for (const pat of this.AVATAR_PATTERNS) {
        if (src.includes(pat)) return false;
      }

      const alt = (imgElement.alt || '').toLowerCase();
      const aria = (imgElement.getAttribute('aria-label') || '').toLowerCase();
      if (
        alt.includes('profile') || alt.includes('avatar') ||
        aria.includes('profile') || aria.includes('avatar') ||
        alt.includes('sparkle') || aria.includes('sparkle') ||
        alt.includes('gemini') || aria.includes('gemini')
      ) {
        return false;
      }

      // Check if rendered dimensions indicate an icon
      if (imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        if (imgElement.naturalWidth < 80 || imgElement.naturalHeight < 80) {
          return false;
        }
      }

      // Valid generative image sources (STATIC gstatic.com IS EXCLUDED)
      const isGoogleCdn = src.includes('googleusercontent.com') || src.includes('photos.google.com');
      const isOpenAiBlob = src.includes('oaidalleapiprodscus') || src.includes('files.oaiusercontent.com') || src.includes('backend-api/files');
      const isBlob = src.startsWith('blob:');
      const isBase64 = src.startsWith('data:image/');

      if (isGoogleCdn || isOpenAiBlob || isBlob || isBase64) {
        return true;
      }

      // Fallback: check if parent container is a model response
      if (imgElement.closest && imgElement.closest('model-response, message-content, div.response-container, conversation-turn, [data-test-id*="response"]')) {
        if (!src.includes('gstatic.com') && (/\.(png|jpe?g|webp|gif)($|\?)/i.test(src) || (imgElement.naturalWidth >= 256 && imgElement.naturalHeight >= 256))) {
          return true;
        }
      }

      return false;
    },

    getAllImagesRecursively(root = (typeof document !== 'undefined' ? document.body : null)) {
      const results = [];
      const traverse = (node) => {
        if (!node) return;
        if (node.tagName && node.tagName.toLowerCase() === 'img') {
          results.push(node);
        }
        if (node.shadowRoot) {
          traverse(node.shadowRoot);
        }
        if (node.children) {
          for (let i = 0; i < node.children.length; i++) {
            traverse(node.children[i]);
          }
        }
      };
      try {
        traverse(root);
      } catch (e) {}
      return results;
    },

    upgradeToHighResUrl(url, quality = 'ultra_original') {
      if (!url || typeof url !== 'string') return url;
      try {
        if (
          url.includes('googleusercontent.com') ||
          url.includes('photos.google.com')
        ) {
          // If standard quality requested, keep current sizing or default to s1024
          if (quality === 'standard') {
            if (/=[swh]\d+/i.test(url) || /=w\d+-h\d+/i.test(url)) {
              return url.replace(/=(?:s\d+|w\d+-h\d+|w\d+|h\d+)(?:-[a-zA-Z0-9_-]+)*(?=[?&#]|$)/i, '=s1024');
            }
            return url;
          }

          // If high quality requested, upgrade to =s2048
          if (quality === 'high') {
            if (/=[swh]\d+/i.test(url) || /=w\d+-h\d+/i.test(url)) {
              return url.replace(/=(?:s\d+|w\d+-h\d+|w\d+|h\d+)(?:-[a-zA-Z0-9_-]+)*(?=[?&#]|$)/i, '=s2048');
            }
            return url.includes('=') ? `${url}-s2048` : `${url}=s2048`;
          }

          // Default: 'ultra_original' or 'ultra' - Strip dimension boundaries and request uncompressed original with download directive (=s0-d)
          if (/=[swh]\d+/i.test(url) || /=w\d+-h\d+/i.test(url)) {
            return url.replace(/=(?:s\d+|w\d+-h\d+|w\d+|h\d+)(?:-[a-zA-Z0-9_-]+)*(?=[?&#]|$)/i, '=s0-d');
          }
          return url.includes('=') ? `${url}-s0-d` : `${url}=s0-d`;
        }
      } catch (e) {
        console.debug('[MythicBEI] Error upgrading URL to high-res:', e);
      }
      return url;
    },

    detectCandidateGrid(root = (typeof document !== 'undefined' ? document.body : null)) {
      if (!root) return null;
      try {
        // Look for Imagen candidate grids in Gemini response
        const gridSelectors = [
          '[class*="image-grid" i]',
          '[class*="image_grid" i]',
          '[class*="candidate-grid" i]',
          '[class*="candidate_grid" i]',
          '[class*="image-container" i]',
          '[class*="generated-images" i]',
          '[data-test-id*="image-grid" i]',
          'div.images-container',
          'div.candidates-container'
        ];

        for (const sel of gridSelectors) {
          try {
            const containers = root.querySelectorAll(sel);
            for (const container of containers) {
              const imgs = Array.from(container.querySelectorAll('img'))
                .filter(img => this.isGeneratedImage(img));
              if (imgs.length >= 2) {
                return {
                  container,
                  count: imgs.length,
                  images: imgs,
                  urls: imgs.map(img => this.upgradeToHighResUrl(img.currentSrc || img.src))
                };
              }
            }
          } catch (e) {}
        }

        // Heuristic: check all generated images in root sharing an immediate common container
        const allGenImages = this.getAllImagesRecursively(root).filter(img => this.isGeneratedImage(img));
        if (allGenImages.length >= 2) {
          const parentMap = new Map();
          for (const img of allGenImages) {
            const p = img.closest('div, section, article') || img.parentElement;
            if (p) {
              if (!parentMap.has(p)) parentMap.set(p, []);
              parentMap.get(p).push(img);
            }
          }
          for (const [p, imgs] of parentMap.entries()) {
            if (imgs.length >= 2) {
              return {
                container: p,
                count: imgs.length,
                images: imgs,
                urls: imgs.map(img => this.upgradeToHighResUrl(img.currentSrc || img.src))
              };
            }
          }

          return {
            container: root,
            count: allGenImages.length,
            images: allGenImages,
            urls: allGenImages.map(img => this.upgradeToHighResUrl(img.currentSrc || img.src))
          };
        }
      } catch (e) {
        console.debug('[MythicBEI] Candidate grid detection notice:', e);
      }
      return null;
    },

    extractImageUrlsFromNode(node) {
      if (!node) return [];
      const urls = [];
      try {
        const text = node.innerText || node.textContent || '';
        const regex = /https?:\/\/[^\s"'<>]*(?:googleusercontent\.com|image_retrieval|oaiusercontent)[^\s"'<>]*/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
          urls.push(this.upgradeToHighResUrl(match[0]));
        }
        if (node.querySelectorAll) {
          const anchors = node.querySelectorAll("a[href*='image_retrieval'], a[href*='googleusercontent.com'], a[href*='oaiusercontent']");
          for (const a of anchors) {
            if (a.href) urls.push(this.upgradeToHighResUrl(a.href));
          }
          const imgs = node.querySelectorAll("img");
          for (const img of imgs) {
            const src = img.currentSrc || img.src;
            if (src && this.isGeneratedImage(img)) {
              urls.push(this.upgradeToHighResUrl(src));
            }
          }
        }
      } catch (e) {}
      return Array.from(new Set(urls));
    },

    async imageToBase64(imgElement, quality = 'ultra_original') {
      if (!imgElement) return '';
      const rawSrc = imgElement.currentSrc || imgElement.src || '';
      
      // If ultra or high quality is requested, first attempt direct high-res blob fetch from upgraded URL
      if (quality !== 'standard' && rawSrc) {
        try {
          const highResData = await this.fetchBlobAsBase64(rawSrc, quality);
          if (highResData && highResData.startsWith('data:image') && highResData.length > 2048) {
            return highResData;
          }
        } catch (e) {
          console.debug('[MythicBEI] Direct high-res fetch attempt notice:', e);
        }
      }

      // Attempt 1: Canvas export on the live element
      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth || imgElement.width || 1024;
        canvas.height = imgElement.naturalHeight || imgElement.height || 1024;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(imgElement, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl && dataUrl.startsWith('data:image/png') && dataUrl.length > 1024) {
            return dataUrl;
          }
        }
      } catch (err) {
        console.debug('[MythicBEI] Canvas export notice, falling back to multi-tier fetch/conversion:', err);
      }

      // Attempt 2: Offscreen image with crossOrigin = 'anonymous' + canvas export
      if (rawSrc && (rawSrc.startsWith('http://') || rawSrc.startsWith('https://'))) {
        try {
          const offscreenDataUrl = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const timer = setTimeout(() => reject(new Error('timeout')), 3000);
            img.onload = () => {
              clearTimeout(timer);
              try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth || 1024;
                c.height = img.naturalHeight || 1024;
                const ctx = c.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  resolve(c.toDataURL('image/png'));
                } else {
                  reject(new Error('No canvas context'));
                }
              } catch (e) {
                reject(e);
              }
            };
            img.onerror = () => {
              clearTimeout(timer);
              reject(new Error('Failed to load image with anonymous CORS'));
            };
            img.src = this.upgradeToHighResUrl(rawSrc, quality);
          });
          if (offscreenDataUrl && offscreenDataUrl.startsWith('data:image') && offscreenDataUrl.length > 512) {
            return offscreenDataUrl;
          }
        } catch (offscreenErr) {
          console.debug('[MythicBEI] Offscreen anonymous CORS notice:', offscreenErr);
        }
      }

      // Attempt 3: Multi-tier fetchBlobAsBase64
      if (rawSrc) {
        try {
          const fetched = await this.fetchBlobAsBase64(rawSrc, quality);
          if (fetched && fetched.startsWith('data:image') && fetched.length > 512) {
            return fetched;
          }
        } catch (fetchErr) {
          console.warn('[MythicBEI] In-page authenticated fetch notice:', fetchErr);
        }
      }

      // Fallback: return upgraded URL
      return this.upgradeToHighResUrl(rawSrc, quality);
    },

    async fetchBlobAsBase64(url, quality = 'ultra_original') {
      if (!url) return '';
      if (url.startsWith('data:image')) return url;

      const upgradedUrl = this.upgradeToHighResUrl(url, quality);
      // For ultra_original (=s0) the CDN sometimes rejects the request; fall back to the
      // reliable =s2048 master before collapsing to the raw low-res preview thumbnail.
      const fallbackCandidates = quality === 'ultra_original'
        ? [upgradedUrl, this.upgradeToHighResUrl(url, 'high'), url]
        : [upgradedUrl, url];
      const urlCandidates = Array.from(new Set(fallbackCandidates.filter(Boolean)));

      for (const targetUrl of urlCandidates) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            let res = null;
            try {
              res = await fetch(targetUrl, { mode: 'cors' });
            } catch (e1) {
              try {
                res = await fetch(targetUrl);
              } catch (e2) {}
            }

            if (res && res.ok) {
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
          } catch (e) {
            console.debug(`[MythicBEI] fetchBlobAsBase64 attempt ${attempt} for ${targetUrl.substring(0, 50)} notice:`, e);
          }
          await new Promise(r => setTimeout(r, 200 * attempt));
        }
      }

      // Attempt background service worker delegation (service worker has extension host permissions)
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        try {
          const bgResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'CONVERT_URL_TO_BASE64',
              data: { url }
            }, (response) => {
              if (chrome.runtime.lastError) {
                resolve(null);
              } else {
                resolve(response);
              }
            });
          });
          if (bgResult && bgResult.dataUrl && bgResult.dataUrl.startsWith('data:image') && bgResult.dataUrl.length > 512) {
            return bgResult.dataUrl;
          }
        } catch (bgErr) {
          console.debug('[MythicBEI] Background delegation notice:', bgErr);
        }
      }

      return upgradedUrl || url;
    }
  };

  globalThis.__MYTHIC_BEI__ = MythicBEIProtocol;
})();
