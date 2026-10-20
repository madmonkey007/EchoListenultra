const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
type Job = { id: string; status: 'queued' | 'processing' | 'ready' | 'failed'; title?: string; error?: string };
async function readJob(response: Response, expected?: string): Promise<Job> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : 'Video import failed. Please retry later.');
  if (!data || !/^[a-f0-9]{32}$/.test(data.id) || (expected && data.id !== expected) || !['queued', 'processing', 'ready', 'failed'].includes(data.status)) throw new Error('The video service returned an invalid response.');
  return data;
}
export async function importVideoAudio(url: string, signal: AbortSignal, update: (status: string) => void, pollMs = 1500): Promise<File> {
  signal.throwIfAborted();
  // Bound stalled requests and the whole job; cancelling stops polling, while worker cleanup expires temporary audio.
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]);
  let job = await readJob(await fetch('/api/video-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: bounded }));
  while (job.status === 'queued' || job.status === 'processing') {
    update(job.status === 'queued' ? 'Waiting to extract audio…' : 'Extracting audio…');
    await new Promise<void>((resolve, reject) => {
      bounded.throwIfAborted();
      const abort = () => { clearTimeout(timer); reject(bounded.reason); };
      const timer = setTimeout(() => { bounded.removeEventListener('abort', abort); resolve(); }, pollMs);
      bounded.addEventListener('abort', abort, { once: true });
    });
    job = await readJob(await fetch(`/api/video-import?id=${job.id}`, { signal: bounded, cache: 'no-store' }), job.id);
  }
  if (job.status === 'failed') throw new Error(job.error || 'Could not extract audio. Try a public video or upload a file.');
  update('Loading extracted audio…');
  const response = await fetch(`/api/video-import?id=${job.id}&audio=1`, { signal: bounded, cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load extracted audio. Please retry.');
  if (!/^audio\/mpeg(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('The video service did not return MP3 audio.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The video service returned no audio.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error('Extracted audio exceeds the import limit.');
      chunks.push(chunk.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (!size) throw new Error('The video service returned empty audio.');
  const title = (typeof job.title === 'string' ? job.title : 'Video audio').replace(/[\\/<>:"|?*\x00-\x1f]/g, '_').slice(0, 120).trim() || 'Video audio';
  return new File(chunks as BlobPart[], `${title}.mp3`, { type: 'audio/mpeg' });
}
