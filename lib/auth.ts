import { useEffect, useState } from 'react';

export interface AuthSession { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } }
export interface AuthConfig { url: string; key: string }
const SESSION_KEY = 'echo_auth_session';
const FLOW_KEY = 'echo_auth_pkce';
const listeners = new Set<() => void>();
let refreshRequest: Promise<AuthSession | null> | null = null;
let callbackRequest: Promise<string> | null = null;
declare const __ECHO_AUTH_CONFIG__: { url?: string; key?: string } | undefined;
const environment = typeof __ECHO_AUTH_CONFIG__ !== 'undefined' ? __ECHO_AUTH_CONFIG__ : {};
export function authConfig(): AuthConfig | null {
  const url = String(environment.url ?? '').replace(/\/$/, '');
  const key = String(environment.key ?? '');
  try { if (new URL(url).protocol === 'https:' && key) return { url, key }; } catch {}
  return null;
}
export function safeReturnPath(value: string | null): string {
  if (!value || /[\\\r\n]/.test(value)) return '/account';
  try {
    const target = new URL(value, 'https://local.invalid');
    if (target.origin !== 'https://local.invalid' || !/^\/(?:account|add|library|settings|vocabulary|help|player\/[a-zA-Z0-9_-]+)\/?$/.test(target.pathname)) return '/account';
    return target.pathname + target.search;
  } catch { return '/account'; }
}
export function parseSession(data: any): AuthSession | null {
  if (!data || typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token || typeof data.user?.id !== 'string') return null;
  const expires_at = Number(data.expires_at ?? (Date.now() / 1000 + Number(data.expires_in)));
  if (!Number.isFinite(expires_at)) return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at, user: { id: data.user.id, ...(typeof data.user.email === 'string' ? { email: data.user.email } : {}) } };
}
export function getAuthSession(): AuthSession | null {
  try { return parseSession(JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')); } catch { return null; }
}
function saveSession(session: AuthSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY);
  listeners.forEach(listener => listener());
}
class SessionExpiredError extends Error {}
async function authFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) { if (controller.signal.aborted) throw new Error('The sign-in service took too long. Please try again.'); throw error; }
  finally { clearTimeout(timer); }
}
async function tokenRequest(config: AuthConfig, grant: string, body: object): Promise<AuthSession> {
  const response = await authFetch(`${config.url}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) throw new SessionExpiredError('Your sign-in expired or was not completed. Please sign in again.');
    throw new Error('The sign-in service is temporarily unavailable. Please try again.');
  }
  const session = parseSession(await response.json());
  if (!session) throw new Error('The sign-in service returned an incomplete session. Please try again.');
  return session;
}
export async function getAccessToken(): Promise<string | null> {
  const session = getAuthSession();
  if (!session) return null;
  if (session.expires_at > Date.now() / 1000 + 60) return session.access_token;
  const config = authConfig();
  if (!config) return null;
  if (!refreshRequest) {
    const refresh = async () => {
      // Re-read after acquiring the cross-tab lock: refresh tokens rotate on use.
      const latest = getAuthSession();
      if (!latest) return null;
      if (latest.expires_at > Date.now() / 1000 + 60) return latest;
      try {
        const renewed = await tokenRequest(config, 'refresh_token', { refresh_token: latest.refresh_token });
        // Do not restore a session after the user signed out during the request.
        if (getAuthSession()?.refresh_token !== latest.refresh_token) return getAuthSession();
        saveSession(renewed); return renewed;
      } catch (error) {
        // Network errors retain the session for a later retry.
        if (error instanceof SessionExpiredError && getAuthSession()?.refresh_token === latest.refresh_token) saveSession(null);
        throw error;
      }
    };
    refreshRequest = (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('echo-auth-refresh', refresh) : refresh()).finally(() => { refreshRequest = null; });
  }
  return (await refreshRequest)?.access_token ?? null;
}
function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function startGoogleSignIn(returnTo = '/account'): Promise<void> {
  const config = authConfig();
  if (!config) throw new Error('Google sign-in is not configured on this deployment yet. Local listening is still available.');
  const verifier = randomToken(); const state = randomToken();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const callback = new URL('/auth/callback', location.origin); callback.searchParams.set('state', state);
  sessionStorage.setItem(FLOW_KEY, JSON.stringify({ verifier, state, returnTo: safeReturnPath(returnTo), createdAt: Date.now() }));
  const authorize = new URL(`${config.url}/auth/v1/authorize`);
  authorize.searchParams.set('provider', 'google'); authorize.searchParams.set('redirect_to', callback.href);
  authorize.searchParams.set('code_challenge', challenge); authorize.searchParams.set('code_challenge_method', 's256');
  authorize.searchParams.set('scopes', 'openid email profile');
  location.assign(authorize.href);
}
export function completeGoogleSignIn(url = location.href): Promise<string> {
  if (callbackRequest) return callbackRequest;
  callbackRequest = (async () => {
    const callback = new URL(url);
    // Scrub callback codes and errors even when deployment configuration is missing.
    history.replaceState(history.state, '', '/auth/callback');
    const config = authConfig();
    if (!config) throw new Error('Google sign-in is not configured on this deployment yet.');
    let flow: any;
    try { flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? 'null'); } catch {}
    if (!flow || flow.state !== callback.searchParams.get('state') || typeof flow.verifier !== 'string' || !Number.isFinite(flow.createdAt) || Date.now() - flow.createdAt > 10 * 60_000 || Date.now() < flow.createdAt) throw new Error('This sign-in attempt expired or was opened in another tab. Please try again.');
    sessionStorage.removeItem(FLOW_KEY);
    if (callback.searchParams.has('error')) throw new Error('Google sign-in was cancelled or could not be completed. Please try again.');
    const code = callback.searchParams.get('code');
    if (!code) throw new Error('No sign-in code was received. Please try again.');
    saveSession(await tokenRequest(config, 'pkce', { auth_code: code, code_verifier: flow.verifier }));
    return safeReturnPath(flow.returnTo);
  })();
  return callbackRequest;
}
export async function signOut(): Promise<void> {
  const session = getAuthSession(); const config = authConfig();
  saveSession(null); sessionStorage.removeItem(FLOW_KEY); callbackRequest = null;
  if (config && session) {
    const response = await authFetch(`${config.url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${session.access_token}` } });
    if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error('Signed out on this browser. The service could not confirm session revocation.');
  }
}
export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession());
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setSession(getAuthSession()); listeners.add(update);
    const storage = (event: StorageEvent) => { if (event.key === SESSION_KEY || event.key === null) update(); };
    window.addEventListener('storage', storage);
    let active = true;
    const refresh = () => { void getAccessToken().then(() => { if (active) setError(null); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not refresh sign-in.'); }).finally(() => { if (active) { update(); setLoading(false); } }); };
    refresh(); const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; listeners.delete(update); window.removeEventListener('storage', storage); window.clearInterval(timer); };
  }, []);
  return { session, user: session?.user ?? null, configured: Boolean(authConfig()), loading, error, signIn: startGoogleSignIn, signOut };
}
