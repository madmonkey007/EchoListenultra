import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AudioSession, PlayerMode, PlaybackMode, AudioSegment, WordDefinition, SavedWord } from '../types.ts';
import { GoogleGenAI } from "@google/genai";

const SEEK_STEP = 15; 
const DB_NAME = 'EchoListenStorage';
const DB_VERSION = 2;

const getAudioFromDB = (id: string): Promise<Blob | null> => {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio_files')) return resolve(null);
      const transaction = db.transaction('audio_files', 'readonly');
      const store = transaction.objectStore('audio_files');
      const getRequest = store.get(id);
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
};

const Replay15Icon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all group-active:scale-90 group-hover:text-accent">
    <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C9.51472 3 7.26472 4.00736 5.63604 5.63604L3 8.27208" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 3V8.27208H8.27208" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="12" y="14.5" fontSize="6" fontWeight="900" textAnchor="middle" fill="currentColor" style={{ fontFamily: 'system-ui' }}>15</text>
  </svg>
);

const Forward15Icon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all group-active:scale-90 group-hover:text-accent">
    <path d="M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C14.4853 3 16.7353 4.00736 18.364 5.63604L21 8.27208" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M21 3V8.27208H15.7279" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="12" y="14.5" fontSize="6" fontWeight="900" textAnchor="middle" fill="currentColor" style={{ fontFamily: 'system-ui' }}>15</text>
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
  const [selectedWord, setSelectedWord] = useState<WordDefinition | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  const session = useMemo(() => sessions.find(s => s.id === id) || sessions[0], [sessions, id]);
  const segments = session.segments;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const playbackModeRef = useRef(playbackMode);
  const activeIdxRef = useRef(activeIdx);
  const segmentsRef = useRef(segments);

  useEffect(() => { playbackModeRef.current = playbackMode; }, [playbackMode]);
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  // 按说话人分组 logic: 连续的同一说话人片段合并为一个视觉单元
  const groupedTurns = useMemo(() => {
    const turns: { speaker: number; segments: (AudioSegment & { originalIdx: number })[] }[] = [];
    segments.forEach((seg, idx) => {
      const lastTurn = turns[turns.length - 1];
      if (lastTurn && lastTurn.speaker === seg.speaker) {
        lastTurn.segments.push({ ...seg, originalIdx: idx });
      } else {
        turns.push({
          speaker: seg.speaker || 1,
          segments: [{ ...seg, originalIdx: idx }]
        });
      }
    });
    return turns;
  }, [segments]);

  const activeTokenIdx = useMemo(() => {
    const segment = segments[activeIdx];
    if (!segment) return -1;
    const tokens = segment.text.split(/\s+/);
    const charCounts = tokens.map(t => t.length);
    const totalChars = charCounts.reduce((a, b) => a + b, 0);
    const duration = segment.endTime - segment.startTime;
    const elapsed = Math.max(0, currentTime - segment.startTime);
    const progress = Math.min(1, elapsed / duration);
    const targetCharIdx = progress * totalChars;
    let currentCharSum = 0;
    for (let i = 0; i < tokens.length; i++) {
      currentCharSum += tokens[i].length;
      if (currentCharSum >= targetCharIdx) return i;
    }
    return -1;
  }, [currentTime, activeIdx, segments]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeWordEl = scrollRef.current.querySelector('[data-active-word="true"]');
    if (activeWordEl) {
      activeWordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const activeSeg = scrollRef.current.querySelector(`[data-seg-idx="${activeIdx}"]`);
      if (activeSeg) {
        activeSeg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIdx, activeTokenIdx, mode]);

  const handleAudioEnded = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const currentMode = playbackModeRef.current;
    if (currentMode === PlaybackMode.LIST_LOOP) {
      const currentIdx = activeIdxRef.current;
      const allSegments = segmentsRef.current;
      if (currentIdx < allSegments.length - 1) {
        jumpToSegment(currentIdx + 1);
      } else {
        jumpToSegment(0);
      }
    } else if (currentMode === PlaybackMode.SINGLE_LOOP) {
      const currentSeg = segmentsRef.current[activeIdxRef.current];
      if (currentSeg) {
        audio.currentTime = currentSeg.startTime;
        audio.play();
      }
    } else {
      setIsPlaying(false);
    }
  };

  const jumpToSegment = (idx: number) => {
    if (audioRef.current && isSourceReady) {
      audioRef.current.currentTime = segments[idx].startTime;
      setActiveIdx(idx);
      if (!isPlaying) setIsPlaying(true);
      if (showSegments) setShowSegments(false);
    }
  };

  useEffect(() => {
    if ('mediaSession' in navigator && isSourceReady) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: session.title,
        artist: 'EchoListen',
        album: session.subtitle,
        artwork: [{ src: session.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
      });
      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (activeIdxRef.current > 0) jumpToSegment(activeIdxRef.current - 1);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (activeIdxRef.current < segmentsRef.current.length - 1) jumpToSegment(activeIdxRef.current + 1);
      });
    }
  }, [session, isSourceReady]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      const time = audio.currentTime;
      const currentMode = playbackModeRef.current;
      const currentSegIdx = activeIdxRef.current;
      const allSegments = segmentsRef.current;
      const currentSeg = allSegments[currentSegIdx];
      if (currentMode === PlaybackMode.SINGLE_LOOP && currentSeg) {
        if (time >= currentSeg.endTime - 0.1) audio.currentTime = currentSeg.startTime;
      } else {
        const idx = allSegments.findIndex(s => time >= s.startTime && time < s.endTime);
        if (idx !== -1 && idx !== currentSegIdx) setActiveIdx(idx);
      }
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => audio.removeEventListener('timeupdate', onTimeUpdate);
  }, [isSourceReady]);

  useEffect(() => {
    let url: string | null = null;
    const currentAudio = new Audio();
    const initAudio = async () => {
      const blob = await getAudioFromDB(session.id);
      if (blob) {
        url = URL.createObjectURL(blob);
        currentAudio.src = url;
        audioRef.current = currentAudio;
        currentAudio.currentTime = segments[activeIdx]?.startTime || 0;
        currentAudio.playbackRate = speed;
        currentAudio.onended = handleAudioEnded;
        currentAudio.oncanplay = () => setIsSourceReady(true);
      } else if (session.audioUrl) {
        currentAudio.src = session.audioUrl;
        audioRef.current = currentAudio;
        currentAudio.oncanplay = () => setIsSourceReady(true);
      }
    };
    initAudio();
    return () => {
      currentAudio.pause();
      currentAudio.onended = null;
      if (url) URL.revokeObjectURL(url);
      audioRef.current = null;
      setIsSourceReady(false);
    };
  }, [session.id]);

  useEffect(() => {
    if (audioRef.current && isSourceReady) {
      audioRef.current.playbackRate = speed;
      if (isPlaying) audioRef.current.play().catch(() => setIsPlaying(false));
      else audioRef.current.pause();
    }
  }, [isPlaying, isSourceReady, speed]);

  useEffect(() => {
    const sync = () => {
      if (audioRef.current && isSourceReady) setCurrentTime(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(sync);
    };
    rafRef.current = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isSourceReady]);

  const handleWordClick = async (word: string, sentence: string) => {
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim().toLowerCase();
    if (!cleanWord || isSearching) return;
    setIsSearching(true);
    setSelectedWord({ word: cleanWord, phonetic: "Searching...", definition: "Analyzing context via Gemini...", translation: "Loading", example: sentence });
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze English word "${cleanWord}" in context: "${sentence}". Output ONLY JSON: { "word": string, "phonetic": string, "definition": string, "translation": string }.`,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(response.text);
      setSelectedWord({ ...data, example: sentence });
    } catch (e) { 
      setSelectedWord(prev => prev ? { ...prev, definition: "Search failed." } : null);
    } finally {
      setIsSearching(false);
    }
  };

  const renderWords = (segment: AudioSegment, isCurrent: boolean) => {
    const tokens = segment.text.split(/\s+/);
    return (
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {tokens.map((w, idx) => {
          const isActive = isCurrent && idx === activeTokenIdx;
          const isPassed = isCurrent && idx < activeTokenIdx;
          return (
            <span 
              key={idx} 
              data-active-word={isActive ? "true" : undefined}
              onClick={(ev) => { ev.stopPropagation(); handleWordClick(w, segment.text); }}
              className={`inline-block px-0.5 rounded transition-all duration-300 relative cursor-pointer ${
                isActive 
                ? 'text-primary dark:text-accent font-black scale-105 shadow-[0_0_20px_rgba(0,228,255,0.2)] z-10' 
                : isPassed
                  ? 'text-primary/70 dark:text-accent/70 font-bold' 
                  : isCurrent 
                    ? 'text-slate-900/40 dark:text-white/40 font-medium' 
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white/80'
              }`}
            >
              {w}
              {isActive && (
                <span className="absolute -bottom-0.5 left-0 right-0 h-[1.5px] bg-primary dark:bg-accent rounded-full animate-pulse"></span>
              )}
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
                <h3 className="text-4xl font-black mb-1">{selectedWord.word}</h3>
                <p className="text-primary dark:text-accent text-sm italic">{selectedWord.phonetic}</p>
              </div>
              <button onClick={() => setSelectedWord(null)} className="size-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined text-sm">close</span></button>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-3xl mb-8 space-y-4">
              <div>
                <p className="text-[10px] font-black text-primary dark:text-accent uppercase tracking-widest mb-1">Translation</p>
                <p className="text-xl font-bold">{selectedWord.translation}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-white/30 uppercase tracking-widest mb-1">Definition</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{selectedWord.definition}</p>
              </div>
            </div>
            <button 
              onClick={() => { toggleWord(selectedWord.word, session.id, selectedWord); setSelectedWord(null); }} 
              className={`w-full py-5 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all ${isSearching ? 'opacity-50' : 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-[0_0_20px_rgba(0,228,255,0.3)]'}`}
              disabled={isSearching}
            >
              {isSearching ? 'ANALYZING...' : 'Add to Vocabulary'}
            </button>
          </div>
        </div>
      )}

      {showSegments && (
        <div className="absolute inset-0 z-[600] flex items-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={() => setShowSegments(false)}></div>
          <div className="relative w-full max-w-md mx-auto bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 rounded-t-[3rem] h-[75vh] flex flex-col shadow-2xl animate-slide-up">
             <div className="p-6 flex justify-between items-center shrink-0">
                <h3 className="text-xl font-black tracking-tight px-2">Audio Segments</h3>
                <button onClick={() => setShowSegments(false)} className="size-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/40"><span className="material-symbols-outlined">close</span></button>
             </div>
             <div className="flex-1 overflow-y-auto px-6 pb-12 no-scrollbar">
                <div className="space-y-3">
                   {segments.map((seg, idx) => (
                     <div key={seg.id} onClick={() => jumpToSegment(idx)} className={`p-5 rounded-3xl border transition-all flex items-center gap-5 active:scale-[0.98] ${activeIdx === idx ? 'bg-primary/5 dark:bg-accent/10 border-primary/10 dark:border-accent/20' : 'bg-slate-50 dark:bg-white/5 border-transparent'}`}>
                       <div className={`size-10 rounded-2xl flex items-center justify-center text-[10px] font-black ${activeIdx === idx ? 'bg-primary dark:bg-accent text-white dark:text-black' : 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-white/20'}`}>{idx + 1}</div>
                       <div className="flex-1 min-w-0">
                         <div className="flex justify-between items-center mb-1">
                           <span className={`text-[8px] font-black uppercase tracking-widest ${activeIdx === idx ? 'text-primary dark:text-accent' : 'text-slate-400 dark:text-slate-500'}`}>Speaker {seg.speaker}</span>
                           <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-600 font-bold">{Math.floor(seg.startTime/60)}:{(seg.startTime%60).toFixed(0).padStart(2,'0')}</span>
                         </div>
                         <p className={`text-xs truncate ${activeIdx === idx ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-400'}`}>{seg.text}</p>
                       </div>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      <header className="px-6 pt-12 pb-4 flex justify-between items-center z-50 shrink-0">
        <button onClick={() => navigate('/')} className="size-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white active:scale-90 transition-all shadow-sm"><span className="material-symbols-outlined">expand_more</span></button>
        <div className="flex bg-slate-100 dark:bg-white/5 rounded-2xl p-1 border border-slate-200 dark:border-white/5 backdrop-blur-md">
           {[{ id: PlayerMode.VINYL, icon: 'album' }, { id: PlayerMode.LYRICS, icon: 'format_quote' }, { id: PlayerMode.CONTEXT, icon: 'chat_bubble' }].map(m => (
             <button key={m.id} onClick={() => setMode(m.id)} className={`size-10 rounded-xl flex items-center justify-center transition-all ${mode === m.id ? 'bg-white dark:bg-accent shadow-lg text-slate-900 dark:text-black' : 'text-slate-400 dark:text-white/40'}`}><span className="material-symbols-outlined text-xl">{m.icon}</span></button>
           ))}
        </div>
        <button onClick={() => setSpeed(s => s >= 2 ? 0.5 : s + 0.25)} className="size-10 rounded-xl bg-slate-100 dark:bg-white/5 text-[10px] font-black text-slate-900 dark:text-white border border-slate-200 dark:border-white/5">{speed}x</button>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar relative" ref={scrollRef}>
        {mode === PlayerMode.VINYL && (
          <div className="h-full flex flex-col items-center justify-center space-y-16 py-12 px-8">
             <div className={`size-64 rounded-full relative flex items-center justify-center shadow-2xl ${isPlaying ? 'animate-spin-slow' : ''}`}>
               <div className="absolute inset-0 rounded-full bg-slate-900 border-4 border-slate-800 shadow-inner">
                 <div className="size-full rounded-full opacity-20 bg-[repeating-radial-gradient(circle_at_center,_black_0px,_black_1px,_transparent_1px,_transparent_2px)]"></div>
               </div>
               <div className="size-44 rounded-full overflow-hidden z-10 border-4 border-black/40">
                 <img src={session.coverUrl} className="size-full object-cover" alt="" />
               </div>
               <div className="absolute size-10 rounded-full bg-slate-900 z-20 flex items-center justify-center border-2 border-white/10"><div className="size-2.5 rounded-full bg-primary dark:bg-accent animate-pulse"></div></div>
             </div>
             <div className="text-center max-w-sm" data-seg-idx={activeIdx}>
               <h4 className="text-2xl font-black leading-tight tracking-tight text-slate-900 dark:text-white px-6">{segments[activeIdx].text}</h4>
             </div>
          </div>
        )}

        {mode === PlayerMode.LYRICS && (
          <div className="space-y-16 py-[45vh] animate-fade-in text-center px-6">
            {segments.map((seg, idx) => (
              <div key={seg.id} data-seg-idx={idx} onClick={() => jumpToSegment(idx)} className={`transition-all duration-700 cursor-pointer ${activeIdx === idx ? 'scale-110 opacity-100' : 'scale-90 opacity-20'}`}>
                <div className={`text-4xl font-black leading-tight tracking-tighter ${activeIdx === idx ? 'text-primary dark:text-accent' : 'text-slate-400 dark:text-slate-600'}`}>{seg.text}</div>
              </div>
            ))}
          </div>
        )}

        {mode === PlayerMode.CONTEXT && (
          <div className="pb-64 pt-16 px-4">
            <div className="space-y-12">
              {groupedTurns.map((turn, tIdx) => (
                <div key={tIdx} className="space-y-4">
                  <div className="flex items-center gap-3 px-1">
                     <span className="text-[10px] font-black text-primary dark:text-accent uppercase tracking-[0.2em]">Speaker {turn.speaker}</span>
                     <div className="h-[1px] flex-1 bg-slate-200 dark:bg-white/5"></div>
                  </div>
                  
                  <div className="space-y-2">
                    {turn.segments.map((seg) => {
                      const isActive = activeIdx === seg.originalIdx;
                      return (
                        <div 
                          key={seg.id} 
                          data-seg-idx={seg.originalIdx} 
                          onClick={() => jumpToSegment(seg.originalIdx)}
                          className={`transition-all duration-500 py-4 px-5 relative rounded-[1.5rem] border-l-4 group flex flex-col gap-2 ${isActive ? 'border-primary dark:border-accent bg-primary/5 dark:bg-accent/5 opacity-100' : 'border-transparent opacity-40 hover:opacity-70'}`}
                        >
                          <span className={`text-[8px] font-black tabular-nums ${isActive ? 'text-primary/60 dark:text-accent/60' : 'text-slate-300 dark:text-slate-700'}`}>
                            {Math.floor(seg.startTime/60)}:{(seg.startTime%60).toFixed(0).padStart(2,'0')}
                          </span>
                          <div className={`text-lg leading-relaxed tracking-tight`}>
                            {renderWords(seg, isActive)}
                          </div>
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
        <div className="flex justify-between text-[11px] font-black text-slate-400 dark:text-white/40 mb-4 tracking-widest uppercase tabular-nums">
          <span>{Math.floor(currentTime/60)}:{(currentTime%60).toFixed(0).padStart(2,'0')}</span>
          <span>{Math.floor(session.duration/60)}:{(session.duration%60).toFixed(0).padStart(2,'0')}</span>
        </div>
        <div className="h-1 bg-slate-200 dark:bg-white/10 rounded-full mb-10 cursor-pointer relative group" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const p = (e.clientX - rect.left) / rect.width;
          if (audioRef.current) audioRef.current.currentTime = p * session.duration;
        }}>
           <div className="h-full bg-primary dark:bg-accent rounded-full transition-all duration-300 relative" style={{ width: `${(currentTime/session.duration)*100}%` }}>
             <div className="absolute right-0 top-1/2 -translate-y-1/2 size-4 rounded-full bg-primary dark:bg-accent shadow-[0_0_15px_#00E4FF] scale-0 group-hover:scale-100 transition-transform"></div>
           </div>
        </div>
        <div className="flex items-center justify-between">
           <button onClick={() => setPlaybackMode(m => m === PlaybackMode.LIST_LOOP ? PlaybackMode.SINGLE_LOOP : PlaybackMode.LIST_LOOP)} className={`size-10 rounded-xl flex items-center justify-center transition-all ${playbackMode === PlaybackMode.SINGLE_LOOP ? 'text-primary dark:text-accent' : 'text-slate-400 dark:text-white/20'}`}>
             <span className="material-symbols-outlined text-2xl">{playbackMode === PlaybackMode.SINGLE_LOOP ? 'repeat_one' : 'repeat'}</span>
           </button>
           <div className="flex items-center gap-6">
             <button onClick={() => { if(audioRef.current) audioRef.current.currentTime -= SEEK_STEP }} className="size-10 flex items-center justify-center text-slate-300 dark:text-white/30 transition-all group active:scale-90"><Replay15Icon /></button>
             <button onClick={() => setIsPlaying(!isPlaying)} disabled={!isSourceReady} className={`size-16 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all ${isSourceReady ? 'bg-slate-900 dark:bg-accent text-white dark:text-black' : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-white/20 opacity-50'}`}><span className="material-symbols-outlined text-4xl font-variation-fill-1">{isPlaying ? 'pause' : 'play_arrow'}</span></button>
             <button onClick={() => { if(audioRef.current) audioRef.current.currentTime += SEEK_STEP }} className="size-10 flex items-center justify-center text-slate-300 dark:text-white/30 transition-all group active:scale-90"><Forward15Icon /></button>
           </div>
           <button onClick={(e) => { e.stopPropagation(); setShowSegments(true); }} className={`size-12 rounded-xl flex items-center justify-center transition-all active:scale-90 relative z-[110] ${showSegments ? 'text-primary dark:text-accent bg-primary/10 dark:bg-accent/10' : 'text-slate-400 dark:text-white/20 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}><span className="material-symbols-outlined text-2xl">playlist_play</span></button>
        </div>
      </footer>
    </div>
  );
};

export default PlayerView;