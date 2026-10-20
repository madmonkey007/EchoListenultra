# Audio import placement and independent video imports

User request: move the desktop upload box higher, list formats inside, start YouTube/TikTok separately from Google login. User instructed continuing without another design handoff.

Preserve existing visual identity. Put file selection immediately after the heading, list actual accepted formats and browser playback caveat, then a collapsible video-link form, followed by storage/account/transcription guidance. Existing file and local/BYOK flows remain intact.

Use a same-origin Node proxy and a separate private Python worker using externally installed yt-dlp and ffmpeg. No new npm dependency. Accept only public individual YouTube/TikTok videos up to 10 minutes, download <=100MiB, output mono48kbps MP3 <=4MiB to fit the Vercel response cap. Opaque32hex jobs: submit, poll, download; never expose worker secret or provider credentials. No dependency on Supabase/Google login. Apply independent per-network throttling and queue bounds. Require isolated worker egress before public activation; allowlisted entry URLs do not control extractor redirects or CDN requests.

States: queued, processing, ready, failed; cancellation stops client waiting, worker finishes/cleans normally. Selected file is replaced only after successful bounded MP3 retrieval. Unconfigured service returns explicit recovery; no fake success or claim of deployed download availability.

Verification: client mocked contract/cancellation/malformedID/audio caps, proxy real HTTP and upstream stubs, Python real local HTTP/mock downloader, existing full test suite/typecheck/build, desktop/mobile no-overflow screenshots. Real platform downloads require yt-dlp/ffmpeg installed in deployment environment; not yet validated.
