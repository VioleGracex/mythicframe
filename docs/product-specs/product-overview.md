# MythicFrame – Product Overview

> **Version:** 1.6.1  
> **Platform:** Local Desktop Web Application (React 19 + TypeScript + Express + SQLite + MCP Server + BEI Extension)

## What is MythicFrame?
MythicFrame is a unified open-source 2D game asset design studio and card production workstation. Unlike generic image generators that create isolated one-off illustrations, MythicFrame is architected around **narrative coherence, game mechanic alignment, and engine-ready asset delivery**.

## Target Audience
- Indie game developers and 2D pixel/vector artists
- Tabletop and digital Trading Card Game (TCG/CCG) creators
- RPG and strategy game designers
- Autonomous AI coding agents needing high-fidelity asset generation tools

## Game Developer Focus (Narrative & Mechanics)
MythicFrame builds **coherent asset sets** anchored to a project's universe:
- **Project-Level World Bible**: Define setting (e.g. *"Grim medieval realm under siege"*), tone (*"Dark, gritty, tactical"*), and visual constraints (*"Black contour outlines, cel-shaded highlights, no modern tech"*). All character, background, and UI generations inherit these constraints.
- **Story-Aware Prompt Synthesis**: Procedurally injects lore anchors so an item like *"Health Potion"* becomes a glass potion vial in high fantasy, but a glowing nanite syringe in sci-fi.
- **Continuity Flagging**: Locks key visual traits (hair color, eye color, signature weapons) across multiple character tiers and expressions.

## Key Differentiators
- **Bring Your Own Account (BYOA) Unified Client**: Connects via the Browser Extension Interface (BEI v1.5.2) directly to authenticated Google Gemini Web and ChatGPT Web sessions with **Zero API Keys** and **Zero API billing**, utilizing Google Imagen 3 and OpenAI DALL-E 3 for free.
- **Transparent NEO Matting Pipeline**: Solves the compositing equation with perimeter sampling, exterior BFS flood-fill, Signed Distance Fields (SDF), and color decontamination (defringing) for clean alpha cutout sprites.
- **Model Context Protocol (MCP v2.0.0)**: Native MCP server exposing 24 tools directly to AI coding agents (Antigravity, Claude Code, Cursor) for automated asset generation.
- **Production Asset Pipelines**: Outputs game-ready transparent sprites, 2.5D isometric battle maps, UI HUD components, 8-bit/16-bit retro pixel variants, and card templates.
- **Production Exports**: 1K, 2K, and 4K exports with metadata preservation (prompts, seeds, configs) and full ZIP/CSV packaging.

## Studio Suites & Modes (24 Total)

### 1. Character Studio
1. **Illustration Studio (`illustration`)**: Core character concept art, 13 ordered cinematography shot-distance framing presets (ECU through VWS), 9 camera viewpoints, Chibi proportions (1:1, 1:2, 1:4), Biological Eraser, and inpainting.
2. **Pose Studio (`pose-studio`)**: Interactive 14-joint skeletal rig with biomechanical angle constraints, 2-bone analytical IK solver, and look-target gaze reticle.
3. **Character Bible / Gacha (`gacha`)**: 4-tier rarity progression (R, SR, SSR, UR) with locked continuity flags and batch set generation.
4. **Clothes Designer (`clothes`)**: Mannequin model mode vs. isolated asset mode (Biological Eraser ghost equipment), assembled vs. exploded spread sheets, and outfit extractor.
5. **Sprite Sheet (`sprite-sheet`)**: Multi-pose uniform sprite grids with frame-delta prompt compiling.
6. **Sprite Strip (`sprite-strip`)**: Directional animation keyframe strips.

### 2. World & UI Studio
7. **Background Studio (`background`)**: Scenic landscapes, seamless terrain textures, energy vortexes, and low-contrast UI backdrops.
8. **BG Replacer & Matting (`bg-replace`)**: Transparent NEO matting pipeline for background removal and chroma-key replacement.
9. **Frame Studio (`frame`)**: Ornate TCG card borders, mana crystal sockets, name banners, rules text boxes, and stat shields.
10. **UI Reimagine (`ui-reimagine`)**: Game HUD and menu restyling across RPG, Sci-Fi, Neon, and Strategy archetypes with material textures.
11. **UI Scene (`ui-scene`)**: Full game UI mockups and composition layouts.
12. **Map Grid Studio (`map-grid`)**: Orthographic top-down and 2.5D isometric diamond battle maps with tile slicing export.

### 3. Production & Processing Studio
13. **Pixel Studio (`pixelize`)**: Authentic retro downsampling across 8-bit NES, 16-bit SNES, 32-bit GBA, Game Boy, and Arcade CRT palettes.
14. **Magic Resizer (`resize`)**: Smart aspect ratio outpainting (1:1 to 16:9, 9:16, 21:9) with TCG print safe-zone bounds.
15. **Animation Studio (`animation`)**: Frame-by-frame animation timeline with onion skinning and 8-directional turnaround automation.
16. **Batch Studio (`batch`)**: Spreadsheet ingestion (CSV/JSON) for automated high-volume card set production.
17. **Full Card Composer (`fullcard`)**: Complete CCG card composer with draggable template borders, character art layers, and typography.

### 4. Project Management Views
18. **Dashboard (`dashboard`)**: Real-time asset metrics, quick action shortcuts, and recent works grid.
19. **Library / Asset Vault (`library`)**: SQLite persistent asset vault with 1-click state restoration into workspace tabs.
20. **Style Library (`style-library`)**: Preset catalog with 45+ art styles and custom project style creation.
21. **Downloads Vault (`downloads`)**: Historical export packages with 1-click re-downloading.
22. **Quota Inspector (`quota`)**: Live API health diagnostics, spend tracking, and latency metrics.
23. **Settings (`settings`)**: Multi-provider engine switching, API key vault, World Bible configuration, and Google Drive sync.
24. **Tutorials / University (`tutorials`)**: In-app learning modules covering all core workflows.