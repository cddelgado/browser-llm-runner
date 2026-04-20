import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createAppState } from '../../src/state/app-state.js';
import { createPreferencesController } from '../../src/app/preferences.js';
import { getEnabledToolDefinitions } from '../../src/llm/tool-calling.js';

const GEMMA_4_MODEL_ID = 'huggingworld/gemma-4-E2B-it-ONNX';
const LLAMA_3B_MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct-onnx-web';
const BONSAI_8B_MODEL_ID = 'onnx-community/Bonsai-8B-ONNX';

function getModelCard(modelCardList, modelId) {
  const button = Array.from(modelCardList.querySelectorAll('.model-card-button')).find(
    (candidate) => candidate instanceof HTMLButtonElement && candidate.dataset.modelId === modelId
  );
  return button?.closest('.model-card') || null;
}

function createPreferencesHarness({
  validateCorsProxyUrl = vi.fn(async (value) => {
    if (String(value || '').includes('bad-proxy')) {
      throw new Error('The proxy test failed.');
    }
    return 'https://proxy.example/';
  }),
  inspectMcpServerEndpoint = vi.fn(),
  appendDebug = vi.fn(),
} = {}) {
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
      <input id="skillPackageInput" type="file" />
      <div id="skillPackageAddFeedback"></div>
      <div id="skillsList"></div>
      <input id="corsProxyInput" type="url" />
      <div id="corsProxyFeedback"></div>
      <input id="mcpServerEndpointInput" type="url" />
      <div id="mcpServerAddFeedback"></div>
      <div id="mcpServersList"></div>
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
      enabledToolMigrationsStorageKey: 'enabled-tool-migrations',
      renderMathMlStorageKey: 'render-mathml',
      singleKeyShortcutsStorageKey: 'single-key',
      transcriptViewStorageKey: 'transcript-view',
      conversationPanelCollapsedStorageKey: 'conversation-panel-collapsed',
      defaultSystemPromptStorageKey: 'default-prompt',
      corsProxyStorageKey: 'cors-proxy',
      mcpServersStorageKey: 'mcp-servers',
      modelStorageKey: 'model',
      backendStorageKey: 'backend',
      cpuThreadsStorageKey: 'cpu-threads',
      supportedBackendPreferences: new Set(['webgpu', 'cpu']),
      webGpuRequiredModelSuffix: ' (WebGPU required)',
      availableToolDefinitions: getEnabledToolDefinitions(),
      themeSelect: document.getElementById('themeSelect'),
      showThinkingToggle: document.getElementById('showThinkingToggle'),
      enableToolCallingToggle: document.getElementById('enableToolCallingToggle'),
      toolSettingsList: document.getElementById('toolSettingsList'),
      skillPackageInput: document.getElementById('skillPackageInput'),
      skillPackageAddFeedback: document.getElementById('skillPackageAddFeedback'),
      skillsList: document.getElementById('skillsList'),
      corsProxyInput: document.getElementById('corsProxyInput'),
      corsProxyFeedback: document.getElementById('corsProxyFeedback'),
      importSkillPackage: vi.fn(),
      removeSkillPackage: vi.fn(),
      mcpServerEndpointInput: document.getElementById('mcpServerEndpointInput'),
      mcpServerAddFeedback: document.getElementById('mcpServerAddFeedback'),
      mcpServersList: document.getElementById('mcpServersList'),
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
      cpuThreadsInput: document.getElementById('cpuThreadsInput'),
      colorSchemeQuery: { matches: false },
      refreshModelThinkingVisibility: vi.fn(),
      getRuntimeConfigForModel: vi.fn(() => ({})),
      syncGenerationSettingsFromModel: vi.fn(),
      persistGenerationConfigForModel: vi.fn(),
      validateCorsProxyUrl,
      inspectMcpServerEndpoint,
      setStatus: vi.fn(),
      appendDebug,
      onSelectedModelCardChange: vi.fn(),
    }),
    validateCorsProxyUrl,
    inspectMcpServerEndpoint,
    appendDebug,
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
    expect(harness.document.querySelector('[data-tool-name="run_shell_command"]')?.checked).toBe(
      false
    );
  });

  test('migrates stored tool preferences to include web_lookup once for existing users', () => {
    const harness = createPreferencesHarness();

    harness.document.defaultView?.localStorage.setItem(
      'enabled-tools',
      JSON.stringify(['get_current_date_time', 'tasklist'])
    );

    expect(harness.controller.migrateStoredEnabledToolNamesPreference({ persist: true })).toEqual([
      'get_current_date_time',
      'tasklist',
      'web_lookup',
    ]);
    expect(harness.document.defaultView?.localStorage.getItem('enabled-tools')).toBe(
      JSON.stringify(['get_current_date_time', 'tasklist', 'web_lookup'])
    );
    expect(harness.document.defaultView?.localStorage.getItem('enabled-tool-migrations')).toBe(
      JSON.stringify(['2026-04-06-enable-web-lookup'])
    );
  });

  test('stores a validated CORS proxy URL and restores it into state and the input', async () => {
    const harness = createPreferencesHarness();

    const savedProxyUrl = await harness.controller.saveCorsProxyPreference(
      'https://proxy.example',
      {
        persist: true,
      }
    );

    expect(savedProxyUrl).toBe('https://proxy.example/');
    expect(harness.controller.getStoredCorsProxyPreference()).toBe('https://proxy.example/');
    expect(harness.appState.corsProxyUrl).toBe('https://proxy.example/');
    expect(harness.document.getElementById('corsProxyInput')?.value).toBe('https://proxy.example/');
  });

  test('forwards proxy validation debug messages into the app debug log', async () => {
    const validateCorsProxyUrl = vi.fn(async (_value, options = {}) => {
      options.onDebug?.('Proxy probe response: status 200 OK.');
      return 'https://proxy.example/';
    });
    const appendDebug = vi.fn();
    const harness = createPreferencesHarness({
      validateCorsProxyUrl,
      appendDebug,
    });

    await harness.controller.saveCorsProxyPreference('https://proxy.example', {
      persist: false,
    });

    expect(validateCorsProxyUrl).toHaveBeenCalledWith(
      'https://proxy.example',
      expect.objectContaining({
        onDebug: expect.any(Function),
      })
    );
    expect(appendDebug).toHaveBeenCalledWith(
      'Proxy validation: Proxy probe response: status 200 OK.'
    );
  });

  test('clears a stored CORS proxy URL and removes it from storage', async () => {
    const harness = createPreferencesHarness();

    await harness.controller.saveCorsProxyPreference('https://proxy.example', { persist: true });
    harness.controller.clearCorsProxyPreference({ persist: true });

    expect(harness.controller.getStoredCorsProxyPreference()).toBe('');
    expect(harness.appState.corsProxyUrl).toBe('');
    expect(harness.document.getElementById('corsProxyInput')?.value).toBe('');
  });

  test('forwards MCP inspection debug messages into the app debug log', async () => {
    const inspectMcpServerEndpoint = vi.fn(async (_endpoint, options = {}) => {
      options.onDebug?.('MCP inspect docs.example: MCP initialize -> https://docs.example/mcp.');
      return {
        identifier: 'docs',
        endpoint: 'https://docs.example/mcp',
        displayName: 'Docs',
        description: 'Docs MCP.',
        enabled: false,
        commands: [
          {
            name: 'search_docs',
            displayName: 'search_docs',
            description: 'Search docs.',
            enabled: false,
            inputSchema: null,
          },
        ],
      };
    });
    const appendDebug = vi.fn();
    const harness = createPreferencesHarness({
      inspectMcpServerEndpoint,
      appendDebug,
    });

    await harness.controller.importMcpServerEndpoint('https://docs.example/mcp', {
      persist: false,
    });

    expect(inspectMcpServerEndpoint).toHaveBeenCalledWith(
      'https://docs.example/mcp',
      expect.objectContaining({
        onDebug: expect.any(Function),
      })
    );
    expect(appendDebug).toHaveBeenCalledWith(
      'MCP inspect docs.example: MCP initialize -> https://docs.example/mcp.'
    );
  });

  test('persists MCP servers and renders per-server and per-command toggles', () => {
    const harness = createPreferencesHarness();

    harness.controller.applyMcpServersPreference(
      [
        {
          identifier: 'docs',
          endpoint: 'https://example.com/mcp',
          displayName: 'Docs',
          description: 'Project documentation lookup.',
          protocolVersion: '2025-03-26',
          serverVersion: '1.2.3',
          capabilities: ['tools'],
          enabled: false,
          commands: [
            {
              name: 'search_docs',
              displayName: 'Search Docs',
              description: 'Search documentation pages.',
              enabled: false,
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                  },
                },
                required: ['query'],
              },
            },
          ],
        },
      ],
      { persist: true }
    );

    expect(harness.controller.getStoredMcpServersPreference()).toEqual([
      expect.objectContaining({
        identifier: 'docs',
        enabled: false,
        commands: [expect.objectContaining({ name: 'search_docs', enabled: false })],
      }),
    ]);
    expect(harness.document.querySelector('[data-mcp-server-toggle="true"]')?.checked).toBe(false);
    expect(harness.document.querySelector('[data-mcp-command-toggle="true"]')?.checked).toBe(false);
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain('Docs');
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain(
      'Project documentation lookup.'
    );
    expect(harness.document.getElementById('mcpServersList')?.textContent).toContain(
      'Required: query. Fields: query (string).'
    );
  });

  test('falls back to an available model when the current backend cannot use the requested model', () => {
    const harness = createPreferencesHarness();
    const modelSelect = harness.document.getElementById('modelSelect');
    const backendSelect = harness.document.getElementById('backendSelect');

    harness.controller.populateModelSelect();
    modelSelect.value = 'huggingworld/gemma-4-E2B-it-ONNX';
    backendSelect.value = 'cpu';

    const selectedModel = harness.controller.syncModelSelectionForCurrentEnvironment({
      announceFallback: true,
    });

    expect(selectedModel).toBe(LLAMA_3B_MODEL_ID);
    expect(modelSelect.value).toBe(selectedModel);
  });

  test('renders model cards with metadata and syncs card selection to the hidden select', () => {
    const harness = createPreferencesHarness();
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );
    const modelCardList = harness.document.getElementById('modelCardList');

    harness.controller.populateModelSelect();

    const cards = Array.from(modelCardList.querySelectorAll('.model-card'));
    expect(cards.length).toBe(modelSelect.querySelectorAll('option').length);
    expect(
      Array.from(modelCardList.querySelectorAll('.model-card-section-title')).map((node) =>
        node.textContent?.trim()
      )
    ).toEqual(['Local Models', 'Cloud Models']);
    expect(modelCardList.textContent).toContain('No cloud models configured yet.');

    const llama3BCard = getModelCard(modelCardList, LLAMA_3B_MODEL_ID);
    expect(llama3BCard?.textContent).toContain('4,096 tokens');
    expect(llama3BCard?.textContent).not.toContain('Temp 0.6');
    expect(llama3BCard?.textContent).not.toContain('Default context 8,192');
    expect(
      /** @type {HTMLAnchorElement | null} */ (llama3BCard?.querySelector('.model-card-link'))?.href
    ).toBe(`https://huggingface.co/${LLAMA_3B_MODEL_ID}`);

    expect(getModelCard(modelCardList, 'LiquidAI/LFM2.5-350M-ONNX')).toBeNull();
    expect(getModelCard(modelCardList, 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX')).toBeNull();
    expect(getModelCard(modelCardList, 'LiquidAI/LFM2.5-1.2B-Thinking-ONNX')).toBeNull();
    expect(getModelCard(modelCardList, 'onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa')).toBe(
      null
    );
    expect(getModelCard(modelCardList, 'onnx-community/Qwen3.5-2B-ONNX')).toBeNull();

    const bonsaiCard = getModelCard(modelCardList, BONSAI_8B_MODEL_ID);
    expect(bonsaiCard?.textContent).toContain('4,096 tokens');
    expect(bonsaiCard?.textContent).toContain('about 3,100 words');
    expect(
      /** @type {HTMLAnchorElement | null} */ (bonsaiCard?.querySelector('.model-card-link'))?.href
    ).toBe(`https://huggingface.co/${BONSAI_8B_MODEL_ID}`);
    expect(
      Array.from(bonsaiCard?.querySelectorAll('.model-feature-pill') || []).map((node) =>
        node.getAttribute('aria-label')
      )
    ).toEqual(['Shows a thinking section', 'Can use built-in tools']);
    expect(bonsaiCard?.querySelector('.model-card-languages')).toBeNull();

    const gemmaCard = getModelCard(modelCardList, GEMMA_4_MODEL_ID);
    expect(gemmaCard?.textContent).toContain('4,096 tokens');
    expect(gemmaCard?.textContent).toContain('about 3,100 words');
    expect(gemmaCard?.textContent).not.toContain('Default context 8,192');
    expect(gemmaCard?.textContent).toContain('EN');
    expect(gemmaCard?.textContent).toContain('ES');
    expect(gemmaCard?.textContent).toContain('FR');
    expect(gemmaCard?.textContent).toContain('ZH');
    expect(gemmaCard?.textContent).not.toContain('HI');
    expect(gemmaCard?.textContent).toContain('and more');
    expect(gemmaCard?.textContent).not.toContain('huggingworld/gemma-4-E2B-it-ONNX');
    expect(
      /** @type {HTMLAnchorElement | null} */ (gemmaCard?.querySelector('.model-card-link'))?.href
    ).toBe(`https://huggingface.co/${GEMMA_4_MODEL_ID}`);
    expect(
      /** @type {HTMLAnchorElement | null} */ (gemmaCard?.querySelector('.model-card-link'))
        ?.textContent
    ).toBe('Model details');
    expect(gemmaCard?.querySelectorAll('.model-feature-pill')).toHaveLength(4);
    expect(
      Array.from(gemmaCard?.querySelectorAll('.model-feature-pill') || []).map((node) =>
        node.getAttribute('aria-label')
      )
    ).toEqual([
      'Shows a thinking section',
      'Can use built-in tools',
      'Accepts image input',
      'Accepts audio input',
    ]);

    expect(
      gemmaCard?.querySelector('.model-card-languages .bi-translate')?.getAttribute('aria-label')
    ).toBe(
      'Supported languages: English (EN), Spanish (ES), French (FR), Chinese (ZH), Hindi (HI), Japanese (JA), and more.'
    );
    expect(
      gemmaCard?.querySelector('.model-card-languages .bi-translate')?.getAttribute('title')
    ).toBe(
      'English (EN), Spanish (ES), French (FR), Chinese (ZH), Hindi (HI), Japanese (JA), and more.'
    );
    expect(
      /** @type {HTMLAnchorElement | null} */ (
        gemmaCard?.querySelector('.model-card-language-overflow')
      )?.href
    ).toBe('https://ai.google.dev/gemma');
    expect(gemmaCard?.querySelector('.model-card-title-row .model-card-features')).not.toBeNull();

    const gemmaButton = /** @type {HTMLButtonElement | null} */ (
      gemmaCard?.querySelector('.model-card-button')
    );
    gemmaButton?.click();

    expect(modelSelect.value).toBe(GEMMA_4_MODEL_ID);
    expect(gemmaButton?.getAttribute('aria-checked')).toBe('true');
  });

  test('renders the expected feature icons for every visible model', () => {
    const harness = createPreferencesHarness();
    const modelCardList = harness.document.getElementById('modelCardList');

    harness.controller.populateModelSelect();

    const getFeatureLabels = (modelId) => {
      const card = getModelCard(modelCardList, modelId);
      return Array.from(card?.querySelectorAll('.model-feature-pill') || []).map((node) =>
        node.getAttribute('aria-label')
      );
    };

    expect(getFeatureLabels(LLAMA_3B_MODEL_ID)).toEqual(['Can use built-in tools']);
    expect(getFeatureLabels(GEMMA_4_MODEL_ID)).toEqual([
      'Shows a thinking section',
      'Can use built-in tools',
      'Accepts image input',
      'Accepts audio input',
    ]);
    expect(getFeatureLabels(BONSAI_8B_MODEL_ID)).toEqual([
      'Shows a thinking section',
      'Can use built-in tools',
    ]);
  });

  test('renders the default model first in the picker cards and select', () => {
    const harness = createPreferencesHarness();
    const modelCardList = harness.document.getElementById('modelCardList');
    const modelSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('modelSelect')
    );

    harness.controller.populateModelSelect();

    const firstCardTitle = modelCardList.querySelector(
      '.model-card .model-card-title'
    )?.textContent;
    expect(firstCardTitle).toBe('Gemma 4 E2B');
    expect(modelSelect.options[0]?.value).toBe(GEMMA_4_MODEL_ID);
  });
});
