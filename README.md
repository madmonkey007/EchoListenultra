# EchoListen

A no-sign-up website for practicing English with your own audio. Includes a public introduction, a playable synthetic-voice example, a local audio library, section looping, playback speed controls and vocabulary review.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For the release build:

```sh
npm run build
npm run preview
```

Validation:

```sh
npm run typecheck
npm test
```

## Using it

- `/`: introduction and playable example.
- `/library`: local audio library, including the bundled sample.
- `/add`: import a browser-supported audio file. Time-based splitting works without an API key.
- `/player/:id`: desktop segment sidebar, mobile transcript, looping, speed and word lookup.
- `/vocabulary`: saved words and review.
- `/settings`: optional personal Gemini/Deepgram key and theme.
- `/help`: setup, data handling and troubleshooting.

Old hash links (`/#/player/...`) are migrated to the corresponding real path. Existing `echo_sessions`, `echo_words_v2`, `echo_api_config` and IndexedDB audio records retain their names. The built-in sample is upgraded without replacing uploaded sessions.

## Transcription and data

Optional Google accounts track online allowance where configured. No cloud backup or cross-device sync. Audio files use IndexedDB; lessons, words and preferences use localStorage. Keep the original audio: browser cleanup, private mode and storage eviction can remove data.

AI transcription is optional. Users supply their own Gemini or Deepgram key in Settings. Audio goes directly from the browser to the selected provider and may incur provider charges. Keys are stored in the current browser, so use a trusted device and provider limits. **Do not put an operator API key in Vite environment variables.** This project no longer injects `GEMINI_API_KEY` into client JavaScript.

New word lookups contact third-party dictionary/translation services unless a saved or cached definition is available. The sample's word “rhythm” has a built-in definition for trying vocabulary without a key.

## Deploy to Vercel

Use the existing Vite project: build `npm run build`, output `dist`. No server secret is needed for time splitting or the bundled sample. Existing Vercel configuration rewrites application paths and preserves static resources. `public/sw.js` and `public/manifest.json` are copied into the release. Deployment is a separate step; local changes do not update the current hosted version.

## Offline and verification limits

The production service worker caches the application shell and emitted local scripts/styles. Uploaded audio is local. Fonts and the legacy Tailwind runtime still load from external CDNs; full offline styling is not guaranteed. Uncached vocabulary and AI transcription need a connection. Automated checks do not validate live paid provider calls.

The demo is original text read with the macOS Samantha synthetic voice, delivered as a bundled WAV. It is explicitly labelled synthetic in the interface.

## Subtitle timing

Word highlighting is driven by provider word timestamps and the audio element's media clock, including at changed playback rates. No word-length interpolation or playback-rate look-ahead is used. Silence has no highlighted word. The player uses animation frames while visible plus native media events for seeks and background updates.

New Deepgram transcripts preserve absolute word start/end times. Gemini may omit word timing; syntactically valid model timestamps are not a guarantee of acoustic accuracy. Prefer Deepgram for word-level alignment. Legacy lessons lacking complete timings show section-level captions instead of estimated karaoke.

For an existing lesson, use **Align words with audio** after configuring your personal provider key. This sends the original locally saved recording to the provider, may incur provider charges, and replaces captions only after complete valid timestamps are returned. Failure keeps the original captions. There is no need to import the original file again unless its local audio has been removed.

The dev-only `tests/sync-harness.html` provides synthetic speech with known word pauses. Its provider responses are intercepted locally, so `?legacy=1` tests successful re-alignment and `?legacy=1&invalid=1` tests preserving old captions on failure without contacting a paid provider. The harness is not part of the production build entry.

## Sentence splitting

Import offers three modes: sentence, time and speaker turns. With an online transcription key, sentence mode defaults to one sentence; choose 1, 2 or 3 per section. Without a key, time splitting stays the default and sentence mode is disabled. If transcription fails during import, the existing clearly-labelled time fallback remains available.

Deepgram sentence boundaries use its punctuated words, retaining absolute word timestamps. Common abbreviations and closing quotation marks are handled. Gemini is asked for a timestamped segment per sentence; word-timed segments can be split deterministically, while an untimed multi-sentence paragraph is rejected rather than assigned invented boundaries. Final incomplete phrases and partial groups are retained.

