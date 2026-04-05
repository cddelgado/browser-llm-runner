/**
 * Browser-facing engine abstraction.
 * UI must depend on this client only, never runtime-specific APIs.
 */
export class LLMEngineClient {
  constructor() {
    this.worker = null;
    this.pendingInit = null;
    this.pendingInitConfigKey = '';
    this.pendingGeneration = null;
    this.pendingCancel = null;
    this.pendingCancelRequestId = '';
    this.loadedModelId = null;
    this.loadedBackend = null;
    this.config = {
      modelId: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
      backendPreference: 'auto',
      runtime: {},
      generationConfig: {
        maxOutputTokens: 1024,
        maxContextTokens: 8192,
        temperature: 0.6,
        topK: 50,
        topP: 0.9,
        repetitionPenalty: 1.0,
      },
    };
    this.onStatus = (_message) => {};
    this.onBackendResolved = (_backend) => {};
    this.onProgress = (_progress) => {};
  }

  async initialize(config = {}) {
    const modelId = config.modelId || this.config.modelId;
    this.config = { ...this.config, ...config, modelId };
    if (this.worker && this.loadedModelId && this.loadedModelId !== modelId) {
      this.dispose();
      this.config = { ...this.config, ...config, modelId };
    }
    const initConfigKey = this.#getInitConfigKey(this.config);
    if (this.pendingInit) {
      if (this.pendingInitConfigKey === initConfigKey) {
        return this.pendingInit;
      }
      try {
        await this.pendingInit;
      } catch {
        // Fall through and retry with the latest config.
      }
    }
    this.#ensureWorker();
    this.pendingInitConfigKey = initConfigKey;
    this.pendingInit = this.#sendAndWait({
      type: 'init',
      payload: this.config,
    });
    try {
      const result = await this.pendingInit;
      this.loadedModelId = result?.modelId || modelId;
      this.loadedBackend = result?.backend || null;
      return result;
    } finally {
      this.pendingInit = null;
      this.pendingInitConfigKey = '';
    }
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
      onCancel: handlers.onCancel,
    };

    this.worker.postMessage({
      type: 'generate',
      payload: {
        requestId,
        prompt,
        runtime: {
          ...this.config.runtime,
          ...(handlers.runtime && typeof handlers.runtime === 'object' ? handlers.runtime : {}),
        },
        generationConfig: handlers.generationConfig || this.config.generationConfig,
      },
    });
  }

  setGenerationConfig(generationConfig) {
    if (!generationConfig) {
      return;
    }
    this.config = {
      ...this.config,
      generationConfig: {
        ...this.config.generationConfig,
        ...generationConfig,
      },
    };
  }

  async cancelGeneration() {
    if (!this.worker || !this.pendingGeneration) {
      return;
    }
    if (this.pendingCancel) {
      await this.pendingCancel;
      return;
    }
    const requestId = this.pendingGeneration.requestId;
    this.pendingCancelRequestId = requestId;
    this.pendingCancel = new Promise((resolve, reject) => {
      this.#pendingCancelResolve = resolve;
      this.#pendingCancelReject = reject;
    });
    this.worker.postMessage({
      type: 'cancel',
      payload: { requestId },
    });
    try {
      await this.pendingCancel;
    } finally {
      this.pendingCancel = null;
      this.pendingCancelRequestId = '';
      this.#pendingCancelResolve = null;
      this.#pendingCancelReject = null;
    }
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingGeneration = null;
    this.pendingInit = null;
    this.pendingInitConfigKey = '';
    if (typeof this.#pendingCancelResolve === 'function') {
      this.#pendingCancelResolve();
    }
    this.loadedModelId = null;
    this.loadedBackend = null;
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

    if (data.type === 'progress') {
      this.onProgress(data.payload || {});
      return;
    }

    if (data.type === 'canceled') {
      if (data.payload?.requestId === this.pendingCancelRequestId) {
        if (typeof this.#pendingCancelResolve === 'function') {
          this.#pendingCancelResolve();
        }
        if (this.pendingGeneration?.requestId === data.payload?.requestId) {
          if (typeof this.pendingGeneration.onCancel === 'function') {
            this.pendingGeneration.onCancel();
          }
          this.pendingGeneration = null;
        }
      }
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
      if (data.payload?.requestId === this.pendingCancelRequestId) {
        if (typeof this.#pendingCancelReject === 'function') {
          this.#pendingCancelReject(new Error(data.payload.message));
        }
      } else {
        this.pendingGeneration.onError(data.payload.message);
      }
      this.pendingGeneration = null;
    }
  }

  #getInitConfigKey(config) {
    return JSON.stringify({
      modelId: config?.modelId || '',
      backendPreference: config?.backendPreference || '',
      runtime: config?.runtime || {},
      generationConfig: config?.generationConfig || {},
    });
  }

  #pendingCancelResolve = null;
  #pendingCancelReject = null;
}
