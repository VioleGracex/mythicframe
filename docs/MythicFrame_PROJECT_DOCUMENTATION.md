# MythicFrame – Full Project Documentation & Functionality Reference

> **Version:** 1.6.1  
> **Platform:** Web Desktop Application (React 19.2 + TypeScript + Express 5.2 + SQLite + MCP Server v2.0.0 + BEI Extension v1.5.2)  
> **Category:** Generative AI Game Asset Studio & Card Production Workstation  

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Technical Architecture & AI Engine](#2-technical-architecture--ai-engine)
   - [Supported AI Providers & Models](#supported-ai-providers--models)
   - [Backend & Data Persistence Layer](#backend--data-persistence-layer)
   - [Model Context Protocol (MCP) Integration](#model-context-protocol-mcp-integration)
   - [Quota, Cost, and Telemetry Tracking](#quota-cost-and-telemetry-tracking)
3. [Project Navigation & Global Pages](#3-project-navigation--global-pages)
   - [Dashboard](#dashboard-dashboard)
   - [Library / Asset Vault](#library-asset-vault-library)
   - [Style Library](#style-library-style-library)
   - [Downloads & Export Vault](#downloads--export-vault-downloads)
   - [Quota Inspector](#quota-inspector-quota)
   - [Settings & Global World Bible](#settings--global-world-bible-settings)
   - [Tutorials / University](#tutorials--university-tutorials)
4. [Character Studio Modes](#4-character-studio-modes)
   - [Illustration Studio](#illustration-studio-illustration)
   - [Sprite Sheet Studio](#sprite-sheet-studio-sprite-sheet)
   - [Pose Studio](#pose-studio-pose-studio)
   - [Character Bible / Gacha Studio](#character-bible--gacha-studio-gacha)
   - [Clothes Designer](#clothes-designer-clothes)
5. [World & UI Studio Modes](#5-world--ui-studio-modes)
   - [Background Studio](#background-studio-background)
   - [BG Replacer & Matting](#bg-replacer--matting-bg-replace)
   - [Frame Studio](#frame-studio-frame)
   - [UI Reimagine](#ui-reimagine-ui-reimagine)
   - [Map Grid Studio](#map-grid-studio-map-grid)
6. [Production & Processing Studio Modes](#6-production--processing-studio-modes)
   - [Pixel Studio](#pixel-studio-pixelize)
   - [Magic Resizer & Safe Zones](#magic-resizer--safe-zones-resize)
   - [Animation Studio](#animation-studio-animation)
   - [Batch Studio & CSV Import](#batch-studio--csv-import-batch)
   - [Full Card Composer](#full-card-composer-fullcard)
7. [Specialized Core Technologies & Algorithms](#7-specialized-core-technologies--algorithms)
   - [Transparent NEO Matting Pipeline](#transparent-neo-matting-pipeline)
   - [Game Context & World Bible Inheritance](#game-context--world-bible-inheritance)
   - [Biomechanical Pose Rigging & IK Solver](#biomechanical-pose-rigging--ik-solver)
   - [Continuity Flags System](#continuity-flags-system)
   - [In-App Dialog Engine](#in-app-dialog-engine)
8. [Multi-Tab Workspace & Export Systems](#8-multi-tab-workspace--export-systems)
9. [Complete Pages & Modes Reference Table](#9-complete-pages--modes-reference-table)

---

## 1. Executive Overview

**MythicFrame** is an all-in-one generative AI game design workstation. While standard image generators create disconnected one-off illustrations, MythicFrame is architected around **narrative and mechanic coherence**:
- **Project-Level World Bible**: Defines setting, tone, and visual constraints once. Every character, card frame, and background inherits these constraints.
- **Production Asset Pipelines**: Directly outputs game-engine-ready assets (transparent sprites, isometric tiles, UI HUD elements, 8-bit/16-bit pixel variants, and card templates).
- **Format Integrity**: Supports 1K, 2K, and 4K production exports with safe-zone guides, pixel aspect ratios, and full prompt/metadata preservation.

---

## 2. Technical Architecture & AI Engine

### Supported AI Providers & Models
The platform operates a unified provider interface (`src/services/aiProviderService.ts`):

1. **Google Gemini & Imagen**:
   - `gemini-3.1-flash-image` (Fast, high-fidelity default)
   - `gemini-3-pro-image` (Ultra high-detail reasoning & complex compositions)
   - `gemini-3.1-flash-lite-image` (Ultra-low latency iterations)
   - `imagen-3.0-generate-001` (Direct Google Imagen REST endpoints)
2. **OpenAI**:
   - DALL-E 3 (`standard` and `hd` quality presets)
3. **OpenCode / Local AI**:
   - Connects to any OpenAI-compatible local runner (Ollama, vLLM, llama.cpp, LocalAI) via custom `baseUrl` and optional token.
4. **OpenRouter**:
   - Routes requests through OpenRouter's API gateway.
5. **Pollinations.ai**:
   - **Completely free image generation** with zero API keys required, ideal for testing, hobbyists, or offline development.
6. **Offline Prompt Mode**:
   - Compiles fully styled, negative-prompted, and context-injected prompt strings without executing an API call. Includes 1-click clipboard copying for external diffusion platforms.
7. **BEI Mode (Browser Extension Interface v1.5.2)**:
   - **Zero API Key Operating Mode**: Connects via a dedicated local WebSocket bridge (`ws://127.0.0.1:58925`) to the MythicFrame BEI Chrome Extension, generating directly through your personal, authenticated browser sessions (Google Gemini Web & ChatGPT Web).
   - **100% Free & Unlimited**: Generates using the newest web-based Google **Imagen 3** engine without paid developer API billing.
   - **Full-Size 2K Master Blob Interception**: Intercepts native high-resolution blobs via MAIN-world `page_hook.js` at `document_start`, bypassing compressed viewport preview downgrades.
   - **Automated Gemini Library Failover Protocol**: Automatic asset recovery from `gemini.google.com/*/library` if DOM extraction is interrupted.
   - **Instant Account Quota Rotation & Auto-Failover**: Automatically routes requests across Google account slots (`/u/0/app`, `/u/1/app`, `/u/2/app`, etc.) with real-time quota telemetry and seamless switching.
   - **Active Tab Anti-Throttling & Tab Group Reuse**: Activates generation tabs automatically and reuses the `"MythicFrame BEI"` tab group across windows.
   - **Reference Asset Pipeline**: Fully supports multi-modal reference uploads with dynamic upload progress watchers and consent auto-dismissal.
   - *Full Reference:* See [`docs/BEI_MODE.md`](./BEI_MODE.md) and [`bei-extension/INSTALLATION_AND_USAGE_GUIDE.md`](../bei-extension/INSTALLATION_AND_USAGE_GUIDE.md).

### Backend & Data Persistence Layer
- **Express Server** (`server.ts`):
  - Integrates Vite development middleware.
  - Serves REST endpoints (`/api/assets`, `/api/config/gemini-key`, `/api/bei/*`, `/api/system/shutdown`).
  - Persists API keys to `.env.local` without client-side exposure.
- **SQLite Database** (`assets.db` via `better-sqlite3`):
  - Stores all historical asset metadata, generation timestamps, prompt logs, and Base64/DataURL images for instant local querying.

### Model Context Protocol (MCP v2.0.0) Integration
MythicFrame embeds a dedicated Model Context Protocol server (`src/mcp/index.ts` & `mcp-server/`):
- Connects autonomous AI coding agents (Antigravity, Claude Code, Cursor) directly into the studio workspace via Stdio transport.
- **Exposes 24 production tools across 4 categories**:
  - **Prompt Engineering Tools**:
    - `prepare_illustration_prompt` (Character/scene prompts with 13 shot-distance presets, viewpoints, chibi, seed)
    - `prepare_clothes_prompt` (Model vs asset ghost clothing, assembled vs spread layouts)
    - `prepare_pose_studio_prompt` (Spatial translation from skeletal joint vectors)
    - `prepare_ui_reimagine_prompt` (Game HUD/menu restyling prompts)
    - `prepare_map_grid_prompt` (Top-down and isometric grid battle map prompts)
    - `prepare_sprite_sheet_prompts` (Multi-pose directional frame prompts)
    - `prepare_frame_prompt` (CCG borders, mana crystal, and banner prompts)
    - `prepare_background_asset_prompt` (Scenery, texture, and UI backdrop prompts)
    - `prepare_extract_clothes_prompt` (Biological eraser ghost equipment extraction)
    - `prepare_card_suggestions_prompt` (Mechanic and lore name/effect suggestions)
  - **Generation Execution Tools**:
    - `mythic_bei_generate` (Zero-key image generation via active Gemini/ChatGPT browser tabs)
    - `mythic_smart_generate` (Unified multi-engine router: auto, BEI, Gemini API, or prompt-only)
    - `batch_studio_generate` (High-volume multi-subject and variation batch synthesis)
  - **Lifecycle & Browser Management Tools**:
    - `mythic_status` (Inspects server, BEI bridge, connected accounts, and tab states)
    - `mythic_launch_server` (Auto-starts MythicFrame web UI and BEI bridge if offline)
    - `launch_web_ui` (Launches studio web UI on localhost:3488)
    - `mythic_open_tab` (Opens/focuses Gemini or ChatGPT Chrome tabs)
    - `mythic_scan_accounts` (Discovers logged-in Google slots /u/0 through /u/3)
    - `mythic_set_active_tab` (Activates generation tab in Chrome to prevent background throttling)
    - `mythic_fetch_library_assets` (Fetches and auto-downloads assets from Gemini Web Library)
    - `mythic_get_settings` (Queries active BEI configuration, tabs, and preferences)
  - **Art Style Management Tools**:
    - `mythic_list_art_styles` (Lists 45+ built-in styles and custom project styles)
    - `mythic_apply_art_style` (Activates a style anchor in `mythic_project.json`)
    - `mythic_create_art_style` (Saves a new custom art style into `mythic_project.json`)

### Quota, Cost, and Telemetry Tracking
`src/services/quotaTrackerService.ts` provides enterprise-grade observability:
- **Telemetry**: Measures call latency in milliseconds, success/failure status, and model IDs.
- **Cost Estimation**: Estimates USD spend per generation across models.
- **Rate Limit Detection**: Automatically flags HTTP 429 and `RESOURCE_EXHAUSTED` responses.
- **Live Probes**: Runs diagnostics against Google Gemini API and OpenAI to confirm key validity and remaining quota.

---

## 3. Project Navigation & Global Pages

Access these pages using the **Project** collapsible section in the sidebar.

### Dashboard (`dashboard`)
- **Metric Cards**: Real-time counter of total assets generated across all sessions.
- **Quick Action Triggers**: Instant navigation shortcuts to start an illustration or build a Gacha Character Bible.
- **Recent Works Grid**: Visual cards showing thumbnail previews, prompt extracts, and timestamps with instant navigation to the asset library.

### Library / Asset Vault (`library`)
- **Persistent Vault**: Directly displays assets stored in `assets.db`.
- **One-Click State Restore**: Restores not just the image, but the exact prompt, selected style, aspect ratio, framing, and background parameters into a new workspace tab.
- **Deletion & Cleanup**: Remove single records or clear outdated assets.

### Style Library (`style-library`)
- **Style Presets**: Manages hundreds of visual aesthetics across categories:
  - *Game Art* (Dark Fantasy, Hand-Painted RPG, Hearthstone style, Stylized 3D)
  - *Anime/Manga* (Shonen Action, Modern Cel-Shaded, 90s Vintage Anime)
  - *Digital Painting* (Concept Art, Oil Wash, Matted Concept)
  - *Traditional* (Watercolor, Ink Wash, Woodblock)
  - *Abstract/UI* (Vector Iconography, Cyberpunk Holo, Minimalist Flat)
  - *Retro* (Pixel 16-bit, Low-Poly PS1, CRT Arcade)
- **Style Collections**: Group art styles into named packs for individual game projects.
- **Style Preview Generator**: Runs test generations to visually preview how a style applies to standard subjects.

### Downloads & Export Vault (`downloads`)
- **Export Registry**: Logs every exported ZIP package, PNG batch, and CSV file.
- **Re-Download Engine**: Stores binary Blobs or persistent local URLs to re-download historical exports without regenerating.
- **Package Inspector**: Displays file size in megabytes, export timestamp, and item count.

### Quota Inspector (`quota`)
- **Live Health Diagnostics**: Triggers probe requests to Gemini and OpenAI to verify connection health.
- **Monthly Budget Tracking**: Configure a monthly USD limit; features progress bars with color-coded warning states.
- **Detailed History Log**: Filterable record of recent API calls with latency graphs and failure logs.

### Settings & Global World Bible (`settings`)
- **AI Provider Switcher**: Set primary provider (Gemini, OpenAI, OpenCode, OpenRouter, Pollinations, Offline).
- **API Key Vault**: Save, view, and test keys.
- **Dynamic Model Discovery**: Scans the Google Gemini API endpoint to detect newly released Gemini/Imagen models.
- **Game Context ("World Bible")**:
  - `Setting`: Defines the universe (e.g., *"Cozy Victorian Alchemist Shop with Eldritch undertones"*).
  - `Tone`: Emotional atmosphere (e.g., *"Whimsical yet dangerous, vibrant bioluminescent colors"*).
  - `Visual Constraints`: Strict aesthetic rules (e.g., *"No modern metals, heavy painterly brushstrokes"*).
  - `Default Style ID`: Automatically binds a preferred art style to all new tabs.
- **Google Drive Storage**: Configure OAuth Client ID and select target cloud storage folders.

### Tutorials / University (`tutorials`)
- In-app interactive learning center divided into 9 core modules:
  1. *Quick Start*
  2. *Studio Essentials*
  3. *Illustration & NEO Matting*
  4. *Character Bible / Gacha*
  5. *Clothes Designer*
  6. *Magic Resizer*
  7. *UI Reimagine*
  8. *Batch Studio*
  9. *Animation Studio*

---

## 4. Character Studio Modes

### Illustration Studio (`illustration`)
- **Core Character & Concept Canvas**: Generates single-card character designs, creatures, or action scenes.
- **Camera Viewpoints**: Select `Front`, `Back`, `Side`, `Three-Quarter`, `Top-Down`, `High-Angle`, `Low-Angle`, `Isometric`, or `Cinematic`.
- **Cinematography Shot Framing (13 Ordered Presets)**:
  - `ECU` (Extreme Close-Up) — Tiny facial detail (eye, lips)
  - `BCU` (Big Close-Up) — Entire face from forehead to chin
  - `CU` (Close-Up) — Head and face dominate; shoulders partially visible
  - `MCU` (Medium Close-Up) — Head and upper chest
  - `BUST` (Bust Shot) — Head, shoulders, and chest
  - `MS` (Medium Shot) — Head to waist; waist-level props visible
  - `MLS` (Medium Long Shot) — Head to just below knees
  - `3/4` (Three-Quarter Shot) — Head to knees
  - `AS` (American Shot) — Mid-thigh up; weapon holster framing
  - `FS` (Full Shot) — Complete character head-to-toe
  - `LS` (Long Shot) — Subject fully visible with surrounding scene context
  - `ELS` (Extreme Long Shot) — Character small in expansive environment
  - `VWS` (Very Wide Shot) — Panoramic environmental vista dominating subject
- **Chibi Engine**:
  - Ratios: `1:1` Micro (2-head), `1:2` Chibi (3-head), `1:4` Deformed (4-head).
  - Head Style: `Moe` (ultra-cute large eyes) vs. `Realistic`.
  - Body Style: `Geometric` vs. `Defined anatomy`.
- **Safe Zone Overlay**: Visual bounds for CCG cards with aspect ratio lock and drag-and-drop boundary handles.
- **Inpainting Edit Mode**: Select a rectangular region on the canvas to regenerate specific details without altering the rest of the image.

### Sprite Sheet Studio (`sprite-sheet`)
- **Multi-Pose Grid Generation**: Produces uniform pose grids for 2D sprites.
- **Global Prompt + Per-Frame Delta**: A global prompt defines the character's core identity, while each frame specifies variations (e.g., Idle Frame 1, Walk Step A, Sword Swing Apex).
- **Transparent Output**: Built-in background suppression ensures frames import cleanly into engine sprite atlases.

### Pose Studio (`pose-studio`)
- **Interactive 2D Skeletal Rig**: Visual canvas featuring 14 draggable joints:
  - Head, Neck, Shoulders (L/R), Elbows (L/R), Wrists (L/R), Pelvis, Knees (L/R), Ankles (L/R).
- **Biomechanical Constraints & IK Solver (`poseConstraints.ts`)**:
  - Realistic bone length limits and natural joint angle clamping (prevents hyperextension of elbows and knees).
  - 2-bone analytical Inverse Kinematics (IK) solver allowing intuitive manipulation of hands and feet.
  - Viewport boundary safety clamps (`[3%, 97%]`) preventing joints from clipping out of the canvas.
- **Zero-Latency Dragging**: Canvas renders at native monitor refresh rates (60–144 FPS) using `requestAnimationFrame` and local state isolation, eliminating global re-render stutter.
- **Bones & Skeleton Preview**: Interactive multi-joint selection and visual hierarchy rendering.
- **Rig-to-Prompt Translation**: Converts joint coordinates and bone angles into spatial natural-language instructions, forcing the AI to match the skeletal pose.
- **Camera Look Target**: Interactive target reticle directing character gaze and head orientation.

### Character Bible / Gacha Studio (`gacha`)
- **Multi-Tier Rarity Generator**: Produces an entire gacha rarity set for a character:
  - **R (Rare)**: Modest adventurer clothing, neutral lighting, simple pose.
  - **SR (Super Rare)**: Upgraded armor/weapons, dynamic action pose, atmospheric glow.
  - **SSR (Super Super Rare)**: Ornate relic gear, combat pose, swirling particle effects.
  - **UR (Ultra Rare)**: Transcendent mythical form, maximum visual flair, full cinematic backdrop.
- **Continuity Flags**: Locks specific visual features across tiers:
  - Hair Color, Eye Color, Facial Features/Scars, Weapon Silhouette, Clothing Palette.
- **Race Archetypes**: Presets for Elves, Dragonkin, Mecha-Pilots, Undead, Beasts, and Cybernetic entities.
- **Batch Set Generation**: One-click generation of the entire character set in one pass.

### Clothes Designer (`clothes`)
- **Render Modes**:
  - `Model Mode`: Generates the outfit worn by a mannequin or character model with pose locking.
  - `Asset Mode`: Isolates clothing articles against a clean backdrop for inventory and crafting systems.
- **Layout Presets**:
  - `Assembled`: Full outfit worn together.
  - `Spread`: Exploded equipment sheet laying out helmet, armor, gloves, boots, and weapons individually.
- **Extract Outfit Tool**: Takes an existing character portrait and strips away the character to generate a standalone equipment reference sheet.

---

## 5. World & UI Studio Modes

### Background Studio (`background`)
- **Scenery & World Generation**: Creates landscapes, dungeon interiors, and cityscapes.
- **Pattern Modes**:
  - `Scene`: Full pictorial environment.
  - `Texture`: Seamless terrain tiles (cobblestone, wood grain, metal plating).
  - `Abstract`: Magical vortexes, cosmic nebulae, elemental energy curtains.
  - `UI Backdrop`: Soft, low-contrast gradient backdrops for readable menu text.
- **No-Character Filter**: Automatically injects negative prompts to prevent accidental character generation.

### BG Replacer & Matting (`bg-replace`)
- **Batch Background Swapper**: Upload existing assets and replace their backgrounds with solid colors, scenic backdrops, or transparent cutouts.
- **Transparent NEO Integration**: Applies soft alpha matting, exterior BFS flood fills, and color decontamination.

### Frame Studio (`frame`)
- **CCG Borders & Frames**: Generates ornate card borders for fantasy, sci-fi, and horror themes.
- **Modular Element Slots**: Generates isolated or composited pieces for:
  - `Name Banner`
  - `Mana / Resource Cost Crystal`
  - `Rules Text / Description Box`
  - `Power / Toughness Shields`

### UI Reimagine (`ui-reimagine`)
- **Game HUD & Menu Restyling**: Reworks existing UI layouts into fresh visual aesthetics.
- **UI Archetypes**:
  - Classic RPG HUD, Sci-Fi Terminal, Mobile Action, Strategy Grid, Cyberpunk Neon, Cozy Casual.
- **Materials & Textures**: Weathered Iron, Polished Gold, Ancient Rune Stone, Holographic Glass, Obsidian.
- **Position Locking**: Preserves the screen positions of buttons and health bars while refreshing their visual styling.

### Map Grid Studio (`map-grid`)
- **Grid-Aligned Map Generation**: Creates battle maps and tiles for tabletop and 2D games.
- **View Modes**:
  - `Top-Down (Orthographic)`: Classic 2D view.
  - `Isometric (2.5D)`: Diamond grid with configurable diamond ratio and vertical height multipliers.
- **Environment Presets**: Dungeon, Tomb, Castle, Forest Ruins, Custom.
- **Lighting Controls**: Directional sunlight/torchlight (Top-Left, Top-Right, Bottom-Left, etc.) and shadow intensity.
- **Tileset Export**: Exports the map sliced into individual tile chunks.

---

## 6. Production & Processing Studio Modes

### Pixel Studio (`pixelize`)
- **Retro Conversion Pipeline**: Converts modern illustrations into pixel art.
- **Style Presets**:
  - `8-bit`: NES/GameBoy style with limited color palettes and chunky pixels.
  - `16-bit`: SNES/Genesis style with dithering and expressive shading.
  - `32-bit`: PS1/GBA era with detailed sprite shading.
  - `Modern`: Crisp, high-color indie pixel art.
- **Downsampling & Quantization**: Clean edge detection that avoids modern digital smoothing blur.

### Magic Resizer & Safe Zones (`resize`)
- **Smart Aspect Ratio Expansion**: Converts square (1:1) art into widescreen (16:9), portrait (9:16), or ultrawide (21:9) using context-aware outpainting.
- **Safe Zone Bounding**: Visual guidelines for standard TCG print cards (Standard 2.5" x 3.5", Mini, Tarot).
- **Custom Resolution Box**: Interactive cropping box for specific pixel dimensions.

### Animation Studio (`animation`)
- **Frame-by-Frame Timeline**: Real-time management of animation sequences.
- **Onion Skinning**: Semi-transparent preview of preceding frames to ensure smooth motion arcs.
- **FPS Playback**: Live in-browser animation preview with adjustable framerates.
- **Turnaround Automation**: Automatically generates 8-directional turnaround views for 3D modeling references.

### Batch Studio & CSV Import (`batch`)
- **Bulk Production Center**: Process hundreds of asset prompts in an automated queue.
- **CSV & JSON Ingestion**: Imports spreadsheets with card names, descriptions, and mana costs to generate full sets automatically.
- **Consistent Series Mode**: Locks a single character reference across dozens of cards in different actions and settings.
- **Variation Auto-Generation**: Automatically schedules Waist-Up, Full-Body, and Chibi versions for each row.

### Full Card Composer (`fullcard`)
- **Complete CCG Card Layout**: Combines card templates, character art, and typography.
- **Layer Management**:
  - Template border layer.
  - Character art layer with independent X/Y offsets, scale, and z-index (`front`/`behind` frame).
  - Editable text fields: Card Name, Mana Cost, Card Type, and Rules Description.
- **Canvas Export**: Exports finished, print-ready card files.

---

## 7. Specialized Core Technologies & Algorithms

### Transparent NEO Matting Pipeline
Standard background removers use simple color tolerance thresholds that leave unsightly fringes or erase fine details. MythicFrame's **Transparent NEO** pipeline solves the compositing equation:

$$\text{Observed Color} = \alpha \cdot \text{Foreground} + (1 - \alpha) \cdot \text{Background}$$

```
Input Image (AI Generated with Chroma Key Backdrop)
  │
  ├── [Pass 0: Background Profiling] ── Samples image perimeter for illumination drift
  │
  ├── [Pass 1: Exterior BFS] ────────── Identifies outside background; protects internal color matches
  │
  ├── [Pass 2: Soft Alpha Matting] ──── Calculates Signed Distance Field (SDF) along contours
  │
  ├── [Pass 3: Color Decontamination] ─ Subtracts backdrop color from edge pixels (defringing)
  │
  └── [Pass 4: FX Glow & SteamSafe] ─── Preserves translucent magic particles & eliminates dark halos
  │
Output: Crisp PNG with True Alpha Channel
```

- **Exterior BFS**: Floods inward from canvas borders. If a character has pink eyes or gems, they won't be erased by a magenta chroma key because they aren't connected to the exterior.
- **Signed Distance Field (SDF)**: Generates a soft alpha transition along complex boundaries like hair and feathers.
- **Decontamination (Defringing)**: Mathematically subtracts the chroma key color from edge pixels. Semi-transparent hair turns natural instead of keeping a colored outline.
- **SteamSafe & FX Glow**: Detects high-luminance glowing particles (fireballs, magic sparks, smoke) and boosts their alpha to keep them visible on any game background.

### Game Context & World Bible Inheritance
All prompts pass through `src/services/promptTemplates.ts`. The system automatically wraps user inputs with the project's lore:

$$\text{Final Prompt} = f(\text{User Prompt}, \text{Art Style}, \text{Setting}, \text{Tone}, \text{Visual Constraints}, \text{Framing}, \text{Viewpoint})$$

This ensures that an asset prompt like *"Health Potion"* generates an ornate glass vial in a High Fantasy project, but a glowing nanite syringe in a Cyberpunk project.

### Biomechanical Pose Rigging & IK Solver
The Pose Studio uses normalized 2D joint coordinates to build spatial relationship descriptors:
- Joint positions are calculated as percentages: $(x, y) \in [0, 100]$.
- **Biomechanical Constraints (`poseConstraints.ts`)**:
  - Enforces physiological bone lengths and joint angle clamps (prevents non-human joint rotation).
  - 2-bone analytical Inverse Kinematics (IK) algorithm for wrists and ankles.
  - Viewport boundary safety clamps $[3\%, 97\%]$.
- Bone vectors (e.g., upper arm to forearm) are converted into relative angles.
- The prompt compiler generates explicit spatial guidance (e.g., *"Subject's left arm raised high holding a sword at 45 degrees, right knee bent deeply in forward lunge"*).

### Continuity Flags System
In Gacha Mode, the continuity engine maintains visual consistency across multiple generations:
- When a flag like `Hair: Silver Braided` or `Armor: Gold Lion Crest` is enabled, its prompt tokens are locked and given priority weighting across all rarity variations.

### In-App Dialog Engine
MythicFrame eliminates intrusive browser-native popup interruptions (`alert()`, `confirm()`, `prompt()`):
- Powered by `dialogService.ts` and `<InAppDialogModal />`.
- Features dark glassmorphic styling, non-blocking asynchronous promises, custom confirmations, and seamless error recovery without halting page execution.

---

## 8. Multi-Tab Workspace & Export Systems

### Tabbed Workspace Engine
- Work on multiple assets in parallel (e.g., an illustration in Tab 1, a sprite sheet in Tab 2, and a card frame in Tab 3).
- Tabs preserve their full working state: prompt history, zoom/pan coordinates, active layer transforms, and configuration settings.

### Export Pipeline
- **ZIP Packaging**: Packages all images alongside metadata files (`prompt.txt`, `config.json`).
- **CSV Data Sync**: Exports metadata tables ready for game engine localization or database imports.
- **Google Drive Sync**: Saves assets directly to Google Drive folders via the Google API Client Library.

---

## 9. Complete Pages & Modes Reference Table

| Category | Identifier | Mode Type | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **Project** | `dashboard` | View | Project metrics, quick-start shortcuts, recent assets |
| **Project** | `library` | View | Persistent SQLite asset vault and full state restoration |
| **Project** | `style-library` | View | Style preset manager, custom collections, live previews |
| **Project** | `downloads` | View | Historical export bundles, re-downloads, blob storage |
| **Project** | `quota` | View | API health diagnostics, spend tracking, latency metrics |
| **Project** | `settings` | View | Provider switching, API keys, global World Bible, Drive setup |
| **Project** | `tutorials` | View | Interactive guides and documentation modules |
| **Character** | `illustration` | Studio | Core character card art, 13 framing presets, viewpoints, chibi engine |
| **Character** | `sprite-sheet` | Studio | Multi-frame character animation grids |
| **Character** | `sprite-strip` | Studio | Horizontal/vertical directional keyframe animation strips |
| **Character** | `pose-studio` | Studio | Interactive 14-joint 2D skeletal posing with IK & biomechanics |
| **Character** | `gacha` | Studio | Rarity tier progression (R, SR, SSR, UR) with continuity flags |
| **Character** | `clothes` | Studio | Outfit designer, equipment spread sheets, clothing extraction |
| **World & UI** | `background` | Studio | Scenery, terrain textures, and UI text backdrops |
| **World & UI** | `bg-replace` | Studio | Transparent NEO matting and chroma key replacement |
| **World & UI** | `frame` | Studio | Card frames, borders, mana sockets, and banner slots |
| **World & UI** | `ui-reimagine` | Studio | Game HUD, menu layouts, and theme redesign |
| **World & UI** | `ui-scene` | Studio | Full UI mockup layout composition |
| **World & UI** | `map-grid` | Studio | Top-down and isometric dungeon/world map generator |
| **Production** | `pixelize` | Studio | 8-bit, 16-bit, 32-bit pixel art downsampling and palette mapping |
| **Production** | `resize` | Studio | Smart upscaling, aspect ratio expansion, safe-zone crop |
| **Production** | `animation` | Studio | Frame-by-frame animation timeline with onion skinning |
| **Production** | `batch` | Studio | Automated bulk processing, CSV import, variation generation |
| **Production** | `fullcard` | Studio | Complete TCG card composer with drag-and-drop elements |

