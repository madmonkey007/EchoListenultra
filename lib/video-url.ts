/** Exact public entry hosts/routes. Worker network isolation handles downstream requests. */
const VIDEO_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
export function normalizeVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !VIDEO_HOSTS.has(url.hostname)) return null;
    const path = url.pathname, host = url.hostname;
    const youtubeId = '[A-Za-z0-9_-]{11}';
    const valid = host === 'youtu.be' ? new RegExp(`^/${youtubeId}/?$`).test(path)
      : host.endsWith('youtube.com') ? (path === '/watch' && new RegExp(`^${youtubeId}$`).test(url.searchParams.get('v') || '')) || new RegExp(`^/(shorts|embed)/${youtubeId}/?$`).test(path)
      : /^\/@[A-Za-z0-9._-]+\/video\/[0-9]+\/?$/.test(path) || (['vm.tiktok.com', 'vt.tiktok.com'].includes(host) && /^\/[A-Za-z0-9]+\/?$/.test(path)) || /^\/t\/[A-Za-z0-9]+\/?$/.test(path);
    if (!valid) return null;
    return url.href;
  } catch { return null; }
}
