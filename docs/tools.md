# Tool Calling

This repo now includes a browser-local tool-calling loop with browser-mediated MCP HTTP support.

This document covers both:

- the current implemented built-in and MCP tool-calling behavior
- the remaining `SKILL.md` planning

## What it does

When tool calling is enabled for a conversation and the selected model supports it, the app:

1. Appends any enabled feature-guidance prompt text to the effective system prompt.
2. Appends model-specific tool-call instructions after that feature guidance.
3. Watches the streamed model output for a complete tool call.
   - Incomplete or malformed tool-call JSON is ignored rather than recovered heuristically.
4. Stops generation as soon as the first complete tool call is detected for that turn.
5. Executes the requested tool locally in the browser app.
6. Stores the tool result as a `tool` role message in the conversation tree.
7. Resubmits the conversation so the model can continue only after that tool result is available.

Tool calling is model-aware. The app does not use one universal tool-call format for every model family.
If the selected model does not support tool calling, the tool-instruction section is omitted entirely from the computed system prompt even when the global tool-calling toggle is enabled.
Users can disable individual built-in tools in `Settings -> Tools`; disabled tools are removed from the tool-instruction section and ignored by the local tool-execution loop.
Users can configure one validated prefix-style CORS proxy in `Settings -> Proxy`; validation uses an MCP `initialize` probe against `https://example-server.modelcontextprotocol.io/mcp`, browser-networked features retry through the saved proxy only when a direct cross-origin request appears blocked by CORS, and query-string prefixes such as `...?url=` are allowed.
Users configure MCP endpoints in `Settings -> MCP Servers`; imported servers start disabled, all discovered commands start disabled, and disabled servers or commands are omitted from the prompt and rejected by execution.

The prompt is organized into separate sections so models do not confuse tool descriptions, post-tool behavior, and call syntax:

- `Tools available in this conversation` lists the enabled tools and any tool-specific usage notes.
- `MCP Servers List` lists only enabled MCP servers.
- `MCP Server Instructions` covers the MCP discovery flow plus the two MCP helper call syntaxes.
- `Tool behavior` covers only generic behavior after a tool result is returned.
- `Tool call format` describes the exact wrapper or JSON shape the selected model must emit, including that a tool call should be the only output in that turn.

For JSON-based formats, the model-specific call shape may use either an `arguments` key or a `parameters` key. In this document, "empty arguments object" means "the empty object assigned to that model's tool-input key." Examples:

- `{"name":"tool_name","arguments":{}}`
- `{"name":"tool_name","parameters":{}}`

That empty object is not a universal synonym for "this tool has no inputs." It only means one of these two things:

- the tool truly accepts no inputs
- the tool description explicitly defines `{}` on the tool-input key as a discovery/help call

## Current scope

Today, the app implements:

- a small built-in tool registry
- a local tool execution loop
- browser-mediated MCP HTTP inspection and execution for user-configured servers

Current MCP constraints:

- only browser-reachable `https` endpoints are accepted, except `http://localhost`
- servers that embed credentials, obvious token query parameters, or auth challenges are rejected when detected
- imported servers start disabled, and discovered commands start disabled
- only enabled servers with enabled commands are exposed to the model or executable through the harness
- MCP HTTP requests use the shared browser fetch helper, so they can retry through the validated proxy only after a likely CORS block
- proxy validation plus MCP initialize/list/call failures write transport details into `Settings -> Debug info` so browser-side request, status, and parse problems are inspectable without devtools
- `SKILL.md` discovery and selective ingestion are still not implemented

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

### `web_lookup`

This tool remains implemented but is currently disabled and not exposed to models.

- Display name: `Web Lookup`
- Purpose: fetches one web page or DuckDuckGo search through the browser network stack and returns a compact response envelope for the model
- Arguments:
  - required `input`
- Success result shape:
  - `status: "successful"`
  - `body`: markdown containing either page preview text or concise search results
  - optional `message` with follow-up guidance for the model
