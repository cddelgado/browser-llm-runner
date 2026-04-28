import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindCloudProviderSettingsEvents } from '../../src/app/settings-events-cloud.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <form id="cloudProviderForm">
        <input id="cloudProviderNameInput" type="text" />
        <input id="cloudProviderEndpointInput" type="url" />
        <input id="cloudProviderApiKeyInput" type="password" />
        <button id="addCloudProviderButton" type="submit">Add provider</button>
      </form>
      <form id="cloudProviderImportForm">
        <input id="cloudProviderImportInput" type="file" />
        <input id="cloudProviderImportApiKeyInput" type="password" />
        <button id="importCloudProviderButton" type="submit">Import provider</button>
      </form>
      <div id="cloudProvidersList">
        <button
          id="exportCloudProviderButton"
          type="button"
          data-cloud-provider-export="true"
          data-cloud-provider-id="provider-1"
        >Export provider</button>
        <form data-cloud-provider-secret-form="true" data-cloud-provider-id="provider-1">
          <input
            id="cloudProviderSecretInput"
            type="password"
            data-cloud-provider-secret-input="true"
            data-cloud-provider-id="provider-1"
          />
          <button id="saveCloudProviderSecretButton" type="submit">Save key</button>
        </form>
        <input
          id="cloudModelToolToggle"
          type="checkbox"
          data-cloud-model-feature="toolCalling"
          data-cloud-provider-id="provider-1"
          data-cloud-remote-model-id="meta-llama/3.1-8b-instruct"
          data-cloud-remote-model-display-name="Llama 3.1 8B"
        />
        <div
          id="cloudModelConfigPanel"
          data-cloud-model-config="true"
          data-cloud-provider-id="provider-1"
          data-cloud-remote-model-id="meta-llama/3.1-8b-instruct"
        >
          <input
            id="cloudModelThinkingToggle"
            type="checkbox"
            data-cloud-model-thinking-toggle="true"
            data-cloud-provider-id="provider-1"
            data-cloud-remote-model-id="meta-llama/3.1-8b-instruct"
            data-cloud-remote-model-display-name="Llama 3.1 8B"
          />
          <textarea
            id="cloudModelThinkingEnabled"
            data-cloud-model-thinking-setting="enabledInstruction"
          >Think carefully before answering.</textarea>
          <textarea
            id="cloudModelThinkingDisabled"
            data-cloud-model-thinking-setting="disabledInstruction"
          >Answer directly.</textarea>
          <textarea
            id="cloudModelThinkingEnabledExtraBody"
            data-cloud-model-thinking-setting="enabledExtraBody"
          >{"chat_template_kwargs":{"enable_thinking":true}}</textarea>
          <textarea
            id="cloudModelThinkingDisabledExtraBody"
            data-cloud-model-thinking-setting="disabledExtraBody"
          >{"chat_template_kwargs":{"enable_thinking":false}}</textarea>
          <div id="cloudModelThinkingField" class="d-none" data-cloud-model-thinking-field="true">
            Thinking field
          </div>
          <input
            id="cloudModelRateLimitRequests"
            type="number"
            data-cloud-model-rate-limit="maxRequests"
            value="15"
          />
          <input
            id="cloudModelRateLimitWindow"
            type="number"
            data-cloud-model-rate-limit="windowValue"
            value="1"
          />
          <select id="cloudModelRateLimitWindowUnit" data-cloud-model-rate-limit="windowUnit">
            <option value="hours" selected>Hours</option>
          </select>
        </div>
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
  globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const deps = {
    cloudProviderForm: document.getElementById('cloudProviderForm'),
    cloudProviderNameInput: document.getElementById('cloudProviderNameInput'),
    cloudProviderEndpointInput: document.getElementById('cloudProviderEndpointInput'),
    cloudProviderApiKeyInput: document.getElementById('cloudProviderApiKeyInput'),
    addCloudProviderButton: document.getElementById('addCloudProviderButton'),
    cloudProviderImportForm: document.getElementById('cloudProviderImportForm'),
    cloudProviderImportInput: document.getElementById('cloudProviderImportInput'),
    cloudProviderImportApiKeyInput: document.getElementById('cloudProviderImportApiKeyInput'),
    importCloudProviderButton: document.getElementById('importCloudProviderButton'),
    cloudProvidersList: document.getElementById('cloudProvidersList'),
    addCloudProvider: vi.fn(async () => ({ displayName: 'Course Provider' })),
    importCloudProviderFile: vi.fn(async () => ({
      provider: { displayName: 'Imported Provider' },
      importedModelCount: 1,
    })),
    exportCloudProviderPreference: vi.fn(() => ({
      provider: { name: 'Exported Provider' },
    })),
    setCloudProviderFeedback: vi.fn(),
    clearCloudProviderFeedback: vi.fn(),
    refreshCloudProviderPreference: vi.fn(),
    removeCloudProviderPreference: vi.fn(),
    saveCloudProviderSecretPreference: vi.fn(async () => true),
    setCloudProviderModelSelected: vi.fn(),
    updateCloudModelFeaturePreference: vi.fn(async () => true),
    updateCloudModelGenerationPreference: vi.fn(),
    updateCloudModelThinkingPreference: vi.fn(async () => true),
    updateCloudModelRateLimitPreference: vi.fn(async () => true),
    setStatus: vi.fn(),
  };

  bindCloudProviderSettingsEvents(deps);

  return {
    dom,
    document,
    deps,
    elements: {
      cloudProviderSecretInput: document.getElementById('cloudProviderSecretInput'),
      exportCloudProviderButton: document.getElementById('exportCloudProviderButton'),
      cloudModelToolToggle: document.getElementById('cloudModelToolToggle'),
      cloudModelThinkingToggle: document.getElementById('cloudModelThinkingToggle'),
      cloudModelThinkingField: document.getElementById('cloudModelThinkingField'),
      cloudModelRateLimitRequests: document.getElementById('cloudModelRateLimitRequests'),
    },
  };
}

