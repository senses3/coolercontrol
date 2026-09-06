# OpenAPI specification

`openapi.json` is generated from the daemon's route table. Regenerate it from the repo root:

```sh
make openapi
```

This needs no running daemon and no root. The daemon test `checked_in_openapi_spec_is_current` fails
when the checked-in file is stale, so it should rarely be out of date.

The daemon also serves the same document at `/api.json`, but only in debug builds.

## Server Sent Events

`GET /sse` carries every event kind on one connection, each tagged with its own event name:
`status`, `missing`, `stale-source`, `failsafe`, `health`, `log`, `mode`, `alert`, `notification`.
Gate on the event name. The optional `events` query parameter narrows the subscription to a
comma-separated subset of `status`, `health`, `logs`, `modes`, `alerts`, `notifications`; an unknown
value is a 400.

The `SseEvent` schema lists every event name against its payload type, and the response carries a
literal sample frame per event kind. `SseEvent` is the type the daemon actually sends through, so
the schema cannot drift from the wire; note though that it models a frame as
`{"event": ..., "data": ...}` because OpenAPI 3.1 has no way to describe a stream of tagged frames.
The real bytes are SSE framing, which is what the examples show. Frames beginning with `:` are
keep-alive ticks and carry no data.

Prefer it to the per-stream `/sse/{logs,status,modes,alerts,notifications}` endpoints, which are
deprecated. Browsers cap concurrent connections per origin over HTTP/1.1 (6 in Chrome, counted per
profile rather than per tab), so a client that opens one connection per event kind starves its own
ordinary requests. That was the bug this endpoint exists to fix.

Subscribe narrowly when you only want rare events. `status` alone is a few KB every poll interval,
so a notifications-only consumer that takes the full stream moves tens of MB an hour for nothing.

Protocol matters for the same reason. The daemon serves both on one port:

| scheme  | protocol | per-origin connection limit     |
| ------- | -------- | ------------------------------- |
| `http`  | HTTP/1.1 | 6, and streams compete for them |
| `https` | HTTP/2   | multiplexed, no practical limit |

## Hosting note

The file is pretty-printed so that merge request diffs are readable. Indentation is almost pure
redundancy, so it costs about 3 KB gzipped, but only if the host actually compresses it.

`docs.coolercontrol.org` gzips HTML but not `application/json`, so it currently serves this file
uncompressed. Adding the JSON type to Apache's `mod_deflate` config makes the download roughly 5
times smaller than it is today:

```apache
AddOutputFilterByType DEFLATE application/json
```
