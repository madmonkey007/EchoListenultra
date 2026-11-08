#!/usr/bin/env python3
"""Disposable, sequential Instagram audio probe. Python 3.11 only."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import signal
import statistics
import subprocess
import sys
import time
from urllib.parse import urlsplit
import wave

ROOT = Path(__file__).resolve().parent
TIMEOUT = 60
CATEGORIES = ('private_or_unavailable', 'login_required_or_ratelimit', 'geo_blocked',
              'no_audio', 'timeout', 'ffmpeg_error', 'other')
FIELDS = ('url', 'status', 'error_category', 'stderr_first_20_lines',
          'download_elapsed_seconds', 'audio_duration_seconds', 'file_bytes',
          'audio_path', 'stderr_path', 'stdout_path')


def load_urls(path):
    urls = [line.strip() for line in path.read_text(encoding='utf-8').splitlines()
            if line.strip() and not line.lstrip().startswith('#')]
    if len(urls) != 8:
        raise ValueError(f'reels.txt 需要恰好 8 条 URL，当前 {len(urls)} 条；未执行任何请求。')
    for url in urls:
        parsed = urlsplit(url)
        if (parsed.scheme != 'https' or parsed.hostname not in {'instagram.com', 'www.instagram.com', 'm.instagram.com'}
                or parsed.username or parsed.password or parsed.port or re.search(r'[\s\\\x00-\x1f]', url)
                or not re.fullmatch(r'/reels?/[A-Za-z0-9_-]+/?', parsed.path)):
            raise ValueError(f'不是合法的公开 Reel 链接：{url}')
    return urls


def classify(stderr, timed_out=False):
    if timed_out:
        return 'timeout'
    text = stderr.lower()
    if any(x in text for x in ('geo-restricted', 'geo restricted', 'not available in your country', 'not available in your region', 'geographic restriction', 'geo blocked')):
        return 'geo_blocked'
    if any(x in text for x in ('login required', 'log in', 'login_required', 'sign in', 'rate limit', 'rate-limit', 'too many requests', 'http error 429', 'http error 401', 'http error 403', 'challenge_required', 'checkpoint_required', 'cookies', 'cookie', 'blocked', 'please wait', 'not a bot')):
        return 'login_required_or_ratelimit'
    if any(x in text for x in ('no audio', 'does not contain any audio', 'requested format is not available', 'only images', 'no video formats found', 'no formats found')):
        return 'no_audio'
    if any(x in text for x in ('private', 'unavailable', 'not available', 'not found', 'http error 404', 'does not exist', 'has been removed', 'has been deleted')):
        return 'private_or_unavailable'
    if any(x in text for x in ('ffmpeg', 'ffprobe', 'postprocessing', 'conversion failed', 'invalid wav')):
        return 'ffmpeg_error'
    return 'other'


def command(url, output, ffmpeg, cookies):
    args = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-plugin-dirs',
            '--no-playlist', '--no-cache-dir', '--no-progress', '--no-colors',
            '--retries', '0', '--fragment-retries', '0', '--extractor-retries', '0',
            '--file-access-retries', '0', '--abort-on-unavailable-fragments', '--no-continue',
            '--socket-timeout', '15', '--format', 'bestaudio/best', '--extract-audio',
            '--audio-format', 'wav', '--postprocessor-args', 'ExtractAudio+ffmpeg_o:-vn -ar 16000 -ac 1 -c:a pcm_s16le',
            '--ffmpeg-location', str(ffmpeg), '--output', str(output / 'audio.%(ext)s')]
    if cookies:
        args += ['--cookies-from-browser', 'chrome']
    return args + ['--', url]


def execute(args, stdout_path, stderr_path, timeout=TIMEOUT):
    """One process group per URL: deadline includes extraction, download and conversion."""
    started = time.monotonic()
    timed_out = False
    # File-backed output preserves every byte, including output preceding a hard kill.
    with stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
        process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                   start_new_session=True)
        try:
            returncode = process.wait(timeout=max(0, timeout - (time.monotonic() - started)))
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            returncode = process.returncode
        except BaseException:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            raise
    return returncode, timed_out, time.monotonic() - started


def probe_one(url, index, run_dir, log_dir, ffmpeg, cookies):
    folder = run_dir / f'{index:02d}'
    folder.mkdir(parents=True)
    stdout = log_dir / f'{index:02d}.stdout.log'
    stderr = log_dir / f'{index:02d}.stderr.log'
    rc, timed_out, elapsed = execute(command(url, folder, ffmpeg, cookies), stdout, stderr)
    raw = stderr.read_text(encoding='utf-8', errors='replace')
    audio = folder / 'audio.wav'
    status, category, duration = 'failure', classify(raw, timed_out), ''
    size = audio.stat().st_size if audio.exists() else 0
    if not timed_out and rc == 0:
        if not audio.exists() or size == 0:
            category = 'no_audio'
        else:
            try:
                with wave.open(str(audio), 'rb') as wav:
                    if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getnframes() == 0:
                        raise ValueError('Invalid WAV format')
                    duration = round(wav.getnframes() / wav.getframerate(), 3)
                status, category = 'success', ''
            except (wave.Error, EOFError, ValueError):
                category = 'ffmpeg_error'
    # Only audio artifacts survive. Never retain video/partial sources in tmp.
    for path in folder.iterdir():
        if path.is_file() and path.name != 'audio.wav':
            path.unlink()
    return dict(zip(FIELDS, (url, status, category, '\n'.join(raw.splitlines()[:20]),
                            round(elapsed, 3), duration, size,
                            str(audio) if audio.exists() else '', str(stderr), str(stdout))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-cookies', action='store_true', help='Use local Chrome login cookies; separate comparison CSV.')
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'), help='ffmpeg executable path (default: PATH).')
    parser.add_argument('--environment-label', default='unverified', help='Operator-provided network label, e.g. dc-provider-region. Not an IP verification.')
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 11):
        parser.error('必须使用 Python 3.11。')
    try:
        urls = load_urls(ROOT / 'reels.txt')
        version = importlib.metadata.version('yt-dlp')
        ffmpeg = Path(args.ffmpeg or '').resolve()
        if not args.ffmpeg or not ffmpeg.is_file() or not os.access(ffmpeg, os.X_OK):
            raise ValueError('缺少 ffmpeg；用 --ffmpeg 指定可执行文件。')
        checked = subprocess.run([str(ffmpeg), '-version'], capture_output=True, text=True, timeout=10, check=True)
    except (OSError, ValueError, importlib.metadata.PackageNotFoundError, subprocess.SubprocessError) as error:
        parser.error(str(error))
    mode = 'cookies' if args.with_cookies else 'noauth'
    csv_path = ROOT / f'probe-result-{mode}.csv'
    meta_path = ROOT / f'probe-result-{mode}.meta.json'
    digest = hashlib.sha256('\n'.join(urls).encode()).hexdigest()
    baseline = ROOT / 'probe-result-noauth.meta.json'
    if args.with_cookies and baseline.exists():
        previous = json.loads(baseline.read_text())
        if previous['urls_sha256'] != digest or previous['environment_label'] != args.environment_label:
            parser.error('URL 列表或网络标签与无 Cookie 组不一致；未执行。')
    if csv_path.exists() or meta_path.exists():
        parser.error(f'{csv_path.name} 已存在；先将上一轮结果移出此目录，防止覆盖原文。')
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + mode
    run_dir, log_dir = ROOT / 'tmp' / run_id, ROOT / 'logs' / run_id
    log_dir.mkdir(parents=True, mode=0o700)
    meta = {'started_utc': datetime.now(timezone.utc).isoformat(), 'mode': mode,
            'environment_label': args.environment_label, 'urls_sha256': digest,
            'python': sys.version, 'yt_dlp': version, 'ffmpeg': checked.stdout.splitlines()[0],
            'timeout_seconds': TIMEOUT, 'retries': 0, 'format': 'bestaudio/best; retain WAV only, remove any temporary muxed source',
            'url_count': len(urls), 'completed': False}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    rows = []
    with csv_path.open('x', newline='', encoding='utf-8-sig') as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        output.flush()
        for index, url in enumerate(urls, 1):
            print(f'[{index}/{len(urls)}] {url}', flush=True)
            row = probe_one(url, index, run_dir, log_dir, ffmpeg, args.with_cookies)
            writer.writerow(row)
            output.flush()
            rows.append(row)
            print(f"  {row['status']} {row['error_category']} {row['download_elapsed_seconds']}s", flush=True)
    successes = sum(row['status'] == 'success' for row in rows)
    counts = {key: sum(row['error_category'] == key for row in rows) for key in CATEGORIES}
    median = statistics.median(row['download_elapsed_seconds'] for row in rows)
    meta.update(completed=True, success_count=successes, error_counts=counts, median_elapsed_seconds=median)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(f'\n成功率：{successes}/{len(urls)}（{successes / len(urls) * 100:.1f}%）')
    print('错误归类计数：')
    for key, count in counts.items():
        print(f'  {key}: {count}')
    print(f'中位耗时（全部条目，含转换）：{median:.3f} 秒')
    print(f'CSV：{csv_path}\n完整 stderr/stdout：{log_dir}')


if __name__ == '__main__':
    main()
