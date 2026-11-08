import React from 'react';
import { AIProviderConfig, AudioSession } from '../types.ts';

interface SettingsViewProps {
  sessions?: AudioSession[];
  apiConfig: AIProviderConfig;
  onConfigChange: (c: AIProviderConfig) => void;
  onDeleteCache?: (id: string) => void;
}

export default function SettingsView({ apiConfig, onConfigChange }: SettingsViewProps) {
  return <div className="max-w-2xl mx-auto space-y-8 pb-20">
    <header className="flex items-center justify-between px-2">
      <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
    </header>
    <section className="bg-surface-light dark:bg-surface-dark/40 p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/5 space-y-6 shadow-sm">
      <h2 className="text-sm font-bold">Theme mode</h2>
      <p className="text-sm text-slate-500 dark:text-gray-400 leading-relaxed">Choose a light or dark appearance. Your choice is saved on this device.</p>
      <div className="grid grid-cols-2 bg-surface-light dark:bg-surface-dark p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
        {(['light', 'dark'] as const).map(theme => <button key={theme} type="button" aria-pressed={apiConfig.theme === theme} onClick={() => onConfigChange({ ...apiConfig, theme })} className={`py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${apiConfig.theme === theme ? 'bg-slate-900 dark:bg-primary text-white shadow-md' : 'text-slate-400 dark:text-gray-500'}`}>
          {theme === 'light' ? 'Light' : 'Dark'}
        </button>)}
      </div>
    </section>
  </div>;
}
