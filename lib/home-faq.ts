// Single source for the home FAQ: the prerendered shell in index.html, the
// React section in LandingView, and the FAQPage JSON-LD are all derived from
// this array, so the shipped answer and the marked-up answer cannot drift.
// Facts are checked against the product: the 3-minute cap comes from
// transcription-limit, export formats from reel-result, storage behaviour
// from the privacy copy already shipped on this page.
import { limitMinutes } from './transcription-limit.ts';

export const FAQ_TITLE = 'Frequently asked questions';

export const HOME_FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'Which links are supported?',
    answer: 'A public Instagram Reel link, the kind with /reel/ in its address. Private posts, profile links, photo posts and other video platforms are not supported.',
  },
  {
    question: 'Do I need an account?',
    answer: 'No. There is no sign-up and no Instagram login. A public Reel link is the only thing the tool needs.',
  },
  {
    question: 'What do I get back?',
    answer: 'A transcript with timestamps you can copy as text, plus subtitle files you can download as SRT, Markdown or plain text.',
  },
  {
    question: 'How long can the Reel be?',
    answer: `Up to ${limitMinutes()} minutes. A longer Reel is rejected with an error instead of returning a partial transcript.`,
  },
  {
    question: 'How accurate is the transcript?',
    answer: 'It is generated automatically, so names, accents and background noise can come out wrong. Check anything important against the audio.',
  },
  {
    question: 'Is my link or transcript stored?',
    answer: 'No. The link and the result stay on this page and are cleared when you refresh, so copy or download what you want to keep.',
  },
];

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Rows are <h3> over <p> rather than <details>: an answer that is one click
// away is not text a search engine or a no-JS visitor can read.
export function buildFaqSectionHtml(): string {
  const rows = HOME_FAQ
    .map(item => `<div class="faq-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div>`)
    .join('');
  return `<section class="faq-section" aria-labelledby="faq-title"><h2 id="faq-title">${FAQ_TITLE}</h2><div class="faq-list">${rows}</div></section>`;
}

export function buildFaqJsonLd(): string {
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: HOME_FAQ.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  })}</script>`;
}
