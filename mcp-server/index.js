// src/mcp/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/constants/backgrounds.ts
var DEFAULT_BACKGROUND_CONFIG = {
  mode: "auto",
  color: "#ffffff",
  allowTransparency: false,
  promptFragment: "",
  patternType: "abstract",
  removeHoles: true,
  healingPower: 100,
  keyColor: "#ffffff",
  // Neo Defaults
  tolBg: 60,
  tolEdge: 75,
  softRadius: 3,
  decontamStrength: 85,
  preserveTrueMagenta: false,
  fxMode: false,
  // Neo v2 Defaults
  steamSafe: true,
  neutralizeStrength: 85,
  alphaBias: 10
};

// src/constants/gacha.ts
var CHIBI_STYLE_CONFIG = {
  standard: {
    label: "Standard",
    icon: "fa-person",
    suffix: "anatomically standard human proportions, head-to-body ratio 1:7, realistic silhouette, tall posture",
    desc: "Natural, realistic human scale."
  },
  deformed_4h: {
    label: "4-Head",
    icon: "fa-child",
    suffix: "semi-deformed proportions, 4-heads tall, head-to-body ratio 1:3, youthful cute silhouette, stylized limbs",
    desc: 'Youthful "Puchi" style proportions.'
  },
  chibi_3h: {
    label: "3-Head",
    icon: "fa-child-reaching",
    suffix: "classic chibi proportions, 3-heads tall, head-to-body ratio 1:2, large expressive head, short compact limbs, gacha sprite style",
    desc: "The gold standard for gacha sprites."
  },
  micro_2h: {
    label: "Micro (2-H)",
    icon: "fa-baby",
    suffix: "extreme chibi proportions, micro scale, 2-heads tall, head is 50% of total height, tiny body, nendoroid sticker style",
    desc: "Maximum cuteness. Tiny body, massive head."
  }
};
var GACHA_ASSET_PRESETS = [
  {
    name: "Vassal Card",
    ratio: "3:4",
    icon: "fa-id-card",
    suffix: "Waist-up shot of a single anime character (no group), centered, direct gaze, stoic expression, high-quality polished cel-shaded game art, no background or minimal flat color, character only.",
    bgMode: "solid",
    framing: "waist-up"
  },
  {
    name: "Battle Sprite",
    ratio: "1:1",
    icon: "fa-sword",
    suffix: "Full-body sprite, standing, frontal view, vivid and clear costume or armor details, clean cel-shading, lively pose. Style is polished and visually appealing, designed for tactical RPG battle screens. [STRICT NEGATIVE: no moe, no shining eyes, not overly cute, not generic anime style, no exaggerated expressions, no kawaii]",
    bgMode: "solid",
    chibi: true,
    framing: "full-body"
  },
  {
    name: "Avatar Icon",
    ratio: "1:1",
    icon: "fa-circle-user",
    suffix: "Headshot / Close-up of a single character, focus entirely on the head and face, centered, direct gaze, solid white background, clean polished game art style.",
    bgMode: "solid",
    framing: "head-only"
  },
  {
    name: "Chambers CG",
    ratio: "16:9",
    icon: "fa-couch",
    suffix: "Full character depicted in a highly detailed personal chamber or room tailored specifically to the character's race, class, and personality. The setting MUST be located within the dark and imposing Castle of the Demon Lord. For example, a Prime Titan might have a massive stone cavern with chains, while a noble vampire might have a gothic study. The room should perfectly reflect their nature. Relaxed/at ease pose, soft evening or ambient light, cinematic depth, immersive setting, polished high-quality gacha game CG illustration.",
    bgMode: "scene",
    framing: "full-body"
  },
  {
    name: "Dialogue Portrait",
    ratio: "3:4",
    icon: "fa-comments",
    suffix: "Anime character close-up portrait, waist-up to shoulders, character faces 45\xB0 to viewer\u2019s left, subtle facial emotions, natural posture, focus on face and upper body only, no background, no effects, clean transparent asset for dialogue UI.",
    bgMode: "solid",
    framing: "bust"
  },
  {
    name: "Splash Art",
    ratio: "16:9",
    icon: "fa-fire",
    suffix: "Epic dynamic splash illustration for gacha game, single character full-body, dramatic pose, vibrant action movement, centered composition, highly detailed background, masterpiece lighting, sense of scale, cinematic drama.",
    bgMode: "scene",
    framing: "full-body"
  },
  {
    name: "Full Portrait",
    ratio: "9:16",
    icon: "fa-user",
    suffix: "Full body character, fully visible from head to toe, standing, stylish RPG-style costume, detailed and expressive posture, clean polished cel-shading, high-quality illustration suitable for gacha summon view or collection screen.",
    bgMode: "scene",
    framing: "full-body"
  }
];
var DEFAULT_GACHA_ASSETS = GACHA_ASSET_PRESETS.map((p, idx) => ({
  id: `default-${idx}`,
  name: p.name,
  aspectRatio: p.ratio,
  size: "1K",
  promptSuffix: p.suffix,
  imageUrl: null,
  status: "pending",
  bgConfig: { ...DEFAULT_BACKGROUND_CONFIG, mode: p.bgMode || "auto", removeHoles: true, healingPower: 100 },
  chibiConfig: p.chibi ? {
    enabled: true,
    proportions: "simple",
    headStyle: "realistic",
    bodyStyle: "geometric",
    focus: p.name === "Battle Sprite" ? "detailed" : "kawaii",
    presetProportion: p.name === "Battle Sprite" ? "deformed_4h" : "chibi_3h",
    bodyRatio: p.name === "Battle Sprite" ? "1:4" : "1:2"
  } : { enabled: false, proportions: "simple", headStyle: "realistic", bodyStyle: "geometric", focus: "kawaii" },
  framing: p.framing || "full-body"
}));

// src/constants/framing.ts
var SHOT_DISTANCE_PRESETS = [
  {
    id: "extreme_close_up",
    code: "ECU",
    label: "ECU \u2014 Extreme Close-Up",
    shortDescription: "Tiny facial detail",
    description: "Tiny facial detail, such as an eye, lips, or another specific feature.",
    aliases: ["ecu"]
  },
  {
    id: "big_close_up",
    code: "BCU",
    label: "BCU \u2014 Big Close-Up",
    shortDescription: "Entire face, forehead to chin",
    description: "Entire face, from forehead to chin, with very little surrounding space.",
    aliases: ["bcu"]
  },
  {
    id: "close_up",
    code: "CU",
    label: "CU \u2014 Close-Up",
    shortDescription: "Head and face dominate",
    description: "Head and face dominate the image; shoulders may be partially visible.",
    aliases: ["cu", "head-only", "headshot"]
  },
  {
    id: "medium_close_up",
    code: "MCU",
    label: "MCU \u2014 Medium Close-Up",
    shortDescription: "Head and shoulders",
    description: "Head and shoulders, typically cropped around the upper chest.",
    aliases: ["mcu"]
  },
  {
    id: "bust_shot",
    code: "BUST",
    label: "BUST \u2014 Bust Shot",
    shortDescription: "Chest up, upper torso",
    description: "Head, shoulders, and upper torso, usually ending around the chest.",
    aliases: ["bust", "chest-up"]
  },
  {
    id: "medium_shot",
    code: "MS",
    label: "MS \u2014 Medium Shot",
    shortDescription: "Head to waist",
    description: "Head to waist; hands and waist-level props can be visible.",
    aliases: ["ms", "waist-up", "half-body"]
  },
  {
    id: "medium_long_shot",
    code: "MLS",
    label: "MLS \u2014 Medium-Long Shot",
    shortDescription: "Head to mid-thigh",
    description: "Head to mid-thigh; shows more clothing and body language.",
    aliases: ["mls"]
  },
  {
    id: "three_quarter_shot",
    code: "3/4",
    label: "3/4 \u2014 Three-Quarter Shot",
    shortDescription: "Head to knees or lower legs",
    description: "Head to knees or lower legs, depending on the specified crop.",
    aliases: ["three_quarter", "3-4", "three-quarter"]
  },
  {
    id: "american_shot",
    code: "AS",
    label: "AS \u2014 American Shot",
    shortDescription: "Head to mid-thigh (holster crop)",
    description: "Head to mid-thigh, traditionally used to show holstered weapons and posture.",
    aliases: ["as", "cowboy_shot", "cowboy-shot"]
  },
  {
    id: "full_shot",
    code: "FS",
    label: "FS \u2014 Full Shot",
    shortDescription: "Head to feet, fills frame",
    description: "Entire character from head to feet, filling most of the vertical frame.",
    aliases: ["fs", "full-body", "full_body"]
  },
  {
    id: "long_shot",
    code: "LS",
    label: "LS \u2014 Long Shot",
    shortDescription: "Character with surrounding space",
    description: "Entire character appears smaller, with generous surrounding space.",
    aliases: ["ls"]
  },
  {
    id: "extreme_long_shot",
    code: "ELS",
    label: "ELS \u2014 Extreme Long Shot",
    shortDescription: "Environment dominates",
    description: "Character occupies a small part of the image; environment dominates.",
    aliases: ["els"]
  },
  {
    id: "very_wide_shot",
    code: "VWS",
    label: "VWS \u2014 Very Wide Shot",
    shortDescription: "Distant scale in broad setting",
    description: "Character shown at a distance within a broad setting; often used for establishing scale.",
    aliases: ["vws"]
  }
];
var normalizeFramingId = (val) => {
  if (!val) return "full_shot";
  const clean = val.toLowerCase().trim();
  for (const preset of SHOT_DISTANCE_PRESETS) {
    if (preset.id === clean || preset.code.toLowerCase() === clean) return preset.id;
    if (preset.aliases?.some((a) => a.toLowerCase() === clean)) return preset.id;
  }
  return clean;
};

