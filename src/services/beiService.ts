import { formatDisplayEmail, getIncognitoMode } from './privacyService';
import { BEIConfig, BEITarget } from '../types';
import { UnifiedGenerationParams } from './aiProviderService';
import { assembleFullMythicPrompt } from './promptTemplates';

const BEI_CONFIG_KEY = 'mythic_bei_config';
export const DEFAULT_BEI_PORT = 58925;

export const DEFAULT_BEI_CONFIG: BEIConfig = {
  target: 'gemini',
  accountSlot: 0,
  port: DEFAULT_BEI_PORT,
  timeoutSeconds: 900,
  tabMode: 'new_window_group',
  bringTabToFront: false,
  chatSessionMode: 'temporary_chat',
  autoRotateOnQuota: true,
  accountOrder: ['gemini:0', 'gemini:1', 'gemini:2', 'gemini:3', 'chatgpt:0'],
  downloadQuality: 'ultra_original',
  askQualityPreference: 'once',
  accountDispatchMode: 'single',
  askAccountDispatchPreference: 'once',
  preferredBrowser: 'auto',
};

let cachedDetectedHostBrowser: 'chrome' | 'brave' | 'edge' = 'chrome';
if (typeof window !== 'undefined') {
  try {
    const nav = window.navigator as any;
    if (nav.brave && typeof nav.brave.isBrave === 'function') {
      nav.brave.isBrave().then((isBrave: boolean) => {
        if (isBrave) cachedDetectedHostBrowser = 'brave';
      }).catch(() => {});
    }
  } catch {}
}

export function getDetectedHostBrowser(): 'chrome' | 'brave' | 'edge' {
  if (typeof window === 'undefined') return 'chrome';
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  if (ua.includes('Edg/')) return 'edge';
  return cachedDetectedHostBrowser;
}

export function getEffectiveBEIBrowser(): 'chrome' | 'brave' | 'edge' {
  const config = getBEIConfig();
  if (config.preferredBrowser && config.preferredBrowser !== 'auto') {
    return config.preferredBrowser;
  }
  return getDetectedHostBrowser();
}

export const BEI_PRIORITY_ORDER_KEY = 'mythic_bei_priority_order';

export function getTabAccountKey(tab: { target: string; accountSlot?: number; tabId?: number; email?: string }): string {
  if (tab.target === 'gemini') {
    return `gemini:${tab.accountSlot ?? 0}`;
  }
  return `chatgpt:${tab.tabId || 0}`;
}

export function getBEIAccountPriorityOrder(): string[] {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(BEI_PRIORITY_ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  return ['gemini:0', 'gemini:1', 'gemini:2', 'gemini:3', 'chatgpt:0'];
}

export function setBEIAccountPriorityOrder(order: string[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(BEI_PRIORITY_ORDER_KEY, JSON.stringify(order));
    setBEIConfig({ accountOrder: order });
    window.dispatchEvent(new CustomEvent('mythic_bei_priority_order_changed', { detail: order }));
    window.dispatchEvent(new Event('storage'));
  }
}

export function getBEIPrioritySlots(initialSlot: number = 0): number[] {
  const order = getBEIAccountPriorityOrder();
  const geminiSlots: number[] = [];
  for (const key of order) {
    if (key.startsWith('gemini:')) {
      const slotNum = parseInt(key.replace('gemini:', ''), 10);
      if (!isNaN(slotNum) && !geminiSlots.includes(slotNum)) {
        geminiSlots.push(slotNum);
      }
    }
  }
  for (let s = 0; s < 4; s++) {
    if (!geminiSlots.includes(s)) {
      geminiSlots.push(s);
    }
  }
  const filtered = geminiSlots.filter(s => s !== initialSlot);
  return [initialSlot, ...filtered];
}

export function sortTabsByPriorityOrder(tabs: BEITabDetail[], order?: string[]): BEITabDetail[] {
  const priorityOrder = order || getBEIAccountPriorityOrder();
  return [...tabs].sort((a, b) => {
    const keyA = getTabAccountKey(a);
    const keyB = getTabAccountKey(b);
    let indexA = priorityOrder.indexOf(keyA);
    let indexB = priorityOrder.indexOf(keyB);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    if (indexA !== indexB) return indexA - indexB;
    return (a.accountSlot ?? 0) - (b.accountSlot ?? 0);
  });
}

export const getBEIConfig = (): BEIConfig => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(BEI_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_BEI_CONFIG,
          ...parsed,
          port: parsed.port || DEFAULT_BEI_PORT,
          autoRotateOnQuota: parsed.autoRotateOnQuota !== undefined ? parsed.autoRotateOnQuota : true,
          accountOrder: parsed.accountOrder || getBEIAccountPriorityOrder(),
          downloadQuality: parsed.downloadQuality || 'ultra_original',
          askQualityPreference: parsed.askQualityPreference || 'once',
          accountDispatchMode: parsed.accountDispatchMode || 'single',
          askAccountDispatchPreference: parsed.askAccountDispatchPreference || 'once',
        };
      }
    } catch (e) {
      // Fall through to default
    }
  }
  return DEFAULT_BEI_CONFIG;
};

