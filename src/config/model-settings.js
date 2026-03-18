import modelCatalog from './models.json';

export const TOKEN_STEP = 8;
export const MIN_TOKEN_LIMIT = 8;
export const TEMPERATURE_STEP = 0.1;
export const TOP_K_STEP = 5;
export const MIN_TOP_K = 5;
export const MAX_TOP_K = 500;
export const DEFAULT_TOP_K = 50;
export const TOP_P_STEP = 0.05;
export const MIN_TOP_P = 0;
export const MAX_TOP_P = 1;
export const DEFAULT_TOP_P = 0.9;
export const DEFAULT_GENERATION_LIMITS = Object.freeze({
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: 32768,
  defaultMaxContextTokens: 32768,
  maxContextTokens: 32768,
  minTemperature: 0.1,
  maxTemperature: 2.0,
  defaultTemperature: 0.6,
  defaultTopK: DEFAULT_TOP_K,
  defaultTopP: DEFAULT_TOP_P,
});
export const ALLOWED_RUNTIME_DTYPES = Object.freeze(new Set(['q4', 'q4f16', 'q8', 'fp16', 'fp32']));
export const WEBGPU_COMPATIBLE_BACKEND_PREFERENCES = Object.freeze(new Set(['auto', 'webgpu']));

function toPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function quantizeTemperature(value, min, max) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return Number(min.toFixed(1));
  }
  const bounded = clamp(parsed, min, max);
  const steps = Math.round((bounded - min) / TEMPERATURE_STEP);
  const quantized = min + steps * TEMPERATURE_STEP;
  return Number(clamp(quantized, min, max).toFixed(1));
}

export function quantizeTopKInput(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TOP_K;
  }
  const bounded = clamp(parsed, MIN_TOP_K, MAX_TOP_K);
  const steps = Math.round((bounded - MIN_TOP_K) / TOP_K_STEP);
  return clamp(MIN_TOP_K + steps * TOP_K_STEP, MIN_TOP_K, MAX_TOP_K);
}

export function quantizeTopPInput(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return Number(DEFAULT_TOP_P.toFixed(2));
  }
  const bounded = clamp(parsed, MIN_TOP_P, MAX_TOP_P);
  const steps = Math.round((bounded - MIN_TOP_P) / TOP_P_STEP);
  const quantized = MIN_TOP_P + steps * TOP_P_STEP;
  return Number(clamp(quantized, MIN_TOP_P, MAX_TOP_P).toFixed(2));
}

export function normalizeGenerationLimits(rawLimits) {
  const maxContextTokens = toPositiveInt(rawLimits?.maxContextTokens, DEFAULT_GENERATION_LIMITS.maxContextTokens);
  const maxOutputTokens = toPositiveInt(rawLimits?.maxOutputTokens, maxContextTokens);
  const minTemperature = toFiniteNumber(
    rawLimits?.minTemperature,
    DEFAULT_GENERATION_LIMITS.minTemperature,
  );
  const maxTemperature = toFiniteNumber(
    rawLimits?.maxTemperature,
    DEFAULT_GENERATION_LIMITS.maxTemperature,
  );
  const boundedMinTemperature = Number(Math.min(minTemperature, maxTemperature).toFixed(1));
  const boundedMaxTemperature = Number(Math.max(minTemperature, maxTemperature).toFixed(1));
  const defaultTemperature = quantizeTemperature(
    toFiniteNumber(rawLimits?.defaultTemperature, DEFAULT_GENERATION_LIMITS.defaultTemperature),
    boundedMinTemperature,
    boundedMaxTemperature,
  );
  const defaultMaxContextTokens = clamp(
    toPositiveInt(rawLimits?.defaultMaxContextTokens, maxContextTokens),
    MIN_TOKEN_LIMIT,
    maxContextTokens,
  );
  const defaultMaxOutputTokens = clamp(
    toPositiveInt(rawLimits?.defaultMaxOutputTokens, DEFAULT_GENERATION_LIMITS.defaultMaxOutputTokens),
    MIN_TOKEN_LIMIT,
    maxOutputTokens,
  );
  const defaultTopK = quantizeTopKInput(
    toPositiveInt(rawLimits?.defaultTopK, DEFAULT_GENERATION_LIMITS.defaultTopK),
  );
  const defaultTopP = quantizeTopPInput(
    toFiniteNumber(rawLimits?.defaultTopP, DEFAULT_GENERATION_LIMITS.defaultTopP),
  );
  return {
    defaultMaxOutputTokens: Math.min(defaultMaxOutputTokens, defaultMaxContextTokens),
    maxOutputTokens,
    defaultMaxContextTokens,
    maxContextTokens,
    minTemperature: boundedMinTemperature,
    maxTemperature: boundedMaxTemperature,
    defaultTemperature,
    defaultTopK,
    defaultTopP,
  };
}

function normalizeRuntime(rawRuntime) {
  const dtype =
    typeof rawRuntime?.dtype === 'string' && ALLOWED_RUNTIME_DTYPES.has(rawRuntime.dtype.trim())
      ? rawRuntime.dtype.trim()
      : null;
  const enableThinking = rawRuntime?.enableThinking === true;
  const requiresWebGpu = rawRuntime?.requiresWebGpu === true;
  const useExternalDataFormat =
    rawRuntime?.useExternalDataFormat === true ||
    (Number.isInteger(rawRuntime?.useExternalDataFormat) && rawRuntime.useExternalDataFormat > 0)
      ? rawRuntime.useExternalDataFormat
      : false;
  return {
    ...(dtype ? { dtype } : {}),
    ...(enableThinking ? { enableThinking: true } : {}),
    ...(requiresWebGpu ? { requiresWebGpu: true } : {}),
    ...(useExternalDataFormat ? { useExternalDataFormat } : {}),
  };
}

function normalizeHiddenFlag(rawHidden) {
  return rawHidden === true;
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
        return {
          id,
          label,
          features: model?.features || {},
          thinkingTags,
          generation,
          runtime,
          hidden: normalizeHiddenFlag(model?.hidden),
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
    features: {},
    thinkingTags: null,
    generation: normalizeGenerationLimits(null),
    runtime: {},
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
