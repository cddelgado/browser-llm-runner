import { describe, expect, test, vi } from 'vitest';
import {
  buildRuntimeModelCatalog,
  buildCloudModelId,
  normalizeCloudProviderConfigs,
} from '../../src/cloud/cloud-provider-config.js';
import {
  inspectOpenAiCompatibleEndpoint,
  normalizeOpenAiCompatibleEndpoint,
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
      new Response(
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
    expect(fetchRef.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
    expect(result).toMatchObject({
      type: 'openai-compatible',
      endpoint: 'https://api.openai.com/v1',
      endpointHost: 'api.openai.com',
      displayName: 'api.openai.com',
      supportsTopK: false,
    });
    expect(result.availableModels.map((model) => model.id)).toEqual(['gpt-4.1-mini', 'gpt-4o-mini']);
  });

  test('builds runtime model catalog entries for selected cloud models', () => {
    const providers = normalizeCloudProviderConfigs([
      {
        id: 'provider-1',
        type: 'openai-compatible',
        endpoint: 'https://openrouter.ai/api/v1',
        endpointHost: 'openrouter.ai',
        displayName: 'OpenRouter',
        supportsTopK: true,
        availableModels: [{ id: 'meta-llama/3.1-8b-instruct', displayName: 'Llama 3.1 8B' }],
        selectedModels: [{ id: 'meta-llama/3.1-8b-instruct', displayName: 'Llama 3.1 8B' }],
      },
    ]);

    expect(buildRuntimeModelCatalog(providers)).toEqual([
      expect.objectContaining({
        id: buildCloudModelId('provider-1', 'meta-llama/3.1-8b-instruct'),
        displayName: 'Llama 3.1 8B',
        engine: { type: 'openai-compatible' },
        runtime: expect.objectContaining({
          providerId: 'provider-1',
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          remoteModelId: 'meta-llama/3.1-8b-instruct',
          supportsTopK: true,
        }),
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