export const setBEIConfig = (config: Partial<BEIConfig>): void => {
  if (typeof window !== 'undefined') {
    const current = getBEIConfig();
    const updated: BEIConfig = { ...current, ...config };
    localStorage.setItem(BEI_CONFIG_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('mythic_bei_config_changed', { detail: updated }));
  }
};

export interface BEITabDetail {
  tabId: number;
  url: string;
  target: 'gemini' | 'chatgpt' | 'other';
  accountSlot?: number;
  email?: string;
  title?: string;
  status?: string;
  active?: boolean;
}

export interface BEIJobContext {
  jobId?: string;
  target: BEITarget;
  accountSlot: number;
  prompt: string;
  chatUrl?: string;
  tabId?: number;
  email?: string;
  timestamp: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error?: string;
}

const LAST_BEI_JOB_KEY = 'mythic_bei_last_job';

export const getLastBEIJobContext = (): BEIJobContext | null => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LAST_BEI_JOB_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
  }
  return null;
};

export const setLastBEIJobContext = (ctx: Partial<BEIJobContext>): void => {
  if (typeof window !== 'undefined') {
    try {
      const current = getLastBEIJobContext() || {
        target: 'gemini',
        accountSlot: 0,
        prompt: '',
        timestamp: Date.now(),
        status: 'pending',
      };
      const updated: BEIJobContext = { ...current, ...ctx, timestamp: Date.now() };
      localStorage.setItem(LAST_BEI_JOB_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('mythic_bei_job_updated', { detail: updated }));
    } catch (e) {}
  }
};

export const refetchBEIAsset = async (jobId?: string): Promise<{ success: boolean; image: string; jobId?: string; payload?: any } | null> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const targetJobId = jobId || getLastBEIJobContext()?.jobId;
  const query = targetJobId ? `?jobId=${encodeURIComponent(targetJobId)}` : '';
  const urls = [
    `http://127.0.0.1:${port}/api/bei/refetch${query}`,
    `/api/bei/refetch${query}`
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.image) {
          setLastBEIJobContext({
            jobId: data.jobId || targetJobId,
            status: 'completed',
            error: undefined
          });
          return { success: true, image: data.image, jobId: data.jobId, payload: data.payload };
        }
      }
    } catch (e) {}
  }
  return null;
};

export { formatDisplayEmail, getIncognitoMode };

export interface BEIAccountDetail {
  slot: number;
  email: string;
  name?: string;
  tier?: 'free' | 'pro';
  customLimit?: number;
}

export const DEFAULT_KNOWN_ACCOUNTS: BEIAccountDetail[] = [
  { slot: 0, email: '', name: 'Account 1 (Default)', tier: 'pro' },
  { slot: 1, email: '', name: 'Account 2', tier: 'pro' },
  { slot: 2, email: '', name: 'Account 3', tier: 'pro' },
  { slot: 3, email: '', name: 'Account 4', tier: 'pro' },
];

const BEI_ACCOUNTS_KEY = 'mythic_bei_accounts';

