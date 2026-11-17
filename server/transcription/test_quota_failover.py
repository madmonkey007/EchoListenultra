"""Offline contract for Cloudflare account rotation on daily quota exhaustion."""
import base64
from email.message import Message
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
import urllib.error
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('quota_api', ROOT / 'api/reel-transcribe.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
import chain_entry

AUDIO = b'original audio'
EXTRACTED = {'status': 'audio_downloaded', 'audio_base64': base64.b64encode(AUDIO).decode(),
             'audio_sha256': hashlib.sha256(AUDIO).hexdigest(), 'ext': 'm4a'}
PROVIDER = {'success': True, 'result': {'transcription_info': {'duration': 10},
            'segments': [{'words': [{'word': ' Hello.', 'start': 0.5, 'end': 1.5}]}]}}
ENV = {'PROBE_SECRET': 'offline', 'CLOUDFLARE_ACCOUNT_ID': 'acct-1', 'CLOUDFLARE_API_TOKEN': 'tok-1',
       'CLOUDFLARE_ACCOUNT_ID_2': 'acct-2', 'CLOUDFLARE_API_TOKEN_2': 'tok-2'}


def quota_error():
    return urllib.error.HTTPError('https://api.cloudflare.com/client/v4/accounts/acct-1/ai/run/model',
                                  429, 'Too Many Requests', None, None)


class QuotaFailover(unittest.TestCase):
    def handler(self, stream=False):
        h = api.handler.__new__(api.handler)
        request = json.dumps({'url': 'https://www.instagram.com/reel/PublicExample/'}).encode()
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

    def run_chain(self, h, asr_side_effect, env=ENV):
        accounts, downloads, asrs = [], [0], [0]
        def download(*args, **kwargs):
            downloads[0] += 1
            return SimpleNamespace(returncode=0, stdout=json.dumps(EXTRACTED))
        def speech(*args, **kwargs):
            asrs[0] += 1
            accounts.append(api.os.environ.get('CLOUDFLARE_ACCOUNT_ID'))
            if isinstance(asr_side_effect, list):
                step = asr_side_effect.pop(0)
                if isinstance(step, Exception): raise step
                return step
            raise asr_side_effect()
        with patch.dict(api.os.environ, env), \
             patch.object(chain_entry.subprocess, 'run', side_effect=download), \
             patch.object(chain_entry, '_request', side_effect=speech):
            h.do_POST()
        return accounts, downloads[0], asrs[0]

    def test_quota_failover_replays_request_on_second_account(self):
        h = self.handler()
        accounts, downloads, asrs = self.run_chain(h, [quota_error(), PROVIDER])
        self.assertEqual(accounts, ['acct-1', 'acct-2'])
        self.assertEqual((downloads, asrs), (2, 2))
        self.assertEqual(h.code, 200)
        body = json.loads(h.wfile.getvalue())
        self.assertEqual(body['text'], 'Hello.')
        self.assertEqual(body['status'], 'transcribed')
        self.assertIn(('Content-Type', 'application/json; charset=utf-8'), h.sent_headers)

    def test_both_accounts_exhausted_reports_quota_exhausted(self):
        h = self.handler()
        accounts, downloads, asrs = self.run_chain(h, quota_error)
        self.assertEqual((downloads, asrs), (2, 2))
        self.assertEqual(accounts, ['acct-1', 'acct-2'])
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'quota_exhausted', 'limit_seconds': 180})

    def test_non_quota_failure_does_not_rotate(self):
        h = self.handler()
        accounts, downloads, asrs = self.run_chain(h, [ValueError('upstream exploded')])
        self.assertEqual((downloads, asrs), (1, 1))
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'fetch_failed', 'limit_seconds': 180})

    def test_single_account_quota_is_named_honestly_without_rotation(self):
        h = self.handler()
        env = {k: v for k, v in ENV.items() if not k.endswith('_2')}
        accounts, downloads, asrs = self.run_chain(h, quota_error, env)
        self.assertEqual((downloads, asrs), (1, 1))
        self.assertEqual(h.code, 502)
        self.assertEqual(json.loads(h.wfile.getvalue()), {'error': 'quota_exhausted', 'limit_seconds': 180})

    def test_stream_failover_keeps_progress_monotonic(self):
        h = self.handler(stream=True)
        accounts, downloads, asrs = self.run_chain(h, [quota_error(), PROVIDER])
        self.assertEqual(accounts, ['acct-1', 'acct-2'])
        frames = self.frames(h)
        self.assertEqual([f['completed'] for f in frames if f['type'] == 'progress'], [0, 1])
        self.assertEqual(frames[-1]['type'], 'result')
        self.assertEqual(frames[-1]['status_code'], 200)
        self.assertEqual(h.wfile.flush_count, len(frames))
        self.assertEqual(sum(1 for pair in h.sent_headers if pair[0] == 'Content-Type'), 1)

    def test_stream_both_exhausted_reports_error_frame(self):
        h = self.handler(stream=True)
        self.run_chain(h, quota_error)
        frames = self.frames(h)
        self.assertEqual([f['completed'] for f in frames if f['type'] == 'progress'], [0, 1])
        self.assertEqual(frames[-1]['type'], 'error')
        self.assertEqual(frames[-1]['status_code'], 502)
        self.assertEqual(frames[-1]['data']['error'], 'quota_exhausted')


if __name__ == '__main__': unittest.main()
