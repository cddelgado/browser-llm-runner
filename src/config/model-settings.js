import modelCatalog from './models.json';
import { DEFAULT_ENGINE_TYPE, normalizeEngineType } from '../llm/engines/index.js';
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
export const ALLOWED_RUNTIME_DTYPES = Object.freeze(
  new Set([
    'q4',
    'q8',
    'fp32',
    'fp16',
    'int8',
    'uint8',
    'bnb4',
    'q4f16',
    'q2',
    'q2f16',
    'q1',
    'q1f16',
  ])
);
export const CPU_ONLY_ENGINE_TYPES = Object.freeze(new Set(['wllama']));
export const WEBGPU_COMPATIBLE_BACKEND_PREFERENCES = Object.freeze(new Set(['webgpu']));
export const ALLOWED_TOOL_CALLING_FORMATS = Object.freeze(
  new Set([
    'json',
    'tagged-json',
    'special-token-call',
    'xml-tool-call',
    'gemma-special-token-call',
  ])
);
export const ALLOWED_TOOL_LIST_FORMATS = Object.freeze(new Set(['markdown', 'json']));
export const ALLOWED_THINKING_RUNTIME_PARAMETERS = Object.freeze(new Set(['enable_thinking']));

function normalizeEngine(rawEngine) {
  if (typeof rawEngine === 'string') {
    return {
      type: normalizeEngineType(rawEngine),
    };
  }
  return {
    type: normalizeEngineType(rawEngine?.type),
  };
}

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

function normalizeRuntimeDtypes(rawDtypes) {
  if (!rawDtypes || typeof rawDtypes !== 'object' || Array.isArray(rawDtypes)) {
    return null;
  }
  const webgpu = normalizeRuntimeDtype(rawDtypes.webgpu);
  const cpu = normalizeRuntimeDtype(rawDtypes.cpu);
  if (!webgpu && !cpu) {
    return null;
  }
  return {
    ...(webgpu ? { webgpu } : {}),
    ...(cpu ? { cpu } : {}),
  };
}

