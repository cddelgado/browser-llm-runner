/**
 * Browser-facing engine abstraction.
 * UI must depend on this client only, never runtime-specific APIs.
 */
export class LLMEngineClient {
  constructor() {
    this.worker = null;
    this.pendingInit = null;
    this.pendingGeneration = null;
    this.config = {
      modelId: 'onnx-community/gemma-3-1b-ONNX-GQA',
      backendPreference: 'auto',
    };
    this.onStatus = () => {};
    this.onBackendResolved = () => {};
  }

  async initialize(config = {}) {
    const requestedModel = config.modelId || this.config.modelId;
    const modelId =
      requestedModel === 'onnx-community/gemma-3-1b-it-ONNX-GQA'
        ? 'onnx-community/gemma-3-1b-ONNX-GQA'
        : requestedModel;
    this.config = { ...this.config, ...config, modelId };
    this.#ensureWorker();
    this.pendingInit = this.#sendAndWait({
      type: 'init',
      payload: this.config,
    });
    const result = await this.pendingInit;
    this.pendingInit = null;
    return result;
  }

  async generate(prompt, handlers) {
    if (!this.worker) {
      throw new Error('Engine worker is not initialized.');
    }

    if (this.pendingGeneration) {
      throw new Error('Generation is already in progress.');
    }

    const requestId = crypto.randomUUID();
    this.pendingGeneration = {
      requestId,
      onToken: handlers.onToken,
      onComplete: handlers.onComplete,
      onError: handlers.onError,
    };

    this.worker.postMessage({
      type: 'generate',
      payload: { requestId, prompt },
    });
  }

  async cancelGeneration() {
    if (!this.worker) {
      return;
    }
    this.worker.terminate();
    this.worker = null;
    this.pendingGeneration = null;
    this.pendingInit = null;
    await this.initialize(this.config);
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingGeneration = null;
    this.pendingInit = null;
  }

  #ensureWorker() {
    if (this.worker) {
      return;
    }
    this.worker = new Worker(new URL('../workers/llm.worker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', (event) => {
      this.#handleWorkerMessage(event.data);
    });
  }

  #sendAndWait(message) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Engine initialization timed out.'));
      }, 180000);

      const onMessage = (event) => {
        const data = event.data;
        if (data.type === 'init-success') {
          clearTimeout(timeout);
          this.worker.removeEventListener('message', onMessage);
          this.onBackendResolved(data.payload.backend);
          resolve(data.payload);
        } else if (data.type === 'init-error') {
          clearTimeout(timeout);
          this.worker.removeEventListener('message', onMessage);
          reject(new Error(data.payload.message));
        }
      };

      this.worker.addEventListener('message', onMessage);
      this.worker.postMessage(message);
    });
  }

  #handleWorkerMessage(data) {
    if (!data || !data.type) {
      return;
    }

    if (data.type === 'status') {
      this.onStatus(data.payload.message);
      return;
    }

    if (!this.pendingGeneration) {
      return;
    }

    if (data.payload?.requestId !== this.pendingGeneration.requestId) {
      return;
    }

    if (data.type === 'token') {
      this.pendingGeneration.onToken(data.payload.text);
      return;
    }

    if (data.type === 'complete') {
      this.pendingGeneration.onComplete(data.payload.text);
      this.pendingGeneration = null;
      return;
    }

    if (data.type === 'error') {
      this.pendingGeneration.onError(data.payload.message);
      this.pendingGeneration = null;
    }
  }
}
