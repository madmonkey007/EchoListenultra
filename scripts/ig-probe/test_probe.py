import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import wave

spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('probe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
URL = 'https://www.instagram.com/reel/TEST_0123/'


class ProbeTests(unittest.TestCase):
    def test_requires_eight_valid_urls_before_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'reels.txt'
            path.write_text('# blank input\n')
            with self.assertRaisesRegex(ValueError, '8'):
                probe.load_urls(path)
            path.write_text('\n'.join([URL] * 8))
            self.assertEqual(len(probe.load_urls(path)), 8)
            path.write_text('\n'.join([URL] * 7 + ['https://instagram.com.evil.test/reel/x/']))
            with self.assertRaises(ValueError):
                probe.load_urls(path)

    def test_cookie_mode_is_explicit_and_all_retries_zero(self):
        bare = probe.command(URL, Path('/tmp/fixture'), Path('/bin/ffmpeg'), False)
        auth = probe.command(URL, Path('/tmp/fixture'), Path('/bin/ffmpeg'), True)
        self.assertFalse(any('cookies' in arg for arg in bare))
        self.assertEqual(auth[auth.index('--cookies-from-browser') + 1], 'chrome')
        self.assertNotIn('--cookies', auth)
        for flag in ['--retries', '--fragment-retries', '--extractor-retries', '--file-access-retries']:
            self.assertEqual(bare[bare.index(flag) + 1], '0')
        self.assertIn('--ignore-config', bare)
        self.assertIn('--no-plugin-dirs', bare)
        self.assertIn('ExtractAudio+ffmpeg_o:-vn -ar 16000 -ac 1 -c:a pcm_s16le', bare)

    def test_categories(self):
        cases = {'This video is private': 'private_or_unavailable',
                 'Login required or rate-limit reached': 'login_required_or_ratelimit',
                 'HTTP Error 429': 'login_required_or_ratelimit',
                 'Not available in your country': 'geo_blocked',
                 'Requested format is not available': 'no_audio',
                 'ffmpeg conversion failed': 'ffmpeg_error',
                 'Unknown network error': 'other'}
        for raw, expected in cases.items():
            self.assertEqual(probe.classify(raw), expected)
        self.assertEqual(probe.classify('private video', True), 'timeout')

    def test_hard_timeout_keeps_full_stderr_and_stops_process(self):
        with tempfile.TemporaryDirectory() as directory:
            stdout, stderr = Path(directory) / 'out', Path(directory) / 'err'
            command = [sys.executable, '-c', 'import sys,time; print("raw original",file=sys.stderr,flush=True); time.sleep(10)']
            rc, timeout, elapsed = probe.execute(command, stdout, stderr, timeout=.3)
            self.assertTrue(timeout)
            self.assertNotEqual(rc, 0)
            self.assertLess(elapsed, 2)
            self.assertEqual(stderr.read_text(), 'raw original\n')

    def test_wav_metrics_full_logs_and_source_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root, logs = Path(directory) / 'tmp', Path(directory) / 'logs'
            logs.mkdir()
            def fake(args, stdout, stderr):
                folder = root / '01'
                with wave.open(str(folder / 'audio.wav'), 'wb') as wav:
                    wav.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
                    wav.writeframes(b'\x00\x00' * 16000)
                (folder / 'audio.mp4').write_bytes(b'temporary source')
                stderr.write_text('\n'.join(f'raw line {i}' for i in range(30)))
                stdout.write_text('original stdout')
                return 0, False, 1.25
            with patch.object(probe, 'execute', fake):
                row = probe.probe_one(URL, 1, root, logs, '/bin/ffmpeg', False)
            self.assertEqual(row['status'], 'success')
            self.assertEqual(row['audio_duration_seconds'], 1)
            self.assertEqual(row['file_bytes'], 32044)
            self.assertEqual(len(row['stderr_first_20_lines'].splitlines()), 20)
            self.assertEqual(len(Path(row['stderr_path']).read_text().splitlines()), 30)
            self.assertFalse((root / '01' / 'audio.mp4').exists())

    def test_failed_partial_wav_is_never_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root, logs = Path(directory) / 'tmp', Path(directory) / 'logs'
            logs.mkdir()
            def fake(args, stdout, stderr):
                (root / '01' / 'audio.wav').write_bytes(b'partial')
                stderr.write_text('Login required\n')
                stdout.write_text('')
                return 1, False, 2
            with patch.object(probe, 'execute', fake):
                row = probe.probe_one(URL, 1, root, logs, '/bin/ffmpeg', False)
            self.assertEqual(row['status'], 'failure')
            self.assertEqual(row['error_category'], 'login_required_or_ratelimit')


if __name__ == '__main__':
    unittest.main()
