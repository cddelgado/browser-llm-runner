import singleThreadWasmPath from '@wllama/wllama/esm/single-thread/wllama.wasm?url';
import multiThreadWasmPath from '@wllama/wllama/esm/multi-thread/wllama.wasm?url';

import {
  buildDefaultGenerationConfig,
  sanitizeGenerationConfig,
} from '../config/generation-config.js';
import {
  expandWllamaModelUrls,
  normalizeWllamaThreadCount,
  shouldRetryWllamaModelLoad,
} from '../llm/wllama-load.js';
import { normalizeWllamaPromptMessages } from '../llm/wllama-prompt.js';

const WORKER_GENERATION_LIMITS = {
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: Number.MAX_SAFE_INTEGER,
  defaultMaxContextTokens: 8192,
  maxContextTokens: Number.MAX_SAFE_INTEGER,
  minTemperature: 0.1,
  maxTemperature: 2.0,
  defaultTemperature: 0.7,
  defaultTopK: 20,
  defaultTopP: 0.8,
  defaultRepetitionPenalty: 1.0,
};

let wllama = null;
let loadedModelId = '';
let loadedRuntimeConfig = {};
let loadedRuntimeConfigKey = '';
let generationConfig = buildDefaultGenerationConfig(WORKER_GENERATION_LIMITS);
let activeGeneration = null;
let wllamaLibraryPromise = null;

function ensureWorkerDocumentShim() {
  const workerGlobal = /** @type {any} */ (globalThis);
  const baseUri = self.location?.href || '';
  if (typeof workerGlobal.document === 'undefined') {
    Object.defineProperty(workerGlobal, 'document', {
      value: {
        baseURI: baseUri,
      },
      configurable: true,
      writable: true,
    });
    return;
  }
  const documentLike = /** @type {any} */ (workerGlobal.document);
  if (typeof documentLike.baseURI !== 'string' || !documentLike.baseURI) {
    Object.defineProperty(documentLike, 'baseURI', {
      value: baseUri,
      configurable: true,
    });
  }
}

async function loadWllamaLibrary() {
  ensureWorkerDocumentShim();
  if (!wllamaLibraryPromise) {
    wllamaLibraryPromise = import('@wllama/wllama');
  }
  return wllamaLibraryPromise;
}

function buildWllamaAssetPaths() {
  return {
    'single-thread/wllama.wasm': singleThreadWasmPath,
    'multi-thread/wllama.wasm': multiThreadWasmPath,
  };
}

function buildWllamaConstructorConfig(runtime = {}) {
  return {
    ...(runtime.parallelDownloads ? { parallelDownloads: runtime.parallelDownloads } : {}),
    ...(runtime.allowOffline ? { allowOffline: true } : {}),
  };
}

function buildWllamaLoadConfig(runtime = {}, nextGenerationConfig = {}, extraConfig = {}) {
  const threadCount = resolveThreadCount(runtime);
  return {
    n_ctx: nextGenerationConfig.maxContextTokens,
    ...(threadCount ? { n_threads: threadCount } : {}),
    ...(runtime.batchSize ? { n_batch: runtime.batchSize } : {}),
    ...extraConfig,
  };
}

function buildWllamaProgressCallback() {
  return ({ loaded, total }) => {
    const normalizedLoaded = Number.isFinite(loaded) && loaded >= 0 ? loaded : 0;
    const normalizedTotal = Number.isFinite(total) && total >= 0 ? total : 0;
    const percent =
      normalizedTotal > 0 ? Math.round((normalizedLoaded / normalizedTotal) * 100) : 0;
    postProgress({
      percent,
      message:
        normalizedLoaded > 0 && normalizedTotal > 0
          ? 'Downloading GGUF model...'
          : 'Loading GGUF model...',
      loadedBytes: normalizedLoaded,
      totalBytes: normalizedTotal,
    });
  };
}

async function readBlobHeader(blob, byteCount = 8) {
  if (!(blob instanceof Blob)) {
    return new Uint8Array(0);
  }
  return new Uint8Array(await blob.slice(0, byteCount).arrayBuffer());
}

