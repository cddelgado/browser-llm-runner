import { beforeAll, describe, expect, test } from 'vitest';

let resolvePrompt;
let buildMultimodalChatTemplateOptions;
let buildGenerationOptions;
let shouldSkipSpecialTokensInMultimodalOutput;
let buildMultimodalDecodeOptions;
let getBackendAttemptOrder;
let resolveBrowserWasmThreadCount;
let configureOnnxWasmBackend;

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
    resolveBrowserWasmThreadCount,
    configureOnnxWasmBackend,
  } = await import(
    '../../src/workers/llm.worker.js'
  ));
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
  test('auto falls back from webgpu to wasm only in the browser worker', () => {
    expect(getBackendAttemptOrder('auto', {})).toEqual(['webgpu', 'wasm']);
  });

  test('cpu preference maps to the wasm executor in the browser worker', () => {
    expect(getBackendAttemptOrder('cpu', {})).toEqual(['wasm']);
  });

  test('webgpu-required models reject wasm-only preference', () => {
    expect(getBackendAttemptOrder('wasm', { requiresWebGpu: true })).toEqual([]);
  });

  test('webgpu-required models reject cpu-only preference', () => {
    expect(getBackendAttemptOrder('cpu', { requiresWebGpu: true })).toEqual([]);
  });
});

describe('llm.worker wasm thread selection', () => {
  test('uses a conservative threaded wasm count when isolation requirements are met', () => {
    expect(
      resolveBrowserWasmThreadCount({
        navigatorLike: { hardwareConcurrency: 8 },
        globalLike: {
          SharedArrayBuffer: class SharedArrayBufferMock {},
          crossOriginIsolated: true,
        },
      })
    ).toEqual({
      logicalCores: 8,
      hasSharedArrayBuffer: true,
      isCrossOriginIsolated: true,
      canUseThreadedWasm: true,
      numThreads: 4,
    });
  });

  test('falls back to one wasm thread when cross-origin isolation is unavailable', () => {
    expect(
      resolveBrowserWasmThreadCount({
        navigatorLike: { hardwareConcurrency: 8 },
        globalLike: {
          SharedArrayBuffer: class SharedArrayBufferMock {},
          crossOriginIsolated: false,
        },
      })
    ).toEqual({
      logicalCores: 8,
      hasSharedArrayBuffer: true,
      isCrossOriginIsolated: false,
      canUseThreadedWasm: false,
      numThreads: 1,
    });
  });

  test('falls back to one wasm thread when SharedArrayBuffer is unavailable', () => {
    expect(
      resolveBrowserWasmThreadCount({
        navigatorLike: { hardwareConcurrency: 8 },
        globalLike: {
          crossOriginIsolated: true,
        },
      })
    ).toEqual({
      logicalCores: 8,
      hasSharedArrayBuffer: false,
      isCrossOriginIsolated: true,
      canUseThreadedWasm: false,
      numThreads: 1,
    });
  });
});

describe('llm.worker wasm backend config', () => {
  test('enables proxying for wasm execution', () => {
    const env = {
      backends: {
        onnx: {
          wasm: {},
        },
      },
    };

    const originalSharedArrayBuffer = globalThis.SharedArrayBuffer;
    const originalCrossOriginIsolated = globalThis.crossOriginIsolated;
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'SharedArrayBuffer', {
      configurable: true,
      value: class SharedArrayBufferMock {},
    });
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { hardwareConcurrency: 8 },
    });

    try {
      const result = configureOnnxWasmBackend(env, 'wasm');
      expect(env.backends.onnx.wasm.proxy).toBe(true);
      expect(env.backends.onnx.wasm.numThreads).toBe(4);
      expect(result?.proxy).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'SharedArrayBuffer', {
        configurable: true,
        value: originalSharedArrayBuffer,
      });
      Object.defineProperty(globalThis, 'crossOriginIsolated', {
        configurable: true,
        value: originalCrossOriginIsolated,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  test('disables wasm proxying for webgpu execution', () => {
    const env = {
      backends: {
        onnx: {
          wasm: {},
        },
      },
    };

    const result = configureOnnxWasmBackend(env, 'webgpu');
    expect(env.backends.onnx.wasm.proxy).toBe(false);
    expect(result?.proxy).toBe(false);
  });
});
