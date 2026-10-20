import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { completeGoogleSignIn, safeReturnPath, signOut, startGoogleSignIn, useAuth } from '../lib/auth.ts';

export default function AuthView() {
  const { session, configured } = useAuth(); const location = useLocation(); const navigate = useNavigate(); const [search] = useSearchParams();
  const callback = location.pathname === '/auth/callback';
  const [busy, setBusy] = useState(callback); const [error, setError] = useState('');
  useEffect(() => {
    if (!callback) return;
    let active = true;
    completeGoogleSignIn().then(path => { if (active) navigate(path, { replace: true }); }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : 'Sign-in failed. Please try again.'); setBusy(false); } });
    return () => { active = false; };
  }, [callback, navigate]);
  async function login() { setBusy(true); setError(''); try { await startGoogleSignIn(safeReturnPath(search.get('returnTo'))); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed. Please try again.'); setBusy(false); } }
  async function logout() { setBusy(true); setError(''); try { await signOut(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not contact the sign-in service.'); } finally { setBusy(false); } }
  return <div className="site-container contact-page"><div className="page-heading"><p className="eyebrow">Your listening account</p><h1>{session ? 'You’re signed in.' : 'Keep listening with Google.'}</h1><p>Sign in for your daily online processing allowance. Your existing lessons stay in this browser.</p></div><section className="contact-details" style={{ maxWidth: 640 }}>
    {session ? <><h2>{session.user.email ?? 'Google account'}</h2><p>Your account tracks usage. Audio, lessons and vocabulary are not synced to the cloud.</p><Link to="/add" className="button">Continue listening</Link><button className="button button-secondary" type="button" disabled={busy} onClick={logout}>Sign out</button></> : <><h2>One account, a fair daily allowance.</h2><p>We request your basic Google profile and email address. EchoListen does not request access to your Gmail messages.</p>{!configured && <p role="status">Google sign-in is not available on this deployment yet. You can still use the sample and listen to local audio.</p>}<button type="button" className="button" disabled={busy || !configured} onClick={login}>{busy ? 'Completing sign-in…' : 'Continue with Google'}</button><p>Signing in does not create a cloud backup of your lessons.</p></>}
    {error && <p role="alert">{error}</p>}<p><Link to="/privacy" className="text-link">Read the privacy notice</Link></p><Link to="/library" className="text-link">Back to your library →</Link>
  </section></div>;
}
