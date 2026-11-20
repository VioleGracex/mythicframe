# Changelog

All notable changes to MythicFrame are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.8] — 2026-11-20 *(BEI Extension v1.5.9)*

### Fixed
- **Subscribed / Paid Tier Account Prioritization**:
  - Removed default fallback of `accountSlot: 0` in `src/mcp/index.ts` and `src/server/beiBridge.ts` when no slot is explicitly requested. This allows `background.js` to automatically prioritize accounts with active Pro / Gemini Advanced subscriptions.
  - Enabled support for `preferredEmail` and `preferredSlot` in `mythic_project.json` to lock generations to user-selected subscription accounts.
  - Added auto-failover when an account slot reaches daily or quota rate limits: automatically blacklists exhausted slots for 30 minutes and redirects jobs to healthy subscribed accounts.
  - Added new quota exhaustion pattern matches (`as soon as your limit resets`, `until your limit resets`, `limit resets`) to `GEMINI_RATE_LIMIT_PATTERNS`.
- **Tab Proliferation & Rapid Switching Elimination**:
  - Relaxed tab matching logic in `background.js`: any active tab on `gemini.google.com` matching the account slot is now reused directly instead of spawning redundant tabs.
  - Disabled focus stealing (`bringTabToFront: false` by default) so background tab operations run completely silently without interrupting user activity.
- **Aspect Ratio & Image Upload Sequencing**:
  - Fixed race condition in `gemini_content.js`: reference image attachments are now uploaded and allowed to settle in Angular's DOM *before* native "Create image" mode and aspect ratio are selected.
  - Fixed aspect ratio reset caused by Angular rebuilding the composer container after file upload.

---

## [1.6.7] — 2026-11-17 *(BEI Extension v1.5.8)*

### Fixed
- **Dropdown Menu Blocking & "auto" Quality Loop**:
  - `selectNativeModelQuality` in `gemini_content.js` now immediately returns when `targetQuality === 'auto'` or `'default'`, avoiding searching for non-existent "auto" menu items that left dropdown overlays open.
  - Added Escape key dispatch and overlay backdrop dismissal to guarantee menus never stay open or obstruct the composer input.
- **Multilingual & Russian UI Support**:
  - Added Russian selectors and patterns (`Отправить`, `Остановить`, `Стоп`) to `SEND_BUTTON_SELECTORS`, `STOP_BUTTON_SELECTORS`, `isStopButtonElement`, and send candidate scanners.
  - Added Russian refusal, cancellation, and quota/rate limit regex patterns (`не удалось создать`, `генерация остановлена`, `достигнут дневной лимит`).
- **`same_chat` Multi-Tab Isolation & Thread Preservation**:
  - Fixed `chatSessionMode === 'same_chat'` tab matching in `background.js`: if a tab is not in the BEI tab group, it now gracefully falls back to available Gemini/ChatGPT tabs rather than triggering `chrome.tabs.create()` on every single turn.
  - Content script `executePrompt` now strictly preserves existing conversation threads when `chatSessionMode === 'same_chat'`, only resetting via "New Chat" when explicitly requested (`new_chat`).
  - Parameterized `chatSessionMode` end-to-end across `beiBridge.ts`, `background.js`, and `gemini_content.js`.
- **Persistent Session & Audit Logging**:
  - BEI Bridge now creates and persists structured session JSON files under `logs/sessions/${jobId}.json` for every generation job (tracking status, timestamps, prompt, accounts, errors, steps).
  - Appended human-readable audit lines to both system Documents and project-local `logs/bei_session_audit.log`.
  - Added extension-side local storage logging (`chrome.storage.local['bei_recent_logs']`) capturing up to 200 recent events.

---

## [1.6.6] — 2026-11-17 *(BEI Extension v1.5.7)*

### Fixed
- **Duplicate Image Upload Prevention**:
  - Gated file attachment in `gemini_content.js`: file input assignment now waits for chip verification before considering fallbacks, completely preventing duplicate attachment issues where file input, HTML5 drag-and-drop, and clipboard paste were previously executed together unconditionally.
  - Eliminated redundant progress event broadcasts for reference image uploads.
  - Added dedicated `'PING'` message handler in both Gemini and ChatGPT content scripts to prevent false unresponsiveness detections and redundant script re-injections.
