import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ReelTranscript } from '../lib/reel-client.ts';
import { resultSegments, resultAudioBlob, transcriptExport, type TranscriptFormat } from '../lib/reel-result.ts';
import { getSynchronizedWords, getActiveSegmentIndex, getActiveWordIndex, scrollActiveCaptionIntoView } from '../lib/subtitle-timing.ts';
const timestamp = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
interface Props { result: ReelTranscript; notice: string; onCopy: () => void; headingRef?: React.Ref<HTMLHeadingElement> }
export default function ReelResult({ result, notice, onCopy, headingRef }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [format, setFormat] = useState<TranscriptFormat>('srt');
  const segments = useMemo(() => resultSegments(result), [result]);
  const timings = useMemo(() => segments.map(getSynchronizedWords), [segments]);
  const active = getActiveSegmentIndex(segments, currentTime);
  const words = active >= 0 ? timings[active] : null;
  const activeWord = words ? getActiveWordIndex(words, currentTime) : -1;
  useEffect(() => {
    setAudioError(''); setCurrentTime(0); setPlaying(false);
    if (!result.audio) { setAudioUrl(''); return; }
    let href: string;
    try { href = URL.createObjectURL(resultAudioBlob(result.audio)); setAudioUrl(href); }
    catch { setAudioError('The audio could not be loaded. You can still copy or export your transcript.'); setAudioUrl(''); return; }
    return () => URL.revokeObjectURL(href);
  }, [result.audio]);
  useEffect(() => {
    if (playing) scrollActiveCaptionIntoView(list.current, active);
  }, [active, activeWord, playing]);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => { if (audio.current) setCurrentTime(audio.current.currentTime); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  function download() {
    const output = transcriptExport(result, format);
    const href = URL.createObjectURL(new Blob([output.content], { type: output.mime }));
    const link = document.createElement('a'); link.href = href; link.download = output.filename;
    document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  async function seek(start: number) {
    if (!audio.current || !audioUrl) return;
    audio.current.currentTime = start; setCurrentTime(start);
    try { await audio.current.play(); } catch { setAudioError('Playback could not start. Try the audio play button.'); }
  }
  const spoken = result.status === 'transcribed';
  return <section className="reel-result" aria-labelledby="reel-result-title">
    {spoken && <p className="reel-success" role="status"><span className="material-symbols-outlined" aria-hidden="true">check_circle</span>Transcription complete. 100%</p>}
    <div className="reel-result-top"><h2 id="reel-result-title" ref={headingRef} tabIndex={-1}>{spoken ? 'Your transcript' : 'No speech detected'}</h2>{spoken && <div className="reel-result-actions">
      <button className="button button-secondary" type="button" onClick={onCopy}>Copy text</button>
      <div className="reel-export"><label className="sr-only" htmlFor="reel-export-format">Export format</label><select id="reel-export-format" value={format} onChange={e => setFormat(e.target.value as TranscriptFormat)}><option value="srt">Subtitles (.srt)</option><option value="md">Markdown (.md)</option><option value="txt">Plain text (.txt)</option></select><button className="button" type="button" onClick={download} disabled={format === 'srt' && !result.srt}>{format === 'srt' ? 'Download SRT' : format === 'md' ? 'Download Markdown' : 'Download text'}</button></div>
    </div>}</div>
    {result.audio && <div className="reel-audio"><label htmlFor="reel-result-audio">Original Reel audio</label><audio ref={audio} id="reel-result-audio" aria-label="Original Reel audio" controls preload="metadata" src={audioUrl || undefined} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onSeeked={e => setCurrentTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setAudioError('This browser could not play the audio. You can still copy or export your transcript.')} /></div>}
    {audioError && <p className="reel-copy-notice" role="status">{audioError}</p>}
    {!spoken ? <p>No spoken words were detected in this Reel. Try another video with clear speech.</p> : <>
      <p className="reel-reading-hint">{audioUrl ? 'Play the audio to follow the highlighted text, or select a passage to play from there.' : 'Copy the text or choose a download format.'}</p>
      <ol className="reel-cues reel-playback-cues" ref={list} aria-label="Transcript passages">{result.cues.map((cue, i) => <li key={i} data-seg-idx={i} className={active === i && audioUrl ? 'is-active' : undefined} aria-current={active === i && audioUrl ? 'true' : undefined}><button type="button" className="reel-cue-play" aria-label={`Play segment ${i + 1} at ${timestamp(cue.start)}`} disabled={!audioUrl} onClick={() => seek(cue.start)}><time>{timestamp(cue.start)} – {timestamp(cue.end)}</time><span>{timings[i] ? cue.text.split(/(\s+)/).map((token, tokenIndex, tokens) => {
        if (/^\s+$/.test(token)) return token;
        const wordIndex = tokens.slice(0, tokenIndex).filter(value => value && !/^\s+$/.test(value)).length;
        const current = active === i && wordIndex === activeWord && !!audioUrl;
        return <mark key={tokenIndex} className={current ? 'reel-word is-spoken' : 'reel-word'} data-active-word={current ? 'true' : undefined}>{token}</mark>;
      }) : cue.text}</span></button></li>)}</ol>
    </>}
    {notice && <p role="status" className="reel-copy-notice">{notice}</p>}
  </section>;
}
