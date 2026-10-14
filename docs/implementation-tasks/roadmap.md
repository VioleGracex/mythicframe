# MythicFrame – Project Roadmap

> **Current Version:** 1.6.1 (BEI Extension v1.5.2)  
> **Status:** Active Production & Continuous Enhancement

---

## Completed Phases

### Phase 1 – Architecture & Project Core
- [x] Set up Vite + React + TypeScript + Tailwind project skeleton
- [x] Define Game Context data model and World Bible inheritance
- [x] Implement multi-tab workspace engine (`tabFactory.ts`)
- [x] Create modular UI component structure (AppSidebar, StudioLayout, Canvas, Toolbar, PromptPanel)
- [x] Initialize persistence layer (IndexedDB `MythicFrameDB` & SQLite `assets.db`)

### Phase 2 – Illustration & Card Studios
- [x] Illustration Studio with 9 camera viewpoints and framing selectors
- [x] Frame Studio with customizable CCG borders, mana sockets, and banner slots
- [x] Full Card Mode with draggable layer positioning, inner art panning/zooming, and typography styling
- [x] Chibi Engine with proportions (`1:1`, `1:2`, `1:4`) and moe/realistic styles
- [x] Inpainting region selection and regeneration
- [x] Magic Resizer & Outpainting with CCG print safe-zone guides (Standard, Mini, Tarot)

### Phase 3 – Character & Production Studios
- [x] Character Bible / Gacha Studio with 4-tier rarity progression (`R`, `SR`, `SSR`, `UR`) and continuity flags
- [x] Clothes Designer with model vs asset modes (Biological Eraser ghost equipment) and spread sheets
- [x] Sprite Sheet & Animation Studio with multi-pose grids, keyframe timeline, onion skinning, and GIF/turnaround previews
- [x] Pixel Art Studio with 8-bit, 16-bit, 32-bit, Game Boy, and Arcade CRT downsampling
- [x] Map Grid Studio with orthographic top-down and 2.5D isometric battle maps and tile chunk exports
- [x] Background Studio with scenic, texture, abstract, and UI backdrop modes
- [x] Transparent NEO Matting pipeline with exterior BFS flood-fill, SDF alpha, and defringing

### Phase 4 – Multi-Provider Engine & Telemetry
- [x] Unified AI provider layer (`aiProviderService.ts`) supporting Google Gemini, OpenAI DALL-E 3, OpenCode (local), OpenRouter, and Pollinations.ai
- [x] Quota Inspector & Telemetry tracking (`quotaTrackerService.ts`) with live health probes, cost estimation, and latency graphs
- [x] Style Library with 45+ built-in presets and custom project style creation
- [x] Downloads Vault with ZIP/PNG export history and 1-click re-downloading

### Phase 5 – Browser Extension Interface (BEI v1.5.0)
- [x] Zero-API-Key Chrome Extension bridge (`bei-extension/`) on port 58925
- [x] Multi-account Google slot routing (`/u/0` - `/u/3`) and auto-failover on quota limits
- [x] Fake Active anti-throttling mode (`document.hidden`/`visibilityState` spoofing + inaudible audio buffer)
- [x] Dedicated purple `"MythicFrame BEI"` tab grouping and window management
- [x] High-resolution CDN parameter rewriting (`=s0` / `=s2048`)

### Phase 6 – Agent Integration & MCP Server (MCP v2.0.0)
- [x] Model Context Protocol server (`src/mcp/index.ts`) with Stdio transport for external AI coding agents
- [x] Expose prompt compilation tools for all studios (`prepare_illustration_prompt`, `prepare_clothes_prompt`, etc.)
- [x] Expose generation execution tools (`mythic_bei_generate`, `mythic_smart_generate`, `batch_studio_generate`)
- [x] Expose lifecycle management tools (`mythic_status`, `mythic_launch_server`, `mythic_open_tab`, `mythic_scan_accounts`)
- [x] Dynamic project root resolution cross-platform

### Phase 7 – Advanced Pose Rigging & UI Modernization (v1.5.9)
- [x] Biomechanical pose constraints and motional angle ranges (`poseConstraints.ts`)
- [x] 2-bone analytical IK solver for wrists and ankles
- [x] Zero-latency pose joint dragging using `requestAnimationFrame` (60–144 FPS)
- [x] In-App Dialog Engine (`InAppDialogModal` & `dialogService.ts`) replacing all browser-native popups
- [x] Lossless Settings page refactoring into 3 dedicated tabs (AI Generation Engines, Game Context, Google Drive)

### Phase 8 – Master 2K Interception, Library Failover, & Cinematography (v1.6.0 – v1.6.1)
- [x] Full-size 2K master blob interception pipeline via MAIN-world `page_hook.js`
- [x] Chat session continuity (`same_chat`) preventing duplicate conversation thread proliferation
- [x] Automated Gemini Web Library failover protocol (`gemini.google.com/*/library`) and `mythic_fetch_library_assets` tool
- [x] Cross-window tab group deduplication and reuse
- [x] Cinematography shot-distance hierarchy: 13 ordered presets (`ECU` through `VWS`)
- [x] `autoExecuteGeneration` setting in `mythic_project.json` for seamless agent workflows

---

## Future Roadmap & Backlog

### Phase 9 – Storage & Scalability Optimization
- [ ] Offload SQLite image Base64 blobs to disk files (`outputs/library/`) with DB relative paths
- [ ] Add pagination (`LIMIT` / `OFFSET`) and lightweight thumbnail caching for `/api/assets`
- [ ] De-monolith `useAppEngine.ts` into specialized state stores (Workspace, Canvas, Generation)

### Phase 10 – Game Engine Exporters & Print Tooling
- [ ] Unity 2D SpriteAtlas & sliced Sprite `.meta` exporter
- [ ] Godot `.tres` SpriteFrames & TileSet asset packager
- [ ] Print-ready PDF multi-card sheet generator with cutting registration marks
- [ ] Batch Studio queue pause/resume and multi-slot round-robin dispatcher
