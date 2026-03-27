# Tool Calling

This repo now includes an early browser-local tool-calling loop.

## What it does

When tool calling is enabled for a conversation and the selected model supports it, the app:

1. Appends any enabled optional feature-flag prompt section to the effective system prompt.
2. Appends model-specific tool-call instructions after that optional feature section.
3. Detects emitted tool calls in the model's output.
4. Executes the requested tool locally in the browser app.
5. Stores the tool result as a `tool` role message in the conversation tree.
6. Resubmits the conversation so the model can continue with a normal user-facing answer.

Tool calling is model-aware. The app does not use one universal tool-call format for every model family.

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
