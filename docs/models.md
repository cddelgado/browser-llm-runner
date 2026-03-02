# Models

Model support is configured in `src/config/models.json`:

- `models`: list of selectable models (`id`, `label`, optional `features`)
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
