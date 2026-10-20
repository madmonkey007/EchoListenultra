// When moving to a custom domain, update this origin and public/sitemap.xml together.
export const SITE_ORIGIN = 'https://echo-listenultra-umm7.vercel.app';

const publicMetadata: Record<string, { title: string; description: string }> = {
  '/': { title: 'EchoListen — English listening, one section at a time', description: 'Import your own audio, repeat short sections and practise English listening at your own pace. No sign-up required.' },
  '/about': { title: 'About EchoListen', description: 'Meet EchoListen, an independently maintained English listening tool for your own audio, with no account required.' },
  '/help': { title: 'Listening guide — EchoListen', description: 'Learn to import audio, split listening sections, use optional transcription and keep your local library safe.' },
  '/privacy': { title: 'Data and privacy — EchoListen', description: 'Understand local audio storage, optional transcription providers, feedback and basic usage events in EchoListen.' },
  '/contact': { title: 'Contact and feedback — EchoListen', description: 'Contact the EchoListen maintainer with a question, a problem or feedback about your listening practice.' },
};

export function routeMetadata(pathname: string): { title: string; description: string; robots: string } {
  const page = publicMetadata[pathname];
  if (page) return { ...page, robots: 'index, follow' };
  return { title: 'Your listening workspace — EchoListen', description: 'Your personal audio listening workspace.', robots: 'noindex, follow' };
}
