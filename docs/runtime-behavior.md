# Runtime Behavior

This document describes the app behavior that crosses UI, state, storage, worker, and model-runtime boundaries.

Use this when changing user-visible chat behavior. Use the more focused docs for model catalog schema, engine selection, tools, state, or rendering details.

## Startup and Routing

- The app is a static, hash-routed browser app.
- `#/` shows the launch/setup screen.
- `#/chat` shows the pre-chat workspace with no selected saved conversation.
- `#/chat/new-agent` shows the pre-chat agent setup flow.
- `#/chat/<uuid>` shows a saved conversation.
- `#/chat/settings` shows Settings.
- `#/chat/<uuid>/system-prompt` shows the active conversation prompt editor.
- Browser back/forward should follow visible screen transitions without requiring server routes.

The app must continue to work under a GitHub Pages repository subpath. Routing changes should run the base-path Playwright smoke test.

## Conversation Startup

- `Start a conversation` opens the chat workspace without loading a model.
- The selected model starts loading only when the first message is sent.
- If no active conversation exists, the first send creates an untitled conversation.
- New conversations get a UUID route only after the first prompt is sent.
- `New Conversation` returns to the pre-chat model picker without immediately creating a sidebar item.
- `New Agent` returns to a matching pre-chat flow with agent name and personality fields.
- Each conversation stores its own selected model and prompt settings.
- Switching conversations does not unload the current worker until the next send needs a different model.

## Model Loading and Generation

Inference always goes through the engine-client boundary. UI code must not call runtime-specific APIs directly.

Current engine paths:

- Transformers.js worker path for bundled ONNX models.
- `wllama` worker path for bundled GGUF models.
- OpenAI-compatible worker path for user-configured or app-managed cloud models.

Local models prefer WebGPU when supported and use CPU/WASM only where the selected model and runtime allow it. Cloud models ignore the local backend selector and use browser fetch from the OpenAI-compatible worker path.

During load and generation:

- Heavy model work runs in workers.
- Model load progress is visible.
- Streaming output updates the visible model response incrementally.
- Status live-region updates stay coarse and polite.
- The transcript itself is not an `aria-live` token stream.
- `Stop generating` must remain visible, keyboard reachable, and wired to cancellation.

## Cancellation and Recovery

Streaming generation must support cancellation across:

- normal local generation
- slow CPU/WASM first-token waits
- automatic WebGPU-to-CPU recovery
- tool-call interruption and continuation
- OpenAI-compatible remote streaming
- `wllama` completion streams
- orchestration-backed generation

When cancellation succeeds, the UI should return buttons, status, and focus to a usable ready state. If a worker stops reporting activity, the engine client should time out and surface an actionable recovery message instead of leaving the interface stuck.

## Settings Behavior

Settings are browser-local. Important panels include:

- `System`: backend preference, CPU thread hints, and downloaded-model cache clearing.
- `Conversation`: transcript view, math rendering, shortcuts, export, and delete-conversation controls.
- `Tools`: built-in tool enablement and tool-prompt exposure.
- `Proxy`: optional validated CORS proxy configuration.
- `MCP Servers`: browser-reachable MCP HTTP endpoint import and command enablement.
- `Cloud Providers`: OpenAI-compatible provider setup, saved API-key handling, model toggles, thinking/tool controls, generation defaults, and browser-local request caps.
- `Skills`: local `.zip` skill package import, preview, enablement, and removal.
- `Orchestrations`: custom orchestration authoring, import/export, and read-only app-managed definitions.
- `Debug`: user-visible runtime diagnostics.

Settings changes that affect model behavior, storage, routing, accessibility, or external network surfaces should update the relevant focused docs.

## Tools and Orchestrations

Tool calling is opt-in and model-aware.

- Built-in tools are exposed only when enabled and when the selected model supports the relevant prompt format.
- Disabled tools and disabled MCP commands are omitted from the computed system prompt and rejected if called.
- MCP servers and commands start disabled.
- Tool results use compact envelopes with `status`, `body`, and `message` fields where practical.
- Shell and file tools stay inside the browser-local `/workspace` abstraction.

When a complete tool call is detected during streaming, generation is interrupted, the tool executes, and generation can resume with the tool result available. The transcript folds the request, result, and continuation into the originating model card.

Orchestrations are JSON-defined workflows for inspectable multi-step model tasks. Deterministic parsing and chunking should stay in code; semantic conversion or review can live in orchestration steps.

See `docs/tools.md` and `docs/orchestrations.md` for the detailed contracts.

## Attachments and Workspace

Attachments are prepared locally before send. While a file is being read, converted, hashed, or stored, send and attachment controls stay disabled.

Current attachment behavior:

- Text files are size-limited and truncated before entering model context.
- Images are size- and pixel-limited.
- Audio uploads are decoded locally when the selected model supports audio input.
- PDFs are extracted in a worker with parser-derived text only; OCR is not available.
- Every uploaded attachment is also written into the browser-local workspace behind a `/workspace/...` path.

Attachment parsing should not live in pure conversation-domain code. Workspace tools should use the workspace filesystem abstraction rather than raw OPFS handles.

## Browser Storage

The app uses browser-local storage by purpose:

- `localStorage` for small preferences.
- IndexedDB for conversations, semantic memories, skills, cloud providers, request caps, and custom orchestrations.
- Dedicated IndexedDB records for cloud-provider API keys, encrypted with WebCrypto when available.
- Engine/runtime caches for downloaded model files.
- OPFS-backed workspace storage for conversation artifacts and tool-accessible files.

User prompts, outputs, and uploaded content stay local by default unless the user explicitly configures a remote provider or MCP endpoint.

## Help and Keyboard Behavior

The app exposes `help.html` and a keyboard-shortcuts dialog. Keep those aligned with actual shortcuts when changing composer, transcript, settings, or focused-message behavior.

Important keyboard behavior:

- `Enter` sends from the composer.
- `Shift+Enter` inserts a newline.
- Escape closes dialogs/panels or cancels inline edits where appropriate.
- Transcript actions expose keyboard shortcuts only when the relevant message action is available.

## Current Known Runtime Gaps

Known accepted risks remain documented in `docs/security.md` and `docs/failure-model.md`. Current notable gaps include:

- No Content Security Policy yet.
- Some runtime assets are fetched from pinned external providers.
- Browser-only cloud-provider secret storage is imperfect.
- Several modules remain large and should be refactored with characterization tests first.

