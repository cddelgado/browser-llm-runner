import {
  buildDefaultGenerationConfig,
  sanitizeGenerationConfig,
} from '../config/generation-config.js';

const WORKER_GENERATION_LIMITS = {
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: Number.MAX_SAFE_INTEGER,
  defaultMaxContextTokens: 8192,
  maxContextTokens: Number.MAX_SAFE_INTEGER,
  minTemperature: 0.1,
  maxTemperature: 2.0,
  defaultTemperature: 0.6,
  defaultTopK: 50,
  defaultTopP: 0.9,
  defaultRepetitionPenalty: 1.0,
};
const WORKER_STREAM_UPDATE_INTERVAL_MS = 100;

let model = null;
let tokenizer = null;
let processor = null;
let TextStreamer = null;
let InterruptableStoppingCriteriaClass = null;
let backendInUse = null;
let loadedModelId = null;
let loadedExecutionMode = 'text';
let cachedModule = null;
let generationConfig = buildDefaultGenerationConfig(WORKER_GENERATION_LIMITS);
let activeGenerationState = null;

function normalizeGenerationConfig(rawConfig) {
  return sanitizeGenerationConfig(rawConfig, WORKER_GENERATION_LIMITS);
}

function postStatus(message) {
  self.postMessage({ type: 'status', payload: { message } });
}

function normalizeProgressBytes(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function postProgress({
  percent = 0,
  message = 'Loading model files...',
  file = '',
  status = '',
  loadedBytes = 0,
  totalBytes = 0,
}) {
  const boundedPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  self.postMessage({
    type: 'progress',
    payload: {
      percent: boundedPercent,
      message,
      file: typeof file === 'string' ? file : '',
      status: typeof status === 'string' ? status : '',
      loadedBytes: normalizeProgressBytes(loadedBytes),
      totalBytes: normalizeProgressBytes(totalBytes),
    },
  });
}

function getTimestamp() {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}

function clearStreamFlushTimer(generationState) {
  if (!generationState || generationState.flushTimerId === null) {
    return;
  }
  globalThis.clearTimeout(generationState.flushTimerId);
  generationState.flushTimerId = null;
}

function flushBufferedTokens(generationState) {
  if (!generationState || !generationState.bufferedText) {
    return;
  }
  clearStreamFlushTimer(generationState);
  const text = generationState.bufferedText;
  generationState.bufferedText = '';
  generationState.lastFlushAt = getTimestamp();
  self.postMessage({
    type: 'token',
    payload: {
      requestId: generationState.requestId,
      text,
    },
  });
}

function queueBufferedToken(generationState, text) {
  const nextText = String(text || '');
  if (!generationState || !nextText) {
    return;
  }
  generationState.bufferedText += nextText;
  const now = getTimestamp();
  const elapsed =
    generationState.lastFlushAt > 0
      ? now - generationState.lastFlushAt
      : WORKER_STREAM_UPDATE_INTERVAL_MS;
  if (elapsed >= WORKER_STREAM_UPDATE_INTERVAL_MS) {
    flushBufferedTokens(generationState);
    return;
  }
  if (generationState.flushTimerId !== null) {
    return;
  }
  generationState.flushTimerId = globalThis.setTimeout(() => {
    generationState.flushTimerId = null;
    flushBufferedTokens(generationState);
  }, Math.max(0, WORKER_STREAM_UPDATE_INTERVAL_MS - elapsed));
}

function createGenerationState(requestId) {
  if (!InterruptableStoppingCriteriaClass) {
    throw new Error('Interruptable stopping criteria is unavailable.');
  }
  const generationState = {
    requestId,
    interruptableStoppingCriteria: new InterruptableStoppingCriteriaClass(),
    bufferedText: '',
    flushTimerId: null,
    lastFlushAt: 0,
    cancelRequested: false,
  };
  activeGenerationState = generationState;
  return generationState;
}

function finishGenerationState(generationState) {
  if (!generationState) {
    return;
  }
  clearStreamFlushTimer(generationState);
  generationState.interruptableStoppingCriteria?.reset?.();
  if (activeGenerationState === generationState) {
    activeGenerationState = null;
  }
}

function requestGenerationCancel(requestId) {
  const generationState = activeGenerationState;
  if (!generationState) {
    self.postMessage({
      type: 'canceled',
      payload: { requestId },
    });
    return;
  }
  if (requestId && generationState.requestId !== requestId) {
    self.postMessage({
      type: 'canceled',
      payload: { requestId },
    });
    return;
  }
  generationState.cancelRequested = true;
  generationState.interruptableStoppingCriteria.interrupt();
}

async function loadTransformers() {
  if (cachedModule) {
    return cachedModule;
  }
  cachedModule = await import('@huggingface/transformers');
  return cachedModule;
}

function getBackendAttemptOrder(preference, runtimeConfig = {}) {
  const normalizedPreference = normalizeBackendPreference(preference);
  const runtime = normalizeRuntimeConfig(runtimeConfig);
  if (runtime.requiresWebGpu) {
    if (normalizedPreference === 'wasm' || normalizedPreference === 'cpu') {
      return [];
    }
    return ['webgpu'];
  }
  if (normalizedPreference === 'webgpu') {
    return ['webgpu'];
  }
  if (normalizedPreference === 'wasm') {
    return ['wasm'];
  }
  if (normalizedPreference === 'cpu') {
    return ['cpu'];
  }
  return ['webgpu', 'wasm', 'cpu'];
}

function normalizeBackendPreference(preference) {
  if (preference === 'webgpu') {
    return 'webgpu';
  }
  if (preference === 'wasm') {
    return 'wasm';
  }
  if (preference === 'cpu') {
    return 'cpu';
  }
  return 'auto';
}

function extractErrorMessage(error) {
  if (!error) {
    return 'Unknown initialization error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error.toString === 'function') {
    const rendered = error.toString();
    if (typeof rendered === 'string' && rendered && rendered !== '[object Object]') {
      return rendered;
    }
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') {
      return serialized;
    }
  } catch {
    // ignore serialization failures and use fallback below
  }
  return 'Unknown initialization error';
}

