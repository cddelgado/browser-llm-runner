# Tool Calling

This repo now includes an early browser-local tool-calling loop.

This document covers both:

- the current implemented browser-local tool-calling behavior
- the intended longer-term separation between function calls, MCP integration, and `SKILL.md` playbooks

## What it does

When tool calling is enabled for a conversation and the selected model supports it, the app:

1. Appends any enabled feature-guidance prompt text to the effective system prompt.
2. Appends model-specific tool-call instructions after that feature guidance.
3. Watches the streamed model output for a complete tool call.
4. Stops generation as soon as the first complete tool call is detected for that turn.
5. Executes the requested tool locally in the browser app.
6. Stores the tool result as a `tool` role message in the conversation tree.
7. Resubmits the conversation so the model can continue only after that tool result is available.

Tool calling is model-aware. The app does not use one universal tool-call format for every model family.
If the selected model does not support tool calling, the tool-instruction section is omitted entirely from the computed system prompt even when the conversation-level tool-calling toggle is enabled.

The prompt is organized into separate sections so models do not confuse tool descriptions, post-tool behavior, and call syntax:

- `Tools available in this conversation` lists the enabled tools and any tool-specific usage notes.
- `Tool behavior` covers only generic behavior after a tool result is returned.
- `Tool call format` describes the exact wrapper or JSON shape the selected model must emit, including that a tool call should be the only output in that turn.

## Current scope

Today, the app implements a small built-in tool registry and a local tool execution loop. MCP integration and `SKILL.md` ingestion are not implemented yet.

The existing tool-calling path should be treated as the foundation for broader capability discovery later, not as the final shape of all external capability support.

## Built-in tools

### `get_current_date_time`

- Display name: `Get Date and Time`
- Purpose: returns the browser session's current local date/time plus a UTC ISO timestamp and timezone name
- Arguments: none
- Result fields:
  - `iso`
  - `unixMs`
  - `localDate`
  - `localTime`
  - `timeZone`

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js).

### `get_user_location`

- Display name: `Get User Location`
- Purpose: requests the browser's geolocation permission and waits for the browser prompt to be accepted, denied, or time out
- First use awareness: before precise location is used for the first time in a browser, the app shows a one-time consent prompt explaining that the tool may use precise location, may reuse that location in later tool calls, and may send coordinates to OpenStreetMap Nominatim for reverse geocoding
- Enrichment: when precise coordinates are available, the app also attempts reverse geocoding through OpenStreetMap Nominatim to return a human-readable location label
- Fallback: if permission is denied, unavailable, or the request times out, returns a coarse location label derived from browser locale and timezone signals with no coordinate
- Arguments:
  - optional `timeoutMs`
- Result fields:
  - `location`
  - `coordinate`

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js).

### `tasklist`

- Display name: `Task List Planner`
- Purpose: manages a task list for multi-step work
- Discovery behavior: when called with an empty arguments object, it returns only the minimal syntax reminder needed to use it
- Commands:
  - `new` to add an undone task, optionally at a specific index
  - `list` to return the current task list with indexes and done/undone state
  - `clear` to remove all task list items
  - `update` to mark an existing task as done (`1`) or undone (`0`)
- Parameters:
  - `command`
  - `item`
  - `index`
  - `status`
- Result shape:
  - `new`, `list`, `update` return `{ items: [...] }`
  - `clear` returns `{ items: [] }`
- History behavior: each `tasklist` tool result includes the full list snapshot after that change; the active list is derived from the latest `tasklist` result on the visible branch
- Input guardrails: task text is normalized and rejects raw code blocks or tool-call-shaped payloads so the planner stays plain-text

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js).

## Planned capability model

The intended future design separates capability access into three layers with different purposes.

User-uploaded files are already staged for that future work through a browser-local workspace filesystem abstraction:

- uploads are written into OPFS
- the exposed path format is linux-style under `/workspace`
- future tool commands should interact with the injected workspace filesystem abstraction, not OPFS handles directly

### 1. Function calls

Function calls are for small, discrete, relatively simple input-output actions.

Ideal examples include:

- time
- weather
- search results
- page content

Function calls should stay narrow in scope, return structured results, and be easy for the model to call directly when it needs a specific piece of information or a simple transformation.

### 2. MCP support

