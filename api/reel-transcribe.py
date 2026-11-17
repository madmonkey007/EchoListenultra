"""Browser-facing transport for the frozen, tested Reel transcription chain."""
import io
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
    # Accounts rotate on Cloudflare quota exhaustion (HTTP 429 from the ASR
    # call): every account carries its own daily free neuron allocation, so a
    # second pair (CLOUDFLARE_ACCOUNT_ID_2 / CLOUDFLARE_API_TOKEN_2, set only
    # in the platform environment) doubles daily capacity. The frozen chain
    # reads the primary variable names at call time, so rotation writes the
    # selected pair into those names right before each attempt. Without the
    # second pair this behaves exactly like the single-account transport.

    def _credential_pairs(self):
        pairs=[(os.environ.get('CLOUDFLARE_ACCOUNT_ID'),os.environ.get('CLOUDFLARE_API_TOKEN'))]
        secondary=(os.environ.get('CLOUDFLARE_ACCOUNT_ID_2'),os.environ.get('CLOUDFLARE_API_TOKEN_2'))
        if secondary[0] and secondary[1]:pairs.append(secondary)
        return pairs

    @staticmethod
    def _quota_failure(status,value):
        # The frozen chain reports upstream failures as `TypeName: detail`
        # (chain_entry.reply on its generic except path, status 502). A Cloudflare
        # quota rejection surfaces as `HTTPError: "HTTP Error 429: ..."`; extraction
        # failures start with `ValueError:`, so they never match.
        if status!=502:return False
        detail=str(value.get('error',''))
        return detail.startswith('HTTPError') and '429' in detail

    def do_POST(self):
        self._stream_started=False
        self._suppress_progress=False
        self._quota_retry=False
        self._attempt=0
        self._pair_count=1
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
        replay=None
        length=int(self.headers.get('Content-Length',0))
        if 0<length<=4096:replay=self.rfile.read(length)
        pairs=self._credential_pairs()
        self._pair_count=len(pairs)
        for self._attempt,(account_id,api_token) in enumerate(pairs):
            # Two adjacent writes into the names the frozen chain reads. A
            # concurrent request rotating accounts can in theory observe a
            # mixed pair for microseconds; the consequence is one failed
            # upstream call, never data loss.
            if account_id and api_token:
                os.environ['CLOUDFLARE_ACCOUNT_ID']=account_id
                os.environ['CLOUDFLARE_API_TOKEN']=api_token
            # Retry attempts stay silent on progress: the client saw stages
            # 0/1 already and its validation requires forward-only progress.
            self._suppress_progress=self._attempt>0
            if replay is not None:self.rfile=io.BytesIO(replay)
            try:
                super().do_POST()
            except ProgressDisconnected:
                return
            if not self._quota_retry:return
            self._quota_retry=False

    def write_stream_frame(self,value):
        raw=(json.dumps(value,ensure_ascii=False)+'\n').encode('utf-8')
        try:
            self.wfile.write(raw);self.wfile.flush()
        except OSError as error:
            raise ProgressDisconnected('Progress consumer disconnected') from error

    def report_progress(self,stage,completed):
        if getattr(self,'_suppress_progress',False):return
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
        if self._quota_failure(status,value) and getattr(self,'_attempt',0)+1<getattr(self,'_pair_count',1):
            self._quota_retry=True
            return
        if status==200:
            response={key:value[key] for key in ['status','text','srt','cues']}
            if 'audio' in value:response['audio']=value['audio']
            if 'words' in value:response['words']=value['words']
            return self.send_client_json(status,response)
        detail=value.get('error','')
        code=('quota_exhausted' if self._quota_failure(status,value) else
              'payload_too_large' if 'payload_too_large' in detail else
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
