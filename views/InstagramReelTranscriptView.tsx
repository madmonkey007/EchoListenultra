import React from 'react';
import { Link } from 'react-router-dom';
import ReelTranscriber from '../components/ReelTranscriber.tsx';
import RelatedPages from '../components/RelatedPages.tsx';

export default function InstagramReelTranscriptView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>Instagram Reel Transcript</h1>
      <p>A transcript of a public Instagram Reel, with timestamps, that you can copy or save as subtitles.</p></div>
    <div className="help-content">
      <section>
        <h2>How to get a transcript from a Reel</h2>
        <p>You need one thing: the share link of a public Reel. In the Instagram app, tap the share icon and choose the option that copies the link. In a desktop browser, open the Reel and copy the address — it looks like <strong>instagram.com/reel/…/</strong>. The Reel must be viewable without logging in; anything hidden behind a private account cannot be read by the tool.</p>
        <ol>
          <li>Copy the link of a public Reel.</li>
          <li>Paste it into the field below and start the transcription.</li>
          <li>Wait a few seconds while the audio is processed.</li>
          <li>Read the transcript, copy it, or download the subtitle file.</li>
        </ol>
        <p>No Instagram account, app login or one-time code is involved at any point. You never hand over your credentials, because none are asked for.</p>
      </section>
      <section>
        <h2>What the finished transcript looks like</h2>
        <p>The result is the spoken content of the Reel, laid out as short lines with a start and end time for each line, so you can follow along with the video. From there you have two ways to save it. <strong>Copy text</strong> puts the plain transcript on your clipboard for notes, quotes or drafts. <strong>Download SRT</strong> saves a subtitle file in which every line is a numbered cue carrying its own time range — the format most video editors and caption tools accept directly.</p>
      </section>
      <section>
        <h2>Limits, and why a Reel may produce nothing</h2>
        <ul>
          <li>Length: a Reel can run up to <strong>3 minutes (180 seconds)</strong>. Longer clips are declined, and the error states the measured length of the one you submitted.</li>
          <li>Privacy: the Reel has to be public. Private accounts, restricted followers-only posts and removed media all fail.</li>
          <li>Link type: a profile page (<strong>instagram.com/username/</strong>) or a Story link does not point at a single Reel, so it is rejected. Copy the link from inside the Reel itself.</li>
          <li>No speech: a Reel that is only music or ambient sound has nothing to transcribe, and the tool tells you so instead of inventing words.</li>
        </ul>
        <p>When one of these applies, the page shows a plain error instead of a partial result, so a failed request is never mistaken for a finished transcript.</p>
      </section>
    </div>
    <ReelTranscriber showIntro={false} showExample={false} />
    <div className="help-content">
      <section className="faq-plain">
        <h2>Frequently asked questions</h2>
        <h3>Do I need an Instagram account to get a transcript?</h3>
        <p>No. The tool reads publicly available Reels the same way a logged-out browser does. There is no sign-up, no login and no Instagram authorization anywhere in the flow.</p>
        <h3>How long can the Reel be?</h3>
        <p>Up to three minutes of audio. If the clip runs longer, the request is declined and the message includes the actual duration that was measured.</p>
        <h3>Which link do I paste?</h3>
        <p>The share link that contains <strong>/reel/</strong> and a short code, for example <strong>instagram.com/reel/C123…/</strong>. Links to profiles, Stories or the Instagram home page do not identify a Reel and will not work.</p>
        <h3>Why did no transcript appear?</h3>
        <p>The three usual causes are a Reel that is not public, a Reel longer than the three-minute limit, or a link that points somewhere other than a single Reel. The error message tells you which case applies.</p>
        <h3>Does the transcript include timestamps?</h3>
        <p>Yes. Every line carries a start and end time, both on screen and inside the downloaded SRT file, so text and video stay aligned.</p>
        <h3>Is my transcript stored anywhere?</h3>
        <p>The result lives only on the page you are viewing. Refreshing clears it, so copy or download before you leave. The <Link to="/privacy">privacy page</Link> describes the processing in full.</p>
      </section>
      <RelatedPages current="/instagram-reel-transcript" />
    </div>
  </article>;
}
