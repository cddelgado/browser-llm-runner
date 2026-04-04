import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindSettingsEvents } from '../../src/app/settings-events.js';
import { createAppState } from '../../src/state/app-state.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <button id="openSettingsButton" type="button"></button>
        <button id="closeSettingsButton" type="button"></button>
        <select id="themeSelect">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <input id="showThinkingToggle" type="checkbox" />
        <input id="enableToolCallingToggle" type="checkbox" checked />
        <div id="toolSettingsList">
          <input
            id="toolToggleShell"
            type="checkbox"
            data-tool-toggle="true"
            data-tool-name="run_shell_command"
            data-tool-display-name="Shell Command Runner"
            checked
          />
        </div>
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
      </div>
    `,
    { url: 'https://example.test/' },
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
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const appState = createAppState({
    activeGenerationConfig: {
      maxOutputTokens: 256,
    },
  });

  const activeConversation = { id: 'conversation-1', modelId: 'model-a' };
  const colorSchemeQuery = {
    addEventListener: vi.fn(),
  };

  const deps = {
    appState,
    documentRef: document,
    themeStorageKey: 'theme',
    storage: dom.window.localStorage,
    settingsTabContainer: null,
    settingsTabButtons: [],
    openSettingsButton: document.getElementById('openSettingsButton'),
    closeSettingsButton: document.getElementById('closeSettingsButton'),
    themeSelect: document.getElementById('themeSelect'),
    showThinkingToggle: document.getElementById('showThinkingToggle'),
    enableToolCallingToggle: document.getElementById('enableToolCallingToggle'),
    toolSettingsList: document.getElementById('toolSettingsList'),
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
    colorSchemeQuery,
    setActiveSettingsTab: vi.fn(),
    setSettingsPageVisibility: vi.fn(),
    getStoredThemePreference: vi.fn(() => 'system'),
    applyTheme: vi.fn(),
    applyShowThinkingPreference: vi.fn(),
    applyToolCallingPreference: vi.fn(),
    applyToolEnabledPreference: vi.fn(),
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
    isAnyModalOpen: vi.fn(() => false),
  };

  bindSettingsEvents(deps);

  return {
    dom,
    document,
    appState,
    activeConversation,
    colorSchemeQuery,
    deps,
    elements: {
      enableToolCallingToggle: document.getElementById('enableToolCallingToggle'),
      toolSettingsList: document.getElementById('toolSettingsList'),
      toolToggleShell: document.getElementById('toolToggleShell'),
      renderMathMlToggle: document.getElementById('renderMathMlToggle'),
      defaultSystemPromptInput: document.getElementById('defaultSystemPromptInput'),
      conversationLanguageSelect: document.getElementById('conversationLanguageSelect'),
      enableModelThinkingToggle: document.getElementById('enableModelThinkingToggle'),
      modelSelect: document.getElementById('modelSelect'),
      backendSelect: document.getElementById('backendSelect'),
    },
  };
}

describe('settings-events', () => {
  test('tool calling toggle refreshes the prompt preview and status', () => {
    const harness = createHarness();
    const toggle = /** @type {HTMLInputElement} */ (harness.elements.enableToolCallingToggle);

    toggle.checked = false;
    toggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyToolCallingPreference).toHaveBeenCalledWith(false, { persist: true });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Tool calling disabled.');
  });

  test('tool availability toggles refresh the prompt preview and use the tool display name', () => {
    const harness = createHarness();
    const toggle = /** @type {HTMLInputElement} */ (harness.elements.toolToggleShell);

    toggle.checked = false;
    toggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyToolEnabledPreference).toHaveBeenCalledWith(
      'run_shell_command',
      false,
      { persist: true },
    );
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Shell Command Runner disabled for tool calling.',
    );
  });

  test('ignores unrelated changes inside the tool settings list', () => {
    const harness = createHarness();
    const inertInput = harness.document.createElement('input');
    harness.elements.toolSettingsList.appendChild(inertInput);

    inertInput.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyToolEnabledPreference).not.toHaveBeenCalled();
    expect(harness.deps.refreshConversationSystemPromptPreview).not.toHaveBeenCalled();
  });

  test('render MathML toggle refreshes both rendering and the computed prompt preview', () => {
    const harness = createHarness();
    const toggle = /** @type {HTMLInputElement} */ (harness.elements.renderMathMlToggle);

    toggle.checked = false;
    toggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyMathRenderingPreference).toHaveBeenCalledWith(false, {
      persist: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
    expect(harness.deps.refreshMathRendering).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Math rendering disabled.');
  });

  test('default system prompt changes refresh the computed prompt preview', () => {
    const harness = createHarness();
    const input = /** @type {HTMLTextAreaElement} */ (harness.elements.defaultSystemPromptInput);

    input.value = 'Be concise.';
    input.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyDefaultSystemPrompt).toHaveBeenCalledWith('Be concise.', {
      persist: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
  });

  test('conversation language and thinking changes refresh the computed prompt preview', () => {
    const harness = createHarness();
    const languageSelect = /** @type {HTMLSelectElement} */ (
      harness.elements.conversationLanguageSelect
    );
    const thinkingToggle = /** @type {HTMLInputElement} */ (
      harness.elements.enableModelThinkingToggle
    );

    languageSelect.value = 'es';
    languageSelect.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    thinkingToggle.checked = false;
    thinkingToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyConversationLanguagePreference).toHaveBeenCalledWith('es', {
      persist: true,
    });
    expect(harness.deps.applyConversationThinkingPreference).toHaveBeenCalledWith(false, {
      persist: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(2);
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(1, 'Response language updated.');
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(
      2,
      'Model thinking disabled when supported.',
    );
  });

  test('model changes refresh dependent settings, save conversation state, and refresh the prompt preview', async () => {
    const harness = createHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (harness.elements.modelSelect);

    modelSelect.value = 'model-b';
    modelSelect.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.syncModelSelectionForCurrentEnvironment).toHaveBeenCalledWith({
      announceFallback: false,
    });
    expect(harness.deps.syncGenerationSettingsFromModel).toHaveBeenCalledWith('model-b', true);
    expect(harness.deps.assignConversationModelId).toHaveBeenCalledWith(
      harness.activeConversation,
      'model-b',
    );
    expect(harness.deps.queueConversationStateSave).toHaveBeenCalledTimes(1);
    expect(harness.deps.syncConversationLanguageAndThinkingControls).toHaveBeenCalledWith(
      harness.activeConversation,
    );
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
    expect(harness.deps.reinitializeEngineFromSettings).toHaveBeenCalledTimes(1);
  });

  test('backend changes announce fallback while refreshing the prompt preview', async () => {
    const harness = createHarness();
    const backendSelect = /** @type {HTMLSelectElement} */ (harness.elements.backendSelect);

    backendSelect.value = 'webgpu';
    backendSelect.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.syncModelSelectionForCurrentEnvironment).toHaveBeenCalledWith({
      announceFallback: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
    expect(harness.deps.reinitializeEngineFromSettings).toHaveBeenCalledTimes(1);
  });
});
