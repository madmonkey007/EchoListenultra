import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioSession, SlicingMethod, AIProviderConfig, AudioSegment } from '../types.ts';
import { fileImportError, durationImportError } from '../lib/import-limits.ts';
import { saveImportDraft, restoreImportDraft, clearImportDraft } from '../lib/import-draft.ts';
import { importVideoAudio } from '../lib/video-client.ts';
import { normalizeVideoUrl } from '../lib/video-url.ts';
import { trackEvent } from '../lib/analytics.ts';
import { needsFallbackConsent, fallbackSeconds, transcriptionFailureMessage } from '../lib/import-outcome.ts';
import { transcribeAudio, sanitizeSegments } from '../services/transcription.ts';

const PRESET_COVERS = [
  '1518133910546-b6c2fb7d79e3', '1518770660439-4636190af475', '1507413245164-6160d8298b31',
  '1451187580459-43490279c0fa', '1461896704190-3213cf0ad119', '1519791883288-dc8bd9967f1f',
  '1536640712-4d4c36ff0e4e', '1511632765486-a01980e01a18', '1520694478145-d14946084531',
  '1511671782779-c97d3d27a1d4', '1507838596018-b9468b4961f6', '1519999482648-25049ddd37b1',
  '1494438639946-1ebd1d20bf85', '1485827404703-89b55fcc595e', '1519011985187-444d62641929',
  '1517245386807-bb43f82c33c4', '1441974231531-6227db76b6e', '1547826039-adc3a421f163',
  '1486406146926-c627a92fb1ab', '1514525253344-9104f6e43034'
];

const DB_NAME = 'EchoListenStorage';
const DB_VERSION = 3;

const saveAudioToDB = (id: string, blob: Blob): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio_files')) {
        db.close();
        reject(new Error("Audio storage is unavailable. Please reload and try again."));
        return;
      }
      const transaction = db.transaction('audio_files', 'readwrite');
      const store = transaction.objectStore('audio_files');
      const putRequest = store.put(blob, id);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(new Error("Could not save audio. Check available browser storage.")); };
      putRequest.onerror = () => reject(new Error("Failed to store audio blob"));
    };
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio_files')) db.createObjectStore('audio_files');
      if (!db.objectStoreNames.contains('dictionary')) db.createObjectStore('dictionary');
    };
  });
};

const getAudioDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
  const audio = new Audio();
  const url = URL.createObjectURL(file);
  const finish = (duration?: number) => {
    clearTimeout(timeout);
    audio.onloadedmetadata = null;
    audio.onerror = null;
    URL.revokeObjectURL(url);
    if (duration && Number.isFinite(duration)) resolve(duration);
    else reject(new Error('This audio could not be read. Try an MP3, WAV, M4A, or OGG file.'));
  };
  const timeout = setTimeout(() => finish(), 10000);
  audio.onloadedmetadata = () => finish(audio.duration);
  audio.onerror = () => finish();
  audio.src = url;
});

interface AddSessionViewProps {
  onAdd: (session: AudioSession) => void;
  apiConfig: AIProviderConfig;
  isOnline?: boolean;
}

