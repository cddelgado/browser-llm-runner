import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createAppState } from '../../src/state/app-state.js';
import { createPreferencesController } from '../../src/app/preferences.js';
import { getEnabledToolDefinitions } from '../../src/llm/tool-calling.js';

function createPreferencesHarness() {
  const dom = new JSDOM(
    `
      <select id="themeSelect">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <input id="showThinkingToggle" type="checkbox" />
      <input id="enableToolCallingToggle" type="checkbox" />
      <div id="toolSettingsList"></div>
      <input id="renderMathMlToggle" type="checkbox" />
      <input id="enableSingleKeyShortcutsToggle" type="checkbox" />
      <select id="transcriptViewSelect">
        <option value="standard">Standard</option>
        <option value="compact">Compact</option>
      </select>
      <button id="conversationPanelCollapseButton" type="button" aria-expanded="true"></button>
      <span id="conversationPanelCollapseButtonText"></span>
      <textarea id="defaultSystemPromptInput"></textarea>
      <div id="modelCardList"></div>
      <select id="modelSelect"></select>
      <select id="backendSelect">
        <option value="auto">Auto</option>
        <option value="webgpu">WebGPU</option>
        <option value="wasm">WASM</option>
        <option value="cpu">CPU</option>
      </select>
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
  const appState = createAppState({ activeGenerationConfig: { maxOutputTokens: 256 } });
  appState.enabledToolNames = getEnabledToolDefinitions().map((tool) => tool.name);
  appState.webGpuProbeCompleted = true;
  appState.webGpuAdapterAvailable = true;

  return {
    appState,
    document,
    controller: createPreferencesController({
      appState,
      storage: dom.window.localStorage,
      navigatorRef: /** @type {any} */ ({ gpu: {} }),
      documentRef: document,
      themeStorageKey: 'theme',
      showThinkingStorageKey: 'show-thinking',
      enableToolCallingStorageKey: 'tool-calling',
      enabledToolsStorageKey: 'enabled-tools',
      renderMathMlStorageKey: 'render-mathml',
      singleKeyShortcutsStorageKey: 'single-key',
      transcriptViewStorageKey: 'transcript-view',
      conversationPanelCollapsedStorageKey: 'conversation-panel-collapsed',
      defaultSystemPromptStorageKey: 'default-prompt',
      modelStorageKey: 'model',
      backendStorageKey: 'backend',
      supportedBackendPreferences: new Set(['auto', 'webgpu', 'wasm', 'cpu']),
      webGpuRequiredModelSuffix: ' (WebGPU required)',
      availableToolDefinitions: getEnabledToolDefinitions(),
      themeSelect: document.getElementById('themeSelect'),
      showThinkingToggle: document.getElementById('showThinkingToggle'),
      enableToolCallingToggle: document.getElementById('enableToolCallingToggle'),
      toolSettingsList: document.getElementById('toolSettingsList'),
      renderMathMlToggle: document.getElementById('renderMathMlToggle'),
      enableSingleKeyShortcutsToggle: document.getElementById('enableSingleKeyShortcutsToggle'),
      transcriptViewSelect: document.getElementById('transcriptViewSelect'),
      conversationPanelCollapseButton: document.getElementById('conversationPanelCollapseButton'),
      conversationPanelCollapseButtonText: document.getElementById(
        'conversationPanelCollapseButtonText'
      ),
      defaultSystemPromptInput: document.getElementById('defaultSystemPromptInput'),
      modelSelect: document.getElementById('modelSelect'),
      modelCardList: document.getElementById('modelCardList'),
      backendSelect: document.getElementById('backendSelect'),
      colorSchemeQuery: { matches: false },
      refreshModelThinkingVisibility: vi.fn(),
      getRuntimeConfigForModel: vi.fn(() => ({})),
      syncGenerationSettingsFromModel: vi.fn(),
      persistGenerationConfigForModel: vi.fn(),
      setStatus: vi.fn(),
      appendDebug: vi.fn(),
    }),
  };
}

describe('preferences controller', () => {
  test('applies persisted UI preferences to state, DOM, and storage', () => {
    const harness = createPreferencesHarness();

    harness.controller.applyTheme('dark');
    harness.controller.applyShowThinkingPreference(true, { persist: true, refresh: true });
    harness.controller.applyMathRenderingPreference(false, { persist: true });
    harness.controller.applyTranscriptViewPreference('compact', { persist: true });
    harness.controller.applyDefaultSystemPrompt('  Be concise.  ', { persist: true });

    expect(harness.document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(harness.appState.showThinkingByDefault).toBe(true);
    expect(harness.appState.renderMathMl).toBe(false);
    expect(harness.document.body.classList.contains('transcript-compact')).toBe(true);
    expect(harness.appState.defaultSystemPrompt).toBe('Be concise.');
    expect(harness.controller.getStoredShowThinkingPreference()).toBe(true);
    expect(harness.controller.getStoredMathRenderingPreference()).toBe(false);
    expect(harness.controller.getStoredTranscriptViewPreference()).toBe('compact');
    expect(harness.controller.getStoredDefaultSystemPrompt()).toBe('Be concise.');
  });

  test('applies persisted conversation panel preference to state, DOM, and storage', () => {
    const harness = createPreferencesHarness();
    const toggleButton = /** @type {HTMLButtonElement} */ (
      harness.document.getElementById('conversationPanelCollapseButton')
    );
    const toggleText = harness.document.getElementById('conversationPanelCollapseButtonText');

    harness.controller.applyConversationPanelCollapsedPreference(true, { persist: true });

    expect(harness.document.body.classList.contains('conversation-panel-collapsed')).toBe(true);
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    expect(toggleButton.getAttribute('aria-label')).toBe('Expand conversations panel');
    expect(toggleText?.textContent).toBe('Expand conversations panel');
    expect(harness.controller.getStoredConversationPanelCollapsedPreference()).toBe(true);
  });

  test('defaults math rendering to enabled when no preference is stored', () => {
    const harness = createPreferencesHarness();
    const renderMathMlToggle = /** @type {HTMLInputElement | null} */ (
      harness.document.getElementById('renderMathMlToggle')
    );

    expect(harness.controller.getStoredMathRenderingPreference()).toBe(true);

    harness.controller.applyMathRenderingPreference(true);

    expect(harness.appState.renderMathMl).toBe(true);
    expect(renderMathMlToggle?.checked).toBe(true);
  });

  test('defaults the enabled tool list to every available tool and renders one toggle per tool', () => {
    const harness = createPreferencesHarness();
    const toolSettingsList = harness.document.getElementById('toolSettingsList');

    const storedToolNames = harness.controller.getStoredEnabledToolNamesPreference();
    const renderedToolToggles = Array.from(
      toolSettingsList?.querySelectorAll('input[data-tool-toggle="true"]') || []
    );

    expect(storedToolNames).toEqual(getEnabledToolDefinitions().map((tool) => tool.name));
    expect(renderedToolToggles).toHaveLength(getEnabledToolDefinitions().length);
    expect(renderedToolToggles.every((toggle) => toggle.checked)).toBe(true);
  });

  test('persists user-selected enabled tools and updates the rendered toggle state', () => {
    const harness = createPreferencesHarness();

    harness.controller.applyEnabledToolNamesPreference(['get_current_date_time', 'tasklist'], {
      persist: true,
    });

    expect(harness.appState.enabledToolNames).toEqual(['get_current_date_time', 'tasklist']);
    expect(harness.controller.getStoredEnabledToolNamesPreference()).toEqual([
      'get_current_date_time',
      'tasklist',
    ]);
    expect(
      harness.document.querySelector('[data-tool-name="get_current_date_time"]')?.checked
    ).toBe(true);
    expect(harness.document.querySelector('[data-tool-name="tasklist"]')?.checked).toBe(true);
    expect(
      harness.document.querySelector('[data-tool-name="run_shell_command"]')?.checked
    ).toBe(false);
  });

  test('falls back to an available model when the current backend cannot use the requested model', () => {
    const harness = createPreferencesHarness();
    const modelSelect = harness.document.getElementById('modelSelect');
    const backendSelect = harness.document.getElementById('backendSelect');

    harness.controller.populateModelSelect();
    modelSelect.value = 'onnx-community/gemma-3n-E2B-it-ONNX';
    backendSelect.value = 'wasm';

    const selectedModel = harness.controller.syncModelSelectionForCurrentEnvironment({
      announceFallback: true,
    });

    expect(selectedModel).not.toBe('onnx-community/gemma-3n-E2B-it-ONNX');
    expect(modelSelect.value).toBe(selectedModel);
  });

  test('renders model cards with metadata and syncs card selection to the hidden select', () => {
    const harness = createPreferencesHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (harness.document.getElementById('modelSelect'));
    const modelCardList = harness.document.getElementById('modelCardList');

    harness.controller.populateModelSelect();

    const cards = Array.from(modelCardList.querySelectorAll('.model-card'));
    expect(cards.length).toBe(3);

    const qwenCard = cards.find((card) => card.textContent?.includes('Qwen3.5 2B'));
    expect(qwenCard?.textContent).toContain('262,144 tokens');
    expect(qwenCard?.textContent).toContain('about 196,600 words');
    expect(qwenCard?.textContent).toContain('EN');
    expect(qwenCard?.textContent).toContain('ZH');
    expect(qwenCard?.textContent).toContain('ES');
    expect(qwenCard?.textContent).toContain('FR');
    expect(qwenCard?.textContent).not.toContain('DE');
    expect(qwenCard?.textContent).toContain('and more');
    expect(qwenCard?.textContent).not.toContain('onnx-community/Qwen3.5-2B-ONNX');
    expect(
      /** @type {HTMLAnchorElement | null} */ (qwenCard?.querySelector('.model-card-link'))?.href
    ).toBe('https://huggingface.co/onnx-community/Qwen3.5-2B-ONNX');
    expect(
      /** @type {HTMLAnchorElement | null} */ (qwenCard?.querySelector('.model-card-link'))?.textContent
    ).toBe('Model details');
    expect(qwenCard?.querySelectorAll('.model-feature-pill')).toHaveLength(3);
    expect(
      Array.from(qwenCard?.querySelectorAll('.model-feature-pill') || []).map((node) =>
        node.getAttribute('aria-label')
      )
    ).toEqual([
      'Shows a thinking section',
      'Can use built-in tools',
      'Accepts image input',
    ]);

    expect(qwenCard?.querySelector('.model-card-languages .bi-translate')?.getAttribute('aria-label')).toBe(
      'Supported languages: English (EN), Chinese (ZH), Spanish (ES), French (FR), German (DE), Japanese (JA), and more.'
    );
    expect(qwenCard?.querySelector('.model-card-languages .bi-translate')?.getAttribute('title')).toBe(
      'English (EN), Chinese (ZH), Spanish (ES), French (FR), German (DE), Japanese (JA), and more.'
    );
    expect(
      /** @type {HTMLAnchorElement | null} */ (qwenCard?.querySelector('.model-card-language-overflow'))?.href
    ).toBe('https://huggingface.co/Qwen/Qwen3.5-2B');

    const qwenButton = /** @type {HTMLButtonElement | null} */ (
      qwenCard?.querySelector('.model-card-button')
    );
    qwenButton?.click();

    expect(modelSelect.value).toBe('onnx-community/Qwen3.5-2B-ONNX');
    expect(qwenButton?.getAttribute('aria-checked')).toBe('true');
  });
});