function formatWebGpuInitializationError(error) {
  const rawMessage = extractErrorMessage(error);
  if (/^\d+$/.test(rawMessage)) {
    return `WebGPU initialization failed (${rawMessage}). Confirm WebGPU is enabled and that this browser/device exposes a usable adapter.`;
  }
  return rawMessage;
}

function normalizeRuntimeConfig(rawRuntime) {
  let dtype = '';
  if (typeof rawRuntime?.dtype === 'string') {
    dtype = rawRuntime.dtype.trim();
  } else if (
    rawRuntime?.dtype &&
    typeof rawRuntime.dtype === 'object' &&
    !Array.isArray(rawRuntime.dtype)
  ) {
    const entries = Object.entries(rawRuntime.dtype)
      .map(([key, value]) => {
        const normalizedKey = typeof key === 'string' ? key.trim() : '';
        const normalizedValue = typeof value === 'string' ? value.trim() : '';
        return normalizedKey && normalizedValue ? [normalizedKey, normalizedValue] : null;
      })
      .filter(Boolean);
    dtype = entries.length ? Object.fromEntries(entries) : '';
  }
  const enableThinking = rawRuntime?.enableThinking === true;
  const requiresWebGpu = rawRuntime?.requiresWebGpu === true;
  const multimodalGeneration = rawRuntime?.multimodalGeneration === true;
  const imageInput = rawRuntime?.imageInput === true;
  const audioInput = rawRuntime?.audioInput === true;
  const videoInput = rawRuntime?.videoInput === true;
  const maxImageInputs =
    Number.isInteger(rawRuntime?.maxImageInputs) && rawRuntime.maxImageInputs > 0
      ? rawRuntime.maxImageInputs
      : 0;
  const maxAudioInputs =
    Number.isInteger(rawRuntime?.maxAudioInputs) && rawRuntime.maxAudioInputs > 0
      ? rawRuntime.maxAudioInputs
      : 0;
  const maxVideoInputs =
    Number.isInteger(rawRuntime?.maxVideoInputs) && rawRuntime.maxVideoInputs > 0
      ? rawRuntime.maxVideoInputs
      : 0;
  const useExternalDataFormat =
    rawRuntime?.useExternalDataFormat === true ||
    (Number.isInteger(rawRuntime?.useExternalDataFormat) && rawRuntime.useExternalDataFormat > 0)
      ? rawRuntime.useExternalDataFormat
      : false;
  return {
    ...(dtype ? { dtype } : {}),
    ...(enableThinking ? { enableThinking: true } : {}),
    ...(requiresWebGpu ? { requiresWebGpu: true } : {}),
    ...(multimodalGeneration ? { multimodalGeneration: true } : {}),
    ...(imageInput ? { imageInput: true } : {}),
    ...(audioInput ? { audioInput: true } : {}),
    ...(videoInput ? { videoInput: true } : {}),
    ...(maxImageInputs ? { maxImageInputs } : {}),
    ...(maxAudioInputs ? { maxAudioInputs } : {}),
    ...(maxVideoInputs ? { maxVideoInputs } : {}),
    ...(useExternalDataFormat ? { useExternalDataFormat } : {}),
  };
}

