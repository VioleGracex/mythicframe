import React, { useState, useEffect, useRef } from 'react';
import { generateVideoViaBEI, getAccountCapabilities, getBEIBridgeStatus } from '../../services/beiService';
import { useLanguage } from '../../i18n/LanguageContext';

interface VideoStudioProps {
  onNavigate?: (mode: any) => void;
}

interface VideoAsset {
  id: string;
  name: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  duration: number;
  createdAt: number;
}

const VIDEO_PRESETS = [
  {
    id: 'cinematic',
    name: 'Cinematic Cutscene',
    aspectRatio: '16:9' as const,
    motion: 'dynamic' as const,
    prompt: 'Cinematic game cutscene, dramatic slow camera pan over ancient overgrown ruins of a gothic citadel at sunset, volumetric golden god rays, drifting dust particles, high fantasy RPG atmosphere'
  },
  {
    id: 'spell_vfx',
    name: 'Spell VFX Loop',
    aspectRatio: '1:1' as const,
    motion: 'standard' as const,
    prompt: 'Seamless looping arcane magic spell effect, swirling neon purple void energy, orbiting mystical runes, subtle lightning arcs, clean black background, seamless loop'
  },
  {
    id: 'character_attack',
    name: 'Character Attack Sequence',
    aspectRatio: '16:9' as const,
    motion: 'dynamic' as const,
    prompt: 'Action combat animation, cybernetic ninja executing a rapid sword dash, glowing cyan katana slash trail, impact shockwave, cinematic motion blur'
  },
  {
    id: 'pixel_waterfall',
    name: 'Pixel Art Animated Scene',
    aspectRatio: '16:9' as const,
    motion: 'subtle' as const,
    prompt: '16-bit retro pixel art game background animation, cascading waterfall into a turquoise lagoon, swaying tropical trees, animated mist and sparkling water reflections'
  },
  {
    id: 'space_dogfight',
    name: 'Sci-Fi Hyperspace Drop',
    aspectRatio: '16:9' as const,
    motion: 'dynamic' as const,
    prompt: 'Futuristic spaceship dropping out of hyperspace into a planetary asteroid ring, engine plasma flare, sleek metallic hull reflections, cinematic camera rotation'
  }
];

