import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createAppState } from '../../src/state/app-state.js';
import { bindModelSettingsEvents } from '../../src/app/settings-events-models.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <input id="renderMathMlToggle" type="checkbox" checked />
      <input id="enableSingleKeyShortcutsToggle" type="checkbox" checked />
      <select id="transcriptViewSelect">
        <option value="standard">Standard</option>
        <option value="compact">Compact</option>
      </select>
      <textarea id="defaultSystemPromptInput"></textarea>
      <select id="conversationLanguageSelect">
        <option value="auto">Auto</option>
        <option value="es">Spanish</option>
      </select>
      <input id="enableModelThinkingToggle" type="checkbox" checked />
      <select id="modelSelect">
        <option value="model-a">Model A</option>
        <option value="model-b">Model B</option>
      </select>
      <select id="backendSelect">
        <option value="auto">Auto</option>
        <option value="webgpu">WebGPU</option>
      </select>
      <input id="maxOutputTokensInput" />
      <input id="maxContextTokensInput" />
      <input id="temperatureInput" />
      <button id="resetContextTokensButton" type="button"></button>
      <button id="resetTemperatureButton" type="button"></button>
      <input id="topKInput" />
      <input id="topPInput" />
      <button id="resetTopKButton" type="button"></button>
      <button id="resetTopPButton" type="button"></button>
    `,
    { url: 'https://example.test/' }
  );

  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const appState = createAppState({
    activeGenerationConfig: {
      maxOutputTokens: 256,
    },
  });
  appState.engineStatus = 'ready';
  appState.modelReady = true;

  const activeConversation = { id: 'conversation-1', modelId: 'model-a' };
  const deps = {
    appState,
    renderMathMlToggle: document.getElementById('renderMathMlToggle'),
    enableSingleKeyShortcutsToggle: document.getElementById('enableSingleKeyShortcutsToggle'),
    transcriptViewSelect: document.getElementById('transcriptViewSelect'),
    defaultSystemPromptInput: document.getElementById('defaultSystemPromptInput'),
    conversationLanguageSelect: document.getElementById('conversationLanguageSelect'),
    enableModelThinkingToggle: document.getElementById('enableModelThinkingToggle'),
    modelSelect: document.getElementById('modelSelect'),
    backendSelect: document.getElementById('backendSelect'),
    maxOutputTokensInput: document.getElementById('maxOutputTokensInput'),
    maxContextTokensInput: document.getElementById('maxContextTokensInput'),
    temperatureInput: document.getElementById('temperatureInput'),
    resetContextTokensButton: document.getElementById('resetContextTokensButton'),
    resetTemperatureButton: document.getElementById('resetTemperatureButton'),
    topKInput: document.getElementById('topKInput'),
    topPInput: document.getElementById('topPInput'),
    resetTopKButton: document.getElementById('resetTopKButton'),
    resetTopPButton: document.getElementById('resetTopPButton'),
    applyMathRenderingPreference: vi.fn(),
    applySingleKeyShortcutPreference: vi.fn(),
    applyTranscriptViewPreference: vi.fn(),
    applyDefaultSystemPrompt: vi.fn(),
    applyConversationLanguagePreference: vi.fn(),
    applyConversationThinkingPreference: vi.fn(),
    refreshMathRendering: vi.fn(),
    refreshConversationSystemPromptPreview: vi.fn(),
    syncModelSelectionForCurrentEnvironment: vi.fn(() => 'model-b'),
    syncConversationLanguageAndThinkingControls: vi.fn(),
    syncGenerationSettingsFromModel: vi.fn(),
    getActiveConversation: vi.fn(() => activeConversation),
    assignConversationModelId: vi.fn(() => ({ changed: true })),
    queueConversationStateSave: vi.fn(),
    reinitializeEngineFromSettings: vi.fn(async () => {}),
    onGenerationSettingInputChanged: vi.fn(),
    getModelGenerationLimits: vi.fn(() => ({
      defaultMaxContextTokens: 1024,
      defaultTemperature: 0.7,
      defaultTopK: 40,
      defaultTopP: 0.95,
    })),
    normalizeModelId: vi.fn((value) => value),
    defaultModelId: 'model-a',
    setStatus: vi.fn(),
  };

  bindModelSettingsEvents(deps);

  return {
    dom,
    document,
    appState,
    activeConversation,
    deps,
    elements: {
      renderMathMlToggle: document.getElementById('renderMathMlToggle'),
      defaultSystemPromptInput: document.getElementById('defaultSystemPromptInput'),
      conversationLanguageSelect: document.getElementById('conversationLanguageSelect'),
      enableModelThinkingToggle: document.getElementById('enableModelThinkingToggle'),
      modelSelect: document.getElementById('modelSelect'),
      backendSelect: document.getElementById('backendSelect'),
      maxContextTokensInput: document.getElementById('maxContextTokensInput'),
      temperatureInput: document.getElementById('temperatureInput'),
      topKInput: document.getElementById('topKInput'),
      topPInput: document.getElementById('topPInput'),
      resetContextTokensButton: document.getElementById('resetContextTokensButton'),
      resetTemperatureButton: document.getElementById('resetTemperatureButton'),
      resetTopKButton: document.getElementById('resetTopKButton'),
      resetTopPButton: document.getElementById('resetTopPButton'),
    },
  };
}

describe('settings-events-models', () => {
  test('conversation-level settings refresh prompt preview and announce status', () => {
    const harness = createHarness();
    const mathToggle = /** @type {HTMLInputElement} */ (harness.elements.renderMathMlToggle);
    const promptInput = /** @type {HTMLTextAreaElement} */ (
      harness.elements.defaultSystemPromptInput
    );
    const languageSelect = /** @type {HTMLSelectElement} */ (
      harness.elements.conversationLanguageSelect
    );
    const thinkingToggle = /** @type {HTMLInputElement} */ (
      harness.elements.enableModelThinkingToggle
    );

    mathToggle.checked = false;
    mathToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    promptInput.value = 'Be concise.';
    promptInput.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    languageSelect.value = 'es';
    languageSelect.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    thinkingToggle.checked = false;
    thinkingToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyMathRenderingPreference).toHaveBeenCalledWith(false, {
      persist: true,
    });
    expect(harness.deps.refreshMathRendering).toHaveBeenCalledTimes(1);
    expect(harness.deps.applyDefaultSystemPrompt).toHaveBeenCalledWith('Be concise.', {
      persist: true,
    });
    expect(harness.deps.applyConversationLanguagePreference).toHaveBeenCalledWith('es', {
      persist: true,
    });
    expect(harness.deps.applyConversationThinkingPreference).toHaveBeenCalledWith(false, {
      persist: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(4);
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(1, 'Math rendering disabled.');
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(2, 'Response language updated.');
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(
      3,
      'Model thinking disabled when supported.'
    );
  });

  test('model and backend changes refresh dependent state and reinitialize the engine', async () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (harness.elements.modelSelect);
    const backendSelect = /** @type {HTMLSelectElement} */ (harness.elements.backendSelect);

    modelSelect.value = 'model-b';
    modelSelect.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    backendSelect.value = 'webgpu';
    backendSelect.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.syncModelSelectionForCurrentEnvironment).toHaveBeenNthCalledWith(1, {
      announceFallback: false,
    });
    expect(harness.deps.syncModelSelectionForCurrentEnvironment).toHaveBeenNthCalledWith(2, {
      announceFallback: true,
    });
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledTimes(2);
    expect(harness.deps.assignConversationModelId).toHaveBeenCalledWith(
      harness.activeConversation,
      'model-b'
    );
    expect(harness.deps.queueConversationStateSave).toHaveBeenCalledTimes(2);
    expect(harness.deps.syncConversationLanguageAndThinkingControls).toHaveBeenCalledWith(
      harness.activeConversation
    );
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(2);
    expect(harness.deps.reinitializeEngineFromSettings).toHaveBeenCalledTimes(2);
  });

  test('generation reset buttons restore model defaults when the engine is ready', () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (harness.elements.modelSelect);
    const maxContextTokensInput = /** @type {HTMLInputElement} */ (
      harness.elements.maxContextTokensInput
    );
    const temperatureInput = /** @type {HTMLInputElement} */ (harness.elements.temperatureInput);
    const topKInput = /** @type {HTMLInputElement} */ (harness.elements.topKInput);
    const topPInput = /** @type {HTMLInputElement} */ (harness.elements.topPInput);

    modelSelect.value = 'model-b';
    /** @type {HTMLButtonElement} */ (harness.elements.resetContextTokensButton).click();
    /** @type {HTMLButtonElement} */ (harness.elements.resetTemperatureButton).click();
    /** @type {HTMLButtonElement} */ (harness.elements.resetTopKButton).click();
    /** @type {HTMLButtonElement} */ (harness.elements.resetTopPButton).click();

    expect(maxContextTokensInput.value).toBe('1024');
    expect(temperatureInput.value).toBe('0.7');
    expect(topKInput.value).toBe('40');
    expect(topPInput.value).toBe('0.95');
    expect(harness.deps.getModelGenerationLimits).toHaveBeenCalledWith('model-b');
    expect(harness.deps.onGenerationSettingInputChanged).toHaveBeenCalledTimes(4);
  });
});
