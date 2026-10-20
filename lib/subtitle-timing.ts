import type { AudioSegment, WordTiming } from '../types.ts';

/** Only complete provider timestamps may drive word highlighting. Never infer timing from text. */
export function getSynchronizedWords(segment: AudioSegment): WordTiming[] | null {
  const words = segment.words;
  if (!words?.length) return null;
  const tokens = segment.text.trim().split(/\s+/);
  if (tokens.length !== words.length) return null;
  let previousEnd = segment.startTime;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (!word || typeof word.word !== 'string' || word.word !== tokens[index]
      || !Number.isFinite(word.start) || !Number.isFinite(word.end)
      || word.start < previousEnd - .001 || word.end <= word.start
      || word.start < segment.startTime - .001 || word.end > segment.endTime + .001) return null;
    previousEnd = word.end;
  }
  return words;
}

/** Media time is already affected by playbackRate. No extra speed multiplier or look-ahead. */
export function getActiveWordIndex(words: WordTiming[], mediaTime: number): number {
  let low = 0;
  let high = words.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const word = words[mid];
    if (mediaTime < word.start) high = mid - 1;
    else if (mediaTime >= word.end) low = mid + 1;
    else return mid;
  }
  return -1;
}

export function getActiveSegmentIndex(segments: Pick<AudioSegment, 'startTime' | 'endTime'>[], mediaTime: number): number {
  return segments.findIndex(segment => mediaTime >= segment.startTime && mediaTime < segment.endTime);
}