function normalizeRuntime(rawRuntime) {
  const dtype = normalizeRuntimeDtype(rawRuntime?.dtype);
  const dtypes = normalizeRuntimeDtypes(rawRuntime?.dtypes);
  const revision =
    typeof rawRuntime?.revision === 'string' && rawRuntime.revision.trim()
      ? rawRuntime.revision.trim()
      : '';
  const enableThinking = rawRuntime?.enableThinking === true;
  const requiresWebGpu = rawRuntime?.requiresWebGpu === true;
  const multimodalGeneration = rawRuntime?.multimodalGeneration === true;
  const preferMultimodalForText = rawRuntime?.preferMultimodalForText === true;
  const allowBackendFallback = rawRuntime?.allowBackendFallback !== false;
  const useExternalDataFormat =
    rawRuntime?.useExternalDataFormat === true ||
    (Number.isInteger(rawRuntime?.useExternalDataFormat) && rawRuntime.useExternalDataFormat > 0)
      ? rawRuntime.useExternalDataFormat
      : false;
  const providerId =
    typeof rawRuntime?.providerId === 'string' && rawRuntime.providerId.trim()
      ? rawRuntime.providerId.trim()
      : '';
  const providerType =
    typeof rawRuntime?.providerType === 'string' && rawRuntime.providerType.trim()
      ? rawRuntime.providerType.trim()
      : '';
  const providerDisplayName =
    typeof rawRuntime?.providerDisplayName === 'string' && rawRuntime.providerDisplayName.trim()
      ? rawRuntime.providerDisplayName.trim()
      : '';
  const providerHasSecret = rawRuntime?.providerHasSecret === true;
  const providerPreconfigured = rawRuntime?.providerPreconfigured === true;
  const apiBaseUrl =
    typeof rawRuntime?.apiBaseUrl === 'string' && rawRuntime.apiBaseUrl.trim()
      ? rawRuntime.apiBaseUrl.trim()
      : '';
  const remoteModelId =
    typeof rawRuntime?.remoteModelId === 'string' && rawRuntime.remoteModelId.trim()
      ? rawRuntime.remoteModelId.trim()
      : '';
  const supportsTopK = rawRuntime?.supportsTopK === true;
  const modelUrl =
    typeof rawRuntime?.modelUrl === 'string' && rawRuntime.modelUrl.trim()
      ? rawRuntime.modelUrl.trim()
      : '';
  const parallelDownloads = normalizePositiveIntegerLimit(rawRuntime?.parallelDownloads);
  const allowOffline = rawRuntime?.allowOffline === true;
  const rateLimit =
    rawRuntime?.rateLimit &&
    typeof rawRuntime.rateLimit === 'object' &&
    Number.isInteger(rawRuntime.rateLimit.maxRequests) &&
    rawRuntime.rateLimit.maxRequests > 0 &&
    Number.isInteger(rawRuntime.rateLimit.windowMs) &&
    rawRuntime.rateLimit.windowMs > 0
      ? {
          maxRequests: rawRuntime.rateLimit.maxRequests,
          windowMs: rawRuntime.rateLimit.windowMs,
        }
      : null;
  return {
    ...(dtype ? { dtype } : {}),
    ...(dtypes ? { dtypes } : {}),
    ...(revision ? { revision } : {}),
    ...(enableThinking ? { enableThinking: true } : {}),
    ...(requiresWebGpu ? { requiresWebGpu: true } : {}),
    ...(multimodalGeneration ? { multimodalGeneration: true } : {}),
    ...(preferMultimodalForText ? { preferMultimodalForText: true } : {}),
    ...(allowBackendFallback === false ? { allowBackendFallback: false } : {}),
    ...(useExternalDataFormat ? { useExternalDataFormat } : {}),
    ...(providerId ? { providerId } : {}),
    ...(providerType ? { providerType } : {}),
    ...(providerDisplayName ? { providerDisplayName } : {}),
    ...(providerHasSecret ? { providerHasSecret: true } : {}),
    ...(providerPreconfigured ? { providerPreconfigured: true } : {}),
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(remoteModelId ? { remoteModelId } : {}),
    ...(supportsTopK ? { supportsTopK: true } : {}),
    ...(rateLimit ? { rateLimit } : {}),
    ...(modelUrl ? { modelUrl } : {}),
    ...(parallelDownloads ? { parallelDownloads } : {}),
    ...(allowOffline ? { allowOffline: true } : {}),
  };
}

function normalizeHiddenFlag(rawHidden) {
  return rawHidden === true;
}

