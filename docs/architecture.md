# Architecture

This document tells the architecture story for `browser-llm-runner`.

The app is a static browser application that gives students a chat workspace for running small language models locally where possible. It runs from GitHub Pages, stores user data in the browser, and keeps model work off the UI thread through workers.

## Design Philosophy

This project favors explicit boundaries over framework magic.

The browser is the deployment platform, so the architecture assumes:

- no backend routes
- no server-side rendering
- no secret-bearing client integrations
- hash-based routing
- static assets under a configurable base path
- privacy-preserving local behavior by default

Readable duplication is better than a premature abstraction. Abstractions should exist only when they protect an important boundary: inference runtime, worker protocol, conversation state, browser storage, tool execution, or accessibility-sensitive UI behavior.

## System Shape

At runtime, the app is a set of browser-side layers:

1. Static shell: `index.html`, `public/`, and `src/styles.css`.
2. Application wiring: `src/main.js`.
3. UI controllers and renderers: `src/app/` and `src/ui/`.
4. Domain state and persistence: `src/state/`, `src/memory/`, and `src/workspace/`.
5. Inference boundary: `src/llm/engine-client.js` and `src/llm/engines/`.
6. Worker implementations: `src/workers/`.
7. Configuration: `src/config/`.
8. Tests: `tests/unit/`, `tests/e2e/`, and focused worker tests under `src/workers/`.

The important dependency direction is:

- UI calls app controllers.
- App controllers call state/domain helpers and the engine client.
- The engine client talks to workers.
- Workers talk to browser model runtimes or browser fetch.
- Domain helpers do not depend on DOM, Bootstrap, workers, or storage APIs.

## Data Flow

A typical chat turn flows like this:

1. The user enters text or attaches files in the composer.
2. Attachment preparation normalizes supported files and writes workspace artifacts locally.
3. The app creates or selects a conversation record in browser state.
4. Conversation-domain helpers build structured chat messages for the selected branch.
5. The app controller asks `LLMEngineClient` to initialize the selected model if needed.
6. `LLMEngineClient` selects the configured engine driver and worker.
7. The worker loads or reuses model/runtime resources and streams response deltas.
8. The app controller updates conversation state and transcript rendering incrementally.
9. The status live region announces coarse phases only.
10. Persistence writes the updated browser-local state.

Tool calls add an interruption loop:

1. The controller watches streamed output for a complete model-specific tool call.
2. Generation is interrupted as soon as the call is complete.
3. The tool executes through the local harness or browser-mediated MCP path.
4. The result is stored as a `tool` role message.
5. The controller resumes generation with the tool result available.
6. The transcript folds the request, result, and continuation into the originating model card.

## Major Boundaries

`src/main.js`

Owns bootstrap, DOM references, top-level wiring, persistence hookups, route application, focus coordination, and dependency injection. It is currently too large. Future work should extract cohesive helpers while preserving the shell as the composition root.

`src/state/conversation-model.js` and `src/state/conversation-content.js`

Own pure conversation-domain behavior: conversation records, branches, variants, prompt construction, exports, and normalized message content. These modules must stay DOM-free and storage-free.

`src/state/app-state.js`

Owns runtime state shape and selectors. It should stay boring and predictable. Derived UI decisions belong in selectors rather than repeated ad hoc checks.

`src/state/app-controller.js`

Owns cross-boundary action sequencing: model loading, send, stop, regenerate, fix, rename, tool-call continuation, and orchestration-backed flows. It should not render DOM or reimplement prompt/chunking internals.

`src/ui/`

Owns DOM rendering. View modules should render from state and callback dependencies. They should not own engine lifecycle, persistence, route state, or conversation mutation rules.

`src/app/`

Owns browser-facing controllers: preferences, settings events, composer behavior, transcript navigation, shell events, side panels, viewport layout, and semantic-memory coordination.
Small accessibility-sensitive helpers such as status-region tone and live-region DOM updates also belong here when they are shared by the shell but are not full renderers.
Debug-log state orchestration also belongs here: `src/app/debug-log.js` owns entry normalization, pagination state, and CSV export wiring while `src/ui/debug-log-view.js` owns the rendered markup.
Transcript content orchestration also belongs here: `src/app/transcript-content-renderer.js` owns lazy Markdown loading, MathJax configuration/typesetting, and MathML extraction while `src/ui/transcript-view.js` owns transcript markup.
Message-copy behavior also belongs here: `src/app/message-copy.js` owns clipboard fallback and copy-text assembly while transcript events and shortcuts only trigger the action.
Conversation download behavior also belongs here: `src/app/conversation-downloads.js` owns browser blob downloads, active-branch JSON/Markdown download orchestration, and bulk archive export status while `src/main.js` only wires dependencies.
Conversation sidebar menu behavior also belongs here: `src/app/conversation-menu.js` owns menu open/close state, download submenu toggling, menu capability state, and action focus handoff while `src/app/conversation-list-events.js` only routes DOM events.
Generation settings behavior also belongs here: `src/app/generation-settings.js` owns model generation/Wllama setting normalization, browser-local persistence, help text, and delayed-apply behavior while settings events only report user edits.
Conversation language/thinking behavior also belongs here: `src/app/conversation-language-thinking.js` owns per-conversation language preference state, model thinking toggle state, warning/help text, optional system-prompt feature sections, and computed system prompt previews.
Pre-chat workspace behavior also belongs here: `src/app/pre-chat-workspace.js` owns setup status hints, pre-chat action visibility, agent draft labels, composer visibility, and the small shell selectors around pending conversation type.
Agent automation UI behavior also belongs here: `src/app/agent-automation-ui.js` owns the active-agent pause/resume control, heartbeat countdown text, coarse live-region announcements, and countdown timer lifecycle while `src/app/agent-automation.js` owns the follow-up and summary orchestration workflow.
Orchestration run adapter behavior also belongs here: `src/app/orchestration-runs.js` owns the browser-facing bridge from orchestration prompt steps to one-shot engine generation plus per-step thinking-output cleanup while `src/llm/orchestration-runner.js` owns the step execution contract.

