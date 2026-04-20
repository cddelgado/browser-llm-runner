import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createCloudProviderSettingsController } from '../../src/app/cloud-provider-settings.js';
import { REMOTE_MODEL_GENERATION_LIMITS } from '../../src/cloud/cloud-provider-config.js';
import { createAppState } from '../../src/state/app-state.js';

function createHarness({
  preconfiguredProviders = [],
  providers = [
    {
      id: 'provider-1',
      type: 'openai-compatible',
      endpoint: 'https://openrouter.ai/api/v1',
      endpointHost: 'openrouter.ai',
      displayName: 'OpenRouter',
      availableModels: [
        {
          id: 'meta-llama/3.1-8b-instruct',
          displayName: 'Llama 3.1 8B',
          detectedFeatures: {
            toolCalling: true,
          },
        },
      ],
      selectedModels: [
        {
          id: 'meta-llama/3.1-8b-instruct',
          displayName: 'Llama 3.1 8B',
          detectedFeatures: {
            toolCalling: true,
          },
          features: {
            toolCalling: false,
          },
        },
      ],
    },
  ],
} = {}) {
  const dom = new JSDOM(
    `
      <div id="cloudProviderAddFeedback"></div>
      <div id="cloudProvidersList"></div>
    `,
    { url: 'https://example.test/' }
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;

  let currentProviders = [...providers];
  const initialProviders = preconfiguredProviders.length ? preconfiguredProviders : currentProviders;
  const appState = createAppState({ cloudProviders: initialProviders });
  const updateCloudProvider = vi.fn(async (provider) => {
    currentProviders = currentProviders
      .filter((candidate) => candidate.id !== provider.id)
      .concat(provider);
    return provider;
  });
  const saveCloudProviderSecret = vi.fn(async () => true);
  const onProvidersChanged = vi.fn();

  const controller = createCloudProviderSettingsController({
    appState,
    documentRef: document,
    preconfiguredProviders,
    cloudProviderAddFeedback: document.getElementById('cloudProviderAddFeedback'),
    cloudProvidersList: document.getElementById('cloudProvidersList'),
    inspectCloudProviderEndpoint: vi.fn(),
    loadCloudProviders: vi.fn(async () => currentProviders),
    saveCloudProvider: vi.fn(),
    saveCloudProviderSecret,
    updateCloudProvider,
    removeCloudProvider: vi.fn(),
    getCloudProviderSecret: vi.fn(),
    onProvidersChanged,
    getStoredGenerationConfigForModel: vi.fn(() => null),
    persistGenerationConfigForModel: vi.fn(),
    getModelGenerationLimits: vi.fn(() => REMOTE_MODEL_GENERATION_LIMITS),
    syncGenerationSettingsFromModel: vi.fn(),
    getSelectedModelId: vi.fn(() => 'meta-llama/3.1-8b-instruct'),
  });

  return {
    dom,
    document,
    appState,
    controller,
    saveCloudProviderSecret,
    updateCloudProvider,
    onProvidersChanged,
  };
}

describe('cloud-provider settings controller', () => {
  test('renders the cloud-model tool toggle with detected support guidance', () => {
    const harness = createHarness();

    const toggle = /** @type {HTMLInputElement | null} */ (
      harness.document.querySelector('input[data-cloud-model-feature="toolCalling"]')
    );

    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(false);
    expect(harness.document.getElementById('cloudProvidersList')?.textContent).toContain(
      'Provider metadata suggests this model supports tool or function calling.'
    );
  });

  test('updates selected cloud-model tool support and rerenders the toggle state', async () => {
    const harness = createHarness();

    await harness.controller.updateCloudModelFeaturePreference(
      'provider-1',
      'meta-llama/3.1-8b-instruct',
      'toolCalling',
      true
    );

    expect(harness.updateCloudProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModels: [
          expect.objectContaining({
            id: 'meta-llama/3.1-8b-instruct',
            features: {
              toolCalling: true,
            },
          }),
        ],
      })
    );
    expect(harness.appState.cloudProviders[0]?.selectedModels[0]?.features?.toolCalling).toBe(true);
    expect(
      /** @type {HTMLInputElement | null} */ (
        harness.document.querySelector('input[data-cloud-model-feature="toolCalling"]')
      )?.checked
    ).toBe(true);
    expect(harness.onProvidersChanged).toHaveBeenCalledTimes(1);
  });

  test('renders app-managed provider links and disables removal toggles for managed models', () => {
    const harness = createHarness({
      preconfiguredProviders: [
        {
          id: 'managed-provider',
          type: 'openai-compatible',
          endpoint: 'https://managed.example/v1',
          displayName: 'Managed Provider',
          preconfigured: true,
          links: {
            createAccountUrl: 'https://managed.example/signup',
            createTokenUrl: 'https://managed.example/tokens',
            dataSecurityUrl: 'https://managed.example/security',
          },
          selectedModels: [
            {
              id: 'managed/model',
              displayName: 'Managed Model',
              managed: true,
              features: {
                toolCalling: false,
              },
            },
          ],
        },
      ],
      providers: [],
    });

    const providerText = harness.document.getElementById('cloudProvidersList')?.textContent || '';
    const managedToggle = /** @type {HTMLInputElement | null} */ (
      harness.document.querySelector('input[data-cloud-provider-model-toggle="true"]')
    );

    expect(providerText).toContain('Create account');
    expect(providerText).toContain('Create token');
    expect(providerText).toContain('Data security');
    expect(providerText).toContain('cannot be removed here');
    expect(managedToggle?.disabled).toBe(true);
    expect(
      harness.document.querySelector('button[data-cloud-provider-remove="true"]')
    ).toBeNull();
  });
});
