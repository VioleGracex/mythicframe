// Templates for generating prompts for various features
import {
  GameContext,
  BackgroundConfig,
  ReferenceAsset,
  FrameElement,
  BackgroundPatternType,
  SafeZoneConfig,
  ClothesParams,
  PixelStyle,
  ChibiProportion,
  ChibiConfig,
  PoseData,
  MapGridConfig,
  UIMode,
  SpriteStripConfig,
  CharacterToolState,
  CameraFraming,
  ArtStyle
} from "../types.js";
import { CHIBI_STYLE_CONFIG } from "../constants/gacha.js";
import { DEFAULT_BACKGROUND_CONFIG } from "../constants/backgrounds.js";
import { normalizeFramingId } from "../constants/framing.js";
import { ART_STYLES } from "../constants/artStyles.js";

/**
 * Resolves an art style identifier, partial name, project name, or raw prompt snippet
 * into a rich, high-fidelity prompt snippet for image generation models.
 */
export const resolveArtStyleSnippet = (
  styleInput?: string | null,
  activeArtStyle?: { id?: string; name?: string; promptSnippet?: string } | null,
  projectName?: string | null,
  customStyles?: ArtStyle[] | null
): string => {
  if (!styleInput || !styleInput.trim()) {
    return activeArtStyle?.promptSnippet || '';
  }

  const raw = styleInput.trim();
  const lower = raw.toLowerCase();

  // 1. Explicit aliases for "none" or "default"
  if (['none', 'no style', 'no_style'].includes(lower)) {
    return '';
  }
  if (['default', 'project', 'active', 'current', 'auto'].includes(lower)) {
    return activeArtStyle?.promptSnippet || '';
  }

  // 2. Project Name match (e.g. "Kingdoms Divided", "kingdoms divided art style", "kingdoms diveded")
  if (projectName) {
    const projLower = projectName.toLowerCase();
    if (lower === projLower || lower.includes(projLower) || projLower.includes(lower)) {
      if (activeArtStyle?.promptSnippet) {
        return activeArtStyle.promptSnippet;
      }
    }
  }

  // Also catch "kingdoms divided" explicitly
  if (lower.includes('kingdoms divided') || lower.includes('kingdoms diveded')) {
    const kdStyle = ART_STYLES.find(s => s.id === 'kingdoms_divided_char');
    if (kdStyle?.promptSnippet) return kdStyle.promptSnippet;
    if (activeArtStyle?.promptSnippet) return activeArtStyle.promptSnippet;
  }

  // 3. Search ART_STYLES catalog and customStyles
  const allStyles: ArtStyle[] = [...(customStyles || []), ...ART_STYLES];

  // Exact ID match
  const byId = allStyles.find(s => s.id.toLowerCase() === lower);
  if (byId) return byId.promptSnippet;

  // Exact Name match
  const byName = allStyles.find(s => s.name.toLowerCase() === lower);
  if (byName) return byName.promptSnippet;

  // Substring match on ID or Name (strip trailing "art style" / "style")
  const normalizedSearch = lower.replace(/\s+(art\s+)?style$/, '').trim();
  const bySub = allStyles.find(s => 
    s.id.toLowerCase() === normalizedSearch ||
    s.name.toLowerCase() === normalizedSearch ||
    s.id.toLowerCase().includes(normalizedSearch) || 
    s.name.toLowerCase().includes(normalizedSearch) ||
    normalizedSearch.includes(s.id.toLowerCase()) ||
    normalizedSearch.includes(s.name.toLowerCase())
  );
  if (bySub) return bySub.promptSnippet;

  // 4. If it's already a full descriptive snippet (has commas or multiple visual words), use it directly
  if (raw.includes(',') || raw.split(/\s+/).length > 3) {
    return raw.startsWith(',') ? raw : `, ${raw}`;
  }

  // 5. Fallback: If style looks like a raw single word or short phrase, check if activeArtStyle exists
  if (activeArtStyle?.promptSnippet && !activeArtStyle.promptSnippet.toLowerCase().includes(lower)) {
    return `${activeArtStyle.promptSnippet}, ${raw}`;
  }
  return raw.startsWith(',') ? raw : `, ${raw}`;
};


/**
 * Returns the exact framing prompt override for any of the 13 shot-distance presets
 */
export const getShotDistanceFramingDirective = (framing: CameraFraming | string): string => {
  const norm = normalizeFramingId(framing);
  switch (norm) {
    case 'extreme_close_up':
      return `\n[CRITICAL OVERRIDE - FRAMING]: EXTREME CLOSE-UP (ECU). Extreme close-up shot: Focus intensely on a tiny facial detail, such as an eye, lips, or another specific feature. The detail fills the entire frame. No full face or body visible. This framing directive supersedes all others.\n`;
    case 'big_close_up':
      return `\n[CRITICAL OVERRIDE - FRAMING]: BIG CLOSE-UP (BCU). Big close-up shot: Crop tightly to the character's entire face, from forehead to chin, with very little surrounding space. The face completely dominates the frame. No shoulders or torso visible. This framing directive supersedes all others.\n`;
    case 'close_up':
      return `\n[CRITICAL OVERRIDE - FRAMING]: CLOSE-UP (CU). Close-up portrait: Character's head and face dominate the image; shoulders may be partially visible. Top of hair may touch the top frame edge. No lower torso or legs. This framing directive supersedes all others.\n`;
    case 'medium_close_up':
      return `\n[CRITICAL OVERRIDE - FRAMING]: MEDIUM CLOSE-UP (MCU). Medium close-up portrait: Head and shoulders shot, typically cropped around the upper chest. Focus is on facial expressions and shoulder attire. This framing directive supersedes all others.\n`;
    case 'bust_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: BUST SHOT (BUST). Bust shot: Head, shoulders, and upper torso, usually ending around the chest. Arms cropped at mid-bicep. Lower torso, waist, and legs must NOT be visible. This framing directive supersedes all others.\n`;
    case 'medium_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: MEDIUM SHOT (MS). Medium shot / Waist-up portrait: Crop strictly from head to waist. Hands and waist-level props can be visible. Legs, knees, and feet must NOT be visible under any circumstance. Upper body fills 60-80% of the vertical frame. This framing directive supersedes all others.\n`;
    case 'medium_long_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: MEDIUM-LONG SHOT (MLS). Medium-long shot: Crop from head to mid-thigh. Shows more clothing, posture, and body language while retaining facial clarity. Knees and feet are cropped out. This framing directive supersedes all others.\n`;
    case 'three_quarter_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: THREE-QUARTER SHOT (3/4). Three-quarter shot: Crop from head to knees or lower legs. Shows almost the full body including posture and weapons, with feet cropped off. This framing directive supersedes all others.\n`;
    case 'american_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: AMERICAN SHOT (AS). American shot (Cowboy shot): Crop from head to mid-thigh, traditionally composed to clearly feature holstered weapons, belts, and confident posture. This framing directive supersedes all others.\n`;
    case 'full_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: FULL SHOT (FS). Full shot / Head-to-toe: The entire character from the top of the head to the bottom of the feet MUST be fully visible, filling most of the vertical frame. Do NOT cut off feet or head. This framing directive supersedes all others.\n`;
    case 'long_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: LONG SHOT (LS). Long shot: The entire character appears smaller in the frame with generous surrounding space and visible environment around them. Full body visible from head to toe. This framing directive supersedes all others.\n`;
    case 'extreme_long_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: EXTREME LONG SHOT (ELS). Extreme long shot: Character occupies a small part of the image; the vast surrounding environment dominates the composition. Character is small but recognizable. This framing directive supersedes all others.\n`;
    case 'very_wide_shot':
      return `\n[CRITICAL OVERRIDE - FRAMING]: VERY WIDE SHOT (VWS). Very wide shot: Character is shown at a distance within a broad, expansive setting; used for establishing vast scale and environmental grandeur. This framing directive supersedes all others.\n`;
    default:
      return `\n[CRITICAL OVERRIDE - FRAMING]: FULL SHOT (FS). You MUST show the entire character from head to toe. This instruction supersedes any other framing instructions.\n`;
  }
};

