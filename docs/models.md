# Models

Model support is configured in `src/config/models.json`:

- `models`: list of supported models (`id`, `label`, optional card metadata, optional `features`)
  - The app also appends browser-saved cloud models at runtime from `Settings -> Cloud Providers`; those entries are normalized into the same picker/catalog shape even though they are not committed in `src/config/models.json`.
- `models[].engine`: explicit inference-driver selection for that model
  - `type`: currently `transformers-js`, `mediapipe-genai`, or `openai-compatible`
- `models[].displayName`: friendly card title shown in the pre-chat model picker
- `models[].languageSupport`: optional language-tag metadata for the pre-chat picker
  - `tags`: ordered language entries with two-letter `code` and full `name`
  - `hasMore`: optional flag to show a linked `and more` suffix when the publisher supports additional languages
  - `sourceUrl`: publisher source linked from `and more`
- `models[].repositoryUrl`: model details link opened from the card footer
- `models[].unavailableReason`: optional fixed reason that keeps a model visible in the picker but disabled
- `models[].features`: normalized capability flags used by the app UI/runtime gating:
  - `streaming`
  - `thinking`
  - `toolCalling`
  - `imageInput`
  - `audioInput`
  - `videoInput`
- `models[].runtime`: optional runtime hints per model:
  - `dtypes.webgpu` / `dtypes.cpu` (example: `q4f16` on WebGPU and `q8` on CPU)
  - `dtype` (legacy fallback for models that still use one dtype in every mode)
  - `enableThinking` (`true` to pass `enable_thinking` during generation)
  - `requiresWebGpu` (`true` to disable the model unless WebGPU can be used)
  - `multimodalGeneration` (`true` only when the worker has a real multimodal execution path for image/audio/video inputs)
  - `allowBackendFallback` (`false` to block automatic fallback to a different backend package during init; users can still choose CPU mode explicitly)
  - `useExternalDataFormat` (`true`/number to enable loading `.onnx_data` sidecar files)
  - `modelAssetPath` (pinned LiteRT artifact URL for engines that fetch a specific artifact directly)
  - `promptFormat` (worker-side prompt flattening profile for LiteRT models that do not use tokenizer `apply_chat_template()`)
  - `providerId` / `providerType` / `providerDisplayName` (runtime-only metadata for browser-saved cloud models)
  - `apiBaseUrl` / `remoteModelId` (OpenAI-compatible worker endpoint/model routing)
  - `supportsTopK` (`true` only when the configured cloud provider should receive `top_k`)
- `models[].thinkingControl`: optional model-specific reasoning control metadata:
  - `defaultEnabled` (`false` only when the model should default to non-thinking mode in this app)
  - `runtimeParameter` (currently `enable_thinking` when the worker should pass a runtime switch)
  - `enabledInstruction` / `disabledInstruction` (literal model-specific system-prompt switch text such as `/think` and `/no_think`)
- `models[].toolCalling`: optional per-model tool-call output profile used to build prompts and future parsing:
  - `toolListFormat` (optional: `markdown` by default, `json` for models that expect a JSON tool list in the system prompt)
  - `format` (`json`, `tagged-json`, `special-token-call`, `xml-tool-call`, or `gemma-special-token-call`)
  - `nameKey` / `argumentsKey` for JSON-based models
  - `openTag` / `closeTag` for tagged JSON models
  - `callOpen` / `callClose` for function-style tool call wrappers
  - XML and Gemma special-token formats use `format` alone because their wrapper shapes are fixed in the app
- `models[].inputLimits`: optional per-media limits used by the composer and worker
  - `maxImageInputs`
  - `maxAudioInputs`
  - `maxVideoInputs`
