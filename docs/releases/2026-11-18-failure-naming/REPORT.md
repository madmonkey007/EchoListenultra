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

- Row 5 closed live after rollout: the owner-supplied music-only reel
  (instagram.com/reel/C92zpvTufv5/) returned HTTP 422
  `{"error": "no_speech", "limit_seconds": 180}` from production. An
  initial report of the old "problem on our side" copy for this same
  link came from a browser tab loaded before the deploy — the deployed
  bundle cannot produce that string, and the service worker serves
  navigations network-first, so a reload shows the new copy.
- Row 4 (>3 min) is unreachable for Reels by design: Instagram caps
  Reels at 3:00 — exactly MAX_AUDIO_SECONDS — so no /reel/ link can
  exceed the limit (179/180 accepted, 181 rejected). The `too_long`
  path fires only for long feed-video `/p/` posts, is byte-identical to
  the pre-existing production behavior, and its measured-duration
  message is contract-tested. A long /p/ feed-video link would close it
  live if one is ever wanted.
- A real private-account link (vs nonexistent) still maps through the same
  "empty media response"/wall family; verifying one live would close the
  last wording edge.