/**
 * Helper to detect explicit camera framing keywords directly from the prompt text
 */
export const detectPromptFraming = (prompt: string): CameraFraming | null => {
  if (!prompt) return null;
  const p = prompt.toLowerCase();
  if (/(extreme close[\s-]?up|\becu\b|macro face|eye close[\s-]?up|lips close[\s-]?up)/i.test(p)) {
    return 'extreme_close_up';
  }
  if (/(big close[\s-]?up|\bbcu\b|full face close[\s-]?up)/i.test(p)) {
    return 'big_close_up';
  }
  if (/(medium close[\s-]?up|\bmcu\b)/i.test(p)) {
    return 'medium_close_up';
  }
  if (/(close[\s-]?up|\bcu\b|headshot|head[\s-]?shot|portrait|profile pic|profile picture|avatar|face\b)/i.test(p)) {
    return 'close_up';
  }
  if (/(bust[\s-]?shot|\bbust\b|chest[\s-]?up|upper torso)/i.test(p)) {
    return 'bust_shot';
  }
  if (/(medium[\s-]?long[\s-]?shot|\bmls\b|mid[\s-]?thigh shot)/i.test(p)) {
    return 'medium_long_shot';
  }
  if (/(three[\s-]?quarter[\s-]?shot|\b3\/4\b|knee[\s-]?up)/i.test(p)) {
    return 'three_quarter_shot';
  }
  if (/(american[\s-]?shot|\bas\b|cowboy[\s-]?shot)/i.test(p)) {
    return 'american_shot';
  }
  if (/(waist[\s-]?up|medium shot|\bms\b|half[\s-]?body)/i.test(p)) {
    return 'medium_shot';
  }
  if (/(extreme long[\s-]?shot|\bels\b)/i.test(p)) {
    return 'extreme_long_shot';
  }
  if (/(very wide[\s-]?shot|\bvws\b|establishing scale)/i.test(p)) {
    return 'very_wide_shot';
  }
  if (/(long[\s-]?shot|\bls\b|wide shot)/i.test(p)) {
    return 'long_shot';
  }
  if (/(full[\s-]?body|full[\s-]?shot|\bfs\b|head to toe|entire character)/i.test(p)) {
    return 'full_shot';
  }
  return null;
};

/**
 * Helper to detect if a prompt is likely describing a character
 */
const isCharacterPrompt = (prompt: string): boolean => {
  const characterKeywords = [
    'character', 'person', 'man', 'woman', 'girl', 'boy', 'knight', 'mage', 'warrior', 
    'hero', 'villain', 'creature', 'monster', 'human', 'elf', 'dwarf', 'orc', 'goblin',
    'portrait', 'full body', 'standing', 'pose', 'outfit', 'clothing', 'face', 'eyes',
    'hair', 'skin', 'body type', 'anatomy', 'npc', 'player', 'avatar', 'soldier',
    'paladin', 'rogue', 'thief', 'assassin', 'priest', 'cleric', 'druid', 'monk', 'bard',
    'warlock', 'sorcerer', 'necromancer', 'demon', 'angel', 'god', 'goddess', 'king', 'queen',
    'prince', 'princess', 'lord', 'lady', 'villager', 'merchant', 'blacksmith', 'guard'
  ];
  const p = prompt.toLowerCase();
  return characterKeywords.some(word => p.includes(word));
};

/**
 * Helper to detect if a prompt is likely describing a map or environment
 */
const isMapPrompt = (prompt: string): boolean => {
  const mapKeywords = [
    'map', 'isometric', '3d map', 'environment', 'landscape', 'terrain', 'forest', 'dungeon',
    'castle', 'city', 'town', 'village', 'room', 'interior', 'exterior', 'world map', 'region',
    'building', 'structure', 'architecture'
  ];
  const p = prompt.toLowerCase();
  return mapKeywords.some(word => p.includes(word));
};

/**
 * Helper to detect if a prompt is likely describing a magic circle or symbol
 */
const isMagicCirclePrompt = (prompt: string): boolean => {
  const magicKeywords = [
    'magic circle', 'rune', 'sigil', 'pentagram', 'glyph', 'spell circle', 'summoning circle',
    'arcane circle', 'enchantment circle', 'symbol', 'icon', 'logo', 'crest', 'emblem'
  ];
  const p = prompt.toLowerCase();
  return magicKeywords.some(word => p.includes(word));
};

/**
 * Build prompt for UI Reimagine feature
 */
export const buildUIReimaginePrompt = (
  userPrompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  changeBg: boolean,
  uiMood?: string,
  uiElements?: string[],
  uiColors?: { primary: string, secondary: string },
  uiArchetype?: string,
  uiMaterial?: string,
  lockPositions: boolean = false
): string => {
  let fullPrompt = `UI DESIGN & HUD OVERHAUL TASK.\n`;
  fullPrompt += `OBJECTIVE: Create a professional, clear, and functional game interface layer.\n`;
  
  if (uiArchetype) {
    fullPrompt += `INTERFACE ARCHETYPE: Use a ${uiArchetype.replace('-', ' ')} structural framework.\n`;
  }

  if (uiMaterial) {
    fullPrompt += `SURFACE MATERIAL: Apply a ${uiMaterial.replace('-', ' ')} finish to all HUD elements.\n`;
  }

  if (uiMood) {
    fullPrompt += `INTERFACE STYLE/MOOD: ${uiMood}\n`;
  }
  
  if (uiColors) {
    fullPrompt += `COLOR THEME: Use Primary ${uiColors.primary} for accent/highlight and Secondary ${uiColors.secondary} for base elements. Ensure high contrast and legibility.\n`;
  }

  if (uiElements && uiElements.length > 0) {
    fullPrompt += `COMPONENTS TO PRIORITIZE: ${uiElements.join(', ')}.\n`;
  }

  fullPrompt += `CORE THEME: ${userPrompt || 'Professional game interface'}\n`;
  
  if (gameContext.setting || gameContext.tone) {
    fullPrompt += `NARRATIVE CONTEXT: ${gameContext.setting}. ${gameContext.tone}.\n`;
  }
  
  if (styleSnippet) {
    fullPrompt += `RENDER STYLE: ${styleSnippet}\n`;
  }

  if (lockPositions) {
    fullPrompt += `\n[STRICT LAYOUT LOCK]: RETAIN THE EXACT SPATIAL COORDINATES AND LAYOUT STRUCTURE of all existing UI components. Do NOT reposition buttons, health bars, or maps. Only reimagine their visual style and material.\n`;
  }

  if (!changeBg) {
    fullPrompt += `\n[STRICT CONSTRAINT]: PRESERVE ORIGINAL ART. Do NOT modify characters or the background environment. ONLY overlay the UI elements.\n`;
  } else {
    fullPrompt += `\n[PERMISSION]: REIMAGINE FULL SCENE. Adjust background art to seamlessly integrate with the new UI theme.\n`;
  }

  fullPrompt += `\nTECHNICAL QUALITY SPECS:\n`;
  fullPrompt += `- NO GLOW/BLOOM ARTIFACTS: UI elements must be crisp and sharp.\n`;
  fullPrompt += `- LEGIBILITY: HUD components must contrast strongly with the art behind them.\n`;
  fullPrompt += `- CONSISTENCY: Ensure all elements share the same material and lighting source.`;
  
  return fullPrompt;
};

