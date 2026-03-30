# Conversation Domain

The conversation tree logic now lives in `src/state/conversation-model.js`.

## Purpose

This module is the pure domain layer for:

- creating conversation records
- storing the selected model for each conversation
- adding user/model messages to the tree
- preserving structured user content parts for attachments, including text-backed file parts and their LLM-facing representation
- resolving the visible branch and variant navigation state
- pruning descendants after user edits
- building structured prompts for inference
- building conversation export payloads and Markdown output
- preserving model-emitted tool calls and `tool` role execution results

It must not depend on:

- DOM APIs
- Bootstrap
- worker lifecycle
- `localStorage` or IndexedDB

## Why this boundary exists

Previously, most of this logic lived inside `src/main.js`, mixed with rendering and event handlers.
That made branch behavior, export behavior, and prompt construction harder to test in isolation.

Keeping this logic pure allows focused unit tests for:

- branch selection and preferred-leaf resolution
- edit pruning behavior
- system prompt composition
- tool-calling prompt suffix composition
- tool-call persistence and export payload generation
- export payload generation

## What remains in `src/main.js`

`src/main.js` still owns app-specific coordination:

- DOM rendering and event wiring
- persistence triggers
- engine initialization and generation flow
- orchestration execution
- route and focus handling

## Refactor direction

This extraction is intended as phase 1 of a broader modularization:

1. conversation domain
2. app controller / state transitions
3. UI view modules
4. smaller accessibility and routing helpers
