
export type UIMode = 'dashboard' | 'library' | 'settings' | 'tutorials' | 'illustration' | 'animation' | 'resize' | 'clothes' | 'bg-replace' | 'pixelize' | 'frame' | 'background' | 'fullcard' | 'gacha' | 'ui-reimagine' | 'ui-scene' | 'style-library' | 'pose-studio' | 'map-grid' | 'sprite-sheet' | 'sprite-strip' | 'batch' | 'downloads' | 'quota' | 'music' | 'video';

export interface BatchItem {
  id: string;
  name: string;
  prompt: string;
  aspectRatio: AspectRatio;
  status: 'pending' | 'processing' | 'done' | 'failed';
  imageUrl?: string;
  error?: string;
  enabled: boolean;
  sourceFile?: string;
  isSeriesTemplate?: boolean;
  usedReferenceUrl?: string;
  referenceWeight?: number;
  skipReference?: boolean;
}

export type FrameElement = 'name_banner' | 'mana_cost' | 'description_box' | 'power_toughness';

export type Rarity = 'R' | 'SR' | 'SSR' | 'UR';

export type BackgroundPatternType = 'texture' | 'abstract' | 'ui_backdrop' | 'muted' | 'scene';

export type ChibiProportion = 'standard' | 'deformed_4h' | 'chibi_3h' | 'micro_2h';

export type StyleCategory = 'Game Art' | 'Anime/Manga' | 'Digital Painting' | 'Traditional' | 'Abstract/UI' | 'Retro' | 'Other';

export type AIProvider = 'google' | 'openai' | 'opencode' | 'openrouter' | 'pollinations' | 'offline' | 'custom' | 'bei';

export type BEITarget = 'gemini' | 'chatgpt';
export type BEITabMode = 'same_window_group' | 'new_window_group' | 'background_tab';

export interface BEIAccountQuota {
  slot: number;
  target: BEITarget;
  tier?: 'free' | 'advanced' | 'pro' | 'workspace';
  capabilities?: {
    image: boolean;
    video: boolean;
    music: boolean;
    text: boolean;
  };
  callsToday: number;
  dailyLimit: number;
  status: 'ready' | 'high_usage' | 'rate_limited';
  cooldownUntil?: number;
  lastUsed?: number;
}

export interface BEIConfig {
  target: BEITarget;
  accountSlot: number;
  port: number;
  timeoutSeconds: number;
  tabMode?: BEITabMode;
  bringTabToFront?: boolean;
  chatSessionMode?: 'temporary_chat' | 'same_chat' | 'new_chat';
  autoRotateOnQuota?: boolean;
  accountOrder?: string[];
  downloadQuality?: 'standard' | 'high' | 'ultra_original';
  askQualityPreference?: 'always' | 'once';
  accountDispatchMode?: 'single' | 'multi';
  askAccountDispatchPreference?: 'always' | 'once';
  preferredBrowser?: 'auto' | 'chrome' | 'brave' | 'edge';
}

export interface AIConfig {
  provider: AIProvider;
  baseUrl?: string;
  customModelName?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiQuality?: 'standard' | 'hd';
  openCodeApiKey?: string;
  openCodeBaseUrl?: string;
  openCodeModel?: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  pollinationsModel?: string;
  beiConfig?: BEIConfig;
}

export interface AvailableModel {
  id: string;
  displayName: string;
  description?: string;
  supportedMethods: string[];
  isImageModel: boolean;
}

export interface AppError {
  title: string;
  message: string;
  code?: number | string;
  raw?: any;
}

export interface ArtStyle {
  id: string;
  name: string;
  promptSnippet: string;
  description?: string;
  category?: StyleCategory;
  isCustom?: boolean;
  exampleUrl?: string;
}

export interface StyleCollection {
  id: string;
  name: string;
  styleIds: string[];
  isLocked?: boolean;
}

