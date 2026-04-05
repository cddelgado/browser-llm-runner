# Security Notes

This document tracks security hardening decisions and known gaps that should stay visible in future changes.

## Current protections

- Sensitive tool use for precise location requires a one-time browser-local awareness prompt before first use.
- After the user grants that consent, the app may reuse precise location in later tool calls.
- If the user declines precise location consent, the location tool falls back to a coarse locale/timezone-derived label with no coordinates.
- Browser-networked features share one browser fetch helper. A saved proxy from `Settings -> Proxy` is used only after a direct cross-origin request looks CORS-blocked and the proxy has already passed a browser-readable validation fetch against `https://example.com/`.
- Proxy validation accepts only prefix-style `https` URLs, or `http://localhost`, preserves query-string prefixes, and rejects embedded credentials and fragments.
- Proxy fallback is skipped for same-origin requests, requests that carry explicit authorization headers, and attempts to send local/private-network targets through a remote proxy.
- MCP server support also uses the browser fetch API directly. It accepts only browser-reachable `https` endpoints, or `http://localhost`, and rejects embedded credentials plus obvious auth challenges where detected.
- Transformers.js is loaded from the locally installed package and bundled with the app build instead of being imported from a CDN at runtime.
- Browser-local Python execution currently loads Pyodide runtime assets from the pinned `https://cdn.jsdelivr.net/pyodide/v0.29.3/full/` distribution at runtime.
- Attachment ingestion applies per-type limits before large files are read into memory:
  - text files: 5 MB max, truncated to 400,000 characters for storage and prompt preparation
  - images: 15 MB max and 40,000,000 pixels max
  - PDFs: 20 MB max, truncated to 120,000 characters after extraction

## Known hardening gap

- The app does not yet ship with a Content Security Policy. This remains an explicit defense-in-depth task because model output is rendered into the transcript DOM after Markdown conversion. A future hardening pass should add a CSP compatible with GitHub Pages, MathJax, Bootstrap, workers, and local model loading.

## Remaining accepted risk

- Model artifacts are still fetched from upstream model repositories at runtime and are not revision-pinned or integrity-verified yet. This remains an accepted supply-chain risk for now and should stay documented until the app adopts pinned or self-hosted model artifacts.
- When an enabled MCP command is invoked, that command's arguments are sent to the configured remote MCP endpoint and its result comes back into the local conversation. This is expected behavior, but it is still an external network surface the user controls.
