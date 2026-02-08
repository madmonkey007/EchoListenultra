
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioSession, AIProviderConfig } from '../types.ts';

const LANGUAGES = [
  { code: 'en', name: 'English (Global)' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
];

const GEMINI_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Fast)' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Complex)' },
  { id: 'gemini-2.5-flash-lite-latest', name: 'Gemini 2.5 Lite' }
];

interface SettingsViewProps {
  sessions?: AudioSession[];
  apiConfig: AIProviderConfig;
  onConfigChange: (c: AIProviderConfig) => void;
  onDeleteCache?: (id: string) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ sessions = [], apiConfig, onConfigChange, onDeleteCache }) => {
  const navigate = useNavigate();
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [localConfig, setLocalConfig] = useState<AIProviderConfig>({ ...apiConfig });

  useEffect(() => {
    setLocalConfig(prev => ({ ...prev, theme: apiConfig.theme }));
  }, [apiConfig.theme]);

  const handleSave = () => {
    onConfigChange(localConfig);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  };

  const updateConfig = (updates: Partial<AIProviderConfig>) => {
    const next = { ...localConfig, ...updates };
    setLocalConfig(next);
    if (updates.theme) {
      onConfigChange(next);
    }
  };

  const hasDeepgramKey = localConfig.deepgramApiKey && localConfig.deepgramApiKey.trim().length > 10;

  return (
    <div className="p-6 space-y-8 animate-fade-in pb-32 min-h-full bg-background-light dark:bg-background-dark">
      <header className="flex justify-between items-center mb-6 pt-4">
        <div className="flex items-center gap-4">
           <button onClick={() => navigate('/')} className="size-10 flex items-center justify-center rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-white/5 active:scale-90 transition-transform shadow-sm dark:shadow-none">
             <span className="material-symbols-outlined text-slate-500 dark:text-gray-400">arrow_back</span>
           </button>
           <h1 className="font-display text-3xl font-black tracking-tight text-slate-900 dark:text-white">Settings</h1>
        </div>

        <button 
          onClick={() => updateConfig({ theme: localConfig.theme === 'dark' ? 'light' : 'dark' })}
          className="size-10 rounded-xl bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-white/5 flex items-center justify-center text-slate-500 dark:text-accent shadow-sm active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined fill-1">
            {localConfig.theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </header>

      {/* Provider Selection */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <span className="material-symbols-outlined text-slate-400 dark:text-gray-500 text-sm">hub</span>
          <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-400 uppercase tracking-widest">Model Provider</h3>
        </div>
        <div className="grid grid-cols-2 bg-surface-light dark:bg-surface-dark p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
          <button 
            onClick={() => updateConfig({ provider: 'gemini' })}
            className={`py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${localConfig.provider === 'gemini' ? 'bg-slate-900 dark:bg-primary text-white shadow-md' : 'text-slate-400 dark:text-gray-500'}`}
          >
            Built-in Engine
          </button>
          <button 
            onClick={() => updateConfig({ provider: 'deepgram' })}
            className={`py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${localConfig.provider === 'deepgram' ? 'bg-slate-900 dark:bg-primary text-white shadow-md' : 'text-slate-400 dark:text-gray-500'}`}
          >
            Deepgram Nova
          </button>
        </div>
      </section>

      {/* Dynamic API Config */}
      <section className="bg-surface-light dark:bg-surface-dark/40 p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/5 space-y-6 shadow-sm">
        
        {localConfig.provider === 'gemini' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest ml-1">Gemini Intelligence Model</label>
              <div className="relative">
                <select 
                  value={localConfig.geminiModel}
                  onChange={(e) => updateConfig({ geminiModel: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-white/5 rounded-xl py-4 px-5 text-sm text-slate-900 dark:text-white appearance-none outline-none cursor-pointer"
                >
                  {GEMINI_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest ml-1">Deepgram API Key</label>
              <input 
                type="password"
                placeholder="Enter your Deepgram Key"
                value={localConfig.deepgramApiKey}
                onChange={(e) => updateConfig({ deepgramApiKey: e.target.value })}
                className="w-full bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-white/5 rounded-xl py-4 px-5 text-sm text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            
            <div className={`flex items-center gap-2 p-3 rounded-xl border transition-all duration-300 ${hasDeepgramKey ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/5 border-amber-500/10'}`}>
              <span className={`material-symbols-outlined text-sm ${hasDeepgramKey ? 'text-green-500' : 'text-amber-500'}`}>
                {hasDeepgramKey ? 'verified_user' : 'error'}
              </span>
              <p className={`text-[9px] font-black uppercase tracking-widest ${hasDeepgramKey ? 'text-green-500' : 'text-amber-500/80'}`}>
                {hasDeepgramKey ? 'ASR Engine Ready' : 'API Key Input Required'}
              </p>
            </div>
          </div>
        )}

        <div className="h-px bg-slate-100 dark:bg-white/5 mx-2"></div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest ml-1">Target Language</label>
          <div className="relative">
            <select 
              value={localConfig.deepgramLanguage}
              onChange={(e) => updateConfig({ deepgramLanguage: e.target.value })}
              className="w-full bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-white/5 rounded-xl py-4 px-5 text-sm text-slate-900 dark:text-white appearance-none outline-none cursor-pointer"
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
          </div>
        </div>
      </section>

      {/* Simplified and Reliable Save Button */}
      <button 
        onClick={handleSave}
        className={`w-full py-5 rounded-[2rem] font-display text-lg font-black transition-all duration-500 active:scale-[0.98] shadow-2xl flex items-center justify-center gap-3 ${
          saveFeedback 
          ? 'bg-green-500 text-white' 
          : 'bg-slate-900 dark:bg-accent text-white dark:text-black'
        }`}
      >
        {saveFeedback ? (
          <>
            <span className="material-symbols-outlined">check_circle</span>
            <span>Settings Synchronized</span>
          </>
        ) : (
          <span>Save Preferences</span>
        )}
      </button>

      <div className="pt-4 text-center">
        <p className="text-[9px] font-black text-slate-400 dark:text-gray-600 uppercase tracking-[0.3em]">EchoListen v1.3.4 Production</p>
      </div>
    </div>
  );
};

export default SettingsView;
