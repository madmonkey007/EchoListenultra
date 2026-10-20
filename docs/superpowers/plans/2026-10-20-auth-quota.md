# Google sign-in and quota implementation plan

**Goal:** Add optional Google identity and enforceable server quota infrastructure while preserving free local practice.

**Architecture:** Supabase Auth REST PKCE, native Vercel handlers, Postgres transactional RPCs. No new dependencies; no client completion endpoint; platform processing disabled until a trusted worker is connected.

- [x] Write and run failing tests for safe auth redirects, session expiry and PKCE; implement auth client and callback view.
- [x] Write and run failing tests for server identity/cookies and quota validation; implement atomic SQL and HTTP status/reserve boundaries.
- [x] Write and run failing tests for import draft validation and limits; preserve draft through intentional sign-in navigation.
- [x] Integrate account route, header entry, quota status and honest configuration copy; update privacy and help.
- [x] Run all tests, typecheck, build, inspect security boundaries and browser layouts. PostgreSQL 16 migration and concurrent budgets verified in a disposable local cluster.
- [x] Package source and deployment instructions; distinguish verified local behavior from credential-dependent Google checks.

External activation: create/configure Supabase and Google OAuth, execute reviewed SQL, set server-only secrets and trusted production origin, verify real callbacks and ledger transactions. These require external account access which this session does not have.
