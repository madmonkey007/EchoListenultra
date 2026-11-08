# Payment spike security review

Reviewed 2026-10-26. Scope: `payment/{ledger,stripe,server}.mjs` and `tests/payment*.test.mjs`. This is a local sandbox architecture review, not approval for production payments.

## Result

No current blocking defect found for the stated local-only sandbox harness. Re-ran `node --test phase2/tests/payment*.test.mjs` using Node v24.14.0: **14 passed, 0 failed**. Node reports that its SQLite API is experimental.

The previously observed DNS rebinding weakness is fixed: the server first requires the exact `127.0.0.1:<listening port>` Host on every route, then checks any non-webhook Origin against that fixed origin. The regression sends matching attacker-controlled Host and Origin and now receives HTTP 403. Webhook requests are exempt only from Origin checking, not Host validation. Stripe CLI forwarding must therefore target the literal loopback address.

## Verified design boundaries

- Stripe adapter accepts only test-key prefixes and rejects live resources; checkout sessions and signed events must be test mode. CLI binds to loopback, and the server/ledger refuse Vercel.
- Webhook verification authenticates the original Buffer bytes using HMAC, constant-time comparison and a five-minute timestamp tolerance before JSON processing.
- Order capabilities are random, stored as hashes and checked per order. Refund administration uses a separate secret. Server fixes price/SKU; checkout return parameters do not grant permission.
- Event IDs and grant order IDs have database uniqueness constraints. `BEGIN IMMEDIATE` transactions atomically update status, grant and handled event. Network awaits occur outside transactions; revision retries detect concurrent local changes. Tests cover duplicate deliveries through two database connections, out-of-order events, rollback and reopen persistence.
- Reconciliation reads provider session/refund state rather than trusting event ordering. Unknown state suspends access; full refunds revoke access. Tests cover partial, pending, failed and full refunds, persisted refund intent before network calls, retry keys, and conservative idempotency-window expiry.

## Remaining validation and deployment limits

- **No real Stripe Sandbox closed loop has run.** Sandbox creation is pending the missing account email. Tests use a fake provider or mocked REST responses; real Checkout, expanded payloads, webhook delivery, refund behavior and provider error classification remain unverified.
- **No production payment database exists in this design.** The local SQLite file and current server must not be deployed as a production Vercel payment backend. Only the free renderer is intended for production deployment.
- Two independent SQLite connections are tested inside one Node process. Independent-process contention, abrupt termination during writes/network operations, disk failure, backup/restore and production database migration have not been validated.
- A missing webhook or provider outage can delay state recovery. Current fail-closed behavior favors withholding access; this review does not establish payment-provider availability or production operational readiness.

Review modified only this report; implementation and test files were not changed by the reviewer.