// src/constants/artStyles.ts
var ART_STYLES = [
  { id: "none", name: "No Style", promptSnippet: "", description: "Uses only your prompt without any additional stylistic bias.", category: "Other" },
  { id: "kingdoms_divided_char", name: "Kingdoms Divided (Feudal Fantasy)", promptSnippet: ", kingdoms divided character art style, visual novel character dialogue sprite, detailed anime-influenced medieval fantasy illustration, painterly digital art, soft clean linework, tactile cloth and leather textures, mature refined character design, natural diffused ambient daylight, soft realistic shadows, no harsh rim light, isolated on solid white background", description: "Tactile medieval feudal fantasy character art with stylized anime facial aesthetics, rich painterly fabric textures, and soft natural daylight.", category: "Game Art", exampleUrl: "/styles/kingdoms_divided_character.png" },
  { id: "pixel_art", name: "2D Pixel Art (16-bit)", promptSnippet: ", pixel art style, 16-bit, retro game asset, dithering, vibrant", description: "Retro 16-bit game aesthetic with visible pixels and dithering.", category: "Retro" },
  { id: "80s_fantasy", name: "80s Dark Fantasy", promptSnippet: ", 80s dark fantasy style, frank frazetta style, boris vallejo style, oil painting, dramatic muscles, epic poses, misty background, retro fantasy cover art", description: "Retro fantasy cover art with dramatic muscles, epic poses, and mist.", category: "Retro" },
  { id: "anime", name: "Anime / Manga", promptSnippet: ", anime style, cel shaded, vibrant colors, studio ghibli inspired, high quality", description: "Clean lines, cel-shading, and vibrant colors inspired by high-quality Japanese animation.", category: "Anime/Manga" },
  { id: "anime_game", name: "Anime Game Style", promptSnippet: ", anime game style, genshin impact aesthetic, honkai star rail style, vibrant cel-shaded, clean gradients, soft shadows, high-quality 3d anime render look, polished surfaces", description: "Vibrant and clean cel-shaded look matching high-budget modern anime games like Genshin Impact.", category: "Game Art" },
  { id: "arknights_tactical", name: "Arknights Style", promptSnippet: ", arknights style, tactical anime aesthetic, techwear, urban fantasy, muted colors with vibrant highlights, professional gacha splash art, detailed materials, gritty but polished", description: "Tactical techwear and urban fantasy aesthetic with professional gacha game splash art quality.", category: "Game Art" },
  { id: "art_deco", name: "Art Deco / Dwarven", promptSnippet: ", art deco style, geometric shapes, gold and brass, symmetric, bold lines, metallic textures, dwarven architecture influence, luxury", description: "Geometric luxury with gold, brass, and symmetric bold lines.", category: "Abstract/UI" },
  { id: "art_nouveau", name: "Art Nouveau", promptSnippet: ", art nouveau style, alphonse mucha inspired, decorative organic lines, floral borders, flat colors, elegant, stylized, golden age illustration", description: "Elegant, decorative organic lines and floral motifs inspired by Alphonse Mucha.", category: "Traditional" },
  { id: "biomech", name: "Biomechanical", promptSnippet: ", biomechanical style, H.R. Giger inspired, organic machinery, dark, intricate details, metallic flesh, creepy, surreal", description: "Surreal blend of organic and mechanical elements, often dark and intricate.", category: "Digital Painting" },
  { id: "blueprint", name: "Blueprint / Sketch", promptSnippet: ", blueprint style, technical drawing, white lines on blue background, schematic, rough sketch, construction lines", description: "Technical schematic look with white lines on a blue background.", category: "Abstract/UI" },
  { id: "celestial", name: "Celestial / Cosmic", promptSnippet: ", celestial style, starry night, nebula clouds, constellations, gold and dark blue, divine beings, glowing eyes, magic", description: "Starry and divine with nebula clouds, constellations, and gold/blue tones.", category: "Digital Painting" },
  { id: "charcoal", name: "Charcoal Sketch", promptSnippet: ", charcoal sketch style, rough texture, expressive strokes, black and white, dramatic lighting, messy, artistic", description: "Rough, expressive black and white strokes with dramatic lighting.", category: "Traditional" },
  { id: "chibi", name: "Chibi Art Style", promptSnippet: ", chibi-inspired style, cute stylization, simplified shapes, rounded proportions, vibrant colors, soft shading, sticker-like illustration, playful and expressive design", description: "Cute stylized look with simplified shapes, vibrant colors, and soft shading. Works for characters, creatures, monsters, and items.", category: "Anime/Manga" },
  { id: "classic_tcg", name: "Classic TCG", promptSnippet: ", traditional card game art style, digital painting, vibrant, clean composition, high fantasy, polished, reminiscent of MTG or Hearthstone", description: "The gold standard for digital card art\u2014clear, professional, and evocative.", category: "Game Art" },
  { id: "clay", name: "Claymation", promptSnippet: ", claymation style, plasticine texture, stop motion look, soft lighting, depth of field, tactile, handmade feel, aardman style", description: "Tactile plasticine texture with a stop-motion animation look.", category: "Other" },
  { id: "cozy_cottage", name: "Cozy Cottagecore", promptSnippet: ", cozy cottagecore style, warm lighting, soft textures, whimsical, inviting, pastel and earth tones, detailed background, ghibli background style", description: "Warm, whimsical, and inviting with pastel tones and soft textures.", category: "Digital Painting" },
  { id: "cyberpunk", name: "Cyberpunk", promptSnippet: ", cyberpunk style, neon lights, futuristic, high tech, low life, detailed sci-fi", description: "High-contrast neon lights, futuristic tech, and gritty urban environments.", category: "Game Art" },
  { id: "dark_souls", name: "Dark Fantasy", promptSnippet: ", dark fantasy style, grim, gritty, eldritch, detailed textures, dramatic lighting, souls-like", description: "Grim, gritty atmosphere with eldritch elements and heavy, dramatic shadows.", category: "Game Art" },
  { id: "ethereal", name: "Ethereal / Dreamy", promptSnippet: ", ethereal style, dreamlike, soft focus, glowing light, bioluminescence, pastel gradients, floating particles, divine, celestial", description: "Dreamlike and soft with glowing lights, bioluminescence, and pastel gradients.", category: "Digital Painting" },
  { id: "fate_anime", name: "Fate Series (Ufotable)", promptSnippet: ", fate series anime style, ufotable studio style, high-end digital animation, cinematic lighting, sharp shadows, high contrast, epic fantasy, masterpiece, vibrant magical effects", description: "Cinematic lighting, sharp outlines, and high-contrast shadows typical of Ufotable's Fate adaptations.", category: "Anime/Manga" },
  { id: "noir", name: "Film Noir", promptSnippet: ", film noir style, black and white, high contrast, dramatic shadows, venetian blinds, detective, mystery, moody, cinematic", description: "Black and white cinematic style with high contrast and dramatic shadows.", category: "Retro" },
  { id: "vector", name: "Flat Vector", promptSnippet: ", flat vector art, clean lines, minimalist, modern ui style, scalable graphics", description: "Clean, minimalist lines and flat colors, suitable for modern UI icons.", category: "Abstract/UI" },
  { id: "gothic", name: "Gothic Horror", promptSnippet: ", gothic style, vampires, castles, red velvet, dark shadows, romantic horror, intricate lace, candlelight, classic dracula style", description: "Romantic horror with dark shadows, red velvet, intricate lace, and candlelight.", category: "Digital Painting" },
  { id: "grimdark", name: "Grimdark", promptSnippet: ", grimdark style, gritty, dirty, war-torn, dark atmosphere, muted colors, high contrast, heavy shadows, warhammer style", description: "War-torn, dirty, and oppressive atmosphere with muted colors and high contrast.", category: "Game Art" },
  { id: "high_fantasy", name: "High Fantasy (Classic)", promptSnippet: ", high fantasy style, detailed digital painting, magic the gathering art style, epic scale, realistic lighting, sharp details, dungeons and dragons style", description: "Epic scale and realistic lighting akin to Magic: The Gathering or D&D art.", category: "Digital Painting" },
  { id: "impressionist", name: "Impressionist", promptSnippet: ", impressionist style, claude monet style, loose brushwork, vibrant light, capturing the moment, lack of fine detail, atmospheric", description: "Loose brushwork focusing on vibrant light and atmosphere over fine detail.", category: "Traditional" },
  { id: "ink_wash", name: "Ink & Wash", promptSnippet: ", ink and wash style, sumi-e, watercolor wash, expressive brushstrokes, black and white with accent color, minimalist, traditional asian art", description: "Minimalist traditional Asian style with expressive black ink brushstrokes.", category: "Traditional" },
  { id: "arknights", name: "Legion / Arknights (Classic)", promptSnippet: ", masterwork, sharp black outlines, clean cel-shaded, bold vibrant colors, metallic texture details, urban fantasy aesthetic", description: "High-polish modern anime style with heavy outlines and professional game asset rendering.", category: "Game Art" },
  { id: "eldritch", name: "Lovecraftian Horror", promptSnippet: ", eldritch horror style, cosmic horror, tentacles, madness, dark fog, scary, creeping unease, detailed organic textures, bloodborne style", description: "Cosmic horror with creeping unease, organic textures, and dark fog.", category: "Digital Painting" },
  { id: "apose_concept", name: "A-Pose Concept Art", promptSnippet: ", standing in a strict A-pose, arms outstretched at 45 degrees, character design sheet, concept art turnaround, blank neutral background, symmetrical stance, high-end 3D game studio concept art, full body visible", description: "Forces the character into a strict A-pose ideal for 3D modeling reference or 2D rigging. Blank background, highly symmetrical.", category: "Game Art" },
  { id: "lost_ark_kr_arpg", name: "KR ARPG / Dark Gothic", promptSnippet: ", dark gothic-fantasy aesthetic, korean isometric arpg style, premium anime-influenced character design, high-contrast monochromatic scheme, obsidian black and pure white, painterly digital rendering, soft-brushed gradients, sharp technical borders, precise edge-highlights on metals, ethereal glassmorphism vfx", description: "High-fidelity dark gothic-fantasy typical of Korean ARPGs. Strong obsidian/white contrast, painterly rendering with precise metallic edges, and ethereal VFX.", category: "Game Art" },
  { id: "low_poly", name: "Low Poly 3D", promptSnippet: ", low poly style, 3d render, flat shading, geometric shapes, retro game aesthetic, sharp edges, vibrant", description: "3D render style with flat shading and visible geometric shapes.", category: "Game Art" },
  { id: "tapestry", name: "Medieval Tapestry", promptSnippet: ", medieval tapestry style, woven fabric texture, flat perspective, historical illustration, muted earth tones, embroidery details", description: "Woven fabric texture with flat perspective mimicking medieval embroidery.", category: "Traditional" },
  { id: "mosaic", name: "Mosaic", promptSnippet: ", mosaic style, tile art, fragmented images, grout lines, texture, ancient roman aesthetic, decorative", description: "Fragmented tile art with visible grout lines and ancient aesthetic.", category: "Traditional" },
  { id: "papercut", name: "Papercut / Diorama", promptSnippet: ", papercut art style, layered paper, shadow box effect, depth of field, craft aesthetic, simple shapes, textured paper", description: "Layered paper aesthetic with shadow box depth and simple, textured shapes.", category: "Abstract/UI" },
  { id: "sketchbook", name: "Pencil Sketch", promptSnippet: ", hand-drawn pencil sketch, cross-hatching, graphite textures, rough expressive lines, sketchbook aesthetic, graphite on paper", description: "An informal, artistic look that looks like it came straight from a concept artist's notebook.", category: "Traditional" },
  { id: "photorealistic", name: "Photorealistic / Lifelike", promptSnippet: ", photorealistic, 8k uhd, highly detailed lifelike texture, raw photo, f/1.8, cinematic lighting, sharp focus, highly detailed skin textures, realistic human eyes, professional studio photography, detailed hair strands, depth of field, [STRICT NEGATIVE]: no anime, no drawing, no illustration, no digital painting, no cartoon, no stylized features", description: "Hyper-realistic photographic style. Ideal for editing real human photos, portraits, or creating lifelike textures.", category: "Digital Painting" },
  { id: "post_apoc", name: "Post-Apocalyptic", promptSnippet: ", post-apocalyptic style, wasteland, ruins, rust, scavenged gear, dust, orange and teal, survivalist, mad max style", description: "Wasteland aesthetic with ruins, rust, dust, and scavenged gear.", category: "Digital Painting" },
  { id: "retro_8bit_micro", name: "Retro 8-bit Micro-Sprite", promptSnippet: ", 2d pixel art, 16x16 micro-sprite, retro 8-bit emulation, chibi proportions, exaggerated head-to-body ratio, abstracted facial features, single-pixel eyes, no mouth, limited color palette, flat fill, no shading, no gradients, no anti-aliasing, hard 1-pixel solid black border, top-down RPG style, sprite sheet layout, walk cycle frames", description: "Retro 2D pixel-art chibi sprite animation for top-down RPG games, using low resolution (16x16), limited colors, and frame-based sprite sheets.", category: "Retro" },
  { id: "retro_comic", name: "Retro Comic", promptSnippet: ", retro comic book style, bold black outlines, halftone patterns, vibrant flat colors, graphic novel aesthetic, dynamic composition, ben-day dots", description: "Bold black outlines, halftone patterns, and vibrant flat colors like old comics.", category: "Retro" },
  { id: "synthwave", name: "Retro Synthwave", promptSnippet: ", synthwave style, 80s retro, neon grid, magenta and cyan, sunset, futuristic, outrun aesthetic, digital glitch", description: "80s retro-futurism with neon grids, magenta/cyan palette, and sunsets.", category: "Retro" },
  { id: "stained_glass", name: "Stained Glass", promptSnippet: ", stained glass style, vibrant translucent colors, black lead outlines, light passing through, geometric patterns, religious art style", description: "Vibrant translucent colors separated by bold black lead outlines.", category: "Traditional" },
  { id: "steampunk", name: "Steampunk", promptSnippet: ", steampunk style, victorian era technology, brass and copper, gears, steam, intricate mechanical details, sepia tones", description: "Victorian technology with brass, copper, gears, and steam elements.", category: "Digital Painting" },
  { id: "storybook", name: "Storybook", promptSnippet: ", storybook illustration, hand drawn, colored pencil, texture, whimsical, soft edges, children's book style, beatrix potter inspired", description: "Hand-drawn, colored pencil look with soft edges suitable for children's books.", category: "Traditional" },
  { id: "tarot", name: "Tarot Card", promptSnippet: ", tarot card art style, symbolic, decorative, gold leaf details, heavy outlines, mystical, allegory, mucha inspired composition", description: "Symbolic and decorative with gold leaf details and heavy outlines.", category: "Traditional" },
  { id: "ukiyo_e", name: "Ukiyo-e Woodblock", promptSnippet: ", ukiyo-e style, japanese woodblock print, flat perspective, bold outlines, textured paper, traditional pigment colors, hokusai inspired", description: "Japanese woodblock print style with flat perspective and bold outlines.", category: "Traditional" },
  { id: "watercolor", name: "Watercolor", promptSnippet: ", watercolor style, soft edges, artistic, flowing colors, paper texture, dreamy", description: "Soft, flowing edges with paper texture and artistic, dreamy color blends.", category: "Traditional" }
];