export interface ChibiConfig {
  enabled: boolean;
  proportions: 'simple' | 'semi'; // Legacy fallback
  presetProportion?: ChibiProportion; // Link to standard constants
  bodyRatio?: string; // e.g. "1:2", "1:3"
  headStyle: 'moe' | 'realistic'; // Ultra-cute vs Defined
  bodyStyle: 'geometric' | 'defined'; // Cylinders vs Defined anatomy
  focus: 'kawaii' | 'detailed'; // Simple vs Textured
}

export type CameraFraming = 
  | 'extreme_close_up'
  | 'big_close_up'
  | 'close_up'
  | 'medium_close_up'
  | 'bust_shot'
  | 'medium_shot'
  | 'medium_long_shot'
  | 'three_quarter_shot'
  | 'american_shot'
  | 'full_shot'
  | 'long_shot'
  | 'extreme_long_shot'
  | 'very_wide_shot'
  | 'full-body'
  | 'waist-up'
  | 'bust'
  | 'head-only';

// Added ClothesParams to define valid rendering and layout modes for the Clothes Designer feature
export interface ClothesParams {
  renderMode: 'model' | 'asset';
  layout: 'assembled' | 'spread';
  lockPose: boolean;
  framing: CameraFraming;
}

export interface GameContext {
  setting: string;
  tone: string;
  visualConstraints: string;
  defaultStyleId?: string;
}

export interface RaceArchetype {
  id: string;
  name: string;
  trueName: string;
  desc: string;
  traitPromptMale: string;
  traitPromptFemale: string;
}

export interface GachaAsset {
  id: string;
  name: string;
  aspectRatio: AspectRatio;
  size: ImageSize;
  promptSuffix: string;
  imageUrl: string | null;
  status: 'pending' | 'processing' | 'done' | 'failed';
  bgConfig?: BackgroundConfig;
  locked?: boolean;
  chibiProportions?: ChibiProportion;
  chibiConfig?: ChibiConfig;
  framing?: CameraFraming;
}

export interface BackgroundConfig {
  mode: 'solid' | 'scene' | 'none' | 'pattern' | 'transparent' | 'transparent_neo' | 'prompt_only' | 'auto';
  color: string;
  secondaryColor?: string;
  gradientType?: 'none' | 'linear' | 'radial';
  allowTransparency: boolean;
  promptFragment: string;
  patternType?: BackgroundPatternType;
  removeHoles?: boolean;
  healingPower?: number;
  
  // Neo Specifics
  keyColor?: string; // The chroma key color (e.g. #FF00FF)
  tolBg?: number;
  tolEdge?: number;
  softRadius?: number;
  decontamStrength?: number;
  preserveTrueMagenta?: boolean;
  fxMode?: boolean;

  // Neo v2 SteamSafe
  steamSafe?: boolean;
  neutralizeStrength?: number;
  alphaBias?: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  mode: UIMode;
  thumbnailUrl: string;
  fullPrompt: string;
  userPrompt: string;
  gameContext: GameContext;
  styleId: string;
  bgConfig: BackgroundConfig;
  referenceAssets: ReferenceAsset[];
  size: ImageSize;
  aspectRatio: AspectRatio;
  gachaAssets?: GachaAsset[];
  characterTraits?: string;
  characterName?: string;
  characterSubtitle?: string;
  characterRace?: string;
  rarity?: Rarity;
  gender?: string;
  chibiProportions?: ChibiProportion;
  customName?: string;
  frameElements?: FrameElement[];
  bgPatternType?: BackgroundPatternType;
  safeZone?: SafeZoneConfig;
  continuityFlags?: Record<string, boolean>;
  batchQueue?: BatchItem[];
}

export interface ExportHistoryEntry {
  id: string;
  timestamp: number;
  name: string;
  itemCount: number;
  fileSize?: number;
  type: 'zip' | 'png' | 'csv';
  blob?: Blob; // Optional: persist the actual file
  hasBlob?: boolean;
  url?: string; // For session-only or external links
}

export interface ExportConfig {
  includeImage: boolean;
  includePrompts: boolean;
  includeProjectContext: boolean;
  selectedTabIds: string[];
  format: 'png' | 'zip' | 'txt';
}

