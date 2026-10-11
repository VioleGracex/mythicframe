import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

export interface BEITabInfo {
  tabId: number;
  url: string;
  target: 'gemini' | 'chatgpt' | 'other';
  accountSlot?: number;
  email?: string;
  title?: string;
  status?: string;
  active?: boolean;
}

export interface BEIAccountInfo {
  slot: number;
  email: string;
  name?: string;
  tier?: 'free' | 'pro';
}

export interface MythicEngineStatus {
  serverRunning: boolean;
  serverUrl: string;
  bridgeRunning: boolean;
  bridgePort: number;
  beiConnected: boolean;
  tabs: BEITabInfo[];
  accounts: BEIAccountInfo[];
  activeJobsCount: number;
  hasGeminiApiKey: boolean;
  availableEngines: ('bei' | 'gemini-api' | 'prompt-only')[];
  summary: string;
}

export interface BEIGenerateOptions {
  prompt: string;
  aspectRatio?: string;
  target?: 'gemini' | 'chatgpt';
  accountSlot?: number;
  images?: string[];
  timeoutSeconds?: number;
  tabMode?: 'current' | 'new';
  bringTabToFront?: boolean;
  quality?: 'standard' | 'high' | 'ultra_original';
  dispatchMode?: 'single' | 'multi';
  chatSessionMode?: 'same_chat' | 'temporary_chat' | 'new_chat';
}

export interface BEIGenerateResult {
  success: boolean;
  filePath: string;
  imageBase64: string;
  jobId: string;
  metadata?: any;
}

const BRIDGE_PORT = Number(process.env.BEI_PORT) || 58925;
const WEB_PORT = Number(process.env.PORT) || 3488;

/**
 * Dynamically resolves the root directory of the MythicFrame project.
 * Works on any OS, drive letter, or installation directory.
 */
function resolveProjectRoot(): string {
  if (process.env.MYTHICFRAME_ROOT && fs.existsSync(process.env.MYTHICFRAME_ROOT)) {
    return path.resolve(process.env.MYTHICFRAME_ROOT);
  }

  const isMythicFrameDir = (dir: string): boolean => {
    try {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'mythicframe') return true;
      }
    } catch {
      // ignore
    }
    return fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'));
  };

  // 1. Check current working directory and walk up
  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (isMythicFrameDir(currentDir)) return currentDir;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  // 2. Resolve relative to entry file if executed via node and walk up
  if (process.argv[1]) {
    let scriptDir = path.dirname(path.resolve(process.argv[1]));
    for (let i = 0; i < 5; i++) {
      if (isMythicFrameDir(scriptDir)) return scriptDir;
      const parent = path.dirname(scriptDir);
      if (parent === scriptDir) break;
      scriptDir = parent;
    }
  }

  return process.cwd();
}

const PROJECT_ROOT = resolveProjectRoot();

/**
 * Checks the status of MythicFrame web server and BEI extension bridge.
 */