export const getSavedBEIAccounts = (): BEIAccountDetail[] => {
  let list: BEIAccountDetail[] = [];
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(BEI_ACCOUNTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Purge dummy example.com emails from previous sessions
          list = parsed.map((acc: BEIAccountDetail) => ({
            ...acc,
            slot: typeof acc.slot === 'number' ? acc.slot : 0,
            email: (acc.email && !acc.email.includes('example.com')) ? acc.email : '',
            name: (acc.name && !acc.name.includes('example.com')) ? acc.name : `Account ${(acc.slot ?? 0) + 1}`,
            tier: acc.tier || 'pro'
          }));
        }
      }
    } catch (e) {}
  }

  // Guarantee that all 4 slots (0..3) always exist
  const result: BEIAccountDetail[] = [];
  for (let slot = 0; slot < 4; slot++) {
    const existing = list.find(a => a.slot === slot);
    if (existing) {
      result.push(existing);
    } else {
      result.push(DEFAULT_KNOWN_ACCOUNTS[slot] || { slot, email: '', name: `Account ${slot + 1}`, tier: 'pro' });
    }
  }
  return result;
};

export const setSavedBEIAccounts = (accounts: BEIAccountDetail[]): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(BEI_ACCOUNTS_KEY, JSON.stringify(accounts));
  }
};

export const setBEIAccountTier = (slot: number, tier: 'free' | 'pro'): void => {
  const accounts = getSavedBEIAccounts();
  const updated = accounts.map(a => a.slot === slot ? { ...a, tier } : a);
  setSavedBEIAccounts(updated);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mythic_bei_accounts_changed', { detail: { slot, tier } }));
    window.dispatchEvent(new Event('storage'));
  }
};

export const updateBEIAccountCustomInfo = (slot: number, custom: { email?: string; name?: string; tier?: 'free' | 'pro' }): void => {
  const accounts = getSavedBEIAccounts();
  const idx = accounts.findIndex(a => a.slot === slot);
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], ...custom };
  } else {
    accounts.push({ slot, email: custom.email || '', name: custom.name || `Account ${slot + 1}`, tier: custom.tier || 'pro' });
  }
  setSavedBEIAccounts(accounts);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mythic_bei_accounts_changed', { detail: accounts }));
    window.dispatchEvent(new Event('storage'));
  }
};

export interface BEIStatusResponse {
  ready: boolean;
  connected: boolean;
  port: number;
  extensionVersion?: string;
  tabs?: BEITabDetail[];
  accounts?: BEIAccountDetail[];
  activeJobsCount?: number;
  projectDir?: string;
  error?: string;
  connectedBrowsers?: Array<{ browser: string; browserName: string; tabsCount: number; accountsCount: number; lastSeen: number }>;
  activeBrowser?: string;
}

export const openBEITab = async (
  target: BEITarget, 
  accountSlot = 0,
  tabMode?: string,
  bringTabToFront?: boolean
): Promise<boolean> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const chosenTabMode = tabMode || config.tabMode || 'same_window_group';
  const chosenBringFront = bringTabToFront !== undefined ? bringTabToFront : true;
  const urls = [
    `http://127.0.0.1:${port}/api/bei/open-tab`,
    `/api/bei/open-tab`
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          target, 
          accountSlot,
          tabMode: chosenTabMode,
          bringTabToFront: chosenBringFront,
          preferredBrowser: getEffectiveBEIBrowser()
        }),
      });
      if (resp.ok) {
        return true;
      }
    } catch (e) {}
  }
  return false;
};

