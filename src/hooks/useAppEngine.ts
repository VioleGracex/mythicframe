
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  checkApiKey, requestApiKey, generateIllustration, analyzeImageStyle,
  editImage, refinePrompt, generateInspirationPrompt, generateCharacterTraits, generateCharacterConcept,
  generateStyleExample, generateSpriteSheetPrompts, generateSpriteSheetAnimationPrompts,
  fetchAvailableModels, getSelectedModel, setSelectedModel
} from '../services/geminiService';
import { exportResizeBatch, exportSpriteSheet, exportSpriteSheetGrid, exportTileset } from '../services/exportService';
import { uploadImageToDrive, getDriveConnectionStatus } from '../services/googleDriveService';
import { buildBackgroundRegenPrompt } from '../services/promptTemplates';
import { removeBackground, removeBackgroundNeo, base64ToBlobUrl, optimizeBase64Image } from '../utils/imageUtils';
import { 
  GenerationModel, ImageSize, AspectRatio, 
  PixelDimensions, ReferenceAsset, GameContext,
  BackgroundPatternType, SafeZoneConfig, ResizeItem,
  WorkspaceTab, ClothesParams, BgReplaceItem, BackgroundConfig, PixelStyle, PixelizeItem, GachaAsset, Rarity, ArtStyle, StyleCollection,
  AppError, AvailableModel, AIProvider
} from '../types';
import { getActiveAIProvider, setActiveAIProvider, generateWithActiveProvider, isProviderReady } from '../services/aiProviderService';
import { ART_STYLES, DEFAULT_BACKGROUND_CONFIG } from '../constants';
import { useTabs } from './useTabs';
import { useHistory } from './useHistory';
import { useResize } from './useResize';
import { useBgReplace } from './useBgReplace';
import { usePixelize } from './usePixelize';
import { useAnimation } from './useAnimation';
import { useGacha } from './useGacha';
import { useSpriteSheet } from './useSpriteSheet';
import { useGeneration } from './useGeneration';
import { useExportHistory } from './useExportHistory';
import { useLanguage } from '../i18n/LanguageContext';
import { useStyleUsage } from './useStyleUsage';
import { useCanvasHistory } from './useCanvasHistory';
import { buildFullPromptBundle, PromptExportBundle } from '../utils/promptExporter';

