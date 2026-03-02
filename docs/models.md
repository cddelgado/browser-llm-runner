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

Current supported model in the settings drawer:

- `onnx-community/Qwen3-0.6B-ONNX`
- Legacy aliases remapped automatically at runtime:
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/Qwen3-0.6B-ONNX`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/Qwen3-0.6B-ONNX`
  - `Xenova/distilgpt2` -> `onnx-community/Qwen3-0.6B-ONNX`

Notes:

- The model is downloaded at runtime by Transformers.js and cached in-browser for reuse.
- Model assets are not committed to this repository.
- Settings fields for max output/context tokens are numeric, step in 8, and disabled until a model is loaded.
- Temperature is numeric, step in 0.1, and disabled until a model is loaded.
- User changes to max output/context tokens and temperature are persisted per model in browser storage and restored when that model is selected again.
- If generation settings are changed while generating, they are queued and applied after that generation finishes.