export const checkBEIConnection = async (): Promise<BEIStatusResponse> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;

  // Try direct BEI bridge port first, then fallback to same-origin proxy
  const urls = [
    `http://127.0.0.1:${port}/api/bei/status`,
    `/api/bei/status`
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        let accounts = getSavedBEIAccounts();
        let changed = false;

        // Merge accounts sent from bridge slot-by-slot (never wipe the 4 slots!)
        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          for (const a of data.accounts) {
            if (!a || typeof a !== 'object') continue;
            const slot = typeof a.slot === 'number' ? a.slot : 0;
            const email = (a.email && !a.email.includes('example.com')) ? a.email : '';
            const name = (a.name && !a.name.includes('example.com')) ? a.name : (email ? email.split('@')[0] : `Account ${slot + 1}`);
            const idx = accounts.findIndex(acc => acc.slot === slot);
            if (idx !== -1) {
              if (email && accounts[idx].email !== email) {
                accounts[idx] = { ...accounts[idx], email, name };
                changed = true;
              }
            } else {
              accounts.push({ slot, email, name, tier: a.tier || 'pro' });
              changed = true;
            }
          }
        }

        // Merge discovered emails directly from open tabs
        if (Array.isArray(data.tabs)) {
          for (const tab of data.tabs) {
            if (tab.email && !tab.email.includes('example.com') && tab.target === 'gemini') {
              const slot = tab.accountSlot ?? 0;
              const idx = accounts.findIndex(a => a.slot === slot);
              if (idx !== -1) {
                if (accounts[idx].email !== tab.email) {
                  accounts[idx] = { ...accounts[idx], email: tab.email, name: tab.email };
                  changed = true;
                }
              } else {
                accounts.push({ slot, email: tab.email, name: tab.email, tier: 'pro' });
                changed = true;
              }
            }
          }
        }

        if (changed) {
          setSavedBEIAccounts(accounts);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mythic_bei_accounts_changed', { detail: accounts }));
          }
        }

        return {
          ready: Boolean(data.connected),
          connected: Boolean(data.connected),
          port: data.port || port,
          extensionVersion: data.extensionVersion,
          tabs: data.tabs || [],
          accounts,
          activeJobsCount: data.activeJobsCount || 0,
          projectDir: data.projectDir,
        };
      }
    } catch (err: any) {
      // Continue to next URL attempt
    }
  }

  return {
    ready: false,
    connected: false,
    port,
    tabs: [],
    accounts: getSavedBEIAccounts(),
    error: 'BEI Bridge or Chrome Extension is unreachable. Ensure server is running and extension is enabled.',
  };
};

