# Private video import worker

This is a standalone Python 3.10+ service for a trusted same-origin web proxy. It does not depend on Google login, Supabase, npm packages or paid transcription. It extracts audio; the existing browser import flow handles segmentation/transcription afterward.

Install modern `yt-dlp` with its EJS components (the `yt-dlp[default]` distribution or official executable), `ffmpeg`, and the `deno` JavaScript runtime through their official installation instructions. All three executables must be on PATH; startup and health checks reject missing tools. Then run from the repository root:

```sh
export VIDEO_IMPORT_WORKER_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
python3 server/video-import/worker.py --host 127.0.0.1 --port 8787
```

Configure the web server proxy with the same secret and the private worker URL. Never expose this secret in a `VITE_` variable. For separate hosts, put the worker behind HTTPS, restrict ingress to the proxy, and use a private service network where possible. Requests require `Authorization: Bearer <secret>` even on localhost. Browser Origin headers are rejected and no CORS headers are emitted.

## Contract

- `GET /health`: `{ready:boolean}` (executables available).
- `POST /imports`, JSON `{url:string}`: HTTP202, `{id,status}`.
- `GET /imports/:id`: `{id,status,title?,duration?,error?,updated}`. Status is `queued`, `processing`, `ready` or `failed`.
- `GET /imports/:id/audio`: ready MP3 with attachment disposition; HTTP409 if not ready.
- Trusted proxy sends `X-Echo-Client` as its stable anonymous network HMAC. Never forward a browser-supplied header. Socket IP is the fallback. Job IDs are random 128-bit capabilities and expire after 30 minutes. No browser user identity is required.

Limits: one processing job, four queued jobs, 20 retained jobs total, five accepted imports per network identity per rolling hour. HTTPS single-video entry links only, including `youtu.be`, YouTube Shorts, TikTok video and `vm`/`vt` short links. Playlist/profile/live entry routes are rejected. Metadata must include a finite positive duration up to 10 minutes; downloaded input up to100MiB, output mono MP3 48kbps up to4MiB. No source cookies, credentials, arbitrary extractor, shell command interpolation or yt-dlp configuration/plugins are accepted. Commands have timeouts; a watchdog kills the process group on timeout or excess downloaded bytes. Results and failed partial files are removed; abandoned job directories are removed at startup.

## Hosting boundary

Use a persistent container/VM with writable scratch storage for this worker. Do not run the long downloader process in a Vercel web function. The web function is a short same-origin proxy; MP3 output stays below its documented4.5MB response limit. See [Vercel function limits](https://vercel.com/docs/functions/limitations) and [yt-dlp official options and dependencies](https://github.com/yt-dlp/yt-dlp#usage-and-options). Review external executable updates and test current platform behavior before release. YouTube extraction uses Deno and yt-dlp EJS; these are required deployment dependencies. Some platform videos will remain inaccessible without cookies, which this service deliberately does not use.

**Network isolation is required before internet deployment.** Host allowlisting controls the initial link, and extractor selection excludes Generic, but yt-dlp makes subsequent redirects/API/CDN requests. This is not a complete SSRF firewall. Run as an unprivileged isolated container with outbound firewall rules denying loopback, private/link-local/metadata networks for both IPv4 and IPv6 and prevent DNS rebinding; do not give it cloud credentials or access to internal services. Set container CPU/memory/process and disk quotas, a dedicated data directory and a reverse-proxy body/connection limit. The watchdog bounds normal download disk use with a short polling interval; filesystem quotas supply the hard boundary. Do not run multiple instances sharing a data directory.

This first version keeps queue/rate state in memory: restarting clears rate counters and pending jobs. It is suitable for a bounded single-instance pilot, not a distributed abuse-control ledger. Add durable shared rate/global transfer limits before scaling. No platform-funded AI operation runs here. Only import public media the user has permission to use; platform restrictions and regional availability still apply.

## Verification

```sh
python3 -m unittest discover -s server/video-import -p 'test_*.py' -v
```

Tests exercise URL rejection, command arguments, metadata duration rejection, queue/rate/expiry/failure behavior and a real local HTTP server. They mock media extraction and make no platform video downloads or paid API requests. Real YouTube/TikTok extraction and deployed proxy networking still require deployment smoke tests.
