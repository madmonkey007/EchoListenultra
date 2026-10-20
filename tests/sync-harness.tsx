// Manual browser regression surface, served by Vite dev only; not part of the release entry.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PlayerView from '../views/PlayerView.tsx';
import AddSessionView from '../views/AddSessionView.tsx';
import HomeView from '../views/HomeView.tsx';
import fixture from './fixtures/session.json';
import type { AudioSession, AIProviderConfig } from '../types.ts';
let capturedAudio: HTMLAudioElement | undefined;
const NativeAudio = window.Audio;
window.Audio = function(src?: string) { capturedAudio = new NativeAudio(src); return capturedAudio; } as unknown as typeof Audio;
// Explicitly intercept the provider in this development-only fixture: no paid API call occurs.
const probeOptions = new URLSearchParams(window.location.search);
const nativeFetch = window.fetch;
window.fetch = async (input, init) => {
 const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
 if (url.hostname === 'api.deepgram.com') {
  const words = probeOptions.has('invalid') ? [] : fixture.segments.flatMap((segment,index) => (segment.words || []).map(w => ({word:w.word,punctuated_word:w.word,start:w.start,end:w.end,speaker:index})));
  return new Response(JSON.stringify({results:{channels:[{alternatives:[{words}]}]}}), {status:200,headers:{'Content-Type':'application/json'}});
 }
 return nativeFetch(input,init);
};
const mockConfig: AIProviderConfig = {provider:'deepgram',deepgramApiKey:'test-only-not-real',deepgramLanguage:'en',geminiModel:'',customEndpoint:'',customApiKey:'',customModelId:'',theme:'dark'};
function Harness() {
 const [session,setSession] = useState<AudioSession>(() => ({...fixture,segments:fixture.segments.map(s=>({...s,words:probeOptions.has('legacy')?undefined:s.words}))}) as AudioSession);
 const [clock,setClock] = useState('Loading');
 useEffect(() => { const timer=setInterval(()=> { const audio=capturedAudio; if(audio)setClock(`Media time: ${audio.currentTime.toFixed(3)} | rate: ${audio.playbackRate} | paused: ${audio.paused}`); },50); return ()=>clearInterval(timer); },[]);
 return <><output style={{display:'block',padding:10,fontFamily:'monospace'}} aria-label="Audio clock">{clock}</output><div className={probeOptions.has('import') ? 'tool-page' : ''} style={{height:'calc(100dvh - 50px)'}}><MemoryRouter initialEntries={[probeOptions.has('import') ? '/add' : '/player/sync-fixture']}><Routes><Route path="/add" element={<AddSessionView onAdd={setSession} apiConfig={mockConfig} />} /><Route path="/library" element={<HomeView sessions={[session]} />} /><Route path="/player/:id" element={<PlayerView sessions={[session]} savedWords={[]} toggleWord={()=>{}} apiConfig={mockConfig} onUpdateSession={(_id,updates)=>setSession(previous=>({...previous,...updates}))} />} /></Routes></MemoryRouter></div></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
