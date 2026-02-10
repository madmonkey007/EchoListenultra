import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AudioSession, PlayerMode, PlaybackMode, AudioSegment, WordDefinition, SavedWord } from '../types.ts';
import { GoogleGenAI } from "@google/genai";

const SEEK_STEP = 15; 
const DB_NAME = 'EchoListenStorage';
const DB_VERSION = 3;

// Database Helper
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

const fetchFastDictionary = async (word: string): Promise<Partial<WordDefinition> | null> => {
  try {
    const [dictRes, transRes] = await Promise.all([
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`).then(r => r.ok ? r.json() : null),
      fetch(`https://api.mymemory.translated.net/get?q=${word}&langpair=en|zh`).then(r => r.ok ? r.json() : null)
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
}

const PlayerView: React.FC<PlayerViewProps> = ({ sessions, savedWords, toggleWord, onUpdateSession }) => {
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

  const session = useMemo(() => sessions.find(s => s.id === id) || sessions[0], [sessions, id]);
  const segments = session.segments;

  const groupedTurns = useMemo(() => {
    const turns: { speaker: number; segments: (AudioSegment & { originalIdx: number })[] }[] = [];
    segments.forEach((seg, idx) => {
      const lastTurn = turns[turns.length - 1];
      const speaker = seg.speaker || 1;
      const segWithIdx = { ...seg, originalIdx: idx };
      
      if (lastTurn && lastTurn.speaker === speaker) {
        lastTurn.segments.push(segWithIdx);
      } else {
        turns.push({ speaker, segments: [segWithIdx] });
      }
    });
    return turns;
  }, [segments]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const stateRef = useRef({ activeIdx, currentTime, segments, playbackMode });
  useEffect(() => {
    stateRef.current = { activeIdx, currentTime, segments, playbackMode };
  }, [activeIdx, currentTime, segments, playbackMode]);

  const activeTokenIdx = useMemo(() => {
    const segment = segments[activeIdx];
    if (!segment || !segment.text) return -1;
    
    const tokens = segment.text.trim().split(/\s+/);
    if (tokens.length === 0) return 0;
    
    const segmentDuration = segment.endTime - segment.startTime;
    if (segmentDuration <= 0) return 0;

    const lookAheadOffset = 0.08 * speed; 
    const progress = Math.max(0, Math.min(1, (currentTime - segment.startTime + lookAheadOffset) / segmentDuration));
    
    const charCounts = tokens.map(t => t.length + 1); 
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    
    let currentWeight = 0;
    for (let i = 0; i < tokens.length; i++) {
      currentWeight += charCounts[i];
      if (progress <= currentWeight / totalChars) {
        return i;
      }
    }
    
    return tokens.length - 1;
  }, [currentTime, activeIdx, segments, speed]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeWordEl = scrollRef.current.querySelector('[data-active-word="true"]');
    if (activeWordEl) {
      activeWordEl.scrollIntoView({ behavior: isPlaying ? 'auto' : 'smooth', block: 'center' });
    }
  }, [activeIdx, activeTokenIdx, isPlaying]);

  const jumpToSegment = (idx: number) => {
    if (audioRef.current && isSourceReady) {
      audioRef.current.currentTime = segments[idx].startTime;
      setActiveIdx(idx);
      if (!isPlaying) setIsPlaying(true);
      if (showSegments) setShowSegments(false);
    }
  };

  useEffect(() => {
    let url: string | null = null;
    const audio = new Audio();
    const init = async () => {
      const blob = await getAudioFromDB(session.id);
      if (blob) {
        url = URL.createObjectURL(blob);
        audio.src = url;
        audioRef.current = audio;
        audio.oncanplay = () => setIsSourceReady(true);
        audio.onended = () => {
          const { activeIdx, playbackMode, segments } = stateRef.current;
          if (playbackMode === PlaybackMode.LIST_LOOP && activeIdx < segments.length - 1) {
            jumpToSegment(activeIdx + 1);
          } else if (playbackMode === PlaybackMode.SINGLE_LOOP) {
            audio.currentTime = segments[activeIdx].startTime;
            audio.play().catch(() => {});
          } else {
            setIsPlaying(false);
          }
        };
      }
    };
    init();
    return () => {
      audio.pause();
      if (url) URL.revokeObjectURL(url);
    };
  }, [session.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && isSourceReady) {
      audio.playbackRate = speed;
      if (isPlaying) audio.play().catch(() => setIsPlaying(false));
      else audio.pause();
    }
  }, [isPlaying, isSourceReady, speed]);

  useEffect(() => {
    const sync = () => {
      const audio = audioRef.current;
      if (audio && isPlaying) {
        const time = audio.currentTime;
        setCurrentTime(time);
        
        const { segments, activeIdx } = stateRef.current;
        if (time < segments[activeIdx]?.startTime || time >= segments[activeIdx]?.endTime) {
          const newIdx = segments.findIndex(s => time >= s.startTime && time < s.endTime);
          if (newIdx !== -1 && newIdx !== activeIdx) {
            setActiveIdx(newIdx);
          }
        }
      }
      rafRef.current = requestAnimationFrame(sync);
    };
    rafRef.current = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const handleWordClick = async (word: string, sentence: string) => {
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    if (!cleanWord || isSearching) return;

    const saved = savedWords.find(w => w.word.toLowerCase() === cleanWord.toLowerCase());
    if (saved) {
      setSelectedWord({ ...saved as any, example: sentence, isOffline: true });
      speak(cleanWord);
      return;
    }

    const cached = await getDictionaryEntry(cleanWord);
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
      saveDictionaryEntry(cleanWord, data);
      speak(cleanWord);
      setIsSearching(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze word "${cleanWord}" in context: "${sentence}". Output ONLY JSON: { "word": string, "phonetic": string, "definition": string, "translation": string }.`,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(res.text);
      const final = { ...data, example: sentence };
      setSelectedWord({ ...final, isOffline: false });
      saveDictionaryEntry(cleanWord, final);
      speak(cleanWord);
    } catch (e) {
      setSelectedWord(p => p ? { ...p, definition: "Lookup failed." } : null);
    } finally { setIsSearching(false); }
  };

  const renderWords = (segment: AudioSegment, isCurrent: boolean, isLyrics: boolean = false) => {
    const tokens = segment.text.trim().split(/\s+/);
    return (
      <div className={`flex flex-wrap ${isLyrics ? 'justify-center gap-x-3 gap-y-2' : 'gap-x-1 gap-y-1'}`}>
        {tokens.map((w, idx) => {
          const isActive = isCurrent && idx === activeTokenIdx;
          const isPast = isCurrent && idx < activeTokenIdx;
          
          let colorClass = '';
          if (isActive) {
            // High contrast for the currently active word
            colorClass = 'text-slate-900 dark:text-accent font-black scale-105 z-10 transition-transform duration-75';
          } else if (isPast) {
            // Deeper color for played text in light theme to ensure legibility
            colorClass = 'text-slate-600 dark:text-accent/60 font-bold';
          } else if (isCurrent) {
            // Future words in the active segment
            colorClass = 'text-slate-300 dark:text-white/10 font-medium';
          } else {
            // Words in non-active segments
            colorClass = 'text-slate-400 dark:text-slate-500 hover:text-white/80';
          }

          return (
            <span 
              key={idx} 
              data-active-word={isActive ? "true" : undefined}
              onClick={(ev) => { ev.stopPropagation(); handleWordClick(w, segment.text); }}
              className={`inline-block px-0.5 rounded transition-all cursor-pointer ${colorClass}`}
            >
              {w}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-[#0F172A] text-slate-900 dark:text-white overflow-hidden relative">
      {selectedWord && (
        <div className="absolute inset-0 z-[500] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-slide-up mb-12">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-4xl font-black">{selectedWord.word}</h3>
                  <button onClick={() => speak(selectedWord.word)} className="size-8 rounded-full bg-accent/10 text-accent flex items-center justify-center active:scale-90 transition-transform"><span className="material-symbols-outlined text-lg">volume_up</span></button>
                  {selectedWord.isOffline && <span className="text-[8px] font-black bg-green-500/10 text-green-500 px-2 py-0.5 rounded uppercase tracking-widest">Offline</span>}
                </div>
                <p className="text-accent text-sm italic">{selectedWord.phonetic}</p>
              </div>
              <button onClick={() => setSelectedWord(null)} className="size-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined text-sm">close</span></button>
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
            <button 
              onClick={() => { toggleWord(selectedWord.word, session.id, selectedWord); setSelectedWord(null); }} 
              className={`w-full py-5 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all ${isSearching ? 'opacity-50' : 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg'}`}
              disabled={isSearching}
            >
              {isSearching ? 'ANALYZING...' : savedWords.some(w => w.word.toLowerCase() === selectedWord.word.toLowerCase()) ? 'Remove from Lexis' : 'Add to Lexis'}
            </button>
          </div>
        </div>
      )}

      {showSegments && (
        <div className="absolute inset-0 z-[600] flex items-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={() => setShowSegments(false)}></div>
          <div className="relative w-full max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-[3rem] h-[75vh] flex flex-col shadow-2xl animate-slide-up">
             <div className="p-6 flex justify-between items-center border-b border-slate-100 dark:border-white/5">
                <h3 className="text-xl font-black px-2">Segments</h3>
                <button onClick={() => setShowSegments(false)} className="size-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined">close</span></button>
             </div>
             <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
                <div className="space-y-3 pb-12">
                   {segments.map((seg, idx) => (
                     <div key={seg.id} onClick={() => jumpToSegment(idx)} className={`p-5 rounded-3xl border transition-all flex items-center gap-5 active:scale-[0.98] ${activeIdx === idx ? 'bg-accent/10 border-accent/20' : 'bg-slate-50 dark:bg-white/5 border-transparent'}`}>
                       <div className={`size-10 rounded-2xl flex items-center justify-center text-[10px] font-black ${activeIdx === idx ? 'bg-accent text-black' : 'bg-slate-200 dark:bg-white/5 text-slate-400'}`}>{idx + 1}</div>
                       <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-center mb-1">
                           <span className={`text-[8px] font-black uppercase tracking-widest ${activeIdx === idx ? 'text-accent' : 'text-slate-400'}`}>Spk {seg.speaker}</span>
                           <span className="text-[10px] tabular-nums text-slate-400 font-bold">{Math.floor(seg.startTime/60)}:{(seg.startTime%60).toFixed(0).padStart(2,'0')}</span>
                         </div>
                         <p className={`text-xs truncate ${activeIdx === idx ? 'text-white font-bold' : 'text-slate-400'}`}>{seg.text}</p>
                       </div>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      <header className="px-6 pt-6 pb-4 flex justify-between items-center z-50 shrink-0">
        <button onClick={() => navigate('/')} className="size-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white active:scale-90 shadow-sm"><span className="material-symbols-outlined">expand_more</span></button>
        <div className="flex bg-slate-100 dark:bg-white/5 rounded-2xl p-1 border border-slate-200 dark:border-white/5 backdrop-blur-md">
           {[{ id: PlayerMode.LYRICS, icon: 'format_quote' }, { id: PlayerMode.CONTEXT, icon: 'chat_bubble' }].map(m => (
             <button key={m.id} onClick={() => setMode(m.id)} className={`size-10 rounded-xl flex items-center justify-center transition-all ${mode === m.id ? 'bg-white dark:bg-accent shadow-lg text-slate-900 dark:text-black' : 'text-slate-400 dark:text-white/40'}`}><span className="material-symbols-outlined text-xl">{m.icon}</span></button>
           ))}
        </div>
        <button onClick={() => setSpeed(s => s >= 2 ? 0.5 : s + 0.25)} className="size-10 rounded-xl bg-slate-100 dark:bg-white/5 text-[10px] font-black text-slate-900 dark:text-white border border-slate-200 dark:border-white/5">{speed}x</button>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar relative" ref={scrollRef}>
        {mode === PlayerMode.LYRICS ? (
          <div className="space-y-16 py-[45vh] animate-fade-in text-center px-6">
            {segments.map((seg, idx) => (
              <div key={seg.id} onClick={() => jumpToSegment(idx)} className={`transition-all duration-300 cursor-pointer ${activeIdx === idx ? 'opacity-100' : 'opacity-20'}`}>
                <div className="text-2xl leading-tight">{renderWords(seg, activeIdx === idx, true)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pb-64 pt-16 px-4">
            <div className="space-y-12">
              {groupedTurns.map((turn, tIdx) => (
                <div key={tIdx} className="space-y-4">
                  <div className="flex items-center gap-3 px-1">
                     <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em]">Speaker {turn.speaker}</span>
                     <div className="h-[1px] flex-1 bg-slate-200 dark:bg-white/5"></div>
                  </div>
                  <div className="space-y-2">
                    {turn.segments.map((seg) => {
                      const isActive = activeIdx === seg.originalIdx;
                      return (
                        <div key={seg.id} data-seg-idx={seg.originalIdx} onClick={() => jumpToSegment(seg.originalIdx)} className={`transition-all duration-500 py-4 px-5 relative rounded-[1.5rem] border-l-4 ${isActive ? 'border-accent bg-[#FDFBF7] dark:bg-accent/5 opacity-100 shadow-sm' : 'border-transparent opacity-40 hover:opacity-70'}`}>
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

      <footer className="px-8 pb-12 pt-6 bg-gradient-to-t from-white dark:from-[#0F172A] via-white/95 dark:via-[#0F172A]/95 to-transparent backdrop-blur-md z-[100] shrink-0">
        <div className="flex justify-between text-[11px] font-black text-slate-400 mb-4 tracking-widest uppercase tabular-nums">
          <span>{Math.floor(currentTime/60)}:{(currentTime%60).toFixed(0).padStart(2,'0')}</span>
          <span>{Math.floor(session.duration/60)}:{(session.duration%60).toFixed(0).padStart(2,'0')}</span>
        </div>
        <div className="h-1 bg-slate-200 dark:bg-white/10 rounded-full mb-10 cursor-pointer relative group" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const p = (e.clientX - rect.left) / rect.width;
          if (audioRef.current) audioRef.current.currentTime = p * session.duration;
        }}>
           <div className="h-full bg-accent rounded-full transition-all duration-300 relative" style={{ width: `${(currentTime/session.duration)*100}%` }}>
             <div className="absolute right-0 top-1/2 -translate-y-1/2 size-4 rounded-full bg-accent shadow-[0_0_15px_#00E4FF] scale-0 group-hover:scale-100 transition-transform"></div>
           </div>
        </div>
        <div className="flex items-center justify-between">
           <button onClick={() => setPlaybackMode(m => m === PlaybackMode.LIST_LOOP ? PlaybackMode.SINGLE_LOOP : PlaybackMode.LIST_LOOP)} className={`size-10 flex items-center justify-center transition-all ${playbackMode === PlaybackMode.SINGLE_LOOP ? 'text-accent' : 'text-slate-400'}`}>
             <span className="material-symbols-outlined text-2xl">{playbackMode === PlaybackMode.SINGLE_LOOP ? 'repeat_one' : 'repeat'}</span>
           </button>
           <div className="flex items-center gap-6">
             <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= SEEK_STEP }} className="size-10 flex items-center justify-center text-slate-300 transition-all active:scale-90"><Replay15Icon /></button>
             <button onClick={() => setIsPlaying(!isPlaying)} disabled={!isSourceReady} className={`size-16 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all ${isSourceReady ? 'bg-slate-900 dark:bg-accent text-white dark:text-black' : 'bg-slate-200 dark:bg-white/10 text-slate-400 opacity-50'}`}><span className="material-symbols-outlined text-4xl font-variation-fill-1">{isPlaying ? 'pause' : 'play_arrow'}</span></button>
             <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += SEEK_STEP }} className="size-10 flex items-center justify-center text-slate-300 transition-all active:scale-90"><Forward15Icon /></button>
           </div>
           <button onClick={() => setShowSegments(true)} className="size-10 flex items-center justify-center text-slate-400 active:scale-90"><span className="material-symbols-outlined text-2xl">playlist_play</span></button>
        </div>
      </footer>
    </div>
  );
};

export default PlayerView;