export default function VideoStudio({ onNavigate }: VideoStudioProps) {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState(VIDEO_PRESETS[0].prompt);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [motionIntensity, setMotionIntensity] = useState<'subtle' | 'standard' | 'dynamic'>('dynamic');
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [accountTier, setAccountTier] = useState<'free' | 'advanced' | 'pro' | 'workspace'>('free');
  const [accountEmail, setAccountEmail] = useState('');
  const [hasVideoCapability, setHasVideoCapability] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [videos, setVideos] = useState<VideoAsset[]>(() => {
    try {
      const saved = localStorage.getItem('mythic_video_assets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeVideo, setActiveVideo] = useState<VideoAsset | null>(null);
  const [isLooping, setIsLooping] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('mythic_video_assets', JSON.stringify(videos));
    } catch {}
  }, [videos]);

  useEffect(() => {
    if (!activeVideo && videos.length > 0) {
      setActiveVideo(videos[0]);
    }
  }, [videos]);

  // Inspect Account Tier & Video Capabilities
  const checkAccount = async (slot: number) => {
    try {
      const caps = await getAccountCapabilities(slot);
      setAccountTier(caps.tier);
      setAccountEmail(caps.email);
      setHasVideoCapability(caps.capabilities.video);

      const status = await getBEIBridgeStatus();
      if (status && status.accounts) {
        setAvailableSlots(status.accounts);
      }
    } catch (e) {}
  };

  useEffect(() => {
    checkAccount(selectedSlot);
  }, [selectedSlot]);

  const handleSelectPreset = (p: typeof VIDEO_PRESETS[0]) => {
    setPrompt(p.prompt);
    setAspectRatio(p.aspectRatio);
    setMotionIntensity(p.motion);
  };

  const handleSwitchToAdvanced = () => {
    const advSlot = availableSlots.find(a => a.tier === 'advanced' || a.capabilities?.video);
    if (advSlot) {
      setSelectedSlot(advSlot.slot);
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setStatusMessage('Connecting to Google Gemini Web Veo video engine...');

    const abort = new AbortController();
    abortControllerRef.current = abort;

    try {
      const res = await generateVideoViaBEI({
        prompt,
        aspectRatio,
        motionIntensity,
        accountSlot: selectedSlot,
        signal: abort.signal
      });

      if (res && res.video) {
        const newVideo: VideoAsset = {
          id: res.jobId || `video_${Date.now()}`,
          name: `${prompt.substring(0, 30)}... (${aspectRatio})`,
          url: res.video,
          prompt,
          aspectRatio,
          duration: 10,
          createdAt: Date.now()
        };

        setVideos(prev => [newVideo, ...prev]);
        setActiveVideo(newVideo);
        setStatusMessage('Video generated successfully!');

        // Save to asset library database
        try {
          await fetch('/api/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: newVideo.id,
              name: newVideo.name,
              prompt: newVideo.prompt,
              type: 'video',
              imageUrl: newVideo.url
            })
          });
        } catch {}
      }
    } catch (err: any) {
      if (abort.signal.aborted) {
        setStatusMessage('Generation cancelled.');
      } else {
        const msg = err.message || String(err);
        if (msg.includes('TIER_RESTRICTION') || msg.toLowerCase().includes('gemini advanced')) {
          setStatusMessage('Account restriction: Gemini Web requires Gemini Advanced for Veo video generation. Switch account slot above.');
        } else {
          setStatusMessage(`Error: ${msg}`);
        }
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setStatusMessage('Cancelled.');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header Bar */}
      <div className="shrink-0 h-16 border-b border-slate-900 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/30">
            <i className="fa-solid fa-video text-base"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Game Cutscenes & Video Studio
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">BEI Gemini Veo</span>
            </h1>
            <p className="text-xs text-slate-400">Generate animated cutscenes, looping spell VFX, and cinematic intro sequences</p>
          </div>
        </div>

        {/* Account Slot Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <i className="fa-brands fa-google text-slate-400"></i>
            <span className="text-slate-400">Account:</span>
            <select
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(parseInt(e.target.value, 10))}
              className="bg-transparent text-slate-200 outline-none font-semibold cursor-pointer"
            >
              <option value={0} className="bg-slate-900 text-slate-200">Slot 0 (/u/0)</option>
              <option value={1} className="bg-slate-900 text-slate-200">Slot 1 (/u/1)</option>
              <option value={2} className="bg-slate-900 text-slate-200">Slot 2 (/u/2)</option>
              <option value={3} className="bg-slate-900 text-slate-200">Slot 3 (/u/3)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Account Tier Diagnostic Notification Banner */}
      <div className="shrink-0 px-6 py-2.5 bg-slate-900/70 border-b border-slate-900 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          {hasVideoCapability || accountTier === 'advanced' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-semibold text-emerald-400">Gemini Advanced Account Detected</span>
              <span className="text-slate-400">({accountEmail || `Slot /u/${selectedSlot}`}) • Veo video generation is fully supported.</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="font-semibold text-amber-300">Free Google Account Detected</span>
              <span className="text-slate-400">
                ({accountEmail || `Slot /u/${selectedSlot}`}) • Google Gemini Web restricts Veo video generation to Gemini Advanced subscribers.
              </span>
            </>
          )}
        </div>

        {(!hasVideoCapability && accountTier !== 'advanced') && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSwitchToAdvanced}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <i className="fa-solid fa-arrow-right-arrow-left"></i>
              Switch to Advanced Slot
            </button>
          </div>
        )}
      </div>

      {/* Studio Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-96 border-r border-slate-900 p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0 bg-slate-950/70">
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-2">
              <i className="fa-solid fa-clapperboard text-indigo-400"></i>
              Cutscene & VFX Presets
            </label>
            <div className="space-y-1.5">
              {VIDEO_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all ${
                    prompt === p.prompt
                      ? 'bg-indigo-950/50 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-950/30'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{p.aspectRatio} • {p.motion} motion</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between mb-2">
              <span>Scene Prompt</span>
              <span className="text-[10px] text-slate-500 font-normal">Cinematic brief</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the action, camera movement, lighting, and visual effects..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
            />
          </div>

          {/* Video Parameters */}
          <div className="space-y-3 bg-slate-900/30 border border-slate-800/80 p-3.5 rounded-xl">
            <div>
              <label className="text-xs text-slate-300 font-medium block mb-1.5">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {(['16:9', '9:16', '1:1'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setAspectRatio(r)}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                      aspectRatio === r
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-950/40'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium block mb-1.5">Motion Dynamics</label>
              <div className="grid grid-cols-3 gap-2">
                {(['subtle', 'standard', 'dynamic'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMotionIntensity(m)}
                    className={`py-2 rounded-lg text-xs font-semibold capitalize border transition-all ${
                      motionIntensity === m
                        ? 'bg-purple-600 border-purple-400 text-white shadow-md shadow-purple-950/40'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dispatch Button */}
          <div className="pt-2">
            {!isGenerating ? (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <i className="fa-solid fa-film"></i>
                Generate Video Scene
              </button>
            ) : (
              <button
                onClick={handleCancel}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <i className="fa-solid fa-stop"></i>
                Cancel Generation
              </button>
            )}

            {statusMessage && (
              <p className="text-xs text-center text-slate-400 mt-2 font-medium animate-pulse">
                {statusMessage}
              </p>
            )}
          </div>
        </div>

        {/* Right Player & Video Vault */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
          {/* Active Video Player */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">Video Player</span>
                <h2 className="text-lg font-bold text-white mt-1">
                  {activeVideo ? activeVideo.name : 'No Video Loaded'}
                </h2>
                <p className="text-xs text-slate-400 max-w-xl truncate mt-0.5">
                  {activeVideo ? activeVideo.prompt : 'Generate a video or select an existing cutscene from history.'}
                </p>
              </div>

              {activeVideo && (
                <div className="flex items-center gap-2">
                  <a
                    href={activeVideo.url}
                    download={`mythic_video_${activeVideo.id}.mp4`}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
                  >
                    <i className="fa-solid fa-download"></i>
                    Export MP4
                  </a>
                </div>
              )}
            </div>

            {/* Video Viewport */}
            <div className="w-full bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-slate-800 relative">
              {activeVideo ? (
                <video
                  ref={videoRef}
                  src={activeVideo.url}
                  controls
                  autoPlay
                  loop={isLooping}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-8 text-slate-600">
                  <i className="fa-solid fa-video-slash text-4xl mb-3 block opacity-40"></i>
                  <p className="text-xs">No video sequence rendered yet. Select a preset and click "Generate Video Scene".</p>
                </div>
              )}
            </div>
          </div>

          {/* Session Video History Vault */}
          <div>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <i className="fa-solid fa-photo-film text-indigo-400"></i>
              Rendered Video Scenes ({videos.length})
            </h3>

            {videos.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                No video scenes rendered in this session yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {videos.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => setActiveVideo(v)}
                    className={`rounded-xl border overflow-hidden cursor-pointer transition-all ${
                      activeVideo?.id === v.id
                        ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-950/20'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="aspect-video bg-black flex items-center justify-center relative">
                      <video src={v.url} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xs">
                          <i className="fa-solid fa-play pl-0.5"></i>
                        </div>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-xs font-bold text-slate-200 truncate">{v.name}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{v.prompt}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