function formatHeaderHex(bytes) {
  return Array.from(bytes || [])
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function formatHeaderAscii(bytes) {
  return Array.from(bytes || [])
    .map((value) => (value >= 32 && value < 127 ? String.fromCharCode(value) : '.'))
    .join('');
}

function hasGgufHeader(bytes) {
  return (
    bytes instanceof Uint8Array &&
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x47 &&
    bytes[2] === 0x55 &&
    bytes[3] === 0x46
  );
}

async function inspectFirstModelBlob(blobs) {
  const firstBlob = Array.isArray(blobs) ? blobs[0] : null;
  const headerBytes = await readBlobHeader(firstBlob, 8);
  return {
    headerBytes,
    headerHex: formatHeaderHex(headerBytes),
    headerAscii: formatHeaderAscii(headerBytes),
    isGguf: hasGgufHeader(headerBytes),
  };
}

async function createWllamaInstance(runtime = {}) {
  const { LoggerWithoutDebug, Wllama } = await loadWllamaLibrary();
  return new Wllama(buildWllamaAssetPaths(), {
    logger: LoggerWithoutDebug,
    ...buildWllamaConstructorConfig(runtime),
  });
}

async function clearCachedWllamaModel(instance, modelUrl) {
  if (!instance?.modelManager?.cacheManager || !modelUrl) {
    return;
  }
  for (const currentUrl of expandWllamaModelUrls(modelUrl)) {
    await instance.modelManager.cacheManager.delete(currentUrl);
  }
}

async function resolveWllamaModelBlobs(instance, modelUrl, extraConfig = {}) {
  const useCache = extraConfig.useCache !== false;
  const model = useCache
    ? await instance.modelManager.getModelOrDownload(modelUrl, {
        progressCallback: buildWllamaProgressCallback(),
      })
    : await instance.modelManager.downloadModel(modelUrl, {
        progressCallback: buildWllamaProgressCallback(),
      });
  const blobs = await model.open();
  const headerInfo = await inspectFirstModelBlob(blobs);
  return {
    model,
    blobs,
    headerInfo,
  };
}

async function loadConfiguredWllamaModel(
  instance,
  blobs,
  runtime,
  nextGenerationConfig,
  extraConfig = {}
) {
  await instance.loadModel(
    blobs,
    buildWllamaLoadConfig(runtime, nextGenerationConfig, extraConfig)
  );
}

function toErrorMessage(value) {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value || 'Unknown inference error.');
}

function normalizeGenerationConfig(rawConfig) {
  return sanitizeGenerationConfig(rawConfig, WORKER_GENERATION_LIMITS);
}

function post(type, payload = {}) {
  self.postMessage({ type, payload });
}

function postStatus(message) {
  post('status', { message });
}

function postProgress({
  percent = 0,
  message = 'Loading model files...',
  loadedBytes = 0,
  totalBytes = 0,
  resetFiles = false,
}) {
  post('progress', {
    percent: Math.max(0, Math.min(100, Number(percent) || 0)),
    message,
    file: '',
    status: '',
    loadedBytes: Number.isFinite(loadedBytes) && loadedBytes >= 0 ? loadedBytes : 0,
    totalBytes: Number.isFinite(totalBytes) && totalBytes >= 0 ? totalBytes : 0,
    resetFiles: resetFiles === true,
  });
}

function normalizePositiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

function normalizeProbability(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Number(Math.max(0, Math.min(1, parsed)).toFixed(2));
}

function normalizeRuntimeConfig(rawRuntime) {
  const modelUrl =
    typeof rawRuntime?.modelUrl === 'string' && rawRuntime.modelUrl.trim()
      ? rawRuntime.modelUrl.trim()
      : '';
  const allowOffline = rawRuntime?.allowOffline === true;
  const parallelDownloads = normalizePositiveInteger(rawRuntime?.parallelDownloads, 0);
  const cpuThreads = normalizeWllamaThreadCount(rawRuntime?.cpuThreads) || 0;
  const batchSize = normalizePositiveInteger(rawRuntime?.batchSize, 0);
  const minP = normalizeProbability(rawRuntime?.minP, 0);
  return {
    ...(modelUrl ? { modelUrl } : {}),
    ...(allowOffline ? { allowOffline: true } : {}),
    ...(parallelDownloads ? { parallelDownloads } : {}),
    ...(cpuThreads ? { cpuThreads } : {}),
    ...(batchSize ? { batchSize } : {}),
    ...(rawRuntime?.usePromptCache === false
      ? { usePromptCache: false }
      : { usePromptCache: true }),
    ...(minP > 0 ? { minP } : {}),
  };
}

