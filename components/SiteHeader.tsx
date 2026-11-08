import React, { useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

export function Brand() {
  return <Link to="/" className="brand" aria-label="ReelTranscript home"><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="M6 12v8m5-13v18m5-22v26m5-21v16m5-12v8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg><span>ReelTranscript<span className="brand-dot">.</span></span></Link>;
}

export default function SiteHeader({ theme = 'dark', onThemeChange }: { theme?: 'light' | 'dark'; onThemeChange?: (theme: 'light' | 'dark') => void }) {
  const themeMenu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const links = [['/', 'Home'], ['/help', 'How it works'], ['/about', 'About'], ['/contact', 'Contact']];
  return <header className="site-header">
    <div className="header-inner"><Brand />
      <button className="menu-toggle" aria-expanded={open} aria-controls="site-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(!open)}><span className="material-symbols-outlined" aria-hidden="true">{open ? 'close' : 'menu'}</span></button>
      <nav id="site-navigation" className={open ? 'site-nav is-open' : 'site-nav'} aria-label="Main navigation">
        {links.map(([path, label]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)}>{label}</NavLink>)}
      </nav>
      <Link to="/contact" className="header-feedback" aria-label="Contact and feedback" title="Contact and feedback"><span className="material-symbols-outlined" aria-hidden="true">help_outline</span></Link>
      {onThemeChange ? <details className="header-theme" ref={themeMenu} onKeyDown={event => { if (event.key === 'Escape') { themeMenu.current?.removeAttribute('open'); themeMenu.current?.querySelector('summary')?.focus(); } }}>
        <summary aria-label="Theme settings" title="Theme settings"><span className="material-symbols-outlined" aria-hidden="true">contrast</span><span className="header-theme-label">Theme</span></summary>
        <div className="theme-options" role="group" aria-label="Theme mode"><p>Theme mode</p>{(['light', 'dark'] as const).map(mode => <button type="button" key={mode} aria-pressed={theme === mode} onClick={() => { onThemeChange(mode); themeMenu.current?.removeAttribute('open'); }}><span className="material-symbols-outlined" aria-hidden="true">{mode === 'light' ? 'light_mode' : 'dark_mode'}</span>{mode === 'light' ? 'Light' : 'Dark'}{theme === mode && <span aria-hidden="true">✓</span>}</button>)}</div>
      </details> : <Link to="/settings" className="header-theme-link" aria-label="Theme settings" title="Theme settings"><span className="material-symbols-outlined" aria-hidden="true">contrast</span></Link>}
    </div>
  </header>;
}
