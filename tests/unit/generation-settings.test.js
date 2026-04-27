import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createGenerationSettingsController } from '../../src/app/generation-settings.js';
import { buildDefaultGenerationConfig } from '../../src/config/generation-config.js';
import { normalizeGenerationLimits } from '../../src/config/model-settings.js';

const LLAMA_MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct-onnx-web';
const WLLAMA_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Thinking-GGUF';
const GENERATION_STORAGE_KEY = 'generation-settings';
const WLLAMA_STORAGE_KEY = 'wllama-settings';

function createHarness({ isGenerating = false, isEngineReady = false } = {}) {
  const dom = new JSDOM(
    `
      <select id="modelSelect">
        <option value="${LLAMA_MODEL_ID}">Llama</option>
        <option value="${WLLAMA_MODEL_ID}">wllama</option>
      </select>
      <select id="backendSelect">
        <option value="webgpu">WebGPU</option>
        <option value="cpu">CPU</option>
      </select>
      <input id="maxOutputTokensInput" />
      <input id="maxContextTokensInput" />
      <input id="temperatureInput" />
      <button id="resetContextTokensButton" type="button"></button>
      <button id="resetTemperatureButton" type="button"></button>
      <button id="resetTopKButton" type="button"></button>
      <button id="resetTopPButton" type="button"></button>
      <input id="topKInput" />
      <input id="topPInput" />
      <section id="wllamaSettingsSection"></section>
      <input id="wllamaPromptCacheToggle" type="checkbox" checked />
      <div id="wllamaPromptCacheHelp"></div>
      <input id="wllamaBatchSizeInput" />
      <div id="wllamaBatchSizeHelp"></div>
      <input id="wllamaMinPInput" />
      <div id="wllamaMinPHelp"></div>
      <div id="maxOutputTokensHelp"></div>
      <div id="maxContextTokensHelp"></div>
      <div id="temperatureHelp"></div>
      <div id="topKHelp"></div>
      <div id="topPHelp"></div>
      <div id="clearModelDownloadsHelp"></div>
    `,
    { url: 'https://example.test/' }
  );
  const document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;

  const engine = {
    config: {
      generationConfig: {
        temperature: 0.61,
      },
    },
    setGenerationConfig: vi.fn((config) => {
      engine.config.generationConfig = config;
    }),
  };
  const appState = {
    activeGenerationConfig: buildDefaultGenerationConfig(normalizeGenerationLimits(null)),
    pendingGenerationConfig: null,
  };
  const flags = {
    isGenerating,
    isEngineReady,
  };
  const setStatus = vi.fn();
  const appendDebug = vi.fn();
  const reinitializeInferenceSettings = vi.fn(async () => {});
  const controller = createGenerationSettingsController({
    appState,
    engine,
    storage: dom.window.localStorage,
    modelGenerationSettingsStorageKey: GENERATION_STORAGE_KEY,
    modelWllamaSettingsStorageKey: WLLAMA_STORAGE_KEY,
    modelSelect: document.getElementById('modelSelect'),
    backendSelect: document.getElementById('backendSelect'),
    maxOutputTokensInput: document.getElementById('maxOutputTokensInput'),
    maxContextTokensInput: document.getElementById('maxContextTokensInput'),
    temperatureInput: document.getElementById('temperatureInput'),
    resetContextTokensButton: document.getElementById('resetContextTokensButton'),
    resetTemperatureButton: document.getElementById('resetTemperatureButton'),
    resetTopKButton: document.getElementById('resetTopKButton'),
    resetTopPButton: document.getElementById('resetTopPButton'),
    topKInput: document.getElementById('topKInput'),
    topPInput: document.getElementById('topPInput'),
    wllamaSettingsSection: document.getElementById('wllamaSettingsSection'),
    wllamaPromptCacheToggle: document.getElementById('wllamaPromptCacheToggle'),
    wllamaPromptCacheHelp: document.getElementById('wllamaPromptCacheHelp'),
    wllamaBatchSizeInput: document.getElementById('wllamaBatchSizeInput'),
    wllamaBatchSizeHelp: document.getElementById('wllamaBatchSizeHelp'),
    wllamaMinPInput: document.getElementById('wllamaMinPInput'),
    wllamaMinPHelp: document.getElementById('wllamaMinPHelp'),
    maxOutputTokensHelp: document.getElementById('maxOutputTokensHelp'),
    maxContextTokensHelp: document.getElementById('maxContextTokensHelp'),
    temperatureHelp: document.getElementById('temperatureHelp'),
    topKHelp: document.getElementById('topKHelp'),
    topPHelp: document.getElementById('topPHelp'),
    clearModelDownloadsHelp: document.getElementById('clearModelDownloadsHelp'),
    isGeneratingResponse: () => flags.isGenerating,
    isEngineReady: () => flags.isEngineReady,
    reinitializeInferenceSettings,
    setStatus,
    appendDebug,
  });

  return {
    appState,
    appendDebug,
    controller,
    document,
    dom,
    engine,
    flags,
    reinitializeInferenceSettings,
    setStatus,
    storage: dom.window.localStorage,
  };
}

