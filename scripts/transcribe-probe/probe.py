#!/usr/bin/env python3
"""Isolated CPU transcription experiment. Never imports application code."""
import os
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('HF_HUB_DOWNLOAD_TIMEOUT', '60')

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import re
import subprocess
import threading
import time
import wave

ROOT = Path(__file__).resolve().parent


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def stamp(seconds):
    ms = max(0, round(seconds * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


def sentence_cues(segments):
    """Join across model windows; split only at actual timestamped word boundaries."""
    cues, pending = [], []
    for seg in segments:
        words = seg.get('words') or []
        if not words:
            if pending:
                cues.append(dict(start=pending[0]['start'], end=pending[-1]['end'],
                                 text=''.join(w['word'] for w in pending).strip(), boundary='missing_words'))
                pending = []
            if seg['text'].strip():
                cues.append(dict(start=seg['start'], end=seg['end'], text=seg['text'].strip(),
                                 boundary='model_segment_fallback'))
            continue
        for w in words:
            pending.append(w)
            abbreviation = w['word'].strip().lower() in {
                'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'st.', 'vs.', 'e.g.', 'i.e.'}
            if not abbreviation and re.search(r'[.!?][\"\u201d\u2019\)]?$', w['word'].strip()):
                cues.append(dict(start=pending[0]['start'], end=w['end'],
                                 text=''.join(x['word'] for x in pending).strip(), boundary='sentence'))
                pending = []
    if pending:
        # Only unpunctuated trailing text uses a duration fallback, explicitly flagged.
        chunks, part = [], []
        for w in pending:
            if part and w['end'] - part[0]['start'] > 12:
                chunks.append(part)
                part = []
            part.append(w)
        if part:
            chunks.append(part)
        for part in chunks:
            cues.append(dict(start=part[0]['start'], end=part[-1]['end'],
                             text=''.join(w['word'] for w in part).strip(),
                             boundary='forced_duration' if len(chunks)>1 else 'end_of_audio'))
    fixed, zero = [], []
    for c in cues:
        if not c['text']:
            continue
        if c['end'] <= c['start']:
            zero.append(c)
            continue
        if zero:
            c = dict(c, start=min(c['start'], zero[0]['start']),
                     text=' '.join(x['text'] for x in zero) + ' ' + c['text'],
                     boundary='merged_zero_duration')
            zero = []
        fixed.append(c)
    if zero and fixed:
        fixed[-1] = dict(fixed[-1], text=fixed[-1]['text'] + ' ' + ' '.join(x['text'] for x in zero),
                         end=max(fixed[-1]['end'], zero[-1]['end']), boundary='merged_zero_duration')
    return fixed


def srt_text(cues):
    return ''.join(f"{i}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}\n\n"
                   for i, c in enumerate(cues, 1))


def overlap(start, end, intervals):
    return sum(max(0, min(end, b) - max(start, a)) for a, b in intervals)


def suspicious_segments(segments, silence, music):
    flags = []
    for s in segments:
        reasons = []
        length = max(.001, s['end'] - s['start'])
        if overlap(s['start'], s['end'], silence) / length >= .5:
            reasons.append('silence_overlap')
        if overlap(s['start'], s['end'], music) / length >= .5:
            reasons.append('declared_music_interval')
        if s.get('no_speech_prob', 0) > .6:
            reasons.append('high_no_speech_probability')
        if s.get('avg_logprob', 0) < -1:
            reasons.append('low_log_probability')
        if s.get('compression_ratio', 0) > 2.4:
            reasons.append('repetition_compression')
        if reasons:
            flags.append(dict(start=s['start'], end=s['end'], text=s['text'],
                              reasons=reasons, status='needs_listening'))
    return flags


def detect_silence(path, duration):
    import imageio_ffmpeg
    threshold = silence_threshold(path)
    r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-i', str(path),
                        '-af', f'silencedetect=noise={threshold}dB:d=0.5', '-f', 'null', '-'],
                       capture_output=True, text=True, timeout=60, check=True)
    intervals, start = [], None
    for line in r.stderr.splitlines():
        a = re.search(r'silence_start: ([\d.]+)', line)
        b = re.search(r'silence_end: ([\d.]+)', line)
        if a:
            start = float(a[1])
        if b and start is not None:
            intervals.append([start, float(b[1])])
            start = None
    if start is not None:
        intervals.append([start, duration])
    return intervals


def silence_threshold(path):
    # Input manifest is PCM16 WAV; do not label quiet source speech as silence.
    import math
    import numpy as np
    with wave.open(str(path)) as w:
        if w.getsampwidth() != 2:
            raise ValueError('Silence analysis requires PCM16 WAV')
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32)
    peak = float(np.max(np.abs(audio))) / 32768 if audio.size else 0
    return max(-90, min(-40, 20 * math.log10(max(peak, 1e-9)) - 35))


