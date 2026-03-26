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
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Qwen3-0.6B-ONNX')?.generation).toMatchObject({
      defaultTemperature: 0.6,
      defaultTopK: 20,
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

  test('keeps the Gemma model available in the visible model catalog', () => {
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.hidden).toBe(false);
    expect(
      getModelAvailability(GEMMA_MODEL_ID, {
        backendPreference: 'webgpu',
        webGpuAvailable: true,
      }),
    ).toEqual({
      available: true,
      reason: '',
    });
    expect(MODEL_OPTIONS.some((model) => model.id === GEMMA_MODEL_ID)).toBe(true);
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
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Qwen3-0.6B-ONNX')?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
      imageInput: false,
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
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: false,
      toolCalling: true,
      imageInput: true,
      audioInput: true,
      videoInput: true,
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.features).toMatchObject({
      streaming: true,
      thinking: true,
      toolCalling: true,
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
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Llama-3.2-3B-Instruct-onnx-web')?.toolCalling).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'parameters',
    });
    expect(MODEL_OPTIONS_BY_ID.get('onnx-community/Qwen3-0.6B-ONNX')?.toolCalling).toEqual({
      format: 'tagged-json',
      nameKey: 'name',
      argumentsKey: 'arguments',
      openTag: '<tool_call>',
      closeTag: '</tool_call>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(LIQUID_MODEL_ID)?.toolCalling).toEqual({
      format: 'special-token-call',
      callOpen: '<|tool_call_start|>[',
      callClose: ']<|tool_call_end|>',
    });
    expect(MODEL_OPTIONS_BY_ID.get(GEMMA_MODEL_ID)?.toolCalling).toEqual({
      format: 'json',
      nameKey: 'name',
      argumentsKey: 'arguments',
    });
  });
});
