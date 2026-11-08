"""Offline checks for returning the original downloaded audio with results."""
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
spec = importlib.util.spec_from_file_location('audio_result_api', ROOT / 'api/reel-transcribe.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
import chain_entry


class ResultAudio(unittest.TestCase):
    def handler(self):
        h = api.handler.__new__(api.handler)
        h.wfile = io.BytesIO()
        h.send_response = lambda code: setattr(h, 'code', code)
        h.send_header = lambda *args: None
        h.end_headers = lambda: None
        return h

    def test_public_success_only_adds_optional_audio(self):
        h = self.handler()
        audio = {'base64': 'b3JpZ2luYWw=', 'mime_type': 'audio/mp4'}
        public = {'status': 'transcribed', 'text': 'Hello.', 'srt': 'unchanged', 'cues': []}
        h.reply(200, {**public, 'audio': audio, 'raw_cloudflare': {'private': 'provider'},
                      'metrics': {'url': 'submitted-url'}, 'words': [{'text':'Hello.','start':0.5,'end':1.5}]})
        self.assertEqual(json.loads(h.wfile.getvalue()),
                         {**public, 'audio': audio, 'words':[{'text':'Hello.','start':0.5,'end':1.5}], 'limit_seconds': 180})

    def test_legacy_success_without_audio_still_works(self):
        h = self.handler()
        value = {'status': 'transcribed', 'text': 'Hello.', 'srt': '', 'cues': []}
        h.reply(200, value)
        self.assertEqual(json.loads(h.wfile.getvalue()), {**value, 'limit_seconds': 180})

    def test_real_chain_returns_exact_original_bytes_and_safe_mime(self):
        original = b'original full audio bytes\x00\xff'
        encoded = base64.b64encode(original).decode('ascii')
        request = json.dumps({'url': 'https://www.instagram.com/reel/PublicExample/'}).encode()
        provider = {'success': True, 'result': {
            'transcription_info': {'duration': 10},
            'segments': [{'words': [{'word': ' Hello.', 'start': 0.5, 'end': 1.5}]}]}}
        formats = {'m4a': 'audio/mp4', 'mp4': 'audio/mp4', 'webm': 'audio/webm',
                   'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
                   'flac': 'audio/flac', 'untrusted/type': 'application/octet-stream'}
        for ext, mime in formats.items():
            with self.subTest(ext=ext):
                h = self.handler()
                h.headers = Message()
                h.headers['Content-Length'] = str(len(request))
                h.headers['Host'] = 'localhost'
                h.rfile = io.BytesIO(request)
                extracted = {'status': 'audio_downloaded', 'audio_base64': encoded,
                             'audio_sha256': hashlib.sha256(original).hexdigest(), 'ext': ext}
                process = SimpleNamespace(returncode=0, stdout=json.dumps(extracted))
                with patch.dict(api.os.environ, {'PROBE_SECRET': 'offline-test',
                        'CLOUDFLARE_ACCOUNT_ID': 'offline', 'CLOUDFLARE_API_TOKEN': 'offline'}), \
                        patch.object(chain_entry.subprocess, 'run', return_value=process) as download, \
                        patch.object(chain_entry, '_request', return_value=provider) as asr:
                    h.do_POST()
                self.assertEqual(h.code, 200)
                body = json.loads(h.wfile.getvalue())
                self.assertEqual(body['audio'], {'base64': encoded, 'mime_type': mime})
                self.assertEqual(base64.b64decode(body['audio']['base64']), original)
                self.assertEqual(asr.call_args.args[1]['audio'], encoded)
                self.assertEqual(download.call_count, 1)
                self.assertEqual(asr.call_count, 1)
                self.assertEqual(body['cues'], [{'start': 0.5, 'end': 1.5, 'text': 'Hello.',
                                                'language': 'en', 'word_start': 0, 'word_end': 1}])
                self.assertEqual(body['srt'], '1\n00:00:00,500 --> 00:00:01,500\nHello.\n\n')
                self.assertNotIn('raw_cloudflare', body)
                self.assertNotIn('metrics', body)
                self.assertEqual(body['words'],[{'text':'Hello.','start':0.5,'end':1.5}])


if __name__ == '__main__':
    unittest.main()
