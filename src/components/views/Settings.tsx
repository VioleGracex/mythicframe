import React, { useState, useEffect } from 'react';
import { GameContext, AIConfig, AIProvider, ArtStyle, AvailableModel, UIMode } from '../../types';
import { initDriveSystem, signInToDrive, signOutFromDrive, getDriveConnectionStatus } from '../../services/googleDriveService';
import { 
  getApiKeySource, setStoredApiKey, clearStoredApiKey, 
  fetchAvailableModels, getSelectedModel, setSelectedModel 
} from '../../services/geminiService';
import { getActiveAIProvider, setActiveAIProvider } from '../../services/aiProviderService';
import { getOpenAIApiKey, setOpenAIApiKey, testOpenAIConnection } from '../../services/openAIService';
import { getOpenCodeConfig, setOpenCodeConfig, testOpenCodeConnection, OpenCodeConfig } from '../../services/openCodeService';
import { 
  getBEIConfig, setBEIConfig, checkBEIConnection, openBEITab, scanBEIAccounts, 
  updateBEIAccountCustomInfo, BEIStatusResponse, DEFAULT_BEI_PORT,
  getBEIAccountPriorityOrder, setBEIAccountPriorityOrder, sortTabsByPriorityOrder, 
  getTabAccountKey, BEITabDetail,
  getDetectedHostBrowser, getEffectiveBEIBrowser 
} from '../../services/beiService';
import { getBEIAccountQuota, resetBEISlotCooldown } from '../../services/quotaTrackerService';
import { getIncognitoMode, setIncognitoMode, formatDisplayEmail } from '../../services/privacyService';
import { APP_VERSION } from '../../constants';
import { useLanguage } from '../../i18n/LanguageContext';

