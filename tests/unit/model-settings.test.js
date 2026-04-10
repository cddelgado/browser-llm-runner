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
const LLAMA_1B_MODEL_ID = 'onnx-community/Llama-3.2-1B-Instruct-ONNX';
const QWEN_2B_MODEL_ID = 'onnx-community/Qwen3.5-2B-ONNX';
const GEMMA_4_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

describe('model-settings availability', () => {
  test('uses Llama 3.2 1B as the default model and keeps it first in the visible catalog', () => {
    expect(DEFAULT_MODEL).toBe(LLAMA_1B_MODEL_ID);
    expect(MODEL_OPTIONS[0]?.id).toBe(LLAMA_1B_MODEL_ID);
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

  test('falls back to the first cpu-capable visible model when WebGPU mode is unavailable', () => {
    expect(
      getFirstAvailableModelId({
        backendPreference: 'cpu',
        webGpuAvailable: false,
      })
    ).toBe(LLAMA_1B_MODEL_ID);
  });

  test('detects WebGPU support from a navigator-like object', () => {
    expect(browserSupportsWebGpu(/** @type {any} */ ({ gpu: {} }))).toBe(true);
    expect(browserSupportsWebGpu(/** @type {any} */ ({}))).toBe(false);
    expect(browserSupportsWebGpu(null)).toBe(false);
  });

  test('loads model-specific default sampling settings from config', () => {
    expect(
      MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.generation
    ).toMatchObject({
      defaultTemperature: 0.6,
      defaultTopK: 50,
      defaultTopP: 0.9,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.generation).toMatchObject({
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
    expect(MODEL_OPTIONS).toHaveLength(4);
    expect(MODEL_OPTIONS_BY_ID.get('LiquidAI/LFM2.5-350M-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('LiquidAI/LFM2.5-1.2B-Instruct-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('LiquidAI/LFM2.5-1.2B-Thinking-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Qwen3.5-0.8B-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/gemma-3n-E2B-it-ONNX')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa')).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.hidden).toBe(false);
    expect(MODEL_OPTIONS.some((model) => model.id === QWEN_2B_MODEL_ID)).toBe(true);
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Qwen3-1.7B-ONNX')).toBeUndefined();
  });

  test('keeps the ONNX Qwen model available on both cpu and webgpu paths', () => {
    expect(
      getModelAvailability(QWEN_2B_MODEL_ID, {
        backendPreference: 'cpu',
        webGpuAvailable: false,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
    expect(
      getModelAvailability(QWEN_2B_MODEL_ID, {
        backendPreference: 'webgpu',
        webGpuAvailable: true,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
  });

  test('resolves mode-specific runtime dtypes from config', () => {
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.runtime, 'webgpu')
    ).toBe('q4f16');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.runtime, 'cpu')
    ).toBe('q4');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.runtime, 'cpu')
    ).toBe('uint8');
  });

  test('maps the temporary llama 3.2 3B full ONNX repo id back to the browser repo id', () => {
    expect(normalizeModelId('onnx-community/Llama-3.2-3B-Instruct-ONNX')).toBe(LLAMA_3B_MODEL_ID);
  });

  test('maps the retired LiteRT Qwen id to the ONNX q4 model', () => {
    expect(normalizeModelId('Yoursmiling/Qwen3.5-2B-LiteRT')).toBe(QWEN_2B_MODEL_ID);
  });

  test('falls back to the default model for removed model ids', () => {
    expect(normalizeModelId('onnx-community/Qwen3-0.6B-ONNX')).toBe(LLAMA_1B_MODEL_ID);
    expect(normalizeModelId('litert-community/gemma-4-E4B-it-litert-lm')).toBe(LLAMA_1B_MODEL_ID);
  });

  test('exposes model feature flags from config', () => {
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(
      MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.features
    ).toMatchObject({
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
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: true,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(
      MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.runtime
    ).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'q4',
      },
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'uint8',
      },
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'q4',
      },
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'q4',
      },
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.inputLimits).toMatchObject({
      maxImageInputs: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.inputLimits).toMatchObject({
      maxImageInputs: 1,
      maxAudioInputs: 1,
    });
    expect(
      MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.toolCalling
    ).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'parameters',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.toolCalling).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'parameters',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.toolCalling).toEqual({
      format: 'xml-tool-call',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.thinkingControl).toEqual({
      defaultEnabled: false,
      runtimeParameter: 'enable_thinking',
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
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)?.thinkingTags).toEqual({
      open: '<think>',
      close: '</think>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.toolCalling).toEqual({
      format: 'gemma-special-token-call',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)).toMatchObject({
      displayName: 'Llama 3.2 1B Instruct',
      repositoryUrl: 'https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_2B_MODEL_ID)).toMatchObject({
      displayName: 'Qwen3.5 2B Instruct',
      repositoryUrl: 'https://huggingface.co/onnx-community/Qwen3.5-2B-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)).toMatchObject({
      displayName: 'Gemma 4 E2B',
      repositoryUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX',
    });
  });
});