function buildMultimodalChatTemplateOptions(runtime = {}) {
  return {
    add_generation_prompt: true,
    ...(runtime.enableThinking ? { enable_thinking: true } : {}),
  };
}

function shouldSkipSpecialTokensInMultimodalOutput(runtime = {}) {
  return runtime.enableThinking !== true;
}

function buildMultimodalStreamerOptions(tokenizerInstance, runtime = {}, onText = () => {}) {
  return new TextStreamer(tokenizerInstance, {
    skip_prompt: true,
    skip_special_tokens: shouldSkipSpecialTokensInMultimodalOutput(runtime),
    callback_function: onText,
  });
}

function buildMultimodalDecodeOptions(runtime = {}) {
  return {
    skip_special_tokens: shouldSkipSpecialTokensInMultimodalOutput(runtime),
  };
}

function normalizePromptContentPart(rawPart) {
  if (!rawPart || typeof rawPart !== 'object') {
    return null;
  }

  if (rawPart.type === 'text') {
    const text = typeof rawPart.text === 'string' ? rawPart.text : '';
    if (!text.trim()) {
      return null;
    }
    return {
      type: 'text',
      text,
    };
  }

  if (rawPart.type === 'image') {
    const normalizedImagePart = { type: 'image' };
    const directImage = typeof rawPart.image === 'string' ? rawPart.image.trim() : '';
    const imageUrl = typeof rawPart.url === 'string' ? rawPart.url.trim() : '';
    if (typeof rawPart.mimeType === 'string' && rawPart.mimeType.trim()) {
      normalizedImagePart.mimeType = rawPart.mimeType.trim();
    }
    if (typeof rawPart.base64 === 'string' && rawPart.base64.trim()) {
      normalizedImagePart.base64 = rawPart.base64.trim();
    }
    const embeddedImage =
      directImage ||
      imageUrl ||
      (normalizedImagePart.mimeType && normalizedImagePart.base64
        ? `data:${normalizedImagePart.mimeType};base64,${normalizedImagePart.base64}`
        : '');
    if (!embeddedImage) {
      return null;
    }
    normalizedImagePart.image = embeddedImage;
    return normalizedImagePart;
  }

  if (rawPart.type === 'audio') {
    const normalizedAudioPart = { type: 'audio' };
    if (typeof rawPart.mimeType === 'string' && rawPart.mimeType.trim()) {
      normalizedAudioPart.mimeType = rawPart.mimeType.trim();
    }
    if (typeof rawPart.base64 === 'string' && rawPart.base64.trim()) {
      normalizedAudioPart.base64 = rawPart.base64.trim();
    }
    if (typeof rawPart.url === 'string' && rawPart.url.trim()) {
      normalizedAudioPart.url = rawPart.url.trim();
    }
    if (typeof rawPart.samplesBase64 === 'string' && rawPart.samplesBase64.trim()) {
      normalizedAudioPart.samplesBase64 = rawPart.samplesBase64.trim();
    }
    if (Number.isFinite(rawPart.sampleRate) && rawPart.sampleRate > 0) {
      normalizedAudioPart.sampleRate = Math.round(rawPart.sampleRate);
    }
    if (Number.isFinite(rawPart.sampleCount) && rawPart.sampleCount > 0) {
      normalizedAudioPart.sampleCount = Math.round(rawPart.sampleCount);
    }
    return normalizedAudioPart.samplesBase64 ||
      normalizedAudioPart.base64 ||
      normalizedAudioPart.url ||
      normalizedAudioPart.mimeType
      ? normalizedAudioPart
      : null;
  }

  if (rawPart.type === 'video') {
    const normalizedVideoPart = { type: 'video' };
    if (typeof rawPart.mimeType === 'string' && rawPart.mimeType.trim()) {
      normalizedVideoPart.mimeType = rawPart.mimeType.trim();
    }
    if (typeof rawPart.base64 === 'string' && rawPart.base64.trim()) {
      normalizedVideoPart.base64 = rawPart.base64.trim();
    }
    if (typeof rawPart.url === 'string' && rawPart.url.trim()) {
      normalizedVideoPart.url = rawPart.url.trim();
    }
    return normalizedVideoPart.base64 || normalizedVideoPart.url || normalizedVideoPart.mimeType
      ? normalizedVideoPart
      : null;
  }

  return null;
}

