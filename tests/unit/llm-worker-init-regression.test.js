import { beforeEach, describe, expect, test, vi } from 'vitest';

const tokenizerFactory = vi.fn();
const textModelFactory = vi.fn();
const multimodalFactory = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  env: {
    backends: {
      onnx: {
        wasm: {},
      },
    },
  },
  TextStreamer: class TextStreamerMock {
    constructor(_tokenizer, options = {}) {
      this.callback_function = options.callback_function || null;
      this.token_callback_function = options.token_callback_function || null;
      this.skip_prompt = options.skip_prompt === true;
      this.skip_special_tokens = options.skip_special_tokens === true;
    }
  },
  InterruptableStoppingCriteria: class InterruptableStoppingCriteriaMock {
    interrupt() {}

    reset() {}
  },
  AutoTokenizer: {
    from_pretrained: tokenizerFactory,
  },
  AutoModelForCausalLM: {
    from_pretrained: textModelFactory,
  },
  AutoModelForImageTextToText: {
    from_pretrained: multimodalFactory,
  },
}));

function createTokenizer() {
  return {
    apply_chat_template: vi.fn(() => ({
      input_ids: [[101, 102, 103]],
      attention_mask: [[1, 1, 1]],
    })),
    batch_decode: vi.fn(() => ['Decoded output']),
    dispose: vi.fn(),
  };
}

function createTextModel(generateImplementation = null) {
  return {
    generate: vi.fn(
      generateImplementation ||
        (async (options = {}) => {
          options.streamer?.callback_function?.('Model output');
          return {
            sequences: [[101, 102, 103, 201]],
          };
        })
    ),
    dispose: vi.fn(),
  };
}

