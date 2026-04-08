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

const LIQUID_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Thinking-ONNX';
const LIQUID_SMALL_MODEL_ID = 'LiquidAI/LFM2.5-350M-ONNX';
const LIQUID_INSTRUCT_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX';
const LLAMA_3B_MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct-onnx-web';
const LLAMA_1B_MODEL_ID = 'onnx-community/Llama-3.2-1B-Instruct-ONNX';
const QWEN_SMALL_MODEL_ID = 'onnx-community/Qwen3.5-0.8B-ONNX';
const QWEN_MODEL_ID = 'onnx-community/Qwen3.5-2B-ONNX';
const GEMMA_4_MODEL_ID = 'litert-community/gemma-4-E4B-it-litert-lm';
const LEGACY_GEMMA_4_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const GEMMA_MODEL_ID = 'onnx-community/gemma-3n-E2B-it-ONNX';

describe('model-settings availability', () => {
  test('uses Gemma 4 as the default model and keeps it first in the visible catalog', () => {
    expect(DEFAULT_MODEL).toBe(GEMMA_4_MODEL_ID);
    expect(MODEL_OPTIONS[0]?.id).toBe(GEMMA_4_MODEL_ID);
  });

  test('marks the LiquidAI thinking model unavailable in cpu mode without WebGPU', () => {
    expect(
      getModelAvailability(LIQUID_MODEL_ID, {
        backendPreference: 'cpu',
        webGpuAvailable: false,
      })
    ).toEqual({
      available: false,
      reason: 'This model requires WebGPU, which is not available in this browser.',
    });
  });

  test('maps legacy wasm preference into cpu mode for the LiquidAI thinking model', () => {
    expect(
      getModelAvailability(LIQUID_MODEL_ID, {
        backendPreference: 'wasm',
        webGpuAvailable: true,
      })
    ).toEqual({
      available: false,
      reason: 'This model requires WebGPU. Switch to WebGPU mode.',
    });
  });

  test('keeps the visible LiquidAI models available only when WebGPU can be used', () => {
    [LIQUID_SMALL_MODEL_ID, LIQUID_INSTRUCT_MODEL_ID].forEach((modelId) => {
      expect(
        getModelAvailability(modelId, {
          backendPreference: 'cpu',
          webGpuAvailable: false,
        })
      ).toEqual({
        available: false,
        reason: 'This model requires WebGPU, which is not available in this browser.',
      });

      expect(
        getModelAvailability(modelId, {
          backendPreference: 'webgpu',
          webGpuAvailable: true,
        })
      ).toEqual({
        available: true,
        reason: '',
      });
    });
  });

  test('keeps the LiquidAI thinking model available when WebGPU is usable', () => {
    expect(
      getModelAvailability(LIQUID_MODEL_ID, {
        backendPreference: 'webgpu',
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
    ).toBe(LLAMA_3B_MODEL_ID);
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
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.6,
      defaultTopK: 20,
      defaultTopP: 0.95,
      defaultRepetitionPenalty: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.1,
      defaultTopK: 50,
      defaultTopP: 1,
      defaultRepetitionPenalty: 1.05,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.1,
      defaultTopK: 50,
      defaultTopP: 1,
      defaultRepetitionPenalty: 1.05,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.6,
      defaultTopK: 20,
      defaultTopP: 0.95,
      defaultRepetitionPenalty: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 1,
      defaultTopK: 64,
      defaultTopP: 0.95,
      defaultRepetitionPenalty: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.1,
      defaultTopK: 50,
      defaultTopP: 1,
      defaultRepetitionPenalty: 1.05,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.6,
      defaultTopK: 65,
      defaultTopP: 0.95,
      defaultRepetitionPenalty: 1,
    });
  });

  test('keeps hidden replacement models addressable while removing them from the visible catalog', () => {
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.hidden).toBe(true);
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.hidden).toBe(true);
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.hidden).toBe(true);
    expect(MODEL_OPTIONS_BY_ID.get(LEGACY_GEMMA_4_MODEL_ID)?.hidden).toBe(true);
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.hidden).toBe(false);
    expect(
      MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa')?.hidden
    ).toBe(true);
    expect(
      getModelAvailability(GEMMA_MODEL_ID, {
        backendPreference: 'webgpu',
        webGpuAvailable: true,
      })
    ).toEqual({
      available: true,
      reason: '',
    });
    expect(MODEL_OPTIONS.some((model) => model.id === QWEN_SMALL_MODEL_ID)).toBe(false);
    expect(MODEL_OPTIONS.some((model) => model.id === QWEN_MODEL_ID)).toBe(false);
    expect(MODEL_OPTIONS.some((model) => model.id === GEMMA_MODEL_ID)).toBe(false);
    expect(MODEL_OPTIONS.some((model) => model.id === LEGACY_GEMMA_4_MODEL_ID)).toBe(false);
    expect(MODEL_OPTIONS.some((model) => model.id === LIQUID_MODEL_ID)).toBe(true);
    expect(
      MODEL_OPTIONS.some(
        (model) => model.id === 'onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa'
      )
    ).toBe(false);
  });

  test('keeps the Gemma multimodal ONNX model available in cpu mode without WebGPU', () => {
    expect(
      getModelAvailability(GEMMA_MODEL_ID, {
        backendPreference: 'cpu',
        webGpuAvailable: false,
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
    ).toBe('int8');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.runtime, 'cpu')
    ).toBeNull();
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.runtime, 'webgpu')
    ).toBe('q4f16');
    expect(
      resolveRuntimeDtypeForBackend(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.runtime, 'webgpu')
    ).toBe('q8');
  });

  test('maps the temporary llama 3.2 3B full ONNX repo id back to the browser repo id', () => {
    expect(normalizeModelId('onnx-community/Llama-3.2-3B-Instruct-ONNX')).toBe(LLAMA_3B_MODEL_ID);
  });

  test('exposes model feature flags from config', () => {
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: false,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: true,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: true,
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
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LEGACY_GEMMA_4_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: true,
      audioInput: true,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: true,
      imageInput: true,
      audioInput: true,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.engine).toEqual({
      type: 'mediapipe-genai',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LEGACY_GEMMA_4_MODEL_ID)?.engine).toEqual({
      type: 'transformers-js',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.runtime).toMatchObject({
      multimodalGeneration: true,
      dtypes: {
        webgpu: 'q8',
        cpu: 'q8',
      },
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
        cpu: 'int8',
      },
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
      },
      requiresWebGpu: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
      },
      requiresWebGpu: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'q8',
      },
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.runtime?.requiresWebGpu).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'q8',
      },
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.runtime?.requiresWebGpu).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.runtime).toMatchObject({
      requiresWebGpu: true,
      modelAssetPath:
        'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/439779041cf1a165146a3ee1f9a7653b2f047975/gemma-4-E4B-it-web.task',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LEGACY_GEMMA_4_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
        cpu: 'q8',
      },
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(
      MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.runtime?.multimodalGeneration
    ).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.inputLimits).toEqual({
      maxImageInputs: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.inputLimits).toEqual({
      maxImageInputs: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LEGACY_GEMMA_4_MODEL_ID)?.inputLimits).toEqual({
      maxAudioInputs: 1,
    });
    expect(
      MODEL_OPTIONS_BY_ID.get(LLAMA_3B_MODEL_ID)?.toolCalling
    ).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'parameters',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.toolCalling).toBeNull();
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)?.toolCalling).toEqual({
      toolListFormat: 'json',
      format: 'special-token-call',
      callOpen: '<|tool_call_start|>[',
      callClose: ']<|tool_call_end|>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.toolCalling).toEqual({
      toolListFormat: 'json',
      format: 'special-token-call',
      callOpen: '<|tool_call_start|>[',
      callClose: ']<|tool_call_end|>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.toolCalling).toEqual({
      format: 'xml-tool-call',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.toolCalling).toEqual({
      format: 'xml-tool-call',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.thinkingControl).toEqual({
      defaultEnabled: false,
      runtimeParameter: 'enable_thinking',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.thinkingControl).toEqual({
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
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.toolCalling).toEqual({
      toolListFormat: 'json',
      format: 'special-token-call',
      callOpen: '<|tool_call_start|>[',
      callClose: ']<|tool_call_end|>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.runtime).toMatchObject({
      dtypes: {
        webgpu: 'q4f16',
      },
      requiresWebGpu: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.toolCalling).toEqual({
      format: 'gemma-special-token-call',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LEGACY_GEMMA_4_MODEL_ID)?.toolCalling).toEqual({
      format: 'gemma-special-token-call',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.toolCalling).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'arguments',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)).toMatchObject({
      displayName: 'Llama 3.2 1B Instruct',
      repositoryUrl: 'https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)).toMatchObject({
      displayName: 'Liquid LFM 2.5 350M',
      repositoryUrl: 'https://huggingface.co/LiquidAI/LFM2.5-350M-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)).toMatchObject({
      displayName: 'Liquid LFM 2.5 1.2B Instruct',
      repositoryUrl: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)).toMatchObject({
      displayName: 'Liquid LFM 2.5 1.2B Thinking',
      repositoryUrl: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-Thinking-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)).toMatchObject({
      displayName: 'Qwen3.5 0.8B',
      repositoryUrl: 'https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)).toMatchObject({
      displayName: 'Qwen3.5 2B',
      repositoryUrl: 'https://huggingface.co/onnx-community/Qwen3.5-2B-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)).toMatchObject({
      displayName: 'Gemma 4 E4B',
      repositoryUrl: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LEGACY_GEMMA_4_MODEL_ID)).toMatchObject({
      displayName: 'Gemma 4 E2B',
      repositoryUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX',
    });
  });
});
