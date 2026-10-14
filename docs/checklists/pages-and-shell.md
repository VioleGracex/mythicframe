# MythicFrame – Pages, Studios, and Shell Checklist

- [x] **App Shell & Global Navigation**
  - [x] Collapsible `AppSidebar` with grouped categories (Project, Character, World & UI, Production)
  - [x] Multi-Tab Workspace Bar with per-tab mode isolation and state preservation
  - [x] Header AI Engine Status Badge (Active engine, BEI bridge status, quota pills)
  - [x] `InAppDialogModal` glassmorphic dialog system replacing native browser popups
  - [x] Graceful `ShutdownModal` with backend server termination endpoint

- [x] **Project Management Views**
  - [x] **Dashboard (`dashboard`)**: Asset counter metrics, quick action shortcuts, recent generation feed
  - [x] **Library (`library`)**: SQLite persistent asset vault, full state restoration into new workspace tabs, single/bulk deletion
  - [x] **Style Library (`style-library`)**: Visual catalog of 45+ art style presets, category filters, style preview generation, and custom style creator
  - [x] **Downloads Vault (`downloads`)**: Export registry for historical ZIP, PNG, and CSV packages with 1-click re-download
  - [x] **Quota Inspector (`quota`)**: Live API health probes (Gemini & OpenAI), spend tracking, monthly budget threshold, and request latency graphs
  - [x] **Settings (`settings`)**: 3-tab configuration (AI Generation Engines, Game Context / World Bible, Google Drive OAuth)
  - [x] **Tutorials (`tutorials`)**: In-app interactive learning hub with 9 core instructional modules

- [x] **Character Studio Modes**
  - [x] **Illustration Studio (`illustration`)**: Canvas with 13 cinematography framing presets, 9 camera angles, Chibi engine, Biological Eraser, and inpainting
  - [x] **Pose Studio (`pose-studio`)**: 14-joint interactive 2D rig, biomechanical constraints, 2-bone IK solver, gaze reticle, 60–144 FPS drag
  - [x] **Character Bible / Gacha (`gacha`)**: 4-tier rarity generator (R, SR, SSR, UR), continuity flags system, batch set generator
  - [x] **Clothes Designer (`clothes`)**: Mannequin model vs isolated equipment asset modes, assembled vs exploded spread layouts, outfit extractor
  - [x] **Sprite Sheet (`sprite-sheet`)**: Multi-pose uniform sprite grids, frame delta prompt compiler, engine-ready transparency
  - [x] **Sprite Strip (`sprite-strip`)**: Horizontal/vertical directional animation strips

- [x] **World & UI Studio Modes**
  - [x] **Background Studio (`background`)**: Scenic landscapes, seamless terrain textures, energy curtains, and UI backdrops
  - [x] **BG Replacer (`bg-replace`)**: Transparent NEO matting pipeline, soft alpha extraction, chroma-key defringing
  - [x] **Frame Studio (`frame`)**: Ornate TCG card borders, mana crystal sockets, name banner slots, description boxes
  - [x] **UI Reimagine (`ui-reimagine`)**: Game HUD restyling across RPG, Sci-Fi, Neon, and Strategy archetypes with material textures
  - [x] **Map Grid Studio (`map-grid`)**: Top-down orthographic and 2.5D isometric dungeon/battle map generator with tile chunk export

- [x] **Production & Processing Studio Modes**
  - [x] **Pixel Studio (`pixelize`)**: 8-bit, 16-bit, 32-bit, Game Boy, and Arcade CRT downsampling with palette quantization
  - [x] **Magic Resizer (`resize`)**: Aspect ratio outpainting expansion (1:1 to 16:9, 9:16, 21:9), TCG safe-zone bounding boxes, crop tool
  - [x] **Animation Studio (`animation`)**: Frame-by-frame timeline, onion skinning, adjustable FPS playback, 8-directional turnaround
  - [x] **Batch Studio (`batch`)**: Spreadsheet ingestion (CSV/JSON), automated multi-variation pipelines, series character locking
  - [x] **Full Card Composer (`fullcard`)**: CCG card layout composer, draggable/resizable frame and art layers, text typography styling