export const useAppEngine = () => {
  const { t } = useLanguage();
  const { usageMap, recordStyleUsage } = useStyleUsage();
  
  const [gameContext, setGameContext] = useState<GameContext>(() => {
    const saved = localStorage.getItem('mythic_game_context');
    return saved ? JSON.parse(saved) : { setting: '', tone: '', visualConstraints: '', defaultStyleId: 'none' };
  });

  const {
    tabs, activeTabId, activeTab, effectiveMode, setMode,
    updateActiveTab, updateTabById, handleAddTab, handleCloseTab, handleSwitchTab, handleRenameTab
  } = useTabs(gameContext.defaultStyleId);

  const {
    history, setHistory, currentHistoryEntry, setCurrentHistoryEntry,
    addHistoryEntry, handleRestore, handleClearHistory, handleDeleteHistoryItem, handleRenameHistoryItem, createHistoryEntry
  } = useHistory(setMode, updateActiveTab);

  const {
    pushCanvasSnapshot,
    handleCanvasUndo,
    handleCanvasRedo,
    canUndo: canCanvasUndo,
    canRedo: canCanvasRedo
  } = useCanvasHistory(activeTab, updateActiveTab);

  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [activeProvider, setActiveProviderState] = useState<AIProvider>(() => getActiveAIProvider());
  const [providerReady, setProviderReady] = useState(false);

  const refreshProviderStatus = useCallback(async () => {
    const prov = getActiveAIProvider();
    setActiveProviderState(prov);
    const pReady = await isProviderReady(prov);
    setProviderReady(pReady);
    const keyReady = await checkApiKey();
    setApiKeyReady(keyReady);
  }, []);

  const handleSelectProvider = (prov: AIProvider) => {
    setActiveAIProvider(prov);
    setActiveProviderState(prov);
    refreshProviderStatus();
    setConsoleLogs(p => [`Active AI Engine changed to: ${prov.toUpperCase()}`, ...p]);
  };

  useEffect(() => {
    refreshProviderStatus();
    const onProviderChange = () => refreshProviderStatus();
    window.addEventListener('storage', onProviderChange);
    window.addEventListener('mythic_ai_provider_changed', onProviderChange);
    return () => {
      window.removeEventListener('storage', onProviderChange);
      window.removeEventListener('mythic_ai_provider_changed', onProviderChange);
    };
  }, [refreshProviderStatus]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState(localStorage.getItem('mythic_drive_folder_id') || '');
  const [driveFolderName, setDriveFolderName] = useState(localStorage.getItem('mythic_drive_folder_name') || '');
  
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [useProModel, setUseProModel] = useState(false);
  const [isRightMinimized, setIsRightMinimized] = useState(() => localStorage.getItem('mythic_right_minimized') === 'true');

  // --- In-App Error Modal State ---
  const [appError, setAppError] = useState<AppError | null>(null);

  const showError = (title: string, error: any) => {
    let message = '';
    if (typeof error === 'string') {
      message = error;
    } else if (error && error.message) {
      message = error.message;
    } else {
      message = JSON.stringify(error, null, 2);
    }
    setAppError({
      title,
      message,
      raw: error
    });
    setConsoleLogs(p => [`ERROR [${title}]: ${message}`, ...p]);
  };

  // --- Dynamic Model State & Fetching ---
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>(() => {
    try {
      const saved = localStorage.getItem('mythic_available_models');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [activeModel, setActiveModel] = useState<string>(() => {
    return getSelectedModel() || (useProModel ? GenerationModel.PRO_3 : GenerationModel.FLASH_3_1);
  });

  const handleFetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const models = await fetchAvailableModels();
      setAvailableModels(models);
      localStorage.setItem('mythic_available_models', JSON.stringify(models));
      setConsoleLogs(p => [`Successfully fetched ${models.length} models from Gemini API`, ...p]);
    } catch (err: any) {
      showError("Failed to Fetch Models", err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSelectModel = (modelId: string) => {
    setActiveModel(modelId);
    setSelectedModel(modelId);
    if (modelId === GenerationModel.PRO_3) {
      setUseProModel(true);
    } else if (modelId === GenerationModel.FLASH_3_1 || modelId === GenerationModel.FLASH_2_5 || modelId === GenerationModel.FLASH_LITE_3_1) {
      setUseProModel(false);
    }
    setConsoleLogs(p => [`Active model set to: ${modelId}`, ...p]);
  };
  
  const [showInspiration, setShowInspiration] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showOnionSkin, setShowOnionSkin] = useState(false);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState(false);
  const [animFrameIndex, setAnimFrameIndex] = useState(0);
  
  const [batchSize, setBatchSize] = useState(1);

  const viewpoint = activeTab.viewpoint;
  const setViewpoint = (val: any) => updateActiveTab({ viewpoint: val });
  
  const seed = activeTab.seed;
  const setSeed = (val: number | null) => updateActiveTab({ seed: val });

  const spriteStripConfig = activeTab.spriteStripConfig || {
    prompt: '',
    action: 'walking',
    frameCount: 4,
    direction: 'left'
  };
  const setSpriteStripConfig = (val: any) => updateActiveTab(prev => ({
    spriteStripConfig: typeof val === 'function' ? val(prev.spriteStripConfig || spriteStripConfig) : val
  }));

  // --- Art Style & Library Management ---

  const [customArtStyles, setCustomArtStyles] = useState<ArtStyle[]>(() => {
    const saved = localStorage.getItem('mythic_custom_styles');
    return saved ? JSON.parse(saved) : [];
  });

  const [stylePreviews, setStylePreviews] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('mythic_style_previews');
    return saved ? JSON.parse(saved) : {};
  });

  const [styleCollections, setStyleCollections] = useState<StyleCollection[]>(() => {
    const saved = localStorage.getItem('mythic_style_collections');
    if (saved) {
      try {
        const parsed: StyleCollection[] = JSON.parse(saved);
        const builtInIds = ART_STYLES.map(s => s.id);
        const gameIds = ART_STYLES.filter(s => s.category === 'Game Art').map(s => s.id);
        return parsed.map(c => {
          if (c.id === 'all-built-in') return { ...c, styleIds: Array.from(new Set([...c.styleIds, ...builtInIds])) };
          if (c.id === 'optimized-games') return { ...c, styleIds: Array.from(new Set([...c.styleIds, ...gameIds])) };
          return c;
        });
      } catch (e) {}
    }
    
    return [
      { id: 'all-built-in', name: 'Standard Library', styleIds: ART_STYLES.map(s => s.id), isLocked: true },
      { id: 'optimized-games', name: 'Optimized Game Art', styleIds: ART_STYLES.filter(s => s.category === 'Game Art').map(s => s.id), isLocked: true },
      { id: 'favorites', name: 'My Project Styles', styleIds: ['none'] }
    ];
  });

  const [activeCollectionId, setActiveCollectionId] = useState(() => localStorage.getItem('mythic_active_collection_id') || 'all-built-in');

  useEffect(() => { localStorage.setItem('mythic_custom_styles', JSON.stringify(customArtStyles)); }, [customArtStyles]);
  useEffect(() => { localStorage.setItem('mythic_style_previews', JSON.stringify(stylePreviews)); }, [stylePreviews]);
  useEffect(() => { localStorage.setItem('mythic_style_collections', JSON.stringify(styleCollections)); }, [styleCollections]);
  useEffect(() => { localStorage.setItem('mythic_active_collection_id', activeCollectionId); }, [activeCollectionId]);
  useEffect(() => { localStorage.setItem('mythic_game_context', JSON.stringify(gameContext)); }, [gameContext]);

  const activeCollection = useMemo(() => 
    styleCollections.find(c => c.id === activeCollectionId) || styleCollections[0], 
  [styleCollections, activeCollectionId]);

  const allArtStyles = useMemo(() => [...ART_STYLES, ...customArtStyles], [customArtStyles]);

  // The curated list follows the order of activeCollection.styleIds
  const curatedArtStyles = useMemo(() => {
    const currentList = activeCollection.styleIds;
    const filtered = allArtStyles.filter(s => s.id === 'none' || currentList.includes(s.id));
    
    // Maintain collection order
    return [...filtered].sort((a, b) => {
        const idxA = currentList.indexOf(a.id);
        const idxB = currentList.indexOf(b.id);
        return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
    });
  }, [allArtStyles, activeCollection]);

  const toggleStyleActive = (styleId: string) => {
    setStyleCollections(prev => prev.map(c => {
      if (c.id !== activeCollectionId || c.isLocked) return c;
      const nextIds = c.styleIds.includes(styleId) 
        ? c.styleIds.filter(id => id !== styleId)
        : [...c.styleIds, styleId];
      return { ...c, styleIds: nextIds };
    }));
  };

  const removeAllFromCollection = async () => {
    if (activeCollection.isLocked) return;
    const ok = await showInAppConfirm("Remove all styles from this list?", { title: "Remove Styles", confirmText: "Remove All", isDestructive: true });
    if (ok) {
      setStyleCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, styleIds: ['none'] } : c));
    }
  };

  const reorderInCollection = (styleId: string, direction: 'up' | 'down') => {
    if (activeCollection.isLocked) return;
    const ids = [...activeCollection.styleIds];
    const idx = ids.indexOf(styleId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ids.length) return;
    [ids[idx], ids[targetIdx]] = [ids[targetIdx], ids[idx]];
    setStyleCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, styleIds: ids } : c));
  };

  const addCustomStyle = (style: Omit<ArtStyle, 'id' | 'isCustom'>) => {
    const newId = `custom-${Date.now()}`;
    const newStyle: ArtStyle = { ...style, id: newId, isCustom: true };
    setCustomArtStyles(prev => [...prev, newStyle]);
    toggleStyleActive(newId);
  };

  const updateCustomStyle = (id: string, updates: Partial<ArtStyle>) => {
    setCustomArtStyles(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteCustomStyle = async (id: string) => {
    const ok = await showInAppConfirm("Delete this art style permanently?", { title: "Delete Art Style", confirmText: "Delete", isDestructive: true });
    if (ok) {
      setCustomArtStyles(prev => prev.filter(s => s.id !== id));
      setStyleCollections(prev => prev.map(c => ({ ...c, styleIds: c.styleIds.filter(sid => sid !== id) })));
      setStylePreviews(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  };

  const addStyleCollection = (name: string) => {
    const newId = `collection-${Date.now()}`;
    setStyleCollections(prev => [...prev, { id: newId, name, styleIds: ['none'] }]);
    setActiveCollectionId(newId);
  };

  const deleteStyleCollection = async (id: string) => {
    if (id === 'all-built-in') return;
    const ok = await showInAppConfirm("Delete this style list?", { title: "Delete Style List", confirmText: "Delete", isDestructive: true });
    if (ok) {
      setStyleCollections(prev => prev.filter(c => c.id !== id));
      if (activeCollectionId === id) setActiveCollectionId('all-built-in');
    }
  };

  const updateStylePreview = (id: string, url: string) => {
    setStylePreviews(prev => ({ ...prev, [id]: url }));
  };

  // --- Studio Engine Handlers ---

  useEffect(() => { localStorage.setItem('mythic_right_minimized', String(isRightMinimized)); }, [isRightMinimized]);

  const setTabProp = <K extends keyof WorkspaceTab>(key: K, val: any) => updateActiveTab({ [key]: val });
  const setTabPropFunc = <K extends keyof WorkspaceTab>(key: K, val: any) => updateActiveTab((prev) => ({ [key]: typeof val === 'function' ? val(prev[key]) : val }));

  const prompt = activeTab.prompt; const setPrompt = (v: any) => setTabPropFunc('prompt', v);
  const generatedImage = activeTab.generatedImage; const setGeneratedImage = (v: string | null) => setTabProp('generatedImage', v);
  const sessionImages = activeTab.sessionImages; const setSessionImages = (v: any) => setTabPropFunc('sessionImages', v);

  // Listen for rescued images from ErrorModal or Diagnostics
  useEffect(() => {
    const handleRescued = (e: any) => {
      const detail = e.detail;
      if (detail && detail.image) {
        setGeneratedImage(detail.image);
        setSessionImages((prev: string[]) => [detail.image, ...(prev || [])]);
        setAppError(null);
      }
    };
    window.addEventListener('mythic_image_generated', handleRescued);
    return () => window.removeEventListener('mythic_image_generated', handleRescued);
  }, []);
  const referenceAssets = activeTab.referenceAssets; const setReferenceAssets = (v: any) => setTabPropFunc('referenceAssets', v);
  const selectedStyleId = activeTab.selectedStyleId; const setSelectedStyleId = (v: string) => setTabProp('selectedStyleId', v);
  const bgConfig = activeTab.bgConfig; const setBgConfig = (v: any) => setTabPropFunc('bgConfig', v);
  const selectedAspectRatio = activeTab.selectedAspectRatio; const setSelectedAspectRatio = (v: AspectRatio) => setTabProp('selectedAspectRatio', v);
  const selectedSize = activeTab.selectedSize; const setSelectedSize = (v: ImageSize) => setTabProp('selectedSize', v);
  const bgPatternType = activeTab.bgPatternType; const setBgPatternType = (v: BackgroundPatternType) => setTabProp('bgPatternType', v);
  
  const safeZone = activeTab.safeZone; const setSafeZone = (v:SafeZoneConfig)=>setTabProp('safeZone',v);
  const characterTool = activeTab.characterTool; const setCharacterTool = (v:any)=>setTabPropFunc('characterTool',v);
  const clothesParams = activeTab.clothesParams; const setClothesParams = (v:ClothesParams)=>setTabProp('clothesParams',v);
  const chibiConfig = activeTab.chibiConfig; const setChibiConfig = (v:any)=>setTabPropFunc('chibiConfig',v);
  const noCharacters = activeTab.noCharacters; const setNoCharacters = (v:boolean)=>setTabProp('noCharacters',v);
  const framing = activeTab.framing; const setFraming = (v:any)=>setTabProp('framing',v);

  const isEditMode = activeTab.isEditMode; const setIsEditMode = (v:boolean)=>setTabProp('isEditMode',v);
  const editRegion = activeTab.editRegion; const setEditRegion = (v:any)=>setTabProp('editRegion',v);
  const customRes = activeTab.customRes; const setCustomRes = (v:any)=>setTabPropFunc('customRes',v);
  const useCustomResBox = activeTab.useCustomResBox; const setUseCustomResBox = (v:boolean)=>setTabProp('useCustomResBox',v);
  const customResBox = activeTab.customResBox; const setCustomResBox = (v:any)=>setTabProp('customResBox',v);
  const lastPrompt = activeTab.lastPrompt; const setLastPrompt = (v:string|null)=>setTabProp('lastPrompt',v);
  
  const selectedPixelStyle = activeTab.selectedPixelStyle; const setSelectedPixelStyle = (v:PixelStyle) => setTabProp('selectedPixelStyle', v);

  const selectedTemplateId = activeTab.selectedTemplateId; const setSelectedTemplateId = (v:string) => setTabProp('selectedTemplateId', v);
  const templateImage = activeTab.templateImage; const setTemplateImage = (v:string|null) => setTabProp('templateImage', v);

  const uiReimagineChangeBg = activeTab.uiReimagineChangeBg; const setUiReimagineChangeBg = (v:boolean) => setTabProp('uiReimagineChangeBg', v);
  const uiPositionsLocked = activeTab.uiPositionsLocked; const setUiPositionsLocked = (v:boolean) => setTabProp('uiPositionsLocked', v);
  const uiThemeMood = activeTab.uiThemeMood; const setUiThemeMood = (v:string) => setTabProp('uiThemeMood', v);
  const uiElements = activeTab.uiElements; const setUiElements = (v:string[]) => setTabProp('uiElements', v);
  const uiMoodEnabled = activeTab.uiMoodEnabled; const setUiMoodEnabled = (v:boolean) => setTabProp('uiMoodEnabled', v);
  const uiElementsEnabled = activeTab.uiElementsEnabled; const setUiElementsEnabled = (v:boolean) => setTabProp('uiElementsEnabled', v);
  const uiColorsEnabled = activeTab.uiColorsEnabled; const setUiColorsEnabled = (v:boolean) => setTabProp('uiColorsEnabled', v);
  const uiMaterialEnabled = activeTab.uiMaterialEnabled; const setUiMaterialEnabled = (v:boolean) => setTabProp('uiMaterialEnabled', v);

  /* Fix: Added missing getters and setters for uiArchetype and uiMaterial to support shorthand property in return object */
  const uiArchetype = activeTab.uiArchetype; const setUiArchetype = (v:string) => setTabProp('uiArchetype', v);
  const uiMaterial = activeTab.uiMaterial; const setUiMaterial = (v:string) => setTabProp('uiMaterial', v);
  const pixelBitSize = activeTab.pixelBitSize; const setPixelBitSize = (v: '8-bit' | '16-bit' | '32-bit' | '64-bit') => setTabProp('pixelBitSize', v);
  const isPromptOnlyMode = activeTab.isPromptOnlyMode ?? false;
  const setIsPromptOnlyMode = (v: boolean) => setTabProp('isPromptOnlyMode', v);

  // --- Prompt Export Modal State ---
  const [showPromptExportModal, setShowPromptExportModal] = useState(false);
  const [promptExportBundle, setPromptExportBundle] = useState<PromptExportBundle | null>(null);
  const [isNoApiKeyNotice, setIsNoApiKeyNotice] = useState(false);

  const handleOpenPromptExport = (isNoApi = false) => {
    const bundle = buildFullPromptBundle(activeTab, gameContext, customArtStyles);
    setPromptExportBundle(bundle);
    setIsNoApiKeyNotice(isNoApi);
    setShowPromptExportModal(true);
  };
  const handleClosePromptExport = () => {
    setShowPromptExportModal(false);
  };

  const poseData = activeTab.poseData; const setPoseData = (v: any) => setTabPropFunc('poseData', v);
  const mapGridConfig = activeTab.mapGridConfig; const setMapGridConfig = (v: any) => setTabPropFunc('mapGridConfig', v);

  const resizeLogic = useResize(activeTab, updateActiveTab, setGeneratedImage);
  const animLogic = useAnimation(activeTab, updateActiveTab, setGeneratedImage);
  const gachaLogic = useGacha(activeTab, updateActiveTab);
  const spriteSheetLogic = useSpriteSheet(activeTab, updateActiveTab);
  const exports = useExportHistory();
  
  const handleGenerateSpriteSheet = async (frameId?: string) => {
    if (!activeTab.spriteSheet) return;
    
    const framesToGenerate = frameId 
      ? activeTab.spriteSheet.frames.filter(f => f.id === frameId)
      : activeTab.spriteSheet.frames.filter(f => !f.url || f.status === 'processing');
    
    if (framesToGenerate.length === 0) return;

    generation.setIsGenerating(true);
    generation.setStatusMessage(frameId ? "Generating sprite frame..." : `Generating ${framesToGenerate.length} sprite frames...`);

    const abortController = new AbortController();
    generation.abortControllerRef.current = abortController;

    try {
      const model = useProModel ? GenerationModel.PRO_3 : GenerationModel.FLASH_3_1;
      const size = activeTab.selectedSize;
      let styleSnippet = activeTab.selectedStyleId !== 'none' ? ART_STYLES.find(s => s.id === activeTab.selectedStyleId)?.promptSnippet || '' : '';

      // Apply bit size override for pixel art styles
      if (activeTab.pixelBitSize && (activeTab.selectedStyleId === 'pixel_art' || activeTab.selectedStyleId === 'retro_8bit_micro')) {
        styleSnippet = styleSnippet.replace(/16-bit/g, activeTab.pixelBitSize).replace(/8-bit/g, activeTab.pixelBitSize);
        if (!styleSnippet.includes(activeTab.pixelBitSize)) {
          styleSnippet += `, ${activeTab.pixelBitSize}`;
        }
      }

      let firstGeneratedUrl = '';

      for (const frame of framesToGenerate) {
        if (abortController.signal.aborted) break;
        
        spriteSheetLogic.updateFrame(frame.id, { status: 'processing' });
        
        const fullPrompt = `${activeTab.spriteSheet.globalPrompt}. ${frame.prompt}`;
        let result = await generateWithActiveProvider({
          prompt: fullPrompt,
          model,
          size,
          aspectRatio: activeTab.spriteSheet.aspectRatio,
          referenceAssets: activeTab.referenceAssets,
          bgConfig: frame.bgConfig || activeTab.spriteSheet.globalBackground,
          gameContext,
          signal: abortController.signal,
          styleSnippet,
          mode: 'sprite-sheet',
          frameElements: [],
          bgPatternType: 'scene',
          continuityFlags: activeTab.continuityFlags,
          seed: activeTab.seed
        });

        let resultUrl = result.image;
        const currentBgConfig = frame.bgConfig || activeTab.spriteSheet.globalBackground;

        if (currentBgConfig.mode === 'transparent') {
          generation.setStatusMessage(`Removing Background (Frame ${framesToGenerate.indexOf(frame) + 1})...`);
          resultUrl = await removeBackground(resultUrl, 60, currentBgConfig.removeHoles, currentBgConfig.healingPower, '#FFFFFF');
        } else if (currentBgConfig.mode === 'transparent_neo') {
          generation.setStatusMessage(`Matting & Decontaminating (Frame ${framesToGenerate.indexOf(frame) + 1})...`);
          resultUrl = await removeBackgroundNeo(resultUrl, currentBgConfig);
        }

        if (!firstGeneratedUrl) firstGeneratedUrl = resultUrl;

        spriteSheetLogic.updateFrame(frame.id, { 
          url: resultUrl, 
          status: 'done' 
        });
      }
      
      if (firstGeneratedUrl) {
        addHistoryEntry({
          fullPrompt: activeTab.spriteSheet.globalPrompt,
          thumbnailUrl: firstGeneratedUrl,
          mode: 'sprite-sheet',
          userPrompt: activeTab.spriteSheet.globalPrompt,
          gameContext,
          styleId: activeTab.selectedStyleId,
          bgConfig: activeTab.spriteSheet.globalBackground,
          referenceAssets: activeTab.referenceAssets,
          size: size,
          aspectRatio: activeTab.spriteSheet.aspectRatio
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logConsole("Sprite sheet generation cancelled");
      } else {
        console.error("Sprite sheet generation failed:", error);
        generation.setStatusMessage(`Error: ${error.message}`);
      }
    } finally {
      generation.setIsGenerating(false);
      generation.setStatusMessage('');
      if (generation.abortControllerRef.current === abortController) {
        generation.abortControllerRef.current = null;
      }
    }
  };

  const handleExportSpriteSheet = () => {
    const baseName = `SpriteSheet_${activeTab.characterName || activeTab.name || 'Untitled'}_${Date.now()}`;
    exportSpriteSheet(activeTab.spriteSheet.frames, baseName);
  };

  const handleExportSpriteSheetGrid = () => {
    const baseName = `SpriteSheetGrid_${activeTab.characterName || activeTab.name || 'Untitled'}_${Date.now()}`;
    exportSpriteSheetGrid(activeTab.spriteSheet.frames, baseName);
  };

  const handleExportTileset = () => {
    if (!generatedImage || !mapGridConfig) return;
    const baseName = `Tileset_${activeTab.characterName || activeTab.name || 'Untitled'}_${Date.now()}`;
    exportTileset(generatedImage, mapGridConfig.gridHeight, mapGridConfig.gridWidth, baseName, mapGridConfig.exportTileSize);
  };

  const handleSuggestPoses = async () => {
    if (!activeTab.spriteSheet) return;
    generation.setIsGenerating(true);
    generation.setStatusMessage("Suggesting poses...");
    try {
      const result = await generateSpriteSheetPrompts(
        activeTab.spriteSheet.globalPrompt,
        activeTab.spriteSheet.frames.length,
        gameContext
      );
      
      result.poses.forEach((pose, i) => {
        if (activeTab.spriteSheet?.frames[i]) {
          spriteSheetLogic.updateFrame(activeTab.spriteSheet.frames[i].id, { prompt: pose });
        }
      });
      
      if (result.refinedGlobalPrompt) {
        spriteSheetLogic.setGlobalPrompt(result.refinedGlobalPrompt);
      }
    } catch (error: any) {
      console.error("Suggest poses failed:", error);
    } finally {
      generation.setIsGenerating(false);
      generation.setStatusMessage('');
    }
  };

  const handleGenerateAnimationFrames = async () => {
    if (!activeTab.spriteSheet || !activeTab.spriteSheet.animationGoal) return;
    generation.setIsGenerating(true);
    generation.setStatusMessage("Generating animation sequence...");
    try {
      const result = await generateSpriteSheetAnimationPrompts(
        activeTab.spriteSheet.globalPrompt,
        activeTab.spriteSheet.animationGoal,
        activeTab.spriteSheet.frames.length,
        gameContext
      );
      
      result.poses.forEach((pose, i) => {
        if (activeTab.spriteSheet?.frames[i]) {
          spriteSheetLogic.updateFrame(activeTab.spriteSheet.frames[i].id, { prompt: pose });
        }
      });
      
      if (result.refinedGlobalPrompt) {
        spriteSheetLogic.setGlobalPrompt(result.refinedGlobalPrompt);
      }
    } catch (error: any) {
      console.error("Generate animation frames failed:", error);
    } finally {
      generation.setIsGenerating(false);
      generation.setStatusMessage('');
    }
  };

  const handleRefineSpriteSheetGlobalPrompt = async () => {
    if (!activeTab.spriteSheet) return;
    generation.setIsGenerating(true);
    try {
      const refined = await refinePrompt(activeTab.spriteSheet.globalPrompt);
      spriteSheetLogic.setGlobalPrompt(refined);
    } catch (error) {
      console.error("Refine prompt failed:", error);
    } finally {
      generation.setIsGenerating(false);
    }
  };

  const bgReplaceLogic = useBgReplace(activeTab, updateActiveTab, setGeneratedImage, (p, conf) => {
      updateActiveTab({ prompt: p, bgConfig: conf });
  });

  const pixelizeLogic = usePixelize(activeTab, updateActiveTab, setGeneratedImage, (style) => {
      setSelectedPixelStyle(style);
  });

  useEffect(() => {
      if (activeTab.mode === 'bg-replace' && activeTab.selectedBgReplaceId) {
          bgReplaceLogic.updateSelectedItem({ prompt: activeTab.prompt, bgConfig: activeTab.bgConfig });
      }
  }, [activeTab.prompt, activeTab.bgConfig, activeTab.mode, activeTab.selectedBgReplaceId]);

  useEffect(() => {
      if (activeTab.mode === 'pixelize' && activeTab.selectedPixelizeId) {
          pixelizeLogic.updateSelectedItem({ pixelStyle: activeTab.selectedPixelStyle });
      }
  }, [activeTab.selectedPixelStyle, activeTab.mode, activeTab.selectedPixelizeId]);

  const logConsole = (msg: string) => setConsoleLogs(p => [msg, ...p]);
  const getTargetDimensions = (): PixelDimensions => {
     if (selectedAspectRatio === 'custom') return customRes;
     const dimMap: Record<string, [number, number]> = { "1:1":[1024,1024], "3:4":[768,1024], "4:3":[1024,768], "9:16":[576,1024], "16:9":[1024,576], "21:9":[1024,440] };
     const d = dimMap[selectedAspectRatio] || [1024,1024];
     return { width: d[0], height: d[1] };
  };

  const generation = useGeneration(
    activeTab, apiKeyReady, useProModel, gameContext, batchSize,
    setGeneratedImage, setSessionImages, addHistoryEntry, 
    resizeLogic.setResizeQueue, bgReplaceLogic.setBgReplaceQueue, pixelizeLogic.setPixelizeQueue,
    gachaLogic.setGachaAssets,
    logConsole, getTargetDimensions,
    updateTabById,
    recordStyleUsage,
    activeModel,
    showError,
    handleOpenPromptExport
  );

  const handleGenerateAllResize = async () => {
    const pending = activeTab.resizeQueue.filter((i: any) => i.status === 'pending');
    for (const item of pending) {
        resizeLogic.onSelectResizeItem(item.id);
        await new Promise(r => setTimeout(r, 50));
        await generation.handleGenerate();
    }
  };

  const handleGenerateAllBgReplace = async () => {
     const pending = activeTab.bgReplaceQueue.filter(i => i.status === 'pending');
     for (const item of pending) {
         bgReplaceLogic.onSelectBgReplaceItem(item.id);
         await new Promise(r => setTimeout(r, 50));
         await generation.handleGenerate();
     }
  };

  const handleGenerateAllPixelize = async () => {
     if (generation.isGenerating) return;
     const pending = activeTab.pixelizeQueue.filter(i => i.status === 'pending');
     for (const item of pending) {
         pixelizeLogic.onSelectPixelizeItem(item.id);
         await new Promise(r => setTimeout(r, 50));
         await generation.handleGenerate();
     }
  };

  const [batchIntervention, setBatchIntervention] = useState<{
    itemId: string;
    itemName: string;
    itemPrompt: string;
    errorMessage: string;
    isSafety: boolean;
    resolve: (response: { action: 'retry' | 'sanitize' | 'skip' | 'abort' | 'edit', newPrompt?: string }) => void;
  } | null>(null);

  const isBatchPausedRef = useRef(false);
  const [isBatchPaused, setIsBatchPaused] = useState(false);

  const handlePauseBatch = () => {
    isBatchPausedRef.current = true;
    setIsBatchPaused(true);
    generation.setStatusMessage("Pausing batch queue after active item completes...");
  };

  const handleResumeBatch = () => {
    isBatchPausedRef.current = false;
    setIsBatchPaused(false);
    handleGenerateBatch();
  };

  const handleGenerateBatch = async () => {
    if (generation.isGenerating) return;
    const queue = activeTab.batchQueue || [];
    const pending = queue.filter(i => i.status === 'pending' && i.enabled && !i.isSeriesTemplate);
    if (pending.length === 0) return;

    isBatchPausedRef.current = false;
    setIsBatchPaused(false);

    // Sort pending items by priority: Full Body > Waist Up > Chibi > Item > Texture > Icon > General
    const getPriority = (n: string) => {
      if (n.includes('[FULL BODY]')) return 1;
      if (n.includes('[WAIST UP]')) return 2;
      if (n.includes('[CHIBI]')) return 3;
      if (n.includes('[ITEM]')) return 4;
      if (n.includes('[TEXTURE]')) return 5;
      if (n.includes('[ICON]')) return 6;
      return 7;
    };
    
    // Maintain chronological group order based on their first appearance in the queue
    const coreNameOrder = new Map<string, number>();
    queue.forEach((i, idx) => {
       const coreName = i.name.split('[')[0].trim();
       if (!coreNameOrder.has(coreName)) {
           coreNameOrder.set(coreName, idx);
       }
    });

    const sortedPending = [...pending].sort((a, b) => {
      const coreA = a.name.split('[')[0].trim();
      const coreB = b.name.split('[')[0].trim();
      
      if (coreA !== coreB) {
         return (coreNameOrder.get(coreA) || 0) - (coreNameOrder.get(coreB) || 0);
      }
      return getPriority(a.name) - getPriority(b.name);
    });

    generation.setIsGenerating(true);
    generation.setStatusMessage(`Processing batch of ${sortedPending.length} items...`);

    const abortController = new AbortController();
    generation.abortControllerRef.current = abortController;

    try {
      const model = useProModel ? GenerationModel.PRO_3 : GenerationModel.FLASH_3_1;
      const size = activeTab.selectedSize;
      const styleSnippet = activeTab.selectedStyleId !== 'none' ? ART_STYLES.find(s => s.id === activeTab.selectedStyleId)?.promptSnippet || '' : '';

      const referenceMap = new Map<string, string>();
      const processedItems = new Map<string, any>();
      
      // Pre-populate referenceMap with existing 'done' FULL BODY items for consistency
      queue.filter(i => i.status === 'done' && i.imageUrl && i.name.includes('[FULL BODY]')).forEach(i => {
          const coreName = i.name.split('[')[0].trim();
          if (!referenceMap.has(coreName)) referenceMap.set(coreName, i.imageUrl!);
      });

      for (const item of sortedPending) {
        if (abortController.signal.aborted || isBatchPausedRef.current) break;

        const coreName = item.name.split('[')[0].trim();
        const effectiveReferences = [...activeTab.referenceAssets];
        let appliedRefUrl: string | undefined = item.usedReferenceUrl;

        if (appliedRefUrl && !item.skipReference) {
            effectiveReferences.push({ 
                id: `ref-${item.id}-manual`,
                url: appliedRefUrl, 
                role: 'CHARACTER_CONSISTENCY',
                weight: item.referenceWeight ?? 0.8
            } as any);
        } else if (activeTab.batchGenerationMode === 'consistent_series' && !item.skipReference) {
           const refUrl = referenceMap.get(coreName) || referenceMap.get(item.name);
           if (refUrl) {
              appliedRefUrl = refUrl;
              effectiveReferences.push({ 
                id: `ref-${item.id}`,
                url: refUrl, 
                role: 'CHARACTER_CONSISTENCY',
                weight: item.referenceWeight ?? (item.name.includes('[WAIST UP]') ? 0.6 : 1.0)
              } as any);
           }
        }
        
        const processingItem = { ...item, status: 'processing', usedReferenceUrl: appliedRefUrl };
        processedItems.set(item.id, processingItem);

        updateActiveTab((prev: WorkspaceTab) => ({
          batchQueue: prev.batchQueue.map(i => i.id === item.id ? processingItem : i)
        }));

        let currentPrompt = item.prompt;
        let itemSuccess = false;

        while (!itemSuccess && !abortController.signal.aborted) {
            // Trim extremely long prompts to prevent max length failures
            if (currentPrompt.length > 2000) {
                currentPrompt = currentPrompt.substring(0, 2000);
            }

            try {
              const result = await generateWithActiveProvider({
                prompt: currentPrompt,
                model,
                size,
                aspectRatio: item.aspectRatio,
                referenceAssets: effectiveReferences,
                bgConfig: activeTab.bgConfig,
                gameContext,
                signal: abortController.signal,
                styleSnippet,
                mode: 'batch',
                frameElements: [],
                bgPatternType: 'scene',
                continuityFlags: activeTab.continuityFlags,
                chibiConfig: item.name.includes('[CHIBI]') ? { ...activeTab.chibiConfig, enabled: true } : undefined,
                viewpoint: activeTab.viewpoint,
                noCharacters: item.name.includes('[ITEM]') || item.name.includes('[TEXTURE]') || item.name.includes('[ICON]') || activeTab.noCharacters,
                framing: (item.name.includes('[ITEM]') || item.name.includes('[TEXTURE]') || item.name.includes('[ICON]')) ? undefined :
                         (item.name.includes('[FULL-BODY]') || item.name.includes('[FULL BODY]')) ? 'full-body' :
                         (item.name.includes('[WAIST-UP]') || item.name.includes('[WAIST UP]')) ? 'waist-up' :
                         item.name.includes('[CHIBI]') ? 'full-body' :
                         activeTab.framing,
                seed: activeTab.seed
              });

              let resultUrl = result.image;
              const optimizedForHistory = await optimizeBase64Image(resultUrl, 1024, 0.7);

              // Save to reference map if this is the first success for this name in series mode
              // Prioritize Full Body as the key reference in the map
              if (activeTab.batchGenerationMode === 'consistent_series') {
                const coreName = item.name.split('[')[0].trim();
                // If it's a full body OR the first successful gen for this character, store it
                if (item.name.includes('[FULL BODY]') || !referenceMap.has(coreName)) {
                   referenceMap.set(coreName, resultUrl);
                }
              }

              if (activeTab.bgConfig.mode === 'transparent') {
                resultUrl = await removeBackground(resultUrl, 60, activeTab.bgConfig.removeHoles, activeTab.bgConfig.healingPower, '#FFFFFF');
              } else if (activeTab.bgConfig.mode === 'transparent_neo') {
                resultUrl = await removeBackgroundNeo(resultUrl, activeTab.bgConfig);
              }

              const doneItem = { ...item, status: 'done', imageUrl: base64ToBlobUrl(resultUrl), prompt: currentPrompt };
              processedItems.set(item.id, doneItem);

              updateActiveTab((prev: WorkspaceTab) => ({
                batchQueue: prev.batchQueue.map(i => i.id === item.id ? doneItem : i)
              }));

              const historyQueue = queue.map(i => processedItems.has(i.id) ? processedItems.get(i.id) : i);

              await addHistoryEntry({
                fullPrompt: currentPrompt,
                thumbnailUrl: optimizedForHistory,
                mode: 'batch',
                userPrompt: currentPrompt,
                gameContext,
                styleId: activeTab.selectedStyleId,
                bgConfig: activeTab.bgConfig,
                referenceAssets: activeTab.referenceAssets,
                size: size,
                aspectRatio: item.aspectRatio,
                customName: item.name,
                batchQueue: historyQueue
              });
              
              itemSuccess = true;

            } catch (itemError: any) {
              if (abortController.signal.aborted) break;

              const errorMessage = itemError?.message?.trim() || String(itemError) || "Unknown generation error";
              console.error(`Batch item ${item.name} failed:`, itemError);
              
              const isSafety = errorMessage.toLowerCase().includes('safety') || 
                               errorMessage.toLowerCase().includes('policy') ||
                               errorMessage.toLowerCase().includes('recitation');

              const response = await new Promise<{action: 'retry'|'sanitize'|'skip'|'abort'|'edit', newPrompt?: string}>((resolve) => {
                 setBatchIntervention({
                    itemId: item.id,
                    itemName: item.name,
                    itemPrompt: currentPrompt,
                    errorMessage,
                    isSafety,
                    resolve
                 });
              });

              setBatchIntervention(null);

              if (response.action === 'abort') {
                 abortController.abort();
                 break;
              } else if (response.action === 'skip') {
                 const failedItem = { ...item, status: 'failed', error: errorMessage, prompt: currentPrompt };
                 processedItems.set(item.id, failedItem);
                 updateActiveTab((prev: WorkspaceTab) => ({
                   batchQueue: prev.batchQueue.map(i => i.id === item.id ? failedItem : i)
                 }));
                 break; // break retry loop, move to next item
              } else if (response.action === 'sanitize') {
                 // Basic sanitization
                 currentPrompt = currentPrompt.replace(/(nsfw|blood|gore|nude|sexy|violence|kill|death|murder)/gi, '').replace(/\s+/g, ' ').trim();
              } else if (response.action === 'edit' && response.newPrompt) {
                 currentPrompt = response.newPrompt;
              }
              // If 'retry', it simply loops back around with the same prompt.
            }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Batch generation failed:", error);
      }
    } finally {
      generation.setIsGenerating(false);
      if (isBatchPausedRef.current) {
        generation.setStatusMessage('Batch queue paused. Click Resume to continue.');
      } else {
        generation.setStatusMessage('');
      }
      generation.abortControllerRef.current = null;
      
      // Auto-save batch zip right after ending the loop using the latest queue
      setTimeout(() => {
         updateTabById(activeTabId, (currentTab) => {
             const doneItems = (currentTab.batchQueue || []).filter((i: any) => i.status === 'done' && i.imageUrl);
             if (doneItems.length > 0 && pending.length > 0) {
                 import('jszip').then(async (module) => {
                     try {
                         const JSZip = module.default;
                         const zip = new JSZip();
                         for (const item of doneItems) {
                             try {
                                const response = await fetch(item.imageUrl!);
                                const blob = await response.blob();
                                const coreName = item.name.split(' [')[0].trim().replace(/chibi|full\s*body|waist\s*up/gi, "").trim();
                                const safeCharName = coreName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                                const charFolder = zip.folder(safeCharName);
                                const styleMatch = item.name.match(/\[(.*?)\]/);
                                const styleSuffix = styleMatch ? `_${styleMatch[1].replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}` : '';
                                const cleanItemName = `${safeCharName}${styleSuffix}`;
                                const fileName = `${cleanItemName}.png`;
                                if (charFolder) {
                                    charFolder.file(fileName, blob);
                                } else {
                                    zip.file(fileName, blob);
                                }
                             } catch (e) {}
                         }
                         const content = await zip.generateAsync({ type: 'blob' });
                         if (exports?.addExportEntry) {
                             await exports.addExportEntry({
                                name: `Batch_Archive_${new Date().toISOString().slice(0, 10)}.zip`,
                                itemCount: doneItems.length,
                                fileSize: content.size,
                                type: 'zip',
                                blob: content
                             });
                         }
                     } catch (e) {
                         console.error("Failed auto-saving batch zip", e);
                     }
                 });
             }
             return {}; // Return empty object since we are not mutating State
         });
      }, 500);
    }
  };

  const reorderBatchItem = (id: string, direction: 'up' | 'down') => {
    updateActiveTab((prev: WorkspaceTab) => {
      const queue = [...(prev.batchQueue || [])];
      const index = queue.findIndex(i => i.id === id);
      if (index === -1) return {};
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= queue.length) return {};
      
      const [movedItem] = queue.splice(index, 1);
      queue.splice(newIndex, 0, movedItem);
      
      return { batchQueue: queue };
    });
  };

  const handleGenerateEntireSet = async () => {
    const pending = activeTab.gachaAssets.filter(a => a.status !== 'processing' && !a.locked);
    for (const asset of pending) {
      gachaLogic.setSelectedGachaAssetId(asset.id);
      await new Promise(r => setTimeout(r, 50));
      await generation.handleGenerate(false, asset.id);
    }
  };

  const handleExportAllResize = async () => { await exportResizeBatch(activeTab.resizeQueue); };
  const handleConnect = async () => { 
    setMode('settings');
  };
  const handleRefreshKey = async () => { const hasKey = await checkApiKey(); setApiKeyReady(hasKey); };
  const handleSaveToDrive = async () => {
     if (!generatedImage) return;
     try {
        const name = `Mythic_${activeTab.mode}_${Date.now()}`;
        const id = await uploadImageToDrive(generatedImage, name, driveFolderId || undefined);
        await showInAppAlert(`Saved to Drive! File ID: ${id}`, { title: "Google Drive" });
     } catch(e: any) { await showInAppAlert(`Failed to save to Drive: ${e.message}`, { title: "Google Drive Error", isDestructive: true }); }
  };

  const handleAssetSelect = (url: string) => {
     if (activeTab.mode === 'resize') { resizeLogic.onSelectResizeItem(url); setGeneratedImage(url); } else { setGeneratedImage(url); }
  };

  const handleApplyCrop = (croppedUrl: string) => {
     if (activeTab.mode === 'resize') { resizeLogic.setResizeOriginalImage(croppedUrl); }
     setGeneratedImage(croppedUrl); setShowCropModal(false);
  };

  const handleMatchReferenceSize = (asset: ReferenceAsset) => {
     const img = new Image();
     img.onload = () => { setCustomRes({ width: img.width, height: img.height }); setSelectedAspectRatio('custom'); };
     img.src = asset.url;
  };

  const handleAnalyzeStyle = async () => {
     const ref = referenceAssets[0]; if (!ref) return; setIsAnalyzing(true);
     try {
        const analysis = await analyzeImageStyle(ref.url);
        setPrompt(p => p + (p ? "\n" : "") + analysis.promptSnippet);
        logConsole(`Style Analyzed: ${analysis.description}`);
     } catch(e) { console.error(e); } finally { setIsAnalyzing(false); }
  };

  const handleRefinePrompt = async () => {
     if (!prompt) return; setLastPrompt(prompt); setIsSuggesting(true);
     try { const refined = await refinePrompt(prompt); setPrompt(refined); } catch(e) { console.error(e); } finally { setIsSuggesting(false); }
  };

  const handleInspirePrompt = async () => {
    setIsSuggesting(true);
    try {
      const styleObj = ART_STYLES.find(s => s.id === activeTab.selectedStyleId);
      const styleName = styleObj?.name || 'Anime / Manga';
      const inspired = await generateInspirationPrompt(activeTab.mode, styleName, gameContext);
      if (inspired) {
        setLastPrompt(prompt);
        setPrompt(inspired);
        logConsole(`AI Inspired Prompt: ${inspired.slice(0, 50)}...`);
      }
    } catch (e) {
      console.error('Inspire prompt failed:', e);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSuggestTraits = async () => {
     if (!activeTab.characterName) { await showInAppAlert("Please enter a character name first."); return; }
     setIsSuggesting(true);
     try {
        const suggested = await generateCharacterTraits(activeTab.characterName, activeTab.characterSubtitle, activeTab.characterGender, gameContext);
        gachaLogic.setCharacterTraits(suggested); logConsole(`Suggested traits for ${activeTab.characterName}`);
     } catch (e) { console.error(e); } finally { setIsSuggesting(false); }
  };

  const handleSuggestConcept = async () => {
     setIsSuggesting(true);
     try {
        const concept = await generateCharacterConcept(gameContext);
        gachaLogic.setCharacterName(concept.name); gachaLogic.setCharacterSubtitle(concept.subtitle);
        gachaLogic.setCharacterGender(concept.gender); gachaLogic.setCharacterTraits(concept.traits);
        logConsole(`Suggested new concept: ${concept.name}`);
     } catch (e) { console.error(e); } finally { setIsSuggesting(false); }
  };

  const handleUndoPrompt = () => { if (lastPrompt) { setPrompt(lastPrompt); setLastPrompt(null); } };

  useEffect(() => { checkApiKey().then(setApiKeyReady); setDriveConnected(getDriveConnectionStatus()); }, []);

  const handleClearSession = () => {
    const tabId = activeTabId;
    updateTabById(tabId, (prev: WorkspaceTab) => ({
          ...prev, sessionImages: [], generatedImage: null,
          resizeOriginalImage: prev.mode === 'resize' ? null : prev.resizeOriginalImage
    }));
    // Reset browser chat session thread when session holding gallery is cleared
    import('../services/beiService').then(({ resetBEISession }) => {
      resetBEISession(tabId).catch(() => {});
    });
  };

  return {
    mode: effectiveMode, setMode, tabs, activeTabId, activeTab, updateActiveTab,
    handleAddTab, handleCloseTab, handleSwitchTab: (id: string) => {
      if (effectiveMode === 'style-library') { const tab = tabs.find(t => t.id === id); if (tab) setMode(tab.mode); }
      handleSwitchTab(id);
    },
    handleRenameTab, history, showHistory, setShowHistory, currentHistoryEntry,
    handleRestore, handleClearHistory, handleDeleteHistoryItem, handleRenameHistoryItem,
    apiKeyReady, handleConnect, handleRefreshKey,
    activeProvider, setActiveProvider: handleSelectProvider, providerReady, refreshProviderStatus,
    gameContext, setGameContext, driveConnected, driveFolderId, setDriveFolderId, driveFolderName, setDriveFolderName, handleSaveToDrive,
    showExport, setShowExport, showConsole, setShowConsole, consoleLogs,
    showAssetPicker, setShowAssetPicker, handleAssetSelect,
    showFolderPicker, setShowFolderPicker, handleFolderSelect: (id: string, name: string) => { setDriveFolderId(id); setDriveFolderName(name); },
    showCropModal, setShowCropModal, handleApplyCrop,
    prompt, setPrompt, generatedImage, setGeneratedImage, sessionImages, referenceAssets, setReferenceAssets,
    selectedStyleId, setSelectedStyleId, selectedSize, setSelectedSize, selectedAspectRatio, setSelectedAspectRatio,
    bgConfig, setBgConfig, bgPatternType, setBgPatternType, safeZone, setSafeZone, characterTool, setCharacterTool, clothesParams, setClothesParams,
    chibiConfig, setChibiConfig, noCharacters, setNoCharacters, framing, setFraming,
    usageMap,

    // --- Art Style Props ---
    customArtStyles, allArtStyles, curatedArtStyles, stylePreviews, activeStyleIds: activeCollection.styleIds,
    activeCollectionId, styleCollections,
    addCustomStyle, updateCustomStyle, deleteCustomStyle, 
    toggleStyleActive: (styleId: string) => toggleStyleActive(styleId),
    removeAllFromCollection, reorderInCollection,
    updateStylePreview, setActiveCollectionId, addStyleCollection, deleteStyleCollection,
    
    animConfig: animLogic.animConfig, selectedFrameId: animLogic.selectedFrameId, setSelectedFrameId: animLogic.setSelectedFrameId,
    handleAddFrame: animLogic.handleAddFrame, handleUpdateFramePrompt: animLogic.handleUpdateFramePrompt,
    handleDeleteFrame: animLogic.handleDeleteFrame, handleDuplicateFrame: animLogic.handleDuplicateFrame,
    handleClearFrames: animLogic.handleClearFrames, handleClearSession, handleFrameImageUpload: animLogic.handleFrameImageUpload,
    resizeQueue: resizeLogic.resizeQueue, selectedResizeId: resizeLogic.selectedResizeId, resizeOriginalImage: resizeLogic.resizeOriginalImage,
    resizeZoom: resizeLogic.resizeZoom, resizePan: resizeLogic.resizePan, setResizeZoom: resizeLogic.setResizeZoom, setResizePan: resizeLogic.setResizePan,
    setResizeOriginalImage: resizeLogic.setResizeOriginalImage, onAddResizeFiles: resizeLogic.onAddResizeFiles, onSelectResizeItem: resizeLogic.onSelectResizeItem,
    onRemoveResizeItem: resizeLogic.onRemoveResizeItem, handleClearResizeResult: resizeLogic.handleClearResizeResult, handleResizeRename: resizeLogic.handleResizeRename,
    bgReplaceQueue: bgReplaceLogic.bgReplaceQueue, selectedBgReplaceId: bgReplaceLogic.selectedBgReplaceId,
    onAddBgReplaceFiles: bgReplaceLogic.onAddBgReplaceFiles, onSelectBgReplaceItem: bgReplaceLogic.onSelectBgReplaceItem,
    onRemoveBgReplaceItem: bgReplaceLogic.onRemoveBgReplaceItem, handleClearBgReplaceResult: bgReplaceLogic.handleClearBgReplaceResult,
    handleBgReplaceRename: bgReplaceLogic.handleBgReplaceRename, pixelizeQueue: pixelizeLogic.pixelizeQueue,
    selectedPixelizeId: pixelizeLogic.selectedPixelizeId, selectedPixelStyle, setSelectedPixelStyle,
    onAddPixelizeFiles: pixelizeLogic.onAddPixelizeFiles, onSelectPixelizeItem: pixelizeLogic.onSelectPixelizeItem,
    onRemovePixelizeItem: pixelizeLogic.onRemovePixelizeItem, handleClearPixelizeResult: pixelizeLogic.handleClearPixelizeResult,
    handlePixelizeRename: pixelizeLogic.handlePixelizeRename, 
    
    // --- Sprite Sheet ---
    ...spriteSheetLogic,
    handleGenerateSpriteSheet,
    handleSuggestPoses,
    handleGenerateAnimationFrames,
    handleRefineSpriteSheetGlobalPrompt,
    handleExportSpriteSheet,
    handleExportSpriteSheetGrid,
    handleExportTileset,

    gachaAssets: gachaLogic.gachaAssets,
    characterTraits: gachaLogic.characterTraits, characterName: gachaLogic.characterName, characterSubtitle: gachaLogic.characterSubtitle,
    characterRace: gachaLogic.characterRace, characterRarity: gachaLogic.characterRarity, characterGender: gachaLogic.characterGender,
    chibiProportions: gachaLogic.chibiProportions, onUpdateProportions: gachaLogic.setChibiProportions, selectedGachaAssetId: gachaLogic.selectedGachaAssetId,
    continuityFlags: gachaLogic.continuityFlags, gachaShowRefs: gachaLogic.gachaShowRefs, setCharacterTraits: gachaLogic.setCharacterTraits,
    setCharacterName: gachaLogic.setCharacterName, setCharacterSubtitle: gachaLogic.setCharacterSubtitle, setCharacterRace: gachaLogic.setCharacterRace,
    setCharacterRarity: gachaLogic.setCharacterRarity, setCharacterGender: gachaLogic.setCharacterGender, addGachaAsset: gachaLogic.addGachaAsset,
    addGachaAssetFromPreset: gachaLogic.addGachaAssetFromPreset, updateGachaAsset: gachaLogic.updateGachaAsset, removeGachaAsset: gachaLogic.removeGachaAsset,
    resetGachaAsset: gachaLogic.resetGachaAsset, clearGachaAssetImage: gachaLogic.clearGachaAssetImage, reorderGachaAssets: gachaLogic.reorderGachaAssets,
    setSelectedGachaAssetId: gachaLogic.setSelectedGachaAssetId, setContinuityFlags: gachaLogic.setContinuityFlags, setGachaShowRefs: gachaLogic.setGachaShowRefs,
    handleGenerateEntireSet, handleGenerateAllResize, handleSuggestTraits, handleSuggestConcept,
    isEditMode, setIsEditMode, editRegion, setEditRegion, customRes, setCustomRes, useCustomResBox, setUseCustomResBox, customResBox, setCustomResBox, lastPrompt,
    isGenerating: generation.isGenerating, statusMessage: generation.statusMessage, handleGenerate: generation.handleGenerate,
    handleRegenerateBackground: generation.handleRegenerateBackground, handleEnhance: generation.handleEnhance, handleExtractOutfit: generation.handleExtractOutfit,
    handleGenerateFrame: generation.handleGenerate, handleGenerateAnimation: generation.handleGenerate, handleCancel: generation.handleCancel,
    handleGenerateAll: generation.handleGenerate, handleGenerateAllBgReplace, handleGenerateAllPixelize, handleExportAllResize,
    handleGenerateBatch, reorderBatchItem, batchIntervention,
    handlePauseBatch, handleResumeBatch, isBatchPaused,
    pushCanvasSnapshot, handleCanvasUndo, handleCanvasRedo, canCanvasUndo, canCanvasRedo,
    useProModel, setUseProModel, isRightMinimized, setIsRightMinimized, batchSize, setBatchSize,
    appError, setAppError, showError,
    availableModels, isLoadingModels, handleFetchModels, activeModel, handleSelectModel,
    showInspiration, setShowInspiration, isAnalyzing, isSuggesting,
    handleMatchReferenceSize, handleAnalyzeStyle, handleRefinePrompt, handleInspirePrompt, handleUndoPrompt,
    showOnionSkin, setShowOnionSkin, isPlayingAnimation, setIsPlayingAnimation, animFrameIndex,
    handleImageUpload: (file: File) => {
        if (!(file instanceof Blob)) return; const reader = new FileReader();
        reader.onload = async () => {
           try {
              const { optimizeBase64Image } = await import('../utils/imageUtils');
              const optimized = await optimizeBase64Image(reader.result as string, 1024, 0.7);
              updateTabById(activeTabId, prev => ({ generatedImage: optimized, sessionImages: [optimized, ...prev.sessionImages], resizeOriginalImage: prev.mode === 'resize' ? optimized : prev.resizeOriginalImage }));
           } catch(err) {}
        };
        reader.readAsDataURL(file);
    },
    handleClearImage: () => setGeneratedImage(null),
    handleRemoveSessionImage: (url: string) => {
       updateTabById(activeTabId, prev => {
          const newList = prev.sessionImages.filter(u => u !== url); const isCurrent = prev.generatedImage === url;
          const nextImage = isCurrent ? (newList.length > 0 ? newList[0] : null) : prev.generatedImage;
          const nextResizeOrig = prev.resizeOriginalImage === url ? nextImage : prev.resizeOriginalImage;
          return { sessionImages: newList, generatedImage: nextImage, resizeOriginalImage: nextResizeOrig };
       });
    },
    handleCharacterLookClick: (x: number, y: number) => setCharacterTool((p:any) => ({...p, lookTarget: {x,y}, isSettingLookTarget: false})),
    handleRegeneratePose: generation.handleGenerate, handleCreateSpinAnimation: () => {}, handleMagicCrop: () => {}, 
    getTargetDimensions, selectedTemplateId, setSelectedTemplateId, templateImage, setTemplateImage, handleTemplateSelect: (id: string) => setSelectedTemplateId(id),
    uiReimagineChangeBg, setUiReimagineChangeBg, uiPositionsLocked, setUiPositionsLocked, uiThemeMood, setUiThemeMood, uiElements, setUiElements, uiMoodEnabled, setUiMoodEnabled,
    uiElementsEnabled, setUiElementsEnabled, uiColorsEnabled, setUiColorsEnabled, uiMaterialEnabled, setUiMaterialEnabled, uiArchetype, setUiArchetype, uiMaterial, setUiMaterial,
    pixelBitSize, setPixelBitSize,
    poseData, setPoseData, mapGridConfig, setMapGridConfig,
    spriteStripConfig, setSpriteStripConfig,
    viewpoint, setViewpoint, seed, setSeed,
    exports,
    showPromptExportModal, setShowPromptExportModal,
    promptExportBundle, isNoApiKeyNotice,
    handleOpenPromptExport, handleClosePromptExport,
    isPromptOnlyMode, setIsPromptOnlyMode
  };
};
