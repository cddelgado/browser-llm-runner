import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindToolingSettingsEvents } from '../../src/app/settings-events-tooling.js';

function createHarness() {
  const dom = new JSDOM(
    `
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
      <div id="skillsList">
        <button
          id="skillPackageRemoveLesson"
          type="button"
          data-skill-package-remove="true"
          data-skill-package-id="skill-1"
          data-skill-package-name="Lesson Planner"
        >
          Remove
        </button>
      </div>
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
    `,
    { url: 'https://example.test/' }
  );

  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLFormElement = dom.window.HTMLFormElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;

  const deps = {
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
    applyToolCallingPreference: vi.fn(),
    applyToolEnabledPreference: vi.fn(),
    clearSkillPackageFeedback: vi.fn(),
    importSkillPackageFile: vi.fn(async () => ({
      name: 'Lesson Planner',
      isUsable: true,
    })),
    removeSkillPackagePreference: vi.fn(async () => true),
    saveCorsProxyPreference: vi.fn(async () => 'https://proxy.example/'),
    clearCorsProxyPreference: vi.fn(),
    setCorsProxyFeedback: vi.fn(),
    clearCorsProxyFeedback: vi.fn(),
    applyMcpServerEnabledPreference: vi.fn(),
    applyMcpServerCommandEnabledPreference: vi.fn(),
    clearMcpServerFeedback: vi.fn(),
    importMcpServerEndpoint: vi.fn(async () => ({ displayName: 'Docs' })),
    refreshConversationSystemPromptPreview: vi.fn(),
    refreshMcpServerPreference: vi.fn(async () => ({ displayName: 'Docs' })),
    removeMcpServerPreference: vi.fn(),
    setSkillPackageFeedback: vi.fn(),
    setMcpServerFeedback: vi.fn(),
    setStatus: vi.fn(),
  };

  bindToolingSettingsEvents(deps);

  return {
    dom,
    document,
    deps,
    elements: {
      enableToolCallingToggle: document.getElementById('enableToolCallingToggle'),
      toolToggleShell: document.getElementById('toolToggleShell'),
      skillPackageForm: document.getElementById('skillPackageForm'),
      skillPackageInput: document.getElementById('skillPackageInput'),
      addSkillPackageButton: document.getElementById('addSkillPackageButton'),
      skillPackageRemoveLesson: document.getElementById('skillPackageRemoveLesson'),
      corsProxyForm: document.getElementById('corsProxyForm'),
      corsProxyInput: document.getElementById('corsProxyInput'),
      clearCorsProxyButton: document.getElementById('clearCorsProxyButton'),
      mcpServerEndpointForm: document.getElementById('mcpServerEndpointForm'),
      mcpServerEndpointInput: document.getElementById('mcpServerEndpointInput'),
      mcpServerToggleDocs: document.getElementById('mcpServerToggleDocs'),
      mcpCommandToggleSearch: document.getElementById('mcpCommandToggleSearch'),
      mcpServerRefreshDocs: document.getElementById('mcpServerRefreshDocs'),
      mcpServerRemoveDocs: document.getElementById('mcpServerRemoveDocs'),
    },
  };
}