function base64ToUint8Array(base64) {
  const normalized = typeof base64 === 'string' ? base64.trim() : '';
  if (!normalized) {
    return new Uint8Array(0);
  }
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  if (typeof globalThis.Buffer === 'function') {
    return new Uint8Array(globalThis.Buffer.from(normalized, 'base64'));
  }
  return new Uint8Array(0);
}

function decodeFloat32ArrayFromBase64(base64) {
  const bytes = base64ToUint8Array(base64);
  if (!bytes.byteLength) {
    return new Float32Array(0);
  }
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Audio attachment waveform data is malformed.');
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(buffer);
}

async function prepareMultimodalInputsFromPrompt(messages, RawImage) {
  const preparedMessages = [];
  const images = [];
  const audios = [];

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }
    if (!Array.isArray(message.content)) {
      preparedMessages.push(message);
      continue;
    }

    const preparedContent = [];
    for (const part of message.content) {
      if (!part || typeof part !== 'object') {
        continue;
      }
      if (part.type === 'text') {
        preparedContent.push({ type: 'text', text: String(part.text || '') });
        continue;
      }
      if (part.type === 'image') {
        const imageSource = typeof part.image === 'string' ? part.image.trim() : '';
        if (!imageSource) {
          continue;
        }
        images.push(await RawImage.read(imageSource));
        preparedContent.push({ type: 'image' });
        continue;
      }
      if (part.type === 'audio') {
        const samplesBase64 = typeof part.samplesBase64 === 'string' ? part.samplesBase64.trim() : '';
        if (!samplesBase64) {
          throw new Error('Audio attachment data is missing normalized waveform samples.');
        }
        const sampleRate =
          Number.isFinite(part.sampleRate) && part.sampleRate > 0 ? Math.round(part.sampleRate) : 16000;
        if (sampleRate !== 16000) {
          throw new Error('Audio attachments must be normalized to 16 kHz for this model runtime.');
        }
        audios.push(decodeFloat32ArrayFromBase64(samplesBase64));
        preparedContent.push({ type: 'audio' });
      }
    }

    preparedMessages.push({
      ...message,
      content: preparedContent,
    });
  }

  return {
    messages: preparedMessages,
    images,
    audios,
  };
}

async function prepareImageInputsFromPrompt(messages, RawImage) {
  const prepared = await prepareMultimodalInputsFromPrompt(messages, RawImage);
  return {
    messages: prepared.messages,
    images: prepared.images,
  };
}

