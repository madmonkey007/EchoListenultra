"""Temporary real URL -> fresh M4A -> Turbo words -> unchanged cue engine."""
from http.server import BaseHTTPRequestHandler
import base64
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parent))
from turbo import _request,make_payload,flatten_words,validate_response_duration,MODEL,MAX_AUDIO_SECONDS
from cue_postprocess import assemble,render_srt

class ProgressDisconnected(ConnectionError):
    """The progress consumer disconnected; stop without a second response."""


class handler(BaseHTTPRequestHandler):
    def report_progress(self,stage,completed):
        """Standalone and legacy JSON callers do not stream progress."""
        pass
    def log_message(self,*args):pass
    def reply(self,status,value):
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(json.dumps(value,ensure_ascii=False).encode())
    def do_POST(self):
        started=time.perf_counter();state={'runtime':{'vercel':os.environ.get('VERCEL'),'region':os.environ.get('VERCEL_REGION'),'python':sys.version.split()[0]},'model':MODEL,'options':{'vad_filter':True},'max_audio_seconds':MAX_AUDIO_SECONDS};raw={}
        if not hmac.compare_digest(self.headers.get('X-Probe-Secret',''),os.environ.get('PROBE_SECRET','disabled')):return self.reply(401,{'error':'unauthorized'})
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=4096:raise ValueError('Invalid body length')
            url=json.loads(self.rfile.read(length)).get('url')
            if not isinstance(url,str) or not re.fullmatch(r'https://www\.instagram\.com/reel/[A-Za-z0-9_-]+/',url):raise ValueError('Invalid Reel URL')
            state['url']=url
            self.report_progress('fetching_audio',0)
            t=time.perf_counter()
            process=subprocess.run([sys.executable,str(Path(__file__).resolve().parent/'reel_probe.py'),url],capture_output=True,text=True,timeout=90)
            state['download_seconds']=time.perf_counter()-t
            if process.returncode:raise ValueError('Extractor process failed: '+process.stderr[:400])
            extracted=json.loads(process.stdout);encoded=extracted.pop('audio_base64',None);state['extraction']=extracted
            if extracted.get('status')!='audio_downloaded' or not encoded:raise ValueError(extracted.get('error','Audio not downloaded'))
            audio=base64.b64decode(encoded,validate=True)
            assert hashlib.sha256(audio).hexdigest()==extracted['audio_sha256']
            payload=make_payload(audio)
            self.report_progress('transcribing',1)
            t=time.perf_counter();raw=_request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/ai/run/'+MODEL,payload,os.environ['CLOUDFLARE_API_TOKEN'],120);state['cloudflare_seconds']=time.perf_counter()-t
            words=flatten_words(raw);info=raw['result'].get('transcription_info',{});state['transcription_info']=info;duration=validate_response_duration(raw)
            self.report_progress('formatting',2)
            t=time.perf_counter();segments=[{'words':[{'word':w['word'],'start':w['start'],'end':w['end']} for w in s['words']]} for s in raw['result']['segments']];cues=assemble(segments);srt=render_srt(cues);state['cue_seconds']=time.perf_counter()-t
            assert ''.join(w['word'] for s in raw['result']['segments'] for w in s['words']).split()==' '.join(c['text'] for c in cues).split()
            state['function_seconds']=time.perf_counter()-started
            state['source_hashes']={name:hashlib.sha256(Path(sys.modules[name[:-3]].__file__).read_bytes()).hexdigest() for name in ['turbo.py','cue_postprocess.py']}
            mime_type={'m4a':'audio/mp4','mp4':'audio/mp4','webm':'audio/webm','mp3':'audio/mpeg','wav':'audio/wav','ogg':'audio/ogg','opus':'audio/ogg','flac':'audio/flac','aac':'audio/aac'}.get(str(extracted.get('ext','')).lower(),'application/octet-stream')
            self.reply(200,{'status':'transcribed' if words else 'no_speech_detected','words':words,'cues':cues,'text':'\n\n'.join(c['text'] for c in cues),'srt':srt,'audio':{'base64':encoded,'mime_type':mime_type},'metrics':state,'raw_cloudflare':raw})
        except ProgressDisconnected:
            return
        except Exception as error:
            # Diagnostic only: never let logging change the existing error response.
            try:
                if not str(error).startswith(('payload_too_large:', 'too_long:')):
                    def scrub(value):
                        value = str(value)
                        value = re.sub(r'https?://[^\s<>"\']+', '[redacted_url]', value)
                        submitted = locals_url if isinstance(locals_url, str) else ''
                        if submitted:
                            value = value.replace(submitted, '[redacted_url]')
                            value = value.replace(submitted.rstrip('/').rsplit('/', 1)[-1], '[redacted_id]')
                        for key in ('CLOUDFLARE_API_TOKEN', 'PROBE_SECRET'):
                            secret = os.environ.get(key)
                            if secret: value = value.replace(secret, '[redacted_secret]')
                        return value
                    locals_url = locals().get('url')
                    message = scrub(error)
                    status = getattr(error, 'code', None)
                    if not isinstance(status, int):
                        match = re.search(r'HTTP(?: Error)?[ :]+(\d{3})\b', message)
                        status = match.group(1) if match else 'no_status'
                    body = '[unavailable: response body not retained by extractor]'
                    if callable(getattr(error, 'read', None)):
                        response_body = error.read(32768).decode('utf-8', errors='replace')
                        try:
                            decoded = json.loads(response_body)
                            # Provider results, text, segments, audio and other user fields are excluded.
                            safe = {key: decoded[key] for key in ('errors', 'error', 'message', 'code') if key in decoded}
                            def error_fields(value):
                                if isinstance(value, dict):
                                    return {k: error_fields(v) for k, v in value.items() if k in ('code', 'message', 'type', 'error', 'errors')}
                                if isinstance(value, list): return [error_fields(v) for v in value]
                                return scrub(value)
                            body = json.dumps(error_fields(safe), ensure_ascii=False) if safe else '[omitted: no error fields]'
                        except (ValueError, TypeError):
                            body = '[omitted: non-JSON response may contain user content]'
                    print('upstream_status: ' + str(status), file=sys.stderr, flush=True)
                    print('upstream_body: ' + json.dumps(body[:500], ensure_ascii=False), file=sys.stderr, flush=True)
                    print('upstream_exception: ' + type(error).__name__ + ': ' + json.dumps(message, ensure_ascii=False), file=sys.stderr, flush=True)
            except Exception:
                pass
            state['function_seconds']=time.perf_counter()-started;code=413 if str(error).startswith('payload_too_large:') else 422 if str(error).startswith('too_long:') else 502;self.reply(code,{'status':'failed','error':type(error).__name__+': '+str(error)[:700],'metrics':state,'raw_cloudflare':raw})
