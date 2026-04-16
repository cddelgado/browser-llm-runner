export const TRANSFORMERS_JS_ENGINE_TYPE = 'transformers-js';
export const MEDIAPIPE_GENAI_ENGINE_TYPE = 'mediapipe-genai';
export const OPENAI_COMPATIBLE_ENGINE_TYPE = 'openai-compatible';
export const DEFAULT_ENGINE_TYPE = TRANSFORMERS_JS_ENGINE_TYPE;

export const ENGINE_TYPES = Object.freeze(
  new Set([
    TRANSFORMERS_JS_ENGINE_TYPE,
    MEDIAPIPE_GENAI_ENGINE_TYPE,
    OPENAI_COMPATIBLE_ENGINE_TYPE,
  ])
);

export function normalizeEngineType(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return ENGINE_TYPES.has(normalized) ? normalized : DEFAULT_ENGINE_TYPE;
}