export const generateWithBEI = async (
  params: UnifiedGenerationParams
): Promise<{ image: string; metadata: any }> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;

  // Check connection status first
  const status = await checkBEIConnection();
  if (!status.connected) {
    throw new Error(
      `BEI Connection Unavailable: The MythicFrame BEI Extension is not connected to port ${port}. ` +
      `Please ensure the extension is loaded in Chrome (chrome://extensions) and an authenticated ` +
      `${config.target === 'gemini' ? 'Gemini' : 'ChatGPT'} tab is open.`
    );
  }

  // Dynamic Context Assembly: Assembles the full 5-layer MythicFrame prompt:
  // Final Prompt = User Intent + Game Context (Setting/Tone) + Style Snippet + Spatial Constraints + System Rules
  const assembled = assembleFullMythicPrompt({
    ...params,
    aspectRatio: params.aspectRatio,
  });

  // Prepare optimized reference images if provided (Image-to-Image Multi-Modal RAG)
  let processedImages: Array<{ url: string; roleNote?: string }> = [];
  if (params.referenceAssets && params.referenceAssets.length > 0) {
    try {
      const { optimizeBase64Image } = await import('../utils/imageUtils');
      processedImages = await Promise.all(
        params.referenceAssets.map(async (ref) => {
          try {
            // Preserves transparent PNG/WebP cutout references
            const opt = await optimizeBase64Image(ref.url, 1024, 0.8);
            return { url: opt, roleNote: ref.roleNote };
          } catch {
            return { url: ref.url, roleNote: ref.roleNote };
          }
        })
      );
    } catch {
      processedImages = params.referenceAssets.map(ref => ({ url: ref.url, roleNote: ref.roleNote }));
    }
  }

  // Reference count limit: Gemini Web cannot handle more than 4-5 images reliably
  if (processedImages.length > 4) {
    console.warn(`[MythicFrame BEI] Limiting reference images from ${processedImages.length} to top 4 for web interface stability.`);
    processedImages = processedImages.slice(0, 4);
  }

  const chatSessionMode = params.chatSessionMode || (params.hasHoldingImages ? 'same_chat' : (config.chatSessionMode || 'temporary_chat'));

  const autoRotate = config.autoRotateOnQuota !== false;
  const initialSlot = config.accountSlot || 0;
  const prioritySlots = getBEIPrioritySlots(initialSlot);

  let slotIndex = 0;
  if (config.target === 'gemini' && autoRotate) {
    try {
      const { getBEIAccountQuota } = await import('./quotaTrackerService');
      const initQuota = getBEIAccountQuota('gemini', initialSlot);
      if (initQuota.status === 'rate_limited') {
        const readyIdx = prioritySlots.findIndex(s => getBEIAccountQuota('gemini', s).status !== 'rate_limited');
        if (readyIdx !== -1) {
          slotIndex = readyIdx;
          const chosenSlot = prioritySlots[slotIndex];
          console.log(`[MythicFrame BEI] Slot ${initialSlot} in cooldown. Advancing to ready priority Slot ${chosenSlot}...`);
          setBEIConfig({ accountSlot: chosenSlot });
        }
      }
    } catch {}
  }

  const triedSlots = new Set<number>();
  let lastQuotaError = '';

  while (slotIndex < prioritySlots.length) {
    const currentSlot = config.target === 'gemini' ? prioritySlots[slotIndex] : (config.accountSlot || 0);
    triedSlots.add(currentSlot);

    const payload = {
      target: config.target,
      prompt: assembled.imagePromptDirective,
      fullPrompt: assembled.fullPrompt,
      aspectRatio: params.aspectRatio || '16:9',
      accountSlot: currentSlot,
      timeoutSeconds: Math.max(config.timeoutSeconds || 900, 900),
      tabMode: config.tabMode || 'new_window_group',
      bringTabToFront: Boolean(config.bringTabToFront),
      chatSessionMode,
      tabSessionId: params.tabSessionId,
      images: processedImages,
      preferredBrowser: getEffectiveBEIBrowser(),
      quality: config.downloadQuality || 'ultra_original',
    };

    if (params.signal) {
      if (params.signal.aborted) {
        cancelBEIGeneration().catch(() => {});
        throw new DOMException('Generation aborted', 'AbortError');
      }
      params.signal.addEventListener('abort', () => {
        cancelBEIGeneration().catch(() => {});
      });
    }

    setLastBEIJobContext({
      target: config.target,
      accountSlot: currentSlot,
      prompt: assembled.imagePromptDirective,
      status: 'generating',
      error: undefined,
    });

    const directUrl = `http://127.0.0.1:${port}/api/bei/generate`;
    const fallbackUrl = `/api/bei/generate`;

    let response: Response | null = null;
    let lastError: any = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (params.signal?.aborted) {
        cancelBEIGeneration().catch(() => {});
        throw new DOMException('Generation aborted', 'AbortError');
      }

      try {
        response = await fetch(directUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: params.signal,
        });
        if (response && response.ok) break;
      } catch (err: any) {
        if (params.signal?.aborted || err?.name === 'AbortError') {
          cancelBEIGeneration().catch(() => {});
          throw err;
        }
        lastError = err;
        try {
          response = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: params.signal,
          });
          if (response && response.ok) break;
        } catch (fallbackErr: any) {
          if (params.signal?.aborted || fallbackErr?.name === 'AbortError') {
            cancelBEIGeneration().catch(() => {});
            throw fallbackErr;
          }
          lastError = fallbackErr;
        }
      }

      // Candidate Rescue Check: If fetch broke or timed out, see if server already captured the completed image
      const rescued = await refetchBEIAsset();
      if (rescued && rescued.image) {
        const { recordBEISlotUsage } = await import('./quotaTrackerService');
        recordBEISlotUsage(config.target, currentSlot, 'success');
        setBEIConfig({ accountSlot: currentSlot });
        return {
          image: rescued.image,
          metadata: {
            fullPrompt: assembled.fullPrompt,
            directivePrompt: assembled.imagePromptDirective,
            provider: 'bei',
            target: config.target,
            accountSlot: currentSlot,
            jobId: rescued.jobId,
          },
        };
      }

      if (attempt < maxAttempts) {
        window.dispatchEvent(new CustomEvent('mythic_bei_progress', {
          detail: {
            step: 'retrying',
            detail: `Connecting to bridge (attempt ${attempt}/${maxAttempts}). Waiting for generation to finalize...`
          }
        }));
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }

    if (!response) {
      // One last rescue attempt
      const finalRescue = await refetchBEIAsset();
      if (finalRescue && finalRescue.image) {
        const { recordBEISlotUsage } = await import('./quotaTrackerService');
        recordBEISlotUsage(config.target, currentSlot, 'success');
        setBEIConfig({ accountSlot: currentSlot });
        return {
          image: finalRescue.image,
          metadata: {
            fullPrompt: assembled.fullPrompt,
            directivePrompt: assembled.imagePromptDirective,
            provider: 'bei',
            target: config.target,
            accountSlot: currentSlot,
            jobId: finalRescue.jobId,
          },
        };
      }

      const errorMsg = `BEI Request failed: ${lastError?.message || 'Network error connecting to bridge'}`;
      setLastBEIJobContext({ status: 'failed', error: errorMsg });
      throw new Error(errorMsg);
    }

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const message = errorJson.message || errorJson.error || `HTTP ${response.status}: ${response.statusText}`;
      const isCancelled = /cancel|abort|stopped/i.test(message) || response.status === 499;
      if (isCancelled) {
        throw new Error(`Generation cancelled: ${message}`);
      }

      const { recordBEISlotUsage, getBEIAccountQuota } = await import('./quotaTrackerService');
      const isRateLimit = /limit|quota|exceeded|try again|too many requests|cooldown/i.test(message) || response.status === 429;
      recordBEISlotUsage(config.target, currentSlot, isRateLimit ? 'rate_limited' : 'error');

      // AUTO-ROTATE / FAILOVER: If rate limit hit and auto-rotate is enabled, try next priority slot
      if (isRateLimit && autoRotate && config.target === 'gemini') {
        lastQuotaError = message;
        const nextIdx = prioritySlots.findIndex((s, idx) => idx > slotIndex && !triedSlots.has(s) && getBEIAccountQuota('gemini', s).status !== 'rate_limited');
        const fallbackIdx = nextIdx !== -1 ? nextIdx : prioritySlots.findIndex((s, idx) => idx > slotIndex && !triedSlots.has(s));

        if (fallbackIdx !== -1) {
          const nextSlot = prioritySlots[fallbackIdx];
          window.dispatchEvent(new CustomEvent('mythic_bei_progress', {
            detail: {
              step: 'rotating_account',
              detail: `Slot ${currentSlot + 1} reached quota. Auto-rotating to priority Slot ${nextSlot + 1}...`
            }
          }));
          setBEIConfig({ accountSlot: nextSlot });
          slotIndex = fallbackIdx;
          await new Promise(r => setTimeout(r, 1000));
          continue; // Retry with next priority account!
        }
      }

      setLastBEIJobContext({ status: 'failed', error: message });
      if (triedSlots.size > 1) {
        throw new Error(`BEI Generation Failed: Tried ${triedSlots.size} priority accounts, but all reached quota/rate limits. (${message})`);
      }
      throw new Error(`BEI Generation Failed: ${message}`);
    }

    const result = await response.json();
    if (!result || !result.image) {
      const rescued = await refetchBEIAsset();
      if (rescued && rescued.image) {
        const { recordBEISlotUsage } = await import('./quotaTrackerService');
        recordBEISlotUsage(config.target, currentSlot, 'success');
        setBEIConfig({ accountSlot: currentSlot });
        return {
          image: rescued.image,
          metadata: {
            fullPrompt: assembled.fullPrompt,
            directivePrompt: assembled.imagePromptDirective,
            provider: 'bei',
            target: config.target,
            accountSlot: currentSlot,
            jobId: rescued.jobId,
          },
        };
      }
      setLastBEIJobContext({ status: 'failed', error: 'BEI Bridge completed but did not return image data.' });
      throw new Error('BEI Bridge completed but did not return image data.');
    }

    setLastBEIJobContext({
      jobId: result.jobId,
      status: 'completed',
      error: undefined
    });

    const { recordBEISlotUsage } = await import('./quotaTrackerService');
    recordBEISlotUsage(config.target, currentSlot, 'success');
    setBEIConfig({ accountSlot: currentSlot });

    return {
      image: result.image,
      metadata: {
        fullPrompt: assembled.fullPrompt,
        directivePrompt: assembled.imagePromptDirective,
        provider: 'bei',
        target: config.target,
        accountSlot: currentSlot,
        jobId: result.jobId,
      },
    };
  }

  throw new Error(`BEI Generation Failed: All priority accounts were exhausted. ${lastQuotaError}`);
};

