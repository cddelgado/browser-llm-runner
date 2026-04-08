import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createAppState } from '../../src/state/app-state.js';
import { createModelPreferencesController } from '../../src/app/preferences-models.js';

function createHarness({
  navigatorRef = /** @type {any} */ ({ gpu: {} }),
  appStateOverrides = {},
} = {}) {
  const dom = new JSDOM(
    `
      <div id="modelCardList"></div>
      <select id="modelSelect"></select>
      <select id="backendSelect">
        <option value="webgpu">WebGPU</option>
        <option value="cpu">CPU</option>
      </select>
    `,
    { url: 'https://example.test/' }
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;

  const appState = createAppState({ activeGenerationConfig: { maxOutputTokens: 256 } });
  appState.webGpuProbeCompleted = true;
  appState.webGpuAdapterAvailable = true;
  Object.assign(appState, appStateOverrides);

  const deps = {
    getRuntimeConfigForModel: vi.fn((modelId) => ({ runtimeModelId: modelId })),
    syncGenerationSettingsFromModel: vi.fn(),
    persistGenerationConfigForModel: vi.fn(),
    setStatus: vi.fn(),
    appendDebug: vi.fn(),
  };

  return {
    appState,
    deps,
    document,
    storage: dom.window.localStorage,
    controller: createModelPreferencesController({
      appState,
      storage: dom.window.localStorage,
      navigatorRef,
      documentRef: document,
      modelStorageKey: 'model',
      backendStorageKey: 'backend',
      supportedBackendPreferences: new Set(['webgpu', 'cpu']),
      webGpuRequiredModelSuffix: ' (WebGPU required)',
      modelSelect: document.getElementById('modelSelect'),
      modelCardList: document.getElementById('modelCardList'),
      backendSelect: document.getElementById('backendSelect'),
      ...deps,
    }),
  };
}

describe('preferences-models', () => {
  test('renders model cards with metadata and supports keyboard navigation', () => {
    const harness = createHarness();
    const modelCardList = /** @type {HTMLElement} */ (
      harness.document.getElementById('modelCardList')
    );
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );

    harness.controller.populateModelSelect();

    const cards = Array.from(modelCardList.querySelectorAll('.model-card'));
    expect(cards.length).toBe(modelSelect.querySelectorAll('option').length);

    const gemmaCard = cards.find((card) => card.textContent?.includes('Gemma 4 E4B'));
    expect(gemmaCard?.textContent).toContain('131,072 tokens');
    expect(gemmaCard?.querySelectorAll('.model-feature-pill')).toHaveLength(2);
    expect(gemmaCard?.textContent).toContain('This model requires WebGPU.');
    expect(
      gemmaCard?.querySelector('.model-card-languages .bi-translate')?.getAttribute('aria-label')
    ).toBe(
      'Supported languages: English (EN), Spanish (ES), French (FR), Chinese (ZH), Hindi (HI), Japanese (JA), and more.'
    );

    const qwenLiteRtCard = cards.find((card) => card.textContent?.includes('Qwen3.5 2B LiteRT'));
    expect(qwenLiteRtCard?.textContent).toContain('Unavailable');
    expect(qwenLiteRtCard?.textContent).toContain('Unavailable in this app.');
    expect(qwenLiteRtCard?.textContent).toContain(
      'This LiteRT export is not currently compatible with the browser MediaPipe runtime used by this app.'
    );
    expect(
      qwenLiteRtCard?.querySelector('.model-card-button')?.getAttribute('title')
    ).toContain('This LiteRT export is not currently compatible');
    expect(cards.some((card) => card.textContent?.includes('Liquid LFM 2.5 350M'))).toBe(false);
    expect(cards.some((card) => card.textContent?.includes('Liquid LFM 2.5 1.2B Instruct'))).toBe(
      false
    );
    expect(cards.some((card) => card.textContent?.includes('Liquid LFM 2.5 1.2B Thinking'))).toBe(
      false
    );

    const gemmaButton = /** @type {HTMLButtonElement | null} */ (
      gemmaCard?.querySelector('.model-card-button')
    );
    gemmaButton?.click();
    expect(modelSelect.value).toBe('litert-community/gemma-4-E4B-it-litert-lm');
    expect(gemmaButton?.getAttribute('aria-checked')).toBe('true');

    modelCardList.dispatchEvent(
      new harness.document.defaultView.KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    );

    const firstButton = /** @type {HTMLButtonElement | null} */ (
      modelCardList.querySelector('.model-card-button')
    );
    expect(modelSelect.value).toBe(firstButton?.dataset.modelId);
    expect(harness.document.activeElement).toBe(firstButton);
    expect(firstButton?.getAttribute('aria-checked')).toBe('true');
  });

  test('falls back from WebGPU-only models when the backend cannot run them', () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );
    const backendSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('backendSelect')
    );

    harness.controller.populateModelSelect();
    modelSelect.value = 'litert-community/gemma-4-E4B-it-litert-lm';
    backendSelect.value = 'cpu';

    const selectedModel = harness.controller.syncModelSelectionForCurrentEnvironment({
      announceFallback: true,
    });

    expect(selectedModel).not.toBe('litert-community/gemma-4-E4B-it-litert-lm');
    expect(modelSelect.value).toBe(selectedModel);
    expect(harness.deps.setStatus).toHaveBeenCalledWith(expect.stringContaining('CPU'));
  });

  test('restores a stored hidden model as the first visible available model', () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );

    harness.storage.setItem('model', 'LiquidAI/LFM2.5-1.2B-Thinking-ONNX');
    harness.storage.setItem('backend', 'webgpu');

    harness.controller.restoreInferencePreferences();

    expect(
      harness.controller.getAvailableModelId('LiquidAI/LFM2.5-1.2B-Thinking-ONNX', 'webgpu')
    ).toBe('litert-community/gemma-4-E4B-it-litert-lm');
    expect(modelSelect.value).toBe('litert-community/gemma-4-E4B-it-litert-lm');
    expect(harness.storage.getItem('model')).toBe('litert-community/gemma-4-E4B-it-litert-lm');
    expect(harness.storage.getItem('backend')).toBe('webgpu');
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledWith(
      'litert-community/gemma-4-E4B-it-litert-lm',
      true
    );
  });

  test('reads and persists inference preferences through the engine-facing contract', () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );
    const backendSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('backendSelect')
    );
    const generationConfig = { maxOutputTokens: 512 };

    harness.controller.populateModelSelect();
    modelSelect.value = 'onnx-community/Llama-3.2-1B-Instruct-ONNX';
    backendSelect.value = 'cpu';

    const engineConfig = harness.controller.readEngineConfigFromUI(generationConfig);

    expect(engineConfig).toEqual({
      engineType: 'transformers-js',
      modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      backendPreference: 'cpu',
      runtime: { runtimeModelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX' },
      generationConfig,
    });
    expect(harness.deps.getRuntimeConfigForModel).toHaveBeenCalledWith(
      'onnx-community/Llama-3.2-1B-Instruct-ONNX'
    );
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledWith(
      'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      false
    );

    harness.controller.persistInferencePreferences(generationConfig);

    expect(harness.storage.getItem('model')).toBe('onnx-community/Llama-3.2-1B-Instruct-ONNX');
    expect(harness.storage.getItem('backend')).toBe('cpu');
    expect(harness.deps.persistGenerationConfigForModel).toHaveBeenCalledWith(
      'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      generationConfig
    );
  });

  test('probes WebGPU availability and falls back when no adapter is available', async () => {
    const requestAdapter = vi.fn(async () => null);
    const harness = createHarness({
      navigatorRef: /** @type {any} */ ({
        gpu: {
          requestAdapter,
        },
      }),
      appStateOverrides: {
        webGpuProbeCompleted: false,
        webGpuAdapterAvailable: true,
      },
    });

    harness.controller.populateModelSelect();
    harness.controller.setSelectedModelId('litert-community/gemma-4-E4B-it-litert-lm');

    const adapterAvailable = await harness.controller.probeWebGpuAvailability();

    expect(adapterAvailable).toBe(false);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(harness.appState.webGpuProbeCompleted).toBe(true);
    expect(harness.appState.webGpuAdapterAvailable).toBe(false);
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledWith(
      expect.not.stringContaining('litert-community/gemma-4-E4B-it-litert-lm'),
      true
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      expect.stringContaining('no usable WebGPU adapter was found')
    );
  });
});
