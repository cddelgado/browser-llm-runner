# browser-llm-runner

Student-facing browser chat UI with local model inference.

## Runtime behavior

- Inference runs in-browser via Transformers.js inside a Web Worker.
- Conversation turns are sent to the model as structured chat messages (`system`/`user`/`assistant`) rather than a flattened transcript string.
- On initial load, the app shows a home screen with a `Start a conversation` action.
- Clicking `Start a conversation` opens the chat workspace with model selection, an empty composer, and no model load yet.
- The selected model starts loading only after the first message is sent.
- Each conversation stores its own selected model.
- Changing the model for the active conversation updates that conversation only.
- Switching to a saved conversation with a different model unloads the previous model worker and loads the selected conversation's model.
- Clicking `New Conversation` returns the workspace to the pre-chat model picker without adding a sidebar item yet.
- After leaving the launch screen, the `New Conversation` button remains visible in the top bar; it is disabled while a fresh conversation is being prepared.
- From that pre-chat state, users can keep the currently loaded model or choose a different model card before sending the first message.
- If a different model is selected for the next chat, the currently loaded model worker is unloaded before the replacement model is loaded.
- During model load, the workspace shows one progress bar.
- The URL hash reflects the visible screen:
  - `#/` for setup/home
  - `#/chat` for the chat workspace
  - `#/settings` when Settings is open
  - Browser back/forward navigation follows those screen transitions.
- Header actions include a `Help` button that opens `help.html` in the current tab with student-focused guidance and a back button to return to the last chat.
- Header actions include a `Keyboard shortcuts` button (`Ctrl+/`) so users can discover available keyboard actions.
- Keyboard users get route-safe skip links that jump to the visible main content, application controls, conversations, transcript, composer, and settings regions without breaking hash-based routing.
- The app shell uses a full-width `ClawsChat` banner above the main control bar, and the title/control strip stays visually minimized until the chat workspace is started while keyboard/help/settings remain available.
- The footer shows the current release stamp (`2026.03.25-01`), copyright for Catarino David Delgado, and links to the GitHub repository and MIT license.
- `Settings -> Conversation` includes:
  - `Enable tool calling` to append tool-call instructions only when the selected conversation model supports tool calling
  - `Render MathML from LaTeX` to control transcript math rendering and the matching math-formatting prompt hint
  - `Enable single-key transcript shortcuts` to disable focused transcript shortcuts like `E`, `B`, `R`, `F`, and `C`
  - `Transcript view` with `Standard` and `Compact`
- After model load completes, the full conversation header controls appear and response streaming begins.
- If saved conversations exist, no conversation is auto-opened after load; users choose one from the conversation list.
- The pre-chat panel is shown when no active conversation exists or when `New Conversation` is preparing a fresh chat; the bottom message composer keeps the same size before and after model load.
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
  - `Top K (Predictability)` uses `step=5` and loads a model-specific default from `src/config/models.json`.
  - `Top P (Strangeness)` (nucleus sampling) uses min `0.00`, max `1.00`, and `step=0.05`, with a model-specific default from `src/config/models.json`.
  - `Top K` and `Top P` are persisted per model, like temperature and token limits.
- `Auto` attempts WebGPU first, then WASM, then CPU if earlier backends are unavailable or initialization fails.
- The selected backend and model are stored in `localStorage`.
- Model files are downloaded on first load and cached in-browser for reuse (`Transformers.js` browser cache).
- Debug status history is available in `Settings -> Debug info` (accordion).
- Conversation list and transcript are state-driven (no placeholder messages).
- On desktop widths, the conversation list can be collapsed from a border-mounted toggle to give the active chat more space; the preference is saved locally.
- Chat and setup status notices use Bootstrap alert patterns with headings so updates are announced in context.
- The transcript includes helper links at both the start and end to jump to the transcript start, transcript end, or message input.
- The transcript includes a note that each exchange has a heading so assistive technologies can index the conversation structure.
- Conversations are persisted locally in browser IndexedDB and restored on reload.
- Legacy conversation snapshots are migrated automatically into the current normalized IndexedDB layout on load.
- Saved conversation state includes stable IDs and forward-compatible metadata for future export/import:
  - message `content.parts` and `content.llmRepresentation` (verbatim LLM-facing text)
  - per-message `artifactRefs` for attachment metadata
  - model-message `toolCalls` metadata when emitted tool calls are detected
  - `tool` role messages for tool execution results
  - collection-level `artifacts` for text/binary artifacts (binary stored as base64 plus hash metadata)
