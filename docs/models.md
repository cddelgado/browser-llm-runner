# Models

Current supported model in the settings drawer:

- `onnx-community/Qwen3-0.6B-ONNX`
- Legacy aliases remapped automatically at runtime:
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/Qwen3-0.6B-ONNX`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/Qwen3-0.6B-ONNX`
  - `Xenova/distilgpt2` -> `onnx-community/Qwen3-0.6B-ONNX`

Notes:

- The model is downloaded at runtime by Transformers.js and cached in-browser for reuse.
- Model assets are not committed to this repository.
