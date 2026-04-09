import { beforeAll, describe, expect, test, vi } from 'vitest';

let resolvePrompt;
let buildTextChatTemplateOptions;
let buildMultimodalChatTemplateOptions;
let buildGenerationOptions;
let shouldSkipSpecialTokensInMultimodalOutput;
let buildMultimodalDecodeOptions;
let getBackendAttemptOrder;
let configureOnnxWasmBackend;
let prepareTextGenerationInputs;
let decodePreparedTextPrompt;
let resolveGenerationMaxLength;
let resolveBackendLabel;
let ONNX_WASM_PROXY_ENABLED;
let ONNX_WASM_NUM_THREADS;

beforeAll(async () => {
  globalThis.self = /** @type {any} */ ({
    postMessage: () => {},
    onmessage: null,
  });
  ({
    resolvePrompt,
    buildTextChatTemplateOptions,
    buildMultimodalChatTemplateOptions,
    buildGenerationOptions,
    shouldSkipSpecialTokensInMultimodalOutput,
    buildMultimodalDecodeOptions,
    getBackendAttemptOrder,
    configureOnnxWasmBackend,
    prepareTextGenerationInputs,
    decodePreparedTextPrompt,
    resolveGenerationMaxLength,
    resolveBackendLabel,
    ONNX_WASM_PROXY_ENABLED,
    ONNX_WASM_NUM_THREADS,
  } = await import('../../src/workers/llm.worker.js'));
});

describe('llm.worker resolvePrompt', () => {
  test('preserves tool roles in structured prompts', () => {
    expect(
      resolvePrompt([
        { role: 'system', content: 'Use tools when needed.' },
        { role: 'user', content: 'What time is it?' },
        { role: 'assistant', content: '{"name":"get_current_date_time","parameters":{}}' },
        { role: 'tool', content: '{"iso":"2026-03-26T06:00:00.000Z"}' },
      ])
    ).toEqual([
      { role: 'system', content: 'Use tools when needed.' },
      { role: 'user', content: 'What time is it?' },
      { role: 'assistant', content: '{"name":"get_current_date_time","parameters":{}}' },
      { role: 'tool', content: '{"iso":"2026-03-26T06:00:00.000Z"}' },
    ]);
  });

  test('preserves structured audio parts in multimodal prompts', () => {
    expect(
      resolvePrompt([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this.' },
            {
              type: 'audio',
              mimeType: 'audio/mpeg',
              samplesBase64: 'abcd',
              sampleRate: 16000,
              sampleCount: 4,
            },
          ],
        },
      ])
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this.' },
          {
            type: 'audio',
            mimeType: 'audio/mpeg',
            samplesBase64: 'abcd',
            sampleRate: 16000,
            sampleCount: 4,
          },
        ],
      },
    ]);
  });
});

describe('llm.worker multimodal chat template options', () => {
  test('forwards the thinking flag for text chat template preparation', () => {
    expect(buildTextChatTemplateOptions({ enableThinking: true })).toEqual({
      add_generation_prompt: true,
      enable_thinking: true,
    });
    expect(buildTextChatTemplateOptions({ enableThinking: false })).toEqual({
      add_generation_prompt: true,
      enable_thinking: false,
    });
  });

  test('forwards the thinking flag when runtime thinking is enabled', () => {
    expect(buildMultimodalChatTemplateOptions({ enableThinking: true })).toEqual({
      add_generation_prompt: true,
      enable_thinking: true,
    });
  });

  test('forwards the thinking flag when runtime thinking is disabled', () => {
    expect(buildMultimodalChatTemplateOptions({ enableThinking: false })).toEqual({
      add_generation_prompt: true,
      enable_thinking: false,
    });
  });

  test('preserves special tokens in multimodal output when thinking is enabled', () => {
    expect(shouldSkipSpecialTokensInMultimodalOutput({ enableThinking: true })).toBe(false);
    expect(buildMultimodalDecodeOptions({ enableThinking: true })).toEqual({
      skip_special_tokens: false,
    });
  });

  test('skips special tokens in multimodal output when thinking is disabled', () => {
    expect(shouldSkipSpecialTokensInMultimodalOutput({ enableThinking: false })).toBe(true);
    expect(buildMultimodalDecodeOptions({ enableThinking: false })).toEqual({
      skip_special_tokens: true,
    });
  });
});