function normalizeModelCardText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeUnavailableReason(value) {
  return normalizeModelCardText(value);
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
  if (
    !rawLanguageSupport ||
    typeof rawLanguageSupport !== 'object' ||
    Array.isArray(rawLanguageSupport)
  ) {
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
  if (
    !enabled ||
    !rawToolCalling ||
    typeof rawToolCalling !== 'object' ||
    Array.isArray(rawToolCalling)
  ) {
    return null;
  }
  const toolListFormat =
    typeof rawToolCalling.toolListFormat === 'string' &&
    ALLOWED_TOOL_LIST_FORMATS.has(rawToolCalling.toolListFormat.trim())
      ? rawToolCalling.toolListFormat.trim()
      : '';
  const format =
    typeof rawToolCalling.format === 'string' &&
    ALLOWED_TOOL_CALLING_FORMATS.has(rawToolCalling.format.trim())
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
          ...(toolListFormat && toolListFormat !== 'markdown' ? { toolListFormat } : {}),
        }
      : null;
  }
  if (format === 'tagged-json') {
    const nameKey = typeof rawToolCalling.nameKey === 'string' ? rawToolCalling.nameKey.trim() : '';
    const argumentsKey =
      typeof rawToolCalling.argumentsKey === 'string' ? rawToolCalling.argumentsKey.trim() : '';
    const openTag = typeof rawToolCalling.openTag === 'string' ? rawToolCalling.openTag.trim() : '';
    const closeTag =
      typeof rawToolCalling.closeTag === 'string' ? rawToolCalling.closeTag.trim() : '';
    return nameKey && argumentsKey && openTag && closeTag && openTag !== closeTag
      ? {
          format,
          nameKey,
          argumentsKey,
          openTag,
          closeTag,
          ...(toolListFormat && toolListFormat !== 'markdown' ? { toolListFormat } : {}),
        }
      : null;
  }
  if (format === 'xml-tool-call' || format === 'gemma-special-token-call') {
    return {
      format,
      ...(toolListFormat && toolListFormat !== 'markdown' ? { toolListFormat } : {}),
    };
  }
  const callOpen =
    typeof rawToolCalling.callOpen === 'string' ? rawToolCalling.callOpen.trim() : '';
  const callClose =
    typeof rawToolCalling.callClose === 'string' ? rawToolCalling.callClose.trim() : '';
  return callOpen && callClose && callOpen !== callClose
    ? {
        format,
        callOpen,
        callClose,
        ...(toolListFormat && toolListFormat !== 'markdown' ? { toolListFormat } : {}),
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
  if (
    !enabled ||
    !rawThinkingControl ||
    typeof rawThinkingControl !== 'object' ||
    Array.isArray(rawThinkingControl)
  ) {
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

function normalizeThinkingTags(rawThinkingTags) {
  if (!rawThinkingTags || typeof rawThinkingTags !== 'object' || Array.isArray(rawThinkingTags)) {
    return null;
  }
  const open = typeof rawThinkingTags.open === 'string' ? rawThinkingTags.open.trim() : '';
  const close = typeof rawThinkingTags.close === 'string' ? rawThinkingTags.close.trim() : '';
  if (!open || !close || open === close) {
    return null;
  }
  const stripLeadingText =
    typeof rawThinkingTags.stripLeadingText === 'string'
      ? rawThinkingTags.stripLeadingText.trim()
      : '';
  return {
    open,
    close,
    ...(stripLeadingText ? { stripLeadingText } : {}),
  };
}

function normalizeFeatures(rawFeatures, { thinkingTags = null } = {}) {
  const normalized = Object.fromEntries(
    MODEL_FEATURE_FLAGS.map((feature) => [feature, rawFeatures?.[feature] === true])
  );
  if (thinkingTags) {
    normalized.thinking = true;
  }
  return normalized;
}

function normalizeGenerationBackendOverrides(rawBackendOverrides, baseGeneration) {
  if (
    !rawBackendOverrides ||
    typeof rawBackendOverrides !== 'object' ||
    Array.isArray(rawBackendOverrides)
  ) {
    return null;
  }

  const backendOverrides = {};
  ['webgpu', 'cpu'].forEach((backend) => {
    const rawOverride = rawBackendOverrides?.[backend];
    if (!rawOverride || typeof rawOverride !== 'object' || Array.isArray(rawOverride)) {
      return;
    }
    backendOverrides[backend] = normalizeGenerationLimits({
      ...baseGeneration,
      ...rawOverride,
    });
  });

  return Object.keys(backendOverrides).length ? backendOverrides : null;
}

function normalizeGeneration(rawGeneration) {
  const baseGeneration = normalizeGenerationLimits(rawGeneration);
  const backendOverrides = normalizeGenerationBackendOverrides(
    rawGeneration?.backendOverrides,
    baseGeneration
  );
  return backendOverrides ? { ...baseGeneration, backendOverrides } : baseGeneration;
}

function normalizeConfiguredModelId(modelId) {
  const normalizedId = typeof modelId === 'string' ? modelId.trim() : '';
  return LEGACY_MODEL_ALIASES[normalizedId] || normalizedId;
}

function normalizeCatalogModel(model) {
  const rawModel = /** @type {any} */ (model);
  const id = typeof rawModel?.id === 'string' ? rawModel.id.trim() : '';
  if (!id) {
    return null;
  }
  const label =
    typeof rawModel?.label === 'string' && rawModel.label.trim() ? rawModel.label.trim() : id;
  const displayName = normalizeModelCardText(rawModel?.displayName) || label;
  const engine = normalizeEngine(rawModel?.engine);
  const languageSupport = normalizeLanguageSupport(rawModel?.languageSupport);
  const repositoryUrl = normalizeRepositoryUrl(rawModel?.repositoryUrl, id);
  const unavailableReason = normalizeUnavailableReason(rawModel?.unavailableReason);
  const thinkingTags = normalizeThinkingTags(rawModel?.thinkingTags);
  const generation = normalizeGeneration(rawModel?.generation);
  const runtime = normalizeRuntime(rawModel?.runtime);
  const features = normalizeFeatures(rawModel?.features, { thinkingTags });
  const thinkingControl = normalizeThinkingControl(rawModel?.thinkingControl, {
    enabled: features.thinking,
  });
  const toolCalling = normalizeToolCalling(rawModel?.toolCalling, {
    enabled: features.toolCalling,
  });
  const inputLimits = normalizeInputLimits(rawModel?.inputLimits);
  return {
    id,
    label,
    displayName,
    engine,
    languageSupport,
    repositoryUrl,
    ...(unavailableReason ? { unavailableReason } : {}),
    features,
    thinkingControl,
    toolCalling,
    thinkingTags,
    generation,
    runtime,
    inputLimits,
    hidden: normalizeHiddenFlag(rawModel.hidden),
  };
}

export function normalizeSupportedBackendPreference(value) {
  if (value === 'cpu' || value === 'wasm') {
    return 'cpu';
  }
  if (value === 'webgpu' || value === 'auto') {
    return 'webgpu';
  }
  return 'webgpu';
}

export function resolveRuntimeDtypeForBackend(runtime = {}, backendPreference = 'webgpu') {
  const normalizedBackendPreference = normalizeSupportedBackendPreference(backendPreference);
  const backendKey = normalizedBackendPreference === 'cpu' ? 'cpu' : 'webgpu';
  return normalizeRuntimeDtype(runtime?.dtypes?.[backendKey] ?? runtime?.dtype);
}

export function browserSupportsWebGpu(navigatorLike = globalThis.navigator) {
  return Boolean(navigatorLike && typeof navigatorLike === 'object' && 'gpu' in navigatorLike);
}

const staticConfiguredModels = Array.isArray(modelCatalog?.models)
  ? modelCatalog.models.map(normalizeCatalogModel).filter(Boolean)
  : [];

const configuredDefaultModel =
  typeof modelCatalog?.defaultModelId === 'string' ? modelCatalog.defaultModelId.trim() : '';

export const DEFAULT_MODEL =
  configuredDefaultModel ||
  staticConfiguredModels[0]?.id ||
  'huggingworld/gemma-4-E2B-it-ONNX';

if (!staticConfiguredModels.some((model) => model.id === DEFAULT_MODEL)) {
  staticConfiguredModels.unshift({
    id: DEFAULT_MODEL,
    label: DEFAULT_MODEL,
    displayName: DEFAULT_MODEL,
    engine: { type: DEFAULT_ENGINE_TYPE },
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

const visibleStaticConfiguredModels = [
  ...staticConfiguredModels.filter((model) => !model.hidden && model.id === DEFAULT_MODEL),
  ...staticConfiguredModels.filter((model) => !model.hidden && model.id !== DEFAULT_MODEL),
];

export const MODEL_OPTIONS = [];
export const MODEL_OPTIONS_BY_ID = new Map();
export const LEGACY_MODEL_ALIASES = Object.fromEntries(
  Object.entries(modelCatalog?.legacyAliases || {})
    .map(([alias, canonical]) => [
      typeof alias === 'string' ? alias.trim() : '',
      typeof canonical === 'string' ? canonical.trim() : '',
    ])
    .filter(([alias, canonical]) => alias && canonical)
);
export const SUPPORTED_MODELS = new Set();
let runtimeConfiguredModels = [];

function refreshRegisteredModels() {
  const visibleRuntimeConfiguredModels = runtimeConfiguredModels.filter((model) => !model.hidden);
  const nextVisibleModels = [
    ...visibleStaticConfiguredModels,
    ...visibleRuntimeConfiguredModels.filter((model) => model.id !== DEFAULT_MODEL),
  ];

  MODEL_OPTIONS.splice(0, MODEL_OPTIONS.length, ...nextVisibleModels);
  MODEL_OPTIONS_BY_ID.clear();
  SUPPORTED_MODELS.clear();

  [...staticConfiguredModels, ...runtimeConfiguredModels].forEach((model) => {
    MODEL_OPTIONS_BY_ID.set(model.id, model);
    SUPPORTED_MODELS.add(model.id);
  });
}

export function replaceRuntimeModelCatalog(models) {
  const nextRuntimeModels = [];
  const seenModelIds = new Set(staticConfiguredModels.map((model) => model.id));
  (Array.isArray(models) ? models : []).forEach((model) => {
    const normalizedModel = normalizeCatalogModel(model);
    if (!normalizedModel || seenModelIds.has(normalizedModel.id)) {
      return;
    }
    seenModelIds.add(normalizedModel.id);
    nextRuntimeModels.push(normalizedModel);
  });
  runtimeConfiguredModels = nextRuntimeModels.sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
  refreshRegisteredModels();
}

refreshRegisteredModels();

export function normalizeModelId(modelId) {
  const canonical = LEGACY_MODEL_ALIASES[modelId] || modelId;
  if (SUPPORTED_MODELS.has(canonical)) {
    return canonical;
  }
  return DEFAULT_MODEL;
}

export function getModelEngineType(modelId) {
  const resolvedModelId = normalizeConfiguredModelId(modelId);
  return MODEL_OPTIONS_BY_ID.get(resolvedModelId)?.engine?.type || DEFAULT_ENGINE_TYPE;
}

export function getModelGenerationLimits(modelId, { backendPreference = 'webgpu' } = {}) {
  const resolvedModelId = normalizeConfiguredModelId(modelId);
  const generation =
    MODEL_OPTIONS_BY_ID.get(resolvedModelId)?.generation || normalizeGenerationLimits(null);
  const normalizedBackendPreference = normalizeSupportedBackendPreference(backendPreference);
  return generation?.backendOverrides?.[normalizedBackendPreference] || generation;
}

export function getModelAvailability(
  modelId,
  { backendPreference = 'webgpu', webGpuAvailable = browserSupportsWebGpu() } = {}
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

  if (model.unavailableReason) {
    return {
      available: false,
      reason: model.unavailableReason,
    };
  }

  if (
    model.engine?.type === 'openai-compatible' &&
    model.runtime?.providerHasSecret !== true
  ) {
    return {
      available: false,
      reason: 'Save an API key for this cloud model in Settings -> Cloud Providers.',
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
        reason: 'This model requires WebGPU. Switch to WebGPU mode.',
      };
    }
  }

  if (
    model.runtime?.allowBackendFallback === false &&
    !webGpuAvailable &&
    WEBGPU_COMPATIBLE_BACKEND_PREFERENCES.has(normalizedBackendPreference)
  ) {
    return {
      available: false,
      reason:
        'This model is configured for WebGPU-first loading in this mode. Enable CPU mode explicitly to use its separate CPU fallback quantization.',
    };
  }

  return { available: true, reason: '' };
}

export function getFirstAvailableModelId(options = {}) {
  const firstAvailableModel = MODEL_OPTIONS.find(
    (model) => getModelAvailability(model.id, options).available
  );
  return firstAvailableModel?.id || DEFAULT_MODEL;
}
