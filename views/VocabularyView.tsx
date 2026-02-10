import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SavedWord, AudioSession } from '../types.ts';

interface VocabularyViewProps {
  savedWords: SavedWord[];
  sessions: AudioSession[];
  onUpdateWord: (word: string, updates: Partial<SavedWord>) => void;
}

const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 90]; // Days

const speak = (text: string) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
};

const VocabularyView: React.FC<VocabularyViewProps> = ({ savedWords, sessions, onUpdateWord }) => {
  const navigate = useNavigate();
  const [testMode, setTestMode] = useState(false);
  const [testIdx, setTestIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [detailWord, setDetailWord] = useState<SavedWord | null>(null);

  const dueWords = useMemo(() => savedWords.filter(w => w.nextReview <= Date.now()), [savedWords]);
  
  const folders = useMemo(() => {
    const groups: Record<string, SavedWord[]> = {};
    savedWords.forEach(w => {
      const sId = w.sessionId || 'imported';
      if (!groups[sId]) groups[sId] = [];
      groups[sId].push(w);
    });
    return Object.entries(groups).map(([id, words]) => ({
      session: sessions.find(s => s.id === id),
      words
    }));
  }, [savedWords, sessions]);

  const handleReviewAction = (known: boolean) => {
    const word = dueWords[testIdx];
    const newStage = known ? Math.min(word.stage + 1, REVIEW_INTERVALS.length - 1) : 0;
    const nextInterval = REVIEW_INTERVALS[newStage] * 24 * 60 * 60 * 1000;
    
    onUpdateWord(word.word, {
      stage: newStage,
      nextReview: Date.now() + nextInterval
    });

    if (testIdx < dueWords.length - 1) {
      setTestIdx(testIdx + 1);
      setShowAnswer(false);
    } else {
      setTestMode(false);
      setTestIdx(0);
    }
  };

  if (testMode && dueWords.length > 0) {
    const current = dueWords[testIdx];
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-background-dark p-8 animate-fade-in">
        <header className="flex justify-between items-center mb-12">
          <button onClick={() => setTestMode(false)} className="size-10 bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-center text-slate-400 shadow-sm"><span className="material-symbols-outlined">close</span></button>
          <div className="text-[10px] font-black uppercase tracking-widest text-accent">Reviewing {testIdx + 1} / {dueWords.length}</div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-12">
          <div className="space-y-2">
            <h2 className="text-6xl font-black tracking-tighter text-slate-900 dark:text-white">{current.word}</h2>
            <div className="flex items-center justify-center gap-3">
              <p className="text-accent italic font-medium">{current.phonetic}</p>
              <button onClick={() => speak(current.word)} className="size-8 rounded-full bg-accent/10 text-accent flex items-center justify-center active:scale-90"><span className="material-symbols-outlined text-sm">volume_up</span></button>
            </div>
          </div>

          <div className={`transition-all duration-500 w-full max-w-sm ${showAnswer ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <div className="bg-white dark:bg-surface-dark p-8 rounded-[3rem] border border-slate-200 dark:border-white/5 space-y-4 shadow-sm text-left">
              <h3 className="text-3xl font-black text-slate-900 dark:text-white">{current.translation}</h3>
              <p className="text-slate-500 dark:text-gray-400 text-sm leading-relaxed">{current.definition}</p>
              {current.example && <p className="text-xs italic text-slate-400 border-t pt-4 border-slate-100 dark:border-white/5">"{current.example}"</p>}
            </div>
          </div>
        </div>

        <div className="pb-12 space-y-4">
          {!showAnswer ? (
            <button onClick={() => { setShowAnswer(true); speak(current.word); }} className="w-full bg-slate-900 dark:bg-accent py-6 rounded-3xl text-white dark:text-black font-black uppercase tracking-widest shadow-xl">Reveal Answer</button>
          ) : (
            <div className="grid grid-cols-2 gap-4">
               <button onClick={() => handleReviewAction(false)} className="bg-red-500/10 text-red-500 py-6 rounded-3xl font-black uppercase tracking-widest border border-red-500/20">Forgot</button>
               <button onClick={() => handleReviewAction(true)} className="bg-green-500/10 text-green-600 py-6 rounded-3xl font-black uppercase tracking-widest border border-green-500/20">Knew it</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-32 animate-fade-in min-h-full bg-background-light dark:bg-background-dark">
      <header className="flex justify-between items-center mb-10 pt-4 px-2">
        <div>
          <h2 className="text-[10px] font-black text-accent uppercase tracking-[0.4em] mb-1.5 opacity-80">Knowledge base</h2>
          <h1 className="font-display text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Vocabulary</h1>
        </div>
        <div className="size-12 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 flex items-center justify-center shadow-sm">
           <span className="material-symbols-outlined text-accent font-black">school</span>
        </div>
      </header>

      {detailWord && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailWord(null)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[3rem] p-8 shadow-2xl animate-slide-up mb-12 overflow-y-auto no-scrollbar max-h-[85vh]">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-4xl font-black">{detailWord.word}</h3>
                  <button onClick={() => speak(detailWord.word)} className="size-10 rounded-full bg-accent/10 text-accent flex items-center justify-center active:scale-90 transition-transform"><span className="material-symbols-outlined">volume_up</span></button>
                </div>
                <p className="text-accent text-sm italic font-medium">{detailWord.phonetic}</p>
              </div>
              <button onClick={() => setDetailWord(null)} className="size-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center"><span className="material-symbols-outlined text-slate-400">close</span></button>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-[2rem]">
                <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-2">Translation</p>
                <p className="text-2xl font-black mb-4">{detailWord.translation || 'N/A'}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Meaning</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium mb-4">{detailWord.definition || "No definition stored."}</p>
                {detailWord.example && (
                  <div className="bg-slate-100 dark:bg-white/5 p-4 rounded-xl border-l-2 border-accent/20 italic text-xs text-slate-500">"{detailWord.example}"</div>
                )}
              </div>
              <div className="px-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Memory Stage</p>
                <div className="flex items-center gap-2">
                   {[...Array(8)].map((_, i) => (
                     <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= detailWord.stage ? 'bg-accent shadow-[0_0_8px_rgba(0,228,255,0.4)]' : 'bg-slate-100 dark:bg-white/5'}`}></div>
                   ))}
                </div>
              </div>
            </div>
            <button onClick={() => setDetailWord(null)} className="w-full mt-10 py-5 rounded-[2rem] bg-slate-900 dark:bg-accent text-white dark:text-black font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Close Details</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-10">
         <div className="bg-white dark:bg-surface-dark p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Saved Words</p>
            <span className="text-4xl font-black font-display text-slate-900 dark:text-white">{savedWords.length}</span>
         </div>
         <div className="bg-white dark:bg-surface-dark p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Review Due</p>
            <span className="text-4xl font-black font-display text-accent">{dueWords.length}</span>
         </div>
      </div>

      <div className="space-y-12">
        {folders.length > 0 ? (
          folders.map(({ session, words }, fIdx) => (
            <div key={fIdx} className="space-y-4">
               <div className="flex items-center gap-3 px-2">
                 <div className="size-1 w-8 bg-accent/20 rounded-full"></div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{session?.title || "Imported Vocabulary"}</span>
               </div>
               <div className="grid grid-cols-1 gap-3">
                 {words.map((w, idx) => (
                   <button key={idx} onClick={() => { setDetailWord(w); speak(w.word); }} className="flex items-center justify-between bg-white dark:bg-surface-dark/40 p-5 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-sm transition-all active:scale-[0.98] w-full">
                     <div className="flex items-center gap-4">
                        <div className="size-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-accent">
                           <span className="text-lg font-black uppercase">{w.word[0]}</span>
                        </div>
                        <div className="text-left">
                           <h4 className="font-black text-slate-900 dark:text-white tracking-tight">{w.word}</h4>
                           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">{w.translation || "Tap for info"}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className={`size-3 rounded-full ${w.stage > 4 ? 'bg-green-500' : 'bg-accent/20'}`}></div>
                        <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                     </div>
                   </button>
                 ))}
               </div>
            </div>
          ))
        ) : (
          <div className="py-24 text-center opacity-30 flex flex-col items-center">
             <span className="material-symbols-outlined text-6xl mb-4 font-light text-slate-900 dark:text-white">auto_stories</span>
             <p className="text-[10px] font-black uppercase tracking-[0.4em]">Lexis is Empty</p>
          </div>
        )}
      </div>

      <button 
        onClick={() => dueWords.length > 0 && setTestMode(true)}
        disabled={dueWords.length === 0}
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-12 py-5 rounded-full font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all z-50 ${dueWords.length > 0 ? 'bg-slate-900 text-white dark:bg-accent dark:text-black active:scale-95' : 'bg-slate-200 text-slate-400 opacity-50'}`}
      >
        {dueWords.length > 0 ? `Begin Review (${dueWords.length})` : 'Nothing Due'}
      </button>
    </div>
  );
};

export default VocabularyView;