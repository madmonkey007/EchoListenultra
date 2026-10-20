# YouTube / TikTok link import

Link import is independent of Google login and Supabase. The browser submits a public video link to the same-origin `/api/video-import` route. That route authenticates to a separate private extraction worker; completed MP3 audio then enters the existing browser import, splitting and optional user-key transcription flow. Neither source video nor extracted audio is stored in the account database.

## Local configuration

Install and run the worker using [its README](../server/video-import/README.md). Set these **server-only** values in `.env.local`, then restart Vite:

```
VIDEO_IMPORT_WORKER_URL=http://127.0.0.1:8787
VIDEO_IMPORT_WORKER_SECRET=<same random secret configured on the worker, at least 32 characters>
```

The worker URL may use HTTP only on localhost; a remote worker requires HTTPS. Do not put either setting in a `VITE_` variable. Missing configuration returns an explicit503; local audio imports continue to work.

## Proxy contract and limits

- `POST /api/video-import`, `Content-Type: application/json`, `{ "url": "https://youtu.be/..." }` returns `{id,status,title}`. Request body is capped at4KiB. Only exact HTTPS YouTube/TikTok hostnames, including their documented short-link hosts, are accepted. Credentials, custom ports and unrelated domains are rejected.
- `GET /api/video-import?id=<32 lowercase hex characters>` returns `queued`, `processing`, `ready` or `failed`.
- `GET /api/video-import?id=<id>&audio=1` returns `audio/mpeg`. The proxy buffers at most4MiB and rejects oversized, empty or incorrectly typed upstream responses. It never redirects the browser to a secret-bearing worker endpoint.

The same-origin proxy sends `Authorization: Bearer <worker secret>` and `X-Echo-Client`, a43-character base64url network HMAC derived from the trusted socket address (or Vercel's overwritten address header). It ignores browser-supplied client identity. IPv6 addresses are grouped by /64. The worker uses this opaque value for its rate limit. It receives no Google identity or raw forwarded browser IP.

Status requests time out after10seconds; audio transfer after20seconds. Worker responses are bounded and browser responses expose only the public job contract, not upstream paths or credentials. No CORS is enabled; cross-origin browser requests are rejected. Job IDs are random capability tokens: keep them private, and do not add them to analytics or public links.

## Deployment boundary

Deploy the web app/functions on Vercel and the worker on a persistent isolated container/VM. Vercel cannot host the downloader process. MP3 conversion is capped at10minutes,48kbps mono and4MiB, below the [Vercel function response size limit](https://vercel.com/docs/functions/limitations). Configure the same server settings in the web deployment and restrict worker ingress. Follow the worker README's required outbound network isolation, disk/process quotas, temporary file cleanup and pilot-only in-memory rate-limit limitations before public exposure.

The feature extracts public media without platform cookies. Private, restricted, live, deleted, region-blocked or otherwise inaccessible videos can fail. Real YouTube/TikTok download behavior depends on platform/extractor changes; automated tests use mocked extraction and do not prove live platform access. No platform-funded transcription or account quota is activated by this feature.