describe('llm.worker init regression', () => {
  beforeEach(() => {
    vi.resetModules();
    tokenizerFactory.mockReset();
    tokenizerFactory.mockResolvedValue(createTokenizer());
    textModelFactory.mockReset();
    textModelFactory.mockResolvedValue(createTextModel());
    multimodalFactory.mockReset();
    multimodalFactory.mockResolvedValue({
      tokenizer: createTokenizer(),
      generate: vi.fn(async () => ({
        sequences: [[101, 102, 103, 201]],
      })),
    });
    globalThis.self = /** @type {any} */ ({
      postMessage: vi.fn(),
      onmessage: null,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
  });

  test('reuses a loaded cpu alias without reinitializing the tokenizer or text model', async () => {
    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    const payload = {
      modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      backendPreference: 'cpu',
      runtime: {},
    };

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload,
        },
      })
    );

    expect(tokenizerFactory).toHaveBeenCalledTimes(1);
    expect(textModelFactory).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        backendDevice: 'wasm',
        modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      },
    });

    workerSelf.postMessage.mockClear();

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload,
        },
      })
    );

    expect(tokenizerFactory).toHaveBeenCalledTimes(1);
    expect(textModelFactory).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-success',
      payload: {
        backend: 'cpu',
        backendDevice: 'wasm',
        modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      },
    });
  });

  test('surfaces a WebGPU init error before text model loading when no usable adapter exists', async () => {
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

    expect(tokenizerFactory).not.toHaveBeenCalled();
    expect(textModelFactory).not.toHaveBeenCalled();
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
            modelId: 'huggingworld/gemma-4-E2B-it-ONNX',
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
                webgpu: 'q1f16',
                cpu: 'q4',
              },
              allowBackendFallback: false,
            },
          },
        },
      })
    );

    expect(tokenizerFactory).not.toHaveBeenCalled();
    expect(textModelFactory).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-error',
      payload: {
        message:
          'Failed to initialize model. WEBGPU: No usable WebGPU adapter was found. (Automatic CPU fallback is disabled for this model. Switch to CPU mode manually if you want to try the CPU version of this model.)',
      },
    });
  });

  test('surfaces a WebGPU memory allocation failure without inventing a fallback rationale', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        gpu: {
          requestAdapter: vi.fn(async () => ({})),
        },
      },
    });
    textModelFactory.mockRejectedValueOnce(
      new Error("Can't create a session. ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc")
    );

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
                webgpu: 'q1f16',
                cpu: 'q4',
              },
              allowBackendFallback: false,
            },
          },
        },
      })
    );

    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-error',
      payload: {
        message:
          "Failed to initialize model. WEBGPU: WebGPU could not allocate enough memory to create a session. Close other GPU-heavy tabs or apps and retry. (Can't create a session. ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc) (Automatic CPU fallback is disabled for this model. Switch to CPU mode manually if you want to try the CPU version of this model.)",
      },
    });
  });

  test('does not attempt any cpu worker init after a failed webgpu probe', async () => {
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

    expect(tokenizerFactory).not.toHaveBeenCalled();
    expect(textModelFactory).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'init-error',
      payload: {
        message: 'Failed to initialize model. WEBGPU: WebGPU unavailable in this browser.',
      },
    });
  });

  test('invokes the text-generation model directly for cpu generation after prompt preparation', async () => {
    const tokenizer = createTokenizer();
    const textModel = createTextModel(async (options = {}) => {
      options.streamer?.token_callback_function?.([201n]);
      options.streamer?.callback_function?.('Model output');
      return {
        sequences: [[101, 102, 103, 201]],
      };
    });
    tokenizerFactory.mockResolvedValue(tokenizer);
    textModelFactory.mockResolvedValue(textModel);

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

    expect(tokenizer.apply_chat_template).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hello there' }],
      expect.objectContaining({
        add_generation_prompt: true,
        tokenize: true,
        truncation: false,
        return_dict: true,
      })
    );
    expect(textModel.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        input_ids: [[101, 102, 103]],
        attention_mask: [[1, 1, 1]],
        max_new_tokens: 64,
        max_length: 67,
        streamer: expect.objectContaining({
          skip_prompt: true,
          skip_special_tokens: true,
          token_callback_function: expect.any(Function),
        }),
      })
    );
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'activity',
      payload: {
        requestId: 'request-1',
      },
    });
    const statusMessages = workerSelf.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message?.type === 'status')
      .map((message) => message.payload?.message);
    expect(statusMessages).toEqual([
      'Generating (CPU). First response may take several minutes on CPU...',
      'Preparing prompt (CPU)...',
      'Running CPU prompt prefill. Waiting for the first token...',
      'First token generated (CPU). Waiting for printable text...',
      'Streaming response (CPU)...',
      'Complete (CPU)',
    ]);
    const firstGenerateCall = /** @type {any} */ (textModel.generate.mock.calls[0]?.[0]);
    expect(firstGenerateCall?.return_dict_in_generate).toBeUndefined();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-1',
        text: 'Model output',
      },
    });
  });

  test('disposes streamed text-generation inputs and outputs after each request', async () => {
    const inputIds = {
      dims: [1, 3],
      dispose: vi.fn(),
    };
    const attentionMask = {
      dims: [1, 3],
      dispose: vi.fn(),
    };
    const tokenizer = {
      apply_chat_template: vi.fn(() => ({
        input_ids: inputIds,
        attention_mask: attentionMask,
      })),
      batch_decode: vi.fn(() => ['']),
      dispose: vi.fn(),
    };
    const generationOutput = {
      dispose: vi.fn(),
    };
    const textModel = createTextModel(async (options = {}) => {
      options.streamer?.callback_function?.('Model output');
      return generationOutput;
    });
    tokenizerFactory.mockResolvedValue(tokenizer);
    textModelFactory.mockResolvedValue(textModel);

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
            requestId: 'request-dispose',
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

    expect(inputIds.dispose).toHaveBeenCalledTimes(1);
    expect(attentionMask.dispose).toHaveBeenCalledTimes(1);
    expect(generationOutput.dispose).toHaveBeenCalledTimes(1);
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-dispose',
        text: 'Model output',
      },
    });
  });

  test('disposes the loaded text runtime before switching into multimodal mode', async () => {
    const tokenizer = createTokenizer();
    const textModel = createTextModel();
    const multimodalModel = {
      tokenizer: createTokenizer(),
      generate: vi.fn(async () => ({
        sequences: [[101, 102, 103, 201]],
      })),
      dispose: vi.fn(),
    };
    tokenizerFactory.mockResolvedValueOnce(tokenizer);
    textModelFactory.mockResolvedValueOnce(textModel);
    multimodalFactory.mockResolvedValueOnce(multimodalModel);

    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'huggingworld/gemma-4-E2B-it-ONNX',
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

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'huggingworld/gemma-4-E2B-it-ONNX',
            backendPreference: 'cpu',
            runtime: {
              dtypes: {
                cpu: 'q4f16',
              },
              multimodalGeneration: true,
            },
          },
        },
      })
    );

    expect(tokenizer.dispose).toHaveBeenCalledTimes(1);
    expect(textModel.dispose).toHaveBeenCalledTimes(1);
    expect(multimodalFactory).toHaveBeenCalledTimes(1);
  });

  test('preserves special tokens in the text streamer when runtime thinking is enabled', async () => {
    const tokenizer = createTokenizer();
    const textModel = createTextModel(async (options = {}) => {
      options.streamer?.callback_function?.('<|channel>thought\\n');
      options.streamer?.callback_function?.('considering options<channel|>Final answer');
      return {
        sequences: [[101, 102, 103, 201]],
      };
    });
    tokenizerFactory.mockResolvedValue(tokenizer);
    textModelFactory.mockResolvedValue(textModel);

    await import('../../src/workers/llm.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    await workerSelf.onmessage(
      /** @type {any} */ ({
        data: {
          type: 'init',
          payload: {
            modelId: 'huggingworld/gemma-4-E2B-it-ONNX',
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

    expect(textModel.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        enable_thinking: true,
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
