import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMEngineClient } from '../../src/llm/engine-client.js';

class MockWorker {
  static instances = [];

  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
    MockWorker.instances.push(this);
  }

  addEventListener(type, handler) {
    const set = this.listeners.get(type) || new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type, handler) {
    const set = this.listeners.get(type);
    if (!set) {
      return;
    }
    set.delete(handler);
  }

  postMessage(message) {
    this.messages.push(message);

    if (message.type === 'init') {
      queueMicrotask(() => {
        this.#emit('message', {
          type: 'init-success',
          payload: {
            backend: 'wasm',
            modelId: message.payload?.modelId || 'test-model',
          },
        });
      });
      return;
    }

    if (message.type === 'generate') {
      const requestId = message.payload.requestId;
      queueMicrotask(() => {
        this.#emit('message', {
          type: 'token',
          payload: { requestId, text: 'Hello ' },
        });
      });
      queueMicrotask(() => {
        this.#emit('message', {
          type: 'complete',
          payload: { requestId, text: 'Hello world' },
        });
      });
      return;
    }

    if (message.type === 'cancel') {
      queueMicrotask(() => {
        this.#emit('message', {
          type: 'canceled',
          payload: {
            requestId: message.payload?.requestId,
          },
        });
      });
    }
  }

  terminate() {
    this.terminated = true;
  }

  #emit(type, data) {
    const set = this.listeners.get(type);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler({ data });
    }
  }
}

describe('LLMEngineClient', () => {
  let originalWorker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    MockWorker.instances = [];
    globalThis.Worker = /** @type {any} */ (MockWorker);
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  test('initializes worker and resolves backend', async () => {
    const client = new LLMEngineClient();
    const onBackendResolved = vi.fn();
    client.onBackendResolved = onBackendResolved;

    const result = await client.initialize({ modelId: 'example/model' });

    expect(result.backend).toBe('wasm');
    expect(result.modelId).toBe('example/model');
    expect(onBackendResolved).toHaveBeenCalledWith('wasm');
    expect(MockWorker.instances).toHaveLength(1);
    expect(MockWorker.instances[0].messages[0].type).toBe('init');
  });

  test('deduplicates matching initialize requests while a load is already in flight', async () => {
    const client = new LLMEngineClient();

    const [firstResult, secondResult] = await Promise.all([
      client.initialize({ modelId: 'example/model' }),
      client.initialize({ modelId: 'example/model' }),
    ]);

    expect(firstResult).toEqual(secondResult);
    expect(MockWorker.instances).toHaveLength(1);
    expect(
      MockWorker.instances[0].messages.filter((message) => message.type === 'init')
    ).toHaveLength(1);
  });

  test('streams tokens and completes generation', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model' });

    const onToken = vi.fn();
    const onError = vi.fn();

    const completed = new Promise((resolve) => {
      client.generate('prompt', {
        onToken,
        onError,
        onComplete: resolve,
      });
    });

    const finalText = await completed;

    expect(onToken).toHaveBeenCalledWith('Hello ');
    expect(onError).not.toHaveBeenCalled();
    expect(finalText).toBe('Hello world');
  });

  test('merges per-request runtime overrides into generate payloads', async () => {
    const client = new LLMEngineClient();
    await client.initialize({
      modelId: 'example/model',
      runtime: { dtype: 'q4f16', enableThinking: true },
    });

    client.generate('prompt', {
      runtime: { enableThinking: false },
      onToken: () => {},
      onComplete: () => {},
      onError: () => {},
    });

    const generateMessage = MockWorker.instances[0].messages.find(
      (message) => message.type === 'generate'
    );
    expect(generateMessage?.payload?.runtime).toEqual({
      dtype: 'q4f16',
      enableThinking: false,
    });
  });

  test('cancelGeneration sends a cancel request without reloading the worker', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model' });

    const firstWorker = client.worker;
    client.pendingGeneration = {
      requestId: '11111111-1111-1111-1111-111111111111',
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onCancel: vi.fn(),
    };
    await client.cancelGeneration();

    expect(/** @type {any} */ (firstWorker).terminated).toBe(false);
    expect(client.worker).toBeTruthy();
    expect(client.worker).toBe(firstWorker);
    expect(client.pendingGeneration).toBeNull();
    expect(MockWorker.instances).toHaveLength(1);
    expect(MockWorker.instances[0].messages.at(-1)).toEqual({
      type: 'cancel',
      payload: { requestId: '11111111-1111-1111-1111-111111111111' },
    });
  });

  test('invokes onCancel when a generation is canceled', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model' });

    const onCancel = vi.fn();
    client.pendingGeneration = {
      requestId: '22222222-2222-2222-2222-222222222222',
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onCancel,
    };

    await client.cancelGeneration();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(client.pendingGeneration).toBeNull();
  });

  test('switching models unloads the previous worker before loading the next model', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model-a' });

    const firstWorker = client.worker;
    await client.initialize({ modelId: 'example/model-b' });

    expect(/** @type {any} */ (firstWorker).terminated).toBe(true);
    expect(client.worker).not.toBe(firstWorker);
    expect(client.loadedModelId).toBe('example/model-b');
    expect(MockWorker.instances).toHaveLength(2);
  });
});
