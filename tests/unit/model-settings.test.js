import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_ID,
  browserSupportsWebGpu,
  getFirstAvailableModelId,
  getModelAvailability,
  normalizeModelId,
  resolveRuntimeDtypeForBackend,
} from '../../src/config/model-settings.js';

const LLAMA_3B_MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct-onnx-web';
const GEMMA_4_MODEL_ID = 'huggingworld/gemma-4-E2B-it-ONNX';
const BONSAI_8B_MODEL_ID = 'onnx-community/Bonsai-8B-ONNX';
const REMOVED_LLAMA_1B_MODEL_ID = 'onnx-community/Llama-3.2-1B-Instruct-ONNX';
const REMOVED_QWEN_2B_MODEL_ID = 'onnx-community/Qwen3.5-2B-ONNX';

describe('model-settings availability', () => {
  test('uses Gemma 4 as the default model and keeps it first in the visible catalog', () => {
    expect(DEFAULT_MODEL).toBe(GEMMA_4_MODEL_ID);
    expect(MODEL_OPTIONS[0]?.id).toBe(GEMMA_4_MODEL_ID);
  });

  test('keeps Gemma 4 available in cpu mode without WebGPU', () => {
    expect(
      getModelAvailability(GEMMA_4_MODEL_ID, {
        backendPreference: 'cpu',
        webGpuAvailable: false,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
  });

  test('keeps Bonsai 8B available in webgpu mode when WebGPU is missing because CPU fallback stays available', () => {
    expect(
      getModelAvailability(BONSAI_8B_MODEL_ID, {
        backendPreference: 'webgpu',
        webGpuAvailable: false,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
  });

  test('keeps Bonsai 8B available in cpu mode without WebGPU when cpu is selected explicitly', () => {
    expect(
      getModelAvailability(BONSAI_8B_MODEL_ID, {
        backendPreference: 'cpu',
        webGpuAvailable: false,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
  });

  test('keeps Llama 3.2 3B available in webgpu mode when WebGPU is missing because CPU fallback stays available', () => {
    expect(
      getModelAvailability(LLAMA_3B_MODEL_ID, {
        backendPreference: 'webgpu',
        webGpuAvailable: false,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
  });

  test('maps legacy wasm preference into cpu mode for Gemma 4', () => {
    expect(
      getModelAvailability(GEMMA_4_MODEL_ID, {
        backendPreference: 'wasm',
        webGpuAvailable: true,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
  });

  test('maps the prior onnx-community Gemma 4 repo id to the new huggingworld repo id', () => {
    expect(normalizeModelId('onnx-community/gemma-4-E2B-it-ONNX')).toBe(GEMMA_4_MODEL_ID);
  });

  test('falls back to the first cpu-capable visible model when WebGPU mode is unavailable', () => {
    expect(
      getFirstAvailableModelId({
        backendPreference: 'cpu',
        webGpuAvailable: false,
      })
    ).toBe(GEMMA_4_MODEL_ID);
  });

  test('detects WebGPU support from a navigator-like object', () => {
    expect(browserSupportsWebGpu(/** @type {any} */ ({ gpu: {} }))).toBe(true);
    expect(browserSupportsWebGpu(/** @type {any} */ ({}))).toBe(false);
    expect(browserSupportsWebGpu(null)).toBe(false);
  });

  test('loads model-specific default sampling settings from config', () => {
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.6,
      defaultTopK: 50,
      defaultTopP: 0.9,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 1,
      defaultTopK: 64,
      defaultTopP: 0.95,
      defaultRepetitionPenalty: 1,
    });
  });

  test('only exposes the current visible catalog', () => {
    expect(MODEL_OPTIONS).toHaveLength(3);
    expect(MODEL_OPTIONS_BY_ID.get('LiquidAI/LFM2.5-350M-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('LiquidAI/LFM2.5-1.2B-Instruct-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('LiquidAI/LFM2.5-1.2B-Thinking-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Qwen3.5-0.8B-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/gemma-3n-E2B-it-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(REMOVED_LLAMA_1B_MODEL_ID)).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(REMOVED_QWEN_2B_MODEL_ID)).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Qwen3-1.7B-ONNX')).toBeUndefined();
  });

  test('resolves mode-specific runtime dtypes from config', () => {
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.runtime, 'webgpu')
    ).toBe('q4');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.runtime, 'cpu')
    ).toBe('q4');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.runtime, 'cpu')
    ).toBe('q4f16');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)?.runtime, 'webgpu')
    ).toBe('q4');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)?.runtime, 'cpu')
    ).toBe('q4');
  });

  test('maps the temporary llama 3.2 3B full ONNX repo id back to the browser repo id', () => {
    expect(normalizeModelId('onnx-community/Llama-3.2-3B-Instruct-ONNX')).toBe(LLAMA_3B_MODEL_ID);
  });

  test('falls back to the default model for removed model ids', () => {
    expect(normalizeModelId(REMOVED_LLAMA_1B_MODEL_ID)).toBe(GEMMA_4_MODEL_ID);
    expect(normalizeModelId(REMOVED_QWEN_2B_MODEL_ID)).toBe(GEMMA_4_MODEL_ID);
    expect(normalizeModelId('Yoursmiling/Qwen3.5-2B-LiteRT')).toBe(GEMMA_4_MODEL_ID);
    expect(normalizeModelId('onnx-community/Qwen3-0.6B-ONNX')).toBe(GEMMA_4_MODEL_ID);
    expect(normalizeModelId('litert-community/gemma-4-E4B-it-litert-lm')).toBe(GEMMA_4_MODEL_ID);
  });

  test('exposes model feature flags from config', () => {
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: true,
      audioInput: true,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.runtime).toMatchObject({
      revision: '8ddaf6b6764ff2916a807e3c2ec0b5a441192473',
      dtypes: {
        webgpu: 'q4',
        cpu: 'q4',
      },
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.runtime).toMatchObject({
      revision: '84b2c85ce64e8a0c999a3284f438d28db1d396a5',
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'q4f16',
      },
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)?.runtime).toMatchObject({
      revision: 'a5694a132e4050cef2dc335528016ce7e56504c9',
      dtypes: {
        webgpu: 'q4',
        cpu: 'q4',
      },
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.inputLimits).toMatchObject({
      maxImageInputs: 1,
      maxAudioInputs: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.toolCalling).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'parameters',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.thinkingControl).toEqual({
      defaultEnabled: true,
      runtimeParameter: 'enable_thinking',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.thinkingTags).toEqual({
      open: '<|channel>',
      close: '<channel|>',
      stripLeadingText: 'thought',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.toolCalling).toEqual({
      format: 'gemma-special-token-call',
    });
    expect(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)?.thinkingTags).toEqual({
      open: '<think>',
      close: '</think>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)?.toolCalling).toEqual({
      format: 'tagged-json',
      nameKey: 'name',
      argumentsKey: 'arguments',
      openTag: '<tool_call>',
      closeTag: '</tool_call>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)).toMatchObject({
      displayName: 'Llama 3.2 3B Instruct',
      repositoryUrl: 'https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct-onnx-web',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)).toMatchObject({
      displayName: 'Gemma 4 E2B',
      repositoryUrl: 'https://huggingface.co/huggingworld/gemma-4-E2B-it-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(BONSAI_8B_MODEL_ID)).toMatchObject({
      displayName: 'Bonsai 8B Q4 (Experimental)',
      repositoryUrl: 'https://huggingface.co/onnx-community/Bonsai-8B-ONNX',
    });
  });
});
