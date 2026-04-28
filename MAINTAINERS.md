# Maintainers

This file is the maintainer map for `browser-llm-runner`.

The repo is a student-facing browser chat app. It must stay static-site deployable, privacy-preserving by default, accessible to WCAG 2.1 AA, and understandable to humans who did not generate the code.

## Reading Order

Before a non-trivial change, read these in order:

1. `AGENTS.md` for hard project constraints.
2. `GUIDANCE.md` for the human-maintenance standard.
3. This file for the maintainer workflow.
4. `README.md` for user-facing behavior and scripts.
5. The relevant focused docs under `docs/`.

For most code changes, the focused docs are:

- `docs/architecture.md`
- `docs/conventions.md`
- `docs/failure-model.md`
- `docs/change-guide.md`
- the subsystem doc for the area being changed

## Maintainer Compass

These constraints outrank convenience:

- The app deploys as a static GitHub Pages site. Do not add backend assumptions.
- User prompts and model outputs stay local by default. Do not add telemetry that captures user text.
- UI changes must preserve WCAG 2.1 AA behavior.
- Streaming generation requires visible, keyboard-accessible cancellation.
- UI code must not call runtime-specific model APIs directly.
- Browser-hostile assumptions are bugs: root-relative paths, unavailable WebGPU, blocked CORS, storage failures, and slow CPU inference must be handled deliberately.

## Current State

The repo has strong feature coverage and a healthy automated gate:

- Vite static build with configurable base path.
- Unit tests for state, engine, tool, storage, and UI modules.
- Playwright smoke, base-path, mobile, and accessibility coverage.
- Separate engine workers for local and OpenAI-compatible model paths.
- Existing subsystem docs for models, engine selection, tool calling, UI views, state, and security.

The main maintenance issue is legibility. Several files are still too broad for comfortable human review, especially:

- `src/main.js`
- `src/llm/shell-command-tool.js`
- `src/llm/tool-calling.js`
- `src/styles.css`
- `tests/unit/tool-calling.test.js`

Future work should reduce those files by extracting cohesive modules behind stable facades, not by moving code randomly.

## Documentation Map

- `README.md`: front door, project summary, scripts, and links.
- `AGENTS.md`: hard constraints for agents and contributors.
- `GUIDANCE.md`: general standard for human-maintainable generated software.
- `MAINTAINERS.md`: repo-specific maintainer workflow and current direction.
- `docs/architecture.md`: architecture story and target shape.
- `docs/conventions.md`: local coding, documentation, UI, state, and test conventions.
- `docs/operations.md`: install, run, test, troubleshoot, reset, and deploy.
- `docs/runtime-behavior.md`: user-visible chat, settings, storage, tool, and cancellation behavior that crosses subsystem boundaries.
- `docs/failure-model.md`: how the app can fail and how maintainers should recover.
- `docs/change-guide.md`: common change paths.
- `docs/maintainer-faq.md`: practical answers for future maintainers.

Subsystem docs:

- `docs/app-controller.md`
- `docs/app-state.md`
- `docs/conversation-domain.md`
- `docs/engine-selection.md`
- `docs/models.md`
- `docs/orchestrations.md`
- `docs/security.md`
- `docs/semantic-memory.md`
- `docs/tools.md`
- `docs/ui-views.md`
- `docs/web-search-hypothesis.md`

## Change Workflow

Before editing:

- Identify the smallest behavior boundary that owns the change.
- Read the docs for that boundary.
- Check whether the change touches UI, model runtime, storage, tools, or deployment.
- Decide what must be tested before implementation.

While editing:

- Prefer small, reviewable diffs.
- Keep behavior changes separate from mechanical refactors where practical.
- Preserve existing public exports until tests and callers are updated.
- Add or update docs in the same change when behavior, assumptions, configuration, commands, or architecture move.

Before finishing:

- Run the focused tests for the changed area.
- For broad changes, run `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- For UI changes, run `pnpm test:a11y` and the relevant Playwright smoke test.
- For routing/deployment changes, run the base-path smoke test.

## Human Review Note

Substantial changes should leave a short review note that answers:

- What changed?
- Why was this shape chosen?
- What assumptions were made?
- Which files matter most in review?
- What tests ran?
- What risks remain?
- Which docs changed?

## Refactor Direction

The next maintainability phase should be characterization first, extraction second.

Good refactors for this repo:

- Preserve user-visible behavior.
- Introduce one stable boundary at a time.
- Move tests with the code when test files are split.
- Add docs that explain why the new boundary exists.

Bad refactors for this repo:

- Large renames mixed with behavior changes.
- New abstractions without a specific maintenance problem.
- Moving DOM, state, worker, and persistence concerns into a single "service" because it looks cleaner.
- Introducing a framework to hide complexity instead of reducing it.
