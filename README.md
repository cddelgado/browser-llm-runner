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
  - User overrides are saved per model in browser storage and restored when that model is selected again.
  - Fields are disabled until a model is loaded.
  - If changed during generation, updates are queued and applied after the current response finishes.
- Temperature control in Settings:
  - `Temperature` is model-aware and constrained by per-model `minTemperature`, `maxTemperature`, and `defaultTemperature`.
  - Values use `step=0.1`.
  - User overrides are saved per model in browser storage and restored when that model is selected again.
  - The field is disabled until a model is loaded.
  - If changed during generation, updates are queued and applied after the current response finishes.
- `Auto` attempts WebGPU first and falls back to CPU if unavailable or initialization fails.
- The selected backend and model are stored in `localStorage`.
- Model files are downloaded on first load and cached in-browser for reuse (`Transformers.js` browser cache).
- Debug status history is available in `Settings -> Debug info` (accordion).
- Conversation list and transcript are state-driven (no placeholder messages).
- Conversations are persisted locally in browser IndexedDB and restored on reload.
- Saved conversation state includes stable IDs and forward-compatible metadata for future export/import:
  - message `content.parts` and `content.llmRepresentation` (verbatim LLM-facing text)
  - per-message `artifactRefs` placeholders
  - collection-level `artifacts` placeholders for future text/binary artifacts (binary intended as base64 + hash metadata)
- New conversations start untitled and are automatically renamed after the first model response based on conversation content.
- Model load progress UI collapses after successful initialization.
- Model outputs wrapped in model-configured thinking tags (for example `<think>...</think>`) are shown in a collapsible "Thinking" section during streaming.
- Each model response includes a `Regenerate` button. Regeneration resubmits the conversation up to the user turn before that response and replaces that response with a newly generated one.

## Supported model

- `onnx-community/Qwen3-0.6B-ONNX`
- Legacy stored IDs are automatically remapped to the supported model:
  - `onnx-community/gemma-3-1b-it-ONNX-GQA`
  - `onnx-community/gemma-3-1b-ONNX-GQA`
  - `Xenova/distilgpt2`
- Model support configuration lives in `src/config/models.json`:
  - `models`: options shown in the model selector
  - `models[].generation`: per-model defaults and limits for output/context tokens and temperature
  - `defaultModelId`: fallback/default selection
  - `legacyAliases`: stored legacy IDs remapped at runtime

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
