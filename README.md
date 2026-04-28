# browser-llm-runner

Student-facing browser chat UI with local model inference.

The app is built for students who need a browser-based chat workspace that can run small language models locally where possible. It is deployed as a static GitHub Pages site, uses WebGPU when available, falls back to browser CPU/WASM paths where supported, and keeps prompts and outputs local by default unless a user explicitly configures a remote provider.

## Project constraints

- Static hosting only: no backend routes, no SSR, no server deployment assumptions.
- GitHub Pages compatible: the build must work under a repository subpath such as `/browser-llm-runner/`.
- Accessibility target: WCAG 2.1 AA.
- Privacy default: no telemetry that captures prompts, outputs, or uploaded content.
- Runtime boundary: UI code talks through the engine client, not directly to runtime-specific model APIs.
- Streaming reliability: any streaming generation path must have a visible, keyboard-accessible stop control.

## Quick start

Install dependencies:

```sh
pnpm install
```

Run the development server:

```sh
pnpm dev
```

Build the static site:

```sh
pnpm build
```

Preview the build:

```sh
pnpm preview
```

Run the usual verification gate:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

For UI changes, also run:

```sh
pnpm test:a11y
pnpm test:e2e
```

For detailed local operation, reset, troubleshooting, and deployment notes, see [`docs/operations.md`](docs/operations.md).

## Maintainer orientation

This repo now treats human maintainability as part of the definition of done. Before non-trivial code changes, read:

- [`AGENTS.md`](AGENTS.md) for hard project constraints.
- [`GUIDANCE.md`](GUIDANCE.md) for the general human-maintenance standard.
- [`MAINTAINERS.md`](MAINTAINERS.md) for the repo-specific maintainer workflow and current refactor direction.
- [`docs/architecture.md`](docs/architecture.md) for the architecture story and target shape.
- [`docs/conventions.md`](docs/conventions.md) for local coding and documentation conventions.
- [`docs/runtime-behavior.md`](docs/runtime-behavior.md) for user-visible behavior that crosses subsystem boundaries.
- [`docs/failure-model.md`](docs/failure-model.md) for known failure surfaces and recovery expectations.
- [`docs/change-guide.md`](docs/change-guide.md) for common change paths.
- [`docs/maintainer-faq.md`](docs/maintainer-faq.md) for practical maintainer questions.

The README should stay a front door. Detailed behavior, architecture, failure, and change-path documentation should live in focused docs and be linked from here.

## Runtime Overview

The app starts on a launch screen and moves into a hash-routed chat workspace. It does not load a model until the first message is sent. Conversation routes, settings routes, and help pages must work under a GitHub Pages repository subpath.

Inference runs through the engine-client boundary. Bundled local models use worker-backed Transformers.js or `wllama` paths; configured cloud models use the OpenAI-compatible worker path only after the user configures a provider. Streaming responses update the transcript incrementally, while a separate polite status region announces coarse progress and errors.

For the full user-visible runtime story, see [`docs/runtime-behavior.md`](docs/runtime-behavior.md). For focused subsystem details, see:

- [`docs/engine-selection.md`](docs/engine-selection.md) for WebGPU/CPU/cloud selection and fallback behavior.
- [`docs/models.md`](docs/models.md) for the model catalog and supported-model checklist.
- [`docs/tools.md`](docs/tools.md) for built-in tools, MCP behavior, and the browser-local shell subset.
- [`docs/orchestrations.md`](docs/orchestrations.md) for app-managed and user-authored orchestration flows.
- [`docs/conversation-domain.md`](docs/conversation-domain.md) for conversation trees, branches, exports, and prompt shaping.
- [`docs/ui-views.md`](docs/ui-views.md) for transcript, settings, help, and accessibility-facing view conventions.

## Supported Models

The bundled local model catalog and its browser-safe limits live in `src/config/models.json`. App-managed cloud provider defaults live in `src/config/cloud-models.json`, and user-added OpenAI-compatible providers are stored in this browser.

Model behavior changes should update [`docs/models.md`](docs/models.md) and, when backend behavior changes, [`docs/engine-selection.md`](docs/engine-selection.md). Do not commit model weights.

## Security Notes

The app is privacy-preserving by default: prompts, model outputs, conversations, and uploaded files stay browser-local unless the user explicitly configures a remote cloud provider or MCP endpoint.

Tracked security posture and accepted risks live in [`docs/security.md`](docs/security.md) and [`docs/failure-model.md`](docs/failure-model.md). Current notable risks include the lack of a CSP, pinned external runtime/model assets, browser-only cloud-provider secret storage, and user-configured network surfaces for cloud providers, proxies, and MCP servers.

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm preview`
- `pnpm lint`
- `pnpm format`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm test:a11y`

## Architecture Notes

`src/main.js` is the composition root. Browser-facing controllers live in `src/app/`, DOM renderers in `src/ui/`, conversation/state logic in `src/state/`, model/runtime boundaries in `src/llm/`, and worker entrypoints in `src/workers/`.

The detailed architecture story and current refactor direction are in [`docs/architecture.md`](docs/architecture.md). The most important current maintainability investments are still behavior-preserving extraction of `src/main.js`, `src/llm/shell-command-tool.js`, `src/llm/tool-calling.js`, `src/styles.css`, and the largest matching test files.

## Orchestrations

Orchestrations are JSON-defined, inspectable workflows used for LLM-guided follow-up tasks and document preparation.

- Existing shipped uses:
  - chat renaming
  - response fixing
  - agent follow-up heartbeats
  - agent-context summarization
  - user-authored slash-command workflows saved in browser storage
- Current runtime capabilities:
  - linear prompt steps
  - deterministic utility steps that do not call the model
  - chunk-oriented processing via `transform` -> `forEach` -> `join`
  - nested prompt placeholders such as `{{chunk.text}}`
- User-facing orchestration controls:
  - `Settings -> Orchestrations` lets users create, save, import, export, and remove custom orchestrations in this browser
  - the custom-orchestration editor now includes a structured step list for adding/removing/editing steps without hand-writing every JSON property, while still exposing the raw JSON definition for advanced edits
  - app-managed orchestrations are listed separately in the same settings tab and remain read-only
- Intended design:
  - deterministic code handles extraction and data shaping
  - the orchestration handles semantic conversion or validation
  - parser-first attachment pipelines, including future PDF ingestion, should plug into this model rather than bypass it

See [`docs/orchestrations.md`](docs/orchestrations.md) for the step contract and PDF-preparation example.
