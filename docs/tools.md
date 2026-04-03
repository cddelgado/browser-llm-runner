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

For JSON-based formats, the model-specific call shape may use either an `arguments` key or a `parameters` key. In this document, "empty arguments object" means "the empty object assigned to that model's tool-input key." Examples:

- `{"name":"tool_name","arguments":{}}`
- `{"name":"tool_name","parameters":{}}`

That empty object is not a universal synonym for "this tool has no inputs." It only means one of these two things:

- the tool truly accepts no inputs
- the tool description explicitly defines `{}` on the tool-input key as a discovery/help call

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
- Discovery behavior: when called with the model's tool-input key set to `{}`, it returns only the minimal syntax reminder needed to use it
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

### `run_shell_command`

- Display name: `Shell Command Runner`
- Purpose: runs a browser-local GNU/Linux-like shell subset against the app's `/workspace` filesystem abstraction
- Discovery behavior: when called with the model's tool-input key set to `{}`, it returns a compact response envelope whose `body` is a short human-readable list of the supported command names
- Preferred argument: pass shell text as `cmd`; legacy `command` is still accepted for backward compatibility
- Uploaded-file awareness: text-backed attachment prompt text can include the exact `/workspace/...` path for uploaded files so the model can reuse that path directly with this tool
- Attachment naming behavior: uploaded attachments are renamed up front to lowercase shell-safe filenames, and the visible attachment label matches the `/workspace/...` basename exposed to the model
- Arguments:
  - optional `cmd`
  - optional legacy alias `command`
- Tool-call payload returned to the model:
  - `status`
  - `body`
- Internal app metadata preserved for the terminal/session UI:
  - `shellFlavor`
  - `currentWorkingDirectory`
  - `command`
  - `exitCode`
  - `stdout`
  - `stderr`
- Current supported command subset:
  - `pwd`
  - `basename`
  - `dirname`
  - `printf`
  - `true`
  - `false`
  - `cd`
  - `ls` with `-l`, `-R`, `-1`, `-d`, and `-h`
  - `cat` with `-n`, `-b`, `-s`, `--number`, `--number-nonblank`, and `--squeeze-blank`
  - `head`
  - `tail`
  - `wc`
  - `sort`
  - `uniq`
  - `cut`
  - `paste` with `-d`
  - `join` with `-1`, `-2`, and `-t`
  - `column` with `-t` and `-s`
  - `tr`
  - `nl`
  - `rmdir`
  - `mkdir`
  - `mktemp`
  - `touch`
  - `cp`
  - `mv`
  - `rm`
  - `find` with `-name`, `-type f`, `-type d`, `-maxdepth`, and `-mindepth`
  - `grep` with `-i`, `-n`, `-v`, `-c`, `-l`, and `-F`
  - `sed` with a single sed-like script, `-n`, and `-i`
  - `file` with basic directory, signature, extension, and text-vs-binary classification
  - `diff` with `-u` unified-style emulated output
  - `curl` with `URL`, `-I`, `-X`, repeated `-H`, `-d`, and `-o`
  - `echo`
  - `set`
  - `unset`
  - `which`
- Current limits:
  - commands are GNU/Linux-like, but only this documented subset is implemented
  - command text must be plain shell input, 2000 characters or fewer, and free of control characters
  - fenced code blocks and nested tool-call payloads are rejected before execution
  - relative paths resolve from the conversation's current working directory
  - new conversations start with the shell pointer at `/workspace`
  - minimal variable support exists for `$VAR`, `${VAR}`, `NAME=value`, `set`, and `unset`
  - `paste` merges text files line-by-line, with optional `-d` delimiters
  - `join` supports two-file joins with optional `-1`, `-2`, and `-t` field-selection flags
  - `column` focuses on table alignment, especially with `-t` and optional `-s` separators
  - `sed` supports a single sed-like script with addresses `N`, `N,M`, `/regex/`, and `$`, plus commands `p`, `d`, and `s///g`, with optional `-n` and `-i`
  - `file` reports a small deterministic set of directory, signature, extension, and text-vs-binary classifications
  - built-in pseudo variables include `PWD` and `WORKSPACE`
  - `diff` is line-based and emits unified-style emulated output rather than full GNU diff compatibility
  - `curl` uses the browser fetch API, so CORS, browser-managed redirects, and forbidden request headers still apply
  - `curl -o` writes response bytes to a file under `/workspace`; without `-o`, response bytes are decoded as UTF-8 text for `stdout`
  - pipes, redirection, globbing, command substitution, and full shell expansion semantics are not implemented yet
  - unsupported commands/syntax return shell-style `stderr` text with a non-zero `exitCode`

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js) and [src/llm/shell-command-tool.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/shell-command-tool.js).

### Standard for future shell commands

Any new command added to `run_shell_command` should meet the same baseline as the current subset.

- Keep the command browser-local and restricted to the injected workspace filesystem abstraction. Do not bypass that layer and do not access OPFS handles directly from the command implementation.
- Preserve the `/workspace` boundary. Relative paths must resolve from the conversation-local working directory, and path traversal outside `/workspace` must fail with a shell-style error.
- Reuse the shell entry sanitizing rules. New behavior must continue to reject oversized command text, control characters, fenced code blocks, and nested tool-call-shaped payloads before execution.
- Return deterministic `stdout`, `stderr`, and `exitCode` values. Do not leak raw exceptions to the tool result when a shell-style error message can be returned instead.
- Match the subset model, not full GNU behavior. If compatibility is partial, document the exact supported flags and edge cases in this file and in the usage payload exposed by the tool.
- Prefer explicit option parsing and explicit arity checks. Unsupported flags or malformed operands should fail early with a non-zero exit code.
- Treat destructive behavior conservatively. Commands that write, move, or delete must guard against same-path no-op corruption, root-directory deletion, and other ambiguous filesystem targets.
- Keep variable semantics narrow and predictable. Escaped or single-quoted `$` text should stay literal, and empty expansion must not silently create dangerous default operands.
- Keep output stable for LLM consumption. Avoid timestamps, nondeterministic formatting, or environment-dependent details unless the command is specifically about those values.
- Add focused unit tests for the happy path, invalid options, missing-path behavior, boundary enforcement, and at least one LLM-shaped malformed input case.
- Update the `supportedCommands`, examples, and limitations returned by the tool whenever the shell subset changes.
- Update [README.md](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/README.md) and this document when the supported shell surface or its guarantees change.

## Planned capability model

The intended future design separates capability access into three layers with different purposes.

User-uploaded files are already staged for that future work through a browser-local workspace filesystem abstraction:

- uploads are written into OPFS
- each conversation gets its own isolated OPFS-backed `/workspace`
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
- `run_shell_command` also mirrors its visible branch history into a read-only xterm terminal panel that opens on demand, shows prompt + command + output, and can be dismissed until the next shell command reopens it

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