export interface ReferenceAsset {
  id: string;
  url: string;
  roleNote: string;
  filename?: string;
}

export enum GenerationModel {
  FLASH_3_1 = 'gemini-3.1-flash-image',
  PRO_3 = 'gemini-3-pro-image',
  FLASH_LITE_3_1 = 'gemini-3.1-flash-lite-image',
  // Backward compatibility alias
  FLASH_2_5 = 'gemini-3.1-flash-image',
}

export const IMAGE_SIZES = {
  '1K': '1024x1024',
  '2K': '2048x2048',
  '4K': '4096x4096',
} as const;

export type ImageSize = keyof typeof IMAGE_SIZES;

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9" | "custom";

export interface PixelDimensions {
  width: number;
  height: number;
}

export interface AnimationFrame {
  id: string;
  imageUrl: string | null;
  prompt: string;
}

export interface AnimationProject {
  frames: AnimationFrame[];
  fps: number;
  type: 'illustration' | 'background';
}

export interface SafeZoneConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatioLock: boolean;
}

export interface ResizeItem {
  id: string;
  url: string;
  name: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  resultUrl?: string;
}

export type BatchGenerationMode = 'standard' | 'consistent_series';

export type BatchVariation = 'waist-up' | 'full-body' | 'chibi' | 'item' | 'texture' | 'icon';

export interface SpriteStripConfig {
  prompt: string;
  action: string;
  frameCount: 3 | 4 | 5 | 6 | 7 | 8;
  direction: 'left' | 'right' | 'front' | 'back' | 'isometric';
  batchCharacters?: boolean;
  frameMargin?: 'tight' | 'standard' | 'wide' | 'extreme';
}

export interface BgReplaceItem extends ResizeItem {
  prompt: string;
  bgConfig: BackgroundConfig;
}

export type PixelStyle = '8bit' | '16bit' | '32bit' | 'modern';

export interface PixelizeItem extends ResizeItem {
  pixelStyle: PixelStyle;
}

export interface CharacterToolState {
  enabled: boolean;
  poseDescription: string;
  lookTarget: { x: number; y: number } | null;
  isSettingLookTarget: boolean;
}

export interface PoseJoint {
  id: string;
  name: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  parent?: string;
}

export interface PoseData {
  joints: PoseJoint[];
  showSkeleton: boolean;
}

export interface LayoutElement {
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  zIndex?: 'behind' | 'front' | number;
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
  visible?: boolean;
  locked?: boolean;
  fontFamily?: string;
  textShadow?: string;
}

export type MapViewMode = 'top-down' | 'isometric';
export type MapEnvironmentPreset = 'tomb' | 'dungeon' | 'castle' | 'forest_ruins' | 'custom';
export type MapLightDirection = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom';
export type MapDetailDensity = 'low' | 'medium' | 'high';
export type MapDecorationLevel = 'none' | 'light' | 'rich';

export interface MapGridConfig {
  viewMode: MapViewMode;
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  
  // Isometric specific
  tileDiamondRatio: number;
  verticalHeightMultiplier: number;
  
  preset: MapEnvironmentPreset;
  primaryColor: string;
  accentColor: string;
  shadowIntensity: number;
  lightDirection: MapLightDirection;
  detailDensity: MapDetailDensity;
  decorationLevel: MapDecorationLevel;
  
  transparentBackground: boolean;
  exportTileSize: number;
}

export interface SpriteSheetFrame {
  id: string;
  prompt: string;
  url: string | null;
  status: 'idle' | 'processing' | 'done' | 'failed';
  bgConfig: BackgroundConfig;
  referenceUrl: string | null;
}

export interface SpriteSheetState {
  frames: SpriteSheetFrame[];
  globalPrompt: string;
  animationGoal: string;
  aspectRatio: AspectRatio;
  globalBackground: BackgroundConfig;
}

