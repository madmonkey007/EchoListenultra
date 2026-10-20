"""Private, single-worker YouTube/TikTok audio import service. Python 3.10+."""
import argparse
import hmac
import json
import math
import os
from pathlib import Path
import queue
import re
import secrets
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

MAX_BYTES = 100 * 1024 * 1024
MAX_SECONDS = 600
MAX_AUDIO_BYTES = 4 * 1024 * 1024
HOSTS = {'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
         'tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'}


class ImportError(Exception):
    pass


def validate_url(value):
    if not isinstance(value, str) or len(value) > 2048 or re.search(r'[\s\\\x00-\x1f\x7f]', value):
        raise ImportError('Enter a valid YouTube or TikTok HTTPS link.')
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != 'https' or parsed.hostname not in HOSTS or parsed.username
                or parsed.password or parsed.port is not None or parsed.fragment):
            raise ValueError()
    except ValueError:
        raise ImportError('Only YouTube and TikTok HTTPS links are supported.')
    # Restrict the supported entry routes; channel/feed/live/playlist pages are not imports.
    host, path = parsed.hostname, parsed.path
    if host == 'youtu.be':
        valid = bool(re.fullmatch(r'/[A-Za-z0-9_-]{11}/?', path))
    elif host.endswith('youtube.com'):
        from urllib.parse import parse_qs
        query = parse_qs(parsed.query)
        valid = (path == '/watch' and bool(re.fullmatch(r'[A-Za-z0-9_-]{11}', query.get('v', [''])[0]))) or bool(re.fullmatch(r'/(shorts|embed)/[A-Za-z0-9_-]{11}/?', path))
    else:
        valid = bool(re.fullmatch(r'/@[A-Za-z0-9._-]+/video/[0-9]+/?', path)) or (host in {'vm.tiktok.com', 'vt.tiktok.com'} and bool(re.fullmatch(r'/[A-Za-z0-9]+/?', path))) or bool(re.fullmatch(r'/t/[A-Za-z0-9]+/?', path))
    if not valid:
        raise ImportError('Use a single video link, not a playlist, profile or live stream.')
    return value


def run_bounded(command, directory, timeout=180):
    """Bound the full process group, on-disk bytes, and captured diagnostic output."""
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(command, cwd=directory, stdout=log, stderr=log,
                                   stdin=subprocess.DEVNULL, start_new_session=True)
        started = time.monotonic()
        try:
            while process.poll() is None:
                if time.monotonic() - started > timeout:
                    raise ImportError('The video service took too long. Try again later.')
                if sum(p.stat().st_size for p in Path(directory).glob('*') if p.is_file()) > MAX_BYTES:
                    raise ImportError('This video exceeds the 100 MB download limit.')
                if log.tell() > 1024 * 1024:
                    raise ImportError('The video service returned too much diagnostic output.')
                time.sleep(.1)
            if process.returncode:
                raise ImportError('Could not import this video. It may be private, restricted or unavailable.')
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


def download_audio(url, directory):
    base = ['yt-dlp', '--ignore-config', '--no-plugin-dirs', '--no-remote-components', '--no-playlist', '--no-cache-dir',
            '--use-extractors', r'youtube,tiktok,vm\.tiktok', '--socket-timeout', '15', '--retries', '1',
            '--fragment-retries', '1', '--max-filesize', str(MAX_BYTES), '--no-progress',
            '--match-filter', 'duration <= 600 & !is_live', '--restrict-filenames']
    # Fetch metadata first, rejecting unknown duration instead of trusting a download filter.
    run_bounded(base + ['--skip-download', '--write-info-json', '-o', 'metadata.%(ext)s', '--', url], directory, 60)
    info_path = Path(directory) / 'metadata.info.json'
    if not info_path.is_file() or info_path.stat().st_size > 2 * 1024 * 1024:
        raise ImportError('Could not read this video’s duration.')
    info = json.loads(info_path.read_text())
    duration = info.get('duration')
    if (not isinstance(duration, (int, float)) or isinstance(duration, bool)
            or not math.isfinite(duration) or not 0 < duration <= MAX_SECONDS or info.get('is_live')
            or info.get('_type') in {'playlist', 'multi_video'}):
        raise ImportError('Use a non-live video up to 10 minutes long.')
    info_path.unlink()
    run_bounded(base + ['-f', 'bestaudio/best', '-o', 'source.%(ext)s', '--', url], directory)
    sources = [p for p in Path(directory).glob('source.*') if p.is_file() and p.suffix not in {'.part', '.ytdl'}]
    if len(sources) != 1 or sources[0].stat().st_size > MAX_BYTES:
        raise ImportError('The video download did not finish within the size limit.')
    output = Path(directory) / 'audio.mp3'
    # Only a local downloaded file enters ffmpeg; protocol whitelist excludes network access.
    run_bounded(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                 '-i', str(sources[0]), '-vn', '-t', '600', '-ac', '1', '-b:a', '48k', '-y', str(output)], directory, 90)
    if not output.is_file() or not 0 < output.stat().st_size <= MAX_AUDIO_BYTES:
        raise ImportError('Could not extract audio from this video.')
    sources[0].unlink()
    return {'title': str(info.get('title') or 'Imported video')[:200], 'duration': duration}