- `models[].generation`: per-model integer token limits:
  - `defaultMaxOutputTokens`
  - `maxOutputTokens`
  - `defaultMaxContextTokens`
  - `maxContextTokens`
  - `minTemperature`
  - `maxTemperature`
  - `defaultTemperature`
  - `defaultTopK`
  - `defaultTopP`
  - `defaultRepetitionPenalty` (optional runtime-supported default for Transformers.js generation)
- `thinkingTags`: optional per-model tags used to separate internal thoughts from final response
  during streaming (for example `<think>` and `</think>`)
  - `stripLeadingText`: optional first-line marker removed from extracted thought text after the opening tag
- `defaultModelId`: default model used for first load and invalid selections
- `legacyAliases`: map of old stored IDs to canonical supported IDs

## Model lifecycle

Treat model work as one of three cases:

1. Add a new selectable model.
2. Disable or replace an existing model.
3. Introduce a new model capability that the current schema or worker path does not understand yet.

## Add a model

When adding a new model:

1. Add the model entry to `src/config/models.json`.
2. Decide whether it should be selectable now or temporarily unavailable through `unavailableReason`.
3. Set `generation` defaults and limits from the publisher card or the tested runtime behavior.
4. Set `runtime` fields to match the actual worker path requirements.
5. Set `features` conservatively. Do not advertise a capability the app cannot execute yet.
6. Add `toolCalling` only if the model can reliably emit one of the currently supported formats.
7. Add `thinkingTags` only if the model actually emits stable opening and closing tags that the transcript parser can split during streaming.
8. Update this document and `README.md` if the visible model list or contributor expectations changed.
9. Update or add tests in `tests/unit/model-settings.test.js` and any UI tests affected by card count, availability, or capability badges.

Minimum validation after adding a model:

- The card renders correctly in the picker when the model is visible.
- Backend availability behaves correctly for `auto`, `webgpu`, `wasm`, and `cpu`.
- The worker loads the right execution path.
- Tool calling, thinking tags, and media input are either verified or explicitly disabled.
- `npm run typecheck`
- Relevant unit tests

## Disable or remove a model

Use this path when a model should stop being selectable.

1. If the model is only temporarily unsupported, keep the entry and set `unavailableReason`.
2. If compatibility is no longer required, delete the model entry entirely.
3. Remove any `legacyAliases` that only pointed at the deleted model.
4. Update docs and tests that assume the removed model still exists.

## Schema field impact map

This is the practical checklist for future model drops. If a model like a future Gemma release adds a new behavior, walk this list before you assume the catalog entry alone is enough.

### Identity and picker metadata

- `id`
  Used as the canonical model key throughout state, persistence, exports, and runtime lookup.
- `label`
  Fallback display text when no friendlier name is provided.
- `displayName`
  Card title in the pre-chat picker.
- `repositoryUrl`
  Model details link in the picker.
- `languageSupport`
  Card language badges and the linked `and more` overflow indicator.
- `unavailableReason`
  Keeps the model visible in `MODEL_OPTIONS`, but `getModelAvailability()` will disable it with the provided reason until the runtime path is actually supported.

### Feature flags

Normalized in `src/config/model-settings.js` via `MODEL_FEATURE_FLAGS`.

- `streaming`
  UI expectation only today. The app is built around streaming responses, so do not mark this `false` unless you also update the generation UX.
- `thinking`
  Controls the presence of the thinking badge. Also becomes true automatically when `thinkingTags` are configured.
- `toolCalling`
  Enables tool-calling controls and allows a per-model `toolCalling` prompt/parsing profile.
- `imageInput`
  Declares that the model can accept image input, but the UI/runtime only enables it when `runtime.multimodalGeneration === true`.
- `audioInput`
  Same pattern as image input. This app now wires upload-only audio input for models whose runtime path is verified.
- `videoInput`
  Same pattern as audio input. Do not enable this unless the worker path is actually viable; the app currently keeps video disabled for supported models.

### Engine field

