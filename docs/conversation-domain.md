# Conversation Domain

The conversation tree logic now lives in `src/state/conversation-model.js`.

## Purpose

This module is the pure domain layer for:

- creating conversation records
- storing the conversation type (`chat` or `agent`) plus optional agent metadata
- storing the selected model for each conversation
- adding user/model messages to the tree
- preserving `summary` nodes that record prompt compaction while keeping the full underlying tree/export history
- preserving structured user content parts for attachments, including image parts plus text-backed file parts and their LLM-facing representation
- preserving normalized attachment conversions and future memory-ingestion hints alongside the original attachment metadata
- resolving the visible branch and variant navigation state
- pruning descendants after user edits
- building structured prompts for inference, including fixed agent identity steering, personality context, and latest-summary carry-forward memory
- building conversation export payloads and Markdown output
- preserving model-emitted tool calls and `tool` role execution results

Bulk archive export in `src/app/conversation-bulk-export.js` reuses these pure export builders and
the normalized snapshot serializer rather than introducing a second export schema.

For attachment-related document pipelines, this module should store the resulting normalized content and model-visible representation, but it should not perform parsing, chunking, or orchestration work itself. For example, HTML attachments may already be normalized into Markdown before they reach this layer.

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
- system prompt composition, including agent identity steering and summary carry-forward behavior
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

Parser-first attachment preparation belongs in app/runtime coordination and orchestration layers, not in the pure conversation domain.

## Refactor direction

This extraction is intended as phase 1 of a broader modularization:

1. conversation domain
2. app controller / state transitions
3. UI view modules
4. smaller accessibility and routing helpers
