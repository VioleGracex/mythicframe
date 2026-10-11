
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  UIMode, BackgroundConfig, PixelDimensions,
  BackgroundPatternType, AspectRatio, ImageSize, SafeZoneConfig, CharacterToolState, ArtStyle,
  MapGridConfig,
  Viewpoint, ChibiConfig, AvailableModel, GenerationModel, AIProvider, CameraFraming
} from '../../types';
import { getActiveAIProvider, setActiveAIProvider } from '../../services/aiProviderService';
import { getPollinationsModel, setPollinationsModel, POLLINATIONS_MODELS } from '../../services/pollinationsService';
import { getBEIConfig, setBEIConfig } from '../../services/beiService';
import { ART_STYLES, BACKGROUND_PATTERNS, VIEWPOINTS } from '../../constants';
import { SHOT_DISTANCE_PRESETS, normalizeFramingId, getShotDistancePreset } from '../../constants/framing';
import MapGridPanel from './MapGridPanel';
import UnityInput from '../ui/UnityInput';
import { useLanguage } from '../../i18n/LanguageContext';
import { AIEngineSelectorCard } from '../ui/AIEngineSelectorCard';

interface RightPanelProps {
  mode: UIMode;
  setMode: (mode: UIMode) => void;
  selectedStyleId: string;
  setSelectedStyleId: (val: string) => void;
  bgConfig: BackgroundConfig;
  setBgConfig: React.Dispatch<React.SetStateAction<BackgroundConfig>>;
  generatedImage: string | null;
  isGenerating: boolean;
  handleRegenerateBackground: () => void;
  handleEnhance: () => void;
  handleExtractOutfit: () => void;
  selectedAspectRatio: AspectRatio;
  setSelectedAspectRatio: (val: AspectRatio) => void;
  useCustomResBox: boolean;
  setUseCustomResBox: (val: boolean) => void;
  customRes: PixelDimensions;
  setCustomRes: React.Dispatch<React.SetStateAction<PixelDimensions>>;
  useProModel: boolean;
  setUseProModel: (val: boolean) => void;
  isEditMode: boolean;
  setIsEditMode: (val: boolean) => void;
  bgPatternType: BackgroundPatternType;
  setBgPatternType: (val: BackgroundPatternType) => void;
  safeZone: SafeZoneConfig;
  setSafeZone: (val: SafeZoneConfig) => void;
  characterTool?: CharacterToolState;
  setCharacterTool?: React.Dispatch<React.SetStateAction<CharacterToolState>>;
  isRightMinimized: boolean;
  setIsRightMinimized: (val: boolean) => void;
  curatedArtStyles: ArtStyle[];
  activeCollectionId: string;
  styleCollections: { id: string, name: string }[];
  setActiveCollectionId: (id: string) => void;
  mapGridConfig?: MapGridConfig;
  setMapGridConfig?: (val: MapGridConfig | ((prev: MapGridConfig) => MapGridConfig)) => void;
  onRegeneratePose?: () => void;
  viewpoint: Viewpoint;
  setViewpoint: (val: Viewpoint) => void;
  pixelBitSize: '8-bit' | '16-bit' | '32-bit' | '64-bit';
  setPixelBitSize: (val: '8-bit' | '16-bit' | '32-bit' | '64-bit') => void;
  chibiConfig?: ChibiConfig;
  setChibiConfig?: React.Dispatch<React.SetStateAction<ChibiConfig>>;
  noCharacters?: boolean;
  setNoCharacters?: (val: boolean) => void;
  seed?: number | null;
  setSeed?: (val: number | null) => void;
  framing?: CameraFraming;
  setFraming?: (val: CameraFraming) => void;
  usageMap?: Record<string, number>;
  handleGenerateBatch?: () => void;
  handleCancel?: () => void;
  availableModels?: AvailableModel[];
  isLoadingModels?: boolean;
  handleFetchModels?: () => Promise<void>;
  activeModel?: string;
  handleSelectModel?: (modelId: string) => void;
  activeProvider?: AIProvider;
  setActiveProvider?: (prov: AIProvider) => void;
  providerReady?: boolean;
}

const Icon = ({ name, className = "" }: { name: string, className?: string }) => <i className={`fa-solid ${name} ${className}`} />;

// --- Color Helpers ---
function hsvToRgb(h: number, s: number, v: number) {
  let r=0, g=0, b=0;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = q; break;
    case 5: r = v, g = p, b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
function rgbToHex(r: number, g: number, b: number) { return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase(); }
function hexToRgb(hex: string) { let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 255, g: 255, b: 255 }; }
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255, g /= 255, b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h=0, s=0, v = max, d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; }
    h /= 6;
  }
  return { h, s, v };
}

