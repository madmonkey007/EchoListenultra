import { AIProviderConfig, AudioSegment, SlicingMethod, Type, WordTiming } from '../types.ts';

// Providers return absolute seconds from the beginning of the original audio.
export function sanitizeSegments(input: unknown[], duration: number): AudioSegment[] {
  const result: AudioSegment[] = [];
  const ordered = input.filter((s: any) => s && Number.isFinite(s.startTime) && Number.isFinite(s.endTime))
    .sort((a: any, b: any) => a.startTime - b.startTime);
  for (const raw of ordered as any[]) {
    const startTime = Math.max(0, raw.startTime);
    const endTime = Math.min(duration, raw.endTime);
    if (endTime <= startTime || startTime < (result.at(-1)?.endTime ?? 0) || typeof raw.text !== 'string' || !raw.text.trim()) continue;
    const text = raw.text.trim();
    const tokens = text.split(/\s+/);
    let previousEnd = startTime;
    const valid = Array.isArray(raw.words) && raw.words.length === tokens.length && raw.words.every((w: any, i: number) => {
      if (!w || w.word !== tokens[i] || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < previousEnd || w.end <= w.start || w.end > endTime) return false;
      previousEnd = w.end;
      return true;
    });
    result.push({ id: `seg-${result.length}`, startTime, endTime, text,
      ...(Number.isInteger(raw.speaker) ? { speaker: raw.speaker } : {}),
      ...(valid ? { words: raw.words.map((w: WordTiming) => ({ word: w.word, start: w.start, end: w.end })) } : {}) });
  }
  return result;
}

// Sentence punctuation is supplied by transcription; do not invent boundaries from time.
function endsSentence(token: string): boolean {
  const bare = token.replace(/["'”’»）)\]]+$/u, '');
  if (!/[.!?。！？]$/u.test(bare)) return false;
  if (/^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.$/i.test(bare) || /^(?:[A-Za-z]\.)+$/u.test(bare)) return false;
  return true;
}

export function groupDeepgramWords(words: any[], method: SlicingMethod, ruleValue: number, duration: number): AudioSegment[] {
  const segments: AudioSegment[] = [];
  let current: any[] = [];
  let changes = 0;
  let sentences = 0;
  const flush = () => {
    if (!current.length) return;
    const timed = current.map(w => ({ word: w.punctuated_word || w.word, start: w.start, end: w.end }));
    segments.push({ id: `seg-${segments.length}`, startTime: current[0].start, endTime: current.at(-1).end,
      text: timed.map(w => w.word).join(' '), speaker: (current.at(-1).speaker ?? 0) + 1, words: timed });
    current = [];
    changes = 0;
    sentences = 0;
  };
  for (const word of words) {
    if (!word || typeof (word.punctuated_word || word.word) !== 'string') continue;
    const changed = current.length > 0 && word.speaker !== current.at(-1).speaker;
    if (changed) changes++;
    const split = current.length > 0 && (method === SlicingMethod.DURATION ? word.end - current[0].start >= ruleValue * 60 : method === SlicingMethod.TURNS && changes >= ruleValue);
    if (split) flush();
    current.push(word);
    if (method === SlicingMethod.SENTENCE && endsSentence(word.punctuated_word || word.word)) {
      sentences++;
      if (sentences >= ruleValue) flush();
    }
  }
  flush();
  return sanitizeSegments(segments, duration);
}

export function groupSentenceSegments(input: unknown[], perSegment: number, duration: number): AudioSegment[] {
  const sentences: AudioSegment[] = [];
  for (const segment of sanitizeSegments(input, duration)) {
    if (segment.words) {
      sentences.push(...groupDeepgramWords(segment.words.map(w => ({ ...w, speaker: (segment.speaker ?? 1) - 1 })), SlicingMethod.SENTENCE, 1, duration));
    } else {
      // The Gemini prompt requests one sentence per source segment. Without word times,
      // a longer paragraph cannot safely be split into smaller intervals.
      const tokens = segment.text.split(/\s+/);
      const completed = tokens.filter(endsSentence).length;
      const count = completed + (endsSentence(tokens.at(-1)!) ? 0 : 1);
      if (count > 1) throw new Error('Sentence splitting needs sentence-level timestamps. Try Deepgram or choose time splitting.');
      sentences.push(segment);
    }
  }
  const grouped: AudioSegment[] = [];
  for (let start = 0; start < sentences.length; start += perSegment) {
    const batch = sentences.slice(start, start + perSegment);
    grouped.push({ id: `seg-${grouped.length}`, startTime: batch[0].startTime, endTime: batch.at(-1)!.endTime,
      text: batch.map(s => s.text).join(' '), speaker: batch[0].speaker,
      ...(batch.every(s => s.words) ? { words: batch.flatMap(s => s.words!) } : {}) });
  }
  return grouped;
}

const readBase64 = (audio: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error('Could not read audio for transcription.'));
  reader.readAsDataURL(audio);
});