describe('llm.worker generation options', () => {
  test('maps runtime-supported sampling fields to Transformers.js generate options', () => {
    expect(
      buildGenerationOptions(
        {
          maxOutputTokens: 512,
          maxContextTokens: 4096,
          temperature: 0.6,
          topK: 20,
          topP: 0.95,
          repetitionPenalty: 1.05,
        },
        { enableThinking: true }
      )
    ).toEqual({
      max_new_tokens: 512,
      temperature: 0.6,
      top_k: 20,
      top_p: 0.95,
      repetition_penalty: 1.05,
      do_sample: true,
      enable_thinking: true,
    });
  });

  test('forwards an explicit disabled thinking flag to Transformers.js generate options', () => {
    expect(
      buildGenerationOptions(
        {
          maxOutputTokens: 256,
          maxContextTokens: 2048,
          temperature: 0.6,
          topK: 20,
          topP: 0.95,
          repetitionPenalty: 1.0,
        },
        { enableThinking: false }
      )
    ).toEqual({
      max_new_tokens: 256,
      temperature: 0.6,
      top_k: 20,
      top_p: 0.95,
      repetition_penalty: 1.0,
      do_sample: true,
      enable_thinking: false,
    });
  });

  test('derives total max_length from prompt tokens plus maximum output tokens', () => {
    expect(
      resolveGenerationMaxLength(714, {
        maxOutputTokens: 1024,
      })
    ).toBe(1738);
  });
});

describe('llm.worker text prompt preparation', () => {
  test('left-truncates tokenized chat inputs to the configured context budget', () => {
    const tokenizer = {
      apply_chat_template: () => ({
        input_ids: [[101, 102, 103, 104, 105]],
        attention_mask: [[1, 1, 1, 1, 1]],
      }),
    };

    const result = prepareTextGenerationInputs(
      tokenizer,
      [{ role: 'user', content: 'Hello there' }],
      { maxContextTokens: 3 },
      {}
    );

    expect(result).toEqual({
      modelInputs: {
        input_ids: [[103, 104, 105]],
        attention_mask: [[1, 1, 1]],
      },
      originalPromptTokens: 5,
      promptTokens: 3,
      truncated: true,
    });
  });

  test('preserves full tokenized chat inputs when they already fit the configured budget', () => {
    const applyChatTemplate = vi.fn(() => ({
        input_ids: [[11, 12, 13]],
        attention_mask: [[1, 1, 1]],
      }));
    const tokenizer = {
      apply_chat_template: applyChatTemplate,
    };

    const result = prepareTextGenerationInputs(
      tokenizer,
      [{ role: 'user', content: 'Hi' }],
      { maxContextTokens: 8 },
      { enableThinking: true }
    );

    expect(result).toEqual({
      modelInputs: {
        input_ids: [[11, 12, 13]],
        attention_mask: [[1, 1, 1]],
      },
      originalPromptTokens: 3,
      promptTokens: 3,
      truncated: false,
    });
    expect(applyChatTemplate).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hi' }],
      expect.objectContaining({
        add_generation_prompt: true,
        enable_thinking: true,
        tokenize: true,
        truncation: false,
        return_dict: true,
      })
    );
  });

  test('decodes prepared text-generation inputs back into a prompt string for pipeline execution', () => {
    const batchDecode = vi.fn(() => ['<s>Prompt text']);
    const tokenizer = {
      batch_decode: batchDecode,
    };

    expect(
      decodePreparedTextPrompt(tokenizer, {
        modelInputs: {
          input_ids: [[11, 12, 13]],
        },
      })
    ).toBe('<s>Prompt text');
    expect(batchDecode).toHaveBeenCalledWith([[11, 12, 13]], {
      skip_special_tokens: false,
      clean_up_tokenization_spaces: false,
    });
  });
});

