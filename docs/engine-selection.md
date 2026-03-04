# Engine Selection

Inference is executed in a dedicated Web Worker (`src/workers/llm.worker.js`).

## Backends

- `auto`: tries `webgpu`, then falls back to `cpu`
- `webgpu`: WebGPU only
- `cpu`: CPU only

The resolved backend is shown in the status region in the main UI.
Initialization is user-triggered on first message send in the chat workspace.
If model/backend settings change, the next message triggers a fresh load with updated settings.
Generation settings (`maximum output tokens`, `maximum context size`, `temperature`, `top k`, `top p`) apply immediately when idle, or after the current generation completes.

## UI boundary

UI code does not call runtime-specific APIs directly.
It uses `LLMEngineClient` (`src/llm/engine-client.js`) as the single inference boundary.
