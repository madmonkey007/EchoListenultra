export const EVENT_NAMES = ['sample_play', 'audio_selected', 'import_complete', 'playback_started', 'transcription_failed', 'feedback_opened'] as const;
export type EventName = typeof EVENT_NAMES[number];
export const EVENT_VERSION = '0.1.0';
export const MAX_EVENT_BYTES = 512;
export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value);
}
export function validateEvent(value: unknown): value is { event: EventName; version: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const payload = value as Record<string, unknown>;
  return keys.length === 2 && keys.includes('event') && keys.includes('version') && isEventName(payload.event) && payload.version === EVENT_VERSION;
}