- Failure result shape:
  - `status: "failed"`
  - `body`: error detail
  - `message`: retry guidance for the model
- Extraction behavior:
  - if `input` is a direct `https` URL, does not return raw full-page HTML
  - HTML responses prefer title, meta description, and visible main/article/body text
  - large page responses are clipped to a preview window before extraction and summarized into the markdown body
  - if `input` is not a URL, the tool treats it as a DuckDuckGo search query
  - query mode opens a right-side lightweight DuckDuckGo HTML browser panel first in a portrait 9:16 phone-like frame, then attempts an in-app fetch of DuckDuckGo search results for concise extraction
  - query-mode `message` tells the model to call `web_lookup` again with one of the returned result URLs when it wants the page itself
- Current limits:
  - uses browser `fetch`, so CORS, browser-managed redirects, and forbidden request headers still apply unless the optional validated proxy fallback is triggered after a likely CORS block
  - only text-like responses are supported in the current implementation
  - direct URLs must use `https`
  - DuckDuckGo search extraction depends on what the browser can fetch from DuckDuckGo in the current session; failures still leave the visible DuckDuckGo panel open for the user
  - the current low-bandwidth, mobile-assisted search direction is sketched in [docs/web-search-hypothesis.md](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/docs/web-search-hypothesis.md)

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js) and [src/llm/web-tool.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/web-tool.js).

### `write_python_file`

- Display name: `Write Python File`
- Purpose: writes Python source code to a `.py` file under `/workspace`
- Intended workflow: use this tool for longer scripts
- Arguments:
  - required `path`
  - required `source`
- Result fields:
  - `path`
  - `bytes`
  - `lines`
  - `preview`
  - `message`
- Input guardrails:
  - `path` must stay under `/workspace` and end in `.py`
  - `source` must be non-empty and capped for prompt/tool payload sanity
- Terminal behavior: each successful write is mirrored into the read-only xterm session as a synthetic file-write command plus a short preview so the user can see that Python source was created before execution

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js) and [src/llm/python-tool.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/python-tool.js).

### `run_shell_command`

- Display name: `Shell Command Runner`
- Purpose: runs a browser-local GNU/Linux-like shell subset against the app's `/workspace` filesystem abstraction
- Discovery behavior: when called with the model's tool-input key set to `{}`, it returns a compact response envelope whose `body` is a short human-readable list of the supported command names
- Preferred argument: pass shell text as `cmd`; legacy `command` is still accepted for backward compatibility
- Python path: the shell subset supports `python /workspace/script.py` and short `python -c "..."`; prefer `write_python_file` plus `python /workspace/script.py` for larger scripts
- Uploaded-file awareness: text-backed attachment prompt text can include the exact `/workspace/...` path for uploaded files so the model can reuse that path directly with this tool
- Attachment naming behavior: uploaded attachments are renamed up front to lowercase shell-safe filenames, and the visible attachment label matches the `/workspace/...` basename exposed to the model
- Arguments:
  - optional `cmd`
  - optional legacy alias `command`