// src/services/promptTemplates.ts
var resolveArtStyleSnippet = (styleInput, activeArtStyle, projectName, customStyles) => {
  if (!styleInput || !styleInput.trim()) {
    return activeArtStyle?.promptSnippet || "";
  }
  const raw = styleInput.trim();
  const lower = raw.toLowerCase();
  if (["none", "no style", "no_style"].includes(lower)) {
    return "";
  }
  if (["default", "project", "active", "current", "auto"].includes(lower)) {
    return activeArtStyle?.promptSnippet || "";
  }
  if (projectName) {
    const projLower = projectName.toLowerCase();
    if (lower === projLower || lower.includes(projLower) || projLower.includes(lower)) {
      if (activeArtStyle?.promptSnippet) {
        return activeArtStyle.promptSnippet;
      }
    }
  }
  if (lower.includes("kingdoms divided") || lower.includes("kingdoms diveded")) {
    const kdStyle = ART_STYLES.find((s) => s.id === "kingdoms_divided_char");
    if (kdStyle?.promptSnippet) return kdStyle.promptSnippet;
    if (activeArtStyle?.promptSnippet) return activeArtStyle.promptSnippet;
  }
  const allStyles = [...customStyles || [], ...ART_STYLES];
  const byId = allStyles.find((s) => s.id.toLowerCase() === lower);
  if (byId) return byId.promptSnippet;
  const byName = allStyles.find((s) => s.name.toLowerCase() === lower);
  if (byName) return byName.promptSnippet;
  const normalizedSearch = lower.replace(/\s+(art\s+)?style$/, "").trim();
  const bySub = allStyles.find(
    (s) => s.id.toLowerCase() === normalizedSearch || s.name.toLowerCase() === normalizedSearch || s.id.toLowerCase().includes(normalizedSearch) || s.name.toLowerCase().includes(normalizedSearch) || normalizedSearch.includes(s.id.toLowerCase()) || normalizedSearch.includes(s.name.toLowerCase())
  );
  if (bySub) return bySub.promptSnippet;
  if (raw.includes(",") || raw.split(/\s+/).length > 3) {
    return raw.startsWith(",") ? raw : `, ${raw}`;
  }
  if (activeArtStyle?.promptSnippet && !activeArtStyle.promptSnippet.toLowerCase().includes(lower)) {
    return `${activeArtStyle.promptSnippet}, ${raw}`;
  }
  return raw.startsWith(",") ? raw : `, ${raw}`;
};
var getShotDistanceFramingDirective = (framing) => {
  const norm = normalizeFramingId(framing);
  switch (norm) {
    case "extreme_close_up":
      return `
[CRITICAL OVERRIDE - FRAMING]: EXTREME CLOSE-UP (ECU). Extreme close-up shot: Focus intensely on a tiny facial detail, such as an eye, lips, or another specific feature. The detail fills the entire frame. No full face or body visible. This framing directive supersedes all others.
`;
    case "big_close_up":
      return `
[CRITICAL OVERRIDE - FRAMING]: BIG CLOSE-UP (BCU). Big close-up shot: Crop tightly to the character's entire face, from forehead to chin, with very little surrounding space. The face completely dominates the frame. No shoulders or torso visible. This framing directive supersedes all others.
`;
    case "close_up":
      return `
[CRITICAL OVERRIDE - FRAMING]: CLOSE-UP (CU). Close-up portrait: Character's head and face dominate the image; shoulders may be partially visible. Top of hair may touch the top frame edge. No lower torso or legs. This framing directive supersedes all others.
`;
    case "medium_close_up":
      return `
[CRITICAL OVERRIDE - FRAMING]: MEDIUM CLOSE-UP (MCU). Medium close-up portrait: Head and shoulders shot, typically cropped around the upper chest. Focus is on facial expressions and shoulder attire. This framing directive supersedes all others.
`;
    case "bust_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: BUST SHOT (BUST). Bust shot: Head, shoulders, and upper torso, usually ending around the chest. Arms cropped at mid-bicep. Lower torso, waist, and legs must NOT be visible. This framing directive supersedes all others.
`;
    case "medium_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: MEDIUM SHOT (MS). Medium shot / Waist-up portrait: Crop strictly from head to waist. Hands and waist-level props can be visible. Legs, knees, and feet must NOT be visible under any circumstance. Upper body fills 60-80% of the vertical frame. This framing directive supersedes all others.
`;
    case "medium_long_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: MEDIUM-LONG SHOT (MLS). Medium-long shot: Crop from head to mid-thigh. Shows more clothing, posture, and body language while retaining facial clarity. Knees and feet are cropped out. This framing directive supersedes all others.
`;
    case "three_quarter_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: THREE-QUARTER SHOT (3/4). Three-quarter shot: Crop from head to knees or lower legs. Shows almost the full body including posture and weapons, with feet cropped off. This framing directive supersedes all others.
`;
    case "american_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: AMERICAN SHOT (AS). American shot (Cowboy shot): Crop from head to mid-thigh, traditionally composed to clearly feature holstered weapons, belts, and confident posture. This framing directive supersedes all others.
`;
    case "full_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: FULL SHOT (FS). Full shot / Head-to-toe: The entire character from the top of the head to the bottom of the feet MUST be fully visible, filling most of the vertical frame. Do NOT cut off feet or head. This framing directive supersedes all others.
`;
    case "long_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: LONG SHOT (LS). Long shot: The entire character appears smaller in the frame with generous surrounding space and visible environment around them. Full body visible from head to toe. This framing directive supersedes all others.
`;
    case "extreme_long_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: EXTREME LONG SHOT (ELS). Extreme long shot: Character occupies a small part of the image; the vast surrounding environment dominates the composition. Character is small but recognizable. This framing directive supersedes all others.
`;
    case "very_wide_shot":
      return `
[CRITICAL OVERRIDE - FRAMING]: VERY WIDE SHOT (VWS). Very wide shot: Character is shown at a distance within a broad, expansive setting; used for establishing vast scale and environmental grandeur. This framing directive supersedes all others.
`;
    case "seated_desk":
      return `
[FRAMING & SPATIAL STAGING]: PULL-BACK WIDE MEDIUM SHOT. The character is sitting in a chair BEHIND a large wooden desk. The desk is placed horizontally across the foreground, between the character and the camera. The character's upper body and hands are visible behind the desk surface. The desk surface is clearly shown with parchment maps, books, and items on it. Camera is pulled back at a comfortable distance showing the room environment and desk in full context.
`;
    default:
      return `
[CRITICAL OVERRIDE - FRAMING]: FULL SHOT (FS). You MUST show the entire character from head to toe. This instruction supersedes any other framing instructions.
`;
  }
};
var detectPromptFraming = (prompt) => {
  if (!prompt) return null;
  const p = prompt.toLowerCase();
  if (/(full[\s-]?body|full[\s-]?shot|\bfs\b|head to toe|entire character)/i.test(p)) {
    return "full_shot";
  }
  if (/(extreme long[\s-]?shot|\bels\b)/i.test(p)) {
    return "extreme_long_shot";
  }
  if (/(very wide[\s-]?shot|\bvws\b|establishing scale)/i.test(p)) {
    return "very_wide_shot";
  }
  if (/(long[\s-]?shot|\bls\b|wide shot)/i.test(p)) {
    return "long_shot";
  }
  if (/(three[\s-]?quarter[\s-]?shot|\b3\/4\b|knee[\s-]?up)/i.test(p)) {
    return "three_quarter_shot";
  }
  if (/(american[\s-]?shot|\bas\b|cowboy[\s-]?shot)/i.test(p)) {
    return "american_shot";
  }
  if (/(medium[\s-]?long[\s-]?shot|\bmls\b|mid[\s-]?thigh shot)/i.test(p)) {
    return "medium_long_shot";
  }
  if (/(behind (?:a |the )?desk|behind (?:a |the )?table|sitting behind|seated behind)/i.test(p)) {
    return "seated_desk";
  }
  if (/(waist[\s-]?up|medium shot|\bms\b|half[\s-]?body|seated|sitting at (?:a )?desk|sitting at (?:a )?table|\bdesk\b)/i.test(p)) {
    return "medium_shot";
  }
  if (/(bust[\s-]?shot|\bbust\b|chest[\s-]?up|upper torso)/i.test(p)) {
    return "bust_shot";
  }
  if (/(extreme close[\s-]?up|\becu\b|macro face|eye close[\s-]?up|lips close[\s-]?up)/i.test(p)) {
    return "extreme_close_up";
  }
  if (/(big close[\s-]?up|\bbcu\b|full face close[\s-]?up)/i.test(p)) {
    return "big_close_up";
  }
  if (/(medium close[\s-]?up|\bmcu\b)/i.test(p)) {
    return "medium_close_up";
  }
  if (/(close[\s-]?up|\bcu\b|headshot|head[\s-]?shot|profile pic|profile picture|avatar)/i.test(p)) {
    return "close_up";
  }
  if (/\bportrait\b/i.test(p)) {
    return "medium_shot";
  }
  return null;
};
var isCharacterPrompt = (prompt) => {
  const characterKeywords = [
    "character",
    "person",
    "man",
    "woman",
    "girl",
    "boy",
    "knight",
    "mage",
    "warrior",
    "hero",
    "villain",
    "creature",
    "monster",
    "human",
    "elf",
    "dwarf",
    "orc",
    "goblin",
    "portrait",
    "full body",
    "standing",
    "pose",
    "outfit",
    "clothing",
    "face",
    "eyes",
    "hair",
    "skin",
    "body type",
    "anatomy",
    "npc",
    "player",
    "avatar",
    "soldier",
    "paladin",
    "rogue",
    "thief",
    "assassin",
    "priest",
    "cleric",
    "druid",
    "monk",
    "bard",
    "warlock",
    "sorcerer",
    "necromancer",
    "demon",
    "angel",
    "god",
    "goddess",
    "king",
    "queen",
    "prince",
    "princess",
    "lord",
    "lady",
    "villager",
    "merchant",
    "blacksmith",
    "guard"
  ];
  const p = prompt.toLowerCase();
  return characterKeywords.some((word) => p.includes(word));
};
var isMapPrompt = (prompt) => {
  const mapKeywords = [
    "map",
    "isometric",
    "3d map",
    "environment",
    "landscape",
    "terrain",
    "forest",
    "dungeon",
    "castle",
    "city",
    "town",
    "village",
    "room",
    "interior",
    "exterior",
    "world map",
    "region",
    "building",
    "structure",
    "architecture"
  ];
  const p = prompt.toLowerCase();
  return mapKeywords.some((word) => p.includes(word));
};
var isMagicCirclePrompt = (prompt) => {
  const magicKeywords = [
    "magic circle",
    "rune",
    "sigil",
    "pentagram",
    "glyph",
    "spell circle",
    "summoning circle",
    "arcane circle",
    "enchantment circle",
    "symbol",
    "icon",
    "logo",
    "crest",
    "emblem"
  ];
  const p = prompt.toLowerCase();
  return magicKeywords.some((word) => p.includes(word));
};
var buildUIReimaginePrompt = (userPrompt, gameContext, styleSnippet, changeBg, uiMood, uiElements, uiColors, uiArchetype, uiMaterial, lockPositions = false) => {
  let fullPrompt = `UI DESIGN & HUD OVERHAUL TASK.
`;
  fullPrompt += `OBJECTIVE: Create a professional, clear, and functional game interface layer.
`;
  if (uiArchetype) {
    fullPrompt += `INTERFACE ARCHETYPE: Use a ${uiArchetype.replace("-", " ")} structural framework.
`;
  }
  if (uiMaterial) {
    fullPrompt += `SURFACE MATERIAL: Apply a ${uiMaterial.replace("-", " ")} finish to all HUD elements.
`;
  }
  if (uiMood) {
    fullPrompt += `INTERFACE STYLE/MOOD: ${uiMood}
`;
  }
  if (uiColors) {
    fullPrompt += `COLOR THEME: Use Primary ${uiColors.primary} for accent/highlight and Secondary ${uiColors.secondary} for base elements. Ensure high contrast and legibility.
`;
  }
  if (uiElements && uiElements.length > 0) {
    fullPrompt += `COMPONENTS TO PRIORITIZE: ${uiElements.join(", ")}.
`;
  }
  fullPrompt += `CORE THEME: ${userPrompt || "Professional game interface"}
`;
  if (gameContext.setting || gameContext.tone) {
    fullPrompt += `NARRATIVE CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
`;
  }
  if (styleSnippet) {
    fullPrompt += `RENDER STYLE: ${styleSnippet}
`;
  }
  if (lockPositions) {
    fullPrompt += `
[STRICT LAYOUT LOCK]: RETAIN THE EXACT SPATIAL COORDINATES AND LAYOUT STRUCTURE of all existing UI components. Do NOT reposition buttons, health bars, or maps. Only reimagine their visual style and material.
`;
  }
  if (!changeBg) {
    fullPrompt += `
[STRICT CONSTRAINT]: PRESERVE ORIGINAL ART. Do NOT modify characters or the background environment. ONLY overlay the UI elements.
`;
  } else {
    fullPrompt += `
[PERMISSION]: REIMAGINE FULL SCENE. Adjust background art to seamlessly integrate with the new UI theme.
`;
  }
  fullPrompt += `
TECHNICAL QUALITY SPECS:
`;
  fullPrompt += `- NO GLOW/BLOOM ARTIFACTS: UI elements must be crisp and sharp.
`;
  fullPrompt += `- LEGIBILITY: HUD components must contrast strongly with the art behind them.
`;
  fullPrompt += `- CONSISTENCY: Ensure all elements share the same material and lighting source.`;
  return fullPrompt;
};
var processReferenceNotes = (referenceAssets) => {
  const referenceParts = [];
  referenceAssets.forEach((asset, index) => {
    let guidance = (asset.roleNote || "").trim();
    if (!guidance) {
      guidance = `PRIMARY CHARACTER/SUBJECT ANCHOR. Faithfully preserve the facial features, hairstyle, skin tone, clothing, and distinguishing aesthetic characteristics from Reference ${index + 1}.`;
    } else if (guidance.toLowerCase().includes("mannequin") || guidance.toLowerCase().includes("pose")) {
      guidance = `CRITICAL IDENTITY & POSE LOCK. Strictly replicate the facial structure, eye shape, body proportions, posture, and skin color from Reference ${index + 1}. Treat this reference as an immutable wireframe skeleton.`;
    } else if (guidance.toLowerCase().includes("style") || guidance.toLowerCase().includes("aesthetic")) {
      guidance = `STRICT AESTHETIC & STYLE SYNC. Match the exact rendering technique, line weight, color palette, lighting, and shading style from Reference ${index + 1}.`;
    } else if (guidance.toLowerCase().includes("look") || guidance.toLowerCase().includes("appearance") || guidance.toLowerCase().includes("clothes") || guidance.toLowerCase().includes("anchor") || guidance.toLowerCase().includes("identity")) {
      guidance = `IDENTITY & COSTUME ANCHOR. Use Reference ${index + 1} for character appearance, face, clothing, and features. Render the subject in the pose and composition described in the main prompt.`;
    }
    referenceParts.push({
      text: `Reference Image ${index + 1} Directives: ${guidance}`
    });
  });
  return referenceParts;
};
var buildClothesPrompt = (prompt, gameContext, styleSnippet, bgConfig, referenceAssets, safeZone, clothesParams) => {
  let fullPrompt = `CLOTHES DESIGN & ASSET SYNTHESIS.
`;
  if (clothesParams?.renderMode === "asset") {
    fullPrompt += `[STRICT NEGATIVE CONSTRAINT - MANDATORY]: ZERO BIOLOGICAL MATTER. Erase the character. NO face, NO eyes, NO skin, NO hair, NO hands, NO neck. The image MUST ONLY contain the clothing items.
`;
    fullPrompt += `OBJECTIVE: Render a HOLLOW GHOST OUTFIT as a 3D garment asset. The clothes must appear as if worn by an invisible void.
`;
  } else {
    fullPrompt += `OBJECTIVE: Render high-quality game assets.
`;
    fullPrompt += `[VISUAL INTEGRITY]: PRESERVE ALL CHARACTER FEATURES. Maintain skin color, facial structure, and hair identity exactly as seen in references.
`;
  }
  fullPrompt += `[STRICT STYLE RULE]: Adhere strictly to the illustrative/game-art style provided.
`;
  fullPrompt += `[STRICT NEGATIVE CONSTRAINT]: NO TEXT. NO labels. NO watermarks. NO signatures. NO UI elements. NO speech bubbles.
`;
  fullPrompt += `SUBJECT: ${prompt}
`;
  if (prompt.toLowerCase().includes("undead") || prompt.toLowerCase().includes("skeleton") || prompt.toLowerCase().includes("skull")) {
    fullPrompt += `
[CRITICAL UNDEAD ANATOMY]: If the character is undead or skeletal, you MUST keep the skull structurally sound with the LOWER JAW INTACT AND ATTACHED. Do not render missing lower jaws. Ensure the head is PROPORTIONATE to the body width, do not make the head excessively large.
`;
  }
  if (clothesParams) {
    fullPrompt += `LAYOUT: ${clothesParams.layout === "spread" ? "Multi-view orthographic fashion sheet (Front/Back/Detail)." : "Single, centered view."}
`;
    if (clothesParams.lockPose) {
      fullPrompt += `
[STRICT POSE LOCK]: You MUST PRESERVE the exact body posture and stance shown in the main character reference. Do NOT alter the orientation.
`;
    }
    if (clothesParams.framing) {
      fullPrompt += getShotDistanceFramingDirective(clothesParams.framing);
    }
  }
  if (gameContext.setting || gameContext.tone) {
    fullPrompt += `WORLD CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
`;
  }
  if (styleSnippet) {
    fullPrompt += `[STYLE SNIPPET]: ${styleSnippet}
`;
  }
  if (bgConfig.mode === "transparent" || bgConfig.mode === "transparent_neo") {
    const key = bgConfig.mode === "transparent" ? "#FFFFFF" : bgConfig.keyColor || "#FFFFFF";
    const colorName = key === "#000000" ? "BLACK" : key === "#FFFFFF" ? "WHITE" : key === "#00FF00" ? "GREEN" : "MAGENTA";
    fullPrompt += `
[STRICT OVERRIDE - BACKGROUND]:
`;
    fullPrompt += `- IGNORE all environment descriptions.
`;
    fullPrompt += `- Render the subject on a SOLID ${colorName} (${key}) background.
`;
    fullPrompt += `- The background MUST be perfectly flat with NO texture, NO shadows, and NO lighting gradients.
`;
  } else if (bgConfig.mode === "solid") {
    fullPrompt += `
[MANDATORY]: Render on a FLAT SOLID ${bgConfig.color} background.
`;
  } else if (bgConfig.mode === "prompt_only") {
    fullPrompt += `
BACKGROUND: ${bgConfig.promptFragment}
`;
  } else if (bgConfig.mode === "none") {
    fullPrompt += `
BACKGROUND: Entirely empty, minimalist, or pure white background with NO environmental detail.
`;
  } else if (bgConfig.mode === "scene") {
    fullPrompt += `
BACKGROUND: ${bgConfig.promptFragment || "Detailed environmental scene"}.
`;
  } else {
    fullPrompt += `
BACKGROUND: Balanced environmental complexity.
`;
  }
  if (safeZone?.enabled) {
    fullPrompt += `
COMPOSITION: Center the subject within the inner ${Math.round(safeZone.width)}% safe zone.
`;
  }
  const referenceParts = processReferenceNotes(referenceAssets);
  return { textPrompt: fullPrompt, referenceParts };
};
var buildChibiFragment = (config) => {
  if (!config.enabled) return "";
  let fragment = "[STRICT CHIBI AESTHETIC - SUPER DEFORMED STYLE]\n";
  fragment += "CRITICAL INSTRUCTION: Chibi (super-deformed style) is NOT just a big head on a standard body.\n";
  fragment += "It is a COMPLETE proportional and stylistic transformation of the whole character.\n";
  fragment += "DO NOT make the same body as the reference body with a big head. That is a failure.\n\n";
  fragment += "1. PROPORTIONS (Most Important):\n";
  if (config.bodyRatio) {
    const ratioParts = config.bodyRatio.split(":");
    const ratioVal = ratioParts.length === 2 ? parseFloat(ratioParts[1]) : 2;
    fragment += `- Head-to-body ratio is exactly 1:${ratioVal}. Head is exactly ${Math.round(100 / ratioVal)}% of total height.
`;
  } else if (config.presetProportion && CHIBI_STYLE_CONFIG[config.presetProportion]) {
    fragment += `- ${CHIBI_STYLE_CONFIG[config.presetProportion].suffix}
`;
  } else {
    fragment += "- Head-to-body ratio: 1:2 to 1:4 max. Head is 50% or more of total height.\n";
  }
  fragment += "- Entire body MUST BE scaled down and simplified to match the head.\n";
  fragment += "- Limbs are short and stubby, NOT realistic length.\n";
  fragment += "\n2. BODY STRUCTURE:\n";
  fragment += "- Torso: very short, almost compressed.\n";
  if (config.bodyStyle === "geometric") {
    fragment += "- Arms/legs: geometric limb simplification, cylindrical arms/legs.\n";
  } else {
    fragment += "- Arms/legs: simplified, rounded (stubby proportions).\n";
  }
  fragment += "- Hands/feet: small, minimal detail. Chunky.\n";
  fragment += "- NO realistic anatomy or muscle structure whatsoever. Reject adult body proportions entirely.\n";
  fragment += "\n3. DETAIL LEVEL:\n";
  if (config.focus === "kawaii") {
    fragment += "- Kawaii aesthetic focus, extremely cute, flat colors, bold expressive features.\n";
  } else {
    fragment += "- Semi-realistic detailed chibi, professional texturing and shading, but still structurally super-deformed.\n";
  }
  fragment += "- Clothing and armor MUST be simplified.\n";
  fragment += "- Remove small intricate details; use clean shapes instead of realism.\n";
  fragment += "\n4. FACE STYLE:\n";
  if (config.headStyle === "moe") {
    fragment += "- Ultra-cute Moe face (if visible), huge expressive sparkly eyes.\n";
  } else {
    fragment += "- Large eyes, simplified features.\n";
  }
  fragment += "- Minimal nose/mouth.\n";
  fragment += "- Expression is simplified and can be exaggerated.\n";
  fragment += "- Respect facial visibility: If the character wears a closed helmet or mask in references, keep it closed and do not add visible eyes or an open face.\n";
  fragment += "\n[CRITICAL - ACCESSORIES & FEATURES]: You MUST preserve all secondary character features from references, including wings, tails, horns, capes, quivers, weapons, and specialized equipment. Do NOT simplify these away. Render them in a scale-appropriate way for the chibi body, but ensure they are clearly visible and detailed. If the reference has wings, the chibi MUST have wings.\n\n";
  fragment += "[CRITICAL - MOUNTS & COMPANIONS]: If the character is riding a mount (e.g., horse, wolf, dragon) or has an animal companion, the MOUNT/COMPANION MUST ALSO BE RENDERED IN CHIBI STYLE to match the rider. The mount must have a large head, short stubby body and legs, and simplified features (standard anime chibi, not overly cute/moe). DO NOT render a chibi character on a realistically proportioned mount. Both must be fully super-deformed.\n\n";
  return fragment;
};
var buildIllustrationPrompt = (basePrompt, gameContext, styleSnippet, bgConfig, referenceAssets, safeZone, continuityFlags, chibiProportion, chibiConfig, viewpoint, noCharacters, framing, characterTool) => {
  let fullPrompt = "";
  if (gameContext.setting || gameContext.tone || gameContext.visualConstraints) {
    fullPrompt += `GAME CONTEXT:
`;
    if (gameContext.setting) fullPrompt += `Setting: ${gameContext.setting}
`;
    if (gameContext.tone) fullPrompt += `Tone: ${gameContext.tone}
`;
    if (gameContext.visualConstraints) {
      fullPrompt += `Constraints: ${gameContext.visualConstraints}
`;
    }
    fullPrompt += `(Ensure the result strictly fits this setting and tone.)

`;
  }
  fullPrompt += `SUBJECT: ${basePrompt}
`;
  const characterLikely = noCharacters ? false : isCharacterPrompt(basePrompt);
  const mapLikely = isMapPrompt(basePrompt);
  const magicCircleLikely = isMagicCirclePrompt(basePrompt);
  if (noCharacters) {
    fullPrompt += `[STRICT NEGATIVE CONSTRAINT]: NO CHARACTERS. NO PEOPLE. NO CREATURES. NO ANIMALS. NO HUMANOIDS. The image MUST strictly be an environment, prop, object, or scene without any living subjects.
`;
  }
  if (viewpoint && viewpoint !== "none") {
    fullPrompt += `VIEWPOINT: ${viewpoint.replace("-", " ").toUpperCase()} perspective.
`;
    if (viewpoint === "top-down") fullPrompt += `- Camera is positioned directly above the subject looking straight down. Render as a 3D top-down perspective with visible depth and verticality.
`;
    else if (viewpoint === "high-angle") fullPrompt += `- Camera is positioned above the subject looking down at an angle.
`;
    else if (viewpoint === "low-angle") fullPrompt += `- Camera is positioned below the subject looking up, creating a sense of scale.
`;
    else if (viewpoint === "back") fullPrompt += `- Subject is seen from behind, facing away from the camera.
`;
    else if (viewpoint === "side") fullPrompt += `- Subject is seen from a side profile perspective.
`;
    else if (viewpoint === "three-quarter") fullPrompt += `- Subject is seen from a three-quarter angle.
`;
    else if (viewpoint === "isometric") fullPrompt += `- Subject is rendered in a 45-degree isometric perspective.
`;
    else if (viewpoint === "cinematic") fullPrompt += `- Use dramatic cinematic framing and wide-angle perspective.
`;
  }
  const detectedFraming = detectPromptFraming(basePrompt);
  let effectiveFraming = null;
  if (characterTool?.enabled) {
    effectiveFraming = framing || detectedFraming || "full_shot";
  } else if (detectedFraming) {
    effectiveFraming = detectedFraming;
  } else if (framing && framing !== "full_shot" && framing !== "full-body") {
    effectiveFraming = framing;
  }
  if (characterTool?.enabled) {
    if (characterTool.poseDescription && characterTool.poseDescription.trim()) {
      fullPrompt += `
[CHARACTER POSE & ACTION]: ${characterTool.poseDescription.trim()}
`;
    }
    if (characterTool.lookTarget) {
      fullPrompt += `
[EYE GAZE & LOOK DIRECTION]: The subject's eyes and head MUST look towards canvas target point (${characterTool.lookTarget.x.toFixed(1)}%, ${characterTool.lookTarget.y.toFixed(1)}%).
`;
    }
  }
  if (effectiveFraming && characterLikely) {
    fullPrompt += getShotDistanceFramingDirective(effectiveFraming);
  }
  fullPrompt += `[STRICT NEGATIVE CONSTRAINT]: NO TEXT. NO labels. NO watermarks. NO signatures. NO UI elements. NO speech bubbles. The image MUST be pure artwork.
`;
  if (referenceAssets.length > 0) {
    if (characterLikely) {
      fullPrompt += `[STRICT CONSTRAINT]: Maintain exact character features, skin color, and ALL accessories from references (wings, tails, horns, weapons, quivers, capes). If the character in the reference has a closed helmet, mask, or obscured face, you MUST maintain that obscured face. Do NOT force eyes or an open helmet if the reference shows a closed one. Do NOT copy the framing, camera distance, or crop of the reference image; the reference is ONLY for character design, face, costume, and art style. Staging, camera distance, and pose must follow the prompt.
`;
    } else {
      fullPrompt += `[STRICT CONSTRAINT]: Maintain exact visual design, colors, and style from references.
`;
    }
  }
  if (characterLikely) {
    if (chibiConfig?.enabled) {
      fullPrompt += buildChibiFragment(chibiConfig) + "\n";
    } else if (chibiProportion && CHIBI_STYLE_CONFIG[chibiProportion]) {
      fullPrompt += `ANATOMY GUIDELINE: ${CHIBI_STYLE_CONFIG[chibiProportion].suffix}
`;
    }
  }
  const effectiveStyle = resolveArtStyleSnippet(styleSnippet);
  if (effectiveStyle) {
    fullPrompt += `STYLE: ${effectiveStyle.replace(/^,\s*/, "")}
`;
    fullPrompt += `(Ensure the style strictly matches the above snippet, do not revert to realism or generic defaults.)
`;
  } else {
    fullPrompt += `STYLE: Clean, neutral, high-quality digital art without additional stylistic flourishes.
`;
  }
  if (continuityFlags) {
    const activeFlags = Object.entries(continuityFlags).filter(([_, active]) => active);
    if (activeFlags.length > 0) {
      fullPrompt += `
STYLE CONTINUITY DIRECTIVES:
`;
      activeFlags.forEach(([key]) => {
        if (key === "Sharp Black Outlines") fullPrompt += `- Use bold, sharp black outlines for all subject edges.
`;
        else if (key === "Clean Cel-Shading") fullPrompt += `- Use clean, professional cel-shading with clear highlight/shadow separation.
`;
        else if (key === "Metallic Texture Sync") fullPrompt += `- Render all metallic surfaces with consistent high-reflectivity sheen.
`;
        else if (key === "Ambient Lighting Lock") fullPrompt += `- Maintain consistent ambient lighting from the top-right across all related assets.
`;
        else if (key === "Palette Adherence") fullPrompt += `- Strictly stick to the established character palette. No stray colors.
`;
        else if (key === "Viewpoint Continuity") fullPrompt += `- CRITICAL: Maintain exact eye-level camera perspective. Do NOT use high or low angles.
`;
        else if (key === "Background Isolation") fullPrompt += `- Ensure subject is clearly separated from background with distinct visual contrast.
`;
        else if (key === "Character Consistency" && characterLikely) fullPrompt += `- Adhere strictly to character design features across all requested formats.
`;
        else if (key === "Character Consistency" && !characterLikely) fullPrompt += `- Adhere strictly to the established visual design across all requested formats.
`;
        else fullPrompt += `- ${key}
`;
      });
    }
  }
  if (referenceAssets.length > 0) {
    fullPrompt += `
REFERENCE VISUAL CONSISTENCY (CRITICAL):
`;
    fullPrompt += `You have been provided with reference images. You MUST strictly adhere to the visual design shown in these references.
`;
    if (characterLikely) {
      fullPrompt += `1. IDENTITY: Maintain the exact facial features, hair style, skin color, and body type.
`;
      fullPrompt += `2. CLOTHING: Keep the character's outfit EXACTLY as seen in the references. Do not redesign, simplify, or change colors.
`;
    } else {
      fullPrompt += `1. VISUAL IDENTITY: Maintain the exact design, features, and colors of the subject.
`;
      fullPrompt += `2. DETAILS: Keep the subject's specific details EXACTLY as seen in the references. Do not redesign, simplify, or change colors.
`;
    }
    fullPrompt += `3. STYLE: Use the art style from the references if specified.
`;
    fullPrompt += `
INSTRUCTION FOR POSE & COMPOSITION:
`;
    if (characterLikely) {
      fullPrompt += `Use the references ONLY for character details. 
`;
    } else {
      fullPrompt += `Use the references ONLY for subject details. 
`;
    }
    fullPrompt += `DO NOT copy the composition, pose, or distance of the references.
`;
    fullPrompt += `FOLLOW the SUBJECT description above for current pose and scene.
`;
  }
  if (!characterLikely && (mapLikely || magicCircleLikely)) {
    fullPrompt += `
[STRICT CONSTRAINT]: Focus ONLY on the ${basePrompt}. DO NOT generate any characters, people, or creatures in the scene.
`;
  }
  if (basePrompt.toLowerCase().includes("undead") || basePrompt.toLowerCase().includes("skeleton") || basePrompt.toLowerCase().includes("skull")) {
    fullPrompt += `
[CRITICAL UNDEAD ANATOMY]: If the character is undead or skeletal, you MUST keep the skull structurally sound with the LOWER JAW INTACT AND ATTACHED. Do not render missing lower jaws. Ensure the head is PROPORTIONATE to the body width, do not make the head excessively large.
`;
  }
  if (safeZone && safeZone.enabled) {
    fullPrompt += `
COMPOSITION (IMPORTANT - ZOOM OUT): 
`;
    fullPrompt += `Compose the scene so that the MAIN SUBJECT is strictly contained within the CENTRAL ${Math.round(
      safeZone.width
    )}% width and ${Math.round(safeZone.height)}% height of the image.
`;
    fullPrompt += `The outer areas must be EXTENDED BACKGROUND filler.
`;
  }
  fullPrompt += `
BACKGROUND:
`;
  if (bgConfig.mode === "transparent" || bgConfig.mode === "transparent_neo") {
    const key = bgConfig.mode === "transparent" ? "#FFFFFF" : bgConfig.keyColor || "#FFFFFF";
    const colorName = key === "#000000" ? "BLACK" : key === "#FFFFFF" ? "WHITE" : key === "#00FF00" ? "GREEN" : "MAGENTA";
    fullPrompt += `[STRICT OVERRIDE]: IGNORE all other background descriptions. You MUST render the subject on a perfectly FLAT SOLID ${colorName} BACKGROUND (Hex ${key}).
`;
    fullPrompt += `Absolutely NO texture, NO depth, and NO environmental details.
`;
  } else if (bgConfig.mode === "solid") {
    if (bgConfig.gradientType === "linear") {
      fullPrompt += `Use a smooth linear gradient background: ${bgConfig.color} to ${bgConfig.secondaryColor || "#000000"}.
`;
    } else if (bgConfig.gradientType === "radial") {
      fullPrompt += `Use a smooth radial gradient background: radiating from ${bgConfig.color} at the center to ${bgConfig.secondaryColor || "#000000"} at the edges.
`;
    } else {
      fullPrompt += `Use a flat, solid background color: ${bgConfig.color}. No detailed scene, no gradients.
`;
    }
    if (bgConfig.promptFragment) {
      fullPrompt += `Background atmosphere hints: ${bgConfig.promptFragment}
`;
    }
  } else if (bgConfig.mode === "pattern" && bgConfig.patternType) {
    const type = bgConfig.patternType;
    fullPrompt += `Background Style: ${type.toUpperCase()} PATTERN.
`;
    if (bgConfig.promptFragment) {
      fullPrompt += `Pattern specifics: ${bgConfig.promptFragment}
`;
    }
  } else if (bgConfig.mode === "scene" && bgConfig.promptFragment) {
    fullPrompt += `Background specifics: ${bgConfig.promptFragment}
`;
  } else if (bgConfig.mode === "prompt_only") {
    fullPrompt += `[STRICT]: Only follow this specific background instruction: ${bgConfig.promptFragment || "Empty minimalist background"}.
`;
    fullPrompt += `Do NOT add environmental details not mentioned here.
`;
  } else if (bgConfig.mode === "none") {
    fullPrompt += `Make the background entirely empty, minimalist, or non-existent. NO environmental detail. Focus purely on the subject.
`;
  } else if (bgConfig.mode === "auto") {
    fullPrompt += `Background complexity: Balanced. Let AI decide based on prompt context.
`;
  } else {
    fullPrompt += `Background complexity: Balanced.
`;
  }
  if (!bgConfig.allowTransparency && bgConfig.mode !== "transparent" && bgConfig.mode !== "transparent_neo") {
    fullPrompt += `Ensure the background is fully opaque.
`;
  }
  const referenceParts = processReferenceNotes(referenceAssets);
  return { textPrompt: fullPrompt, referenceParts };
};
var buildExtractClothesPrompt = (gameContext, bgConfig) => {
  let bgInstruction = "";
  if (bgConfig.mode === "transparent" || bgConfig.mode === "transparent_neo") {
    const key = bgConfig.mode === "transparent" ? "#FFFFFF" : bgConfig.keyColor || "#FFFFFF";
    const colorName = key === "#000000" ? "BLACK" : key === "#FFFFFF" ? "WHITE" : key === "#00FF00" ? "GREEN" : "MAGENTA";
    bgInstruction = `[MANDATORY]: Render the result on a perfectly FLAT SOLID ${colorName} BACKGROUND (${key}) ONLY. No environmental detail.`;
  } else if (bgConfig.mode === "solid") {
    bgInstruction = `Render the result on a FLAT SOLID BACKGROUND of color ${bgConfig.color}.`;
  } else {
    bgInstruction = `Render the background as: ${bgConfig.promptFragment || "A clean, minimalist studio background"}.`;
  }
  return `[EXTRACTION TASK]: TOTAL ANATOMY REMOVAL.
1. ACTION (MANDATORY): Erase the entire character. Remove all skin, remove all hair, remove face, remove eyes, remove hands, remove biological features. 
2. PRESERVE (CRITICAL): ALL CLOTHING PIECES. You MUST keep the shirt, pants, boots, and armor as a complete OUTFIT SET. Do NOT leave just one item; keep the entire layered ensemble exactly as seen.
3. STRUCTURE: The clothes should retain their 3D shape and volume as if worn by an INVISIBLE GHOST MANNEQUIN.
4. BACKGROUND: ${bgInstruction}
Context: ${gameContext.setting || "High-end gaming asset"}.`;
};
var buildFramePrompt = (prompt, gameContext, styleSnippet, frameElements) => {
  return `TASK: Generate a card frame or UI border.
SUBJECT: ${prompt}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
STYLE: ${styleSnippet}
ELEMENTS TO INCLUDE: ${frameElements.join(", ")}.`;
};
var buildBackgroundAssetPrompt = (prompt, gameContext, styleSnippet, bgPatternType) => {
  return `TASK: Generate a background asset.
SUBJECT: ${prompt}
PATTERN TYPE: ${bgPatternType}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
STYLE: ${styleSnippet}`;
};
var buildCardSuggestionsPrompt = (artPrompt, currentName) => {
  return `Based on this artwork description: "${artPrompt}" and current card name: "${currentName}", suggest 5 unique fantasy card names and 3 ability descriptions.
Return JSON format: { "names": ["...", "..."], "effects": ["...", "..."] }`;
};
var buildSpriteSheetPromptsPrompt = (globalPrompt, frameCount, gameContext) => {
  return `TASK: Suggest a sequence of ${frameCount} distinct character poses or variations for a sprite sheet.
CHARACTER DESCRIPTION: ${globalPrompt}
GAME CONTEXT: ${gameContext.setting}. ${gameContext.tone}.

Return a JSON object with:
- "poses": An array of ${frameCount} strings, each being a short, descriptive prompt for a single frame (e.g. "Standing idle, front view", "Swinging a sword, side view").
- "refinedGlobalPrompt": A slightly improved version of the character description for better AI consistency.`;
};
var buildPoseDescription = (poseData) => {
  if (!poseData.joints || poseData.joints.length === 0) return "";
  let description = "CRITICAL: SKELETAL POSE GUIDE (Normalized 0-100 Canvas Coordinates):\n";
  description += "The character's anatomy MUST be built exactly upon these spatial anchors. Do NOT deviate from these coordinates.\n";
  poseData.joints.forEach((j) => {
    description += `- ${j.name.toUpperCase()}: [X:${Math.round(j.x)}, Y:${Math.round(j.y)}]
`;
  });
  description += "\n[ANATOMICAL CONSTRAINTS]:\n";
  description += "- The character's head must be centered at the HEAD coordinate.\n";
  description += "- Limbs must connect logically (Shoulder -> Elbow -> Wrist) following the provided points.\n";
  description += "- The overall silhouette and posture MUST match the skeletal structure defined by these points.\n";
  description += "- This is a spatial requirement, not just a suggestion. Treat these points as a hard wireframe.";
  return description;
};
var buildPoseStudioPrompt = (basePrompt, gameContext, styleSnippet, bgConfig, referenceAssets, poseData, safeZone) => {
  const { textPrompt, referenceParts } = buildIllustrationPrompt(
    basePrompt,
    gameContext,
    styleSnippet,
    bgConfig,
    referenceAssets,
    safeZone
  );
  let fullPrompt = `POSE-DRIVEN CHARACTER GENERATION.
`;
  fullPrompt += buildPoseDescription(poseData) + "\n\n";
  fullPrompt += textPrompt;
  return { textPrompt: fullPrompt, referenceParts };
};
var buildMapGridPrompt = (userPrompt, gameContext, styleSnippet, config) => {
  let fullPrompt = `MAP GRID GENERATION TASK.
`;
  fullPrompt += `OBJECTIVE: Generate a clean 2D game map image. NO characters. NO UI. NO HUD. NO text. NO borders.
`;
  fullPrompt += `VIEW MODE: ${config.viewMode === "top-down" ? "Top-Down (Orthographic 2D)" : "Isometric (2.5D angled view)"}.
`;
  if (config.viewMode === "top-down") {
    fullPrompt += `- Flat orthographic projection.
`;
    fullPrompt += `- Consistent lighting.
`;
    fullPrompt += `- Shadow only under walls/decor.
`;
    fullPrompt += `- Tile-aligned decorations.
`;
  } else {
    fullPrompt += `- 45-degree diamond grid.
`;
    fullPrompt += `- Proper depth layering.
`;
    fullPrompt += `- Wall height extrusion.
`;
    fullPrompt += `- Soft directional shadow.
`;
    fullPrompt += `- Height-based occlusion.
`;
  }
  fullPrompt += `GRID CONFIGURATION: ${config.gridWidth}x${config.gridHeight} cells. Cell size: ${config.cellSize}px.
`;
  if (config.preset !== "custom") {
    const presetName = config.preset.replace("_", " ");
    fullPrompt += `ENVIRONMENT PRESET: ${presetName}.
`;
  }
  fullPrompt += `STYLE CONTROLS:
`;
  fullPrompt += `- Primary Floor Color: ${config.primaryColor}
`;
  fullPrompt += `- Secondary Accent Color: ${config.accentColor}
`;
  fullPrompt += `- Shadow Intensity: ${config.shadowIntensity}%
`;
  fullPrompt += `- Light Direction: ${config.lightDirection.replace("-", " ")}
`;
  fullPrompt += `- Detail Density: ${config.detailDensity}
`;
  fullPrompt += `- Decoration Level: ${config.decorationLevel}
`;
  fullPrompt += `
CORE DESCRIPTION: ${userPrompt || "A detailed game map"}
`;
  if (gameContext.setting || gameContext.tone) {
    fullPrompt += `NARRATIVE CONTEXT: ${gameContext.setting}. ${gameContext.tone}.
`;
  }
  if (styleSnippet) {
    fullPrompt += `RENDER STYLE: ${styleSnippet}
`;
  }
  if (config.transparentBackground) {
    fullPrompt += `
[STRICT CONSTRAINT]: Render with a TRANSPARENT background where applicable (e.g. outside the map boundaries).
`;
  }
  fullPrompt += `
[FINAL REMINDER]: ONLY generate environment and decorations. ABSOLUTELY NO CHARACTERS OR UI ELEMENTS.`;
  return fullPrompt;
};
var buildPropsExtractionPrompt = (granularity = "standard", mergeSymmetrical = true, includeHeadBody = false) => {
  const counts = {
    minimal: "5 to 7 key macro items",
    standard: "8 to 10 distinct items",
    detailed: "12 to 16 detailed items (including trim, secondary clasps, straps, and accessories)"
  }[granularity] || "8 to 10 distinct items";
  return `You are an expert game art asset director and 2D/3D concept pipeline analyzer (similar to Lychee Studio Props Extraction).
Carefully analyze the attached character / reference image and deconstruct it into its individual equipment, clothing, accessory, and weapon assets.

EXTRACTION GUIDELINES:
1. Extract exactly ${counts}.
2. Symmetrical items: ${mergeSymmetrical ? 'MERGE left and right pairs into a single prop entry (e.g., "Pair of Leather Boots", "Steel Gauntlets").' : "SEPARATE left and right items if they exhibit distinct asymmetrical features."}
3. Head & Anatomy: ${includeHeadBody ? "INCLUDE head, facial features, hairstyle, and body anatomy as distinct prop/anatomy items." : "EXCLUDE basic anatomy and facial features. Focus strictly on removable clothing, armor, belts, jewelry, weapons, footwear, and carried gear."}
4. For every extracted prop, provide:
   - "id": A clean snake_case identifier (e.g., "prop_01_rapier")
   - "name": Concise descriptive name (e.g., "Duelist's Ornate Rapier")
   - "category": One of ["weapon", "outerwear", "undergarment", "footwear", "accessory", "headgear", "anatomy", "fx"]
   - "visual_description": Precise physical description from the image (colors, materials, embroidery, weathering, metal type, gems)
   - "generation_ready_prompt": An isolated, self-contained text-to-image prompt to synthesize or model this exact single prop on an absolute clean flat white background (#FFFFFF) with high detail and zero characters attached.

OUTPUT FORMAT:
Respond with a clear character summary, followed by a valid JSON block enclosed in \`\`\`json:
{
  "character_summary": "Brief visual summary of character archetype, color palette, and style",
  "props": [
    {
      "id": "prop_01_...",
      "name": "...",
      "category": "...",
      "visual_description": "...",
      "generation_ready_prompt": "... isolated on flat white background (#FFFFFF), clean high contrast game asset, no characters, solo item"
    }
  ]
}

Also provide a clean, readable Markdown table summarizing all extracted props.`;
};

