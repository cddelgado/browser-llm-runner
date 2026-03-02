# Engine Selection

Inference is executed in a dedicated Web Worker (`src/workers/llm.worker.js`).

## Backends

- `auto`: tries `webgpu`, then falls back to `cpu`
- `webgpu`: WebGPU only
- `cpu`: CPU only

The resolved backend is shown in the status region in the main UI.
Initialization is user-triggered from the welcome/setup panel (`Load model`).
If model/backend settings change, the UI requires another explicit load.
Generation settings (`max output tokens`, `max context tokens`, `temperature`) apply immediately when idle, or after the current generation completes.

## UI boundary

UI code does not call runtime-specific APIs directly.
It uses `LLMEngineClient` (`src/llm/engine-client.js`) as the single inference boundary.
