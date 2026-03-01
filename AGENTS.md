# AGENTS.md

Purpose: Give coding agents the minimum reliable context to build, test, and change this repo safely.
Project: A student-facing, in-browser chat app that runs small language models locally using WebGPU (preferred) with CPU fallback, deployed as a static site on GitHub Pages.
Accessibility target: WCAG 2.1 AA (non-negotiable).

## 0) Prime directives

1. Static-site constraint: Everything must be deployable to GitHub Pages (static hosting). No backend. No server routes. No SSR.
2. Accessibility constraint: Do not break WCAG 2.1 AA behaviors (keyboard, screen reader, contrast, errors).
3. Privacy constraint: Prompts and outputs stay local by default. No telemetry capturing user text.
4. Reliability constraint: If streaming generation exists, cancellation must exist and be tested.
5. Keep diffs small and testable. Separate refactors from behavior changes.

## 1) Agent operating rules

Agents must:

* Read AGENTS.md, README.md, and docs/ before major edits.
* Prefer incremental commits and minimal surface-area changes.
* Keep architecture boundaries: UI must not directly call runtime-specific model APIs.
* Update docs when changing behavior, constraints, or deployment assumptions.

Agents must not:

* Add secrets, API keys, or any credential-bearing integration to client code.
* Add remote inference “shortcuts” unless explicitly approved and documented (default is local inference).
* Commit large model binaries to Git.
* Disable tests/a11y checks to “make things pass.”

## 2) Deployment constraint: GitHub Pages (hard requirement)

All work must result in a static build:

* Output must be HTML/CSS/JS (and optional WASM/assets) that runs entirely in the browser.
* Build output folder (commonly `dist/`) must be publishable to GitHub Pages.
* The app must work when hosted under a repo subpath:

  * `https://<user>.github.io/<repo>/`
* Configure bundler base/public path accordingly (do not assume `/` root).
* Routing:

  * Prefer hash routing if client-side routing is used.
  * If history routing is used, include a documented 404 fallback strategy and test it.

## 3) Tech stack (assumptions + constraints)

* Language: TypeScript preferred if bundled to browser JavaScript at build time.

  * `pnpm build` must compile TS into static assets deployable to GitHub Pages.
  * If JavaScript is used, add JSDoc types for public interfaces and keep linting strict.
* Build tooling: Use a frontend bundler that produces deterministic static output (e.g., Vite).

  * `build` emits a deployable directory with only static files.
  * Avoid runtime dependencies requiring Node in the browser.
* UI/UX: Bootstrap 5 is the standard UI framework.

  * Use Bootstrap components and utility classes for layout/styling.
  * Do not introduce additional UI frameworks/component libraries unless explicitly approved (“ask-first”).
  * Prefer native elements for controls; Bootstrap styling must not replace semantics.
* Model runtime (browser-only):

  * Preferred execution: WebGPU.
  * Fallback execution: CPU (WASM or equivalent), still functional.
  * Engine selection must be explicit and testable (capability detection + user override).
* Concurrency:

  * Heavy work (download/init/inference) should run in Web Workers when feasible.
  * UI thread remains responsive; streaming output is expected.
* Accessibility tooling (required for UI changes):

  * Linting: ESLint plus appropriate a11y rules for the chosen UI approach.
  * Automated checks: axe-core (or equivalent) in `pnpm test:a11y` for key screens/components.
* Security/privacy:

  * No embedded secrets or API keys.
  * No remote inference by default.
  * No analytics/telemetry capturing prompts or model output.

## 4) Required npm scripts (create if missing)

Agents should ensure package.json contains scripts equivalent to:

* install: `pnpm install`
* dev: `pnpm dev`
* build: `pnpm build`
* preview: `pnpm preview`
* lint: `pnpm lint`
* format: `pnpm format`
* typecheck: `pnpm typecheck`
* test: `pnpm test`
* test:e2e: `pnpm test:e2e`
* test:a11y: `pnpm test:a11y`

Minimum gate before PR:

* lint + typecheck pass
* unit tests pass
* a11y tests pass for affected screens
* e2e smoke passes for “chat → response → stop generation”
* GitHub Pages build works under repo subpath base path

## 5) Architecture rules (do not violate)

5.1 Engine abstraction (required)
All inference must go through a single abstraction (example naming; keep consistent):

* `LLMEngine` interface

  * `WebGPUEngine` implementation
  * `CPUEngine` implementation

UI must not call runtime-specific APIs directly. UI talks to the engine layer only.

5.2 Worker boundary (strongly preferred; required for heavy inference if feasible)

* Model loading, initialization, and token generation should run in a Worker.
* Main thread: rendering, input, focus management, announcements, and state display.

5.3 Streaming contract (required)

* UI must display streaming output incrementally for responsiveness.
* Accessibility announcements must not stream token-by-token (see live region rules).

5.4 Cancellation contract (required)
If generation streams, provide:

* A visible “Stop generating” control (keyboard accessible, labeled)
* A cancellation mechanism (AbortController or equivalent) that stops worker generation
* Cleanup of partial generation state and UI reset (status, buttons, focus)

5.5 Deterministic UI behavior
Avoid timing hacks. Focus changes must be explicit and tested.

## 6) Accessibility (WCAG 2.1 AA) requirements

These are hard constraints.

6.1 Keyboard access

* All interactive controls reachable by Tab/Shift+Tab.
* No keyboard traps.
* Visible focus indicator must exist (don’t remove outlines without replacement).
* Escape closes dialogs/panels/popovers and returns focus to a sensible trigger.