- IndexedDB persistence stores conversations, message nodes, and artifacts as separate records to avoid a single ever-growing snapshot entry.
- Binary artifacts are stored once in IndexedDB as blob-backed records; repeated derived text payloads are gzip-compressed when the browser supports `CompressionStream`.
- The composer supports local attachments:
  - The `+` composer control opens an attachment menu with `Attach for Reference` and `Attach to Work With`.
  - `Attach for Reference` targets the current curated document formats, including images plus `.txt`, `.csv`, `.md`, `.html`, `.htm`, `.css`, `.js`, and `.pdf`.
  - `Attach to Work With` opens an unfiltered picker, while the current ingestion pipeline still accepts the same supported attachment formats underneath.
  - Images can be attached from either menu path when the selected model supports image input.
  - Text attachments currently support `.txt`, `.csv`, `.md`, `.html`, `.htm`, `.css`, and `.js` files.
  - HTML attachments (`.html`, `.htm`) are converted locally into Markdown before they are added to the user prompt.
  - PDF attachments (`.pdf`) are parsed locally in-browser and converted into page-aware extracted text before being added to the user prompt.
  - PDF importing is parser-first and deterministic in the current implementation; OCR is not available yet, so image-only PDFs are rejected.
  - Text-backed attachments preserve a normalized representation in conversation state so future features can reuse the same conversion output for search/memory ingestion without re-parsing the source file.
  - Selected attachments appear as removable cards above the composer before send.
  - Sent attachments are restored with the conversation transcript on reload.
- Every uploaded attachment is also written into the browser's Origin Private File System (OPFS) behind a conversation-scoped linux-style `/workspace/...` path for future workspace tools.
  - Attachment records preserve that `/workspace/...` path metadata so future local commands can address uploaded files without reaching into UI-only state.
  - Text-file and PDF attachments include a collapsible `Model sees` preview in the transcript so users can inspect the exact prompt text derived from the file.
- Document-prep orchestration support is now built into the orchestration runtime for future attachment pipelines.
  - Orchestrations are no longer limited to linear prompt-only flows.
  - The runtime now supports prompt steps plus utility steps for deterministic preparation and chunk pipelines: `transform`, `forEach`, and `join`.
  - This is intended for parser-first, LLM-guided conversions such as future PDF-to-Markdown attachment preparation.
