
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

console.log("[ECHO_BOOT] Initializing AI Engine...");

/**
 * Simplified PWA registration using relative paths.
 * Standard relative registration is more robust in sandboxed environments
 * where window.location properties might behave unexpectedly.
 */
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      console.log('[PWA] Registering Service Worker...');
      // Use relative path which is automatically resolved against the current origin/base
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      console.log('[PWA] Registration successful. Scope:', registration.scope);
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                console.log('[PWA] New version available, please refresh.');
              } else {
                console.log('[PWA] Content is cached for offline use.');
              }
            }
          };
        }
      };
    } catch (err) {
      console.error('[PWA] Registration failed:', err);
    }
  }
};

registerServiceWorker();

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
