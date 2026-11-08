"""Cloudflare Turbo adapter. No VTT/segment-time fallback or timestamp synthesis."""
import base64
import json
import math
import re
import urllib.request
from pathlib import Path

MODEL = '@cf/openai/whisper-large-v3-turbo'
MAX_AUDIO_SECONDS = json.loads((Path(__file__).resolve().parents[2]/'lib/transcription-config.json').read_text())['max_audio_seconds']
# Conservative complete JSON envelope budget, including base64 expansion.
MAX_REQUEST_BYTES = 2_500_000


def make_payload(audio):
    if not isinstance(audio, bytes) or not audio:
        raise ValueError('Expected nonempty complete audio bytes')
    json_overhead=len(json.dumps({'audio':'','vad_filter':True}).encode('utf-8'))
    if 4*((len(audio)+2)//3)+json_overhead>MAX_REQUEST_BYTES:
        raise ValueError('payload_too_large: 音频文件较大，可能超时长。')
    return {'audio':base64.b64encode(audio).decode('ascii'),
            'vad_filter':True}


def flatten_words(response):
    if not isinstance(response,dict) or response.get('success') is not True:
        raise ValueError('Cloudflare transcription failed')
    result=response.get('result')
    if not isinstance(result,dict) or not isinstance(result.get('segments'),list):
        raise ValueError('Missing result.segments word timestamps')
    words=[]
    for segment in result['segments']:
        if not isinstance(segment,dict) or not isinstance(segment.get('words'),list):
            raise ValueError('Missing result.segments[].words')
        if not segment['words'] and str(segment.get('text','')).strip():
            raise ValueError('Nonempty segment has no words')
        for word in segment['words']:
            if not isinstance(word,dict) or not isinstance(word.get('word'),str):
                raise ValueError('Invalid word text')
            text=word['word'].lstrip()
            start,end=word.get('start'),word.get('end')
            if (not text or any(isinstance(t,bool) or not isinstance(t,(int,float))
                                or not math.isfinite(t) for t in (start,end))
                    or start<0 or end<start
                    or (words and start<words[-1]['start'])):
                raise ValueError('Invalid word-level timestamps or text')
            words.append({'text':text,'start':start,'end':end})
    return words



def validate_response_duration(response):
    """Use only original audio duration, never VAD duration or word endpoints."""
    result=response.get('result') if isinstance(response,dict) else None
    info=result.get('transcription_info') if isinstance(result,dict) else None
    duration=info.get('duration') if isinstance(info,dict) else None
    if (isinstance(duration,bool) or not isinstance(duration,(int,float))
            or not math.isfinite(duration) or duration<=0):
        raise ValueError('invalid_duration: provider original duration is missing or invalid')
    if duration>MAX_AUDIO_SECONDS:
        raise ValueError(f'too_long: provider original duration exceeds {MAX_AUDIO_SECONDS} seconds')
    return duration


def _request(url,payload,token,timeout):
    request=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={
        'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=timeout) as response:
        return json.load(response)


def transcribe(audio,account_id,token,cue_builder,*,audio_seconds,transport=_request,timeout=120):
    """Inject existing assemble() as cue_builder; secrets are never persisted.

    Public words use text; the existing cue builder's word field retains the
    provider's exact spacing, preventing punctuation/number fragments changing.
    """
    if (isinstance(audio_seconds,bool) or not isinstance(audio_seconds,(int,float))
            or not math.isfinite(audio_seconds) or not 0<audio_seconds<=MAX_AUDIO_SECONDS):
        raise ValueError(f'Audio duration must be verified and within {MAX_AUDIO_SECONDS} seconds')
    if not isinstance(account_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]+',account_id):
        raise ValueError('Invalid Cloudflare account ID')
    if not isinstance(token,str) or not token.strip():
        raise ValueError('Missing Cloudflare token')
    url=f'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{MODEL}'
    response=transport(url,make_payload(audio),token,timeout)
    words=flatten_words(response)
    validate_response_duration(response)
    # Only word-level times enter the unchanged shared cue engine.
    engine_segments=[{'words':[{'word':w['word'],'start':w['start'],'end':w['end']}
                               for w in segment['words']]}
                     for segment in response['result']['segments']]
    cues=cue_builder(engine_segments)
    return {'model':MODEL,'status':'transcribed' if words else 'no_speech_detected',
            'words':words,'cues':cues}
