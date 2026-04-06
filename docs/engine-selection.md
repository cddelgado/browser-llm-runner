# Engine Selection

Inference is executed in a dedicated Web Worker (`src/workers/llm.worker.js`).

## Backends

- `auto`: tries `webgpu`, then falls back to the browser CPU path via `wasm`
- `webgpu`: WebGPU only
- `wasm`: WASM only
- `cpu`: CPU only, mapped to Transformers.js browser execution via `wasm`
- Models with `requiresWebGpu: true` only attempt WebGPU and do not fall back to WASM/CPU.
- Models with `multimodalGeneration: true` use a processor/model execution path in the worker instead of the text-generation pipeline.
- For multimodal models, the worker loads the `AutoProcessor` lazily on first generation and then reuses it for later requests.

The resolved backend is shown in the status region in the main UI.
Initialization is user-triggered on first message send in the chat workspace.
If model/backend settings change, the next message triggers a fresh load with updated settings.
If a backend change makes the current model unavailable, the UI switches to the first compatible model and announces that in the status region.
Generation settings (`maximum output tokens`, `maximum context size`, `temperature`, `top k`, `top p`) apply immediately when idle, or after the current generation completes.

## UI boundary

UI code does not call runtime-specific APIs directly.
It uses `LLMEngineClient` (`src/llm/engine-client.js`) as the single inference boundary.