- New conversations start untitled and are automatically renamed after the first model response based on conversation content.
- Automatic conversation renaming now runs through a one-step orchestration loaded from `src/config/orchestrations/rename-chat.json`.
- Conversation title editing is disabled until that automatic model-generated title is available and is available from the active conversation's sidebar kebab menu.
- The conversation list reveals a kebab actions menu on hover/focus for each conversation instead of a direct delete icon.
- Conversation menu actions such as `Edit prompt` and `Delete` remain available while background orchestrations (for example automatic conversation renaming) are running; only active model loading/generation locks those controls.
- After the first completed model response on the visible branch, that kebab menu includes a nested `Download` submenu.
- Download submenu options:
  - `JSON (.llm.json) File`: exports only the currently visible branch as `<conversation-name>.llm.json` with top-level `conversation` metadata (`name`, `startedAt`, `exportedAt`), the conversation's `model`, `temperature`, optional `systemPrompt` (when present on that conversation), optional `toolCalling` metadata when tool calling is enabled at export time, and an `exchanges` array containing per-exchange `heading`, entered/generated/tool-result timestamps, model `toolCalls`, and tool-result metadata.
  - `Markdown (.md) File`: exports the visible branch as `<conversation-name>.md` with conversation metadata (started/exported UTC times, the conversation's model, temperature), optional tool-calling metadata when enabled at export time, optional `## System prompt` section (when present), and one section per exchange including model tool-call metadata and tool-result details when present.
- Model load progress UI collapses after successful initialization.
- Model outputs wrapped in model-configured thinking tags (for example `<think>...</think>`) are shown in collapsible "Thinking" sections at the point they occurred within the model turn during streaming.
- Model responses are rendered as Markdown (via `markdown-it`) in the transcript.
- `Settings -> Conversation -> Render MathML from LaTeX` controls whether LaTeX-delimited math is rendered in the transcript with MathJax (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`).
- When `Render MathML from LaTeX` is enabled, the effective system prompt adds math-formatting guidance telling the model to format math in LaTeX with proper delimiters.
- `Settings -> Conversation -> Show thinking` controls whether thought sections are expanded by default (`off` by default).
- `Settings -> Conversation -> Default system prompt` sets an optional system prompt for newly created conversations only.
  - Existing conversations are not retroactively changed.
  - New generations in a conversation use that conversation's captured system prompt.
- When prompt-driven feature guidance is enabled, the effective system prompt appends that guidance before any tool-calling instructions.
- When tool calling is enabled and the active conversation model supports it, a model-specific tool-calling instruction block is appended after the effective conversation system prompt and any enabled feature guidance.
- Tool-calling behavior, transcript presentation, export semantics, the current built-in tool catalog, and the planned function-call/MCP/`SKILL.md` capability model are documented in `docs/tools.md`.
- The current built-in tool catalog includes date/time lookup, user location lookup, a `tasklist` planner whose latest state is derived from inline tasklist tool results on the visible conversation branch, and a browser-local `run_shell_command` tool that exposes a documented GNU/Linux-like command subset over `/workspace`.
  - The shell tool keeps a conversation-local current working directory, defaults it to `/workspace`, and resolves relative paths from that pointer.
  - The shell subset includes `paste`, `join`, and `column` for common line-merging, key-join, and table-alignment tasks over workspace text files.
  - The shell subset includes a single-command `sed` MVP for common line printing, deletion, substitution, and in-place text edits under `/workspace`.
  - The shell subset includes a basic `file` command that classifies directories plus common text and binary file types under `/workspace`.
  - The shell subset includes a line-based `diff` command with unified-style emulated output for comparing two text files under `/workspace`.
- When a model emits a complete tool call during streaming, generation is interrupted immediately, the tool executes before the turn continues, and the visible transcript folds that tool request/result plus any resumed narration back into the same model response card in the order they occurred instead of rendering separate transcript nodes.
- The active conversation's sidebar kebab menu includes `Edit conversation system prompt`:
  - Set optional per-conversation instructions.
  - `Append after default prompt` is enabled by default; when enabled, the conversation prompt is appended after the conversation's captured default prompt.
  - When `Append after default prompt` is disabled, the conversation prompt replaces the conversation's captured default prompt.
  - The captured default prompt for a conversation does not change after that conversation is created.
- The pre-chat `ChatClaws` panel also exposes conversation prompt editing for the currently selected conversation.
- Each user message and model response includes a copy action; model response copy excludes thought text and preserves the model's original LaTeX source.
- Math-rendered model responses also expose a dedicated `Copy MathML` action for the rendered MathML.
- The Thinking section includes a dedicated copy action to copy thoughts only.
- Keyboard shortcuts cover the primary workspace actions (start/new conversation, help, settings, send/stop, load model, downloads, transcript jumps) plus focused transcript actions (edit, branch, regenerate, fix, copy, and branch/response variant navigation).
- The keyboard shortcuts dialog and `help.html` keep the global and focused transcript shortcut tables aligned, including the `Shift+Enter` composer newline behavior and the setting that can disable single-key transcript shortcuts.
- Composer keyboard behavior uses `Enter` to send and `Shift+Enter` to insert a new line.
- Each model response includes a `Regenerate` button. Regeneration creates a new response variation at that turn, keeps prior variations, and lets users navigate alternatives with left/right controls and an `x/y` indicator.
- Each model response includes a `Fix` button (wrench icon). `Fix` now runs a multi-step orchestration from `src/config/orchestrations/fix-response.json` (critique -> revise -> validate) before streaming a corrected variant at that turn.
- Each user message now supports branch-aware editing controls:
  - `Edit` opens inline editing for that user message.
  - `Save` (floppy icon) commits the edit and removes all later turns on that branch from that point forward.
  - `Branch` (terminal-split icon) opens branch-edit mode at that turn. A sibling user-message branch is only created when `Save` is used with changed text; canceling or saving unchanged text creates no branch.
  - If multiple user branches exist at the same turn, left/right controls and an `x/y` indicator let users switch between those branch variants.

## Supported models

- `onnx-community/Llama-3.2-3B-Instruct-onnx-web` (default)
  - Uses the published `q4f16` web export.
- `onnx-community/Llama-3.2-1B-Instruct-onnx-web-gqa`
  - Uses the published `q4f16` web export.
- `onnx-community/Qwen3-0.6B-ONNX`
  - Uses the model card's WebGPU-recommended `q4f16` runtime.
  - Uses the model card's recommended sampling defaults: temperature `0.6`, top-k `20`, top-p `0.95`.
  - Does not force Qwen thinking mode on by default.
- `LiquidAI/LFM2.5-1.2B-Thinking-ONNX`
  - Uses ONNX `q4` weights.
  - Requires WebGPU for browser inference, so it is unavailable when WebGPU is unavailable or when `WASM only` is selected.
- `onnx-community/gemma-3n-E2B-it-ONNX`
  - Supports text output with image, audio, and video inputs.
  - Image attachments are routed through a multimodal worker path.
  - Audio/video UI is not wired yet.
  - Requires WebGPU in this app.
- Legacy stored IDs are automatically remapped to the supported model:
  - `onnx-community/Llama-3.2-3B-Instruct-ONNX` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
  - `onnx-community/Qwen3.5-2B-ONNX` -> `onnx-community/Qwen3-0.6B-ONNX`
  - `huggingworld/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `onnx-community/gemma-3-1b-it-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `onnx-community/gemma-3-1b-ONNX-GQA` -> `onnx-community/gemma-3n-E2B-it-ONNX`
  - `Xenova/distilgpt2` -> `onnx-community/Llama-3.2-3B-Instruct-onnx-web`
- Model support configuration lives in `src/config/models.json`:
- `models`: options shown in the pre-chat model card picker
- `models[].displayName`: friendly name shown on the card
- `models[].languageSupport`: user-facing language tags shown on the card, with a publisher-linked `and more` suffix when needed
- `models[].repositoryUrl`: model details link used from the card footer
  - `models[].features`: normalized capability flags (`streaming`, `thinking`, `imageInput`, `audioInput`, `videoInput`)
  - `models[].runtime`: per-model runtime hints (`dtype`, optional `enableThinking`, optional `requiresWebGpu`, optional `multimodalGeneration`, optional `useExternalDataFormat`)
  - `models[].generation`: per-model defaults and limits for output/context tokens, temperature, `defaultTopK`, and `defaultTopP`
  - `defaultModelId`: fallback/default selection
  - `legacyAliases`: stored legacy IDs remapped at runtime
- Orchestration definitions are JSON files for transparency:
  - `src/config/orchestrations/rename-chat.json`
  - `src/config/orchestrations/fix-response.json`
  - `src/config/orchestrations/pdf-to-markdown.json`
    - Example document-prep orchestration for future parser-first PDF ingestion
  - Orchestration steps can now be:
    - `prompt` for model-generated text
    - `transform` for deterministic local preparation such as chunking
    - `forEach` for per-item prompt execution over prepared arrays
    - `join` for merging array outputs into a later prompt or final result

## Security notes

- Precise location tool use now shows a one-time awareness prompt before first use. If declined, the app falls back to a coarse location label with no coordinates.
- Transformers.js is bundled from the locally installed package rather than imported from a CDN at runtime.
- Attachment ingestion uses browser-local limits before large files are read into memory:
  - text files: 5 MB max, truncated to 400,000 characters
  - images: 15 MB max, 40,000,000 pixels max
  - PDFs: 20 MB max, truncated to 120,000 characters after extraction
- The app still does not ship with a CSP. This is a documented hardening gap for a future pass.
- Model artifacts are still fetched from upstream repositories at runtime and are not revision-pinned yet. That risk is currently accepted.

See [`docs/security.md`](docs/security.md) for the tracked hardening notes.

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
- Orchestration prompt templating, nested placeholder rendering, utility-step execution, and chunk-pipeline support live in `src/llm/orchestration-runner.js`.
- Transcript and conversation-list DOM rendering live in `src/ui/`.
- `src/main.js` remains the app shell for routing, page-level visibility, and wiring dependencies into those modules.
- See `docs/conversation-domain.md`, `docs/app-state.md`, `docs/app-controller.md`, `docs/orchestrations.md`, and `docs/ui-views.md` for the current boundaries.
- See `docs/tools.md` for current tool-calling behavior plus the planned separation between discrete function calls, MCP capability discovery, and `SKILL.md` playbooks.

## Orchestrations

Orchestrations are JSON-defined, inspectable workflows used for LLM-guided follow-up tasks and document preparation.

- Existing shipped uses:
  - chat renaming
  - response fixing
- Current runtime capabilities:
  - linear prompt steps
  - deterministic utility steps that do not call the model
  - chunk-oriented processing via `transform` -> `forEach` -> `join`
  - nested prompt placeholders such as `{{chunk.text}}`
- Intended design:
  - deterministic code handles extraction and data shaping
  - the orchestration handles semantic conversion or validation
  - parser-first attachment pipelines, including future PDF ingestion, should plug into this model rather than bypass it

See [`docs/orchestrations.md`](docs/orchestrations.md) for the step contract and PDF-preparation example.
