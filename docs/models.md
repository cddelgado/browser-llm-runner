# Models

Model support is configured in `src/config/models.json`:

- `models`: list of selectable models (`id`, `label`, optional `features`)
- `models[].generation`: per-model integer token limits:
  - `defaultMaxOutputTokens`
  - `maxOutputTokens`
  - `defaultMaxContextTokens`
  - `maxContextTokens`
  - `minTemperature`
  - `maxTemperature`
  - `defaultTemperature`
- `thinkingTags`: optional per-model tags used to separate internal thoughts from final response
  during streaming (for example `<think>` and `</think>`)
- `defaultModelId`: default model used for first load and invalid selections
- `legacyAliases`: map of old stored IDs to canonical supported IDs

Current supported models in Settings:

- `onnx-community/Llama-3.2-3B-Instruct-ONNX` (default)
- `onnx-community/Qwen3.5-2B-ONNX`
- Legacy aliases remapped automatically at runtime:
  - `LiquidAI/LFM2.5-1.2B-Thinking-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`

Notes:

- The model is downloaded at runtime by Transformers.js and cached in-browser for reuse.
- Model assets are not committed to this repository.
- Settings fields for maximum output/context tokens are numeric, step in 8, and disabled until a model is loaded.
- Token fields show an estimated words value based on `tokens * 0.75`.
- Temperature is numeric, step in 0.1, and disabled until a model is loaded.
- Top K is numeric, step in 5, default 50.
- Top P (nucleus sampling) is numeric, min 0.00, max 1.00, step in 0.05, default 0.90.
- User changes to output/context tokens and temperature are persisted per model in browser storage and restored when that model is selected again.
- User changes to Top K and Top P are global and persist across sessions.
- If generation settings are changed while generating, they are queued and applied after that generation finishes.

Per-model limits and defaults:

- `onnx-community/Llama-3.2-3B-Instruct-ONNX`: max context `131072`, default temperature `0.6`
- `onnx-community/Qwen3.5-2B-ONNX`: max context `262144`, default temperature `0.6`