// src/mcp/index.ts
import fs2 from "fs";
import path2 from "path";

// src/mcp/beiClient.ts
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
var BRIDGE_PORT = Number(process.env.BEI_PORT) || 58925;
var WEB_PORT = Number(process.env.PORT) || 3488;
function resolveProjectRoot() {
  if (process.env.MYTHICFRAME_ROOT && fs.existsSync(process.env.MYTHICFRAME_ROOT)) {
    return path.resolve(process.env.MYTHICFRAME_ROOT);
  }
  const isMythicFrameDir = (dir) => {
    try {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.name === "mythicframe") return true;
      }
    } catch {
    }
    return fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "src"));
  };
  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (isMythicFrameDir(currentDir)) return currentDir;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  if (process.argv[1]) {
    let scriptDir = path.dirname(path.resolve(process.argv[1]));
    for (let i = 0; i < 5; i++) {
      if (isMythicFrameDir(scriptDir)) return scriptDir;
      const parent = path.dirname(scriptDir);
      if (parent === scriptDir) break;
      scriptDir = parent;
    }
  }
  return process.cwd();
}
var PROJECT_ROOT = resolveProjectRoot();
async function checkMythicStatus() {
  let bridgeRunning = false;
  let beiConnected = false;
  let tabs = [];
  let accounts = [];
  let activeJobsCount = 0;
  let serverRunning = false;
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/status`, {
      signal: AbortSignal.timeout(2e3)
    });
    if (res.ok) {
      bridgeRunning = true;
      const data = await res.json();
      beiConnected = !!data.connected;
      tabs = data.tabs || [];
      accounts = data.accounts || [];
      activeJobsCount = data.activeJobsCount || 0;
    }
  } catch {
  }
  try {
    const res = await fetch(`http://localhost:${WEB_PORT}/api/bei/status`, {
      signal: AbortSignal.timeout(2e3)
    });
    if (res.ok) {
      serverRunning = true;
    }
  } catch {
  }
  let hasGeminiApiKey = false;
  try {
    const envLocal = path.join(PROJECT_ROOT, ".env.local");
    const envFile = path.join(PROJECT_ROOT, ".env");
    if (fs.existsSync(envLocal)) {
      const txt = fs.readFileSync(envLocal, "utf8");
      if (/GEMINI_API_KEY=\S+/.test(txt)) hasGeminiApiKey = true;
    }
    if (!hasGeminiApiKey && fs.existsSync(envFile)) {
      const txt = fs.readFileSync(envFile, "utf8");
      if (/GEMINI_API_KEY=\S+/.test(txt)) hasGeminiApiKey = true;
    }
    if (!hasGeminiApiKey && process.env.GEMINI_API_KEY) {
      hasGeminiApiKey = true;
    }
  } catch {
  }
  const availableEngines = ["prompt-only"];
  if (beiConnected && tabs.some((t) => t.target === "gemini" || t.target === "chatgpt")) {
    availableEngines.unshift("bei");
  }
  if (hasGeminiApiKey) {
    availableEngines.push("gemini-api");
  }
  const statusParts = [];
  if (serverRunning || bridgeRunning) {
    statusParts.push(`Server: Running on http://localhost:${WEB_PORT} (Bridge Port ${BRIDGE_PORT})`);
  } else {
    statusParts.push(`Server: OFFLINE (use mythic_launch_server or npm run dev)`);
  }
  if (beiConnected) {
    const activeTab = tabs.find((t) => t.target === "gemini" || t.target === "chatgpt");
    const accountStr = activeTab?.email ? ` (${activeTab.email})` : "";
    statusParts.push(`BEI Extension: Connected with ${tabs.length} tab(s)${accountStr}`);
  } else {
    statusParts.push(`BEI Extension: Not connected (ensure Chrome extension is installed & Chrome tab open)`);
  }
  if (hasGeminiApiKey) {
    statusParts.push(`Gemini API Key: Configured in environment`);
  } else {
    statusParts.push(`Gemini API Key: Not configured (optional if using BEI)`);
  }
  return {
    serverRunning: serverRunning || bridgeRunning,
    serverUrl: `http://localhost:${WEB_PORT}`,
    bridgeRunning,
    bridgePort: BRIDGE_PORT,
    beiConnected,
    tabs,
    accounts,
    activeJobsCount,
    hasGeminiApiKey,
    availableEngines,
    summary: statusParts.join(" | ")
  };
}
async function launchMythicServer() {
  const current = await checkMythicStatus();
  if (current.serverRunning) {
    return { success: true, message: `MythicFrame server is already running (${current.summary})` };
  }
  try {
    const isWindows = process.platform === "win32";
    const command = isWindows ? "cmd.exe" : "npm";
    const args = isWindows ? ["/c", "start", "/MIN", "npm.cmd", "run", "dev"] : ["run", "dev"];
    const devServer = spawn(command, args, {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: { ...process.env, NODE_ENV: "development" }
    });
    devServer.unref();
    const start = Date.now();
    while (Date.now() - start < 8e3) {
      await new Promise((r) => setTimeout(r, 1e3));
      const checked = await checkMythicStatus();
      if (checked.serverRunning) {
        return {
          success: true,
          message: `Successfully launched MythicFrame server on http://localhost:${WEB_PORT} (Bridge Port: ${BRIDGE_PORT})`
        };
      }
    }
    return {
      success: true,
      message: `Launched server start command; please allow a few seconds for initialization on http://localhost:${WEB_PORT}.`
    };
  } catch (err) {
    return { success: false, message: `Failed to launch server: ${err.message}` };
  }
}
async function openBEITab(target = "gemini", accountSlot = 0) {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/open-tab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, accountSlot, bringTabToFront: true })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to open tab: ${errText}` };
    }
    const data = await res.json();
    return { success: true, message: `Opened/focused ${target} tab in Chrome (Account slot ${accountSlot})` };
  } catch (err) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}
async function scanBEIAccounts() {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/scan-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Scan request failed: ${errText}` };
    }
    return { success: true, message: `Account auto-detection initiated in Chrome background.` };
  } catch (err) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}
