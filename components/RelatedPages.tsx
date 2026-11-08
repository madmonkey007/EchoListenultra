import React from 'react';
import { Link } from 'react-router-dom';

const PAGES: { href: string; anchor: string; note: string }[] = [
  { href: '/instagram-reel-transcript', anchor: 'Instagram reel transcript', note: 'What a Reel transcript is and how to get one.' },
  { href: '/reels-transcript', anchor: 'Reels transcript', note: 'Turn the spoken words in a Reel into text.' },
  { href: '/instagram-reel-transcript-generator', anchor: 'Instagram reel transcript generator', note: 'How the generator works and what it exports.' },
  { href: '/instagram-video-transcript', anchor: 'Instagram video transcript', note: 'Transcribe Reels and videos in feed posts.' },
];

// Content pages cross-link every sibling plus the tool home. The current page is omitted.
export default function RelatedPages({ current }: { current: string }) {
  return <section className="related-pages" aria-labelledby="related-pages-title">
    <h2 id="related-pages-title">Related pages</h2>
    <ul>
      {PAGES.filter(page => page.href !== current).map(page => <li key={page.href}>
        <Link to={page.href}>{page.anchor}</Link> — {page.note}
      </li>)}
      <li><Link to="/">Open the transcript tool</Link> — paste a public link and get the text.</li>
    </ul>
  </section>;
}
