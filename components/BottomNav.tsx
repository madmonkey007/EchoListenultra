
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 dark:bg-background-dark/90 backdrop-blur-2xl border-t border-slate-200 dark:border-white/5 z-50">
      <div className="flex items-center justify-between h-24 px-10">
        {/* Left: Home */}
        <button 
          onClick={() => navigate('/')}
          className={`flex flex-col items-center gap-1.5 transition-all flex-1 ${isActive('/') ? 'text-primary dark:text-accent' : 'text-slate-400 dark:text-white/20 hover:text-slate-600 dark:hover:text-white/40'}`}
        >
          <span className={`material-symbols-outlined text-2xl ${isActive('/') ? 'fill-1' : ''}`}>grid_view</span>
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Hub</span>
        </button>

        {/* Center: Add */}
        <button 
          onClick={() => navigate('/add')}
          className="relative -top-2 flex-none px-6"
        >
          <div className="size-16 rounded-full border border-slate-200 dark:border-white/10 p-1.5 transition-all active:scale-90 hover:border-primary/40 dark:hover:border-accent/40 group">
            <div className="size-full rounded-full bg-slate-50 dark:bg-surface-dark border border-slate-200 dark:border-white/5 flex items-center justify-center transition-colors group-hover:bg-slate-100 dark:group-hover:bg-accent/5 shadow-sm dark:shadow-none">
              <span className="material-symbols-outlined text-slate-700 dark:text-white/80 group-hover:text-primary dark:group-hover:text-accent transition-colors text-3xl font-light">add</span>
            </div>
          </div>
        </button>

        {/* Right: Vocabulary */}
        <button 
          onClick={() => navigate('/vocabulary')}
          className={`flex flex-col items-center gap-1.5 transition-all flex-1 ${isActive('/vocabulary') ? 'text-primary dark:text-accent' : 'text-slate-400 dark:text-white/20 hover:text-slate-600 dark:hover:text-white/40'}`}
        >
          <span className={`material-symbols-outlined text-2xl ${isActive('/vocabulary') ? 'fill-1' : ''}`}>auto_stories</span>
          <span className="text-[8px] font-black uppercase tracking-[0.2em]">Lexis</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
