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
  const initialProviders = preconfiguredProviders.length
    ? preconfiguredProviders
    : currentProviders;
  const appState = createAppState({ cloudProviders: initialProviders });
  const updateCloudProvider = vi.fn(async (provider) => {
    currentProviders = currentProviders
      .filter((candidate) => candidate.id !== provider.id)
      .concat(provider);
    return provider;
  });
  const saveCloudProvider = vi.fn(async (provider) => {
    const savedProvider = {
      ...provider,
      id: provider.id || 'provider-imported',
    };
    currentProviders = currentProviders.concat(savedProvider);
    return savedProvider;
  });
  const saveCloudProviderSecret = vi.fn(async () => true);
  const onProvidersChanged = vi.fn();
  const getStoredGenerationConfigForModel = vi.fn(() => null);
  const persistGenerationConfigForModel = vi.fn();
  const downloadFile = vi.fn();

  const controller = createCloudProviderSettingsController({
    appState,
    documentRef: document,
    preconfiguredProviders,
    cloudProviderAddFeedback: document.getElementById('cloudProviderAddFeedback'),
    cloudProvidersList: document.getElementById('cloudProvidersList'),
    inspectCloudProviderEndpoint: vi.fn(),
    loadCloudProviders: vi.fn(async () => currentProviders),
    saveCloudProvider,
    saveCloudProviderSecret,
    updateCloudProvider,
    removeCloudProvider: vi.fn(),
    getCloudProviderSecret: vi.fn(),
    onProvidersChanged,
    getStoredGenerationConfigForModel,
    persistGenerationConfigForModel,
    getModelGenerationLimits: vi.fn(() => REMOTE_MODEL_GENERATION_LIMITS),
    syncGenerationSettingsFromModel: vi.fn(),
    getSelectedModelId: vi.fn(() => 'meta-llama/3.1-8b-instruct'),
    downloadFile,
  });

  return {
    dom,
    document,
    appState,
    controller,
    saveCloudProvider,
    saveCloudProviderSecret,
    updateCloudProvider,
    getStoredGenerationConfigForModel,
    persistGenerationConfigForModel,
    downloadFile,
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

  test('renders selected cloud-model defaults directly under the model switch', () => {
    const harness = createHarness();

    const availableModelSwitch = harness.document.querySelector(
      '.form-check.form-switch input[data-cloud-provider-model-toggle="true"]'
    );
    const configuredPanel = harness.document.querySelector('[data-cloud-model-config="true"]');
    const cloudProvidersText =
      harness.document.getElementById('cloudProvidersList')?.textContent || '';

    expect(availableModelSwitch).not.toBeNull();
    expect(
      availableModelSwitch?.closest('.cloud-provider-model-item')?.contains(configuredPanel)
    ).toBe(true);
    expect(cloudProvidersText).toContain('Llama 3.1 8B defaults');
    expect(cloudProvidersText).not.toContain('Configured model defaults');
    expect(cloudProvidersText).not.toContain('Reset model defaults');
  });

  test('hides cloud-model thinking fields until thinking control is enabled', () => {
    const harness = createHarness();

    expect(
      harness.document.querySelector('[data-cloud-model-thinking-field="true"]')?.classList
    ).toContain('d-none');
  });

  test('uses user-entered provider names when saving providers', async () => {
    const harness = createHarness({ providers: [] });
    const inspectCloudProviderEndpoint = vi.fn(async () => ({
      id: 'provider-2',
      type: 'openai-compatible',
      endpoint: 'https://api.example/v1',
      endpointHost: 'api.example',
      displayName: 'api.example',
      availableModels: [],
      selectedModels: [],
    }));
    const controller = createCloudProviderSettingsController({
      appState: harness.appState,
      documentRef: harness.document,
      cloudProviderAddFeedback: harness.document.getElementById('cloudProviderAddFeedback'),
      cloudProvidersList: harness.document.getElementById('cloudProvidersList'),
      inspectCloudProviderEndpoint,
      loadCloudProviders: vi.fn(async () => []),
      saveCloudProvider: harness.saveCloudProvider,
      saveCloudProviderSecret: harness.saveCloudProviderSecret,
      updateCloudProvider: harness.updateCloudProvider,
      removeCloudProvider: vi.fn(),
      getCloudProviderSecret: vi.fn(),
      getStoredGenerationConfigForModel: vi.fn(() => null),
      persistGenerationConfigForModel: vi.fn(),
      getModelGenerationLimits: vi.fn(() => REMOTE_MODEL_GENERATION_LIMITS),
      syncGenerationSettingsFromModel: vi.fn(),
      getSelectedModelId: vi.fn(() => ''),
    });

    await controller.addCloudProvider('https://api.example/v1', 'sk-test', 'Course Provider');

    expect(harness.saveCloudProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Course Provider',
      }),
      { apiKey: 'sk-test' }
    );
  });

  test('stores cloud-model rate limits with non-minute window units', async () => {
    const harness = createHarness();

    const rateLimit = await harness.controller.updateCloudModelRateLimitPreference(
      'provider-1',
      'meta-llama/3.1-8b-instruct',
      {
        maxRequests: '20',
        windowValue: '2',
        windowUnit: 'days',
      }
    );

    expect(rateLimit).toEqual({
      maxRequests: 20,
      windowMs: 172800000,
    });
    expect(harness.updateCloudProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModels: [
          expect.objectContaining({
            rateLimit: {
              maxRequests: 20,
              windowMs: 172800000,
            },
          }),
        ],
      })
    );
  });

  test('stores cloud-model thinking instructions and exposes the thinking controls', async () => {
    const harness = createHarness();

    await harness.controller.updateCloudModelThinkingPreference(
      'provider-1',
      'meta-llama/3.1-8b-instruct',
      {
        enabled: true,
        enabledInstruction: 'Use deeper reasoning before answering.',
        disabledInstruction: 'Answer directly without extra reasoning.',
        enabledExtraBody:
          '{\n  "chat_template_kwargs": {\n    "enable_thinking": true\n  }\n}',
        disabledExtraBody:
          '{\n  "chat_template_kwargs": {\n    "enable_thinking": false\n  }\n}',
      }
    );

    expect(harness.updateCloudProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedModels: [
          expect.objectContaining({
            features: expect.objectContaining({
              thinking: true,
            }),
            thinkingControl: {
              defaultEnabled: true,
              enabledInstruction: 'Use deeper reasoning before answering.',
              disabledInstruction: 'Answer directly without extra reasoning.',
              enabledExtraBody: {
                chat_template_kwargs: {
                  enable_thinking: true,
                },
              },
              disabledExtraBody: {
                chat_template_kwargs: {
                  enable_thinking: false,
                },
              },
            },
          }),
        ],
      })
    );
    const thinkingToggle = /** @type {HTMLInputElement | null} */ (
      harness.document.querySelector('input[data-cloud-model-thinking-toggle="true"]')
    );
    expect(thinkingToggle?.checked).toBe(true);
    expect(harness.document.getElementById('cloudProvidersList')?.textContent).toContain(
      'System prompt text when thinking is enabled'
    );
    expect(harness.document.getElementById('cloudProvidersList')?.textContent).toContain(
      'Extra request body JSON when thinking is disabled'
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
            features: expect.objectContaining({
              toolCalling: true,
            }),
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
    expect(harness.document.querySelector('button[data-cloud-provider-remove="true"]')).toBeNull();
  });

  test('exports cloud providers without API keys and includes selected model settings', () => {
    const harness = createHarness();
    harness.getStoredGenerationConfigForModel.mockReturnValue({
      maxOutputTokens: 512,
      maxContextTokens: 4096,
      temperature: 0.4,
      topK: 50,
      topP: 0.9,
    });

    const payload = harness.controller.exportCloudProviderPreference('provider-1');

    expect(payload).toMatchObject({
      schema: 'browser-llm-runner.cloud-provider',
      version: 1,
      provider: {
        name: 'OpenRouter',
        endpoint: 'https://openrouter.ai/api/v1',
        models: [
          expect.objectContaining({
            id: 'meta-llama/3.1-8b-instruct',
            generationConfig: {
              maxOutputTokens: 512,
              maxContextTokens: 4096,
              temperature: 0.4,
              topK: 50,
              topP: 0.9,
            },
          }),
        ],
      },
    });
    expect(JSON.stringify(payload)).not.toContain('sk-');
    expect(harness.downloadFile).toHaveBeenCalledWith(
      expect.any(Blob),
      'openrouter.cloud-pro.json'
    );
  });

  test('imports matching exported models after validating the provided API key', async () => {
    const harness = createHarness({ providers: [] });
    const inspectCloudProviderEndpoint = vi.fn(async () => ({
      type: 'openai-compatible',
      endpoint: 'https://api.example/v1',
      endpointHost: 'api.example',
      displayName: 'api.example',
      supportsTopK: true,
      availableModels: [
        {
          id: 'matched/model',
          displayName: 'Matched Model',
          detectedFeatures: {
            toolCalling: true,
          },
        },
      ],
      selectedModels: [],
    }));
    const controller = createCloudProviderSettingsController({
      appState: harness.appState,
      documentRef: harness.document,
      cloudProviderAddFeedback: harness.document.getElementById('cloudProviderAddFeedback'),
      cloudProvidersList: harness.document.getElementById('cloudProvidersList'),
      inspectCloudProviderEndpoint,
      loadCloudProviders: vi.fn(async () => [
        {
          id: 'provider-imported',
          type: 'openai-compatible',
          endpoint: 'https://api.example/v1',
          endpointHost: 'api.example',
          displayName: 'Course Provider',
          hasSecret: true,
          supportsTopK: true,
          availableModels: [
            {
              id: 'matched/model',
              displayName: 'Matched Model',
              detectedFeatures: {
                toolCalling: true,
              },
            },
          ],
          selectedModels: [
            {
              id: 'matched/model',
              displayName: 'Matched Model',
              features: {
                toolCalling: false,
              },
            },
          ],
        },
      ]),
      saveCloudProvider: harness.saveCloudProvider,
      saveCloudProviderSecret: harness.saveCloudProviderSecret,
      updateCloudProvider: harness.updateCloudProvider,
      removeCloudProvider: vi.fn(),
      getCloudProviderSecret: vi.fn(),
      getStoredGenerationConfigForModel: vi.fn(() => null),
      persistGenerationConfigForModel: harness.persistGenerationConfigForModel,
      getModelGenerationLimits: vi.fn(() => REMOTE_MODEL_GENERATION_LIMITS),
      syncGenerationSettingsFromModel: vi.fn(),
      getSelectedModelId: vi.fn(() => ''),
      downloadFile: harness.downloadFile,
    });
    const file = {
      text: vi.fn(async () =>
        JSON.stringify({
          schema: 'browser-llm-runner.cloud-provider',
          version: 1,
          provider: {
            name: 'Course Provider',
            endpoint: 'https://api.example/v1',
            models: [
              {
                id: 'matched/model',
                features: {
                  toolCalling: false,
                },
                generationConfig: {
                  maxOutputTokens: 256,
                  maxContextTokens: 2048,
                  temperature: 0.2,
                  topK: 30,
                  topP: 0.8,
                },
              },
              {
                id: 'missing/model',
              },
            ],
          },
        })
      ),
    };

    const result = await controller.importCloudProviderFile(file, 'sk-import');

    expect(inspectCloudProviderEndpoint).toHaveBeenCalledWith(
      'https://api.example/v1',
      'sk-import'
    );
    expect(harness.saveCloudProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Course Provider',
        selectedModels: [
          expect.objectContaining({
            id: 'matched/model',
            features: {
              toolCalling: false,
            },
          }),
        ],
      }),
      { apiKey: 'sk-import' }
    );
    expect(harness.persistGenerationConfigForModel).toHaveBeenCalledWith(
      'cloud:provider-imported:matched%2Fmodel',
      expect.objectContaining({
        maxOutputTokens: 256,
        maxContextTokens: 2048,
      })
    );
    expect(result.importedModelCount).toBe(1);
  });
});
