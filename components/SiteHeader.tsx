import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.ts';

export function Brand() {
  return <Link to="/" className="brand" aria-label="EchoListen home"><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="M6 12v8m5-13v18m5-22v26m5-21v16m5-12v8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg><span>EchoListen<span className="brand-dot">.</span></span></Link>;
}

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { session } = useAuth();
  const links = [['/', 'Home'], ['/library', 'My audio'], ['/vocabulary', 'Vocabulary'], ['/help', 'How it works']];
  return <header className="site-header">
    <div className="header-inner"><Brand />
      <button className="menu-toggle" aria-expanded={open} aria-controls="site-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(!open)}><span className="material-symbols-outlined" aria-hidden="true">{open ? 'close' : 'menu'}</span></button>
      <nav id="site-navigation" className={open ? 'site-nav is-open' : 'site-nav'} aria-label="Main navigation">
        {links.map(([path, label]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)}>{label}</NavLink>)}
        <NavLink to="/account" onClick={() => setOpen(false)}>{session ? 'Account' : 'Sign in'}</NavLink>
        <NavLink to="/settings" onClick={() => setOpen(false)} className="settings-link" aria-label="Settings"><span className="material-symbols-outlined" aria-hidden="true">settings</span><span className="mobile-only">Settings</span></NavLink>
      </nav>
      <Link to="/contact" className="header-feedback" aria-label="Contact and feedback" title="Contact and feedback"><span className="material-symbols-outlined" aria-hidden="true">help_outline</span></Link>
      <Link to="/add" aria-label={location.pathname === '/add' ? 'Import audio' : 'Start listening'} onClick={() => setOpen(false)} className="button button-small header-action"><span className="header-action-label">{location.pathname === '/add' ? 'Import audio' : 'Start listening'}</span><span aria-hidden="true">↗</span></Link>
    </div>
  </header>;
}
