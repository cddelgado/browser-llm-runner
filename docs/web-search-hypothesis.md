# Web Search Hypothesis

Status: design note only. Nothing in this document is implemented yet.

## Why this exists

The current app can fetch and summarize a direct `https` URL through `web_lookup`, but it does not have a true search capability yet.

Any future search design still has to respect this repo's hard constraints:

- static-site deployment on GitHub Pages
- prompts and outputs local by default
- explicit user control over any networked capability
- usable behavior on bandwidth-constrained devices

## Working hypothesis

The cleanest path is to separate "finding candidate pages" from "reading a selected page."

- `web_lookup` should remain the direct-page reader.
- A future `web_search` capability should return only lightweight result cards first.
- Mobile devices should be treated as optional search helpers and cache warmers, not as a required backend.

That keeps the default browser app small and privacy-preserving while still giving us a way to do search when CORS, rate limits, or bandwidth make browser-only search unreliable.

## Proposed architecture

### 1. Search ticket

The browser app creates a tiny search request object:

- query
- locale
- freshness hint
- maximum result count
- optional site filters

This should stay small enough to serialize as JSON, encode as a QR payload, or pass through a share target.

### 2. Result-card bundle

The first response should be metadata only:

- title
- canonical URL
- short snippet
- source/domain
- published date when known
- estimated fetch cost
- whether the page looks readable by `web_lookup`

Target budget: roughly `1-2 KB` per result card, not a full page body.

### 3. Deferred page fetch

After the model or user picks one result, the app fetches only that page.

Preferred order:

1. direct browser `web_lookup`
2. mobile-assisted fetch when the page blocks the browser path
3. explicit user import of a mobile-captured article bundle

## Why mobile helps

Mobile apps can do three useful things with low bandwidth:

- reuse existing OS-level or app-level search surfaces
- fetch over the phone's current network path and cache the result locally
- send back compact result bundles instead of large HTML payloads

Feasible helpers:

- Android share target or companion app
- iOS share extension or companion app
- installable PWA with Web Share Target where supported

## Low-bandwidth strategy

Search should be staged and byte-budgeted.

### Stage A: metadata only

- fetch result cards first
- no page HTML yet
- no images, scripts, or non-text assets

### Stage B: targeted article fetch

- prefer `HEAD`, `Range`, or early-byte fetches when the origin supports them
- extract title, description, headings, and visible article text only
- clip before summarization

### Stage C: cached reuse

- cache result cards and extracted article previews in IndexedDB
- key by canonical URL plus freshness metadata
- keep byte counts so the UI can explain storage cost

## Mobile companion transport options

The browser app should not require a cloud relay.

Possible sync paths, in order of preference:

1. local file import/export of a compact `.search.json`
2. QR code ticket out, short code or QR bundle back
3. local-network or WebRTC transfer when both devices are nearby

The first version can be file-based. It is the least elegant, but it works with static hosting and preserves user control.

## Data format sketch

```json
{
  "query": "latest mars rover update",
  "createdAt": "2026-04-03T00:00:00.000Z",
  "provider": "mobile-companion",
  "results": [
    {
      "title": "NASA rover update",
      "url": "https://example.com/article",
      "snippet": "Short summary text",
      "publishedAt": "2026-04-02T18:00:00.000Z",
      "source": "example.com",
      "estimatedBytes": 1460,
      "fetchMode": "direct"
    }
  ]
}
```

## Privacy and UX rules

If this is built, the UI should make these rules explicit:

- disabled by default
- opt-in per provider
- show what query leaves the browser
- show which provider handled it
- show approximate bytes transferred
- provide a clear cache reset

Prompt text should not be sent to a search provider by default. Only the explicit search query should leave the app.

## Suggested implementation order

1. Split the current web tool surface into `lookup` and `search` provider interfaces internally.
2. Add a result-card bundle import path so search can be tested without any companion app.
3. Add a mobile companion proof of concept that returns only result-card bundles.
4. Add optional mobile-assisted article fetch for pages that `web_lookup` cannot read directly.

## Non-goals

- hidden backend search relay
- full-page sync for every search result
- background telemetry on prompts, queries, or clicked results