describe('settings-events-cloud', () => {
  test('submits the optional provider name when adding a provider', async () => {
    const harness = createHarness();
    const form = harness.document.getElementById('cloudProviderForm');
    const nameInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cloudProviderNameInput')
    );
    const endpointInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cloudProviderEndpointInput')
    );
    const apiKeyInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cloudProviderApiKeyInput')
    );

    nameInput.value = 'Course Provider';
    endpointInput.value = 'https://api.example/v1';
    apiKeyInput.value = 'sk-test';
    form?.dispatchEvent(
      new harness.dom.window.Event('submit', { bubbles: true, cancelable: true })
    );
    await Promise.resolve();

    expect(harness.deps.addCloudProvider).toHaveBeenCalledWith(
      'https://api.example/v1',
      'sk-test',
      'Course Provider'
    );
    expect(nameInput.value).toBe('');
  });

  test('persists cloud-model tool toggles and announces status', async () => {
    const harness = createHarness();
    const toggle = /** @type {HTMLInputElement} */ (harness.elements.cloudModelToolToggle);

    toggle.checked = true;
    toggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.updateCloudModelFeaturePreference).toHaveBeenCalledWith(
      'provider-1',
      'meta-llama/3.1-8b-instruct',
      'toolCalling',
      true
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Built-in tools enabled for Llama 3.1 8B.');
  });

  test('persists cloud-model thinking instructions and announces status', async () => {
    const harness = createHarness();
    const toggle = /** @type {HTMLInputElement} */ (harness.elements.cloudModelThinkingToggle);

    toggle.checked = true;
    toggle.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.updateCloudModelThinkingPreference).toHaveBeenCalledWith(
      'provider-1',
      'meta-llama/3.1-8b-instruct',
      {
        enabled: true,
        enabledInstruction: 'Think carefully before answering.',
        disabledInstruction: 'Answer directly.',
        enabledExtraBody: '{"chat_template_kwargs":{"enable_thinking":true}}',
        disabledExtraBody: '{"chat_template_kwargs":{"enable_thinking":false}}',
      }
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Thinking control enabled for Llama 3.1 8B.'
    );
    expect(harness.elements.cloudModelThinkingField?.classList.contains('d-none')).toBe(false);
  });

  test('saves provider secrets through the delegated form handler', async () => {
    const harness = createHarness();
    const secretInput = /** @type {HTMLInputElement} */ (harness.elements.cloudProviderSecretInput);
    const secretForm = harness.document.querySelector(
      'form[data-cloud-provider-secret-form="true"]'
    );

    secretInput.value = 'sk-test';
    secretForm?.dispatchEvent(
      new harness.dom.window.Event('submit', { bubbles: true, cancelable: true })
    );
    await Promise.resolve();

    expect(harness.deps.saveCloudProviderSecretPreference).toHaveBeenCalledWith(
      'provider-1',
      'sk-test'
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Cloud provider API key saved.');
    expect(secretInput.value).toBe('');
  });

  test('imports a cloud provider file with an explicitly entered API key', async () => {
    const harness = createHarness();
    const form = harness.document.getElementById('cloudProviderImportForm');
    const fileInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cloudProviderImportInput')
    );
    const apiKeyInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cloudProviderImportApiKeyInput')
    );
    const file = new harness.dom.window.File(['{}'], 'provider.cloud-pro.json', {
      type: 'application/json',
    });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    apiKeyInput.value = 'sk-import';
    form?.dispatchEvent(
      new harness.dom.window.Event('submit', { bubbles: true, cancelable: true })
    );
    await Promise.resolve();

    expect(harness.deps.importCloudProviderFile).toHaveBeenCalledWith(file, 'sk-import');
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Imported Provider imported with 1 selected model.'
    );
    expect(apiKeyInput.value).toBe('');
  });

  test('exports cloud providers through delegated provider actions', () => {
    const harness = createHarness();
    const exportButton = /** @type {HTMLButtonElement} */ (
      harness.elements.exportCloudProviderButton
    );

    exportButton.click();

    expect(harness.deps.exportCloudProviderPreference).toHaveBeenCalledWith('provider-1');
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Exported Provider exported as .cloud-pro.json.'
    );
  });

  test('persists cloud-model rate limits and announces status', async () => {
    const harness = createHarness();
    const rateLimitInput = /** @type {HTMLInputElement} */ (
      harness.elements.cloudModelRateLimitRequests
    );

    rateLimitInput.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.updateCloudModelRateLimitPreference).toHaveBeenCalledWith(
      'provider-1',
      'meta-llama/3.1-8b-instruct',
      {
        maxRequests: '15',
        windowValue: '1',
        windowUnit: 'hours',
      }
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Cloud model rate limit updated.');
  });

  test('waits for complete rate-limit fields before persisting', async () => {
    const harness = createHarness();
    const rateLimitInput = /** @type {HTMLInputElement} */ (
      harness.elements.cloudModelRateLimitRequests
    );
    const windowInput = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('cloudModelRateLimitWindow')
    );

    windowInput.value = '';
    rateLimitInput.dispatchEvent(new harness.dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(harness.deps.updateCloudModelRateLimitPreference).not.toHaveBeenCalled();
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Enter both the request count and window length to save a cloud model rate limit.'
    );
  });
});