function getElement(document, id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

function getInput(document, id) {
  return /** @type {HTMLInputElement} */ (document.getElementById(id));
}

function setGenerationInputs(document, values = {}) {
  const defaults = {
    maxOutputTokens: '512',
    maxContextTokens: '2048',
    temperature: '0.8',
    topK: '60',
    topP: '0.85',
  };
  const nextValues = { ...defaults, ...values };
  getInput(document, 'maxOutputTokensInput').value = nextValues.maxOutputTokens;
  getInput(document, 'maxContextTokensInput').value = nextValues.maxContextTokens;
  getInput(document, 'temperatureInput').value = nextValues.temperature;
  getInput(document, 'topKInput').value = nextValues.topK;
  getInput(document, 'topPInput').value = nextValues.topP;
}

describe('generation-settings controller', () => {
  test('syncs stored generation settings into the UI and engine', () => {
    const harness = createHarness();
    harness.storage.setItem(
      GENERATION_STORAGE_KEY,
      JSON.stringify({
        [LLAMA_MODEL_ID]: {
          maxOutputTokens: 512,
          maxContextTokens: 2048,
          temperature: 0.6,
          topK: 50,
          topP: 0.9,
          repetitionPenalty: 1,
        },
      })
    );

    harness.controller.syncGenerationSettingsFromModel(LLAMA_MODEL_ID, true);

    expect(getInput(harness.document, 'maxContextTokensInput').value).toBe('2048');
    expect(getInput(harness.document, 'maxOutputTokensInput').value).toBe('512');
    expect(getInput(harness.document, 'temperatureInput').value).toBe('0.6');
    expect(getInput(harness.document, 'topKInput').value).toBe('50');
    expect(getInput(harness.document, 'topPInput').value).toBe('0.90');
    expect(harness.engine.setGenerationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 512,
        maxContextTokens: 2048,
        temperature: 0.6,
      })
    );
    expect(getElement(harness.document, 'maxOutputTokensHelp').textContent).toContain(
      'Estimated words'
    );
    expect(getElement(harness.document, 'wllamaSettingsSection').classList.contains('d-none')).toBe(
      true
    );
    expect(getElement(harness.document, 'clearModelDownloadsHelp').textContent).toContain(
      'Transformers.js files'
    );
  });

  test('syncs wllama settings visibility, inputs, and help text', () => {
    const harness = createHarness();
    harness.storage.setItem(
      WLLAMA_STORAGE_KEY,
      JSON.stringify({
        [WLLAMA_MODEL_ID]: {
          usePromptCache: false,
          batchSize: 32,
          minP: 0.1,
        },
      })
    );

    harness.controller.syncGenerationSettingsFromModel(WLLAMA_MODEL_ID, true);

    expect(getElement(harness.document, 'wllamaSettingsSection').classList.contains('d-none')).toBe(
      false
    );
    expect(getElement(harness.document, 'wllamaSettingsSection').hasAttribute('aria-hidden')).toBe(
      false
    );
    expect(getInput(harness.document, 'wllamaPromptCacheToggle').checked).toBe(false);
    expect(getInput(harness.document, 'wllamaBatchSizeInput').value).toBe('32');
    expect(getInput(harness.document, 'wllamaMinPInput').value).toBe('0.10');
    expect(getElement(harness.document, 'wllamaPromptCacheHelp').textContent).toContain(
      'Prompt cache reuse'
    );
    expect(getElement(harness.document, 'clearModelDownloadsHelp').textContent).toContain(
      'wllama GGUF files'
    );
  });

  test('queues generation setting changes while a response is generating', () => {
    const harness = createHarness({ isGenerating: true });
    getInput(harness.document, 'modelSelect').value = LLAMA_MODEL_ID;
    setGenerationInputs(harness.document);

    harness.controller.onGenerationSettingInputChanged();

    expect(harness.appState.pendingGenerationConfig).toMatchObject({
      maxOutputTokens: 512,
      maxContextTokens: 2048,
      temperature: 0.8,
      topK: 60,
      topP: 0.85,
    });
    expect(
      JSON.parse(harness.storage.getItem(GENERATION_STORAGE_KEY))[LLAMA_MODEL_ID]
    ).toMatchObject({
      maxOutputTokens: 512,
      maxContextTokens: 2048,
    });
    expect(harness.setStatus).toHaveBeenCalledWith(
      'Generation settings will apply after current response.'
    );
    expect(harness.appendDebug).toHaveBeenCalledWith(
      'Generation settings change queued until current response completes.'
    );
  });

  test('applies pending generation settings when generation is idle', () => {
    const harness = createHarness();
    getInput(harness.document, 'modelSelect').value = LLAMA_MODEL_ID;
    harness.appState.pendingGenerationConfig = {
      maxOutputTokens: 256,
      maxContextTokens: 1024,
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      repetitionPenalty: 1,
    };

    harness.controller.applyPendingGenerationSettingsIfReady();

    expect(harness.appState.pendingGenerationConfig).toBeNull();
    expect(harness.engine.setGenerationConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 256,
        maxContextTokens: 1024,
      })
    );
    expect(harness.setStatus).toHaveBeenCalledWith('Generation settings updated.');
    expect(harness.appendDebug).toHaveBeenCalledWith(
      expect.stringContaining('Generation settings applied')
    );
  });

  test('persists wllama setting changes and reinitializes a ready engine', () => {
    const harness = createHarness({ isEngineReady: true });
    getInput(harness.document, 'modelSelect').value = WLLAMA_MODEL_ID;
    setGenerationInputs(harness.document, { maxContextTokens: '1024' });
    getInput(harness.document, 'wllamaPromptCacheToggle').checked = false;
    getInput(harness.document, 'wllamaBatchSizeInput').value = '32';
    getInput(harness.document, 'wllamaMinPInput').value = '0.10';

    harness.controller.onWllamaSettingInputChanged();

    expect(JSON.parse(harness.storage.getItem(WLLAMA_STORAGE_KEY))[WLLAMA_MODEL_ID]).toMatchObject({
      usePromptCache: false,
      batchSize: 32,
      minP: 0.1,
    });
    expect(harness.reinitializeInferenceSettings).toHaveBeenCalledTimes(1);
    expect(harness.appendDebug).toHaveBeenCalledWith(
      expect.stringContaining('wllama settings updated')
    );
  });

  test('keeps generation controls editable before the engine is ready', () => {
    const harness = createHarness({ isEngineReady: false });

    harness.controller.updateGenerationSettingsEnabledState();

    expect(getInput(harness.document, 'maxOutputTokensInput').disabled).toBe(false);
    expect(getInput(harness.document, 'resetTopPButton').disabled).toBe(false);
    expect(getInput(harness.document, 'wllamaBatchSizeInput').disabled).toBe(false);

    harness.flags.isEngineReady = true;
    harness.controller.updateGenerationSettingsEnabledState();

    expect(getInput(harness.document, 'maxOutputTokensInput').disabled).toBe(false);
    expect(getInput(harness.document, 'resetTopPButton').disabled).toBe(false);
    expect(getInput(harness.document, 'wllamaBatchSizeInput').disabled).toBe(false);
  });
});