interface SettingsProps {
  gameContext: GameContext;
  setGameContext: React.Dispatch<React.SetStateAction<GameContext>>;
  apiKeyReady: boolean;
  onConnect: () => void;
  onRefreshKey?: () => void;
  driveFolderId?: string;
  setDriveFolderId?: (id: string) => void;
  driveFolderName?: string;
  setDriveFolderName?: (name: string) => void;
  onOpenFolderPicker?: () => void;
  allArtStyles?: ArtStyle[];
  onNavigate?: (mode: UIMode) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  gameContext, setGameContext, apiKeyReady, onConnect, onRefreshKey,
  driveFolderId, setDriveFolderId, driveFolderName, setDriveFolderName, onOpenFolderPicker,
  allArtStyles = [], onNavigate
}) => {
  const { language, setLanguage, t } = useLanguage();

  // Active AI Provider State
  const [activeProvider, setActiveProviderState] = useState<AIProvider>(() => getActiveAIProvider());
  const [configTab, setConfigTab] = useState<AIProvider>(() => getActiveAIProvider());
  const [settingsPageTab, setSettingsPageTab] = useState<'engines' | 'context' | 'drive'>('engines');

  // Gemini API Key State
  const [apiKeyInput, setApiKeyInput] = useState(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('mythic_gemini_api_key') || '') : '';
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<string | null>(null);
  const [keySource, setKeySource] = useState<'local' | 'env' | 'placeholder' | 'none'>('none');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // OpenAI State
  const [openAIKeyInput, setOpenAIKeyInput] = useState(() => getOpenAIApiKey());
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [openAIFeedback, setOpenAIFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingOpenAI, setIsTestingOpenAI] = useState(false);

  // OpenCode / Local AI State
  const [openCodeConfigState, setOpenCodeConfigState] = useState<OpenCodeConfig>(() => getOpenCodeConfig());
  const [openCodeFeedback, setOpenCodeFeedback] = useState<{ success: boolean; message: string; models?: string[] } | null>(null);
  const [isTestingOpenCode, setIsTestingOpenCode] = useState(false);
  const [showOpenCodeKey, setShowOpenCodeKey] = useState(false);

  // BEI (Browser Extension Interface) State
  const [beiConfigState, setBeiConfigState] = useState(() => getBEIConfig());
  const [beiStatus, setBeiStatus] = useState<BEIStatusResponse | null>(null);
  const [isCheckingBEI, setIsCheckingBEI] = useState(false);
  const [beiFeedback, setBeiFeedback] = useState<string | null>(null);
  const [extensionPathCopied, setExtensionPathCopied] = useState(false);
  const [isOpeningTab, setIsOpeningTab] = useState(false);
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);
  const [isIncognito, setIsIncognito] = useState(() => getIncognitoMode());
  const [accountPriorityOrder, setAccountPriorityOrder] = useState<string[]>(() => getBEIAccountPriorityOrder());

  useEffect(() => {
    const handleOrderChange = (e: any) => {
      if (Array.isArray(e?.detail)) {
        setAccountPriorityOrder(e.detail);
      }
    };
    window.addEventListener('mythic_bei_priority_order_changed', handleOrderChange);
    return () => window.removeEventListener('mythic_bei_priority_order_changed', handleOrderChange);
  }, []);

  // Model Discovery State
  const [discoveredModels, setDiscoveredModels] = useState<AvailableModel[]>(() => {
    try {
      const saved = localStorage.getItem('mythic_available_models');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  useEffect(() => {
    const handleIncognito = (e: any) => {
      setIsIncognito(typeof e?.detail === 'boolean' ? e.detail : getIncognitoMode());
    };
    window.addEventListener('mythic_incognito_mode_changed', handleIncognito);
    return () => window.removeEventListener('mythic_incognito_mode_changed', handleIncognito);
  }, []);

  const [isScanningModels, setIsScanningModels] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedActiveModel, setSelectedActiveModel] = useState<string>(() => getSelectedModel());
  const [scanCopied, setScanCopied] = useState(false);

  // Drive State
  const [driveClientId, setDriveClientId] = useState(localStorage.getItem('mythic_drive_client_id') || '');
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveStatus, setDriveStatus] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [originUrl, setOriginUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
        setOriginUrl(window.location.origin);
    }
    if (getDriveConnectionStatus()) {
        setDriveConnected(true);
    }
  }, []);

  const handleDriveInit = async () => {
    if (!driveClientId) {
      setDriveStatus('Please enter Client ID.');
      return;
    }
    
    setIsInitializing(true);
    setDriveStatus('Initializing...');
    try {
      localStorage.setItem('mythic_drive_client_id', driveClientId);
      
      await initDriveSystem(driveClientId);
      
      const connected = await signInToDrive();
      setDriveConnected(connected);
      setDriveStatus(connected ? 'Connected!' : 'Connection cancelled.');
    } catch (e: any) {
      console.error(e);
      setDriveStatus(`Error: ${e.message || e.error || 'Unknown error'}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleDriveDisconnect = async () => {
    await signOutFromDrive();
    setDriveConnected(false);
    setDriveStatus('Disconnected.');
  };

  const copyOrigin = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(originUrl);
    }
  };

  useEffect(() => {
    setKeySource(getApiKeySource());
    const stored = typeof window !== 'undefined' ? localStorage.getItem('mythic_gemini_api_key') : null;
    if (stored) {
      setApiKeyInput(stored);
    }
  }, [apiKeyReady]);

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    setIsSavingKey(true);
    try {
      if (!trimmed) {
        clearStoredApiKey();
        setApiKeyInput('');
        setKeyFeedback('Key cleared');
      } else {
        setStoredApiKey(trimmed);
        setKeyFeedback('Key saved successfully!');
      }

      // Sync to .env.local via backend endpoint
      try {
        await fetch('/api/config/gemini-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: trimmed })
        });
      } catch (err) {
        // Ignore background sync errors
      }

      setKeySource(getApiKeySource());
      if (onRefreshKey) {
        onRefreshKey();
      }
    } finally {
      setIsSavingKey(false);
      setTimeout(() => setKeyFeedback(null), 3500);
    }
  };

  const handleClearApiKey = async () => {
    clearStoredApiKey();
    setApiKeyInput('');
    setKeySource(getApiKeySource());
    setKeyFeedback('Custom key removed');

    try {
      await fetch('/api/config/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' })
      });
    } catch (err) {}

    if (onRefreshKey) {
      onRefreshKey();
    }
    setTimeout(() => setKeyFeedback(null), 3500);
  };

  const handleScanModels = async () => {
    setIsScanningModels(true);
    setScanError(null);
    try {
      const models = await fetchAvailableModels();
      setDiscoveredModels(models);
      localStorage.setItem('mythic_available_models', JSON.stringify(models));
      if (!selectedActiveModel && models.length > 0) {
        const defaultChoice = models.find(m => m.isImageModel)?.id || models[0].id;
        setSelectedActiveModel(defaultChoice);
        setSelectedModel(defaultChoice);
      }
    } catch (err: any) {
      setScanError(err?.message || String(err));
    } finally {
      setIsScanningModels(false);
    }
  };

  const handleSelectModelSetting = (id: string) => {
    setSelectedActiveModel(id);
    setSelectedModel(id);
  };

  const handleCopyScanError = () => {
    if (!scanError) return;
    navigator.clipboard.writeText(scanError);
    setScanCopied(true);
    setTimeout(() => setScanCopied(false), 2000);
  };

  const handleSelectActiveProvider = (prov: AIProvider) => {
    setActiveProviderState(prov);
    setActiveAIProvider(prov);
    setConfigTab(prov);
    if (onRefreshKey) onRefreshKey();
  };

  const handleSaveOpenAIKey = async () => {
    const trimmed = openAIKeyInput.trim();
    setOpenAIApiKey(trimmed);
    if (trimmed) {
      setIsTestingOpenAI(true);
      setOpenAIFeedback(null);
      try {
        const res = await testOpenAIConnection(trimmed);
        setOpenAIFeedback(res);
      } catch (err: any) {
        setOpenAIFeedback({ success: false, message: err?.message || 'Connection failed' });
      } finally {
        setIsTestingOpenAI(false);
      }
    } else {
      setOpenAIFeedback({ success: true, message: 'OpenAI key cleared.' });
    }
    if (onRefreshKey) onRefreshKey();
    setTimeout(() => setOpenAIFeedback(null), 4000);
  };

  const handleSaveOpenCodeConfig = async () => {
    setOpenCodeConfig(openCodeConfigState);
    setIsTestingOpenCode(true);
    setOpenCodeFeedback(null);
    try {
      const res = await testOpenCodeConnection(openCodeConfigState.baseUrl, openCodeConfigState.apiKey);
      setOpenCodeFeedback(res);
    } catch (err: any) {
      setOpenCodeFeedback({ success: false, message: err?.message || 'Connection failed' });
    } finally {
      setIsTestingOpenCode(false);
      if (onRefreshKey) onRefreshKey();
      setTimeout(() => setOpenCodeFeedback(null), 4000);
    }
  };

  const handleCheckBEI = async () => {
    setIsCheckingBEI(true);
    try {
      const res = await checkBEIConnection();
      setBeiStatus(res);
    } catch (e: any) {
      setBeiStatus({
        ready: false,
        connected: false,
        port: beiConfigState.port || DEFAULT_BEI_PORT,
        tabs: [],
        error: e.message
      });
    } finally {
      setIsCheckingBEI(false);
    }
  };

  const handleUpdateBEIConfig = (updates: Partial<typeof beiConfigState>) => {
    const next = { ...beiConfigState, ...updates };
    setBeiConfigState(next);
    setBEIConfig(next);
    setBeiFeedback('BEI configuration updated');
    setTimeout(() => setBeiFeedback(null), 3000);
    if (onRefreshKey) onRefreshKey();
  };

  const handleCopyExtensionPath = () => {
    const p = "D:\\GeminiWeb\\mythicframe\\bei-extension";
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(p);
      setExtensionPathCopied(true);
      setTimeout(() => setExtensionPathCopied(false), 2500);
    }
  };

  const handleResetCooldown = (target: 'gemini' | 'chatgpt', slot: number) => {
    resetBEISlotCooldown(target, slot);
    setQuotaRefreshKey(prev => prev + 1);
    setBeiFeedback(`Reset cooldown timer for slot ${slot + 1}`);
    setTimeout(() => setBeiFeedback(null), 3000);
  };

  const handleOpenBEITab = async (target?: 'gemini' | 'chatgpt', slot?: number) => {
    setIsOpeningTab(true);
    setBeiFeedback(null);
    try {
      const tgt = target || (beiConfigState.target as 'gemini' | 'chatgpt') || 'gemini';
      const s = slot !== undefined ? slot : (beiConfigState.accountSlot ?? 0);
      const success = await openBEITab(tgt, s, beiConfigState.tabMode, beiConfigState.bringTabToFront !== false);
      if (success) {
        setBeiFeedback(`Opening ${tgt === 'gemini' ? 'Gemini Web' : 'ChatGPT'} in Chrome...`);
        setTimeout(() => handleCheckBEI(), 2000);
      } else {
        setBeiFeedback('Could not trigger tab opening. Please verify BEI bridge and extension connection.');
      }
    } catch (err: any) {
      setBeiFeedback(`Error opening tab: ${err?.message || err}`);
    } finally {
      setIsOpeningTab(false);
      setTimeout(() => setBeiFeedback(null), 4000);
    }
  };

  const handleMovePriority = (idx: number, direction: 'up' | 'down') => {
    const currentTabs = sortTabsByPriorityOrder(beiStatus?.tabs || [], accountPriorityOrder);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentTabs.length) return;

    const reordered = [...currentTabs];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    const newOrder = reordered.map(t => getTabAccountKey(t));
    for (const k of accountPriorityOrder) {
      if (!newOrder.includes(k)) {
        newOrder.push(k);
      }
    }

    setAccountPriorityOrder(newOrder);
    setBEIAccountPriorityOrder(newOrder);
    setBeiFeedback(`Priority updated: #${targetIdx + 1} is now ${reordered[targetIdx].email || reordered[targetIdx].target}`);
    setTimeout(() => setBeiFeedback(null), 3000);
  };

  const handleSetActiveAccount = (tab: BEITabDetail) => {
    if (tab.target === 'gemini') {
      handleUpdateBEIConfig({ target: 'gemini', accountSlot: tab.accountSlot ?? 0 });
    } else {
      // Gemini is the main engine: clicking a ChatGPT account row must not silently switch every
      // future generation to ChatGPT. Use the explicit engine target toggle for that.
      setBeiFeedback('ChatGPT is used only when selected as the BEI engine target above.');
      setTimeout(() => setBeiFeedback(null), 3000);
    }
  };

  const isAutoRotate = beiConfigState.autoRotateOnQuota !== false;
  const handleToggleAutoRotate = () => {
    const next = !isAutoRotate;
    handleUpdateBEIConfig({ autoRotateOnQuota: next });
    setBeiFeedback(next ? 'Auto-failover on quota enabled' : 'Auto-failover on quota disabled');
    setTimeout(() => setBeiFeedback(null), 3000);
  };

  const handleAutoSortByQuota = () => {
    const currentTabs = beiStatus?.tabs || [];
    if (currentTabs.length <= 1) return;

    const sorted = [...currentTabs].sort((a, b) => {
      const quotaA = a.target === 'gemini' ? getBEIAccountQuota('gemini', a.accountSlot ?? 0) : getBEIAccountQuota('chatgpt', 0);
      const quotaB = b.target === 'gemini' ? getBEIAccountQuota('gemini', b.accountSlot ?? 0) : getBEIAccountQuota('chatgpt', 0);

      const isCoolA = quotaA.status === 'rate_limited';
      const isCoolB = quotaB.status === 'rate_limited';
      if (isCoolA !== isCoolB) return isCoolA ? 1 : -1;

      const remA = quotaA.dailyLimit - quotaA.callsToday;
      const remB = quotaB.dailyLimit - quotaB.callsToday;
      return remB - remA;
    });

    const newOrder = sorted.map(t => getTabAccountKey(t));
    for (const k of accountPriorityOrder) {
      if (!newOrder.includes(k)) {
        newOrder.push(k);
      }
    }

    setAccountPriorityOrder(newOrder);
    setBEIAccountPriorityOrder(newOrder);
    setBeiFeedback('Auto-sorted accounts by available quota!');
    setTimeout(() => setBeiFeedback(null), 3000);
  };

  const [isScanningAccounts, setIsScanningAccounts] = useState(false);

  const handleScanAccounts = async () => {
    setIsScanningAccounts(true);
    setBeiFeedback('Scanning logged-in Google accounts across Chrome slots /u/0 through /u/3...');
    try {
      const ok = await scanBEIAccounts();
      if (ok) {
        setTimeout(() => handleCheckBEI(), 1500);
        setTimeout(() => handleCheckBEI(), 3500);
        setTimeout(() => {
          setIsScanningAccounts(false);
          setBeiFeedback('Account scan completed! Logged-in Google accounts auto-detected.');
          setTimeout(() => setBeiFeedback(null), 4000);
        }, 4500);
      } else {
        setIsScanningAccounts(false);
        setBeiFeedback('Could not initiate account scan. Please ensure BEI Chrome extension is loaded.');
        setTimeout(() => setBeiFeedback(null), 4000);
      }
    } catch (e: any) {
      setIsScanningAccounts(false);
      setBeiFeedback(`Account scan failed: ${e?.message || e}`);
      setTimeout(() => setBeiFeedback(null), 4000);
    }
  };

  const handleEditAccount = async (slot: number) => {
    const acc = beiStatus?.accounts?.find(a => a.slot === slot);
    const currentVal = acc?.email || '';
    const newEmail = await showInAppPrompt(`Enter Google Account Email or label for Slot ${slot + 1} (/u/${slot}/):`, currentVal, { title: "Edit Account Label" });
    if (newEmail !== null) {
      updateBEIAccountCustomInfo(slot, { email: newEmail.trim(), name: newEmail.trim().split('@')[0] });
      handleCheckBEI();
    }
  };

  useEffect(() => {
    if (configTab === 'bei') {
      handleCheckBEI();
    }
  }, [configTab]);

  return (
    <div className="flex-1 bg-slate-950 p-10 overflow-y-auto">
       <div className="max-w-3xl mx-auto space-y-8">
          
          <div className="border-b border-slate-800 pb-4 flex justify-between items-start">
             <div>
               <h2 className="text-2xl font-bold text-white mb-1">{t('settings')}</h2>
               <p className="text-slate-400 text-sm">{t('settings_subtitle')}</p>
             </div>
             
             {/* Language Selector */}
             <div className="flex flex-col items-end">
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1">{t('language')}</label>
                <div className="flex bg-slate-900 rounded p-1 border border-slate-700">
                   <button 
                      onClick={() => setLanguage('en')} 
                      className={`px-3 py-1 text-xs rounded transition-colors ${language === 'en' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                   >
                      English
                   </button>
                   <button 
                      onClick={() => setLanguage('ru')} 
                      className={`px-3 py-1 text-xs rounded transition-colors ${language === 'ru' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                   >
                      Русский
                   </button>
                </div>
             </div>
          </div>

          {/* Primary Settings Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
             <button
                type="button"
                onClick={() => setSettingsPageTab('engines')}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                   settingsPageTab === 'engines'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
             >
                <i className="fa-solid fa-brain" />
                <span>AI Generation Engines</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/30">
                   {activeProvider}
                </span>
             </button>

             <button
                type="button"
                onClick={() => setSettingsPageTab('context')}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                   settingsPageTab === 'context'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
             >
                <i className="fa-solid fa-book" />
                <span>Game Context</span>
             </button>

             <button
                type="button"
                onClick={() => setSettingsPageTab('drive')}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                   settingsPageTab === 'drive'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
             >
                <i className="fa-brands fa-google-drive" />
                <span>Google Drive</span>
                {driveConnected && (
                   <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
             </button>
          </div>

          {/* Game Context Section */}
          {settingsPageTab === 'context' && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
             <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-900/30 flex items-center justify-center text-blue-400 shrink-0">
                   <i className="fa-solid fa-book" />
                </div>
                <div className="flex-1">
                   <h3 className="text-lg font-bold text-slate-200 mb-2">{t('game_context')}</h3>
                   <p className="text-sm text-slate-400 mb-4">
                      {t('context_desc')}
                   </p>
                   
                   <div className="space-y-4">
                       <div>
                          <label className="block text-xs uppercase font-bold text-slate-500 mb-1">{t('setting_world')}</label>
                          <textarea 
                            className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm h-24 text-slate-200 focus:border-blue-500 outline-none resize-none"
                            placeholder={t('setting_world_placeholder')}
                            value={gameContext.setting}
                            onChange={e => setGameContext(p => ({...p, setting: e.target.value}))}
                          />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs uppercase font-bold text-slate-500 mb-1">{t('tone_mood')}</label>
                              <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-200 focus:border-blue-500 outline-none"
                                placeholder={t('tone_mood_placeholder')}
                                value={gameContext.tone}
                                onChange={e => setGameContext(p => ({...p, tone: e.target.value}))}
                              />
                          </div>
                          <div>
                              <label className="block text-xs uppercase font-bold text-slate-500 mb-1">{t('visual_constraints')}</label>
                              <input 
                                className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-200 focus:border-blue-500 outline-none"
                                placeholder={t('visual_constraints_placeholder')}
                                value={gameContext.visualConstraints}
                                onChange={e => setGameContext(p => ({...p, visualConstraints: e.target.value}))}
                              />
                          </div>
                       </div>
                       <div>
                          <label className="block text-xs uppercase font-bold text-slate-500 mb-1">{t('default_global_style')}</label>
                          <select 
                            className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-200 focus:border-blue-500 outline-none"
                            value={gameContext.defaultStyleId || 'none'}
                            onChange={e => setGameContext(p => ({...p, defaultStyleId: e.target.value}))}
                          >
                            <option value="none">{t('default_style_none')}</option>
                            {allArtStyles.map(style => (
                              <option key={style.id} value={style.id}>{style.name}</option>
                            ))}
                          </select>
                          <p className="text-[10px] text-slate-500 mt-1 italic">{t('default_style_hint')}</p>
                       </div>
                   </div>
                </div>
             </div>
          </div>

          )}

          {/* AI GENERATION ENGINE & MULTI-PROVIDER HUB */}
          {settingsPageTab === 'engines' && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
             {/* Header */}
             <div className="p-6 border-b border-slate-800 bg-slate-900/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-900/30 flex items-center justify-center text-purple-400 shrink-0">
                         <i className="fa-solid fa-brain" />
                      </div>
                      <div>
                         <h3 className="text-lg font-bold text-slate-200">{t('ai_engines')}</h3>
                         <p className="text-sm text-slate-400">
                            {t('ai_engines_desc')}
                         </p>
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      {onNavigate && (
                         <button
                            type="button"
                            onClick={() => onNavigate('quota')}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                         >
                            <i className="fa-solid fa-gauge-high text-xs text-purple-400" /> {t('quota')}
                         </button>
                      )}
                      <span className="text-xs text-slate-400">{t('active_engine_label')}</span>
                      <span className="px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 font-bold text-xs uppercase tracking-wider border border-purple-500/30">
                         {activeProvider}
                      </span>
                   </div>
                </div>

                {/* Engine Selector Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-6">
                   <button
                      type="button"
                      onClick={() => setConfigTab('google')}
                      className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                         configTab === 'google' 
                            ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/50' 
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                   >
                      <div className="flex items-center justify-between mb-2">
                         <i className="fa-brands fa-google text-lg text-amber-400" />
                         {activeProvider === 'google' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Engine" />
                         )}
                      </div>
                      <div className="font-bold text-xs text-slate-200">Google Gemini</div>
                      <div className="text-[10px] text-slate-500">Flash & Pro Image</div>
                   </button>

                   <button
                      type="button"
                      onClick={() => setConfigTab('openai')}
                      className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                         configTab === 'openai' 
                            ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/50' 
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                   >
                      <div className="flex items-center justify-between mb-2">
                         <i className="fa-solid fa-robot text-lg text-emerald-400" />
                         {activeProvider === 'openai' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Engine" />
                         )}
                      </div>
                      <div className="font-bold text-xs text-slate-200">OpenAI</div>
                      <div className="text-[10px] text-slate-500">DALL-E 3 / ChatGPT</div>
                   </button>

                   <button
                      type="button"
                      onClick={() => setConfigTab('opencode')}
                      className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                         configTab === 'opencode' 
                            ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/50' 
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                   >
                      <div className="flex items-center justify-between mb-2">
                         <i className="fa-solid fa-server text-lg text-blue-400" />
                         {activeProvider === 'opencode' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Engine" />
                         )}
                      </div>
                      <div className="font-bold text-xs text-slate-200">OpenCode / Local</div>
                      <div className="text-[10px] text-slate-500">Ollama, LM Studio</div>
                   </button>

                   <button
                      type="button"
                      onClick={() => setConfigTab('pollinations')}
                      className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                         configTab === 'pollinations' 
                            ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/50' 
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                   >
                      <div className="flex items-center justify-between mb-2">
                         <i className="fa-solid fa-seedling text-lg text-pink-400" />
                         {activeProvider === 'pollinations' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Engine" />
                         )}
                      </div>
                      <div className="font-bold text-xs text-slate-200">Pollinations.ai</div>
                      <div className="text-[10px] text-emerald-400 font-semibold">100% Free / No Key</div>
                   </button>

                   <button
                      type="button"
                      onClick={() => setConfigTab('offline')}
                      className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                         configTab === 'offline' 
                            ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/50' 
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                   >
                      <div className="flex items-center justify-between mb-2">
                         <i className="fa-solid fa-clipboard-list text-lg text-amber-400" />
                         {activeProvider === 'offline' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Engine" />
                         )}
                      </div>
                      <div className="font-bold text-xs text-slate-200">Prompt Only</div>
                      <div className="text-[10px] text-amber-400 font-semibold">Copy & Paste Mode</div>
                   </button>

                   <button
                      type="button"
                      onClick={() => setConfigTab('bei')}
                      className={`p-3 rounded-lg border text-left transition-all relative flex flex-col justify-between ${
                         configTab === 'bei' 
                            ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/50' 
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                   >
                      <div className="flex items-center justify-between mb-2">
                         <i className="fa-solid fa-puzzle-piece text-lg text-purple-400" />
                         {activeProvider === 'bei' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Engine" />
                         )}
                      </div>
                      <div className="font-bold text-xs text-slate-200">BEI Mode</div>
                      <div className="text-[10px] text-purple-400 font-semibold">Browser Extension</div>
                   </button>
                </div>
             </div>

             {/* Tab Content Panel */}
             <div className="p-6">
                {/* Active Provider Switch Banner */}
                <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-lg border border-slate-800 mb-6">
                   <div className="text-xs text-slate-300">
                      Currently viewing config for: <b className="text-white capitalize">{configTab}</b>
                   </div>
                   {activeProvider !== configTab ? (
                      <button
                         type="button"
                         onClick={() => handleSelectActiveProvider(configTab)}
                         className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors shadow-sm flex items-center gap-1.5"
                      >
                         <i className="fa-solid fa-check" /> {t('set_as_active_engine')}
                      </button>
                   ) : (
                      <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                         <i className="fa-solid fa-circle-check" /> {t('this_is_active_engine')}
                      </div>
                   )}
                </div>

                {/* TAB 1: GOOGLE GEMINI */}
                {configTab === 'google' && (
                   <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <div>
                            <h4 className="font-bold text-slate-200 text-sm">Google Gemini Configuration</h4>
                            <p className="text-xs text-slate-400">
                               Powers dual-path Gemini 2.5/3.1 image generation and intelligent prompt expansion.
                            </p>
                         </div>
                         <div className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 border shrink-0 ${apiKeyReady ? 'bg-green-900/20 text-green-400 border-green-500/30' : 'bg-red-900/20 text-red-400 border-red-500/30'}`}>
                            <i className={`fa-solid ${apiKeyReady ? 'fa-check-circle' : 'fa-times-circle'}`} />
                            {apiKeyReady ? 'Key Ready' : 'Key Missing'}
                         </div>
                      </div>

                      {/* Key Source Status */}
                      {keySource === 'local' && (
                         <div className="text-xs text-green-400 flex items-center gap-2 bg-green-900/10 p-2.5 rounded border border-green-500/20">
                            <i className="fa-solid fa-database" /> Using custom API Key saved in browser local storage.
                         </div>
                      )}
                      {keySource === 'env' && (
                         <div className="text-xs text-blue-400 flex items-center gap-2 bg-blue-900/10 p-2.5 rounded border border-blue-500/20">
                            <i className="fa-solid fa-code" /> Connected via Environment Variable (.env.local / process.env.API_KEY).
                         </div>
                      )}
                      {keySource === 'placeholder' && (
                         <div className="text-xs text-amber-400 flex items-center gap-2 bg-amber-900/10 p-2.5 rounded border border-amber-500/20">
                            <i className="fa-solid fa-triangle-exclamation" /> Placeholder key detected in .env.local. Please enter your real Gemini API key below.
                         </div>
                      )}
                      {keySource === 'none' && !apiKeyReady && (
                         <div className="text-xs text-red-400 flex items-center gap-2 bg-red-900/10 p-2.5 rounded border border-red-500/20">
                            <i className="fa-solid fa-circle-exclamation" /> No API key configured. Enter your Gemini API key below or set GEMINI_API_KEY in .env.local.
                         </div>
                      )}

                      {/* API Key Input Form */}
                      <div className="space-y-2">
                         <label className="block text-xs uppercase font-bold text-slate-500">
                            Gemini API Key
                         </label>
                         <div className="flex gap-2">
                            <div className="relative flex-1">
                               <input 
                                 type={showApiKey ? "text" : "password"}
                                 value={apiKeyInput}
                                 onChange={(e) => setApiKeyInput(e.target.value)}
                                 placeholder="Paste your Gemini API key (AIzaSy...)"
                                 className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 pr-10 text-sm text-slate-200 font-mono focus:border-purple-500 outline-none"
                               />
                               <button
                                 type="button"
                                 onClick={() => setShowApiKey(!showApiKey)}
                                 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                                 title={showApiKey ? "Hide Key" : "Show Key"}
                               >
                                  <i className={`fa-solid ${showApiKey ? 'fa-eye-slash' : 'fa-eye'}`} />
                               </button>
                            </div>
                            <button
                              type="button"
                              disabled={isSavingKey}
                              onClick={handleSaveApiKey}
                              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
                            >
                               <i className="fa-solid fa-floppy-disk" /> {isSavingKey ? 'Saving...' : 'Save Key'}
                            </button>
                            {keySource === 'local' && (
                               <button
                                 type="button"
                                 onClick={handleClearApiKey}
                                 className="bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/30 px-3 py-2 rounded text-sm transition-colors shrink-0 cursor-pointer"
                                 title="Remove custom key from browser storage"
                               >
                                  <i className="fa-solid fa-trash" /> Clear
                               </button>
                            )}
                         </div>
                         
                         {keyFeedback && (
                            <p className="text-xs text-green-400 flex items-center gap-1.5 mt-1">
                               <i className="fa-solid fa-check" /> {keyFeedback}
                            </p>
                         )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
                         <a 
                           href="https://ai.google.dev/gemini-api/docs/api-key" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300"
                         >
                            <i className="fa-solid fa-arrow-up-right-from-square" /> Get API key from Google Gemini Developer Portal
                         </a>
                      </div>

                      {/* Model Scanner & Picker */}
                      <div className="pt-4 border-t border-slate-800">
                         <div className="flex items-center justify-between mb-3">
                            <h5 className="text-xs uppercase font-bold text-slate-400">Gemini Model Diagnostics</h5>
                            <button
                               onClick={handleScanModels}
                               disabled={isScanningModels}
                               className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-3 py-1.5 rounded transition-colors cursor-pointer"
                            >
                               <i className={`fa-solid fa-arrows-rotate ${isScanningModels ? 'animate-spin' : ''}`} />
                               <span>{isScanningModels ? 'Scanning...' : 'Scan Available Models'}</span>
                            </button>
                         </div>

                         {scanError && (
                            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-xs space-y-2 mb-3">
                               <div className="flex items-center justify-between text-red-300 font-bold">
                                  <span><i className="fa-solid fa-triangle-exclamation" /> API Scan Error</span>
                                  <button onClick={handleCopyScanError} className="text-xs text-red-300 hover:underline">
                                     {scanCopied ? 'Copied!' : 'Copy'}
                                  </button>
                               </div>
                               <div className="font-mono text-red-400 text-[11px] whitespace-pre-wrap break-all">
                                  {scanError}
                               </div>
                            </div>
                         )}

                         {discoveredModels.length > 0 && (
                            <div className="space-y-2">
                               <div className="relative">
                                  <select
                                     value={selectedActiveModel}
                                     onChange={(e) => handleSelectModelSetting(e.target.value)}
                                     className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:border-purple-500 outline-none cursor-pointer"
                                  >
                                     <option value="">Default (Auto / Gemini Flash)</option>
                                     {discoveredModels.filter(m => m.isImageModel).length > 0 && (
                                        <optgroup label="🎨 Image Generation Models">
                                           {discoveredModels.filter(m => m.isImageModel).map(m => (
                                              <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
                                           ))}
                                        </optgroup>
                                     )}
                                     {discoveredModels.filter(m => !m.isImageModel).length > 0 && (
                                        <optgroup label="⚡ Multimodal Models">
                                           {discoveredModels.filter(m => !m.isImageModel).map(m => (
                                              <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
                                           ))}
                                        </optgroup>
                                     )}
                                  </select>
                               </div>
                            </div>
                         )}
                      </div>
                   </div>
                )}

                {/* TAB 2: OPENAI */}
                {configTab === 'openai' && (
                   <div className="space-y-4">
                      <div>
                         <h4 className="font-bold text-slate-200 text-sm">OpenAI / ChatGPT Configuration</h4>
                         <p className="text-xs text-slate-400">
                            Generates images using OpenAI DALL-E 3 with standard and HD square, landscape, or portrait dimensions.
                         </p>
                      </div>

                      <div className="space-y-2">
                         <label className="block text-xs uppercase font-bold text-slate-500">
                            OpenAI API Key
                         </label>
                         <div className="flex gap-2">
                            <div className="relative flex-1">
                               <input 
                                 type={showOpenAIKey ? "text" : "password"}
                                 value={openAIKeyInput}
                                 onChange={(e) => setOpenAIKeyInput(e.target.value)}
                                 placeholder="Paste OpenAI Key (sk-...)"
                                 className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 pr-10 text-sm text-slate-200 font-mono focus:border-purple-500 outline-none"
                               />
                               <button
                                 type="button"
                                 onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                                 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                               >
                                  <i className={`fa-solid ${showOpenAIKey ? 'fa-eye-slash' : 'fa-eye'}`} />
                               </button>
                            </div>
                            <button
                              type="button"
                              disabled={isTestingOpenAI}
                              onClick={handleSaveOpenAIKey}
                              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
                            >
                               <i className={`fa-solid ${isTestingOpenAI ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
                               {isTestingOpenAI ? 'Testing...' : 'Save & Test'}
                            </button>
                         </div>

                         {openAIFeedback && (
                            <p className={`text-xs flex items-center gap-1.5 mt-1.5 ${openAIFeedback.success ? 'text-green-400' : 'text-red-400'}`}>
                               <i className={`fa-solid ${openAIFeedback.success ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />
                               {openAIFeedback.message}
                            </p>
                         )}
                      </div>

                      <div className="pt-2 text-xs">
                         <a 
                           href="https://platform.openai.com/api-keys" 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300"
                         >
                            <i className="fa-solid fa-arrow-up-right-from-square" /> Get OpenAI API Key from platform.openai.com
                         </a>
                      </div>
                   </div>
                )}

                {/* TAB 3: OPENCODE / LOCAL AI */}
                {configTab === 'opencode' && (
                   <div className="space-y-4">
                      <div>
                         <h4 className="font-bold text-slate-200 text-sm">OpenCode & Local AI Endpoints</h4>
                         <p className="text-xs text-slate-400">
                            Connect to OpenAI-compatible image endpoints such as Ollama, LocalAI, LM Studio, or vLLM.
                         </p>
                      </div>

                      <div className="space-y-3">
                         <div>
                            <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                               Endpoint Base URL
                            </label>
                            <input 
                              type="text"
                              value={openCodeConfigState.baseUrl}
                              onChange={(e) => setOpenCodeConfigState(p => ({ ...p, baseUrl: e.target.value }))}
                              placeholder="http://localhost:11434/v1"
                              className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 font-mono focus:border-purple-500 outline-none"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Default for Ollama is <code>http://localhost:11434/v1</code>, LocalAI is <code>http://localhost:8080/v1</code>.</p>
                         </div>

                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                               <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                                  Model Identifier
                               </label>
                               <input 
                                 type="text"
                                 value={openCodeConfigState.model}
                                 onChange={(e) => setOpenCodeConfigState(p => ({ ...p, model: e.target.value }))}
                                 placeholder="flux-schnell"
                                 className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 font-mono focus:border-purple-500 outline-none"
                               />
                            </div>
                            <div>
                               <label className="block text-xs uppercase font-bold text-slate-500 mb-1">
                                  Bearer API Key (Optional)
                               </label>
                               <div className="relative">
                                  <input 
                                    type={showOpenCodeKey ? "text" : "password"}
                                    value={openCodeConfigState.apiKey || ''}
                                    onChange={(e) => setOpenCodeConfigState(p => ({ ...p, apiKey: e.target.value }))}
                                    placeholder="Optional for local models"
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 pr-10 text-sm text-slate-200 font-mono focus:border-purple-500 outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowOpenCodeKey(!showOpenCodeKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                                  >
                                     <i className={`fa-solid ${showOpenCodeKey ? 'fa-eye-slash' : 'fa-eye'}`} />
                                  </button>
                               </div>
                            </div>
                         </div>

                         <button
                            type="button"
                            disabled={isTestingOpenCode}
                            onClick={handleSaveOpenCodeConfig}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded text-sm transition-colors flex items-center gap-2 cursor-pointer"
                         >
                            <i className={`fa-solid ${isTestingOpenCode ? 'fa-spinner fa-spin' : 'fa-network-wired'}`} />
                            {isTestingOpenCode ? 'Testing Connection...' : 'Save & Test Endpoint'}
                         </button>

                         {openCodeFeedback && (
                            <div className={`p-3 rounded text-xs space-y-1 ${openCodeFeedback.success ? 'bg-green-950/40 text-green-300 border border-green-500/30' : 'bg-red-950/40 text-red-300 border border-red-500/30'}`}>
                               <div className="font-bold flex items-center gap-1.5">
                                  <i className={`fa-solid ${openCodeFeedback.success ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />
                                  {openCodeFeedback.message}
                               </div>
                               {openCodeFeedback.models && openCodeFeedback.models.length > 0 && (
                                  <div className="text-[11px] text-slate-300 font-mono">
                                     Models detected: {openCodeFeedback.models.slice(0, 5).join(', ')} {openCodeFeedback.models.length > 5 ? `(+${openCodeFeedback.models.length - 5} more)` : ''}
                                  </div>
                               )}
                            </div>
                         )}
                      </div>
                   </div>
                )}

                {/* TAB 4: POLLINATIONS.AI (FREE) */}
                {configTab === 'pollinations' && (
                   <div className="space-y-4">
                      <div>
                         <h4 className="font-bold text-slate-200 text-sm">Pollinations.ai (Free Cloud Engine)</h4>
                         <p className="text-xs text-slate-400">
                            Zero setup required. Powered by the open-source Pollinations cloud network.
                         </p>
                      </div>

                      <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-4 space-y-3">
                         <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                            <i className="fa-solid fa-circle-check" /> 100% Free - Ready to Generate
                         </div>
                         <p className="text-xs text-slate-300">
                            Pollinations requires no API key, credit card, or account signup. It generates high quality illustrations and concepts instantly.
                         </p>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs text-slate-400">
                            <div className="bg-black/30 p-2 rounded border border-slate-800">
                               <b className="text-white block">No Quota Limits</b> Generate without worrying about API billing.
                            </div>
                            <div className="bg-black/30 p-2 rounded border border-slate-800">
                               <b className="text-white block">Fast & Simple</b> Perfect for rapid prototyping and game jams.
                            </div>
                            <div className="bg-black/30 p-2 rounded border border-slate-800">
                               <b className="text-white block">Aspect Ratios</b> Fully supports square, wide, and portrait framing.
                            </div>
                         </div>
                      </div>
                   </div>
                )}

                {/* TAB 5: OFFLINE / PROMPT ONLY */}
                {configTab === 'offline' && (
                   <div className="space-y-4">
                      <div>
                         <h4 className="font-bold text-slate-200 text-sm">Offline / Prompt-Only Mode</h4>
                         <p className="text-xs text-slate-400">
                            Generate assets anywhere by exporting fully assembled, parameterized prompts tailored for any AI platform.
                         </p>
                      </div>

                      <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-4 space-y-3">
                         <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                            <i className="fa-solid fa-copy" /> Direct Copy-Paste Workflow
                         </div>
                         <p className="text-xs text-slate-300">
                            When Prompt-Only mode is enabled, clicking "Generate" never triggers paid API calls. Instead, it instantly opens the <b>Prompt Inspector Modal</b> with ready-to-copy prompts formatted specifically for:
                         </p>
                         <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                            <div className="bg-black/40 p-2 rounded border border-slate-800 text-slate-300">
                               <span className="text-amber-400 font-bold block">Midjourney</span> Includes <code>--ar</code>, <code>--v 6.1</code>, <code>--s 250</code>
                            </div>
                            <div className="bg-black/40 p-2 rounded border border-slate-800 text-slate-300">
                               <span className="text-emerald-400 font-bold block">ChatGPT</span> Natural language instructions + DALL-E 3 parameters
                            </div>
                            <div className="bg-black/40 p-2 rounded border border-slate-800 text-slate-300">
                               <span className="text-purple-400 font-bold block">Stable Diff.</span> Positive prompt, negative prompt, CFG, sampler & steps
                            </div>
                            <div className="bg-black/40 p-2 rounded border border-slate-800 text-slate-300">
                               <span className="text-blue-400 font-bold block">JSON Export</span> Full metadata bundle for batch scripts & workflows
                            </div>
                         </div>
                         <p className="text-[11px] text-slate-400 italic pt-1">
                            💡 You can also toggle between AI Render and Prompt Only mode at any time using the toggle pill directly above the prompt bar.
                         </p>
                      </div>
                   </div>
                )}

                {/* TAB 6: BEI MODE (BROWSER EXTENSION INTERFACE) */}
                {configTab === 'bei' && (
                   <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <div>
                            <h4 className="font-bold text-slate-200 text-sm">BEI — Browser Extension Interface</h4>
                            <p className="text-xs text-slate-400">
                               Zero API keys, cards, or rate limits. Bridges directly into your logged-in Google Gemini or ChatGPT browser sessions.
                            </p>
                         </div>
                         <div className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 border shrink-0 ${beiStatus?.connected ? 'bg-green-900/20 text-green-400 border-green-500/30' : 'bg-amber-900/20 text-amber-400 border-amber-500/30'}`}>
                            <i className={`fa-solid ${beiStatus?.connected ? 'fa-check-circle' : 'fa-circle-exclamation'}`} />
                            {beiStatus?.connected ? 'Extension Connected' : 'Extension Offline'}
                         </div>
                      </div>

                      {/* Connection Diagnostic Card */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
                         <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400">
                                  <i className="fa-solid fa-network-wired text-sm" />
                               </div>
                               <div>
                                  <span className="text-xs font-bold text-slate-200">BEI Bridge Status</span>
                                  <div className="text-[11px] text-slate-400 font-mono">
                                     Bridge Port: <span className="text-purple-300 font-bold">{beiConfigState.port || DEFAULT_BEI_PORT}</span> | Studio Port: <span className="text-blue-300 font-bold">3488</span>
                                  </div>
                               </div>
                            </div>
                            <button
                               type="button"
                               onClick={handleCheckBEI}
                               disabled={isCheckingBEI}
                               className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                            >
                               <i className={`fa-solid ${isCheckingBEI ? 'animate-spin' : ''}`} />
                               {isCheckingBEI ? 'Probing...' : 'Probe Bridge'}
                            </button>
                         </div>

                         {/* Active Tabs Detected */}
                         <div className="space-y-2.5 pt-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                               <div className="flex items-center gap-2">
                                  <span className="text-[11px] uppercase tracking-wider font-bold text-slate-300">
                                     Detected Browser Sessions & Accounts
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-normal">
                                     (Priority Order for Generation & Auto-Failover)
                                  </span>
                               </div>
                               <div className="flex items-center gap-2">
                                  {beiStatus?.tabs && beiStatus.tabs.length > 0 && (
                                     <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        {beiStatus.tabs.length} tab{beiStatus.tabs.length > 1 ? 's' : ''} connected
                                     </span>
                                  )}
                               </div>
                            </div>

                            {/* Auto-Rotation & Reorder Controls Toolbar */}
                            <div className="flex flex-wrap items-center justify-between bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg text-xs gap-2 shadow-inner">
                               <div className="flex items-center gap-2">
                                  <button
                                     type="button"
                                     onClick={handleToggleAutoRotate}
                                     className={`px-2.5 py-1 rounded text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                                        isAutoRotate
                                           ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-sm'
                                           : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                                     }`}
                                     title="When active account hits daily limit or rate-limit cooldown, automatically fails over to the next priority account"
                                  >
                                     <i className={`fa-solid ${isAutoRotate ? 'fa-toggle-on text-sm' : 'fa-toggle-off text-sm'}`} />
                                     <span>Auto-Failover on Quota Limit: <b>{isAutoRotate ? 'ON' : 'OFF'}</b></span>
                                  </button>
                                  <span className="text-[11px] text-slate-400 hidden md:inline">
                                     Uses accounts in priority order if active account runs out of quota.
                                  </span>
                               </div>

                               <div className="flex items-center gap-2">
                                  <button
                                     type="button"
                                     onClick={handleAutoSortByQuota}
                                     className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
                                     title="Auto-ranks accounts: ready accounts with higher remaining quota placed on top"
                                  >
                                     <i className="fa-solid fa-arrow-down-wide-short text-[10px]" />
                                     <span>Auto-Sort by Available Quota</span>
                                  </button>
                               </div>
                            </div>

                            {beiStatus?.tabs && beiStatus.tabs.length > 0 ? (
                               <div className="space-y-2">
                                  {sortTabsByPriorityOrder(beiStatus.tabs, accountPriorityOrder).map((tab, idx, arr) => {
                                     const isSelected = beiConfigState.target === tab.target && (
                                        tab.target !== 'gemini' || (beiConfigState.accountSlot ?? 0) === (tab.accountSlot ?? 0)
                                     );
                                     const quota = tab.target === 'gemini' 
                                        ? getBEIAccountQuota('gemini', tab.accountSlot ?? 0)
                                        : getBEIAccountQuota('chatgpt', 0);
                                     const isCooldown = quota.status === 'rate_limited';

                                     return (
                                        <div 
                                           key={`${tab.tabId || idx}-${quotaRefreshKey}`} 
                                           className={`flex flex-wrap items-center justify-between p-2.5 rounded-lg border text-xs gap-2 transition-all ${
                                              isSelected 
                                                 ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/40 text-slate-100 shadow-sm' 
                                                 : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                                           }`}
                                        >
                                           <div className="flex items-center gap-2.5">
                                              {/* Move Up / Move Down buttons */}
                                              <div className="flex items-center gap-0.5">
                                                 <button
                                                    type="button"
                                                    disabled={idx === 0}
                                                    onClick={() => handleMovePriority(idx, 'up')}
                                                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-25 text-slate-300 hover:text-white text-[9px] flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed border border-slate-700/60"
                                                    title="Move up in priority"
                                                 >
                                                    <i className="fa-solid fa-chevron-up" />
                                                 </button>
                                                 <button
                                                    type="button"
                                                    disabled={idx === arr.length - 1}
                                                    onClick={() => handleMovePriority(idx, 'down')}
                                                    className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-25 text-slate-300 hover:text-white text-[9px] flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed border border-slate-700/60"
                                                    title="Move down in priority"
                                                 >
                                                    <i className="fa-solid fa-chevron-down" />
                                                 </button>
                                              </div>

                                              {/* Priority Rank Pill */}
                                              <div className="shrink-0">
                                                 {idx === 0 ? (
                                                    <span className="px-2 py-0.5 rounded bg-purple-900/60 border border-purple-400/50 text-purple-200 font-mono font-bold text-[10px] flex items-center gap-1 shadow-sm">
                                                       <i className="fa-solid fa-crown text-amber-400 text-[9px]" /> #1 Primary
                                                    </span>
                                                 ) : (
                                                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[10px]">
                                                       #{idx + 1} Fallback
                                                    </span>
                                                 )}
                                              </div>

                                              {/* Dot & Target Name */}
                                              <span className={`w-2 h-2 rounded-full shrink-0 ${isCooldown ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'}`} />
                                              <span className="font-semibold text-slate-200 capitalize flex items-center gap-1.5">
                                                 {tab.target === 'gemini' ? (
                                                    <i className="fa-brands fa-google text-amber-400 text-xs" />
                                                 ) : (
                                                    <i className="fa-solid fa-robot text-emerald-400 text-xs" />
                                                 )}
                                                 {tab.target} Web
                                              </span>

                                              {tab.email ? (
                                                 <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-mono font-medium flex items-center gap-1 max-w-[210px] truncate">
                                                    <i className="fa-solid fa-envelope text-[10px]" />
                                                    {isIncognito ? formatDisplayEmail(tab.email, true) : tab.email}
                                                 </span>
                                              ) : (
                                                 <span className="text-[10px] text-cyan-400 font-mono italic">Account scanning...</span>
                                              )}

                                              {tab.target === 'gemini' && (
                                                 <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                                    /u/{tab.accountSlot ?? 0}/
                                                 </span>
                                              )}
                                           </div>

                                           <div className="flex items-center gap-2">
                                              {/* Real-time Quota Status Pill */}
                                              <div className="font-mono text-[10px]">
                                                 {isCooldown ? (
                                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300">
                                                       <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                                       <span>Cooldown {quota.cooldownRemainingMinutes}m</span>
                                                       <button
                                                          type="button"
                                                          onClick={(e) => {
                                                             e.stopPropagation();
                                                             handleResetCooldown(tab.target as any, tab.accountSlot ?? 0);
                                                          }}
                                                          className="text-[9px] text-rose-300 hover:text-white underline ml-1 cursor-pointer"
                                                          title="Clear rate-limit cooldown"
                                                       >
                                                          Reset
                                                       </button>
                                                    </div>
                                                 ) : quota.status === 'high_usage' ? (
                                                    <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300">
                                                       🟡 {quota.callsToday}/{quota.dailyLimit} reqs
                                                    </span>
                                                 ) : (
                                                    <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                                                       🟢 Ready ({quota.callsToday}/{quota.dailyLimit})
                                                    </span>
                                                 )}
                                              </div>

                                              {/* Set Active / Active Status */}
                                              {isSelected ? (
                                                 <span className="px-2.5 py-1 rounded bg-purple-600/30 text-purple-300 border border-purple-500/50 font-bold text-[11px] flex items-center gap-1">
                                                    <i className="fa-solid fa-check text-[10px]" /> Active
                                                 </span>
                                              ) : (
                                                 <button
                                                    type="button"
                                                    onClick={() => handleSetActiveAccount(tab)}
                                                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-purple-600/70 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
                                                    title="Select as primary active session"
                                                 >
                                                    Use Account
                                                 </button>
                                              )}

                                              {/* Open / Focus Tab */}
                                              <button
                                                 type="button"
                                                 onClick={() => handleOpenBEITab(tab.target as any, tab.accountSlot)}
                                                 disabled={isOpeningTab}
                                                 className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
                                                 title="Focus or re-open this tab in Chrome"
                                              >
                                                 <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
                                              </button>
                                           </div>
                                        </div>
                                     );
                                  })}
                               </div>
                            ) : (
                               <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-xs text-amber-300/90 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                     <i className="fa-solid fa-triangle-exclamation text-amber-400 text-sm" />
                                     <span>No Gemini or ChatGPT tabs open yet. Tabs will open automatically on generation!</span>
                                  </div>
                                  <button
                                     type="button"
                                     onClick={() => handleOpenBEITab(beiConfigState.target, beiConfigState.accountSlot ?? 0)}
                                     disabled={isOpeningTab}
                                     className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                                  >
                                     Open Tab Now
                                  </button>
                               </div>
                            )}
                         </div>
                      </div>

                      {/* Active Account Summary Card */}
                      <div className="bg-slate-900/90 border border-purple-500/30 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
                         <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-300 text-sm shrink-0">
                               <i className="fa-solid fa-user-check" />
                            </div>
                            <div>
                               <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                  <span>Active Session:</span>
                                  {beiConfigState.target === 'gemini' ? (
                                     <span className="text-purple-300 font-mono bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-500/30">
                                        Google Gemini Web
                                     </span>
                                  ) : (
                                     <span className="text-emerald-300 font-mono bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                        ChatGPT Web
                                     </span>
                                  )}
                               </div>
                               <div className="text-[11px] text-slate-300 font-mono mt-1 flex items-center gap-1.5">
                                  <i className="fa-solid fa-envelope text-slate-400" />
                                  {(() => {
                                     const activeTab = beiStatus?.tabs?.find(t => 
                                        t.target === beiConfigState.target && 
                                        (beiConfigState.target !== 'gemini' || (t.accountSlot ?? 0) === (beiConfigState.accountSlot ?? 0))
                                     );
                                     const acc = beiStatus?.accounts?.find(a => a.slot === (beiConfigState.accountSlot ?? 0));
                                     const rawEmail = activeTab?.email || acc?.email;
                                     const displayEmail = rawEmail ? formatDisplayEmail(rawEmail, isIncognito) : null;
                                     return displayEmail ? (
                                        <span className="text-emerald-400 font-semibold">{displayEmail}</span>
                                     ) : (
                                        <span className="text-amber-400/90 italic">
                                           Slot {beiConfigState.accountSlot ?? 0} (Tab auto-opens in Chrome on generation)
                                        </span>
                                     );
                                  })()}
                               </div>
                            </div>
                         </div>
                         <button
                            type="button"
                            onClick={() => handleOpenBEITab(beiConfigState.target, beiConfigState.accountSlot ?? 0)}
                            disabled={isOpeningTab}
                            className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                         >
                            <i className={`fa-solid ${isOpeningTab ? 'fa-spinner fa-spin' : 'fa-arrow-up-right-from-square'}`} />
                            {isOpeningTab ? 'Opening...' : 'Open Tab in Chrome'}
                         </button>
                      </div>

                      {/* Incognito / Streamer Mode Card */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex items-center justify-between gap-4">
                         <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                               <i className={`fa-solid ${isIncognito ? 'fa-eye-slash text-amber-400' : 'fa-eye text-cyan-400'} text-xs`} />
                               <span className="text-xs font-bold text-slate-200">Incognito / Streamer Mode</span>
                               <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                  isIncognito 
                                     ? 'bg-amber-950/60 text-amber-300 border-amber-500/40' 
                                     : 'bg-slate-900 text-slate-400 border-slate-700'
                               }`}>
                                  {isIncognito ? 'MASKED' : 'VISIBLE'}
                               </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                               Masks Google account emails across the studio UI (e.g. <code>{formatDisplayEmail('example.creator@gmail.com', true)}</code>) for privacy during streams and video recordings. Real connected accounts remain fully functional.
                            </p>
                         </div>
                         <button
                            type="button"
                            onClick={() => {
                               const next = !isIncognito;
                               setIncognitoMode(next);
                               setIsIncognito(next);
                            }}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-all border shrink-0 cursor-pointer flex items-center gap-1.5 ${
                               isIncognito
                                  ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-sm'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                         >
                            <i className={`fa-solid ${isIncognito ? 'fa-toggle-on text-sm' : 'fa-toggle-off text-sm'}`} />
                            <span>{isIncognito ? 'Enabled' : 'Disabled'}</span>
                         </button>
                      </div>

                      {/* Target Engine Selector */}
                      <div className="space-y-3">
                         <label className="block text-xs uppercase font-bold text-slate-400">
                            Active BEI Target Web App
                         </label>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ target: 'gemini' })}
                               className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                  beiConfigState.target === 'gemini'
                                     ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/30'
                                     : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                               }`}
                            >
                               <i className="fa-brands fa-google text-2xl text-amber-400 shrink-0 mt-0.5" />
                               <div className="flex-1">
                                  <div className="font-bold text-xs text-slate-200 flex items-center justify-between">
                                     <span>Google Gemini Web</span>
                                     {beiConfigState.target === 'gemini' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-1">
                                     Uses <code>gemini.google.com</code>. Supports multi-account slots and fast high-res generation.
                                  </div>
                               </div>
                            </button>

                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ target: 'chatgpt' })}
                               className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                  beiConfigState.target === 'chatgpt'
                                     ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-950/30'
                                     : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                               }`}
                            >
                               <i className="fa-solid fa-robot text-2xl text-emerald-400 shrink-0 mt-0.5" />
                               <div className="flex-1">
                                  <div className="font-bold text-xs text-slate-200 flex items-center justify-between">
                                     <span>ChatGPT Web (DALL-E)</span>
                                     {beiConfigState.target === 'chatgpt' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-1">
                                     Uses <code>chatgpt.com</code>. Generates high-fidelity artwork via your ChatGPT session.
                                  </div>
                               </div>
                            </button>
                         </div>
                      </div>

                      {/* Gemini Account Slot Selector */}
                      {beiConfigState.target === 'gemini' && (
                         <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                               <div>
                                  <label className="block text-xs uppercase font-bold text-slate-300">
                                     Select Active Google Account (Email Dropdown)
                                  </label>
                                  <span className="text-[11px] text-slate-500">Pick your logged-in Google Account by email address</span>
                               </div>
                               <div className="flex items-center gap-2">
                                  <button
                                     type="button"
                                     onClick={handleScanAccounts}
                                     disabled={isScanningAccounts}
                                     className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 text-xs font-semibold border border-purple-500/40 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                                     title="Probe slots /u/0 through /u/3 in background and auto-detect your logged-in Google accounts"
                                  >
                                     <i className={`fa-solid ${isScanningAccounts ? 'fa-spinner fa-spin' : 'fa-radar'}`} />
                                     {isScanningAccounts ? 'Scanning Slots...' : 'Auto-Detect All Accounts'}
                                  </button>
                                  {(() => {
                                     const geminiTabs = beiStatus?.tabs?.filter(t => t.target === 'gemini') || [];
                                     const activeTab = geminiTabs.find(t => (t.accountSlot ?? 0) === (beiConfigState.accountSlot ?? 0));
                                     return activeTab?.email ? (
                                        <span className="text-xs px-2.5 py-1 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-mono font-medium flex items-center gap-1.5">
                                           <i className="fa-solid fa-envelope text-emerald-400" />
                                           Active: <b>{activeTab.email}</b>
                                        </span>
                                     ) : null;
                                  })()}
                               </div>
                            </div>

                            {/* Dropdown with Email Names - ALWAYS includes all 4 slots */}
                            <div className="relative">
                               <select
                                  value={String(beiConfigState.accountSlot ?? 0)}
                                  onChange={(e) => handleUpdateBEIConfig({ accountSlot: parseInt(e.target.value, 10) })}
                                  className="w-full bg-slate-950 border border-purple-500/50 rounded-lg p-2.5 pr-10 text-sm text-slate-200 font-mono focus:border-purple-400 outline-none appearance-none cursor-pointer"
                               >
                                  {[0, 1, 2, 3].map(slot => {
                                     const geminiTabs = beiStatus?.tabs?.filter(t => t.target === 'gemini') || [];
                                     const tab = geminiTabs.find(t => (t.accountSlot ?? 0) === slot);
                                     const acc = beiStatus?.accounts?.find(a => a.slot === slot);
                                     const rawEmail = tab?.email || acc?.email;
                                     const displayEmail = rawEmail 
                                        ? (isIncognito ? formatDisplayEmail(rawEmail, true) : rawEmail)
                                        : null;
                                     const name = acc?.name && acc.name !== rawEmail ? acc.name : null;
                                     const hasTab = Boolean(tab);

                                     return (
                                        <option key={`slot-${slot}`} value={String(slot)} className="bg-[#121927] text-slate-200 py-1">
                                           {displayEmail 
                                              ? `📧 ${displayEmail} ${name ? `(${name})` : ''} • Slot ${slot + 1} ${hasTab ? '[Tab Open]' : ''}`
                                              : `📧 Slot ${slot + 1} (/u/${slot}/) • [Auto-opens on generate]`}
                                        </option>
                                     );
                                  })}
                               </select>
                               <i className="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none text-xs" />
                            </div>

                            {/* Account Slot Cards with Real-Time Quota Metrics */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                               {[0, 1, 2, 3].map(slot => {
                                  const slotTab = beiStatus?.tabs?.find(t => t.target === 'gemini' && (t.accountSlot ?? 0) === slot);
                                  const accountFromList = beiStatus?.accounts?.find(a => a.slot === slot);
                                  const rawEmail = slotTab?.email || accountFromList?.email;
                                  const email = rawEmail ? (isIncognito ? formatDisplayEmail(rawEmail, true) : rawEmail) : null;
                                  const isSelected = (beiConfigState.accountSlot ?? 0) === slot;
                                  const slotQuota = getBEIAccountQuota('gemini', slot);
                                  const isRateLimited = slotQuota.status === 'rate_limited';

                                  return (
                                     <div
                                        key={`${slot}-${quotaRefreshKey}`}
                                        className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                                           isSelected
                                              ? 'bg-purple-950/60 text-white border-purple-500 shadow-sm shadow-purple-950/40 ring-1 ring-purple-500/50'
                                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                     >
                                        <div className="w-full text-left">
                                           <div className="flex items-center justify-between w-full font-mono font-bold text-xs mb-1">
                                              <button
                                                 type="button"
                                                 onClick={() => handleUpdateBEIConfig({ accountSlot: slot as number })}
                                                 className="truncate max-w-[110px] hover:text-white cursor-pointer text-left"
                                              >
                                                 {accountFromList?.name || (rawEmail ? rawEmail.split('@')[0] : `Account ${slot + 1}`)}
                                              </button>
                                              <div className="flex items-center gap-1">
                                                 <button
                                                    type="button"
                                                    onClick={() => handleEditAccount(slot)}
                                                    className="text-slate-500 hover:text-purple-300 text-[10px] cursor-pointer p-0.5"
                                                    title="Set custom email or label"
                                                 >
                                                    <i className="fa-solid fa-pen-to-square" />
                                                 </button>
                                                 {slotTab ? (
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Tab Open in Chrome" />
                                                 ) : (
                                                    <span className="text-[9px] text-slate-600 font-sans shrink-0">Ready</span>
                                                 )}
                                              </div>
                                           </div>
                                           <button
                                              type="button"
                                              onClick={() => handleUpdateBEIConfig({ accountSlot: slot as number })}
                                              className="text-[11px] font-mono truncate text-slate-400 mb-2 block w-full text-left cursor-pointer"
                                           >
                                              {email || 'Auto-opens on generate'}
                                           </button>
                                        </div>

                                        {/* Real-time Quota & Rate Limit Indicator */}
                                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                                           <span className="text-slate-400">
                                              {slotQuota.callsToday}/{slotQuota.dailyLimit} reqs
                                           </span>
                                           {isRateLimited ? (
                                              <div className="flex items-center gap-1.5">
                                                 <span className="text-rose-400 font-bold flex items-center gap-0.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                                    {slotQuota.cooldownRemainingMinutes}m
                                                 </span>
                                                 <button
                                                    type="button"
                                                    onClick={(e) => {
                                                       e.stopPropagation();
                                                       handleResetCooldown('gemini', slot);
                                                    }}
                                                    className="px-1.5 py-0.5 bg-rose-950 hover:bg-rose-900 border border-rose-600/50 rounded text-rose-300 text-[9px] cursor-pointer"
                                                    title="Clear rate-limit cooldown"
                                                 >
                                                    Reset
                                                 </button>
                                              </div>
                                           ) : slotQuota.status === 'high_usage' ? (
                                              <span className="text-amber-400 font-medium">🟡 High</span>
                                           ) : (
                                              <span className="text-emerald-400 font-medium">🟢 Ready</span>
                                           )}
                                        </div>
                                     </div>
                                  );
                               })}
                            </div>
                            <div className="flex items-center justify-between pt-1">
                               <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                  <i className="fa-solid fa-link text-purple-400 text-[10px]" />
                                  <span>Bridges to active Google account in Chrome</span>
                               </p>
                               <button
                                  type="button"
                                  onClick={() => handleOpenBEITab('gemini', beiConfigState.accountSlot ?? 0)}
                                  disabled={isOpeningTab}
                                  className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer font-medium"
                               >
                                  <i className="fa-solid fa-plus text-[10px]" /> Open selected account in Chrome
                               </button>
                            </div>
                         </div>
                      )}

                      {/* Target Browser Routing */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                               <i className="fa-solid fa-compass text-purple-400 text-sm" />
                               <div>
                                  <span className="text-xs font-bold text-slate-200">Target Browser Routing</span>
                                  <p className="text-[11px] text-slate-400">Select which browser executes BEI requests when multiple browsers are open.</p>
                               </div>
                            </div>
                            {beiStatus?.connectedBrowsers && beiStatus.connectedBrowsers.length > 0 && (
                               <div className="flex items-center gap-1.5 flex-wrap">
                                  {beiStatus.connectedBrowsers.map((b) => (
                                     <span
                                        key={b.browser}
                                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/70 border border-purple-500/40 text-purple-300 font-medium flex items-center gap-1 shadow-sm"
                                        title={`${b.browserName} (${b.count} extension socket${b.count > 1 ? 's' : ''})`}
                                     >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span>{b.browserName}</span>
                                     </span>
                                  ))}
                               </div>
                            )}
                         </div>

                         <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ preferredBrowser: 'auto' })}
                               className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  (beiConfigState.preferredBrowser || 'auto') === 'auto'
                                     ? 'bg-purple-950/50 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-sm'
                                     : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                               }`}
                            >
                               <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                  <span>Auto (Same Browser)</span>
                                  {(beiConfigState.preferredBrowser || 'auto') === 'auto' && (
                                     <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                  )}
                               </div>
                               <p className="text-[10px] text-slate-400">
                                  Auto-match host ({getDetectedHostBrowser()})
                               </p>
                            </button>

                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ preferredBrowser: 'chrome' })}
                               className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  beiConfigState.preferredBrowser === 'chrome'
                                     ? 'bg-purple-950/50 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-sm'
                                     : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                               }`}
                            >
                               <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                  <span className="flex items-center gap-1"><i className="fa-brands fa-chrome text-amber-400" /> Chrome</span>
                                  {beiConfigState.preferredBrowser === 'chrome' && (
                                     <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                  )}
                               </div>
                               <p className="text-[10px] text-slate-400">
                                  Always route to Google Chrome
                               </p>
                            </button>

                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ preferredBrowser: 'brave' })}
                               className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  beiConfigState.preferredBrowser === 'brave'
                                     ? 'bg-purple-950/50 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-sm'
                                     : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                               }`}
                            >
                               <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                  <span className="flex items-center gap-1"><i className="fa-solid fa-shield text-orange-400" /> Brave</span>
                                  {beiConfigState.preferredBrowser === 'brave' && (
                                     <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                  )}
                               </div>
                               <p className="text-[10px] text-slate-400">
                                  Always route to Brave Browser
                               </p>
                            </button>

                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ preferredBrowser: 'edge' })}
                               className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  beiConfigState.preferredBrowser === 'edge'
                                     ? 'bg-purple-950/50 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-sm'
                                     : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                               }`}
                            >
                               <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                  <span className="flex items-center gap-1"><i className="fa-brands fa-edge text-cyan-400" /> Edge</span>
                                  {beiConfigState.preferredBrowser === 'edge' && (
                                     <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                  )}
                               </div>
                               <p className="text-[10px] text-slate-400">
                                  Always route to Microsoft Edge
                               </p>
                            </button>
                         </div>
                      </div>

                      {/* Browser Tab & Window Placement Settings */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-4">
                         <div className="flex items-center gap-2">
                            <i className="fa-solid fa-window-restore text-purple-400 text-sm" />
                            <div>
                               <span className="text-xs font-bold text-slate-200">Chrome Tab & Window Placement</span>
                               <p className="text-[11px] text-slate-400">Control where and how generation tabs open in Google Chrome.</p>
                            </div>
                         </div>

                         {/* Tab Mode Radio Options */}
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ tabMode: 'same_window_group' })}
                               className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                                  (beiConfigState.tabMode || 'same_window_group') === 'same_window_group'
                                     ? 'bg-purple-950/50 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-sm'
                                     : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                               }`}
                            >
                               <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                  <span>Group in Same Window</span>
                                  {(beiConfigState.tabMode || 'same_window_group') === 'same_window_group' && (
                                     <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                  )}
                               </div>
                               <p className="text-[10px] text-slate-400 leading-relaxed">
                                  Keeps all generation tabs inside 1 single purple Chrome tab group named <b>"MythicFrame BEI"</b> in your current window.
                               </p>
                            </button>

                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ tabMode: 'new_window_group' })}
                               className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                                  beiConfigState.tabMode === 'new_window_group'
                                     ? 'bg-purple-950/50 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-sm'
                                     : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                               }`}
                            >
                               <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                  <span>Dedicated New Window</span>
                                  {beiConfigState.tabMode === 'new_window_group' && (
                                     <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                  )}
                               </div>
                               <p className="text-[10px] text-slate-400 leading-relaxed">
                                  Creates a separate dedicated Chrome window grouping all generation sessions together.
                               </p>
                            </button>

                            <button
                               type="button"
                               onClick={() => handleUpdateBEIConfig({ tabMode: 'background_tab' })}
                               className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                                  beiConfigState.tabMode === 'background_tab'
                                     ? 'bg-purple-950/50 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-sm'
                                     : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                               }`}
                            >
                               <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                  <span>Background Tab (Ungrouped)</span>
                                  {beiConfigState.tabMode === 'background_tab' && (
                                     <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                  )}
                               </div>
                               <p className="text-[10px] text-slate-400 leading-relaxed">
                                  Standard tabs without automatic grouping.
                               </p>
                            </button>
                         </div>

                         {/* Bring Tab to Front Toggle */}
                         <label className="flex items-center gap-2.5 p-2.5 rounded bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                            <input
                               type="checkbox"
                               checked={Boolean(beiConfigState.bringTabToFront)}
                               onChange={(e) => handleUpdateBEIConfig({ bringTabToFront: e.target.checked })}
                               className="w-4 h-4 rounded text-purple-600 bg-slate-950 border-slate-700 focus:ring-purple-500 cursor-pointer"
                            />
                            <div className="text-xs">
                               <span className="font-bold text-slate-200">Focus tab on generation (Bring window to front)</span>
                               <p className="text-[10px] text-slate-400">
                                  When enabled, Chrome activates the generation tab and focuses the window so you can watch prompts and image generation live. When disabled, tabs run in the background.
                               </p>
                            </div>
                         </label>

                         {/* Chat Lifecycle / Account Clutter Prevention */}
                         <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between">
                               <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                  <i className="fa-solid fa-clock-rotate-left text-purple-400" />
                                  Chat Lifecycle & History Retention
                                </label>
                                <span className="text-[10px] text-purple-400/80 font-mono bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/40">
                                   No Account Overflow
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                               Prevent overflowing your Google / OpenAI accounts with dozens of one-off chat threads:
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ chatSessionMode: 'temporary_chat' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     (beiConfigState.chatSessionMode || 'temporary_chat') === 'temporary_chat'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-bolt text-amber-400 text-[10px]" /> Temporary Chat (Default)
                                     </span>
                                     {(beiConfigState.chatSessionMode || 'temporary_chat') === 'temporary_chat' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     Reuses conversation while holding images; starts fresh temporary session per tab to keep account sidebar pristine.
                                  </p>
                               </button>

                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ chatSessionMode: 'same_chat' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     beiConfigState.chatSessionMode === 'same_chat'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-comments text-blue-400 text-[10px]" /> Same Chat Thread
                                     </span>
                                     {beiConfigState.chatSessionMode === 'same_chat' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     Always keeps the same conversation thread active across prompts without reloading.
                                  </p>
                               </button>

                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ chatSessionMode: 'new_chat' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     beiConfigState.chatSessionMode === 'new_chat'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-plus text-emerald-400 text-[10px]" /> New Chat
                                     </span>
                                     {beiConfigState.chatSessionMode === 'new_chat' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     Forces a brand new conversation thread for every single generation request.
                                  </p>
                               </button>
                            </div>
                         </div>

                         {/* Image Download Quality & Fetch Strategy */}
                         <div className="space-y-3 pt-3 border-t border-slate-800/80">
                            <div className="flex items-center justify-between">
                               <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                  <i className="fa-solid fa-file-image text-purple-400" />
                                  Image Fetch & Download Quality
                               </label>
                               <span className="text-[10px] text-purple-300 font-mono bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/50">
                                  Original Fidelity
                               </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                               Choose how BEI extracts and saves generated artwork from your browser session to disk:
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ downloadQuality: 'ultra_original' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     (beiConfigState.downloadQuality || 'ultra_original') === 'ultra_original'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-crown text-amber-400 text-[10px]" /> Ultra Master (Recommended)
                                     </span>
                                     {(beiConfigState.downloadQuality || 'ultra_original') === 'ultra_original' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     Extracts raw original uncompressed master asset (=s0 full-res CDN or native download trigger). Zero compression loss.
                                  </p>
                               </button>

                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ downloadQuality: 'high' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     beiConfigState.downloadQuality === 'high'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-high-definition text-cyan-400 text-[10px]" /> High Quality (2K)
                                     </span>
                                     {beiConfigState.downloadQuality === 'high' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     Fetches 2048px upgraded web asset (=s2048). Great balance of speed and high clarity.
                                  </p>
                               </button>

                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ downloadQuality: 'standard' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     beiConfigState.downloadQuality === 'standard'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-gauge text-slate-400 text-[10px]" /> Standard Preview
                                     </span>
                                     {beiConfigState.downloadQuality === 'standard' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     Fastest extraction. Directly grabs the active in-chat web element viewport preview (~1024px).
                                  </p>
                               </button>
                            </div>

                            {/* AI Quality Prompting Strategy */}
                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                               <div>
                                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                     <i className="fa-solid fa-brain text-purple-400" />
                                     AI Agent Prompting Behavior
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                     How the AI assistant in chat should handle image quality preferences:
                                  </p>
                               </div>
                               <div className="flex items-center gap-2">
                                  <button
                                     type="button"
                                     onClick={() => handleUpdateBEIConfig({ askQualityPreference: 'once' })}
                                     className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-all ${
                                        (beiConfigState.askQualityPreference || 'once') === 'once'
                                           ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                                           : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                     }`}
                                  >
                                     Remember Choice
                                  </button>
                                  <button
                                     type="button"
                                     onClick={() => handleUpdateBEIConfig({ askQualityPreference: 'always' })}
                                     className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-all ${
                                        beiConfigState.askQualityPreference === 'always'
                                           ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                                           : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                     }`}
                                  >
                                     Ask on Each One
                                  </button>
                               </div>
                            </div>
                         </div>

                         {/* Multi-Account & Multi-Tab Parallel Dispatch */}
                         <div className="space-y-3 pt-3 border-t border-slate-800/80">
                            <div className="flex items-center justify-between">
                               <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                  <i className="fa-solid fa-layer-group text-purple-400" />
                                  Account Dispatch & Parallel Tab Execution
                               </label>
                               <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                  (beiConfigState.accountDispatchMode || 'single') === 'multi'
                                     ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
                                     : 'bg-purple-950/60 text-purple-300 border-purple-800/50'
                               }`}>
                                  {(beiConfigState.accountDispatchMode || 'single') === 'multi' ? 'Multi-Account (Parallel)' : 'Single Account (Dedicated)'}
                               </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                               Controls what happens when an account tab is busy during queued generations or batch image jobs:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ accountDispatchMode: 'single' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     (beiConfigState.accountDispatchMode || 'single') === 'single'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-user text-blue-400 text-[10px]" /> 1 Account (Single Dedicated)
                                     </span>
                                     {(beiConfigState.accountDispatchMode || 'single') === 'single' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     All images queue on your selected account slot. Sequential generation; keeps history in one thread.
                                  </p>
                               </button>

                               <button
                                  type="button"
                                  onClick={() => handleUpdateBEIConfig({ accountDispatchMode: 'multi' })}
                                  className={`p-2.5 rounded-lg border text-left transition-all ${
                                     beiConfigState.accountDispatchMode === 'multi'
                                        ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/30'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                  }`}
                               >
                                  <div className="flex items-center justify-between font-bold text-xs text-slate-200 mb-1">
                                     <span className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-users text-emerald-400 text-[10px]" /> Multi-Account (Multi-Tab Parallel)
                                     </span>
                                     {beiConfigState.accountDispatchMode === 'multi' && (
                                        <i className="fa-solid fa-circle-check text-purple-400 text-xs" />
                                     )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                     If current account tab is busy, automatically dispatches to idle Google accounts in parallel across multiple tabs.
                                  </p>
                               </button>
                            </div>

                            {/* AI Account Dispatch Prompting Behavior */}
                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                               <div>
                                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                     <i className="fa-solid fa-brain text-purple-400" />
                                     AI Agent Multi-Account Prompting
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                     How the AI assistant should ask before batching or generating:
                                  </p>
                               </div>
                               <div className="flex items-center gap-2">
                                  <button
                                     type="button"
                                     onClick={() => handleUpdateBEIConfig({ askAccountDispatchPreference: 'once' })}
                                     className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-all ${
                                        (beiConfigState.askAccountDispatchPreference || 'once') === 'once'
                                           ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                                           : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                     }`}
                                  >
                                     Remember Choice
                                  </button>
                                  <button
                                     type="button"
                                     onClick={() => handleUpdateBEIConfig({ askAccountDispatchPreference: 'always' })}
                                     className={`px-2.5 py-1.5 rounded text-xs font-semibold border transition-all ${
                                        beiConfigState.askAccountDispatchPreference === 'always'
                                           ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                                           : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                     }`}
                                  >
                                     Ask on Each One
                                  </button>
                               </div>
                            </div>
                         </div>
                      </div>

                      {/* Quick-Launch & Auto-Open Notice */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
                         <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <i className="fa-solid fa-bolt text-purple-400" />
                            <span>Auto-open is active: If no tab is open when you generate, MythicFrame will open it automatically.</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <button
                               type="button"
                               onClick={() => handleOpenBEITab('gemini', beiConfigState.accountSlot ?? 0)}
                               disabled={isOpeningTab}
                               className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                               <i className="fa-brands fa-google text-amber-400" /> Open Gemini
                            </button>
                            <button
                               type="button"
                               onClick={() => handleOpenBEITab('chatgpt')}
                               disabled={isOpeningTab}
                               className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                               <i className="fa-solid fa-robot text-emerald-400" /> Open ChatGPT
                            </button>
                         </div>
                      </div>

                      {/* Setup Guide */}
                      <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-4 space-y-3">
                         <div className="text-xs font-bold text-purple-300 flex items-center gap-2">
                            <i className="fa-solid fa-puzzle-piece" /> How to Load the MythicFrame BEI Extension in Chrome
                         </div>
                         <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside">
                            <li>Open Google Chrome and navigate to <code className="text-purple-300 font-mono">chrome://extensions/</code></li>
                            <li>Enable <b>Developer mode</b> toggle in the top-right corner.</li>
                            <li>Click <b>Load unpacked</b> and select the MythicFrame extension directory:</li>
                         </ol>
                         <div className="flex items-center gap-2 bg-slate-950 p-2 rounded border border-slate-800 text-xs font-mono text-slate-300">
                            <span className="flex-1 truncate">D:\GeminiWeb\mythicframe\bei-extension</span>
                            <button
                               type="button"
                               onClick={handleCopyExtensionPath}
                               className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-sans font-semibold shrink-0 transition-colors cursor-pointer"
                            >
                               {extensionPathCopied ? 'Copied!' : 'Copy Path'}
                            </button>
                         </div>
                      </div>

                      {beiFeedback && (
                         <p className="text-xs text-green-400 flex items-center gap-1.5">
                            <i className="fa-solid fa-check" /> {beiFeedback}
                         </p>
                      )}
                   </div>
                )}
             </div>
          </div>

          )}

          {/* Google Drive Section */}
          {settingsPageTab === 'drive' && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
             <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-900/30 flex items-center justify-center text-green-500 shrink-0">
                   <i className="fa-brands fa-google-drive" />
                </div>
                <div className="flex-1">
                   <h3 className="text-lg font-bold text-slate-200 mb-2">{t('drive_integration')}</h3>
                   <p className="text-sm text-slate-400 mb-4">
                      Save generated assets directly to a Google Drive folder.
                      <br/>
                      <span className="text-slate-500 text-xs mt-1 block">
                        Requires a Google Cloud Project with the <b>Google Drive API</b> enabled.
                        <br/>
                        You only need to provide a Client ID. No API Key required.
                      </span>
                      <a 
                        href="https://console.cloud.google.com/apis/credentials" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mt-3 border border-blue-500/30 bg-blue-900/20 px-3 py-1.5 rounded transition-colors"
                      >
                         <i className="fa-solid fa-arrow-up-right-from-square" /> Get Client ID
                      </a>
                   </p>
                   
                   {!driveConnected ? (
                      <div className="space-y-4">
                         
                         {/* Config Helper for User */}
                         <div className="bg-slate-800/50 rounded border border-slate-700 p-3 text-xs">
                             <div className="text-slate-300 font-bold mb-1 flex items-center gap-2">
                                <i className="fa-solid fa-circle-info text-blue-400"/> Google Console Configuration
                             </div>
                             <p className="text-slate-500 mb-2">
                                When creating your "Web application" credential, copy this URL into <b>Authorized JavaScript origins</b>:
                             </p>
                             <div className="flex gap-2 items-start">
                                <code className="flex-1 bg-black/30 border border-slate-700 rounded px-2 py-1.5 font-mono text-green-400 break-all whitespace-normal select-all">
                                   {originUrl}
                                </code>
                                <button onClick={copyOrigin} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded transition-colors shrink-0 h-full">
                                   Copy
                                </button>
                             </div>
                             <p className="text-slate-600 mt-2 italic">
                                Note: You can leave <b>Authorized redirect URIs</b> blank.
                             </p>
                         </div>

                         <div>
                             <label className="block text-xs uppercase font-bold text-slate-500 mb-1">Client ID</label>
                             <input 
                                type="text"
                                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:border-green-500 outline-none"
                                placeholder="...apps.googleusercontent.com"
                                value={driveClientId}
                                onChange={(e) => setDriveClientId(e.target.value)}
                             />
                         </div>
                         <button 
                            onClick={handleDriveInit}
                            disabled={isInitializing}
                            className="bg-white hover:bg-slate-200 text-slate-900 px-4 py-2 rounded font-bold text-sm shadow-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                         >
                            <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" className="w-4 h-4" />
                            {isInitializing ? 'Connecting...' : 'Sign in with Google'}
                         </button>
                      </div>
                   ) : (
                      <div className="bg-green-900/10 border border-green-500/20 rounded p-4 space-y-4">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
                                <i className="fa-solid fa-check-circle" /> Connected to Drive
                             </div>
                             <button onClick={handleDriveDisconnect} className="text-xs text-slate-500 hover:text-red-400 underline">Disconnect</button>
                          </div>
                          
                          <div className="space-y-2">
                             <label className="block text-xs uppercase font-bold text-slate-500">Destination Folder</label>
                             <div className="flex gap-2">
                                <div className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-300 flex items-center gap-2">
                                   <i className="fa-regular fa-folder" />
                                   {driveFolderName || 'Default (MythicFrame Exports)'}
                                </div>
                                <button 
                                   onClick={onOpenFolderPicker}
                                   className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded text-xs font-bold transition-colors"
                                >
                                   Change
                                </button>
                             </div>
                          </div>
                      </div>
                   )}
                   
                   {driveStatus && !driveConnected && (
                      <div className={`text-xs mt-2 ${driveStatus.includes('Error') ? 'text-red-400' : 'text-slate-400'}`}>
                         {driveStatus}
                      </div>
                   )}
                </div>
             </div>
          </div>

          )}

          <div className="mt-12 pt-6 border-t border-slate-900 text-center">
             <p className="text-xs text-slate-600 font-mono">MythicFrame v{APP_VERSION}</p>
          </div>

       </div>
    </div>
  );
};

export default Settings;