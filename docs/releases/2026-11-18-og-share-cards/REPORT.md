# OG share cards rollout — 2026-11-18

Commit `c4b08e9` on `codex/visual-redesign`; production deploy
`dpl_4LznKHB7znrBjXcVkzEqBxAS6dJk` (alias `reelstranscript.com`), 11:17 CST.
A second Ready deployment from the same tree (`7rw0y9e0f`, a minute earlier)
was created by deploy retries during a Clash flake; the alias points at the
latest. Both are byte-identical content.

## Change

Design delivery from `madmonkey007/instagram-reel-transcript` (private, main),
cloned to /tmp, checksums (bytes + sha256-16) verified before the copy and
re-verified in `public/` and in `dist/`. Guarded forever by
`tests/og-assets.test.cjs` (byte-exact manifest assertion).

- `public/og/{home,instagram-reel-transcript,reels-transcript,
  instagram-reel-transcript-generator,instagram-video-transcript}.png`
  (1200×630), `public/logo-512.png` (replaced: 9760→6388 bytes per the
  delivery), `public/logo-512-white.png` (new).
- `index.html` (shared shell = home template): the 8-line card block sits
  directly after `og:type`, replacing the old single
  `twitter:card=summary` line; `%SITE_ORIGIN%` placeholders render to the
  apex origin like canonical/og:url. `apple-touch-icon` added next to the
  favicon link (shared shell, so all prerendered pages carry it).
- `lib/site-meta.ts`: `shareImages` map — five routes → image + alt; alts
  mirror each page's H1 verbatim (home: "Instagram Transcript from Any Reel").
- `lib/render-public-pages.tsx`: carded routes get og:image/og:image:alt/
  twitter:image/twitter:image:alt swapped to their own values (card, width,
  height, type stay from the shell); the six untouched routes get the card
  tags stripped and the original `twitter:card=summary` line restored, so
  their heads are unchanged except the shared apple-touch-icon line.

## Verification (local build + live)

- Node suite 156/156 (154 baseline + share-card contract + byte-exact
  og-assets manifest). Client bundle hashes unchanged
  (`index-AHfeUcWO.js` / `index-lpVMlu_g.css`) — zero JS/CSS change.
- Built pages: five carded pages carry exactly one card (5 og:image*
  properties, 1 twitter:card); the only removed line vs baseline dist is the
  old summary card; title/description/canonical/robots/og:title/og:description/
  og:url/H1/JSON-LD byte-identical. The five untouched prerendered pages diff
  by exactly one added line (apple-touch-icon).
- Live: acceptance A (tags in raw server HTML) and B (200, image/png,
  manifest content-lengths) green; live sha256-16 of all six files equal to
  the delivery manifest (no recompression); C green (no x-robots /
  www-authenticate); `/settings` still `noindex, follow`; untouched routes
  show zero card lines and keep `twitter:card=summary`.

## Cache

`/og/*.png` and HTML serve `cache-control: public, max-age=0, must-revalidate`
with etag (`x-vercel-cache: HIT` at edge). Decision: keep the default, do NOT
make them immutable — filenames are fixed (`og/home.png`), and future image
swaps only need a redeploy; browsers revalidate by etag (304), and Vercel's
edge cache is per-deployment, so the alias swap is the purge. Immutability
would force filename changes on every future image edit for no benefit here.

## Open items

- The three requested validators (X cards-dev, Facebook Sharing Debugger,
  LinkedIn Post Inspector) all hard-require platform logins (LinkedIn shown
  to redirect to its login wall even in a headed browser; third-party preview
  sites bot-block automation). The user must run them logged in; FB needs
  "Scrape Again" to drop its cache of the old head.
- If the six remaining routes should get cards later, reuse `home.png` per
  the owner's instruction — no new images.
