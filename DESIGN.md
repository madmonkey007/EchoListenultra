# Website design system — "paper and ink" (2026-11 redesign)

Supersedes the previous dark-navy/mint system. The redesign ships as a visual
layer (`public/assets/redesign.css`) loaded **after** `website.css` and
`tailwind.css`; it changes appearance only — no copy, markup structure, routes,
or metadata. Design delivery reviewed and ported from
`github.com/madmonkey007/instagram-reel-transcript` (private, `main`).

## Identity

- **Warm paper, warm ink, one rubric.** Light plane `#f6f1e6` (paper), dark
  plane `#12100d`; accent is an iron-gall red (`#5e2416` light / `#94513a`
  dark) reserved for exactly three things: the primary pill, the progress bar,
  and the margin rule on the line being read. Nothing else borrows it.
- **Type.** Two self-hosted families, no third-party font CDN: Newsreader
  ("Paper Serif" — display line, section headings, transcript) and Plus
  Jakarta Sans ("Reel Sans" alias — interface). Preloads ship for the two
  latin files.
- **Light is the default theme; dark is opt-in.** A pre-paint script in
  `index.html` reads `localStorage.echo_api_config.theme` and switches before
  first paint (no flash), keeping `meta[name=theme-color]` in step. The two
  plane hexes must agree in three places: the boot script, the static meta,
  and the `--bg` tokens in redesign.css (enforced by tests).

## Icon layer

The Material Symbols icon **font is retired** (no CDN, no font file). Icons
are inline SVG injected at runtime by `lib/icons.ts` (`initIconLayer()`,
wired in `index.tsx`): it scans `.material-symbols-outlined` spans, replaces
the ligature name with the mapped SVG, and observes the DOM for React
re-renders. Rules:

- Every glyph name used in source must resolve in `ICONS`/`ALIAS` (enforced
  by `tests/redesign-layer.test.cjs`). Unmapped names are **cleared, never
  left as visible text**.
- `body[data-icons="inline"]` sets `font-size: 0` so no-JS visitors never see
  raw ligature names; icons are decorative and aria-hidden throughout.
- New glyphs come from Material Symbols official 24px outlined SVGs
  (`viewBox="0 -960 960 960"`), not hand-drawn approximations.

## Structural conventions

- **FAQ single source.** `lib/home-faq.ts` feeds the React section
  (LandingView), the prerendered home shell, and the FAQPage JSON-LD. The
  shell FAQ is injected at build time by `lib/static-seo.ts`; the JSON-LD is
  added after the inner pages derive, so it stays on the one page that
  displays it. Rows are `<h3>` over `<p>`, never `<details>`.
- **Timecodes are display-rounded to whole seconds** (`ReelResult`), with
  ends rounding up so consecutive passages meet. SRT export keeps full
  server-side milliseconds. The home shell specimen and the React example
  must print identical strings (enforced by tests).
- **Hidden line breaks carry a real space** (`From a Reel. <br />`) — the
  stylesheet suppresses these breaks on wide columns and the space prevents
  glued words in copied text.
- **Mail is the one contact mark** (header link and feedback fab both use the
  envelope), one job, one glyph.

## Infrastructure invariants

- The three stylesheets (website.css, tailwind.css, redesign.css) are
  imported in that order from `index.tsx`, so Vite bundles them into one
  cascade-correct `/assets/index-*.css` under the service worker's precache
  rule; fonts live at `/assets/fonts/`. Bump `CACHE_NAME` in `public/sw.js`
  when the shell's cached references change.
- SEO pages remain prerendered per-route with their own titles/robots; the
  visual layer is global — there is no per-page theme split.

## Layout and behaviour (carried over)

Full-width site with a ~1040px reading measure. The paste field is the page's
protagonist with five designed states (idle, focus, processing, done, fail).
Flat surfaces, 1px separators, generous whitespace; avoid decorative
statistics and nested panels. Respect reduced motion and keyboard focus
(every interactive stop shows a visible focus ring).
