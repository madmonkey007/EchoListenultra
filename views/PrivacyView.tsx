import React from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>Privacy and your data</h1><p>Data and privacy · Updated October 23, 2026</p></div>
    <div className="help-content">
      <section id="reel-transcription"><h2>Processing a public Reel</h2><p>When you submit a public Instagram Reel link, our server retrieves the audio and sends it to Cloudflare Workers AI to generate text and timestamped subtitles. No Instagram login or personal transcription API key is required.</p><p>Only submit content you own or have permission to use. Leaving the page or stopping the wait may not stop processing that has already begun.</p></section>
      <section id="local-data"><h2>Results on this page</h2><p>The submitted link and generated transcript are held in the current page and are no longer retained there after a refresh. Use Copy text or Download SRT before leaving if you want to keep the result. ReelTranscript does not provide a transcript history or cross-device sync.</p><p>Your theme preference is saved in this browser. You can change it in <Link to="/settings">Settings</Link> or clear site storage using your browser settings.</p></section>
      <section id="external-services"><h2>Service providers</h2><p>Instagram, Cloudflare and the hosting provider process requests needed to retrieve and transcribe the Reel. They may retain request information under their own policies. The website also loads fonts and interface resources from external services, which receive ordinary network information such as your IP address.</p></section>
      <section id="usage"><h2>Usage and reliability</h2><p>The website may send basic action names and the app version to its own usage endpoint. These event payloads do not include audio, transcript text, submitted links or email addresses. Hosting request logs and error diagnostics are separate from these events.</p></section>
      <section id="feedback"><h2>Contacting the maintainer</h2><p>The <Link to="/contact">contact page</Link> prepares an email draft. Nothing is sent until you send it through your email application. Your email address and any details you choose to include are used to respond to your message.</p><p>Audio and transcripts are not attached automatically. Review your draft and avoid including private content or credentials.</p></section>
    </div>
  </article>;
}
