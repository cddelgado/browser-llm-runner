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
  TextStreamer: class TextStreamerMock {
    constructor(_tokenizer, options = {}) {
      this.callback_function = options.callback_function || null;
      this.skip_prompt = options.skip_prompt === true;
      this.skip_special_tokens = options.skip_special_tokens === true;
    }
  },
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

  test('surfaces a WebGPU init error before model loading when no usable adapter exists', async () => {
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

    expect(pipelineFactory).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-error',
      payload: {
        message: 'Failed to initialize model. WEBGPU: No usable WebGPU adapter was found.',
      },
    });
  });

  test('surfaces a WebGPU init error before multimodal Gemma model loading when no usable adapter exists', async () => {
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
            modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
            backendPreference: 'webgpu',
            runtime: {
              dtypes: {
                webgpu: 'q4f16',
                cpu: 'q4f16',
              },
              multimodalGeneration: true,
              useExternalDataFormat: true,
            },
          },
        },
      })
    );

    expect(multimodalFactory).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-error',
      payload: {
        message: 'Failed to initialize model. WEBGPU: No usable WebGPU adapter was found.',
      },
    });
  });

  test('does not auto-fallback to cpu for Bonsai 8B when WebGPU has no usable adapter', async () => {
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
            modelId: 'onnx-community/Bonsai-8B-ONNX',
            backendPreference: 'webgpu',
            runtime: {
              dtypes: {
                webgpu: 'q1',
                cpu: 'q4',
              },
              allowBackendFallback: false,
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
          'Failed to initialize model. WEBGPU: No usable WebGPU adapter was found. (Automatic CPU fallback is disabled for this model to avoid downloading a second quantization. Switch to CPU mode manually if you want the larger CPU package.)',
      },
    });
  });

  test('does not attempt any cpu worker init after a failed webgpu probe', async () => {
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

    expect(pipelineFactory).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-error',
      payload: {
        message: 'Failed to initialize model. WEBGPU: WebGPU unavailable in this browser.',
      },
    });
  });

  test('uses the text-generation pipeline wrapper for cpu generation after prompt preparation', async () => {
    const rawGenerate = vi.fn(async () => {
      throw new Error('raw model.generate should not be called');
    });
    const generator = /** @type {any} */ (vi.fn(async (_prompt, options = {}) => {
      options.streamer?.callback_function?.('Pipeline output');
      return [{ generated_text: 'Pipeline output' }];
    }));
    generator.tokenizer = {
      apply_chat_template: vi.fn(() => ({
        input_ids: [[101, 102, 103]],
        attention_mask: [[1, 1, 1]],
      })),
      batch_decode: vi.fn((value) => {
        if (Array.isArray(value) && Array.isArray(value[0])) {
          return ['<s>Prompt text'];
        }
        return ['Pipeline output'];
      }),
    };
    generator.model = {
      generate: rawGenerate,
    };
    pipelineFactory.mockResolvedValue(generator);

    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
            backendPreference: 'cpu',
            runtime: {
              dtypes: {
                cpu: 'q4',
              },
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
            prompt: [{ role: 'user', content: 'Hello there' }],
            runtime: {},
            generationConfig: {
              maxOutputTokens: 64,
              maxContextTokens: 8192,
              temperature: 0.6,
              topK: 50,
              topP: 0.9,
              repetitionPenalty: 1.0,
            },
          },
        },
      })
    );

    expect(generator).toHaveBeenCalledWith(
      '<s>Prompt text',
      expect.objectContaining({
        max_new_tokens: 64,
        max_length: 67,
        return_full_text: false,
        add_special_tokens: false,
        tokenizer_encode_kwargs: expect.objectContaining({
          add_special_tokens: false,
          truncation: true,
          max_length: 8192,
        }),
      })
    );
    expect(rawGenerate).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-1',
        text: 'Pipeline output',
      },
    });
  });

  test('preserves special tokens in the text streamer when runtime thinking is enabled', async () => {
    const generator = /** @type {any} */ (vi.fn(async (_prompt, options = {}) => {
      options.streamer?.callback_function?.('<|channel>thought\\n');
      options.streamer?.callback_function?.('considering options<channel|>Final answer');
      return [{ generated_text: 'Final answer' }];
    }));
    generator.tokenizer = {
      apply_chat_template: vi.fn(() => ({
        input_ids: [[101, 102, 103]],
        attention_mask: [[1, 1, 1]],
      })),
      batch_decode: vi.fn((value) => {
        if (Array.isArray(value) && Array.isArray(value[0])) {
          return ['<s>Prompt text'];
        }
        return ['Final answer'];
      }),
    };
    generator.model = {
      generate: vi.fn(),
    };
    pipelineFactory.mockResolvedValue(generator);

    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
            backendPreference: 'cpu',
            runtime: {
              dtypes: {
                cpu: 'q4f16',
              },
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
            requestId: 'request-thinking',
            prompt: [{ role: 'user', content: 'Hello there' }],
            runtime: {
              enableThinking: true,
            },
            generationConfig: {
              maxOutputTokens: 64,
              maxContextTokens: 8192,
              temperature: 0.6,
              topK: 50,
              topP: 0.9,
              repetitionPenalty: 1.0,
            },
          },
        },
      })
    );

    expect(generator).toHaveBeenCalledWith(
      '<s>Prompt text',
      expect.objectContaining({
        streamer: expect.objectContaining({
          skip_special_tokens: false,
        }),
      })
    );
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-thinking',
        text: '<|channel>thought\\nconsidering options<channel|>Final answer',
      },
    });
  });
});
