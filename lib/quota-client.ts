export interface QuotaStatus {
  configured: boolean;
  platformEnabled: boolean;
  identity: 'anonymous' | 'authenticated';
  remainingRequests: number;
  remainingSeconds: number;
  maxSeconds: number;
  resetAt: string | null;
  reason?: string;
}

const unavailable = (): QuotaStatus => ({ configured: false, platformEnabled: false, identity: 'anonymous', remainingRequests: 0, remainingSeconds: 0, maxSeconds: 0, resetAt: null, reason: 'Online allowance is unavailable. Local practice and your own provider key still work.' });

export async function fetchQuotaStatus(token: string | null, request: typeof fetch = fetch): Promise<QuotaStatus> {
  try {
    const response = await request('/api/quota', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return unavailable();
    const value = await response.json();
    if (typeof value.configured !== 'boolean' || typeof value.platformEnabled !== 'boolean'
      || !['anonymous', 'authenticated'].includes(value.identity)
      || !['remainingRequests', 'remainingSeconds', 'maxSeconds'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
      || (value.resetAt !== null && (typeof value.resetAt !== 'string' || !Number.isFinite(Date.parse(value.resetAt))))) return unavailable();
    return { configured: value.configured, platformEnabled: value.platformEnabled, identity: value.identity,
      remainingRequests: value.remainingRequests, remainingSeconds: value.remainingSeconds, maxSeconds: value.maxSeconds,
      resetAt: value.resetAt };
  } catch { return unavailable(); }
}
