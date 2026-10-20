import React from 'react';
import { Link } from 'react-router-dom';

export default function AboutView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>Make room for a closer listen.</h1><p>About EchoListen</p></div>
    <div className="help-content">
      <section><h2>A personal listening workspace</h2><p>EchoListen is an individually maintained English listening tool. Bring your own audio, divide it into manageable sections and repeat the passages you want to understand.</p><p>You can adjust playback speed, follow a transcript when one is available, and save words for later review. Time-based sections work without a transcription key. Sentence and speaker sections need a successful transcript from your chosen provider.</p></section>
      <section><h2>Start without an account</h2><p>Local listening needs no sign-up. Optional Google sign-in is for online allowance where configured. Your audio library, saved words and preferences live in the browser you use. There is no cloud backup or cross-device sync, so keep your original audio files safe.</p><p>Automatic transcription is optional and uses your own provider key. Read <Link to="/privacy">how your data is handled</Link> before enabling it.</p></section>
      <section><h2>Built around your practice</h2><p>Try a short recording first, choose a section and listen again at your own pace. For a walkthrough, visit <Link to="/help">the listening guide</Link>.</p><p>This is a small, independently maintained project. If something breaks or gets in your way, <Link to="/contact">send feedback</Link>. Replies may take time.</p><Link className="button" to="/add">Import your audio <span aria-hidden="true">↗</span></Link></section>
    </div>
  </article>;
}