function buildRuntimeConfigKey(modelId, runtime = {}, nextGenerationConfig = {}) {
  return JSON.stringify({
    modelId: modelId || '',
    runtime,
    maxContextTokens: nextGenerationConfig?.maxContextTokens || 0,
  });
}

function buildSamplingConfig(nextGenerationConfig, runtime = {}) {
  return {
    temp: nextGenerationConfig.temperature,
    top_k: nextGenerationConfig.topK,
    top_p: nextGenerationConfig.topP,
    penalty_repeat: nextGenerationConfig.repetitionPenalty,
    ...(Number.isFinite(runtime.minP) && runtime.minP > 0 ? { min_p: runtime.minP } : {}),
  };
}

function resolveThreadCount(runtime = {}) {
  return normalizeWllamaThreadCount(runtime.cpuThreads);
}

function getWllamaThreadInfo(instance) {
  const isMultithread =
    instance && typeof instance.isMultithread === 'function' && instance.isMultithread() === true;
  const numThreads =
    instance && typeof instance.getNumThreads === 'function'
      ? normalizeWllamaThreadCount(instance.getNumThreads()) || 1
      : 1;
  return {
    isMultithread,
    numThreads,
  };
}

function buildWllamaReadyStatus(instance) {
  const threadInfo = getWllamaThreadInfo(instance);
  if (threadInfo.isMultithread && threadInfo.numThreads > 1) {
    return `Ready (CPU, ${threadInfo.numThreads} threads)`;
  }
  return 'Ready (CPU)';
}

function buildWllamaLoadedMessage(modelId, instance) {
  const threadInfo = getWllamaThreadInfo(instance);
  if (threadInfo.isMultithread && threadInfo.numThreads > 1) {
    return `Loaded ${modelId} (CPU, ${threadInfo.numThreads} threads).`;
  }
  return `Loaded ${modelId} (CPU).`;
}

function isAbortError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.name === 'WllamaAbortError' ||
    /\babort/i.test(toErrorMessage(error))
  );
}

async function disposeLoadedModel() {
  const loadedInstance = wllama;
  wllama = null;
  loadedModelId = '';
  loadedRuntimeConfig = {};
  loadedRuntimeConfigKey = '';
  activeGeneration = null;
  if (!loadedInstance) {
    return;
  }
  try {
    await loadedInstance.exit();
  } catch {
    // Ignore cleanup failures so the next initialization can proceed.
  }
}

function getPromptTokenBudget(nextGenerationConfig) {
  const maxContextTokens = normalizePositiveInteger(nextGenerationConfig?.maxContextTokens, 0);
  const maxOutputTokens = normalizePositiveInteger(nextGenerationConfig?.maxOutputTokens, 0);
  if (maxContextTokens <= 0) {
    return 0;
  }
  return Math.max(1, maxContextTokens - maxOutputTokens);
}

function resolveEffectiveMaxOutputTokens(promptTokens, nextGenerationConfig) {
  const normalizedPromptTokens = normalizePositiveInteger(promptTokens, 0);
  const maxContextTokens = normalizePositiveInteger(nextGenerationConfig?.maxContextTokens, 0);
  const maxOutputTokens = normalizePositiveInteger(nextGenerationConfig?.maxOutputTokens, 0);
  if (!maxOutputTokens) {
    return 0;
  }
  if (!maxContextTokens || !normalizedPromptTokens) {
    return maxOutputTokens;
  }
  return Math.max(1, Math.min(maxOutputTokens, maxContextTokens - normalizedPromptTokens));
}