- `engine.type`
  Selects the inference driver for that model. The current app ships `transformers-js` for ONNX/Transformers.js models, `mediapipe-genai` for LiteRT Gemma 4, and `openai-compatible` for browser-saved cloud models discovered from `Settings -> Cloud Providers`.

### Runtime fields

- `dtypes.webgpu` / `dtypes.cpu`
  Parsed by `src/config/model-settings.js` and resolved by the current Transformers.js worker path according to the selected mode.
- `dtype`
  Legacy fallback parsed by the same runtime path when a model does not provide mode-specific `dtypes`.
- `enableThinking`
  Passed to the worker generation path as `enable_thinking` for models that need an explicit runtime switch instead of only prompt behavior.
- `requiresWebGpu`
  Enforced by availability logic and backend fallback behavior. Also affects picker messaging.
- `multimodalGeneration`
  Enables the multimodal processor/model path when the active prompt actually contains image/audio/video inputs. Text-only chats on those same models can still load through the lighter text-generation path.
- `useExternalDataFormat`
  Enables `.onnx_data` sidecar loading for exported ONNX packages.
- `modelAssetPath`
  Used by engines such as `mediapipe-genai` to fetch a pinned LiteRT artifact directly.
- `promptFormat`
  Used by LiteRT worker paths to select the right flattened chat wrapper. Current values are `gemma-turns` and `qwen-im`.
- `providerId` / `providerType` / `providerDisplayName`
  Runtime-only metadata for browser-saved cloud models so the worker can look up the saved provider and render a clearer picker card.
- `apiBaseUrl`
- `remoteModelId`
  Used by the OpenAI-compatible worker to call `/chat/completions` for the selected remote model.
- `supportsTopK`
  Lets the app suppress `top_k` for providers that should stay on the stricter OpenAI-style request envelope.

### Thinking-control fields

- `thinkingControl.defaultEnabled`
  Default per-conversation reasoning state for models with an exposed thinking switch.
- `thinkingControl.runtimeParameter`
  Lets the app translate the per-conversation thinking toggle into a worker generation flag.
- `thinkingControl.enabledInstruction`
- `thinkingControl.disabledInstruction`
  Literal system-prompt switch strings the app appends when the model expects prompt-level reasoning control.

Important multimodal rule:

- `features.imageInput/audioInput/videoInput` describe what the model family can do.
- `runtime.multimodalGeneration` describes whether this app has a real execution path for that capability.
- Both must be true before the user-facing capability should be treated as supported.

### Tool-calling fields

- `toolCalling.format`
  Must be one of `json`, `tagged-json`, `special-token-call`, `xml-tool-call`, or `gemma-special-token-call`.
- `toolCalling.toolListFormat`
  Optional. Defaults to the app's markdown tool list. Set to `json` for models that expect `List of tools: [...]` in the system prompt.
- `nameKey` / `argumentsKey`
  Required for JSON-based formats.
- `openTag` / `closeTag`
  Required for tagged JSON formats.
- `callOpen` / `callClose`
  Required for function-style wrappers.

These fields affect both prompt construction and tool-call sniffing in `src/llm/tool-calling.js`. If a new model uses a fourth call format, adding the catalog entry is not enough; you must extend prompt generation and parser support.

### Thinking-tag fields

- `thinkingTags.open`
- `thinkingTags.close`

These feed transcript parsing in `src/main.js` and state/controller behavior during streaming. If a new model uses a different thought-output convention, confirm whether the app can:

- detect the boundaries during streaming
- avoid leaking thought text into the copied final response
- keep the transcript accessible and stable

If the model exposes thoughts in a way that does not fit the current tag-based parser, that is an app feature change, not just a config change. Gemma 4's channel-wrapped thinking works because the parser can also strip a configured leading label from the extracted thought text.

### Generation fields

- `defaultMaxOutputTokens`
- `maxOutputTokens`
- `defaultMaxContextTokens`
- `maxContextTokens`
- `minTemperature`
- `maxTemperature`
- `defaultTemperature`
- `defaultTopK`
- `defaultTopP`
- `defaultRepetitionPenalty`