export async function checkMythicStatus(): Promise<MythicEngineStatus> {
  let bridgeRunning = false;
  let beiConnected = false;
  let tabs: BEITabInfo[] = [];
  let accounts: BEIAccountInfo[] = [];
  let activeJobsCount = 0;
  let serverRunning = false;

  // 1. Probe BEI Bridge port 58925
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/status`, {
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      bridgeRunning = true;
      const data: any = await res.json();
      beiConnected = !!data.connected;
      tabs = data.tabs || [];
      accounts = data.accounts || [];
      activeJobsCount = data.activeJobsCount || 0;
    }
  } catch {
    // Bridge offline
  }

  // 2. Probe Web server port 3488
  try {
    const res = await fetch(`http://localhost:${WEB_PORT}/api/bei/status`, {
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      serverRunning = true;
    }
  } catch {
    // Server offline
  }

  // 3. Check for Gemini API key in .env or .env.local
  let hasGeminiApiKey = false;
  try {
    const envLocal = path.join(PROJECT_ROOT, '.env.local');
    const envFile = path.join(PROJECT_ROOT, '.env');
    if (fs.existsSync(envLocal)) {
      const txt = fs.readFileSync(envLocal, 'utf8');
      if (/GEMINI_API_KEY=\S+/.test(txt)) hasGeminiApiKey = true;
    }
    if (!hasGeminiApiKey && fs.existsSync(envFile)) {
      const txt = fs.readFileSync(envFile, 'utf8');
      if (/GEMINI_API_KEY=\S+/.test(txt)) hasGeminiApiKey = true;
    }
    if (!hasGeminiApiKey && process.env.GEMINI_API_KEY) {
      hasGeminiApiKey = true;
    }
  } catch {
    // ignore
  }

  const availableEngines: ('bei' | 'gemini-api' | 'prompt-only')[] = ['prompt-only'];
  if (beiConnected && tabs.some(t => t.target === 'gemini' || t.target === 'chatgpt')) {
    availableEngines.unshift('bei');
  }
  if (hasGeminiApiKey) {
    availableEngines.push('gemini-api');
  }

  // Summary message
  const statusParts: string[] = [];
  if (serverRunning || bridgeRunning) {
    statusParts.push(`Server: Running on http://localhost:${WEB_PORT} (Bridge Port ${BRIDGE_PORT})`);
  } else {
    statusParts.push(`Server: OFFLINE (use mythic_launch_server or npm run dev)`);
  }

  if (beiConnected) {
    const activeTab = tabs.find(t => t.target === 'gemini' || t.target === 'chatgpt');
    const accountStr = activeTab?.email ? ` (${activeTab.email})` : '';
    statusParts.push(`BEI Extension: Connected with ${tabs.length} tab(s)${accountStr}`);
  } else {
    statusParts.push(`BEI Extension: Not connected (ensure Chrome extension is installed & Chrome tab open)`);
  }

  if (hasGeminiApiKey) {
    statusParts.push(`Gemini API Key: Configured in environment`);
  } else {
    statusParts.push(`Gemini API Key: Not configured (optional if using BEI)`);
  }

  return {
    serverRunning: serverRunning || bridgeRunning,
    serverUrl: `http://localhost:${WEB_PORT}`,
    bridgeRunning,
    bridgePort: BRIDGE_PORT,
    beiConnected,
    tabs,
    accounts,
    activeJobsCount,
    hasGeminiApiKey,
    availableEngines,
    summary: statusParts.join(' | ')
  };
}

/**
 * Auto-launches MythicFrame web/bridge server if not already running.
 */
export async function launchMythicServer(): Promise<{ success: boolean; message: string }> {
  const current = await checkMythicStatus();
  if (current.serverRunning) {
    return { success: true, message: `MythicFrame server is already running (${current.summary})` };
  }

  try {
    const isWindows = process.platform === "win32";
    const command = isWindows ? "cmd.exe" : "npm";
    const args = isWindows 
      ? ["/c", "start", "/MIN", "npm.cmd", "run", "dev"]
      : ["run", "dev"];

    const devServer = spawn(command, args, {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: { ...process.env, NODE_ENV: "development" }
    });
    devServer.unref();

    // Poll for up to 8 seconds
    const start = Date.now();
    while (Date.now() - start < 8000) {
      await new Promise(r => setTimeout(r, 1000));
      const checked = await checkMythicStatus();
      if (checked.serverRunning) {
        return {
          success: true,
          message: `Successfully launched MythicFrame server on http://localhost:${WEB_PORT} (Bridge Port: ${BRIDGE_PORT})`
        };
      }
    }

    return {
      success: true,
      message: `Launched server start command; please allow a few seconds for initialization on http://localhost:${WEB_PORT}.`
    };
  } catch (err: any) {
    return { success: false, message: `Failed to launch server: ${err.message}` };
  }
}

/**
 * Focuses or opens a Chrome browser tab for Google Gemini or ChatGPT via BEI.
 */
export async function openBEITab(target: 'gemini' | 'chatgpt' = 'gemini', accountSlot: number = 0): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/open-tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, accountSlot, bringTabToFront: true })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to open tab: ${errText}` };
    }
    const data: any = await res.json();
    return { success: true, message: `Opened/focused ${target} tab in Chrome (Account slot ${accountSlot})` };
  } catch (err: any) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}

/**
 * Triggers background scanning of Google account slots /u/0 through /u/3 via BEI.
 */
export async function scanBEIAccounts(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/scan-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Scan request failed: ${errText}` };
    }
    return { success: true, message: `Account auto-detection initiated in Chrome background.` };
  } catch (err: any) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}

