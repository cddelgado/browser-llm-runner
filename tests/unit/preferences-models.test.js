import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createAppState } from '../../src/state/app-state.js';
import { createModelPreferencesController } from '../../src/app/preferences-models.js';

const GEMMA_4_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const LLAMA_3B_MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct-onnx-web';
const BONSAI_8B_MODEL_ID = 'onnx-community/Bonsai-8B-ONNX';

function getModelCard(modelCardList, modelId) {
  const button = Array.from(modelCardList.querySelectorAll('.model-card-button')).find(
    (candidate) => candidate instanceof HTMLButtonElement && candidate.dataset.modelId === modelId
  );
  return button?.closest('.model-card') || null;
}

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
      <input id="cpuThreadsInput" type="number" />
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
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
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
      cpuThreadsStorageKey: 'cpu-threads',
      supportedBackendPreferences: new Set(['webgpu', 'cpu']),
      webGpuRequiredModelSuffix: ' (WebGPU required)',
      modelSelect: document.getElementById('modelSelect'),
      modelCardList: document.getElementById('modelCardList'),
      backendSelect: document.getElementById('backendSelect'),
      cpuThreadsInput: document.getElementById('cpuThreadsInput'),
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

    const gemmaCard = getModelCard(modelCardList, GEMMA_4_MODEL_ID);
    expect(gemmaCard?.textContent).toContain('131,072 tokens');
    expect(gemmaCard?.querySelectorAll('.model-feature-pill')).toHaveLength(4);
    expect(
      gemmaCard?.querySelector('.model-card-languages .bi-translate')?.getAttribute('aria-label')
    ).toBe(
      'Supported languages: English (EN), Spanish (ES), French (FR), Chinese (ZH), Hindi (HI), Japanese (JA), and more.'
    );

    const llama3BCard = getModelCard(modelCardList, LLAMA_3B_MODEL_ID);
    expect(llama3BCard?.textContent).toContain('131,072 tokens');
    expect(
      Array.from(llama3BCard?.querySelectorAll('.model-feature-pill') || []).map((node) =>
        node.getAttribute('aria-label')
      )
    ).toEqual(['Can use built-in tools']);
    expect(getModelCard(modelCardList, 'LiquidAI/LFM2.5-350M-ONNX')).toBeNull();
    expect(getModelCard(modelCardList, 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX')).toBeNull();
    expect(getModelCard(modelCardList, 'LiquidAI/LFM2.5-1.2B-Thinking-ONNX')).toBeNull();
    expect(getModelCard(modelCardList, 'onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa')).toBe(
      null
    );
    expect(getModelCard(modelCardList, 'onnx-community/Qwen3.5-2B-ONNX')).toBeNull();

    const bonsaiCard = getModelCard(modelCardList, BONSAI_8B_MODEL_ID);
    expect(bonsaiCard?.textContent).toContain('65,536 tokens');
    expect(
      Array.from(bonsaiCard?.querySelectorAll('.model-feature-pill') || []).map((node) =>
        node.getAttribute('aria-label')
      )
    ).toEqual(['Shows a thinking section', 'Can use built-in tools']);

    const gemmaButton = /** @type {HTMLButtonElement | null} */ (
      gemmaCard?.querySelector('.model-card-button')
    );
    gemmaButton?.click();
    expect(modelSelect.value).toBe(GEMMA_4_MODEL_ID);
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

  test('keeps Gemma available when CPU mode is selected', () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );
    const backendSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('backendSelect')
    );

    harness.controller.populateModelSelect();
    modelSelect.value = GEMMA_4_MODEL_ID;
    backendSelect.value = 'cpu';

    const selectedModel = harness.controller.syncModelSelectionForCurrentEnvironment({
      announceFallback: true,
    });

    expect(selectedModel).toBe(GEMMA_4_MODEL_ID);
    expect(modelSelect.value).toBe(selectedModel);
    expect(harness.deps.setStatus).not.toHaveBeenCalled();
  });

  test('restores a removed model id as the default visible model', () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );

    harness.storage.setItem('model', 'onnx-community/Qwen3.5-2B-ONNX');
    harness.storage.setItem('backend', 'webgpu');

    harness.controller.restoreInferencePreferences();

    expect(harness.controller.getAvailableModelId('onnx-community/Qwen3.5-2B-ONNX', 'webgpu')).toBe(
      GEMMA_4_MODEL_ID
    );
    expect(modelSelect.value).toBe(GEMMA_4_MODEL_ID);
    expect(harness.storage.getItem('model')).toBe(GEMMA_4_MODEL_ID);
    expect(harness.storage.getItem('backend')).toBe('webgpu');
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledWith(
      GEMMA_4_MODEL_ID,
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
    const cpuThreadsInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cpuThreadsInput')
    );
    const generationConfig = { maxOutputTokens: 512 };

    harness.controller.populateModelSelect();
    modelSelect.value = LLAMA_3B_MODEL_ID;
    backendSelect.value = 'cpu';
    cpuThreadsInput.value = '3';

    const engineConfig = harness.controller.readEngineConfigFromUI(generationConfig);

    expect(engineConfig).toEqual({
      engineType: 'transformers-js',
      modelId: LLAMA_3B_MODEL_ID,
      backendPreference: 'cpu',
      runtime: { runtimeModelId: LLAMA_3B_MODEL_ID, cpuThreads: 3 },
      generationConfig,
    });
    expect(harness.deps.getRuntimeConfigForModel).toHaveBeenCalledWith(LLAMA_3B_MODEL_ID);
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledWith(
      LLAMA_3B_MODEL_ID,
      false
    );

    harness.controller.persistInferencePreferences(generationConfig);

    expect(harness.storage.getItem('model')).toBe(LLAMA_3B_MODEL_ID);
    expect(harness.storage.getItem('backend')).toBe('cpu');
    expect(harness.storage.getItem('cpu-threads')).toBe('3');
    expect(harness.deps.persistGenerationConfigForModel).toHaveBeenCalledWith(
      LLAMA_3B_MODEL_ID,
      generationConfig
    );
  });

  test('restores the persisted cpu thread preference into the system control', () => {
    const harness = createHarness({
      navigatorRef: /** @type {any} */ ({
        gpu: {},
        hardwareConcurrency: 6,
      }),
    });
    const cpuThreadsInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cpuThreadsInput')
    );

    harness.storage.setItem('cpu-threads', '5');

    harness.controller.restoreInferencePreferences();

    expect(cpuThreadsInput.value).toBe('5');
    expect(cpuThreadsInput.max).toBe('6');
  });

  test('probes WebGPU availability and keeps cpu-capable Gemma selected when no adapter is available', async () => {
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
    harness.controller.setSelectedModelId(GEMMA_4_MODEL_ID);

    const adapterAvailable = await harness.controller.probeWebGpuAvailability();

    expect(adapterAvailable).toBe(false);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(harness.appState.webGpuProbeCompleted).toBe(true);
    expect(harness.appState.webGpuAdapterAvailable).toBe(false);
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledWith(
      GEMMA_4_MODEL_ID,
      true
    );
    expect(harness.deps.setStatus).not.toHaveBeenCalled();
  });
});
