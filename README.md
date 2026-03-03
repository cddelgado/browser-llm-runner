# browser-llm-runner

Student-facing browser chat UI with local model inference.

## Runtime behavior

- Inference runs in-browser via Transformers.js inside a Web Worker.
- On initial load, the app shows only a welcome/setup screen where users select a model and click `Load model`.
- During model load, setup shows overall progress plus a file-by-file list to make multi-file downloads explicit.
- The URL hash reflects the visible screen:
  - `#/` for setup/home
  - `#/chat` for the chat experience after model load
  - `#/settings` when Settings is open
  - Browser back/forward navigation follows those screen transitions.
- After model load completes, the UI switches from setup to the conversation view.
- If saved conversations exist, no conversation is auto-opened after load; users choose one from the conversation list.
- If no saved conversations exist, a blank conversation is created and shown after load.
- Backend selection supports:
  - `Auto (WebGPU then CPU)`
  - `WebGPU only`
  - `CPU only`
- Token controls in Settings:
  - `Maximum output tokens` and `Maximum context size (short-term memory)` are model-aware integer fields.
  - Values are constrained by per-model limits from `src/config/models.json` and use `step=8`.
  - Each token field shows an estimated word count (`tokens * 0.75`).
  - User overrides are saved per model in browser storage and restored when that model is selected again.
  - Fields are disabled until a model is loaded.
  - If changed during generation, updates are queued and applied after the current response finishes.
- Temperature control in Settings:
  - `Temperature (Creativity)` is model-aware and constrained by per-model `minTemperature`, `maxTemperature`, and `defaultTemperature`.
  - Values use `step=0.1`.
  - User overrides are saved per model in browser storage and restored when that model is selected again.
  - The field is disabled until a model is loaded.
  - If changed during generation, updates are queued and applied after the current response finishes.
- Sampling controls in Settings:
  - `Top K (Predictability)` uses `step=5` (default `50`) and explains that lower values are more predictable because sampling is limited to the K most likely options.
  - `Top P (Strangeness)` (nucleus sampling) uses min `0.00`, max `1.00`, and `step=0.05` (default `0.90`); higher values can produce more varied responses.
  - `Top K` and `Top P` are global settings and persist across sessions.
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
- Automatic conversation renaming now runs through a one-step orchestration loaded from `src/config/orchestrations/rename-chat.json`.
- Conversation title editing is disabled until that automatic model-generated title is available.
- After the first completed model response on the visible branch, a header `Download conversation` (download icon) menu appears next to title-edit controls.
- Download menu options:
  - `JSON (.llm.json) File`: exports only the currently visible branch as `<conversation-name>.llm.json` with top-level `conversation` metadata (`name`, `startedAt`, `exportedAt`), `model`, `temperature`, optional `systemPrompt` (when present on that conversation), and an `exchanges` array containing per-exchange `heading` plus entered/generated timestamps.
  - `Markdown (.md) File`: exports the visible branch as `<conversation-name>.md` with conversation metadata (started/exported UTC times, model, temperature), optional `## System prompt` section (when present), and one section per exchange.
- Model load progress UI collapses after successful initialization.
- Model outputs wrapped in model-configured thinking tags (for example `<think>...</think>`) are shown in a collapsible "Thinking" section during streaming.
- Model responses are rendered as Markdown (via `markdown-it`) in the transcript.
- LaTeX math in model responses is rendered in the transcript with MathJax (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`).
- `Settings -> Conversation -> Show thinking` controls whether thought sections are expanded by default (`off` by default).
- `Settings -> Conversation -> Default system prompt` sets an optional system prompt for newly created conversations only.
  - Existing conversations are not retroactively changed.
  - New generations in a conversation use that conversation's captured system prompt.
- Conversation header includes `Edit conversation system prompt` (card-checklist icon, before download):
  - Set optional per-conversation instructions.
  - `Append after default prompt` is enabled by default; when enabled, the conversation prompt is appended after the conversation's captured default prompt.
  - When `Append after default prompt` is disabled, the conversation prompt replaces the conversation's captured default prompt.
  - The captured default prompt for a conversation does not change after that conversation is created.
- Each user message and model response includes a copy action; model response copy excludes thought text.
- The Thinking section includes a dedicated copy action to copy thoughts only.
- Each model response includes a `Regenerate` button. Regeneration creates a new response variation at that turn, keeps prior variations, and lets users navigate alternatives with left/right controls and an `x/y` indicator.
- Each model response includes a `Fix` button (wrench icon). `Fix` now runs a multi-step orchestration from `src/config/orchestrations/fix-response.json` (critique -> revise -> validate) before streaming a corrected variant at that turn.
- Each user message now supports branch-aware editing controls:
  - `Edit` opens inline editing for that user message.
  - `Save` (floppy icon) commits the edit and removes all later turns on that branch from that point forward.
  - `Branch` (terminal-split icon) opens branch-edit mode at that turn. A sibling user-message branch is only created when `Save` is used with changed text; canceling or saving unchanged text creates no branch.
  - If multiple user branches exist at the same turn, left/right controls and an `x/y` indicator let users switch between those branch variants.

## Supported models

- `onnx-community/Llama-3.2-3B-Instruct-ONNX` (default)
- `onnx-community/Qwen3.5-2B-ONNX`
- Legacy stored IDs are automatically remapped to the supported model:
  - `LiquidAI/LFM2.5-1.2B-Thinking-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-ONNX`
- Model support configuration lives in `src/config/models.json`:
  - `models`: options shown in the model selector
  - `models[].generation`: per-model defaults and limits for output/context tokens and temperature
  - `defaultModelId`: fallback/default selection
  - `legacyAliases`: stored legacy IDs remapped at runtime
- Orchestration definitions are JSON files for transparency:
  - `src/config/orchestrations/rename-chat.json`
  - `src/config/orchestrations/fix-response.json`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
