import React from 'react';
import { Link } from 'react-router-dom';
import ReelTranscriber from '../components/ReelTranscriber.tsx';
import RelatedPages from '../components/RelatedPages.tsx';

export default function InstagramVideoTranscriptView() {
  return <article className="help-page site-container">
    <div className="page-heading"><h1>Instagram Video Transcript</h1>
      <p>Transcribe any public video on Instagram — Reels and videos posted in the feed alike.</p></div>
    <div className="help-content">
      <section>
        <h2>Links that work</h2>
        <p>The tool accepts the address of any single public video on Instagram. In practice that means three link shapes:</p>
        <ul>
          <li><strong>instagram.com/reel/…/</strong> — the share link of a Reel, copied from the app's share sheet or the browser address bar.</li>
          <li><strong>instagram.com/reels/…/</strong> — the plural variant some browsers and embeds produce. It points at the same video and is accepted as-is.</li>
          <li><strong>instagram.com/p/…/</strong> — a feed post that contains a video, the kind that appears in the grid of a profile or the home feed. As long as the post is public and actually contains video, its speech can be transcribed.</li>
        </ul>
        <p>Links starting with <strong>m.instagram.com</strong> or <strong>www.instagram.com</strong> are treated the same; tracking parameters are stripped automatically, so a link copied straight from the share sheet works without cleaning.</p>
      </section>
      <section>
        <h2>Links that do not work</h2>
        <ul>
          <li><strong>Profile pages</strong> (instagram.com/username/) list many posts; a transcript needs one specific video, so copy the link from inside the post instead.</li>
          <li><strong>Stories</strong> vanish after a day and are served only to logged-in viewers, which public transcription cannot reach.</li>
          <li><strong>Private accounts</strong> and followers-only posts are invisible outside Instagram, and the tool does not use any login to get around that.</li>
          <li><strong>Photo and carousel posts without video</strong> have no speech to convert, so they return a clear no-speech error rather than an empty transcript.</li>
        </ul>
      </section>
      <section>
        <h2>Video posts versus Reels: what differs</h2>
        <p>Practically nothing in the output. Whether the link points at a Reel or at a feed video, the same pipeline applies: the audio is extracted, the speech is recognized, and the result is a transcript with per-line timestamps that you can copy or save as an SRT file. The differences are upstream of that — where the video lives on Instagram and how you grab its link. Feed videos live inside a post page, so you copy the post's <strong>/p/</strong> link; Reels have their dedicated <strong>/reel/</strong> page. The three-minute duration ceiling and the public-only rule apply equally to both, and a failed request produces the same plain-language error in either case.</p>
      </section>
    </div>
    <ReelTranscriber showIntro={false} showExample={false} />
    <div className="help-content">
      <section className="faq-plain">
        <h2>Frequently asked questions</h2>
        <h3>Can I transcribe a video posted in the feed, not a Reel?</h3>
        <p>Yes. Copy the post link — the one with <strong>/p/</strong> and a code — and paste it into the field. The transcript comes back in the same format as a Reel transcript.</p>
        <h3>Does a profile link work?</h3>
        <p>No. A profile page holds many posts and no single audio track. Open the specific video, then copy the link of that post or Reel.</p>
        <h3>What about Stories?</h3>
        <p>Stories expire within a day and are only served to logged-in accounts. They are outside what a public, login-free tool can reach.</p>
        <h3>Can the tool read a private account's videos?</h3>
        <p>No, and it will not pretend otherwise. Only videos that any logged-out visitor can open are transcribed.</p>
        <h3>Is the three-minute limit the same for feed videos?</h3>
        <p>Yes — up to three minutes of audio regardless of link type. Longer videos are declined with the measured duration in the message.</p>
        <h3>What happens with a photo post?</h3>
        <p>Photos contain no speech, so the request ends with a notice that no spoken audio was found. Nothing is invented to fill the gap.</p>
      </section>
      <RelatedPages current="/instagram-video-transcript" />
    </div>
  </article>;
}
