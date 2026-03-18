# Models

Model support is configured in `src/config/models.json`:

- `models`: list of selectable models (`id`, `label`, optional `features`)
- `models[].runtime`: optional runtime hints per model:
  - `dtype` (example: `q4f16`)
  - `enableThinking` (`true` to pass `enable_thinking` during generation)
  - `requiresWebGpu` (`true` to disable the model unless WebGPU can be used)
  - `useExternalDataFormat` (`true`/number to enable loading `.onnx_data` sidecar files)
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
- Backend-only model support:
  - `huggingworld/gemma-3-1b-it-ONNX-GQA`
  - This entry is intentionally hidden from the current selector so frontend behavior does not change yet.
  - Runtime defaults use ONNX `q4` weights and external data sidecar loading.
  - The worker preserves structured multimodal prompt parts (`text` and `image`) so the backend path can carry image content once the frontend is ready.
  - Current limitation: the published 1B ONNX package exposes a text-generation pipeline with tokenizer-only processor metadata, so loading works, but full image understanding is not available from this package alone.
- Legacy aliases remapped automatically at runtime:
  - `onnx-community/Llama-3.2-3B-Instruct-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `onnx-community/Qwen3.5-2B-ONNX` -> `onnx-community/Qwen3-0.6B-ONNX`
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `huggingworld/gemma-3-1b-it-ONNX-GQA`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `huggingworld/gemma-3-1b-it-ONNX-GQA`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`

Notes:

- The model is downloaded at runtime by Transformers.js and cached in-browser for reuse.
- Model assets are not committed to this repository.
- Settings fields for maximum output/context tokens are numeric, step in 8, and disabled until a model is loaded.
- Token fields show an estimated words value based on `tokens * 0.75`.
- Temperature is numeric, step in 0.1, and disabled until a model is loaded.
- Top K is numeric, step in 5, and uses a per-model default from `models[].generation.defaultTopK`.
- Top P (nucleus sampling) is numeric, min 0.00, max 1.00, step in 0.05, and uses a per-model default from `models[].generation.defaultTopP`.
- User changes to output/context tokens, temperature, Top K, and Top P are persisted per model in browser storage and restored when that model is selected again.
- If generation settings are changed while generating, they are queued and applied after that generation finishes.

Per-model limits and defaults:

- `onnx-community/Llama-3.2-3B-Instruct-onnx-web`: runtime dtype auto-selected by Transformers.js, max context `131072`, default context `8192`, default temperature `0.6`, default top-p `0.9`, default top-k `50`, no thinking tags
- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa`: runtime dtype auto-selected by Transformers.js, max context `131072`, default context `8192`, default temperature `0.6`, default top-p `0.9`, default top-k `50`, no thinking tags
  - Both Llama entries enable `useExternalDataFormat: true` for `.onnx_data` loading.
- `onnx-community/Qwen3-0.6B-ONNX`: runtime dtype `q4f16`, max context `40960`, default context `8192`, default temperature `0.6`, default top-k `20`, default top-p `0.95`, thinking tags `<think>` / `</think>`
- `LiquidAI/LFM2.5-1.2B-Thinking-ONNX`: runtime dtype `q4`, `requiresWebGpu: true`, `useExternalDataFormat: true`, max context `32768`, default context `8192`, default temperature `0.1`, default top-k `50`, default top-p `0.1`, thinking tags `<think>` / `</think>`
- `huggingworld/gemma-3-1b-it-ONNX-GQA` (backend-only): runtime dtype `q4`, `useExternalDataFormat: true`, max context `32768`, default context `8192`, default temperature `0.6`, default top-k `65`, default top-p `0.95`, no thinking tags
