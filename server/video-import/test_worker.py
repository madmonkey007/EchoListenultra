import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
URL = 'https://www.youtube.com/watch?v=abcdefghijk'


class WorkerTests(unittest.TestCase):
    def test_known_single_video_urls(self):
        for url in [URL, 'https://youtu.be/abcdefghijk', 'https://www.youtube.com/shorts/abcdefghijk',
                    'https://www.tiktok.com/@user/video/12345', 'https://vm.tiktok.com/Ab123/']:
            self.assertEqual(worker.validate_url(url), url)

    def test_unsafe_urls_and_feeds_rejected(self):
        for url in ['http://youtube.com/watch?v=abcdefghijk', 'https://youtube.com.evil.test/watch?v=abcdefghijk',
                    'https://user:password@youtube.com/watch?v=abcdefghijk', 'https://youtube.com:443/watch?v=abcdefghijk',
                    'https://127.0.0.1/', 'file:///etc/passwd', 'https://youtube.com/playlist?list=x',
                    'https://youtube.com/@user', 'https://youtube.com\\@localhost/', 'https://vm.tiktok.com/abc/#x', None]:
            with self.subTest(url=url), self.assertRaises(worker.ImportError):
                worker.validate_url(url)

    def test_downloader_rejects_unknown_or_long_duration(self):
        for duration in [None, 601, float('nan'), True, 0]:
            with tempfile.TemporaryDirectory() as directory:
                def metadata(command, folder, timeout):
                    Path(folder, 'metadata.info.json').write_text(json.dumps({'duration': duration}))
                with patch.object(worker, 'run_bounded', metadata), self.assertRaises(worker.ImportError):
                    worker.download_audio(URL, directory)

    def test_downloader_uses_fixed_arguments_and_local_conversion(self):
        commands = []
        with tempfile.TemporaryDirectory() as directory:
            def fake(command, folder, timeout=180):
                commands.append(command)
                if '--skip-download' in command:
                    Path(folder, 'metadata.info.json').write_text(json.dumps({'duration': 12, 'title': 'Lesson'}))
                elif command[0] == 'yt-dlp':
                    Path(folder, 'source.webm').write_bytes(b'download')
                else:
                    Path(folder, 'audio.mp3').write_bytes(b'audio')
            with patch.object(worker, 'run_bounded', fake):
                result = worker.download_audio(URL, directory)
            self.assertEqual(result['title'], 'Lesson')
            for command in commands[:2]:
                self.assertIn('--ignore-config', command)
                self.assertIn('--no-plugin-dirs', command)
                self.assertIn('--no-playlist', command)
                self.assertIn('--use-extractors', command)
                self.assertEqual(command[command.index('--use-extractors') + 1], r'youtube,tiktok,vm\.tiktok')
                self.assertEqual(command[-2:], ['--', URL])
            self.assertIn('file,pipe', commands[-1])
            self.assertFalse(Path(directory, 'source.webm').exists())

    def test_job_success_failure_rate_and_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            def fake(url, folder):
                Path(folder, 'audio.mp3').write_bytes(b'audio')
                return {'title': 'Lesson', 'duration': 3}
            jobs = worker.Jobs(directory, fake, ttl=1)
            job = jobs.submit(URL, 'client')
            jobs.queue.join()
            self.assertEqual(jobs.get(job['id'])['status'], 'ready')
            self.assertRegex(job['id'], r'^[a-f0-9]{32}$')
            for _ in range(4):
                jobs.submit(URL, 'client')
                jobs.queue.join()
            with self.assertRaises(worker.ImportError):
                jobs.submit(URL, 'client')
            with jobs.lock:
                jobs.jobs[job['id']]['updated'] = time.time() - 2
            jobs.cleanup()
            self.assertIsNone(jobs.get(job['id']))
            self.assertFalse(Path(directory, job['id']).exists())
            def fail(*_):
                raise RuntimeError('private diagnostics')
            jobs.downloader = fail
            failed = jobs.submit(URL, 'other')
            jobs.queue.join()
            self.assertEqual(jobs.get(failed['id'])['status'], 'failed')
            self.assertNotIn('private diagnostics', jobs.get(failed['id'])['error'])

    def test_single_worker_and_bounded_queue(self):
        with tempfile.TemporaryDirectory() as directory:
            entered, release = threading.Event(), threading.Event()
            active = []
            def blocked(url, folder):
                active.append(folder.name)
                entered.set()
                release.wait(2)
                Path(folder, 'audio.mp3').write_bytes(b'audio')
                return {'title': 'Lesson', 'duration': 3}
            jobs = worker.Jobs(directory, blocked)
            jobs.submit(URL, 'client0')
            self.assertTrue(entered.wait(1))
            try:
                for index in range(4):
                    jobs.submit(URL, 'client' + str(index + 1))
                with self.assertRaises(worker.ImportError):
                    jobs.submit(URL, 'overflow')
                self.assertEqual(len(active), 1)
                self.assertEqual(jobs.queue.qsize(), 4)
            finally:
                release.set()
                jobs.queue.join()

    def test_http_secret_no_cors_poll_and_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            def fake(url, folder):
                Path(folder, 'audio.mp3').write_bytes(b'audio')
                return {'title': 'Lesson', 'duration': 3}
            jobs = worker.Jobs(directory, fake)
            server = ThreadingHTTPServer(('127.0.0.1', 0), worker.handler(jobs, 'secret'))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            conn = HTTPConnection('127.0.0.1', server.server_port)
            def request(method, path, data=None, **headers):
                conn.request(method, path, json.dumps(data) if data else None, headers)
                response = conn.getresponse()
                return response.status, response.getheaders(), response.read()
            try:
                self.assertEqual(request('POST', '/imports', {'url': URL})[0], 403)
                headers = {'Authorization': 'Bearer secret', 'Content-Type': 'application/json'}
                self.assertEqual(request('POST', '/imports', {'url': URL}, **dict(headers, Origin='https://evil.test'))[0], 403)
                status, _, body = request('POST', '/imports', {'url': URL}, **headers)
                self.assertEqual(status, 202)
                job_id = json.loads(body)['id']
                jobs.queue.join()
                self.assertEqual(json.loads(request('GET', '/imports/' + job_id, **headers)[2])['status'], 'ready')
                status, returned_headers, body = request('GET', '/imports/' + job_id + '/audio', **headers)
                self.assertEqual((status, body), (200, b'audio'))
                self.assertIn('Content-Disposition', dict(returned_headers))
                self.assertNotIn('Access-Control-Allow-Origin', dict(returned_headers))
            finally:
                conn.close()
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
