import { beforeEach, describe, expect, test, vi } from 'vitest';

const pipelineFactory = vi.fn();
const multimodalFactory = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  env: {
    backends: {
      onnx: {
        wasm: {},
      },
    },
  },
  pipeline: pipelineFactory,
  TextStreamer: class TextStreamerMock {},
  InterruptableStoppingCriteria: class InterruptableStoppingCriteriaMock {
    interrupt() {}

    reset() {}
  },
  AutoModelForImageTextToText: {
    from_pretrained: multimodalFactory,
  },
}));

describe('llm.worker init regression', () => {
  beforeEach(() => {
    vi.resetModules();
    pipelineFactory.mockReset();
    pipelineFactory.mockResolvedValue({
      tokenizer: { id: 'tokenizer' },
    });
    multimodalFactory.mockReset();
    globalThis.self = /** @type {any} */ ({
      postMessage: vi.fn(),
      onmessage: null,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
  });

  test('reuses a loaded cpu alias without reinitializing the wasm pipeline', async () => {
    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    const payload = {
      modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      backendPreference: 'cpu',
      runtime: {},
    };

    await workerSelf.onmessage(/** @type {any} */ ({
      data: {
        type: 'init',
        payload,
      },
    }));

    expect(pipelineFactory).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        backendDevice: 'wasm',
        modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      },
    });

    workerSelf.postMessage.mockClear();

    await workerSelf.onmessage(/** @type {any} */ ({
      data: {
        type: 'init',
        payload,
      },
    }));

    expect(pipelineFactory).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        backendDevice: 'wasm',
        modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      },
    });
  });

  test('falls back to cpu before model loading when WebGPU has no usable adapter', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => null),
        },
      },
    });

    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
            backendPreference: 'webgpu',
            runtime: {
              dtypes: {
                webgpu: 'q4f16',
                cpu: 'q4',
              },
              useExternalDataFormat: true,
            },
          },
        },
      })
    );

    expect(pipelineFactory).toHaveBeenCalledTimes(1);
    expect(pipelineFactory).toHaveBeenCalledWith(
      'text-generation',
      'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
      expect.objectContaining({
        device: 'wasm',
        dtype: 'q4',
        use_external_data_format: true,
      })
    );
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        backendDevice: 'wasm',
        modelId: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
      },
    });
  });

  test('stops before model loading when a WebGPU-required model has no usable adapter', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => null),
        },
      },
    });

    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'LiquidAI/LFM2.5-350M-ONNX',
            backendPreference: 'webgpu',
            runtime: {
              dtypes: {
                webgpu: 'q4f16',
              },
              requiresWebGpu: true,
              useExternalDataFormat: true,
            },
          },
        },
      })
    );

    expect(pipelineFactory).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-error',
      payload: {
        message:
          'Failed to initialize model. LiquidAI/LFM2.5-350M-ONNX requires WebGPU, but no usable WebGPU adapter was found.',
      },
    });
  });

  test('falls through to the default cpu device when wasm init fails without WebGPU', async () => {
    pipelineFactory.mockImplementation(async (_task, _modelId, options = {}) => {
      if (options.device === 'wasm') {
        throw new Error('WASM backend init failed.');
      }
      return {
        tokenizer: { id: 'tokenizer' },
      };
    });

    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
            backendPreference: 'webgpu',
            runtime: {
              dtypes: {
                webgpu: 'q4f16',
                cpu: 'q4',
              },
              useExternalDataFormat: true,
            },
          },
        },
      })
    );

    expect(pipelineFactory).toHaveBeenCalledTimes(2);
    expect(pipelineFactory.mock.calls[0]?.[2]).toMatchObject({
      device: 'wasm',
      dtype: 'q4',
      use_external_data_format: true,
    });
    expect(pipelineFactory.mock.calls[1]?.[2]).toMatchObject({
      dtype: 'q4',
      use_external_data_format: true,
    });
    expect(pipelineFactory.mock.calls[1]?.[2]?.device).toBeUndefined();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        backendDevice: 'default',
        modelId: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
      },
    });
  });
});
