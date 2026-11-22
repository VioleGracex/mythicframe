import { AIProvider, AIConfig, AspectRatio, ImageSize, ReferenceAsset, BackgroundConfig, GameContext, UIMode, FrameElement, BackgroundPatternType, SafeZoneConfig, ClothesParams, ChibiProportion, ChibiConfig, PoseData, MapGridConfig, SpriteStripConfig, CharacterToolState } from '../types';
import { generateIllustration, editImage, checkApiKey as checkGeminiApiKey } from './geminiService';
import { generateOpenAIImage, getOpenAIApiKey } from './openAIService';
import { generateOpenCodeImage, getOpenCodeConfig } from './openCodeService';
import { generatePollinationsImage, getPollinationsModel } from './pollinationsService';
import { trackApiCall, estimateModelCost } from './quotaTrackerService';
import { generateWithBEI, checkBEIConnection } from './beiService';
import { assembleFullMythicPrompt } from './promptTemplates';

const PROVIDER_STORAGE_KEY = 'mythic_active_ai_provider';

export const getActiveAIProvider = (): AIProvider => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(PROVIDER_STORAGE_KEY) as AIProvider;
    if (saved && ['google', 'openai', 'opencode', 'openrouter', 'pollinations', 'offline', 'custom', 'bei'].includes(saved)) {
      return saved;
    }
  }
  return 'google';
};

export const setActiveAIProvider = (provider: AIProvider): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    window.dispatchEvent(new CustomEvent('mythic_ai_provider_changed', { detail: provider }));
  }
};

export const isProviderReady = async (provider: AIProvider): Promise<boolean> => {
  switch (provider) {
    case 'bei':
      return (await checkBEIConnection()).ready;
    case 'google':
      return await checkGeminiApiKey();
    case 'openai':
      return Boolean(getOpenAIApiKey());
    case 'opencode':
      return Boolean(getOpenCodeConfig().baseUrl);
    case 'pollinations':
      return true; // No key required
    case 'offline':
      return true; // No API needed, copies prompt
    default:
      return false;
  }
};

export interface UnifiedGenerationParams {
  prompt: string;
  model: string;
  size: ImageSize;
  aspectRatio: AspectRatio;
  referenceAssets: ReferenceAsset[];
  bgConfig: BackgroundConfig;
  gameContext: GameContext;
  signal: AbortSignal;
  styleSnippet: string;
  mode: UIMode;
  frameElements: FrameElement[];
  bgPatternType: BackgroundPatternType;
  safeZone?: SafeZoneConfig;
  clothesParams?: ClothesParams;
  continuityFlags?: Record<string, boolean>;
  chibiProportion?: ChibiProportion;
  chibiConfig?: ChibiConfig;
  poseData?: PoseData;
  mapGridConfig?: MapGridConfig;
  spriteStripConfig?: SpriteStripConfig;
  viewpoint?: string;
  noCharacters?: boolean;
  framing?: 'full-body' | 'waist-up' | 'bust' | 'head-only';
  seed?: number | null;
  chatSessionMode?: 'temporary_chat' | 'same_chat' | 'new_chat';
  tabSessionId?: string;
  /** Optional explicit project id; BEI starts a new chat when a tab switches projects. */
  projectId?: string;
  hasHoldingImages?: boolean;
  characterTool?: CharacterToolState;
}