- **Tab Reuse & "New Chat" Navigation**:
  - Fixed tab discovery in `background.js` where `isCleanComposerTab` requirement previously disqualified existing conversation tabs from reuse, causing unnecessary browser tab spawning.
  - When `chatSessionMode === 'new_chat'` is requested, existing tabs for the target account slot are now properly reused and navigated to the clean `/app` entrypoint rather than opening a brand-new tab.
- **Stall Watchdog & Automatic Stop-and-Retry**:
  - Replaced the hardcoded 900s (15-minute) timeout floor with a responsive 150s default ceiling in `beiBridge.ts` and `beiService.ts`.
  - Added an active stall watchdog in `gemini_content.js` that detects when Gemini is stuck with no output for >60s.
  - Automatically clicks the native Stop button, clears the composer, and performs an automated retry (attempt 2/2) in a fresh composer instead of hanging indefinitely.
  - Bound all polling intervals to a tracked global reference (`window.__MYTHIC_BEI_ACTIVE_INTERVAL__`) to prevent orphaned zombie timer loops from continuing in the background after cancellation or retry.

---

## [1.6.2] — 2026-10-16 *(BEI Extension v1.5.3)*

### Fixed
- **Launcher Resilience & Crash Recovery (`run.bat`)**:
  - Enforced project directory anchoring (`cd /d "%~dp0"`) preventing script execution in arbitrary directories (Desktop, System32) when triggered by shortcuts or browser protocols.
  - Added automated cleanup of stale zombie Node processes holding ports `3488` and `58925` prior to server start, eliminating fatal `EADDRINUSE` crashes and permanent pauses.
  - Replaced fragile `%ERRORLEVEL%` checks and interactive installation prompts with automated multi-path Node & npm detection.
  - Replaced blind `timeout /t 3` with active health polling, opening the browser only after `http://localhost:3488` responds with HTTP 200.
- **1-Click Localhost Launcher in Chrome Extension**:
  - Upgraded "Launch MythicFrame Studio (3488)" button to probe server status before opening.
  - Automatically triggers server start via registered `mythicframe://` OS protocol if the backend is offline.
  - Displays real-time startup feedback (`Starting Server...`) and polls localhost health until the Studio UI is ready, eliminating dead `ERR_CONNECTION_REFUSED` tabs.
  - Automatically reuses and focuses existing Studio tabs when the server is already active.

---

## [1.6.1] — 2026-10-11 *(BEI Extension v1.5.2)*

### Added
- **Automated Gemini Library Failover Protocol**:
  - Implemented automatic asset recovery from `gemini.google.com/*/library` when DOM chat extraction stalls or fails.
  - Upgrades discovered thumbnails to full-fidelity master URLs (`=s0`/`=s2048`) and exposes `mythic_fetch_library_assets` tool for AI agents.
- **Tab Group Deduplication & Cross-Window Reuse**:
  - Global query across all Chrome windows to detect and reuse existing `"MythicFrame BEI"` tab groups, preventing duplicate group proliferation on service worker wake-up.
  - Set default tab mode to `same_window_group` in MCP client and bridge server.
- **13 Ordered Shot-Distance Framing Presets**:
  - Added full cinematography shot hierarchy (from `extreme_close_up` ECU through `very_wide_shot` VWS) with short codes, descriptions, and prompt token injection in character helper and MCP tools.
- **Auto-Execute Generation Mode**:
  - Added `autoExecuteGeneration` setting in `mythic_project.json` for seamless AI agent image generation without pre-confirmation halts.
- **Chat Session Mode Continuity (1 Session = 1 Chat)**:
  - Enabled conversation thread reuse (`same_chat`) by default in BEI background worker and bridge server, preventing repetitive new chat spawning and sidebar flooding.
  - Retains active conversation paths (`/app/<chat_id>`) without reloading when generation jobs are submitted.
- **Strict In-Order Composer Sequencing and Anti-Race Stabilization**:
  - Enforced strict execution order in Gemini content script: Tool Tag ('Create image') -> Aspect Ratio -> Reference Image Upload with progress stabilization -> Prompt Text -> Pre-send Verification -> Send dispatch.
  - Added stabilization timeouts (600ms post-tag, 350ms post-ratio, 800ms post-upload, 450ms post-text) to ensure Angular and Material UI listeners settle.
- **Active Tab Anti-Throttling**:
  - Automatically activates the target Gemini/ChatGPT tab within its window (`chrome.tabs.update(tabId, { active: true })`) during job execution, preventing Chromium background timer/mutation observer freezing.
  - Added `mythic_set_active_tab` MCP tool and `/api/bei/set-active-tab` endpoint.