`src/llm/`

Owns engine selection, runtime configuration, prompt/tool helpers, browser fetch helpers, orchestration execution, and model-facing contracts. UI code should use the engine client boundary, not worker-specific APIs.

`src/workers/`

Owns heavy runtime work and protocol handling. Worker code should keep messages explicit, cancellable, and testable with mocked browser/model dependencies.

`src/config/`

Owns declarative runtime catalogs and built-in orchestration definitions. Configuration should be validated or normalized before it affects runtime behavior.

## External Dependencies

Important browser/runtime dependencies enter through documented boundaries:

- Transformers.js: local ONNX model runtime.
- `wllama`: local GGUF CPU/WASM runtime.
- ONNX Runtime Web assets: bundled browser execution support.
- OpenAI-compatible endpoints: optional user-configured remote model path.
- MCP HTTP endpoints: optional user-configured tool integration path.
- Pyodide CDN assets: browser-local Python runtime path.
- Hugging Face model artifacts: pinned model downloads at runtime.
- Bootstrap and Bootstrap Icons: UI framework and icon set.
- MathJax and Markdown rendering: transcript presentation.
- xterm: read-only shell terminal view.

New external dependencies should be added only when the existing stack cannot reasonably solve the problem and the maintenance cost is documented.

## State and Storage

Browser-local state is split by purpose:

- `localStorage`: simple preferences such as selected model/backend and UI settings.
- IndexedDB: larger or structured records such as conversations, semantic memory, skills, cloud providers, and cloud-provider secrets.
- Cache/engine-managed storage: downloaded model artifacts.
- OPFS-backed workspace abstractions: conversation-local file artifacts used by attachments and tools.

Do not bypass the storage abstraction for a feature just because the raw browser API is easy to reach. Storage code must preserve privacy, cleanup, export, and failure behavior.

## Accessibility Architecture

Accessibility is part of the architecture, not a polish pass.

Current commitments:

- The transcript is not an `aria-live` streaming region.
- Coarse status changes use separate polite status regions.
- Keyboard actions and skip links are route-safe.
- Dialogs and panels must restore focus intentionally.
- Icon-only buttons require accessible names.
- UI changes require a11y tests for affected paths.

Future refactors should extract reusable accessibility helpers only when repeated behavior is already clear. Do not hide focus movement in generic utilities that make user flow hard to trace.

## Where Risk Is Concentrated

Higher-risk areas include:

- worker lifecycle and cancellation
- prompt construction and conversation branch state
- tool-call parsing and execution
- browser-local file operations
- cloud-provider secret storage
- MCP/proxy/browser fetch paths
- Markdown/MathJax rendering of model output
- model catalog changes and runtime compatibility
- route/focus behavior around settings, dialogs, and mobile panels

These areas need stronger tests and more explicit docs than low-risk display code.

## Current Maintenance Debt

The app already has useful boundaries, but several modules still mix too many concerns.

Target extraction order:

1. Move remaining `src/main.js` helpers into named app modules by responsibility.
2. Split `src/llm/shell-command-tool.js` into parser, path safety, command registry, and command implementations.
3. Split `src/llm/tool-calling.js` into prompt building, detection/parsing, built-in executors, MCP helpers, and skill helpers.
4. Split `src/styles.css` by shell, transcript, settings, model picker, terminal, and responsive rules.
5. Split large test files to match the new module boundaries.

Refactors should be behavior-preserving unless a behavior change is explicitly called out and tested.

## What Is Intentionally Not Built

The app intentionally does not include:

- a backend API
- server-side routing
- server-stored user conversations
- default remote inference
- telemetry that captures prompts or model outputs
- committed model weights
- broad shell access outside the browser-local workspace
- OAuth-based MCP integrations

Adding any of these would change the project contract and requires explicit approval plus documentation updates.
