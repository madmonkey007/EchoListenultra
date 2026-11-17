import { getActiveSegmentIndex } from './subtitle-timing.ts';
import type { AudioSegment } from '../types.ts';
import type { ReelCue, ReelTranscript } from './reel-client.ts';
export type TranscriptFormat = 'srt' | 'md' | 'txt';

// Display times are whole seconds: nobody locates a moment in a Reel to a
// thousandth of a second, and the millisecond tail filled the gutter. Ends
// round rather than truncate, so consecutive passages meet. SRT export keeps
// the full server-side milliseconds; this formatter is never applied to it.
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function transcriptExport(result: ReelTranscript, format: TranscriptFormat) {
  if (format === 'srt') return { filename: 'reel-transcript.srt', mime: 'application/x-subrip;charset=utf-8', content: result.srt };
  if (format === 'md') {
    // Markdown is structured: one heading, one timestamped passage per block,
    // so the file renders as a readable document instead of being plain text
    // with a .md extension.
    const content = `# Reel transcript\n\n${result.cues.map(cue => `**[${formatTimestamp(cue.start)}]** ${cue.text}`).join('\n\n')}\n`;
    return { filename: 'reel-transcript.md', mime: 'text/markdown;charset=utf-8', content };
  }
  return { filename: 'reel-transcript.txt', mime: 'text/plain;charset=utf-8', content: result.text };
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
