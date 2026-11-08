import { getActiveSegmentIndex } from './subtitle-timing.ts';
import type { AudioSegment } from '../types.ts';
import type { ReelCue, ReelTranscript } from './reel-client.ts';
export type TranscriptFormat = 'srt' | 'md' | 'txt';
export function transcriptExport(result: ReelTranscript, format: TranscriptFormat) {
  if (format === 'srt') return { filename: 'reel-transcript.srt', mime: 'application/x-subrip;charset=utf-8', content: result.srt };
  return { filename: `reel-transcript.${format}`, mime: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8', content: result.text };
}
export function activeCueIndex(cues: ReelCue[], time: number): number {
  return getActiveSegmentIndex(cues.map(cue => ({ startTime: cue.start, endTime: cue.end })), time);
}
export function resultAudioBlob(audio: { base64: string; mime_type: string }): Blob {
  const bytes = Uint8Array.from(atob(audio.base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: audio.mime_type });
}

/** Adapt the result shape only. Existing validation decides whether word timing is complete. */
export function resultSegments(result: ReelTranscript): AudioSegment[] {
  return result.cues.map((cue, index) => ({
    id: `reel-cue-${index}`, startTime: cue.start, endTime: cue.end, text: cue.text,
    words: result.words?.filter(word => word.start >= cue.start - .001 && word.end <= cue.end + .001)
      .map(word => ({ word: word.text, start: word.start, end: word.end })),
  }));
}
