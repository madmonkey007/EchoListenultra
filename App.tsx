
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import HomeView from './views/HomeView.tsx';
import PlayerView from './views/PlayerView.tsx';
import AddSessionView from './views/AddSessionView.tsx';
import SettingsView from './views/SettingsView.tsx';
import VocabularyView from './views/VocabularyView.tsx';
import SiteHeader, { Brand } from './components/SiteHeader.tsx';
import LandingView from './views/LandingView.tsx';
import HelpView from './views/HelpView.tsx';
import ContactView from './views/ContactView.tsx';
import AboutView from './views/AboutView.tsx';
import PrivacyView from './views/PrivacyView.tsx';
import AccountView from './views/AccountView.tsx';
import AuthView from './views/AuthView.tsx';
import { routeMetadata, SITE_ORIGIN } from './lib/site-meta.ts';
import { restoreSessions } from './data/sample.ts';
import { AudioSession, AIProviderConfig, SavedWord } from './types.ts';

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: 'gemini',
  geminiApiKey: '',
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
    if (apiConfig.theme === 'light') {
      html.classList.remove('dark');
      html.classList.add('light');
    } else {
      html.classList.remove('light');
      html.classList.add('dark');
    }
  }, [apiConfig.theme]);

  useEffect(() => {
    const metadata = routeMetadata(location.pathname);
    document.title = metadata.title;
    const setMeta = (attribute: string, key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = content;
    };
    setMeta('name', 'description', metadata.description);
    setMeta('name', 'robots', metadata.robots);
    setMeta('property', 'og:title', metadata.title);
    setMeta('property', 'og:description', metadata.description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (metadata.robots.startsWith('index')) {
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
      canonical.href = SITE_ORIGIN + (location.pathname === '/' ? '/' : location.pathname);
      setMeta('property', 'og:url', canonical.href);
    } else { canonical?.remove(); setMeta('property', 'og:url', SITE_ORIGIN + '/'); }
    if (!isPlayerView) window.scrollTo(0, 0);
    const anchor = location.hash.slice(1);
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
  }, [location.pathname, location.hash, isPlayerView]);

  const isToolPage = ['/add', '/settings', '/vocabulary'].includes(location.pathname);
  return (
    <div className={`website ${isPlayerView ? 'is-player' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      {!isOnline && <div className="offline-notice" role="status">You’re offline. Saved audio and cached vocabulary are available; AI and new word lookups need a connection.</div>}
      <main id="main-content" className={isToolPage ? 'tool-page' : isPlayerView ? 'player-page' : 'site-main'} tabIndex={-1}>
        <Routes>
          <Route path="/" element={<LandingView />} />
          <Route path="/library" element={<HomeView sessions={sessions} savedWordCount={savedWords.length} />} />
          <Route path="/player/:id" element={<PlayerView sessions={sessions} savedWords={savedWords} toggleWord={toggleWord} onUpdateSession={updateSession} apiConfig={apiConfig} />} />
          <Route path="/add" element={<AddSessionView onAdd={addSession} apiConfig={apiConfig} isOnline={isOnline} />} />
          <Route path="/vocabulary" element={<VocabularyView savedWords={savedWords} sessions={sessions} onUpdateWord={updateWord} />} />
          <Route path="/settings" element={<SettingsView apiConfig={apiConfig} onConfigChange={setApiConfig} sessions={sessions} onDeleteCache={deleteSession} />} />
          <Route path="/help" element={<HelpView />} />
          <Route path="/contact" element={<ContactView />} />
          <Route path="/about" element={<AboutView />} />
          <Route path="/privacy" element={<PrivacyView />} />
          <Route path="/account" element={<AccountView />} />
          <Route path="/login" element={<AuthView />} />
          <Route path="/auth/callback" element={<AuthView />} />
          <Route path="*" element={<div className="empty-state site-container"><h1>That page isn’t here.</h1><p>Your lessons are still in My audio.</p><Link className="button" to="/library">Go to My audio</Link></div>} />
        </Routes>
      </main>
      {!isPlayerView && <footer className="site-footer site-container"><Brand /><p>Listen closely. Learn at your pace.</p><Link to="/about">About</Link><Link to="/contact">Contact</Link><Link to="/privacy">Data & privacy</Link><Link to="/help">Help & guide</Link></footer>}
      {!isPlayerView && !['/contact', '/account', '/login', '/auth/callback'].includes(location.pathname) && <Link to="/contact" className="feedback-fab" aria-label="Feedback and help"><span className="material-symbols-outlined" aria-hidden="true">chat_bubble_outline</span><span>Feedback</span></Link>}
    </div>
  );
};

// Preserve links shared by earlier hash-router versions.
if (window.location.hash.startsWith('#/')) {
  const legacyPath = window.location.hash.slice(1);
  window.history.replaceState(null, '', legacyPath === '/' ? '/library' : legacyPath);
}

const App: React.FC = () => {
  const [sessions, setSessions] = useState<AudioSession[]>(() => {
    return restoreSessions(localStorage.getItem('echo_sessions'));
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
        phonetic: def?.phonetic,
        example: def?.example // Persist the context example
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