async function setActiveBEITab(target = "gemini", accountSlot = 0) {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/set-active-tab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, accountSlot })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to set active tab: ${errText}` };
    }
    const data = await res.json();
    return { success: true, message: `Active tab set successfully for ${target} slot ${accountSlot}`, tabId: data.tabId };
  } catch (err) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}
async function switchAndVerifyBEITab(target = "gemini", accountSlot = 0, tabId, bringTabToFront = false) {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/switch-and-verify-tab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, accountSlot, tabId, bringTabToFront })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to verify tab: ${errText}` };
    }
    const data = await res.json();
    return { success: true, message: `Tab verified successfully`, data };
  } catch (err) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}
async function fetchBEILibraryAssets(target = "gemini", accountSlot = 0, limit = 5) {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, accountSlot, limit })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to fetch library assets: ${errText}` };
    }
    const data = await res.json();
    return { success: true, assets: data.assets || [], message: `Found ${(data.assets || []).length} assets in ${target} Library.` };
  } catch (err) {
    return { success: false, message: `Could not reach BEI Bridge: ${err.message}` };
  }
}
async function saveLibraryAssetToFile(assetUrl, prefix = "library") {
  try {
    const outDir = path.join(PROJECT_ROOT, "outputs", "bei");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    let buffer;
    let extension = "jpg";
    if (assetUrl.startsWith("data:image/")) {
      const isPng = assetUrl.startsWith("data:image/png");
      extension = isPng ? "png" : "jpg";
      const base64Data = assetUrl.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    } else {
      const res = await fetch(assetUrl, { signal: AbortSignal.timeout(2e4) });
      if (!res.ok) return null;
      const arrBuf = await res.arrayBuffer();
      buffer = Buffer.from(arrBuf);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("png")) extension = "png";
      else if (ct.includes("webp")) extension = "webp";
    }
    const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${extension}`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, buffer);
    const sizeMB = `${(buffer.length / (1024 * 1024)).toFixed(2)} MB`;
    const base64 = `data:image/${extension === "png" ? "png" : "jpeg"};base64,${buffer.toString("base64")}`;
    return { filePath, sizeMB, base64 };
  } catch (err) {
    console.warn("[MythicFrame BEI] Failed to save library asset to file:", err);
    return null;
  }
}
async function getMythicSettings() {
  try {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/status`, {
      signal: AbortSignal.timeout(3e3)
    });
    const statusData = res.ok ? await res.json() : null;
    return {
      success: true,
      bridgeRunning: Boolean(statusData),
      bridgePort: BRIDGE_PORT,
      webPort: WEB_PORT,
      extensionVersion: statusData?.extensionVersion || "1.5.5",
      connected: Boolean(statusData?.connected),
      accounts: statusData?.accounts || [],
      tabs: statusData?.tabs || [],
      activeJobsCount: statusData?.activeJobsCount || 0
    };
  } catch (err) {
    return {
      success: false,
      error: `Could not reach MythicFrame bridge on port ${BRIDGE_PORT}: ${err.message}`
    };
  }
}
async function generateWithBEI(options) {
  const {
    prompt,
    aspectRatio = "1:1",
    target = "gemini",
    accountSlot = 0,
    images = [],
    timeoutSeconds = 900,
    tabMode = "same_window_group",
    bringTabToFront = false,
    quality = "ultra_original",
    dispatchMode = "single",
    chatSessionMode = "new_chat"
  } = options;
  const processedImages = [];
  for (const img of images) {
    if (img.startsWith("data:image/")) {
      processedImages.push(img);
    } else if (fs.existsSync(img)) {
      const ext = path.extname(img).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      const b64 = fs.readFileSync(img).toString("base64");
      processedImages.push(`data:${mime};base64,${b64}`);
    }
  }
  const payload = {
    prompt,
    fullPrompt: prompt,
    aspectRatio,
    target,
    accountSlot,
    images: processedImages,
    timeoutSeconds,
    tabMode,
    bringTabToFront,
    quality,
    dispatchMode,
    chatSessionMode
  };
  let result = null;
  try {
    const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `BEI generation failed with status ${response.status}`);
    }
    result = await response.json();
    if (!result.success || !result.image) {
      throw new Error(result.error || "BEI bridge did not return a valid image.");
    }
  } catch (err) {
    console.warn(`[MythicFrame BEI] Generation error: ${err.message}`);
    throw new Error(`BEI generation failed: ${err.message || err}`);
  }
  if (!result || !result.image) {
    throw new Error("BEI generation failed to produce a valid image for this job.");
  }
  const outDir = path.join(PROJECT_ROOT, "outputs", "bei");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const base64Data = result.image.replace(/^data:image\/\w+;base64,/, "");
  let buffer = Buffer.from(base64Data, "base64");
  const isPng = result.image.startsWith("data:image/png");
  const extension = isPng ? "png" : "jpg";
  const fileName = `bei_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${extension}`;
  const filePath = path.join(outDir, fileName);
  if (buffer.length < 500 * 1024 && quality !== "standard") {
    try {
      const downloadsDir = path.join(os.homedir(), "Downloads");
      if (fs.existsSync(downloadsDir)) {
        const files = fs.readdirSync(downloadsDir).filter((f) => /Gemini_Generated_Image/i.test(f) && /\.(jpe?g|png)$/i.test(f)).map((f) => {
          const fullPath = path.join(downloadsDir, f);
          const stat = fs.statSync(fullPath);
          return { fullPath, mtimeMs: stat.mtimeMs, size: stat.size };
        }).filter((f) => Date.now() - f.mtimeMs < 9e4 && f.size > 700 * 1024).sort((a, b) => b.mtimeMs - a.mtimeMs);
        if (files.length > 0) {
          const masterFile = files[0];
          const masterBuffer = fs.readFileSync(masterFile.fullPath);
          buffer = masterBuffer;
          result.image = `data:image/jpeg;base64,${masterBuffer.toString("base64")}`;
          try {
            fs.unlinkSync(masterFile.fullPath);
          } catch (e) {
          }
        }
      }
    } catch (err) {
      console.warn("[MythicFrame BEI] Downloads safety check notice:", err);
    }
  }
  fs.writeFileSync(filePath, buffer);
  return {
    success: true,
    filePath,
    imageBase64: result.image,
    jobId: result.jobId,
    metadata: result.metadata
  };
}
async function queryBEIText(options) {
  const {
    prompt,
    images = [],
    target = "gemini",
    accountSlot = 0,
    timeoutSeconds = 120
  } = options;
  const processedImages = [];
  for (const img of images) {
    if (img.startsWith("data:image/")) {
      processedImages.push(img);
    } else if (fs.existsSync(img)) {
      const ext = path.extname(img).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      const b64 = fs.readFileSync(img).toString("base64");
      processedImages.push(`data:${mime};base64,${b64}`);
    }
  }
  const payload = {
    prompt,
    images: processedImages,
    target,
    accountSlot,
    timeoutSeconds
  };
  const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/bei/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || `BEI text query failed with status ${response.status}`);
  }
  const result = await response.json();
  if (!result.success || typeof result.text !== "string") {
    throw new Error(result.error || result.message || "BEI bridge did not return a valid text response.");
  }
  return {
    success: true,
    text: result.text,
    jobId: result.jobId
  };
}

// src/mcp/index.ts
var server = new Server(
  {
    name: "mythic-advanced-mcp",
    version: "2.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
var executeImageGeneration = async (promptStr, aspectRatio = "1:1", toolName, apiKey) => {
  const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
  if (!effectiveKey) {
    const status = await checkMythicStatus();
    if (status.beiConnected && status.tabs.some((t) => t.target === "gemini" || t.target === "chatgpt")) {
      const beiRes = await generateWithBEI({
        prompt: promptStr,
        aspectRatio,
        target: "gemini"
      });
      const formattedPath = beiRes.filePath.replace(/\\/g, "/");
      return `IMAGE GENERATED SUCCESSFULLY VIA BEI!

Agent, the image has been generated using Browser Extension Interface (BEI) with active Google Gemini session and saved here: ${beiRes.filePath}

Please embed this image for the user, AND provide a clickable markdown link [${path2.basename(beiRes.filePath)}](file:///${formattedPath}) so they can easily open it!`;
    }
    throw new Error(
      "Missing geminiApiKey and no active BEI browser session connected.\nOptions to generate:\n1. Pass 'geminiApiKey' or set GEMINI_API_KEY in .env.local (link: https://ai.google.dev/gemini-api/docs/api-key).\n2. Ensure MythicFrame is running (use 'mythic_launch_server') and open Google Gemini in Chrome with the BEI extension."
    );
  }
  let aspectForGemini = "1:1";
  const ratio = aspectRatio.split(" ")[0];
  if (ratio === "16:9") {
    aspectForGemini = "16:9";
  }
  if (ratio === "9:16") {
    aspectForGemini = "9:16";
  }
  if (ratio === "3:4") {
    aspectForGemini = "3:4";
  }
  if (ratio === "4:3") {
    aspectForGemini = "4:3";
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${effectiveKey}`;
  const body = {
    instances: [{ prompt: promptStr }],
    parameters: { sampleCount: 1, aspectRatio: aspectForGemini }
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${errorText}`);
    }
    const data = await response.json();
    const base64Data = data.predictions[0].bytesBase64Encoded;
    const arrayBuffer = Buffer.from(base64Data, "base64");
    const projectRoot = process.env.MYTHICFRAME_ROOT || (fs2.existsSync(path2.join(process.cwd(), "package.json")) ? process.cwd() : path2.resolve(path2.dirname(process.argv[1] || process.cwd()), ".."));
    const outDir = path2.join(projectRoot, "outputs");
    if (!fs2.existsSync(outDir)) fs2.mkdirSync(outDir, { recursive: true });
    const fileName = `${toolName}_${Date.now()}.jpg`;
    const filePath = path2.join(outDir, fileName);
    fs2.writeFileSync(filePath, arrayBuffer);
    return `IMAGE GENERATED SUCCESSFULLY!

Agent, the image has been generated using Gemini Imagen 3 and saved here: ${filePath}

Please embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${filePath.replace(/\\\\/g, "/")}) so they can easily open it!`;
  } catch (e) {
    throw new Error(`Failed to generate Gemini image: ${e.message}`);
  }
};
var formatTextInstruction = (promptStr) => {
  return `PROMPT OPTIMIZED SUCCESSFULLY!

AGENT INSTRUCTION: Now, use your internal LLM reasoning to directly answer the user using the following prompt.

---START PROMPT---
${promptStr}
---END PROMPT---`;
};
var defaultGameContext = { setting: "High Fantasy", tone: "Epic" };
var defaultBgConfig = { mode: "atmospheric" };
function getProjectConfig() {
  const projectRoot = process.env.MYTHICFRAME_ROOT || (fs2.existsSync(path2.join(process.cwd(), "package.json")) ? process.cwd() : path2.resolve(path2.dirname(process.argv[1] || process.cwd()), ".."));
  const projectFile = path2.join(projectRoot, "mythic_project.json");
  if (fs2.existsSync(projectFile)) {
    try {
      return JSON.parse(fs2.readFileSync(projectFile, "utf8"));
    } catch (e) {
    }
  }
  return { projectName: "Kingdoms Divided", gameContext: defaultGameContext };
}
function getActiveGameContext() {
  const cfg = getProjectConfig();
  return cfg.gameContext || defaultGameContext;
}
function resolveProjectArtStyle(styleInput) {
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
          required: ["prompt"]
        }
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
          required: ["prompt"]
        }
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
          required: ["prompt"]
        }
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
          required: ["prompt"]
        }
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
          required: ["prompt"]
        }
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
          required: ["prompt", "frameCount"]
        }
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
          required: ["prompt", "elements"]
        }
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
          required: ["prompt", "patternType"]
        }
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
          required: []
        }
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
          required: ["prompt"]
        }
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
          required: ["subjects", "variations"]
        }
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
        name: "mythic_switch_and_verify_tab",
        description: "Brings the Google Gemini or ChatGPT tab to the foreground, focuses its browser window to defeat background DOM throttling, checks live generation status, and harvests any completed image directly from the DOM.",
        inputSchema: {
          type: "object",
          properties: {
            target: { type: "string", enum: ["gemini", "chatgpt"], description: "Browser target (default 'gemini')" },
            accountSlot: { type: "number", description: "Account slot (default 0)" },
            tabId: { type: "number", description: "Optional specific tab ID to activate and verify" },
            bringTabToFront: { type: "boolean", description: "If true, explicitly brings window and tab to foreground. Default: false (Silent background ghost mode)." }
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
          required: []
        }
      },
      {
        name: "mythic_get_settings",
        description: "Fetches and displays all active MythicFrame settings, BEI configuration, connected browser accounts, slots, and quality/multi-account preferences.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
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
      },
      {
        name: "mythic_extract_props",
        description: "Extracts and categorizes character props, garments, equipment, accessories, and anatomy from a reference image (similar to Lychee Studio Props Extraction node). Returns structured JSON breakdown and isolated generation-ready prompts via BEI with zero API key required.",
        inputSchema: {
          type: "object",
          properties: {
            image: { type: "string", description: "Absolute path to local character image file or base64 data URI" },
            granularity: { type: "string", enum: ["minimal", "standard", "detailed"], description: "Level of prop detail: 'minimal' (5-7 macro props), 'standard' (8-10 distinct items), 'detailed' (12-16 items including micro-trim/clasps). Default 'standard'" },
            mergeSymmetrical: { type: "boolean", description: "If true, merges symmetrical pairs (e.g. boots, gauntlets) into single prop entries. Default true" },
            includeHeadBody: { type: "boolean", description: "If true, includes facial features, hair, and anatomy as distinct items. If false, focuses strictly on removable clothes, armor, and gear. Default false" },
            target: { type: "string", enum: ["gemini", "chatgpt"], description: "AI service target (default 'gemini')" },
            accountSlot: { type: "number", description: "Account slot index (default 0)" },
            timeoutSeconds: { type: "number", description: "Timeout in seconds (default 180)" }
          },
          required: ["image"]
        }
      },
      {
        name: "mythic_bei_chat",
        description: "Sends a direct text or multimodal vision inquiry to an active Google Gemini or ChatGPT browser session via BEI with ZERO API key required. Perfect for asking questions about images, analyzing gameplay scenes, or general reasoning without consuming API quota.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The inquiry, question, or instruction to send" },
            images: { type: "array", items: { type: "string" }, description: "Optional array of local image file paths or base64 data URIs to analyze" },
            target: { type: "string", enum: ["gemini", "chatgpt"], description: "AI service target (default 'gemini')" },
            accountSlot: { type: "number", description: "Account slot index (default 0)" },
            timeoutSeconds: { type: "number", description: "Timeout in seconds (default 120)" }
          },
          required: ["prompt"]
        }
      }
    ]
  };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = request.params.arguments;
    const name = request.params.name;
    let result = "";
    let isImageGen = true;
    let aspectRatio = "1:1";
    if (name === "prepare_illustration_prompt") {
      let bgMode = args.backgroundMode || "transparent";
      if (bgMode === "AI Decides" || bgMode === "scene") bgMode = "scene";
      const bgConfig = {
        mode: bgMode,
        color: args.backgroundColor
      };
      const chibiConfig = args.chibiMode ? { enabled: true, headSize: 2, bodyPlumpness: 1.5, limbStubbiness: 0.8, enableSparkles: false } : void 0;
      let mappedChibiProportion = void 0;
      if (args.chibiMode && args.chibiRatio) {
        if (args.chibiRatio === "1:1") mappedChibiProportion = "micro_2h";
        if (args.chibiRatio === "1:2") mappedChibiProportion = "chibi_3h";
        if (args.chibiRatio === "1:4") mappedChibiProportion = "deformed_4h";
      } else if (args.chibiMode) {
        mappedChibiProportion = "chibi_3h";
      }
      let characterTool = void 0;
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
        promptToBuild,
        activeContext,
        effectiveStyle,
        bgConfig,
        [],
        void 0,
        void 0,
        mappedChibiProportion,
        chibiConfig,
        args.viewpoint,
        args.noCharacters,
        args.framing,
        characterTool
      );
      result = built.textPrompt;
      if (args.biologicalEraser) {
        result += `
[STRICT NEGATIVE CONSTRAINT - BIOLOGICAL ERASER]: ZERO BIOLOGICAL MATTER. Erase the character completely. NO face, NO eyes, NO skin, NO hair, NO hands, NO neck. Render the equipment, armor, or clothing as a hollow void / ghost asset floating in 3D space.
`;
      }
      if (args.seed !== void 0 && args.seed !== null) {
        result += `
[DETERMINISTIC SEED]: ${args.seed}
`;
      }
      aspectRatio = args.aspectRatio || "1:1";
    } else if (name === "batch_studio_generate") {
      const subjects = args.subjects || [];
      const variations = args.variations || [];
      let bgMode = args.backgroundMode || "transparent";
      if (bgMode === "AI Decides" || bgMode === "scene") bgMode = "scene";
      const bgConfig = {
        mode: bgMode,
        color: args.backgroundColor
      };
      const outDir = path2.join(process.cwd(), "outputs", "batch");
      if (!fs2.existsSync(outDir)) fs2.mkdirSync(outDir, { recursive: true });
      let resultsLog = `BATCH GENERATION COMPLETE!

`;
      for (const subject of subjects) {
        for (const variation of variations) {
          const isChibi = variation.toLowerCase() === "chibi";
          let mappedChibiProportion = void 0;
          let chibiConfig = void 0;
          if (isChibi) {
            chibiConfig = { headSize: 2, bodyPlumpness: 1.5, limbStubbiness: 0.8, enableSparkles: false };
            if (args.chibiRatio === "1:1") mappedChibiProportion = "micro_2h";
            else if (args.chibiRatio === "1:4") mappedChibiProportion = "deformed_4h";
            else mappedChibiProportion = "chibi_3h";
          }
          let framing = void 0;
          if (variation.toLowerCase() === "full-body" || variation.toLowerCase() === "full body") framing = "full-body";
          if (variation.toLowerCase() === "waist-up" || variation.toLowerCase() === "waist up") framing = "waist-up";
          const activeContext = getActiveGameContext();
          const effectiveStyle = resolveProjectArtStyle(args.style);
          const built = buildIllustrationPrompt(
            subject,
            activeContext,
            effectiveStyle,
            bgConfig,
            [],
            void 0,
            void 0,
            mappedChibiProportion,
            chibiConfig,
            void 0,
            false,
            framing
          );
          const promptStr = built.textPrompt;
          const ratio = args.aspectRatio || "1:1";
          let width = 1024;
          let height = 1024;
          if (ratio === "16:9") {
            height = 576;
          }
          if (ratio === "9:16") {
            width = 576;
          }
          if (ratio === "3:4") {
            width = 768;
            height = 1024;
          }
          if (ratio === "4:3") {
            width = 1024;
            height = 768;
          }
          const encodedPrompt = encodeURIComponent(promptStr);
          const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&enhance=false`;
          const cleanSubject = subject.replace(/[^a-z0-9]/gi, "_").substring(0, 20);
          const fileName = `batch_${cleanSubject}_${variation}_${Date.now()}.jpg`;
          const filePath = path2.join(outDir, fileName);
          try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            fs2.writeFileSync(filePath, Buffer.from(arrayBuffer));
            resultsLog += `[SUCCESS] ${subject} (${variation}) -> [link](file:///${filePath.replace(/\\/g, "/")})
`;
          } catch (e) {
            resultsLog += `[FAILED] ${subject} (${variation}) -> ${e.message}
`;
          }
        }
      }
      return { content: [{ type: "text", text: resultsLog }] };
    } else if (name === "mythic_status") {
      const status = await checkMythicStatus();
      const accountsList = status.accounts && status.accounts.length > 0 ? status.accounts.map((a) => `\u2022 Slot ${a.slot}: ${a.email || "Google Account"}`).join("\n") : "\u2022 No accounts discovered yet in Chrome";
      const tabsList = status.tabs && status.tabs.length > 0 ? status.tabs.map((t) => `\u2022 Tab #${t.tabId} (${t.target}): ${t.title || t.url} [${t.email || "Active"}]`).join("\n") : "\u2022 No active Gemini/ChatGPT tabs open in Chrome";
      const responseText = `\u26A1 MYTHICFRAME ENGINE STATUS

Web Server: ${status.serverRunning ? `ONLINE (http://localhost:3488)` : `OFFLINE (use 'mythic_launch_server')`}
BEI Extension Bridge: ${status.bridgeRunning ? `ONLINE (Port ${status.bridgePort})` : `OFFLINE`}
BEI Extension Client: ${status.beiConnected ? `CONNECTED` : `NOT CONNECTED (open Chrome tab with extension)`}
Gemini API Key: ${status.hasGeminiApiKey ? `CONFIGURED` : `NOT CONFIGURED (optional with BEI)`}
Available Generation Engines: ${status.availableEngines.join(", ")}

Discovered Accounts:
${accountsList}

Discovered Tabs:
${tabsList}

Summary: ${status.summary}`;
      return { content: [{ type: "text", text: responseText }] };
    } else if (name === "mythic_launch_server") {
      const res = await launchMythicServer();
      return { content: [{ type: "text", text: res.message }] };
    } else if (name === "mythic_open_tab") {
      const target = args.target || "gemini";
      const slot = args.accountSlot ?? 0;
      const res = await openBEITab(target, slot);
      return { content: [{ type: "text", text: res.message }] };
    } else if (name === "mythic_scan_accounts") {
      const res = await scanBEIAccounts();
      return { content: [{ type: "text", text: res.message }] };
    } else if (name === "mythic_set_active_tab") {
      const target = args.target || "gemini";
      const slot = args.accountSlot ?? 0;
      const res = await setActiveBEITab(target, slot);
      return { content: [{ type: "text", text: res.message }] };
    } else if (name === "mythic_switch_and_verify_tab") {
      const target = args.target || "gemini";
      const slot = args.accountSlot ?? 0;
      const res = await switchAndVerifyBEITab(target, slot, args.tabId, Boolean(args.bringTabToFront));
      if (!res.success) {
        return { content: [{ type: "text", text: `Tab verification failed: ${res.message}` }], isError: true };
      }
      const data = res.data || {};
      let imgSection = "";
      if (data.hasImage && data.image) {
        const harvested = data.image;
        const imgPayload = harvested.base64 || harvested.highResUrl || harvested.src;
        if (imgPayload) {
          const saved = await saveLibraryAssetToFile(imgPayload, "harvested_tab");
          if (saved) {
            const formattedPath = saved.filePath.replace(/\\/g, "/");
            const fileName = path2.basename(saved.filePath);
            imgSection = `

HARVESTED IMAGE SAVED TO DISK:
- File: ${saved.filePath} (${saved.sizeMB})
- Link: [${fileName}](file:///${formattedPath})
`;
          }
        }
      }
      return {
        content: [{
          type: "text",
          text: `TAB SWITCHED & VERIFIED:
- Target: ${data.target || target} (Slot ${slot})
- Tab ID: ${data.tabId}
- Title: ${data.title || "N/A"}
- URL: ${data.url || "N/A"}
- Is Generating: ${data.isGenerating ? "YES (In Progress)" : "NO"}
- Has Rendered Image: ${data.hasImage ? "YES" : "NO"}${imgSection}`
        }]
      };
    } else if (name === "mythic_fetch_library_assets") {
      const target = args.target || "gemini";
      const slot = args.accountSlot ?? 0;
      const limit = args.limit ?? 5;
      const res = await fetchBEILibraryAssets(target, slot, Math.max(limit, 10));
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to fetch library assets: ${res.message}` }], isError: true };
      }
      let assets = res.assets || [];
      if (args.searchQuery) {
        const q = String(args.searchQuery).toLowerCase();
        assets = assets.filter((a) => (a.alt || "").toLowerCase().includes(q) || (a.src || "").toLowerCase().includes(q));
      }
      assets = assets.slice(0, limit);
      if (assets.length === 0) {
        return { content: [{ type: "text", text: `No matching image assets found in Google Gemini Library (Slot ${slot}${args.searchQuery ? `, query: "${args.searchQuery}"` : ""}).` }] };
      }
      let downloadSection = "";
      if (args.downloadLatest && assets.length > 0) {
        const topAsset = assets[0];
        const topUrl = topAsset.highResUrl || topAsset.src;
        const saved = await saveLibraryAssetToFile(topUrl, "library_export");
        if (saved) {
          const formattedPath = saved.filePath.replace(/\\/g, "/");
          const fileName = path2.basename(saved.filePath);
          downloadSection = `DOWNLOADED TO DISK:
- Local file: ${saved.filePath} (${saved.sizeMB})
- Markdown link: [${fileName}](file:///${formattedPath})

`;
        }
      }
      let text = `Found ${assets.length} assets in Google Gemini Library (Slot ${slot}):

${downloadSection}`;
      assets.forEach((a, idx) => {
        text += `${idx + 1}. High-Res URL: ${a.highResUrl || a.src}
   Alt: ${a.alt || "Generated image"}

`;
      });
      return { content: [{ type: "text", text }] };
    } else if (name === "mythic_bei_generate") {
      let promptToSend = args.prompt;
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.style);
      const wantTransparent = Boolean(args.transparentBackground || args.cleanBackground);
      const effectiveBgConfig = wantTransparent ? { mode: "transparent", color: "#FFFFFF", allowTransparency: true } : defaultBgConfig;
      if (!args.prompt.includes("SUBJECT:")) {
        const built = buildIllustrationPrompt(args.prompt, activeContext, effectiveStyle, effectiveBgConfig, []);
        promptToSend = built.textPrompt;
      } else if (effectiveStyle && !args.prompt.includes("STYLE:")) {
        promptToSend += `
STYLE: ${effectiveStyle.replace(/^,\s*/, "")}
`;
      }
      if (wantTransparent && !promptToSend.includes("[MANDATORY ISOLATION]")) {
        promptToSend += `
[MANDATORY ISOLATION]: Render standalone character cleanly centered on an absolute flat white background (#FFFFFF) with high contrast for alpha cutout. No shadows, no gradients, no scenery.
`;
      }
      const beiRes = await generateWithBEI({
        prompt: promptToSend,
        aspectRatio: args.aspectRatio || "1:1",
        target: args.target || "gemini",
        accountSlot: args.accountSlot ?? 0,
        images: args.images || [],
        quality: args.quality || "ultra_original",
        dispatchMode: args.dispatchMode || "single",
        chatSessionMode: args.chatSessionMode || "new_chat",
        timeoutSeconds: args.timeoutSeconds || 900
      });
      const formattedPath = beiRes.filePath.replace(/\\/g, "/");
      const fileName = path2.basename(beiRes.filePath);
      let sizeMB = "";
      try {
        const stats = fs2.statSync(beiRes.filePath);
        sizeMB = ` (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
      } catch (e) {
      }
      return {
        content: [{
          type: "text",
          text: `IMAGE GENERATED SUCCESSFULLY VIA BEI!
Image saved to: ${beiRes.filePath}${sizeMB}
Job ID: ${beiRes.jobId}
Quality: ${args.quality || "ultra_original"}
File Size: ${sizeMB.trim() || "Unknown"}
${wantTransparent ? "Background: Isolated on flat key for transparent cutout\n" : ""}
Please embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${formattedPath}) so they can easily open it!`
        }]
      };
    } else if (name === "mythic_smart_generate") {
      const engineChoice = args.engine || "auto";
      let promptToSend = args.prompt;
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.style);
      const wantTransparent = Boolean(args.transparentBackground || args.cleanBackground);
      const effectiveBgConfig = wantTransparent ? { mode: "transparent", color: "#FFFFFF", allowTransparency: true } : defaultBgConfig;
      if (!args.prompt.includes("SUBJECT:")) {
        const built = buildIllustrationPrompt(args.prompt, activeContext, effectiveStyle, effectiveBgConfig, []);
        promptToSend = built.textPrompt;
      } else if (effectiveStyle && !args.prompt.includes("STYLE:")) {
        promptToSend += `
STYLE: ${effectiveStyle.replace(/^,\s*/, "")}
`;
      }
      if (wantTransparent && !promptToSend.includes("[MANDATORY ISOLATION]")) {
        promptToSend += `
[MANDATORY ISOLATION]: Render standalone character cleanly centered on an absolute flat white background (#FFFFFF) with high contrast for alpha cutout. No shadows, no gradients, no scenery.
`;
      }
      if (engineChoice === "prompt-only") {
        return { content: [{ type: "text", text: formatTextInstruction(promptToSend) }] };
      }
      if (engineChoice === "bei") {
        const beiRes = await generateWithBEI({
          prompt: promptToSend,
          aspectRatio: args.aspectRatio || "1:1",
          target: args.target || "gemini",
          accountSlot: args.accountSlot ?? 0,
          quality: args.quality || "ultra_original",
          dispatchMode: args.dispatchMode || "single",
          images: args.images || []
        });
        const formattedPath = beiRes.filePath.replace(/\\/g, "/");
        const fileName = path2.basename(beiRes.filePath);
        let sizeMB = "";
        try {
          const stats = fs2.statSync(beiRes.filePath);
          sizeMB = ` (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
        } catch (e) {
        }
        return {
          content: [{
            type: "text",
            text: `IMAGE GENERATED SUCCESSFULLY VIA BEI!

Image saved to: ${beiRes.filePath}${sizeMB}
Quality: ${args.quality || "ultra_original"}
File Size: ${sizeMB.trim() || "Unknown"}
Dispatch Mode: ${args.dispatchMode || "single"}

Please embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${formattedPath}) so they can easily open it!`
          }]
        };
      }
      if (engineChoice === "gemini-api") {
        const resText = await executeImageGeneration(promptToSend, args.aspectRatio || "1:1", "mythic_smart", args.geminiApiKey);
        return { content: [{ type: "text", text: resText }] };
      }
      const status = await checkMythicStatus();
      if (status.beiConnected && status.tabs.some((t) => t.target === "gemini" || t.target === "chatgpt")) {
        const beiRes = await generateWithBEI({
          prompt: promptToSend,
          aspectRatio: args.aspectRatio || "1:1",
          target: args.target || "gemini",
          accountSlot: args.accountSlot ?? 0,
          quality: args.quality || "ultra_original",
          dispatchMode: args.dispatchMode || "single",
          images: args.images || []
        });
        const formattedPath = beiRes.filePath.replace(/\\/g, "/");
        const fileName = path2.basename(beiRes.filePath);
        let sizeMB = "";
        try {
          const stats = fs2.statSync(beiRes.filePath);
          sizeMB = ` (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
        } catch (e) {
        }
        return {
          content: [{
            type: "text",
            text: `IMAGE GENERATED SUCCESSFULLY VIA BEI!

Image saved to: ${beiRes.filePath}${sizeMB}
Quality: ${args.quality || "ultra_original"}
File Size: ${sizeMB.trim() || "Unknown"}
Dispatch Mode: ${args.dispatchMode || "single"}

Please embed this image for the user, AND provide a clickable markdown link [${fileName}](file:///${formattedPath}) so they can easily open it!`
          }]
        };
      }
      if (args.geminiApiKey || status.hasGeminiApiKey) {
        const resText = await executeImageGeneration(promptToSend, args.aspectRatio || "1:1", "mythic_smart", args.geminiApiKey);
        return { content: [{ type: "text", text: resText }] };
      }
      return {
        content: [{
          type: "text",
          text: `CANNOT GENERATE: NO ENGINE READY

Status summary:
${status.summary}

Options to proceed:
1. Zero-Key BEI Route: Run 'mythic_launch_server', then open Chrome and log in at gemini.google.com.
2. Gemini API Route: Provide 'geminiApiKey' or set it in .env.local.
3. Prompt-only: Pass engine: 'prompt-only' to view the optimized generation prompt.`
        }],
        isError: true
      };
    } else if (name === "launch_web_ui") {
      const res = await launchMythicServer();
      return { content: [{ type: "text", text: res.message }] };
    } else if (name === "mythic_get_settings") {
      const settings = await getMythicSettings();
      let text = `\u26A1 MYTHICFRAME ACTIVE SETTINGS & CONFIGURATION

`;
      text += `\u2022 Bridge Status: ${settings.connected ? "CONNECTED" : "DISCONNECTED"} (Port ${settings.bridgePort})
`;
      text += `\u2022 Studio Web UI: http://localhost:${settings.webPort}
`;
      text += `\u2022 Extension Version: v${settings.extensionVersion}
`;
      text += `\u2022 Active Jobs Count: ${settings.activeJobsCount}

`;
      text += `Connected Accounts (${settings.accounts?.length || 0}):
`;
      (settings.accounts || []).forEach((acc) => {
        text += `  - Slot ${acc.slot}: ${acc.email} (${acc.tier || "pro"})
`;
      });
      text += `
Connected Browser Tabs (${settings.tabs?.length || 0}):
`;
      (settings.tabs || []).forEach((tab) => {
        text += `  - [${tab.target}] Tab #${tab.tabId} (Slot ${tab.accountSlot ?? 0}) - ${tab.email || "pending"}
`;
      });
      return { content: [{ type: "text", text }] };
    } else if (name === "mythic_bei_chat") {
      const prompt = args.prompt;
      const images = args.images || [];
      const target = args.target || "gemini";
      const slot = args.accountSlot ?? 0;
      const timeout = args.timeoutSeconds || 120;
      const res = await queryBEIText({
        prompt,
        images,
        target,
        accountSlot: slot,
        timeoutSeconds: timeout
      });
      return {
        content: [{
          type: "text",
          text: `BEI CHAT RESPONSE (Target: ${target}, Slot ${slot}):

${res.text}`
        }]
      };
    } else if (name === "mythic_extract_props") {
      const imagePath = args.image;
      if (!imagePath) {
        return {
          content: [{ type: "text", text: "Error: 'image' path or base64 data URI is required." }],
          isError: true
        };
      }
      const granularity = args.granularity || "standard";
      const mergeSymmetrical = args.mergeSymmetrical ?? true;
      const includeHeadBody = Boolean(args.includeHeadBody);
      const target = args.target || "gemini";
      const slot = args.accountSlot ?? 0;
      const timeout = args.timeoutSeconds || 180;
      const extractionPrompt = buildPropsExtractionPrompt(granularity, mergeSymmetrical, includeHeadBody);
      const res = await queryBEIText({
        prompt: extractionPrompt,
        images: [imagePath],
        target,
        accountSlot: slot,
        timeoutSeconds: timeout
      });
      return {
        content: [{
          type: "text",
          text: `PROPS EXTRACTION COMPLETED VIA BEI (Mode: ${granularity}, Merge: ${mergeSymmetrical}):

${res.text}`
        }]
      };
    } else if (name === "prepare_ui_reimagine_prompt") {
      result = buildUIReimaginePrompt(args.prompt, defaultGameContext, args.styleSnippet || "", true, args.uiMood, void 0, void 0, args.uiArchetype, args.uiMaterial, false);
      aspectRatio = args.aspectRatio || "16:9";
    } else if (name === "prepare_clothes_prompt") {
      const clothesParams = {
        renderMode: args.renderMode === "asset" ? "asset" : "model",
        layout: args.layout === "spread" ? "spread" : "assembled",
        lockPose: args.lockPose ?? true,
        framing: args.framing || "full-body"
      };
      const activeContext = getActiveGameContext();
      const built = buildClothesPrompt(args.prompt, activeContext, args.styleSnippet || "", defaultBgConfig, [], void 0, clothesParams);
      result = built.textPrompt;
    } else if (name === "mythic_list_art_styles") {
      let styles = [...ART_STYLES];
      const projectFile = path2.join(process.cwd(), "mythic_project.json");
      if (fs2.existsSync(projectFile)) {
        try {
          const proj = JSON.parse(fs2.readFileSync(projectFile, "utf8"));
          if (Array.isArray(proj.customStyles)) {
            styles = [...styles, ...proj.customStyles];
          }
        } catch (e) {
        }
      }
      if (args.category) {
        styles = styles.filter((s) => s.category?.toLowerCase() === args.category.toLowerCase());
      }
      if (args.query) {
        const q = String(args.query).toLowerCase().trim();
        styles = styles.filter(
          (s) => s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q) || (s.promptSnippet || "").toLowerCase().includes(q) || (s.category || "").toLowerCase().includes(q)
        );
      }
      let output = `MYTHICFRAME ART STYLE LIBRARY (${styles.length} styles available${args.query ? `, matching "${args.query}"` : ""}):

`;
      styles.forEach((s) => {
        output += `\u2022 ID: '${s.id}' - ${s.name} [${s.category || "General"}]
  Description: ${s.description}
  Snippet: "${s.promptSnippet}"

`;
      });
      return { content: [{ type: "text", text: output }] };
    } else if (name === "mythic_apply_art_style") {
      const projectFile = path2.join(process.cwd(), "mythic_project.json");
      let projectData = {};
      if (fs2.existsSync(projectFile)) {
        try {
          projectData = JSON.parse(fs2.readFileSync(projectFile, "utf8"));
        } catch (e) {
        }
      }
      let targetStyle = ART_STYLES.find((s) => s.id === args.styleId);
      if (!targetStyle && args.styleId) {
        const needle = args.styleId.toLowerCase().replace(/\s+(art\s+)?style$/, "").trim();
        targetStyle = ART_STYLES.find(
          (s) => s.id.toLowerCase() === needle || s.name.toLowerCase() === needle || s.id.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)
        );
      }
      if (!targetStyle && Array.isArray(projectData.customStyles)) {
        const needle = (args.styleId || "").toLowerCase().replace(/\s+(art\s+)?style$/, "").trim();
        targetStyle = projectData.customStyles.find(
          (s) => s.id === args.styleId || s.id.toLowerCase() === needle || s.name.toLowerCase() === needle || s.name.toLowerCase().includes(needle)
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
      fs2.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), "utf8");
      return {
        content: [{ type: "text", text: `Active art style set to '${styleName}' (ID: ${args.styleId}). All subsequent generations will incorporate this style anchor.` }]
      };
    } else if (name === "mythic_create_art_style") {
      const projectFile = path2.join(process.cwd(), "mythic_project.json");
      let projectData = {};
      if (fs2.existsSync(projectFile)) {
        try {
          projectData = JSON.parse(fs2.readFileSync(projectFile, "utf8"));
        } catch (e) {
        }
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
      projectData.customStyles = projectData.customStyles.filter((s) => s.id !== args.id);
      projectData.customStyles.push(newStyle);
      fs2.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), "utf8");
      return {
        content: [{ type: "text", text: `Custom art style '${args.name}' (ID: ${args.id}) created and saved to project! You can now activate it using 'mythic_apply_art_style'.` }]
      };
    } else if (name === "prepare_map_grid_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      const mapConfig = {
        enabled: true,
        viewMode: args.viewMode || "isometric",
        preset: "custom",
        gridWidth: 10,
        gridHeight: 10,
        cellSize: 64,
        primaryColor: args.primaryColor || "#4CAF50",
        accentColor: "#388E3C",
        shadowIntensity: 50,
        lightDirection: "top-left",
        detailDensity: "medium",
        decorationLevel: "medium",
        transparentBackground: true
      };
      result = buildMapGridPrompt(args.prompt, activeContext, effectiveStyle, mapConfig);
      aspectRatio = "16:9";
    } else if (name === "prepare_pose_studio_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      const mockPose = { joints: [{ name: "head", x: 50, y: 20 }, { name: "chest", x: 50, y: 40 }] };
      const built = buildPoseStudioPrompt(args.prompt, activeContext, effectiveStyle, defaultBgConfig, [], mockPose);
      result = built.textPrompt;
    } else if (name === "prepare_sprite_sheet_prompts") {
      const activeContext = getActiveGameContext();
      result = buildSpriteSheetPromptsPrompt(args.prompt, args.frameCount, activeContext);
      isImageGen = false;
    } else if (name === "prepare_frame_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      result = buildFramePrompt(args.prompt, activeContext, effectiveStyle, args.elements);
    } else if (name === "prepare_background_asset_prompt") {
      const activeContext = getActiveGameContext();
      const effectiveStyle = resolveProjectArtStyle(args.styleSnippet || args.style);
      result = buildBackgroundAssetPrompt(args.prompt, activeContext, effectiveStyle, args.patternType);
      aspectRatio = "16:9";
    } else if (name === "prepare_extract_clothes_prompt") {
      const activeContext = getActiveGameContext();
      const bg = { mode: args.backgroundMode || "transparent" };
      result = buildExtractClothesPrompt(activeContext, bg);
    } else if (name === "prepare_card_suggestions_prompt") {
      result = buildCardSuggestionsPrompt(args.artPrompt, args.currentName || "New Card");
      isImageGen = false;
    } else {
      throw new Error(`Tool not found: ${name}`);
    }
    if (isImageGen) {
      const resultText = await executeImageGeneration(result, aspectRatio, name, args.geminiApiKey);
      return { content: [{ type: "text", text: resultText }] };
    } else {
      return { content: [{ type: "text", text: formatTextInstruction(result) }] };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error processing prompt: ${error.message}` }],
      isError: true
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
