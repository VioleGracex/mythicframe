import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import os from 'os';

export function maskEmail(email?: string): string {
  if (!email || typeof email !== 'string') return 'anonymous';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx === -1) return 'masked';
  const user = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}***@${domain}`;
}

const AUDIT_LOG_DIR = path.join(os.homedir(), 'Documents', 'MythicFrame', 'logs');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'bei_session_audit.log');

export function writeSessionAuditLog(entry: {
  event: string;
  target?: string;
  accountSlot?: number | null;
  email?: string;
  tabId?: number | null;
  isBatch?: boolean;
  jobId?: string;
  details?: string;
  data?: Record<string, any>;
}) {
  try {
    if (!fs.existsSync(AUDIT_LOG_DIR)) {
      fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const masked = entry.email ? maskEmail(entry.email) : undefined;
    const slotStr = (entry.accountSlot !== undefined && entry.accountSlot !== null) ? `[Slot:${entry.accountSlot}] ` : '';
    const emailStr = masked ? `[User:${masked}] ` : '';
    const tabStr = (entry.tabId !== undefined && entry.tabId !== null) ? `[Tab:${entry.tabId}] ` : '';
    const batchStr = entry.isBatch ? `[Batch:true] ` : '';
    const jobStr = entry.jobId ? `[Job:${entry.jobId.slice(0, 16)}] ` : '';
    const detailsStr = entry.details ? entry.details.replace(/[\r\n]+/g, ' ') : '';

    const logLine = `[${timestamp}] [${entry.event}] ${slotStr}${emailStr}${tabStr}${batchStr}${jobStr}${detailsStr}\n`;
    fs.appendFileSync(AUDIT_LOG_FILE, logLine, 'utf8');
  } catch (err) {
    console.warn('[MythicFrame BEI Bridge] Failed to append to session audit log:', err);
  }
}

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
  tier?: 'free' | 'advanced' | 'pro' | 'workspace';
  capabilities?: {
    image: boolean;
    video: boolean;
    music: boolean;
    text: boolean;
  };
}

export interface BEIPayloadStatus {
  jobId: string;
  target: string;
  status: 'dispatched' | 'tab_routed' | 'generating' | 'capturing_image' | 'payload_ready' | 'completed' | 'failed' | 'cancelled';
  updatedAt: number;
  createdAt: number;
  promptExcerpt: string;
  retrievalMethod?: string;
  imageFormat?: 'base64' | 'url' | 'none';
  imageSize?: number;
  srcUrl?: string;
  imageBase64?: string;
  candidatesCount?: number;
  candidates?: string[];
  tabUrl?: string;
  accountSlot?: number;
  error?: string;
  steps: Array<{ step: string; detail: string; timestamp: number }>;
}

export interface ConnectedBrowserInfo {
  browser: string;
  browserName: string;
  tabsCount: number;
  accountsCount: number;
  lastSeen: number;
}

export interface BEIBridgeStatus {
  connected: boolean;
  port: number;
  extensionVersion: string;
  tabs: BEITabInfo[];
  accounts?: BEIAccountInfo[];
  activeJobsCount: number;
  lastHeartbeat?: number;
  projectDir?: string;
  recentPayloads?: BEIPayloadStatus[];
  connectedBrowsers?: ConnectedBrowserInfo[];
  activeBrowser?: string;
}

interface ExtensionClient {
  ws: WebSocket;
  browser: string;
  browserName: string;
  version: string;
  tabs: BEITabInfo[];
  accounts: BEIAccountInfo[];
  lastSeen: number;
}

interface PendingJob {
  jobId: string;
  target: 'gemini' | 'chatgpt';
  prompt: string;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeoutTimer: NodeJS.Timeout;
  isText?: boolean;
  accountSlot?: number;
}

export class BEIBridgeServer {
  private port: number;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private extensionSocket: WebSocket | null = null;
  private clients = new Map<WebSocket, ExtensionClient>();
  private knownTabs: BEITabInfo[] = [];
  private knownAccounts: BEIAccountInfo[] = [];

  private syncKnownAccounts(incomingAccounts?: any[]) {
    if (Array.isArray(incomingAccounts) && incomingAccounts.length > 0) {
      for (const acc of incomingAccounts) {
        if (acc && typeof acc.slot === 'number') {
          const email = (acc.email && !acc.email.includes('example.com')) ? acc.email : '';
          const idx = this.knownAccounts.findIndex(a => a.slot === acc.slot);
          if (idx !== -1) {
            this.knownAccounts[idx] = {
              ...this.knownAccounts[idx],
              email: email || this.knownAccounts[idx].email,
              name: (acc.name && !acc.name.includes('example.com')) ? acc.name : (email || this.knownAccounts[idx].name),
              tier: acc.tier || this.knownAccounts[idx].tier || 'free',
              capabilities: acc.capabilities || this.knownAccounts[idx].capabilities || { image: true, video: acc.tier === 'advanced', music: true, text: true }
            };
          } else {
            this.knownAccounts.push({
              slot: acc.slot,
              email,
              name: (acc.name && !acc.name.includes('example.com')) ? acc.name : (email || `Account ${acc.slot + 1}`),
              tier: acc.tier || 'free',
              capabilities: acc.capabilities || { image: true, video: acc.tier === 'advanced', music: true, text: true }
            });
          }
        }
      }
    }

    // Always extract and merge emails discovered from live tabs
    for (const tab of this.knownTabs) {
      if (tab.email && !tab.email.includes('example.com') && tab.target === 'gemini') {
        const slot = tab.accountSlot ?? 0;
        const idx = this.knownAccounts.findIndex(a => a.slot === slot);
        if (idx !== -1) {
          this.knownAccounts[idx].email = tab.email;
          if (!this.knownAccounts[idx].name || this.knownAccounts[idx].name.includes('Account')) {
            this.knownAccounts[idx].name = tab.email;
          }
        } else {
          this.knownAccounts.push({
            slot,
            email: tab.email,
            name: tab.email,
            tier: 'free',
            capabilities: { image: true, video: false, music: true, text: true }
          });
        }
      }
    }

    this.knownAccounts.sort((a, b) => a.slot - b.slot);
  }
  private pendingJobs = new Map<string, PendingJob>();
  private pendingActiveTabRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: any }>();
  private pendingVerifyTabRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: any }>();
  private pendingLibraryRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: any }>();
  private lastHeartbeat = Date.now();
  private extensionVersion = '1.5.5';
  private projectDir = process.cwd();
  public latestProgress: Record<string, { step: string; detail: string; timestamp: number }> = {};
  public globalProgress: { step: string; detail: string; timestamp: number } | null = null;
  public payloadHistory: Map<string, BEIPayloadStatus> = new Map();
  private progressListeners: Set<(data: any) => void> = new Set();
  private eventResponses: Set<http.ServerResponse> = new Set();

  constructor(port = 58925) {
    this.port = port;
  }

  public getPort(): number {
    return this.port;
  }

  public async ensureBrowserRunning(): Promise<boolean> {
    if (this.isConnected()) return true;
    if (process.platform === 'win32') {
      const chromePaths = [
        path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ];
      let launched = false;
      for (const p of chromePaths) {
        if (fs.existsSync(p)) {
          try {
            console.log(`[MythicFrame BEI Bridge] Auto-launching Google Chrome at: ${p}`);
            spawn(p, ['https://gemini.google.com/u/0/app'], { detached: true, stdio: 'ignore' }).unref();
            launched = true;
            break;
          } catch (e) {
            console.warn('[MythicFrame BEI Bridge] Failed to launch Chrome binary:', e);
          }
        }
      }
      if (!launched) {
        try {
          spawn('cmd.exe', ['/c', 'start', 'chrome', 'https://gemini.google.com/u/0/app'], { detached: true, stdio: 'ignore' }).unref();
          launched = true;
        } catch (e) {}
      }
      if (launched) {
        // Wait up to 5 seconds for extension WebSocket to connect
        const start = Date.now();
        while (Date.now() - start < 5000) {
          await new Promise(r => setTimeout(r, 600));
          if (this.isConnected()) {
            console.log('[MythicFrame BEI Bridge] Google Chrome connected via BEI extension after auto-launch.');
            return true;
          }
        }
      }
    }
    return this.isConnected();
  }

  public isConnected(): boolean {
    for (const [ws] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) return true;
    }
    return this.extensionSocket !== null && this.extensionSocket.readyState === WebSocket.OPEN;
  }

  public getClientSocket(preferredBrowser?: string): WebSocket | null {
    const norm = (preferredBrowser || '').toLowerCase().trim();
    if (norm && norm !== 'auto') {
      for (const [ws, client] of this.clients.entries()) {
        if (ws.readyState === WebSocket.OPEN && client.browser.toLowerCase() === norm) {
          return ws;
        }
      }
    }

    let latestClient: ExtensionClient | null = null;
    for (const [ws, client] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        if (!latestClient || client.lastSeen > latestClient.lastSeen) {
          latestClient = client;
        }
      }
    }
    return latestClient?.ws || (this.extensionSocket?.readyState === WebSocket.OPEN ? this.extensionSocket : null);
  }

  public getPayloadHistory(): BEIPayloadStatus[] {
    return Array.from(this.payloadHistory.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getPayloadStatus(jobId: string): BEIPayloadStatus | undefined {
    return this.payloadHistory.get(jobId);
  }

  public onProgress(cb: (data: any) => void) {
    this.progressListeners.add(cb);
  }

  public offProgress(cb: (data: any) => void) {
    this.progressListeners.delete(cb);
  }

  public broadcastProgress(progress: { jobId?: string; step: string; detail: string; timestamp?: number }) {
    const payload = { ...progress, timestamp: progress.timestamp || Date.now() };
    if (progress.jobId) {
      this.latestProgress[progress.jobId] = payload;
    }
    this.globalProgress = payload;

    for (const listener of this.progressListeners) {
      try { listener(payload); } catch (e) {}
    }

    const sseData = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of this.eventResponses) {
      try { res.write(sseData); } catch (e) { this.eventResponses.delete(res); }
    }
  }

  public handleEventsRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    if (this.globalProgress) {
      res.write(`data: ${JSON.stringify(this.globalProgress)}\n\n`);
    }
    this.eventResponses.add(res);
    req.on('close', () => {
      this.eventResponses.delete(res);
    });
  }

  public getStatus(): BEIBridgeStatus {
    if (this.knownTabs.length === 0 && this.isConnected()) {
      try {
        this.extensionSocket?.send(JSON.stringify({ type: 'LIST_TABS' }));
      } catch (e) {}
    }
    const connectedBrowsers: ConnectedBrowserInfo[] = [];
    let latestBrowser = 'chrome';
    let maxSeen = 0;
    for (const [ws, client] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        connectedBrowsers.push({
          browser: client.browser,
          browserName: client.browserName,
          tabsCount: client.tabs.length,
          accountsCount: client.accounts.length,
          lastSeen: client.lastSeen
        });
        if (client.lastSeen > maxSeen) {
          maxSeen = client.lastSeen;
          latestBrowser = client.browser;
        }
      }
    }

    return {
      connected: this.isConnected(),
      port: this.port,
      extensionVersion: this.extensionVersion,
      tabs: this.knownTabs,
      accounts: this.knownAccounts,
      activeJobsCount: this.pendingJobs.size,
      lastHeartbeat: this.lastHeartbeat,
      projectDir: this.projectDir,
      recentPayloads: Array.from(this.payloadHistory.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10),
      connectedBrowsers,
      activeBrowser: latestBrowser,
    };
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        // Universal CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        if (req.method === 'GET' && (url.pathname === '/api/bei/status' || url.pathname === '/status' || url.pathname === '/ping')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.getStatus()));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/bei/events') {
          this.handleEventsRequest(req, res);
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/bei/progress') {
          const jobId = url.searchParams.get('jobId');
          const progress = jobId ? this.latestProgress[jobId] : this.globalProgress;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, progress }));
          return;
        }

        if (req.method === 'GET' && (url.pathname === '/api/bei/payloads' || url.pathname === '/api/bei/payload-status')) {
          const jobId = url.searchParams.get('jobId');
          if (jobId) {
            const payload = this.payloadHistory.get(jobId);
            res.writeHead(payload ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: Boolean(payload), payload }));
          } else {
            const list = Array.from(this.payloadHistory.values()).sort((a, b) => b.createdAt - a.createdAt);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count: list.length, payloads: list }));
          }
          return;
        }

        if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/bei/refetch') {
          this.handleRefetchRequest(req, res);
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/bei/config') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ projectDir: this.projectDir, port: this.port }));
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/config') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              if (data.projectDir) this.projectDir = data.projectDir;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, projectDir: this.projectDir }));
            } catch (e: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/generate') {
          this.handleGenerateRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/text') {
          this.handleTextRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/reset-session') {
          this.handleResetSessionRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/cancel') {
          this.handleCancelRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/direct-image') {
          this.handleDirectImageRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/open-tab') {
          this.handleOpenTabRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/set-active-tab') {
          this.handleSetActiveTabRequest(req, res);
          return;
        }

        if (req.method === 'POST' && (url.pathname === '/api/bei/switch-and-verify-tab' || url.pathname === '/api/bei/verify-tab')) {
          this.handleSwitchAndVerifyTabRequest(req, res);
          return;
        }

        if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/bei/library') {
          this.handleFetchLibraryRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/scan-accounts') {
          this.handleScanAccountsRequest(req, res);
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/bei/reload-extension') {
          this.handleReloadExtensionRequest(req, res);
          return;
        }

        if (req.method === 'POST' && (url.pathname === '/api/system/shutdown' || url.pathname === '/shutdown')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'MythicFrame BEI Bridge is shutting down...' }));
          setTimeout(() => {
            this.stop().then(() => process.exit(0)).catch(() => process.exit(0));
          }, 300);
          return;
        }

        if (res.headersSent) return;
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'NOT_FOUND', path: url.pathname }));
      });

      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws: WebSocket, req) => {
        console.log(`[MythicFrame BEI Bridge] Extension client connected to ws://127.0.0.1:${this.port}`);
        this.extensionSocket = ws;
        this.clients.set(ws, {
          ws,
          browser: 'chrome',
          browserName: 'Google Chrome',
          version: '1.2.0',
          tabs: [],
          accounts: [],
          lastSeen: Date.now()
        });
        this.lastHeartbeat = Date.now();

        // Welcome handshake
        ws.send(JSON.stringify({
          type: 'bridge_handshake',
          data: {
            bridge: 'MythicFrame BEI Bridge',
            port: this.port,
            timestamp: Date.now()
          }
        }));

        // Immediately request current tabs and discovered accounts
        ws.send(JSON.stringify({ type: 'LIST_TABS' }));

        ws.on('message', (data: any) => {
          try {
            const raw = typeof data === 'string' ? data : data.toString('utf8');
            const msg = JSON.parse(raw);
            this.handleExtensionMessage(msg, ws);
          } catch (err) {
            console.warn('[MythicFrame BEI Bridge] Error parsing message from extension:', err);
          }
        });

        ws.on('close', () => {
          console.log('[MythicFrame BEI Bridge] Extension client disconnected');
          this.clients.delete(ws);
          if (this.extensionSocket === ws) {
            this.extensionSocket = this.getClientSocket();
          }
        });

        ws.on('error', (err) => {
          console.warn('[MythicFrame BEI Bridge] WebSocket client error:', err);
        });
      });

      this.httpServer.on('error', (err) => {
        console.error(`[MythicFrame BEI Bridge] HTTP server error on port ${this.port}:`, err);
        reject(err);
      });

      this.httpServer.listen(this.port, '0.0.0.0', () => {
        console.log(`⚡ MythicFrame BEI Bridge listening on unique port ${this.port} (WS & HTTP)`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.extensionSocket) {
      try {
        this.extensionSocket.close();
      } catch (e) {}
      this.extensionSocket = null;
    }
    for (const res of this.eventResponses) {
      try {
        res.end();
      } catch (e) {}
    }
    this.eventResponses.clear();

    if (this.wss) {
      try {
        this.wss.close();
      } catch (e) {}
      this.wss = null;
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close(() => resolve());
      });
      this.httpServer = null;
    }
    console.log(`[MythicFrame BEI Bridge] Bridge server on port ${this.port} stopped.`);
  }

  private handleExtensionMessage(msg: any, ws: WebSocket) {
    const { type, data } = msg;

    if (type === 'ping') {
      this.lastHeartbeat = Date.now();
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      return;
    }

    if (type === 'AUDIT_LOG') {
      if (data) {
        writeSessionAuditLog({
          event: data.event || 'AUDIT_EVENT',
          target: data.target,
          accountSlot: data.accountSlot,
          email: data.email,
          tabId: data.tabId,
          isBatch: Boolean(data.isBatch),
          jobId: data.jobId,
          details: data.details,
          data: data.extra
        });
      }
      return;
    }

    if (type === 'pong') {
      this.lastHeartbeat = Date.now();
      return;
    }

    if (type === 'browser_bridge_connected' || type === 'extension_connected') {
      this.lastHeartbeat = Date.now();
      const client = this.clients.get(ws);
      const browser = data?.browser || 'chrome';
      const browserName = data?.browserName || (browser === 'brave' ? 'Brave' : browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome');
      if (client) {
        client.browser = browser;
        client.browserName = browserName;
        if (data?.version) client.version = data.version;
        if (Array.isArray(data?.tabs)) client.tabs = data.tabs;
        if (Array.isArray(data?.accounts)) client.accounts = data.accounts;
        client.lastSeen = Date.now();
      }
      if (data?.version) this.extensionVersion = data.version;
      if (data?.projectDir) this.projectDir = data.projectDir;
      if (Array.isArray(data?.tabs)) {
        this.knownTabs = data.tabs;
      }
      this.syncKnownAccounts(data?.accounts);
      console.log(`[MythicFrame BEI Bridge] Extension registered (${browserName}). Discovered tabs: ${this.knownTabs.length}, Accounts: ${this.knownAccounts.length}`);
      writeSessionAuditLog({
        event: 'EXTENSION_CONNECTED',
        details: `Connected to ${browserName} v${data?.version || ''} (${this.knownTabs.length} tabs, ${this.knownAccounts.length} accounts)`,
        data: { tabsCount: this.knownTabs.length, accountsCount: this.knownAccounts.length }
      });
      return;
    }

    if (type === 'update_project_dir') {
      if (data?.projectDir) {
        this.projectDir = data.projectDir;
        console.log(`[MythicFrame BEI Bridge] Updated project directory from extension: ${this.projectDir}`);
      }
      return;
    }

    if (type === 'tab_status_update' || type === 'tabs_list') {
      if (Array.isArray(data?.tabs)) {
        this.knownTabs = data.tabs;
      } else if (data?.tabId) {
        const existingIdx = this.knownTabs.findIndex(t => t.tabId === data.tabId);
        if (existingIdx !== -1) {
          this.knownTabs[existingIdx] = { ...this.knownTabs[existingIdx], ...data };
        } else {
          this.knownTabs.push(data);
        }
      }
      this.syncKnownAccounts(data?.accounts);
      return;
    }

    if (type === 'GENERATION_PROGRESS') {
      const jobId = data?.jobId;
      if (jobId) {
        const payloadRecord = this.payloadHistory.get(jobId);
        if (payloadRecord) {
          payloadRecord.status = data?.step || payloadRecord.status;
          payloadRecord.updatedAt = Date.now();
          payloadRecord.steps.push({
            step: data?.step || 'progress',
            detail: data?.detail || '',
            timestamp: data?.timestamp || Date.now()
          });
        }
      }
      if (jobId && this.pendingJobs.has(jobId)) {
        const job = this.pendingJobs.get(jobId)!;
        clearTimeout(job.timeoutTimer);
        // Extend timeout while actively receiving progress updates (10 minutes per heartbeat ping)
        job.timeoutTimer = setTimeout(() => {
          if (this.pendingJobs.has(jobId)) {
            this.pendingJobs.delete(jobId);
            job.reject(new Error(`BEI Generation timed out while awaiting browser completion for target ${job.target}`));
          }
        }, 600000);
      }
      if (data) {
        this.broadcastProgress(data);
      }
      return;
    }

    if (type === 'GENERATION_COMPLETED') {
      const jobId = data?.jobId || data?.job_id;
      if (jobId && this.pendingJobs.has(jobId)) {
        const job = this.pendingJobs.get(jobId)!;
        clearTimeout(job.timeoutTimer);
        this.pendingJobs.delete(jobId);

        const mediaType = data.mediaType || (data.video || data.videoUrl ? 'video' : (data.audio || data.audioUrl ? 'audio' : 'image'));
        const video = data.video || data.videoUrl;
        const audio = data.audio || data.audioUrl;

        // Video Generation Handling (Veo / HTML5 Video)
        if (mediaType === 'video' && video) {
          let videoUrl = video;
          if (typeof video === 'string' && video.startsWith('data:video/')) {
            try {
              const videoDir = path.join(process.cwd(), 'outputs', 'video');
              if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
              const fileName = `video_${Date.now()}_${jobId}.mp4`;
              const filePath = path.join(videoDir, fileName);
              const b64Data = video.split(',')[1];
              fs.writeFileSync(filePath, Buffer.from(b64Data, 'base64'));
              videoUrl = `/outputs/video/${fileName}`;
            } catch (vErr) {
              console.warn('[MythicFrame BEI Bridge] Error saving video file:', vErr);
            }
          }
          this.broadcastProgress({
            jobId,
            step: 'completed',
            detail: 'Video generation completed successfully!'
          });
          job.resolve({
            success: true,
            mediaType: 'video',
            video: videoUrl,
            image: videoUrl,
            jobId,
            metadata: {
              target: job.target,
              mediaType: 'video',
              fullPrompt: data.fullPrompt || job.prompt,
              accountSlot: data.accountSlot
            }
          });
          return;
        }

        // Music / Audio Generation Handling
        if (mediaType === 'audio' && audio) {
          let audioUrl = audio;
          if (typeof audio === 'string' && audio.startsWith('data:audio/')) {
            try {
              const musicDir = path.join(process.cwd(), 'outputs', 'music');
              if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
              const fileName = `audio_${Date.now()}_${jobId}.mp3`;
              const filePath = path.join(musicDir, fileName);
              const b64Data = audio.split(',')[1];
              fs.writeFileSync(filePath, Buffer.from(b64Data, 'base64'));
              audioUrl = `/outputs/music/${fileName}`;
            } catch (aErr) {
              console.warn('[MythicFrame BEI Bridge] Error saving audio file:', aErr);
            }
          }
          this.broadcastProgress({
            jobId,
            step: 'completed',
            detail: 'Audio generation completed successfully!'
          });
          job.resolve({
            success: true,
            mediaType: 'audio',
            audio: audioUrl,
            image: audioUrl,
            jobId,
            metadata: {
              target: job.target,
              mediaType: 'audio',
              fullPrompt: data.fullPrompt || job.prompt,
              accountSlot: data.accountSlot
            }
          });
          return;
        }

        let image = data.image || data.imageUrl || data.imageData;
        if (Array.isArray(image) && image.length > 0) {
          image = typeof image[0] === 'string' ? image[0] : image[0].url || image[0].base64;
        }

        // Bulletproof server-side fallback: If image is a remote URL, fetch and convert to base64 Data URI
        (async () => {
          let converted = false;
          if (typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://'))) {
            try {
              console.log(`[MythicFrame BEI Bridge] Converting image URL to Base64 data URI: ${image.substring(0, 80)}...`);
              const imgRes = await fetch(image, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                }
              });
              if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                const mime = imgRes.headers.get('content-type') || 'image/png';
                const b64 = Buffer.from(arrayBuffer).toString('base64');
                image = `data:${mime};base64,${b64}`;
                converted = true;
                console.log(`[MythicFrame BEI Bridge] Image converted to Base64 successfully (${Math.round(image.length / 1024)} KB)`);
              } else {
                console.warn(`[MythicFrame BEI Bridge] Fetching image returned HTTP ${imgRes.status}`);
              }
            } catch (convErr: any) {
              console.warn(`[MythicFrame BEI Bridge] Server-side image URL conversion notice:`, convErr?.message || convErr);
            }
          }

          // Strict Webpage URL Rejection: Never treat html routes as image data
          const isWebpageUrl = typeof image === 'string' && (
            image.includes('gemini.google.com') || 
            image.includes('chatgpt.com') ||
            image.endsWith('/u/0') || 
            image.endsWith('/u/0/')
          );
          if (isWebpageUrl) {
            console.warn(`[MythicFrame BEI Bridge] Rejected webpage URL misidentified as image: ${image}`);
            image = '';
          }

          // Candidate Rescue: If primary image was corrupted or rejected, check candidate URLs
          if (!image || (!image.startsWith('data:image') && !image.startsWith('http'))) {
            const candidateUrls = Array.isArray(data.metadata?.candidates) ? data.metadata.candidates : [];
            const validCandidate = candidateUrls.find((c: string) => 
              typeof c === 'string' && 
              !c.includes('gemini.google.com') && 
              (c.includes('googleusercontent.com') || c.startsWith('blob:') || c.startsWith('data:image'))
            );
            if (validCandidate) {
              console.log(`[MythicFrame BEI Bridge] Rescued image for job ${jobId} using candidate URL: ${validCandidate.substring(0, 80)}...`);
              image = validCandidate;
            }
          }

          // Image validation: Accept valid Data URIs OR valid remote image URLs
          const isDataUri = typeof image === 'string' && image.startsWith('data:image') && image.length > 512;
          const isRemoteUrl = typeof image === 'string' && (image.startsWith('http://') || image.startsWith('https://')) && image.length > 15 && !image.includes('gemini.google.com');
          const isValidImage = isDataUri || isRemoteUrl;

          // Update payload tracking
          const payloadRecord = this.payloadHistory.get(jobId);
          if (payloadRecord) {
            payloadRecord.updatedAt = Date.now();
            payloadRecord.status = isValidImage ? 'completed' : 'failed';
            payloadRecord.imageFormat = isDataUri ? 'base64' : (isRemoteUrl ? 'url' : 'none');
            payloadRecord.imageSize = typeof image === 'string' ? image.length : 0;
            payloadRecord.srcUrl = data.metadata?.srcUrl || (isRemoteUrl ? image : undefined);
            payloadRecord.imageBase64 = isDataUri ? image : undefined;
            payloadRecord.candidates = data.metadata?.candidates;
            payloadRecord.tabUrl = data.metadata?.tabUrl || data.tabUrl;
            payloadRecord.accountSlot = data.accountSlot ?? job.accountSlot;
            payloadRecord.retrievalMethod = converted ? 'server_fetch' : (data.metadata?.retrievalMethod || (isDataUri ? 'extension_base64' : 'remote_url'));
            payloadRecord.candidatesCount = Array.isArray(data.metadata?.candidates) ? data.metadata.candidates.length : 0;
            payloadRecord.steps.push({
              step: isValidImage ? 'completed' : 'failed',
              detail: isValidImage 
                ? `Payload validated successfully (format: ${payloadRecord.imageFormat}, size: ${Math.round(payloadRecord.imageSize / 1024)} KB, method: ${payloadRecord.retrievalMethod})`
                : 'Payload validation failed: returned image data is empty or invalid format.',
              timestamp: Date.now()
            });
          }

          if (!isValidImage) {
            console.error(`[MythicFrame BEI Bridge] Corrupted image result for job ${jobId}. Image data is empty or invalid.`);
            job.reject(new Error('Image generated in browser, but asset retrieval failed or returned corrupted data. Please click Generate to retry.'));
            return;
          }

          console.log(`[MythicFrame BEI Bridge] Job ${jobId} completed successfully! (format: ${isDataUri ? 'base64' : 'url'}, method: ${payloadRecord?.retrievalMethod || 'unknown'})`);
          this.broadcastProgress({
            jobId,
            step: 'completed',
            detail: 'Image generation completed successfully!'
          });

          job.resolve({
            success: true,
            image,
            jobId,
            metadata: {
              target: job.target,
              fullPrompt: data.fullPrompt || job.prompt,
              aspectRatio: data.aspectRatio,
              accountSlot: data.accountSlot,
              srcUrl: data.metadata?.srcUrl,
              candidates: data.metadata?.candidates,
              retrievalMethod: payloadRecord?.retrievalMethod,
              imageFormat: isDataUri ? 'base64' : 'url'
            }
          });
        })();
      }
      return;
    }

    if (type === 'TEXT_COMPLETED') {
      const jobId = data?.jobId;
      if (jobId && this.pendingJobs.has(jobId)) {
        const job = this.pendingJobs.get(jobId)!;
        clearTimeout(job.timeoutTimer);
        this.pendingJobs.delete(jobId);
        job.resolve({ success: true, text: data.text, jobId });
      }
      return;
    }

    if (type === 'TEXT_FAILED') {
      const jobId = data?.jobId;
      if (jobId && this.pendingJobs.has(jobId)) {
        const job = this.pendingJobs.get(jobId)!;
        clearTimeout(job.timeoutTimer);
        this.pendingJobs.delete(jobId);
        job.reject(new Error(data.error || 'Text generation failed in browser tab'));
      }
      return;
    }

    if (type === 'GENERATION_FAILED') {
      const jobId = data?.jobId || data?.job_id;
      if (jobId) {
        const payloadRecord = this.payloadHistory.get(jobId);
        if (payloadRecord) {
          payloadRecord.status = 'failed';
          payloadRecord.updatedAt = Date.now();
          payloadRecord.error = data.error || 'Generation failed in browser tab';
          payloadRecord.steps.push({
            step: 'failed',
            detail: payloadRecord.error,
            timestamp: Date.now()
          });
        }
      }
      if (jobId && this.pendingJobs.has(jobId)) {
        const job = this.pendingJobs.get(jobId)!;
        clearTimeout(job.timeoutTimer);
        this.pendingJobs.delete(jobId);

        const errorMsg = data.error || 'Generation failed in browser tab';
        console.warn(`[MythicFrame BEI Bridge] Job ${jobId} failed:`, errorMsg);
        this.broadcastProgress({
          jobId,
          step: 'failed',
          detail: errorMsg
        });
        job.reject(new Error(errorMsg));
      }
      return;
    }

    if (type === 'GENERATION_CANCELLED') {
      const jobId = data?.jobId || data?.job_id;
      if (jobId) {
        const payloadRecord = this.payloadHistory.get(jobId);
        if (payloadRecord) {
          payloadRecord.status = 'cancelled';
          payloadRecord.updatedAt = Date.now();
          payloadRecord.steps.push({
            step: 'cancelled',
            detail: data.reason || 'Generation cancelled manually by user in browser tab',
            timestamp: Date.now()
          });
        }
      }
      if (jobId && this.pendingJobs.has(jobId)) {
        const job = this.pendingJobs.get(jobId)!;
        clearTimeout(job.timeoutTimer);
        this.pendingJobs.delete(jobId);

        const reason = data.reason || 'Generation cancelled manually by user in browser tab';
        console.log(`[MythicFrame BEI Bridge] Job ${jobId} cancelled: ${reason}`);
        this.broadcastProgress({
          jobId,
          step: 'cancelled',
          detail: reason
        });
        job.reject(new Error(`CANCELLED: ${reason}`));
      }
      return;
    }

    if (type === 'ACTIVE_TAB_SET') {
      for (const [id, req] of this.pendingActiveTabRequests.entries()) {
        clearTimeout(req.timer);
        this.pendingActiveTabRequests.delete(id);
        req.resolve(data);
      }
      return;
    }

    if (type === 'TAB_VERIFIED') {
      const reqId = data?.reqId;
      if (reqId && this.pendingVerifyTabRequests.has(reqId)) {
        const req = this.pendingVerifyTabRequests.get(reqId)!;
        clearTimeout(req.timer);
        this.pendingVerifyTabRequests.delete(reqId);
        req.resolve(data);
      } else {
        for (const [id, req] of this.pendingVerifyTabRequests.entries()) {
          clearTimeout(req.timer);
          this.pendingVerifyTabRequests.delete(id);
          req.resolve(data);
        }
      }
      return;
    }

    if (type === 'LIBRARY_ASSETS_FETCHED') {
      for (const [id, req] of this.pendingLibraryRequests.entries()) {
        clearTimeout(req.timer);
        this.pendingLibraryRequests.delete(id);
        req.resolve(data);
      }
      return;
    }
  }

  private parseRequestBody(req: any): Promise<any> {
    if (req.body && typeof req.body === 'object') {
      return Promise.resolve(req.body);
    }
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  public async handleGenerateRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const payload = await this.parseRequestBody(req);
      const { target = 'gemini', prompt, fullPrompt, aspectRatio = '16:9', accountSlot = 0, timeoutSeconds = 120, images = [], tabMode = 'same_window_group', bringTabToFront, chatSessionMode = 'same_chat', tabSessionId, preferredBrowser, browser } = payload;

      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'MISSING_PROMPT', message: 'Prompt is required' }));
        return;
      }

      if (!this.isConnected()) {
        await this.ensureBrowserRunning();
      }

      if (!this.isConnected()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'BEI_EXTENSION_NOT_CONNECTED',
            message: 'MythicFrame BEI Chrome Extension is not currently connected. Please load the unpacked extension from /bei-extension and keep a Gemini or ChatGPT tab open.'
          }));
          return;
        }

        const effectiveTimeout = Math.max(
          timeoutSeconds || 900,
          900
        );

        const jobId = `bei_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const hasExplicitSlot = payload.accountSlot !== undefined;
        console.log(`[MythicFrame BEI Bridge] Dispatching job ${jobId} to extension (Target: ${target}, Slot: ${accountSlot}, Images: ${images.length}, Timeout: ${effectiveTimeout}s, ChatMode: ${chatSessionMode}, Batch: ${payload.dispatchMode === 'multi'})`);
        writeSessionAuditLog({
          event: 'PROMPT_DISPATCHED',
          target,
          accountSlot: hasExplicitSlot ? accountSlot : undefined,
          jobId,
          isBatch: payload.dispatchMode === 'multi',
          details: `Dispatched image generation job (prompt len: ${prompt.length}, timeout: ${effectiveTimeout}s, batch: ${payload.dispatchMode === 'multi'})`
        });

        const timeoutTimer = setTimeout(() => {
          if (this.pendingJobs.has(jobId)) {
            const job = this.pendingJobs.get(jobId)!;
            this.pendingJobs.delete(jobId);
            job.reject(new Error(`BEI Generation timed out after ${effectiveTimeout} seconds in target ${target}`));
          }
        }, effectiveTimeout * 1000);

        const jobPromise = new Promise<{ success: boolean; image: string; jobId: string; metadata?: any }>((resolve, reject) => {
          this.pendingJobs.set(jobId, {
            jobId,
            target,
            prompt,
            accountSlot: hasExplicitSlot ? accountSlot : undefined,
            resolve,
            reject,
            timeoutTimer
          });
        });

        // Initialize payload tracking record
        this.payloadHistory.set(jobId, {
          jobId,
          target,
          status: 'dispatched',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          promptExcerpt: (prompt || '').substring(0, 150),
          steps: [{
            step: 'dispatched',
            detail: `Dispatched generation request to Chrome Extension (${target}, slot ${accountSlot})...`,
            timestamp: Date.now()
          }]
        });
        if (this.payloadHistory.size > 50) {
          const oldestKey = this.payloadHistory.keys().next().value;
          if (oldestKey) this.payloadHistory.delete(oldestKey);
        }

        // Broadcast initial dispatch progress
        this.broadcastProgress({
          jobId,
          step: 'dispatched',
          detail: `Dispatched generation request to Chrome Extension (${target}, slot ${accountSlot})...`
        });

        // Send command to targeted extension socket
        const targetSocket = this.getClientSocket(preferredBrowser || browser);
        if (!targetSocket) {
          clearTimeout(timeoutTimer);
          this.pendingJobs.delete(jobId);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'TARGET_BROWSER_NOT_CONNECTED',
            message: `The BEI Extension is not currently connected in the requested browser (${preferredBrowser || 'auto'}). Please ensure the extension is active in that browser.`
          }));
          return;
        }

        targetSocket.send(JSON.stringify({
          type: 'EXECUTE_PROMPT',
          data: {
            jobId,
            target,
            prompt,
            fullPrompt: fullPrompt || prompt,
            aspectRatio,
            accountSlot: hasExplicitSlot ? accountSlot : undefined,
            timeoutSeconds: effectiveTimeout,
            images,
            tabMode,
            bringTabToFront,
            chatSessionMode,
            tabSessionId,
            quality: payload.quality || 'ultra_original',
            dispatchMode: payload.dispatchMode || 'single'
          }
        }));

        jobPromise
          .then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            writeSessionAuditLog({
              event: 'PROMPT_COMPLETED',
              target,
              accountSlot: result.metadata?.accountSlot ?? accountSlot,
              jobId,
              isBatch: payload.dispatchMode === 'multi',
              details: `Generation completed successfully for job ${jobId}`
            });
            res.end(JSON.stringify(result));
          })
          .catch(err => {
            const isCancelled = /cancel|abort|stop/i.test(err?.message || '');
            writeSessionAuditLog({
              event: isCancelled ? 'PROMPT_CANCELLED' : 'PROMPT_FAILED',
              target,
              accountSlot,
              jobId,
              isBatch: payload.dispatchMode === 'multi',
              details: `Generation ${isCancelled ? 'cancelled' : 'failed'} for job ${jobId}: ${err?.message || String(err)}`
            });
            res.writeHead(isCancelled ? 499 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: isCancelled ? 'BEI_GENERATION_CANCELLED' : 'BEI_GENERATION_FAILED',
              message: err?.message || String(err),
              jobId
            }));
          });

      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'INVALID_JSON', message: e.message }));
      }
  }

  public async handleCancelRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const { jobId } = (await this.parseRequestBody(req)) || {};
        if (jobId && this.pendingJobs.has(jobId)) {
          const job = this.pendingJobs.get(jobId)!;
          clearTimeout(job.timeoutTimer);
          this.pendingJobs.delete(jobId);
          this.broadcastProgress({
            jobId,
            step: 'cancelled',
            detail: 'Generation cancelled by user'
          });
          job.reject(new Error('CANCELLED: Generation cancelled by user'));
        } else if (!jobId) {
          for (const [id, job] of this.pendingJobs.entries()) {
            clearTimeout(job.timeoutTimer);
            this.pendingJobs.delete(id);
            this.broadcastProgress({
              jobId: id,
              step: 'cancelled',
              detail: 'Generation cancelled by user'
            });
            job.reject(new Error('CANCELLED: Generation cancelled by user'));
          }
        }

        if (this.isConnected()) {
          this.extensionSocket!.send(JSON.stringify({
            type: 'CANCEL_GENERATION',
            data: { jobId }
          }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, cancelled: jobId || 'all' }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'INVALID_REQUEST', message: err.message }));
      }
  }

  public async handleTextRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const payload = await this.parseRequestBody(req);
      const { prompt, target = 'gemini', accountSlot = 0, timeoutSeconds = 60, images = [], preferredBrowser, browser } = payload;
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'MISSING_PROMPT', message: 'Prompt is required' }));
        return;
      }

      if (!this.isConnected()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'BEI_EXTENSION_NOT_CONNECTED', message: 'BEI extension is not connected' }));
        return;
      }

      const jobId = `text_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      console.log(`[MythicFrame BEI Bridge] Dispatching text job ${jobId} (Target: ${target}, Slot: ${accountSlot})`);

      const timeoutTimer = setTimeout(() => {
        if (this.pendingJobs.has(jobId)) {
          const job = this.pendingJobs.get(jobId)!;
          this.pendingJobs.delete(jobId);
          job.reject(new Error('BEI text generation timed out in browser tab'));
        }
      }, timeoutSeconds * 1000);

      const jobPromise = new Promise<{ success: boolean; text: string; jobId: string }>((resolve, reject) => {
        this.pendingJobs.set(jobId, {
          jobId,
          target,
          prompt,
          resolve,
          reject,
          timeoutTimer,
          isText: true
        });
      });

      const processedImages: string[] = [];
      if (Array.isArray(images)) {
        for (const img of images) {
          if (typeof img === 'string') {
            if (img.startsWith('data:image/')) {
              processedImages.push(img);
            } else if (fs.existsSync(img)) {
              const ext = path.extname(img).toLowerCase();
              const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
              const b64 = fs.readFileSync(img).toString('base64');
              processedImages.push(`data:${mime};base64,${b64}`);
            }
          }
        }
      }

      const targetSocket = this.getClientSocket(preferredBrowser || browser) || this.extensionSocket;
      targetSocket!.send(JSON.stringify({
        type: 'EXECUTE_TEXT_PROMPT',
        data: {
          jobId,
          target,
          prompt,
          accountSlot,
          timeoutSeconds,
          images: processedImages
        }
      }));

      jobPromise
        .then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        })
        .catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'TEXT_GEN_FAILED', message: err?.message || String(err) }));
        });

    } catch (e: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_JSON', message: e.message }));
    }
  }

  public async handleResetSessionRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const payload = await this.parseRequestBody(req);
      const { target = 'gemini', accountSlot = 0, tabSessionId, preferredBrowser, browser } = payload;
      console.log(`[MythicFrame BEI Bridge] Resetting session for ${target} slot ${accountSlot} (TabSession: ${tabSessionId || 'none'})`);

      if (this.isConnected()) {
        const targetSocket = this.getClientSocket(preferredBrowser || browser) || this.extensionSocket;
        targetSocket?.send(JSON.stringify({
          type: 'RESET_SESSION',
          data: { target, accountSlot, tabSessionId }
        }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, reset: true }));
    } catch (e: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_JSON', message: e.message }));
    }
  }

  public async handleDirectImageRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const payload = await this.parseRequestBody(req);
      const jobId = payload.jobId || payload.job_id;
      let image = payload.image_base64 || payload.imageBase64 || payload.image_url || payload.imageUrl;

      if (jobId && this.pendingJobs.has(jobId)) {
        const job = this.pendingJobs.get(jobId)!;
        clearTimeout(job.timeoutTimer);
        this.pendingJobs.delete(jobId);

        job.resolve({
          success: true,
          image,
          jobId,
          metadata: {
            target: job.target,
            fullPrompt: job.prompt
          }
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, received: true }));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_DIRECT_IMAGE', message: err.message }));
    }
  }

  public async handleOpenTabRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const payload = await this.parseRequestBody(req);
      const { target = 'gemini', accountSlot = 0, tabMode, bringTabToFront, preferredBrowser, browser } = payload;

      if (!this.isConnected()) {
        await this.ensureBrowserRunning();
      }

      if (!this.isConnected()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'EXTENSION_NOT_CONNECTED', message: 'BEI Chrome Extension is not connected.' }));
        return;
      }

      const targetSocket = this.getClientSocket(preferredBrowser || browser) || this.extensionSocket;
      targetSocket?.send(JSON.stringify({
        type: 'OPEN_TAB',
        data: { target, accountSlot, tabMode, bringTabToFront }
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, opened: true, target, accountSlot }));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_REQUEST', message: err.message }));
    }
  }

  public async handleSetActiveTabRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const payload = await this.parseRequestBody(req).catch(() => ({}));
      const { target = 'gemini', accountSlot = 0, preferredBrowser, browser } = payload || {};

      if (!this.isConnected()) {
        await this.ensureBrowserRunning();
      }

      if (!this.isConnected()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'EXTENSION_NOT_CONNECTED', message: 'BEI Chrome Extension is not connected.' }));
        return;
      }

      const reqId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const targetSocket = this.getClientSocket(preferredBrowser || browser) || this.extensionSocket;

      const promise = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pendingActiveTabRequests.has(reqId)) {
            this.pendingActiveTabRequests.delete(reqId);
            reject(new Error('Timed out waiting for active tab to be set in browser'));
          }
        }, 15000);
        this.pendingActiveTabRequests.set(reqId, { resolve, reject, timer });
      });

      targetSocket?.send(JSON.stringify({
        type: 'SET_ACTIVE_TAB',
        data: { target, accountSlot }
      }));

      const result = await promise;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SET_ACTIVE_TAB_FAILED', message: err.message }));
    }
  }

  public async handleSwitchAndVerifyTabRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const payload = await this.parseRequestBody(req).catch(() => ({}));
      const { target = 'gemini', accountSlot = 0, tabId, preferredBrowser, browser } = payload || {};

      if (!this.isConnected()) {
        await this.ensureBrowserRunning();
      }

      if (!this.isConnected()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'EXTENSION_NOT_CONNECTED', message: 'BEI Chrome Extension is not connected.' }));
        return;
      }

      const reqId = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const targetSocket = this.getClientSocket(preferredBrowser || browser) || this.extensionSocket;

      const promise = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pendingVerifyTabRequests.has(reqId)) {
            this.pendingVerifyTabRequests.delete(reqId);
            reject(new Error('Timed out waiting for tab verification and harvest in browser'));
          }
        }, 15000);
        this.pendingVerifyTabRequests.set(reqId, { resolve, reject, timer });
      });

      targetSocket?.send(JSON.stringify({
        type: 'SWITCH_AND_VERIFY_TAB',
        data: { target, accountSlot, tabId, reqId }
      }));

      const result = await promise;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'VERIFY_TAB_FAILED', message: err.message }));
    }
  }

  public async handleFetchLibraryRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      let payload: any = {};
      if (req.method === 'POST') {
        payload = await this.parseRequestBody(req).catch(() => ({}));
      } else {
        const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        payload = {
          target: u.searchParams.get('target') || 'gemini',
          accountSlot: parseInt(u.searchParams.get('accountSlot') || '0', 10),
          limit: parseInt(u.searchParams.get('limit') || '5', 10)
        };
      }
      const { target = 'gemini', accountSlot = 0, limit = 5, preferredBrowser, browser } = payload || {};

      if (!this.isConnected()) {
        await this.ensureBrowserRunning();
      }

      if (!this.isConnected()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'EXTENSION_NOT_CONNECTED', message: 'BEI Chrome Extension is not connected.' }));
        return;
      }

      const reqId = `lib_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const targetSocket = this.getClientSocket(preferredBrowser || browser) || this.extensionSocket;

      const promise = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pendingLibraryRequests.has(reqId)) {
            this.pendingLibraryRequests.delete(reqId);
            reject(new Error('Timed out fetching library assets from browser'));
          }
        }, 20000);
        this.pendingLibraryRequests.set(reqId, { resolve, reject, timer });
      });

      targetSocket?.send(JSON.stringify({
        type: 'FETCH_LIBRARY_ASSETS',
        data: { target, accountSlot, limit }
      }));

      const result = await promise;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'FETCH_LIBRARY_FAILED', message: err.message }));
    }
  }

  public async handleScanAccountsRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isConnected()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'EXTENSION_NOT_CONNECTED', message: 'BEI Chrome Extension is not connected.' }));
      return;
    }

    const payload = await this.parseRequestBody(req).catch(() => ({}));
    const { preferredBrowser, browser } = payload || {};
    const targetSocket = this.getClientSocket(preferredBrowser || browser) || this.extensionSocket;

    targetSocket?.send(JSON.stringify({
      type: 'SCAN_ACCOUNTS'
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, scanning: true, message: 'Google account scan initiated in browser background.' }));
  }

  public handleReloadExtensionRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.isConnected()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'EXTENSION_NOT_CONNECTED', message: 'BEI Chrome Extension is not connected.' }));
      return;
    }

    this.extensionSocket!.send(JSON.stringify({
      type: 'RELOAD_EXTENSION'
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, reloading: true, message: 'Extension reload signal dispatched to Chrome.' }));
  }

  public async handleRefetchRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      let jobId = url.searchParams.get('jobId');

      if (!jobId && req.method === 'POST') {
        const body = await this.parseRequestBody(req);
        jobId = body?.jobId;
      }

      let payload: BEIPayloadStatus | undefined;
      if (jobId) {
        payload = this.payloadHistory.get(jobId);
      } else {
        const list = Array.from(this.payloadHistory.values()).sort((a, b) => b.createdAt - a.createdAt);
        payload = list.find(p => p.status === 'completed' || p.status === 'payload_ready') || list[0];
      }

      if (!payload) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NO_PAYLOAD_FOUND', message: 'No recorded generation payload found.' }));
        return;
      }

      const img = payload.imageBase64 || payload.srcUrl;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        jobId: payload.jobId,
        image: img,
        payload
      }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'REFETCH_FAILED', message: err.message }));
    }
  }

  public close(): Promise<void> {
    return new Promise(resolve => {
      for (const [id, job] of this.pendingJobs.entries()) {
        clearTimeout(job.timeoutTimer);
        job.reject(new Error('BEI Bridge Server shutting down'));
      }
      this.pendingJobs.clear();

      if (this.wss) {
        this.wss.close();
      }
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// Global singleton instance
export const beiBridge = new BEIBridgeServer(58925);
