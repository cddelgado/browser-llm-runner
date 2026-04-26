import { describe, expect, test, vi } from 'vitest';
import {
  buildRuntimeModelCatalog,
  buildCloudModelId,
  mergeCloudProviderConfigs,
  normalizeCloudProviderConfigs,
} from '../../src/cloud/cloud-provider-config.js';
import {
  inferOpenAiCompatibleMaxOutputTokensField,
  inferOpenAiCompatibleModelFeatures,
  inspectOpenAiCompatibleEndpoint,
  normalizeOpenAiCompatibleEndpoint,
  normalizeOpenAiCompatibleModelList,
} from '../../src/cloud/openai-compatible.js';
import {
  normalizeOpenAiCompatiblePromptMessages,
  extractOpenAiCompatibleResponseText,
  extractOpenAiCompatibleStreamText,
} from '../../src/cloud/openai-compatible-prompt.js';

describe('cloud provider helpers', () => {
  test('normalizes OpenAI-compatible endpoints to a reusable base URL', () => {
    expect(normalizeOpenAiCompatibleEndpoint('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1'
    );
    expect(normalizeOpenAiCompatibleEndpoint('https://openrouter.ai/api/v1/models')).toBe(
      'https://openrouter.ai/api/v1'
    );
  });

  test('inspects an OpenAI-compatible endpoint by reading /models', async () => {
    const fetchRef = vi.fn(async () =>
      new globalThis.Response(
        JSON.stringify({
          data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1-mini' }],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    );

    const result = await inspectOpenAiCompatibleEndpoint('https://api.openai.com/v1', 'sk-test', {
      fetchRef,
    });

    expect(fetchRef).toHaveBeenCalledTimes(1);
    expect(fetchRef).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        method: 'GET',
      })
    );
    expect(result).toMatchObject({
      type: 'openai-compatible',
      endpoint: 'https://api.openai.com/v1',
      endpointHost: 'api.openai.com',
      displayName: 'api.openai.com',
      supportsTopK: false,
      requiresProxy: false,
    });
    expect(result.availableModels.map((model) => model.id)).toEqual(['gpt-4.1-mini', 'gpt-4o-mini']);
  });

  test('flags a provider as proxy-required when /models needs CORS proxy fallback', async () => {
    const fetchRef = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            data: [{ id: 'remote-model' }],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }
        )
      );

    const result = await inspectOpenAiCompatibleEndpoint('https://provider.example/v1', 'sk-test', {
      fetchRef,
      proxyUrl: 'https://proxy.example/?url=',
    });

    expect(fetchRef).toHaveBeenNthCalledWith(
      1,
      'https://provider.example/v1/models',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchRef).toHaveBeenNthCalledWith(
      2,
      'https://proxy.example/?url=https://provider.example/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      })
    );
    expect(result.requiresProxy).toBe(true);
  });

  test('detects tool support from provider model metadata when it is advertised', () => {
    expect(
      inferOpenAiCompatibleModelFeatures({
        id: 'meta-llama/3.1-8b-instruct',
        supported_parameters: ['tools', 'tool_choice'],
      })
    ).toEqual({
      toolCalling: true,
    });

    expect(
      normalizeOpenAiCompatibleModelList([
        {
          id: 'gpt-4.1-mini',
          capabilities: {
            tools: true,
          },
        },
      ])
    ).toEqual([
      {
        id: 'gpt-4.1-mini',
        displayName: 'gpt-4.1-mini',
        detectedFeatures: {
          toolCalling: true,
        },
      },
    ]);
  });

  test('uses the strict OpenAI request profile only for OpenAI-hosted endpoints', () => {
    expect(inferOpenAiCompatibleMaxOutputTokensField('https://api.openai.com/v1')).toBe(
      'max_completion_tokens'
    );
    expect(inferOpenAiCompatibleMaxOutputTokensField('https://foo.openai.com/v1')).toBe(
      'max_completion_tokens'
    );
    expect(inferOpenAiCompatibleMaxOutputTokensField('https://openrouter.ai/api/v1')).toBe(
      'max_tokens'
    );
  });

  test('builds runtime model catalog entries for selected cloud models', () => {
    const providers = normalizeCloudProviderConfigs([
      {
        id: 'provider-1',
        type: 'openai-compatible',
        endpoint: 'https://openrouter.ai/api/v1',
        endpointHost: 'openrouter.ai',
        displayName: 'OpenRouter',
        hasSecret: true,
        supportsTopK: true,
        requiresProxy: true,
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
          },
        ],
      },
    ]);

    expect(buildRuntimeModelCatalog(providers)).toEqual([
      expect.objectContaining({
        id: buildCloudModelId('provider-1', 'meta-llama/3.1-8b-instruct'),
        displayName: 'Llama 3.1 8B',
        engine: { type: 'openai-compatible' },
        features: expect.objectContaining({
          toolCalling: true,
        }),
        toolCalling: {
          format: 'json',
          nameKey: 'name',
          argumentsKey: 'parameters',
        },
        runtime: expect.objectContaining({
          providerId: 'provider-1',
          providerHasSecret: true,
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          remoteModelId: 'meta-llama/3.1-8b-instruct',
          supportsTopK: true,
          requiresProxy: true,
        }),
      }),
    ]);
  });

  test('preserves detected tool support and lets selected cloud models inherit it by default', () => {
    const providers = normalizeCloudProviderConfigs([
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
        selectedModels: [{ id: 'meta-llama/3.1-8b-instruct' }],
      },
    ]);

    expect(providers[0]?.selectedModels[0]).toMatchObject({
      detectedFeatures: {
        toolCalling: true,
      },
      features: {
        toolCalling: true,
      },
    });
  });

  test('merges preconfigured providers with stored overrides and preserves managed models', () => {
    const merged = mergeCloudProviderConfigs(
      [
        {
          id: 'managed-provider',
          type: 'openai-compatible',
          endpoint: 'https://managed.example/v1',
          displayName: 'Managed Provider',
          links: {
            createAccountUrl: 'https://managed.example/signup',
            createTokenUrl: 'https://managed.example/tokens',
            dataSecurityUrl: 'https://managed.example/security',
          },
          selectedModels: [
            {
              id: 'managed/model',
              displayName: 'Managed Model',
              generation: {
                defaultMaxOutputTokens: 256,
                maxOutputTokens: 512,
                defaultMaxContextTokens: 2048,
                maxContextTokens: 2048,
              },
              rateLimit: {
                maxRequests: 25,
                windowMs: 3600000,
              },
            },
          ],
        },
      ],
      [
        {
          id: 'managed-provider',
          type: 'openai-compatible',
          endpoint: 'https://managed.example/v1',
          displayName: 'Managed Provider',
          hasSecret: true,
          selectedModels: [
            {
              id: 'managed/model',
              displayName: 'Managed Model',
              features: {
                toolCalling: true,
              },
            },
            {
              id: 'optional/model',
              displayName: 'Optional Model',
            },
          ],
        },
      ]
    );

    expect(merged).toEqual([
      expect.objectContaining({
        id: 'managed-provider',
        preconfigured: true,
        hasSecret: true,
        links: {
          createAccountUrl: 'https://managed.example/signup',
          createTokenUrl: 'https://managed.example/tokens',
          dataSecurityUrl: 'https://managed.example/security',
        },
        selectedModels: [
          expect.objectContaining({
            id: 'managed/model',
            managed: true,
            features: {
              toolCalling: true,
            },
            rateLimit: {
              maxRequests: 25,
              windowMs: 3600000,
            },
          }),
          expect.objectContaining({
            id: 'optional/model',
            managed: false,
          }),
        ],
      }),
    ]);
  });

  test('normalizes prompts for remote chat completion requests and trims old history approximately', () => {
    const prompt = [
      { role: 'system', content: 'You are concise.' },
      { role: 'user', content: 'Old question '.repeat(120) },
      { role: 'assistant', content: 'Old answer '.repeat(120) },
      { role: 'tool', toolName: 'web_lookup', content: 'https://example.com result text' },
      { role: 'user', content: [{ type: 'text', text: 'Latest question' }] },
    ];

    const normalized = normalizeOpenAiCompatiblePromptMessages(prompt, {
      maxContextTokens: 64,
      maxOutputTokens: 16,
    });

    expect(normalized[0]).toEqual({
      role: 'system',
      content: 'You are concise.',
    });
    expect(normalized.at(-1)).toEqual({
      role: 'user',
      content: 'Latest question',
    });
    expect(normalized.some((message) => message.content.includes('[Tool result: web_lookup]'))).toBe(
      true
    );
    expect(normalized.some((message) => message.content.includes('Old question'))).toBe(false);
  });

  test('extracts text from streamed and non-streamed OpenAI-compatible responses', () => {
    expect(
      extractOpenAiCompatibleStreamText({
        choices: [{ delta: { content: 'hello' } }],
      })
    ).toBe('hello');
    expect(
      extractOpenAiCompatibleResponseText({
        choices: [{ message: { content: 'final answer' } }],
      })
    ).toBe('final answer');
  });
});
