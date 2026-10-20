import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AudioSession, PlayerMode, PlaybackMode, AudioSegment, WordDefinition, SavedWord, AIProviderConfig, SlicingMethod } from '../types.ts';
import { getSynchronizedWords, getActiveWordIndex, getActiveSegmentIndex } from '../lib/subtitle-timing.ts';
import { trackEvent } from '../lib/analytics.ts';
import { transcribeAudio } from '../services/transcription.ts';

const SEEK_STEP = 15;
const DB_NAME = 'EchoListenStorage';
const DB_VERSION = 3;

export const getSeekState = (time: number, duration: number, segments: AudioSegment[], segmentIdx?: number) => {
  const nextTime = Math.max(0, Math.min(duration || 0, time));
  const activeIndex = segmentIdx ?? segments.findIndex(seg => nextTime >= seg.startTime && nextTime < seg.endTime);
  return { nextTime, activeIndex };
};

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e: any) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio_files')) db.createObjectStore('audio_files');
      if (!db.objectStoreNames.contains('dictionary')) db.createObjectStore('dictionary');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAudioFromDB = async (id: string): Promise<Blob | null> => {
  const db = await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction('audio_files', 'readonly');
    const store = transaction.objectStore('audio_files');
    const getRequest = store.get(id);
    getRequest.onsuccess = () => resolve(getRequest.result);
    getRequest.onerror = () => resolve(null);
  });
};

const getDictionaryEntry = async (word: string): Promise<any | null> => {
  const db = await initDB();
  return new Promise((resolve) => {
    const transaction = db.transaction('dictionary', 'readonly');
    const store = transaction.objectStore('dictionary');
    const getRequest = store.get(word.toLowerCase());
    getRequest.onsuccess = () => resolve(getRequest.result);
    getRequest.onerror = () => resolve(null);
  });
};

const saveDictionaryEntry = async (word: string, entry: any) => {
  const db = await initDB();
  const transaction = db.transaction('dictionary', 'readwrite');
  const store = transaction.objectStore('dictionary');
  store.put(entry, word.toLowerCase());
};

const speak = (text: string) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
};

export const isTimeSection = (text: string) => /^\[Audio Section:.*\]$/.test(text.trim());

export const getSampleDefinition = (sessionId: string | undefined, word: string): WordDefinition | null => {
  if (sessionId !== 'sample-1' || word.toLowerCase() !== 'rhythm') return null;
  return { word, phonetic: '/ˈrɪðəm/', definition: 'A regular pattern of sounds or beats.', translation: '节奏', example: '' };
};

export const fetchDictionaryJson = async (url: string): Promise<any | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchFastDictionary = async (word: string): Promise<Partial<WordDefinition> | null> => {
  try {
    const [dictRes, transRes] = await Promise.all([
      fetchDictionaryJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`),
      fetchDictionaryJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en%7Czh`)
    ]);
    if (!dictRes && !transRes) return null;
    const dict = dictRes?.[0];
    return {
      word: word,
      phonetic: dict?.phonetic || dict?.phonetics?.find((p: any) => p.text)?.text || '',
      definition: dict?.meanings?.[0]?.definitions?.[0]?.definition || 'Contextual definition.',
      translation: transRes?.responseData?.translatedText || '翻译载入中',
      example: dict?.meanings?.[0]?.definitions?.[0]?.example || ''
    };
  } catch (e) { return null; }
};

const Replay15Icon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all active:scale-90">
    <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C9.51472 3 7.26472 4.00736 5.63604 5.63604L3 8.27208" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 3V8.27208H8.27208" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="12" y="14.5" fontSize="6" fontWeight="900" textAnchor="middle" fill="currentColor">15</text>
  </svg>
);

const Forward15Icon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all active:scale-90">
    <path d="M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C14.4853 3 16.7353 4.00736 18.364 5.63604L21 8.27208" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M21 3V8.27208H15.7279" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="12" y="14.5" fontSize="6" fontWeight="900" textAnchor="middle" fill="currentColor">15</text>
  </svg>
);

interface PlayerViewProps {
  sessions: AudioSession[];
  savedWords: SavedWord[];
  toggleWord: (word: string, sessionId: string, def?: any) => void;
  onUpdateSession: (id: string, updates: Partial<AudioSession>) => void;
  apiConfig?: AIProviderConfig;
}

