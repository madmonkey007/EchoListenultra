import { EVENT_VERSION, isEventName, type EventName } from './event-validation';

// Call only for deliberate product events. No user or learning content is accepted.
export function trackEvent(event: EventName): void {
  if (!isEventName(event) || typeof window === 'undefined') return;
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, version: EVENT_VERSION }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {});
  } catch { /* Analytics must never interrupt learning. */ }
}
