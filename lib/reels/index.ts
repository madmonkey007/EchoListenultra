/** Server-side contract only. No network requests or subprocesses in this module. */
export type ReelErrorCode =
  | 'private_or_unavailable'
  | 'fetch_blocked'
  | 'no_audio'
  | 'too_long'
  | 'quota_exceeded'
  | 'internal_error';

export interface ReelAudio {
  audioPath: string;
  audioSeconds: number;
  title: string;
  author: string;
}

export type ReelResult = ({ ok: true } & ReelAudio)
  | { ok: false; code: ReelErrorCode; detail: string };

export interface ReelFetcher {
  /** Receives a validated, canonical URL. Future adapters must return audio metadata. */
  fetch(url: string): Promise<ReelAudio>;
}

/** Source: scripts/ig-probe/probe.py CATEGORIES, classify(), and probe_one().
 * Diagnostic categories remain adapter inputs, never public result codes.
 */
export const PROBE_ERROR_MAP = {
  // Probe detects private/deleted/missing media and HTTP 404: media unavailable.
  private_or_unavailable: 'private_or_unavailable',
  // Login, cookies, challenge, HTTP 401/403/429: upstream access blocked,
  // not an application/user quota failure.
  login_required_or_ratelimit: 'fetch_blocked',
  // Country/region restrictions block access from the fetching environment.
  geo_blocked: 'fetch_blocked',
  // Missing formats/audio, image-only posts, or missing/empty output audio.
  no_audio: 'no_audio',
  // Probe's 60-second deadline expired: fetching failed, not media too long.
  timeout: 'fetch_blocked',
  // ffmpeg/ffprobe/conversion/invalid WAV failures are processing failures.
  ffmpeg_error: 'internal_error',
  // Unclassified diagnostics cannot establish a more specific public cause.
  other: 'internal_error',
} as const satisfies Record<string, ReelErrorCode>;

export function normalizeReelUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  // Check the original path too: URL parsing otherwise erases dot segments.
  if (!/^https:\/\/[^/?#]+\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?(?:[?#].*)?$/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname)) return null;
    const match = /^\/(reel|reels|p)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    return match ? `https://www.instagram.com/${match[1]}/${match[2]}/` : null;
  } catch { return null; }
}

export class LocalYtDlp implements ReelFetcher {
  async fetch(_url: string): Promise<ReelAudio> {
    throw new Error('not_implemented: LocalYtDlp');
  }
}

export class RemoteFetcher implements ReelFetcher {
  async fetch(_url: string): Promise<ReelAudio> {
    throw new Error('not_implemented: RemoteFetcher');
  }
}

export class ReelError extends Error {
  constructor(public readonly code: ReelErrorCode, detail: string) {
    super(detail);
    this.name = 'ReelError';
  }
}

function failure(error: unknown): ReelResult {
  if (error instanceof ReelError) return { ok: false, code: error.code, detail: error.message };
  if (error !== null && typeof error === 'object' && 'category' in error
    && typeof error.category === 'string' && Object.hasOwn(PROBE_ERROR_MAP, error.category)) {
    const code = PROBE_ERROR_MAP[error.category as keyof typeof PROBE_ERROR_MAP];
    return { ok: false, code, detail: `Reel extraction failed: ${code}.` };
  }
  return { ok: false, code: 'internal_error', detail: 'Reel extraction failed or fetcher is not implemented.' };
}

type ReelEnvironment = { MAX_AUDIO_SECONDS?: string; REELS_FETCHER?: string };

/** Adapter injection also allows offline contract tests without downloading media. */
export function createReelExtractor(fetcher: ReelFetcher, env: ReelEnvironment = process.env) {
  return async (url: string): Promise<ReelResult> => {
    const normalized = normalizeReelUrl(url);
    if (!normalized) return { ok: false, code: 'private_or_unavailable', detail: 'Expected an Instagram reel, reels, or p URL with a media ID.' };
    try {
      const limit = env.MAX_AUDIO_SECONDS === undefined ? 180 : Number(env.MAX_AUDIO_SECONDS);
      if (!Number.isFinite(limit) || limit <= 0) throw new ReelError('internal_error', 'MAX_AUDIO_SECONDS must be a positive finite number.');
      const audio = await fetcher.fetch(normalized);
      if (!audio || !audio.audioPath || !Number.isFinite(audio.audioSeconds) || audio.audioSeconds <= 0) {
        throw new ReelError('no_audio', 'No usable audio or duration was returned.');
      }
      if (audio.audioSeconds > limit) throw new ReelError('too_long', `Audio exceeds the ${limit} second limit.`);
      return { ok: true, audioPath: audio.audioPath, audioSeconds: audio.audioSeconds, title: audio.title, author: audio.author };
    } catch (error) { return failure(error); }
  };
}

export async function extractReel(url: string): Promise<ReelResult> {
  // Configuration errors must not mask invalid input URLs.
  if (!normalizeReelUrl(url)) return { ok: false, code: 'private_or_unavailable', detail: 'Invalid Instagram media URL.' };
  const selected = process.env.REELS_FETCHER ?? 'local';
  let fetcher: ReelFetcher;
  switch (selected) {
    case 'local': fetcher = new LocalYtDlp(); break;
    case 'remote': fetcher = new RemoteFetcher(); break;
    default: return { ok: false, code: 'internal_error', detail: 'REELS_FETCHER must be local or remote.' };
  }
  return createReelExtractor(fetcher)(url);
}
