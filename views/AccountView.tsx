import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAccessToken, safeReturnPath, useAuth } from '../lib/auth.ts';
import { fetchQuotaStatus, QuotaStatus } from '../lib/quota-client.ts';

export default function AccountView() {
  const { session, configured, signOut } = useAuth();
  const [search] = useSearchParams();
  const returnTo = safeReturnPath(search.get('returnTo'));
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setQuota(null);
    void getAccessToken().then(token => fetchQuotaStatus(token)).then(value => { if (active) setQuota(value); }).catch(() => {
      if (active) setError('Your sign-in could not be refreshed. Try signing in again.');
    });
    return () => { active = false; };
  }, [session?.access_token, revision]);
  async function logout() {
    setBusy(true); setError('');
    try { await signOut(); } catch { setError('Signed out on this browser. The service could not confirm session revocation.'); }
    finally { setBusy(false); }
  }
  return <div className="site-container account-page">
    <div className="page-heading"><p className="eyebrow">Your account</p><h1>More listening. Fair limits.</h1><p>Your account keeps track of online allowance. Your lessons stay in this browser.</p></div>
    <div className="account-layout">
      <section className="account-section" aria-labelledby="account-identity"><h2 id="account-identity">{session ? 'Signed in with Google' : 'Start with Google'}</h2>
        {session ? <><p className="account-email">{session.user.email || 'Google account'}</p><p>Signing out keeps your local lessons and vocabulary.</p><button type="button" className="button button-secondary" disabled={busy} onClick={logout}>{busy ? 'Signing out…' : 'Sign out'}</button></> : <><p>Basic Google profile and email only. We do not request access to your Gmail messages.</p>{configured ? <Link className="button" to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Continue with Google <span aria-hidden="true">→</span></Link> : <><button className="button" type="button" disabled>Google sign-in unavailable</button><p className="account-notice" role="status">Google sign-in has not been configured on this deployment. Local practice is available now.</p></>}</>}
        {error && <p role="alert" className="account-notice">{error}</p>}<p><Link className="text-link" to="/privacy#account">Account and privacy →</Link></p>
      </section>
      <section className="account-section" aria-labelledby="online-allowance"><h2 id="online-allowance">Online allowance</h2>
        {!quota && !error && <p role="status">Checking online service…</p>}
        {quota && (!quota.configured || !quota.platformEnabled) ? <p role="status" className="account-notice">Platform-funded processing is not available on this deployment. Signing in does not enable video-link imports or free transcription yet.</p> : quota && <><dl className="allowance-values"><div><dt>Requests left</dt><dd>{quota.remainingRequests}</dd></div><div><dt>Minutes left</dt><dd>{Math.floor(quota.remainingSeconds / 60)}</dd></div></dl><p>Up to {quota.maxSeconds / 60} minutes per request.{quota.resetAt ? ` Resets at ${new Date(quota.resetAt).toLocaleString()}.` : ' Anonymous trials do not reset.'}</p>{quota.remainingRequests === 0 && <p role="status">{session ? 'Your daily allowance is used up. Return after the reset or use your own provider key.' : 'Your trial allowance is used up. Sign in with Google for the daily allowance.'}</p>}</>}
        <p className="account-policy">When platform processing opens: 2 anonymous trials of up to 5 minutes; signed-in accounts get 3 requests and 20 total minutes per UTC day, up to 10 minutes each.</p>
        <button type="button" className="text-link" onClick={() => { setError(''); setRevision(value => value + 1); }}>Refresh status</button>
      </section>
    </div>
    <section className="account-local"><h2>Local practice stays free.</h2><p>Play the sample, import your own audio and split it by time without signing in. Transcription with your own provider key is billed by that provider and does not use platform credits.</p><Link className="button button-secondary" to={returnTo === '/account' ? '/add' : returnTo}>Continue listening <span aria-hidden="true">→</span></Link><p>No cloud backup or cross-device sync. Keep your original audio files.</p></section>
  </div>;
}
