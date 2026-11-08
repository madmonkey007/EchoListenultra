import React from 'react';
import { Link } from 'react-router-dom';

export default function AboutView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>About ReelTranscript</h1><p>A public Reel can be useful beyond its video.</p></div>
    <div className="help-content">
      <section><h2>From a Reel to a readable record</h2><p>ReelTranscript turns the speech in a public Instagram Reel into text and timestamped SRT subtitles. It gives you a way to refer back to what was said without searching through the video again.</p><p>The tool starts with a public Reel link. It does not require an account or an Instagram login, and it cannot access private or restricted posts.</p></section>
      <section><h2>Two ways to keep the result</h2><p>Use <strong>Copy text</strong> to save the transcript in your notes or another document. Use <strong>Download SRT</strong> when you need subtitle cues with start and end times.</p><p>Automatic recognition can make mistakes, especially with names, numbers or competing sound. Check important wording against the original Reel before using it. See <Link to="/privacy">how submitted data is handled</Link>.</p></section>
      <section><h2>A focused, independent tool</h2><p>ReelTranscript is independently maintained and focuses on public Instagram Reel links. Other Instagram post types and private content are outside its current scope.</p><p>For the steps and common errors, read <Link to="/help">how it works</Link>. To report a problem or suggest an improvement, <Link to="/contact">contact the maintainer</Link>.</p><Link className="button" to="/">Transcribe a Reel <span aria-hidden="true">↗</span></Link></section>
    </div>
  </article>;
}
