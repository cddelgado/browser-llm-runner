import { sanitizeGenerationConfig } from '../config/generation-config.js';
import { MEDIAPIPE_GENAI_ENGINE_TYPE } from '../llm/engines/engine-types.js';
import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai';
import genAiWasmModuleLoaderPath from '@mediapipe/tasks-genai/genai_wasm_module_internal.js?url';
import genAiWasmModuleBinaryPath from '@mediapipe/tasks-genai/genai_wasm_module_internal.wasm?url';
import genAiWasmNoSimdLoaderPath from '@mediapipe/tasks-genai/genai_wasm_nosimd_internal.js?url';
import genAiWasmNoSimdBinaryPath from '@mediapipe/tasks-genai/genai_wasm_nosimd_internal.wasm?url';

/** @type {typeof self & { import?: (specifier: string) => Promise<unknown> }} */
const workerGlobal = self;

const WORKER_GENERATION_LIMITS = {
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: Number.MAX_SAFE_INTEGER,
  defaultMaxContextTokens: 8192,
  maxContextTokens: Number.MAX_SAFE_INTEGER,
  minTemperature: 0.1,
  maxTemperature: 2.0,
  defaultTemperature: 1.0,
  defaultTopK: 64,
  defaultTopP: 0.95,
  defaultRepetitionPenalty: 1.0,
};
const TOOL_STRING_DELIMITER = '<|"|>';
const TURN_OPEN = '<|turn>';
const TURN_CLOSE = '<turn|>';
const MODEL_TURN_PREFIX = `${TURN_OPEN}model\n`;

let llmInference = null;
let loadedModelId = null;
let loadedModelAssetPath = '';
let generationConfig = normalizeGenerationConfig(null);
let activeGenerationState = null;

function ensureDynamicImportShim() {
  if (typeof workerGlobal.import === 'function') {
    return;
  }
  // MediaPipe's loader falls back to self.import(...) in module workers.
  workerGlobal.import = (specifier) => import(/* @vite-ignore */ specifier);
}

ensureDynamicImportShim();

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
    // Ignore serialization failures and fall through.
  }
  return 'Unknown initialization error';
}

function normalizeBackendPreference(preference) {
  if (preference === 'cpu' || preference === 'wasm') {
    return 'cpu';
  }
  return 'webgpu';
}

function normalizeRuntimeConfig(rawRuntime) {
  const modelAssetPath =
    typeof rawRuntime?.modelAssetPath === 'string' ? rawRuntime.modelAssetPath.trim() : '';
  const requiresWebGpu = rawRuntime?.requiresWebGpu === true;
  const enableThinking =
    rawRuntime?.enableThinking === true
      ? true
      : rawRuntime?.enableThinking === false
        ? false
        : null;
  return {
    ...(modelAssetPath ? { modelAssetPath } : {}),
    ...(requiresWebGpu ? { requiresWebGpu: true } : {}),
    ...(enableThinking === true || enableThinking === false ? { enableThinking } : {}),
  };
}

function createGenerationState(requestId) {
  const generationState = {
    requestId,
    cancelRequested: false,
  };
  activeGenerationState = generationState;
  return generationState;
}

function finishGenerationState(generationState) {
  if (activeGenerationState === generationState) {
    activeGenerationState = null;
  }
}

function requestGenerationCancel(requestId) {
  const generationState = activeGenerationState;
  if (!generationState || (requestId && generationState.requestId !== requestId)) {
    self.postMessage({
      type: 'canceled',
      payload: { requestId },
    });
    return;
  }
  generationState.cancelRequested = true;
  llmInference?.cancelProcessing?.();
}

async function getWasmFileset() {
  const useSimd = await FilesetResolver.isSimdSupported(true);
  return useSimd
    ? {
        wasmLoaderPath: genAiWasmModuleLoaderPath,
        wasmBinaryPath: genAiWasmModuleBinaryPath,
      }
    : {
        wasmLoaderPath: genAiWasmNoSimdLoaderPath,
        wasmBinaryPath: genAiWasmNoSimdBinaryPath,
      };
}

function buildProgressReader(response, modelAssetPath) {
  const sourceReader = response.body?.getReader?.();
  if (!sourceReader) {
    throw new Error(`Failed to fetch model: ${modelAssetPath} (no body)`);
  }
  const ReadableStreamCtor = globalThis.ReadableStream;
  if (typeof ReadableStreamCtor !== 'function') {
    throw new Error('ReadableStream is not available in this browser worker.');
  }
  const totalBytes = Number(response.headers.get('content-length')) || 0;
  let loadedBytes = 0;
  let hasCompleted = false;
  postProgress({
    percent: 1,
    message: 'Downloading model asset...',
    file: modelAssetPath,
    status: 'downloading',
    loadedBytes,
    totalBytes,
  });

  const stream = new ReadableStreamCtor({
    async pull(controller) {
      const { done, value } = await sourceReader.read();
      if (done) {
        hasCompleted = true;
        controller.close();
        postProgress({
          percent: 100,
          message: 'Model asset downloaded.',
          file: modelAssetPath,
          status: 'downloaded',
          loadedBytes,
          totalBytes,
        });
        return;
      }
      loadedBytes += value?.byteLength || 0;
      controller.enqueue(value);
      const percent = totalBytes > 0 ? Math.min(95, (loadedBytes / totalBytes) * 100) : 50;
      postProgress({
        percent,
        message: 'Downloading model asset...',
        file: modelAssetPath,
        status: 'downloading',
        loadedBytes,
        totalBytes,
      });
    },
    async cancel(reason) {
      if (!hasCompleted) {
        await sourceReader.cancel(reason);
      }
    },
  });

  return stream.getReader();
}

