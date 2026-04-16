import { normalizeOpenAiCompatiblePromptMessages, extractOpenAiCompatibleResponseText, extractOpenAiCompatibleStreamText } from '../cloud/openai-compatible-prompt.js';
import {
  buildOpenAiCompatibleChatCompletionsUrl,
  inferOpenAiCompatibleMaxOutputTokensField,
} from '../cloud/openai-compatible.js';
import { getCloudProviderSecret } from '../state/cloud-provider-store.js';

let currentConfig = null;
let activeGeneration = null;

function toErrorMessage(value) {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value || 'Unknown remote generation error.');
}

function post(type, payload = {}) {
  self.postMessage({ type, payload });
}

function isAbortError(error) {
  return globalThis.DOMException && error instanceof globalThis.DOMException
    ? error.name === 'AbortError'
    : error?.name === 'AbortError';
}

function buildRequestPayload(config, payload) {
  const runtime = payload?.runtime && typeof payload.runtime === 'object' ? payload.runtime : {};
  const generationConfig =
    payload?.generationConfig && typeof payload.generationConfig === 'object'
      ? payload.generationConfig
      : {};
  const messages = normalizeOpenAiCompatiblePromptMessages(payload?.prompt, {
    maxContextTokens: generationConfig.maxContextTokens,
    maxOutputTokens: generationConfig.maxOutputTokens,
  });
  const maxOutputTokensField = inferOpenAiCompatibleMaxOutputTokensField(
    runtime.apiBaseUrl || config?.runtime?.apiBaseUrl || ''
  );
  return {
    model: runtime.remoteModelId || config?.modelId || '',
    messages,
    stream: true,
    temperature: generationConfig.temperature,
    top_p: generationConfig.topP,
    [maxOutputTokensField]: generationConfig.maxOutputTokens,
    ...(runtime.supportsTopK === true ? { top_k: generationConfig.topK } : {}),
  };
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function parseTextSafely(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function extractProviderError(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }
  if (payload.error && typeof payload.error === 'object' && typeof payload.error.message === 'string') {
    return payload.error.message.trim();
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }
  return '';
}

async function streamEventSource(response, requestId) {
  if (!response.body) {
    const payload = await parseJsonSafely(response.clone());
    return extractOpenAiCompatibleResponseText(payload);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!/text\/event-stream/i.test(contentType)) {
    const payload = await parseJsonSafely(response.clone());
    return extractOpenAiCompatibleResponseText(payload);
  }

  const reader = response.body.getReader();
  const decoder = new globalThis.TextDecoder();
  let rawBuffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    rawBuffer += decoder.decode(value, { stream: true });

    let boundaryMatch = rawBuffer.match(/\r?\n\r?\n/);
    while (boundaryMatch && Number.isInteger(boundaryMatch.index)) {
      const boundaryIndex = boundaryMatch.index;
      const rawEvent = rawBuffer.slice(0, boundaryIndex);
      rawBuffer = rawBuffer.slice(boundaryIndex + boundaryMatch[0].length);
      const dataLines = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      for (const dataLine of dataLines) {
        if (dataLine === '[DONE]') {
          return fullText;
        }
        let parsedChunk = null;
        try {
          parsedChunk = JSON.parse(dataLine);
        } catch {
          parsedChunk = null;
        }
        const nextText = extractOpenAiCompatibleStreamText(parsedChunk);
        if (nextText) {
          fullText += nextText;
          post('token', { requestId, text: nextText });
        }
      }
      boundaryMatch = rawBuffer.match(/\r?\n\r?\n/);
    }
  }

  if (rawBuffer.trim()) {
    const trailingDataLine = rawBuffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .find(Boolean);
    if (trailingDataLine && trailingDataLine !== '[DONE]') {
      try {
        const parsedChunk = JSON.parse(trailingDataLine);
        const nextText = extractOpenAiCompatibleStreamText(parsedChunk);
        if (nextText) {
          fullText += nextText;
          post('token', { requestId, text: nextText });
        }
      } catch {
        // Ignore trailing parse errors.
      }
    }
  }

  return fullText;
}

async function initialize(payload) {
  const runtime = payload?.runtime && typeof payload.runtime === 'object' ? payload.runtime : {};
  currentConfig = {
    ...payload,
    runtime,
  };

  if (!runtime.providerId || !runtime.apiBaseUrl || !runtime.remoteModelId) {
    throw new Error('Remote model configuration is incomplete.');
  }

  await getCloudProviderSecret(runtime.providerId);
  post('status', { message: 'Remote provider ready.' });
  post('init-success', {
    backend: 'cloud',
    backendDevice: 'network',
    engineType: payload?.engineType || 'openai-compatible',
    modelId: payload?.modelId || runtime.remoteModelId,
  });
}

async function generate(payload) {
  if (!currentConfig?.runtime) {
    throw new Error('Remote provider is not initialized.');
  }
  const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
  if (!requestId) {
    throw new Error('A request id is required for remote generation.');
  }

  const runtime = payload?.runtime && typeof payload.runtime === 'object' ? payload.runtime : {};
  const requestRuntime = {
    ...currentConfig.runtime,
    ...runtime,
  };
  const controller = new AbortController();
  activeGeneration = {
    requestId,
    controller,
  };

  try {
    post('status', { message: 'Sending request to remote provider...' });
    const apiKey = await getCloudProviderSecret(requestRuntime.providerId);
    const response = await fetch(buildOpenAiCompatibleChatCompletionsUrl(requestRuntime.apiBaseUrl), {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestPayload(currentConfig, { ...payload, runtime: requestRuntime })),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payloadJson = await parseJsonSafely(response.clone());
      const providerError = extractProviderError(payloadJson);
      const fallbackText = (await parseTextSafely(response.clone())).trim();
      throw new Error(
        providerError || fallbackText || `Remote provider request failed with HTTP ${response.status}.`
      );
    }

    const fullText = await streamEventSource(response, requestId);
    post('complete', {
      requestId,
      text: fullText,
    });
  } catch (error) {
    if (isAbortError(error)) {
      post('canceled', { requestId });
      return;
    }
    post('error', {
      requestId,
      message: toErrorMessage(error),
    });
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
    });
    return;
  }

  if (data.type === 'generate') {
    void generate(data.payload);
    return;
  }

  if (data.type === 'cancel') {
    const requestId = data.payload?.requestId;
    if (activeGeneration?.requestId === requestId) {
      activeGeneration.controller.abort();
      return;
    }
    post('canceled', { requestId });
  }
});