async function trimPromptToBudget(promptText, nextGenerationConfig) {
  const normalizedPromptText = typeof promptText === 'string' ? promptText : '';
  if (!wllama || !normalizedPromptText.trim()) {
    return {
      promptText: normalizedPromptText,
      truncated: false,
      originalPromptTokens: 0,
      promptTokens: 0,
    };
  }
  const promptBudget = getPromptTokenBudget(nextGenerationConfig);
  if (promptBudget <= 0) {
    return {
      promptText: normalizedPromptText,
      truncated: false,
      originalPromptTokens: 0,
      promptTokens: 0,
    };
  }
  const promptTokens = await wllama.tokenize(normalizedPromptText, true);
  const originalPromptTokens = Array.isArray(promptTokens) ? promptTokens.length : 0;
  if (originalPromptTokens <= promptBudget) {
    return {
      promptText: normalizedPromptText,
      truncated: false,
      originalPromptTokens,
      promptTokens: originalPromptTokens,
    };
  }
  const trimmedTokens = promptTokens.slice(originalPromptTokens - promptBudget);
  const trimmedPromptText = await wllama.detokenize(trimmedTokens, true);
  return {
    promptText: trimmedPromptText,
    truncated: true,
    originalPromptTokens,
    promptTokens: trimmedTokens.length,
  };
}

async function initialize(payload) {
  const modelId =
    typeof payload?.modelId === 'string' && payload.modelId.trim()
      ? payload.modelId.trim()
      : 'LiquidAI/LFM2.5-1.2B-Thinking-GGUF';
  const runtime = normalizeRuntimeConfig(payload?.runtime);
  const nextGenerationConfig = normalizeGenerationConfig(payload?.generationConfig);
  generationConfig = nextGenerationConfig;

  if (!runtime.modelUrl) {
    throw new Error('The selected wllama model is missing a GGUF download URL.');
  }

  const nextRuntimeConfigKey = buildRuntimeConfigKey(modelId, runtime, nextGenerationConfig);
  if (wllama && loadedModelId === modelId && loadedRuntimeConfigKey === nextRuntimeConfigKey) {
    post('init-success', {
      backend: 'cpu',
      backendDevice: 'wasm',
      engineType: 'wllama',
      modelId,
    });
    postStatus(buildWllamaReadyStatus(wllama));
    return;
  }

  await disposeLoadedModel();
  postProgress({
    percent: 0,
    message: 'Preparing GGUF runtime...',
    resetFiles: true,
  });
  postStatus(`Loading ${modelId} with CPU...`);

  let nextWllama = await createWllamaInstance(runtime);
  let headerInfo = null;

  try {
    const resolvedModel = await resolveWllamaModelBlobs(nextWllama, runtime.modelUrl);
    headerInfo = resolvedModel.headerInfo;
    if (!resolvedModel.headerInfo.isGguf) {
      throw new Error(
        `Downloaded model file is not a GGUF. Header=${resolvedModel.headerInfo.headerHex || 'empty'} ascii=${resolvedModel.headerInfo.headerAscii || ''}`
      );
    }
    await loadConfiguredWllamaModel(nextWllama, resolvedModel.blobs, runtime, nextGenerationConfig);
  } catch (error) {
    if (shouldRetryWllamaModelLoad(error) && runtime.allowOffline !== true) {
      postProgress({
        percent: 0,
        message: 'Cached GGUF model looked invalid. Retrying with a fresh download...',
        resetFiles: true,
      });
      postStatus('Retrying GGUF download after clearing cached files...');
      try {
        await clearCachedWllamaModel(nextWllama, runtime.modelUrl);
      } catch {
        // Ignore cache-clear failures and still try a forced refresh.
      }
      try {
        await nextWllama.exit();
      } catch {
        // Ignore cleanup failures before retrying with a fresh worker/runtime.
      }
      nextWllama = await createWllamaInstance(runtime);
      try {
        const resolvedModel = await resolveWllamaModelBlobs(nextWllama, runtime.modelUrl, {
          useCache: false,
        });
        headerInfo = resolvedModel.headerInfo;
        if (!resolvedModel.headerInfo.isGguf) {
          throw new Error(
            `Freshly downloaded model file is not a GGUF. Header=${resolvedModel.headerInfo.headerHex || 'empty'} ascii=${resolvedModel.headerInfo.headerAscii || ''}`
          );
        }
        await loadConfiguredWllamaModel(
          nextWllama,
          resolvedModel.blobs,
          runtime,
          nextGenerationConfig
        );
      } catch (retryError) {
        try {
          await nextWllama.exit();
        } catch {
          // Ignore cleanup failures after a retry load error.
        }
        if (shouldRetryWllamaModelLoad(retryError) && headerInfo?.isGguf) {
          throw new Error(
            `${toErrorMessage(retryError)} (source blob header was valid GGUF: ${headerInfo.headerHex})`
          );
        }
        throw retryError;
      }
    } else {
      try {
        await nextWllama.exit();
      } catch {
        // Ignore cleanup failures after a load error.
      }
      if (shouldRetryWllamaModelLoad(error) && headerInfo?.isGguf) {
        throw new Error(
          `${toErrorMessage(error)} (source blob header was valid GGUF: ${headerInfo.headerHex})`
        );
      }
      throw error;
    }
  }

  wllama = nextWllama;
  loadedModelId = modelId;
  loadedRuntimeConfig = runtime;
  loadedRuntimeConfigKey = nextRuntimeConfigKey;
  postProgress({
    percent: 100,
    message: buildWllamaLoadedMessage(modelId, nextWllama),
  });
  post('init-success', {
    backend: 'cpu',
    backendDevice: 'wasm',
    engineType: 'wllama',
    modelId,
  });
  postStatus(buildWllamaReadyStatus(nextWllama));
}

