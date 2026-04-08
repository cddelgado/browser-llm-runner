import { beforeEach, describe, expect, test, vi } from 'vitest';

const isSimdSupportedMock = vi.fn();
const createFromOptionsMock = vi.fn();
const clearCancelSignalsMock = vi.fn();
const generateResponseMock = vi.fn();
const closeMock = vi.fn();

function buildInferenceInstance() {
  return {
    close: closeMock,
    clearCancelSignals: clearCancelSignalsMock,
    generateResponse: generateResponseMock,
  };
}

vi.mock('@mediapipe/tasks-genai', () => ({
  FilesetResolver: {
    isSimdSupported: isSimdSupportedMock,
  },
  LlmInference: class MockLlmInference {
    constructor() {
      Object.assign(this, buildInferenceInstance());
    }

    static createFromOptions(...args) {
      return createFromOptionsMock(...args);
    }
  },
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_module_internal.js?url', () => ({
  default: '/mock/genai_wasm_module_internal.js',
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_module_internal.wasm?url', () => ({
  default: '/mock/genai_wasm_module_internal.wasm',
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_nosimd_internal.js?url', () => ({
  default: '/mock/genai_wasm_nosimd_internal.js',
}));

vi.mock('@mediapipe/tasks-genai/genai_wasm_nosimd_internal.wasm?url', () => ({
  default: '/mock/genai_wasm_nosimd_internal.wasm',
}));

