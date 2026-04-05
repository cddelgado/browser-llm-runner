import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_ID,
  browserSupportsWebGpu,
  getFirstAvailableModelId,
  getModelAvailability,
} from '../../src/config/model-settings.js';

const LIQUID_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Thinking-ONNX';
const LIQUID_SMALL_MODEL_ID = 'LiquidAI/LFM2.5-350M-ONNX';
const LIQUID_INSTRUCT_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX';
const LLAMA_1B_MODEL_ID = 'onnx-community/Llama-3.2-1B-Instruct-ONNX';
const QWEN_SMALL_MODEL_ID = 'onnx-community/Qwen3.5-0.8B-ONNX';
const QWEN_MODEL_ID = 'onnx-community/Qwen3.5-2B-ONNX';
const GEMMA_4_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const GEMMA_MODEL_ID = 'onnx-community/gemma-3n-E2B-it-ONNX';

describe('model-settings availability', () => {
  test('marks the LiquidAI thinking model unavailable without WebGPU', () => {
    expect(
      getModelAvailability(LIQUID_MODEL_ID, {
        backendPreference: 'auto',
        webGpuAvailable: false,
      }),
    ).toEqual({
      available: false,
      reason: 'This model requires WebGPU, which is not available in this browser.',
    });
  });

  test('marks the LiquidAI thinking model unavailable for wasm and cpu backends', () => {
    expect(
      getModelAvailability(LIQUID_MODEL_ID, {
        backendPreference: 'wasm',
        webGpuAvailable: true,
      }),
    ).toEqual({
      available: false,
      reason: 'This model requires WebGPU. Choose Auto or WebGPU only.',
    });

    expect(
      getModelAvailability(LIQUID_MODEL_ID, {
        backendPreference: 'cpu',
        webGpuAvailable: true,
      }),
    ).toEqual({
      available: false,
      reason: 'This model requires WebGPU. Choose Auto or WebGPU only.',
    });
  });

  test('marks the visible LiquidAI models unavailable without WebGPU or on non-WebGPU backends', () => {
    [LIQUID_SMALL_MODEL_ID, LIQUID_INSTRUCT_MODEL_ID].forEach((modelId) => {
      expect(
        getModelAvailability(modelId, {
          backendPreference: 'auto',
          webGpuAvailable: false,
        }),
      ).toEqual({
        available: false,
        reason: 'This model requires WebGPU, which is not available in this browser.',
      });

      expect(
        getModelAvailability(modelId, {
          backendPreference: 'wasm',
          webGpuAvailable: true,
        }),
      ).toEqual({
        available: false,
        reason: 'This model requires WebGPU. Choose Auto or WebGPU only.',
      });
    });
  });

  test('keeps the LiquidAI thinking model available when WebGPU is usable', () => {
    expect(
      getModelAvailability(LIQUID_MODEL_ID, {
        backendPreference: 'webgpu',
        webGpuAvailable: true,
      }),
    ).toEqual({
      available: true,
      reason: '',
    });
  });

  test('falls back to the default model when the current backend cannot use the LiquidAI model', () => {
    expect(
      getFirstAvailableModelId({
        backendPreference: 'wasm',
        webGpuAvailable: true,
      }),
    ).toBe(DEFAULT_MODEL);
  });

  test('detects WebGPU support from a navigator-like object', () => {
    expect(browserSupportsWebGpu(/** @type {any} */ ({ gpu: {} }))).toBe(true);
    expect(browserSupportsWebGpu(/** @type {any} */ ({}))).toBe(false);
    expect(browserSupportsWebGpu(null)).toBe(false);
  });

  test('loads model-specific default sampling settings from config', () => {
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-3B-Instruct-onnx-web')?.generation).toMatchObject({
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
      defaultTemperature: 0.7,
      defaultTopK: 20,
      defaultTopP: 0.8,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.1,
      defaultTopK: 50,
      defaultTopP: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.1,
      defaultTopK: 50,
      defaultTopP: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.7,
      defaultTopK: 20,
      defaultTopP: 0.8,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 1,
      defaultTopK: 65,
      defaultTopP: 0.95,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.1,
      defaultTopK: 50,
      defaultTopP: 0.1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.generation).toMatchObject({
      defaultTemperature: 0.6,
      defaultTopK: 65,
      defaultTopP: 0.95,
    });
  });

  test('keeps hidden replacement models addressable while removing them from the visible catalog', () => {
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.hidden).toBe(true);
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.hidden).toBe(true);
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa')?.hidden).toBe(
      true,
    );
    expect(
      getModelAvailability(GEMMA_MODEL_ID, {
        backendPreference: 'webgpu',
        webGpuAvailable: true,
      }),
    ).toEqual({
      available: true,
      reason: '',
    });
    expect(MODEL_OPTIONS.some((model) => model.id === GEMMA_MODEL_ID)).toBe(false);
    expect(MODEL_OPTIONS.some((model) => model.id === LIQUID_MODEL_ID)).toBe(false);
    expect(MODEL_OPTIONS.some((model) => model.id === 'onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa')).toBe(
      false,
    );
  });

  test('marks the Gemma multimodal model unavailable without WebGPU', () => {
    expect(
      getModelAvailability(GEMMA_MODEL_ID, {
        backendPreference: 'auto',
        webGpuAvailable: false,
      }),
    ).toEqual({
      available: false,
      reason: 'This model requires WebGPU, which is not available in this browser.',
    });
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
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-3B-Instruct-onnx-web')?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
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
      toolCalling: false,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: false,
      imageInput: false,
      audioInput: false,
      videoInput: false,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.runtime).toMatchObject({
      requiresWebGpu: true,
      multimodalGeneration: true,
      dtype: {
        audio_encoder: 'fp32',
        vision_encoder: 'fp32',
        embed_tokens: 'q4',
        decoder_model_merged: 'q4',
      },
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.runtime).toMatchObject({
      dtype: 'q4f16',
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)?.runtime).toMatchObject({
      dtype: 'q4',
      requiresWebGpu: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.runtime).toMatchObject({
      dtype: 'q4',
      requiresWebGpu: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.runtime).toMatchObject({
      dtype: 'q4f16',
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.runtime?.requiresWebGpu).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.runtime).toMatchObject({
      dtype: 'q4f16',
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.runtime?.requiresWebGpu).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.runtime).toMatchObject({
      dtype: 'q4f16',
      multimodalGeneration: true,
      useExternalDataFormat: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.runtime?.requiresWebGpu).toBeUndefined();
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)?.inputLimits).toEqual({
      maxImageInputs: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)?.inputLimits).toEqual({
      maxImageInputs: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.inputLimits).toEqual({
      maxAudioInputs: 1,
    });
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-3B-Instruct-onnx-web')?.toolCalling).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'parameters',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LLAMA_1B_MODEL_ID)?.toolCalling).toBeNull();
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_SMALL_MODEL_ID)?.toolCalling).toBeNull();
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_INSTRUCT_MODEL_ID)?.toolCalling).toBeNull();
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
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.toolCalling).toEqual({
      format: 'special-token-call',
      callOpen: '<|tool_call_start|>[',
      callClose: ']<|tool_call_end|>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)?.toolCalling).toEqual({
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
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_SMALL_MODEL_ID)).toMatchObject({
      displayName: 'Qwen3.5 0.8B',
      repositoryUrl: 'https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(QWEN_MODEL_ID)).toMatchObject({
      displayName: 'Qwen3.5 2B',
      repositoryUrl: 'https://huggingface.co/onnx-community/Qwen3.5-2B-ONNX',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_4_MODEL_ID)).toMatchObject({
      displayName: 'Gemma 4 E2B',
      repositoryUrl: 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX',
    });
  });
});
