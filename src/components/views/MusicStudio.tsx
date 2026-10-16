import React, { useState, useEffect, useRef } from 'react';
import { generateMusicViaBEI, getAccountCapabilities, getBEIBridgeStatus } from '../../services/beiService';
import { useLanguage } from '../../i18n/LanguageContext';

interface MusicStudioProps {
  onNavigate?: (mode: any) => void;
}

interface AudioTrack {
  id: string;
  name: string;
  url: string;
  prompt: string;
  genre: string;
  tempo: number;
  duration: number;
  createdAt: number;
}

const PRESETS = [
  {
    id: 'battle',
    name: 'Battle Theme',
    genre: 'Orchestral Combat',
    tempo: 140,
    mood: 'Heroic & Intense',
    prompt: 'Epic orchestral battle theme with driving taiko drums, brass fanfare, and aggressive strings for a boss encounter'
  },
  {
    id: 'dungeon',
    name: 'Ambient Dungeon',
    genre: 'Dark Ambient',
    tempo: 75,
    mood: 'Tense & Eerie',
    prompt: 'Subtle dark dungeon ambience, low resonant drone, distant water drops, echoing metallic scraping, haunting atmospheric pads'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk City',
    genre: 'Synthwave',
    tempo: 120,
    mood: 'Futuristic & Energetic',
    prompt: 'Dystopian cyberpunk synthwave, vintage analog synthesizers, punchy 80s drum machines, neon atmosphere with warm bassline'
  },
  {
    id: 'chiptune',
    name: '8-Bit Retro Boss',
    genre: 'Chiptune',
    tempo: 155,
    mood: 'Frantic & Retro',
    prompt: 'Fast retro 8-bit NES chiptune boss battle music, pulsing square wave bass, rapid arpeggios, energetic arcade style'
  },
  {
    id: 'town',
    name: 'Peaceful Village',
    genre: 'Acoustic Folk',
    tempo: 90,
    mood: 'Warm & Peaceful',
    prompt: 'Cozy RPG village theme, acoustic lute fingerpicking, gentle wooden flute melody, relaxing strings, peaceful tavern vibe'
  },
  {
    id: 'sfx_ui',
    name: 'Sci-Fi UI SFX Pack',
    genre: 'Game Foley & SFX',
    tempo: 120,
    mood: 'Modern & Crisp',
    prompt: 'Crystal clear futuristic game UI sound effects pack: holographic click, confirm chime, error buzz, inventory open whoosh'
  }
];