describe('mediapipe-llm.worker', () => {
  let importTargetHref = '';
  let fetchMock;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    isSimdSupportedMock.mockResolvedValue(true);
    createFromOptionsMock.mockResolvedValue(buildInferenceInstance());
    generateResponseMock.mockResolvedValue('');

    importTargetHref = new URL('./fixtures/mediapipe-import-shim-target.js', import.meta.url).href;

    globalThis.self = /** @type {any} */ ({
      postMessage: vi.fn(),
      onmessage: null,
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => ({})),
        },
      },
    });

    fetchMock = vi.fn(async () => {
      return new globalThis.Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-length': '3',
        },
      });
    });

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
  });

  test('installs a self.import shim before LiteRT initialization', async () => {
    createFromOptionsMock.mockImplementation(async (wasmFileset, options) => {
      const workerSelf = /** @type {any} */ (globalThis.self);

      expect(wasmFileset).toEqual({
        wasmLoaderPath: '/mock/genai_wasm_module_internal.js',
        wasmBinaryPath: '/mock/genai_wasm_module_internal.wasm',
      });
      expect(typeof workerSelf.import).toBe('function');

      const importedModule = await workerSelf.import(importTargetHref);
      expect(importedModule.default).toEqual({
        ok: true,
      });

      expect(options).toMatchObject({
        baseOptions: {
          modelAssetBuffer: expect.any(Object),
          delegate: 'GPU',
        },
        maxTokens: 8192,
        topK: 64,
        temperature: 1,
        randomSeed: 0,
      });

      return buildInferenceInstance();
    });

    await import('../../src/workers/mediapipe-llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'litert-community/gemma-4-E4B-it-litert-lm',
            backendPreference: 'webgpu',
            runtime: {
              requiresWebGpu: true,
              promptFormat: 'gemma-turns',
              modelAssetPath:
                'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/test/gemma-4-E4B-it-web.task',
            },
          },
        },
      })
    );

    expect(createFromOptionsMock).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'webgpu',
        modelId: 'litert-community/gemma-4-E4B-it-litert-lm',
        engineType: 'mediapipe-genai',
      },
    });
  });

  test('loads classic WASM loader scripts into worker-global scope', async () => {
    const classicLoaderSpecifier = 'https://example.test/genai_wasm_internal.js';
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === classicLoaderSpecifier) {
        return new globalThis.Response(
          `var ModuleFactory = (() => {
  function moduleFactory() {
    return { ready: true };
  }
  return moduleFactory;
})();
if (typeof exports === 'object' && typeof module === 'object') {
  module.exports = ModuleFactory;
  module.exports.default = ModuleFactory;
}
`,
          {
            status: 200,
            headers: {
              'content-type': 'text/javascript',
            },
          }
        );
      }

      return new globalThis.Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-length': '3',
        },
      });
    });

    await import('../../src/workers/mediapipe-llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    const importedLoader = await workerSelf.import(classicLoaderSpecifier);

    expect(importedLoader).toEqual({
      default: workerSelf.ModuleFactory,
    });
    expect(typeof workerSelf.ModuleFactory).toBe('function');
    expect(workerSelf.ModuleFactory()).toEqual({
      ready: true,
    });
  });

  test('formats Qwen LiteRT prompts with the expected chat tags and thinking preamble', async () => {
    generateResponseMock.mockImplementation(async (prompt, progressListener) => {
      expect(prompt).toBe(
        '<|im_start|>system\nBe concise.<|im_end|>\n' +
          '<|im_start|>user\nCheck the tool result.<|im_end|>\n' +
          '<|im_start|>assistant\n<tool_call>\n<function=web_lookup>\n<parameter=input>cats</parameter>\n</function>\n</tool_call><|im_end|>\n' +
          '<|im_start|>user\n<tool_response>\n{"status":"success","body":"Cats are mammals."}\n</tool_response><|im_end|>\n' +
          '<|im_start|>assistant\n<think>\n\n</think>\n\n'
      );
      progressListener?.('Cats are mammals.', true);
      return 'Cats are mammals.';
    });

    await import('../../src/workers/mediapipe-llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'Yoursmiling/Qwen3.5-2B-LiteRT',
            backendPreference: 'webgpu',
            runtime: {
              promptFormat: 'qwen-im',
              modelAssetPath:
                'https://huggingface.co/Yoursmiling/Qwen3.5-2B-LiteRT/resolve/test/model_multimodal.litertlm',
            },
          },
        },
      })
    );

    workerSelf.postMessage.mockClear();

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'generate',
          payload: {
            requestId: 'request-qwen',
            prompt: [
              { role: 'system', content: 'Be concise.' },
              { role: 'user', content: 'Check the tool result.' },
              {
                role: 'assistant',
                content:
                  '<tool_call>\n<function=web_lookup>\n<parameter=input>cats</parameter>\n</function>\n</tool_call>',
              },
              {
                role: 'tool',
                content: '{"status":"success","body":"Cats are mammals."}',
              },
            ],
            runtime: {
              promptFormat: 'qwen-im',
              enableThinking: false,
            },
          },
        },
      })
    );

    expect(clearCancelSignalsMock).toHaveBeenCalledTimes(1);
    expect(generateResponseMock).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-qwen',
        text: 'Cats are mammals.',
      },
    });
  });

  test('generates responses without reloading the LiteRT model asset', async () => {
    generateResponseMock.mockImplementation(async (prompt, progressListener) => {
      expect(prompt).toBe('<|turn>user\nWhat time is it.<turn|>\n<|turn>model\n');
      progressListener?.('It is ', false);
      progressListener?.('It is 11:25 PM.', true);
      return 'It is 11:25 PM.';
    });

    await import('../../src/workers/mediapipe-llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'litert-community/gemma-4-E4B-it-litert-lm',
            backendPreference: 'webgpu',
            generationConfig: {
              maxOutputTokens: 512,
              maxContextTokens: 8192,
              temperature: 0.8,
              topK: 40,
            },
            runtime: {
              requiresWebGpu: true,
              promptFormat: 'gemma-turns',
              modelAssetPath:
                'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/test/gemma-4-E4B-it-web.task',
            },
          },
        },
      })
    );

    workerSelf.postMessage.mockClear();

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'generate',
          payload: {
            requestId: 'request-1',
            prompt: 'What time is it.',
            runtime: {},
          },
        },
      })
    );

    expect(createFromOptionsMock).toHaveBeenCalledTimes(1);
    expect(clearCancelSignalsMock).toHaveBeenCalledTimes(1);
    expect(generateResponseMock).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'token',
      payload: {
        requestId: 'request-1',
        text: 'It is ',
      },
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-1',
        text: 'It is 11:25 PM.',
      },
    });
  });
});
