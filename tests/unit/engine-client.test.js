import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMEngineClient } from '../../src/llm/engine-client.js';

class MockWorker {
  static instances = [];
  static generateMode = 'complete';

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
            backend: 'cpu',
            backendDevice: 'wasm',
            modelId: message.payload?.modelId || 'test-model',
          },
        });
      });
      return;
    }

    if (message.type === 'generate') {
      if (MockWorker.generateMode === 'stall') {
        return;
      }
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

  emitError(error) {
    const set = this.listeners.get('error');
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler({ error, message: error?.message || 'Worker failed.' });
    }
  }

  #emit(type, data) {
    if (this.terminated) {
      return;
    }
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
    MockWorker.generateMode = 'complete';
    globalThis.Worker = /** @type {any} */ (MockWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.Worker = originalWorker;
  });

  test('initializes worker and resolves backend', async () => {
    const client = new LLMEngineClient();
    const onBackendResolved = vi.fn();
    client.onBackendResolved = onBackendResolved;

    const result = await client.initialize({ modelId: 'example/model' });

    expect(result.backend).toBe('cpu');
    expect(result.backendDevice).toBe('wasm');
    expect(result.modelId).toBe('example/model');
    expect(client.loadedEngineType).toBe('transformers-js');
    expect(client.loadedBackendDevice).toBe('wasm');
    expect(onBackendResolved).toHaveBeenCalledWith('cpu');
    expect(MockWorker.instances).toHaveLength(1);
    expect(MockWorker.instances[0].messages[0].type).toBe('init');
    expect(MockWorker.instances[0].messages[0].payload.engineType).toBe('transformers-js');
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

  test('rejects initialization when the worker crashes before init completes', async () => {
    const client = new LLMEngineClient();

    const initPromise = client.initialize({ modelId: 'example/model' });
    MockWorker.instances[0].emitError(new Error('Init worker crashed.'));

    await expect(initPromise).rejects.toThrow('Init worker crashed.');
    expect(client.worker).toBeNull();
    expect(client.loadedModelId).toBeNull();
  });

  test('merges per-request runtime overrides into generate payloads', async () => {
    const client = new LLMEngineClient();
    await client.initialize({
      modelId: 'example/model',
      runtime: { dtype: 'q4', enableThinking: true },
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
      dtype: 'q4',
      enableThinking: false,
    });
  });

  test('reinitializes before generation when the request switches execution into multimodal mode', async () => {
    const client = new LLMEngineClient();
    await client.initialize({
      modelId: 'example/model',
      runtime: { multimodalGeneration: false },
    });

    await client.generate('prompt', {
      runtime: { multimodalGeneration: true, imageInput: true, maxImageInputs: 1 },
      onToken: () => {},
      onComplete: () => {},
      onError: () => {},
    });

    const initMessages = MockWorker.instances[0].messages.filter((message) => message.type === 'init');
    expect(initMessages).toHaveLength(2);
    expect(initMessages[1]?.payload?.runtime).toEqual({
      multimodalGeneration: true,
      imageInput: true,
      maxImageInputs: 1,
    });

    const generateMessage = MockWorker.instances[0].messages.findLast(
      (message) => message.type === 'generate'
    );
    expect(generateMessage?.payload?.runtime).toEqual({
      multimodalGeneration: true,
      imageInput: true,
      maxImageInputs: 1,
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

  test('surfaces worker crashes as generation errors and clears the loaded session', async () => {
    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model' });

    const onError = vi.fn();
    client.generate('prompt', {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError,
      onCancel: vi.fn(),
    });

    MockWorker.instances[0].emitError(new Error('Worker crashed during generation.'));

    expect(onError).toHaveBeenCalledWith('Worker crashed during generation.');
    expect(client.pendingGeneration).toBeNull();
    expect(client.worker).toBeNull();
    expect(client.loadedModelId).toBeNull();
  });

  test('terminates stalled generations after the inactivity timeout', async () => {
    vi.useFakeTimers();
    MockWorker.generateMode = 'stall';

    const client = new LLMEngineClient();
    await client.initialize({ modelId: 'example/model' });

    const onError = vi.fn();
    client.generate('prompt', {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError,
      onCancel: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(90000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toContain(
      'Generation timed out after 90 seconds without worker activity on CPU (wasm).'
    );
    expect(client.pendingGeneration).toBeNull();
    expect(client.worker).toBeNull();
    expect(client.loadedModelId).toBeNull();
    expect(client.loadedBackendDevice).toBeNull();
    expect(MockWorker.instances[0].terminated).toBe(true);
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

  test('initializes alternative engine workers based on the configured engine type', async () => {
    const client = new LLMEngineClient();

    await client.initialize({
      modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
      engineType: 'transformers-js',
    });

    expect(client.loadedEngineType).toBe('transformers-js');
    expect(MockWorker.instances).toHaveLength(1);
    expect(MockWorker.instances[0].messages[0].payload.engineType).toBe('transformers-js');
  });
});
