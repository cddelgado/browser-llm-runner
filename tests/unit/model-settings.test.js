import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODEL,
  browserSupportsWebGpu,
  getFirstAvailableModelId,
  getModelAvailability,
} from '../../src/config/model-settings.js';

const LIQUID_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Thinking-ONNX';

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
});