export const cancelBEIGeneration = async (jobId?: string): Promise<boolean> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const urls = [
    `http://127.0.0.1:${port}/api/bei/cancel`,
    `/api/bei/cancel`
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (resp.ok) return true;
    } catch (e) {}
  }
  return false;
};

export const generateBEIText = async (prompt: string, timeoutSeconds = 60, images: any[] = []): Promise<string> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const urls = [
    `http://127.0.0.1:${port}/api/bei/text`,
    `/api/bei/text`
  ];

  const payload = {
    prompt,
    target: config.target,
    accountSlot: config.accountSlot || 0,
    timeoutSeconds,
    preferredBrowser: getEffectiveBEIBrowser()
  };

  let lastError: any = null;
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.text) return data.text.trim();
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`BEI text generation failed: ${lastError?.message || 'Bridge unreachable'}`);
};

export const resetBEISession = async (tabSessionId?: string): Promise<boolean> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const urls = [
    `http://127.0.0.1:${port}/api/bei/reset-session`,
    `/api/bei/reset-session`
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: config.target,
          accountSlot: config.accountSlot || 0,
          tabSessionId,
          preferredBrowser: getEffectiveBEIBrowser()
        })
      });
      if (resp.ok) return true;
    } catch (e) {}
  }
  return false;
};