- Tool-call payload returned to the model:
  - `status`
  - `body`
  - optional `message` when output is truncated and `status` becomes `incomplete`
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
  - `grep` with `-o` for match-only output
  - `sed` with a single sed-like script, `-n`, and `-i`
  - `file` with basic directory, signature, extension, and text-vs-binary classification
  - `diff` with `-u` unified-style emulated output
  - `curl` with `URL`, `-I`, `-X`, repeated `-H`, `-d`, and `-o`
  - `python` with `/workspace/<script>.py` or short `-c` execution
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
  - `python` delegates to a browser-local Pyodide worker and mirrors its output back into shell-style `stdout`, `stderr`, and `exitCode`
  - `python -c` is intentionally small and should be treated as a short-snippet path; larger code should be written with `write_python_file` and then executed by path
  - interactive `python` with no script or `-c` is not supported
  - `|` is supported for `printf`, `echo`, `cat`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`, `tr`, `nl`, `grep`, and `sed`
  - `;`, `&&`, redirection, substitution, and globbing are not implemented
  - unsupported commands/syntax return shell-style `stderr` text with a non-zero `exitCode`
  - oversized shell output is truncated only in the model-facing tool response; the terminal/session history keeps the natural shell output
  - when that model-facing truncation happens, the model receives `{"status":"incomplete","body":"...","message":"..."}` so it can retry with a narrower command

This tool is defined in [src/llm/tool-calling.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/tool-calling.js), [src/llm/shell-command-tool.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/shell-command-tool.js), [src/llm/python-tool.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/python-tool.js), [src/llm/python-runtime-client.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/llm/python-runtime-client.js), and [src/workers/python.worker.js](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/src/workers/python.worker.js).

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

## MCP server support

Users add MCP servers from `Settings -> MCP Servers`.

- accepted endpoints: browser-reachable `https` URLs, or `http://localhost`
- rejected where practical: embedded credentials, token-like query parameters, and OAuth/token/basic-auth challenges
- default state: imported servers are off, and every discovered command is off
- metadata shown in the accordion: identifier, endpoint, protocol version, server version, capabilities, instructions, and per-command schema summaries
- prompt exposure: only enabled servers with enabled commands are listed under the `MCP Servers List` section, and MCP helper guidance appears under `MCP Server Instructions`
- execution: disabled or unknown servers and commands are rejected even if the model still emits them
- transport: the browser opens an MCP session with `initialize`, sends `notifications/initialized`, then uses `tools/list` or `tools/call`

The MCP helper tools are not user-toggled. They become available automatically when at least one enabled MCP server has at least one enabled command, and they are listed only under the MCP prompt sections rather than under the built-in tool list.

### `list_mcp_server_commands`

- Purpose: progressive discovery for one enabled MCP server
- Arguments:
  - required `server`
- Result fields:
  - `server`
  - `name`
  - optional `description`
  - `commands`
- `commands[]` fields:
  - `name`
  - optional `description`
  - optional `inputSchema`
  - `inputSummary`
- Scope:
  - returns only enabled commands
  - requires the selected server to be enabled and to have at least one enabled command
- Model-facing syntax:
  - `{"server":"server_identifier"}`

### `call_mcp_server_command`

- Purpose: execute one enabled command on one enabled MCP server through the existing tool harness
- Arguments:
  - required `server`
  - required `command`
  - optional `arguments` object
- Result fields:
  - `status`
  - `server`
  - `command`
  - `body`
  - optional `structuredContent`
  - optional `content`
- Scope:
  - requires both the selected server and the selected command to be enabled
  - sends the provided `arguments` object to the configured MCP endpoint only when invoked
- Model-facing syntax:
  - `{"server":"server_identifier","command":"command_name","arguments":{...}}`

## Capability model

The repo now separates capability access into three layers with different purposes.

User-uploaded files are already staged for future file-oriented tool work through a browser-local workspace filesystem abstraction:

- uploads are written into OPFS
- each conversation gets its own isolated OPFS-backed `/workspace`
- future tool commands should interact with the injected workspace filesystem abstraction, not OPFS handles directly

### 1. Built-in function calls

Function calls are for small, discrete, relatively simple input-output actions.

Ideal examples include:

- time
- weather
- search results
- page content

Function calls should stay narrow in scope, return structured results, and be easy for the model to call directly when it needs a specific piece of information or a simple transformation.

### 2. MCP support

MCP support connects the app to broader servers and services that expose multiple related utilities.

The current design keeps MCP usage discovery-first:

- the entirety of an MCP server is not injected into prompt context by default
- the model sees only enabled servers, each with a short description
- the model discovers enabled commands through `list_mcp_server_commands`
- the model calls one enabled command at a time through `call_mcp_server_command`

The tool call is the mechanism for progressive disclosure. The model sees only enough context to decide whether it should inspect one server, then can inspect or call enabled commands as needed.

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

## Prompting philosophy

