import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const QUOTA_LIMITS = { anonymous: { requests: 2, seconds: 600, maxSeconds: 300 }, authenticated: { requests: 3, seconds: 1200, maxSeconds: 600 } } as const;
export interface QuotaConfig { url: string; serviceKey: string; secret: string; globalSeconds: number }
export function quotaConfig(env = process.env): QuotaConfig | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY || !env.QUOTA_COOKIE_SECRET || env.QUOTA_COOKIE_SECRET.length < 32) return null;
  try { if (new URL(url).protocol !== 'https:') return null; } catch { return null; }
  const globalSeconds = Number(env.QUOTA_DAILY_SECONDS || 3600);
  if (!Number.isSafeInteger(globalSeconds) || globalSeconds < 1) return null;
  return { url: url.replace(/\/$/, ''), serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, secret: env.QUOTA_COOKIE_SECRET, globalSeconds };
}
const sign = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url');
export function encodeAnonymous(id: string, expires: number, secret: string): string { const value = `${id}.${expires}`; return `${value}.${sign(value, secret)}`; }
export function decodeAnonymous(cookie: string, secret: string, now = Date.now()): string | null {
  const [id, expires, signature, extra] = cookie.split('.');
  if (extra || !/^[a-f0-9-]{36}$/.test(id || '') || !/^\d{13}$/.test(expires || '') || Number(expires) <= now || !signature) return null;
  const expected = Buffer.from(sign(`${id}.${expires}`, secret)); const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}
export function anonymousIdentity(req: IncomingMessage, res: ServerResponse, config: QuotaConfig): string {
  const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('echo_trial='))?.slice(11);
  let id = raw ? decodeAnonymous(raw, config.secret) : null;
  if (!id) {
    id = randomUUID();
    const secure = process.env.VERCEL === '1' || ('encrypted' in req.socket && req.socket.encrypted);
    res.setHeader('Set-Cookie', `echo_trial=${encodeAnonymous(id, Date.now() + 365 * 86400000, config.secret)}; Path=/api; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
  }
  return `anon:${id}`;
}
export function networkIdentity(req: IncomingMessage, secret: string, vercel = process.env.VERCEL === '1'): string | null {
  // Vercel overwrites this header. Never trust generic x-forwarded-for supplied by a caller.
  const candidate = vercel ? req.headers['x-vercel-forwarded-for'] : req.socket.remoteAddress;
  if (typeof candidate !== 'string' || !isIP(candidate)) return null;
  // Group IPv6 clients by /64 to limit address rotation. IPv4 stays exact.
  const normalized = isIP(candidate) === 6 ? ipv6Prefix(candidate) : candidate;
  return sign(`ip:${normalized}`, secret);
}
function ipv6Prefix(value: string): string {
  const [left, right = ''] = value.toLowerCase().split('::');
  const a = left ? left.split(':') : []; const b = right ? right.split(':') : [];
  const parts = value.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return parts.slice(0, 4).map(x => x.padStart(4, '0')).join(':');
}
export async function verifiedSubject(req: IncomingMessage, res: ServerResponse, config: QuotaConfig): Promise<{ subject: string; authenticated: boolean }> {
  const auth = req.headers.authorization;
  if (!auth) return { subject: anonymousIdentity(req, res, config), authenticated: false };
  if (!/^Bearer [A-Za-z0-9._~-]+$/.test(auth)) throw new Error('unauthorized');
  const response = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.serviceKey, Authorization: auth }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('unauthorized');
  const user = await response.json();
  if (typeof user.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(user.id) || user.is_anonymous === true || !user.email_confirmed_at || !(user.app_metadata?.provider === 'google' || user.app_metadata?.providers?.includes('google') || user.identities?.some((identity: { provider?: string }) => identity.provider === 'google'))) throw new Error('unauthorized');
  return { subject: `user:${user.id}`, authenticated: true };
}
export async function quotaRpc(config: QuotaConfig, name: string, args: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('quota_unavailable');
  return response.json();
}
// Only trusted server processing may call these. Never forward client-reported duration/success.
export async function reserveTrusted(config: QuotaConfig, input: { subject: string; authenticated: boolean; network: string; requestId: string; measuredSeconds: number }) {
  if (process.env.PLATFORM_PROCESSING_DISABLED !== 'false') throw new Error('platform_disabled');
  if (!Number.isInteger(input.measuredSeconds) || input.measuredSeconds < 1) throw new Error('invalid_duration');
  return quotaRpc(config, 'echo_quota_reserve', { p_subject: input.subject, p_authenticated: input.authenticated, p_network: input.network, p_request_id: input.requestId, p_seconds: input.measuredSeconds, p_global_limit: config.globalSeconds });
}
export async function settleTrusted(config: QuotaConfig, subject: string, requestId: string, succeeded: boolean) {
  return quotaRpc(config, 'echo_quota_settle', { p_subject: subject, p_request_id: requestId, p_succeeded: succeeded });
}