export const scanBEIAccounts = async (): Promise<boolean> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const urls = [
    `http://127.0.0.1:${port}/api/bei/scan-accounts`,
    `/api/bei/scan-accounts`
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredBrowser: getEffectiveBEIBrowser()
        })
      });
      if (resp.ok) return true;
    } catch (e) {}
  }
  return false;
};

let beiEventSource: EventSource | null = null;
let reconnectTimeout: any = null;

export const initBEIProgressStream = (): void => {
  if (typeof window === 'undefined') return;
  if (beiEventSource && beiEventSource.readyState !== EventSource.CLOSED) return;

  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const urls = [
    `http://127.0.0.1:${port}/api/bei/events`,
    `/api/bei/events`
  ];

  const tryConnect = (idx: number) => {
    if (idx >= urls.length) {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => tryConnect(0), 5000);
      return;
    }

    try {
      const es = new EventSource(urls[idx]);
      beiEventSource = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data) {
            if (data.step && data.detail) {
              window.dispatchEvent(new CustomEvent('mythic_bei_progress', { detail: data }));
            }
            if (data.jobId || data.tabUrl || data.email || data.accountSlot !== undefined) {
              setLastBEIJobContext({
                jobId: data.jobId || undefined,
                chatUrl: data.tabUrl || undefined,
                email: data.email || undefined,
                accountSlot: typeof data.accountSlot === 'number' ? data.accountSlot : undefined,
                status: data.step === 'completed' ? 'completed' : data.step === 'failed' ? 'failed' : 'generating'
              });
            }
          }
        } catch (e) {}
      };

      es.onerror = () => {
        es.close();
        beiEventSource = null;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => tryConnect(idx + 1), 3000);
      };
    } catch (err) {
      tryConnect(idx + 1);
    }
  };

  tryConnect(0);
};

export const getBEIPayloads = async (jobId?: string): Promise<any> => {
  const config = getBEIConfig();
  const port = config.port || DEFAULT_BEI_PORT;
  const urlParam = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
  const urls = [
    `http://127.0.0.1:${port}/api/bei/payloads${urlParam}`,
    `/api/bei/payloads${urlParam}`
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.json();
    } catch (e) {}
  }
  return { success: false, payloads: [] };
};

if (typeof window !== 'undefined') {
  setTimeout(() => initBEIProgressStream(), 1000);
}
