# Five-way failure naming rollout — 2026-11-18

Commit `b34430f` on `codex/visual-redesign`; production deploy
`echo-listenultra-ebre-lrmcw2dk8` (alias `reelstranscript.com`), ~12:40 CST.
Live bundle `index-DxfQcDhn.js` byte-identical to the local build
(sha256-16 `06629d0c26675ad4`).

## Change

Post-level transcription failures now name five distinct causes instead of
one lumped apology. Classification happens in the extraction probe
(`server/transcription/probe_classify.py`, yt_dlp-free and offline-testable)
using stable prefixes on the emitted error string — the same mechanism the
chain already used for `too_long:` — so `chain_entry.py` and `turbo.py` stay
untouched. The transport (`api/reel-transcribe.py`) maps the prefixes, keeps
its legacy substring fallback, and converts the chain's silent-audio 200
(`no_speech_detected`) into a named 422 `no_speech` failure. Client copy
(`lib/reel-client.ts`) gives each class one sentence stating why the post
cannot be transcribed and what to try instead; "try again" appears only in
the genuinely retryable generic failure and in quota exhaustion. "There is a
problem on our side" is gone from the codebase and from the served bundle
(grep count: 0).

Classification corpus was captured from production runtime logs on
2026-11-18 (the local IP hits Instagram's anonymous wall and cannot
distinguish these cases):

- image/photo posts (both owner-supplied URLs, canonical ids Df2PIzluJ3_ /
  DfkPYnzuk9O after Instagram share-code redirects): "No video formats
  found!" → `no_video`
- deleted post (fabricated id, 2 hits): "Instagram sent an empty media
  response…" → `private_or_unavailable`
- anonymous-wall string: "Requested content is not available, rate-limit
  reached or login required" → `private_or_unavailable`
- transient network (IncompleteRead/timeouts): unclassified → `fetch_failed`

## Live acceptance

| Input | Reply |
| --- | --- |
| instagram.com/p/Df2PO99ICGy/ | `{"error": "no_video", "limit_seconds": 180}` |
| instagram.com/p/DfkQCmCoH68/ | `{"error": "no_video", "limit_seconds": 180}` |
| instagram.com/reel/DeejOF4AfBe/ (normal) | `transcribed`, 7 cues, full SRT — text identical to the pre-deploy capture |
| instagram.com/p/DQdEadEl1Xq/ (nonexistent) | `{"error": "private_or_unavailable", "limit_seconds": 180}` |

- Suite: Python 41/41 (8 new pins: verbatim production strings → codes,
  prefix mapping, no_speech 422 non-stream + stream error frame with
  monotonic progress, transient stays generic, malformed link stays
  invalid_url), node 157/157 (five distinct messages, no "our side", retry
  wording only in the two retryable cases), tsc clean.
- Regressions after deploy: /og/home.png 200, homepage og:image ×5,
  /settings `noindex, follow`, /about zero card lines, sw.js/fonts 200.

## Open items

- Rows 4 (>3 min → `too_long` with measured duration) and 5 (music-only →
  `no_speech`) could not be exercised live: no real >3-minute or
  music-only Instagram URL could be sourced (four search engines, Telegram
  previews and the profile API all yield nothing usable, and the local IP
  is walled). Both paths are contract-tested offline and the too_long
  branch is byte-identical to the pre-existing production behavior; pending
  a real link from the owner for the final two rows.
- A real private-account link (vs nonexistent) still maps through the same
  "empty media response"/wall family; verifying one live would close the
  last wording edge.
