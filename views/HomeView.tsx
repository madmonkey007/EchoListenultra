import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioSession, UserStats } from '../types.ts';

interface HomeViewProps {
  sessions: AudioSession[];
}

const LogoIcon = () => (
  <svg width="48" height="48" viewBox="0 0 512 512" className="rounded-2xl shadow-lg">
    <rect width="512" height="512" rx="120" fill="black"/>
    <path d="M160 140 v232 M160 256 h120 M160 140 h140 c80 0 80 232 0 232 h-140" fill="none" stroke="white" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
);

const HomeView: React.FC<HomeViewProps> = ({ sessions }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const stats: UserStats = {
    weeklyGoal: 10.0,
    currentWeekly: 6.8,
    vocabularyCount: 245,
    vocabularyGrowth: 18
  };

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 pb-32 animate-fade-in min-h-full">
      <header className="flex justify-between items-center mb-10 pt-8">
        <div className="flex items-center gap-4">
          <LogoIcon />
          <div>
            <p className="text-[10px] font-black text-accent uppercase tracking-[0.6em] mb-0.5">V1.0 Ultra</p>
            <h1 className="font-display text-3xl font-black tracking-tighter text-slate-900 dark:text-white">EchoListen</h1>
          </div>
        </div>
        <button onClick={() => navigate('/settings')} className="size-12 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 flex items-center justify-center transition-all active:scale-90 shadow-sm">
          <span className="material-symbols-outlined text-slate-400 dark:text-gray-400 text-2xl">settings</span>
        </button>
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-12 gap-4 mb-10">
        <div className="col-span-7 bg-white dark:bg-surface-dark p-6 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-6xl">insights</span>
          </div>
          <p className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-6">Learning Velocity</p>
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-black font-display text-slate-900 dark:text-white">{stats.currentWeekly}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Hrs</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-accent shadow-[0_0_12px_rgba(0,228,255,0.6)] transition-all duration-1000" style={{ width: `${(stats.currentWeekly / stats.weeklyGoal) * 100}%` }}></div>
          </div>
        </div>

        <div className="col-span-5 bg-accent/10 dark:bg-accent/5 p-6 rounded-[2.5rem] border border-accent/20 dark:border-accent/10 flex flex-col justify-between">
          <p className="text-[9px] font-black text-accent uppercase tracking-widest">Lexicon</p>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black font-display text-slate-900 dark:text-white">{stats.vocabularyCount}</span>
            </div>
            <p className="text-[9px] font-black text-accent/80 uppercase tracking-widest mt-1">+{stats.vocabularyGrowth} New</p>
          </div>
        </div>
      </div>

      {/* Explorer */}
      <div className="relative mb-10 group">
        <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-600 transition-colors group-focus-within:text-accent">search</span>
        <input 
          type="text" 
          placeholder="Explore library..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          className="w-full bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-[1.8rem] py-5 pl-14 pr-6 text-sm text-slate-900 dark:text-white outline-none shadow-sm focus:ring-1 focus:ring-accent/30 transition-all" 
        />
      </div>

      <div className="space-y-6">
        <div className="flex justify-between items-center px-2">
          <h3 className="font-display text-xl font-black tracking-tight text-slate-800 dark:text-white/90">Library</h3>
          <span className="text-[10px] font-black text-slate-400 dark:text-gray-600 uppercase tracking-widest">{filteredSessions.length} items</span>
        </div>

        {filteredSessions.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filteredSessions.map(session => (
              <div 
                key={session.id} 
                onClick={() => navigate(`/player/${session.id}`)} 
                className="group flex items-center gap-5 bg-white dark:bg-surface-dark/40 hover:dark:bg-surface-dark/60 p-4 rounded-[2.2rem] border border-slate-200 dark:border-white/5 transition-all duration-300 cursor-pointer active:scale-[0.98] shadow-sm"
              >
                <div className="size-20 rounded-[1.8rem] overflow-hidden shrink-0 shadow-lg relative bg-slate-100 dark:bg-slate-800">
                  <img src={session.coverUrl} alt={session.title} className="size-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-black text-base truncate text-slate-900 dark:text-white mb-1 group-hover:text-accent transition-colors">{session.title}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-white bg-slate-900 dark:bg-accent/10 dark:text-accent uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-1">
                      <span className="material-symbols-outlined text-[8px] fill-1">verified</span> Ready
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-gray-500 truncate font-medium">{session.subtitle}</p>
                  </div>
                </div>
                <div className="size-10 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700 group-hover:text-accent transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center opacity-30 flex flex-col items-center">
             <span className="material-symbols-outlined text-6xl mb-4 font-light text-slate-900 dark:text-white">folder_off</span>
             <p className="text-[10px] font-black uppercase tracking-[0.4em]">Empty Vault</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeView;