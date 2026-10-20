import type { IncomingMessage, ServerResponse } from 'node:http';
import { networkIdentity, quotaConfig, quotaRpc, verifiedSubject, QUOTA_LIMITS } from '../lib/server/quota';

export default async function quota(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
  const send = (status: number, body: object) => { res.statusCode = status; res.end(JSON.stringify({ configured: false, platformEnabled: false, identity: 'anonymous', remainingRequests: 0, remainingSeconds: 0, maxSeconds: 300, resetAt: null, ...body })); };
  if (req.method !== 'GET') {
    if (req.method === 'POST') { send(503, { error: 'platform_processing_unavailable', message: 'Platform processing is not connected. No quota was charged.' }); return; }
    res.setHeader('Allow', 'GET'); send(405, { error: 'method_not_allowed' }); return;
  }
  if (req.headers.origin) {
    const protocol = process.env.VERCEL === '1' ? 'https' : ('encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http');
    if (req.headers.origin !== `${protocol}://${req.headers.host}`) { send(403, { error: 'origin_not_allowed' }); return; }
  }
  const config = quotaConfig();
  if (!config) { send(503, { error: 'quota_not_configured' }); return; }
  try {
    const identity = await verifiedSubject(req, res, config);
    const network = networkIdentity(req, config.secret);
    if (!network) { send(503, { error: 'network_identity_unavailable' }); return; }
    const usage = await quotaRpc(config, 'echo_quota_status', { p_subject: identity.subject, p_authenticated: identity.authenticated, p_network: network });
    send(200, { ...usage, configured: true, identity: identity.authenticated ? 'authenticated' : 'anonymous', maxSeconds: identity.authenticated ? QUOTA_LIMITS.authenticated.maxSeconds : QUOTA_LIMITS.anonymous.maxSeconds, platformEnabled: false });
  } catch (error) { send(error instanceof Error && error.message === 'unauthorized' ? 401 : 503, { error: error instanceof Error && error.message === 'unauthorized' ? 'unauthorized' : 'quota_unavailable' }); }
}
