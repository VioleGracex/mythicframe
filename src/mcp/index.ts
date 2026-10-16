import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  buildIllustrationPrompt,
  buildUIReimaginePrompt,
  buildClothesPrompt,
  buildMapGridPrompt,
  buildPoseStudioPrompt,
  buildSpriteSheetPromptsPrompt,
  buildFramePrompt,
  buildBackgroundAssetPrompt,
  buildExtractClothesPrompt,
  buildCardSuggestionsPrompt,
  resolveArtStyleSnippet
} from "../services/promptTemplates.js";
import { GameContext, BackgroundConfig, MapGridConfig, PoseData } from "../types.js";
import { ART_STYLES } from "../constants/artStyles.js";

const server = new Server(
  {
    name: "mythic-advanced-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  checkMythicStatus,
  launchMythicServer,
  openBEITab,
  scanBEIAccounts,
  generateWithBEI,
  getMythicSettings,
  setActiveBEITab,
  fetchBEILibraryAssets,
  saveLibraryAssetToFile
} from "./beiClient.js";

// Helper to format output instructions for image generation
const executeImageGeneration = async (promptStr: string, aspectRatio: string = "1:1", toolName: string, apiKey?: string) => {
    const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
    if (!effectiveKey) {
        // Fallback: Check if BEI extension bridge is available
        const status = await checkMythicStatus();
        if (status.beiConnected && status.tabs.some(t => t.target === 'gemini' || t.target === 'chatgpt')) {
            const beiRes = await generateWithBEI({
                prompt: promptStr,
                aspectRatio,
                target: 'gemini'
            });
            const formattedPath = beiRes.filePath.replace(/\\/g, '/');
            return `IMAGE GENERATED SUCCESSFULLY VIA BEI!\n\nAgent, the image has been generated using Browser Extension Interface (BEI) with active Google Gemini session and saved here: ${beiRes.filePath}\n\nPlease embed this image for the user, AND provide a clickable markdown link [${path.basename(beiRes.filePath)}](file:///${formattedPath}) so they can easily open it!`;
        }

        throw new Error(
            "Missing geminiApiKey and no active BEI browser session connected.\n" +
            "Options to generate:\n" +
            "1. Pass 'geminiApiKey' or set GEMINI_API_KEY in .env.local (link: https://ai.google.dev/gemini-api/docs/api-key).\n" +
            "2. Ensure MythicFrame is running (use 'mythic_launch_server') and open Google Gemini in Chrome with the BEI extension."
        );
    }
    let aspectForGemini = "1:1";
    const ratio = aspectRatio.split(" ")[0];
    if (ratio === "16:9") { aspectForGemini = "16:9"; }
    if (ratio === "9:16") { aspectForGemini = "9:16"; }
    if (ratio === "3:4") { aspectForGemini = "3:4"; }
    if (ratio === "4:3") { aspectForGemini = "4:3"; }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${effectiveKey}`;
    const body = {
      instances: [{ prompt: promptStr }],
      parameters: { sampleCount: 1, aspectRatio: aspectForGemini }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error: ${errorText}`);
        }
        const data = await response.json();
        const base64Data = data.predictions[0].bytesBase64Encoded;
        const arrayBuffer = Buffer.from(base64Data, 'base64');
        
        const projectRoot = process.env.MYTHICFRAME_ROOT || 
          (fs.existsSync(path.join(process.cwd(), 'package.json')) ? process.cwd() : path.resolve(path.dirname(process.argv[1] || process.cwd()), '..'));
        const outDir = path.join(projectRoot, "outputs");
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const fileName = `${toolName}_${Date.now()}.jpg`;
        const filePath = path.join(outDir, fileName);

        fs.writeFileSync(filePath, arrayBuffer);
        return `IMAGE GENERATED SUCCESSFULLY!\n\nAgent, the image has been generated using Gemini Imagen 3 and saved here: ${filePath}\n\nPlease embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${filePath.replace(/\\\\/g, '/')}) so they can easily open it!`;
    } catch (e: any) {
        throw new Error(`Failed to generate Gemini image: ${e.message}`);
    }
};

// Helper to format output instructions for text generation
const formatTextInstruction = (promptStr: string) => {
    return `PROMPT OPTIMIZED SUCCESSFULLY!\n\nAGENT INSTRUCTION: Now, use your internal LLM reasoning to directly answer the user using the following prompt.\n\n---START PROMPT---\n${promptStr}\n---END PROMPT---`;
};

// Default empty structures to prevent null errors
const defaultGameContext: GameContext = { setting: "High Fantasy", tone: "Epic" } as any;
const defaultBgConfig: BackgroundConfig = { mode: "transparent" } as any;

function getProjectConfig(): {
  projectName?: string;
  gameContext?: GameContext;
  activeArtStyle?: { id?: string; name?: string; promptSnippet?: string };
  customStyles?: any[];
} {
  const projectRoot = process.env.MYTHICFRAME_ROOT || 
    (fs.existsSync(path.join(process.cwd(), 'package.json')) ? process.cwd() : path.resolve(path.dirname(process.argv[1] || process.cwd()), '..'));
  const projectFile = path.join(projectRoot, "mythic_project.json");
  if (fs.existsSync(projectFile)) {
    try {
      return JSON.parse(fs.readFileSync(projectFile, "utf8"));
    } catch (e) {}
  }
  return { projectName: "Kingdoms Divided", gameContext: defaultGameContext };
}

function getActiveGameContext(): GameContext {
  const cfg = getProjectConfig();
  return cfg.gameContext || defaultGameContext;
}

