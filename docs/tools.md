# Tool Calling

This repo now includes an early browser-local tool-calling loop.

This document covers both:

- the current implemented browser-local tool-calling behavior
- the intended longer-term separation between function calls, MCP integration, and `SKILL.md` playbooks

## What it does

When tool calling is enabled for a conversation and the selected model supports it, the app:

1. Appends any enabled optional feature-flag prompt section to the effective system prompt.
2. Appends model-specific tool-call instructions after that optional feature section.
3. Detects emitted tool calls in the model's output.
4. Executes the requested tool locally in the browser app.
5. Stores the tool result as a `tool` role message in the conversation tree.
6. Resubmits the conversation so the model can continue with a normal user-facing answer.

Tool calling is model-aware. The app does not use one universal tool-call format for every model family.

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
- Enrichment: when precise coordinates are available, the app also attempts reverse geocoding through OpenStreetMap Nominatim to return a human-readable location label
- Fallback: if permission is denied, unavailable, or the request times out, returns a coarse location label derived from browser locale and timezone signals with no coordinate
- Arguments:
  - optional `timeoutMs`
- Result fields:
  - `location`
  - `coordinate`

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js).

## Planned capability model

The intended future design separates capability access into three layers with different purposes.

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

When a model emits a tool call, the transcript shows a collapsible control such as `Tool Call: Get Date and Time`.

Expanding that control shows:

- the emitted tool call request as formatted preformatted text
- the tool result in the same inline panel once execution completes

The model's final natural-language answer still appears as its own normal model response card.

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
- MCP capability discovery is planned but not implemented yet.
- `SKILL.md` discovery and selective ingestion are planned but not implemented yet.
