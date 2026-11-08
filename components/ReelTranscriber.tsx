import React, { useEffect, useRef, useState } from 'react';
import { requestReelTranscript, ReelTranscript, reelErrorMessage, INITIAL_REEL_PROGRESS, type ReelProgress } from '../lib/reel-client.ts';

import ReelResult from './ReelResult.tsx';
import { MAX_AUDIO_SECONDS, limitMinutes } from '../lib/transcription-limit.ts';

export function ReelErrorMessage({ message }: { message: string }) {
  return <p className="reel-error" role="alert">{message.split('\n').map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{line}</React.Fragment>)}</p>;
}
export function TranscriptionWait({ elapsed, progress = INITIAL_REEL_PROGRESS }: { elapsed: number; progress?: ReelProgress }) {
  const percent = Math.round(progress.completed / progress.total * 100);
  const label = { fetching_audio: 'Retrieving Reel audio', transcribing: 'Transcribing speech', formatting: 'Preparing text and subtitles', complete: 'Complete' }[progress.stage];
  return <div className="reel-wait">
    <div role="status"><strong>Transcribing… usually 10–30s</strong><p>Some Reels take longer.</p>{elapsed > 90 && <p>This one is taking longer than usual, still working…</p>}</div>
    <div className="reel-progress-label"><span>{label}</span><strong>{percent}%</strong></div>
    <div className="reel-progress" role="progressbar" aria-label="Transcription step progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}% — ${progress.completed} of ${progress.total} steps complete`}><span style={{ width: `${percent}%` }} /></div>
    <span className="reel-step-count">{progress.completed} of {progress.total} steps complete</span>
    <span role="timer" aria-live="off">{elapsed}s elapsed</span>
  </div>;
}

// Exact opening cues from the saved, real Turbo interview response (not generated demo copy).
const EXAMPLE = [
  ['00:00.000 – 00:04.740', "What is your name? I'm Thomas Skipper. How old are you? 21 years old."],
  ['00:05.220 – 00:09.580', "And where are you from? I'm from a small town in South Carolina called Marion."],
  ['00:09.980 – 00:14.100', "It's near Myrtle Beach. What do you do in life? I'm also a college baseball player."],
];
// Content pages embed the same tool without its homepage heading and example panel.
export default function ReelTranscriber({ showIntro = true, showExample = true }: { showIntro?: boolean; showExample?: boolean }) {
  const [url, setUrl] = useState('');
  const [limit, setLimit] = useState(MAX_AUDIO_SECONDS);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<ReelProgress>(INITIAL_REEL_PROGRESS);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<ReelTranscript | null>(null);
  const request = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const waitArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = pending ? waitArea.current : result ? resultHeading.current : null;
    if (!target) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: pending ? 'center' : 'start' });
    if (result && !pending) resultHeading.current?.focus({ preventScroll: true });
  }, [pending, result]);
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
          || !/^\/(?:reels?|p)\/[A-Za-z0-9_-]+\/?$/.test(normalized.pathname)) throw new Error();
    } catch { setError(reelErrorMessage({ error: 'invalid_url' })); return; }
    normalized.hostname = 'www.instagram.com'; normalized.pathname = normalized.pathname.replace(/^\/reels\//, '/reel/'); normalized.search = ''; normalized.hash = '';
    if (!normalized.pathname.endsWith('/')) normalized.pathname += '/';
    const controller = new AbortController(); request.current = controller;
    setPending(true); setElapsed(0); setProgress(INITIAL_REEL_PROGRESS); setError(''); setNotice(''); setResult(null);
    const deadline = window.setTimeout(() => controller.abort('timeout'), 270000);
    try {
      const output = await requestReelTranscript(normalized.href, controller.signal, undefined, setLimit, setProgress);
      setResult(output);

    } catch (failure) {
      if (controller.signal.aborted) setError(controller.signal.reason === 'timeout'
        ? reelErrorMessage({ error: 'timeout' })
        : 'Stopped waiting. Processing may still finish on the server.');
      else setError(failure instanceof Error ? failure.message : reelErrorMessage({ error: 'unexpected' }));
    } finally { window.clearTimeout(deadline); request.current = null; setPending(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(result?.text || ''); setNotice('Transcript copied.'); }
    catch { setNotice('Copy was unavailable. Select the transcript text to copy it.'); }
  }
  return <section className="reel-tool site-container" aria-labelledby={showIntro ? 'reel-title' : undefined} aria-label={showIntro ? undefined : 'Instagram transcript tool'}>
    <div className="reel-intro">
      {showIntro && <><h1 id="reel-title">Instagram Transcript<br /><em>from Any Reel</em></h1>
      <p>Paste a public Reel link. Get a transcript you can copy and timed subtitles you can download.</p></>}
      <form onSubmit={submit} className="reel-form" aria-busy={pending}>
        <label htmlFor="reel-url">Instagram Reel URL</label>
        <div className="reel-entry"><div className="reel-input-wrap"><input id="reel-url" type="url" inputMode="url" autoComplete="off" required placeholder="https://www.instagram.com/reel/…/" value={url} onChange={e => setUrl(e.target.value)} disabled={pending} aria-describedby="reel-hint" /></div>
        <div className="reel-form-actions"><button className="button" type="submit" disabled={pending}>{pending ? 'Transcribing…' : 'Get transcript'}<span className="material-symbols-outlined" aria-hidden="true">{pending ? 'hourglass_top' : 'arrow_forward'}</span></button></div></div>{pending && <button className="text-link" type="button" onClick={() => request.current?.abort()}>Stop waiting</button>}
        <p id="reel-hint" className="reel-hint">Public Reels up to {limitMinutes(limit)} minutes. No Instagram sign-in needed. Some Reels may be unavailable. Your link and audio are processed online. <a href="/privacy#reel-transcription">How your data is used</a></p>
        {notice && !result && <p role="status" className="reel-copy-notice">{notice}</p>}
      </form>
      {pending && <div ref={waitArea}><TranscriptionWait elapsed={elapsed} progress={progress} /></div>}
      {error && <ReelErrorMessage message={error} />}
    </div>
    {showExample && <aside className="reel-example" aria-labelledby="reel-example-title">
      <div className="reel-example-heading"><h2 id="reel-example-title">A real transcript, at a glance.</h2><span>Interview excerpt</span></div>
      <ol>{EXAMPLE.map(([time, text]) => <li key={time}><time>{time}</time><p>{text}</p></li>)}</ol>
      <a href="https://www.instagram.com/reel/DbQzbzrAJ-V/" target="_blank" rel="noopener noreferrer">View the source Reel <span aria-hidden="true">↗</span></a>
      <p className="reel-example-note">An excerpt from a real transcription. Automatic transcripts can contain errors.</p>
    </aside>}
    {result && <ReelResult result={result} notice={notice} onCopy={copy} headingRef={resultHeading} />}
  </section>;
}
