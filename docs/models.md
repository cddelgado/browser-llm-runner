# Models

Model support is configured in `src/config/models.json`:

- `models`: list of supported models (`id`, `label`, optional card metadata, optional `features`)
- `models[].hidden`: optional flag to keep a model available for stored conversations and behavior-specific handling without showing it in the picker
- `models[].displayName`: friendly card title shown in the pre-chat model picker
- `models[].languageSupport`: optional language-tag metadata for the pre-chat picker
  - `tags`: ordered language entries with two-letter `code` and full `name`
  - `hasMore`: optional flag to show a linked `and more` suffix when the publisher supports additional languages
  - `sourceUrl`: publisher source linked from `and more`
- `models[].repositoryUrl`: model details link opened from the card footer
- `models[].features`: normalized capability flags used by the app UI/runtime gating:
  - `streaming`
  - `thinking`
  - `toolCalling`
  - `imageInput`
  - `audioInput`
  - `videoInput`
- `models[].runtime`: optional runtime hints per model:
  - `dtype` (example: `q4f16`)
  - `enableThinking` (`true` to pass `enable_thinking` during generation)
  - `requiresWebGpu` (`true` to disable the model unless WebGPU can be used)
  - `multimodalGeneration` (`true` only when the worker has a real multimodal execution path for image/audio/video inputs)
  - `useExternalDataFormat` (`true`/number to enable loading `.onnx_data` sidecar files)
- `models[].thinkingControl`: optional model-specific reasoning control metadata:
  - `defaultEnabled` (`false` only when the model should default to non-thinking mode in this app)
  - `runtimeParameter` (currently `enable_thinking` when the worker should pass a runtime switch)
  - `enabledInstruction` / `disabledInstruction` (literal model-specific system-prompt switch text such as `/think` and `/no_think`)
- `models[].toolCalling`: optional per-model tool-call output profile used to build prompts and future parsing:
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
- `thinkingTags`: optional per-model tags used to separate internal thoughts from final response
  during streaming (for example `<think>` and `</think>`)
- `defaultModelId`: default model used for first load and invalid selections
- `legacyAliases`: map of old stored IDs to canonical supported IDs

## Model lifecycle

Treat model work as one of three cases:

1. Add a new selectable model.
2. Hide or replace an existing model while preserving compatibility for stored conversations.
3. Introduce a new model capability that the current schema or worker path does not understand yet.

This app already supports case 2 directly:

- `MODEL_OPTIONS` only contains models where `hidden !== true`.
- `MODEL_OPTIONS_BY_ID` still contains hidden models so old conversations, exports, and per-model behavior continue to resolve.
- `legacyAliases` remaps previously stored model IDs before lookup.

That means removal from the picker should usually be a hide, not a hard delete, until you are certain no stored conversation or migration path still depends on the old ID.

## Add a model

When adding a new model:

1. Add the model entry to `src/config/models.json`.
2. Decide whether it should be selectable now or shipped hidden first with `"hidden": true`.
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

## Hide or remove a model

Use this path when a model should disappear from the UI but older conversations or behavior-specific code still need it.

1. Set `"hidden": true` on the model entry.
2. Keep the existing `id` unchanged.
3. Keep any needed `toolCalling`, `thinkingTags`, `runtime`, and `generation` fields so old conversations still behave correctly.
4. If an older stored ID should now resolve to a replacement model, add or update `legacyAliases`.
5. Update docs so the model is described as hidden legacy/replacement support rather than selectable support.
6. Update tests that assume a visible card count or visible catalog membership.

Hard deletion from `models.json` is higher risk because it removes:

- normalization support for existing stored model IDs
- model-specific availability checks
- model-specific tool-call parsing/prompt rules
- model-specific thinking-tag parsing
- model-specific generation defaults

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
- `hidden`
  Removes the model from `MODEL_OPTIONS` while keeping it available through `MODEL_OPTIONS_BY_ID`.

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

### Runtime fields

- `dtype`
  Parsed by `src/config/model-settings.js` and `src/workers/llm.worker.js`. Can be a string or a per-submodule dtype map.
- `enableThinking`
  Passed to the worker generation path as `enable_thinking` for models that need an explicit runtime switch instead of only prompt behavior.
- `requiresWebGpu`
  Enforced by availability logic and backend fallback behavior. Also affects picker messaging.
- `multimodalGeneration`
  Switches the worker from the text generation path to the multimodal processor/model path.
- `useExternalDataFormat`
  Enables `.onnx_data` sidecar loading for exported ONNX packages.

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

If the model exposes thoughts in a way that does not fit the current tag-based parser, that is an app feature change, not just a config change.

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

These drive settings UI constraints, persistence, and queued generation-setting updates. Treat them as user-facing behavior, not passive metadata.

## What to inspect when a model introduces something new

Use this quick map before adding fields ad hoc:

- New tool-call syntax:
  Check `src/llm/tool-calling.js`.
- New backend or runtime requirement:
  Check `src/config/model-settings.js`, `docs/engine-selection.md`, and `src/workers/llm.worker.js`.
- New image/audio/video behavior:
  Check `src/main.js`, `src/app/preferences.js`, `src/app/composer-events.js`, `src/attachments/composer-attachments.js`, and `src/workers/llm.worker.js`.
- New thought / reasoning output style:
  Check `src/main.js`, `src/state/app-controller.js`, and transcript rendering.
- New picker badge or capability category:
  Check `src/app/preferences.js` and the feature normalization list in `src/config/model-settings.js`.
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

Current selectable models in Settings:

- `onnx-community/Llama-3.2-3B-Instruct-onnx-web` (default)
- `onnx-community/Qwen3.5-2B-ONNX`
  - Uses runtime dtype `q4f16`, requires WebGPU, and loads external ONNX data sidecars.
  - Uses recommended sampling defaults from the model card: temperature `0.6`, top-k `20`, top-p `0.95`.
  - Uses `thinkingControl` with runtime `enable_thinking` plus `/think` and `/no_think` system-prompt switches.
  - Accepts uploaded image input in this app.
  - Uses the XML tool-call format.
- `onnx-community/gemma-4-E2B-it-ONNX`
  - Uses runtime dtype `q4f16`, requires WebGPU, and loads external ONNX data sidecars.
  - Accepts uploaded image input and upload-only audio input in this app.
  - Video input is intentionally not exposed because the current browser runtime path is not reliable enough yet.
  - Uses the Gemma special-token tool-call format.

Hidden legacy/replacement models kept for compatibility and model-specific behavior:

- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa`
- `LiquidAI/LFM2.5-1.2B-Thinking-ONNX`
  - Uses ONNX `q4` weights.
  - Uses `<think>...</think>` tags for thought separation.
  - Requires WebGPU in-browser, so it is disabled when WebGPU is unavailable or when `WASM only` is selected.
- `onnx-community/gemma-3n-E2B-it-ONNX`
  - Supports text output with image and audio inputs in this app.
  - Video remains disabled in config because the current browser runtime path is not reliable enough yet.
  - The app uses a dedicated multimodal worker path for this model and requires WebGPU.
- Legacy aliases remapped automatically at runtime:
  - `onnx-community/Llama-3.2-3B-Instruct-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `onnx-community/Qwen3-0.6B-ONNX` -> `onnx-community/Qwen3.5-2B-ONNX`
  - `huggingworld/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`

Notes:

- Transformers.js is loaded from the locally installed package and bundled into the app build.
- The model is downloaded at runtime by Transformers.js and cached in-browser for reuse.
- Model assets are not committed to this repository.
- Model artifacts are not revision-pinned yet; this is a documented accepted risk for now.
- The pre-chat picker presents each model as a single-select card with icon-only ability badges, language tags, and short-term memory shown as tokens plus a rough word estimate rounded to the nearest 100.
- Model capability flags describe what a model can support; the image/audio/video UI is only enabled when the runtime also declares `multimodalGeneration: true`.
- Audio input is upload-only. The app does not expose live recording.
- Video input should stay disabled until the worker path is validated end-to-end in the browser runtime.
- Settings fields for maximum output/context tokens are numeric, step in 8, and disabled until a model is loaded.
- Token fields show an estimated words value based on `tokens * 0.75`.
- Temperature is numeric, step in 0.1, and disabled until a model is loaded.
- Top K is numeric, step in 5, and uses a per-model default from `models[].generation.defaultTopK`.
- Top P (nucleus sampling) is numeric, min 0.00, max 1.00, step in 0.05, and uses a per-model default from `models[].generation.defaultTopP`.
- User changes to output/context tokens, temperature, Top K, and Top P are persisted per model in browser storage and restored when that model is selected again.
- If generation settings are changed while generating, they are queued and applied after that generation finishes.

Per-model limits and defaults:

- `onnx-community/Llama-3.2-3B-Instruct-onnx-web`: runtime dtype `q4f16`, max context `131072`, default context `8192`, default temperature `0.6`, default top-p `0.9`, default top-k `50`, feature flag `toolCalling`, tool call format `{"name":"tool_name","parameters":{...}}` with `run_shell_command` preferring `{"cmd":"..."}` inside `parameters`, no thinking tags
- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa`: runtime dtype `q4f16`, max context `131072`, default context `8192`, default temperature `0.6`, default top-p `0.9`, default top-k `50`, no thinking tags
- Both Llama entries use the published `model_q4f16` web export and enable `useExternalDataFormat: true` for `.onnx_data` loading.
- `onnx-community/Qwen3.5-2B-ONNX`: runtime dtype `q4f16`, `requiresWebGpu: true`, `multimodalGeneration: true`, `useExternalDataFormat: true`, max context `262144`, default context `8192`, default temperature `0.6`, default top-k `20`, default top-p `0.95`, feature flags `thinking`, `toolCalling`, and `imageInput`, input limit `maxImageInputs: 1`, tool call format `xml-tool-call`, thinking tags `<think>` / `</think>`, thinking control `{ runtimeParameter: "enable_thinking", enabledInstruction: "/think", disabledInstruction: "/no_think" }`
- `onnx-community/gemma-4-E2B-it-ONNX`: runtime dtype `q4f16`, `requiresWebGpu: true`, `multimodalGeneration: true`, `useExternalDataFormat: true`, max context `131072`, default context `8192`, default temperature `1.0`, default top-k `65`, default top-p `0.95`, feature flags `toolCalling`, `imageInput`, and `audioInput`, input limit `maxAudioInputs: 1`, tool call format `gemma-special-token-call`
- `LiquidAI/LFM2.5-1.2B-Thinking-ONNX`: runtime dtype `q4`, `requiresWebGpu: true`, `useExternalDataFormat: true`, max context `32768`, default context `8192`, default temperature `0.1`, default top-k `50`, default top-p `0.1`, feature flags `thinking` and `toolCalling`, tool call format `<|tool_call_start|>[tool_name(arg="value")]<|tool_call_end|>`, thinking tags `<think>` / `</think>`
- `onnx-community/gemma-3n-E2B-it-ONNX`: runtime dtype map `{ audio_encoder: fp32, vision_encoder: fp32, embed_tokens: q4, decoder_model_merged: q4 }`, `requiresWebGpu: true`, `multimodalGeneration: true`, max context `32768`, default context `8192`, default temperature `0.6`, default top-k `65`, default top-p `0.95`, feature flags `toolCalling`, `imageInput`, and `audioInput`, tool call format `{"name":"tool_name","arguments":{...}}`