/**
 * Ensures the target AI tab is active in Chrome to prevent background throttling.
 */
export async function setActiveBEITab(target: 'gemini' | 'chatgpt' = 'gemini', accountSlot: number = 0): Promise<{ success: boolean; message: string; tabId?: number }> {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/set-active-tab`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, accountSlot })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to set active tab: ${errText}` };
    }
    const data: any = await res.json();
    return { success: true, message: `Active tab set successfully for ${target} slot ${accountSlot}`, tabId: data.tabId };
  } catch (err: any) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}

/**
 * Fetches assets from Google Gemini Web Library (/library).
 */
export async function fetchBEILibraryAssets(target: 'gemini' = 'gemini', accountSlot: number = 0, limit: number = 5): Promise<{ success: boolean; assets?: any[]; message?: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, accountSlot, limit })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to fetch library assets: ${errText}` };
    }
    const data: any = await res.json();
    return { success: true, assets: data.assets || [], message: `Found ${(data.assets || []).length} assets in ${target} Library.` };
  } catch (err: any) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}

/**
 * Downloads a library asset URL into outputs/bei/ and returns the local file path.
 */
export async function saveLibraryAssetToFile(assetUrl: string, prefix = 'library'): Promise<{ filePath: string; sizeMB: string; base64: string } | null> {
  try {
    const outDir = path.join(PROJECT_ROOT, 'outputs', 'bei');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    let buffer: Buffer;
    let extension = 'jpg';

    if (assetUrl.startsWith('data:image/')) {
      const isPng = assetUrl.startsWith('data:image/png');
      extension = isPng ? 'png' : 'jpg';
      const base64Data = assetUrl.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      const res = await fetch(assetUrl, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) return null;
      const arrBuf = await res.arrayBuffer();
      buffer = Buffer.from(arrBuf);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('png')) extension = 'png';
      else if (ct.includes('webp')) extension = 'webp';
    }

    const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${extension}`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const sizeMB = `${(buffer.length / (1024 * 1024)).toFixed(2)} MB`;
    const base64 = `data:image/${extension === 'png' ? 'png' : 'jpeg'};base64,${buffer.toString('base64')}`;
    return { filePath, sizeMB, base64 };
  } catch (err) {
    console.warn('[MythicFrame BEI] Failed to save library asset to file:', err);
    return null;
  }
}

/**
 * Fetches all active settings, accounts, quotas, and preferences from MythicFrame.
 */
export async function getMythicSettings(): Promise<any> {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/status`, {
      signal: AbortSignal.timeout(3000)
    });
    const statusData = res.ok ? await res.json() : null;
    return {
      success: true,
      bridgeRunning: Boolean(statusData),
      bridgePort: BRIDGE_PORT,
      webPort: WEB_PORT,
      extensionVersion: statusData?.extensionVersion || '1.5.1',
      connected: Boolean(statusData?.connected),
      accounts: statusData?.accounts || [],
      tabs: statusData?.tabs || [],
      activeJobsCount: statusData?.activeJobsCount || 0
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Could not reach MythicFrame bridge on port ${BRIDGE_PORT}: ${err.message}`
    };
  }
}

/**
 * Dispatches an image generation request directly to the BEI extension bridge.
 */
