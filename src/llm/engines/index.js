import {
  DEFAULT_ENGINE_TYPE,
  MEDIAPIPE_GENAI_ENGINE_TYPE,
  OPENAI_COMPATIBLE_ENGINE_TYPE,
  TRANSFORMERS_JS_ENGINE_TYPE,
  normalizeEngineType,
} from './engine-types.js';
import { createMediapipeGenAiEngineDescriptor } from './mediapipe-genai-engine.js';
import { createOpenAiCompatibleEngineDescriptor } from './openai-compatible-engine.js';
import { createTransformersJsEngineDescriptor } from './transformers-js-engine.js';

const ENGINE_DESCRIPTOR_FACTORIES = Object.freeze({
  [MEDIAPIPE_GENAI_ENGINE_TYPE]: createMediapipeGenAiEngineDescriptor,
  [OPENAI_COMPATIBLE_ENGINE_TYPE]: createOpenAiCompatibleEngineDescriptor,
  [TRANSFORMERS_JS_ENGINE_TYPE]: createTransformersJsEngineDescriptor,
});

export {
  DEFAULT_ENGINE_TYPE,
  MEDIAPIPE_GENAI_ENGINE_TYPE,
  OPENAI_COMPATIBLE_ENGINE_TYPE,
  TRANSFORMERS_JS_ENGINE_TYPE,
  normalizeEngineType,
};

export function getEngineDescriptor(engineType = DEFAULT_ENGINE_TYPE) {
  const normalizedEngineType = normalizeEngineType(engineType);
  const createDescriptor =
    ENGINE_DESCRIPTOR_FACTORIES[normalizedEngineType] ||
    ENGINE_DESCRIPTOR_FACTORIES[DEFAULT_ENGINE_TYPE];
  return createDescriptor();
}