const AddSessionView: React.FC<AddSessionViewProps> = ({ onAdd, apiConfig, isOnline = true }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const providerKey = apiConfig.provider === 'deepgram' ? apiConfig.deepgramApiKey : apiConfig.geminiApiKey;
  const canTranscribe = isOnline && ['gemini', 'deepgram'].includes(apiConfig.provider) && !!providerKey?.trim();
  const [method, setMethod] = useState<SlicingMethod>(canTranscribe ? SlicingMethod.SENTENCE : SlicingMethod.DURATION);
  const [ruleValue, setRuleValue] = useState(1);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'uploading' | 'transcribing' | 'slicing' | 'saving'>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoStatus, setVideoStatus] = useState('');
  const videoAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => videoAbortRef.current?.abort(), []);
  const importVideo = async () => {
    if (busyRef.current) return;
    const url = normalizeVideoUrl(videoUrl);
    if (!url) { setError('Paste a valid HTTPS YouTube or TikTok video link.'); return; }
    busyRef.current = true;
    const controller = new AbortController(); videoAbortRef.current = controller;
    setError(''); setVideoStatus('Starting audio extraction…');
    try {
      const file = await importVideoAudio(url, controller.signal, setVideoStatus);
      controller.signal.throwIfAborted();
      await clearImportDraft();
      controller.signal.throwIfAborted();
      if (!mountedRef.current) return;
      draftTouchedRef.current = true;
      setSelectedFile(file); setFallbackNotice(''); setVideoUrl('');
    } catch (error) {
      if (mountedRef.current) setError(controller.signal.aborted ? 'Video import cancelled. Any previous file is still selected.' : error instanceof Error ? error.message : 'Video import failed. Please retry.');
    } finally {
      busyRef.current = false; videoAbortRef.current = null;
      if (mountedRef.current) setVideoStatus('');
    }
  };
  const [fallbackNotice, setFallbackNotice] = useState('');
  const busyRef = useRef(false);
  const draftTouchedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    restoreImportDraft().then(draft => {
      if (!cancelled && !draftTouchedRef.current && draft) { setSelectedFile(draft.file); setMethod(draft.method); setRuleValue(draft.ruleValue); }
    }).catch(() => { if (!cancelled) setError('Your previous import could not be restored. Choose the file again.'); });
    return () => { cancelled = true; };
  }, []);
  const openAccount = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    try {
      if (selectedFile) await saveImportDraft({ file: selectedFile, method, ruleValue });
      navigate('/account?returnTo=/add');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not preserve your import. Please retry.'); }
    finally { busyRef.current = false; }
  };
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const fallbackLabel = method === SlicingMethod.DURATION ? `${ruleValue} ${ruleValue === 1 ? 'minute' : 'minutes'}` : '30 seconds';
  const changeMethod = (next: SlicingMethod) => {
    if (busyRef.current) return;
    draftTouchedRef.current = true;
    setFallbackNotice('');
    setMethod(next);
    setRuleValue(value => Math.min(value, next === SlicingMethod.SENTENCE ? 3 : next === SlicingMethod.DURATION ? 30 : 50));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (busyRef.current) return;
    const file = e.target.files?.[0];
    setError('');
    setFallbackNotice('');
    if (!file) return;
    draftTouchedRef.current = true;
    try { await clearImportDraft(); } catch { setError('Could not discard the previous saved import. Please retry.'); return; }
    if (fileImportError(file.size)) { setSelectedFile(null); setError(fileImportError(file.size)); return; }
    if ((!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|aac|flac|webm)$/i.test(file.name)) || file.size === 0) {
      setSelectedFile(null);
      setError('Choose a non-empty audio file such as MP3, WAV, or M4A.');
      return;
    }
    setSelectedFile(file);
    trackEvent('audio_selected');
  };

  const discardFile = async () => {
    if (busyRef.current) return;
    draftTouchedRef.current = true;
    try {
      await clearImportDraft();
      setSelectedFile(null); setError(''); setFallbackNotice('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch { setError('Could not discard the saved import. Please retry.'); }
  };

  const handleGenerate = async (acceptFallback = false) => {
    if (!selectedFile || busyRef.current) return;
    if (method === SlicingMethod.SENTENCE && !canTranscribe && !acceptFallback) { setError('Sentence splitting requires online transcription. Add a key in Settings or choose By time.'); return; }

    busyRef.current = true;
    setError('');
    setFallbackNotice('');
    setProcessingStatus('uploading');
    setProgress(10);

    try {
      const sessionId = Math.random().toString(36).substr(2, 9);
      const audioDuration = await getAudioDuration(selectedFile);
      if (!mountedRef.current) return;
      const durationError = durationImportError(audioDuration);
      if (durationError) { setError(durationError); return; }
      let segments: AudioSegment[] = [];

      let fallbackReason = canTranscribe && !acceptFallback ? '' : 'Local time segments · no transcript';
      const canUseAI = canTranscribe && (apiConfig.provider === 'gemini' || apiConfig.provider === 'deepgram');

      if (canUseAI && !acceptFallback) {
        try {
          setProcessingStatus('transcribing');
          setProgress(30);

          segments = await transcribeAudio(selectedFile, apiConfig, method, ruleValue, audioDuration);
          if (!mountedRef.current) return;
          segments = sanitizeSegments(segments, audioDuration);
          if (!segments.length) throw new Error('No usable speech transcript');
          setProgress(60);
          setProcessingStatus('slicing');
        } catch (aiError) {
          if (!mountedRef.current) return;
          trackEvent('transcription_failed');
          setFallbackNotice(transcriptionFailureMessage(aiError));
          return;
        }
      }

      if (!segments.length && needsFallbackConsent(canUseAI, method, acceptFallback)) {
        setFallbackNotice('Speaker-turn splitting needs an online transcript. You can continue without a transcript using time segments.');
        return;
      }
      if (!segments || segments.length === 0) {
        fallbackReason ||= 'No transcript returned · local time segments';
        const dur = audioDuration;
        const sliceSize = fallbackSeconds(method, ruleValue);
        for (let t = 0; t < dur; t += sliceSize) {
          segments.push({
            id: `manual-${t}`,
            startTime: t,
            endTime: Math.min(t + sliceSize, dur),
            text: `[Audio Section: ${Math.floor(t/60)}m ${Math.floor(t%60)}s]`,
            speaker: 1
          });
        }
      }

      if (!mountedRef.current) return;
      setProcessingStatus('saving');
      setProgress(90);
      await saveAudioToDB(sessionId, selectedFile);

      if (!mountedRef.current) return;
      const randomCoverId = PRESET_COVERS[Math.floor(Math.random() * PRESET_COVERS.length)];

      onAdd({
        id: sessionId,
        title: selectedFile.name.replace(/\.[^/.]+$/, ""),
        subtitle: `${segments.length} segments · ${fallbackReason || 'AI transcript'}`,
        coverUrl: `https://images.unsplash.com/photo-${randomCoverId}?auto=format&fit=crop&w=400&h=400&q=60`,
        segments,
        duration: audioDuration || (segments.length > 0 ? segments[segments.length - 1].endTime : 0),
        lastPlayed: 'Just now',
        status: 'ready'
      });

      await clearImportDraft().catch(() => {});
      trackEvent('import_complete');
      setProgress(100);
      navigate('/library');
    } catch (e) {
      if (mountedRef.current) setError('Audio could not be imported. Check the audio format and available browser storage, then retry.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setProcessingStatus('idle');
    }
  };

  return (
    <div className="import-page p-6 pb-24 space-y-8 bg-background-light dark:bg-background-dark min-h-full overflow-y-auto no-scrollbar">
      <header className="flex items-center gap-4 pt-4">
        <button aria-label="Back to library" onClick={() => navigate('/library')} className="size-10 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-slate-500">arrow_back</span>
        </button>
        <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Import audio</h1>
      </header>

      <div role="button" tabIndex={0} aria-label="Choose an audio file" onKeyDown={event => { if (processingStatus === 'idle' && !videoStatus && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); fileInputRef.current?.click(); } }}
        onClick={() => processingStatus === 'idle' && !videoStatus && fileInputRef.current?.click()}
        className={`import-dropzone flex flex-col items-center justify-center p-12 bg-surface-light dark:bg-surface-dark border-2 border-dashed rounded-[2.5rem] transition-all duration-300 ${selectedFile ? 'border-accent shadow-lg bg-accent/5' : 'border-slate-200 dark:border-white/10'} ${processingStatus !== 'idle' || !!videoStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent/40'}`}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.webm" disabled={processingStatus !== 'idle' || !!videoStatus} />
        <span className="material-symbols-outlined text-4xl mb-4 text-accent">{selectedFile ? 'check_circle' : 'upload_file'}</span>
        <p className="font-bold text-sm text-center truncate w-full text-slate-900 dark:text-white">
          {selectedFile ? selectedFile.name : 'Choose an audio file'}
        </p>
        <p className="import-format-hint">MP3, WAV, M4A, OGG, AAC, FLAC, WebM</p>
        <p className="import-format-hint">Up to 100 MB · 2 hours · Playback depends on your browser</p>
      </div>
      {selectedFile && processingStatus === 'idle' && !videoStatus && <button className="text-sm underline" onClick={discardFile}>Discard selected file</button>}
      <details className="video-import">
        <summary>Import from YouTube or TikTok</summary>
        <form onSubmit={event => { event.preventDefault(); void importVideo(); }} className="video-import-form">
          <label htmlFor="video-url">Video link</label>
          <div className="video-import-row">
            <input id="video-url" type="url" placeholder="https://www.youtube.com/watch?v=…" value={videoUrl} onChange={event => setVideoUrl(event.target.value)} required disabled={!!videoStatus || processingStatus !== 'idle'} />
            <button className="button button-small" type="submit" disabled={!!videoStatus || processingStatus !== 'idle' || !videoUrl.trim()}>Extract audio</button>
          </div>
          <p className="import-format-hint">Public videos up to 10 minutes. Import only content you own or have permission to use. Video links are sent to our extraction service.</p>
          {videoStatus && <div role="status">{videoStatus} <button type="button" className="underline" onClick={() => videoAbortRef.current?.abort()}>Cancel</button></div>}
        </form>
      </details>
      <p className="text-sm text-slate-500 dark:text-gray-400 leading-relaxed">Your imported audio is saved in this browser. Clearing browser data removes your library.</p>
      <p className="text-sm text-slate-500 dark:text-gray-400">Local files and video links do not require Google sign-in. <button className="underline" disabled={processingStatus !== 'idle' || !!videoStatus} onClick={openAccount}>Sign in &amp; online allowance</button>{selectedFile && ' · Your file and split settings will be kept for 1 hour while you sign in.'}</p>
      <div role="note" className="p-4 rounded-2xl bg-slate-100 dark:bg-surface-dark text-sm leading-relaxed">
        {canTranscribe ? 'AI transcription is enabled. Creating this session sends your audio directly to your selected provider and may incur provider charges.' : 'No online transcription is configured. Local audio files stay on this device and are split by time without a transcript. Sentence splitting requires transcription. Speaker-turn mode falls back to 30-second segments.'}
        {canTranscribe && <p className="mt-2">Uses your own key · platform credits are not used</p>}
        {' '}<button className="underline" onClick={() => navigate('/settings')}>Transcription settings</button>
      </div>
      {fallbackNotice && <section role="alert" className="p-4 rounded-2xl bg-slate-100 dark:bg-surface-dark text-sm space-y-3">
        <h2 className="font-bold">Transcription not completed</h2>
        <p>{fallbackNotice}</p>
        <p>No listening session has been created. Your selected file and split settings are still here.</p>
        <p>Time fallback creates segments of {fallbackLabel}, without subtitles or word highlighting. The last segment may be shorter.</p>
        <div className="flex flex-wrap gap-3">
          {canTranscribe && <button className="underline" disabled={processingStatus !== 'idle'} onClick={() => handleGenerate()}>Retry transcription</button>}
          <button className="underline" disabled={processingStatus !== 'idle'} onClick={() => handleGenerate(true)}>Continue with time segments ({fallbackLabel})</button>
          <button className="underline" onClick={() => navigate('/settings')}>Transcription settings</button>
          <button className="underline" onClick={() => navigate('/contact?category=transcription')}>Report issue</button>
        </div>
      </section>}
      {error && <p role="alert" className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
      {processingStatus === 'idle' ? (
        <div className="space-y-6 animate-fade-in">
          <section className="space-y-3">
             <div className="flex items-center gap-2 px-1">
                <span className="material-symbols-outlined text-xs text-slate-400">psychology</span>
                <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Split audio</label>
             </div>
             <div className="grid grid-cols-3 bg-surface-light dark:bg-surface-dark p-1.5 rounded-[1.5rem] border border-slate-200 dark:border-white/5 shadow-inner">
                <button type="button" disabled={!canTranscribe} aria-pressed={method === SlicingMethod.SENTENCE} onClick={() => changeMethod(SlicingMethod.SENTENCE)} className={`py-3.5 text-xs font-bold rounded-xl disabled:opacity-40 ${method === SlicingMethod.SENTENCE ? 'bg-slate-900 dark:bg-accent text-white dark:text-black' : 'text-slate-400'}`}>By sentence</button>
                <button
                  type="button"
                  aria-pressed={method === SlicingMethod.DURATION}
                  onClick={() => changeMethod(SlicingMethod.DURATION)}
                  className={`py-3.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all duration-300 ${method === SlicingMethod.DURATION ? 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg' : 'text-slate-400 dark:text-gray-500'}`}
                >
                  By Time
                </button>
                <button
                  type="button"
                  aria-pressed={method === SlicingMethod.TURNS}
                  onClick={() => changeMethod(SlicingMethod.TURNS)}
                  className={`py-3.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all duration-300 ${method === SlicingMethod.TURNS ? 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg' : 'text-slate-400 dark:text-gray-500'}`}
                >
                  Speaker turns
                </button>
             </div>
          </section>

          <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
             <div className="flex justify-between mb-8 items-baseline px-1">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">Segment size</span>
               <span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                 {ruleValue} <span className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">{method === SlicingMethod.SENTENCE ? (ruleValue === 1 ? 'sentence' : 'sentences') : method === SlicingMethod.DURATION ? 'min' : 'turns'}</span>
               </span>
             </div>
             {method === SlicingMethod.SENTENCE ? <div className="grid grid-cols-3 gap-3" role="group" aria-label="Sentences per segment">{[1, 2, 3].map(count => <button key={count} type="button" aria-pressed={ruleValue === count} onClick={() => { draftTouchedRef.current = true; setRuleValue(count); setFallbackNotice(''); }} className={`py-3 rounded-xl border text-sm ${ruleValue === count ? 'border-accent text-accent bg-accent/10' : 'border-slate-500 text-slate-400'}`}>{count} {count === 1 ? 'sentence' : 'sentences'}</button>)}</div> : <input
               type="range"
               aria-label={method === SlicingMethod.DURATION ? "Minutes per segment" : "Speaker turns per segment"}
               className="w-full h-2 bg-slate-100 dark:bg-background-dark rounded-full appearance-none accent-accent cursor-pointer"
               min="1"
               max={method === SlicingMethod.DURATION ? "30" : "50"}
               step="1"
               value={ruleValue}
               onChange={(e) => { draftTouchedRef.current = true; setRuleValue(parseInt(e.target.value)); setFallbackNotice(''); }}
             />}
             <p className="mt-6 text-[9px] text-slate-400 dark:text-gray-500 font-medium leading-relaxed">
               {method === SlicingMethod.SENTENCE
                 ? "Keep 1, 2 or 3 sentences together, with word timing preserved. Requires a transcript; punctuation determines sentence boundaries."
                 : method === SlicingMethod.TURNS
                 ? "Group this many speaker turns per segment. Requires online transcription and your API key."
                 : "Divides audio into fixed intervals. Best for monologues and long lectures."}
             </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8 py-10 text-center animate-pulse">
          <div className="flex flex-col items-center gap-6">
             <div className="relative size-20">
               <div className="absolute inset-0 rounded-full border-4 border-accent/20"></div>
               <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent animate-spin"></div>
             </div>
             <div className="space-y-2">
               <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">{processingStatus}</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preparing your listening session…</p>
             </div>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-surface-dark rounded-full overflow-hidden mx-8">
            <div className="h-full bg-accent shadow-[0_0_10px_#00E4FF] transition-all duration-1000" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      <button
        onClick={() => handleGenerate()}
        disabled={processingStatus !== 'idle' || !!videoStatus || !selectedFile}
        className={`w-full py-6 rounded-[2.5rem] font-display text-lg font-black transition-all duration-500 active:scale-95 shadow-2xl ${selectedFile && processingStatus === 'idle' ? 'bg-slate-900 dark:bg-accent text-white dark:text-black hover:opacity-90' : 'bg-slate-100 dark:bg-gray-800 text-slate-400 cursor-not-allowed opacity-50'}`}
      >
        {processingStatus === 'idle' ? 'Create listening segments' : 'Processing...'}
      </button>
    </div>
  );
};

export default AddSessionView;
