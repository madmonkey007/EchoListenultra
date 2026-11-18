import React from 'react';
import { Link } from 'react-router-dom';
import ReelTranscriber from '../components/ReelTranscriber.tsx';
import IconGlyph from '../components/IconGlyph.tsx';
import { FAQ_TITLE, HOME_FAQ } from '../lib/home-faq.ts';

export default function LandingView() {
  return <div className="landing">
    <ReelTranscriber />
    <section className="workflow site-container" aria-labelledby="hero-title">
      <div className="section-intro">
        {/* The <br> before each break carries a real space: the stylesheet hides
            these breaks on wide columns, and without the space the sentence
            would copy as one glued word. */}
        <h2 id="hero-title">From a Reel. <br />To <em>readable text.</em></h2>
        <p>An interview, an explanation, a story. <br />Start with a public Instagram Reel.</p>
        <Link to="/help" className="text-link">Read the quick guide <span aria-hidden="true">→</span></Link>
        <p className="quiet-note"><span className="status-dot" />No Instagram sign-in needed. Save your result before refreshing.</p>
      </div>
      <div>
        <h3 className="workflow-subtitle">Keep the words. <br />Keep the timing.</h3>
      <ol className="steps"><li><span className="step-number">1</span><div><h3>Paste the link</h3><p>Copy a public Instagram Reel URL into the form above.</p></div></li><li><span className="step-number">2</span><div><h3>Generate the transcript</h3><p>Wait for the Reel audio to be processed into text with subtitle timing.</p></div></li><li><span className="step-number">3</span><div><h3>Save your result</h3><p>Use Copy text for the transcript or Download SRT for timestamped subtitles.</p></div></li></ol>
      </div>
    </section>
    <section className="privacy-strip site-container"><IconGlyph name="folder_open" /><div><h2>Your result stays on this page.</h2><p>Refreshing clears the submitted link and transcript from the page. Copy or download anything you want to keep.</p></div><Link to="/privacy" className="text-link">About your data <span aria-hidden="true">→</span></Link></section>
    <section className="faq-section site-container" aria-labelledby="faq-title"><h2 id="faq-title">{FAQ_TITLE}</h2><div className="faq-list">{HOME_FAQ.map(item => <div className="faq-item" key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></div>)}</div></section>
  </div>;
}
