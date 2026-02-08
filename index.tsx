import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

console.log("[ECHO_BOOT] Initializing AI Engine...");

// 使用相对路径注册 SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(registration => {
      console.log('[PWA] Engine registered:', registration.scope);
    }).catch(err => {
      console.log('[PWA] Engine failed to start:', err);
    });
  });
}

const boot = () => {
  const container = document.getElementById('root');
  if (container) {
    try {
      const root = createRoot(container);
      root.render(<App />);
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