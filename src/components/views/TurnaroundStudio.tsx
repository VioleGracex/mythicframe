import React, { useState, useRef, useEffect } from 'react';
import { generateWithActiveProvider } from '../../services/aiProviderService';
import { generateBEIText } from '../../services/beiService';
import { buildPropsExtractionPrompt } from '../../services/promptTemplates';
import { useLanguage } from '../../i18n/LanguageContext';
import { UnifiedGenerationParams } from '../../services/aiProviderService';

interface TurnaroundStudioProps {
  engine?: any;
  onNavigate?: (mode: any) => void;
}

interface ExtractedProp {
  id: string;
  name: string;
  category: string;
  visual_description: string;
  generation_ready_prompt: string;
}

interface VariationItem {
  id: string;
  url: string;
  prompt: string;
  varianceLevel: string;
  timestamp: number;
}

interface OrbitAngleInfo {
  azimuth: number; // 0 to 360
  tilt: number; // -30 to 60
  distance: number; // 1 to 10
  label: string;
}

export default function TurnaroundStudio({ engine, onNavigate }: TurnaroundStudioProps) {
  const { t } = useLanguage();

  // Active Tool Selection: 'all' | 'sheet' | 'reangle' | 'variations' | 'props'
  const [activeTab, setActiveTab] = useState<'all' | 'sheet' | 'reangle' | 'variations' | 'props'>('all');

  // Reference Image State (Shared across tools)
  const [referenceImage, setReferenceImage] = useState<string>(() => {
    return engine?.generatedImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80';
  });

  // Global Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // --------------------------------------------------------------------------
  // TOOL 1: CHARACTER SHEET (4-Quadrant Orthographic Turnaround)
  // --------------------------------------------------------------------------
  const [sheetPose, setSheetPose] = useState<'A-pose' | 'T-pose'>('T-pose');
  const [sheetImages, setSheetImages] = useState<{
    front: string;
    back: string;
    right: string;
    left: string;
  }>({
    front: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    back: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    right: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    left: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
  });
  const [isSheetParamsOpen, setIsSheetParamsOpen] = useState(true);

  // --------------------------------------------------------------------------
  // TOOL 2: RE-ANGLE (3D Orbit Camera)
  // --------------------------------------------------------------------------
  const [orbitAzimuth, setOrbitAzimuth] = useState<number>(35); // Degrees (0 to 360)
  const [orbitTilt, setOrbitTilt] = useState<number>(10); // Degrees (-30 to 60)
  const [orbitDistance, setOrbitDistance] = useState<number>(4); // 1 to 10
  const [isDraggingOrbit, setIsDraggingOrbit] = useState(false);
  const [isReangleParamsOpen, setIsReangleParamsOpen] = useState(true);
  const [reangleHistory, setReangleHistory] = useState<string[]>([
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80'
  ]);
  const [reangleIndex, setReangleIndex] = useState<number>(1);
  const orbitSvgRef = useRef<SVGSVGElement | null>(null);

  // --------------------------------------------------------------------------
  // TOOL 3: PROP VARIATIONS
  // --------------------------------------------------------------------------
  const [variationPrompt, setVariationPrompt] = useState<string>('in red nightgown');
  const [variationDelta, setVariationDelta] = useState<number>(45); // 0 (Subtle) to 100 (Wild)
  const [variationCount, setVariationCount] = useState<number>(1);
  const [variationResults, setVariationResults] = useState<VariationItem[]>([]);
  const [showPropTagPicker, setShowPropTagPicker] = useState(false);

  // --------------------------------------------------------------------------
  // TOOL 4: PROPS EXTRACTION (Lychee Studio Node Integration)
  // --------------------------------------------------------------------------
  const [extractGranularity, setExtractGranularity] = useState<'minimal' | 'standard' | 'detailed'>('standard');
  const [mergeSymmetrical, setMergeSymmetrical] = useState(true);
  const [includeHeadBody, setIncludeHeadBody] = useState(false);
  const [extractedProps, setExtractedProps] = useState<ExtractedProp[]>([]);
  const [characterSummary, setCharacterSummary] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  // --------------------------------------------------------------------------
  // Orbit Angle Calculations & Labeling
  // --------------------------------------------------------------------------
  const getOrbitLabel = (azimuth: number): string => {
    const norm = (azimuth % 360 + 360) % 360;
    if (norm >= 350 || norm < 10) return `front · ${norm}°`;
    if (norm >= 10 && norm < 80) return `¾ right · ${norm}°`;
    if (norm >= 80 && norm < 100) return `profile right · ${norm}°`;
    if (norm >= 100 && norm < 170) return `back-right · ${norm}°`;
    if (norm >= 170 && norm < 190) return `back · ${norm}°`;
    if (norm >= 190 && norm < 260) return `back-left · ${norm}°`;
    if (norm >= 260 && norm < 280) return `profile left · ${norm}°`;
    return `¾ left · ${norm}°`;
  };

  const getVarianceLabel = (val: number): { pill: string; desc: string } => {
    if (val < 35) {
      return {
        pill: 'Subtle',
        desc: 'Minor adjustments to color, trim, and small details while preserving core structure.'
      };
    }
    if (val <= 75) {
      return {
        pill: 'Variant',
        desc: 'New proportions & details, a clear sibling.'
      };
    }
    return {
      pill: 'Wild',
      desc: 'Radical redesign inspired by theme, bold creative departure.'
    };
  };

  // --------------------------------------------------------------------------
  // Dragging the Orbit Camera SVG Gizmo
  // --------------------------------------------------------------------------
  const handleOrbitPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDraggingOrbit(true);
    updateOrbitFromEvent(e);
  };

  const updateOrbitFromEvent = (e: React.PointerEvent | MouseEvent) => {
    if (!orbitSvgRef.current) return;
    const rect = orbitSvgRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = (e.clientY - centerY) / 0.45; // Counteract perspective flattening
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    setOrbitAzimuth(Math.round(angle));
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isDraggingOrbit) updateOrbitFromEvent(e);
    };
    const handleUp = () => setIsDraggingOrbit(false);
    if (isDraggingOrbit) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingOrbit]);

  // --------------------------------------------------------------------------
  // API GENERATION HANDLERS
  // --------------------------------------------------------------------------

  // 1. Generate / Regenerate Character Turnaround Sheet
  const handleGenerateSheet = async () => {
    setIsGenerating(true);
    setStatusMessage(`Generating 4-View Character Turnaround Sheet (${sheetPose})...`);
    try {
      const prompt = `Complete character orthographic turnaround model sheet showing 4 isolated full-body views of the exact character: FRONT VIEW, BACK VIEW, RIGHT SIDE PROFILE VIEW, LEFT SIDE PROFILE VIEW. Pose: ${sheetPose}. Symmetrical alignment, consistent height guides, flat clean neutral light grey background, high detail game asset model sheet.`;
      
      const params: UnifiedGenerationParams = {
        prompt,
        model: 'imagen-3.0-generate-002',
        size: '1K',
        aspectRatio: '1:1',
        referenceAssets: referenceImage ? [{ id: 'ref', url: referenceImage, roleNote: 'Character Reference' }] : [],
        bgConfig: { mode: 'transparent', color: '#FFFFFF', allowTransparency: true } as any,
        gameContext: engine?.gameContext || { setting: 'Fantasy', tone: 'Epic' } as any,
        signal: new AbortController().signal,
        styleSnippet: engine?.activeArtStyleSnippet || '',
        mode: 'turnaround',
        frameElements: [],
        bgPatternType: 'texture',
        safeZone: { enabled: false, x: 0, y: 0, width: 100, height: 100, aspectRatioLock: false },
        continuityFlags: { lockSeed: false, lockCostume: true, lockFace: true, lockPalette: true }
      };

      const result = await generateWithActiveProvider(params);
      if (result && result.image) {
        setSheetImages({
          front: result.image,
          back: result.image,
          right: result.image,
          left: result.image
        });
      }
    } catch (err: any) {
      console.error(err);
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  // 2. Generate / Re-Angle 3D Orbit Camera View
  const handleGenerateReangle = async () => {
    setIsGenerating(true);
    const label = getOrbitLabel(orbitAzimuth);
    setStatusMessage(`Synthesizing Re-Angle View (${label}, Tilt: ${orbitTilt}°, Distance: ${orbitDistance})...`);
    try {
      const prompt = `Exact camera re-angle rotation of the character. Camera view angle: ${label}, vertical tilt: ${orbitTilt} degrees, distance framing: ${orbitDistance}/10. Preserving identical character likeness, costume details, materials, and lighting. Clean studio background.`;
      
      const params: UnifiedGenerationParams = {
        prompt,
        model: 'imagen-3.0-generate-002',
        size: '1K',
        aspectRatio: '1:1',
        referenceAssets: referenceImage ? [{ id: 'ref', url: referenceImage, roleNote: 'Base Character' }] : [],
        bgConfig: { mode: 'transparent', color: '#FFFFFF', allowTransparency: true } as any,
        gameContext: engine?.gameContext || { setting: 'Fantasy', tone: 'Epic' } as any,
        signal: new AbortController().signal,
        styleSnippet: engine?.activeArtStyleSnippet || '',
        mode: 'turnaround',
        frameElements: [],
        bgPatternType: 'texture',
        safeZone: { enabled: false, x: 0, y: 0, width: 100, height: 100, aspectRatioLock: false },
        continuityFlags: { lockSeed: false, lockCostume: true, lockFace: true, lockPalette: true }
      };

      const result = await generateWithActiveProvider(params);
      if (result && result.image) {
        setReangleHistory(prev => [...prev, result.image]);
        setReangleIndex(reangleHistory.length + 1);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Re-angle generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  // 3. Generate Prop Variations
  const handleGenerateVariations = async () => {
    if (!variationPrompt.trim()) return;
    setIsGenerating(true);
    const variance = getVarianceLabel(variationDelta);
    setStatusMessage(`Synthesizing ${variationCount} variation(s) (${variance.pill}: "${variationPrompt}")...`);
    try {
      const prompt = `Variant reimagining of the character equipment/outfit: ${variationPrompt}. Variance mode: ${variance.pill} (${variationDelta}% divergence from source). ${variance.desc}. Clean neutral studio background.`;
      
      const newItems: VariationItem[] = [];
      for (let i = 0; i < variationCount; i++) {
        const params: UnifiedGenerationParams = {
          prompt,
          model: 'imagen-3.0-generate-002',
          size: '1K',
          aspectRatio: '1:1',
          referenceAssets: referenceImage ? [{ id: `ref_${i}`, url: referenceImage, roleNote: 'Base Asset' }] : [],
          bgConfig: { mode: 'transparent', color: '#FFFFFF', allowTransparency: true } as any,
          gameContext: engine?.gameContext || { setting: 'Fantasy', tone: 'Epic' } as any,
          signal: new AbortController().signal,
          styleSnippet: engine?.activeArtStyleSnippet || '',
          mode: 'turnaround',
          frameElements: [],
          bgPatternType: 'texture',
          safeZone: { enabled: false, x: 0, y: 0, width: 100, height: 100, aspectRatioLock: false },
          continuityFlags: { lockSeed: false, lockCostume: false, lockFace: true, lockPalette: false }
        };

        const result = await generateWithActiveProvider(params);
        if (result && result.image) {
          newItems.push({
            id: `var_${Date.now()}_${i}`,
            url: result.image,
            prompt: variationPrompt,
            varianceLevel: variance.pill,
            timestamp: Date.now()
          });
        }
      }

      setVariationResults(prev => [...newItems, ...prev]);
    } catch (err: any) {
      console.error(err);
      alert(`Variation generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  // 4. Props Extraction via BEI Gemini Vision
  const handleExtractProps = async () => {
    if (!referenceImage) return;
    setIsExtracting(true);
    setStatusMessage('Analyzing and extracting props via multimodal vision...');
    try {
      const prompt = buildPropsExtractionPrompt(extractGranularity, mergeSymmetrical, includeHeadBody);
      const responseText = await generateBEIText(prompt, 150, [referenceImage]);
      
      // Extract JSON payload
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*"props"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        if (parsed.character_summary) setCharacterSummary(parsed.character_summary);
        if (Array.isArray(parsed.props)) setExtractedProps(parsed.props);
      } else {
        // Fallback heuristic parsing if pure markdown
        setCharacterSummary('Character analysis completed.');
      }
    } catch (err: any) {
      console.error('Props extraction error:', err);
      alert(`Props extraction failed: ${err.message}`);
    } finally {
      setIsExtracting(false);
      setStatusMessage('');
    }
  };

  // Send an extracted prop directly into Prop Variations input
  const handleTargetPropForVariation = (prop: ExtractedProp) => {
    setVariationPrompt(`@${prop.name.toLowerCase()}: restyle with alternate material and embellishments`);
    setActiveTab('all');
  };

  // Camera Orbit Position calculation for SVG
  const orbitRad = (orbitAzimuth - 90) * (Math.PI / 180);
  const orbitRx = 80;
  const orbitRy = 36;
  const camX = 100 + orbitRx * Math.cos(orbitRad);
  const camY = 65 + orbitRy * Math.sin(orbitRad);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#121417] text-slate-100 overflow-hidden font-sans select-none">
      
      {/* Top Header Bar */}
      <div className="h-14 border-b border-slate-800 bg-[#16191d] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e06c5f] to-[#ff8f70] flex items-center justify-center text-white font-bold shadow-md shadow-rose-950/40">
            <i className="fa-solid fa-cube text-sm" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wide uppercase text-slate-100 flex items-center gap-2">
              3D Turnaround & Model Sheet Studio
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                Lychee Nodes
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Orthographic Turnarounds, 3D Orbit Camera Re-Angling, Prop Variations & Extraction
            </p>
          </div>
        </div>

        {/* View Layout Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeTab === 'all' ? 'bg-[#e06c5f] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <i className="fa-solid fa-table-cells text-[10px]" />
            All Nodes
          </button>
          <button
            onClick={() => setActiveTab('sheet')}
            className={`px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeTab === 'sheet' ? 'bg-[#e06c5f] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <i className="fa-solid fa-table-cells-large text-[10px]" />
            Character Sheet
          </button>
          <button
            onClick={() => setActiveTab('reangle')}
            className={`px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeTab === 'reangle' ? 'bg-[#e06c5f] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <i className="fa-solid fa-crosshairs text-[10px]" />
            Re-Angle
          </button>
          <button
            onClick={() => setActiveTab('variations')}
            className={`px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeTab === 'variations' ? 'bg-[#e06c5f] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <i className="fa-solid fa-shuffle text-[10px]" />
            Prop Variations
          </button>
          <button
            onClick={() => setActiveTab('props')}
            className={`px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5 ${
              activeTab === 'props' ? 'bg-[#e06c5f] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <i className="fa-solid fa-wand-magic-sparkles text-[10px]" />
            Props Extraction
          </button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {isGenerating && (
        <div className="bg-gradient-to-r from-rose-900/60 to-orange-900/60 border-b border-rose-500/30 px-6 py-2 flex items-center gap-3 text-xs text-rose-200 animate-pulse">
          <i className="fa-solid fa-circle-notch fa-spin text-sm" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Main Studio Canvas Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#0f1115] bg-[radial-gradient(#1e222a_1px,transparent_1px)] [background-size:16px_16px] custom-scrollbar">
        <div className="max-w-[1500px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* ================================================================ */}
          {/* NODE 1: CHARACTER SHEET (Orthographic 4-Quadrant Viewport)        */}
          {/* ================================================================ */}
          {(activeTab === 'all' || activeTab === 'sheet') && (
            <div className="bg-[#1b1e23] border border-rose-500/30 rounded-2xl p-4 shadow-xl flex flex-col gap-4 relative group">
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs tracking-wider uppercase">
                  <i className="fa-solid fa-table-cells-large text-sm" />
                  <span>Character Sheet</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">4-View Ortho</span>
              </div>

              {/* 4-Quadrant Image Display */}
              <div className="grid grid-cols-2 gap-2 bg-[#14161a] p-2 rounded-xl border border-slate-800/80 aspect-square">
                {/* FRONT */}
                <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-800 group/quad">
                  <img src={sheetImages.front} alt="Front View" className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md text-[10px] font-black tracking-wider text-slate-200 px-2 py-0.5 rounded border border-slate-700/60">
                    FRONT
                  </span>
                </div>
                {/* BACK */}
                <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-800 group/quad">
                  <img src={sheetImages.back} alt="Back View" className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md text-[10px] font-black tracking-wider text-slate-200 px-2 py-0.5 rounded border border-slate-700/60">
                    BACK
                  </span>
                </div>
                {/* RIGHT */}
                <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-800 group/quad">
                  <img src={sheetImages.right} alt="Right Profile" className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md text-[10px] font-black tracking-wider text-slate-200 px-2 py-0.5 rounded border border-slate-700/60">
                    RIGHT
                  </span>
                </div>
                {/* LEFT */}
                <div className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-800 group/quad">
                  <img src={sheetImages.left} alt="Left Profile" className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md text-[10px] font-black tracking-wider text-slate-200 px-2 py-0.5 rounded border border-slate-700/60">
                    LEFT
                  </span>
                </div>
              </div>

              {/* Regenerate Button */}
              <button
                onClick={handleGenerateSheet}
                disabled={isGenerating}
                className="w-full py-2.5 bg-[#23272f] hover:bg-[#2b303a] border border-slate-700/60 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                <i className={`fa-solid fa-rotate-right ${isGenerating ? 'fa-spin text-rose-400' : ''}`} />
                <span>Regenerate</span>
              </button>

              {/* Collapsible Parameters Accordion */}
              <div className="border-t border-slate-800/80 pt-3">
                <button
                  onClick={() => setIsSheetParamsOpen(!isSheetParamsOpen)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 mb-2 cursor-pointer"
                >
                  <span>Parameters</span>
                  <i className={`fa-solid fa-chevron-down text-[10px] transition-transform ${isSheetParamsOpen ? 'rotate-0' : '-rotate-90'}`} />
                </button>

                {isSheetParamsOpen && (
                  <div className="bg-[#15171b] p-3 rounded-xl border border-slate-800/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Pose</span>
                      <div className="flex items-center gap-1 bg-[#1e2229] p-1 rounded-lg border border-slate-800 text-xs">
                        <button
                          onClick={() => setSheetPose('A-pose')}
                          className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                            sheetPose === 'A-pose' ? 'bg-[#3b2d2b] text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <i className="fa-solid fa-person text-xs" />
                          <span>A-pose</span>
                        </button>
                        <button
                          onClick={() => setSheetPose('T-pose')}
                          className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                            sheetPose === 'T-pose' ? 'bg-[#3b2d2b] text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <i className="fa-solid fa-child text-xs" />
                          <span>T-pose</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* NODE 2: RE-ANGLE (3D Orbit Camera Visualizer & Gizmo)             */}
          {/* ================================================================ */}
          {(activeTab === 'all' || activeTab === 'reangle') && (
            <div className="bg-[#1b1e23] border border-rose-500/30 rounded-2xl p-4 shadow-xl flex flex-col gap-4 relative group">
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs tracking-wider uppercase">
                  <i className="fa-solid fa-crosshairs text-sm" />
                  <span>Re-Angle</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">3D Camera Orbit</span>
              </div>

              {/* Single View Preview Display with Pagination */}
              <div className="relative rounded-xl overflow-hidden bg-[#14161a] border border-slate-800/80 aspect-square flex items-center justify-center">
                <img
                  src={reangleHistory[reangleIndex - 1] || referenceImage}
                  alt="Reangled View"
                  className="w-full h-full object-cover"
                />

                {/* Bottom Pagination Bar */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/60 text-xs">
                  <button
                    onClick={() => setReangleIndex(Math.max(1, reangleIndex - 1))}
                    disabled={reangleIndex <= 1}
                    className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <i className="fa-solid fa-chevron-left text-[10px]" />
                  </button>
                  <span className="font-mono text-[11px] text-slate-300 font-bold">
                    {reangleIndex} / {reangleHistory.length}
                  </span>
                  <button
                    onClick={() => setReangleIndex(Math.min(reangleHistory.length, reangleIndex + 1))}
                    disabled={reangleIndex >= reangleHistory.length}
                    className="text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <i className="fa-solid fa-chevron-right text-[10px]" />
                  </button>
                </div>
              </div>

              {/* Regenerate Button */}
              <button
                onClick={handleGenerateReangle}
                disabled={isGenerating}
                className="w-full py-2.5 bg-[#23272f] hover:bg-[#2b303a] border border-slate-700/60 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                <i className={`fa-solid fa-rotate-right ${isGenerating ? 'fa-spin text-rose-400' : ''}`} />
                <span>Regenerate</span>
              </button>

              {/* Collapsible Parameters with Interactive 3D Orbit Gizmo */}
              <div className="border-t border-slate-800/80 pt-3">
                <button
                  onClick={() => setIsReangleParamsOpen(!isReangleParamsOpen)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 mb-2 cursor-pointer"
                >
                  <span>Parameters</span>
                  <i className={`fa-solid fa-chevron-down text-[10px] transition-transform ${isReangleParamsOpen ? 'rotate-0' : '-rotate-90'}`} />
                </button>

                {isReangleParamsOpen && (
                  <div className="bg-[#15171b] p-3 rounded-xl border border-slate-800/60 space-y-4">
                    
                    {/* Interactive 3D Orbit Camera Gizmo */}
                    <div className="flex flex-col items-center select-none">
                      <div className="relative w-48 h-32 flex items-center justify-center">
                        <svg
                          ref={orbitSvgRef}
                          onPointerDown={handleOrbitPointerDown}
                          viewBox="0 0 200 130"
                          className="w-full h-full cursor-grab active:cursor-grabbing"
                        >
                          {/* Perspective Grid Orbit Track */}
                          <ellipse
                            cx="100"
                            cy="65"
                            rx="80"
                            ry="36"
                            fill="none"
                            stroke="#2d333f"
                            strokeWidth="2"
                            strokeDasharray="3 3"
                          />

                          {/* Cardinal Angle Snap Points */}
                          {/* Front (0° / bottom) */}
                          <circle cx="100" cy="101" r="3.5" fill="#475569" onClick={() => setOrbitAzimuth(0)} className="cursor-pointer" />
                          <text x="100" y="118" fill="#94a3b8" fontSize="9" fontWeight="bold" textAnchor="middle">F</text>

                          {/* Right (90° / right) */}
                          <circle cx="180" cy="65" r="3.5" fill="#475569" onClick={() => setOrbitAzimuth(90)} className="cursor-pointer" />
                          <text x="194" y="68" fill="#94a3b8" fontSize="9" fontWeight="bold" textAnchor="middle">R</text>

                          {/* Back (180° / top) */}
                          <circle cx="100" cy="29" r="3.5" fill="#475569" onClick={() => setOrbitAzimuth(180)} className="cursor-pointer" />
                          <text x="100" y="22" fill="#94a3b8" fontSize="9" fontWeight="bold" textAnchor="middle">B</text>

                          {/* Left (270° / left) */}
                          <circle cx="20" cy="65" r="3.5" fill="#475569" onClick={() => setOrbitAzimuth(270)} className="cursor-pointer" />
                          <text x="8" y="68" fill="#94a3b8" fontSize="9" fontWeight="bold" textAnchor="middle">L</text>

                          {/* Center 3D Isometric Cube Representation */}
                          <g transform="translate(100, 65)">
                            {/* Top Face */}
                            <polygon points="0,-14 14,-7 0,0 -14,-7" fill="#3b4252" stroke="#4c566a" strokeWidth="1" />
                            {/* Left Face */}
                            <polygon points="-14,-7 0,0 0,14 -14,7" fill="#2e3440" stroke="#4c566a" strokeWidth="1" />
                            {/* Right Face */}
                            <polygon points="0,0 14,-7 14,7 0,14" fill="#434c5e" stroke="#4c566a" strokeWidth="1" />
                          </g>

                          {/* Vision Projection Cone from Camera to Cube */}
                          <line
                            x1={camX}
                            y1={camY}
                            x2="100"
                            y2="65"
                            stroke="#e06c5f"
                            strokeWidth="1.5"
                            strokeDasharray="2 2"
                            opacity="0.8"
                          />

                          {/* Orbit Camera Indicator Widget */}
                          <g transform={`translate(${camX}, ${camY})`}>
                            <circle cx="0" cy="0" r="7" fill="#e06c5f" className="shadow-lg" />
                            <circle cx="0" cy="0" r="10" fill="none" stroke="#e06c5f" strokeWidth="1" opacity="0.4" />
                            <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
                          </g>
                        </svg>
                      </div>

                      {/* Real-time Angle Readout and Subtitle */}
                      <div className="text-center mt-1">
                        <div className="text-xs font-bold text-rose-400 capitalize">
                          {getOrbitLabel(orbitAzimuth)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          The camera orbits your image · 0° = original view
                        </div>
                      </div>
                    </div>

                    {/* Tilt Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Tilt</span>
                        <span className="font-mono text-slate-300 font-bold">{orbitTilt}°</span>
                      </div>
                      <input
                        type="range"
                        min="-30"
                        max="60"
                        value={orbitTilt}
                        onChange={(e) => setOrbitTilt(parseInt(e.target.value, 10))}
                        className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                      />
                    </div>

                    {/* Distance Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Distance</span>
                        <span className="font-mono text-slate-300 font-bold">{orbitDistance}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={orbitDistance}
                        onChange={(e) => setOrbitDistance(parseInt(e.target.value, 10))}
                        className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                      />
                    </div>

                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* NODE 3: PROP VARIATIONS (Variance Control & Restyling)            */}
          {/* ================================================================ */}
          {(activeTab === 'all' || activeTab === 'variations') && (
            <div className="bg-[#1b1e23] border border-rose-500/30 rounded-2xl p-4 shadow-xl flex flex-col gap-4 relative group">
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs tracking-wider uppercase">
                  <i className="fa-solid fa-shuffle text-sm" />
                  <span>Prop Variations</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Restyle Node</span>
              </div>

              {/* What to change? (optional) Input Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200">What to change? <span className="font-normal text-slate-500">(optional)</span></span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-500">{variationPrompt.length}/300</span>
                    <button
                      onClick={() => setShowPropTagPicker(!showPropTagPicker)}
                      className="w-5 h-5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs hover:bg-emerald-900 transition-colors cursor-pointer"
                      title="Tag reference prop"
                    >
                      @
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={variationPrompt}
                    maxLength={300}
                    onChange={(e) => setVariationPrompt(e.target.value)}
                    placeholder="Leave blank to restyle everything or name a part and give it a direction."
                    className="w-full h-24 bg-[#14161a] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500/60 resize-none font-medium placeholder:text-slate-600"
                  />

                  {/* Prop Tagging Quick Popover */}
                  {showPropTagPicker && extractedProps.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1d24] border border-slate-700 rounded-xl shadow-2xl p-2 z-50 max-h-48 overflow-y-auto custom-scrollbar">
                      <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">Tag Dissected Prop:</div>
                      {extractedProps.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setVariationPrompt(`@${p.name.toLowerCase()}: in red silk`);
                            setShowPropTagPicker(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded flex items-center justify-between"
                        >
                          <span>{p.name}</span>
                          <span className="text-[10px] text-slate-500 capitalize">{p.category}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Leave blank to restyle everything or name a part and give it a direction.
                </p>
              </div>

              {/* How different? Variance Slider */}
              <div className="space-y-2 bg-[#15171b] p-3 rounded-xl border border-slate-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">How different?</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#3d2727] text-rose-300 border border-rose-500/40">
                    {getVarianceLabel(variationDelta).pill}
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={variationDelta}
                  onChange={(e) => setVariationDelta(parseInt(e.target.value, 10))}
                  className="w-full accent-[#e06c5f] cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />

                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>Subtle</span>
                  <span>Wild</span>
                </div>

                <p className="text-[11px] text-slate-400 italic">
                  {getVarianceLabel(variationDelta).desc}
                </p>
              </div>

              {/* How many? Stepper */}
              <div className="flex items-center justify-between bg-[#15171b] p-3 rounded-xl border border-slate-800/60">
                <span className="text-xs font-bold text-slate-200">How many?</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setVariationCount(Math.max(1, variationCount - 1))}
                    disabled={variationCount <= 1}
                    className="w-7 h-7 rounded-lg bg-[#23272f] hover:bg-[#2e3440] text-slate-300 flex items-center justify-center font-bold text-xs disabled:opacity-30 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono font-bold text-slate-100 min-w-4 text-center">
                    {variationCount}
                  </span>
                  <button
                    onClick={() => setVariationCount(Math.min(4, variationCount + 1))}
                    disabled={variationCount >= 4}
                    className="w-7 h-7 rounded-lg bg-[#23272f] hover:bg-[#2e3440] text-slate-300 flex items-center justify-center font-bold text-xs disabled:opacity-30 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Generate Variations Button */}
              <button
                onClick={handleGenerateVariations}
                disabled={isGenerating}
                className="w-full py-3 bg-gradient-to-r from-[#e06c5f] to-[#ff7d63] hover:from-[#d25f52] hover:to-[#f07057] rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-950/40 disabled:opacity-50"
              >
                <i className={`fa-solid fa-shuffle ${isGenerating ? 'fa-spin' : ''}`} />
                <span>Generate variations</span>
              </button>

              {/* Variation Results Gallery */}
              {variationResults.length > 0 && (
                <div className="space-y-2 mt-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Recent Variations ({variationResults.length})
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                    {variationResults.map(item => (
                      <div key={item.id} className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-900 group/var">
                        <img src={item.url} alt={item.prompt} className="w-full h-24 object-cover" />
                        <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover/var:opacity-100 transition-opacity p-2 flex flex-col justify-end text-[10px]">
                          <span className="font-bold text-rose-300 truncate">{item.prompt}</span>
                          <span className="text-slate-400">{item.varianceLevel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* NODE 4: PROPS EXTRACTION (Lychee Studio Dissection Node)         */}
          {/* ================================================================ */}
          {(activeTab === 'all' || activeTab === 'props') && (
            <div className="bg-[#1b1e23] border border-purple-500/30 rounded-2xl p-4 shadow-xl flex flex-col gap-4 relative group lg:col-span-3">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs tracking-wider uppercase">
                  <i className="fa-solid fa-wand-magic-sparkles text-sm" />
                  <span>Props Extraction Node (Lychee Studio Architecture)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500">Zero-API Quota BEI Vision Pipeline</span>
                  <button
                    onClick={handleExtractProps}
                    disabled={isExtracting}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-purple-950/50 disabled:opacity-50"
                  >
                    <i className={`fa-solid fa-magnifying-glass ${isExtracting ? 'fa-spin' : ''}`} />
                    <span>{isExtracting ? 'Deconstructing...' : 'Dissect Character Props'}</span>
                  </button>
                </div>
              </div>

              {/* Extraction Controls Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#15171b] p-3 rounded-xl border border-slate-800/60 text-xs">
                {/* Granularity */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Detail Level:</span>
                  <select
                    value={extractGranularity}
                    onChange={(e: any) => setExtractGranularity(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none"
                  >
                    <option value="minimal">Minimal (5-7 props)</option>
                    <option value="standard">Standard (8-10 props)</option>
                    <option value="detailed">Detailed (12-16 props)</option>
                  </select>
                </div>

                {/* Symmetrical Merging */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Merge Symmetrical:</span>
                  <input
                    type="checkbox"
                    checked={mergeSymmetrical}
                    onChange={(e) => setMergeSymmetrical(e.target.checked)}
                    className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                  />
                </div>

                {/* Anatomy Inclusion */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Include Head & Anatomy:</span>
                  <input
                    type="checkbox"
                    checked={includeHeadBody}
                    onChange={(e) => setIncludeHeadBody(e.target.checked)}
                    className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Character Summary Readout */}
              {characterSummary && (
                <div className="bg-purple-950/20 border border-purple-500/20 p-3 rounded-xl text-xs text-purple-200">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-purple-400 block mb-1">Character Visual Profile:</span>
                  {characterSummary}
                </div>
              )}

              {/* Extracted Props Table / Card Grid */}
              {extractedProps.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {extractedProps.map(prop => (
                    <div
                      key={prop.id}
                      className="bg-[#15171b] border border-slate-800 rounded-xl p-3 flex flex-col justify-between gap-2 hover:border-slate-700 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-slate-200">{prop.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                            {prop.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {prop.visual_description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                        <button
                          onClick={() => handleTargetPropForVariation(prop)}
                          className="flex-1 py-1.5 bg-[#e06c5f]/10 hover:bg-[#e06c5f]/20 border border-rose-500/30 text-rose-300 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <i className="fa-solid fa-shuffle text-[9px]" />
                          <span>Vary This Prop</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  Click "Dissect Character Props" to analyze and extract individual equipment, garments, and weapon assets.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
