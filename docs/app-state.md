# App State

Runtime state is now centralized in `src/state/app-state.js`.

## Purpose

This module defines the single mutable `AppState` object used by the application shell.

It also provides derived selectors for:

- active conversation lookup
- conversation selection checks
- pre-chat and pending-new-conversation visibility
- pre-chat composer disabling
- current route/view resolution

## Why this change matters

Previously, `src/main.js` kept many separate file-level mutable variables.
That made unrelated features easy to couple accidentally because state was spread across the file.

Centralizing them in one object gives the app:

- a single runtime state source
- selector-based reads for derived behavior
- better testability for transitions and visibility logic

One important state bit is whether the workspace is explicitly preparing a new conversation.
That keeps the app in the pre-chat model-selection view without creating or persisting a draft conversation record until the first message is actually sent.

Another is the pending attachment-operation counter.
That lets the shell disable send and attachment controls while uploads are still being normalized, hashed, or written into `/workspace`, so a message cannot be submitted before its selected files are actually ready.

The same centralized state also now carries uploaded skill-package metadata so the settings UI, prompt builder, and local tool harness all resolve the same browser-local skill inventory.

It now also carries browser-saved cloud-provider metadata so the settings accordions, shared model picker, and remote engine runtime all resolve the same selected OpenAI-compatible provider/model inventory.

## Current boundary

- `src/state/app-state.js`
  - state shape
  - selectors
- `src/state/app-controller.js`
  - action sequencing and async lifecycle updates
- `src/app/composer-runtime.js`
  - pending attachment rendering, payload shaping, and attachment filtering/status text
- `src/app/agent-automation.js`
  - agent heartbeat scheduling
  - agent follow-up orchestration
  - agent-thread summary compaction before send
- `src/app/workspace-side-panels.js`
  - terminal/web-lookup panel session shaping and visibility control
- `src/main.js`
  - top-level DOM wiring, browser events, and persistence hookup
