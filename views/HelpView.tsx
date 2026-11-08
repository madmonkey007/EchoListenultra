import React from 'react';
import { limitMinutes } from '../lib/transcription-limit.ts';
import { Link } from 'react-router-dom';

export default function HelpView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>How to use ReelTranscript</h1><p>Follow a public Reel link through to a saved transcript.</p></div>
    <div className="help-layout"><nav className="help-index" aria-label="Guide sections"><a href="#getting-started">Getting started</a><a href="#transcription">Save your result</a><a href="#privacy">Your data</a><a href="#troubleshooting">Troubleshooting</a></nav><div className="help-content">
      <section id="getting-started"><h2>Submit a public Instagram Reel</h2><ol><li>Copy the link to a public Instagram Reel. The supported link identifies a Reel with an Instagram <strong>/reel/</strong> path.</li><li>Open <Link to="/">the transcript tool</Link>, paste the link into the link field and start transcription. No sign-in is needed.</li><li>Keep the page open while the progress indicator shows that the request is being processed.</li><li>When the result appears, review the text alongside the original Reel.</li></ol><p>Use only content you have permission to process. Private accounts, restricted Reels and ordinary Instagram photo or profile links are not supported.</p></section>
      <section id="transcription"><h2>Save the text or subtitles</h2><p>Select <strong>Copy text</strong> to put the generated transcript on your clipboard, then paste it where you want to keep it.</p><p>Select <strong>Download SRT</strong> to save a subtitle file. An SRT contains numbered cues, each with a start time, an end time and its text. You can open it in a text editor or a compatible subtitle editor.</p></section>
      <section id="privacy"><h2>Save before refreshing</h2><p>Submitted links and generated transcripts are not retained on the page after a refresh. Copy or download anything you want to keep before leaving or reloading.</p><p>A network connection is required to retrieve and transcribe the Reel. Read the <Link to="/privacy">privacy page</Link> for details about processing.</p></section>
      <section id="troubleshooting"><h2>When a request cannot finish</h2><ul><li>If the link is rejected, check that it points to a Reel rather than a profile or another post type.</li><li>If the Reel cannot be retrieved, confirm it is still public and available. Instagram restrictions can prevent access even to a public post.</li><li>If the request exceeds the supported size or duration, choose a shorter Reel. The current duration limit is {limitMinutes()} minutes.</li><li>If the request fails unexpectedly, try again later or <Link to="/contact">report the error</Link>. Include the steps and visible error message, without sensitive transcript text.</li></ul><Link to="/" className="button">Open the transcript tool <span aria-hidden="true">↗</span></Link></section>
    </div></div>
  </article>;
}
