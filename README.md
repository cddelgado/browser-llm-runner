# browser-llm-runner

Student-facing browser chat UI with local model inference.

## Runtime behavior

- Inference runs in-browser via Transformers.js inside a Web Worker.
- Conversation turns are sent to the model as structured chat messages (`system`/`user`/`assistant`) rather than a flattened transcript string.
- On initial load, the app shows a home screen with a `Start a conversation` action.
- Clicking `Start a conversation` opens the chat workspace with model selection, an empty composer, and no model load yet.
- The selected model starts loading only after the first message is sent.
- During model load, the workspace shows one progress bar.
- The URL hash reflects the visible screen:
  - `#/` for setup/home
  - `#/chat` for the chat workspace
  - `#/settings` when Settings is open
  - Browser back/forward navigation follows those screen transitions.
- Header actions include a `Help` button that opens `help.html` in a new tab with feature and basic usage guidance.
- After model load completes, the full conversation header controls appear and response streaming begins.
- If saved conversations exist, no conversation is auto-opened after load; users choose one from the conversation list.
- If an existing conversation is selected before model load, the pre-chat panel prompts the user to load a model first and provides a `Load model` action.
- If no active conversation exists, a new untitled conversation is created when the first message is sent.
- Backend selection supports:
  - `Auto (WebGPU then WASM then CPU)`
  - `WebGPU only`
  - `WASM only`
- Token controls in Settings:
  - `Maximum output tokens` and `Context size (short-term memory)` are model-aware integer fields.
  - Values are constrained by per-model limits from `src/config/models.json` and use `step=8`.
  - Each token field shows an estimated word count (`tokens * 0.75`).
  - User overrides are saved per model in browser storage and restored when that model is selected again.
  - Fields are disabled until a model is loaded.
  - `Context size (short-term memory)` includes a `Reset to model default` link that applies the selected model default when clicked.
  - If changed during generation, updates are queued and applied after the current response finishes.
- Temperature control in Settings:
  - `Temperature (Creativity)` is model-aware and constrained by per-model `minTemperature`, `maxTemperature`, and `defaultTemperature`.
  - Values use `step=0.1`.
  - User overrides are saved per model in browser storage and restored when that model is selected again.
  - The field is disabled until a model is loaded.
  - `Temperature (Creativity)` includes a `Reset to model default` link that applies the selected model default when clicked.
  - If changed during generation, updates are queued and applied after the current response finishes.
- Sampling controls in Settings:
  - `Top K (Predictability)` uses `step=5` (default `50`) and explains that lower values are more predictable because sampling is limited to the K most likely options.
  - `Top P (Strangeness)` (nucleus sampling) uses min `0.00`, max `1.00`, and `step=0.05` (default `0.90`); higher values can produce more varied responses.
  - `Top K` and `Top P` are global settings and persist across sessions.
- `Auto` attempts WebGPU first, then WASM, then CPU if earlier backends are unavailable or initialization fails.
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
- The pre-chat `Ready to Chat?` panel also exposes conversation prompt editing for the currently selected conversation.
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

- `onnx-community/Llama-3.2-3B-Instruct-onnx-web` (default)
- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa`
- Legacy stored IDs are automatically remapped to the supported model:
  - `onnx-community/Llama-3.2-3B-Instruct-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `onnx-community/Qwen3.5-2B-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
- Model support configuration lives in `src/config/models.json`:
  - `models`: options shown in the model selector
  - `models[].runtime`: per-model runtime hints (`dtype`, optional `enableThinking`, optional `useExternalDataFormat`)
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
- `npm run lint`
- `npm run format`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run test:a11y`

## Architecture notes

- Conversation tree and export domain logic live in `src/state/conversation-model.js`.
- Centralized runtime state and selectors live in `src/state/app-state.js`.
- App control flow for generation, stop, rename, and fix actions lives in `src/state/app-controller.js`.
- Orchestration prompt templating and step execution live in `src/llm/orchestration-runner.js`.
- Transcript and conversation-list DOM rendering live in `src/ui/`.
- `src/main.js` remains the app shell for routing, page-level visibility, and wiring dependencies into those modules.
- See `docs/conversation-domain.md`, `docs/app-state.md`, `docs/app-controller.md`, `docs/orchestrations.md`, and `docs/ui-views.md` for the current boundaries.
