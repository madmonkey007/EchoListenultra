"""Browser-facing transport for the frozen, tested Reel transcription chain."""
import json
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server/transcription'))
# The cue engine remains the same source file used by the acceptance experiment.
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/transcribe-probe'))
from chain_entry import handler as FrozenChain, ProgressDisconnected
from turbo import MAX_AUDIO_SECONDS
import math
import re

class handler(FrozenChain):
    def do_POST(self):
        self._stream_started=False
        self._stream_requested=any(part.split(';',1)[0].strip()=='application/x-ndjson' for part in self.headers.get('Accept','').split(','))
        origin=self.headers.get('Origin')
        host=self.headers.get('Host','')
        if self.headers.get('Sec-Fetch-Site')=='cross-site' or (origin and origin not in {'https://'+host,'http://'+host}):
            return self.send_client_json(403,{'error':'origin_not_allowed'})
        if not os.environ.get('PROBE_SECRET'):
            return self.send_client_json(503,{'error':'not_configured'})
        # Keep the tested chain's internal gate; its secret never enters JS.
        if 'X-Probe-Secret' in self.headers:self.headers.replace_header('X-Probe-Secret',os.environ['PROBE_SECRET'])
        else:self.headers['X-Probe-Secret']=os.environ['PROBE_SECRET']
        try:
            super().do_POST()
        except ProgressDisconnected:
            return

    def write_stream_frame(self,value):
        raw=(json.dumps(value,ensure_ascii=False)+'\n').encode('utf-8')
        try:
            self.wfile.write(raw);self.wfile.flush()
        except OSError as error:
            raise ProgressDisconnected('Progress consumer disconnected') from error

    def report_progress(self,stage,completed):
        if not getattr(self,'_stream_requested',False):return
        if not self._stream_started:
            try:
                self.send_response(200)
                self.send_header('Content-Type','application/x-ndjson')
                self.send_header('Cache-Control','no-store')
                self.end_headers()
            except OSError as error:
                raise ProgressDisconnected('Progress consumer disconnected') from error
            self._stream_started=True
        self.write_stream_frame({'type':'progress','stage':stage,'completed':completed,'total':3,'limit_seconds':MAX_AUDIO_SECONDS})

    def send_client_json(self,status,value):
        value={**value,'limit_seconds':MAX_AUDIO_SECONDS}
        if getattr(self,'_stream_started',False):
            return self.write_stream_frame({'type':'result' if status==200 else 'error','status_code':status,'data':value})
        raw=json.dumps(value,ensure_ascii=False).encode('utf-8')
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)))
        self.end_headers();self.wfile.write(raw);self.wfile.flush()

    def reply(self,status,value):
        if status==200:
            response={key:value[key] for key in ['status','text','srt','cues']}
            if 'audio' in value:response['audio']=value['audio']
            if 'words' in value:response['words']=value['words']
            return self.send_client_json(status,response)
        detail=value.get('error','')
        code=('payload_too_large' if 'payload_too_large' in detail else
              'too_long' if 'too_long' in detail or 'over_limit_seconds' in detail else
              'timeout' if 'Timeout' in detail or 'timed out' in detail else
              'invalid_url' if 'Invalid Reel URL' in detail else
              'private_or_unavailable' if re.search(r'content is not available|private (?:video|account|post|reel)|not found|login required|no audio',detail,re.I) else 'fetch_failed')
        response={'error':code}
        if code=='too_long':
            metrics=value.get('metrics',{})
            extraction=metrics.get('extraction',{})
            for duration in (metrics.get('transcription_info',{}).get('duration'), extraction.get('container_duration_seconds'), extraction.get('duration')):
                if isinstance(duration,(int,float)) and not isinstance(duration,bool) and math.isfinite(duration) and duration>0:
                    response['duration_seconds']=round(duration,1);break
        self.send_client_json(status,response)