const RightPanel: React.FC<RightPanelProps> = (props) => {
  const { t } = useLanguage();
  const { 
    isRightMinimized, setIsRightMinimized, mode, setMode,
    useProModel, setUseProModel, selectedStyleId, setSelectedStyleId,
    bgConfig, setBgConfig, characterTool, setCharacterTool,
    selectedAspectRatio, setSelectedAspectRatio, useCustomResBox, setUseCustomResBox,
    isEditMode, setIsEditMode, customRes, setCustomRes,
    bgPatternType, setBgPatternType,
    generatedImage, handleRegenerateBackground, handleEnhance, handleExtractOutfit, isGenerating,
    curatedArtStyles, activeCollectionId, styleCollections, setActiveCollectionId,
    mapGridConfig, setMapGridConfig, onRegeneratePose,
    viewpoint, setViewpoint,
    pixelBitSize, setPixelBitSize,
    chibiConfig, setChibiConfig, noCharacters, setNoCharacters, framing, setFraming,
    seed, setSeed,
    usageMap, handleGenerateBatch, handleCancel,
    availableModels = [], isLoadingModels = false, handleFetchModels, activeModel, handleSelectModel,
    activeProvider: activeProviderProp, setActiveProvider: setActiveProviderProp
  } = props;

  const [currentEngine, setCurrentEngine] = useState<AIProvider>(() => activeProviderProp || getActiveAIProvider());
  const [pollinationsModel, setPollinationsModelState] = useState(() => getPollinationsModel());
  const [beiConfigState, setBeiConfigState] = useState(() => getBEIConfig());

  useEffect(() => {
    if (activeProviderProp) setCurrentEngine(activeProviderProp);
  }, [activeProviderProp]);

  useEffect(() => {
    const onProviderChange = (e: any) => {
      const prov = e?.detail || getActiveAIProvider();
      setCurrentEngine(prov);
    };
    window.addEventListener('storage', onProviderChange);
    window.addEventListener('mythic_ai_provider_changed', onProviderChange);
    return () => {
      window.removeEventListener('storage', onProviderChange);
      window.removeEventListener('mythic_ai_provider_changed', onProviderChange);
    };
  }, []);

  const handleSwitchEngine = (newProv: AIProvider) => {
    setCurrentEngine(newProv);
    if (setActiveProviderProp) {
      setActiveProviderProp(newProv);
    } else {
      setActiveAIProvider(newProv);
    }
  };

  // Batch Mode Settings Lock
  const [isBatchLockEnabled, setIsBatchLockEnabled] = useState(() => {
    return localStorage.getItem('mythic_batch_lock_enabled') === 'true';
  });

  // Save settings when locked
  useEffect(() => {
    if (mode === 'batch' && isBatchLockEnabled) {
      if (chibiConfig) localStorage.setItem('mythic_batch_lock_chibi', JSON.stringify(chibiConfig));
      localStorage.setItem('mythic_batch_lock_framing', framing || 'full-body');
      localStorage.setItem('mythic_batch_lock_activeCollection', activeCollectionId);
    }
  }, [mode, isBatchLockEnabled, chibiConfig, framing, activeCollectionId]);

  // Load settings on mount if lock enabled
  useEffect(() => {
    if (mode === 'batch' && isBatchLockEnabled) {
      const savedChibi = localStorage.getItem('mythic_batch_lock_chibi');
      if (savedChibi && setChibiConfig) setChibiConfig(JSON.parse(savedChibi));
      
      const savedFraming = localStorage.getItem('mythic_batch_lock_framing');
      if (savedFraming && setFraming) setFraming(savedFraming as any);
      
      const savedCollection = localStorage.getItem('mythic_batch_lock_activeCollection');
      if (savedCollection) setActiveCollectionId(savedCollection);
    }
  }, [mode]); // Only run on mode switch or mount

  const handleToggleBatchLock = () => {
    const newState = !isBatchLockEnabled;
    setIsBatchLockEnabled(newState);
    localStorage.setItem('mythic_batch_lock_enabled', String(newState));
  };

  const [showAdvancedPicker, setShowAdvancedPicker] = useState(false);
  const [isViewpointExpanded, setIsViewpointExpanded] = useState(false);
  const [activePickingTarget, setActivePickingTarget] = useState<'primary' | 'secondary' | 'chroma'>('primary');
  const [pickerTop, setPickerTop] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const secondaryToggleBtnRef = useRef<HTMLButtonElement>(null);
  const chromaBtnRef = useRef<HTMLButtonElement>(null);
  const [hsv, setHsv] = useState({ h: 0, s: 1, v: 1 });
  const [isDraggingMixer, setIsDraggingMixer] = useState(false);
  const [isDraggingHue, setIsDraggingHue] = useState(false);

  const currentWorkingColor = activePickingTarget === 'primary' ? bgConfig.color : (activePickingTarget === 'secondary' ? (bgConfig.secondaryColor || '#000000') : (bgConfig.keyColor || '#FFFFFF'));

  useEffect(() => {
    if (showAdvancedPicker) {
      const rgb = hexToRgb(currentWorkingColor);
      setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
    }
  }, [showAdvancedPicker, activePickingTarget, currentWorkingColor]);

  const updateColorFromHsv = useCallback((newHsv: { h: number, s: number, v: number }) => {
    const rgb = hsvToRgb(newHsv.h, newHsv.s, newHsv.v);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (activePickingTarget === 'primary') setBgConfig(prev => ({ ...prev, color: hex }));
    else if (activePickingTarget === 'secondary') setBgConfig(prev => ({ ...prev, secondaryColor: hex }));
    else setBgConfig(prev => ({ ...prev, keyColor: hex }));
  }, [activePickingTarget, setBgConfig]);

  const handleMixerMove = useCallback((e: MouseEvent) => {
    if (!pickerRef.current || !isDraggingMixer) return;
    const mixerRect = pickerRef.current.querySelector('.mixer-square')?.getBoundingClientRect();
    if (!mixerRect) return;
    let s = (e.clientX - mixerRect.left) / mixerRect.width, v = 1 - (e.clientY - mixerRect.top) / mixerRect.height;
    s = Math.max(0, Math.min(1, s)); v = Math.max(0, Math.min(1, v));
    const nextHsv = { ...hsv, s, v }; setHsv(nextHsv); updateColorFromHsv(nextHsv);
  }, [isDraggingMixer, hsv, updateColorFromHsv]);

  const handleHueMove = useCallback((e: MouseEvent) => {
    if (!pickerRef.current || !isDraggingHue) return;
    const hueRect = pickerRef.current.querySelector('.hue-slider')?.getBoundingClientRect();
    if (!hueRect) return;
    let h = (e.clientX - hueRect.left) / hueRect.width; h = Math.max(0, Math.min(1, h));
    const nextHsv = { ...hsv, h }; setHsv(nextHsv); updateColorFromHsv(nextHsv);
  }, [isDraggingHue, hsv, updateColorFromHsv]);

  useEffect(() => {
    if (isDraggingMixer) { window.addEventListener('mousemove', handleMixerMove); window.addEventListener('mouseup', () => setIsDraggingMixer(false)); }
    if (isDraggingHue) { window.addEventListener('mousemove', handleHueMove); window.addEventListener('mouseup', () => setIsDraggingHue(false)); }
    return () => { window.removeEventListener('mousemove', handleMixerMove); window.removeEventListener('mouseup', () => setIsDraggingMixer(false)); window.removeEventListener('mousemove', handleHueMove); window.removeEventListener('mouseup', () => setIsDraggingHue(false)); };
  }, [isDraggingMixer, isDraggingHue, handleMixerMove, handleHueMove]);

  const handleTogglePicker = (target: 'primary' | 'secondary' | 'chroma') => {
    if (showAdvancedPicker && activePickingTarget === target) setShowAdvancedPicker(false);
    else {
      setActivePickingTarget(target);
      const btn = target === 'primary' ? toggleBtnRef.current : (target === 'secondary' ? secondaryToggleBtnRef.current : chromaBtnRef.current);
      if (btn && rootRef.current) { let btnRect = btn.getBoundingClientRect(), rootRect = rootRef.current.getBoundingClientRect(); setPickerTop(btnRect.top - rootRect.top); }
      setShowAdvancedPicker(true);
    }
  };

  const updateBgProp = (prop: keyof BackgroundConfig, value: any) => {
    setBgConfig(prev => ({ ...prev, [prop]: value }));
  };

  if (isRightMinimized) return (
    <div className="w-10 h-full bg-[#0b1120] border-l border-slate-900 flex flex-col items-center py-4 shrink-0 z-[100]">
       <button onClick={() => setIsRightMinimized(false)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shadow-lg"><Icon name="fa-chevron-left text-xs" /></button>
    </div>
  );

  const baseHueRgb = hsvToRgb(hsv.h, 1, 1), baseHueHex = rgbToHex(baseHueRgb.r, baseHueRgb.g, baseHueRgb.b);

  const builtInCurated = curatedArtStyles.filter(s => !s.isCustom);
  const userCurated = curatedArtStyles.filter(s => s.isCustom);

  const mostUsedStyles = curatedArtStyles
    .filter(s => s.id !== 'none' && usageMap && usageMap[s.id] > 0)
    .sort((a, b) => (usageMap?.[b.id] || 0) - (usageMap?.[a.id] || 0))
    .slice(0, 5);

  const isTransparent = bgConfig.mode === 'transparent' || bgConfig.mode === 'transparent_neo';

  return (
    <div ref={rootRef} className="w-full h-full bg-[#0b1120] border-l border-slate-900 flex flex-col shrink-0 z-[100] overflow-visible relative select-none font-sans">
       <button onClick={() => setIsRightMinimized(true)} className="absolute top-4 left-2 w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-slate-300 z-[110] transition-colors"><Icon name="fa-chevron-right text-xs" /></button>
       
       {mode === 'batch' && (
         <button 
           onClick={handleToggleBatchLock}
           className={`absolute top-4 right-4 px-2 py-1.5 rounded flex items-center justify-center gap-1.5 z-[110] transition-colors shadow-lg border text-[9px] font-black uppercase tracking-widest ${
             isBatchLockEnabled 
               ? 'bg-purple-600 border-purple-500 text-white shadow-purple-900/40' 
               : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
           }`}
           title="Lock Sidebar Settings for Batch Mode (Persists Across Reloads)"
         >
           <Icon name={`fa-lock${isBatchLockEnabled ? '' : '-open'} text-[10px]`} />
           {isBatchLockEnabled ? 'Locked' : 'Unlocked'}
         </button>
       )}

       {showAdvancedPicker && (
          <div ref={pickerRef} className="absolute right-[calc(100%+12px)] w-[240px] z-[999] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl bg-[#0f172a]" style={{ top: Math.max(10, pickerTop - 60) }}>
             <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Color Mixer</span>
                <button onClick={() => setShowAdvancedPicker(false)} className="text-slate-500 hover:text-white transition-colors">
                   <i className="fa-solid fa-times text-xs" />
                </button>
             </div>
             <div className="p-4 space-y-5">
                <div className="mixer-square relative aspect-square rounded-lg overflow-hidden border border-slate-800 cursor-crosshair" style={{ backgroundColor: baseHueHex }} onMouseDown={() => setIsDraggingMixer(true)}>
                   <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" /><div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                   <div className="absolute w-3 h-3 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
                </div>
                <div className="hue-slider relative h-3 rounded-full cursor-pointer" style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }} onMouseDown={() => setIsDraggingHue(true)}>
                   <div className="absolute top-1/2 w-4 h-4 bg-white rounded-full border border-slate-400 shadow-lg -translate-y-1/2 transform -translate-x-1/2 pointer-events-none" style={{ left: `${hsv.h * 100}%` }} />
                </div>
             </div>
          </div>
       )}

       <div className={`flex-1 overflow-y-auto custom-scrollbar p-5 space-y-7 ${mode === 'batch' ? 'pt-14' : 'pt-10'}`}>
          
          <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Art Style Selection</label>
              <div className="relative group">
                <select 
                  value={activeCollectionId}
                  onChange={(e) => setActiveCollectionId(e.target.value)}
                  className="w-full bg-[#161f32] border border-slate-800 rounded-xl pl-3 pr-10 py-3 text-sm text-purple-300 font-bold outline-none hover:border-purple-500/50 transition-colors cursor-pointer appearance-none"
                >
                  {styleCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Icon name="fa-caret-down" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none group-hover:text-purple-400 transition-colors" />
              </div>
          </div>

          <div className="space-y-6">
             {/* AI Generation Engine & Model Selector Card */}
              <AIEngineSelectorCard
                setMode={setMode}
                availableModels={availableModels}
                activeModel={activeModel}
                handleSelectModel={handleSelectModel}
                useProModel={useProModel}
                setUseProModel={setUseProModel}
                handleFetchModels={handleFetchModels}
                isLoadingModels={isLoadingModels}
              />
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                   <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Art Style</label>
                   <button onClick={() => setMode('style-library')} className="text-[9px] text-purple-400 hover:text-purple-300 uppercase font-black tracking-tighter">Manage Styles</button>
                </div>
                <div className="relative group">
                  <select value={selectedStyleId} onChange={(e) => setSelectedStyleId(e.target.value)} className="w-full bg-[#161f32] border border-slate-800 rounded px-4 py-3 text-sm text-slate-100 outline-none hover:border-slate-700 transition-colors cursor-pointer font-medium appearance-none">
                    <option value="none" className="bg-[#161f32]">No Art Style</option>
                    {mostUsedStyles.length > 0 && (
                      <optgroup label="Most Used" className="bg-[#161f32]">
                        {mostUsedStyles.map(style => <option key={`most-used-${style.id}`} value={style.id} className="bg-[#161f32] text-yellow-400 font-bold">🔥 {style.name}</option>)}
                      </optgroup>
                    )}
                    {userCurated.length > 0 && (
                      <optgroup label="My Custom Styles" className="bg-[#161f32]">
                        {userCurated.map(style => <option key={style.id} value={style.id} className="bg-[#161f32] text-purple-400 font-bold">★ {style.name}</option>)}
                      </optgroup>
                    )}
                    {builtInCurated.length > 0 && (
                      <optgroup label="Standard Library" className="bg-[#161f32]">
                        {builtInCurated.map(style => style.id !== 'none' && <option key={style.id} value={style.id} className="bg-[#161f32]">{style.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <Icon name="fa-caret-down" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-white transition-colors" />
                </div>

                {(selectedStyleId === 'pixel_art' || selectedStyleId === 'retro_8bit_micro') && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Pixel Bit Size</label>
                    <div className="grid grid-cols-2 gap-1 bg-[#161f32] rounded border border-slate-800 p-1">
                      <button 
                        onClick={() => setPixelBitSize('8-bit')} 
                        className={`py-1.5 text-[10px] font-bold rounded transition-all ${pixelBitSize === '8-bit' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                      >
                        8-bit
                      </button>
                      <button 
                        onClick={() => setPixelBitSize('16-bit')} 
                        className={`py-1.5 text-[10px] font-bold rounded transition-all ${pixelBitSize === '16-bit' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                      >
                        16-bit
                      </button>
                      <button 
                        onClick={() => setPixelBitSize('32-bit')} 
                        className={`py-1.5 text-[10px] font-bold rounded transition-all ${pixelBitSize === '32-bit' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                      >
                        32-bit
                      </button>
                      <button 
                        onClick={() => setPixelBitSize('64-bit')} 
                        className={`py-1.5 text-[10px] font-bold rounded transition-all ${pixelBitSize === '64-bit' ? 'bg-purple-600/30 text-purple-200 border border-purple-500/50' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                      >
                        64-bit
                      </button>
                    </div>
                  </div>
                )}
             </div>
          </div>

          <div className="space-y-6">
             <div className="bg-[#121a2b] border border-slate-800 rounded-xl p-4 space-y-4 shadow-sm">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2"><Icon name="fa-image" className="text-blue-400" /> Background</label>
                
                <div className="relative group">
                   <select 
                     value={bgConfig.mode} 
                     onChange={(e) => {
                       const newMode = e.target.value as any;
                       if (newMode === 'solid') {
                         setBgConfig(prev => ({ ...prev, mode: 'solid', gradientType: 'none' }));
                       } else {
                         updateBgProp('mode', newMode);
                       }
                     }} 
                     className="w-full bg-[#161f32] border border-slate-800 rounded px-4 py-3 text-sm text-slate-100 outline-none hover:border-slate-700 transition-colors cursor-pointer font-bold appearance-none"
                   >
                      <option value="auto">AI DECIDES</option>
                      <option value="none">NONE (EMPTY)</option>
                      <option value="prompt_only">PROMPT ONLY</option>
                      <option value="pattern">PATTERN</option>
                      <option value="solid">SOLID</option>
                      <option value="transparent">TRANSPARENT</option>
                      <option value="transparent_neo">TRANSPARENT NEO</option>
                      <option value="scene">SCENE</option>
                   </select>
                   <Icon name="fa-caret-down" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-white transition-colors" />
                </div>

                {bgConfig.mode === 'solid' && (
                   <div className="flex flex-col gap-3 bg-[#0b1120] p-3 rounded border border-slate-800 animate-in slide-in-from-top-1 duration-200">
                      <div className="flex items-center gap-3">
                         <button ref={toggleBtnRef} onClick={() => handleTogglePicker('primary')} className="w-8 h-8 rounded border-2 border-slate-700 shadow-inner" style={{ backgroundColor: bgConfig.color }} />
                         <span className="text-[11px] font-mono text-slate-200 uppercase font-bold">{bgConfig.color}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gradient Style</label>
                         <div className="flex gap-1">
                            {(['none', 'linear', 'radial'] as const).map(t => (
                               <button key={t} onClick={() => updateBgProp('gradientType', t)} className={`flex-1 py-1.5 rounded text-[9px] font-bold uppercase border transition-all ${bgConfig.gradientType === t ? 'bg-blue-600/30 border-blue-500 text-blue-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'}`}>{t}</button>
                            ))}
                         </div>
                      </div>
                      {bgConfig.gradientType !== 'none' && (
                         <div className="flex items-center gap-3 mt-1 animate-in slide-in-from-top-1">
                            <button ref={secondaryToggleBtnRef} onClick={() => handleTogglePicker('secondary')} className="w-8 h-8 rounded border-2 border-slate-700 shadow-inner" style={{ backgroundColor: bgConfig.secondaryColor || '#000000' }} />
                            <span className="text-[11px] font-mono text-slate-200 uppercase font-bold">{bgConfig.secondaryColor || '#000000'}</span>
                         </div>
                      )}
                   </div>
                )}

                {(bgConfig.mode === 'transparent' || bgConfig.mode === 'transparent_neo') && (
                   <div className="bg-[#0b1120] p-3 rounded border border-slate-800 space-y-4 animate-in slide-in-from-top-1 duration-200">
                      <label className="flex items-center gap-3 cursor-pointer group">
                         <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${bgConfig.removeHoles ? 'bg-blue-600 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-950 border-slate-700'}`}>
                            {bgConfig.removeHoles && <Icon name="fa-check" className="text-[9px] text-white" />}
                         </div>
                         <input type="checkbox" className="sr-only" checked={bgConfig.removeHoles} onChange={e => updateBgProp('removeHoles', e.target.checked)} />
                         <span className="text-[11px] font-bold text-slate-200 uppercase group-hover:text-white">Remove Holes (Heal)</span>
                      </label>
                      <div className="space-y-2">
                         <div className="flex justify-between items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Healing Power</span>
                            <span className="text-blue-300 font-mono text-[11px] font-bold">{bgConfig.healingPower}%</span>
                         </div>
                         <input type="range" min="0" max="100" value={bgConfig.healingPower} onChange={e => updateBgProp('healingPower', parseInt(e.target.value))} className="w-full accent-blue-600 h-1 bg-slate-950 rounded appearance-none cursor-pointer" />
                      </div>
                   </div>
                )}

                {bgConfig.mode === 'transparent_neo' && (
                  <div className="bg-[#0b1120] p-3 rounded border border-slate-800 space-y-5 animate-in slide-in-from-top-1 duration-200">
                     <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Chroma Key Color</label>
                        <div className="flex flex-wrap gap-2 pt-1">
                           {['#FFFFFF', '#000000', '#00FF00', '#FF00FF'].map(c => (
                              <button key={c} onClick={() => updateBgProp('keyColor', c)} className={`w-6 h-6 rounded border transition-all ${bgConfig.keyColor === c ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-900 border-white' : 'border-slate-700 hover:border-slate-500'}`} style={{ backgroundColor: c }} />
                           ))}
                           <button ref={chromaBtnRef} onClick={() => handleTogglePicker('chroma')} className={`w-6 h-6 rounded border border-slate-700 bg-gradient-to-br from-red-500 via-green-500 to-blue-500 hover:border-slate-500 ${!['#FFFFFF', '#000000', '#00FF00', '#FF00FF'].includes(bgConfig.keyColor || '#FFFFFF') ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`} />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <div className="flex justify-between items-center"><span className="text-[9px] font-bold text-slate-400 uppercase">Edge Softness</span><span className="text-blue-300 font-mono text-[10px]">{bgConfig.softRadius}px</span></div>
                        <input type="range" min="1" max="10" step="0.5" value={bgConfig.softRadius} onChange={e => updateBgProp('softRadius', parseFloat(e.target.value))} className="w-full accent-blue-600 h-1 bg-slate-950 rounded appearance-none" />
                     </div>
                     
                     {/* Neo v2 Improvements */}
                     <div className="space-y-4 pt-2 border-t border-slate-800/50">
                        <SectionHeader label="SteamSafe Cleanup" enabled={bgConfig.steamSafe} onToggle={(v: boolean) => updateBgProp('steamSafe', v)} icon="fa-wind" color="blue" />
                        {bgConfig.steamSafe && (
                           <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">
                              <div className="space-y-1.5">
                                 <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase"><span>Cleanse Strength</span><span>{bgConfig.neutralizeStrength}%</span></div>
                                 <input type="range" min="0" max="100" value={bgConfig.neutralizeStrength} onChange={e => updateBgProp('neutralizeStrength', parseInt(e.target.value))} className="w-full accent-blue-500 h-1 bg-slate-950 rounded appearance-none" />
                              </div>
                              <div className="space-y-1.5">
                                 <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase"><span>Visibility Bias</span><span>{bgConfig.alphaBias}%</span></div>
                                 <input type="range" min="0" max="50" value={bgConfig.alphaBias} onChange={e => updateBgProp('alphaBias', parseInt(e.target.value))} className="w-full accent-blue-500 h-1 bg-slate-950 rounded appearance-none" />
                              </div>
                           </div>
                        )}
                     </div>

                     <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/50">
                        <label className="flex items-center gap-3 cursor-pointer group">
                           <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${bgConfig.fxMode ? 'bg-purple-600 border-purple-500' : 'bg-slate-950 border-slate-700'}`}>
                              {bgConfig.fxMode && <Icon name="fa-check" className="text-[9px] text-white" />}
                           </div>
                           <input type="checkbox" className="sr-only" checked={bgConfig.fxMode} onChange={e => updateBgProp('fxMode', e.target.checked)} />
                           <span className="text-[10px] font-bold text-slate-200 uppercase group-hover:text-white">FX Glow Guard</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                           <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${bgConfig.preserveTrueMagenta ? 'bg-blue-600 border-blue-500' : 'bg-slate-950 border-slate-700'}`}>
                              {bgConfig.preserveTrueMagenta && <Icon name="fa-check" className="text-[9px] text-white" />}
                           </div>
                           <input type="checkbox" className="sr-only" checked={bgConfig.preserveTrueMagenta} onChange={e => updateBgProp('preserveTrueMagenta', e.target.checked)} />
                           <span className="text-[10px] font-bold text-slate-200 uppercase group-hover:text-white">Magenta Guard</span>
                        </label>
                     </div>
                  </div>
                )}

                {bgConfig.mode === 'pattern' && (
                   <div className="space-y-3 animate-in slide-in-from-top-1 duration-200">
                      <select value={bgPatternType} onChange={e => setBgPatternType(e.target.value as any)} className="w-full bg-[#0b1120] border border-slate-800 rounded px-4 py-2.5 text-sm text-slate-100 outline-none hover:border-slate-700 font-medium">
                         {BACKGROUND_PATTERNS.map(p => <option key={p.id} value={p.id} className="bg-[#0b1120]">{p.name}</option>)}
                      </select>
                   </div>
                )}

                {(bgConfig.mode === 'scene' || bgConfig.mode === 'pattern' || bgConfig.mode === 'prompt_only') && (
                   <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Optional BG Context</label>
                      <textarea 
                        value={bgConfig.promptFragment} 
                        onChange={e => updateBgProp('promptFragment', e.target.value)} 
                        placeholder="Describe the environment / details..." 
                        className="w-full bg-[#0b1120] border border-slate-800 rounded px-3 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600 font-medium h-32 resize-none custom-scrollbar" 
                      />
                   </div>
                )}
                
                {isTransparent && (
                   <div className="bg-slate-900/50 p-2 rounded border border-slate-800 mt-2 animate-in fade-in">
                      <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-1.5"><Icon name="fa-shield-halved text-blue-500" /> Strict Solid Override Active</p>
                      <p className="text-[7px] text-slate-600 mt-0.5">Background descriptions are auto-ignored to ensure clean chroma keying.</p>
                   </div>
                )}
             </div>

             {/* Refine & Finalize Buttons outside background container box */}
             {generatedImage && (
                 <div className="pt-2 flex flex-col gap-2.5 animate-in slide-in-from-bottom-2 duration-300">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block ml-1">Refine & Finalize</label>
                    <button onClick={handleEnhance} disabled={isGenerating} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white py-3.5 rounded text-[11px] font-bold uppercase tracking-wider border border-purple-500/30 transition-all flex items-center justify-center gap-2 shadow-xl shadow-purple-900/30 active:scale-[0.98]"><Icon name="fa-sparkles" className="text-xs text-white" /> {t('enhance')} Assets</button>
                    <button onClick={handleExtractOutfit} disabled={isGenerating} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white py-3.5 rounded text-[11px] font-bold uppercase tracking-wider border border-indigo-500/30 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-900/30 active:scale-[0.98]"><Icon name="fa-scissors" className="text-xs text-white" /> Biological Eraser</button>
                    <button onClick={handleRegenerateBackground} disabled={isGenerating} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white py-3.5 rounded text-[11px] font-bold uppercase tracking-wider border border-blue-500/30 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-900/30 active:scale-[0.98]"><Icon name="fa-panorama" className="text-xs text-white" /> Regenerate Background</button>
                 </div>
             )}

             {mode === 'map-grid' && mapGridConfig && setMapGridConfig && (
             <MapGridPanel config={mapGridConfig} setConfig={setMapGridConfig} />
          )}

          {/* Character Controls - Hidden in Batch Mode */}
          {(mode === 'illustration' || mode === 'gacha') && mode !== 'batch' && (
                <div className="bg-[#121a2b] border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                         <Icon name="fa-user-slash" className="text-xs" />
                         <label className="text-[11px] font-bold uppercase tracking-wider">No Characters</label>
                      </div>
                      <button 
                         onClick={() => setNoCharacters && setNoCharacters(!noCharacters)} 
                         className={`w-12 h-6 rounded-full relative transition-colors ${noCharacters ? 'bg-red-600' : 'bg-slate-700'}`}
                      >
                         <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${noCharacters ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                   </div>
                   <p className="text-[10px] text-slate-500 leading-tight">Enable this to strictly generate environments, props, or scenes without any people or creatures.</p>
                </div>
             )}

             {(mode === 'illustration' || mode === 'gacha' || mode === 'batch') && !noCharacters && chibiConfig && setChibiConfig && (
                <div className="bg-[#121a2b] border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-300">
                         <Icon name="fa-child" className="text-xs text-pink-400" />
                         <label className="text-[11px] font-bold uppercase tracking-wider">Chibi Mode</label>
                      </div>
                      <button 
                         onClick={() => setChibiConfig(prev => ({...prev, enabled: !prev.enabled}))} 
                         className={`w-12 h-6 rounded-full relative transition-colors ${chibiConfig.enabled ? 'bg-pink-600' : 'bg-slate-700'}`}
                      >
                         <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${chibiConfig.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                   </div>
                   
                   {chibiConfig.enabled && (
                      <div className="space-y-4 pt-2 animate-in slide-in-from-top-2">
                         <div className="space-y-2">
                            <div className="flex justify-between items-center">
                               <label className="text-[10px] font-bold text-slate-400 uppercase">Head-to-Body Ratio</label>
                               <span className="text-[10px] font-mono text-pink-300 bg-pink-900/30 px-1.5 py-0.5 rounded">1:{chibiConfig.bodyRatio ? chibiConfig.bodyRatio.split(':')[1] : '2'}</span>
                            </div>
                            <input 
                               type="range" 
                               min="1" max="4" step="0.5" 
                               value={chibiConfig.bodyRatio ? parseFloat(chibiConfig.bodyRatio.split(':')[1]) : 2} 
                               onChange={(e) => setChibiConfig(prev => ({...prev, bodyRatio: `1:${e.target.value}`}))}
                               className="w-full accent-pink-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer" 
                            />
                            <div className="flex justify-between text-[9px] text-slate-500 font-medium px-1">
                               <span>Huge Head (1:1)</span>
                               <span>Standard (1:2)</span>
                               <span>Tall (1:4)</span>
                            </div>
                         </div>

                         <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                               <label className="text-[9px] font-bold text-slate-500 uppercase">Head Style</label>
                               <select 
                                  value={chibiConfig.headStyle}
                                  onChange={(e) => setChibiConfig(prev => ({...prev, headStyle: e.target.value as any}))}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-pink-500"
                               >
                                  <option value="moe">Cute (Moe)</option>
                                  <option value="realistic">Anime (Standard)</option>
                               </select>
                            </div>
                            <div className="space-y-1.5">
                               <label className="text-[9px] font-bold text-slate-500 uppercase">Body Style</label>
                               <select 
                                  value={chibiConfig.bodyStyle}
                                  onChange={(e) => setChibiConfig(prev => ({...prev, bodyStyle: e.target.value as any}))}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-pink-500"
                               >
                                  <option value="geometric">Geometric (Simple)</option>
                                  <option value="defined">Anatomical (Detailed)</option>
                               </select>
                            </div>
                         </div>
                      </div>
                   )}
                </div>
             )}

          {(mode === 'illustration' || mode === 'gacha') && mode !== 'batch' && !noCharacters && characterTool && setCharacterTool && (
                <div className="bg-[#121a2b] border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
                   <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-slate-300"><Icon name="fa-person" className="text-xs" /><label className="text-[11px] font-bold uppercase tracking-wider">{t('character_helper')}</label></div><button onClick={() => setCharacterTool(prev => ({...prev, enabled: !prev.enabled}))} className={`w-12 h-6 rounded-full relative transition-colors ${characterTool.enabled ? 'bg-purple-600' : 'bg-slate-700'}`}><div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${characterTool.enabled ? 'translate-x-6' : 'translate-x-0'}`} /></button></div>
                   {characterTool.enabled && (
                      <div className="space-y-3 pt-1 animate-in slide-in-from-top-2">
                        <textarea value={characterTool.poseDescription} onChange={e => setCharacterTool(p => ({...p, poseDescription: e.target.value}))} className="w-full bg-[#0b1120] border border-slate-800 rounded p-4 text-sm text-slate-100 h-24 resize-none outline-none focus:border-purple-500 transition-colors font-medium leading-relaxed" placeholder="e.g. Dynamic action pose..." />
                        
                        <div className="space-y-1.5">
                           <div className="flex items-center justify-between">
                              <label className="text-[9px] font-bold text-slate-500 uppercase">Camera Framing</label>
                              <span className="text-[9px] font-semibold text-purple-400 font-mono">
                                 {getShotDistancePreset(framing)?.code || 'FS'}
                              </span>
                           </div>
                           <select 
                              value={normalizeFramingId(framing) || 'full_shot'}
                              onChange={(e) => setFraming && setFraming(e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-[11px] text-slate-200 outline-none focus:border-purple-500 transition-colors cursor-pointer"
                           >
                              {SHOT_DISTANCE_PRESETS.map(preset => (
                                 <option key={preset.id} value={preset.id}>
                                    {preset.label}
                                 </option>
                              ))}
                           </select>
                           <p className="text-[10px] text-slate-400 leading-tight italic px-0.5">
                              {getShotDistancePreset(framing)?.description || 'Entire character from head to feet, filling most of the vertical frame.'}
                           </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                           <button onClick={() => setCharacterTool(p => ({...p, isSettingLookTarget: !p.isSettingLookTarget}))} className={`py-3 rounded text-[11px] font-bold uppercase tracking-wider border transition-all ${characterTool.isSettingLookTarget ? 'bg-green-600 text-white border-green-500 shadow-lg shadow-green-900/20' : 'bg-[#161f32] text-slate-200 border-slate-700 hover:bg-slate-600 hover:text-white'}`}>{characterTool.isSettingLookTarget ? 'Click on Canvas' : t('set_target')}</button>
                           <button onClick={onRegeneratePose} disabled={isGenerating} className="py-3 rounded text-[11px] font-bold uppercase tracking-wider border border-purple-500/30 bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white transition-all flex items-center justify-center gap-2">
                              <Icon name="fa-rotate" className="text-[10px]" />
                              Regenerate
                           </button>
                        </div>
                      </div>
                   )}
                </div>
             )}

             {(mode === 'illustration' || mode === 'gacha') && mode !== 'batch' && (
                <div className="bg-[#121a2b] border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
                   <div 
                      className="flex items-center justify-between cursor-pointer group/vp"
                      onClick={() => setIsViewpointExpanded(!isViewpointExpanded)}
                   >
                      <div className="flex items-center gap-2 text-slate-300">
                         <Icon name="fa-video" className="text-xs text-blue-400" />
                         <label className="text-[11px] font-bold uppercase tracking-wider cursor-pointer">Camera Viewpoint</label>
                      </div>
                      <Icon 
                         name={isViewpointExpanded ? "fa-chevron-up" : "fa-chevron-down"} 
                         className={`text-[10px] text-slate-600 group-hover/vp:text-slate-300 transition-all ${isViewpointExpanded ? '' : 'animate-pulse'}`} 
                      />
                   </div>
                   
                   {isViewpointExpanded && (
                      <div className="grid grid-cols-2 gap-2 pt-1 animate-in slide-in-from-top-2 duration-200">
                         {VIEWPOINTS.map((vp) => (
                            <button
                               key={vp.id}
                               onClick={() => setViewpoint(vp.id)}
                               className={`flex flex-col items-center justify-center p-2 rounded border transition-all gap-1 ${
                                  viewpoint === vp.id
                                     ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-lg shadow-blue-900/20'
                                     : 'bg-[#161f32] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                               }`}
                               title={vp.description}
                            >
                               <Icon name={vp.icon} className="text-xs" />
                               <span className="text-[9px] font-bold uppercase tracking-tighter">{vp.name}</span>
                            </button>
                         ))}
                      </div>
                   )}
                   {isViewpointExpanded && (
                      <div className="pt-2 animate-in slide-in-from-top-1">
                         <button 
                            onClick={handleRegenerateBackground} 
                            disabled={isGenerating} 
                            className="w-full bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white py-2.5 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-500/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                         >
                            <Icon name="fa-rotate" className="text-[10px]" />
                            Regenerate with Viewpoint
                         </button>
                      </div>
                   )}
                </div>
             )}

              {/* Seed Controller */}
              {(mode === 'illustration' || mode === 'gacha' || mode === 'background' || mode === 'clothes' || mode === 'pose-studio' || mode === 'map-grid' || mode === 'sprite-sheet') && mode !== 'batch' && (
                 <div className="bg-[#121a2b] border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm pt-4">
                    <div className="flex items-center justify-between text-slate-300">
                       <div className="flex items-center gap-2">
                           <Icon name="fa-dice" className="text-xs text-orange-400" />
                           <label className="text-[11px] font-bold uppercase tracking-wider">Seed Control</label>
                       </div>
                       <button 
                         onClick={() => {
                           if (setSeed) {
                             if (seed !== null && seed !== undefined) {
                               setSeed(null);
                             } else {
                               setSeed(Math.floor(Math.random() * 2147483647));
                             }
                           }
                         }}
                         className={`w-8 h-4 rounded-full relative transition-colors ${seed !== null && seed !== undefined ? 'bg-orange-600' : 'bg-slate-800 border border-slate-700'}`}
                       >
                         <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${seed !== null && seed !== undefined ? 'translate-x-4' : 'translate-x-0'}`} />
                       </button>
                    </div>
                    {seed !== null && seed !== undefined && (
                        <div className="flex items-center gap-2">
                           <input 
                             type="number" 
                             value={seed}
                             onChange={(e) => setSeed && setSeed(e.target.value ? parseInt(e.target.value, 10) : null as unknown as number)}
                             placeholder="Random Seed (empty)"
                             className="flex-1 bg-[#161f32] border border-slate-700 rounded px-2 py-2 text-xs text-slate-200 outline-none focus:border-orange-500 font-mono"
                           />
                           <button
                             onClick={() => setSeed && setSeed(Math.floor(Math.random() * 2147483647))}
                             className="px-3 py-2 bg-[#161f32] border border-slate-700 rounded hover:border-orange-500 hover:text-orange-400 transition-colors text-slate-400 focus:outline-none"
                             title="Pick Random Seed"
                           >
                             <Icon name="fa-dice" className="text-xs" />
                           </button>
                        </div>
                    )}
                 </div>
              )}
          </div>

          {/* Batch Generate Button - Only visible in Batch mode */}
          {mode === 'batch' && (
             <div className="space-y-3 pt-6 border-t border-slate-900 mt-6">
                <button 
                  onClick={isGenerating ? handleCancel : handleGenerateBatch}
                  className={`w-full py-4 rounded-xl font-black tracking-widest uppercase italic shadow-xl transition-all flex justify-center items-center gap-2 ${
                     isGenerating 
                     ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/40 animate-pulse' 
                     : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40 hover:-translate-y-1 active:translate-y-0'
                  }`}
                >
                  <Icon name={isGenerating ? "fa-stop" : "fa-wand-magic-sparkles"} />
                  {isGenerating ? 'Cancel Generation' : 'Generate Selected'}
                </button>
             </div>
          )}

          {/* Output Ratio - Hidden in Batch Mode */}
          {mode !== 'batch' && (
            <div className="space-y-3 pt-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">{t('output_ratio')}</label>
              <div className="relative group">
                <select value={selectedAspectRatio} onChange={(e) => { setSelectedAspectRatio(e.target.value as AspectRatio); if(e.target.value === 'custom') setUseCustomResBox(false); }} className="w-full bg-[#161f32] border border-slate-800 rounded px-4 py-3 text-sm text-slate-100 outline-none hover:border-slate-700 transition-colors cursor-pointer font-medium appearance-none">
                    <option value="1:1" className="bg-[#161f32]">Square (1:1)</option>
                    <option value="3:4" className="bg-[#161f32]">Portrait (3:4)</option>
                    <option value="4:3" className="bg-[#161f32]">Landscape (4:3)</option>
                    <option value="9:16" className="bg-[#161f32]">Mobile (9:16)</option>
                    <option value="16:9" className="bg-[#161f32]">Cinematic (16:9)</option>
                    <option value="custom" className="bg-[#161f32]">Custom Dimensions</option>
                </select>
                <Icon name="fa-caret-down" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-white transition-colors" />
              </div>
              {(selectedAspectRatio === 'custom' || useCustomResBox) && (
                <div className="space-y-2 pt-2 animate-in slide-in-from-top-2">
                    <UnityInput label="Width" value={customRes.width} onChange={v => setCustomRes(p => ({...p, width: v}))} min={256} max={4096} step={8} suffix="px" />
                    <UnityInput label="Height" value={customRes.height} onChange={v => setCustomRes(p => ({...p, height: v}))} min={256} max={4096} step={8} suffix="px" />
                </div>
              )}
            </div>
          )}

          {mode !== 'batch' && (
            <div className="space-y-4 pt-4 border-t border-slate-900 overflow-visible">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Editing Tools</label>
              <div className="flex flex-col gap-2.5">
                  <div className="bg-[#121a2b] border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-sm border-l-4 border-l-purple-500/50">
                    <span className="text-[11px] font-bold text-slate-100">{t('edit_region')} Mode</span>
                    <button onClick={() => setIsEditMode(!isEditMode)} className={`w-12 h-6 rounded-full relative transition-colors ${isEditMode ? 'bg-purple-600' : 'bg-slate-700'}`}><div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${isEditMode ? 'translate-x-6' : 'translate-x-0'}`} /></button>
                  </div>
              </div>
            </div>
          )}
       </div>
    </div>
  );
};

const SectionHeader = ({ label, enabled, onToggle, icon, color = "blue" }: any) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
       {icon && <Icon name={icon} className={`text-${color}-400 text-[10px]`} />}
       <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">{label}</span>
    </div>
    <button onClick={(e) => { e.stopPropagation(); onToggle(!enabled); }} className={`w-8 h-4 rounded-full relative transition-colors ${enabled ? `bg-${color}-600` : 'bg-slate-800'}`}>
       <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  </div>
);

export default RightPanel;