class Jobs:
    def __init__(self, root, downloader=download_audio, ttl=1800, maximum=20):
        self.root, self.downloader, self.ttl, self.maximum = Path(root), downloader, ttl, maximum
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.jobs = {}
        self.rates = {}
        self.queue = queue.Queue(maxsize=4)
        threading.Thread(target=self.work, daemon=True).start()
        threading.Thread(target=self.reap, daemon=True).start()

    def cleanup(self):
        now = time.time()
        with self.lock:
            for job_id, job in list(self.jobs.items()):
                if job['status'] in {'ready', 'failed'} and now - job['updated'] > self.ttl:
                    shutil.rmtree(self.root / job_id, ignore_errors=True)
                    del self.jobs[job_id]
            self.rates = {ip: times for ip, times in self.rates.items() if times and now - times[-1] < 3600}

    def reap(self):
        while True:
            time.sleep(60)
            self.cleanup()

    def submit(self, url, client):
        url = validate_url(url)
        self.cleanup()
        now = time.time()
        with self.lock:
            times = [stamp for stamp in self.rates.get(client, []) if now - stamp < 3600]
            if len(times) >= 5:
                raise ImportError('Too many imports. Try again in an hour.')
            if len(self.jobs) >= self.maximum or self.queue.full():
                raise ImportError('The import queue is full. Try again shortly.')
            job_id = secrets.token_hex(16)
            self.jobs[job_id] = {'id': job_id, 'status': 'queued', 'updated': now}
            self.rates[client] = times + [now]
            self.queue.put_nowait((job_id, url))
            return dict(self.jobs[job_id])

    def get(self, job_id):
        self.cleanup()
        with self.lock:
            return dict(self.jobs[job_id]) if job_id in self.jobs else None

    def work(self):
        while True:
            job_id, url = self.queue.get()
            directory = self.root / job_id
            directory.mkdir(mode=0o700)
            with self.lock:
                self.jobs[job_id].update(status='processing', updated=time.time())
            try:
                result = self.downloader(url, directory)
                with self.lock:
                    self.jobs[job_id].update(result, status='ready', updated=time.time())
            except Exception as error:
                shutil.rmtree(directory, ignore_errors=True)
                message = str(error) if isinstance(error, ImportError) else 'The import service could not process this video.'
                with self.lock:
                    self.jobs[job_id].update(status='failed', error=message, updated=time.time())
            finally:
                self.queue.task_done()


def handler(jobs, secret):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def log_message(self, *_):
            pass  # Do not log video URLs or capability job IDs.

        def allowed(self):
            authorization = self.headers.get('Authorization', '')
            # Even localhost requires the proxy secret: prevents browser-origin CSRF to localhost.
            return bool(secret) and hmac.compare_digest(authorization, 'Bearer ' + secret) and not self.headers.get('Origin')

        def reply(self, code, value):
            body = json.dumps(value).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if not self.allowed():
                return self.reply(403, {'error': 'Forbidden'})
            if self.path != '/imports':
                return self.reply(404, {'error': 'Not found'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    return self.reply(400, {'error': 'Invalid JSON request'})
                data = json.loads(self.rfile.read(length))
                # Client identifier must be set by the trusted same-origin proxy, never browser input.
                client = self.headers.get('X-Echo-Client', self.client_address[0])
                if not re.fullmatch(r'[A-Za-z0-9:._-]{1,128}', client):
                    return self.reply(400, {'error': 'Invalid client identifier'})
                job = jobs.submit(data.get('url'), client)
                return self.reply(202, job)
            except (ValueError, AttributeError, ImportError) as error:
                return self.reply(400, {'error': str(error) if isinstance(error, ImportError) else 'Invalid JSON request'})

        def do_GET(self):
            if not self.allowed():
                return self.reply(403, {'error': 'Forbidden'})
            if self.path == '/health':
                return self.reply(200, {'ready': all(shutil.which(tool) for tool in ('yt-dlp', 'ffmpeg', 'deno'))})
            match = re.fullmatch(r'/imports/([a-f0-9]{32})(/audio)?', self.path)
            job = jobs.get(match[1]) if match else None
            if not job:
                return self.reply(404, {'error': 'Import expired or not found'})
            if not match[2]:
                return self.reply(200, job)
            if job['status'] != 'ready':
                return self.reply(409, {'error': 'Audio is not ready'})
            try:
                with (jobs.root / match[1] / 'audio.mp3').open('rb') as audio:
                    self.send_response(200)
                    self.send_header('Content-Type', 'audio/mpeg')
                    self.send_header('Content-Disposition', 'attachment; filename="imported-audio.mp3"')
                    self.send_header('Content-Length', str(os.fstat(audio.fileno()).st_size))
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    self.end_headers()
                    shutil.copyfileobj(audio, self.wfile)
            except FileNotFoundError:
                self.reply(404, {'error': 'Import expired'})
    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--data-dir', default=os.path.join(tempfile.gettempdir(), 'echolisten-video-import'))
    args = parser.parse_args()
    secret = os.environ.get('VIDEO_IMPORT_WORKER_SECRET', '')
    if len(secret) < 32:
        parser.error('Set VIDEO_IMPORT_WORKER_SECRET to a random secret of at least 32 characters.')
    if not all(shutil.which(tool) for tool in ('yt-dlp', 'ffmpeg', 'deno')):
        parser.error('Install modern yt-dlp with its EJS components, ffmpeg and deno executables first.')
    # In-memory jobs cannot recover files after restart. Remove abandoned private job directories.
    root = Path(args.data_dir)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    for path in root.iterdir():
        if path.is_dir() and re.fullmatch(r'[a-f0-9]{32}', path.name):
            shutil.rmtree(path)
    server = ThreadingHTTPServer((args.host, args.port), handler(Jobs(root), secret))
    server.timeout = 15
    server.serve_forever()


if __name__ == '__main__':
    main()