function sanitizeToolStringValue(value) {
  return String(value || '').replaceAll(TOOL_STRING_DELIMITER, '"');
}

function formatGemmaToolResponse(toolMessage) {
  const toolName =
    typeof toolMessage?.toolName === 'string' && toolMessage.toolName.trim()
      ? toolMessage.toolName.trim()
      : 'tool_result';
  const toolResult =
    typeof toolMessage?.content === 'string' && toolMessage.content.trim()
      ? toolMessage.content
      : String(toolMessage?.content || '');
  return `<|tool_response>response:${toolName}{body:${TOOL_STRING_DELIMITER}${sanitizeToolStringValue(
    toolResult
  )}${TOOL_STRING_DELIMITER}}<tool_response|>`;
}

function formatPromptContent(content) {
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return '';
        }
        if (part.type === 'text') {
          return typeof part.text === 'string' ? part.text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return typeof content === 'string' ? content : String(content || '');
}

function formatGemmaPrompt(messages, runtime = {}) {
  const promptParts = [];
  const normalizedMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];
  const firstSystemMessage = normalizedMessages.find((message) => message.role === 'system');
  const baseSystemPrompt = firstSystemMessage
    ? formatPromptContent(firstSystemMessage.content)
    : '';
  const systemSections = [];
  if (runtime.enableThinking === true) {
    systemSections.push('<|think|>');
  }
  if (baseSystemPrompt.trim()) {
    systemSections.push(baseSystemPrompt);
  }
  if (systemSections.length) {
    promptParts.push(`${TURN_OPEN}system\n${systemSections.join('\n')}${TURN_CLOSE}\n`);
  }

  normalizedMessages.forEach((message) => {
    if (!message || message.role === 'system') {
      return;
    }
    if (message.role === 'user') {
      promptParts.push(
        `${TURN_OPEN}user\n${formatPromptContent(message.content).trimEnd()}${TURN_CLOSE}\n`
      );
      return;
    }
    if (message.role === 'tool') {
      promptParts.push(`${TURN_OPEN}model\n${formatGemmaToolResponse(message)}${TURN_CLOSE}\n`);
      return;
    }
    promptParts.push(
      `${TURN_OPEN}model\n${formatPromptContent(message.content).trimEnd()}${TURN_CLOSE}\n`
    );
  });

  promptParts.push(MODEL_TURN_PREFIX);
  return promptParts.join('');
}

function resolvePrompt(rawPrompt, runtime = {}) {
  if (Array.isArray(rawPrompt)) {
    const normalizedMessages = rawPrompt
      .map((message) => {
        if (!message || typeof message !== 'object') {
          return null;
        }
        const roleCandidate =
          typeof message.role === 'string' ? message.role.trim().toLowerCase() : '';
        let role = 'user';
        if (roleCandidate === 'assistant' || roleCandidate === 'model') {
          role = 'assistant';
        } else if (roleCandidate === 'system') {
          role = 'system';
        } else if (roleCandidate === 'tool') {
          role = 'tool';
        }
        return {
          role,
          content: message.content,
          toolName: typeof message.toolName === 'string' ? message.toolName : '',
        };
      })
      .filter(Boolean);
    return formatGemmaPrompt(normalizedMessages, runtime);
  }
  const flatPrompt = typeof rawPrompt === 'string' ? rawPrompt : String(rawPrompt || '');
  return `${TURN_OPEN}user\n${flatPrompt}${TURN_CLOSE}\n${MODEL_TURN_PREFIX}`;
}