These drive settings UI constraints, persistence, and queued generation-setting updates. Treat them as user-facing behavior, not passive metadata.

## What to inspect when a model introduces something new

Use this quick map before adding fields ad hoc:

- New tool-call syntax:
  Check `src/llm/tool-calling.js`.
- New backend or runtime requirement:
  Check `src/config/model-settings.js`, `docs/engine-selection.md`, and `src/workers/llm.worker.js`.
- New image/audio/video behavior:
  Check `src/main.js`, `src/app/preferences-models.js`, `src/app/composer-events.js`, `src/attachments/composer-attachments.js`, and `src/workers/llm.worker.js`.
- New thought / reasoning output style:
  Check `src/main.js`, `src/state/app-controller.js`, and transcript rendering.
- New picker badge or capability category:
  Check `src/app/preferences-models.js` and the feature normalization list in `src/config/model-settings.js`.
- New persisted alias or replacement path:
  Check `legacyAliases`, conversation migration behavior, and export expectations.

## When a new capability needs code, not just config

Examples:

- A future Gemma model starts supporting a new media type.
- A model emits tool calls in XML instead of one of the three supported formats.
- A model exposes a separate reasoning channel rather than `<think>...</think>` tags.
- A model requires a backend other than the current WebGPU/WASM/CPU assumptions.

In those cases:

1. Extend the code path first.
2. Add tests for the new behavior.
3. Only then expose the capability in `models.json`.

Do not mark a capability on the card just because the upstream model card advertises it. In this app, `models.json` is the contract for what this frontend and worker can actually support.

Current models in Settings:

- `onnx-community/gemma-4-E2B-it-ONNX` (default)
  - Uses the `transformers-js` engine.
  - Uses runtime dtypes `{ webgpu: q4f16, cpu: q4f16 }`, `multimodalGeneration: true`, and `useExternalDataFormat: true`.
  - Uses `thinkingControl` with runtime `enable_thinking`.
  - Uses Gemma's channel-style thought markers via `thinkingTags { open: "<|channel>", close: "<channel|>", stripLeadingText: "thought" }`.
  - Uses the Gemma special-token tool-call format.
  - Keeps image and audio input enabled in the app with `inputLimits.maxImageInputs = 1` and `inputLimits.maxAudioInputs = 1`.
- `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - Uses the `transformers-js` engine.
  - Uses runtime dtypes `{ webgpu: q4f16, cpu: q4 }`.
  - Keeps the browser-oriented `onnx-web` repo id as the canonical Llama 3.2 3B model in this app.
- `onnx-community/Bonsai-8B-ONNX`
  - Uses the `transformers-js` engine.
  - Experimental low-bit ONNX path using runtime dtypes `{ webgpu: q1, cpu: q4 }`.
  - Relies on the upstream `transformers.js_config.use_external_data_format` map for per-dtype ONNX shard counts.
  - Uses `thinkingTags { open: "<think>", close: "</think>" }`.
  - Uses tagged JSON tool calls with `<tool_call>...</tool_call>` wrappers and `{"name":"...","arguments":{...}}` inside.
- Legacy aliases remapped automatically at runtime:
  - `onnx-community/Llama-3.2-3B-Instruct-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
- Browser-saved cloud models:
  - come from `Settings -> Cloud Providers` after the app successfully reads that provider's `/models` endpoint
  - are added to the same picker used by local models for `New Conversation` and `New Agent`
  - default to a conservative remote-friendly feature set in this app: streaming on, tool calling off, thinking off, and no multimodal input until a provider/runtime path is explicitly verified

Notes:

