# MythicFrame – Services and APIs Checklist

- [x] **Backend Server Architecture (Express 5.2 on port 3488)**
  - [x] Vite development middleware integration
  - [x] REST endpoints for asset management (`/api/assets`, `GET`, `POST`, `DELETE`)
  - [x] Secure API key persistence to `.env.local` (`/api/config/gemini-key`)
  - [x] Graceful shutdown lifecycle endpoint (`/api/system/shutdown`)
  - [x] BEI proxy endpoints (`/api/bei/status`, `/api/bei/open-tab`, `/api/bei/generate`, `/api/bei/cancel`, `/api/bei/events`, `/api/bei/library`)

- [x] **BEI Bridge Server (Port 58925: HTTP REST + WebSocket)**
  - [x] WebSocket bridge (`ws://127.0.0.1:58925`) connecting to Chrome MV3 extension
  - [x] Real-time job lifecycle streaming via Server-Sent Events (SSE)
  - [x] Multi-account Google slot routing (`/u/0` - `/u/3`) with auto-failover on rate limits
  - [x] Full-size 2K master blob interception pipeline via MAIN-world `page_hook.js`
  - [x] Automated Gemini Web Library failover protocol (`/library`) and recovery
  - [x] Active tab anti-throttling (`chrome.tabs.update`) and cross-window tab group reuse

- [x] **Multi-Provider AI Service Layer (`aiProviderService.ts`)**
  - [x] Google Gemini & Imagen direct API (`@google/genai` SDK)
  - [x] OpenAI direct API (DALL-E 3 standard & HD)
  - [x] OpenCode / Local AI (Ollama, vLLM, llama.cpp via OpenAI-compatible endpoints)
  - [x] OpenRouter API gateway routing
  - [x] Pollinations.ai zero-key free generation
  - [x] Offline Prompt Mode (5-layer assembled prompt export without API calls)
  - [x] BEI Zero-Key Mode (Browser Extension Interface bridge)

- [x] **Model Context Protocol (MCP v2.0.0 Server with 24 Tools)**
  - [x] Stdio transport integration for external AI coding agents (Antigravity, Claude Code, Cursor)
  - [x] Prompt preparation tools: `prepare_illustration_prompt`, `prepare_clothes_prompt`, `prepare_pose_studio_prompt`, `prepare_ui_reimagine_prompt`, `prepare_map_grid_prompt`, `prepare_sprite_sheet_prompts`, `prepare_frame_prompt`, `prepare_background_asset_prompt`, `prepare_extract_clothes_prompt`, `prepare_card_suggestions_prompt`
  - [x] Generation execution tools: `mythic_bei_generate`, `mythic_smart_generate`, `batch_studio_generate`
  - [x] System & lifecycle tools: `mythic_status`, `mythic_launch_server`, `launch_web_ui`, `mythic_open_tab`, `mythic_scan_accounts`, `mythic_set_active_tab`, `mythic_fetch_library_assets`, `mythic_get_settings`
  - [x] Art style management tools: `mythic_list_art_styles`, `mythic_apply_art_style`, `mythic_create_art_style`

- [x] **Persistence, Export, & Telemetry Services**
  - [x] `historyService.ts`: IndexedDB (`MythicFrameDB`) schema, stores, and migration from legacy localStorage
  - [x] SQLite database (`assets.db` via `better-sqlite3`): Persistent local asset catalog
  - [x] `exportService.ts`: ZIP archive packaging, PNG blob compilation, metadata TXT/JSON bundles
  - [x] `csvService.ts`: Spreadsheets parsing and template serialization
  - [x] `googleDriveService.ts`: Google Drive OAuth folder sync and backup
  - [x] `quotaTrackerService.ts`: Real-time latency tracking, USD spend estimation, HTTP 429 rate limit detection
  - [x] `dialogService.ts`: Event-driven glassmorphic in-app alert, confirm, and prompt modal system
