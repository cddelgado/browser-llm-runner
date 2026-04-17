import { MEDIAPIPE_GENAI_ENGINE_TYPE } from './engine-types.js';

export function createMediapipeGenAiEngineDescriptor() {
  return {
    engineType: MEDIAPIPE_GENAI_ENGINE_TYPE,
    kind: 'worker',
    reinitializeOnGenerationConfigChange: true,
    createWorker() {
      return new Worker(new URL('../../workers/mediapipe-llm.worker.js', import.meta.url), {
        type: 'module',
      });
    },
  };
}
