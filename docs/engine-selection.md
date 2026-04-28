# Engine Selection

Inference is selected through the engine client boundary and executes through a per-model engine driver in a dedicated Web Worker.

## Engine drivers

- Model config now declares an explicit engine via `models[].engine.type`.
- `src/llm/engine-client.js` reads that engine type from the selected model config and uses the matching engine descriptor from `src/llm/engines/`.
- The app currently ships:
  - `transformers-js` via `src/workers/llm.worker.js`
  - `wllama` via `src/workers/wllama.worker.js`
  - `openai-compatible` via `src/workers/openai-compatible.worker.js`
- Additional local or remote drivers can be added later without changing the UI/controller contract, as long as they implement the same client-facing `initialize` / `generate` / `cancel` lifecycle.

## Local Runtime Defaults

- The app no longer exposes a WebGPU/CPU selector and does not pass a `device` option to Transformers.js `from_pretrained` calls.
- Legacy stored backend preferences such as `webgpu`, `cpu`, `auto`, and `wasm` normalize to one internal `default` preference before model availability or worker initialization.
- The Transformers.js worker makes one browser-default load attempt and labels it as `CPU` in user-facing status text because the app uses CPU-safe dtype and generation defaults for local ONNX models.
- ONNX worker defaults keep browser cache support enabled:
  - `env.useWasmCache = true`
  - `onnx.wasm.proxy = false` because the app already runs local inference in its own LLM worker
  - `onnx.wasm.numThreads = 0`
  - `onnx.wasm.wasmPaths` points at app-bundled ONNX Runtime WASM files instead of the default CDN path while matching Transformers.js' upstream path choice: asyncify assets for current Chromium/Firefox-style browsers and non-asyncify assets for Safari
  - `Settings -> System -> Clear Downloaded Model Files` uses Transformers.js cache metadata to remove the selected ONNX model, and `wllama`'s `ModelManager` to remove the selected cached GGUF model
