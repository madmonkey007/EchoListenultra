import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Link } from 'react-router-dom';
import SiteHeader, { Brand } from '../components/SiteHeader';
import AboutView from '../views/AboutView';
import HelpView from '../views/HelpView';
import PrivacyView from '../views/PrivacyView';
import ContactView from '../views/ContactView';
import SettingsView from '../views/SettingsView';
import type { AIProviderConfig } from '../types';
import TikTokTranscriptView from '../views/TikTokTranscriptView';
import { routeMetadata, SITE_ORIGIN } from './site-meta';

const AppearancePage = () => <SettingsView apiConfig={{ theme: 'dark' } as AIProviderConfig} onConfigChange={() => {}} />;

const pages: Record<string, React.ComponentType> = {
  '/about': AboutView, '/help': HelpView, '/privacy': PrivacyView,
  '/contact': ContactView, '/tiktok-transcript': TikTokTranscriptView, '/settings': AppearancePage,
};
export const prerenderPaths = Object.keys(pages);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderPublicHtml(homeHtml: string, pathname: string): string | null {
  // The homepage is byte-for-byte untouched, including its static example and SEO.
  if (pathname === '/') return homeHtml;
  const View = pages[pathname];
  if (!View) return null;
  const metadata = routeMetadata(pathname);
  const canonical = escape(SITE_ORIGIN + pathname);
  const body = renderToStaticMarkup(<MemoryRouter initialEntries={[pathname]}>
    <div className="website">
      <a href="#main-content" className="skip-link">Skip to content</a><SiteHeader />
      <main id="main-content" className={pathname === '/settings' ? 'tool-page' : 'site-main'} tabIndex={-1}><View /></main>
      <footer className="site-footer site-container"><Brand /><p>Public Reels. Readable transcripts. Timed subtitles.</p><Link to="/about">About</Link><Link to="/contact">Contact</Link><Link to="/privacy">Data &amp; privacy</Link><Link to="/help">How it works</Link><Link to="/settings">Settings</Link></footer>
    </div>
  </MemoryRouter>);
  return homeHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(metadata.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*("\s*\/>)/, `$1${escape(metadata.description)}$2`)
    .replace(/(<meta name="robots" content=")[^"]*("\s*\/>)/, `$1${metadata.robots}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*("\s*\/>)/, `$1${canonical}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*("\s*\/>)/, `$1${canonical}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*("\s*\/>)/, `$1${escape(metadata.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*("\s*\/>)/, `$1${escape(metadata.description)}$2`)
    .replace(/<div id="root">[\s\S]*?<\/div>(?=\s*<noscript>)/, `<div id="root">${body}</div>`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, '<noscript><p>Enable JavaScript to use interactive features.</p></noscript>');
}
