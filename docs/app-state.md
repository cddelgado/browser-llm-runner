# App State

Runtime state is now centralized in `src/state/app-state.js`.

## Purpose

This module defines the single mutable `AppState` object used by the application shell.

It also provides derived selectors for:

- active conversation lookup
- conversation selection checks
- pre-chat composer disabling
- current route/view resolution

## Why this change matters

Previously, `src/main.js` kept many separate file-level mutable variables.
That made unrelated features easy to couple accidentally because state was spread across the file.

Centralizing them in one object gives the app:

- a single runtime state source
- selector-based reads for derived behavior
- better testability for transitions and visibility logic

## Current boundary

- `src/state/app-state.js`
  - state shape
  - selectors
- `src/state/app-controller.js`
  - action sequencing and async lifecycle updates
- `src/main.js`
  - DOM wiring, browser events, and persistence hookup
