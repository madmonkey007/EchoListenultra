# Favicon redraw — 2026-11-18

Commit `51f9941` on `codex/visual-redesign`; production deploy
`echo-listenultra-ebre-qr640de84`, live `/favicon.svg` byte-identical to
the repo file.

## Change

The tab icon was the only surface never touched by the visual redesign:
`public/favicon.svg` still carried the first-draft mark (dark-navy tile
`#10171e`, mint strokes `#9ce6c4`, asymmetric stroke lengths
14/34/50/26/14) from the initial website commit, while the in-page brand
uses the paper-and-ink glyph. Replaced with the header brand glyph scaled
exactly 2× (stroke lengths 16/36/52/32/16, stroke-width 6, round caps) on
the ink tile `#1b1712` with paper strokes `#f3eee2` — both existing token
values, fixed (favicons have no currentColor theme context).

Verification: pixel-probed the rendered 64px SVG (center stroke
rgb(243,238,226) = `#f3eee2` exact; tile margins and inter-stroke gaps
rgb(27,23,18) = `#1b1712` exact; rounded-corner transparency 3.3% ≈
theoretical). 162/162 suite, build clean, bundle hashes unchanged
(`index-DVdlf6Sr.css` / `index-BvuQQ9nE.js` — static-file-only swap).

## Regressions (live)

`/favicon.svg` 200 + byte-parity; head icon links unchanged; `/og/home.png`
200; `/settings` `noindex, follow`; `/sw.js` 200; `/logo-512.png` sha
`8675e34a53ff7293` unchanged (6388 bytes, matches og-assets pin);
`/favicon.ico` 404 = pre-existing (never provided; Safari fallback
unchanged).

## Notes

- Browser favicon caches are independent of hard refresh; already-open
  tabs may show the old icon until the browser restarts or the favicon
  cache is cleared. Visiting `/favicon.svg` directly re-fetches it.
- Vercel cache stays default `max-age=0 must-revalidate` (same decision
  as the OG assets: fixed filename, redeploy swaps content).
