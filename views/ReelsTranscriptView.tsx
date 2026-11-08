import React from 'react';
import { Link } from 'react-router-dom';
import ReelTranscriber from '../components/ReelTranscriber.tsx';
import RelatedPages from '../components/RelatedPages.tsx';

export default function ReelsTranscriptView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>Reels Transcript</h1>
      <p>Turn the words spoken in an Instagram Reel into text you can read, copy and keep.</p></div>
    <div className="help-content">
      <section>
        <h2>From spoken words to readable text</h2>
        <p>A Reel disappears into the scroll fast, and everything said in it disappears with it. A transcript fixes that. Paste the link of a public Reel below, and the speech in it is converted into written lines in the original order, each with its time in the video. You get the words of the creator — an interview answer, a tutorial step, a story — in a form you can skim, quote and save.</p>
        <p>The conversion is automatic. There is no dictation, no manual typing and no replaying the clip five times to catch a sentence. Paste, wait, read.</p>
      </section>
      <section>
        <h2>How long a Reel takes to transcribe</h2>
        <p>Most requests finish in well under half a minute. A typical one-minute Reel is usually ready in ten to twenty seconds; clips near the three-minute ceiling take somewhat longer because there is more audio to process. The page shows live progress — retrieving the audio, transcribing the speech, then preparing the text and subtitles — so you can see that work is happening. Keep the tab open until the result appears.</p>
      </section>
      <section>
        <h2>Using the transcript for subtitles</h2>
        <p>Two outputs are yours to take. The plain text works as the base for captions you will style yourself: paste it into your notes or editor and adjust the wording to taste. The <strong>SRT file</strong> goes further — it is a standard subtitle file in which each phrase already carries its start and end time, so players, editors and caption tools can display the lines in sync with the video without you timing anything by hand.</p>
        <p>Automatic recognition is fast but not flawless. Before publishing subtitles, play the Reel once against the transcript and fix the odd misheard name or number.</p>
      </section>
    </div>
    <ReelTranscriber showIntro={false} showExample={false} />
    <div className="help-content">
      <section className="faq-plain">
        <h2>Frequently asked questions</h2>
        <h3>What exactly is a transcript here?</h3>
        <p>The written version of everything spoken in a Reel, ordered as it was said, with the time each line begins and ends. It is not a translation and not a summary — it is the speech itself, in text.</p>
        <h3>How long does a one-minute Reel take?</h3>
        <p>Roughly ten to twenty seconds from paste to finished text. Reels closer to three minutes need longer, and the progress indicator shows each step while you wait.</p>
        <h3>Can I use the text as subtitles directly?</h3>
        <p>Yes — choose <strong>Download SRT</strong>. The file is a standard subtitle format whose lines are already timed, so it drops into video editors and players as-is. If you prefer your own styling, copy the text and caption manually instead.</p>
        <h3>Can I transcribe only one part of a Reel?</h3>
        <p>The whole Reel is transcribed in one pass, and you take what you need: play the result against the video, then copy just the lines or the single quote you wanted. There is currently no way to submit only a start and end time.</p>
        <h3>What about Reels that are only music?</h3>
        <p>If there is no speech, there is nothing to write down. The tool reports that no spoken words were detected rather than filling the page with invented lines.</p>
        <h3>Does a private Reel work?</h3>
        <p>No. Only content that anyone on the internet can open without an account can be transcribed. The <Link to="/privacy">privacy page</Link> explains how the processing works.</p>
      </section>
      <RelatedPages current="/reels-transcript" />
    </div>
  </article>;
}
