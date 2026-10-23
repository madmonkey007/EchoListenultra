import React, { useEffect, useRef, useState } from 'react';
import { requestReelTranscript, ReelTranscript } from '../lib/reel-client.ts';

// Exact opening cues from the saved, real Turbo interview response (not generated demo copy).
const EXAMPLE = [
  ['00:00.000 – 00:04.740', "What is your name? I'm Thomas Skipper. How old are you? 21 years old."],
  ['00:05.220 – 00:09.580', "And where are you from? I'm from a small town in South Carolina called Marion."],
  ['00:09.980 – 00:14.100', "It's near Myrtle Beach. What do you do in life? I'm also a college baseball player."],
];
const timestamp = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
export default function ReelTranscriber() {
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<ReelTranscript | null>(null);
  const request = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (request.current) return;
    let normalized: URL;
    try {
      normalized = new URL(url.trim());
      if (normalized.protocol !== 'https:' || normalized.username || normalized.password || normalized.port
          || !['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(normalized.hostname)
          || !/^\/reels?\/[A-Za-z0-9_-]+\/?$/.test(normalized.pathname)) throw new Error();
    } catch { setError('Paste a public Instagram Reel URL, such as https://www.instagram.com/reel/…/'); return; }
    normalized.hostname = 'www.instagram.com'; normalized.pathname = normalized.pathname.replace(/^\/reels\//, '/reel/'); normalized.search = ''; normalized.hash = '';
    if (!normalized.pathname.endsWith('/')) normalized.pathname += '/';
    const controller = new AbortController(); request.current = controller;
    setPending(true); setElapsed(0); setError(''); setNotice(''); setResult(null);
    const deadline = window.setTimeout(() => controller.abort('timeout'), 270000);
    try {
      const output = await requestReelTranscript(normalized.href, controller.signal);
      setResult(output);
      window.setTimeout(() => resultHeading.current?.focus(), 0);
    } catch (failure) {
      if (controller.signal.aborted) setError(controller.signal.reason === 'timeout'
        ? 'This request took too long. Please try again later.'
        : 'Stopped waiting. Processing may still finish on the server.');
      else setError(failure instanceof Error ? failure.message : 'Transcription could not finish. Please try again.');
    } finally { window.clearTimeout(deadline); request.current = null; setPending(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(result?.text || ''); setNotice('Transcript copied.'); }
    catch { setNotice('Copy was unavailable. Select the transcript text to copy it.'); }
  }
  function download() {
    if (!result?.srt) return;
    const href = URL.createObjectURL(new Blob([result.srt], { type: 'application/x-subrip;charset=utf-8' }));
    const link = document.createElement('a'); link.href = href; link.download = 'reel-transcript.srt';
    document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <section className="reel-tool site-container" aria-labelledby="reel-title">
    <div className="reel-intro">
      <h1 id="reel-title">Instagram Transcript<br /><em>from Any Reel</em></h1>
      <p>Paste a public Reel link. Get a transcript you can copy and timed subtitles you can download.</p>
      <form onSubmit={submit} className="reel-form" aria-busy={pending}>
        <label htmlFor="reel-url">Instagram Reel URL</label>
        <input id="reel-url" type="url" inputMode="url" autoComplete="off" required placeholder="https://www.instagram.com/reel/…/" value={url} onChange={e => setUrl(e.target.value)} disabled={pending} aria-describedby="reel-hint" />
        <div className="reel-form-actions"><button className="button" type="submit" disabled={pending}>{pending ? 'Transcribing…' : 'Get transcript'}<span className="material-symbols-outlined" aria-hidden="true">{pending ? 'hourglass_top' : 'arrow_forward'}</span></button>{pending && <button className="text-link" type="button" onClick={() => request.current?.abort()}>Stop waiting</button>}</div>
        <p id="reel-hint" className="reel-hint">Public Reels up to 60 seconds. No Instagram sign-in needed. Some Reels may be unavailable.</p>
        <p className="reel-data-note">Your link and audio are processed online. <a href="/privacy#reel-transcription">How your data is used</a></p>
      </form>
      {pending && <div className="reel-wait">
        <div role="status"><strong>Fetching audio and creating your transcript…</strong><p>Usually around 6–10 seconds in our tests. Some Reels take longer.</p></div>
        <div className="reel-progress" role="progressbar" aria-label="Transcription in progress"><span /></div>
        <span role="timer" aria-live="off">{elapsed}s elapsed</span>
      </div>}
      {error && <p className="reel-error" role="alert">{error}</p>}
    </div>
    <aside className="reel-example" aria-labelledby="reel-example-title">
      <div className="reel-example-heading"><h2 id="reel-example-title">A real transcript, at a glance.</h2><span>Interview excerpt</span></div>
      <ol>{EXAMPLE.map(([time, text]) => <li key={time}><time>{time}</time><p>{text}</p></li>)}</ol>
      <a href="https://www.instagram.com/reel/DbQzbzrAJ-V/" target="_blank" rel="noopener noreferrer">View the source Reel <span aria-hidden="true">↗</span></a>
      <p className="reel-example-note">An excerpt from a real transcription. Automatic transcripts can contain errors.</p>
    </aside>
    {result && <section className="reel-result" aria-labelledby="reel-result-title">
      <div className="reel-result-top"><h2 id="reel-result-title" ref={resultHeading} tabIndex={-1}>{result.status === 'no_speech_detected' ? 'No speech detected' : 'Your transcript'}</h2>{result.status === 'transcribed' && <div className="reel-result-actions"><button className="button button-secondary" type="button" onClick={copy}>Copy text</button><button className="button" type="button" onClick={download} disabled={!result.srt}>Download SRT</button></div>}</div>
      {result.status === 'no_speech_detected' ? <p>No spoken words were detected in this Reel. Try another video with clear speech.</p> : <ol className="reel-cues">{result.cues.map((cue, i) => <li key={i}><time>{timestamp(cue.start)} – {timestamp(cue.end)}</time><p>{cue.text}</p></li>)}</ol>}
      {notice && <p role="status" className="reel-copy-notice">{notice}</p>}
    </section>}
  </section>;
}