class PeakRSS:
    """50ms samples of process RSS, including the resident model (not tracemalloc)."""
    def __enter__(self):
        import psutil
        self.process = psutil.Process()
        self.baseline = self.peak = self.process.memory_info().rss
        self.stop = threading.Event()
        def monitor():
            while not self.stop.wait(.05):
                self.peak = max(self.peak, self.process.memory_info().rss)
        self.thread = threading.Thread(target=monitor, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.peak = max(self.peak, self.process.memory_info().rss)
        self.stop.set()
        self.thread.join()


def run_case(model, sample, args, round_name):
    folder = args.output / args.model / round_name / sample['id']
    folder.mkdir(parents=True, exist_ok=True)
    path = Path(sample['audio_path'])
    if hashlib.sha256(path.read_bytes()).hexdigest() != sample['sha256']:
        raise ValueError(f'Input changed: {path}')
    if (folder / 'metrics.json').exists():
        old = json.loads((folder / 'metrics.json').read_text())
        if (old['audio_sha256'] != sample['sha256'] or old['model_size'] != args.model
                or old['cpu_threads'] != args.threads or old['source_window'] != (
                    sample.get('quality_window') if round_name == 'quality' else None)
                or old['options'] != dict(beam_size=5, language=None, task='transcribe', temperature=0,
                    word_timestamps=True, vad_filter=round_name == 'quality', condition_on_previous_text=False)):
            raise ValueError('Existing metrics use a different input/configuration; use a new output directory')
        print('Already complete, input/configuration verified:', folder, flush=True)
        return
    original_path = path
    window = sample.get('quality_window') if round_name == 'quality' else None
    if window:
        path = folder / 'quality-input.wav'
        with wave.open(str(original_path)) as source:
            rate = source.getframerate()
            source.setpos(round(window[0] * rate))
            frames = source.readframes(round((window[1] - window[0]) * rate))
            with wave.open(str(path), 'wb') as target:
                target.setparams(source.getparams())
                target.writeframes(frames)
    with wave.open(str(path)) as w:
        duration = w.getnframes() / w.getframerate()
    silence = detect_silence(path, duration)
    # Round 2 disables VAD to expose the model's behavior on music/silence.
    vad = round_name == 'quality'
    options = dict(beam_size=5, language=None, task='transcribe', temperature=0,
                   word_timestamps=True, vad_filter=vad, condition_on_previous_text=False)
    with PeakRSS() as rss:
        started = time.perf_counter()
        iterator, info = model.transcribe(str(path), **options)
        raw = [asdict(s) for s in iterator]  # generator consumption is inside timer
        elapsed = time.perf_counter() - started
    cues = sentence_cues(raw)
    text = ' '.join(s['text'].strip() for s in raw)
    (folder / 'transcript.txt').write_text(text + ('\n' if text else ''), encoding='utf-8')
    (folder / 'transcript.srt').write_text(srt_text(cues), encoding='utf-8')
    save(folder / 'segments.json', [dict(start=c['start'], end=c['end'], text=c['text']) for c in cues])
    save(folder / 'raw-segments.json', raw)
    save(folder / 'boundaries.json', cues)
    music = sample.get('music_intervals', [])
    if window:
        music = [[max(0,a-window[0]),min(duration,b-window[0])] for a,b in music
                 if min(b,window[1])>max(a,window[0])]
    flags = suspicious_segments(raw, silence, music)
    boundary_flags = [dict(**c, reasons=['non_sentence_boundary' if c['boundary'] != 'sentence'
                                       else 'long_cue'], status='needs_listening')
                      for c in cues if c['boundary'] != 'sentence' or c['end'] - c['start'] > 12]
    tokens = [dict(start=s['start'], end=s['end'], text=s['text'], status='needs_reference_audio',
                   reasons=['number_or_capitalized_token']) for s in raw
              if re.search(r'\d|\b[A-Z][a-z]+\b', s['text'])]
    save(folder / 'review.json', dict(audio_path=str(original_path.resolve()),
                                    inference_audio_path=str(path.resolve()), source_window=window,
                                    url=sample['url'],
                                    silence_intervals=silence, silence_threshold_db=silence_threshold(path),
                                    declared_music_intervals=music,
                                    hallucination_candidates=flags, entity_number_candidates=tokens,
                                    boundary_candidates=boundary_flags,
                                    confirmed_errors=[], human_listening_completed=False,
                                    warning='Heuristics only. Model agreement is not ground truth.'))
    metrics = dict(sample_id=sample['id'], round=round_name, model_size=args.model,
                   device='cpu', compute_type='int8', cpu_threads=args.threads,
                   audio_path=str(original_path.resolve()), inference_audio_path=str(path.resolve()),
                   source_window=window, audio_sha256=sample['sha256'],
                   audio_duration_seconds=duration, transcription_seconds=elapsed,
                   rtf=elapsed / duration, word_count=len(re.findall(r"\b[\w]+(?:['\u2019][\w]+)*\b", text)),
                   peak_rss_mib=rss.peak / 1024**2, baseline_rss_mib=rss.baseline / 1024**2,
                   rss_sampling_interval_ms=50, cue_count=len(cues), raw_segment_count=len(raw),
                   language=info.language, options=options, download_and_load_excluded=True,
                   hallucination_candidate_count=len(flags), boundary_candidate_count=len(boundary_flags))
    save(folder / 'metrics.json', metrics)
    print(json.dumps(metrics), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', choices=['small', 'medium'], required=True)
    parser.add_argument('--manifest', type=Path, default=ROOT / 'samples.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--round', choices=['quality', 'hallucination', 'all'], default='all')
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--download-only', action='store_true')
    parser.add_argument('--model-dir', type=Path, help='Previously downloaded CTranslate2 model directory')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    from faster_whisper import WhisperModel
    from faster_whisper.utils import download_model
    samples = json.loads(args.manifest.read_text())
    download_start = time.perf_counter()
    model_path = str(args.model_dir.resolve()) if args.model_dir else download_model(
        args.model, cache_dir=str(ROOT / 'models'))
    download_seconds = time.perf_counter() - download_start
    save(args.output / f'{args.model}-download.json', dict(model=args.model,
         endpoint=os.environ['HF_ENDPOINT'], model_path=model_path, seconds=download_seconds))
    if args.download_only:
        return
    load_start = time.perf_counter()
    with PeakRSS() as load_rss:
        model = WhisperModel(model_path, device='cpu', compute_type='int8',
                             cpu_threads=args.threads, num_workers=1, local_files_only=True)
    save(args.output / f'{args.model}-environment.json', dict(
        python=platform.python_version(), platform=platform.platform(), cpu=platform.processor(),
        hf_endpoint=os.environ['HF_ENDPOINT'], load_seconds=time.perf_counter() - load_start,
        load_peak_rss_mib=load_rss.peak / 1024**2, model_path=model_path,
        versions={p:importlib.metadata.version(p) for p in ['faster-whisper','ctranslate2','av','psutil']},
        started_utc=datetime.now(timezone.utc).isoformat()))
    errors = []
    for round_name in (['quality','hallucination'] if args.round == 'all' else [args.round]):
        for s in samples:
            if round_name == 'quality' and not s.get('quality_role'):
                continue
            try:
                run_case(model, s, args, round_name)
            except Exception as e:
                import traceback
                errors.append(dict(sample=s['id'], round=round_name, error=repr(e),
                                   traceback=traceback.format_exc()))
                save(args.output / f'{args.model}-errors.json', errors)
                print(errors[-1], flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
