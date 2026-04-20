# Security Notes

This document tracks security hardening decisions and known gaps that should stay visible in future changes.

## Current protections

- Sensitive tool use for precise location requires a one-time browser-local awareness prompt before first use.
- After the user grants that consent, the app may reuse precise location in later tool calls.
- If the user declines precise location consent, the location tool falls back to a coarse locale/timezone-derived label with no coordinates.
- Browser-networked features share one browser fetch helper. A saved proxy from `Settings -> Proxy` is used only after a direct cross-origin request looks CORS-blocked and the proxy has already passed a browser-readable MCP `initialize` probe against `https://example-server.modelcontextprotocol.io/mcp`.
- Proxy validation accepts only prefix-style `https` URLs, or `http://localhost`, preserves query-string prefixes, and rejects embedded credentials and fragments.
- Proxy fallback is skipped for same-origin requests, requests that carry explicit authorization headers, and attempts to send local/private-network targets through a remote proxy.
- MCP server support also uses the browser fetch API directly. It accepts only browser-reachable `https` endpoints, or `http://localhost`, and rejects embedded credentials plus obvious auth challenges where detected.
- OpenAI-compatible cloud providers are also browser-direct. The app tests them with an authenticated `GET /models` call before save and later uses authenticated `/chat/completions` requests directly from the browser worker.
- Saved cloud-provider API keys live in dedicated IndexedDB records instead of plain `localStorage` or `sessionStorage`. When the browser supports WebCrypto key storage, those secrets are encrypted at rest with a non-extractable browser-held AES-GCM key before they are written.
- Transformers.js is loaded from the locally installed package and bundled with the app build instead of being imported from a CDN at runtime.
- `@wllama/wllama` is also loaded from the locally installed package and bundles both `wllama.wasm` runtime variants with the app build instead of fetching them from a CDN at generation time.
- Secure static-host deployments register a same-origin `coi-serviceworker.js` helper that adds COOP/COEP headers on controlled responses so `wllama` can use `SharedArrayBuffer`-backed multithreading when the browser allows it.
- Browser-local Python execution currently loads Pyodide runtime assets from the pinned `https://cdn.jsdelivr.net/pyodide/v0.29.3/full/` distribution at runtime.
- Attachment ingestion applies per-type limits before large files are read into memory:
  - text files: 5 MB max, truncated to 400,000 characters for storage and prompt preparation
  - images: 15 MB max and 40,000,000 pixels max
  - PDFs: 20 MB max, truncated to 120,000 characters after extraction

## Known hardening gap

- The app does not yet ship with a Content Security Policy. This remains an explicit defense-in-depth task because model output is rendered into the transcript DOM after Markdown conversion. A future hardening pass should add a CSP compatible with GitHub Pages, MathJax, Bootstrap, workers, and local model loading.

## Remaining accepted risk

- Model artifacts are still fetched from upstream model repositories at runtime. The bundled Transformers.js catalog is revision-pinned and the bundled LFM2.5 GGUF entry uses a pinned Hugging Face `resolve/<commit>/...` URL, but the app does not yet apply a uniform integrity-verification policy across all model downloads or user-added providers. This remains an accepted supply-chain risk for now and should stay documented until the app adopts stronger verification or self-hosted artifacts consistently.
- When an enabled MCP command is invoked, that command's arguments are sent to the configured remote MCP endpoint and its result comes back into the local conversation. This is expected behavior, but it is still an external network surface the user controls.
- Browser-only secret storage is still not perfect secret storage. A malicious extension, compromised origin, or future XSS bug could still use the browser-held key material or invoke the decryption path. The UI warns about that limitation and intentionally never re-displays a saved cloud-provider API key after it is stored.
