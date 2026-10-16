import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

import { beiBridge } from "./src/server/beiBridge";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUTS_DIR = path.join(__dirname, "outputs");
const LIBRARY_DIR = path.join(OUTPUTS_DIR, "library");
if (!fs.existsSync(LIBRARY_DIR)) {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
}
const VIDEO_DIR = path.join(OUTPUTS_DIR, "video");
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}
const MUSIC_DIR = path.join(OUTPUTS_DIR, "music");
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

const db = new Database("assets.db");

// Initialize DB schema & migrate missing columns
db.exec(`
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    name TEXT,
    prompt TEXT,
    type TEXT,
    imageUrl TEXT,
    thumbnailUrl TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  db.exec("ALTER TABLE assets ADD COLUMN thumbnailUrl TEXT;");
} catch (e) {
  // column already exists
}

function syncMcpBuild() {
  const mcpSrcPath = path.join(__dirname, "src", "mcp", "index.ts");
  const mcpOutPath = path.join(__dirname, "mcp-server", "index.js");
  try {
    if (!fs.existsSync(mcpOutPath)) {
      console.log("🔨 [MCP Sync] mcp-server/index.js not found. Compiling...");
      execSync("npm run build:mcp", { stdio: "inherit", cwd: __dirname });
      return;
    }
    const srcStat = fs.statSync(mcpSrcPath);
    const outStat = fs.statSync(mcpOutPath);
    if (srcStat.mtimeMs > outStat.mtimeMs) {
      console.log("🔨 [MCP Sync] src/mcp/ is newer than mcp-server/index.js. Rebuilding MCP bundle...");
      execSync("npm run build:mcp", { stdio: "inherit", cwd: __dirname });
      console.log("✅ [MCP Sync] MCP server bundle successfully updated.");
    }
  } catch (e: any) {
    console.warn("⚠️ [MCP Sync] Automatic MCP rebuild check failed:", e.message);
  }
}

function offloadBase64Image(dataUrl: string, assetId: string, suffix: string = ""): string {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }
  try {
    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!match) return dataUrl;
    let ext = match[1].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (ext.includes("svg")) ext = "svg";
    const buffer = Buffer.from(match[2], "base64");
    const safeId = assetId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `${safeId}${suffix ? `_${suffix}` : ""}_${Date.now()}.${ext}`;
    const filePath = path.join(LIBRARY_DIR, fileName);
    fs.writeFileSync(filePath, buffer);
    return `/outputs/library/${fileName}`;
  } catch (err) {
    console.warn("Could not offload base64 image to disk:", err);
    return dataUrl;
  }
}

async function startServer() {
  // Auto-sync MCP build if needed
  syncMcpBuild();

  // Start BEI Bridge on unique port (58925)
  try {
    await beiBridge.start();
  } catch (err) {
    console.warn("Could not start BEI Bridge server:", err);
  }

  const app = express();
  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg = portArgIndex !== -1 ? process.argv[portArgIndex + 1] : process.argv[2];
  const PORT = parseInt(portFromArg || process.env.PORT || "3488", 10);

  app.use(express.json({ limit: '50mb' }));

  // BEI API Proxy Endpoints on main web server (port 3488)
  app.get("/api/bei/status", (req, res) => {
    res.json(beiBridge.getStatus());
  });

  app.get("/api/bei/config", (req, res) => {
    const status = beiBridge.getStatus();
    res.json({ projectDir: status.projectDir, port: status.port });
  });

  app.post("/api/bei/config", (req, res) => {
    const { projectDir } = req.body;
    if (projectDir) {
      (beiBridge as any).projectDir = projectDir;
    }
    res.json({ success: true, projectDir: (beiBridge as any).projectDir });
  });

  app.post("/api/bei/open-tab", (req, res) => {
    const { target = "gemini", accountSlot = 0, tabMode, bringTabToFront } = req.body;
    if (beiBridge.isConnected()) {
      (beiBridge as any).extensionSocket?.send(JSON.stringify({
        type: "OPEN_TAB",
        data: { target, accountSlot, tabMode, bringTabToFront }
      }));
      res.json({ success: true, opened: true });
    } else {
      res.status(503).json({ error: "BEI Extension not connected" });
    }
  });

  app.get("/api/bei/events", (req, res) => {
    beiBridge.handleEventsRequest(req, res);
  });

  app.get("/api/bei/progress", (req, res) => {
    const jobId = req.query.jobId as string | undefined;
    const progress = jobId ? beiBridge.latestProgress[jobId] : beiBridge.globalProgress;
    res.json({ success: true, progress });
  });

  app.get("/api/bei/payloads", (req, res) => {
    const jobId = req.query.jobId as string | undefined;
    if (jobId) {
      const payload = (beiBridge as any).getPayloadStatus(jobId);
      if (payload) return res.json({ success: true, payload });
      return res.status(404).json({ success: false, error: "Payload not found" });
    }
    const payloads = (beiBridge as any).getPayloadHistory();
    res.json({ success: true, count: payloads.length, payloads });
  });

  app.get("/api/bei/payload-status", (req, res) => {
    const jobId = req.query.jobId as string | undefined;
    if (jobId) {
      const payload = (beiBridge as any).getPayloadStatus(jobId);
      if (payload) return res.json({ success: true, payload });
      return res.status(404).json({ success: false, error: "Payload not found" });
    }
    const payloads = (beiBridge as any).getPayloadHistory();
    res.json({ success: true, count: payloads.length, payloads });
  });

  app.post("/api/bei/cancel", (req, res) => {
    const { jobId } = req.body;
    if (jobId && (beiBridge as any).pendingJobs?.has(jobId)) {
      const job = (beiBridge as any).pendingJobs.get(jobId);
      clearTimeout(job.timeoutTimer);
      (beiBridge as any).pendingJobs.delete(jobId);
      job.reject(new Error('Generation cancelled by user'));
    }
    if (beiBridge.isConnected()) {
      (beiBridge as any).extensionSocket?.send(JSON.stringify({
        type: 'CANCEL_GENERATION',
        data: { jobId }
      }));
    }
    res.json({ success: true, cancelled: jobId });
  });

  app.post("/api/bei/text", (req, res) => {
    beiBridge.handleTextRequest(req as any, res as any);
  });

  app.post("/api/bei/reset-session", (req, res) => {
    beiBridge.handleResetSessionRequest(req as any, res as any);
  });

  app.post("/api/bei/generate", (req, res) => {
    beiBridge.handleGenerateRequest(req as any, res as any);
  });

  app.post("/api/bei/direct-image", (req, res) => {
    beiBridge.handleDirectImageRequest(req as any, res as any);
  });

  app.post("/api/bei/scan-accounts", (req, res) => {
    beiBridge.handleScanAccountsRequest(req as any, res as any);
  });

  app.post("/api/bei/reload-extension", (req, res) => {
    beiBridge.handleReloadExtensionRequest(req as any, res as any);
  });

  app.get("/api/bei/refetch", (req, res) => {
    beiBridge.handleRefetchRequest(req as any, res as any);
  });

  app.post("/api/bei/refetch", (req, res) => {
    beiBridge.handleRefetchRequest(req as any, res as any);
  });

  // Static outputs directory (for static library images)
  app.use("/outputs", express.static(path.join(__dirname, "outputs")));

  // API Routes with Pagination, Search & Binary Disk Offloading
  app.get("/api/assets", (req, res) => {
    try {
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offsetParam = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const searchParam = req.query.search ? String(req.query.search).trim() : "";
      const typeParam = req.query.type ? String(req.query.type).trim() : "";

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (searchParam) {
        whereClauses.push("(name LIKE ? OR prompt LIKE ?)");
        params.push(`%${searchParam}%`, `%${searchParam}%`);
      }
      if (typeParam && typeParam !== "all") {
        whereClauses.push("type = ?");
        params.push(typeParam);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const totalCountRow = db.prepare(`SELECT COUNT(*) as count FROM assets ${whereSql}`).get(...params) as { count: number };
      const total = totalCountRow ? totalCountRow.count : 0;

      let querySql = `SELECT id, name, prompt, type, imageUrl, thumbnailUrl, createdAt FROM assets ${whereSql} ORDER BY createdAt DESC`;
      const queryParams = [...params];

      if (limitParam && limitParam > 0) {
        querySql += ` LIMIT ? OFFSET ?`;
        queryParams.push(limitParam, offsetParam);
      }

      const assets = db.prepare(querySql).all(...queryParams);

      // Backwards compatible: if client didn't supply pagination params, return array; otherwise return paginated structure
      if (req.query.limit !== undefined || req.query.offset !== undefined || req.query.page !== undefined || req.query.search !== undefined) {
        res.json({
          items: assets,
          total,
          limit: limitParam || total,
          offset: offsetParam
        });
      } else {
        res.json(assets);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/assets", (req, res) => {
    try {
      const { id, name, prompt, type, imageUrl, thumbnailUrl } = req.body;
      const safeId = id || `asset_${Date.now()}`;
      
      // Save large Base64 blobs to outputs/library/ as binary files
      const storedImageUrl = offloadBase64Image(imageUrl, safeId);
      const storedThumbnailUrl = thumbnailUrl ? offloadBase64Image(thumbnailUrl, safeId, "thumb") : storedImageUrl;

      const stmt = db.prepare(`
        INSERT INTO assets (id, name, prompt, type, imageUrl, thumbnailUrl)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          prompt = excluded.prompt,
          type = excluded.type,
          imageUrl = excluded.imageUrl,
          thumbnailUrl = excluded.thumbnailUrl
      `);
      stmt.run(safeId, name || "Untitled Asset", prompt || "", type || "image", storedImageUrl, storedThumbnailUrl);
      res.json({ success: true, id: safeId, imageUrl: storedImageUrl, thumbnailUrl: storedThumbnailUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/assets/:id", (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare("SELECT imageUrl, thumbnailUrl FROM assets WHERE id = ?").get(id) as { imageUrl?: string, thumbnailUrl?: string } | undefined;
      
      if (existing) {
        // Clean up static binary files on disk if present
        [existing.imageUrl, existing.thumbnailUrl].forEach((url) => {
          if (url && url.startsWith("/outputs/library/")) {
            const fileName = path.basename(url);
            const fullPath = path.join(LIBRARY_DIR, fileName);
            if (fs.existsSync(fullPath)) {
              try { fs.unlinkSync(fullPath); } catch (e) {}
            }
          }
        });
      }

      db.prepare("DELETE FROM assets WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/config/gemini-key", (req, res) => {
    const { apiKey } = req.body;
    try {
      const envPath = path.join(__dirname, ".env.local");
      let content = "";
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, "utf8");
      }
      if (content.includes("GEMINI_API_KEY=")) {
        content = content.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${apiKey || ""}`);
      } else {
        content = `${content.trim()}\nGEMINI_API_KEY=${apiKey || ""}\n`;
      }
      fs.writeFileSync(envPath, content.trim() + "\n");
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/system/shutdown", async (req, res) => {
    res.json({ success: true, message: "MythicFrame server is shutting down..." });
    console.log("\n🛑 [MythicFrame] Shutdown request received from dashboard.");
    console.log("🛑 Stopping BEI bridge, closing database, and terminating server process...");

    setTimeout(async () => {
      try {
        await beiBridge.stop();
      } catch (err) {
        console.warn("Could not cleanly stop BEI Bridge:", err);
      }
      try {
        db.close();
      } catch (err) {}

      expressServer.close(() => {
        console.log("👋 [MythicFrame] Server shut down successfully. Process exiting.");
        process.exit(0);
      });

      // Safety fallback to exit within 1 second
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    }, 300);
  });

  app.use(express.static(path.join(__dirname, "public")));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const expressServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