export async function generateWithBEI(options: BEIGenerateOptions): Promise<BEIGenerateResult> {
  const {
    prompt,
    aspectRatio = '1:1',
    target = 'gemini',
    accountSlot = 0,
    images = [],
    timeoutSeconds = 900,
    tabMode = 'new_window_group',
    bringTabToFront = false,
    quality = 'ultra_original',
    dispatchMode = 'single',
    chatSessionMode = 'same_chat'
  } = options;

  // Process reference images (convert local file paths to base64 data URIs if necessary)
  const processedImages: string[] = [];
  for (const img of images) {
    if (img.startsWith('data:image/')) {
      processedImages.push(img);
    } else if (fs.existsSync(img)) {
      const ext = path.extname(img).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const b64 = fs.readFileSync(img).toString('base64');
      processedImages.push(`data:${mime};base64,${b64}`);
    }
  }

  const payload = {
    prompt,
    fullPrompt: prompt,
    aspectRatio,
    target,
    accountSlot,
    images: processedImages,
    timeoutSeconds,
    tabMode,
    bringTabToFront,
    quality,
    dispatchMode,
    chatSessionMode
  };

  let result: any = null;
  let chatError: any = null;

  try {
    const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData: any = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `BEI generation failed with status ${response.status}`);
    }

    result = await response.json();
    if (!result.success || !result.image) {
      throw new Error(result.error || 'BEI bridge did not return a valid image.');
    }
  } catch (err: any) {
    chatError = err;
    console.warn(`[MythicFrame BEI] Chat generation did not catch image: ${err.message}. Initiating Automated Library Failover Protocol...`);
  }

  // --- AUTOMATED LIBRARY FAILOVER PROTOCOL ---
  // If BEI chat generation timed out or failed to catch image in DOM,
  // query the Gemini Library (/library) to see if the generated asset exists there!
  if (!result || !result.image) {
    if (target === 'gemini') {
      try {
        console.log(`[MythicFrame BEI] Querying Google Gemini Library (Slot ${accountSlot}) for recent generation fallback...`);
        const libRes = await fetchBEILibraryAssets('gemini', accountSlot, 6);
        if (libRes.success && Array.isArray(libRes.assets) && libRes.assets.length > 0) {
          const latestAsset = libRes.assets[0];
          const assetUrl = latestAsset.highResUrl || latestAsset.src;
          if (assetUrl) {
            console.log(`[MythicFrame BEI] Automatically recovered image from Google Gemini Library: ${assetUrl}`);
            const saved = await saveLibraryAssetToFile(assetUrl, 'bei_library_failover');
            if (saved) {
              return {
                success: true,
                filePath: saved.filePath,
                imageBase64: saved.base64,
                jobId: `recovered_lib_${Date.now()}`,
                metadata: {
                  recoveredFromLibrary: true,
                  sourceUrl: assetUrl,
                  alt: latestAsset.alt || '',
                  originalError: chatError ? chatError.message : 'Chat timeout'
                }
              };
            }
          }
        }
      } catch (failoverErr: any) {
        console.warn(`[MythicFrame BEI] Library failover encountered error: ${failoverErr.message}`);
      }
    }

    throw new Error(chatError ? chatError.message : 'BEI generation failed and Library failover could not recover any generated assets.');
  }

  // Save generated image to local disk in outputs/bei
  const outDir = path.join(PROJECT_ROOT, 'outputs', 'bei');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const base64Data = result.image.replace(/^data:image\/\w+;base64,/, '');
  let buffer = Buffer.from(base64Data, 'base64');
  const isPng = result.image.startsWith('data:image/png');
  const extension = isPng ? 'png' : 'jpg';
  const fileName = `bei_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${extension}`;
  const filePath = path.join(outDir, fileName);

  // Safety net: if returned payload is a low-res thumbnail (< 500 KB) and quality is ultra_original,
  // check if Chrome downloaded the full ~2.4MB master into OS Downloads folder
  if (buffer.length < 500 * 1024 && quality !== 'standard') {
    try {
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      if (fs.existsSync(downloadsDir)) {
        const files = fs.readdirSync(downloadsDir)
          .filter(f => /Gemini_Generated_Image/i.test(f) && /\.(jpe?g|png)$/i.test(f))
          .map(f => {
            const fullPath = path.join(downloadsDir, f);
            const stat = fs.statSync(fullPath);
            return { fullPath, mtimeMs: stat.mtimeMs, size: stat.size };
          })
          .filter(f => Date.now() - f.mtimeMs < 90000 && f.size > 700 * 1024)
          .sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (files.length > 0) {
          const masterFile = files[0];
          const masterBuffer = fs.readFileSync(masterFile.fullPath);
          buffer = masterBuffer;
          result.image = `data:image/jpeg;base64,${masterBuffer.toString('base64')}`;
          try { fs.unlinkSync(masterFile.fullPath); } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('[MythicFrame BEI] Downloads safety check notice:', err);
    }
  }

  fs.writeFileSync(filePath, buffer);

  return {
    success: true,
    filePath,
    imageBase64: result.image,
    jobId: result.jobId,
    metadata: result.metadata
  };
}
