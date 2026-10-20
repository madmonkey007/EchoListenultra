import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { trackEvent } from '../lib/analytics.ts';
import { SAMPLE_SESSION } from '../data/sample.ts';

export default function LandingView() {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { const element = audio.current; return () => element?.pause(); }, []);
  const active = Math.max(0, SAMPLE_SESSION.segments.findIndex(s => time >= s.startTime && time < s.endTime));
  async function toggle() {
    if (!audio.current) return;
    if (playing) audio.current.pause();
    else try { await audio.current.play(); setError(''); } catch { setError('Playback could not start. Open the sample to try again.'); }
  }
  return <div className="landing">
    <section className="hero site-container" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">Less rewinding.<br />More <em>understanding.</em></h1>
        <p className="hero-description">Turn your own audio into small, repeatable listening sessions. Slow down, catch the details, and make new words stick.</p>
        <div className="hero-actions"><Link to="/add" className="button">Try your own audio <span aria-hidden="true">↗</span></Link><Link to="/player/sample-1" className="text-link">Explore the sample <span aria-hidden="true">→</span></Link></div>
        <p className="quiet-note"><span className="status-dot" />No sign-up for local practice. Your library stays in this browser.</p>
      </div>
      <div className="listening-preview">
        <div className="preview-top"><span className="preview-label">A little practice, every day</span><span className="preview-length">{Math.ceil(SAMPLE_SESSION.duration)} sec sample</span></div>
        <div className={`waveform ${playing ? 'is-playing' : ''}`} aria-hidden="true">{Array.from({length: 55}, (_, i) => <i key={i} style={{height: `${12 + ((i * 17 + i * i * 3) % 64)}px`, animationDelay: `${i * -.06}s`}} />)}</div>
        <div className="preview-reading"><span className="segment-caption">Listen in smaller pieces</span><p>{SAMPLE_SESSION.segments[active].text}</p></div>
        <div className="preview-controls"><button className="demo-play" onClick={toggle} aria-label={playing ? 'Pause sample' : 'Play sample'}><span className="material-symbols-outlined" aria-hidden="true">{playing ? 'pause' : 'play_arrow'}</span></button><div><strong>{playing ? 'Listening…' : 'Hear it for yourself'}</strong><span>Synthetic voice · English</span></div><Link to="/player/sample-1" aria-label="Open full sample player" className="preview-open"><span className="material-symbols-outlined" aria-hidden="true">open_in_full</span></Link></div>
        <audio ref={audio} src="/demo/sample.wav" preload="none" onPlay={() => { setPlaying(true); trackEvent('sample_play'); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onError={() => setError('The sample could not load. Please check your connection.')} />
        {error && <p role="alert" className="inline-error">{error}</p>}
      </div>
    </section>
    <section className="principles site-container" aria-label="Built for your practice"><p>YOUR AUDIO.<br /><strong>YOUR PACE.</strong></p><div><span className="material-symbols-outlined" aria-hidden="true">content_cut</span><span>Small sections,<br />clearer focus</span></div><div><span className="material-symbols-outlined" aria-hidden="true">repeat_one</span><span>Repeat a section,<br />hear a little more</span></div><div><span className="material-symbols-outlined" aria-hidden="true">bookmark</span><span>Keep words<br />in their context</span></div></section>
    <section className="workflow site-container" aria-labelledby="workflow-title">
      <div className="section-intro"><h2 id="workflow-title">Make any audio<br />your next lesson.</h2><p>A podcast, a lecture, a conversation.<br />Bring something you actually want to understand.</p><Link to="/help" className="text-link">Read the quick guide <span aria-hidden="true">→</span></Link></div>
      <ol className="steps"><li><span className="step-number">1</span><div><h3>Bring your audio</h3><p>Choose an audio file from your device. No account or shared content library to manage.</p></div></li><li><span className="step-number">2</span><div><h3>Find a manageable piece</h3><p>Split by time without an API key. Add your own AI key for a transcript and sentence or speaker-based sections.</p></div></li><li><span className="step-number">3</span><div><h3>Listen. Repeat. Let it click.</h3><p>Loop one section, adjust the speed, and save words from your transcript for later review.</p></div></li></ol>
    </section>
    <section className="privacy-strip site-container"><span className="material-symbols-outlined" aria-hidden="true">folder_open</span><div><h2>A personal library, without an account.</h2><p>Audio and saved words stay in this browser. AI transcription sends audio to your chosen provider. Clearing browser data removes your library.</p></div><Link to="/privacy" className="text-link">About your data <span aria-hidden="true">→</span></Link></section>
    <section className="faq-section site-container" aria-labelledby="faq-title"><h2 id="faq-title">Before you press play.</h2><div className="faq-list"><details><summary>Can I use it without an AI key?</summary><p>Yes. Import audio, split it by time, and use looping and playback speed. Automatic transcripts and speaker detection require your own Gemini or Deepgram key.</p></details><details><summary>Do I need to sign up?</summary><p>Local listening needs no sign-up. Optional Google sign-in is for online allowance where configured. Your audio library, vocabulary and settings stay in this browser.</p></details><details><summary>Does it work on my computer and phone?</summary><p>Yes, in a supported modern browser. Each browser has its own library; files and learning records do not sync between devices.</p></details></div></section>
    <section className="closing site-container"><h2>Your next listen<br />can go a little deeper.</h2><Link to="/add" className="button">Start a listening session <span aria-hidden="true">↗</span></Link></section>
  </div>;
}