6.2 Semantics and labeling

* Use native elements: `button`, `input`, `textarea`, `select`, `a`.
* Every control has an accessible name (label, `aria-label`, or `aria-labelledby`).
* Icon-only buttons must have an accessible name.
* Form validation errors must be programmatically associated with inputs.

6.3 Chat transcript requirements

* Transcript is a structured region (list/feed) with clear message boundaries.
* Each message indicates speaker (“User”, “Model”) in markup.
* Provide landmarks/labels: “Chat transcript”, “Message input”, “Model settings”.
* Provide a clear “Stop generating” control that is reachable and works.

6.4 Live region strategy (no token spam)

* Do not set the transcript to `aria-live` for token streaming.
* Provide a separate status region:

  * `aria-live="polite"` for coarse updates: loading, ready, generating, complete, stopped, error.
* If any announcement of content is needed, announce in chunks or on completion, not per token.

6.5 Contrast and non-color cues

* Text and controls must meet WCAG 2.1 AA contrast.
* Don’t encode meaning by color alone (errors must have text and programmatic cues).

6.6 Reduced motion

* Respect `prefers-reduced-motion`.
* Avoid essential animations.

6.7 Errors and recovery

* Errors must be actionable (“Try CPU mode”, “Clear downloaded models”, “Retry download”).
* Don’t strand users after a failure; provide a clear next step.

## 7) Model distribution, caching, and storage

7.1 Model weights policy

* Do not commit large binaries/weights to Git.
* Use one documented strategy:

  * Download at runtime from pinned URLs, or
  * GitHub Releases assets, or
  * Hosted artifacts with pinned versions
* Document supported models and expected size/requirements in `docs/models.md`.

7.2 Caching controls (required if caching exists)
If storing model files locally (recommended):

* Use IndexedDB or Cache Storage.
* Provide:

  * progress indicators for download/init
  * clear “Clear downloaded models” control
  * warnings about storage size where feasible

7.3 Privacy

* Prompts/outputs local by default.
* No logging of user text in analytics.
* If debug logs exist, redact prompt/content by default.

## 8) Dependency policy

Allowed:

* Bootstrap 5
* Testing and accessibility tooling (axe, Playwright/Cypress, lint rules)
* Small utilities that improve correctness/accessibility without bloating the bundle

Ask-first (must be called out in PR description with justification):

* Any additional UI framework or component library beyond Bootstrap
* Any major state management change
* Any new model runtime/engine swap
* Any new network service, telemetry, or user tracking
* Anything that significantly increases bundle size

Never:

* Secrets in client code
* Remote inference by default
* Multiple competing UI frameworks
* Committing large model binaries to Git history

## 9) Testing requirements

9.1 Unit tests

* Test engine abstraction and state logic without real model weights.
* Mock the engine interface; do not require WebGPU for unit tests.

9.2 E2E tests (recommended; required for key flows)
Cover:

* Load app → select model → send message → receive streamed response
* Stop generating
* CPU fallback path (simulate WebGPU unavailable)
* Keyboard-only navigation through model picker, transcript, input, send, stop, settings

9.3 A11y tests (required for UI changes)

* Run axe-core checks on key screens.
* Add regression checks for:

  * focus order
  * dialog open/close focus restoration
  * accessible names on core controls
  * status live region updates (coarse, not spammy)

9.4 Manual verification note (required for UI PRs)
In PR description, include a brief checklist of what you verified:

* Keyboard tab order and Escape behavior
* Screen reader transcript readability and status announcements
* Stop-generation control works and returns UI to ready state

## 10) Performance requirements

* Keep heavy work off main thread when feasible.
* Avoid long tasks during model init; show progress and allow cancellation where possible.
* Clean up resources when switching models or clearing cache.
* Avoid memory leaks; do not retain full token history unnecessarily.

## 11) Documentation requirements

If you change behavior, update:

* README.md for user-visible changes and GitHub Pages deployment notes (base path, routing mode)
* docs/ for:

  * model support and distribution
  * engine selection (WebGPU/CPU) and fallback behavior
  * accessibility patterns (live region strategy, focus management)

## 12) Suggested repo structure (keep accurate; update if different)

Typical layout:

* src/

  * ui/            UI components/pages
  * a11y/          focus management, aria helpers, live-region utilities
  * llm/           engine abstraction, model loading, streaming orchestration
  * workers/       Worker entrypoints and message protocol
  * state/         application state/store
* public/          static assets
* docs/            documentation
* .github/         workflows/templates (edit cautiously)

Never edit:

* dist/, build/, coverage/, node_modules/ (generated)

## 13) PR checklist (treat failures as high severity)

* GitHub Pages deployability: build outputs static assets; base path works under repo subpath
* Accessibility: keyboard-only works; focus visible; labels correct; live region not spammy
* Correctness: engine abstraction used; WebGPU and CPU paths both functional
* Reliability: cancellation works; errors actionable; recovery path exists
* Security/privacy: no secrets; no prompt logging; no surprise network calls
* Tests: updated/added as needed; a11y checks included for UI changes
* Docs: updated where contributors/users would otherwise be confused

## 14) Optional subdirectory overrides

If needed, add smaller AGENTS.md files in subfolders:

* src/llm/AGENTS.md for engine/runtime and worker protocol specifics
* src/ui/AGENTS.md for Bootstrap usage and a11y patterns
* src/workers/AGENTS.md for cancellation/message schema

Overrides must not contradict this top-level file.
