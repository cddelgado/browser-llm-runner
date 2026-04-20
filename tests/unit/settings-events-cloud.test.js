import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindCloudProviderSettingsEvents } from '../../src/app/settings-events-cloud.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <form id="cloudProviderForm">
        <input id="cloudProviderEndpointInput" type="url" />
        <input id="cloudProviderApiKeyInput" type="password" />
        <button id="addCloudProviderButton" type="submit">Add provider</button>
      </form>
      <div id="cloudProvidersList">
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
            id="cloudModelRateLimitRequests"
            type="number"
            data-cloud-model-rate-limit="maxRequests"
            value="15"
          />
          <input
            id="cloudModelRateLimitWindow"
            type="number"
            data-cloud-model-rate-limit="windowMinutes"
            value="60"
          />
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

  const deps = {
    cloudProviderForm: document.getElementById('cloudProviderForm'),
    cloudProviderEndpointInput: document.getElementById('cloudProviderEndpointInput'),
    cloudProviderApiKeyInput: document.getElementById('cloudProviderApiKeyInput'),
    addCloudProviderButton: document.getElementById('addCloudProviderButton'),
    cloudProvidersList: document.getElementById('cloudProvidersList'),
    addCloudProvider: vi.fn(),
    setCloudProviderFeedback: vi.fn(),
    clearCloudProviderFeedback: vi.fn(),
    refreshCloudProviderPreference: vi.fn(),
    removeCloudProviderPreference: vi.fn(),
    saveCloudProviderSecretPreference: vi.fn(async () => true),
    setCloudProviderModelSelected: vi.fn(),
    updateCloudModelFeaturePreference: vi.fn(async () => true),
    updateCloudModelGenerationPreference: vi.fn(),
    updateCloudModelRateLimitPreference: vi.fn(async () => true),
    resetCloudModelGenerationPreference: vi.fn(),
    setStatus: vi.fn(),
  };

  bindCloudProviderSettingsEvents(deps);

  return {
    dom,
    document,
    deps,
    elements: {
      cloudProviderSecretInput: document.getElementById('cloudProviderSecretInput'),
      cloudModelToolToggle: document.getElementById('cloudModelToolToggle'),
      cloudModelRateLimitRequests: document.getElementById('cloudModelRateLimitRequests'),
    },
  };
}

describe('settings-events-cloud', () => {
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
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Built-in tools enabled for Llama 3.1 8B.'
    );
  });

  test('saves provider secrets through the delegated form handler', async () => {
    const harness = createHarness();
    const secretInput = /** @type {HTMLInputElement} */ (harness.elements.cloudProviderSecretInput);
    const secretForm = harness.document.querySelector(
      'form[data-cloud-provider-secret-form="true"]'
    );

    secretInput.value = 'sk-test';
    secretForm?.dispatchEvent(new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    expect(harness.deps.saveCloudProviderSecretPreference).toHaveBeenCalledWith(
      'provider-1',
      'sk-test'
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Cloud provider API key saved.');
    expect(secretInput.value).toBe('');
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
        windowMinutes: '60',
      }
    );
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Cloud model rate limit updated.');
  });
});