function resolveProjectArtStyle(styleInput?: string): string {
  const cfg = getProjectConfig();
  return resolveArtStyleSnippet(styleInput, cfg.activeArtStyle, cfg.projectName, cfg.customStyles);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "prepare_illustration_prompt",
        description: "Prepares a highly optimized illustration or character prompt using MythicFrame rules. Supports character helper (pose, look target, expression), camera viewpoints, framing, chibi modes, seed control, and biological eraser.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string", description: "Base character, creature, or scene prompt" },
            aspectRatio: { type: "string", description: "'1:1', '16:9', '9:16', '3:4', or '4:3'" },
            style: { type: "string", description: "Art style snippet or style ID (e.g. 'arknights_tactical', 'pixel_art')" },
            viewpoint: { type: "string", description: "Camera viewpoint: 'front', 'back', 'side', 'three-quarter', 'top-down', 'high-angle', 'low-angle', 'isometric', or 'cinematic'" },
            framing: { type: "string", description: "Shot distance framing: 'extreme_close_up' (ECU), 'big_close_up' (BCU), 'close_up' (CU), 'medium_close_up' (MCU), 'bust_shot' (BUST), 'medium_shot' (MS), 'medium_long_shot' (MLS), 'three_quarter_shot' (3/4), 'american_shot' (AS), 'full_shot' (FS), 'long_shot' (LS), 'extreme_long_shot' (ELS), or 'very_wide_shot' (VWS)" },
            characterPose: { type: "string", description: "Character pose/action description (e.g. 'standing heroic with sword raised', 'sitting relaxed on throne')" },
            lookTarget: { type: "string", description: "Direction subject is looking: 'at camera / direct gaze', 'looking away', 'looking up', 'looking down'" },
            expression: { type: "string", description: "Facial expression: 'stoic', 'gentle smile', 'fierce grin', 'mysterious smirk', 'angry'" },
            backgroundMode: { type: "string", description: "'solid', 'transparent', 'scene', 'pattern', 'none', 'prompt-only', or 'AI Decides'" },
            backgroundColor: { type: "string", description: "Hex color if solid, e.g. '#FFFFFF'" },
            chibiMode: { type: "boolean", description: "Enable chibi styling. When true, chibiRatio selects proportion" },
            chibiRatio: { type: "string", description: "'1:1' (micro_2h / nendoroid 2-head), '1:2' (chibi_3h / classic gacha 3-head), or '1:4' (deformed_4h / puchi 4-head)" },
            noCharacters: { type: "boolean", description: "STRICT negative constraint removing all people, humanoids, creatures, and animals. Use for environments, landscapes, props, inventory icons, and UI scenes." },
            biologicalEraser: { type: "boolean", description: "STRICT negative constraint erasing all skin, eyes, face, hair, and body parts to render a hollow ghost asset / standalone equipment." },
            seed: { type: "number", description: "Seed number for deterministic prompt repeatability" }
          },
          required: ["prompt"],
        },
      },
      {
        name: "prepare_ui_reimagine_prompt",
        description: "Prepares a prompt for UI/HUD Reimagine feature.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string" },
            styleSnippet: { type: "string" },
            uiMood: { type: "string" },
            uiArchetype: { type: "string" },
            uiMaterial: { type: "string" }
          },
          required: ["prompt"],
        },
      },
      {
        name: "prepare_clothes_prompt",
        description: "Prepares a prompt for the Clothes Designer studio. Can generate clothes on character or hollow ghost assets (Biological Eraser).",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string", description: "Clothing description, garment items, fabrics, and colors" },
            styleSnippet: { type: "string", description: "Optional art style snippet" },
            renderMode: { type: "string", enum: ["character", "asset"], description: "'asset' enables Biological Eraser (erases all body/skin/face, rendering hollow 3D ghost clothes). 'character' renders worn on character." },
            lockPose: { type: "boolean", description: "Strictly preserve reference anatomy and body posture" },
            layout: { type: "string", enum: ["single", "spread"], description: "'single' view or 'spread' (multi-view orthographic fashion design sheet)" },
            framing: { type: "string", enum: ["extreme_close_up", "big_close_up", "close_up", "medium_close_up", "bust_shot", "medium_shot", "medium_long_shot", "three_quarter_shot", "american_shot", "full_shot", "long_shot", "extreme_long_shot", "very_wide_shot", "full-body", "waist-up", "bust", "head-only"], description: "Shot distance preset (ordered ECU to VWS) or legacy framing" }
          },
          required: ["prompt"],
        },
      },
      {
        name: "prepare_map_grid_prompt",
        description: "Prepares a prompt for the Map Grid generator.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string" },
            styleSnippet: { type: "string" },
            viewMode: { type: "string", description: "'top-down' or 'isometric'" },
            primaryColor: { type: "string" }
          },
          required: ["prompt"],
        },
      },
      {
        name: "prepare_pose_studio_prompt",
        description: "Prepares a Pose Studio prompt forcing strict skeletal adherence.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string" },
            styleSnippet: { type: "string" }
          },
          required: ["prompt"],
        },
      },
      {
        name: "prepare_sprite_sheet_prompts",
        description: "Prepares a text-generation prompt asking for a list of sprite sheet poses.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string" },
            frameCount: { type: "number" }
          },
          required: ["prompt", "frameCount"],
        },
      },
      {
        name: "prepare_frame_prompt",
        description: "Prepares an image prompt for generating UI frames or borders.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string" },
            styleSnippet: { type: "string" },
            elements: { type: "array", items: { type: "string" } }
          },
          required: ["prompt", "elements"],
        },
      },
      {
        name: "prepare_background_asset_prompt",
        description: "Prepares an image prompt for generating a background asset.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            prompt: { type: "string" },
            styleSnippet: { type: "string" },
            patternType: { type: "string" }
          },
          required: ["prompt", "patternType"],
        },
      },
      {
        name: "prepare_extract_clothes_prompt",
        description: "Prepares an image prompt for ghosting out biological parts and keeping clothes.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
             backgroundMode: { type: "string", description: "'transparent' or 'solid'" }
          },
          required: [],
        },
      },
      {
        name: "prepare_card_suggestions_prompt",
        description: "Prepares a text prompt for generating TCG card name and effect suggestions based on art.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
             artPrompt: { type: "string" },
             currentName: { type: "string" }
          },
          required: ["prompt"],
        },
      },
      {
        name: "batch_studio_generate",
        description: "Generates a batch of images for multiple subjects and variations using the free API.",
        inputSchema: {
          type: "object",
          properties: {
            geminiApiKey: { type: "string" },
            subjects: { type: "array", items: { type: "string" }, description: "Array of character prompts" },
            variations: { type: "array", items: { type: "string" }, description: "Array of variations, e.g. ['full-body', 'waist-up', 'chibi']" },
            aspectRatio: { type: "string" },
            style: { type: "string" },
            backgroundMode: { type: "string" },
            backgroundColor: { type: "string" },
            chibiRatio: { type: "string", description: "'1:1', '1:2', or '1:4'" }
          },
          required: ["subjects", "variations"],
        },
      },
      {
        name: "mythic_status",
        description: "Checks whether MythicFrame web server (localhost:3488) and BEI browser bridge (port 58925) are running, and returns active browser tabs, logged-in Google/ChatGPT accounts, and available image engines.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "mythic_launch_server",
        description: "Auto-launches the MythicFrame server (web UI & BEI bridge on port 3488 and 58925) if it is currently offline.",
        inputSchema: {
          type: "object",
          properties: {
            port: { type: "number", description: "Port number (default 3488)" }
          },
          required: []
        }
      },
      {
        name: "mythic_open_tab",
        description: "Opens or focuses a Google Gemini or ChatGPT tab in Chrome via BEI so the user can log in with their browser account.",
        inputSchema: {
          type: "object",
          properties: {
            target: { type: "string", enum: ["gemini", "chatgpt"], description: "Browser target (default 'gemini')" },
            accountSlot: { type: "number", description: "Account slot (default 0)" }
          },
          required: []
        }
      },
      {
        name: "mythic_scan_accounts",
        description: "Scans and auto-detects all logged-in Google accounts across Chrome account slots (/u/0/ through /u/3/) in the background via BEI.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "mythic_set_active_tab",
        description: "Ensures the Google Gemini or ChatGPT tab is set as active in Chrome, preventing Chromium background tab throttling.",
        inputSchema: {
          type: "object",
          properties: {
            target: { type: "string", enum: ["gemini", "chatgpt"], description: "AI service target (default 'gemini')" },
            accountSlot: { type: "number", description: "Account slot index (default 0)" }
          },
          required: []
        }
      },
      {
        name: "mythic_fetch_library_assets",
        description: "Fetches generated image assets from Google Gemini Web Library (/library). Supports keyword searching and auto-downloading assets to local disk. Useful when DOM chat extraction fails or to retrieve past generated images.",
        inputSchema: {
          type: "object",
          properties: {
            target: { type: "string", enum: ["gemini"], description: "Target AI service (default 'gemini')" },
            accountSlot: { type: "number", description: "Google account slot index (default 0)" },
            limit: { type: "number", description: "Number of assets to retrieve (default 5)" },
            searchQuery: { type: "string", description: "Optional search query or keywords to filter library assets by prompt/alt text" },
            downloadLatest: { type: "boolean", description: "If true, automatically downloads the first/matching library image to disk (outputs/bei/) and returns a clickable local file link" }
          },
          required: []
        }
      },
      {
        name: "mythic_bei_generate",
        description: "Generates an image via the Browser Extension Interface (BEI) using active Google Gemini or ChatGPT browser sessions with ZERO API key required.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Image generation prompt" },
            aspectRatio: { type: "string", description: "'1:1', '16:9', '9:16', '3:4', or '4:3' (default '1:1')" },
            target: { type: "string", enum: ["gemini", "chatgpt"], description: "AI service target (default 'gemini')" },
            accountSlot: { type: "number", description: "Account slot index (default 0)" },
            images: { type: "array", items: { type: "string" }, description: "Array of reference image paths or base64 data URIs" },
            style: { type: "string", description: "Optional art style snippet" },
            quality: { type: "string", enum: ["standard", "high", "ultra_original"], description: "Image resolution & quality mode: 'ultra_original' (master full-res), 'high' (2K), or 'standard' (preview)" },
            transparentBackground: { type: "boolean", description: "If true, isolates subject on a clean flat white background ready for transparent cutout." },
            cleanBackground: { type: "boolean", description: "Alias for transparentBackground." },
            chatSessionMode: { type: "string", enum: ["same_chat", "temporary_chat", "new_chat"], description: "Conversation session mode: 'same_chat' (reuses current conversation thread), 'new_chat' (forces fresh conversation), or 'temporary_chat'. Default: 'same_chat'" },
            timeoutSeconds: { type: "number", description: "Timeout in seconds (default 120)" }
          },
          required: ["prompt"]
        }
      },
      {
        name: "mythic_smart_generate",
        description: "Unified generator for MythicFrame that intelligently discovers and routes to the best available engine (BEI browser extension or Gemini API key).",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Image generation prompt" },
            engine: { type: "string", enum: ["auto", "bei", "gemini-api", "prompt-only"], description: "Engine route (default 'auto')" },
            geminiApiKey: { type: "string", description: "Optional Gemini API key if using gemini-api route" },
            aspectRatio: { type: "string", description: "'1:1', '16:9', '9:16', '3:4', '4:3'" },
            style: { type: "string", description: "Art style snippet or style ID" },
            transparentBackground: { type: "boolean", description: "If true, isolates subject on a clean flat white background ready for transparent cutout." },
            cleanBackground: { type: "boolean", description: "Alias for transparentBackground." },
            quality: { type: "string", enum: ["standard", "high", "ultra_original"], description: "Image resolution & quality mode for BEI: 'ultra_original', 'high', or 'standard'" },
            images: { type: "array", items: { type: "string" }, description: "Optional reference images" },
            target: { type: "string", enum: ["gemini", "chatgpt"] },
            accountSlot: { type: "number" }
          },
          required: ["prompt"]
        }
      },
      {
        name: "launch_web_ui",
        description: "Manually launches the MythicFrame web UI on localhost port 3488 if the auto-launch failed.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "mythic_get_settings",
        description: "Fetches and displays all active MythicFrame settings, BEI configuration, connected browser accounts, slots, and quality/multi-account preferences.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "mythic_list_art_styles",
        description: "Lists all available art styles (45+ built-in styles + custom project styles) with style IDs, descriptions, and prompt snippets. Supports keyword filtering by theme or aesthetic.",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", description: "Optional filter: 'Game Art', 'Anime/Manga', 'Digital Painting', 'Traditional', 'Abstract/UI', 'Retro', 'Other'" },
            query: { type: "string", description: "Optional search query or keywords to filter styles by theme, mood, or aesthetic (e.g. 'feudal', 'fantasy', 'anime', 'pixel', 'dark')" }
          },
          required: []
        }
      },
      {
        name: "mythic_apply_art_style",
        description: "Applies an art style from the library or sets a custom prompt anchor in mythic_project.json so subsequent generations use it.",
        inputSchema: {
          type: "object",
          properties: {
            styleId: { type: "string", description: "ID of the art style to activate (e.g. 'arknights_tactical', 'dark_souls', 'pixel_art')" },
            customPromptSnippet: { type: "string", description: "Optional custom prompt snippet override" }
          },
          required: ["styleId"]
        }
      },
      {
        name: "mythic_create_art_style",
        description: "Creates and saves a new custom art style into mythic_project.json for reusable game asset synthesis.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier for the new style, e.g. 'cyber_samurai'" },
            name: { type: "string", description: "Display name for the style" },
            promptSnippet: { type: "string", description: "Exact visual prompt snippet and negative/positive style anchors" },
            description: { type: "string", description: "Short description of the aesthetic and rendering technique" },
            category: { type: "string", description: "Category name (default 'Custom')" }
          },
          required: ["id", "name", "promptSnippet"]
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = request.params.arguments as any;
    const name = request.params.name;
    
    let result = "";
    let isImageGen = true;
    let aspectRatio = "1:1";

    if (name === "prepare_illustration_prompt") {
      let bgMode: any = args.backgroundMode || "transparent";
      if (bgMode === "AI Decides" || bgMode === "scene") bgMode = "scene";
      const bgConfig: BackgroundConfig = { 
          mode: bgMode,
          color: args.backgroundColor 
      } as any;

      const chibiConfig = args.chibiMode ? ({ enabled: true, headSize: 2.0, bodyPlumpness: 1.5, limbStubbiness: 0.8, enableSparkles: false } as any) : undefined;
      
      let mappedChibiProportion: any = undefined;
      if (args.chibiMode && args.chibiRatio) {
          if (args.chibiRatio === "1:1") mappedChibiProportion = "micro_2h";
          if (args.chibiRatio === "1:2") mappedChibiProportion = "chibi_3h";
          if (args.chibiRatio === "1:4") mappedChibiProportion = "deformed_4h";
      } else if (args.chibiMode) {
          mappedChibiProportion = "chibi_3h"; // default 1:2
      }

      let characterTool: any = undefined;
      if (args.characterPose || args.lookTarget) {
        characterTool = {
          enabled: true,
          poseDescription: args.characterPose || "",
          lookTarget: typeof args.lookTarget === "object" ? args.lookTarget : null
        };
      }

      let promptToBuild = args.prompt;
      if (args.expression) {
        promptToBuild += ` with a ${args.expression} facial expression`;
      }
      if (typeof args.lookTarget === "string") {
        promptToBuild += `, looking ${args.lookTarget}`;
      }

      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.style);
      const built = buildIllustrationPrompt(
          promptToBuild, activeContext, effectiveStyle, bgConfig, [], undefined, undefined, mappedChibiProportion, chibiConfig, args.viewpoint, args.noCharacters, args.framing as any, characterTool
      );
      result = built.textPrompt;

      if (args.biologicalEraser) {
        result += `\n[STRICT NEGATIVE CONSTRAINT - BIOLOGICAL ERASER]: ZERO BIOLOGICAL MATTER. Erase the character completely. NO face, NO eyes, NO skin, NO hair, NO hands, NO neck. Render the equipment, armor, or clothing as a hollow void / ghost asset floating in 3D space.\n`;
      }

      if (args.seed !== undefined && args.seed !== null) {
        result += `\n[DETERMINISTIC SEED]: ${args.seed}\n`;
      }

      aspectRatio = args.aspectRatio || "1:1";
    }

    else if (name === "batch_studio_generate") {
      const subjects: string[] = args.subjects || [];
      const variations: string[] = args.variations || [];
      
      let bgMode: any = args.backgroundMode || "transparent";
      if (bgMode === "AI Decides" || bgMode === "scene") bgMode = "scene";
      const bgConfig: BackgroundConfig = { 
          mode: bgMode,
          color: args.backgroundColor 
      } as any;

      const outDir = path.join(process.cwd(), "outputs", "batch");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      let resultsLog = `BATCH GENERATION COMPLETE!\n\n`;

      for (const subject of subjects) {
          for (const variation of variations) {
              const isChibi = variation.toLowerCase() === "chibi";
              let mappedChibiProportion: any = undefined;
              let chibiConfig: any = undefined;
              
              if (isChibi) {
                  chibiConfig = { headSize: 2.0, bodyPlumpness: 1.5, limbStubbiness: 0.8, enableSparkles: false };
                  if (args.chibiRatio === "1:1") mappedChibiProportion = "micro_2h";
                  else if (args.chibiRatio === "1:4") mappedChibiProportion = "deformed_4h";
                  else mappedChibiProportion = "chibi_3h";
              }

              let framing: any = undefined;
              if (variation.toLowerCase() === "full-body" || variation.toLowerCase() === "full body") framing = "full-body";
              if (variation.toLowerCase() === "waist-up" || variation.toLowerCase() === "waist up") framing = "waist-up";

              const activeContext = getActiveGameContext();
              const effectiveStyle = resolveProjectArtStyle(args.style);
              const built = buildIllustrationPrompt(
                  subject, activeContext, effectiveStyle, bgConfig, [], undefined, undefined, mappedChibiProportion, chibiConfig, undefined, false, framing
              );
              
              const promptStr = built.textPrompt;
              const ratio = args.aspectRatio || "1:1";
              
              let width = 1024;
              let height = 1024;
              if (ratio === "16:9") { height = 576; }
              if (ratio === "9:16") { width = 576; }
              if (ratio === "3:4") { width = 768; height = 1024; }
              if (ratio === "4:3") { width = 1024; height = 768; }

              const encodedPrompt = encodeURIComponent(promptStr);
              const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&enhance=false`;

              const cleanSubject = subject.replace(/[^a-z0-9]/gi, '_').substring(0, 20);
              const fileName = `batch_${cleanSubject}_${variation}_${Date.now()}.jpg`;
              const filePath = path.join(outDir, fileName);

              try {
                  const response = await fetch(url);
                  const arrayBuffer = await response.arrayBuffer();
                  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
                  resultsLog += `[SUCCESS] ${subject} (${variation}) -> [link](file:///${filePath.replace(/\\/g, '/')})\n`;
              } catch (e: any) {
                  resultsLog += `[FAILED] ${subject} (${variation}) -> ${e.message}\n`;
              }
          }
      }

      return { content: [{ type: "text", text: resultsLog }] };
    } 
    else if (name === "mythic_status") {
      const status = await checkMythicStatus();
      const accountsList = status.accounts && status.accounts.length > 0
        ? status.accounts.map(a => `• Slot ${a.slot}: ${a.email || 'Google Account'}`).join('\n')
        : '• No accounts discovered yet in Chrome';
      const tabsList = status.tabs && status.tabs.length > 0
        ? status.tabs.map(t => `• Tab #${t.tabId} (${t.target}): ${t.title || t.url} [${t.email || 'Active'}]`).join('\n')
        : '• No active Gemini/ChatGPT tabs open in Chrome';

      const responseText = 
        `⚡ MYTHICFRAME ENGINE STATUS\n\n` +
        `Web Server: ${status.serverRunning ? `ONLINE (http://localhost:3488)` : `OFFLINE (use 'mythic_launch_server')`}\n` +
        `BEI Extension Bridge: ${status.bridgeRunning ? `ONLINE (Port ${status.bridgePort})` : `OFFLINE`}\n` +
        `BEI Extension Client: ${status.beiConnected ? `CONNECTED` : `NOT CONNECTED (open Chrome tab with extension)`}\n` +
        `Gemini API Key: ${status.hasGeminiApiKey ? `CONFIGURED` : `NOT CONFIGURED (optional with BEI)`}\n` +
        `Available Generation Engines: ${status.availableEngines.join(', ')}\n\n` +
        `Discovered Accounts:\n${accountsList}\n\n` +
        `Discovered Tabs:\n${tabsList}\n\n` +
        `Summary: ${status.summary}`;

      return { content: [{ type: "text", text: responseText }] };
    }
    else if (name === "mythic_launch_server") {
      const res = await launchMythicServer();
      return { content: [{ type: "text", text: res.message }] };
    }
    else if (name === "mythic_open_tab") {
      const target = args.target || 'gemini';
      const slot = args.accountSlot ?? 0;
      const res = await openBEITab(target, slot);
      return { content: [{ type: "text", text: res.message }] };
    }
    else if (name === "mythic_scan_accounts") {
      const res = await scanBEIAccounts();
      return { content: [{ type: "text", text: res.message }] };
    }
    else if (name === "mythic_set_active_tab") {
      const target = args.target || 'gemini';
      const slot = args.accountSlot ?? 0;
      const res = await setActiveBEITab(target, slot);
      return { content: [{ type: "text", text: res.message }] };
    }
    else if (name === "mythic_fetch_library_assets") {
      const target = args.target || 'gemini';
      const slot = args.accountSlot ?? 0;
      const limit = args.limit ?? 5;
      const res = await fetchBEILibraryAssets(target, slot, Math.max(limit, 10));
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to fetch library assets: ${res.message}` }], isError: true };
      }

      let assets = res.assets || [];
      if (args.searchQuery) {
        const q = String(args.searchQuery).toLowerCase();
        assets = assets.filter((a: any) => (a.alt || '').toLowerCase().includes(q) || (a.src || '').toLowerCase().includes(q));
      }
      assets = assets.slice(0, limit);

      if (assets.length === 0) {
        return { content: [{ type: "text", text: `No matching image assets found in Google Gemini Library (Slot ${slot}${args.searchQuery ? `, query: "${args.searchQuery}"` : ''}).` }] };
      }

      let downloadSection = '';
      if (args.downloadLatest && assets.length > 0) {
        const topAsset = assets[0];
        const topUrl = topAsset.highResUrl || topAsset.src;
        const saved = await saveLibraryAssetToFile(topUrl, 'library_export');
        if (saved) {
          const formattedPath = saved.filePath.replace(/\\/g, '/');
          const fileName = path.basename(saved.filePath);
          downloadSection = `DOWNLOADED TO DISK:\n- Local file: ${saved.filePath} (${saved.sizeMB})\n- Markdown link: [${fileName}](file:///${formattedPath})\n\n`;
        }
      }

      let text = `Found ${assets.length} assets in Google Gemini Library (Slot ${slot}):\n\n${downloadSection}`;
      assets.forEach((a: any, idx: number) => {
        text += `${idx + 1}. High-Res URL: ${a.highResUrl || a.src}\n   Alt: ${a.alt || 'Generated image'}\n\n`;
      });
      return { content: [{ type: "text", text }] };
    }
    else if (name === "mythic_bei_generate") {
      let promptToSend = args.prompt;
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.style);
      const wantTransparent = Boolean(args.transparentBackground || args.cleanBackground);
      const effectiveBgConfig: BackgroundConfig = wantTransparent 
        ? { mode: 'transparent', color: '#FFFFFF', allowTransparency: true } as any 
        : defaultBgConfig;

      if (!args.prompt.includes("SUBJECT:")) {
        const built = buildIllustrationPrompt(args.prompt, activeContext, effectiveStyle, effectiveBgConfig, []);
        promptToSend = built.textPrompt;
      } else if (effectiveStyle && !args.prompt.includes("STYLE:")) {
        promptToSend += `\nSTYLE: ${effectiveStyle.replace(/^,\s*/, '')}\n`;
      }
      if (wantTransparent && !promptToSend.includes("[MANDATORY ISOLATION]")) {
        promptToSend += `\n[MANDATORY ISOLATION]: Render standalone character cleanly centered on an absolute flat white background (#FFFFFF) with high contrast for alpha cutout. No shadows, no gradients, no scenery.\n`;
      }
      const beiRes = await generateWithBEI({
        prompt: promptToSend,
        aspectRatio: args.aspectRatio || '1:1',
        target: args.target || 'gemini',
        accountSlot: args.accountSlot ?? 0,
        images: args.images || [],
        quality: args.quality || 'ultra_original',
        dispatchMode: args.dispatchMode || 'single',
        chatSessionMode: args.chatSessionMode || 'same_chat',
        timeoutSeconds: args.timeoutSeconds || 900
      });
      const formattedPath = beiRes.filePath.replace(/\\/g, '/');
      const fileName = path.basename(beiRes.filePath);
      let sizeMB = '';
      try {
        const stats = fs.statSync(beiRes.filePath);
        sizeMB = ` (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
      } catch (e) {}

      const recoveryNotice = beiRes.metadata?.recoveredFromLibrary
        ? `\n\nAUTOMATIC FAILOVER NOTICE: The browser chat DOM timed out or missed the image stream, but the generated artwork was AUTOMATICALLY RECOVERED from your Google Gemini Library!\n`
        : '';

      return {
        content: [{
          type: "text",
          text: `IMAGE GENERATED SUCCESSFULLY VIA BEI!${recoveryNotice}\nImage saved to: ${beiRes.filePath}${sizeMB}\nJob ID: ${beiRes.jobId}\nQuality: ${args.quality || 'ultra_original'}\nFile Size: ${sizeMB.trim() || 'Unknown'}\n${wantTransparent ? 'Background: Isolated on flat key for transparent cutout\n' : ''}\nPlease embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${formattedPath}) so they can easily open it!`
        }]
      };
    }
    else if (name === "mythic_smart_generate") {
      const engineChoice = args.engine || 'auto';
      let promptToSend = args.prompt;
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.style);
      const wantTransparent = Boolean(args.transparentBackground || args.cleanBackground);
      const effectiveBgConfig: BackgroundConfig = wantTransparent 
        ? { mode: 'transparent', color: '#FFFFFF', allowTransparency: true } as any 
        : defaultBgConfig;

      if (!args.prompt.includes("SUBJECT:")) {
        const built = buildIllustrationPrompt(args.prompt, activeContext, effectiveStyle, effectiveBgConfig, []);
        promptToSend = built.textPrompt;
      } else if (effectiveStyle && !args.prompt.includes("STYLE:")) {
        promptToSend += `\nSTYLE: ${effectiveStyle.replace(/^,\s*/, '')}\n`;
      }
      if (wantTransparent && !promptToSend.includes("[MANDATORY ISOLATION]")) {
        promptToSend += `\n[MANDATORY ISOLATION]: Render standalone character cleanly centered on an absolute flat white background (#FFFFFF) with high contrast for alpha cutout. No shadows, no gradients, no scenery.\n`;
      }

      if (engineChoice === 'prompt-only') {
        return { content: [{ type: "text", text: formatTextInstruction(promptToSend) }] };
      }

      if (engineChoice === 'bei') {
        const beiRes = await generateWithBEI({
          prompt: promptToSend,
          aspectRatio: args.aspectRatio || '1:1',
          target: args.target || 'gemini',
          accountSlot: args.accountSlot ?? 0,
          quality: args.quality || 'ultra_original',
          dispatchMode: args.dispatchMode || 'single',
          images: args.images || []
        });
        const formattedPath = beiRes.filePath.replace(/\\/g, '/');
        const fileName = path.basename(beiRes.filePath);
        let sizeMB = '';
        try {
          const stats = fs.statSync(beiRes.filePath);
          sizeMB = ` (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
        } catch (e) {}
        return {
          content: [{
            type: "text",
            text: `IMAGE GENERATED SUCCESSFULLY VIA BEI!\n\nImage saved to: ${beiRes.filePath}${sizeMB}\nQuality: ${args.quality || 'ultra_original'}\nFile Size: ${sizeMB.trim() || 'Unknown'}\nDispatch Mode: ${args.dispatchMode || 'single'}\n\nPlease embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${formattedPath}) so they can easily open it!`
          }]
        };
      }

      if (engineChoice === 'gemini-api') {
        const resText = await executeImageGeneration(promptToSend, args.aspectRatio || '1:1', 'mythic_smart', args.geminiApiKey);
        return { content: [{ type: "text", text: resText }] };
      }

      // Auto routing: probe status
      const status = await checkMythicStatus();
      if (status.beiConnected && status.tabs.some(t => t.target === 'gemini' || t.target === 'chatgpt')) {
        const beiRes = await generateWithBEI({
          prompt: promptToSend,
          aspectRatio: args.aspectRatio || '1:1',
          target: args.target || 'gemini',
          accountSlot: args.accountSlot ?? 0,
          quality: args.quality || 'ultra_original',
          dispatchMode: args.dispatchMode || 'single',
          images: args.images || []
        });
        const formattedPath = beiRes.filePath.replace(/\\/g, '/');
        const fileName = path.basename(beiRes.filePath);
        let sizeMB = '';
        try {
          const stats = fs.statSync(beiRes.filePath);
          sizeMB = ` (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
        } catch (e) {}
        return {
          content: [{
            type: "text",
            text: `IMAGE GENERATED SUCCESSFULLY VIA BEI!\n\nImage saved to: ${beiRes.filePath}${sizeMB}\nQuality: ${args.quality || 'ultra_original'}\nFile Size: ${sizeMB.trim() || 'Unknown'}\nDispatch Mode: ${args.dispatchMode || 'single'}\n\nPlease embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${formattedPath}) so they can easily open it!`
          }]
        };
      }

      if (args.geminiApiKey || status.hasGeminiApiKey) {
        const resText = await executeImageGeneration(promptToSend, args.aspectRatio || '1:1', 'mythic_smart', args.geminiApiKey);
        return { content: [{ type: "text", text: resText }] };
      }

      // Neither engine ready: return structured diagnostic message
      return {
        content: [{
          type: "text",
          text: `CANNOT GENERATE: NO ENGINE READY\n\n` +
                `Status summary:\n${status.summary}\n\n` +
                `Options to proceed:\n` +
                `1. Zero-Key BEI Route: Run 'mythic_launch_server', then open Chrome and log in at gemini.google.com.\n` +
                `2. Gemini API Route: Provide 'geminiApiKey' or set it in .env.local.\n` +
                `3. Prompt-only: Pass engine: 'prompt-only' to view the optimized generation prompt.`
        }],
        isError: true
      };
    }
    else if (name === "launch_web_ui") {
      const res = await launchMythicServer();
      return { content: [{ type: "text", text: res.message }] };
    }
    else if (name === "mythic_get_settings") {
      const settings = await getMythicSettings();
      let text = `⚡ MYTHICFRAME ACTIVE SETTINGS & CONFIGURATION\n\n`;
      text += `• Bridge Status: ${settings.connected ? 'CONNECTED' : 'DISCONNECTED'} (Port ${settings.bridgePort})\n`;
      text += `• Studio Web UI: http://localhost:${settings.webPort}\n`;
      text += `• Extension Version: v${settings.extensionVersion}\n`;
      text += `• Active Jobs Count: ${settings.activeJobsCount}\n\n`;
      text += `Connected Accounts (${settings.accounts?.length || 0}):\n`;
      (settings.accounts || []).forEach((acc: any) => {
        text += `  - Slot ${acc.slot}: ${acc.email} (${acc.tier || 'pro'})\n`;
      });
      text += `\nConnected Browser Tabs (${settings.tabs?.length || 0}):\n`;
      (settings.tabs || []).forEach((tab: any) => {
        text += `  - [${tab.target}] Tab #${tab.tabId} (Slot ${tab.accountSlot ?? 0}) - ${tab.email || 'pending'}\n`;
      });
      return { content: [{ type: "text", text }] };
    }
    else if (name === "prepare_ui_reimagine_prompt") {
      result = buildUIReimaginePrompt(args.prompt, defaultGameContext, args.styleSnippet || "", true, args.uiMood, undefined, undefined, args.uiArchetype, args.uiMaterial, false);
      aspectRatio = args.aspectRatio || "16:9";
    }
    else if (name === "prepare_clothes_prompt") {
      const clothesParams = {
        renderMode: args.renderMode === "asset" ? "asset" : "model",
        layout: args.layout === "spread" ? "spread" : "assembled",
        lockPose: args.lockPose ?? true,
        framing: args.framing || "full-body"
      } as any;
      const activeContext = getActiveGameContext();
      const built = buildClothesPrompt(args.prompt, activeContext, args.styleSnippet || "", defaultBgConfig, [], undefined, clothesParams);
      result = built.textPrompt;
    }
    else if (name === "mythic_list_art_styles") {
      let styles = [...ART_STYLES];
      const projectFile = path.join(process.cwd(), "mythic_project.json");
      if (fs.existsSync(projectFile)) {
        try {
          const proj = JSON.parse(fs.readFileSync(projectFile, "utf8"));
          if (Array.isArray(proj.customStyles)) {
            styles = [...styles, ...proj.customStyles];
          }
        } catch (e) {}
      }
      if (args.category) {
        styles = styles.filter(s => s.category?.toLowerCase() === args.category.toLowerCase());
      }
      if (args.query) {
        const q = String(args.query).toLowerCase().trim();
        styles = styles.filter(s => 
          s.id.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q) ||
          (s.promptSnippet || '').toLowerCase().includes(q) ||
          (s.category || '').toLowerCase().includes(q)
        );
      }
      let output = `MYTHICFRAME ART STYLE LIBRARY (${styles.length} styles available${args.query ? `, matching "${args.query}"` : ''}):\n\n`;
      styles.forEach(s => {
        output += `• ID: '${s.id}' - ${s.name} [${s.category || 'General'}]\n  Description: ${s.description}\n  Snippet: "${s.promptSnippet}"\n\n`;
      });
      return { content: [{ type: "text", text: output }] };
    }
    else if (name === "mythic_apply_art_style") {
      const projectFile = path.join(process.cwd(), "mythic_project.json");
      let projectData: any = {};
      if (fs.existsSync(projectFile)) {
        try { projectData = JSON.parse(fs.readFileSync(projectFile, "utf8")); } catch (e) {}
      }
      let targetStyle = ART_STYLES.find(s => s.id === args.styleId);
      if (!targetStyle && args.styleId) {
        const needle = args.styleId.toLowerCase().replace(/\s+(art\s+)?style$/, '').trim();
        targetStyle = ART_STYLES.find(s => 
          s.id.toLowerCase() === needle || 
          s.name.toLowerCase() === needle || 
          s.id.toLowerCase().includes(needle) || 
          s.name.toLowerCase().includes(needle)
        );
      }
      if (!targetStyle && Array.isArray(projectData.customStyles)) {
        const needle = (args.styleId || "").toLowerCase().replace(/\s+(art\s+)?style$/, '').trim();
        targetStyle = projectData.customStyles.find((s: any) => 
          s.id === args.styleId || 
          s.id.toLowerCase() === needle || 
          s.name.toLowerCase() === needle ||
          s.name.toLowerCase().includes(needle)
        );
      }
      if (!targetStyle && !args.customPromptSnippet) {
        return {
          content: [{ type: "text", text: `Style '${args.styleId}' not found in library. Use 'mythic_list_art_styles' to see valid styles.` }],
          isError: true
        };
      }
      const styleName = targetStyle ? targetStyle.name : args.styleId;
      const snippet = args.customPromptSnippet || (targetStyle ? targetStyle.promptSnippet : "");
      projectData.activeArtStyle = {
        id: args.styleId,
        name: styleName,
        promptSnippet: snippet
      };
      fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), "utf8");
      return {
        content: [{ type: "text", text: `Active art style set to '${styleName}' (ID: ${args.styleId}). All subsequent generations will incorporate this style anchor.` }]
      };
    }
    else if (name === "mythic_create_art_style") {
      const projectFile = path.join(process.cwd(), "mythic_project.json");
      let projectData: any = {};
      if (fs.existsSync(projectFile)) {
        try { projectData = JSON.parse(fs.readFileSync(projectFile, "utf8")); } catch (e) {}
      }
      if (!Array.isArray(projectData.customStyles)) {
        projectData.customStyles = [];
      }
      const newStyle = {
        id: args.id,
        name: args.name,
        promptSnippet: args.promptSnippet,
        description: args.description || "",
        category: args.category || "Custom"
      };
      projectData.customStyles = projectData.customStyles.filter((s: any) => s.id !== args.id);
      projectData.customStyles.push(newStyle);
      fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), "utf8");
      return {
        content: [{ type: "text", text: `Custom art style '${args.name}' (ID: ${args.id}) created and saved to project! You can now activate it using 'mythic_apply_art_style'.` }]
      };
    }
    else if (name === "prepare_map_grid_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      const mapConfig: MapGridConfig = {
          enabled: true, viewMode: args.viewMode || 'isometric', preset: 'custom',
          gridWidth: 10, gridHeight: 10, cellSize: 64, primaryColor: args.primaryColor || '#4CAF50',
          accentColor: '#388E3C', shadowIntensity: 50, lightDirection: 'top-left', detailDensity: 'medium', decorationLevel: 'medium', transparentBackground: true
      } as any;
      result = buildMapGridPrompt(args.prompt, activeContext, effectiveStyle, mapConfig);
      aspectRatio = "16:9";
    }
    else if (name === "prepare_pose_studio_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      const mockPose: PoseData = { joints: [{ name: "head", x: 50, y: 20 }, { name: "chest", x: 50, y: 40 }] } as any;
      const built = buildPoseStudioPrompt(args.prompt, activeContext, effectiveStyle, defaultBgConfig, [], mockPose);
      result = built.textPrompt;
    }
    else if (name === "prepare_sprite_sheet_prompts") {
      const activeContext = getActiveGameContext();
      result = buildSpriteSheetPromptsPrompt(args.prompt, args.frameCount, activeContext);
      isImageGen = false;
    }
    else if (name === "prepare_frame_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      result = buildFramePrompt(args.prompt, activeContext, effectiveStyle, args.elements);
    }
    else if (name === "prepare_background_asset_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      result = buildBackgroundAssetPrompt(args.prompt, activeContext, effectiveStyle, args.patternType as any);
      aspectRatio = "16:9";
    }
    else if (name === "prepare_extract_clothes_prompt") {
      const activeContext = getActiveGameContext();
      const bg: BackgroundConfig = { mode: args.backgroundMode as any || "transparent" } as any;
      result = buildExtractClothesPrompt(activeContext, bg);
    }
    else if (name === "prepare_card_suggestions_prompt") {
      result = buildCardSuggestionsPrompt(args.artPrompt, args.currentName || "New Card");
      isImageGen = false;
    }
    else {
      throw new Error(`Tool not found: ${name}`);
    }

    if (isImageGen) {
        const resultText = await executeImageGeneration(result, aspectRatio, name, args.geminiApiKey);
        return { content: [{ type: "text", text: resultText }] };
    } else {
        return { content: [{ type: "text", text: formatTextInstruction(result) }] };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error processing prompt: ${error.message}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mythic Advanced MCP server running on stdio");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
