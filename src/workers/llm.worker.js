const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

let model = null;
let tokenizer = null;
let TextStreamer = null;
let backendInUse = null;
let loadedModelId = null;
let cachedModule = null;
let generationConfig = {
  maxOutputTokens: 1024,
  maxContextTokens: 8192,
  temperature: 0.6,
  topK: 50,
  topP: 0.9,
};

function normalizeGenerationConfig(rawConfig) {
  const parsedMaxContext = Number.parseInt(String(rawConfig?.maxContextTokens ?? ''), 10);
  const parsedMaxOutput = Number.parseInt(String(rawConfig?.maxOutputTokens ?? ''), 10);
  const parsedTemperature = Number.parseFloat(String(rawConfig?.temperature ?? ''));
  const parsedTopK = Number.parseInt(String(rawConfig?.topK ?? ''), 10);
  const parsedTopP = Number.parseFloat(String(rawConfig?.topP ?? ''));
  const maxContextTokens = Number.isInteger(parsedMaxContext) && parsedMaxContext > 0 ? parsedMaxContext : 8192;
  const maxOutputCap = maxContextTokens;
  const maxOutputTokens =
    Number.isInteger(parsedMaxOutput) && parsedMaxOutput > 0
      ? Math.min(parsedMaxOutput, maxOutputCap)
      : Math.min(1024, maxOutputCap);
  const minTemperature = 0.1;
  const maxTemperature = 2.0;
  const boundedTemperature = Number.isFinite(parsedTemperature)
    ? Math.max(minTemperature, Math.min(maxTemperature, parsedTemperature))
    : 0.6;
  const temperature = Number(boundedTemperature.toFixed(1));
  const minTopK = 5;
  const maxTopK = 500;
  const topKStep = 5;
  const boundedTopK = Number.isInteger(parsedTopK) ? Math.max(minTopK, Math.min(maxTopK, parsedTopK)) : 50;
  const quantizedTopK = minTopK + Math.round((boundedTopK - minTopK) / topKStep) * topKStep;
  const topK = Math.max(minTopK, Math.min(maxTopK, quantizedTopK));
  const minTopP = 0;
  const maxTopP = 1;
  const topPStep = 0.05;
  const boundedTopP = Number.isFinite(parsedTopP) ? Math.max(minTopP, Math.min(maxTopP, parsedTopP)) : 0.9;
  const quantizedTopP = minTopP + Math.round((boundedTopP - minTopP) / topPStep) * topPStep;
  const topP = Number(Math.max(minTopP, Math.min(maxTopP, quantizedTopP)).toFixed(2));
  return {
    maxOutputTokens,
    maxContextTokens,
    temperature,
    topK,
    topP,
  };
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

async function loadTransformers() {
  if (cachedModule) {
    return cachedModule;
  }
  cachedModule = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
  return cachedModule;
}

function getBackendAttemptOrder(preference) {
  const normalizedPreference = normalizeBackendPreference(preference);
  if (normalizedPreference === 'webgpu') {
    return ['webgpu'];
  }
  if (normalizedPreference === 'wasm') {
    return ['wasm'];
  }
  return ['webgpu', 'wasm'];
}

function normalizeBackendPreference(preference) {
  if (preference === 'cpu') {
    return 'wasm';
  }
  if (preference === 'webgpu') {
    return 'webgpu';
  }
  if (preference === 'wasm') {
    return 'wasm';
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

function normalizeRuntimeConfig(rawRuntime) {
  const dtype = typeof rawRuntime?.dtype === 'string' ? rawRuntime.dtype.trim() : '';
  return dtype ? { dtype } : {};
}

function resolvePrompt(rawPrompt) {
  return [
    {
      role: 'user',
      content: rawPrompt,
    },
  ];
}

async function initialize(payload) {
  const modelId = payload.modelId || 'onnx-community/Llama-3.2-3B-Instruct-onnx-web';
  const backendPreference = normalizeBackendPreference(payload.backendPreference || 'auto');
  generationConfig = normalizeGenerationConfig(payload.generationConfig);
  const runtime = normalizeRuntimeConfig(payload.runtime);
  const attempts = getBackendAttemptOrder(backendPreference);
  const errors = [];

  const { env, pipeline, TextStreamer: StreamerClass } = await loadTransformers();
  TextStreamer = StreamerClass;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  for (const backend of attempts) {
    if (backend === 'webgpu' && !(typeof navigator !== 'undefined' && 'gpu' in navigator)) {
      errors.push('WebGPU unavailable in this browser.');
      continue;
    }

    try {
      postStatus(`Loading ${modelId} with ${backend.toUpperCase()}...`);
      postProgress({ percent: 5, message: `Preparing ${backend.toUpperCase()} backend...` });
      const pipelineOptions = {
        device: backend,
        ...runtime,
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
      model = await pipeline('text-generation', modelId, {
        ...pipelineOptions,
      });
      tokenizer = model.tokenizer;
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
      const rawMessage = extractErrorMessage(error);
      const isUnauthorized = /unauthorized|401|403/i.test(rawMessage);
      if (isUnauthorized) {
        errors.push(
          `${backend.toUpperCase()}: ${rawMessage} (This model appears gated or blocked for direct browser access. Use a public model like onnx-community/Llama-3.2-3B-Instruct-onnx-web, or self-host pinned model files for static delivery.)`,
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

  try {
    let streamedText = '';
    const formattedPrompt = resolvePrompt(prompt);
    const requestGenerationConfig = normalizeGenerationConfig(payload.generationConfig || generationConfig);
    generationConfig = requestGenerationConfig;

    if (TextStreamer) {
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        callback_function: (text) => {
          streamedText += text;
          self.postMessage({
            type: 'token',
            payload: { requestId, text },
          });
        },
      });

      await model(formattedPrompt, {
        max_new_tokens: requestGenerationConfig.maxOutputTokens,
        max_length: requestGenerationConfig.maxContextTokens,
        temperature: requestGenerationConfig.temperature,
        top_k: requestGenerationConfig.topK,
        top_p: requestGenerationConfig.topP,
        do_sample: true,
        streamer,
        return_full_text: false,
      });
    } else {
      const output = await model(formattedPrompt, {
        max_new_tokens: requestGenerationConfig.maxOutputTokens,
        max_length: requestGenerationConfig.maxContextTokens,
        temperature: requestGenerationConfig.temperature,
        top_k: requestGenerationConfig.topK,
        top_p: requestGenerationConfig.topP,
        do_sample: true,
        return_full_text: false,
      });
      const generated = output?.[0]?.generated_text;
      if (Array.isArray(generated)) {
        streamedText = generated[generated.length - 1]?.content || '';
      } else {
        streamedText = generated || '';
      }
      self.postMessage({
        type: 'token',
        payload: { requestId, text: streamedText },
      });
    }

    const finalText = streamedText.trim();
    self.postMessage({
      type: 'complete',
      payload: { requestId, text: finalText },
    });
    postStatus(`Complete (${backendInUse.toUpperCase()})`);
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: {
        requestId,
        message: error?.message || 'Text generation failed.',
      },
    });
    postStatus('Generation failed');
  }
}

self.onmessage = async (event) => {
  const { type, payload } = event.data || {};
  if (type === 'init') {
    const requestedBackendPreference = normalizeBackendPreference(payload?.backendPreference);
    const needsReinit =
      !model ||
      !tokenizer ||
      payload.modelId !== loadedModelId ||
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
  }
};
