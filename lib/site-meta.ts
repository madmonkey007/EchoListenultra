import siteConfig from './site-config.json';

// Shared by runtime metadata and Vite's static SEO output. Never derive from deployment hosts.
export const SITE_ORIGIN = siteConfig.origin;

export const publicMetadata: Record<string, { title: string; description: string }> = {
  '/': { title: 'Instagram Transcript & SRT — ReelTranscript', description: 'Get an Instagram transcript from a public Reel link. Copy the text or download timestamped SRT subtitles. No Instagram login or account is required.' },
  '/tiktok-transcript': { title: 'TikTok Transcript — Coming Soon | ReelTranscript', description: 'TikTok link transcription is not available on ReelTranscript yet. Read about the planned transcript page and use our existing Instagram Reel tool.' },
  '/about': { title: 'About ReelTranscript', description: 'Learn about ReelTranscript, an independent tool that turns public Instagram Reel links into text and timestamped SRT subtitles without a login.' },
  '/help': { title: 'How ReelTranscript Works — ReelTranscript', description: 'Learn how to submit a public Instagram Reel link, copy its transcript, download timestamped SRT subtitles and resolve common errors.' },
  '/privacy': { title: 'Data and privacy — ReelTranscript', description: 'Read how ReelTranscript processes submitted Reel links and generated transcripts, plus information about feedback and usage data.' },
  '/settings': { title: 'Appearance settings — ReelTranscript', description: 'Choose the appearance of ReelTranscript on this device.' },
  '/contact': { title: 'Contact and feedback — ReelTranscript', description: 'Contact the ReelTranscript maintainer with questions, transcription problems, subtitle issues or product feedback.' },
};

export function routeMetadata(pathname: string): { title: string; description: string; robots: string } {
  const page = publicMetadata[pathname];
  if (page) return { ...page, robots: (pathname === '/tiktok-transcript' || pathname === '/settings') ? 'noindex, follow' : 'index, follow' };
  return { title: 'ReelTranscript', description: 'Public Instagram Reel transcripts and timestamped SRT subtitles.', robots: 'noindex, follow' };
}
