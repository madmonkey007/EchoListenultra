export interface ReelCue { start: number; end: number; text: string }
export interface ReelTranscript { words?: { text: string; start: number; end: number }[]; audio?: { base64: string; mime_type: string }; status: 'transcribed' | 'no_speech_detected'; text: string; srt: string; cues: ReelCue[] }
import { MAX_AUDIO_SECONDS, limitMinutes } from './transcription-limit.ts';
export function reelErrorMessage(data: { error?: string; limit_seconds?: number; duration_seconds?: number }): string {
  const limit = Number.isFinite(data.limit_seconds) && data.limit_seconds! > 0 ? data.limit_seconds! : MAX_AUDIO_SECONDS;
  if (data.error === 'too_long') {
    const seconds = data.duration_seconds;
    const duration = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : null;
    return (duration ? `This Reel is ${duration} long — longer than the ${limitMinutes(limit)}-minute limit.`
      : `This Reel is longer than our ${limitMinutes(limit)}-minute limit.`) + '\nTry a shorter Reel.';
  }
  if (['invalid_url', 'private_or_unavailable', 'no_audio', 'fetch_blocked'].includes(data.error || ''))
    return 'This link is invalid or the Reel is not publicly accessible.\nTry a public Instagram Reel link.';
  return 'There is a problem on our side, not with your link.\nPlease try again later.';
}
export interface ReelProgress {
  stage: 'fetching_audio' | 'transcribing' | 'formatting' | 'complete';
  completed: number;
  total: 3;
}
export const INITIAL_REEL_PROGRESS: ReelProgress = { stage: 'fetching_audio', completed: 0, total: 3 };
export async function requestReelTranscript(url: string, signal?: AbortSignal, fetcher: typeof fetch = fetch, onLimit?: (seconds: number) => void, onProgress?: (progress: ReelProgress) => void): Promise<ReelTranscript> {
  const serviceError = () => new Error(reelErrorMessage({ error: 'upstream' }));
  function finish(data: any, status: number): ReelTranscript {
    if (!data || typeof data !== 'object') throw serviceError();
    if (Number.isFinite(data.limit_seconds) && data.limit_seconds > 0) onLimit?.(data.limit_seconds);
    if (status < 200 || status >= 300) throw new Error(reelErrorMessage(data));
    if (!['transcribed', 'no_speech_detected'].includes(data.status) || typeof data.text !== 'string' || typeof data.srt !== 'string' || !Array.isArray(data.cues)
        || !data.cues.every((cue: any) => typeof cue.text === 'string' && Number.isFinite(cue.start) && Number.isFinite(cue.end))) throw serviceError();
    onProgress?.({ stage: 'complete', completed: 3, total: 3 });
    return data;
  }
  let response: Response;
  try { response = await fetcher('/api/reel-transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(onProgress ? { Accept: 'application/x-ndjson' } : {}) }, body: JSON.stringify({ url }), signal }); }
  catch (failure) { if (signal?.aborted) throw failure; throw serviceError(); }
  if (response.headers?.get('Content-Type')?.includes('application/x-ndjson')) {
    const reader = response.body?.getReader();
    if (!reader) throw serviceError();
    const decoder = new TextDecoder();
    let buffer = '', lastCompleted = -1;
    function frame(line: string): ReelTranscript | undefined {
      let event: any;
      try { event = JSON.parse(line); } catch { throw serviceError(); }
      if (!event || typeof event !== 'object') throw serviceError();
      if (event.type === 'progress') {
        const stages = ['fetching_audio', 'transcribing', 'formatting'];
        if (event.total !== 3 || !Number.isInteger(event.completed) || event.completed < 0 || event.completed > 2
            || stages[event.completed] !== event.stage || event.completed < lastCompleted) throw serviceError();
        lastCompleted = event.completed;
        if (Number.isFinite(event.limit_seconds) && event.limit_seconds > 0) onLimit?.(event.limit_seconds);
        onProgress?.({ stage: event.stage, completed: event.completed, total: 3 });
      } else if (event.type === 'result' && event.status_code === 200) {
        return finish(event.data, 200);
      } else if (event.type === 'error' && Number.isInteger(event.status_code) && event.status_code >= 400 && event.status_code <= 599) {
        return finish(event.data, event.status_code);
      } else throw serviceError();
    }
    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await reader.read(); } catch (failure) { if (signal?.aborted) throw failure; throw serviceError(); }
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = buffer.split('\n'); buffer = lines.pop()!;
        for (const line of lines) { if (line.trim()) { const result = frame(line); if (result) return result; } }
        if (chunk.done) {
          if (buffer.trim()) { const result = frame(buffer); if (result) return result; }
          throw serviceError();
        }
      }
    } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  let data: any;
  try { data = await response.json(); } catch { throw serviceError(); }
  return finish(data, response.ok ? 200 : response.status);
}
