import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AudioSession } from '../types.ts';

export default function HomeView({ sessions, savedWordCount = 0 }: { sessions: AudioSession[]; savedWordCount?: number }) {
  const [query, setQuery] = useState('');
  const filtered = sessions.filter(s => `${s.title} ${s.subtitle}`.toLowerCase().includes(query.toLowerCase()));
  const personal = sessions.filter(s => s.id !== 'sample-1');
  return <div className="library-page site-container">
    <div className="page-heading heading-with-action"><div><h1>Your listening space.</h1><p>Pick up a lesson, or bring something new.</p></div><Link to="/add" className="button"><span className="material-symbols-outlined" aria-hidden="true">add</span>Import audio</Link></div>
    <div className="library-summary"><span>{personal.length} imported {personal.length === 1 ? 'lesson' : 'lessons'}</span><span>{savedWordCount} saved {savedWordCount === 1 ? 'word' : 'words'}</span><span>Saved in this browser</span></div>
    <div className="library-toolbar"><h2>My audio</h2><label className="search-field"><span className="material-symbols-outlined" aria-hidden="true">search</span><input type="search" placeholder="Find a lesson…" aria-label="Search audio library" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    {filtered.length ? <div className="lesson-grid">{filtered.map(session => <Link className={`lesson ${session.id === 'sample-1' ? 'sample-lesson' : ''}`} to={`/player/${session.id}`} key={session.id}><div className="lesson-art"><span className="material-symbols-outlined" aria-hidden="true">{session.id === 'sample-1' ? 'graphic_eq' : 'headphones'}</span><span>{session.id === 'sample-1' ? 'TRY A SAMPLE' : 'YOUR AUDIO'}</span></div><div className="lesson-info"><span className="lesson-meta">{Math.floor(session.duration / 60)}:{Math.floor(session.duration % 60).toString().padStart(2,'0')} · {session.segments.length} sections</span><h3>{session.title}</h3><p>{session.id === 'sample-1' ? 'A guided example with a synthetic voice and transcript.' : session.subtitle}</p><span className="lesson-open">{session.id === 'sample-1' ? 'Explore the player' : 'Open lesson'} <span aria-hidden="true">→</span></span></div></Link>)}</div> : <div className="empty-state"><span className="material-symbols-outlined" aria-hidden="true">headphones</span><h2>{query ? 'No matching lessons' : 'No audio yet'}</h2><p>{query ? 'Try another title or clear your search.' : 'Import your first audio file to start practicing.'}</p>{query ? <button className="button button-secondary" onClick={() => setQuery('')}>Clear search</button> : <Link to="/add" className="button">Import audio</Link>}</div>}
    <aside className="library-note"><span className="material-symbols-outlined" aria-hidden="true">info</span><p>This library belongs to this browser. Keep your original files: clearing browser data removes saved lessons. <Link to="/help#privacy">Learn more</Link></p></aside>
  </div>;
}
