# Home in-body cross-link — 2026-11-20

Commit `15671b4` on `codex/visual-redesign`; production deploy
`echo-listenultra-ebre-ql8r6tys5` (alias `reelstranscript.com`).

## Change

One paragraph added to the home shell (`index.html`) as a direct child of
`<main>`, placed after the example section and — via the build-time FAQ
injection (`home.replace('</main>', …)`) — before
`<section class="faq-section">`. It carries a single internal link to the
`/instagram-reel-transcript` walkthrough. Verbatim text as supplied; no
other element in `<main>` touched.

Scope check before deploy: the live↔dist diff of the whole site was
exactly this paragraph (the 2026-11-19 SEO content batch was already in
production), so the rollout carried nothing else.

## Acceptance (live raw HTML, no JS)

| Check | Result |
| --- | --- |
| main contains `href="/instagram-reel-transcript"` | exactly 1 (footer's guide link is outside main; whole page total 2) |
| anchor text | `Instagram Reel transcript` exact |
| footer-content-links 4 guide links | byte-identical to pre-change |
| head (title/description/canonical/robots incl.) | byte-identical to pre-change |
| position | `</section>` (8130) < new `<p>` (8145) < `faq-section` (8371) |
| byte delta | 10897 → 11124, +227 as predicted |

162/162 suite green before commit; FAQPage JSON-LD byte-identical.

## Boundary note

The paragraph lives in the static HTML layer only. The React runtime view
(`LandingView`) was intentionally not touched, so after hydration the
interactive DOM does not render it — crawlers and JS-off visitors see it;
JS-on visitors do not. Mirroring it into `LandingView` is a separate,
unrequested change.
