import type { AudioSession } from '../types.ts';

export const SAMPLE_SESSION: AudioSession = {
  "id": "sample-1",
  "title": "A little practice, every day",
  "subtitle": "Guided listening \u00b7 Synthetic voice sample",
  "coverUrl": "/demo/cover.svg",
  "audioUrl": "/demo/sample.wav",
  "segments": [
    {
      "id": "s1",
      "startTime": 0,
      "endTime": 3.2297,
      "text": "You don't need to understand every word on the first listen.",
      "speaker": 1
    },
    {
      "id": "s2",
      "startTime": 3.5797,
      "endTime": 8.9271,
      "text": "Choose a short section. Listen once for the meaning, then listen again for the details.",
      "speaker": 1
    },
    {
      "id": "s3",
      "startTime": 9.2771,
      "endTime": 15.198,
      "text": "When a phrase feels difficult, slow it down and repeat it. Let your ears get used to the rhythm.",
      "speaker": 1
    },
    {
      "id": "s4",
      "startTime": 15.548,
      "endTime": 20.9936,
      "text": "Save a new word with its sentence. Come back tomorrow, and notice what sounds familiar.",
      "speaker": 1
    }
  ],
  "duration": 20.9936,
  "lastPlayed": "Example",
  "status": "ready"
};

export function restoreSessions(saved: string | null): AudioSession[] {
  try {
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [SAMPLE_SESSION];
    const sessions = parsed.filter((s: any) => s && typeof s.id === 'string' && Array.isArray(s.segments));
    const updated = sessions.map((s: AudioSession) => s.id === 'sample-1' ? SAMPLE_SESSION : s);
    return updated.some((s: AudioSession) => s.id === 'sample-1') ? updated : [...updated, SAMPLE_SESSION];
  } catch { return [SAMPLE_SESSION]; }
}