- **Windows Browser Auto-Launch**:
  - Automatically locates and launches Google Chrome if no extension socket is connected when generation or tab commands arrive.

---

## [1.6.0] — 2026-10-11 *(BEI Extension v1.5.0)*

### Added
- **Gemini Full-Size 2K Master Interception Pipeline**:
  - Injected MAIN-world `page_hook.js` at `document_start` to intercept Gemini's native 2K master blob generated upon clicking Download.
  - Converts full-resolution master Blob in-memory via `FileReader` and delivers it to MythicFrame via window messaging, eliminating low-resolution preview thumbnail downgrades.
  - Suppressed duplicate browser disk downloads once master bytes are confirmed.
  - Added background worker cleanup listener for direct-URL downloads with `downloads` permission.
  - Added automated fallback safety net in `beiClient.ts` to move downloaded master assets from OS Downloads directly into `outputs/bei/`.
  - Added exact file size reporting in MCP server responses.

---

## [1.5.9] — 2026-10-10 *(BEI Extension v1.4.1)*

### Added
- **Multi-Account / Multi-Tab Dispatch Mode**: Automatic parallel tab routing when an account slot is busy:
  - Intelligently dispatches queued and batch generation requests across idle logged-in Google account slots (`/u/0` - `/u/3`).
  - Added user preference toggles (`Single Account` vs `Multi-Account Parallel Tabs`) and prompting preference (`Remember Choice` vs `Ask on Each One`).
- **Settings Page Tabbed Layout Refactoring**: Losslessly refactored the cluttered monolithic `Settings.tsx` into 3 clean top-level tabs (`AI Generation Engines`, `Game Context`, and `Google Drive`), maintaining 100% feature and callback parity.
- **Settings Introspection MCP Tool**: Added `mythic_get_settings` tool to query active BEI configuration, connected tabs, and logged-in account slots on demand.
- **In-App Dialog Engine**: Complete replacement of all browser-native `alert()`, `confirm()`, and `prompt()` popups across the entire codebase with the dark glassmorphic `<InAppDialogModal />` component and `dialogService.ts`.
- **Biomechanical Pose Constraints & Motional Ranges**: Introduced `src/utils/poseConstraints.ts` providing realistic bone length limits, natural elbow/knee angles, canvas boundary clamps (`[3%, 97%]`), and 2-bone analytical IK solver for wrists and ankles.
- **Zero-Latency Pose Studio Dragging**: Dragging joints now renders smoothly at native monitor refresh rates (60–144 FPS) using `requestAnimationFrame` and local joint state, eliminating global re-render bottlenecks and fixing the red "not-allowed" cursor by preventing native browser element drag.

### Changed
- **BEI Chrome Extension**: Bumped version to `v1.4.1` in `manifest.json`, `beiBridge.ts`, and `INSTALLATION_AND_USAGE_GUIDE.md`.
- **Extension Background Worker**: `EXECUTE_PROMPT` in `background.js` checks `dispatchMode === 'multi'` and selects idle tabs among active Google slots if the primary tab is generating.

---

## [1.5.8] — 2026-10-10 *(BEI Extension v1.4.0)*

### Added
- **BEI Image Download Quality Control**: Multi-tier image extraction system across UI (`Settings.tsx`), MCP tools, and BEI extension:
  - `ultra_original`: Direct extraction of the original master uncompressed asset (`=s0` / `=d` full-resolution master without compression loss).
  - `high`: Upgraded 2K web asset extraction (`=s2048`).
  - `standard`: Fast in-chat viewport preview resolution capture (`=s1024`).
- **AI Agent Quality Prompting Preference**: Toggle in Settings for `Remember Choice` vs `Ask on Each One` during AI agent generation conversations.
- **MCP Quality Schemas**: Updated `mythic_bei_generate` and `mythic_smart_generate` tool schemas to accept the `quality` parameter.
- **Contributor Guidelines**: Added rule in `CONTRIBUTING.md` enforcing extension version bumps and changelog updates whenever modifying `bei-extension/`.
- **Cross-Platform Launcher**: 1-click automated setup and launcher scripts for Windows (`launch.bat`) and Linux/macOS (`launch.sh`).

