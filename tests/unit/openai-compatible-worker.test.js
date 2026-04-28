import { beforeEach, describe, expect, test, vi } from 'vitest';

const getCloudProviderSecretMock = vi.fn();
const consumeCloudModelRateLimitMock = vi.fn();

vi.mock('../../src/state/cloud-provider-store.js', () => ({
  getCloudProviderSecret: getCloudProviderSecretMock,
}));

vi.mock('../../src/state/cloud-rate-limit-store.js', () => ({
  consumeCloudModelRateLimit: consumeCloudModelRateLimitMock,
}));

function createWorkerSelf() {
  const listeners = new Map();
  return {
    postMessage: vi.fn(),
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type, data) {
      const handler = listeners.get(type);
      if (typeof handler === 'function') {
        handler({ data });
      }
    },
  };
}

function createSseResponse(chunks) {
  const encoder = new globalThis.TextEncoder();
  return new globalThis.Response(
    new globalThis.ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => {
          controller.enqueue(encoder.encode(chunk));
        });
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
      },
    }
  );
}

async function flushWorkerTasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('openai-compatible.worker', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getCloudProviderSecretMock.mockResolvedValue('test-api-key');
    consumeCloudModelRateLimitMock.mockResolvedValue({
      allowed: true,
      retryAfterMs: 0,
      remainingRequests: null,
    });
    const workerSelf = createWorkerSelf();
    globalThis.self = /** @type {any} */ (workerSelf);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(),
    });
  });

  test('streams server-sent event tokens and completes with the merged response text', async () => {
    const fetchMock = /** @type {ReturnType<typeof vi.fn>} */ (globalThis.fetch);
    fetchMock.mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    await import('../../src/workers/openai-compatible.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    workerSelf.dispatch('message', {
      type: 'init',
      payload: {
        engineType: 'openai-compatible',
        modelId: 'provider/model',
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
        },
      },
    });
    await flushWorkerTasks();

    workerSelf.postMessage.mockClear();

    workerSelf.dispatch('message', {
      type: 'generate',
      payload: {
        requestId: 'request-1',
        prompt: [{ role: 'user', content: 'Say hello.' }],
        generationConfig: {
          maxContextTokens: 256,
          maxOutputTokens: 64,
          temperature: 0.6,
          topK: 40,
          topP: 0.95,
        },
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
          supportsTopK: true,
          extraBody: {
            chat_template_kwargs: {
              enable_thinking: false,
            },
          },
        },
      },
    });
    await flushWorkerTasks();

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/v1/chat/completions', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      },
      body: JSON.stringify({
        model: 'provider/model',
        messages: [{ role: 'user', content: 'Say hello.' }],
        stream: true,
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 64,
        top_k: 40,
        chat_template_kwargs: {
          enable_thinking: false,
        },
      }),
      signal: expect.any(Object),
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'token',
      payload: { requestId: 'request-1', text: 'Hello ' },
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'token',
      payload: { requestId: 'request-1', text: 'world' },
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: { requestId: 'request-1', text: 'Hello world' },
    });
  });

  test('wraps streamed remote reasoning content in thinking tags', async () => {
    const fetchMock = /** @type {ReturnType<typeof vi.fn>} */ (globalThis.fetch);
    fetchMock.mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"First, reason."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Final answer."}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    await import('../../src/workers/openai-compatible.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    workerSelf.dispatch('message', {
      type: 'init',
      payload: {
        engineType: 'openai-compatible',
        modelId: 'provider/model',
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
        },
      },
    });
    await flushWorkerTasks();

    workerSelf.postMessage.mockClear();

    workerSelf.dispatch('message', {
      type: 'generate',
      payload: {
        requestId: 'request-reasoning',
        prompt: [{ role: 'user', content: 'Think, then answer.' }],
        generationConfig: {
          maxContextTokens: 256,
          maxOutputTokens: 64,
          temperature: 0.6,
          topP: 0.95,
        },
      },
    });
    await flushWorkerTasks();

    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'token',
      payload: { requestId: 'request-reasoning', text: '<think>' },
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'token',
      payload: { requestId: 'request-reasoning', text: 'First, reason.' },
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'token',
      payload: { requestId: 'request-reasoning', text: '</think>' },
    });
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: {
        requestId: 'request-reasoning',
        text: '<think>First, reason.</think>Final answer.',
      },
    });
  });

  test('aborts an in-flight remote generation when cancel is requested', async () => {
    const fetchMock = /** @type {ReturnType<typeof vi.fn>} */ (globalThis.fetch);
    fetchMock.mockImplementation((_url, options = {}) => {
      const signal = options.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            reject(new globalThis.DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      });
    });

    await import('../../src/workers/openai-compatible.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    workerSelf.dispatch('message', {
      type: 'init',
      payload: {
        engineType: 'openai-compatible',
        modelId: 'provider/model',
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
        },
      },
    });
    await flushWorkerTasks();

    workerSelf.postMessage.mockClear();

    workerSelf.dispatch('message', {
      type: 'generate',
      payload: {
        requestId: 'request-2',
        prompt: [{ role: 'user', content: 'Keep streaming.' }],
        generationConfig: {
          maxContextTokens: 256,
          maxOutputTokens: 64,
          temperature: 0.6,
          topP: 0.95,
        },
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
        },
      },
    });
    await flushWorkerTasks();

    workerSelf.dispatch('message', {
      type: 'cancel',
      payload: {
        requestId: 'request-2',
      },
    });
    await flushWorkerTasks();

    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'canceled',
      payload: { requestId: 'request-2' },
    });
  });

  test('routes generation through the proxy when the provider requires it', async () => {
    const fetchMock = /** @type {ReturnType<typeof vi.fn>} */ (globalThis.fetch);
    fetchMock.mockResolvedValue(
      createSseResponse(['data: {"choices":[{"delta":{"content":"proxied"}}]}\n\n', 'data: [DONE]\n\n'])
    );

    await import('../../src/workers/openai-compatible.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    workerSelf.dispatch('message', {
      type: 'init',
      payload: {
        engineType: 'openai-compatible',
        modelId: 'provider/model',
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
          requiresProxy: true,
        },
      },
    });
    await flushWorkerTasks();

    workerSelf.postMessage.mockClear();

    workerSelf.dispatch('message', {
      type: 'generate',
      payload: {
        requestId: 'request-proxy',
        prompt: [{ role: 'user', content: 'Use proxy.' }],
        generationConfig: {
          maxContextTokens: 256,
          maxOutputTokens: 64,
          temperature: 0.6,
          topP: 0.95,
        },
        runtime: {
          proxyUrl: 'https://proxy.example/?url=',
        },
      },
    });
    await flushWorkerTasks();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example/?url=https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      })
    );
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: { requestId: 'request-proxy', text: 'proxied' },
    });
  });

  test('retries generation through the proxy when a direct request is CORS-blocked', async () => {
    const fetchMock = /** @type {ReturnType<typeof vi.fn>} */ (globalThis.fetch);
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        createSseResponse(['data: {"choices":[{"delta":{"content":"fallback"}}]}\n\n', 'data: [DONE]\n\n'])
      );

    await import('../../src/workers/openai-compatible.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    workerSelf.dispatch('message', {
      type: 'init',
      payload: {
        engineType: 'openai-compatible',
        modelId: 'provider/model',
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
        },
      },
    });
    await flushWorkerTasks();

    workerSelf.postMessage.mockClear();

    workerSelf.dispatch('message', {
      type: 'generate',
      payload: {
        requestId: 'request-proxy-fallback',
        prompt: [{ role: 'user', content: 'Fallback.' }],
        generationConfig: {
          maxContextTokens: 256,
          maxOutputTokens: 64,
          temperature: 0.6,
          topP: 0.95,
        },
        runtime: {
          proxyUrl: 'https://proxy.example/?url=',
        },
      },
    });
    await flushWorkerTasks();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/v1/chat/completions');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://proxy.example/?url=https://example.test/v1/chat/completions'
    );
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'complete',
      payload: { requestId: 'request-proxy-fallback', text: 'fallback' },
    });
  });

  test('blocks remote generation when the browser-local rate limit is exhausted', async () => {
    consumeCloudModelRateLimitMock.mockResolvedValue({
      allowed: false,
      retryAfterMs: 60000,
      remainingRequests: 0,
    });

    await import('../../src/workers/openai-compatible.worker.js');
    const workerSelf = /** @type {any} */ (globalThis.self);

    workerSelf.dispatch('message', {
      type: 'init',
      payload: {
        engineType: 'openai-compatible',
        modelId: 'provider/model',
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
        },
      },
    });
    await flushWorkerTasks();

    workerSelf.postMessage.mockClear();

    workerSelf.dispatch('message', {
      type: 'generate',
      payload: {
        requestId: 'request-3',
        prompt: [{ role: 'user', content: 'Try again.' }],
        generationConfig: {
          maxContextTokens: 256,
          maxOutputTokens: 64,
          temperature: 0.6,
          topP: 0.95,
        },
        runtime: {
          providerId: 'provider-1',
          apiBaseUrl: 'https://example.test/v1',
          remoteModelId: 'provider/model',
          rateLimit: {
            maxRequests: 1,
            windowMs: 60000,
          },
        },
      },
    });
    await flushWorkerTasks();

    expect(consumeCloudModelRateLimitMock).toHaveBeenCalledWith(
      'provider-1',
      'provider/model',
      {
        maxRequests: 1,
        windowMs: 60000,
      }
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(workerSelf.postMessage).toHaveBeenCalledWith({
      type: 'error',
      payload: {
        requestId: 'request-3',
        message: 'This cloud model hit its browser-local rate limit. Try again in about 1 minute.',
      },
    });
  });
});
