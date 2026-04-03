import modelCatalog from './models.json';
import {
  DEFAULT_GENERATION_LIMITS,
  DEFAULT_TOP_K,
  DEFAULT_TOP_P,
  MAX_TOP_K,
  MAX_TOP_P,
  MIN_TOP_K,
  MIN_TOP_P,
  MIN_TOKEN_LIMIT,
  TEMPERATURE_STEP,
  TOKEN_STEP,
  TOP_K_STEP,
  TOP_P_STEP,
  clamp,
  normalizeGenerationLimits,
  quantizeTemperature,
  quantizeTopKInput,
  quantizeTopPInput,
} from './generation-config.js';

export {
  DEFAULT_GENERATION_LIMITS,
  DEFAULT_TOP_K,
  DEFAULT_TOP_P,
  MAX_TOP_K,
  MAX_TOP_P,
  MIN_TOP_K,
  MIN_TOP_P,
  MIN_TOKEN_LIMIT,
  TEMPERATURE_STEP,
  TOKEN_STEP,
  TOP_K_STEP,
  TOP_P_STEP,
  clamp,
  normalizeGenerationLimits,
  quantizeTemperature,
  quantizeTopKInput,
  quantizeTopPInput,
};
export const MODEL_FEATURE_FLAGS = Object.freeze([
  'streaming',
  'thinking',
  'toolCalling',
  'imageInput',
  'audioInput',
  'videoInput',
]);
export const ALLOWED_RUNTIME_DTYPES = Object.freeze(new Set(['q4', 'q4f16', 'q8', 'fp16', 'fp32']));
export const WEBGPU_COMPATIBLE_BACKEND_PREFERENCES = Object.freeze(new Set(['auto', 'webgpu']));
export const ALLOWED_TOOL_CALLING_FORMATS = Object.freeze(
  new Set(['json', 'tagged-json', 'special-token-call', 'xml-tool-call', 'gemma-special-token-call'])
);
export const ALLOWED_THINKING_RUNTIME_PARAMETERS = Object.freeze(new Set(['enable_thinking']));

function normalizeRuntimeDtype(rawDtype) {
  if (typeof rawDtype === 'string' && ALLOWED_RUNTIME_DTYPES.has(rawDtype.trim())) {
    return rawDtype.trim();
  }
  if (!rawDtype || typeof rawDtype !== 'object' || Array.isArray(rawDtype)) {
    return null;
  }
  const entries = Object.entries(rawDtype)
    .map(([key, value]) => {
      const normalizedKey = typeof key === 'string' ? key.trim() : '';
      const normalizedValue = typeof value === 'string' ? value.trim() : '';
      if (!normalizedKey || !ALLOWED_RUNTIME_DTYPES.has(normalizedValue)) {
        return null;
      }
      return [normalizedKey, normalizedValue];
    })
    .filter(Boolean);
  return entries.length ? Object.fromEntries(entries) : null;
}

function normalizeRuntime(rawRuntime) {
  const dtype = normalizeRuntimeDtype(rawRuntime?.dtype);
  const enableThinking = rawRuntime?.enableThinking === true;
  const requiresWebGpu = rawRuntime?.requiresWebGpu === true;
  const multimodalGeneration = rawRuntime?.multimodalGeneration === true;
  const useExternalDataFormat =
    rawRuntime?.useExternalDataFormat === true ||
    (Number.isInteger(rawRuntime?.useExternalDataFormat) && rawRuntime.useExternalDataFormat > 0)
      ? rawRuntime.useExternalDataFormat
      : false;
  return {
    ...(dtype ? { dtype } : {}),
    ...(enableThinking ? { enableThinking: true } : {}),
    ...(requiresWebGpu ? { requiresWebGpu: true } : {}),
    ...(multimodalGeneration ? { multimodalGeneration: true } : {}),
    ...(useExternalDataFormat ? { useExternalDataFormat } : {}),
  };
}

function normalizeHiddenFlag(rawHidden) {
  return rawHidden === true;
}