const processReferenceNotes = (referenceAssets: ReferenceAsset[]) => {
  const referenceParts: { text?: string }[] = [];
  referenceAssets.forEach((asset, index) => {
    let guidance = (asset.roleNote || '').trim();
    if (!guidance) {
      guidance = `PRIMARY CHARACTER/SUBJECT ANCHOR. Faithfully preserve the facial features, hairstyle, skin tone, clothing, and distinguishing aesthetic characteristics from Reference ${index + 1}.`;
    } else if (guidance.toLowerCase().includes('mannequin') || guidance.toLowerCase().includes('pose')) {
      guidance = `CRITICAL IDENTITY & POSE LOCK. Strictly replicate the facial structure, eye shape, body proportions, posture, and skin color from Reference ${index + 1}. Treat this reference as an immutable wireframe skeleton.`;
    } else if (guidance.toLowerCase().includes('style') || guidance.toLowerCase().includes('aesthetic')) {
      guidance = `STRICT AESTHETIC & STYLE SYNC. Match the exact rendering technique, line weight, color palette, lighting, and shading style from Reference ${index + 1}.`;
    } else if (guidance.toLowerCase().includes('look') || guidance.toLowerCase().includes('appearance') || guidance.toLowerCase().includes('clothes') || guidance.toLowerCase().includes('anchor') || guidance.toLowerCase().includes('identity')) {
      guidance = `IDENTITY & COSTUME ANCHOR. Use Reference ${index + 1} for character appearance, face, clothing, and features. Render the subject in the pose and composition described in the main prompt.`;
    }
    referenceParts.push({
      text: `Reference Image ${index + 1} Directives: ${guidance}`,
    });
  });
  return referenceParts;
};

/**
 * Build prompt for Clothes Designer feature
 */
export const buildClothesPrompt = (
  prompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  bgConfig: BackgroundConfig,
  referenceAssets: ReferenceAsset[],
  safeZone?: SafeZoneConfig,
  clothesParams?: ClothesParams
): { textPrompt: string; referenceParts: { text?: string }[] } => {
  let fullPrompt = `CLOTHES DESIGN & ASSET SYNTHESIS.\n`;
  
  if (clothesParams?.renderMode === 'asset') {
    fullPrompt += `[STRICT NEGATIVE CONSTRAINT - MANDATORY]: ZERO BIOLOGICAL MATTER. Erase the character. NO face, NO eyes, NO skin, NO hair, NO hands, NO neck. The image MUST ONLY contain the clothing items.\n`;
    fullPrompt += `OBJECTIVE: Render a HOLLOW GHOST OUTFIT as a 3D garment asset. The clothes must appear as if worn by an invisible void.\n`;
  } else {
    fullPrompt += `OBJECTIVE: Render high-quality game assets.\n`;
    fullPrompt += `[VISUAL INTEGRITY]: PRESERVE ALL CHARACTER FEATURES. Maintain skin color, facial structure, and hair identity exactly as seen in references.\n`;
  }
  
  fullPrompt += `[STRICT STYLE RULE]: Adhere strictly to the illustrative/game-art style provided.\n`;
  fullPrompt += `[STRICT NEGATIVE CONSTRAINT]: NO TEXT. NO labels. NO watermarks. NO signatures. NO UI elements. NO speech bubbles.\n`;
  fullPrompt += `SUBJECT: ${prompt}\n`;

  if (prompt.toLowerCase().includes('undead') || prompt.toLowerCase().includes('skeleton') || prompt.toLowerCase().includes('skull')) {
    fullPrompt += `\n[CRITICAL UNDEAD ANATOMY]: If the character is undead or skeletal, you MUST keep the skull structurally sound with the LOWER JAW INTACT AND ATTACHED. Do not render missing lower jaws. Ensure the head is PROPORTIONATE to the body width, do not make the head excessively large.\n`;
  }
  
  if (clothesParams) {
    fullPrompt += `LAYOUT: ${clothesParams.layout === 'spread' ? 'Multi-view orthographic fashion sheet (Front/Back/Detail).' : 'Single, centered view.'}\n`;
    
    if (clothesParams.lockPose) {
      fullPrompt += `\n[STRICT POSE LOCK]: You MUST PRESERVE the exact body posture and stance shown in the main character reference. Do NOT alter the orientation.\n`;
    }

    if (clothesParams.framing) {
      fullPrompt += getShotDistanceFramingDirective(clothesParams.framing);
    }
  }

  if (gameContext.setting || gameContext.tone) {
    fullPrompt += `WORLD CONTEXT: ${gameContext.setting}. ${gameContext.tone}.\n`;
  }

  if (styleSnippet) {
    fullPrompt += `[STYLE SNIPPET]: ${styleSnippet}\n`;
  }

  if (bgConfig.mode === "transparent" || bgConfig.mode === "transparent_neo") {
    const key = bgConfig.mode === "transparent" ? "#FFFFFF" : (bgConfig.keyColor || "#FFFFFF");
    const colorName = key === "#000000" ? "BLACK" : key === "#FFFFFF" ? "WHITE" : key === "#00FF00" ? "GREEN" : "MAGENTA";
    fullPrompt += `\n[STRICT OVERRIDE - BACKGROUND]:\n`;
    fullPrompt += `- IGNORE all environment descriptions.\n`;
    fullPrompt += `- Render the subject on a SOLID ${colorName} (${key}) background.\n`;
    fullPrompt += `- The background MUST be perfectly flat with NO texture, NO shadows, and NO lighting gradients.\n`;
  } else if (bgConfig.mode === "solid") {
    fullPrompt += `\n[MANDATORY]: Render on a FLAT SOLID ${bgConfig.color} background.\n`;
  } else if (bgConfig.mode === "prompt_only") {
    fullPrompt += `\nBACKGROUND: ${bgConfig.promptFragment}\n`;
  } else if (bgConfig.mode === "none") {
    fullPrompt += `\nBACKGROUND: Entirely empty, minimalist, or pure white background with NO environmental detail.\n`;
  } else if (bgConfig.mode === "scene") {
    fullPrompt += `\nBACKGROUND: ${bgConfig.promptFragment || 'Detailed environmental scene'}.\n`;
  } else {
    fullPrompt += `\nBACKGROUND: Balanced environmental complexity.\n`;
  }

  if (safeZone?.enabled) {
    fullPrompt += `\nCOMPOSITION: Center the subject within the inner ${Math.round(safeZone.width)}% safe zone.\n`;
  }

  const referenceParts = processReferenceNotes(referenceAssets);

  return { textPrompt: fullPrompt, referenceParts };
};

