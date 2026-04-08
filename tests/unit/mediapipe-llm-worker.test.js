import { beforeEach, describe, expect, test, vi } from 'vitest';

const isSimdSupportedMock = vi.fn();
const createFromOptionsMock = vi.fn();

vi.mock('@mediapipe/tasks-genai', () => ({
  FilesetResolver: {
    isSimdSupported: isSimdSupportedMock,
  },
  LlmInference: {
    createFromOptions: createFromOptionsMock,
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

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    isSimdSupportedMock.mockResolvedValue(true);
    createFromOptionsMock.mockReset();
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

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async () => {
        return new globalThis.Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-length': '3',
          },
        });
      },
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
        },
        maxTokens: 8192,
        topK: 64,
        temperature: 1,
        randomSeed: 0,
      });

      return {
        close: vi.fn(),
      };
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
});
