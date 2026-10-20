# Authentication and quota deployment

No additional package is required. Apply `migrations/202610200001_quota.sql` in the Supabase SQL editor as project owner. Repeated status reads verify the current user with Supabase and query the database; they are not billed AI operations but should still be subject to deployment-level request limits. The private schema has no browser grants; the accounting and cleanup public RPCs grant execution only to `service_role`. Never expose the service key through a `VITE_` variable.

Server environment:

- `SUPABASE_URL`: HTTPS project URL (the public `VITE_SUPABASE_URL` is also accepted as a URL fallback).
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key.
- `QUOTA_COOKIE_SECRET`: randomly generated secret, at least 32 characters. Rotation invalidates anonymous cookies. Keep stable across deployments.
- `QUOTA_DAILY_SECONDS`: total daily platform processing budget in seconds, default 3600 (60 minutes).
- `PLATFORM_PROCESSING_DISABLED`: defaults to disabled. Do not set `false` until a trusted server processor is integrated and tested.

`GET /api/quota` accepts an optional Supabase access token in `Authorization: Bearer …`. It verifies identity with `/auth/v1/user`; it never trusts client user IDs or decoded JWT claims. Only Google-linked users with confirmed email are accepted. Anonymous visitors receive a signed HttpOnly SameSite=Lax cookie, Secure on Vercel/HTTPS, expiring after one year. Network identifiers are HMAC hashes, not raw addresses. Vercel deployment reads only its overwritten `x-vercel-forwarded-for` header; local development uses the socket address. Missing trustworthy addresses fail closed. IPv6 buckets use /64. Behind other proxies a separately reviewed trusted-address adapter is required.

Response contract: `{ configured, platformEnabled, identity, remainingRequests, remainingSeconds, maxSeconds, resetAt }`. `identity` is `anonymous` or `authenticated`; resetAt is UTC midnight for authenticated quotas and null for anonymous lifetime quotas. Quota status unavailable returns HTTP503 with configured:false and zero remaining quota. Invalid bearer returns401. Browser requests with an Origin header must match the current site; no CORS permission is granted. All responses are no-store. No user IDs, IP hashes, emails or tokens are returned.

## Deliberately closed payment boundary

There is currently no operator-paid server transcription or video downloader. Existing BYOK transcription contacts providers directly; local playback/splitting and BYOK do not consume platform quota. Thus status always reports **platformEnabled:false**, and POST /api/quota always returns503 without reserving or charging. There is no client-controlled settlement endpoint.

Future trusted processor integration must: validate source/file limits server-side; measure actual audio duration server-side; call reserveTrusted with a server-verified identity and network; claim a unique server job; perform paid work once; settleTrusted on success/failure; deliver output only after successful settlement. A repeated successful reservation response is an idempotent replay, not permission to start a second provider job. Workers must finish inside the 30-minute reservation lease; abort expired work. Provider-level idempotency and/or an atomic worker claim is needed before adding that processor. Client-supplied duration or success is not authoritative.

Two independent kill switches exist: server PLATFORM_PROCESSING_DISABLED and the database control row. After trusted integration, an administrator may enable the SQL control with `update echo_private.quota_control set enabled=true where singleton=true`; disable with enabled=false. Do not enable during this login-only release.

## Limits and maintenance

Anonymous: 2 successful/reserved jobs over the cookie lifetime, 300 seconds maximum per job. Anonymous networks additionally have 2 successful/reserved jobs per UTC day, limiting cleared-cookie abuse but potentially sharing limits across homes/offices. Authenticated: 3 successful/reserved jobs and 1200 seconds per UTC day, 600 seconds per job. One active job per subject or network; 10 new reservation attempts/network/minute. Failed jobs release usage but remain counted in short-term request limiting. Global budget counts every accepted job attempt, including failed and expired jobs: provider failures and expired leases may still cost the operator. Refunding user allowance never refunds the operator budget.

A single advisory transaction lock serializes accounting, suitable for a small initial deployment. This is not a high-throughput architecture or complete bot defense. Multiple accounts/IPs remain possible; hosting-level rate limits and budget monitoring are still needed. Do not delete successful anonymous rows or the lifetime limit resets. Schedule service-role RPC echo_quota_cleanup_requests() daily to remove rate buckets older than 2 days. It never deletes job accounting or idempotency records; do not remove current-day failed/expired jobs because they still consume the operator budget. Review long-term retention separately before pruning any job history. Network hashes are pseudonymous operational data.

Official references: [Supabase JWT/user verification](https://supabase.com/docs/guides/auth/jwts), [Data REST API](https://supabase.com/docs/guides/api).
