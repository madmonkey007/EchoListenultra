"""Offline evidence that progress tracks completed work, not elapsed time."""
import base64
from email.message import Message
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('progress_api', ROOT / 'api/reel-transcribe.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
import chain_entry


class ProgressStream(unittest.TestCase):
    def handler(self, stream=True, url='https://www.instagram.com/reel/PublicExample/'):
        h = api.handler.__new__(api.handler)
        request = json.dumps({'url': url}).encode()
        h.headers = Message()
        h.headers['Host'] = 'localhost'
        h.headers['Content-Length'] = str(len(request))
        if stream: h.headers['Accept'] = 'application/x-ndjson'
        h.rfile = io.BytesIO(request)
        class FlushedBuffer(io.BytesIO):
            flush_count = 0
            def flush(self): self.flush_count += 1
        h.wfile = FlushedBuffer()
        h.sent_headers = []
        h.send_response = lambda code: setattr(h, 'code', code)
        h.send_header = lambda *args: h.sent_headers.append(args)
        h.end_headers = lambda: None
        return h

    def frames(self, h):
        return [json.loads(line) for line in h.wfile.getvalue().splitlines()]

    def run_chain(self, h, failure=None):
        audio = b'original audio'
        extracted = {'status': 'audio_downloaded', 'audio_base64': base64.b64encode(audio).decode(),
                     'audio_sha256': hashlib.sha256(audio).hexdigest(), 'ext': 'm4a'}
        provider = {'success': True, 'result': {'transcription_info': {'duration': 10},
                    'segments': [{'words': [{'word': ' Hello.', 'start': 0.5, 'end': 1.5}]}]}}
        observed = []
        def at(boundary):
            observed.append((boundary, [f['completed'] for f in self.frames(h) if f['type'] == 'progress']))
        def download(*args, **kwargs):
            if h.headers.get('Accept'): at('download')
            if failure == 'download': raise ValueError('too_long: downloaded audio')
            if failure == 'unavailable':
                return SimpleNamespace(returncode=0, stdout=json.dumps({'status': 'failed', 'error': 'login required'}))
            if failure == 'hash': extracted['audio_sha256'] = 'invalid'
            return SimpleNamespace(returncode=0, stdout=json.dumps(extracted))
        original_payload = chain_entry.make_payload
        def payload(*args):
            if h.headers.get('Accept'): at('payload')
            if failure == 'payload': raise ValueError('payload_too_large: bytes')
            return original_payload(*args)
        def asr(*args):
            if h.headers.get('Accept'): at('asr')
            if failure == 'asr': raise ValueError('too_long: original duration')
            if failure == 'duration': provider['result']['transcription_info']['duration'] = 181.25
            return provider
        original_assemble = chain_entry.assemble
        def assemble(*args):
            if h.headers.get('Accept'): at('cue')
            return original_assemble(*args)
        with patch.dict(api.os.environ, {'PROBE_SECRET': 'offline', 'CLOUDFLARE_ACCOUNT_ID': 'offline', 'CLOUDFLARE_API_TOKEN': 'offline'}), \
             patch.object(chain_entry.subprocess, 'run', side_effect=download) as dl, \
             patch.object(chain_entry, 'make_payload', side_effect=payload), \
             patch.object(chain_entry, '_request', side_effect=asr) as speech, \
             patch.object(chain_entry, 'assemble', side_effect=assemble):
            h.do_POST()
        return observed, dl.call_count, speech.call_count

    def test_progress_observed_at_actual_boundaries_and_success(self):
        h = self.handler()
        observed, downloads, asrs = self.run_chain(h)
        self.assertEqual(observed, [('download', [0]), ('payload', [0]), ('asr', [0, 1]), ('cue', [0, 1, 2])])
        frames = self.frames(h)
        self.assertEqual(frames[:3], [dict(type='progress', stage=stage, completed=n, total=3, limit_seconds=180)
            for n, stage in enumerate(['fetching_audio', 'transcribing', 'formatting'])])
        self.assertEqual(frames[-1]['type'], 'result')
        self.assertEqual(frames[-1]['status_code'], 200)
        self.assertEqual(frames[-1]['data']['limit_seconds'], 180)
        self.assertEqual((downloads, asrs), (1, 1))
        self.assertEqual(h.code, 200)
        self.assertEqual(h.wfile.flush_count, 4)
        self.assertIn(('Content-Type', 'application/x-ndjson'), h.sent_headers)
        self.assertFalse(any(k == 'Content-Length' for k, v in h.sent_headers))
        self.assertNotIn('PublicExample', json.dumps(frames[:3]))

    def test_errors_keep_original_status_and_never_complete(self):
        for failure, status, completed in [('download', 422, [0]), ('payload', 413, [0]), ('asr', 422, [0, 1]), ('duration', 422, [0, 1]), ('unavailable', 502, [0]), ('hash', 502, [0])]:
            with self.subTest(failure=failure):
                h = self.handler()
                self.run_chain(h, failure)
                frames = self.frames(h)
                self.assertEqual([f['completed'] for f in frames if f['type'] == 'progress'], completed)
                self.assertEqual(frames[-1]['type'], 'error')
                self.assertEqual(frames[-1]['status_code'], status)
                self.assertEqual(frames[-1]['data']['limit_seconds'], 180)
                self.assertFalse(any(f['type'] == 'result' for f in frames))
                self.assertEqual(h.wfile.flush_count, len(frames))
                if failure == 'duration':
                    self.assertEqual(frames[-1]['data']['duration_seconds'], 181.2)

    def test_invalid_input_before_progress_retains_json_status(self):
        h = self.handler(url='invalid')
        self.run_chain(h)
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'invalid_url', 'limit_seconds': 180})
        self.assertIn(('Content-Type', 'application/json; charset=utf-8'), h.sent_headers)

    def test_legacy_json_unchanged(self):
        h = self.handler(stream=False)
        self.run_chain(h)
        self.assertEqual(h.code, 200)
        self.assertEqual(json.loads(h.wfile.getvalue())['text'], 'Hello.')
        self.assertIn(('Content-Type', 'application/json; charset=utf-8'), h.sent_headers)

    def test_disconnected_progress_does_not_continue_asr_or_reply(self):
        h = self.handler()
        class Disconnected(io.BytesIO):
            def write(self, value): raise BrokenPipeError('closed')
        h.wfile = Disconnected()
        observed, downloads, asrs = self.run_chain(h)
        self.assertEqual((downloads, asrs), (0, 0))
        self.assertEqual(h.code, 200)


if __name__ == '__main__': unittest.main()
