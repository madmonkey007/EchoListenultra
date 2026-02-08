
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomeView from './views/HomeView.tsx';
import PlayerView from './views/PlayerView.tsx';
import AddSessionView from './views/AddSessionView.tsx';
import SettingsView from './views/SettingsView.tsx';
import VocabularyView from './views/VocabularyView.tsx';
import BottomNav from './components/BottomNav.tsx';
import { AudioSession, AIProviderConfig, SavedWord } from './types.ts';

const INITIAL_SESSIONS: AudioSession[] = [
  {
    id: 'sample-1',
    title: 'The Future of AI Architecture',
    subtitle: 'Technology • Podcast S01E04',
    coverUrl: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=400&h=400&auto=format&fit=crop',
    segments: [
      { id: 's1', startTime: 0, endTime: 6, text: "In today's session, we explore the paradigm shift from traditional neural networks to transformer-based architectures.", speaker: 1 },
      { id: 's2', startTime: 6, endTime: 13, text: "The primary challenge remains the quadratic complexity of self-attention mechanisms as sequence length increases.", speaker: 1 },
      { id: 's3', startTime: 13, endTime: 20, text: "Wait, isn't that exactly what the new linear attention variants are trying to solve in recent papers?", speaker: 2 },
      { id: 's4', startTime: 20, endTime: 28, text: "Exactly. By approximating the kernel, we can achieve linear time complexity without sacrificing too much accuracy.", speaker: 1 },
      { id: 's5', startTime: 28, endTime: 35, text: "This opens up possibilities for processing entire books or massive codebases in a single context window.", speaker: 2 }
    ],
    duration: 35,
    lastPlayed: '1d ago',
    status: 'ready'
  }
];

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: 'gemini',
  geminiModel: 'gemini-3-flash-preview',
  customEndpoint: '',
  customApiKey: '',
  customModelId: '',
  deepgramApiKey: '', 
  deepgramLanguage: 'en',
  theme: 'dark'
};

const AppContent: React.FC<{ 
  sessions: AudioSession[], 
  addSession: (s: AudioSession) => void, 
  updateSession: (id: string, updates: Partial<AudioSession>) => void,
  deleteSession: (id: string) => void,
  savedWords: SavedWord[],
  toggleWord: (word: string, sessionId: string, def?: any) => void,
  updateWord: (word: string, updates: Partial<SavedWord>) => void,
  apiConfig: AIProviderConfig,
  setApiConfig: (c: AIProviderConfig) => void
}> = ({ sessions, addSession, updateSession, deleteSession, savedWords, toggleWord, updateWord, apiConfig, setApiConfig }) => {
  const location = useLocation();
  const isPlayerView = location.pathname.startsWith('/player');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const metaTheme = document.getElementById('theme-meta');
    if (apiConfig.theme === 'light') {
      html.classList.remove('dark');
      html.classList.add('light');
      if (metaTheme) metaTheme.setAttribute('content', isOnline ? '#F1F5F9' : '#FCA5A5');
    } else {
      html.classList.remove('light');
      html.classList.add('dark');
      if (metaTheme) metaTheme.setAttribute('content', isOnline ? '#181C21' : '#7F1D1D');
    }
  }, [apiConfig.theme, isOnline]);

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto overflow-hidden font-body relative bg-background-light dark:bg-background-dark text-slate-900 dark:text-white safe-pt shadow-2xl">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="bg-red-500 text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 flex items-center justify-center gap-2 animate-pulse shrink-0">
          <span className="material-symbols-outlined text-xs">cloud_off</span>
          Offline Mode - AI Features Unavailable
        </div>
      )}
      
      <main className={`flex-1 overflow-y-auto no-scrollbar ${isPlayerView ? 'pb-0' : 'pb-24'}`}>
        <Routes>
          <Route path="/" element={<HomeView sessions={sessions} />} />
          <Route path="/player/:id" element={<PlayerView sessions={sessions} savedWords={savedWords} toggleWord={toggleWord} onUpdateSession={updateSession} />} />
          <Route path="/add" element={<AddSessionView onAdd={addSession} apiConfig={apiConfig} isOnline={isOnline} />} />
          <Route path="/vocabulary" element={<VocabularyView savedWords={savedWords} sessions={sessions} onUpdateWord={updateWord} />} />
          <Route path="/settings" element={<SettingsView apiConfig={apiConfig} onConfigChange={setApiConfig} sessions={sessions} onDeleteCache={deleteSession} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      {!isPlayerView && <BottomNav />}
    </div>
  );
};

const App: React.FC = () => {
  const [sessions, setSessions] = useState<AudioSession[]>(() => {
    const saved = localStorage.getItem('echo_sessions');
    return saved ? JSON.parse(saved) : INITIAL_SESSIONS;
  });
  
  const [savedWords, setSavedWords] = useState<SavedWord[]>(() => {
    const saved = localStorage.getItem('echo_words_v2');
    return saved ? JSON.parse(saved) : [];
  });

  const [apiConfig, setApiConfig] = useState<AIProviderConfig>(() => {
    const saved = localStorage.getItem('echo_api_config');
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
  });

  useEffect(() => {
    localStorage.setItem('echo_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('echo_words_v2', JSON.stringify(savedWords));
  }, [savedWords]);

  useEffect(() => {
    localStorage.setItem('echo_api_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  const addSession = (newSession: AudioSession) => setSessions(prev => [newSession, ...prev]);
  
  const updateSession = (id: string, updates: Partial<AudioSession>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const toggleWord = (word: string, sessionId: string, def?: any) => {
    const lower = word.toLowerCase();
    setSavedWords(prev => {
      const exists = prev.some(w => w.word.toLowerCase() === lower);
      if (exists) return prev.filter(w => w.word.toLowerCase() !== lower);
      
      const newWord: SavedWord = {
        word,
        sessionId,
        addedAt: Date.now(),
        nextReview: Date.now() + 24 * 60 * 60 * 1000, 
        stage: 0,
        definition: def?.definition,
        translation: def?.translation,
        phonetic: def?.phonetic
      };
      return [...prev, newWord];
    });
  };

  const updateWord = (word: string, updates: Partial<SavedWord>) => {
    setSavedWords(prev => prev.map(w => w.word.toLowerCase() === word.toLowerCase() ? { ...w, ...updates } : w));
  };

  return (
    <Router>
      <AppContent 
        sessions={sessions} 
        addSession={addSession} 
        updateSession={updateSession}
        deleteSession={deleteSession}
        savedWords={savedWords}
        toggleWord={toggleWord}
        updateWord={updateWord}
        apiConfig={apiConfig}
        setApiConfig={setApiConfig}
      />
    </Router>
  );
};

export default App;
