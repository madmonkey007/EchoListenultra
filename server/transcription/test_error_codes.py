"""Offline contract for the five-way failure naming: probe prefix -> transport code -> client copy."""
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
spec = importlib.util.spec_from_file_location('codes_api', ROOT / 'api/reel-transcribe.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
import chain_entry
import probe_classify

AUDIO = b'original audio'
EXTRACTED = {'status': 'audio_downloaded', 'audio_base64': base64.b64encode(AUDIO).decode(),
             'audio_sha256': hashlib.sha256(AUDIO).hexdigest(), 'ext': 'm4a'}
PROVIDER_EMPTY = {'success': True, 'result': {'transcription_info': {'duration': 10}, 'segments': []}}
ENV = {'PROBE_SECRET': 'offline', 'CLOUDFLARE_ACCOUNT_ID': 'acct-1', 'CLOUDFLARE_API_TOKEN': 'tok-1'}

# Verbatim strings from the production log corpus (vercel logs, 2026-11-18).
IMAGE_POST = 'DownloadError: ERROR: [Instagram] Df2PIzluJ3_: No video formats found!; please report this issue'
GONE_POST = 'DownloadError: ERROR: [Instagram] DQdEadEl1Xq: Instagram sent an empty media response. Check if this post is accessible in your browser without being logged-in.'
ANON_WALL = 'DownloadError: ERROR: [Instagram] DeejOF4AfBe: Requested content is not available, rate-limit reached or login required. Use --cookies-from-browser for the authentication.'
TRANSIENT = 'DownloadError: ERROR: [Instagram] DeejOF4AfBe: Unable to download webpage: 16998 bytes read (caused by <IncompleteRead: 16998 bytes read>)'


class FailureNaming(unittest.TestCase):
    def handler(self, stream=False):
        h = api.handler.__new__(api.handler)
        request = json.dumps({'url': 'https://www.instagram.com/reel/PublicExample/'}).encode()
        h.headers = Message()
        h.headers['Host'] = 'localhost'
        h.headers['Content-Length'] = str(len(request))
        if stream: h.headers['Accept'] = 'application/x-ndjson'
        h.rfile = io.BytesIO(request)
        h.wfile = io.BytesIO()
        h.sent_headers = []
        h.send_response = lambda code: setattr(h, 'code', code)
        h.send_header = lambda *args: h.sent_headers.append(args)
        h.end_headers = lambda: None
        return h

    def run_chain(self, h, probe_stdout, asr_result=None):
        def download(*args, **kwargs):
            return SimpleNamespace(returncode=0, stdout=json.dumps(probe_stdout))
        with patch.dict(api.os.environ, ENV), \
             patch.object(chain_entry.subprocess, 'run', side_effect=download), \
             patch.object(chain_entry, '_request', return_value=asr_result) as request:
            h.do_POST()
        return request

    def frames(self, h):
        return [json.loads(line) for line in h.wfile.getvalue().splitlines()]

    def test_image_post_is_named_no_video(self):
        h = self.handler()
        probe_error = probe_classify.classify_failure(IMAGE_POST) + ': ' + IMAGE_POST
        self.run_chain(h, {'status': 'failed', 'error': probe_error})
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'no_video', 'limit_seconds': 180})

    def test_gone_or_private_post_is_named_private_or_unavailable(self):
        h = self.handler()
        probe_error = probe_classify.classify_failure(GONE_POST) + ': ' + GONE_POST
        self.run_chain(h, {'status': 'failed', 'error': probe_error})
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'private_or_unavailable', 'limit_seconds': 180})

    def test_legacy_unavailable_strings_still_map_without_a_prefix(self):
        h = self.handler()
        self.run_chain(h, {'status': 'failed', 'error': ANON_WALL})
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'private_or_unavailable', 'limit_seconds': 180})

    def test_transient_network_stays_the_retryable_generic(self):
        h = self.handler()
        self.run_chain(h, {'status': 'failed', 'error': TRANSIENT})
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'fetch_failed', 'limit_seconds': 180})

    def test_malformed_link_stays_invalid_url(self):
        h = api.handler.__new__(api.handler)
        request = json.dumps({'url': 'https://example.com/video/'}).encode()
        h.headers = Message(); h.headers['Host'] = 'localhost'; h.headers['Content-Length'] = str(len(request))
        h.rfile = io.BytesIO(request); h.wfile = io.BytesIO(); h.sent_headers = []
        h.send_response = lambda code: setattr(h, 'code', code)
        h.send_header = lambda *args: h.sent_headers.append(args)
        h.end_headers = lambda: None
        self.run_chain(h, {'status': 'failed', 'error': 'unreachable'})
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'invalid_url', 'limit_seconds': 180})

    def test_music_only_transcription_becomes_a_named_no_speech_failure(self):
        h = self.handler()
        self.run_chain(h, EXTRACTED, asr_result=PROVIDER_EMPTY)
        self.assertEqual(h.code, 422)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'no_speech', 'limit_seconds': 180})

    def test_stream_music_only_keeps_progress_then_emits_the_error_frame(self):
        h = self.handler(stream=True)
        self.run_chain(h, EXTRACTED, asr_result=PROVIDER_EMPTY)
        frames = self.frames(h)
        self.assertEqual([f['completed'] for f in frames if f['type'] == 'progress'], [0, 1, 2])
        self.assertEqual(frames[-1]['type'], 'error')
        self.assertEqual(frames[-1]['status_code'], 422)
        self.assertEqual(frames[-1]['data']['error'], 'no_speech')

    def test_classifier_pins_the_production_corpus(self):
        self.assertEqual(probe_classify.classify_failure(IMAGE_POST), 'no_video')
        self.assertEqual(probe_classify.classify_failure(GONE_POST), 'private_or_unavailable')
        self.assertEqual(probe_classify.classify_failure(ANON_WALL), 'private_or_unavailable')
        self.assertEqual(probe_classify.classify_failure(TRANSIENT), None)
        self.assertEqual(probe_classify.classify_failure('ValueError: too_long: full audio exceeds 180-second limit'), None)
        self.assertEqual(probe_classify.classify_failure('subprocess.TimeoutExpired: timed out'), None)


if __name__ == '__main__': unittest.main()