const PlayerView: React.FC<PlayerViewProps> = ({ sessions, savedWords, toggleWord, onUpdateSession, apiConfig }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<PlayerMode>(PlayerMode.CONTEXT);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(PlaybackMode.LIST_LOOP);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [isSourceReady, setIsSourceReady] = useState(false);
  const [selectedWord, setSelectedWord] = useState<WordDefinition & { isOffline?: boolean } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [isAligning, setIsAligning] = useState(false);
  const [alignmentMessage, setAlignmentMessage] = useState('');

  const session = useMemo(() => sessions.find(s => s.id === id), [sessions, id]);
  const segments = session?.segments || [];

  const groupedTurns = useMemo(() => {
    const turns: { speaker: number; segments: (AudioSegment & { originalIdx: number })[] }[] = [];
    segments.forEach((seg, idx) => {
      const lastTurn = turns[turns.length - 1];
      const speaker = seg.speaker || 1;
      const segWithIdx = { ...seg, originalIdx: idx };
      if (lastTurn && lastTurn.speaker === speaker) lastTurn.segments.push(segWithIdx);
      else turns.push({ speaker, segments: [segWithIdx] });
    });
    return turns;
  }, [segments]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncMediaTime = useRef<() => void>(() => {});
  const alignmentRequest = useRef(0);

  // CRITICAL: stateRef ensures background listeners always have access to the latest state
  const stateRef = useRef({ activeIdx, playbackMode, segments, isPlaying });
  useEffect(() => {
    stateRef.current = { activeIdx, playbackMode, segments, isPlaying };
  }, [activeIdx, playbackMode, segments, isPlaying]);

  useEffect(() => {
    setAlignmentMessage('');
    setIsAligning(false);
    return () => { alignmentRequest.current += 1; };
  }, [session?.id]);

  const timedSegments = useMemo(() => segments.map(getSynchronizedWords), [segments]);
  const currentCaptionIdx = getActiveSegmentIndex(segments, currentTime);
  const synchronizedWords = currentCaptionIdx >= 0 ? timedSegments[currentCaptionIdx] : null;
  const activeTokenIdx = synchronizedWords ? getActiveWordIndex(synchronizedWords, currentTime) : -1;
  const hasCompleteWordTiming = segments.length > 0 && timedSegments.every(Boolean);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    // Scroll only when the spoken word leaves the reading area; never scroll the whole page.
    const active = container.querySelector<HTMLElement>('[data-active-word="true"]')
      || container.querySelector<HTMLElement>(`[data-seg-idx="${currentCaptionIdx}"]`);
    if (!active) return;
    const bounds = container.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < bounds.top || item.bottom > bounds.bottom) {
      container.scrollTop += item.top - bounds.top - Math.max(0, (bounds.height - item.height) / 2);
    }
  }, [currentCaptionIdx, activeTokenIdx, mode]);

  useEffect(() => {
    if (!isPlaying || !isSourceReady) return;
    let frame: number;
    const tick = () => { syncMediaTime.current(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, isSourceReady]);

  const seekTo = (time: number, segmentIdx?: number) => {
    const audio = audioRef.current;
    if (!audio || !isSourceReady) return;
    const { nextTime: next, activeIndex: idx } = getSeekState(time, session?.duration || 0, segments, segmentIdx);
    audio.currentTime = next;
    setCurrentTime(next);
    if (idx >= 0) {
      stateRef.current.activeIdx = idx;
      setActiveIdx(idx);
    }
  };

  const jumpToSegment = (idx: number) => {
    if (!segments[idx] || !isSourceReady) return;
    seekTo(segments[idx].startTime, idx);
    if (!isPlaying) trackEvent('playback_started');
    stateRef.current.isPlaying = true;
    setIsPlaying(true);
    setShowSegments(false);
  };

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const audio = new Audio();
    audioRef.current = audio;
    setIsSourceReady(false);
    setIsPlaying(false);
    setAudioError('');
    setCurrentTime(0);
    setActiveIdx(0);
    stateRef.current.activeIdx = 0;
    audio.oncanplay = () => { if (!cancelled) setIsSourceReady(true); };
    audio.onerror = () => { if (!cancelled) setAudioError('This audio cannot be loaded. Import the original file to listen again.'); };
    const updateMediaTime = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      const state = stateRef.current;
      const currentSeg = state.segments[state.activeIdx];
      if (state.isPlaying && state.playbackMode === PlaybackMode.SINGLE_LOOP && currentSeg && time >= currentSeg.endTime) {
        audio.currentTime = currentSeg.startTime;
        setCurrentTime(currentSeg.startTime);
        return;
      }
      const idx = state.segments.findIndex(seg => time >= seg.startTime && time < seg.endTime);
      if (idx >= 0 && idx !== state.activeIdx) {
        stateRef.current.activeIdx = idx;
        setActiveIdx(idx);
      }
    };
    syncMediaTime.current = updateMediaTime;
    audio.ontimeupdate = updateMediaTime;
    audio.onseeked = updateMediaTime;
    audio.onpause = updateMediaTime;
    audio.onratechange = updateMediaTime;
    audio.onended = () => {
      const state = stateRef.current;
      const segment = state.segments[state.activeIdx];
      if (state.playbackMode === PlaybackMode.LIST_LOOP || (state.playbackMode === PlaybackMode.SINGLE_LOOP && segment)) {
        audio.currentTime = state.playbackMode === PlaybackMode.SINGLE_LOOP ? segment.startTime : 0;
        setCurrentTime(audio.currentTime);
        if (state.playbackMode === PlaybackMode.LIST_LOOP) { stateRef.current.activeIdx = 0; setActiveIdx(0); }
        audio.play().catch(() => setIsPlaying(false));
      } else setIsPlaying(false);
    };
    const init = async () => {
      if (!session) return;
      try {
        let source = session.audioUrl;
        if (!source) {
          const blob = await getAudioFromDB(session.id);
          if (cancelled) return;
          if (blob) { objectUrl = URL.createObjectURL(blob); source = objectUrl; }
        }
        if (cancelled) return;
        if (!source) { setAudioError('The audio is no longer stored in this browser. Import the original file to listen again.'); return; }
        audio.src = source;
        audio.load();
      } catch {
        if (!cancelled) setAudioError('Your browser could not open this audio. Import the original file to try again.');
      }
    };
    init();
    return () => {
      cancelled = true;
      audio.pause();
      audio.oncanplay = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.onseeked = null;
      audio.onpause = null;
      audio.onratechange = null;
      syncMediaTime.current = () => {};
      audio.onended = null;
      if (audioRef.current === audio) audioRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session?.id, session?.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && isSourceReady) {
      audio.playbackRate = speed;
      if (isPlaying) audio.play().catch(() => setIsPlaying(false));
      else audio.pause();
    }
  }, [isPlaying, isSourceReady, speed]);

  const handleWordClick = async (word: string, sentence: string) => {
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    if (!cleanWord || isSearching) return;
    const saved = savedWords.find(w => w.word.toLowerCase() === cleanWord.toLowerCase());
    if (saved) {
      setSelectedWord({ ...saved as any, example: sentence, isOffline: true });
      speak(cleanWord);
      return;
    }
    const sampleDefinition = getSampleDefinition(session?.id, cleanWord);
    if (sampleDefinition) {
      setSelectedWord({ ...sampleDefinition, example: sentence, isOffline: true });
      speak(cleanWord);
      return;
    }
    const cached = await getDictionaryEntry(cleanWord).catch(() => null);
    if (cached) {
      setSelectedWord({ ...cached, example: sentence, isOffline: true });
      speak(cleanWord);
      return;
    }
    setIsSearching(true);
    setSelectedWord({ word: cleanWord, phonetic: "...", definition: "Loading...", translation: "...", example: sentence });
    const fast = await fetchFastDictionary(cleanWord);
    if (fast) {
      const data = { ...fast, example: sentence } as WordDefinition;
      setSelectedWord({ ...data, isOffline: false });
      void saveDictionaryEntry(cleanWord, data).catch(() => {});
      speak(cleanWord);
      setIsSearching(false);
      return;
    }
    try {
      const config = JSON.parse(localStorage.getItem('echo_api_config') || '{}');
      if (!config.geminiApiKey) throw new Error('No dictionary provider available');
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze "${cleanWord}" in context: "${sentence}". JSON only.`,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(res.text);
      const final = { ...data, example: sentence };
      setSelectedWord({ ...final, isOffline: false });
      void saveDictionaryEntry(cleanWord, final).catch(() => {});
      speak(cleanWord);
    } catch (e) {
      setSelectedWord(p => p ? { ...p, definition: "Definition unavailable. Check your connection and try again.", translation: "" } : null);
    } finally { setIsSearching(false); }
  };

  const alignTranscript = async () => {
    if (!session || isAligning) return;
    setAlignmentMessage('');
    const config = apiConfig;
    const key = config?.provider === 'deepgram' ? config.deepgramApiKey : config?.geminiApiKey;
    if (!config || !key?.trim()) {
      setAlignmentMessage('Add your own transcription key in Settings first. Deepgram provides word timestamps for imported audio.');
      return;
    }
    const sessionId = session.id;
    const requestId = ++alignmentRequest.current;
    setIsAligning(true);
    stateRef.current.isPlaying = false;
    setIsPlaying(false);
    try {
      const blob = session.audioUrl
        ? await fetch(session.audioUrl).then(response => { if (!response.ok) throw new Error('The source audio could not be loaded.'); return response.blob(); })
        : await getAudioFromDB(sessionId);
      if (!blob) throw new Error('The original audio is missing from this browser. Import it again first.');
      if (requestId !== alignmentRequest.current) return;
      const aligned = await transcribeAudio(blob, config, SlicingMethod.TURNS, 1, session.duration);
      if (requestId !== alignmentRequest.current) return;
      if (!aligned.length || !aligned.every(segment => getSynchronizedWords(segment))) {
        throw new Error('The provider did not return complete word timestamps. Your original captions were kept. Select Deepgram in Settings for word-level timing.');
      }
      onUpdateSession(sessionId, { segments: aligned, subtitle: `${aligned.length} segments · word-timed transcript` });
      stateRef.current.segments = aligned;
      stateRef.current.activeIdx = 0;
      setActiveIdx(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setAlignmentMessage('Word timestamps saved. Play the audio to follow the synchronized words.');
    } catch (error) {
      if (requestId === alignmentRequest.current) { trackEvent('transcription_failed'); setAlignmentMessage(error instanceof Error ? error.message : 'Alignment failed. Your original captions were kept.'); }
    } finally { if (requestId === alignmentRequest.current) setIsAligning(false); }
  };

  const renderWords = (segment: AudioSegment, isCurrent: boolean, isLyrics: boolean = false) => {
    if (isTimeSection(segment.text)) return <p className="text-slate-600 dark:text-slate-300">{segment.text}</p>;
    const tokens = segment.text.trim().split(/\s+/);
    const timing = getSynchronizedWords(segment);
    return (
      <div className={`flex flex-wrap ${isLyrics ? 'justify-center gap-x-3 gap-y-2' : 'gap-x-1 gap-y-1'}`}>
        {tokens.map((w, idx) => {
          const isActive = isCurrent && idx === activeTokenIdx;
          const isPast = isCurrent && !!timing && currentTime >= timing[idx].end;
          let colorClass = isActive ? 'text-slate-900 dark:text-accent font-black scale-105 z-10 transition-transform duration-75'
                         : isPast ? 'text-slate-600 dark:text-accent/60 font-bold'
                         : isCurrent ? 'text-slate-700 dark:text-slate-200 font-medium'
                         : 'text-slate-400 dark:text-slate-500 hover:text-white/80';
          return (
            <button type="button" aria-label={`Look up ${w}`} key={idx} data-active-word={isActive ? "true" : undefined} onClick={(ev) => { ev.stopPropagation(); handleWordClick(w, segment.text); }} className={`inline-block px-0.5 rounded transition-all cursor-pointer ${colorClass}`}>
              {w}
            </button>
          );
        })}
      </div>
    );
  };

  const cyclePlaybackMode = () => {
    setPlaybackMode(prev => {
      const next = prev === PlaybackMode.LIST_LOOP ? PlaybackMode.SINGLE_LOOP : prev === PlaybackMode.SINGLE_LOOP ? PlaybackMode.NATURAL : PlaybackMode.LIST_LOOP;
      stateRef.current.playbackMode = next;
      return next;
    });
  };

  const getPlaybackIcon = () => {
    if (playbackMode === PlaybackMode.SINGLE_LOOP) return 'repeat_one';
    if (playbackMode === PlaybackMode.NATURAL) return 'trending_flat';
    return 'repeat';
  };

  if (!session) return <div className="player-view p-8"><h1 className="text-2xl font-bold">Audio session not found</h1><p className="my-4">Choose a session from your library or import an audio file.</p><button onClick={() => navigate('/library')}>Open audio library</button></div>;

  return (
    <div className="player-view flex flex-col h-full bg-background-light dark:bg-[#0F172A] text-slate-900 dark:text-white overflow-hidden relative">
      {selectedWord && (
        <div className="absolute inset-0 z-[500] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div role="dialog" aria-modal="true" aria-label="Word definition" className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-slide-up mb-12">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-4xl font-black">{selectedWord.word}</h3>
                  <button aria-label="Pronounce word" onClick={() => speak(selectedWord.word)} className="size-8 rounded-full bg-accent/10 text-accent flex items-center justify-center active:scale-90 transition-transform"><span className="material-symbols-outlined text-lg">volume_up</span></button>
                  {selectedWord.isOffline && <span className="text-[8px] font-black bg-green-500/10 text-green-500 px-2 py-0.5 rounded uppercase tracking-widest">Offline</span>}
                </div>
                <p className="text-accent text-sm italic">{selectedWord.phonetic}</p>
              </div>
              <button aria-label="Close dictionary" onClick={() => setSelectedWord(null)} className="size-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined text-sm">close</span></button>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-3xl mb-8 space-y-4">
              <div>
                <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-1">Translation</p>
                <p className="text-xl font-bold">{selectedWord.translation}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Definition</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{selectedWord.definition}</p>
              </div>
            </div>
            <button onClick={() => { toggleWord(selectedWord.word, session.id, selectedWord); setSelectedWord(null); }} className={`w-full py-5 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all ${isSearching ? 'opacity-50' : 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg'}`} disabled={isSearching}>
              {isSearching ? 'ANALYZING...' : savedWords.some(w => w.word.toLowerCase() === selectedWord.word.toLowerCase()) ? 'Remove' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {showSegments && (
        <div className="absolute inset-0 z-[600] flex items-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={() => setShowSegments(false)}></div>
          <div role="dialog" aria-modal="true" aria-label="Choose audio segment" className="relative w-full max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-[3rem] h-[75vh] flex flex-col shadow-2xl animate-slide-up">
             <div className="p-6 flex justify-between items-center border-b border-slate-100 dark:border-white/5">
                <h3 className="text-xl font-black px-2">Segments</h3>
                <button aria-label="Close segments" onClick={() => setShowSegments(false)} className="size-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined">close</span></button>
             </div>
             <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
                <div className="space-y-3 pb-12">
                   {segments.map((seg, idx) => (
                     <button type="button" aria-label={`Play segment ${idx + 1}`} key={seg.id} onClick={() => jumpToSegment(idx)} className={`p-5 rounded-3xl border transition-all flex items-center gap-5 active:scale-[0.98] ${activeIdx === idx ? 'bg-accent/10 border-accent/20' : 'bg-slate-50 dark:bg-white/5 border-transparent'}`}>
                       <div className={`size-10 rounded-2xl flex items-center justify-center text-[10px] font-black ${activeIdx === idx ? 'bg-accent text-black' : 'bg-slate-200 dark:bg-white/5 text-slate-400'}`}>{idx + 1}</div>
                       <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-center mb-1">
                           <span className={`text-[8px] font-black uppercase tracking-widest ${activeIdx === idx ? 'text-accent' : 'text-slate-400'}`}>Spk {seg.speaker}</span>
                           <span className="text-[10px] tabular-nums text-slate-400 font-bold">{Math.floor(seg.startTime/60)}:{(seg.startTime%60).toFixed(0).padStart(2,'0')}</span>
                         </div>
                         <p className={`text-xs truncate ${activeIdx === idx ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-500'}`}>{seg.text}</p>
                       </div>
                     </button>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      <header className="px-6 pt-6 pb-4 flex justify-between items-center z-50 shrink-0">
        <button aria-label="Back to audio library" onClick={() => navigate('/library')} className="size-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white active:scale-90 shadow-sm"><span className="material-symbols-outlined">expand_more</span></button>
        <div className="flex bg-slate-100 dark:bg-white/5 rounded-2xl p-1 border border-slate-200 dark:border-white/5 backdrop-blur-md">
           {[{ id: PlayerMode.LYRICS, icon: 'format_quote' }, { id: PlayerMode.CONTEXT, icon: 'chat_bubble' }].map(m => (
             <button aria-label={m.id === PlayerMode.LYRICS ? 'Focused transcript' : 'Conversation transcript'} aria-pressed={mode === m.id} key={m.id} onClick={() => setMode(m.id)} className={`size-10 rounded-xl flex items-center justify-center transition-all ${mode === m.id ? 'bg-white dark:bg-accent shadow-lg text-slate-900 dark:text-black' : 'text-slate-400 dark:text-white/40'}`}><span className="material-symbols-outlined text-xl">{m.icon}</span></button>
           ))}
        </div>
        <button aria-label={`Playback speed ${speed} times. Change speed`} onClick={() => setSpeed(s => s >= 2 ? 0.5 : s + 0.25)} className="size-10 rounded-xl bg-slate-100 dark:bg-white/5 text-[10px] font-black text-slate-900 dark:text-white border border-slate-200 dark:border-white/5">{speed}x</button>
      </header>

      <div className="px-6 pb-4">
        <h1 className="text-xl font-bold">{session.title}</h1>
        <p className="text-sm text-slate-400">{hasCompleteWordTiming ? 'Word-timed transcript · follows the audio at any speed.' : segments.some(segment => isTimeSection(segment.text)) ? 'Time sections · no transcript. Add transcription in Settings to follow spoken words.' : 'Section timing only · this lesson has no complete word timestamps. Estimated word highlighting is disabled.'}</p>
        {session.id !== 'sample-1' && <div className="mt-2 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button disabled={isAligning} onClick={alignTranscript} className="underline underline-offset-4 text-accent">{isAligning ? 'Aligning transcript…' : hasCompleteWordTiming ? 'Refresh word timing' : 'Align words with audio'}</button>
          <button onClick={() => navigate('/settings')} className="underline underline-offset-4">Transcription settings</button>
          <span>Uses your provider key and sends the original audio for transcription. Provider charges may apply.</span>
        </div>}
        {alignmentMessage && <p role="status" className="mt-2 text-sm text-slate-300">{alignmentMessage}</p>}
        {audioError && <p role="alert" className="mt-3 text-sm">{audioError} <button className="underline" onClick={() => navigate('/add')}>Import audio</button></p>}
        {!segments.length && <p className="mt-3">This session has no learning segments. Import your audio to create them.</p>}
      </div>
      <div className="player-layout flex-1 min-h-0">
      <aside className="player-sidebar" aria-label="Audio segments">
        <h2 className="font-bold mb-4">Segments · {segments.length}</h2>
        {segments.map((seg, idx) => <button key={seg.id} disabled={!isSourceReady} aria-current={activeIdx === idx ? 'true' : undefined} onClick={() => jumpToSegment(idx)} className={`w-full text-left rounded-xl p-4 mb-2 border ${activeIdx === idx ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950' : 'border-transparent'}`}><span className="block text-xs text-slate-500 mb-2">{idx + 1} · {Math.floor(seg.startTime / 60)}:{String(Math.floor(seg.startTime % 60)).padStart(2, '0')}</span><span className="text-sm line-clamp-3">{seg.text}</span></button>)}
      </aside>
      <div className="player-transcript flex-1 overflow-y-auto no-scrollbar relative" ref={scrollRef}>
        {mode === PlayerMode.LYRICS ? (
          <div className="space-y-16 py-12 animate-fade-in text-center px-6">
            {segments.map((seg, idx) => (
              <div key={seg.id} data-seg-idx={idx} onClick={() => jumpToSegment(idx)} className={`transition-all duration-300 cursor-pointer ${activeIdx === idx ? 'opacity-100' : 'opacity-20'}`}>
                <div className="text-2xl leading-tight">{renderWords(seg, currentCaptionIdx === idx, true)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pb-12 pt-4 px-4">
            <div className="space-y-12">
              {groupedTurns.map((turn, tIdx) => (
                <div key={tIdx} className="space-y-4">
                  <div className="flex items-center gap-3 px-1">
                     <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Speaker {turn.speaker}</span>
                     <div className="h-[1px] flex-1 bg-slate-200 dark:bg-white/5"></div>
                  </div>
                  <div className="space-y-2">
                    {turn.segments.map((seg) => {
                      const isActive = currentCaptionIdx === seg.originalIdx;
                      return (
                        <div key={seg.id} data-seg-idx={seg.originalIdx} onClick={() => jumpToSegment(seg.originalIdx)} className={`transition-all duration-500 py-4 px-5 relative rounded-[1.5rem] border-l-4 ${isActive ? 'border-accent bg-[#FDFBF7] dark:bg-accent/5 opacity-100 shadow-sm' : 'border-transparent opacity-80 hover:opacity-100'}`}>
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{Math.floor(seg.startTime/60)}:{(seg.startTime%60).toFixed(0).padStart(2,'0')}</span>
                          <div className="text-lg leading-relaxed tracking-tight mt-1">{renderWords(seg, isActive)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      </div>
      <footer className="player-controls px-8 pb-12 pt-6 bg-gradient-to-t from-white dark:from-[#0F172A] via-white/95 dark:via-[#0F172A]/95 to-transparent backdrop-blur-md z-[100] shrink-0">
        <div className="flex justify-between text-[11px] font-black text-slate-400 mb-4 tracking-widest uppercase tabular-nums">
          <span>{Math.floor(currentTime/60)}:{(currentTime%60).toFixed(0).padStart(2,'0')}</span>
          <span>{Math.floor(session.duration/60)}:{(session.duration%60).toFixed(0).padStart(2,'0')}</span>
        </div>
        <input aria-label="Audio position" type="range" min="0" max={session.duration || 1} step="0.1" value={Math.min(currentTime, session.duration || 1)} disabled={!isSourceReady} onChange={e => seekTo(Number(e.target.value))} className="w-full mb-6 accent-cyan-500" />
        <p className="text-center text-xs text-slate-500 mb-3">{playbackMode === PlaybackMode.SINGLE_LOOP ? 'Repeat current segment' : playbackMode === PlaybackMode.LIST_LOOP ? 'Repeat whole audio' : 'Play once'} · {speed}× speed</p>
        <div className="flex items-center justify-between">
           <button aria-label={`Playback mode: ${playbackMode === PlaybackMode.SINGLE_LOOP ? 'Repeat segment' : playbackMode === PlaybackMode.LIST_LOOP ? 'Repeat audio' : 'Play once'}. Change mode`} onClick={cyclePlaybackMode} className={`size-10 flex items-center justify-center transition-all ${playbackMode !== PlaybackMode.NATURAL ? 'text-accent' : 'text-slate-400'}`}>
             <span className="material-symbols-outlined text-2xl">{getPlaybackIcon()}</span>
           </button>
           <div className="flex items-center gap-6">
             <button aria-label="Back 15 seconds" disabled={!isSourceReady} onClick={() => seekTo(currentTime - SEEK_STEP)} className="size-10 flex items-center justify-center text-slate-300 transition-all active:scale-90"><Replay15Icon /></button>
             <button aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => { if (!isPlaying) trackEvent('playback_started'); stateRef.current.isPlaying = !isPlaying; setIsPlaying(!isPlaying); }} disabled={!isSourceReady} className={`size-16 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all ${isSourceReady ? 'bg-slate-900 dark:bg-accent text-white dark:text-black' : 'bg-slate-200 dark:bg-white/10 text-slate-400 opacity-50'}`}><span className="material-symbols-outlined text-4xl font-variation-fill-1">{isPlaying ? 'pause' : 'play_arrow'}</span></button>
             <button aria-label="Forward 15 seconds" disabled={!isSourceReady} onClick={() => seekTo(currentTime + SEEK_STEP)} className="size-10 flex items-center justify-center text-slate-300 transition-all active:scale-90"><Forward15Icon /></button>
           </div>
           <button aria-label="Choose audio segment" onClick={() => setShowSegments(true)} className="size-10 flex items-center justify-center text-slate-400 active:scale-90"><span className="material-symbols-outlined text-2xl">playlist_play</span></button>
        </div>
      </footer>
    </div>
  );
};

export default PlayerView;
