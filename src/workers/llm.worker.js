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

function postProgress({ percent = 0, message = 'Loading model files...' }) {
  const boundedPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  self.postMessage({
    type: 'progress',
    payload: {
      percent: boundedPercent,
      message,
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
  if (preference === 'webgpu') {
    return ['webgpu'];
  }
  if (preference === 'cpu') {
    return ['cpu'];
  }
  return ['webgpu', 'cpu'];
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
  const requestedModelId = payload.modelId || 'onnx-community/Qwen3-0.6B-ONNX';
  const modelId =
    requestedModelId === 'onnx-community/gemma-3-1b-it-ONNX-GQA' ||
    requestedModelId === 'onnx-community/gemma-3-1b-ONNX-GQA' ||
    requestedModelId === 'Xenova/distilgpt2'
      ? 'onnx-community/Qwen3-0.6B-ONNX'
      : requestedModelId;
  const backendPreference = payload.backendPreference || 'auto';
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
      if (requestedModelId !== modelId) {
        postStatus(`Model ${requestedModelId} is unavailable. Falling back to ${modelId}.`);
      }
      postStatus(`Loading ${modelId} with ${backend.toUpperCase()}...`);
      postProgress({ percent: 5, message: `Preparing ${backend.toUpperCase()} backend...` });
      model = await pipeline('text-generation', modelId, {
        device: backend,
        dtype: 'q4f16',
        progress_callback: (progress) => {
          const rawProgress = progress?.progress;
          const normalizedProgress =
            typeof rawProgress === 'number'
              ? rawProgress <= 1
                ? rawProgress * 100
                : rawProgress
              : 0;
          const label = progress?.status || progress?.file || 'Loading model files...';
          postProgress({ percent: normalizedProgress, message: String(label) });
        },
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
      const rawMessage = error?.message || 'Unknown initialization error';
      const isUnauthorized = /unauthorized|401|403/i.test(rawMessage);
      if (isUnauthorized) {
        errors.push(
          `${backend.toUpperCase()}: ${rawMessage} (This model appears gated or blocked for direct browser access. Use a public model like onnx-community/Qwen3-0.6B-ONNX, or self-host pinned model files for static delivery.)`,
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