const buildChibiFragment = (config: ChibiConfig): string => {
  if (!config.enabled) return "";
  
  let fragment = "[STRICT CHIBI AESTHETIC - SUPER DEFORMED STYLE]\n";
  fragment += "CRITICAL INSTRUCTION: Chibi (super-deformed style) is NOT just a big head on a standard body.\n";
  fragment += "It is a COMPLETE proportional and stylistic transformation of the whole character.\n";
  fragment += "DO NOT make the same body as the reference body with a big head. That is a failure.\n\n";
  
  // 1. Proportions
  fragment += "1. PROPORTIONS (Most Important):\n";
  if (config.bodyRatio) {
    const ratioParts = config.bodyRatio.split(':');
    const ratioVal = ratioParts.length === 2 ? parseFloat(ratioParts[1]) : 2;
    fragment += `- Head-to-body ratio is exactly 1:${ratioVal}. Head is exactly ${Math.round(100 / ratioVal)}% of total height.\n`;
  } else if (config.presetProportion && CHIBI_STYLE_CONFIG[config.presetProportion]) {
    fragment += `- ${CHIBI_STYLE_CONFIG[config.presetProportion].suffix}\n`;
  } else {
    fragment += "- Head-to-body ratio: 1:2 to 1:4 max. Head is 50% or more of total height.\n";
  }
  fragment += "- Entire body MUST BE scaled down and simplified to match the head.\n";
  fragment += "- Limbs are short and stubby, NOT realistic length.\n";

  // 2. Body Structure
  fragment += "\n2. BODY STRUCTURE:\n";
  fragment += "- Torso: very short, almost compressed.\n";
  if (config.bodyStyle === 'geometric') {
    fragment += "- Arms/legs: geometric limb simplification, cylindrical arms/legs.\n";
  } else {
    fragment += "- Arms/legs: simplified, rounded (stubby proportions).\n";
  }
  fragment += "- Hands/feet: small, minimal detail. Chunky.\n";
  fragment += "- NO realistic anatomy or muscle structure whatsoever. Reject adult body proportions entirely.\n";

  // 3. Detail Level
  fragment += "\n3. DETAIL LEVEL:\n";
  if (config.focus === 'kawaii') {
    fragment += "- Kawaii aesthetic focus, extremely cute, flat colors, bold expressive features.\n";
  } else {
    fragment += "- Semi-realistic detailed chibi, professional texturing and shading, but still structurally super-deformed.\n";
  }
  fragment += "- Clothing and armor MUST be simplified.\n";
  fragment += "- Remove small intricate details; use clean shapes instead of realism.\n";

  // 4. Face Style
  fragment += "\n4. FACE STYLE:\n";
  if (config.headStyle === 'moe') {
    fragment += "- Ultra-cute Moe face (if visible), huge expressive sparkly eyes.\n";
  } else {
    fragment += "- Large eyes, simplified features.\n";
  }
  fragment += "- Minimal nose/mouth.\n";
  fragment += "- Expression is simplified and can be exaggerated.\n";
  fragment += "- Respect facial visibility: If the character wears a closed helmet or mask in references, keep it closed and do not add visible eyes or an open face.\n";

  // accessories & Secondary Features
  fragment += "\n[CRITICAL - ACCESSORIES & FEATURES]: You MUST preserve all secondary character features from references, including wings, tails, horns, capes, quivers, weapons, and specialized equipment. Do NOT simplify these away. Render them in a scale-appropriate way for the chibi body, but ensure they are clearly visible and detailed. If the reference has wings, the chibi MUST have wings.\n\n";

  // Mounts & Companions
  fragment += "[CRITICAL - MOUNTS & COMPANIONS]: If the character is riding a mount (e.g., horse, wolf, dragon) or has an animal companion, the MOUNT/COMPANION MUST ALSO BE RENDERED IN CHIBI STYLE to match the rider. The mount must have a large head, short stubby body and legs, and simplified features (standard anime chibi, not overly cute/moe). DO NOT render a chibi character on a realistically proportioned mount. Both must be fully super-deformed.\n\n";

  return fragment;
};

