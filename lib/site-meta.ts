import siteConfig from './site-config.json';

// Shared by runtime metadata and Vite's static SEO output. Never derive from deployment hosts.
export const SITE_ORIGIN = siteConfig.origin;

const publicMetadata: Record<string, { title: string; description: string }> = {
  '/': { title: 'Instagram Transcript & SRT — ReelTranscript', description: 'Get an Instagram transcript from a public Reel link. Copy the text or download timestamped SRT subtitles. No Instagram login or account is required.' },
  '/about': { title: 'About ReelTranscript', description: 'Meet ReelTranscript, an independently maintained audio workspace for your own audio, with no account required.' },
  '/help': { title: 'Listening guide — ReelTranscript', description: 'Learn to import audio, split listening sections, use optional transcription and keep your local library safe.' },
  '/privacy': { title: 'Data and privacy — ReelTranscript', description: 'Understand local audio storage, optional transcription providers, feedback and basic usage events in ReelTranscript.' },
  '/contact': { title: 'Contact and feedback — ReelTranscript', description: 'Contact the ReelTranscript maintainer with a question, a problem or feedback about your listening practice.' },
};

export function routeMetadata(pathname: string): { title: string; description: string; robots: string } {
  const page = publicMetadata[pathname];
  if (page) return { ...page, robots: 'index, follow' };
  return { title: 'Your listening workspace — ReelTranscript', description: 'Your personal audio listening workspace.', robots: 'noindex, follow' };
}
