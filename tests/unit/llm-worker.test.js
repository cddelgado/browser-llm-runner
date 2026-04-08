import { beforeAll, describe, expect, test } from 'vitest';

let resolvePrompt;
let buildMultimodalChatTemplateOptions;
let buildGenerationOptions;
let shouldSkipSpecialTokensInMultimodalOutput;
let buildMultimodalDecodeOptions;
let getBackendAttemptOrder;
let configureOnnxWasmBackend;
let resolveBackendLabel;

beforeAll(async () => {
  globalThis.self = /** @type {any} */ ({
    postMessage: () => {},
    onmessage: null,
  });
  ({
    resolvePrompt,
    buildMultimodalChatTemplateOptions,
    buildGenerationOptions,
    shouldSkipSpecialTokensInMultimodalOutput,
    buildMultimodalDecodeOptions,
    getBackendAttemptOrder,
    configureOnnxWasmBackend,
    resolveBackendLabel,
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
      max_length: 4096,
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
      max_length: 2048,
      temperature: 0.6,
      top_k: 20,
      top_p: 0.95,
      repetition_penalty: 1.0,
      do_sample: true,
      enable_thinking: false,
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
  test('enables proxying without forcing a wasm thread count override', () => {
    const env = {
      backends: {
        onnx: {
          wasm: {},
        },
      },
    };

    const result = configureOnnxWasmBackend(env);
    expect(env.backends.onnx.wasm.proxy).toBe(true);
    expect(env.backends.onnx.wasm.numThreads).toBeUndefined();
    expect(result).toEqual({
      proxy: true,
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
