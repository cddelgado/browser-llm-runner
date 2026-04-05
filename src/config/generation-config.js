export const TOKEN_STEP = 8;
export const MIN_TOKEN_LIMIT = 8;
export const TEMPERATURE_STEP = 0.1;
export const TOP_K_STEP = 1;
export const MIN_TOP_K = 5;
export const MAX_TOP_K = 500;
export const DEFAULT_TOP_K = 50;
export const TOP_P_STEP = 0.05;
export const MIN_TOP_P = 0;
export const MAX_TOP_P = 1;
export const DEFAULT_TOP_P = 0.9;
export const DEFAULT_REPETITION_PENALTY = 1.0;

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
  defaultRepetitionPenalty: DEFAULT_REPETITION_PENALTY,
});

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

export function quantizeTokenInput(value, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  const bounded = clamp(parsed, min, max);
  const steps = Math.round((bounded - min) / TOKEN_STEP);
  return clamp(min + steps * TOKEN_STEP, min, max);
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
  return clamp(parsed, MIN_TOP_K, MAX_TOP_K);
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

export function normalizeRepetitionPenalty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(DEFAULT_REPETITION_PENALTY.toFixed(2));
  }
  return Number(parsed.toFixed(2));
}

export function normalizeGenerationLimits(rawLimits) {
  const maxContextTokens = toPositiveInt(
    rawLimits?.maxContextTokens,
    DEFAULT_GENERATION_LIMITS.maxContextTokens,
  );
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
  const defaultRepetitionPenalty = normalizeRepetitionPenalty(
    toFiniteNumber(
      rawLimits?.defaultRepetitionPenalty,
      DEFAULT_GENERATION_LIMITS.defaultRepetitionPenalty,
    ),
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
    defaultRepetitionPenalty,
  };
}

export function buildDefaultGenerationConfig(limits) {
  const normalizedLimits = normalizeGenerationLimits(limits);
  return {
    maxOutputTokens: Math.min(
      normalizedLimits.defaultMaxOutputTokens,
      normalizedLimits.defaultMaxContextTokens,
    ),
    maxContextTokens: normalizedLimits.defaultMaxContextTokens,
    temperature: normalizedLimits.defaultTemperature,
    topK: normalizedLimits.defaultTopK,
    topP: normalizedLimits.defaultTopP,
    repetitionPenalty: normalizedLimits.defaultRepetitionPenalty,
  };
}

export function sanitizeGenerationConfig(candidateConfig, limits) {
  const normalizedLimits = normalizeGenerationLimits(limits);
  const maxContextTokens = quantizeTokenInput(
    candidateConfig?.maxContextTokens ?? normalizedLimits.defaultMaxContextTokens,
    MIN_TOKEN_LIMIT,
    normalizedLimits.maxContextTokens,
  );
  return {
    maxContextTokens,
    maxOutputTokens: quantizeTokenInput(
      candidateConfig?.maxOutputTokens ?? normalizedLimits.defaultMaxOutputTokens,
      MIN_TOKEN_LIMIT,
      Math.min(normalizedLimits.maxOutputTokens, maxContextTokens),
    ),
    temperature: quantizeTemperature(
      candidateConfig?.temperature ?? normalizedLimits.defaultTemperature,
      normalizedLimits.minTemperature,
      normalizedLimits.maxTemperature,
    ),
    topK: quantizeTopKInput(candidateConfig?.topK ?? normalizedLimits.defaultTopK),
    topP: quantizeTopPInput(candidateConfig?.topP ?? normalizedLimits.defaultTopP),
    repetitionPenalty: normalizeRepetitionPenalty(
      candidateConfig?.repetitionPenalty ?? normalizedLimits.defaultRepetitionPenalty,
    ),
  };
}