function normalizePromptContent(rawContent) {
  if (typeof rawContent === 'string') {
    return rawContent.trim() ? rawContent : null;
  }

  if (!Array.isArray(rawContent)) {
    return null;
  }

  const normalizedParts = rawContent.map(normalizePromptContentPart).filter(Boolean);
  return normalizedParts.length ? normalizedParts : null;
}

function resolvePrompt(rawPrompt) {
  if (Array.isArray(rawPrompt)) {
    const structuredMessages = rawPrompt
      .map((message) => {
        if (!message || typeof message !== 'object') {
          return null;
        }
        const roleCandidate =
          typeof message.role === 'string' ? message.role.trim().toLowerCase() : '';
        const content = normalizePromptContent(message.content);
        if (!content) {
          return null;
        }
        let role = 'user';
        if (roleCandidate === 'assistant' || roleCandidate === 'model') {
          role = 'assistant';
        } else if (roleCandidate === 'system') {
          role = 'system';
        } else if (roleCandidate === 'tool') {
          role = 'tool';
        }
        return { role, content };
      })
      .filter(Boolean);
    if (structuredMessages.length) {
      return structuredMessages;
    }
  }

  const flatPrompt = typeof rawPrompt === 'string' ? rawPrompt : String(rawPrompt || '');
  return [
    {
      role: 'user',
      content: flatPrompt,
    },
  ];
}

function countPromptParts(prompt, type) {
  return Array.isArray(prompt)
    ? prompt.reduce(
        (total, message) =>
          total +
          (Array.isArray(message?.content)
            ? message.content.filter((part) => part?.type === type).length
            : 0),
        0
      )
    : 0;
}

export { resolvePrompt };
export { getBackendAttemptOrder };
export { prepareImageInputsFromPrompt };
export { buildMultimodalChatTemplateOptions };
export { shouldSkipSpecialTokensInMultimodalOutput };
export { buildMultimodalStreamerOptions };
export { buildMultimodalDecodeOptions };

function buildGenerationOptions(requestGenerationConfig, runtime = {}) {
  return {
    max_new_tokens: requestGenerationConfig.maxOutputTokens,
    max_length: requestGenerationConfig.maxContextTokens,
    temperature: requestGenerationConfig.temperature,
    top_k: requestGenerationConfig.topK,
    top_p: requestGenerationConfig.topP,
    repetition_penalty: requestGenerationConfig.repetitionPenalty,
    do_sample: true,
    ...(runtime.enableThinking ? { enable_thinking: true } : {}),
  };
}

export { buildGenerationOptions };

function promptContainsStructuredMedia(prompt) {
  return Array.isArray(prompt)
    ? prompt.some((message) =>
        Array.isArray(message?.content)
          ? message.content.some(
              (part) => part?.type === 'image' || part?.type === 'audio' || part?.type === 'video'
            )
          : false
      )
    : false;
}

