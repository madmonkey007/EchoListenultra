export interface ReelCue { start: number; end: number; text: string }
export interface ReelTranscript { status: 'transcribed' | 'no_speech_detected'; text: string; srt: string; cues: ReelCue[] }
const messages: Record<string, string> = {
  payload_too_large: 'This audio file is large and may exceed the duration limit. Try a smaller Reel.',
  too_long: 'This Reel exceeds the current 60-second limit. Try a shorter Reel.',
  no_audio: 'No audio could be retrieved from this Reel. Try another public Reel.',
  fetch_failed: 'This Reel could not be retrieved. It may be unavailable or restricted. Try another public Reel.',
  timeout: 'This request took too long. Please try again later.',
  invalid_url: 'Paste a public Instagram Reel URL.',
};
export async function requestReelTranscript(url: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<ReelTranscript> {
  const response = await fetcher('/api/reel-transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal });
  let data: any;
  try { data = await response.json(); } catch { throw new Error('The service returned an unreadable response. Please try again.'); }
  if (!response.ok) throw new Error(messages[data.error] || 'Transcription could not finish. Please try another public Reel.');
  if (!['transcribed', 'no_speech_detected'].includes(data.status) || typeof data.text !== 'string' || typeof data.srt !== 'string' || !Array.isArray(data.cues)
      || !data.cues.every((cue: any) => typeof cue.text === 'string' && Number.isFinite(cue.start) && Number.isFinite(cue.end))) {
    throw new Error('The transcription response is incomplete. Please try again.');
  }
  return data;
}