async function initialize(payload) {
  const modelId = payload.modelId || '';
  const backendPreference = normalizeBackendPreference(payload.backendPreference || 'webgpu');
  const runtime = normalizeRuntimeConfig(payload.runtime);
  generationConfig = normalizeGenerationConfig(payload.generationConfig);

  if (!runtime.modelAssetPath) {
    self.postMessage({
      type: 'init-error',
      payload: {
        message: 'Failed to initialize model. No LiteRT model asset path was configured.',
      },
    });
    postProgress({ percent: 0, message: 'Model load failed.' });
    postStatus('Error initializing model');
    return;
  }

  if (backendPreference !== 'webgpu') {
    self.postMessage({
      type: 'init-error',
      payload: {
        message: `Failed to initialize model. ${modelId} requires WebGPU. Switch to WebGPU mode.`,
      },
    });
    postProgress({ percent: 0, message: 'Model load failed.' });
    postStatus('Error initializing model');
    return;
  }

  const navigatorLike = typeof navigator !== 'undefined' ? navigator : null;
  const gpuNavigator = /** @type {{ gpu?: { requestAdapter?: () => Promise<any> } }} */ (
    navigatorLike
  );
  if (!gpuNavigator?.gpu || typeof gpuNavigator.gpu.requestAdapter !== 'function') {
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
    const adapter = await gpuNavigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No usable WebGPU adapter was found.');
    }
  } catch (error) {
    self.postMessage({
      type: 'init-error',
      payload: {
        message: `Failed to initialize model. ${extractErrorMessage(error)}`,
      },
    });
    postProgress({ percent: 0, message: 'Model load failed.' });
    postStatus('Error initializing model');
    return;
  }

  if (
    llmInference &&
    loadedModelId === modelId &&
    loadedModelAssetPath === runtime.modelAssetPath
  ) {
    self.postMessage({
      type: 'init-success',
      payload: {
        backend: 'webgpu',
        modelId,
        engineType: MEDIAPIPE_GENAI_ENGINE_TYPE,
      },
    });
    postStatus('Ready (WEBGPU)');
    return;
  }

  llmInference?.close?.();
  llmInference = null;
  loadedModelId = null;
  loadedModelAssetPath = '';

  try {
    postStatus(`Loading ${modelId} with WEBGPU...`);
    postProgress({ percent: 2, message: 'Preparing LiteRT runtime...' });
    const response = await fetch(runtime.modelAssetPath, {
      cache: 'force-cache',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${runtime.modelAssetPath} (${response.status})`);
    }
    const wasmFileset = await getWasmFileset();
    const modelAssetBuffer = buildProgressReader(response, runtime.modelAssetPath);
    postProgress({
      percent: 96,
      message: 'Initializing LiteRT model...',
      file: runtime.modelAssetPath,
      status: 'initializing',
    });
    llmInference = await LlmInference.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetBuffer,
      },
      maxTokens: generationConfig.maxContextTokens,
      topK: generationConfig.topK,
      temperature: generationConfig.temperature,
      randomSeed: 0,
    });
    loadedModelId = modelId;
    loadedModelAssetPath = runtime.modelAssetPath;
    postProgress({
      percent: 100,
      message: `Loaded ${modelId} (WEBGPU).`,
      file: runtime.modelAssetPath,
      status: 'ready',
    });
    self.postMessage({
      type: 'init-success',
      payload: {
        backend: 'webgpu',
        modelId,
        engineType: MEDIAPIPE_GENAI_ENGINE_TYPE,
      },
    });
    postStatus('Ready (WEBGPU)');
  } catch (error) {
    llmInference?.close?.();
    llmInference = null;
    loadedModelId = null;
    loadedModelAssetPath = '';
    self.postMessage({
      type: 'init-error',
      payload: {
        message: `Failed to initialize model. ${extractErrorMessage(error)}`,
      },
    });
    postProgress({ percent: 0, message: 'Model load failed.' });
    postStatus('Error initializing model');
  }
}

async function generate(payload) {
  const { requestId, prompt } = payload;
  const runtime = normalizeRuntimeConfig(payload.runtime);
  if (!llmInference) {
    self.postMessage({
      type: 'error',
      payload: { requestId, message: 'Model is not initialized.' },
    });
    return;
  }

  const requestGenerationConfig = normalizeGenerationConfig(
    payload.generationConfig || generationConfig
  );
  generationConfig = requestGenerationConfig;
  postStatus('Generating (WEBGPU)...');
  const generationState = createGenerationState(requestId);
  try {
    await llmInference.setOptions({
      maxTokens: requestGenerationConfig.maxContextTokens,
      topK: requestGenerationConfig.topK,
      temperature: requestGenerationConfig.temperature,
      randomSeed: 0,
    });
    llmInference.clearCancelSignals?.();

    let finalText = '';
    const formattedPrompt = resolvePrompt(prompt, runtime);
    finalText = await llmInference.generateResponse(formattedPrompt, (partialResult, done) => {
      if (generationState.cancelRequested) {
        return;
      }
      const text = typeof partialResult === 'string' ? partialResult : String(partialResult || '');
      self.postMessage({
        type: 'token',
        payload: {
          requestId,
          text,
        },
      });
      if (done) {
        finalText = text;
      }
    });

    if (generationState.cancelRequested) {
      self.postMessage({
        type: 'canceled',
        payload: { requestId },
      });
      return;
    }

    self.postMessage({
      type: 'complete',
      payload: { requestId, text: String(finalText || '') },
    });
    postStatus('Complete (WEBGPU)');
  } catch (error) {
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
        message: extractErrorMessage(error) || 'Text generation failed.',
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
    await initialize(payload || {});
    return;
  }
  if (type === 'generate') {
    await generate(payload || {});
    return;
  }
  if (type === 'cancel') {
    requestGenerationCancel(payload?.requestId);
  }
};
