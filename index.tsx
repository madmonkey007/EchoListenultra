/// <reference types="vite/client" />

import './website.css';
import './tailwind.css';
import './redesign.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initIconLayer } from './lib/icons.ts';

// Development uses Vite's live assets; cache only production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch(error => console.warn('Offline support could not be enabled.', error));
  });
}

const boot = () => {
  const container = document.getElementById('root');
  if (container) {
    try {
      const root = createRoot(container);
      root.render(<App />);
      initIconLayer();
      console.log("[ECHO_BOOT] Success: UI Core online.");
    } catch (err) {
      console.error("[ECHO_BOOT] Render Critical Failure:", err);
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