export const buildIllustrationPrompt = (
  basePrompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  bgConfig: BackgroundConfig,
  referenceAssets: ReferenceAsset[],
  safeZone?: SafeZoneConfig,
  continuityFlags?: Record<string, boolean>,
  chibiProportion?: ChibiProportion,
  chibiConfig?: ChibiConfig,
  viewpoint?: string,
  noCharacters?: boolean,
  framing?: CameraFraming,
  characterTool?: CharacterToolState
): { textPrompt: string; referenceParts: { text?: string }[] } => {
  let fullPrompt = "";

  if (gameContext.setting || gameContext.tone || gameContext.visualConstraints) {
    fullPrompt += `GAME CONTEXT:\n`;
    if (gameContext.setting) fullPrompt += `Setting: ${gameContext.setting}\n`;
    if (gameContext.tone) fullPrompt += `Tone: ${gameContext.tone}\n`;
    if (gameContext.visualConstraints) {
      fullPrompt += `Constraints: ${gameContext.visualConstraints}\n`;
    }
    fullPrompt += `(Ensure the result strictly fits this setting and tone.)\n\n`;
  }

  fullPrompt += `SUBJECT: ${basePrompt}\n`;
  
  const characterLikely = noCharacters ? false : isCharacterPrompt(basePrompt);
  const mapLikely = isMapPrompt(basePrompt);
  const magicCircleLikely = isMagicCirclePrompt(basePrompt);

  if (noCharacters) {
    fullPrompt += `[STRICT NEGATIVE CONSTRAINT]: NO CHARACTERS. NO PEOPLE. NO CREATURES. NO ANIMALS. NO HUMANOIDS. The image MUST strictly be an environment, prop, object, or scene without any living subjects.\n`;
  }

  if (viewpoint && viewpoint !== 'none') {
    fullPrompt += `VIEWPOINT: ${viewpoint.replace('-', ' ').toUpperCase()} perspective.\n`;
    if (viewpoint === 'top-down') fullPrompt += `- Camera is positioned directly above the subject looking straight down. Render as a 3D top-down perspective with visible depth and verticality.\n`;
    else if (viewpoint === 'high-angle') fullPrompt += `- Camera is positioned above the subject looking down at an angle.\n`;
    else if (viewpoint === 'low-angle') fullPrompt += `- Camera is positioned below the subject looking up, creating a sense of scale.\n`;
    else if (viewpoint === 'back') fullPrompt += `- Subject is seen from behind, facing away from the camera.\n`;
    else if (viewpoint === 'side') fullPrompt += `- Subject is seen from a side profile perspective.\n`;
    else if (viewpoint === 'three-quarter') fullPrompt += `- Subject is seen from a three-quarter angle.\n`;
    else if (viewpoint === 'isometric') fullPrompt += `- Subject is rendered in a 45-degree isometric perspective.\n`;
    else if (viewpoint === 'cinematic') fullPrompt += `- Use dramatic cinematic framing and wide-angle perspective.\n`;
  }

  const detectedFraming = detectPromptFraming(basePrompt);
  let effectiveFraming: CameraFraming | null = null;

  if (characterTool?.enabled) {
    effectiveFraming = framing || detectedFraming || 'full_shot';
  } else if (detectedFraming) {
    effectiveFraming = detectedFraming;
  } else if (framing && framing !== 'full_shot' && framing !== 'full-body') {
    effectiveFraming = framing;
  }

  if (characterTool?.enabled) {
    if (characterTool.poseDescription && characterTool.poseDescription.trim()) {
      fullPrompt += `\n[CHARACTER POSE & ACTION]: ${characterTool.poseDescription.trim()}\n`;
    }
    if (characterTool.lookTarget) {
      fullPrompt += `\n[EYE GAZE & LOOK DIRECTION]: The subject's eyes and head MUST look towards canvas target point (${characterTool.lookTarget.x.toFixed(1)}%, ${characterTool.lookTarget.y.toFixed(1)}%).\n`;
    }
  }

  if (effectiveFraming && characterLikely) {
    fullPrompt += getShotDistanceFramingDirective(effectiveFraming);
  }

  fullPrompt += `[STRICT NEGATIVE CONSTRAINT]: NO TEXT. NO labels. NO watermarks. NO signatures. NO UI elements. NO speech bubbles. The image MUST be pure artwork.\n`;
  
  if (referenceAssets.length > 0) {
    if (characterLikely) {
      fullPrompt += `[STRICT CONSTRAINT]: Maintain exact character features, skin color, and ALL accessories from references (wings, tails, horns, weapons, quivers, capes). If the character in the reference has a closed helmet, mask, or obscured face, you MUST maintain that obscured face. Do NOT force eyes or an open helmet if the reference shows a closed one.\n`;
    } else {
      fullPrompt += `[STRICT CONSTRAINT]: Maintain exact visual design, colors, and style from references.\n`;
    }
  }
  
  // Use granular config if available, otherwise fallback to simple proportion string
  if (characterLikely) {
    if (chibiConfig?.enabled) {
      fullPrompt += buildChibiFragment(chibiConfig) + "\n";
    } else if (chibiProportion && CHIBI_STYLE_CONFIG[chibiProportion]) {
      fullPrompt += `ANATOMY GUIDELINE: ${CHIBI_STYLE_CONFIG[chibiProportion].suffix}\n`;
    }
  }

  const effectiveStyle = resolveArtStyleSnippet(styleSnippet);
  if (effectiveStyle) {
    fullPrompt += `STYLE: ${effectiveStyle.replace(/^,\s*/, '')}\n`;
    fullPrompt += `(Ensure the style strictly matches the above snippet, do not revert to realism or generic defaults.)\n`;
  } else {
    fullPrompt += `STYLE: Clean, neutral, high-quality digital art without additional stylistic flourishes.\n`;
  }

  if (continuityFlags) {
    const activeFlags = Object.entries(continuityFlags).filter(([_, active]) => active);
    if (activeFlags.length > 0) {
      fullPrompt += `\nSTYLE CONTINUITY DIRECTIVES:\n`;
      activeFlags.forEach(([key]) => {
        if (key === 'Sharp Black Outlines') fullPrompt += `- Use bold, sharp black outlines for all subject edges.\n`;
        else if (key === 'Clean Cel-Shading') fullPrompt += `- Use clean, professional cel-shading with clear highlight/shadow separation.\n`;
        else if (key === 'Metallic Texture Sync') fullPrompt += `- Render all metallic surfaces with consistent high-reflectivity sheen.\n`;
        else if (key === 'Ambient Lighting Lock') fullPrompt += `- Maintain consistent ambient lighting from the top-right across all related assets.\n`;
        else if (key === 'Palette Adherence') fullPrompt += `- Strictly stick to the established character palette. No stray colors.\n`;
        else if (key === 'Viewpoint Continuity') fullPrompt += `- CRITICAL: Maintain exact eye-level camera perspective. Do NOT use high or low angles.\n`;
        else if (key === 'Background Isolation') fullPrompt += `- Ensure subject is clearly separated from background with distinct visual contrast.\n`;
        else if (key === 'Character Consistency' && characterLikely) fullPrompt += `- Adhere strictly to character design features across all requested formats.\n`;
        else if (key === 'Character Consistency' && !characterLikely) fullPrompt += `- Adhere strictly to the established visual design across all requested formats.\n`;
        else fullPrompt += `- ${key}\n`;
      });
    }
  }

  if (referenceAssets.length > 0) {
    fullPrompt += `\nREFERENCE VISUAL CONSISTENCY (CRITICAL):\n`;
    fullPrompt += `You have been provided with reference images. You MUST strictly adhere to the visual design shown in these references.\n`;
    if (characterLikely) {
      fullPrompt += `1. IDENTITY: Maintain the exact facial features, hair style, skin color, and body type.\n`;
      fullPrompt += `2. CLOTHING: Keep the character's outfit EXACTLY as seen in the references. Do not redesign, simplify, or change colors.\n`;
    } else {
      fullPrompt += `1. VISUAL IDENTITY: Maintain the exact design, features, and colors of the subject.\n`;
      fullPrompt += `2. DETAILS: Keep the subject's specific details EXACTLY as seen in the references. Do not redesign, simplify, or change colors.\n`;
    }
    fullPrompt += `3. STYLE: Use the art style from the references if specified.\n`;
    fullPrompt += `\nINSTRUCTION FOR POSE & COMPOSITION:\n`;
    if (characterLikely) {
      fullPrompt += `Use the references ONLY for character details. \n`;
    } else {
      fullPrompt += `Use the references ONLY for subject details. \n`;
    }
    fullPrompt += `DO NOT copy the composition, pose, or distance of the references.\n`;
    fullPrompt += `FOLLOW the SUBJECT description above for current pose and scene.\n`;
  }

  if (!characterLikely && (mapLikely || magicCircleLikely)) {
    fullPrompt += `\n[STRICT CONSTRAINT]: Focus ONLY on the ${basePrompt}. DO NOT generate any characters, people, or creatures in the scene.\n`;
  }

  if (basePrompt.toLowerCase().includes('undead') || basePrompt.toLowerCase().includes('skeleton') || basePrompt.toLowerCase().includes('skull')) {
    fullPrompt += `\n[CRITICAL UNDEAD ANATOMY]: If the character is undead or skeletal, you MUST keep the skull structurally sound with the LOWER JAW INTACT AND ATTACHED. Do not render missing lower jaws. Ensure the head is PROPORTIONATE to the body width, do not make the head excessively large.\n`;
  }

  if (safeZone && safeZone.enabled) {
    fullPrompt += `\nCOMPOSITION (IMPORTANT - ZOOM OUT): \n`;
    fullPrompt += `Compose the scene so that the MAIN SUBJECT is strictly contained within the CENTRAL ${Math.round(
      safeZone.width
    )}% width and ${Math.round(safeZone.height)}% height of the image.\n`;
    fullPrompt += `The outer areas must be EXTENDED BACKGROUND filler.\n`;
  }

  fullPrompt += `\nBACKGROUND:\n`;
  if (bgConfig.mode === "transparent" || bgConfig.mode === "transparent_neo") {
    const key = bgConfig.mode === "transparent" ? "#FFFFFF" : (bgConfig.keyColor || "#FFFFFF");
    const colorName = key === "#000000" ? "BLACK" : key === "#FFFFFF" ? "WHITE" : key === "#00FF00" ? "GREEN" : "MAGENTA";
    fullPrompt += `[STRICT OVERRIDE]: IGNORE all other background descriptions. You MUST render the subject on a perfectly FLAT SOLID ${colorName} BACKGROUND (Hex ${key}).\n`;
    fullPrompt += `Absolutely NO texture, NO depth, and NO environmental details.\n`;
  } else if (bgConfig.mode === "solid") {
    if (bgConfig.gradientType === 'linear') {
      fullPrompt += `Use a smooth linear gradient background: ${bgConfig.color} to ${bgConfig.secondaryColor || '#000000'}.\n`;
    } else if (bgConfig.gradientType === 'radial') {
      fullPrompt += `Use a smooth radial gradient background: radiating from ${bgConfig.color} at the center to ${bgConfig.secondaryColor || '#000000'} at the edges.\n`;
    } else {
      fullPrompt += `Use a flat, solid background color: ${bgConfig.color}. No detailed scene, no gradients.\n`;
    }
    if (bgConfig.promptFragment) {
       fullPrompt += `Background atmosphere hints: ${bgConfig.promptFragment}\n`;
    }
  } else if (bgConfig.mode === "pattern" && bgConfig.patternType) {
    const type = bgConfig.patternType;
    fullPrompt += `Background Style: ${type.toUpperCase()} PATTERN.\n`;
    if (bgConfig.promptFragment) {
       fullPrompt += `Pattern specifics: ${bgConfig.promptFragment}\n`;
    }
  } else if (bgConfig.mode === "scene" && bgConfig.promptFragment) {
    fullPrompt += `Background specifics: ${bgConfig.promptFragment}\n`;
  } else if (bgConfig.mode === "prompt_only") {
    fullPrompt += `[STRICT]: Only follow this specific background instruction: ${bgConfig.promptFragment || 'Empty minimalist background'}.\n`;
    fullPrompt += `Do NOT add environmental details not mentioned here.\n`;
  } else if (bgConfig.mode === "none") {
    fullPrompt += `Make the background entirely empty, minimalist, or non-existent. NO environmental detail. Focus purely on the subject.\n`;
  } else if (bgConfig.mode === "auto") {
    fullPrompt += `Background complexity: Balanced. Let AI decide based on prompt context.\n`;
  } else {
    fullPrompt += `Background complexity: Balanced.\n`;
  }

  if (!bgConfig.allowTransparency && bgConfig.mode !== 'transparent' && bgConfig.mode !== 'transparent_neo') {
    fullPrompt += `Ensure the background is fully opaque.\n`;
  }

  const referenceParts = processReferenceNotes(referenceAssets);

  return { textPrompt: fullPrompt, referenceParts };
};

