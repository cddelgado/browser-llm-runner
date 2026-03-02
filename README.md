# browser-llm-runner

Student-facing browser chat UI with local model inference.

## Runtime behavior

- Inference runs in-browser via Transformers.js inside a Web Worker.
- On initial load, the app shows a welcome/setup panel where users select a model and explicitly click `Load model` before chat.
- Backend selection supports:
  - `Auto (WebGPU then CPU)`
  - `WebGPU only`
  - `CPU only`
- Token controls in Settings:
  - `Max output tokens` and `Max context tokens` are model-aware integer fields.
  - Values are constrained by per-model limits from `src/config/models.json` and use `step=8`.
  - Fields are disabled until a model is loaded.
  - If changed during generation, updates are queued and applied after the current response finishes.
- `Auto` attempts WebGPU first and falls back to CPU if unavailable or initialization fails.
- The selected backend and model are stored in `localStorage`.
- Model files are downloaded on first load and cached in-browser for reuse (`Transformers.js` browser cache).
- Debug status history is available in `Settings -> Debug info` (accordion).
- Conversation list and transcript are state-driven (no placeholder messages).
- New conversations start untitled and are automatically renamed after the first model response based on conversation content.
- Model load progress UI collapses after successful initialization.
- Model outputs wrapped in model-configured thinking tags (for example `<think>...</think>`) are shown in a collapsible "Thinking" section during streaming.

## Supported model

- `onnx-community/Qwen3-0.6B-ONNX`
- Legacy stored IDs are automatically remapped to the supported model:
  - `onnx-community/gemma-3-1b-it-ONNX-GQA`
  - `onnx-community/gemma-3-1b-ONNX-GQA`
  - `Xenova/distilgpt2`
- Model support configuration lives in `src/config/models.json`:
  - `models`: options shown in the model selector
  - `models[].generation`: per-model defaults and max values for output/context tokens
  - `defaultModelId`: fallback/default selection
  - `legacyAliases`: stored legacy IDs remapped at runtime

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
