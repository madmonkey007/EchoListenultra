# Quota-failover rollout — 2026-11-18

Commit `ba164c0` on `codex/visual-redesign`; production deploy
`dpl_vDC61a1f6YNiV2eghFEJDrnxamEA` (alias `reelstranscript.com`), 07:31 CST.

## Incident

Site-wide transcription failures ("There is a problem on our side…") since the
2026-11-17 UTC daytime. Runtime logs showed the cause verbatim:

```
upstream_status: 429
AiError: you have used up your daily free allocation of 10,000 neurons … (code 4006)
```

Cloudflare Workers AI free tier: 10,000 neurons/day (whisper-large-v3-turbo ≈
46.63 neurons/audio-minute ⇒ ≈ 214 audio-minutes/day). Organic traffic plus
uncached retries consumed the pool. Nothing code-side was broken; the
long-suspected "502 with correct JSON" was the frozen chain's generic
exception→502 mapping, not a crash.

## Fix (transport layer only, frozen chain untouched)

- `api/reel-transcribe.py` builds a credential pair list (primary +
  optional `CLOUDFLARE_ACCOUNT_ID_2`/`CLOUDFLARE_API_TOKEN_2`, Production
  scope) and writes the selected pair into the variable names the frozen
  chain reads at call time, before each attempt.
- On a Cloudflare 429 (`HTTPError` + `429` detail, status 502) with a next
  pair available: the reply is swallowed, the request body is replayed from
  a stashed copy, and the whole chain runs again on the second account.
  Users never see the intermediate failure.
- Progress frames are suppressed on retry attempts so the client's
  forward-only stage validation (`completed < lastCompleted` guard in
  `lib/reel-client.ts`) holds.
- When no second pair exists or both are spent, the failure maps to a new
  `quota_exhausted` code; the client names it honestly: "Today's free
  transcription quota is used up. Please try again tomorrow."
- Non-quota failures still answer from the first attempt (no pointless
  rotation).

Second Cloudflare account configured by the user (account id `f2beaaf6…`,
Workers-AI-Run token, no IP filter, no expiry) → Vercel env vars, 06:55–07:05 CST.

## Verification

- Python suite 33/33 (6 new contract tests: replay-on-second-account,
  both-exhausted payload, no-rotation for non-quota, stream monotonicity
  across failover, stream error frame, single-account honesty).
- Node suite 154/154 (new: quota message contract). tsc clean.
- Live end-to-end: real Reel → ndjson stream → progress 0/1/2 → result 200
  with full transcript, cues, SRT (~16s). Site recovered before the 08:00 CST
  quota reset, i.e. served while the primary account was still exhausted.
- Live bundle `index-AHfeUcWO.js` byte-identical to local build; quota copy
  present in the served bundle; css unchanged (`index-lpVMlu_g.css`).
- Regressions: `/logo-512.png` 200, spaced-logo URL still 404, fonts 200.

## Open items

- **Attribution**: the served 200s produced no `upstream_status: 429`
  diagnostic lines, though rotation semantics require them if the primary
  account was hit. Two readings: (a) the stderr diagnostics didn't reach the
  log drain for this instance, (b) the primary quota un-exhausted before
  23:32 UTC (contradicts the documented 00:00 UTC reset). Decisive check is
  the second account's Workers-AI usage dashboard; operationally moot after
  the 08:00 CST reset gives both accounts fresh allocations. Watch it once:
  when the primary pool burns mid-day again, the logs must show the 429 +
  transparent recovery.
- `CACHE_NAME` left at v3 deliberately: assets are content-hashed and the
  shell is re-fetched on every SW install, so stale entries are unused, not
  served. Bump on the next deploy that changes reference semantics.
- Daily capacity is now ~2× (≈ 428 audio-minutes across both accounts) until
  a Workers Paid upgrade removes the ceiling entirely (~$5/mo base; overage
  $0.011/1k neurons).
