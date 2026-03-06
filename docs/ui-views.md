# UI Views

Rendering-heavy DOM code is now split into small view modules under `src/ui/`.

## Current modules

- `src/ui/transcript-view.js`
  - transcript message rendering
  - per-message DOM updates for model and user rows
  - transcript empty state
- `src/ui/conversation-list-view.js`
  - conversation sidebar list rendering

## Boundary

These modules render and update DOM only.

They do not own:

- engine lifecycle
- persistence
- route state
- conversation mutation rules

Those responsibilities remain in:

- `src/state/conversation-model.js`
- `src/state/app-controller.js`
- `src/main.js`

## Testing intent

View tests should validate rendered structure and state-driven visibility/labels with JSDOM.
They should avoid engine or orchestration behavior.