- The app registers a same-origin `coi-serviceworker.js` on secure static hosts so pages such as GitHub Pages can add COOP/COEP headers after the first load/reload and expose `SharedArrayBuffer` for `wllama`.
- `onnx-community/Llama-3.2-3B-Instruct-onnx-web` runs through the `transformers-js` worker with CPU-safe dtype `q4`.
- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa` runs through the `transformers-js` worker with CPU-safe dtype `q4f16`.
- `huggingworld/gemma-4-E2B-it-ONNX` runs through the `transformers-js` worker with CPU-safe dtype `q4f16`.
- `onnx-community/Bonsai-8B-ONNX` runs through the `transformers-js` worker with CPU-safe dtype `q1`.
- `LiquidAI/LFM2.5-1.2B-Thinking-GGUF` runs through the `wllama` worker with the pinned `LFM2.5-1.2B-Thinking-Q4_K_M.gguf` file.
- Models with `multimodalGeneration: true` can still initialize through the text-generation path when the current prompt contains no image/audio/video inputs; the worker reinitializes into the processor/model path only when media is actually present.
- For multimodal models, the worker loads the `AutoProcessor` lazily on first generation and then reuses it for later requests, so multimodal preprocessing assets are not fetched during initial model load.
- For text-only Transformers.js turns, the worker now loads `AutoTokenizer` and `AutoModelForCausalLM` directly, feeds tokenized prompt tensors into `model.generate()`, and clears prior prompt-cache state between turns because `past_key_values` reuse was causing browser-memory regressions with the current local runtimes.
- The `wllama` worker currently supports text-only prompts. It normalizes structured chat messages into a chat-formatted prompt, rejects image/audio/video inputs with actionable errors, and streams completion deltas back through the same engine-client contract as the other drivers.
- The `wllama` worker bundles both single-thread and multi-thread WASM assets. When the page is cross-origin isolated, `wllama` auto-selects the multi-thread build; otherwise it falls back to single-thread.
- `Settings -> Model` exposes a small `wllama`-only block for GGUF models:
  - `Reuse prompt cache between turns` maps to `useCache` during generation when the active context budget is `2048` tokens or below
  - `Prompt batch size` maps to load-time `n_batch` and is capped to a smaller browser-safe range
  - `Min P` maps to sampling `min_p`
- ONNX models may provide `runtime.dtypes.cpu`; legacy `runtime.dtypes.webgpu` values can remain in config for catalog history but are not selected by the current worker path.
- ONNX model entries may also pin `runtime.revision` so Hub downloads stay on an exact model snapshot.
- `wllama` model entries may provide runtime hints such as `runtime.modelUrl`, `runtime.parallelDownloads`, and `runtime.allowOffline`.
- Browser-saved cloud models use runtime hints such as `runtime.providerId`, user-entered provider display names, `runtime.apiBaseUrl`, `runtime.remoteModelId`, optional `runtime.supportsTopK`, and optional `runtime.requiresProxy` to drive the OpenAI-compatible worker.
- The OpenAI-compatible worker keeps two request profiles: strict OpenAI-hosted endpoints suppress `top_k` and send `max_completion_tokens` on `/chat/completions`, while broader compatible endpoints keep the looser `max_tokens` request field. Cloud model thinking settings can also merge a provider-specific extra request body object into `/chat/completions`, such as `chat_template_kwargs.enable_thinking`. When a compatible provider streams reasoning in a separate `reasoning_content` delta, the worker wraps that stream in `<think>...</think>` so the transcript can render it in the standard thinking section. If a provider was flagged as proxy-required during `/models` inspection, `/chat/completions` is sent through the saved CORS proxy immediately; otherwise the worker uses direct fetch first and retries through the saved proxy after a likely CORS failure.

The resolved engine status is shown in the status region in the main UI.
Initialization is user-triggered on first message send in the chat workspace.
If model or generation settings change, the next message triggers a fresh load with updated settings when the active engine requires it.
Generation settings (`maximum output tokens`, `maximum context size`, `temperature`, `top k`, `top p`) apply immediately when idle, or after the current generation completes.
Models may define CPU generation-limit overrides when a local runtime path needs a lower browser-safe token budget.
On local engine paths, `maximum context size` is the total prompt-plus-response window. Workers reserve `maximum output tokens` inside that window, trim the oldest prompt tokens to the remaining prompt budget, and cap the actual generated token count so prompt plus response does not exceed the selected context size.
On the Transformers.js multimodal path, the worker trims the oldest non-system turns at message boundaries before generation so image/audio requests still honor the prompt budget left after reserving response tokens; if the current multimodal turn is too large to fit even after older turns are dropped, generation fails with guidance to raise the context size, lower output tokens, or reduce attachments.
On the `wllama` path, `maximum context size` and `prompt batch size` are part of model initialization, so the next request reinitializes the worker when either changes; before each generation, the worker also tokenizes the formatted prompt and trims the oldest prompt tokens to stay within the reserved prompt budget.
On the `wllama` path, prompt-cache reuse is disabled by default and is automatically forced off above the app's `2048`-token safe budget to avoid browser memory spikes.
On the OpenAI-compatible path, `maximum context size` is enforced approximately before the request is sent by trimming older prompt turns with a lightweight text-based token estimate, because the browser app does not ship every provider tokenizer. Remote model settings allow multi-million-token context windows so users can match larger provider limits instead of inheriting the smaller local browser runtime caps.
If a generation request stops emitting worker activity for 90 seconds, the main-thread engine client terminates that worker and returns a recoverable timeout so the next request can reinitialize cleanly. CPU-labeled local-model generation uses a 300-second timeout only until the first printable token arrives, because local prefill can be silent for several minutes on first inference; after streaming starts, the normal 90-second inactivity timeout applies.
The Transformers.js worker also posts coarse generation phase statuses for prompt preparation, prompt prefill, first generated token, and printable response streaming. These statuses feed the separate polite status region rather than the transcript live region, so users get transparency during long CPU waits without token-by-token screen reader announcements.
Runtime generation errors are surfaced to the controller without an automatic device retry. Fatal memory and device-loss errors unload the current worker, mark the model as not ready, and surface recovery guidance to retry, reduce context, choose a smaller model, or reload the page.
OpenAI-compatible requests stream through Server-Sent Events in a dedicated worker and still honor the existing cancellation contract by aborting the in-flight fetch when the user chooses `Stop generating`.
`wllama` requests stream through a dedicated worker and honor the same cancellation contract by aborting the active completion stream when the user chooses `Stop generating`.

## UI boundary

UI code does not call runtime-specific APIs directly.
It uses `LLMEngineClient` (`src/llm/engine-client.js`) as the single inference boundary.
