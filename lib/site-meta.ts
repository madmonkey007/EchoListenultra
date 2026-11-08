import siteConfig from './site-config.json';

// Shared by runtime metadata and Vite's static SEO output. Never derive from deployment hosts.
export const SITE_ORIGIN = siteConfig.origin;

export const publicMetadata: Record<string, { title: string; description: string }> = {
  '/': { title: 'Instagram Transcript & SRT — ReelTranscript', description: 'Get an Instagram transcript from a public Reel link. Copy the text or download timestamped SRT subtitles. No Instagram login or account is required.' },
  '/instagram-reel-transcript': { title: 'Instagram Reel Transcript — Copy Text or Download SRT', description: 'Get a transcript from any public Instagram Reel link. Copy the timestamped text or download SRT subtitles. Reels up to 3 minutes work without an account.' },
  '/reels-transcript': { title: 'Reels Transcript: Turn Reels Into Text — ReelTranscript', description: 'Turn the speech in Instagram Reels into readable text. Paste a public Reel link, wait a few seconds and copy the transcript or use it as the base for subtitles.' },
  '/instagram-reel-transcript-generator': { title: 'Instagram Reel Transcript Generator — Free, No Sign-Up', description: 'The generator turns public Instagram Reel audio into text automatically. Paste a link, get timestamped lines, then copy the text or download an SRT file.' },
  '/instagram-video-transcript': { title: 'Instagram Video Transcript — Reels and Feed Videos', description: 'Transcribe videos across Instagram: Reels and videos in feed posts. Paste a public link to read a timestamped transcript or download SRT subtitles.' },
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