export interface CardLayout {
  art: LayoutElement;
  name: LayoutElement;
  description: LayoutElement;
  mana: LayoutElement;
  type: LayoutElement;
}

export interface CardTemplate {
  id: string;
  name: string;
  imageUrl: string | null;
  defaultLayout: CardLayout;
}

// Added CsvCardData for parsing and mapping CSV rows to card data
export interface CsvCardData {
  [key: string]: string;
}


export type Viewpoint = 'none' | 'front' | 'back' | 'side' | 'three-quarter' | 'top-down' | 'high-angle' | 'low-angle' | 'isometric' | 'cinematic';

export interface WorkspaceTab {
  id: string;
  name: string;
  mode: UIMode;
  
  prompt: string;
  generatedImage: string | null;
  sessionImages: string[];
  referenceAssets: ReferenceAsset[];
  selectedStyleId: string;
  selectedSize: ImageSize;
  selectedAspectRatio: AspectRatio;
  bgConfig: BackgroundConfig;
  bgPatternType: BackgroundPatternType;
  viewpoint: Viewpoint;
  seed?: number | null;
  pixelBitSize: '8-bit' | '16-bit' | '32-bit' | '64-bit';
  isPromptOnlyMode?: boolean;
  
  animConfig: AnimationProject;
  selectedFrameId: string | null;

  safeZone: SafeZoneConfig;
  characterTool: CharacterToolState;
  clothesParams: ClothesParams;
  chibiConfig?: ChibiConfig;
  noCharacters?: boolean;
  framing?: CameraFraming;

  resizeQueue: ResizeItem[];
  selectedResizeId: string | null;
  resizeOriginalImage: string | null;
  resizeZoom: number;
  resizePan: { x: number; y: number };

  bgReplaceQueue: BgReplaceItem[];
  selectedBgReplaceId: string | null;

  pixelizeQueue: PixelizeItem[];
  selectedPixelizeId: string | null;
  selectedPixelStyle: PixelStyle;

  gachaAssets: GachaAsset[];
  characterTraits: string;
  characterName: string;
  characterSubtitle: string;
  characterRace: string;
  characterRarity: Rarity;
  characterGender: string;
  chibiProportions: ChibiProportion;
  selectedGachaAssetId: string | null;
  continuityFlags: Record<string, boolean>;
  gachaShowRefs: boolean;

  isEditMode: boolean;
  editRegion: { x: number; y: number; width: number; height: number };
  customRes: PixelDimensions;
  useCustomResBox: boolean;
  customResBox: { x: number; y: number; width: number; height: number };
  
  lastPrompt: string | null;

  frameElements: FrameElement[];
  cardName: string;
  cardMana: string;
  cardEffects: string;
  cardType: string;
  cardLayout: CardLayout;
  templateImage: string | null;
  selectedTemplateId: string;
  selectedLayoutElement: keyof CardLayout | null;

  // UI Reimagine feature
  uiReimagineChangeBg: boolean;
  uiPositionsLocked: boolean;
  uiThemeMood: string;
  uiElements: string[];
  uiMoodEnabled: boolean;
  uiElementsEnabled: boolean;
  uiColorsEnabled: boolean;
  uiMaterialEnabled: boolean;
  uiArchetype: string;
  uiMaterial: string;

  poseData: PoseData;
  mapGridConfig: MapGridConfig;
  spriteSheet: SpriteSheetState;
  spriteStripConfig?: SpriteStripConfig;
  batchQueue: BatchItem[];
  selectedBatchId: string | null;
  batchGenerationMode: BatchGenerationMode;
  batchVariations: BatchVariation[];
}

declare global {
  function showInAppAlert(message: string, options?: { title?: string; confirmText?: string; isDestructive?: boolean }): Promise<void>;
  function showInAppConfirm(message: string, options?: { title?: string; confirmText?: string; cancelText?: string; isDestructive?: boolean }): Promise<boolean>;
  function showInAppPrompt(message: string, defaultValue?: string, options?: { title?: string; confirmText?: string; cancelText?: string }): Promise<string | null>;
}