export const generateWithActiveProvider = async (
  params: UnifiedGenerationParams,
  providerOverride?: AIProvider
): Promise<{ image: string; metadata: any }> => {
  const provider = providerOverride || getActiveAIProvider();
  const startTime = performance.now();
  const modelName = params.model || (provider === 'openai' ? 'dall-e-3' : provider === 'google' ? 'gemini-3.1-flash-image' : 'flux-schnell');

  try {
    let result: { image: string; metadata: any };

    switch (provider) {
      case 'openai': {
        const assembled = assembleFullMythicPrompt(params);
        const image = await generateOpenAIImage(assembled.sanitizedPrompt, params.aspectRatio);
        result = {
          image,
          metadata: { fullPrompt: assembled.fullPrompt, provider: 'openai' }
        };
        break;
      }

      case 'opencode': {
        const assembled = assembleFullMythicPrompt(params);
        const image = await generateOpenCodeImage(assembled.sanitizedPrompt, params.aspectRatio);
        result = {
          image,
          metadata: { fullPrompt: assembled.fullPrompt, provider: 'opencode' }
        };
        break;
      }

      case 'pollinations': {
        const assembled = assembleFullMythicPrompt(params);
        const image = await generatePollinationsImage(assembled.sanitizedPrompt, params.aspectRatio, params.seed, params.model);
        result = {
          image,
          metadata: { fullPrompt: assembled.fullPrompt, provider: 'pollinations' }
        };
        break;
      }

      case 'bei': {
        result = await generateWithBEI(params);
        break;
      }

      case 'google':
      default: {
        result = await generateIllustration(
          params.prompt,
          params.model,
          params.size,
          params.aspectRatio,
          params.referenceAssets,
          params.bgConfig,
          params.gameContext,
          params.signal,
          params.styleSnippet,
          params.mode,
          params.frameElements,
          params.bgPatternType,
          params.safeZone,
          params.clothesParams,
          params.continuityFlags,
          params.chibiProportion,
          params.chibiConfig,
          params.poseData,
          params.mapGridConfig,
          params.viewpoint,
          params.noCharacters,
          params.framing,
          params.seed,
          params.spriteStripConfig,
          params.characterTool
        );
        break;
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);
    const estimatedCost = estimateModelCost(provider, modelName);

    trackApiCall({
      provider,
      model: modelName,
      status: 'success',
      latencyMs,
      estimatedCost,
      promptSnippet: params.prompt.slice(0, 100)
    });

    return result;
  } catch (error: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    const isRateLimited = Boolean(
      error?.message?.includes('429') ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.message?.includes('quota') ||
      error?.status === 429
    );

    trackApiCall({
      provider,
      model: modelName,
      status: isRateLimited ? 'rate_limited' : 'error',
      latencyMs,
      estimatedCost: 0,
      promptSnippet: params.prompt.slice(0, 100),
      errorMessage: error?.message || String(error)
    });

    throw error;
  }
};

export interface UnifiedEditParams {
  base64Image: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  bgConfig?: BackgroundConfig;
  gameContext?: GameContext;
  referenceAssets?: ReferenceAsset[];
  signal?: AbortSignal;
  model?: string;
}

export const editWithActiveProvider = async (
  params: UnifiedEditParams,
  providerOverride?: AIProvider
): Promise<string> => {
  const provider = providerOverride || getActiveAIProvider();
  const startTime = performance.now();
  const modelName = params.model || (provider === 'openai' ? 'dall-e-3' : provider === 'google' ? 'gemini-3.1-flash-image' : getPollinationsModel());

  try {
    let resultImage: string;

    switch (provider) {
      case 'openai': {
        resultImage = await generateOpenAIImage(params.prompt, params.aspectRatio || '1:1');
        break;
      }

      case 'opencode': {
        resultImage = await generateOpenCodeImage(params.prompt, params.aspectRatio || '1:1');
        break;
      }

      case 'pollinations': {
        resultImage = await generatePollinationsImage(
          params.prompt,
          params.aspectRatio || '1:1',
          undefined,
          params.model || getPollinationsModel()
        );
        break;
      }

      case 'bei': {
        const beiResult = await generateWithBEI({
          prompt: params.prompt,
          model: modelName,
          size: '1K',
          aspectRatio: params.aspectRatio || '1:1',
          referenceAssets: params.referenceAssets || [],
          bgConfig: params.bgConfig || ({} as any),
          gameContext: params.gameContext || { setting: '', tone: '', visualConstraints: '' },
          signal: params.signal || new AbortController().signal,
          styleSnippet: '',
          mode: 'illustration',
          frameElements: [],
          bgPatternType: 'scene',
        });
        resultImage = beiResult.image;
        break;
      }

      case 'offline': {
        throw new Error('Prompt-Only Mode: Image editing is not supported in offline mode.');
      }

      case 'google':
      default: {
        const hasKey = await checkGeminiApiKey();
        if (!hasKey) {
          throw new Error('Gemini API Key Required: Google image editing requires an active Gemini API key. Switch to Pollinations.ai or BEI Mode in the AI Engine card, or add your key in Settings.');
        }
        resultImage = await editImage(
          params.base64Image,
          params.prompt,
          params.bgConfig,
          params.gameContext || { setting: '', tone: '', visualConstraints: '' },
          params.referenceAssets || []
        );
        break;
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);
    trackApiCall({
      provider,
      model: modelName,
      status: 'success',
      latencyMs,
      estimatedCost: estimateModelCost(provider, modelName),
      promptSnippet: params.prompt.slice(0, 100)
    });

    return resultImage;
  } catch (error: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    trackApiCall({
      provider,
      model: modelName,
      status: 'error',
      latencyMs,
      estimatedCost: 0,
      promptSnippet: params.prompt.slice(0, 100),
      errorMessage: error?.message || String(error)
    });

    throw error;
  }
};
