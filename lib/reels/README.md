# Reels extraction contract

Server-side only. Import `extractReel` from `lib/reels/index.ts`.
It returns `Promise<ReelResult>` and converts adapter failures into the six public
error codes. No downloads, subprocesses, quota accounting, or provider calls are
implemented in this iteration.

- `REELS_FETCHER=local` (default) selects `LocalYtDlp`.
- `REELS_FETCHER=remote` selects `RemoteFetcher`.
- Both adapters currently throw `not_implemented`, returned as `internal_error`.
- `MAX_AUDIO_SECONDS` defaults to 180 only when unset. An invalid/nonpositive
  setting returns `internal_error`. A duration equal to the limit is accepted.
- Only HTTPS Instagram `reel`, `reels`, and `p` paths with an ASCII media ID
  are accepted. Bare, www, and m hosts normalize to www; all query parameters
  and fragments are removed. Invalid input fails before adapter invocation.
- `PROBE_ERROR_MAP` covers all diagnostic categories in
  `scripts/ig-probe/probe.py`; comments explain each mapping. Upstream rate
  limits map to `fetch_blocked`; `quota_exceeded` is reserved for application
  quota failures supplied as `ReelError` by future integration.

`ReelFetcher.fetch()` accepts a normalized URL and returns `ReelAudio`.
`createReelExtractor(fetcher, env)` permits offline testing and future adapter
integration. Adapters can throw `ReelError` for known public failures or an
object with a probe `category` for diagnostic translation. Unknown failures
become `internal_error` without exposing raw provider logs.

The shared boundary checks returned audio duration. Future implementations
should additionally preflight metadata to reject long media before download;
no such preflight or real extraction is claimed by the stubs.