export const buildExtractClothesPrompt = (
  gameContext: GameContext,
  bgConfig: BackgroundConfig
): string => {
  let bgInstruction = "";
  if (bgConfig.mode === 'transparent' || bgConfig.mode === 'transparent_neo') {
    const key = bgConfig.mode === 'transparent' ? '#FFFFFF' : (bgConfig.keyColor || "#FFFFFF");
    const colorName = key === "#000000" ? "BLACK" : key === "#FFFFFF" ? "WHITE" : key === "#00FF00" ? "GREEN" : "MAGENTA";
    bgInstruction = `[MANDATORY]: Render the result on a perfectly FLAT SOLID ${colorName} BACKGROUND (${key}) ONLY. No environmental detail.`;
  } else if (bgConfig.mode === 'solid') {
    bgInstruction = `Render the result on a FLAT SOLID BACKGROUND of color ${bgConfig.color}.`;
  } else {
    bgInstruction = `Render the background as: ${bgConfig.promptFragment || 'A clean, minimalist studio background'}.`;
  }

  return `[EXTRACTION TASK]: TOTAL ANATOMY REMOVAL.
1. ACTION (MANDATORY): Erase the entire character. Remove all skin, remove all hair, remove face, remove eyes, remove hands, remove biological features. 
2. PRESERVE (CRITICAL): ALL CLOTHING PIECES. You MUST keep the shirt, pants, boots, and armor as a complete OUTFIT SET. Do NOT leave just one item; keep the entire layered ensemble exactly as seen.
3. STRUCTURE: The clothes should retain their 3D shape and volume as if worn by an INVISIBLE GHOST MANNEQUIN.
4. BACKGROUND: ${bgInstruction}
Context: ${gameContext.setting || 'High-end gaming asset'}.`;
};

export const buildFramePrompt = (
  prompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  frameElements: FrameElement[]
): string => {
    return `TASK: Generate a card frame or UI border.
SUBJECT: ${prompt}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
STYLE: ${styleSnippet}
ELEMENTS TO INCLUDE: ${frameElements.join(', ')}.`;
};

export const buildBackgroundAssetPrompt = (
  prompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  bgPatternType: BackgroundPatternType
): string => {
    return `TASK: Generate a background asset.
SUBJECT: ${prompt}
PATTERN TYPE: ${bgPatternType}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
STYLE: ${styleSnippet}`;
};

export const buildBackgroundPrompt = buildBackgroundAssetPrompt;

export const buildBackgroundRegenPrompt = (
  gameContext: GameContext,
  bgConfig: BackgroundConfig
): string => {
    let p = `TASK: Replace the background of this image. Keep the foreground subjects exactly as they are.
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
NEW BACKGROUND: `;
    if (bgConfig.mode === "solid") {
      if (bgConfig.gradientType === 'linear') p += `linear gradient ${bgConfig.color} to ${bgConfig.secondaryColor || '#000000'}.`;
      else if (bgConfig.gradientType === 'radial') p += `radial gradient from ${bgConfig.color} to ${bgConfig.secondaryColor || '#000000'} at the edges.`;
      else p += `solid color ${bgConfig.color}.`;
    } else if (bgConfig.mode === "transparent" || bgConfig.mode === "transparent_neo") {
      const key = bgConfig.mode === "transparent" ? "#FFFFFF" : (bgConfig.keyColor || "#FFFFFF");
      const colorName = key === "#000000" ? "BLACK" : key === "#FFFFFF" ? "WHITE" : key === "#00FF00" ? "GREEN" : "MAGENTA";
      p += `[MANDATORY] SOLID ${colorName} (${key}) with ZERO texture.`;
    } else if (bgConfig.mode === "none") {
      p += `Empty minimalist or pure white background with NO detail.`;
    } else if (bgConfig.mode === "auto") {
      p += `Balanced background based on prompt content.`;
    } else {
      p += `${bgConfig.promptFragment || 'A new suitable background'}.`;
    }
    return p;
};

export const buildStyleAnalysisPrompt = (): string => {
    return `Analyze the artistic style of this image. Provide a brief description and a "prompt snippet" that can be used to replicate this style in an AI image generator.
Return JSON format: { "description": "...", "promptSnippet": "..." }`;
};

export const buildPromptSuggestionsPrompt = (prompt: string): string => {
    return `Given the user's initial prompt: "${prompt}", suggest 3 creative variations or improvements.`;
};

export const buildCardSuggestionsPrompt = (artPrompt: string, currentName: string): string => {
    return `Based on this artwork description: "${artPrompt}" and current card name: "${currentName}", suggest 5 unique fantasy card names and 3 ability descriptions.
Return JSON format: { "names": ["...", "..."], "effects": ["...", "..."] }`;
};

export const buildRefinementPrompt = (currentPrompt: string): string => {
    return `Refine and improve the following AI image generation prompt for better results. Fix grammar, add descriptive keywords, and optimize for high quality: "${currentPrompt}".
Respond with ONLY the refined prompt text.`;
};

export const buildOutpaintPrompt = (prompt: string, gameContext: GameContext, styleSnippet: string): string => {
    return `TASK: Outpaint / Extend the existing image into a new aspect ratio.
SUBJECT: ${prompt || 'Continue the existing scene'}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
STYLE: ${styleSnippet}`;
};

export const buildPixelizePrompt = (style: PixelStyle, customPrompt: string): string => {
    return `TASK: Transform the image into retro pixel art.
PIXEL STYLE: ${style}
EXTRA DETAILS: ${customPrompt}`;
};

/**
 * Build prompt for suggesting sprite sheet poses
 */
export const buildSpriteSheetPromptsPrompt = (
  globalPrompt: string,
  frameCount: number,
  gameContext: GameContext
): string => {
  return `TASK: Suggest a sequence of ${frameCount} distinct character poses or variations for a sprite sheet.
CHARACTER DESCRIPTION: ${globalPrompt}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.

Return a JSON object with:
- "poses": An array of ${frameCount} strings, each being a short, descriptive prompt for a single frame (e.g. "Standing idle, front view", "Swinging a sword, side view").
- "refinedGlobalPrompt": A slightly improved version of the character description for better AI consistency.`;
};

/**
 * Build prompt for suggesting sprite sheet animation frames
 */
export const buildSpriteSheetAnimationPromptsPrompt = (
  globalPrompt: string,
  animationGoal: string,
  frameCount: number,
  gameContext: GameContext
): string => {
  return `TASK: Suggest a sequence of ${frameCount} animation frames for a sprite sheet.
ANIMATION GOAL: ${animationGoal}
CHARACTER DESCRIPTION: ${globalPrompt}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.

Return a JSON object with:
- "poses": An array of ${frameCount} strings, each being a prompt for a single frame in the animation sequence (e.g. "Frame 1: Starting the jump", "Frame 2: Mid-air peak").
- "refinedGlobalPrompt": A slightly improved version of the character description.`;
};