async function initialize(payload) {
  const modelId = payload.modelId || 'onnx-community/Llama-3.2-3B-Instruct-onnx-web';
  const backendPreference = normalizeBackendPreference(payload.backendPreference || 'auto');
  generationConfig = normalizeGenerationConfig(payload.generationConfig);
  const runtime = normalizeRuntimeConfig(payload.runtime);
  const attempts = getBackendAttemptOrder(backendPreference, runtime);
  const errors = [];
  const navigatorLike = /** @type {any} */ (
    typeof navigator !== 'undefined' ? navigator : undefined
  );
  const navigatorGpu = navigatorLike?.gpu;

  if (runtime.requiresWebGpu && attempts.length === 0) {
    self.postMessage({
      type: 'init-error',
      payload: {
        message: `Failed to initialize model. ${modelId} requires WebGPU. Choose Auto or WebGPU only.`,
      },
    });
    postProgress({ percent: 0, message: 'Model load failed.' });
    postStatus('Error initializing model');
    return;
  }

  if (runtime.requiresWebGpu) {
    if (!(navigatorGpu && typeof navigatorGpu.requestAdapter === 'function')) {
      self.postMessage({
        type: 'init-error',
        payload: {
          message: `Failed to initialize model. ${modelId} requires WebGPU, but no WebGPU adapter API is available in this browser.`,
        },
      });
      postProgress({ percent: 0, message: 'Model load failed.' });
      postStatus('Error initializing model');
      return;
    }

    try {
      const adapter = await navigatorGpu.requestAdapter();
      if (!adapter) {
        self.postMessage({
          type: 'init-error',
          payload: {
            message: `Failed to initialize model. ${modelId} requires WebGPU, but no usable WebGPU adapter was found.`,
          },
        });
        postProgress({ percent: 0, message: 'Model load failed.' });
        postStatus('Error initializing model');
        return;
      }
    } catch (error) {
      self.postMessage({
        type: 'init-error',
        payload: {
          message: `Failed to initialize model. ${formatWebGpuInitializationError(error)}`,
        },
      });
      postProgress({ percent: 0, message: 'Model load failed.' });
      postStatus('Error initializing model');
      return;
    }
  }

  const {
    env,
    pipeline,
    TextStreamer: StreamerClass,
    InterruptableStoppingCriteria: InterruptableStoppingCriteria,
    AutoProcessor,
    AutoModelForImageTextToText,
  } = await loadTransformers();
  TextStreamer = StreamerClass;
  InterruptableStoppingCriteriaClass = InterruptableStoppingCriteria;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  for (const backend of attempts) {
    if (backend === 'webgpu' && !(typeof navigator !== 'undefined' && 'gpu' in navigator)) {
      errors.push('WebGPU unavailable in this browser.');
      continue;
    }
    if (backend === 'cpu' && typeof navigator !== 'undefined') {
      errors.push('CPU backend unavailable in this browser runtime (supported: webgpu, wasm).');
      continue;
    }

    try {
      postStatus(`Loading ${modelId} with ${backend.toUpperCase()}...`);
      postProgress({ percent: 5, message: `Preparing ${backend.toUpperCase()} backend...` });
      const pipelineOptions = {
        device: backend,
        ...(runtime.dtype ? { dtype: runtime.dtype } : {}),
        ...(runtime.useExternalDataFormat
          ? {
              use_external_data_format: runtime.useExternalDataFormat,
            }
          : {}),
        progress_callback: (progress) => {
          const rawProgress = progress?.progress;
          const normalizedProgress =
            typeof rawProgress === 'number'
              ? rawProgress <= 1
                ? rawProgress * 100
                : rawProgress
              : 0;
          const rawStatus = typeof progress?.status === 'string' ? progress.status : '';
          const rawFile = typeof progress?.file === 'string' ? progress.file : '';
          const rawLoadedBytes =
            progress?.loaded ??
            progress?.loadedBytes ??
            progress?.bytes_loaded ??
            progress?.bytesLoaded ??
            0;
          const rawTotalBytes =
            progress?.total ??
            progress?.totalBytes ??
            progress?.bytes_total ??
            progress?.bytesTotal ??
            0;
          const label = rawStatus || rawFile || 'Loading model files...';
          postProgress({
            percent: normalizedProgress,
            message: String(label),
            file: rawFile,
            status: rawStatus,
            loadedBytes: rawLoadedBytes,
            totalBytes: rawTotalBytes,
          });
        },
      };
      if (runtime.multimodalGeneration) {
        postProgress({ percent: 10, message: 'Loading multimodal processor...' });
        processor = await AutoProcessor.from_pretrained(modelId, {
          progress_callback: pipelineOptions.progress_callback,
        });
        postProgress({ percent: 25, message: `Loading ${modelId} multimodal model...` });
        model = await AutoModelForImageTextToText.from_pretrained(modelId, {
          device: backend,
          ...(runtime.dtype ? { dtype: runtime.dtype } : {}),
          ...(runtime.useExternalDataFormat
            ? {
                use_external_data_format: runtime.useExternalDataFormat,
              }
            : {}),
          progress_callback: pipelineOptions.progress_callback,
        });
        tokenizer = processor?.tokenizer || model?.tokenizer || null;
        loadedExecutionMode = 'multimodal';
      } else {
        processor = null;
        model = await pipeline('text-generation', modelId, {
          ...pipelineOptions,
        });
        tokenizer = model.tokenizer;
        loadedExecutionMode = 'text';
      }
      backendInUse = backend;
      loadedModelId = modelId;
      postProgress({ percent: 100, message: `Loaded ${modelId} (${backend.toUpperCase()}).` });
      self.postMessage({
        type: 'init-success',
        payload: { backend, modelId },
      });
      postStatus(`Ready (${backend.toUpperCase()})`);
      return;
    } catch (error) {
      const rawMessage =
        backend === 'webgpu' ? formatWebGpuInitializationError(error) : extractErrorMessage(error);
      const isUnauthorized = /unauthorized|401|403/i.test(rawMessage);
      if (isUnauthorized) {
        errors.push(
          `${backend.toUpperCase()}: ${rawMessage} (This model appears gated or blocked for direct browser access. Use a public model like onnx-community/Llama-3.2-3B-Instruct-onnx-web, or self-host pinned model files for static delivery.)`
        );
      } else {
        errors.push(`${backend.toUpperCase()}: ${rawMessage}`);
      }
    }
  }

  self.postMessage({
    type: 'init-error',
    payload: {
      message: `Failed to initialize model. ${errors.join(' | ')}`,
    },
  });
  postProgress({ percent: 0, message: 'Model load failed.' });
  postStatus('Error initializing model');
}

