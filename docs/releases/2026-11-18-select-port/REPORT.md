# Export format picker port to production — 2026-11-18

Commit `e27c226` on `codex/visual-redesign`; production deploy
`echo-listenultra-ebre-ggni1pzd3` (a same-tree duplicate `d71hc1swr`
landed alongside; alias points to the latest). Live bundle
`index-UD9ckSug.js` + `index-DVdlf6Sr.css` byte-identical to the local
build.

## Change

`redesign.css` gains the redesigned export format picker, ported
byte-identical (modulo CRLF) from `febd01c` in the design delivery repo
(`instagram-reel-transcript`): native-select shell with inline SVG arrow
(13px stroke data-URI, cream twin on the dark plane), 14px/500 label,
and — where the browser exposes `appearance: base-select` — a `--surface`
panel hanging from the pill's left edge, `--field` marking the chosen row,
`::checkmark` pinned to the row end, and a `@supports not` fallback that
stops white lists appearing on the dark plane. The mobile flex overrides
for `.reel-export select` and the `.reel-result-actions .button` rules are
untouched, so the `<select>` stays native: keyboard, screen readers and
phone pickers behave exactly as before.

## Live acceptance

- 25-point Playwright audit against `https://reelstranscript.com/` with a
  mocked `/api/reel-transcribe` (no transcription quota spent): 25/25 —
  46.00px pill at 14px/500 matching the adjacent buttons; panel left edge
  Δ0.0px from the pill; three rows at 43px equal spacing with identical
  text column; checked row on `--field`; checkmark absolute right:14px;
  dark-theme unselected rows fully transparent; no horizontal scroll at
  320/390/768/1440; keyboard flow swaps the download button label
  (Download SRT / Download Markdown / Download text). Zero page errors.
- Head fields (title/description/robots/canonical/H1) byte-identical to
  the previous deploy.
- Regressions: og/home.png 200 image/png, /settings `noindex, follow`,
  sw.js 200, newsreader font 200.
- Suite: node 162/162, `tsc --noEmit` clean (run before the build).