export const buildPoseDescription = (poseData: PoseData): string => {
  if (!poseData.joints || poseData.joints.length === 0) return "";
  
  let description = "CRITICAL: SKELETAL POSE GUIDE (Normalized 0-100 Canvas Coordinates):\n";
  description += "The character's anatomy MUST be built exactly upon these spatial anchors. Do NOT deviate from these coordinates.\n";
  
  poseData.joints.forEach(j => {
    description += `- ${j.name.toUpperCase()}: [X:${Math.round(j.x)}, Y:${Math.round(j.y)}]\n`;
  });
  
  description += "\n[ANATOMICAL CONSTRAINTS]:\n";
  description += "- The character's head must be centered at the HEAD coordinate.\n";
  description += "- Limbs must connect logically (Shoulder -> Elbow -> Wrist) following the provided points.\n";
  description += "- The overall silhouette and posture MUST match the skeletal structure defined by these points.\n";
  description += "- This is a spatial requirement, not just a suggestion. Treat these points as a hard wireframe.";
  
  return description;
};

export const buildPoseStudioPrompt = (
  basePrompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  bgConfig: BackgroundConfig,
  referenceAssets: ReferenceAsset[],
  poseData: PoseData,
  safeZone?: SafeZoneConfig
): { textPrompt: string; referenceParts: { text?: string }[] } => {
  const { textPrompt, referenceParts } = buildIllustrationPrompt(
    basePrompt, gameContext, styleSnippet, bgConfig, referenceAssets, safeZone
  );
  
  let fullPrompt = `POSE-DRIVEN CHARACTER GENERATION.\n`;
  fullPrompt += buildPoseDescription(poseData) + "\n\n";
  fullPrompt += textPrompt;
  
  return { textPrompt: fullPrompt, referenceParts };
};

/**
 * Build prompt for Map Grid Generator feature
 */
export const buildMapGridPrompt = (
  userPrompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  config: MapGridConfig
): string => {
  let fullPrompt = `MAP GRID GENERATION TASK.\n`;
  fullPrompt += `OBJECTIVE: Generate a clean 2D game map image. NO characters. NO UI. NO HUD. NO text. NO borders.\n`;
  
  fullPrompt += `VIEW MODE: ${config.viewMode === 'top-down' ? 'Top-Down (Orthographic 2D)' : 'Isometric (2.5D angled view)'}.\n`;
  
  if (config.viewMode === 'top-down') {
    fullPrompt += `- Flat orthographic projection.\n`;
    fullPrompt += `- Consistent lighting.\n`;
    fullPrompt += `- Shadow only under walls/decor.\n`;
    fullPrompt += `- Tile-aligned decorations.\n`;
  } else {
    fullPrompt += `- 45-degree diamond grid.\n`;
    fullPrompt += `- Proper depth layering.\n`;
    fullPrompt += `- Wall height extrusion.\n`;
    fullPrompt += `- Soft directional shadow.\n`;
    fullPrompt += `- Height-based occlusion.\n`;
  }

  fullPrompt += `GRID CONFIGURATION: ${config.gridWidth}x${config.gridHeight} cells. Cell size: ${config.cellSize}px.\n`;
  
  if (config.preset !== 'custom') {
    const presetName = config.preset.replace('_', ' ');
    fullPrompt += `ENVIRONMENT PRESET: ${presetName}.\n`;
  }

  fullPrompt += `STYLE CONTROLS:\n`;
  fullPrompt += `- Primary Floor Color: ${config.primaryColor}\n`;
  fullPrompt += `- Secondary Accent Color: ${config.accentColor}\n`;
  fullPrompt += `- Shadow Intensity: ${config.shadowIntensity}%\n`;
  fullPrompt += `- Light Direction: ${config.lightDirection.replace('-', ' ')}\n`;
  fullPrompt += `- Detail Density: ${config.detailDensity}\n`;
  fullPrompt += `- Decoration Level: ${config.decorationLevel}\n`;

  fullPrompt += `\nCORE DESCRIPTION: ${userPrompt || 'A detailed game map'}\n`;
  
  if (gameContext.setting || gameContext.tone) {
    fullPrompt += `NARRATIVE CONTEXT: ${gameContext.setting}. ${gameContext.tone}.\n`;
  }
  
  if (styleSnippet) {
    fullPrompt += `RENDER STYLE: ${styleSnippet}\n`;
  }

  if (config.transparentBackground) {
    fullPrompt += `\n[STRICT CONSTRAINT]: Render with a TRANSPARENT background where applicable (e.g. outside the map boundaries).\n`;
  }

  fullPrompt += `\n[FINAL REMINDER]: ONLY generate environment and decorations. ABSOLUTELY NO CHARACTERS OR UI ELEMENTS.`;
  
  return fullPrompt;
};

export const buildAnimationStripPrompt = (
  prompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  bgConfig: BackgroundConfig,
  stripConfig: SpriteStripConfig,
  referenceAssets: ReferenceAsset[],
  chibiProportion?: string,
  chibiConfig?: ChibiConfig
): { textPrompt: string; referenceParts: any[] } => {
  let fullPrompt = `[MODE: SPRITE ANIMATION STRIP]\n`;
  fullPrompt += `Generate a SINGLE, WIDE rectangular image containing exactly ${stripConfig.frameCount} evenly-spaced animation frames of the same character in a horizontal row.\n\n`;

  // Core character
  fullPrompt += `CHARACTER METADATA:\n`;
  fullPrompt += `Core Identity: ${prompt}\n`;
  if (gameContext?.setting?.trim()) { fullPrompt += `Game Setting: ${gameContext.setting.trim()}. `; }
  if (gameContext?.tone?.trim()) { fullPrompt += `Theme: ${gameContext.tone.trim()}. `; }
  fullPrompt += '\n\n';

  // Action and strip rules
  fullPrompt += `ANIMATION RULES:\n`;
  fullPrompt += `Action: ${stripConfig.action}\n`;
  fullPrompt += `Direction: The character MUST face ${stripConfig.direction} in every frame.\n`;
  
  let marginText = "excessive empty whitespace between frames, very far apart";
  if (stripConfig.frameMargin) {
    if (stripConfig.frameMargin === 'tight') marginText = "very tight spacing, almost touching";
    if (stripConfig.frameMargin === 'standard') marginText = "even spacing";
    if (stripConfig.frameMargin === 'wide') marginText = "generous, wide empty gaps between each frame";
    if (stripConfig.frameMargin === 'extreme') marginText = "excessive empty whitespace between frames, very far apart";
  }
  
  fullPrompt += `Layout: Draw exactly ${stripConfig.frameCount} instances of the character. IMPORTANT: Do NOT force all frames into a single horizontal row if they will become too small or squished. Instead, arrange them in a multi-row grid (like a traditional sprite sheet, e.g., 2 rows of 4 frames) to maintain maximum character size, high resolution, and ${marginText}. Do not include UI, grids, borders, or lines.\n`;
  fullPrompt += `Progression: This is a STRICT frame-by-frame animation sequence! Proceeding from left to right (and top to bottom if multiple rows), EACH of the ${stripConfig.frameCount} frames MUST show a DISTINCT and DIFFERENT step progressing through the action. Frame 1, Frame 2, Frame 3, etc., MUST be completely different poses showing movement. NO REPEATED POSES.\n`;
  fullPrompt += `Continuity: The character's design, proportions, clothing, and colors must remain identical across all ${stripConfig.frameCount} frames.\n\n`;

  // Chibi config
  if (chibiConfig?.enabled) {
    fullPrompt += buildChibiFragment(chibiConfig) + "\n";
  } else if (chibiProportion && CHIBI_STYLE_CONFIG[chibiProportion]) {
    fullPrompt += `ANATOMY GUIDELINE: ${CHIBI_STYLE_CONFIG[chibiProportion].suffix}\n\n`;
  }

  // Visual constraints
  if (styleSnippet) {
    fullPrompt += `STYLE CONSTRAINT: ${styleSnippet}\n`;
  }
  
  if (bgConfig.mode === 'solid') {
    fullPrompt += `[STRICT OVERRIDE]: Must be on a pure FLAT ${bgConfig.color} background. No textures, no gradients, no environment.\n`;
  } else {
    fullPrompt += `Use a solid white or neutral flat background.\n`;
  }

  const referenceParts = processReferenceNotes(referenceAssets);

  return { textPrompt: fullPrompt, referenceParts };
};