async function generate(payload) {
  if (!wllama) {
    throw new Error('Model is not initialized.');
  }
  const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
  if (!requestId) {
    throw new Error('A request id is required for generation.');
  }

  const nextGenerationConfig = normalizeGenerationConfig(
    payload?.generationConfig || generationConfig
  );
  generationConfig = nextGenerationConfig;
  const abortController = new AbortController();
  activeGeneration = {
    requestId,
    abortController,
  };

  try {
    postStatus('Generating (CPU)...');
    let promptText = '';
    if (Array.isArray(payload?.prompt)) {
      const messages = normalizeWllamaPromptMessages(payload.prompt);
      if (!messages.length) {
        throw new Error('Prompt is empty.');
      }
      promptText = await wllama.formatChat(messages, true);
    } else {
      promptText = typeof payload?.prompt === 'string' ? payload.prompt : '';
    }

    const preparedPrompt = await trimPromptToBudget(promptText, nextGenerationConfig);
    const stream = await wllama.createCompletion(preparedPrompt.promptText, {
      stream: true,
      useCache: loadedRuntimeConfig.usePromptCache !== false,
      abortSignal: abortController.signal,
      nPredict: resolveEffectiveMaxOutputTokens(preparedPrompt.promptTokens, nextGenerationConfig),
      sampling: buildSamplingConfig(nextGenerationConfig, loadedRuntimeConfig),
    });

    let currentText = '';
    for await (const chunk of stream) {
      const nextText =
        typeof chunk?.currentText === 'string'
          ? chunk.currentText
          : String(chunk?.currentText || '');
      if (!nextText) {
        continue;
      }
      const deltaText = nextText.startsWith(currentText)
        ? nextText.slice(currentText.length)
        : nextText;
      currentText = nextText;
      if (deltaText) {
        post('token', {
          requestId,
          text: deltaText,
        });
      }
    }

    post('complete', {
      requestId,
      text: currentText,
    });
    postStatus('Complete (CPU)');
  } catch (error) {
    if (isAbortError(error) || abortController.signal.aborted) {
      post('canceled', { requestId });
      return;
    }
    post('error', {
      requestId,
      message: toErrorMessage(error),
    });
    postStatus('Generation failed');
  } finally {
    if (activeGeneration?.requestId === requestId) {
      activeGeneration = null;
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data.type !== 'string') {
    return;
  }

  if (data.type === 'init') {
    void initialize(data.payload).catch((error) => {
      post('init-error', {
        message: toErrorMessage(error),
      });
      postProgress({
        percent: 0,
        message: 'Model load failed.',
      });
      postStatus('Error initializing model');
    });
    return;
  }

  if (data.type === 'generate') {
    void generate(data.payload).catch((error) => {
      post('error', {
        requestId: data?.payload?.requestId || '',
        message: toErrorMessage(error),
      });
      postStatus('Generation failed');
    });
    return;
  }

  if (data.type === 'cancel') {
    const requestId = data?.payload?.requestId;
    if (activeGeneration?.requestId === requestId) {
      activeGeneration.abortController.abort();
      return;
    }
    post('canceled', { requestId });
  }
});
