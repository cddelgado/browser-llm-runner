import { beforeEach, describe, expect, test, vi } from 'vitest';

const getCloudProviderSecretMock = vi.fn();

vi.mock('../../src/state/cloud-provider-store.js', () => ({
  getCloudProviderSecret: getCloudProviderSecretMock,
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
});