MCP support is intended for connecting to broader servers and services that expose multiple related utilities.

The design intent is:

- the entirety of an MCP server should not be injected into prompt context by default
- the model should instead be told that MCP servers exist
- the model should receive very brief functionality statements for available MCP servers
- the model should be encouraged to request discovery through a tool call

In practice, this means the model-facing prompt should prefer discovery-first behavior such as:

- list available MCP servers
- list commands/resources offered by one selected MCP server

The tool call becomes the mechanism for progressive disclosure. The model sees only enough context to decide whether it should ask for an MCP listing, then can inspect a specific server's offerings as needed.

Future file-oriented tool calls should follow the same boundary rule:

- tool code receives a workspace filesystem object
- that object resolves `/workspace/...` paths and performs reads/writes/listing
- OPFS remains an implementation detail behind that abstraction

### 3. `SKILL.md` support

`SKILL.md` files are intended to act as playbooks, manuals, and strategies.

Skills may:

- be purely instructional
- rely on function calls
- rely on MCP-backed utilities
- combine multiple steps or decision rules that are too broad to fit a single simple function call

The design intent is similar to a library workflow:

- the model should be aware that skills exist
- the model should have a short description of what skills can offer
- the model should be able to request a list of available skills through a tool call
- the model should ingest or invoke a selected skill only when needed

Skills should therefore remain discoverable and selectively loaded, rather than being fully embedded into the base prompt by default.

## Prompting philosophy for future implementation

The future prompt model should stay minimal and discovery-oriented.

System-prompt additions should:

- mention that direct function calls are available for small discrete tasks
- mention that MCP servers exist and can be listed or inspected on demand
- mention that `SKILL.md` playbooks exist and can be listed for later ingestion
- avoid dumping full MCP inventories or full skill bodies into the base context

This keeps prompt context smaller, reduces distraction, and encourages the model to pull in only the capability descriptions it actually needs for the current task.

## Transcript behavior

When a model emits a tool call, the transcript keeps that tool activity inline on the originating model response card.

Current behavior:

- narration emitted before the first tool call remains visible in the model card
- the first complete tool call detected in that streamed turn interrupts generation immediately
- the model does not keep speaking past that intercepted tool call until the tool result is returned
- the model card renders thinking, narration, tool request/result, and any resumed narration in the order they occurred within that turn
- intermediate `tool` and continuation `model` nodes stay in conversation state for execution and export, but the transcript folds them into the originating model card instead of showing standalone rows

This keeps the visible transcript aligned with agent-style execution: tool use happens at the point where the model decided it needed the tool, not as a later detached transcript node.

Tool results are preserved in the underlying conversation object as `tool` role messages even when the transcript UI renders them inline under the originating model turn.

## Copy behavior

- `Copy response` on a normal model response copies the model response text
- `Copy response` on a model tool-call card copies the model message text plus any attached tool-result text
- `Copy MathML` on a math-rendered model response copies the rendered MathML, not the source LaTeX
- no extra Markdown or export-style formatting is added during copy

## Export behavior

Conversation exports include tool-calling data when tool calling is enabled at export time.

- JSON exports include:
  - top-level `toolCalling` metadata
  - model-message `toolCalls`
  - `tool` role exchanges with `toolName`, `toolArguments`, and result text
- Markdown exports include:
  - tool-calling support metadata
  - enabled tool names
  - model tool-call metadata
  - tool result details

If tool calling is enabled but no tools are enabled, exports list enabled tools as `none`.

## Model-specific formats

Current supported tool-call formats are documented in [docs/models.md](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/docs/models.md).

At the moment, included models use different call formats, including:

- raw JSON object calls
- tagged JSON tool-call blocks
- special-token wrapped function-style calls

## Current limits

This is still an early implementation.

- The built-in tool set is intentionally small.
- Tool execution is local and explicit; there is no remote service backend.
- Detection and parsing are driven by per-model metadata rather than a universal Transformers.js orchestration API.
- The current tool registry is code-defined, not user-configurable.
- The current streaming interception path acts on the first complete tool call detected in a streamed turn, then resumes generation after that tool result is available.
- MCP capability discovery is planned but not implemented yet.
- `SKILL.md` discovery and selective ingestion are planned but not implemented yet.