async function generate(payload) {
  const { requestId, prompt } = payload;
  if (!model || !tokenizer) {
    self.postMessage({
      type: 'error',
      payload: { requestId, message: 'Model is not initialized.' },
    });
    return;
  }

  postStatus(`Generating (${backendInUse.toUpperCase()})...`);

  if (!InterruptableStoppingCriteriaClass) {
    ({ InterruptableStoppingCriteria: InterruptableStoppingCriteriaClass } = await loadTransformers());
  }

  const generationState = createGenerationState(requestId);
  try {
    let streamedText = '';
    const formattedPrompt = resolvePrompt(prompt);
    const requestGenerationConfig = normalizeGenerationConfig(
      payload.generationConfig || generationConfig
    );
    generationConfig = requestGenerationConfig;
    const runtime = normalizeRuntimeConfig(payload.runtime);
    const imageCount = countPromptParts(formattedPrompt, 'image');
    const audioCount = countPromptParts(formattedPrompt, 'audio');
    const videoCount = countPromptParts(formattedPrompt, 'video');
    if (promptContainsStructuredMedia(formattedPrompt) && !runtime.multimodalGeneration) {
      throw new Error(
        'Media attachments are not yet wired to the selected model runtime in this app.'
      );
    }
    if (imageCount > 0 && !runtime.imageInput) {
      throw new Error('The selected model does not support image inputs in this app.');
    }
    if (audioCount > 0 && !runtime.audioInput) {
      throw new Error('The selected model does not support audio inputs in this app.');
    }
    if (videoCount > 0) {
      throw new Error('The selected model does not support video inputs in this app.');
    }
    if (runtime.maxImageInputs && imageCount > runtime.maxImageInputs) {
      throw new Error(
        `The selected model accepts up to ${runtime.maxImageInputs} image attachment${
          runtime.maxImageInputs === 1 ? '' : 's'
        } in this app.`
      );
    }
    if (runtime.maxAudioInputs && audioCount > runtime.maxAudioInputs) {
      throw new Error(
        `The selected model accepts up to ${runtime.maxAudioInputs} audio attachment${
          runtime.maxAudioInputs === 1 ? '' : 's'
        } in this app.`
      );
    }
    if (runtime.multimodalGeneration && loadedExecutionMode !== 'multimodal') {
      throw new Error('The selected model runtime was not initialized for multimodal generation.');
    }
    const generationOptions = {
      ...buildGenerationOptions(requestGenerationConfig, runtime),
      stopping_criteria: generationState.interruptableStoppingCriteria,
    };

    if (runtime.multimodalGeneration) {
      const { RawImage } = await loadTransformers();
      const { messages, images, audios } = await prepareMultimodalInputsFromPrompt(
        formattedPrompt,
        RawImage
      );
      const promptText = processor.apply_chat_template(
        messages,
        buildMultimodalChatTemplateOptions(runtime)
      );
      const imageInputs = images.length > 1 ? images : images[0] || null;
      const audioInputs = audios.length > 1 ? audios : audios[0] || null;
      const modelInputs = await processor(promptText, imageInputs, audioInputs, {
        add_special_tokens: false,
      });

      if (TextStreamer) {
        const streamer = buildMultimodalStreamerOptions(tokenizer, runtime, (text) => {
          streamedText += text;
          queueBufferedToken(generationState, text);
        });

        await model.generate({
          ...modelInputs,
          ...generationOptions,
          streamer,
        });
      } else {
        const output = await model.generate({
          ...modelInputs,
          ...generationOptions,
        });
        const decoded = processor.batch_decode(
          output.slice(null, [modelInputs.input_ids.dims.at(-1), null]),
          buildMultimodalDecodeOptions(runtime)
        );
        streamedText = decoded?.[0] || '';
        queueBufferedToken(generationState, streamedText);
      }
    } else if (TextStreamer) {
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        callback_function: (text) => {
          streamedText += text;
          queueBufferedToken(generationState, text);
        },
      });

      await model(formattedPrompt, {
        ...generationOptions,
        return_full_text: false,
        streamer,
      });
    } else {
      const output = await model(formattedPrompt, {
        ...generationOptions,
        return_full_text: false,
      });
      const generated = output?.[0]?.generated_text;
      if (Array.isArray(generated)) {
        streamedText = generated[generated.length - 1]?.content || '';
      } else {
        streamedText = generated || '';
      }
      queueBufferedToken(generationState, streamedText);
    }

    flushBufferedTokens(generationState);
    if (generationState.cancelRequested) {
      self.postMessage({
        type: 'canceled',
        payload: { requestId },
      });
      return;
    }

    const finalText = streamedText.trim();
    self.postMessage({
      type: 'complete',
      payload: { requestId, text: finalText },
    });
    postStatus(`Complete (${backendInUse.toUpperCase()})`);
  } catch (error) {
    flushBufferedTokens(generationState);
    if (generationState.cancelRequested) {
      self.postMessage({
        type: 'canceled',
        payload: { requestId },
      });
      return;
    }
    self.postMessage({
      type: 'error',
      payload: {
        requestId,
        message: error?.message || 'Text generation failed.',
      },
    });
    postStatus('Generation failed');
  } finally {
    finishGenerationState(generationState);
  }
}

self.onmessage = async (event) => {
  const { type, payload } = event.data || {};
  if (type === 'init') {
    const requestedBackendPreference = normalizeBackendPreference(payload?.backendPreference);
    const requestedRuntime = normalizeRuntimeConfig(payload?.runtime);
    const needsReinit =
      !model ||
      !tokenizer ||
      (requestedRuntime.multimodalGeneration ? !processor : false) ||
      payload.modelId !== loadedModelId ||
      (requestedRuntime.multimodalGeneration && loadedExecutionMode !== 'multimodal') ||
      (!requestedRuntime.multimodalGeneration && loadedExecutionMode !== 'text') ||
      (requestedBackendPreference !== 'auto' && requestedBackendPreference !== backendInUse);

    if (!needsReinit) {
      self.postMessage({
        type: 'init-success',
        payload: { backend: backendInUse, modelId: loadedModelId },
      });
      postStatus(`Ready (${backendInUse.toUpperCase()})`);
      return;
    }

    await initialize(payload);
    return;
  }

  if (type === 'generate') {
    await generate(payload);
    return;
  }

  if (type === 'cancel') {
    requestGenerationCancel(payload?.requestId);
  }
};
