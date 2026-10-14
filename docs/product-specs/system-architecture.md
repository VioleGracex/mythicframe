# System Architecture & Technical Specifications

> **Version:** 1.6.1  
> **Platform:** React 19.2 + TypeScript 5.8 + Express 5.2 + SQLite + MCP Server v2.0.0 + BEI Extension v1.5.2

## 1. High-Level Architecture Diagram

```
+--------------------------------------------------------------------------+
|                       MythicFrame Web UI (React 19)                      |
|                  http://localhost:3488 (Vite 6 Middleware)               |
+--------------------------------------------------------------------------+
       |                                                 |
       | REST / SSE                                      | MCP Stdio / REST
       v                                                 v
+-----------------------------------+     +--------------------------------+
|       Express Backend Server      |     |    Model Context Protocol      |
|             (Port 3488)           |     |         (MCP v2.0.0)           |
+-----------------------------------+     +--------------------------------+
  |              |             |                         |
  | SQLite       | Bridge RPC  | Direct Cloud APIs       | Automated Tools
  v              v             v                         v
+----------+  +----------+  +----------------------+  +--------------------+
|assets.db |  |BEI Bridge|  | Google Gemini API    |  | Autonomous Agents  |
|(better-  |  |(Port     |  | OpenAI API           |  | (Antigravity,      |
|sqlite3)  |  | 58925)   |  | OpenCode (Local)     |  |  Claude Code,      |
+----------+  +----------+  | OpenRouter / Pollin. |  |  Cursor)           |
                   |        +----------------------+  +--------------------+
         WebSocket | 
                   v
+--------------------------------------------------------------------------+
|                  MythicFrame BEI Chrome Extension (MV3)                  |
|               (background.js + content scripts + protocol.js)            |
+--------------------------------------------------------------------------+
        |                                                 |
        v                                                 v
+-----------------------------------+     +--------------------------------+
|     Google Gemini Web Session     |     |      ChatGPT Web Session       |
|    https://gemini.google.com/     |     |     https://chatgpt.com/       |
| (Slots: /u/0/, /u/1/, /u/2/, ...) |     |    (Authenticated Session)     |
+-----------------------------------+     +--------------------------------+
```

---

## 2. Frontend Layer
- **Framework**: React 19.2 (SPA)
- **Language**: TypeScript 5.8
- **Build Tool**: Vite 6.2 (integrated into Express dev middleware via `vite.middlewares`)
- **Styling**: Tailwind CSS + Glassmorphism system
- **Animation**: Motion (`motion` v12.35)
- **Icons**: Lucide React (`lucide-react` v0.577)
- **Interactive Canvases**: HTML5 Canvas, `react-rnd` (movable, resizable layers & safe-zone crops), `html2canvas`
- **State Management & Persistence**:
  - React Hooks (`useAppEngine`, `useGeneration`, `useHistory`, `useTabs`, etc.)
  - Client-side IndexedDB (`MythicFrameDB` via `historyService.ts`): Stores `history`, `exports`, and `workspace` tab states
  - Multi-tab workspace factory (`tabFactory.ts`) isolating per-tab mode, canvas transforms, prompts, and active layers

---

## 3. Backend & Bridge Infrastructure

### Main Express Server (`server.ts` — Port 3488)
- Serves Vite client in development and static production build in release mode.
- REST endpoints:
  - `/api/assets` (`GET`, `POST`, `DELETE`): Asset metadata catalog backed by SQLite.
  - `/api/config/gemini-key` (`POST`): Persists developer API keys directly to `.env.local` without exposing secrets to client bundles.
  - `/api/system/shutdown` (`POST`): Graceful shutdown terminating backend, closing SQLite connections, and stopping the BEI bridge.
  - `/api/bei/*` proxy endpoints: Exposes BEI status, config, tab opening, and job dispatch to the web UI.

### SQLite Persistence Layer (`assets.db`)
- Powered by `better-sqlite3` for zero-latency synchronous queries.
- Manages historical generations, prompt logs, asset types, and output references.

### Browser Extension Interface Bridge (`src/server/beiBridge.ts` — Port 58925)
- Dual-mode server operating both HTTP REST and native WebSocket (`ws://127.0.0.1:58925`).
- Communicates directly with the `MythicFrame BEI Bridge` Chrome Extension (Manifest V3).
- Features:
  - Multi-account slot scanning (`/u/0/app` to `/u/3/app`) with auto-failover on quota exhaustion.
  - Full-size 2K master blob interception via MAIN-world `page_hook.js`.
  - Automated Google Gemini Web Library failover protocol (`gemini.google.com/*/library`).
  - Active tab anti-throttling (`chrome.tabs.update(tabId, { active: true })`).
  - Tab group deduplication and cross-window reuse (`"MythicFrame BEI"` purple group).

---

## 4. Multi-Provider AI Architecture (`src/services/aiProviderService.ts`)

1. **Google Gemini & Imagen API**: Direct calls via `@google/genai` SDK (`gemini-3.1-flash-image`, `gemini-3-pro-image`, `imagen-3.0-generate-001`).
2. **OpenAI API**: DALL-E 3 (`standard` and `hd` quality presets).
3. **OpenCode / Local AI**: Connects to OpenAI-compatible local endpoints (Ollama, vLLM, llama.cpp, LocalAI).
4. **OpenRouter**: Routes requests through OpenRouter's gateway.
5. **Pollinations.ai**: Zero-key free image generation for rapid prototyping.
6. **BEI Mode (Zero-API-Key Bridge)**: Direct browser extension generation using authenticated Gemini Web and ChatGPT Web sessions with Google Imagen 3 and OpenAI DALL-E 3.
7. **Offline Prompt Mode**: Procedurally compiles fully formatted prompt bundles for external platforms without making API calls.

---

## 5. Model Context Protocol (MCP v2.0.0 Server)

Embedded MCP server (`src/mcp/index.ts` / `mcp-server/index.js`) using `@modelcontextprotocol/sdk`:
- Connects external AI agents (Antigravity, Claude Code, Cursor) directly into MythicFrame workflows via Stdio transport.
- Exposes **24 specialized tools** covering prompt compilation, image generation, server management, tab automation, library recovery, and art style synthesis.

---

## 6. Core Algorithmic Pipelines

- **Transparent NEO Matting**: 5-pass soft alpha matting pipeline (Perimeter profiling -> Exterior BFS -> Signed Distance Field -> Color Decontamination / Defringing -> SteamSafe FX glow preservation).
- **World Bible Prompt Synthesis**: 5-layer procedural prompt compiler (`User Intent + World Bible Lore + Art Style Snippet + Framing/Viewpoint + Negative Constraints`).
- **Biomechanical Pose Rigging**: 14-joint skeletal rig with bone length limits, joint angle clamps, and 2-bone analytical IK solver (`poseConstraints.ts`).