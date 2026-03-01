const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

let model = null;
let tokenizer = null;
let TextStreamer = null;
let backendInUse = null;
let loadedModelId = null;
let cachedModule = null;

function postStatus(message) {
  self.postMessage({ type: 'status', payload: { message } });
}

async function loadTransformers() {
  if (cachedModule) {
    return cachedModule;
  }
  cachedModule = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
  return cachedModule;
}

function getBackendAttemptOrder(preference) {
  if (preference === 'webgpu') {
    return ['webgpu'];
  }
  if (preference === 'cpu') {
    return ['cpu'];
  }
  return ['webgpu', 'cpu'];
}

function resolvePrompt(rawPrompt) {
  return `User: ${rawPrompt}\nAssistant:`;
}

async function initialize(payload) {
  const requestedModelId = payload.modelId || 'onnx-community/gemma-3-1b-ONNX-GQA';
  const modelId =
    requestedModelId === 'onnx-community/gemma-3-1b-it-ONNX-GQA'
      ? 'onnx-community/gemma-3-1b-ONNX-GQA'
      : requestedModelId;
  const backendPreference = payload.backendPreference || 'auto';
  const attempts = getBackendAttemptOrder(backendPreference);
  const errors = [];

  const { env, pipeline, TextStreamer: StreamerClass } = await loadTransformers();
  TextStreamer = StreamerClass;
  env.allowRemoteModels = true;

  for (const backend of attempts) {
    if (backend === 'webgpu' && !(typeof navigator !== 'undefined' && 'gpu' in navigator)) {
      errors.push('WebGPU unavailable in this browser.');
      continue;
    }

    try {
      if (requestedModelId !== modelId) {
        postStatus(`Model ${requestedModelId} is unavailable. Falling back to ${modelId}.`);
      }
      postStatus(`Loading ${modelId} with ${backend.toUpperCase()}...`);
      model = await pipeline('text-generation', modelId, {
        device: backend,
      });
      tokenizer = model.tokenizer;
      backendInUse = backend;
      loadedModelId = modelId;
      self.postMessage({
        type: 'init-success',
        payload: { backend, modelId },
      });
      postStatus(`Ready (${backend.toUpperCase()})`);
      return;
    } catch (error) {
      errors.push(`${backend.toUpperCase()}: ${error?.message || 'Unknown initialization error'}`);
    }
  }

  self.postMessage({
    type: 'init-error',
    payload: {
      message: `Failed to initialize model. ${errors.join(' | ')}`,
    },
  });
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
        max_new_tokens: 192,
        temperature: 0.7,
        top_p: 0.9,
        do_sample: true,
        streamer,
        return_full_text: false,
      });
    } else {
      const output = await model(formattedPrompt, {
        max_new_tokens: 192,
        temperature: 0.7,
        top_p: 0.9,
        do_sample: true,
        return_full_text: false,
      });
      streamedText = output?.[0]?.generated_text || '';
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
    const needsReinit =
      !model ||
      !tokenizer ||
      payload.modelId !== loadedModelId ||
      (payload.backendPreference !== 'auto' && payload.backendPreference !== backendInUse);

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
