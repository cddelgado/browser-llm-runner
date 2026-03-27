# Models

Model support is configured in `src/config/models.json`:

- `models`: list of selectable models (`id`, `label`, optional card metadata, optional `features`)
- `models[].displayName`: friendly card title shown in the pre-chat model picker
- `models[].summary`: short supporting description shown under the title
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
- `models[].toolCalling`: optional per-model tool-call output profile used to build prompts and future parsing:
  - `format` (`json`, `tagged-json`, or `special-token-call`)
  - `nameKey` / `argumentsKey` for JSON-based models
  - `openTag` / `closeTag` for tagged JSON models
  - `callOpen` / `callClose` for function-style tool call wrappers
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

Current supported models in Settings:

- `onnx-community/Llama-3.2-3B-Instruct-onnx-web` (default)
- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa`
- `onnx-community/Qwen3-0.6B-ONNX`
  - Uses runtime dtype `q4f16`, matching the model card's WebGPU example.
  - Uses `<think>...</think>` tags for thought separation when the model emits them.
  - Uses recommended sampling defaults from the model card: temperature `0.6`, top-k `20`, top-p `0.95`.
  - Does not force `enableThinking`.
- `LiquidAI/LFM2.5-1.2B-Thinking-ONNX`
  - Uses ONNX `q4` weights.
  - Uses `<think>...</think>` tags for thought separation.
  - Requires WebGPU in-browser, so it is disabled when WebGPU is unavailable or when `WASM only` is selected.
- `onnx-community/gemma-3n-E2B-it-ONNX`
  - Supports text output with image, audio, and video inputs.
  - The current app UI exposes image attachments only; audio/video input UI is not implemented yet.
  - The app uses a dedicated multimodal worker path for this model and requires WebGPU.
- Legacy aliases remapped automatically at runtime:
  - `onnx-community/Llama-3.2-3B-Instruct-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `onnx-community/Qwen3.5-2B-ONNX` -> `onnx-community/Qwen3-0.6B-ONNX`
  - `huggingworld/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`

Notes:

- The model is downloaded at runtime by Transformers.js and cached in-browser for reuse.
- Model assets are not committed to this repository.
- The pre-chat picker presents each model as a single-select card with icon-only ability badges, short-term memory, and a rough word estimate (`tokens * 0.75`).
- Model capability flags describe what a model can support; the image/audio/video UI is only enabled when the runtime also declares `multimodalGeneration: true`.
- Settings fields for maximum output/context tokens are numeric, step in 8, and disabled until a model is loaded.
- Token fields show an estimated words value based on `tokens * 0.75`.
- Temperature is numeric, step in 0.1, and disabled until a model is loaded.
- Top K is numeric, step in 5, and uses a per-model default from `models[].generation.defaultTopK`.
- Top P (nucleus sampling) is numeric, min 0.00, max 1.00, step in 0.05, and uses a per-model default from `models[].generation.defaultTopP`.
- User changes to output/context tokens, temperature, Top K, and Top P are persisted per model in browser storage and restored when that model is selected again.
- If generation settings are changed while generating, they are queued and applied after that generation finishes.

Per-model limits and defaults:

- `onnx-community/Llama-3.2-3B-Instruct-onnx-web`: runtime dtype auto-selected by Transformers.js, max context `131072`, default context `8192`, default temperature `0.6`, default top-p `0.9`, default top-k `50`, feature flag `toolCalling`, tool call format `{"name":"tool_name","parameters":{...}}`, no thinking tags
- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa`: runtime dtype auto-selected by Transformers.js, max context `131072`, default context `8192`, default temperature `0.6`, default top-p `0.9`, default top-k `50`, no thinking tags
  - Both Llama entries enable `useExternalDataFormat: true` for `.onnx_data` loading.
- `onnx-community/Qwen3-0.6B-ONNX`: runtime dtype `q4f16`, max context `40960`, default context `8192`, default temperature `0.6`, default top-k `20`, default top-p `0.95`, feature flags `thinking` and `toolCalling`, tool call format `<tool_call>{"name":"tool_name","arguments":{...}}</tool_call>`, thinking tags `<think>` / `</think>`
- `LiquidAI/LFM2.5-1.2B-Thinking-ONNX`: runtime dtype `q4`, `requiresWebGpu: true`, `useExternalDataFormat: true`, max context `32768`, default context `8192`, default temperature `0.1`, default top-k `50`, default top-p `0.1`, feature flags `thinking` and `toolCalling`, tool call format `<|tool_call_start|>[tool_name(arg="value")]<|tool_call_end|>`, thinking tags `<think>` / `</think>`
- `onnx-community/gemma-3n-E2B-it-ONNX`: runtime dtype map `{ audio_encoder: fp32, vision_encoder: fp32, embed_tokens: q4, decoder_model_merged: q4 }`, `requiresWebGpu: true`, `multimodalGeneration: true`, max context `32768`, default context `8192`, default temperature `0.6`, default top-k `65`, default top-p `0.95`, feature flags `toolCalling`, `imageInput`, `audioInput`, and `videoInput`, tool call format `{"name":"tool_name","arguments":{...}}`
