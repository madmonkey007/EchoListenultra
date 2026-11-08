import React from 'react';
import { Link } from 'react-router-dom';
import ReelTranscriber from '../components/ReelTranscriber.tsx';
import RelatedPages from '../components/RelatedPages.tsx';

export default function InstagramReelTranscriptGeneratorView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>Instagram Reel Transcript Generator</h1>
      <p>Paste a public Reel link and generate a timestamped transcript online — free, in seconds.</p></div>
    <div className="help-content">
      <section>
        <h2>How the generator works</h2>
        <p>The generator runs a three-step pipeline on every link. First it retrieves the audio track of the public Reel. Then an automatic speech recognition model listens to that audio and writes down what is said — the same class of technology behind court-reporting software and podcast transcriptions. Finally the raw output is cut into short, readable cues, and each cue is stamped with the moment it starts and ends. No human reviews the middle step, which is why a generation pass takes seconds rather than hours.</p>
        <p>Everything runs on a server after you press the button. Your browser stays a browser: there is no app to download, no extension to trust, and no account that ties results to a profile.</p>
      </section>
      <section>
        <h2>What you can export</h2>
        <ul>
          <li><strong>Copy text</strong> — the full transcript as plain text on your clipboard, ready for notes, blog drafts, show notes or translations.</li>
          <li><strong>Download SRT</strong> — a subtitle file in which every line is a numbered cue with its own start and end time. Open it in any video editor or caption tool and the lines appear in sync.</li>
          <li><strong>Read on the page</strong> — the transcript stays visible with its timestamps so you can check a quote against the video before saving.</li>
        </ul>
      </section>
      <section>
        <h2>Cost, setup and limits</h2>
        <p>Generating a transcript is <strong>free</strong> and needs nothing installed — a modern browser and an internet connection are the whole setup, on desktop or phone. The limits are the honest kind: the Reel must be public, it may run at most <strong>3 minutes (180 seconds)</strong>, and only Instagram links that point at a single video are accepted. Clips of pure music come back with a notice that no speech was found, because the generator refuses to invent dialogue. Automatic recognition also makes occasional mistakes with names and numbers, so give the result a quick read before you depend on it.</p>
      </section>
    </div>
    <ReelTranscriber showIntro={false} showExample={false} />
    <div className="help-content">
      <section className="faq-plain">
        <h2>Frequently asked questions</h2>
        <h3>Is the generator free?</h3>
        <p>Yes. Every generation on this site costs nothing, and there is no premium tier that unlocks longer Reels or faster processing.</p>
        <h3>Do I need to install anything or register?</h3>
        <p>No. The generator works in the browser on any device. Nothing is downloaded, no extension is added, and no email address or Instagram login is requested.</p>
        <h3>How does it turn audio into text?</h3>
        <p>It extracts the audio from the Reel you linked and runs it through an automatic speech recognition model, then splits the words into timestamped cues. The chain is described plainly on the <Link to="/help">how it works</Link> page.</p>
        <h3>How long does one generation take?</h3>
        <p>Seconds. A short Reel is typically done in ten to twenty seconds; a clip near the three-minute limit takes longer, and a progress indicator tracks the work the whole time.</p>
        <h3>What formats can I export?</h3>
        <p>Plain text via the copy button, and the SRT subtitle format via the download button. SRT is supported by essentially every editing and captioning tool.</p>
        <h3>Does it separate different speakers?</h3>
        <p>No. The output is one combined transcript without speaker labels. If two people talk, their lines follow each other in order but are not attributed by name.</p>
        <h3>Why did my generation fail?</h3>
        <p>The common causes: the Reel is private or removed, it is longer than three minutes, the link points at a profile or Story rather than a video, or the post has no speech to transcribe. The <Link to="/contact">contact page</Link> takes reports of failures that look like none of these.</p>
      </section>
      <RelatedPages current="/instagram-reel-transcript-generator" />
    </div>
  </article>;
}
