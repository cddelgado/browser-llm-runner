import { DEFAULT_ENGINE_TYPE, getEngineDescriptor, normalizeEngineType } from './engines/index.js';

const ENGINE_DEBUG_PREFIX = '[LLMEngineClient]';
const GENERATION_INACTIVITY_TIMEOUT_MS = 90000;

function logEngineDebug(event, details = undefined) {
  try {
    if (details === undefined) {
      console.debug(ENGINE_DEBUG_PREFIX, event);
      return;
    }
    console.debug(ENGINE_DEBUG_PREFIX, event, details);
  } catch {
    // Ignore console failures.
  }
}

function logEngineWarn(event, details = undefined) {
  try {
    if (details === undefined) {
      console.warn(ENGINE_DEBUG_PREFIX, event);
      return;
    }
    console.warn(ENGINE_DEBUG_PREFIX, event, details);
  } catch {
    // Ignore console failures.
  }
}

function logEngineError(event, details = undefined) {
  try {
    if (details === undefined) {
      console.error(ENGINE_DEBUG_PREFIX, event);
      return;
    }
    console.error(ENGINE_DEBUG_PREFIX, event, details);
  } catch {
    // Ignore console failures.
  }
}

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
    this.loadedBackendDevice = null;
    this.loadedEngineType = null;
    this.engineDescriptor = null;
    this.config = {
      engineType: DEFAULT_ENGINE_TYPE,
      modelId: 'onnx-community/Llama-3.2-3B-Instruct-onnx-web',
      backendPreference: 'webgpu',
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
    const engineType = normalizeEngineType(config.engineType || this.config.engineType);
    const modelId = config.modelId || this.config.modelId;
    logEngineDebug('initialize-request', {
      modelId,
      engineType,
      backendPreference: config.backendPreference || this.config.backendPreference,
    });
    this.config = { ...this.config, ...config, engineType, modelId };
    if (this.#shouldReplaceWorker({ modelId, engineType })) {
      this.dispose();
      this.config = { ...this.config, ...config, engineType, modelId };
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
    if (this.#shouldReplaceWorker({ modelId, engineType })) {
      this.dispose();
      this.config = { ...this.config, ...config, engineType, modelId };
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
      this.loadedBackendDevice = result?.backendDevice || null;
      this.loadedEngineType = result?.engineType || engineType;
      logEngineDebug('initialize-success', {
        modelId: this.loadedModelId,
        backend: this.loadedBackend,
        backendDevice: this.loadedBackendDevice,
        engineType: this.loadedEngineType,
      });
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
      logEngineWarn('generate-rejected-pending', {
        requestId: this.pendingGeneration.requestId,
        loadedModelId: this.loadedModelId,
        loadedBackend: this.loadedBackend,
      });
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
    logEngineDebug('generate-request', {
      requestId,
      loadedModelId: this.loadedModelId,
      loadedBackend: this.loadedBackend,
      loadedBackendDevice: this.loadedBackendDevice,
      runtimeKeys: Object.keys(
        handlers.runtime && typeof handlers.runtime === 'object' ? handlers.runtime : {}
      ),
    });
    this.#armGenerationWatchdog({ announce: true });

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
    logEngineDebug('cancel-request', {
      requestId,
      loadedModelId: this.loadedModelId,
      loadedBackend: this.loadedBackend,
    });
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
    this.#clearGenerationWatchdog();
    this.pendingGeneration = null;
    this.pendingInit = null;
    this.pendingInitConfigKey = '';
    if (typeof this.#pendingCancelResolve === 'function') {
      this.#pendingCancelResolve();
    }
    this.loadedModelId = null;
    this.loadedBackend = null;
    this.loadedBackendDevice = null;
    this.loadedEngineType = null;
    this.engineDescriptor = null;
    this.#clearPendingInitState();
  }

  #ensureWorker() {
    if (this.worker) {
      return;
    }
    this.engineDescriptor = getEngineDescriptor(this.config.engineType);
    if (this.engineDescriptor.kind !== 'worker') {
      throw new Error(`Unsupported engine driver kind: ${this.engineDescriptor.kind}`);
    }
    this.worker = this.engineDescriptor.createWorker();
    this.worker.addEventListener('message', (event) => {
      this.#handleWorkerMessage(event.data);
    });
    this.worker.addEventListener('error', (event) => {
      this.#handleWorkerFailure(event);
    });
    this.worker.addEventListener('messageerror', () => {
      this.#handleWorkerFailure(new Error('Model worker sent an unreadable message.'));
    });
  }

  #sendAndWait(message) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#clearPendingInitState();
        reject(new Error('Engine initialization timed out.'));
      }, 180000);
      this.#pendingInitReject = reject;
      this.#pendingInitTimeout = timeout;

      const onMessage = (event) => {
        const data = event.data;
        if (data.type === 'init-success') {
          clearTimeout(timeout);
          this.#clearPendingInitState();
          this.worker.removeEventListener('message', onMessage);
          this.onBackendResolved(data.payload.backend);
          resolve(data.payload);
        } else if (data.type === 'init-error') {
          clearTimeout(timeout);
          this.#clearPendingInitState();
          this.worker.removeEventListener('message', onMessage);
          logEngineError('init-error', {
            message: data.payload?.message || '',
            details: data.payload?.details || null,
            loadedModelId: this.loadedModelId,
            loadedBackend: this.loadedBackend,
            loadedBackendDevice: this.loadedBackendDevice,
          });
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
      if (this.pendingGeneration) {
        this.#touchGenerationWatchdog();
      }
      logEngineDebug('worker-status', {
        message: data.payload.message,
      });
      this.onStatus(data.payload.message);
      return;
    }

    if (data.type === 'progress') {
      if (this.pendingGeneration) {
        this.#touchGenerationWatchdog();
      }
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
          this.#clearGenerationWatchdog();
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
      this.#touchGenerationWatchdog();
      this.pendingGeneration.onToken(data.payload.text);
      return;
    }

    if (data.type === 'complete') {
      logEngineDebug('generate-complete', {
        requestId: data.payload?.requestId || '',
        outputLength: typeof data.payload?.text === 'string' ? data.payload.text.length : 0,
      });
      this.#clearGenerationWatchdog();
      this.pendingGeneration.onComplete(data.payload.text);
      this.pendingGeneration = null;
      return;
    }

    if (data.type === 'error') {
      logEngineWarn('generate-error', {
        requestId: data.payload?.requestId || '',
        message: data.payload?.message || '',
        loadedBackendDevice: this.loadedBackendDevice,
      });
      this.#clearGenerationWatchdog();
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

  #handleWorkerFailure(eventOrError) {
    const error = this.#normalizeWorkerFailure(eventOrError);
    this.#clearGenerationWatchdog();
    logEngineError('worker-failure', {
      message: error.message,
      loadedModelId: this.loadedModelId,
      loadedBackend: this.loadedBackend,
      loadedBackendDevice: this.loadedBackendDevice,
      pendingGenerationRequestId: this.pendingGeneration?.requestId || '',
    });

    if (typeof this.#pendingInitReject === 'function') {
      this.#pendingInitReject(error);
    }
    this.pendingInit = null;
    this.pendingInitConfigKey = '';
    this.#clearPendingInitState();

    if (this.pendingGeneration) {
      if (this.pendingGeneration.requestId === this.pendingCancelRequestId) {
        if (typeof this.#pendingCancelReject === 'function') {
          this.#pendingCancelReject(error);
        }
      } else if (typeof this.pendingGeneration.onError === 'function') {
        this.pendingGeneration.onError(error.message);
      }
      this.pendingGeneration = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.loadedModelId = null;
    this.loadedBackend = null;
    this.loadedBackendDevice = null;
    this.loadedEngineType = null;
    this.engineDescriptor = null;
  }

  #normalizeWorkerFailure(eventOrError) {
    if (eventOrError instanceof Error) {
      return eventOrError;
    }
    if (eventOrError?.error instanceof Error) {
      return eventOrError.error;
    }
    if (typeof eventOrError?.message === 'string' && eventOrError.message.trim()) {
      return new Error(eventOrError.message.trim());
    }
    return new Error('Model worker failed.');
  }

  #clearPendingInitState() {
    if (this.#pendingInitTimeout !== null) {
      clearTimeout(this.#pendingInitTimeout);
    }
    this.#pendingInitTimeout = null;
    this.#pendingInitReject = null;
  }

  #armGenerationWatchdog({ announce = false } = {}) {
    this.#clearGenerationWatchdog();
    if (!this.pendingGeneration) {
      return;
    }
    const requestId = this.pendingGeneration.requestId;
    this.#generationWatchdogTimeout = setTimeout(() => {
      if (!this.pendingGeneration || this.pendingGeneration.requestId !== requestId) {
        return;
      }
      const timeoutSeconds = Math.round(GENERATION_INACTIVITY_TIMEOUT_MS / 1000);
      const backendLabel = this.loadedBackend ? this.loadedBackend.toUpperCase() : 'UNKNOWN';
      const deviceLabel = this.loadedBackendDevice || 'unknown';
      const message = `Generation timed out after ${timeoutSeconds} seconds without worker activity on ${backendLabel} (${deviceLabel}). The worker was terminated so the next request can recover cleanly.`;
      logEngineError('generate-timeout', {
        requestId,
        timeoutMs: GENERATION_INACTIVITY_TIMEOUT_MS,
        loadedModelId: this.loadedModelId,
        loadedBackend: this.loadedBackend,
        loadedBackendDevice: this.loadedBackendDevice,
      });
      this.#handleWorkerFailure(new Error(message));
    }, GENERATION_INACTIVITY_TIMEOUT_MS);
    if (announce) {
      logEngineDebug('generate-watchdog-armed', {
        requestId,
        timeoutMs: GENERATION_INACTIVITY_TIMEOUT_MS,
        loadedBackend: this.loadedBackend,
        loadedBackendDevice: this.loadedBackendDevice,
      });
    }
  }

  #touchGenerationWatchdog() {
    if (!this.pendingGeneration) {
      return;
    }
    this.#armGenerationWatchdog();
  }

  #clearGenerationWatchdog() {
    if (this.#generationWatchdogTimeout !== null) {
      clearTimeout(this.#generationWatchdogTimeout);
    }
    this.#generationWatchdogTimeout = null;
  }

  #getInitConfigKey(config) {
    return JSON.stringify({
      engineType: normalizeEngineType(config?.engineType),
      modelId: config?.modelId || '',
      backendPreference: config?.backendPreference || '',
      runtime: config?.runtime || {},
      generationConfig: config?.generationConfig || {},
    });
  }

  #shouldReplaceWorker({ modelId, engineType }) {
    const normalizedEngineType = normalizeEngineType(engineType);
    return Boolean(
      this.worker &&
      ((this.loadedModelId && this.loadedModelId !== modelId) ||
        (this.loadedEngineType && this.loadedEngineType !== normalizedEngineType))
    );
  }

  #pendingCancelResolve = null;
  #pendingCancelReject = null;
  #generationWatchdogTimeout = null;
  #pendingInitReject = null;
  #pendingInitTimeout = null;
}