The prompt model should stay minimal and discovery-oriented.

System-prompt additions should:

- mention enabled direct function calls for small discrete tasks
- mention enabled MCP servers and the discovery/call syntax needed to inspect them
- keep future `SKILL.md` support discovery-first as well
- avoid dumping full MCP inventories or full skill bodies into the base context

This keeps prompt context smaller, reduces distraction, and encourages the model to pull in only the capability descriptions it actually needs for the current task.

## Model-facing writing standard

When writing tool instructions or other LLM-facing prompt text in this repo, assume the model already knows the general concepts and ordinary behavior of familiar tools.

Write for deltas and edges:

- name the surface
- state the boundary
- state only the non-obvious constraints

Do not spend prompt budget on tutorial language:

- do not re-explain common commands, flags, or shell concepts the model already knows
- do not narrate implementation details like toggles, switches, or feature plumbing unless that detail changes what the model should do
- do not describe normal behavior as if it were special behavior
- do not restate generic capability just to be explicit

Prefer short constraint-first wording such as:

- `|` is supported for `...`
- unsupported syntax: `;`, `&&`, redirection, substitution, globbing
- commands are GNU/Linux-like, but partial
- if a command hits an unsupported corner, adapt and try a simpler form

The goal is not to teach the model the domain. The goal is to bound its assumptions with the minimum language needed to keep it effective inside this specific tool surface.

## Transcript behavior

When a model emits a tool call, the transcript keeps that tool activity inline on the originating model response card.

Current behavior:

- narration emitted before the first tool call remains visible in the model card
- the first complete tool call detected in that streamed turn interrupts generation immediately
- the model does not keep speaking past that intercepted tool call until the tool result is returned
- the model card renders thinking, narration, tool request/result, and any resumed narration in the order they occurred within that turn
- intermediate `tool` and continuation `model` nodes stay in conversation state for execution and export, but the transcript folds them into the originating model card instead of showing standalone rows
- `run_shell_command` also mirrors its visible branch history into a read-only xterm terminal panel that opens on demand, shows prompt + command + output, and can be dismissed until the next shell command reopens it
- `write_python_file` mirrors successful writes into that same terminal history as synthetic file-write entries so Python creation and later `python ...` execution appear in a coherent order

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
  - `tool` role exchanges with `toolName`, `toolArguments`, result text, and `toolResultData` when the tool stored structured execution metadata
- Markdown exports include:
  - tool-calling support metadata
  - enabled tool names
  - model tool-call metadata
  - tool result details, including structured `toolResultData` when present

If tool calling is enabled but no tools are enabled, exports list enabled tools as `none`.

## Model-specific formats

Current supported tool-call formats are documented in [docs/models.md](/c:/Users/cddel/OneDrive/Development/browser-llm-runner/docs/models.md).

At the moment, included models use different call formats, including:

- raw JSON object calls
- tagged JSON tool-call blocks
- special-token wrapped function-style calls

Gemma compatibility note:

- the primary Gemma format in this app is `<|tool_call>call:tool_name{...}<tool_call|>`
- the detector also accepts a leading bare `call:tool_name{...}` block because some Gemma outputs omit the wrapper in practice

## Current limits

This is still an early implementation.

- The built-in tool set is intentionally small.
- Tool execution is explicit; built-in tools run in-browser, while MCP calls go through browser fetch to configured endpoints.
- Detection and parsing are driven by per-model metadata rather than a universal Transformers.js orchestration API.
- The current built-in tool registry is code-defined, but users can turn the currently available built-in tools on or off from `Settings -> Tools`.
- MCP endpoints are configured in `Settings -> MCP Servers`; imported servers and imported commands default to off.
- MCP support is limited to browser-reachable `https` endpoints, or `http://localhost`, without OAuth or token-based authentication.
- The current streaming interception path acts on the first complete tool call detected in a streamed turn, then resumes generation after that tool result is available.
- `SKILL.md` discovery and selective ingestion are planned but not implemented yet.
