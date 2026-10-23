import React from 'react';
import { Link } from 'react-router-dom';

export default function TikTokTranscriptView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>TikTok transcript — coming soon</h1><p>TikTok link transcription is not available here yet.</p></div>
    <div className="help-content"><section><h2>What you can use today</h2>
      <p>The home-page tool accepts public Instagram Reel links and returns text and timestamped SRT subtitles. It does not accept TikTok links.</p>
      <Link to="/" className="button">Open the Instagram transcript tool <span aria-hidden="true">↗</span></Link>
    </section></div>
  </article>;
}