## Contact and release foundations (0.1.0)

`/contact` publishes dihou008@gmail.com and prepares a reviewable email draft. There is no website mail-sending backend: the visitor sends through their own mail application, or copies the text into webmail. Optional reply email and coarse browser/version information are explicit fields; private learning data and keys are never automatically attached. Header access remains available in the player, and other pages also have a floating feedback link.

`/about` and `/privacy` explain the individual project and data handling. Public pages alone are in `public/sitemap.xml`; personal workspace paths receive noindex metadata and Vercel headers. The existing production origin is set in `lib/site-meta.ts`, `index.html`, `public/sitemap.xml` and `public/robots.txt`; update these together when moving to a custom domain.

Import failures pause before saving. Users see a safe reason and can retry or deliberately accept the specified local time fallback. No-key local time splitting still saves directly.

### Minimal product events

`trackEvent` posts only a whitelisted action and app version to `/api/events`. No account, visitor identifier, cookie, audio, transcript, file name, email, API key or raw error message is in the payload. The endpoint enforces a 512-byte bound, exact fields, content type and browser-origin check, then writes the validated payload to the hosting service log. This is an event log foundation, **not** a dashboard, unique-user metric, billing ledger, durable aggregate or bot-proof count. Ordinary platform request logs and retention still apply.

Vite development exposes this same endpoint locally. A static `npm run preview` serves the website but cannot execute Vercel functions; the production endpoint needs a Vercel deployment and verification there. Analytics failure never blocks learning. There is no third-party replay or advertising integration.

Production deployment, actual mailbox receipt and inviting real learners are separate steps; no email was automatically sent during development.

## Optional Google sign-in and server allowance

`/account` shows sign-in and online-service status; `/login` starts Google OAuth PKCE and `/auth/callback` exchanges the authorization code. Copy `.env.example` to `.env.local` and fill only your own project configuration. The public Supabase URL and anonymous/publishable key enter the browser bundle; service-role key and cookie secret must stay server-only. No auth packages were added.

In Google Cloud, create a Web OAuth client, configure the consent screen for basic identity/email, and authorize `https://PROJECT.supabase.co/auth/v1/callback` (the Supabase URL, not the app callback). In Supabase Auth enable Google and enter that client ID/secret. Disable unused sign-in providers and anonymous Auth signups. Set the Site URL to your production origin. Add narrowly scoped redirect URLs for `https://YOUR-APP/auth/callback?state=*` and local development `http://localhost:3000/auth/callback?state=*` (or your chosen 127.0.0.1 origin), so PKCE state survives the redirect. Do not use a broad wildcard production domain. Use a stable deployment origin; preview URLs need explicit configuration. Test actual Google cancellation, successful callback, reload, refresh and logout before enabling public login.

See [supabase/README.md](supabase/README.md) for migration, environment and quotas. The ledger supports anonymous 2 lifetime requests of at most 5 minutes, Google accounts 3 requests/20 minutes per UTC day at most 10 minutes per job, network limits, a global daily budget and kill switches. Failures refund user allowance, but still count against the operator's conservative budget. Limits currently live in SQL and `QUOTA_LIMITS`; change both plus UI policy copy together when adjusting.

**This release does not contain a trusted platform-paid processor or a video downloader.** The platform service remains closed; status never invents spendable credits, and public POST cannot reserve or settle jobs. Local practice and direct BYOK calls do not use platform credits. Future paid work must measure duration on the server, reserve once, atomically claim once, settle internally and abort expired jobs before exposing results. Do not enable the switches until that integration exists.

Import now bounds local files to 100 MiB and 2 hours. The import-page account link saves selected audio/settings locally for up to one hour before navigation; returning restores the draft. Explicit discard, replacement or successful import removes it. Auth tokens are stored locally; signing out keeps learning data. Server account deletion requests go through contact; no deletion UI or cloud backup is included.

## Optional YouTube / TikTok link import

The import page includes a video-link form, independent of Google sign-in. Its same-origin API connects to a separately deployed private yt-dlp/ffmpeg/Deno worker; it is unavailable until server configuration is supplied. See [video import setup](docs/video-import.md). Real platform access is not yet verified successfully: local attempts received YouTube bot verification and a TikTok IP block. Do not describe this release as having a proven live video-download service.