describe('settings-events-tooling', () => {
  test('tool toggles persist changes, refresh prompt preview, and announce status', () => {
    const harness = createHarness();
    const toolCallingToggle = /** @type {HTMLInputElement} */ (
      harness.elements.enableToolCallingToggle
    );
    const toolToggle = /** @type {HTMLInputElement} */ (harness.elements.toolToggleShell);

    toolCallingToggle.checked = false;
    toolCallingToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    toolToggle.checked = false;
    toolToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    expect(harness.deps.applyToolCallingPreference).toHaveBeenCalledWith(false, {
      persist: true,
    });
    expect(harness.deps.applyToolEnabledPreference).toHaveBeenCalledWith(
      'run_shell_command',
      false,
      { persist: true }
    );
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(2);
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(1, 'Tool calling disabled.');
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(
      2,
      'Shell Command Runner disabled for tool calling.'
    );
  });

  test('skill package actions import, refresh the prompt preview, and remove packages', async () => {
    const harness = createHarness();
    const form = /** @type {HTMLFormElement} */ (harness.elements.skillPackageForm);
    const input = /** @type {HTMLInputElement} */ (harness.elements.skillPackageInput);
    const removeButton = /** @type {HTMLButtonElement} */ (
      harness.elements.skillPackageRemoveLesson
    );
    const uploadedFile = { name: 'lesson-planner.zip' };

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [uploadedFile],
    });

    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    removeButton.click();
    await Promise.resolve();

    expect(harness.deps.importSkillPackageFile).toHaveBeenCalledWith(uploadedFile, {
      persist: true,
    });
    expect(harness.deps.removeSkillPackagePreference).toHaveBeenCalledWith('skill-1', {
      persist: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(2);
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(
      1,
      'Lesson Planner uploaded and exposed to the model.'
    );
    expect(harness.deps.setStatus).toHaveBeenNthCalledWith(2, 'Lesson Planner removed.');
  });

  test('cors proxy actions validate, save, clear, and announce status', async () => {
    const harness = createHarness();
    const form = /** @type {HTMLFormElement} */ (harness.elements.corsProxyForm);
    const input = /** @type {HTMLInputElement} */ (harness.elements.corsProxyInput);
    const clearButton = /** @type {HTMLButtonElement} */ (harness.elements.clearCorsProxyButton);

    input.value = 'https://proxy.example';
    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    clearButton.click();

    expect(harness.deps.setCorsProxyFeedback).toHaveBeenCalledWith(
      'Validating CORS proxy...',
      'info'
    );
    expect(harness.deps.saveCorsProxyPreference).toHaveBeenCalledWith('https://proxy.example', {
      persist: true,
    });
    expect(harness.deps.setStatus).toHaveBeenCalledWith('CORS proxy saved.');
    expect(harness.deps.clearCorsProxyPreference).toHaveBeenCalledWith({ persist: true });
    expect(harness.deps.clearCorsProxyFeedback).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenLastCalledWith('CORS proxy cleared.');
  });

  test('mcp actions persist changes, refresh prompt preview, and handle async actions', async () => {
    const harness = createHarness();
    const form = /** @type {HTMLFormElement} */ (harness.elements.mcpServerEndpointForm);
    const input = /** @type {HTMLInputElement} */ (harness.elements.mcpServerEndpointInput);
    const serverToggle = /** @type {HTMLInputElement} */ (harness.elements.mcpServerToggleDocs);
    const commandToggle = /** @type {HTMLInputElement} */ (
      harness.elements.mcpCommandToggleSearch
    );
    const refreshButton = /** @type {HTMLButtonElement} */ (
      harness.elements.mcpServerRefreshDocs
    );
    const removeButton = /** @type {HTMLButtonElement} */ (
      harness.elements.mcpServerRemoveDocs
    );

    input.value = 'https://example.com/mcp';
    form.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    serverToggle.checked = true;
    serverToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    commandToggle.checked = true;
    commandToggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));

    refreshButton.click();
    await Promise.resolve();
    removeButton.click();

    expect(harness.deps.importMcpServerEndpoint).toHaveBeenCalledWith('https://example.com/mcp', {
      persist: true,
    });
    expect(harness.deps.applyMcpServerEnabledPreference).toHaveBeenCalledWith('docs', true, {
      persist: true,
    });
    expect(harness.deps.applyMcpServerCommandEnabledPreference).toHaveBeenCalledWith(
      'docs',
      'search_docs',
      true,
      { persist: true }
    );
    expect(harness.deps.refreshMcpServerPreference).toHaveBeenCalledWith('docs', {
      persist: true,
    });
    expect(harness.deps.removeMcpServerPreference).toHaveBeenCalledWith('docs', {
      persist: true,
    });
    expect(harness.deps.refreshConversationSystemPromptPreview).toHaveBeenCalledTimes(5);
  });
});
