# App Controller

The app control layer now lives in `src/state/app-controller.js`.

## Purpose

This module coordinates application actions that cross boundaries between:

- conversation state
- the engine client
- orchestration execution
- persistence triggers
- UI refresh callbacks

It currently owns the control flow for:

- engine initialization and deferred model loading
- explicit unload-before-reload behavior when model/backend selection changes
- generation start and stop
- regenerate and fix actions
- automatic rename orchestration
- coordination points where UI actions trigger orchestration-backed preparation or follow-up flows

## Boundary

`app-controller.js` is not a DOM-rendering module.
It receives dependencies and callbacks from `src/main.js`, then drives state transitions through those injected functions.

That means:

- `src/main.js` still owns elements, focus, routing, and rendering details
- `src/state/app-controller.js` owns action sequencing and async lifecycle behavior
- `src/llm/orchestration-runner.js` owns orchestration step execution, prompt templating, utility-step execution, and chunk-pipeline support

## Current orchestration relationship

Today the controller directly uses orchestration flows for:

- rename-chat
- fix-response

The orchestration runtime itself is broader than those two current call sites.
It now supports:

- prompt steps
- deterministic utility steps (`transform`, `join`)
- per-item prompt loops (`forEach`)

That broader runtime is intended to support future parser-first document-prep flows, such as attachment conversion, without moving semantic transformation logic into the controller.

The controller should remain responsible for:

- deciding when an orchestration runs
- keeping UI state, status text, and persistence in sync around that run
- passing prepared inputs into the orchestration runner

The controller should not become the place where chunking rules, prompt assembly internals, or document-conversion step sequencing are reimplemented.

## Testing intent

Controller tests should focus on action behavior and state transitions, not rendered markup.

Examples:

- initialization success/failure state transitions
- stop-generation cleanup
- rename/fix orchestration sequencing
- orchestration-backed preparation flow state transitions when new call sites are added
- deferred model loading before first generation