### Changed
- **BEI Chrome Extension**: Bumped version to `v1.4.0` in `manifest.json`, `beiBridge.ts`, and `INSTALLATION_AND_USAGE_GUIDE.md`.
- **In-Page Extraction Pipeline**: Updated `protocol.js` and `gemini_content.js` to prioritize direct authenticated high-res blob fetching instead of downsampled viewport canvas captures.
- **Dynamic MCP Root Resolution**: `beiClient.ts` now dynamically resolves project root cross-platform.

---

## [1.5.7] — 2026-10-10 *(BEI Extension v1.3.6)*

### Added
- **Account Priority Queue & Auto-Failover**: Drag-and-drop / ordered account failover hierarchy across Google accounts and ChatGPT sessions upon quota exhaustion.
- **Fake Active Mode & Dedicated Window Grouping**: Eliminates background tab throttling by keeping Chrome tabs in dedicated active window groups.
- **Extension Reload Endpoint**: Added `RELOAD_EXTENSION` endpoint and command handler on bridge port `58925`.

### Changed
- Defaulted BEI tab grouping to dedicated window group mode.
- Improved README with comprehensive architecture index and account failover guides.

---

## [1.5.6] — 2026-10-10 *(BEI Extension v1.3.5)*

### Added
- **Auto-Retry & Refetch**: Automatic retry and recovery loops for stalled generation jobs.
- **Universal Modal Dismiss**: Automatic dismissal of Gemini/ChatGPT consent dialogs and promotional popups.
- **Job Context Retention**: Preserved job context across intermittent network disconnects.

### Fixed
- Eliminated text false-positives and prioritized immediate harvesting of completed images in `gemini_content.js`.
- Standardized request body parsing in `beiBridge.ts`.

---

## [1.5.5] — 2026-10-10 *(BEI Extension v1.3.3)*

### Added
- **Payload Diagnostics Modal**: Interactive telemetry modal in UI to inspect live BEI payload transfer, timing, and Base64 conversion status.
- **Auto-Sync on Connect**: Auto-sync tabs and accounts immediately upon bridge connection and status query.
- **System Turn-Off / Quit**: Graceful shutdown API and UI buttons in Dashboard header and Sidebar.

### Fixed
- Fixed ServiceWorker `FileReader` crash in `background.js` by delegating binary blob conversions to content scripts.
- Resolved image retrieval failures by implementing multi-stage payload status tracking.

---

## [1.5.4] — 2026-10-10 *(BEI Extension v1.3.2)*

### Added
- Immediate tab grouping and foreground window focus synchronization.
- Multi-slot dynamic account detection for Google accounts `/u/0` through `/u/3`.

---

## [1.5.3] — 2026-10-10

### Added
- **Animation Strip Studio**: Dedicated animation strip timeline and sequence preview workspace.
- **Zip Batch Updates**: Export and batch management of character sprite sheets and animation frames.
- **Adaptive Wait & Progress Heartbeats**: Eliminated premature timeouts with real-time generation heartbeat monitoring.

---

## [1.5.1] — 2026-10-09

### Added
- **MCP Bridge Tools**: Added `mythic_bei_generate`, `mythic_smart_generate`, and AI skills (`mf-bei`, `mf-gen`).
- **Incognito / Streamer Mode**: Privacy masking for Google account email addresses during recordings/streams.
- **Visual "Create Image" Tag Injection**: Native composer tagging in Gemini Web to force Imagen mode.

### Fixed
- Reference image leakage between consecutive generation prompts.
- Upward reference drawer and UI decluttering on AI engine selector card.

---

## [1.5.0] — 2026-10-09 *(BEI Initial Release)*

### Added
- **BEI (Browser Extension Interface)**: Initial release bridging authenticated Gemini Web (`gemini.google.com`) and ChatGPT Web (`chatgpt.com`) sessions into MythicFrame with zero API keys.
- **Multi-Account Rotation**: Automatic slot rotation across logged-in Google sessions.
- **Local Bridge**: Dedicated WebSocket & HTTP bridge running on port `58925`.
- **PolyForm Noncommercial License**: Formalized non-commercial licensing.

---

## [1.4.1] — 2026-05-27
- Studio canvas optimizations and UI layout refinements.
- Base generative asset pipeline and export workflows.

---

## [0.8.2-beta] — 2025-12-26
- Gacha card canvas, illustration generator, and custom prompt templates.
- Multi-engine provider infrastructure (Google Gemini API & Pollinations).

---

## [0.4.2] — 2025-12-08
- Initial prototype release of MythicFrame 2D asset studio.