- Each model explicitly points at its engine driver in config.
- Transformers.js and MediaPipe Tasks GenAI are loaded from locally installed packages and bundled into the app build.
- The installed Transformers.js runtime now exposes newer low-bit ONNX dtypes including `q2`, `q2f16`, `q1`, and `q1f16`; this app currently uses `q1` for Bonsai on WebGPU.
- Model assets are downloaded at runtime and cached in-browser through the engine-specific path.
- Model assets are not committed to this repository.
- Other model artifacts are not uniformly revision-pinned yet; this remains a documented accepted risk.
- The pre-chat picker presents each model as a single-select horizontal row with capability chips, language tags, and short-term memory shown as tokens plus a rough word estimate rounded to the nearest 100.
- Model capability flags describe what a model can support; the image/audio/video UI is only enabled when the runtime also declares `multimodalGeneration: true`.
- Audio input is upload-only. The app does not expose live recording.
- Video input should stay disabled until the worker path is validated end-to-end in the browser runtime.
- Settings fields for maximum output/context tokens are numeric, step in 8, and disabled until a model is loaded.
- Token fields show an estimated words value based on `tokens * 0.75`.
- Temperature is numeric, step in 0.1, and disabled until a model is loaded.
- Top K is numeric, step in 1, and uses a per-model default from `models[].generation.defaultTopK`.
- Top P (nucleus sampling) is numeric, min 0.00, max 1.00, step in 0.05, and uses a per-model default from `models[].generation.defaultTopP`.
- `repetition_penalty` is applied from per-model defaults when configured and supported by the installed Transformers.js runtime; unsupported upstream knobs such as `min_p` and `presence_penalty` are not exposed in this app.
- User changes to output/context tokens, temperature, Top K, and Top P are persisted per model in browser storage and restored when that model is selected again.
- If generation settings are changed while generating, they are queued and applied after that generation finishes.

Per-model limits and defaults:

- `onnx-community/gemma-4-E2B-it-ONNX`: engine `transformers-js`, runtime dtypes `{ webgpu: q4f16, cpu: q4f16 }`, `multimodalGeneration: true`, `useExternalDataFormat: true`, `inputLimits.maxImageInputs: 1`, `inputLimits.maxAudioInputs: 1`, max context `131072`, default context `8192`, default temperature `1.0`, default top-k `64`, default top-p `0.95`, default repetition penalty `1.0`, feature flags `thinking`, `toolCalling`, `imageInput`, and `audioInput`, tool call format `gemma-special-token-call`, thinking tags `<|channel>` / `<channel|>` with leading `thought` stripped, thinking control `{ runtimeParameter: "enable_thinking" }`
- `onnx-community/Llama-3.2-3B-Instruct-onnx-web`: runtime dtypes `{ webgpu: q4f16, cpu: q4 }`, max context `131072`, default context `8192`, default temperature `0.6`, default top-p `0.9`, default top-k `50`, feature flag `toolCalling`, tool call format `{"name":"tool_name","parameters":{...}}` with `run_shell_command` preferring `{"shell":"..."}` inside `parameters`, no thinking tags
- `onnx-community/Bonsai-8B-ONNX`: runtime dtypes `{ webgpu: q1, cpu: q4 }`, `allowBackendFallback: false` so a failed WebGPU init does not silently pull the larger CPU quantization, max context `65536`, default context `8192`, default temperature `0.5`, default top-k `20`, default top-p `0.85`, default repetition penalty `1.0`, feature flags `thinking` and `toolCalling`, tagged JSON tool-call format inside `<tool_call>...</tool_call>`, thinking tags `<think>` / `</think>`, and upstream-managed per-dtype ONNX shard metadata
- `Llama 3.2 3B` keeps the browser-oriented `onnx-web` repo id as its canonical model in this app. The full ONNX repo remains a legacy alias because its browser load path was not reliable here: the `int8` package could fail with `Array buffer allocation failed`, and the `q4` package could fail to preload required `.onnx_data` shards.
- The remaining listed Llama entry enables `useExternalDataFormat: true` for `.onnx_data` loading.