export const buildUIScenePrompt = (
  userPrompt: string,
  gameContext: GameContext,
  styleSnippet: string,
  referenceAssets: ReferenceAsset[]
): { textPrompt: string; referenceParts: { text?: string }[] } => {
  let fullPrompt = `GAME SCENE & UI GENERATION TASK.\n`;
  fullPrompt += `OBJECTIVE: Generate a full screenshot of a game scene, COMPLETE with user interface (UI) elements, HUD, menus, and the environment/characters.\n\n`;
  
  if (gameContext.setting || gameContext.tone || gameContext.visualConstraints) {
    fullPrompt += `GAME CONTEXT:\n`;
    if (gameContext.setting) fullPrompt += `Setting: ${gameContext.setting}\n`;
    if (gameContext.tone) fullPrompt += `Tone: ${gameContext.tone}\n`;
    if (gameContext.visualConstraints) fullPrompt += `Constraints: ${gameContext.visualConstraints}\n`;
    fullPrompt += `\n`;
  }

  fullPrompt += `SCENE DESCRIPTION: ${userPrompt}\n\n`;

  if (styleSnippet) {
    fullPrompt += `ART STYLE: ${styleSnippet}\n`;
    fullPrompt += `(Ensure the result strictly fits this art style.)\n\n`;
  }

  if (referenceAssets.length > 0) {
    fullPrompt += `UI MATCHING DIRECTIVE (CRITICAL):\n`;
    fullPrompt += `You have been provided with reference images containing existing UI/HUD designs for this game.\n`;
    fullPrompt += `1. You MUST match the UI theme, colors, button styles, frames, typography style, and layout conventions shown in the references.\n`;
    fullPrompt += `2. Do NOT copy the exact scene from the references; generate the NEW scene described above, but place the new scene inside the established UI framework.\n`;
    fullPrompt += `3. The final image should look like a genuine gameplay screenshot belonging to the same game as the references.\n\n`;
  } else {
    fullPrompt += `UI DIRECTIVE:\n`;
    fullPrompt += `Design an appropriate UI/HUD that fits the scene and game context. It must look like a real gameplay screenshot.\n\n`;
  }

  const referenceParts = processReferenceNotes(referenceAssets);
  return { textPrompt: fullPrompt, referenceParts };
};

/**
 * Dynamic Context Assembly: Assembles the full 5-layer MythicFrame prompt:
 * Final Prompt = User Intent + Game Context (Setting/Tone) + Style Snippet + Spatial Constraints + System Rules
 */
export interface AssemblePromptParams {
  prompt: string;
  mode?: UIMode;
  gameContext?: GameContext;
  styleSnippet?: string;
  bgConfig?: BackgroundConfig;
  referenceAssets?: ReferenceAsset[];
  safeZone?: SafeZoneConfig;
  continuityFlags?: Record<string, boolean>;
  chibiProportion?: ChibiProportion;
  chibiConfig?: ChibiConfig;
  viewpoint?: string;
  noCharacters?: boolean;
  framing?: 'full-body' | 'waist-up' | 'bust' | 'head-only';
  frameElements?: FrameElement[];
  bgPatternType?: BackgroundPatternType;
  clothesParams?: ClothesParams;
  poseData?: PoseData;
  mapGridConfig?: MapGridConfig;
  spriteStripConfig?: SpriteStripConfig;
  aspectRatio?: string;
  characterTool?: CharacterToolState;
}

export interface AssembledMythicPromptResult {
  textPrompt: string;
  referenceParts: { text?: string }[];
  fullPrompt: string;
  sanitizedPrompt: string;
  imagePromptDirective: string;
}

export const assembleFullMythicPrompt = (params: AssemblePromptParams): AssembledMythicPromptResult => {
  const mode = params.mode || 'illustration';
  const gameContext: GameContext = params.gameContext || { setting: '', tone: '', visualConstraints: '' };
  const styleSnippet = params.styleSnippet || '';
  const bgConfig = params.bgConfig || DEFAULT_BACKGROUND_CONFIG;
  const referenceAssets = params.referenceAssets || [];

  let textPrompt = '';
  let referenceParts: { text?: string }[] = [];

  if (mode === 'frame') {
    textPrompt = buildFramePrompt(params.prompt, gameContext, styleSnippet, params.frameElements || []);
  } else if (mode === 'background') {
    textPrompt = buildBackgroundAssetPrompt(params.prompt, gameContext, styleSnippet, params.bgPatternType || 'scene');
  } else if (mode === 'clothes') {
    const built = buildClothesPrompt(params.prompt, gameContext, styleSnippet, bgConfig, referenceAssets, params.safeZone, params.clothesParams);
    textPrompt = built.textPrompt;
    referenceParts = built.referenceParts;
  } else if (mode === 'pose-studio' && params.poseData) {
    const built = buildPoseStudioPrompt(params.prompt, gameContext, styleSnippet, bgConfig, referenceAssets, params.poseData, params.safeZone);
    textPrompt = built.textPrompt;
    referenceParts = built.referenceParts;
  } else if (mode === 'ui-scene') {
    const built = buildUIScenePrompt(params.prompt, gameContext, styleSnippet, referenceAssets);
    textPrompt = built.textPrompt;
    referenceParts = built.referenceParts;
  } else if (mode === 'sprite-strip' && params.spriteStripConfig) {
    const built = buildAnimationStripPrompt(
      params.prompt || params.spriteStripConfig.prompt || '',
      gameContext,
      styleSnippet,
      bgConfig,
      params.spriteStripConfig,
      referenceAssets,
      params.chibiProportion,
      params.chibiConfig
    );
    textPrompt = built.textPrompt;
    referenceParts = built.referenceParts;
  } else if (mode === 'map-grid' && params.mapGridConfig) {
    textPrompt = buildMapGridPrompt(params.prompt, gameContext, styleSnippet, params.mapGridConfig);
  } else {
    const built = buildIllustrationPrompt(
      params.prompt,
      gameContext,
      styleSnippet,
      bgConfig,
      referenceAssets,
      params.safeZone,
      params.continuityFlags,
      params.chibiProportion,
      params.chibiConfig,
      params.viewpoint,
      params.noCharacters,
      params.framing,
      params.characterTool
    );
    textPrompt = built.textPrompt;
    referenceParts = built.referenceParts;
  }

  let fullPrompt = textPrompt;
  if (referenceParts.length > 0) {
    const refDirectives = referenceParts.filter(p => Boolean(p && p.text)).map(p => p.text).join('\n');
    if (refDirectives) {
      fullPrompt += `\n\n[REFERENCE DIRECTIVES]:\n${refDirectives}`;
    }
  }

  const sanitizedPrompt = fullPrompt.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  const arTag = params.aspectRatio ? `\n\n[ASPECT RATIO]: ${params.aspectRatio}` : '';
  const imagePromptDirective = `Create image:\n\n${fullPrompt}${arTag}`;

  return {
    textPrompt,
    referenceParts,
    fullPrompt,
    sanitizedPrompt,
    imagePromptDirective
  };
};


