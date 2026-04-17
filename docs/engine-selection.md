# Engine Selection

Inference is selected through the engine client boundary and executes through a per-model engine driver in a dedicated Web Worker.

## Engine drivers

- Model config now declares an explicit engine via `models[].engine.type`.
- `src/llm/engine-client.js` reads that engine type from the selected model config and uses the matching engine descriptor from `src/llm/engines/`.
- The app currently ships:
  - `transformers-js` via `src/workers/llm.worker.js`
  - `mediapipe-genai` via `src/workers/mediapipe-llm.worker.js`
  - `openai-compatible` via `src/workers/openai-compatible.worker.js`
- Additional local or remote drivers can be added later without changing the UI/controller contract, as long as they implement the same client-facing `initialize` / `generate` / `cancel` lifecycle.

## Backends

- `webgpu`: prefer WebGPU execution and fall back to CPU/WASM for ONNX models that do not require WebGPU
  - automatic init fallback now happens only after the failed WebGPU worker is terminated, so CPU retry does not overlap the failed worker's model download activity
  - models may opt out with `runtime.allowBackendFallback: false` when CPU uses a separate quantization package that should remain an explicit manual choice
- `cpu`: CPU execution through the ONNX browser WASM backend
- Legacy stored preferences are normalized into those two modes:
  - `auto` -> `webgpu`
  - `wasm` -> `cpu`
- ONNX worker defaults keep browser cache support enabled for both modes:
  - `env.useWasmCache = true`
  - `onnx.wasm.proxy = true`
  - `onnx.wasm.numThreads = 0` by default, or the user-selected value from `Settings -> System -> Transformers.js CPU threads`
  - `onnx.wasm.wasmPaths` now points at app-bundled ONNX Runtime WASM files instead of the default CDN path (the installed `onnxruntime-web/webgpu` bundle currently uses the asyncify WebGPU EP assets, threaded WASM for CPU, and asyncify on Safari CPU fallback)
  - `Settings -> System -> Clear Downloaded Model Files` uses Transformers.js cache metadata to remove the selected local ONNX model's cached files from the browser cache
- Models with `requiresWebGpu: true` only attempt WebGPU and are unavailable in CPU mode.
- `onnx-community/Llama-3.2-3B-Instruct-onnx-web` runs through the `transformers-js` worker with `q4` on WebGPU and CPU.
- `huggingworld/gemma-4-E2B-it-ONNX` now runs through the `transformers-js` worker with `q4f16` on WebGPU and CPU.
- `onnx-community/Bonsai-8B-ONNX` now runs through the `transformers-js` worker with `q4` on WebGPU and CPU.
- Models with `multimodalGeneration: true` can still initialize through the text-generation path when the current prompt contains no image/audio/video inputs; the worker reinitializes into the processor/model path only when media is actually present.
- For multimodal models, the worker loads the `AutoProcessor` lazily on first generation and then reuses it for later requests, so multimodal preprocessing assets are not fetched during initial model load.
- For text-only Transformers.js turns, the worker now loads `AutoTokenizer` and `AutoModelForCausalLM` directly, feeds tokenized prompt tensors into `model.generate()`, and reuses `past_key_values` when a follow-up turn extends the previous prompt prefix.
- ONNX models may provide mode-specific runtime hints such as `runtime.dtypes.webgpu` and `runtime.dtypes.cpu`.
- ONNX model entries may also pin `runtime.revision` so Hub downloads stay on an exact model snapshot.
- LiteRT-backed models may use engine-specific runtime hints such as `runtime.modelAssetPath` and `runtime.promptFormat` instead of Transformers.js-specific dtype settings.
- Browser-saved cloud models use runtime hints such as `runtime.providerId`, `runtime.apiBaseUrl`, `runtime.remoteModelId`, and optional `runtime.supportsTopK` to drive the OpenAI-compatible worker.
- The OpenAI-compatible worker keeps two request profiles: strict OpenAI-hosted endpoints suppress `top_k` and send `max_completion_tokens` on `/chat/completions`, while broader compatible endpoints keep the looser `max_tokens` request field.

The resolved backend is shown in the status region in the main UI.
Initialization is user-triggered on first message send in the chat workspace.
If model/backend settings change, the next message triggers a fresh load with updated settings.
If a backend change makes the current model unavailable, the UI switches to the first compatible model and announces that in the status region.
Generation settings (`maximum output tokens`, `maximum context size`, `temperature`, `top k`, `top p`) apply immediately when idle, or after the current generation completes.
On the Transformers.js path, `maximum context size` is enforced as a prompt-token budget by left-truncating the oldest prompt tokens before generation, and `maximum output tokens` is passed separately as the generation cap.
On the Transformers.js multimodal path, the worker trims the oldest non-system turns at message boundaries before generation so image/audio requests still honor the configured context budget; if the current multimodal turn is too large to fit even after older turns are dropped, generation fails with guidance to raise the context size or reduce attachments.
On the OpenAI-compatible path, `maximum context size` is enforced approximately before the request is sent by trimming older prompt turns with a lightweight text-based token estimate, because the browser app does not ship every provider tokenizer.
If a generation request stops emitting worker activity for 90 seconds, the main-thread engine client terminates that worker and returns a recoverable timeout so the next request can reinitialize cleanly.
If WebGPU fails before any response tokens have streamed with a recoverable runtime error (including device loss), the engine client disposes the failed worker, reloads the same model on CPU once, and retries that request automatically.
If the user chooses `Stop generating` while that automatic CPU recovery is in flight, the pending request is canceled and the retry is not resumed after the replacement worker finishes initializing.
If that automatic CPU retry is unavailable or still fails, the controller unloads the current worker, marks the model as not ready, and surfaces recovery guidance to retry, switch to CPU, or reload the page if the browser/driver keeps failing WebGPU execution.
OpenAI-compatible requests stream through Server-Sent Events in a dedicated worker and still honor the existing cancellation contract by aborting the in-flight fetch when the user chooses `Stop generating`.
LiteRT/MediaPipe-backed models apply context and sampler settings at initialization time, so generation-setting edits trigger a reinitialization before the next LiteRT request instead of being hot-swapped mid-session.

## UI boundary

UI code does not call runtime-specific APIs directly.
It uses `LLMEngineClient` (`src/llm/engine-client.js`) as the single inference boundary.
