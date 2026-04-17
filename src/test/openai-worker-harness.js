import { LLMEngineClient } from '../llm/engine-client.js';
import { saveCloudProvider } from '../state/cloud-provider-store.js';

const providerId = 'worker-harness-provider';
const endpoint = 'https://example.test/v1';
const remoteModelId = 'provider/model';

const runButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('runWorkerButton')
);
const cancelButton = /** @type {HTMLButtonElement | null} */ (
  document.getElementById('cancelWorkerButton')
);
const statusElement = document.getElementById('workerStatus');
const outputElement = document.getElementById('workerOutput');
const eventsElement = document.getElementById('workerEvents');

const client = new LLMEngineClient();

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = String(message || '');
  }
}

function appendEvent(message) {
  if (!eventsElement) {
    return;
  }
  const nextLine = String(message || '');
  eventsElement.textContent = eventsElement.textContent
    ? `${eventsElement.textContent}\n${nextLine}`
    : nextLine;
}

async function ensureHarnessProvider() {
  await saveCloudProvider(
    {
      id: providerId,
      endpoint,
      endpointHost: 'example.test',
      displayName: 'Worker Harness Provider',
      supportsTopK: true,
      availableModels: [
        {
          id: remoteModelId,
          displayName: remoteModelId,
        },
      ],
      selectedModels: [
        {
          id: remoteModelId,
          displayName: remoteModelId,
          supportsTopK: true,
        },
      ],
    },
    { apiKey: 'test-api-key' }
  );
}

client.onStatus = (message) => {
  setStatus(message);
  appendEvent(`status: ${message}`);
};

client.onProgress = (progress) => {
  const message =
    progress && typeof progress.message === 'string' && progress.message.trim()
      ? progress.message.trim()
      : 'progress';
  appendEvent(`progress: ${message}`);
};

async function runHarness() {
  if (!runButton || !cancelButton) {
    return;
  }
  runButton.disabled = true;
  cancelButton.disabled = false;
  if (outputElement) {
    outputElement.textContent = '';
  }
  if (eventsElement) {
    eventsElement.textContent = '';
  }

  try {
    await ensureHarnessProvider();
    await client.initialize({
      engineType: 'openai-compatible',
      modelId: remoteModelId,
      runtime: {
        providerId,
        apiBaseUrl: endpoint,
        remoteModelId,
        supportsTopK: true,
      },
      generationConfig: {
        maxOutputTokens: 64,
        maxContextTokens: 256,
        temperature: 0.6,
        topK: 40,
        topP: 0.95,
        repetitionPenalty: 1.0,
      },
    });

    await new Promise((resolve, reject) => {
      client.generate(
        [{ role: 'user', content: 'Say hello from the browser harness.' }],
        {
          onToken: (chunk) => {
            if (outputElement) {
              outputElement.textContent += String(chunk || '');
            }
            appendEvent(`token: ${String(chunk || '')}`);
          },
          onComplete: (text) => {
            if (outputElement && !outputElement.textContent) {
              outputElement.textContent = String(text || '');
            }
            appendEvent('complete');
            setStatus('Complete');
            resolve(undefined);
          },
          onError: (message) => {
            setStatus(`Error: ${String(message || 'Unknown error')}`);
            reject(new Error(String(message || 'Unknown error')));
          },
          onCancel: () => {
            setStatus('Canceled');
            appendEvent('canceled');
            resolve(undefined);
          },
        }
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    setStatus(`Error: ${message}`);
    appendEvent(`error: ${message}`);
  } finally {
    runButton.disabled = false;
    cancelButton.disabled = true;
  }
}

async function cancelHarness() {
  if (!cancelButton) {
    return;
  }
  cancelButton.disabled = true;
  await client.cancelGeneration();
  setStatus('Canceled');
  appendEvent('canceled');
}

runButton?.addEventListener('click', () => {
  void runHarness();
});

cancelButton?.addEventListener('click', () => {
  void cancelHarness();
});
