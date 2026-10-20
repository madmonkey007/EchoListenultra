# Google sign-in and server quota

Approved in conversation: Google-only sign-in, anonymous trial two successful jobs of at most five minutes; signed-in allowance three jobs and twenty total minutes per UTC day, ten minutes per job. Local practice and user-paid provider calls stay available without sign-in. Library remains local, no cloud sync.

Current source has only browser calls using personal provider keys. There is no operator-paid processing or video download endpoint to protect yet. This release builds identity and a transactional server ledger without pretending a client-reported completion is trustworthy. Platform processing must remain disabled until a trusted processing endpoint measures media duration and settles its reservation internally. An API that only counts browser clicks would not meet the threat model.

Supabase provides Google OAuth PKCE and Postgres. Public project URL and anonymous key are client configuration; service-role key and anonymous-cookie signing secret remain server-only. SQL row locks serialize reserve/settle, per-IP request limits constrain resetting anonymous cookies, and global daily budget plus an emergency switch constrain spend. Anonymous IP checks are an imperfect abuse signal, not identity proof. Auth does not provide unlimited usage.

Account view shows configuration/service state and confirmed remaining allowance. No external credentials are fabricated. OAuth redirects keep local lessons; an intentionally saved import draft expires after one hour. Audio files and local lessons never become account records.

Verification: unit tests for redirect validation, PKCE/session lifecycle, authenticated server identity, cookie signatures, quota edge cases and import preservation; local HTTP failures fail closed. SQL transaction behavior must be tested on actual Postgres when available. Real Google login needs project credentials and callback allowlisting; retain it as an explicit unverified deployment step.