export default function MusicStudio({ onNavigate }: MusicStudioProps) {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState(PRESETS[0].prompt);
  const [genre, setGenre] = useState(PRESETS[0].genre);
  const [tempo, setTempo] = useState(PRESETS[0].tempo);
  const [mood, setMood] = useState(PRESETS[0].mood);
  const [isLoopable, setIsLoopable] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [tracks, setTracks] = useState<AudioTrack[]>(() => {
    try {
      const saved = localStorage.getItem('mythic_music_tracks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeTrack, setActiveTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('mythic_music_tracks', JSON.stringify(tracks));
    } catch {}
  }, [tracks]);

  // Set initial active track if available
  useEffect(() => {
    if (!activeTrack && tracks.length > 0) {
      setActiveTrack(tracks[0]);
    }
  }, [tracks]);

  // Waveform visualization animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const renderWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Draw background grid lines
      ctx.strokeStyle = 'rgba(147, 51, 234, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Waveform bars
      const numBars = 48;
      const barWidth = width / numBars - 2;

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + 2);
        let amplitude = 0.2;

        if (isPlaying) {
          amplitude = 0.2 + 0.7 * Math.abs(Math.sin(phase + i * 0.3) * Math.cos(phase * 0.8 + i * 0.15));
        } else {
          amplitude = 0.15 + 0.1 * Math.sin(i * 0.4);
        }

        const barHeight = Math.max(4, height * 0.75 * amplitude);
        const y = centerY - barHeight / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        grad.addColorStop(0, '#c084fc');
        grad.addColorStop(0.5, '#9333ea');
        grad.addColorStop(1, '#581c87');

        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      if (isPlaying) {
        phase += 0.12;
      }
      animFrameRef.current = requestAnimationFrame(renderWave);
    };

    renderWave();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  const handleSelectPreset = (p: typeof PRESETS[0]) => {
    setPrompt(p.prompt);
    setGenre(p.genre);
    setTempo(p.tempo);
    setMood(p.mood);
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setStatusMessage('Connecting to Gemini Web audio engine...');

    const abort = new AbortController();
    abortControllerRef.current = abort;

    try {
      const res = await generateMusicViaBEI({
        prompt,
        genre,
        tempo,
        mood,
        isLoopable,
        accountSlot: selectedSlot,
        signal: abort.signal
      });

      if (res && res.audio) {
        const newTrack: AudioTrack = {
          id: res.jobId || `track_${Date.now()}`,
          name: `${genre} - ${mood} (${tempo} BPM)`,
          url: res.audio,
          prompt,
          genre,
          tempo,
          duration: 30,
          createdAt: Date.now()
        };

        setTracks(prev => [newTrack, ...prev]);
        setActiveTrack(newTrack);
        setIsPlaying(true);
        setStatusMessage('Track generated successfully!');

        // Save to asset library database
        try {
          await fetch('/api/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: newTrack.id,
              name: newTrack.name,
              prompt: newTrack.prompt,
              type: 'audio',
              imageUrl: newTrack.url
            })
          });
        } catch {}
      }
    } catch (err: any) {
      if (abort.signal.aborted) {
        setStatusMessage('Generation cancelled.');
      } else {
        setStatusMessage(`Error: ${err.message || String(err)}`);
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

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header Bar */}
      <div className="shrink-0 h-16 border-b border-slate-900 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-900/30">
            <i className="fa-solid fa-music text-base"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Game Music & Audio Studio
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">BEI Gemini Audio</span>
            </h1>
            <p className="text-xs text-slate-400">Generate adaptive soundtracks, loopable stage themes, and foley sound effects</p>
          </div>
        </div>

        {/* Global Controls */}
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

      {/* Main Studio Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-96 border-r border-slate-900 p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar shrink-0 bg-slate-950/70">
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-2">
              <i className="fa-solid fa-wand-magic-sparkles text-purple-400"></i>
              Game Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                    prompt === p.prompt
                      ? 'bg-purple-950/50 border-purple-500 text-purple-200 shadow-md shadow-purple-950/30'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{p.tempo} BPM • {p.genre}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between mb-2">
              <span>Track Prompt</span>
              <span className="text-[10px] text-slate-500 font-normal">Detailed description</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe the mood, instruments, rhythm, and game situation..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none transition-colors"
            />
          </div>

          {/* Musical Parameters */}
          <div className="space-y-3 bg-slate-900/30 border border-slate-800/80 p-3.5 rounded-xl">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-medium">Tempo (BPM)</span>
                <span className="text-purple-400 font-bold">{tempo} BPM</span>
              </div>
              <input
                type="range"
                min="60"
                max="180"
                step="5"
                value={tempo}
                onChange={(e) => setTempo(parseInt(e.target.value, 10))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Genre</label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Mood</label>
                <input
                  type="text"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-purple-500 outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isLoopable}
                onChange={(e) => setIsLoopable(e.target.checked)}
                className="rounded accent-purple-500 w-4 h-4"
              />
              <span className="text-xs text-slate-300">Seamless Loopable Track (Game Audio)</span>
            </label>
          </div>

          {/* Dispatch Button */}
          <div className="pt-2">
            {!isGenerating ? (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <i className="fa-solid fa-play"></i>
                Generate Audio Track
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

        {/* Right Player & Track Vault */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
          {/* Active Audio Player Card */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden mb-6">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500"></div>

            {/* Hidden HTML5 Audio Element */}
            {activeTrack && (
              <audio
                ref={audioRef}
                src={activeTrack.url}
                loop={isLoopable}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
              />
            )}

            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">Now Playing</span>
                <h2 className="text-lg font-bold text-white mt-1">
                  {activeTrack ? activeTrack.name : 'No Track Selected'}
                </h2>
                <p className="text-xs text-slate-400 max-w-xl truncate mt-0.5">
                  {activeTrack ? activeTrack.prompt : 'Generate an audio track or select one from history.'}
                </p>
              </div>

              {activeTrack && (
                <div className="flex items-center gap-2">
                  <a
                    href={activeTrack.url}
                    download={`mythic_audio_${activeTrack.id}.mp3`}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
                  >
                    <i className="fa-solid fa-download"></i>
                    Export Audio
                  </a>
                </div>
              )}
            </div>

            {/* Visualizer Canvas */}
            <div className="h-28 bg-slate-950/80 border border-slate-800/80 rounded-xl overflow-hidden relative mb-4">
              <canvas
                ref={canvasRef}
                width={800}
                height={112}
                className="w-full h-full block"
              />
            </div>

            {/* Progress & Controls Bar */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-10 text-right font-mono">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={!activeTrack}
                  className="flex-1 accent-purple-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="text-xs text-slate-400 w-10 font-mono">{formatTime(duration)}</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    disabled={!activeTrack}
                    className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center text-lg shadow-lg shadow-purple-900/40 transition-transform active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    <i className={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play pl-0.5'}`}></i>
                  </button>

                  <button
                    onClick={() => setIsLoopable(!isLoopable)}
                    className={`w-9 h-9 rounded-lg border text-xs flex items-center justify-center transition-colors ${
                      isLoopable ? 'bg-purple-500/20 border-purple-500 text-purple-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                    title="Toggle Loop"
                  >
                    <i className="fa-solid fa-repeat"></i>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-volume-high text-xs text-slate-400"></i>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-24 accent-purple-500 cursor-pointer h-1 bg-slate-800 rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Session Tracks History Vault */}
          <div>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <i className="fa-solid fa-list-music text-purple-400"></i>
              Generated Tracks ({tracks.length})
            </h3>

            {tracks.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                No audio tracks generated in this session yet. Choose a preset on the left and click "Generate Audio Track".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tracks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setActiveTrack(t);
                      setIsPlaying(true);
                      if (audioRef.current) {
                        audioRef.current.currentTime = 0;
                        setTimeout(() => audioRef.current?.play(), 100);
                      }
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      activeTrack?.id === t.id
                        ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-950/20'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        activeTrack?.id === t.id && isPlaying ? 'bg-purple-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'
                      }`}>
                        <i className={`fa-solid ${activeTrack?.id === t.id && isPlaying ? 'fa-volume-high' : 'fa-play'}`}></i>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-200 truncate">{t.name}</div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{t.prompt}</div>
                      </div>
                    </div>

                    <a
                      href={t.url}
                      download={`mythic_audio_${t.id}.mp3`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-400 hover:text-white p-2"
                      title="Download"
                    >
                      <i className="fa-solid fa-download text-xs"></i>
                    </a>
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
