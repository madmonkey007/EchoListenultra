# Release report — SEO content batch (cross-links, sitemap lastmod, definition paragraphs)

- Date: 2026-11-19
- Branch: `codex/visual-redesign`, code commit `6c30840` (parent `ebe1be3`)
- Deployment: `dpl_Gm9979n5JHLesH1Jt8s9qpv51tM9` (production, Ready, created 2026-11-19 21:01 CST)
- Scope: three content tasks; zero changes to titles, descriptions, H1s,
  canonicals, robots, or og tags; no existing sentence altered (all edits are
  pure insertions; 6 files, +18/−13).

## 1. In-body cross-links (4 guide pages × 2)

Each transition sentence appended to the end of an existing paragraph that
already covers output shape or limits; original sentences preserved verbatim.

| Page | Paragraph | Body links (keyword anchors) |
| --- | --- | --- |
| /instagram-reel-transcript | "What the finished transcript looks like" | Instagram video transcript →; Instagram reel transcript generator → |
| /reels-transcript | "Using the transcript for subtitles" | Instagram Reel transcript →; Instagram video transcript → |
| /instagram-reel-transcript-generator | "Cost, setup and limits" | Instagram Reel transcript →; Reels transcript → |
| /instagram-video-transcript | "Video posts versus Reels: what differs" | Reels transcript →; Instagram Reel transcript → |

Footer links untouched (home `footer-content-links` byte-pinned by
`tests/home-chrome.test.cjs`).

## 2. sitemap.xml lastmod (9/9)

`public/sitemap.xml` gained `<lastmod>` per URL; dates: the five pages this
batch touches = 2026-11-19 (the batch itself is their newest actual change),
about/privacy = 2026-11-18, help/contact = 2026-11-18. (about/privacy were
first set to 2026-11-08, the date of their last content-only commit; corrected
to 2026-11-18 because the sitewide 11-18 redesign — inline SVG icons, static
header — also changed their rendered HTML.)

## 3. Definition paragraphs (5 pages)

One self-contained 84–111-word paragraph before each page's first H2:

- Home (`index.html` static body, before the example section) — ~99 words
- /instagram-reel-transcript — ~111 words
- /reels-transcript — ~110 words
- /instagram-reel-transcript-generator — ~111 words
- /instagram-video-transcript — ~84 words (user-approved sample, verbatim)

Facts match existing site claims (3-minute/180-second limit, public links
only, speech required, no login, SRT/Markdown/plain-text export). No
"best/#1/fastest/unlimited"; the `#1` grep hit is the hex color `#12100d`
inside the head theme script, not copy.

## Pre-deploy verification

- `npm test`: 162/162 pass; `tsc --noEmit`: clean
- Word budgets 819/779/813/744 (limit 400–900)
- All 13 edited lines verified as pure appends (existing text preserved
  verbatim, suffix-aware prefix check)

## Live acceptance (curl, reelstranscript.com)

| Check | Result |
| --- | --- |
| sitemap.xml lastmod count | 9/9, origin rendered https://reelstranscript.com |
| Definition paragraph present (/, 4 guides) | 5/5 |
| Definition paragraph before first H2 (home + guide spot-check) | pass |
| Body transition sentences per guide page (2 markers each) | 2/2 × 4 pages |
| Home title / canonical byte-identical | pass |
| Guide links total per page | home 4 (footer only); each guide 5 (3 RelatedPages + 2 new body) |
