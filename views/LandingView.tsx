import React from 'react';
import { limitMinutes } from '../lib/transcription-limit.ts';
import { Link } from 'react-router-dom';
import ReelTranscriber from '../components/ReelTranscriber.tsx';

export default function LandingView() {
  return <div className="landing">
    <ReelTranscriber />
    <section className="workflow site-container" aria-labelledby="hero-title">
      <div className="section-intro">
        <h2 id="hero-title">From a Reel.<br />To <em>readable text.</em></h2>
        <p>An interview, an explanation, a story.<br />Start with a public Instagram Reel.</p>
        <Link to="/help" className="text-link">Read the quick guide <span aria-hidden="true">→</span></Link>
        <p className="quiet-note"><span className="status-dot" />No Instagram sign-in needed. Save your result before refreshing.</p>
      </div>
      <div>
        <h3 className="workflow-subtitle">Keep the words.<br />Keep the timing.</h3>
      <ol className="steps"><li><span className="step-number">1</span><div><h3>Paste the link</h3><p>Copy a public Instagram Reel URL into the form above.</p></div></li><li><span className="step-number">2</span><div><h3>Generate the transcript</h3><p>Wait for the Reel audio to be processed into text with subtitle timing.</p></div></li><li><span className="step-number">3</span><div><h3>Save your result</h3><p>Use Copy text for the transcript or Download SRT for timestamped subtitles.</p></div></li></ol>
      </div>
    </section>
    <section className="privacy-strip site-container"><span className="material-symbols-outlined" aria-hidden="true">folder_open</span><div><h2>Your result stays on this page.</h2><p>Refreshing clears the submitted link and transcript from the page. Copy or download anything you want to keep.</p></div><Link to="/privacy" className="text-link">About your data <span aria-hidden="true">→</span></Link></section>
    <section className="faq-section site-container" aria-labelledby="faq-title"><h2 id="faq-title">Before you paste a link.</h2><div className="faq-list"><details><summary>Which links are supported?</summary><p>Use a publicly accessible Instagram Reel link. Private posts and other video platforms are not supported by this tool.</p></details><details><summary>Do I need to sign up?</summary><p>No account or Instagram login is required to submit a public Reel.</p></details><details><summary>Does it work on my computer and phone?</summary><p>Yes, use a modern browser with an internet connection. Copy the result or download the SRT before leaving the page.</p></details><details><summary>How long can the Reel be?</summary><p>Up to {limitMinutes()} minutes.</p></details></div></section>
  </div>;
}
