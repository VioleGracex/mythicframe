# MythicFrame – Domain and Data Models Checklist

- [x] **Project & Game Context ("World Bible")**
  - [x] `setting`: Universe lore description
  - [x] `tone`: Emotional atmosphere and lighting style
  - [x] `visualConstraints`: Strict negative/positive rendering guardrails
  - [x] `defaultStyleId`: Bound project-wide art style

- [x] **Art Style Model**
  - [x] `id`, `name`, `promptSnippet`, `description`, `category`
  - [x] Built-in catalog (45+ presets: Game Art, Anime, Digital Painting, Traditional, Abstract/UI, Retro)
  - [x] Custom style creation & persistence in `mythic_project.json`

- [x] **Character Studio Domain Models**
  - [x] **Framing Hierarchy**: 13 ordered cinematography shot presets (`ECU`, `BCU`, `CU`, `MCU`, `BUST`, `MS`, `MLS`, `3/4`, `AS`, `FS`, `LS`, `ELS`, `VWS`)
  - [x] **Camera Viewpoints**: `front`, `back`, `side`, `three-quarter`, `top-down`, `high-angle`, `low-angle`, `isometric`, `cinematic`
  - [x] **Chibi Engine**: Proportions (`1:1` micro, `1:2` chibi, `1:4` deformed), Head styles (`moe`, `realistic`), Body styles (`geometric`, `defined`)
  - [x] **Pose Studio Rigging**: 14 normalized skeletal joints, biomechanical motional bounds, 2-bone analytical IK solver, look-target vector
  - [x] **Gacha Progression**: Rarity tiers (`R`, `SR`, `SSR`, `UR`), continuity flags (hair, eyes, weapons, palette anchors)
  - [x] **Clothes Designer**: `model` mode vs `asset` mode (Biological Eraser ghost render), `assembled` vs `spread` layouts

- [x] **World & UI Domain Models**
  - [x] **Background Patterns**: `scene`, `texture` (seamless tile), `abstract`, `ui_backdrop`
  - [x] **Transparent NEO Matting**: Perimeter sampling, exterior BFS flood, Signed Distance Field (SDF), color decontamination defringing, SteamSafe FX glow
  - [x] **Map Grid**: Orthographic top-down and 2.5D isometric diamond projections, tile dimensions, lighting azimuth, and slice maps
  - [x] **UI Reimagine**: Layout archetypes (RPG, Sci-Fi, Neon, Strategy) and material shaders (Gold, Obsidian, Rune Stone)

- [x] **Production Domain Models**
  - [x] **Pixel Art**: Palettes (8-bit NES, 16-bit SNES/Genesis, 32-bit GBA, Game Boy 4-shade, Arcade CRT)
  - [x] **Magic Resizer**: Canvas outpainting safe zones (TCG Standard, Mini, Tarot), custom pixel bounding boxes
  - [x] **Animation**: Keyframe timeline, onion skinning alpha buffers, FPS playback, 8-directional turnaround
  - [x] **Batch Studio**: Ingestion schema for CSV/JSON spreadsheets, subject/variation matrix, series template locking
  - [x] **Full Card**: CCG element slots (Name Banner, Mana Cost, Rules Box, Power/Toughness Shields, Frame border layer, Art layer)

- [x] **Persistence & Telemetry Models**
  - [x] SQLite `assets` table schema (`assets.db`)
  - [x] IndexedDB stores (`MythicFrameDB`: `history`, `exports`, `workspace`)
  - [x] Telemetry records (latency, USD cost estimate, error codes, HTTP 429 / resource exhausted tracking)