describe('llm.worker backend selection', () => {
  test('webgpu preference falls back from webgpu to wasm in the browser worker', () => {
    expect(getBackendAttemptOrder('webgpu', {})).toEqual(['webgpu', 'wasm']);
  });

  test('legacy auto preference maps to webgpu mode with the same wasm fallback', () => {
    expect(getBackendAttemptOrder('auto', {})).toEqual(['webgpu', 'wasm']);
  });

  test('cpu preference maps directly to the browser wasm backend', () => {
    expect(getBackendAttemptOrder('cpu', {})).toEqual(['wasm']);
  });

  test('labels the browser wasm backend as cpu for current and legacy cpu preferences', () => {
    expect(resolveBackendLabel('cpu', 'wasm')).toBe('cpu');
    expect(resolveBackendLabel('wasm', 'wasm')).toBe('cpu');
  });

  test('labels webgpu execution consistently for current and legacy webgpu preferences', () => {
    expect(resolveBackendLabel('webgpu', 'webgpu')).toBe('webgpu');
    expect(resolveBackendLabel('auto', 'webgpu')).toBe('webgpu');
  });

  test('webgpu-required models reject cpu-only preference', () => {
    expect(getBackendAttemptOrder('cpu', { requiresWebGpu: true })).toEqual([]);
  });

  test('webgpu-required models keep legacy auto mapped to webgpu-only attempts', () => {
    expect(getBackendAttemptOrder('auto', { requiresWebGpu: true })).toEqual(['webgpu']);
  });
});

describe('llm.worker wasm backend config', () => {
  test('exports the intended ONNX wasm defaults', () => {
    expect(ONNX_WASM_PROXY_ENABLED).toBe(true);
    expect(ONNX_WASM_NUM_THREADS).toBe(0);
  });

  test('enables proxying and automatic thread selection on CPU wasm attempts', () => {
    const env = {
      backends: {
        onnx: {
          wasm: {},
        },
      },
    };

    const result = configureOnnxWasmBackend(env, 'wasm');
    expect(env.backends.onnx.wasm.proxy).toBe(true);
    expect(env.backends.onnx.wasm.numThreads).toBe(0);
    expect(result).toEqual({
      backend: 'wasm',
      proxy: true,
      numThreads: 0,
    });
  });

  test('keeps proxying enabled for default CPU fallback attempts', () => {
    const env = {
      backends: {
        onnx: {
          wasm: {},
        },
      },
    };

    const result = configureOnnxWasmBackend(env, 'default');
    expect(env.backends.onnx.wasm.proxy).toBe(true);
    expect(env.backends.onnx.wasm.numThreads).toBe(0);
    expect(result).toEqual({
      backend: 'default',
      proxy: true,
      numThreads: 0,
    });
  });

  test('keeps proxying enabled for webgpu attempts', () => {
    const env = {
      backends: {
        onnx: {
          wasm: {},
        },
      },
    };

    const result = configureOnnxWasmBackend(env, 'webgpu');
    expect(env.backends.onnx.wasm.proxy).toBe(true);
    expect(env.backends.onnx.wasm.numThreads).toBe(0);
    expect(result).toEqual({
      backend: 'webgpu',
      proxy: true,
      numThreads: 0,
    });
  });

  test('applies an explicit user-selected cpu thread count when provided', () => {
    const env = {
      backends: {
        onnx: {
          wasm: {},
        },
      },
    };

    const result = configureOnnxWasmBackend(env, 'wasm', { cpuThreads: 3 });
    expect(env.backends.onnx.wasm.proxy).toBe(true);
    expect(env.backends.onnx.wasm.numThreads).toBe(3);
    expect(result).toEqual({
      backend: 'wasm',
      proxy: true,
      numThreads: 3,
    });
  });

  test('returns null when the onnx wasm backend is unavailable', () => {
    const env = {
      backends: {
        onnx: {},
      },
    };

    expect(configureOnnxWasmBackend(env)).toBeNull();
  });
});