export async function transcribeAudio(audio: Blob, config: AIProviderConfig, method: SlicingMethod, ruleValue: number, duration: number): Promise<AudioSegment[]> {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(ruleValue) || ruleValue < 1) throw new Error('Audio duration and segment size must be positive.');
  if (method === SlicingMethod.SENTENCE && (!Number.isInteger(ruleValue) || ruleValue > 3)) throw new Error('Choose 1, 2 or 3 sentences per segment.');
  if (config.provider !== 'deepgram' && config.provider !== 'gemini') throw new Error('Choose Deepgram or Gemini in transcription settings.');
  const key = (config.provider === 'deepgram' ? config.deepgramApiKey : config.geminiApiKey)?.trim();
  if (!key) throw new Error('Add your transcription API key in Settings first.');
  let segments: AudioSegment[];
  if (config.provider === 'deepgram') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const url = new URL('https://api.deepgram.com/v1/listen');
      url.search = new URLSearchParams({ model: 'nova-3', smart_format: 'true', diarize: 'true', language: config.deepgramLanguage || 'en' }).toString();
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Token ${key}` }, body: audio, signal: controller.signal });
      if (!response.ok) throw new Error(`Deepgram transcription failed (HTTP ${response.status}). Check your key and provider account.`);
      const data = await response.json();
      const words = data.results?.channels?.[0]?.alternatives?.[0]?.words;
      segments = groupDeepgramWords(Array.isArray(words) ? words : [], method, ruleValue, duration);
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Transcription timed out after two minutes. Try a shorter audio file.');
      if (error instanceof TypeError) throw new Error('Could not reach Deepgram. Check your connection and try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  } else {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 120000 } });
    const prompt = `Transcribe this original audio. ${method === SlicingMethod.SENTENCE ? 'Return exactly ONE sentence per segment, with its real start/end times. Do not combine sentences. Keep a final incomplete phrase as its own segment.' : method === SlicingMethod.TURNS ? `Start a new turn when the speaker changes; group ${ruleValue} speaker turn(s) per segment.` : `Group into approximately ${ruleValue}-minute segments at word boundaries.`}
Return startTime/endTime and each word's start/end in ABSOLUTE SECONDS from the beginning of the entire original audio, including initial silence. Never reset times per segment. Include every spoken word. Each words item must match exactly one whitespace-separated token in text, including punctuation. Only provide words when real word-level timing is available; omit words rather than estimate by character count. Segments and words must be chronological, non-overlapping and within ${duration} seconds.`;
    const result = await ai.models.generateContent({
      model: config.geminiModel || 'gemini-3-flash-preview',
      contents: { parts: [{ inlineData: { mimeType: audio.type || 'audio/mpeg', data: await readBase64(audio) } }, { text: prompt }] },
      config: { responseMimeType: 'application/json', responseSchema: {
        type: Type.OBJECT, properties: { segments: { type: Type.ARRAY, items: {
          type: Type.OBJECT, properties: { startTime: { type: Type.NUMBER }, endTime: { type: Type.NUMBER }, text: { type: Type.STRING }, speaker: { type: Type.INTEGER },
            words: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { word: { type: Type.STRING }, start: { type: Type.NUMBER }, end: { type: Type.NUMBER } }, required: ['word', 'start', 'end'] } } },
          required: ['startTime', 'endTime', 'text', 'speaker'] } } }, required: ['segments'] } }
    });
    const data = JSON.parse(result.text || '{}');
    const returned = Array.isArray(data.segments) ? data.segments : [];
    segments = method === SlicingMethod.SENTENCE ? groupSentenceSegments(returned, ruleValue, duration) : sanitizeSegments(returned, duration);
  }
  if (!segments.length) throw new Error('No usable speech transcript was returned. Try another recording or provider.');
  return segments;
}
