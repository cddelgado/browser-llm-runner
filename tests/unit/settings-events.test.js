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
        <form id="skillPackageForm">
          <input id="skillPackageInput" type="file" />
          <button id="addSkillPackageButton" type="submit">Upload skill</button>
        </form>
        <div id="skillsList"></div>
        <form id="corsProxyForm">
          <input id="corsProxyInput" type="url" />
          <button id="saveCorsProxyButton" type="submit">Save proxy</button>
          <button id="clearCorsProxyButton" type="button">Clear proxy</button>
        </form>
        <form id="mcpServerEndpointForm">
          <input id="mcpServerEndpointInput" type="url" />
          <button id="addMcpServerButton" type="submit">Add server</button>
        </form>
        <div id="mcpServersList">
          <input
            id="mcpServerToggleDocs"
            type="checkbox"
            data-mcp-server-toggle="true"
            data-mcp-server-id="docs"
            data-mcp-server-display-name="Docs"
          />
          <input
            id="mcpCommandToggleSearch"
            type="checkbox"
            data-mcp-command-toggle="true"
            data-mcp-server-id="docs"
            data-mcp-command-name="search_docs"
            data-mcp-command-display-name="Search Docs"
          />
          <button id="mcpServerRefreshDocs" type="button" data-mcp-server-refresh="true" data-mcp-server-id="docs">
            Refresh
          </button>
          <button id="mcpServerRemoveDocs" type="button" data-mcp-server-remove="true" data-mcp-server-id="docs">
            Remove
          </button>
        </div>
        <input id="renderMathMlToggle" type="checkbox" checked />
        <input id="enableSingleKeyShortcutsToggle" type="checkbox" checked />
        <select id="transcriptViewSelect">
          <option value="standard">Standard</option>
          <option value="compact">Compact</option>
        </select>
        <textarea id="defaultSystemPromptInput"></textarea>
        <button id="exportConversationsButton" type="button">Export</button>
        <button id="deleteConversationsButton" type="button">Delete Conversations</button>
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
          <option value="webgpu">WebGPU</option>
          <option value="cpu">CPU</option>
        </select>
        <input id="cpuThreadsInput" type="number" value="0" />
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
    { url: 'https://example.test/' }
  );

  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLFormElement = dom.window.HTMLFormElement;
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
    skillPackageForm: document.getElementById('skillPackageForm'),
    skillPackageInput: document.getElementById('skillPackageInput'),
    addSkillPackageButton: document.getElementById('addSkillPackageButton'),
    skillsList: document.getElementById('skillsList'),
    corsProxyForm: document.getElementById('corsProxyForm'),
    corsProxyInput: document.getElementById('corsProxyInput'),
    saveCorsProxyButton: document.getElementById('saveCorsProxyButton'),
    clearCorsProxyButton: document.getElementById('clearCorsProxyButton'),
    mcpServerEndpointForm: document.getElementById('mcpServerEndpointForm'),
    mcpServerEndpointInput: document.getElementById('mcpServerEndpointInput'),
    addMcpServerButton: document.getElementById('addMcpServerButton'),
    mcpServersList: document.getElementById('mcpServersList'),
    renderMathMlToggle: document.getElementById('renderMathMlToggle'),
    enableSingleKeyShortcutsToggle: document.getElementById('enableSingleKeyShortcutsToggle'),
    transcriptViewSelect: document.getElementById('transcriptViewSelect'),
    defaultSystemPromptInput: document.getElementById('defaultSystemPromptInput'),
    exportConversationsButton: document.getElementById('exportConversationsButton'),
    deleteConversationsButton: document.getElementById('deleteConversationsButton'),
    conversationLanguageSelect: document.getElementById('conversationLanguageSelect'),
    enableModelThinkingToggle: document.getElementById('enableModelThinkingToggle'),
    modelSelect: document.getElementById('modelSelect'),
    backendSelect: document.getElementById('backendSelect'),
    cpuThreadsInput: document.getElementById('cpuThreadsInput'),
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
    clearSkillPackageFeedback: vi.fn(),
    importSkillPackageFile: vi.fn(async () => ({ name: 'Lesson Planner', isUsable: true })),
    removeSkillPackagePreference: vi.fn(async () => true),
    saveCorsProxyPreference: vi.fn(async () => 'https://proxy.example/'),
    clearCorsProxyPreference: vi.fn(),
    setCorsProxyFeedback: vi.fn(),
    clearCorsProxyFeedback: vi.fn(),
    applyMcpServerEnabledPreference: vi.fn(),
    applyMcpServerCommandEnabledPreference: vi.fn(),
    applyMathRenderingPreference: vi.fn(),
    applySingleKeyShortcutPreference: vi.fn(),
    applyTranscriptViewPreference: vi.fn(),
    applyDefaultSystemPrompt: vi.fn(),
    applyConversationLanguagePreference: vi.fn(),
    applyConversationThinkingPreference: vi.fn(),
    applyCpuThreadsPreference: vi.fn(),
    clearMcpServerFeedback: vi.fn(),
    importMcpServerEndpoint: vi.fn(async () => ({
      displayName: 'Docs',
    })),
    refreshMathRendering: vi.fn(),
    refreshConversationSystemPromptPreview: vi.fn(),
    refreshMcpServerPreference: vi.fn(async () => ({
      displayName: 'Docs',
    })),
    removeMcpServerPreference: vi.fn(),
    setSkillPackageFeedback: vi.fn(),
    setMcpServerFeedback: vi.fn(),
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
    exportAllConversations: vi.fn(),
    deleteAllConversationStorage: vi.fn(async () => {}),
    isUiBusy: vi.fn(() => false),
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
      corsProxyForm: document.getElementById('corsProxyForm'),
      corsProxyInput: document.getElementById('corsProxyInput'),
      saveCorsProxyButton: document.getElementById('saveCorsProxyButton'),
      clearCorsProxyButton: document.getElementById('clearCorsProxyButton'),
      mcpServerEndpointForm: document.getElementById('mcpServerEndpointForm'),
      mcpServerEndpointInput: document.getElementById('mcpServerEndpointInput'),
      addMcpServerButton: document.getElementById('addMcpServerButton'),
      mcpServerToggleDocs: document.getElementById('mcpServerToggleDocs'),
      mcpCommandToggleSearch: document.getElementById('mcpCommandToggleSearch'),
      mcpServerRefreshDocs: document.getElementById('mcpServerRefreshDocs'),
      mcpServerRemoveDocs: document.getElementById('mcpServerRemoveDocs'),
      renderMathMlToggle: document.getElementById('renderMathMlToggle'),
      defaultSystemPromptInput: document.getElementById('defaultSystemPromptInput'),
      exportConversationsButton: document.getElementById('exportConversationsButton'),
      deleteConversationsButton: document.getElementById('deleteConversationsButton'),
      conversationLanguageSelect: document.getElementById('conversationLanguageSelect'),
      enableModelThinkingToggle: document.getElementById('enableModelThinkingToggle'),
      modelSelect: document.getElementById('modelSelect'),
      backendSelect: document.getElementById('backendSelect'),
      cpuThreadsInput: document.getElementById('cpuThreadsInput'),
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
      { persist: true }
    );
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Shell Command Runner disabled for tool calling.'
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

  test('submitting an MCP endpoint imports the server and refreshes the prompt preview', async () => {
    const harness = createHarness();
    const form = /** @type {HTMLFormElement} */ (harness.elements.mcpServerEndpointForm);
    const input = /** @type {HTMLInputElement} */ (harness.elements.mcpServerEndpointInput);

    input.value = 'https://example.com/mcp';
    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(harness.deps.setMcpServerFeedback).toHaveBeenCalledWith(
      'Connecting to MCP server...',
      'info'
    );
    expect(harness.deps.importMcpServerEndpoint).toHaveBeenCalledWith('https://example.com/mcp', {
      persist: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Docs added. Enable the server and any commands you want exposed.'
    );
  });

  test('submitting a CORS proxy validates, saves, and announces success', async () => {
    const harness = createHarness();
    const form = /** @type {HTMLFormElement} */ (harness.elements.corsProxyForm);
    const input = /** @type {HTMLInputElement} */ (harness.elements.corsProxyInput);

    input.value = 'https://proxy.example';
    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(harness.deps.setCorsProxyFeedback).toHaveBeenCalledWith(
      'Validating CORS proxy...',
      'info'
    );
    expect(harness.deps.saveCorsProxyPreference).toHaveBeenCalledWith('https://proxy.example', {
      persist: true,
    });
    expect(harness.deps.setCorsProxyFeedback).toHaveBeenLastCalledWith(
      'Saved. Direct browser requests will retry through https://proxy.example/ only when they appear CORS-blocked.',
      'success'
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith('CORS proxy saved.');
  });

  test('clearing the CORS proxy removes the saved proxy and announces the reset', () => {
    const harness = createHarness();
    const clearButton = /** @type {HTMLButtonElement} */ (harness.elements.clearCorsProxyButton);

    clearButton.click();

    expect(harness.deps.clearCorsProxyPreference).toHaveBeenCalledWith({ persist: true });
    expect(harness.deps.clearCorsProxyFeedback).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('CORS proxy cleared.');
  });

  test('mcp server and command toggles update persistence and prompt preview', () => {
    const harness = createHarness();
    const serverToggle = /** @type {HTMLInputElement} */ (harness.elements.mcpServerToggleDocs);
    const commandToggle = /** @type {HTMLInputElement} */ (harness.elements.mcpCommandToggleSearch);

    serverToggle.checked = true;
    serverToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    commandToggle.checked = true;
    commandToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyMcpServerEnabledPreference).toHaveBeenCalledWith('docs', true, {
      persist: true,
    });
    expect(harness.deps.applyMcpServerCommandEnabledPreference).toHaveBeenCalledWith(
      'docs',
      'search_docs',
      true,
      { persist: true }
    );
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(2);
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(1, 'Docs enabled.');
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(
      2,
      'Search Docs enabled for MCP server use.'
    );
  });

  test('mcp refresh and remove actions call the matching handlers', async () => {
    const harness = createHarness();
    const refreshButton = /** @type {HTMLButtonElement} */ (harness.elements.mcpServerRefreshDocs);
    const removeButton = /** @type {HTMLButtonElement} */ (harness.elements.mcpServerRemoveDocs);

    refreshButton.click();
    await Promise.resolve();
    removeButton.click();

    expect(harness.deps.refreshMcpServerPreference).toHaveBeenCalledWith('docs', { persist: true });
    expect(harness.deps.removeMcpServerPreference).toHaveBeenCalledWith('docs', {
      persist: true,
    });
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

  test('export button runs the bulk export action when the UI is idle', () => {
    const harness = createHarness();
    const button = /** @type {HTMLButtonElement} */ (harness.elements.exportConversationsButton);

    button.click();

    expect(harness.deps.exportAllConversations).toHaveBeenCalledTimes(1);
  });

  test('export button announces when the UI is busy', () => {
    const harness = createHarness();
    const button = /** @type {HTMLButtonElement} */ (harness.elements.exportConversationsButton);
    harness.deps.isUiBusy.mockReturnValue(true);

    button.click();

    expect(harness.deps.exportAllConversations).not.toHaveBeenCalled();
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Wait for the current conversation task to finish before exporting.'
    );
  });

  test('delete conversations confirms before deleting storage', async () => {
    const harness = createHarness();
    const button = /** @type {HTMLButtonElement} */ (harness.elements.deleteConversationsButton);
    globalThis.confirm = vi.fn(() => true);

    button.click();
    await Promise.resolve();

    expect(globalThis.confirm).toHaveBeenCalledWith(
      'Delete all saved conversations and their stored artifacts from this browser?'
    );
    expect(harness.deps.deleteAllConversationStorage).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('All saved conversations were deleted.');
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
      'Model thinking disabled when supported.'
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
      'model-b'
    );
    expect(harness.deps.queueConversationStateSave).toHaveBeenCalledTimes(1);
    expect(harness.deps.syncConversationLanguageAndThinkingControls).toHaveBeenCalledWith(
      harness.activeConversation
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

  test('cpu thread changes persist the preference and reinitialize the engine', async () => {
    const harness = createHarness();
    const cpuThreadsInput = /** @type {HTMLInputElement} */ (harness.elements.cpuThreadsInput);

    cpuThreadsInput.value = '2';
    cpuThreadsInput.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.applyCpuThreadsPreference).toHaveBeenCalledWith('2', {
      persist: true,
    });
    expect(harness.deps.reinitializeEngineFromSettings).toHaveBeenCalledTimes(1);
  });
});
