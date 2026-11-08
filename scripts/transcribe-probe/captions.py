#!/usr/bin/env python3
"""Probe public Reel subtitles without authentication; never downloads media."""
import argparse
import json
import re
import subprocess
import time
from pathlib import Path


def probe(sample, destination, python, timeout=35):
    sample_id = str(sample['id'])
    if not re.fullmatch(r'[A-Za-z0-9_-]+', sample_id):
        raise ValueError(f'Unsafe sample id: {sample_id!r}')
    folder = destination / sample_id
    folder.mkdir(parents=True, exist_ok=True)
    command = [str(python), '-m', 'yt_dlp', '--ignore-config', '--no-plugin-dirs',
               '--skip-download', '--write-subs', '--write-auto-subs',
               '--sub-langs', 'all', '--sub-format', 'srt/vtt/best',
               '--dump-single-json', '--no-progress', '--no-playlist',
               '--socket-timeout', '10', '--retries', '0', '--extractor-retries', '0',
               '-o', str(folder / '%(id)s.%(ext)s'), sample['url']]
    start = time.monotonic()
    status = {'id': sample_id, 'url': sample['url'], 'audio_path': sample.get('audio_path'),
              'command': command, 'timeout_seconds': timeout, 'status': 'N/A',
              'reason': None, 'elapsed_seconds': None, 'returncode': None,
              'subtitle_files': [], 'metadata': None}
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        stdout, stderr = result.stdout, result.stderr
        status['returncode'] = result.returncode
    except subprocess.TimeoutExpired as exc:
        def decoded(value):
            return value.decode(errors='replace') if isinstance(value, bytes) else value or ''
        stdout, stderr = decoded(exc.stdout), decoded(exc.stderr)
        status['reason'] = f'yt-dlp exceeded {timeout} second deadline'
    (folder / 'stdout.jsonl').write_text(stdout)
    (folder / 'stderr.log').write_text(stderr)
    for line in reversed(stdout.splitlines()):
        try:
            info = json.loads(line)
        except json.JSONDecodeError:
            continue
        (folder / 'info.json').write_text(json.dumps(info, ensure_ascii=False, indent=2))
        status['metadata'] = {key: info.get(key) for key in
                              ('id', 'title', 'description', 'duration', 'uploader',
                               'subtitles', 'automatic_captions', 'requested_subtitles')}
        break
    files = sorted(str(path.resolve()) for path in folder.iterdir()
                   if path.suffix.lower() in {'.srt', '.vtt', '.ass', '.ttml', '.srv1', '.srv2', '.srv3', '.json3', '.lrc'})
    status['subtitle_files'] = files
    if files:
        status['status'] = 'available'
    elif status['reason'] is None:
        status['reason'] = ('No accessible native/manual or automatic subtitle files returned'
                            if status['returncode'] == 0 else
                            'yt-dlp extraction failed; see stderr.log (caption availability unknown)')
    status['elapsed_seconds'] = round(time.monotonic() - start, 3)
    (folder / 'status.json').write_text(json.dumps(status, ensure_ascii=False, indent=2))
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path(__file__).with_name('samples.json'))
    parser.add_argument('--run', type=Path, required=True, help='Run directory; captions are stored beneath it')
    parser.add_argument('--python', type=Path, default=Path(__file__).with_name('.venv') / 'bin/python')
    parser.add_argument('--timeout', type=float, default=35)
    args = parser.parse_args()
    if not args.python.is_file():
        parser.error(f'Python environment not found: {args.python}')
    samples = json.loads(args.manifest.read_text())
    destination = args.run.resolve() / 'captions'
    destination.mkdir(parents=True, exist_ok=True)
    statuses = []
    for sample in samples:
        result = probe(sample, destination, args.python.absolute(), args.timeout)
        statuses.append(result)
        print(f"{result['id']}: {result['status']} ({result['elapsed_seconds']}s)", flush=True)
        (destination / 'summary.json').write_text(json.dumps(statuses, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
