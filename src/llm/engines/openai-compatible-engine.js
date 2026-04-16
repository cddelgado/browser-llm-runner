import { OPENAI_COMPATIBLE_ENGINE_TYPE } from './engine-types.js';

export function createOpenAiCompatibleEngineDescriptor() {
  return {
    engineType: OPENAI_COMPATIBLE_ENGINE_TYPE,
    kind: 'worker',
    createWorker() {
      return new Worker(new URL('../../workers/openai-compatible.worker.js', import.meta.url), {
        type: 'module',
      });
    },
  };
}
