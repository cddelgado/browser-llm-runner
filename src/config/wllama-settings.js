import { clamp } from './generation-config.js';

export const MIN_WLLAMA_BATCH_SIZE = 32;
export const MAX_WLLAMA_BATCH_SIZE = 256;
export const WLLAMA_BATCH_SIZE_STEP = 32;
export const MIN_WLLAMA_MIN_P = 0;
export const MAX_WLLAMA_MIN_P = 1;
export const WLLAMA_MIN_P_STEP = 0.05;
export const MAX_WLLAMA_PROMPT_CACHE_CONTEXT_TOKENS = 2048;

export const DEFAULT_WLLAMA_SETTINGS = Object.freeze({
  usePromptCache: false,
  batchSize: MAX_WLLAMA_BATCH_SIZE,
  minP: 0,
});

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveMaxBatchSize(maxContextTokens) {
  const normalizedContextTokens = normalizePositiveInteger(
    maxContextTokens,
    DEFAULT_WLLAMA_SETTINGS.batchSize
  );
  return Math.max(
    MIN_WLLAMA_BATCH_SIZE,
    Math.min(MAX_WLLAMA_BATCH_SIZE, normalizedContextTokens)
  );
}

export function canUseWllamaPromptCache(maxContextTokens) {
  const normalizedContextTokens = normalizePositiveInteger(maxContextTokens, 0);
  return (
    normalizedContextTokens > 0 &&
    normalizedContextTokens <= MAX_WLLAMA_PROMPT_CACHE_CONTEXT_TOKENS
  );
}

export function quantizeWllamaBatchSize(value, maxContextTokens) {
  const maxBatchSize = resolveMaxBatchSize(maxContextTokens);
  const defaultBatchSize = Math.min(DEFAULT_WLLAMA_SETTINGS.batchSize, maxBatchSize);
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return defaultBatchSize;
  }
  const bounded = clamp(parsed, MIN_WLLAMA_BATCH_SIZE, maxBatchSize);
  const steps = Math.round((bounded - MIN_WLLAMA_BATCH_SIZE) / WLLAMA_BATCH_SIZE_STEP);
  return clamp(
    MIN_WLLAMA_BATCH_SIZE + steps * WLLAMA_BATCH_SIZE_STEP,
    MIN_WLLAMA_BATCH_SIZE,
    maxBatchSize
  );
}

export function quantizeWllamaMinP(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WLLAMA_SETTINGS.minP;
  }
  const bounded = clamp(parsed, MIN_WLLAMA_MIN_P, MAX_WLLAMA_MIN_P);
  const steps = Math.round((bounded - MIN_WLLAMA_MIN_P) / WLLAMA_MIN_P_STEP);
  return Number(
    clamp(
      MIN_WLLAMA_MIN_P + steps * WLLAMA_MIN_P_STEP,
      MIN_WLLAMA_MIN_P,
      MAX_WLLAMA_MIN_P
    ).toFixed(2)
  );
}

/**
 * @param {{ maxContextTokens?: number | null } | undefined} [options]
 */
export function buildDefaultWllamaSettings(options = {}) {
  const { maxContextTokens } = options;
  return {
    usePromptCache: DEFAULT_WLLAMA_SETTINGS.usePromptCache,
    batchSize: quantizeWllamaBatchSize(DEFAULT_WLLAMA_SETTINGS.batchSize, maxContextTokens),
    minP: DEFAULT_WLLAMA_SETTINGS.minP,
  };
}

/**
 * @param {any} candidateSettings
 * @param {{ maxContextTokens?: number | null } | undefined} [options]
 */
export function sanitizeWllamaSettings(candidateSettings, options = {}) {
  const { maxContextTokens } = options;
  const defaults = buildDefaultWllamaSettings({ maxContextTokens });
  const promptCacheAllowed = canUseWllamaPromptCache(maxContextTokens);
  return {
    usePromptCache: promptCacheAllowed && candidateSettings?.usePromptCache === true,
    batchSize: quantizeWllamaBatchSize(candidateSettings?.batchSize, maxContextTokens),
    minP: quantizeWllamaMinP(candidateSettings?.minP ?? defaults.minP),
  };
}