function normalizeModelCardText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeRepositoryUrl(rawUrl, fallbackId) {
  const fallback = fallbackId ? `https://huggingface.co/${fallbackId}` : '';
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return fallback;
  }
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function normalizeLanguageSupport(rawLanguageSupport) {
  if (!rawLanguageSupport || typeof rawLanguageSupport !== 'object' || Array.isArray(rawLanguageSupport)) {
    return null;
  }
  const tags = Array.isArray(rawLanguageSupport.tags)
    ? rawLanguageSupport.tags
        .map((tag) => {
          if (!tag || typeof tag !== 'object' || Array.isArray(tag)) {
            return null;
          }
          const code = normalizeModelCardText(tag.code).toUpperCase();
          const name = normalizeModelCardText(tag.name);
          if (!code || !name || code.length !== 2) {
            return null;
          }
          return { code, name };
        })
        .filter(Boolean)
    : [];
  const sourceUrl = normalizeRepositoryUrl(rawLanguageSupport.sourceUrl, '');
  const hasMore = rawLanguageSupport.hasMore === true;
  if (!tags.length && !sourceUrl) {
    return null;
  }
  return {
    tags,
    ...(hasMore ? { hasMore: true } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function normalizeToolCalling(rawToolCalling, { enabled = false } = {}) {
  if (!enabled || !rawToolCalling || typeof rawToolCalling !== 'object' || Array.isArray(rawToolCalling)) {
    return null;
  }
  const format =
    typeof rawToolCalling.format === 'string' && ALLOWED_TOOL_CALLING_FORMATS.has(rawToolCalling.format.trim())
      ? rawToolCalling.format.trim()
      : '';
  if (!format) {
    return null;
  }
  if (format === 'json') {
    const nameKey = typeof rawToolCalling.nameKey === 'string' ? rawToolCalling.nameKey.trim() : '';
    const argumentsKey =
      typeof rawToolCalling.argumentsKey === 'string' ? rawToolCalling.argumentsKey.trim() : '';
    return nameKey && argumentsKey
      ? {
          format,
          nameKey,
          argumentsKey,
        }
      : null;
  }
  if (format === 'tagged-json') {
    const nameKey = typeof rawToolCalling.nameKey === 'string' ? rawToolCalling.nameKey.trim() : '';
    const argumentsKey =
      typeof rawToolCalling.argumentsKey === 'string' ? rawToolCalling.argumentsKey.trim() : '';
    const openTag = typeof rawToolCalling.openTag === 'string' ? rawToolCalling.openTag.trim() : '';
    const closeTag = typeof rawToolCalling.closeTag === 'string' ? rawToolCalling.closeTag.trim() : '';
    return nameKey && argumentsKey && openTag && closeTag && openTag !== closeTag
      ? {
          format,
          nameKey,
          argumentsKey,
          openTag,
          closeTag,
        }
      : null;
  }
  if (format === 'xml-tool-call' || format === 'gemma-special-token-call') {
    return { format };
  }
  const callOpen = typeof rawToolCalling.callOpen === 'string' ? rawToolCalling.callOpen.trim() : '';
  const callClose = typeof rawToolCalling.callClose === 'string' ? rawToolCalling.callClose.trim() : '';
  return callOpen && callClose && callOpen !== callClose
    ? {
        format,
        callOpen,
        callClose,
      }
    : null;
}

function normalizePositiveIntegerLimit(value) {
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizeInputLimits(rawInputLimits) {
  if (!rawInputLimits || typeof rawInputLimits !== 'object' || Array.isArray(rawInputLimits)) {
    return {};
  }
  const maxImageInputs = normalizePositiveIntegerLimit(rawInputLimits.maxImageInputs);
  const maxAudioInputs = normalizePositiveIntegerLimit(rawInputLimits.maxAudioInputs);
  const maxVideoInputs = normalizePositiveIntegerLimit(rawInputLimits.maxVideoInputs);
  return {
    ...(maxImageInputs ? { maxImageInputs } : {}),
    ...(maxAudioInputs ? { maxAudioInputs } : {}),
    ...(maxVideoInputs ? { maxVideoInputs } : {}),
  };
}

function normalizeThinkingControl(rawThinkingControl, { enabled = false } = {}) {
  if (!enabled || !rawThinkingControl || typeof rawThinkingControl !== 'object' || Array.isArray(rawThinkingControl)) {
    return null;
  }
  const runtimeParameter =
    typeof rawThinkingControl.runtimeParameter === 'string' &&
    ALLOWED_THINKING_RUNTIME_PARAMETERS.has(rawThinkingControl.runtimeParameter.trim())
      ? rawThinkingControl.runtimeParameter.trim()
      : '';
  const enabledInstruction =
    typeof rawThinkingControl.enabledInstruction === 'string'
      ? rawThinkingControl.enabledInstruction.trim()
      : '';
  const disabledInstruction =
    typeof rawThinkingControl.disabledInstruction === 'string'
      ? rawThinkingControl.disabledInstruction.trim()
      : '';
  const defaultEnabled = rawThinkingControl.defaultEnabled !== false;
  if (!runtimeParameter && !enabledInstruction && !disabledInstruction) {
    return null;
  }
  return {
    defaultEnabled,
    ...(runtimeParameter ? { runtimeParameter } : {}),
    ...(enabledInstruction ? { enabledInstruction } : {}),
    ...(disabledInstruction ? { disabledInstruction } : {}),
  };
}

function normalizeFeatures(rawFeatures, { thinkingTags = null } = {}) {
  const normalized = Object.fromEntries(MODEL_FEATURE_FLAGS.map((feature) => [feature, rawFeatures?.[feature] === true]));
  if (thinkingTags) {
    normalized.thinking = true;
  }
  return normalized;
}

function normalizeConfiguredModelId(modelId) {
  const normalizedId = typeof modelId === 'string' ? modelId.trim() : '';
  return LEGACY_MODEL_ALIASES[normalizedId] || normalizedId;
}

export function normalizeSupportedBackendPreference(value) {
  if (value === 'webgpu' || value === 'wasm' || value === 'cpu') {
    return value;
  }
  return 'auto';
}

export function browserSupportsWebGpu(navigatorLike = globalThis.navigator) {
  return Boolean(navigatorLike && typeof navigatorLike === 'object' && 'gpu' in navigatorLike);
}

const configuredModels = Array.isArray(modelCatalog?.models)
  ? modelCatalog.models
      .map((model) => {
        const id = typeof model?.id === 'string' ? model.id.trim() : '';
        if (!id) {
          return null;
        }
        const label =
          typeof model?.label === 'string' && model.label.trim() ? model.label.trim() : id;
        const displayName = normalizeModelCardText(model?.displayName) || label;
        const languageSupport = normalizeLanguageSupport(model?.languageSupport);
        const repositoryUrl = normalizeRepositoryUrl(model?.repositoryUrl, id);
        const openThinkingTag = model?.thinkingTags?.open;
        const closeThinkingTag = model?.thinkingTags?.close;
        const thinkingTags =
          typeof openThinkingTag === 'string' &&
          openThinkingTag &&
          typeof closeThinkingTag === 'string' &&
          closeThinkingTag &&
          openThinkingTag !== closeThinkingTag
            ? { open: openThinkingTag, close: closeThinkingTag }
            : null;
        const generation = normalizeGenerationLimits(model?.generation);
        const runtime = normalizeRuntime(model?.runtime);
        const features = normalizeFeatures(model?.features, { thinkingTags });
        const thinkingControl = normalizeThinkingControl(model?.thinkingControl, {
          enabled: features.thinking,
        });
        const toolCalling = normalizeToolCalling(model?.toolCalling, {
          enabled: features.toolCalling,
        });
        const inputLimits = normalizeInputLimits(model?.inputLimits);
        return {
          id,
          label,
          displayName,
          languageSupport,
          repositoryUrl,
          features,
          thinkingControl,
          toolCalling,
          thinkingTags,
          generation,
          runtime,
          inputLimits,
          hidden: normalizeHiddenFlag((/** @type {any} */ (model)).hidden),
        };
      })
      .filter(Boolean)
  : [];

const configuredDefaultModel =
  typeof modelCatalog?.defaultModelId === 'string' ? modelCatalog.defaultModelId.trim() : '';

export const DEFAULT_MODEL =
  configuredDefaultModel ||
  configuredModels[0]?.id ||
  'onnx-community/Llama-3.2-3B-Instruct-onnx-web';

if (!configuredModels.some((model) => model.id === DEFAULT_MODEL)) {
  configuredModels.unshift({
    id: DEFAULT_MODEL,
    label: DEFAULT_MODEL,
    displayName: DEFAULT_MODEL,
    languageSupport: null,
    repositoryUrl: `https://huggingface.co/${DEFAULT_MODEL}`,
    features: normalizeFeatures(null),
    thinkingControl: null,
    toolCalling: null,
    thinkingTags: null,
    generation: normalizeGenerationLimits(null),
    runtime: {},
    inputLimits: {},
    hidden: false,
  });
}

const visibleConfiguredModels = configuredModels.filter((model) => !model.hidden);

export const MODEL_OPTIONS = Object.freeze(visibleConfiguredModels);
export const MODEL_OPTIONS_BY_ID = new Map(configuredModels.map((model) => [model.id, model]));
export const LEGACY_MODEL_ALIASES = Object.fromEntries(
  Object.entries(modelCatalog?.legacyAliases || {})
    .map(([alias, canonical]) => [
      typeof alias === 'string' ? alias.trim() : '',
      typeof canonical === 'string' ? canonical.trim() : '',
    ])
    .filter(([alias, canonical]) => alias && canonical),
);
export const SUPPORTED_MODELS = new Set(configuredModels.map((model) => model.id));

export function normalizeModelId(modelId) {
  const canonical = LEGACY_MODEL_ALIASES[modelId] || modelId;
  if (SUPPORTED_MODELS.has(canonical)) {
    return canonical;
  }
  return DEFAULT_MODEL;
}

export function getModelAvailability(
  modelId,
  {
    backendPreference = 'auto',
    webGpuAvailable = browserSupportsWebGpu(),
  } = {},
) {
  const normalizedBackendPreference = normalizeSupportedBackendPreference(backendPreference);
  const resolvedModelId = normalizeConfiguredModelId(modelId);
  const model = MODEL_OPTIONS_BY_ID.get(resolvedModelId);

  if (!model) {
    return {
      available: false,
      reason: 'This model is not supported in this app.',
    };
  }

  if (model.runtime?.requiresWebGpu) {
    if (!webGpuAvailable) {
      return {
        available: false,
        reason: 'This model requires WebGPU, which is not available in this browser.',
      };
    }
    if (!WEBGPU_COMPATIBLE_BACKEND_PREFERENCES.has(normalizedBackendPreference)) {
      return {
        available: false,
        reason: 'This model requires WebGPU. Choose Auto or WebGPU only.',
      };
    }
  }

  return { available: true, reason: '' };
}

export function getFirstAvailableModelId(options = {}) {
  const firstAvailableModel = MODEL_OPTIONS.find((model) =>
    getModelAvailability(model.id, options).available,
  );
  return firstAvailableModel?.id || DEFAULT_MODEL;
}
